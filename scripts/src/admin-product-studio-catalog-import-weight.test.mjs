import test from 'node:test';
import assert from 'node:assert/strict';

// CAT-02 regression: CSV import preview must reject weight_grams below the
// repository minimum (100g). Before the fix, planCatalogImport accepted any
// weight >= 1 and commitCatalogImport silently clamped it to 100g via
// upsertAdminProduct's Math.max(100, ...) — importing e.g. a 5g product
// stored it as 100g with no operator-visible error, corrupting courier
// weight bands and delivery quotes.

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function getAdminContext() {
  const res = await fetch(`${BASE}/api/admin/workspace`, {
    headers: { Origin: BASE },
  });
  assert.equal(res.status, 200, `Expected 200 from GET /api/admin/workspace, got ${res.status}`);
  const data = await res.json();
  assert.equal(data.authorized, true, 'Admin workspace must be authorized in preview');
  assert.ok(Array.isArray(data.vendors) && data.vendors.length > 0, 'Expected at least 1 vendor');
  assert.ok(Array.isArray(data.categories) && data.categories.length > 0, 'Expected at least 1 category');
  const setCookie = res.headers.get('set-cookie') || '';
  const cookiePair = setCookie.split(';')[0] || '';
  return {
    csrfToken: data.csrfToken || '',
    cookie: cookiePair,
    vendors: data.vendors,
    categories: data.categories,
  };
}

function buildHeaders(ctx) {
  const headers = { Origin: BASE, 'Content-Type': 'application/json' };
  if (ctx.csrfToken) headers['x-csrf-token'] = ctx.csrfToken;
  if (ctx.cookie) headers['Cookie'] = ctx.cookie;
  return headers;
}

const HEADER =
  'vendor_id,category_id,name_bn,name_en,public_sku,variant_bn,variant_en,supplier_cost_bdt,supplier_profit_bdt,sale_price_bdt,weight_grams';

test('Product Studio API: /api/catalog/import preview rejects sub-100g weights with a row error (CAT-02)', async () => {
  const ctx = await getAdminContext();
  const vendor = ctx.vendors[0];
  const category = ctx.categories[0];

  const lightWeightCsv = [
    HEADER,
    `${vendor.vendorId},${category.id},হালকা পণ্য,Light Product,BG-LIGHT-9992,স্ট্যান্ডার্ড,Standard,100,20,180,5`,
  ].join('\n');

  const res = await fetch(`${BASE}/api/catalog/import`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({ mode: 'preview', csv: lightWeightCsv }),
  });
  assert.equal(res.status, 200, `Expected 200 for preview, got ${res.status}`);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(
    data.errors.length > 0,
    'CSV weight_grams below 100 must report a row error at preview, not silently clamp to 100g at commit'
  );
  assert.ok(
    data.errors.some((error) => error.code === 'INVALID_CATALOG_ROW'),
    `Expected INVALID_CATALOG_ROW error code, got ${JSON.stringify(data.errors)}`
  );
  assert.equal(data.items.length, 0, 'Rejected rows must not appear in preview items');
});

test('Product Studio API: /api/catalog/import preview still accepts a >=100g weight (guard parity)', async () => {
  const ctx = await getAdminContext();
  const vendor = ctx.vendors[0];
  const category = ctx.categories[0];

  const validCsv = [
    HEADER,
    `${vendor.vendorId},${category.id},স্বাভাবিক পণ্য,Normal Weight Product,BG-NORMAL-9993,স্ট্যান্ডার্ড,Standard,500,100,850,100`,
  ].join('\n');

  const res = await fetch(`${BASE}/api/catalog/import`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({ mode: 'preview', csv: validCsv }),
  });
  assert.equal(res.status, 200, `Expected 200 for preview, got ${res.status}`);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.errors.length, 0, `Expected no errors for a valid 100g row, got ${JSON.stringify(data.errors)}`);
  assert.equal(data.items.length, 1, 'Valid 100g row must appear in preview items');
});
