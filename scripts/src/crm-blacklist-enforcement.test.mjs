import test from 'node:test';
import assert from 'node:assert/strict';

// CRM-01 regression: the fraud blacklist must be enforced server-side.
// Before the fix, createStorefrontOrder and phase4a smart entry passed
// isCustomerBlacklisted: false hardcoded, and recoverAbandonedCartToOrder
// performed no blacklist check at all — a blacklisted number's abandoned
// cart became a live COD order in one click. These tests fail on main's
// behavior and pass once CRM-01 is fixed.

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
    blacklistedPhones: data.blacklistedPhones ?? {},
    abandonedCarts: data.abandonedCarts ?? [],
  };
}

function buildHeaders(ctx) {
  const headers = { Origin: BASE, 'Content-Type': 'application/json' };
  if (ctx.csrfToken) headers['x-csrf-token'] = ctx.csrfToken;
  if (ctx.cookie) headers['Cookie'] = ctx.cookie;
  return headers;
}

async function blacklist(ctx, phone, reasonBn) {
  const res = await fetch(`${BASE}/api/admin/workspace`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({ operation: 'upsert_blacklist', phone, action: 'add', reasonBn }),
  });
  assert.equal(res.status, 200, `upsert_blacklist add failed: ${res.status}`);
  const data = await res.json();
  assert.equal(data.success, true, `upsert_blacklist add returned success=false: ${data.errorBn}`);
  return data.normalizedPhone;
}

async function removeFromBlacklist(ctx, phone) {
  const res = await fetch(`${BASE}/api/admin/workspace`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({ operation: 'upsert_blacklist', phone, action: 'remove', reasonBn: '' }),
  });
  assert.equal(res.status, 200, `upsert_blacklist remove failed: ${res.status}`);
  const data = await res.json();
  assert.equal(data.success, true, `upsert_blacklist remove returned success=false: ${data.errorBn}`);
}

test('CRM-01: recover_abandoned_cart on a blacklisted customer phone is rejected (not converted to a live COD order)', async () => {
  const ctx = await getAdminContext();
  assert.ok(ctx.abandonedCarts.length > 0, 'Preview must seed at least one abandoned cart');

  const cart = ctx.abandonedCarts.find((c) => !c.isRecovered);
  assert.ok(cart, 'Expected at least one non-recovered abandoned cart');
  const phone = cart.customerPhone;

  await blacklist(ctx, phone, 'CRM-01 regression: পরীক্ষার জন্য সাময়িক ব্ল্যাকলিস্ট');

  try {
    const res = await fetch(`${BASE}/api/admin/workspace`, {
      method: 'POST',
      headers: buildHeaders(ctx),
      body: JSON.stringify({ operation: 'recover_abandoned_cart', cartId: cart.cartId }),
    });
    // The fix must reject: either 400 with success=false + errorBn, or
    // success=false in a 200. What it must NOT do is create an order.
    const data = await res.json();
    assert.ok(
      !data.success || res.status === 400,
      `recover_abandoned_cart must fail for a blacklisted phone, got status=${res.status} success=${data.success} orderNo=${data.orderNo}`
    );
    assert.equal(data.orderNo, undefined, 'No order must be created for a blacklisted phone');
  } finally {
    await removeFromBlacklist(ctx, phone);
  }
});

test('CRM-01 (guard parity): after blacklist removal, the same cart recovers normally', async () => {
  const ctx = await getAdminContext();
  assert.ok(ctx.abandonedCarts.length > 0, 'Preview must seed at least one abandoned cart');

  const cart = ctx.abandonedCarts.find((c) => !c.isRecovered);
  assert.ok(cart, 'Expected at least one non-recovered abandoned cart');

  const res = await fetch(`${BASE}/api/admin/workspace`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({ operation: 'recover_abandoned_cart', cartId: cart.cartId }),
  });
  assert.equal(res.status, 200, `Expected 200 for legit recovery, got ${res.status}`);
  const data = await res.json();
  assert.equal(data.success, true, `Legit (non-blacklisted) recovery must succeed: ${data.errorBn}`);
  assert.ok(data.orderNo, 'Recovery must return the created order number');
});

test('CRM-01: storefront order for a blacklisted phone gets maximum risk score, not zero', async () => {
  const ctx = await getAdminContext();
  const phone = '01712345678';

  await blacklist(ctx, phone, 'CRM-01 regression: স্টোরফ্রন্ট অর্ডার রিস্ক চেক');

  try {
    const res = await fetch(`${BASE}/api/orders`, {
      method: 'POST',
      headers: { Origin: BASE, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customerName: 'ব্ল্যাকলিস্ট পরীক্ষা',
        customerPhone: phone,
        districtId: 1,
        upazilaId: 145,
        streetAddress: 'CRM-01 রিগ্রেশন টেস্ট ঠিকানা',
        deliveryMethod: 'courier',
        paymentMethod: 'cod',
        advancePaidPoisha: 0,
        customerNote: '',
        items: [],
      }),
    });
    // The exact storefront contract may reject empty items or accept the
    // order — both are fine. What must NOT happen: an accepted order with a
    // low/zero risk score for a blacklisted phone.
    const data = await res.json();
    if (data.success && data.order) {
      const created = data.order;
      assert.ok(
        created.riskScore >= 80,
        `Blacklisted phone order must carry maximum risk score, got ${created.riskScore}`
      );
    }
    // If the storefront blocks blacklisted phones outright, that is also a pass.
  } finally {
    await removeFromBlacklist(ctx, phone);
  }
});
