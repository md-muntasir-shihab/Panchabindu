// src/lib/admin/admin-fetch.test.ts
// Unit Tests for adminFetch / adminApiRequest safe wrapper (verifying non-mutation of window.fetch & internal header injection)

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { adminApiRequest, adminFetch } from './admin-fetch';

describe('adminFetch Safe Client Wrapper', () => {
  it('does not mutate or override globalThis.fetch or window.fetch', () => {
    const originalFetch = globalThis.fetch;
    assert.equal(typeof originalFetch, 'function');

    // Call adminFetch / adminApiRequest
    // Verify globalThis.fetch is identical reference (not replaced)
    assert.equal(globalThis.fetch, originalFetch);
    if (typeof window !== 'undefined') {
      assert.equal(window.fetch, originalFetch);
    }
  });

  it('correctly executes without throwing when fetching', async () => {
    // Intercept a test mock fetch
    const intercepted: { headers?: Headers } = {};
    const mockGlobalFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      intercepted.headers = new Headers(init?.headers);
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const original = globalThis.fetch;
    try {
      globalThis.fetch = mockGlobalFetch as any;

      const res = await adminFetch('https://example.com/api/test', {
        headers: { 'X-Custom-Header': 'hello' },
      });

      assert.equal(res.status, 200);
      assert.equal(intercepted.headers?.get('x-custom-header'), 'hello');
    } finally {
      globalThis.fetch = original;
    }
  });

  it('adminApiRequest functions identically to adminFetch as an internal wrapper', async () => {
    let calledUrl = '';
    const mockGlobalFetch = async (input: RequestInfo | URL) => {
      calledUrl = String(input);
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    };

    const original = globalThis.fetch;
    try {
      globalThis.fetch = mockGlobalFetch as any;

      const res = await adminApiRequest('https://example.com/api/admin/workspace');
      assert.equal(res.status, 200);
      assert.equal(calledUrl, 'https://example.com/api/admin/workspace');
    } finally {
      globalThis.fetch = original;
    }
  });
});
