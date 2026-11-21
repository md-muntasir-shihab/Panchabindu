import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function getAdminContext() {
  const res = await fetch(`${BASE}/api/admin/workspace`, {
    headers: { Origin: BASE },
  });
  assert.equal(res.status, 200, `Expected 200 from GET /api/admin/workspace, got ${res.status}`);
  const data = await res.json();
  assert.equal(data.authorized, true, 'Admin workspace must be authorized in preview');
  assert.ok(Array.isArray(data.orders) && data.orders.length > 0, 'Expected at least 1 order');
  assert.ok(data.printConfig, 'Expected printConfig in workspace snapshot');
  const setCookie = res.headers.get('set-cookie') || '';
  const cookiePair = setCookie.split(';')[0] || '';
  return {
    csrfToken: data.csrfToken || '',
    cookie: cookiePair,
    orderNo: data.orders[0].orderNo,
    printConfig: data.printConfig,
  };
}

async function postWorkspace(ctx, body) {
  const headers = {
    'Content-Type': 'application/json',
    Origin: BASE,
  };
  if (ctx.csrfToken) headers['x-csrf-token'] = ctx.csrfToken;
  if (ctx.cookie) headers['Cookie'] = ctx.cookie;
  const res = await fetch(`${BASE}/api/admin/workspace`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, headers: res.headers, data };
}

test('Print Engine API: security headers and CORS non-reflection', async () => {
  const res = await fetch(`${BASE}/api/admin/workspace`, {
    headers: { Origin: 'https://evil-print-attacker.example' },
  });
  assert.equal(res.status, 200);
  const acao = res.headers.get('access-control-allow-origin');
  assert.notEqual(acao, '*');
  assert.notEqual(acao, 'https://evil-print-attacker.example');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('Print Engine API: generate_print_slips preview does not increment printCount and leaks zero cost data in customerAndCourierPart', async () => {
  const ctx = await getAdminContext();
  const r1 = await postWorkspace(ctx, {
    operation: 'generate_print_slips',
    orderNos: [ctx.orderNo],
  });
  assert.equal(r1.status, 200);
  assert.equal(r1.data.success, true);
  assert.equal(r1.data.slips.length, 1);
  const slip1 = r1.data.slips[0];
  assert.equal(typeof slip1.printCount, 'number');
  assert.ok(Array.isArray(slip1.printEvents));

  const customerJson = JSON.stringify(slip1.customerAndCourierPart);
  for (const forbidden of [
    'supplierCostPoisha',
    'snapSupplierCostPoisha',
    'platformMarginPoisha',
    'internalVendorSku',
    'internalStaffNote',
    'vendorSplitBreakdown',
    'payoutAccountNo',
  ]) {
    assert.equal(
      customerJson.includes(forbidden),
      false,
      `Customer/Courier part leaked ${forbidden}`
    );
  }

  const r2 = await postWorkspace(ctx, {
    operation: 'generate_print_slips',
    orderNos: [ctx.orderNo],
  });
  assert.equal(r2.status, 200);
  assert.equal(r2.data.slips[0].printCount, slip1.printCount);
});

test('Print Engine API: generate_print_slips rejects empty, oversized (>100), and overlong orderNos', async () => {
  const ctx = await getAdminContext();

  const emptyRes = await postWorkspace(ctx, {
    operation: 'generate_print_slips',
    orderNos: [],
  });
  assert.equal(emptyRes.status, 400);

  const tooMany = Array.from({ length: 101 }, (_, idx) => `ORD-OVERFLOW-${idx}`);
  const batchRes = await postWorkspace(ctx, {
    operation: 'generate_print_slips',
    orderNos: tooMany,
  });
  assert.equal(batchRes.status, 400);

  const overlongRes = await postWorkspace(ctx, {
    operation: 'generate_print_slips',
    orderNos: ['O'.repeat(65)],
  });
  assert.equal(overlongRes.status, 400);
});

test('Print Engine API: update_print_config enforces strict bounds and restores original config cleanly', async () => {
  const ctx = await getAdminContext();

  const invalidPatches = [
    { part1HeightMm: 59 },
    { part2HeightMm: 121 },
    { part3HeightMm: 95.5 },
    { part1TitleBn: 'X' },
    { part1TitleEn: 'A'.repeat(101) },
    { footerNoteBn: 'F'.repeat(301) },
    { checklistItemsBn: Array.from({ length: 21 }, (_, i) => `Item ${i}`) },
  ];

  for (const patch of invalidPatches) {
    const res = await postWorkspace(ctx, {
      operation: 'update_print_config',
      patch,
    });
    assert.equal(
      res.status,
      400,
      `Expected 400 for invalid print config patch ${JSON.stringify(patch)}, got ${res.status}`
    );
  }

  // Valid round-trip save & restore
  const original = ctx.printConfig;
  const testFooter = `${original.footerNoteBn || 'Verified'}`.slice(0, 280);
  const saveRes = await postWorkspace(ctx, {
    operation: 'update_print_config',
    patch: {
      defaultMode: original.defaultMode,
      part1HeightMm: original.part1HeightMm,
      part2HeightMm: original.part2HeightMm,
      part3HeightMm: original.part3HeightMm,
      footerNoteBn: testFooter,
    },
  });
  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.data.success, true);
  assert.equal(saveRes.data.printConfig.footerNoteBn, testFooter.trim());

  // Restore exact original footer
  const restoreRes = await postWorkspace(ctx, {
    operation: 'update_print_config',
    patch: { footerNoteBn: original.footerNoteBn },
  });
  assert.equal(restoreRes.status, 200);
});

test('Print Engine API: /api/print/:orderNo enforces orderNo length, copy enum, and 413 body cap', async () => {
  const ctx = await getAdminContext();
  const baseHeaders = {
    'Content-Type': 'application/json',
    Origin: BASE,
    ...(ctx.csrfToken ? { 'x-csrf-token': ctx.csrfToken } : {}),
    ...(ctx.cookie ? { Cookie: ctx.cookie } : {}),
  };

  const invalidCopy = await fetch(`${BASE}/api/print/${encodeURIComponent(ctx.orderNo)}`, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({ copy: 'secret_dump' }),
  });
  assert.equal(invalidCopy.status, 400);

  const oversized = await fetch(`${BASE}/api/print/${encodeURIComponent(ctx.orderNo)}`, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({ copy: 'customer', reprintReason: 'A'.repeat(5000) }),
  });
  assert.equal(oversized.status, 413);

  const overlongOrderNo = await fetch(`${BASE}/api/print/${'X'.repeat(70)}`, {
    method: 'POST',
    headers: baseHeaders,
    body: JSON.stringify({ copy: 'customer' }),
  });
  assert.equal(overlongOrderNo.status, 400);
});
