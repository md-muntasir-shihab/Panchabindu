import test from 'node:test';
import assert from 'node:assert/strict';
import { ApiRequest } from '../http';
import { GET, POST } from '../../../app/api/account/orders/route';
const req = (body: object, cookie?: string) => new ApiRequest('http://localhost/api/account/orders', { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
const account = (cookie: string) => GET(new ApiRequest('http://localhost/api/account/orders', { headers: { cookie } }));
const cookieOf = (res: Response) => res.headers.get('set-cookie')!.split(';')[0];
test('password registration, normalization, sessions, password change and throttling', async () => {
  const pass = 'correct horse battery staple';
  const registered = await POST(req({ action: 'register', email: 'Test@Example.com', password: pass }));
  assert.equal(registered.status, 200, await registered.clone().text());
  const cookie = cookieOf(registered);
  assert.match(registered.headers.get('set-cookie')!, /HttpOnly/);
  assert.match(registered.headers.get('set-cookie')!, /Max-Age=604800/);
  assert.equal((await (await account(cookie)).json()).identifier, 'test@example.com');
  assert.equal((await POST(req({ action: 'register', email: 'test@example.com', password: pass }))).status, 409);
  assert.equal((await POST(req({ action: 'login', identifier: 'TEST@example.com', password: 'wrong' }))).status, 401);
  const login = await POST(req({ action: 'login', identifier: 'TEST@example.com', password: pass }));
  assert.equal(login.status, 200);
  const otherCookie = cookieOf(login);
  assert.equal((await POST(req({ action: 'change_password', currentPassword: 'wrong', newPassword: 'new password 123' }, cookie))).status, 401);
  assert.equal((await POST(req({ action: 'change_password', currentPassword: pass, newPassword: 'new password 123' }, cookie))).status, 200);
  assert.equal((await (await account(cookie)).json()).authenticated, false);
  assert.equal((await (await account(otherCookie)).json()).authenticated, false);
  assert.equal((await POST(req({ action: 'login', identifier: 'test@example.com', password: pass }))).status, 401);
  const newLogin = await POST(req({ action: 'login', identifier: 'test@example.com', password: 'new password 123' }));
  assert.equal(newLogin.status, 200);
  const newCookie = cookieOf(newLogin);
  assert.equal((await POST(req({ action: 'logout' }, newCookie))).status, 200);
  assert.equal((await (await account(newCookie)).json()).authenticated, false);
  const phone = await POST(req({ action: 'register', phone: '+880 1712-345678', password: pass }));
  assert.equal(phone.status, 200);
  assert.equal((await POST(req({ action: 'register', phone: '০১৭১২৩৪৫৬৭৮', password: pass }))).status, 409);
  assert.equal((await POST(req({ action: 'login', identifier: '01712345678', password: pass }))).status, 200);
  assert.equal((await POST(req({ action: 'request_otp', customerPhone: '01712345678' }))).status, 400);
  for (let i = 0; i < 10; i++) assert.equal((await POST(req({ action: 'login', identifier: 'unknown@example.com', password: 'wrong' }))).status, 401);
  assert.equal((await POST(req({ action: 'login', identifier: 'unknown@example.com', password: 'wrong' }))).status, 429);
});

test('email accounts preserve order isolation and can use delivery phone for checkout, returns and carts', async () => {
  const { POST: checkout } = await import('../../../app/api/orders/route');
  const { POST: returns } = await import('../../../app/api/orders/return-request/route');
  const { POST: cancellation } = await import('../../../app/api/orders/cancellation-request/route');
  const { POST: cart } = await import('../../../app/api/cart/abandoned/route');
  const { readErpState, writeErpState } = await import('../db/repository');
  const send = (path: string, body: object, cookie: string) => new ApiRequest(`http://localhost${path}`, { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json', cookie }, body: JSON.stringify(body) });
  const a = cookieOf(await POST(req({ action: 'register', email: 'audit-a@example.com', password: 'secure password A' })));
  const b = cookieOf(await POST(req({ action: 'register', email: 'audit-b@example.com', password: 'secure password B' })));
  const state = readErpState();
  const product = state.products.find(p => p.status === 'active' && p.variants.length)!;
  product.variants[0].stockOnHand = product.variants[0].stockAvailable = 20;
  writeErpState(state);
  const phone = '01788889999';
  const input = { customerName: 'Test Customer', customerPhone: phone, districtId: 47, upazilaId: 365, streetAddress: 'Test house road number 25', landmark: 'Test school', deliveryMethod: 'courier', paymentMethod: 'cod', idempotencyKey: 'password-audit-order-01', items: [{ productId: product.productId, variantId: product.variants[0].variantId, quantity: 1 }] };
  const orderResponse = await checkout(send('/api/orders', input, a));
  assert.equal(orderResponse.status, 200, await orderResponse.clone().text());
  const order = (await orderResponse.json()).order;
  assert.equal((await (await account(a)).json()).orders.some((o: { orderNo: string }) => o.orderNo === order.orderNo), true);
  assert.equal((await (await account(b)).json()).orders.some((o: { orderNo: string }) => o.orderNo === order.orderNo), false);
  const profile = (await (await account(a)).json()).deliveryProfile;
  assert.equal(profile.customerName, input.customerName);
  assert.equal(profile.customerPhone, phone);
  assert.equal(profile.streetAddress, input.streetAddress);
  assert.equal(profile.districtId, input.districtId);
  assert.equal((await (await account(b)).json()).deliveryProfile, null);
  assert.equal((await cancellation(send('/api/orders/cancellation-request', { orderNo: order.orderNo, customerPhone: phone, reasonBn: 'Test reason' }, b))).status, 404);
  assert.equal((await returns(send('/api/orders/return-request', { orderNo: order.orderNo, reasonCode: 'quality_defect', detailsBn: 'Test details here' }, b))).status, 404);
  const cartResponse = await cart(send('/api/cart/abandoned', { customerPhone: phone, districtId: 47, items: [{ variantId: product.variants[0].variantId, quantity: 1 }] }, a));
  assert.equal(cartResponse.status, 200);
  assert.equal(readErpState().abandonedCarts.some(c => c.customerPhone === phone), true);
  const cancelOrder = await checkout(send('/api/orders', { ...input, idempotencyKey: 'password-audit-order-02' }, a));
  assert.equal(cancelOrder.status, 200, await cancelOrder.clone().text());
  const cancelOrderNo = (await cancelOrder.json()).order.orderNo;
  assert.equal((await cancellation(send('/api/orders/cancellation-request', { orderNo: cancelOrderNo, customerPhone: phone, reasonBn: 'Test cancellation' }, a))).status, 200);
  const updated = readErpState();
  updated.orders.find(o => o.orderNo === order.orderNo)!.status = 'delivered';
  writeErpState(updated);
  assert.equal((await returns(send('/api/orders/return-request', { orderNo: order.orderNo, reasonCode: 'quality_defect', detailsBn: 'Test details here' }, a))).status, 200);
});

test('failed registration transaction does not leave an account behind', async () => {
  const fs = await import('node:fs');
  const file = '.data/erp-store.json';
  const original = fs.readFileSync(file, 'utf8');
  try {
    fs.writeFileSync(file, '{}');
    const response = await POST(req({ action: 'register', email: 'rollback@example.com', password: 'rollback password' }));
    assert.equal(response.status, 503);
  } finally { fs.writeFileSync(file, original); }
  assert.equal((await POST(req({ action: 'login', identifier: 'rollback@example.com', password: 'rollback password' }))).status, 401);
  assert.equal((await POST(req({ action: 'register', email: 'rollback@example.com', password: 'rollback password' }))).status, 200);
});

test('guest checkout requires an unguessable retry key and does not associate orders by phone', async () => {
  const crypto = await import('node:crypto');
  const { POST: checkout } = await import('../../../app/api/orders/route');
  const { readErpState, writeErpState } = await import('../db/repository');
  const state = readErpState();
  const product = state.products.find(p => p.status === 'active' && p.variants.length)!;
  product.variants[0].stockOnHand = product.variants[0].stockAvailable = 20;
  state.siteSettings.globalFreeDelivery = false;
  state.siteSettings.freeDeliveryThresholdPoisha = 100_000_000;
  product.isFreeDelivery = false;
  writeErpState(state);
  const phone = '01776543210';
  const input = { customerName: 'Guest Customer', customerPhone: phone, districtId: 47, upazilaId: 365, streetAddress: 'Test guest house road 25', landmark: 'Test school', deliveryMethod: 'courier', paymentMethod: 'cod', idempotencyKey: crypto.randomUUID(), items: [{ productId: product.productId, variantId: product.variants[0].variantId, quantity: 1 }] };
  const send = (body: object) => new ApiRequest('http://localhost/api/orders', { method: 'POST', headers: { origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await checkout(send({ ...input, idempotencyKey: 'guessable-key' }))).status, 400);
  const response = await checkout(send(input));
  assert.equal(response.status, 200, await response.clone().text());
  const order = (await response.json()).order;
  assert.match(order.secureTrackingToken, /^trk_/);
  const retry = await checkout(send(input));
  assert.equal((await retry.json()).order.orderNo, order.orderNo);
  const settings = readErpState();
  const depositProduct = settings.products.find(p => p.productId === product.productId)!;
  depositProduct.requiresAdvanceCourierCharge = true; depositProduct.customAdvanceDepositPoisha = 1234;
  settings.siteSettings.globalFreeDelivery = true;
  writeErpState(settings);
  const bkash = await checkout(send({ ...input, idempotencyKey: crypto.randomUUID(), paymentMethod: 'bkash_manual', manualPaymentTrxId: 'AUDIT987654' }));
  assert.equal(bkash.status, 200, await bkash.clone().text());
  const submission = readErpState().manualBkashSubmissions.find(s => s.trxId === 'AUDIT987654');
  assert.equal(submission?.status, 'pending_verification');
  assert.equal(submission?.submittedAmountPoisha, 1234);
  const registered = await POST(req({ action: 'register', phone, password: 'secure guest password' }));
  assert.equal(registered.status, 200);
  assert.equal((await (await account(cookieOf(registered))).json()).orders.some((o: { orderNo: string }) => o.orderNo === order.orderNo), false);
  assert.equal((await (await account(cookieOf(registered))).json()).deliveryProfile, null);
});

test('scheduled courier endpoint fails closed even with the configured secret', async () => {
  const { GET } = await import('../../../app/api/cron/courier-status/route');
  const previous = process.env.CRON_SECRET;
  process.env.CRON_SECRET = 'test-cron-secret';
  try {
    const request = (auth?: string) => new ApiRequest('http://localhost/api/cron/courier-status', { headers: auth ? { authorization: auth } : {} });
    assert.equal((await GET(request())).status, 401);
    const response = await GET(request('Bearer test-cron-secret'));
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'NOT_INTEGRATED');
  } finally { if (previous === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = previous; }
});

test('signed but unverified courier webhook never changes orders or finance', async () => {
  const { POST: webhook } = await import('../../../app/api/webhooks/courier/route');
  const { computeWebhookHmacSignature } = await import('../admin/phase6-service');
  const { readErpState } = await import('../db/repository');
  const { readPhase4BStore } = await import('../admin/phase4b-service');
  const previous = process.env.STEADFAST_WEBHOOK_SECRET;
  process.env.STEADFAST_WEBHOOK_SECRET = 'unit-fixture-not-real-secret';
  try {
    const order = readErpState().orders[0]; assert.ok(order);
    const beforeOrder = structuredClone(order);
    const beforeLedger = structuredClone(readPhase4BStore().courierRemittanceLedger);
    const body = JSON.stringify({ provider: 'steadfast', orderNo: order.orderNo, rawStatus: 'delivered', consignmentId: 'fixture-consignment', eventId: 'fixture-event' });
    const timestamp = String(Date.now());
    const signature = computeWebhookHmacSignature(body, process.env.STEADFAST_WEBHOOK_SECRET, timestamp);
    const request = new ApiRequest('http://localhost/api/webhooks/courier', { method: 'POST', headers: { 'content-type': 'application/json', 'x-webhook-signature': signature, 'x-webhook-timestamp': timestamp }, body });
    const response = await webhook(request);
    assert.equal(response.status, 503); assert.equal((await response.json() as { code: string }).code, 'NOT_INTEGRATED');
    assert.deepEqual(readErpState().orders.find(item => item.orderNo === order.orderNo), beforeOrder);
    assert.deepEqual(readPhase4BStore().courierRemittanceLedger, beforeLedger);
  } finally { if (previous === undefined) delete process.env.STEADFAST_WEBHOOK_SECRET; else process.env.STEADFAST_WEBHOOK_SECRET = previous; }
});
