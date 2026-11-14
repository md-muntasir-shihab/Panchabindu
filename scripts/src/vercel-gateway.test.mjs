import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

// A disposable local store ensures these tests never touch production data.
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'panchabindu-gateway-'));
const originalCwd = process.cwd();
process.chdir(fixture);
process.env.NODE_ENV = 'test';
process.env.PANCHABINDU_PERSISTENCE = 'json';
process.env.CREDENTIALS_ENCRYPTION_KEY = 'isolated-gateway-test-key-not-for-production';
const { default: handler, config } = await import('../../api/__gateway.mjs');

test('nested Vercel rewrite preserves body, cookies, route and query', async () => {
  assert.equal(config.api.bodyParser, false);
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const target = `${base}/api/__gateway?__pb_group=account&__pb_path=orders`;
    const registration = await fetch(target, { method: 'POST', headers: { origin: base, 'content-type': 'application/json' }, body: JSON.stringify({ action: 'register', email: 'gateway@example.com', password: 'gateway password 123' }) });
    assert.equal(registration.status, 200, await registration.clone().text());
    const cookie = registration.headers.get('set-cookie').split(';')[0];
    const account = await fetch(`${target}&extra=value`, { headers: { cookie } });
    assert.equal((await account.json()).identifier, 'gateway@example.com');
    const invalid = await fetch(`${target}&__pb_group=vendor`);
    assert.equal(invalid.status, 400);
    const missing = await fetch(`${base}/api/__gateway?__pb_group=missing&__pb_path=path`);
    assert.equal(missing.status, 404);
  } finally {
    server.close();
    await once(server, 'close');
    process.chdir(originalCwd);
    fs.rmSync(fixture, { recursive: true, force: true });
  }
});
