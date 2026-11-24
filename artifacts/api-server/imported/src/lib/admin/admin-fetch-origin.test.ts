import test from 'node:test';
import assert from 'node:assert/strict';
import { adminFetch } from './admin-fetch.ts';

// AUTH-01 regression: after the server stopped echoing session tokens in
// login bodies, adminFetch must never send a script-readable session token.
// Auth travels in the HttpOnly cookie; only the double-submit CSRF header
// may be injected on same-origin admin paths.
test('admin CSRF header is sent only to the same-origin admin API; session token header is never sent', async () => {
  const originalWindow = globalThis.window;
  const originalFetch = globalThis.fetch;
  const observed: Headers[] = [];
  try {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        location: { href: 'https://example.test/admin', origin: 'https://example.test' },
        sessionStorage: {
          // A stale session token may still sit in sessionStorage from a
          // pre-fix login; it must NOT leak into any request header.
          getItem: (key: string) => key === 'bg_admin_session_token' ? 'stale-session' : 'test-csrf',
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
    assert.equal(observed[0]?.get('x-admin-session-token'), null);
    assert.equal(observed[0]?.get('x-csrf-token'), 'test-csrf');
    assert.equal(observed[1]?.get('x-admin-session-token'), null);
    assert.equal(observed[1]?.get('x-csrf-token'), null);
    assert.equal(observed[2]?.get('x-admin-session-token'), null);
    assert.equal(observed[2]?.get('x-csrf-token'), null);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalWindow === undefined) Reflect.deleteProperty(globalThis, 'window');
    else Object.defineProperty(globalThis, 'window', { configurable: true, value: originalWindow });
  }
});
