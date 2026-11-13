import test from 'node:test';
import assert from 'node:assert/strict';
import { adminFetch } from './admin-fetch.ts';

test('admin credentials are sent only to the same-origin admin API', async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const observed: Headers[] = [];
  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { href: 'https://example.test/admin', origin: 'https://example.test' },
        sessionStorage: {
          getItem: (key: string) => key === 'bg_admin_session_token' ? 'test-session' : 'test-csrf',
        },
      },
    });
    globalThis.fetch = async (_input, init) => {
      observed.push(new Headers(init?.headers));
      return new Response(null, { status: 204 });
    };
    await adminFetch('/api/admin/workspace');
    await adminFetch('https://attacker.test/api/admin/workspace');
    await adminFetch('/api/administer');
    assert.equal(observed[0]?.get('x-admin-session-token'), 'test-session');
    assert.equal(observed[0]?.get('x-csrf-token'), 'test-csrf');
    assert.equal(observed[1]?.get('x-admin-session-token'), null);
    assert.equal(observed[1]?.get('x-csrf-token'), null);
    assert.equal(observed[2]?.get('x-admin-session-token'), null);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});