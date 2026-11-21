import assert from 'node:assert/strict';
import test from 'node:test';

const BASE_URL = (process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function fetchWorkspaceBootstrap() {
  const res = await fetch(`${BASE_URL}/api/admin/workspace`, {
    headers: { Origin: BASE_URL },
  });
  assert.equal(res.status, 200, `Expected 200 from GET /api/admin/workspace, got ${res.status}`);
  const setCookie = res.headers.get('set-cookie') || '';
  const cookieHeader = setCookie
    .split(',')
    .map((part) => part.split(';')[0].trim())
    .filter(Boolean)
    .join('; ');
  const body = await res.json();
  assert.equal(body.authorized, true);
  assert.ok(body.csrfToken, 'Workspace GET must return a CSRF token');
  const orders = body.orders || [];
  assert.ok(orders.length > 0, 'Workspace must have at least one seeded order');
  return { csrfToken: body.csrfToken, cookieHeader, orders, body, headers: res.headers };
}

async function postWorkspace(csrfToken, cookieHeader, payload, extraHeaders = {}) {
  const res = await fetch(`${BASE_URL}/api/admin/workspace`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      'x-csrf-token': csrfToken,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(payload),
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body, headers: res.headers };
}

test('GET /api/admin/workspace returns hardened security headers and valid orders snapshot', async () => {
  const { headers, orders } = await fetchWorkspaceBootstrap();
  assert.equal(headers.get('x-powered-by'), null);
  assert.equal(headers.get('x-content-type-options'), 'nosniff');
  assert.ok(orders.every((o) => typeof o.orderNo === 'string' && o.orderNo.startsWith('ORD-')));
});

test('POST /api/admin/workspace does not emit wildcard or reflected CORS headers for untrusted origins', async () => {
  const { csrfToken, cookieHeader } = await fetchWorkspaceBootstrap();
  const res = await postWorkspace(
    csrfToken,
    cookieHeader,
    { operation: 'generate_print_slips', orderNos: [] },
    { Origin: 'https://evil-attacker.example' },
  );
  const allowOrigin = res.headers.get('access-control-allow-origin');
  assert.notEqual(allowOrigin, '*', 'CORS must never emit wildcard on admin workspace');
  assert.notEqual(
    allowOrigin,
    'https://evil-attacker.example',
    'CORS must never reflect untrusted origins on admin workspace',
  );
  assert.ok(res.status === 403 || res.status === 400, `Expected 403/400 for empty orderNos, got ${res.status}`);
});

test('Tracking URL hardening: update_order_courier_meta and attach_tracking reject javascript:, data:, control chars, and embedded credentials', async () => {
  const { csrfToken, cookieHeader, orders } = await fetchWorkspaceBootstrap();
  const target = orders[0];
  const maliciousUrls = [
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'https://user:pass@evil.example/track/123',
    'https://steadfast.com.bd/t/SF-1\r\nX-Injected: 1',
  ];

  for (const badUrl of maliciousUrls) {
    const metaRes = await postWorkspace(csrfToken, cookieHeader, {
      operation: 'update_order_courier_meta',
      orderNo: target.orderNo,
      customTrackingUrl: badUrl,
    });
    assert.ok(
      metaRes.status >= 400 || metaRes.body?.success === false,
      `update_order_courier_meta MUST reject unsafe URL "${badUrl}", got ${metaRes.status}`,
    );

    const gridRes = await postWorkspace(csrfToken, cookieHeader, {
      operation: 'order_grid_action',
      action: 'attach_tracking',
      orderNos: [target.orderNo],
      courierProvider: 'steadfast',
      trackingCode: 'SF-982341',
      customTrackingUrl: badUrl,
    });
    const firstResult = gridRes.body?.results?.[0];
    assert.ok(
      gridRes.status >= 400 || gridRes.body?.success === false || firstResult?.ok === false,
      `attach_tracking MUST reject unsafe URL "${badUrl}", got status=${gridRes.status} ok=${firstResult?.ok}`,
    );
  }
});

test('Courier policy: update_order_courier_meta blocks unsupported redx provider', async () => {
  const { csrfToken, cookieHeader, orders } = await fetchWorkspaceBootstrap();
  const res = await postWorkspace(csrfToken, cookieHeader, {
    operation: 'update_order_courier_meta',
    orderNo: orders[0].orderNo,
    courierProvider: 'redx',
  });
  assert.ok(res.status === 400 || res.status === 403, `Expected 400/403 for redx, got ${res.status}`);
  assert.equal(res.body?.success, false);
});

test('Order state-machine: order_grid_action rejects illegal status skip (pending_confirmation -> delivered)', async () => {
  const { csrfToken, cookieHeader, orders } = await fetchWorkspaceBootstrap();
  const pendingOrder = orders.find((o) => o.status === 'pending_confirmation') || orders[0];
  const res = await postWorkspace(csrfToken, cookieHeader, {
    operation: 'order_grid_action',
    action: 'update_status',
    orderNos: [pendingOrder.orderNo],
    targetStatus: 'delivered',
  });
  const firstResult = res.body?.results?.[0];
  assert.ok(
    res.status >= 400 || res.body?.success === false || firstResult?.ok === false,
    'Illegal status skip to delivered must be blocked',
  );
});

test('2-Step bKash Advance Hub: input_manual_mfs rejects non-bKash provider, negative/zero amounts, and over-due amounts', async () => {
  const { csrfToken, cookieHeader, orders } = await fetchWorkspaceBootstrap();
  const target = orders[0];
  const badCases = [
    { provider: 'nagad', submittedAmountPoisha: 10000, trxId: 'NGD123456' },
    { provider: 'bkash', submittedAmountPoisha: 0, trxId: 'BKS000000' },
    { provider: 'bkash', submittedAmountPoisha: -5000, trxId: 'BKSNEG001' },
    {
      provider: 'bkash',
      submittedAmountPoisha: (target.totalPayablePoisha || 100000) + 500000,
      trxId: 'BKSOVER99',
    },
  ];

  for (const tc of badCases) {
    const res = await postWorkspace(csrfToken, cookieHeader, {
      operation: 'input_manual_mfs',
      orderNo: target.orderNo,
      provider: tc.provider,
      trxId: tc.trxId,
      senderPhone: target.customerPhone || '01712345678',
      submittedAmountPoisha: tc.submittedAmountPoisha,
    });
    assert.ok(
      res.status >= 400 || res.body?.success === false,
      `input_manual_mfs MUST reject invalid case ${JSON.stringify(tc)}, got ${res.status}`,
    );
  }
});

test('Order Details save: update_full_order blocks silent status/advance tampering and negative delivery charges', async () => {
  const { csrfToken, cookieHeader, orders } = await fetchWorkspaceBootstrap();
  const target = orders[0];

  const tamperRes = await postWorkspace(csrfToken, cookieHeader, {
    operation: 'update_full_order',
    orderNo: target.orderNo,
    status: 'delivered',
    advancePaidPoisha: 999999,
  });
  assert.ok(
    tamperRes.status >= 400 || tamperRes.body?.success === false,
    'update_full_order must reject silent status/advancePaidPoisha tampering',
  );

  const negDeliveryRes = await postWorkspace(csrfToken, cookieHeader, {
    operation: 'update_full_order',
    orderNo: target.orderNo,
    deliveryChargePoisha: -500,
  });
  assert.ok(
    negDeliveryRes.status >= 400 || negDeliveryRes.body?.success === false,
    'update_full_order must reject negative deliveryChargePoisha',
  );
});

test('Print preview pipeline: generate_print_slips returns valid slip bundle and /api/print rejects invalid copy & oversized bodies', async () => {
  const { csrfToken, cookieHeader, orders } = await fetchWorkspaceBootstrap();
  const target = orders[0];

  const slipRes = await postWorkspace(csrfToken, cookieHeader, {
    operation: 'generate_print_slips',
    orderNos: [target.orderNo],
  });
  assert.equal(slipRes.status, 200);
  assert.equal(slipRes.body?.success, true);
  assert.ok(Array.isArray(slipRes.body?.slips) && slipRes.body.slips.length === 1);
  assert.equal(slipRes.body.slips[0]?.customerAndCourierPart?.orderNo, target.orderNo);

  const invalidCopyPrint = await fetch(`${BASE_URL}/api/print/${encodeURIComponent(target.orderNo)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      'x-csrf-token': csrfToken,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({ copy: 'hacker_copy' }),
  });
  assert.equal(invalidCopyPrint.status, 400);
  const invalidBody = await invalidCopyPrint.json();
  assert.equal(invalidBody.code, 'INVALID_PRINT_REQUEST');

  const oversizedPrint = await fetch(`${BASE_URL}/api/print/${encodeURIComponent(target.orderNo)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Origin: BASE_URL,
      'x-csrf-token': csrfToken,
      ...(cookieHeader ? { Cookie: cookieHeader } : {}),
    },
    body: JSON.stringify({ copy: 'customer', reprintReason: 'x'.repeat(5000) }),
  });
  assert.equal(oversizedPrint.status, 413);
});
