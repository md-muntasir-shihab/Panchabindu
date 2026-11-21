import assert from 'node:assert/strict';
import test from 'node:test';

const BASE_URL = (process.env.AUDIT_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

const FORBIDDEN_INTERNAL_KEYS = new Set([
  'vendorId',
  'supplierCostPoisha',
  'platformMarginPoisha',
  'passwordHash',
  'sessionToken',
  'refreshToken',
  'serviceRoleKey',
  'apiKey',
  'secretKey',
]);

function findForbiddenKeys(value, path = '$', found = []) {
  if (!value || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item, index) => findForbiddenKeys(item, `${path}[${index}]`, found));
    return found;
  }
  for (const [key, nested] of Object.entries(value)) {
    const nextPath = `${path}.${key}`;
    if (FORBIDDEN_INTERNAL_KEYS.has(key)) {
      found.push(nextPath);
    }
    findForbiddenKeys(nested, nextPath, found);
  }
  return found;
}

test('GET /api/page-data?pagePath=/ returns hardened headers and clean public storefront payload', async () => {
  const response = await fetch(`${BASE_URL}/api/page-data?pagePath=/`);
  assert.equal(response.status, 200);

  assert.equal(response.headers.get('x-powered-by'), null, 'X-Powered-By header must be disabled');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(response.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');
  assert.ok(
    response.headers.get('permissions-policy')?.includes('camera=()'),
    'Permissions-Policy header must restrict unused browser features',
  );

  const payload = await response.json();
  assert.equal(payload.success, true);
  assert.equal(payload.data?.page, 'home');
  const props = payload.data?.props;
  assert.ok(Array.isArray(props?.products) && props.products.length > 0, 'Homepage must return products');
  assert.ok(Array.isArray(props?.categories) && props.categories.length > 0, 'Homepage must return categories');
  assert.ok(props?.siteSettings && typeof props.siteSettings === 'object');

  const leakedKeys = findForbiddenKeys(payload);
  assert.deepEqual(leakedKeys, [], `Internal fields leaked in homepage page-data: ${leakedKeys.join(', ')}`);
});

test('GET /api/page-data rejects malformed percent-encoding and overlong paths with 400 INVALID_PATH', async () => {
  const malformedRes = await fetch(`${BASE_URL}/api/page-data?pagePath=/%E0%A4%A`);
  assert.equal(malformedRes.status, 400);
  const malformedBody = await malformedRes.json();
  assert.equal(malformedBody.code, 'INVALID_PATH');
  assert.ok(malformedRes.headers.get('cache-control')?.includes('no-store'));

  const longPath = `/${'a'.repeat(600)}`;
  const longRes = await fetch(`${BASE_URL}/api/page-data?pagePath=${encodeURIComponent(longPath)}`);
  assert.equal(longRes.status, 400);
  const longBody = await longRes.json();
  assert.equal(longBody.code, 'INVALID_PATH');
});

test('CORS rejects untrusted third-party origins on API routes', async () => {
  const response = await fetch(`${BASE_URL}/api/page-data?pagePath=/`, {
    headers: { Origin: 'https://evil-attacker.example' },
  });
  assert.equal(response.status, 200);
  const allowOrigin = response.headers.get('access-control-allow-origin');
  assert.notEqual(allowOrigin, '*', 'CORS must not emit wildcard Access-Control-Allow-Origin');
  assert.notEqual(
    allowOrigin,
    'https://evil-attacker.example',
    'CORS must not reflect untrusted origins',
  );
});

test('GET /api/storefront validates delivery quote query parameters strictly', async () => {
  const invalidCases = [
    'districtId=1&weightGrams=abc&subtotalPoisha=-999',
    'districtId=1.5&weightGrams=500&subtotalPoisha=100000',
    'districtId=1&weightGrams=0&subtotalPoisha=100000',
    'districtId=99999&weightGrams=500&subtotalPoisha=100000',
    'districtId=1&weightGrams=500&subtotalPoisha=Infinity',
    `category=${'x'.repeat(200)}`,
  ];

  for (const query of invalidCases) {
    const res = await fetch(`${BASE_URL}/api/storefront?${query}`);
    assert.equal(res.status, 400, `Expected 400 for invalid query "${query}", got ${res.status}`);
    const body = await res.json();
    assert.ok(body.error, `Expected error message for invalid query "${query}"`);
  }

  const validRes = await fetch(`${BASE_URL}/api/storefront?districtId=1&weightGrams=500&subtotalPoisha=100000`);
  assert.equal(validRes.status, 200);
  const validBody = await validRes.json();
  assert.equal(validBody.success, true);
  assert.equal(typeof validBody.data?.deliveryQuote?.finalChargePoisha, 'number');
  assert.ok(
    Number.isFinite(validBody.data.deliveryQuote.finalChargePoisha) &&
      validBody.data.deliveryQuote.finalChargePoisha >= 0,
  );
});
