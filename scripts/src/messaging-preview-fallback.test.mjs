import test from 'node:test';
import assert from 'node:assert/strict';

// MSG-01 regression: preview_order_message must fail for an unknown orderNo
// instead of silently falling back to erpState.orders[0] — which rendered a
// message for a DIFFERENT customer and, worse, wrote it into the dispatch log.
// MSG-02 regression: template fallback — an invalid eventKey must be rejected
// instead of rendering messageTemplates[0].

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function getAdminContext() {
  const res = await fetch(`${BASE}/api/admin/workspace`, {
    headers: { Origin: BASE },
  });
  assert.equal(res.status, 200, `Expected 200 from GET /api/admin/workspace, got ${res.status}`);
  const data = await res.json();
  assert.equal(data.authorized, true, 'Admin workspace must be authorized in preview');
  const setCookie = res.headers.get('set-cookie') || '';
  const cookiePair = setCookie.split(';')[0] || '';
  return {
    csrfToken: data.csrfToken || '',
    cookie: cookiePair,
    orders: data.orders ?? [],
  };
}

function buildHeaders(ctx) {
  const headers = { Origin: BASE, 'Content-Type': 'application/json' };
  if (ctx.csrfToken) headers['x-csrf-token'] = ctx.csrfToken;
  if (ctx.cookie) headers['Cookie'] = ctx.cookie;
  return headers;
}

test('MSG-01: preview_order_message rejects an unknown orderNo instead of falling back to orders[0]', async () => {
  const ctx = await getAdminContext();
  assert.ok(ctx.orders.length >= 1, 'Preview must seed at least one order');

  const res = await fetch(`${BASE}/api/admin/workspace`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({
      operation: 'preview_order_message',
      orderNo: 'ORD-DOES-NOT-EXIST-9999',
      eventKey: 'ORDER_CONFIRMED',
    }),
  });
  assert.equal(res.status, 400, `Expected 400 for unknown orderNo, got ${res.status}`);
  const data = await res.json();
  assert.ok(!data.success, 'preview_order_message must not succeed for an unknown orderNo');
  assert.equal(data.renderedText, undefined, 'No message text may be rendered for an unknown orderNo');
  assert.equal(data.waMeUrl, undefined, 'No WhatsApp link may be generated for an unknown orderNo');
});

test('MSG-01 (guard parity): preview_order_message still renders for a real orderNo', async () => {
  const ctx = await getAdminContext();
  assert.ok(ctx.orders.length >= 1, 'Preview must seed at least one order');
  const orderNo = ctx.orders[0].orderNo;
  assert.ok(orderNo, 'Seeded order must have an orderNo');

  const res = await fetch(`${BASE}/api/admin/workspace`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({
      operation: 'preview_order_message',
      orderNo,
      eventKey: 'ORDER_CONFIRMED',
    }),
  });
  assert.equal(res.status, 200, `Expected 200 for a real orderNo, got ${res.status}`);
  const data = await res.json();
  assert.equal(data.success, true, `Legit preview must succeed: ${data.errorBn}`);
  assert.ok(data.renderedText, 'Legit preview must return rendered message text');
});

test('MSG-02: preview_order_message rejects an invalid eventKey instead of falling back to templates[0]', async () => {
  const ctx = await getAdminContext();
  assert.ok(ctx.orders.length >= 1, 'Preview must seed at least one order');
  const orderNo = ctx.orders[0].orderNo;

  const res = await fetch(`${BASE}/api/admin/workspace`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({
      operation: 'preview_order_message',
      orderNo,
      eventKey: 'NOT_A_REAL_EVENT_KEY',
    }),
  });
  // Accept either 400 rejection or success=false; what must NOT happen is a
  // successfully rendered message from an unrelated template.
  const data = await res.json();
  assert.ok(
    res.status === 400 || data.success === false,
    `Invalid eventKey must be rejected, got status=${res.status} success=${data.success}`
  );
});
