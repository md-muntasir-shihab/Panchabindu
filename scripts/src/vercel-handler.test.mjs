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

async function serve(listener) {
  const server = http.createServer(listener);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return {
    port: server.address().port,
    async stop() {
      server.closeAllConnections?.();
      const closed = once(server, 'close');
      server.close();
      await closed.catch(() => undefined);
    },
  };
}

// Write flows (checkout, login, registration) all depend on the POST body reaching the handler.
// A platform that pre-consumes the stream must not leave the request pending forever.
test('POST bodies are buffered and a drained platform stream fails fast', async () => {
  const direct = await serve(handler);
  const drained = await serve((req, res) => {
    req.on('data', () => undefined);
    req.on('end', () => handler(req, res));
  });

  const post = async (port) => {
    const response = await fetch(`http://127.0.0.1:${port}/api/orders`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', connection: 'close' },
      body: JSON.stringify({ idempotencyKey: 'k', items: [] }),
      signal: AbortSignal.timeout(5_000),
    });
    return { status: response.status, body: await response.json() };
  };

  try {
    const normal = await post(direct.port);
    // No database is configured here, so persistence fails closed after the body has been read.
    assert.ok(normal.status >= 400, `unexpected status ${normal.status}`);

    const lost = await post(drained.port);
    assert.equal(lost.status, 400);
    assert.equal(lost.body.code, 'REQUEST_BODY_UNAVAILABLE');
  } finally {
    await direct.stop();
    await drained.stop();
  }
});

test('Diagnostics reports runtime and persistence without secrets', async () => {
  const server = await serve(handler);
  try {
    const base = `http://127.0.0.1:${server.port}`;
    const response = await fetch(`${base}/api/diagnostics`, { headers: { connection: 'close' } });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.configuration.persistenceMode, 'postgres');
    assert.equal(body.database.configured, false);
    assert.ok(!JSON.stringify(body).includes('SERVICE_ROLE'));

    const probe = await fetch(`${base}/api/diagnostics`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', connection: 'close' },
      body: JSON.stringify({ hello: 'world' }),
    });
    const echo = await probe.json();
    assert.equal(echo.ok, true);
    assert.equal(echo.receivedBytes, 17);
  } finally {
    await server.stop();
  }
});
