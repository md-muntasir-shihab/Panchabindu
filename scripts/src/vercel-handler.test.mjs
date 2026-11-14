import assert from 'node:assert/strict';
import http from 'node:http';
import { once } from 'node:events';
import test from 'node:test';

// Test the built serverless entry without reading inherited database credentials.
process.env.NODE_ENV = 'production';
delete process.env.PANCHABINDU_PERSISTENCE;
delete process.env.SUPABASE_URL;
delete process.env.NEXT_PUBLIC_SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const { default: handler, config } = await import('../../api/[...route].mjs');

test('Vercel handler disables body parsing and serves API and metadata routes', async () => {
  assert.equal(config.api.bodyParser, false);
  const server = http.createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const health = await fetch(`${base}/api/healthz`);
    assert.equal(health.status, 200);
    assert.equal((await health.json()).status, 'ok');
    const robots = await fetch(`${base}/api/__metadata/robots.txt`);
    assert.equal(robots.status, 200);
    assert.match(await robots.text(), /Disallow: \/admin/);
    // A production deployment without a configured database must fail closed.
    const page = await fetch(`${base}/api/page-data?path=/`);
    assert.equal(page.status, 503);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
