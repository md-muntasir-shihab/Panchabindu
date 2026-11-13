import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequest as NextRequest } from '@/src/lib/http';
import { backendRoute } from './backend-route';

test('oversized streamed requests are rejected before business handlers run', async () => {
  let calls = 0;
  const route = backendRoute(async (request: NextRequest) => { calls++; assert.ok(request); return Response.json({ success: true }); });
  const response = await route(new NextRequest('http://localhost/api/orders', { method: 'POST', body: 'x'.repeat(70 * 1024) }));
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, 'PAYLOAD_TOO_LARGE');
  assert.equal(calls, 0);
});

test('bounded requests retain their cookies and get language-aware safe responses', async () => {
  const route = backendRoute(async (request: NextRequest) => {
    assert.equal(request.cookies.get('synthetic')?.value, 'test');
    assert.deepEqual(await request.json(), { action: 'check' });
    return Response.json({ success: false, errorBn: 'অর্ডারটি খুঁজে পাওয়া যায়নি।' }, { status: 404 });
  });
  const response = await route(new NextRequest('http://localhost/api/orders', { method: 'POST',
    headers: { cookie: 'synthetic=test', 'accept-language': 'en-BD' }, body: JSON.stringify({ action: 'check' }),
  }));
  assert.equal(response.status, 404);
  const body = await response.json();
  assert.equal(body.errorEn, 'Order not found.');
  assert.equal(body.code, 'NOT_FOUND');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});
