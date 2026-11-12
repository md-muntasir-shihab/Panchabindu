import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { NextRequest } from 'next/server';
import { createAdminSession, requestCustomerPhoneOtp, verifyCustomerPhoneOtp, verifyCustomerSessionToken, revokeCustomerSession, verifyOriginAndCsrf, generateTotpCode, decryptSecretAtRest, verifyAdminSessionToken } from './crypto-session';
import { createStorefrontOrder, customerOwnsOrder, getAuthenticatedCustomerOrders, getPublicStorefrontData, getPublicProductBySlug, readErpState, writeErpState, sanitizeSiteSettingsForPublic, submitProductReview } from '../db/repository';
import { adminResetUserSecurity, authenticateAdminUser, createAdminUserBySuperAdmin, completeFirstLoginGate, getActorSecurityContext, readAdminStore, writeAdminStore } from '../admin/phase4a-service';
import { WORKSPACE_ACTIONS, canExecuteWorkspaceAction } from './workspace-policy';
import { GET as workspaceGet, POST as workspacePost } from '../../../app/api/admin/workspace/route';
import { POST as authPost } from '../../../app/api/admin/auth/route';
import { POST as checkout } from '../../../app/api/orders/route';
import { POST as cancellation } from '../../../app/api/orders/cancellation-request/route';
import { POST as returns } from '../../../app/api/orders/return-request/route';
import { POST as payment } from '../../../app/api/payments/manual-bkash/submissions/route';

function customer(phone: string) {
  const otp = requestCustomerPhoneOtp(phone, { allowSandboxInNonProd: true });
  assert.ok(otp.sandboxOtpCode);
  const verified = verifyCustomerPhoneOtp(phone, otp.sandboxOtpCode);
  assert.ok(verified.sessionToken);
  assert.ok(verified.session?.customerId);
  return { token: verified.sessionToken, session: verified.session! };
}
function request(path: string, body: unknown, token?: string, admin = false, csrf?: string) {
  return new NextRequest(`http://localhost${path}`, { method: 'POST', headers: {
    origin: 'http://localhost', host: 'localhost', 'content-type': 'application/json',
    ...(token ? { cookie: `${admin ? 'bg_admin_session' : 'bg_customer_session'}=${token}` } : {}),
    ...(csrf ? { 'x-csrf-token': csrf } : {}),
  }, body: JSON.stringify(body) });
}
function keyPaths(value: unknown, forbidden: string[], prefix = ''): string[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, item]) => [
    ...(forbidden.includes(key) ? [`${prefix}.${key}`] : []),
    ...keyPaths(item, forbidden, `${prefix}.${key}`),
  ]);
}
const orderInput = (phone: string) => ({ customerName: 'Synthetic Customer', customerPhone: phone, districtId: 47, upazilaId: 365,
  streetAddress: 'Synthetic house 25, road 12, Dhaka', landmark: 'Synthetic school', source: 'storefront' as const,
  deliveryMethod: 'courier' as const, paymentMethod: 'cod' as const, advancePaidPoisha: 0, customerNote: '', internalStaffNote: '', promoCode: '',
  idempotencyKey: `identity-${Date.now()}`, items: [{ productId: '00000000-0000-4000-8000-000000000101', variantId: '00000000-0000-4000-8000-000000000201', quantity: 1 }] });

test('strict origin rejects missing/null/downgrade/forwarded-host/preview suffix and accepts only exact origin', () => {
  for (const origin of [undefined, 'null', 'https://localhost', 'http://evil.test', 'https://attacker.run.app']) {
    assert.equal(verifyOriginAndCsrf(new Request('http://localhost/api/orders', { method: 'POST', headers: { ...(origin ? { origin } : {}), 'x-forwarded-host': 'evil.test' } })).ok, false);
  }
  assert.equal(verifyOriginAndCsrf(request('/api/orders', {})).ok, true);
});

test('server-configured origin handles internal Next host without trusting forwarded host', () => {
  const prior = process.env.APP_URL;
  try {
    process.env.APP_URL = 'https://shop.example.test';
    assert.equal(verifyOriginAndCsrf(new Request('http://internal:3000/api/orders', { method: 'POST', headers: { origin: 'https://shop.example.test' } })).ok, true);
    assert.equal(verifyOriginAndCsrf(new Request('http://internal:3000/api/orders', { method: 'POST', headers: { origin: 'https://evil.test', 'x-forwarded-host': 'evil.test' } })).ok, false);
  } finally { if (prior === undefined) delete process.env.APP_URL; else process.env.APP_URL = prior; }
});

test('all workspace schema operations are covered, unknown actions and every vendor action are denied', () => {
  const route = fs.readFileSync('app/api/admin/workspace/route.ts', 'utf8');
  const operations = [...route.matchAll(/operation: z.literal\('([^']+)'\)/g)].map((m) => m[1]).sort();
  assert.deepEqual(Object.keys(WORKSPACE_ACTIONS).sort(), operations);
  const vendor = getActorSecurityContext('usr-vendor-001')!;
  for (const op of operations) assert.equal(canExecuteWorkspaceAction(vendor, op), false, op);
  for (const id of ['usr-marketing-01', 'usr-packaging-01']) {
    const staff = getActorSecurityContext(id)!;
    for (const op of ['upsert_product', 'delete_product', 'generate_print_slips', 'review_manual_bkash', 'reset_user_security']) assert.equal(canExecuteWorkspaceAction(staff, op), false, op);
  }
  assert.equal(canExecuteWorkspaceAction(getActorSecurityContext('usr-super-admin'), 'typo_new_action'), false);
  assert.equal(canExecuteWorkspaceAction(getActorSecurityContext('usr-super-admin'), 'create_flash_campaign'), false);
});

test('HTTP containment denies simulated success and prohibited new-use without touching historical records', async () => {
  const admin = getActorSecurityContext('usr-super-admin')!;
  const session = createAdminSession(admin);
  assert.equal((await workspacePost(request('/api/admin/workspace', { operation: 'order_grid_action', orderNos: ['ORD-261106-0001'], actionType: 'book_courier' }, session.token, true, session.csrfToken))).status, 503);
  assert.equal((await workspacePost(request('/api/admin/workspace', { operation: 'create_flash_campaign', campaignCode: 'SYNTHETIC', titleBn: 'Synthetic Campaign', variantId: 'synthetic', flashDiscountPoisha: 100, maxUnitsQuota: 1 }, session.token, true, session.csrfToken))).status, 403);
  assert.equal((await workspacePost(request('/api/admin/workspace', { operation: 'input_manual_mfs', orderNo: 'ORD-261106-0001', provider: 'nagad', senderPhone: '01712345678', trxId: 'SYNTHETIC', amountTaka: 1 }, session.token, true, session.csrfToken))).status, 403);
});

test('SSR/public settings are allowlisted including nested additions; product specs do not leak unknown fields', () => {
  const state = readErpState();
  const settings = { ...state.siteSettings, secretFutureKey: 'do-not-publish', delayBanner: { ...state.siteSettings.delayBanner, secretFutureKey: 'do-not-publish' } };
  const safe = sanitizeSiteSettingsForPublic(settings);
  assert.equal(JSON.stringify(safe).includes('do-not-publish'), false);
  for (const key of ['supplierCostPoisha', 'globalDefaultCommissionBp', 'globalEscrowHoldDays', 'defaultPackagingCostPoisha', 'nagadManualNumber']) assert.equal(key in safe, false);
  const catalog = getPublicStorefrontData();
  assert.equal('globalDefaultCommissionBp' in catalog.siteSettings, false);
  assert.equal('globalDefaultCommissionBp' in getPublicProductBySlug(catalog.products[0].slug).siteSettings, false);
});

test('customer IDs, scoped idempotency and delivered-review proof resist phone, customerId and token forgery', async () => {
  const a = customer('01699000101');
  const b = customer('01699000102');
  const input = orderInput(a.session.phone);
  const first = createStorefrontOrder(input, a.token);
  assert.equal(first.success, true);
  assert.ok(first.order);
  assert.equal(customerOwnsOrder(a.token, first.order.orderNo), true);
  assert.equal(customerOwnsOrder(b.token, first.order.orderNo), false);
  assert.equal(getAuthenticatedCustomerOrders(b.token).some((o) => o.orderNo === first.order!.orderNo), false);
  assert.equal(customerOwnsOrder(a.token, 'ORD-261106-0001'), false); // No auto-link of legacy phone history.
  assert.equal(verifyCustomerSessionToken(a.token + 'tamper'), null);
  const replayOther = createStorefrontOrder({ ...input, customerPhone: b.session.phone }, b.token);
  assert.equal(replayOther.success, true);
  assert.notEqual(replayOther.order?.secureTrackingToken, first.order.secureTrackingToken);
  const review = { productId: input.items[0].productId, customerName: 'Synthetic Review', customerPhone: a.session.phone, rating: 5, comment: 'Synthetic delivered review' };
  assert.equal(submitProductReview(review, a.token).review?.isVerifiedPurchase, false);
  const state = readErpState();
  state.orders.find((o) => o.orderNo === first.order!.orderNo)!.status = 'delivered';
  writeErpState(state);
  assert.equal(submitProductReview(review, a.token).review?.isVerifiedPurchase, true);
  assert.equal(submitProductReview(review, b.token).review?.isVerifiedPurchase, false);
  assert.equal(submitProductReview(review).review?.isVerifiedPurchase, false);
  assert.equal((await cancellation(request('/api/orders/cancellation-request', { orderNo: first.order.orderNo, customerPhone: b.session.phone, reasonBn: 'synthetic reason' }, b.token))).status, 404);
  assert.equal((await returns(request('/api/orders/return-request', { orderNo: first.order.orderNo, secureTrackingToken: first.order.secureTrackingToken, reasonCode: 'quality_defect', detailsBn: 'synthetic reason' }, b.token))).status, 404);
  assert.equal((await payment(request('/api/payments/manual-bkash/submissions', { orderNo: first.order.orderNo, senderPhone: b.session.phone, trxId: 'SYNTHETIC123', submittedAmountPoisha: 100, idempotencyKey: 'synthetic-payment' }, b.token))).status, 404);
  const forged = await checkout(request('/api/orders', { ...orderInput(b.session.phone), customerId: a.session.customerId, source: 'phone_call', advancePaidPoisha: 100000, internalStaffNote: 'forged' }, b.token));
  assert.equal(forged.status, 200);
  const created = await forged.json();
  assert.equal(created.order.advancePaidPoisha, 0);
  assert.equal(customerOwnsOrder(a.token, created.order.orderNo), false);
  revokeCustomerSession(a.token);
  assert.equal(verifyCustomerSessionToken(a.token), null);
});

test('HTTP workspace denies vendor, staff catalog/Part3/finance actions and hides staff aggregates', async () => {
  for (const id of ['usr-vendor-001', 'usr-marketing-01', 'usr-packaging-01']) {
    const ctx = getActorSecurityContext(id)!;
    const session = createAdminSession(ctx);
    for (const body of [{ operation: 'delete_product', productId: 'synthetic' }, { operation: 'generate_print_slips', orderNos: ['ORD-261106-0001'] }]) {
      assert.equal((await workspacePost(request('/api/admin/workspace', body, session.token, true, session.csrfToken))).status, 403);
    }
    const response = await workspaceGet(new NextRequest('http://localhost/api/admin/workspace', { headers: { cookie: `bg_admin_session=${session.token}` } }));
    if (id === 'usr-vendor-001') assert.equal(response.status, 403);
    else {
      assert.equal(response.status, 200);
      const data = await response.json();
      assert.deepEqual(data.vendors, []);
      assert.deepEqual(data.inquiries, []);
      assert.equal(data.moneyMapPnl, null);
      assert.deepEqual(keyPaths(data, ['supplierCostPoisha', 'supplierProfitPoisha', 'supplierPayablePoisha', 'internalVendorSku', 'globalEscrowHoldDays']), []);
    }
  }
});

test('secure reset is random, short lived, replay protected and revokes old sessions', () => {
  const admin = getActorSecurityContext('usr-super-admin')!;
  const created = createAdminUserBySuperAdmin(admin, { username: `reset_${Date.now()}`, displayNameBn: 'Synthetic Reset', displayNameEn: 'Synthetic Reset', roleSlug: 'marketing_manager' });
  assert.ok(created.user && created.oneTimeTempPassword);
  assert.ok(created.oneTimeTempPassword.length >= 32);
  const old = createAdminSession({ ...admin, userId: created.user.userId });
  const rawAdmin = readAdminStore().users.find((u) => u.userId === admin.userId)!;
  const timestampMs = Date.now() + 120_000;
  const code = generateTotpCode(decryptSecretAtRest(rawAdmin.totpSecretEncrypted), timestampMs);
  const input = { targetUserId: created.user.userId, action: 'reset_password' as const, adminTotpCode: code, timestampMs };
  const reset = adminResetUserSecurity(admin, input);
  assert.equal(reset.success, true);
  assert.ok(reset.oneTimeTempPassword && reset.oneTimeTempPassword.length >= 32);
  assert.notEqual(reset.oneTimeTempPassword, created.oneTimeTempPassword);
  assert.equal(verifyAdminSessionToken(old.token), null);
  assert.equal(adminResetUserSecurity(admin, input).success, false);
  const store = readAdminStore();
  store.users.find((u) => u.userId === created.user!.userId)!.temporaryPasswordExpiresAt = new Date(Date.now() - 1).toISOString();
  writeAdminStore(store);
  assert.equal(authenticateAdminUser({ username: created.user.username, password: reset.oneTimeTempPassword }).success, false);
  assert.equal(completeFirstLoginGate({ userId: created.user.userId, currentPassword: reset.oneTimeTempPassword, newPassword: 'SyntheticNewPassword123!', totpCode: '000000' }).success, false);
  const restored = readAdminStore();
  restored.users.find((u) => u.userId === admin.userId)!.lastUsedTotpStep = rawAdmin.lastUsedTotpStep;
  writeAdminStore(restored);
});

test('enrollment sessions cannot access workspace, target another user or bypass enrollment CSRF', async () => {
  const ctx = getActorSecurityContext('usr-super-admin')!;
  const gate = createAdminSession({ ...ctx, purpose: 'enrollment' });
  assert.equal((await workspaceGet(new NextRequest('http://localhost/api/admin/workspace', { headers: { cookie: `bg_admin_session=${gate.token}` } }))).status, 401);
  const body = { action: 'complete_first_login', userId: 'usr-marketing-01', currentPassword: 'SyntheticPassword123', newPassword: 'SyntheticPassword456', totpCode: '000000' };
  assert.equal((await authPost(request('/api/admin/auth', body, gate.token, true, gate.csrfToken))).status, 403);
  assert.equal((await authPost(request('/api/admin/auth', { ...body, userId: ctx.userId }, gate.token, true))).status, 403);
});

test('enrollment HTTP flow rotates its one-use session and never re-enrolls an active user', async () => {
  const admin = getActorSecurityContext('usr-super-admin')!;
  const created = createAdminUserBySuperAdmin(admin, { username: `gate_${Date.now()}`, displayNameBn: 'Synthetic Gate', displayNameEn: 'Synthetic Gate', roleSlug: 'marketing_manager' });
  assert.ok(created.user && created.oneTimeTempPassword);
  const login = await authPost(request('/api/admin/auth', { action: 'login', username: created.user.username, password: created.oneTimeTempPassword }));
  const gate = await login.json();
  assert.equal(login.status, 200);
  assert.ok(gate.sessionToken && gate.csrfToken && gate.totpSetupUri);
  const rawUser = readAdminStore().users.find((u) => u.userId === created.user!.userId)!;
  const body = { action: 'complete_first_login', userId: created.user.userId, currentPassword: created.oneTimeTempPassword, newPassword: 'SyntheticNewPassword123!', totpCode: generateTotpCode(decryptSecretAtRest(rawUser.totpSecretEncrypted)) };
  const complete = await authPost(request('/api/admin/auth', body, gate.sessionToken, true, gate.csrfToken));
  const session = await complete.json();
  assert.equal(complete.status, 200);
  assert.notEqual(session.sessionToken, gate.sessionToken);
  assert.equal(verifyAdminSessionToken(gate.sessionToken), null);
  assert.equal((await authPost(request('/api/admin/auth', body, gate.sessionToken, true, gate.csrfToken))).status, 403);
});

test('expired sessions, forged metadata and sandbox principals fail closed in production', () => {
  const c = customer('01699000103');
  const sessionFile = '.data/erp-security-sessions.json';
  const original = fs.readFileSync(sessionFile, 'utf8');
  const env = process.env as Record<string, string | undefined>;
  const prior = env.NODE_ENV;
  try {
    env.NODE_ENV = 'production';
    assert.equal(verifyCustomerSessionToken(c.token), null);
    assert.equal(verifyCustomerPhoneOtp(c.session.phone, '000000').success, false);
    env.NODE_ENV = 'test';
    const store = JSON.parse(original);
    store.customerSessions.find((s: { sessionId: string }) => s.sessionId === c.session.sessionId).expiresAt = new Date(Date.now() - 1).toISOString();
    fs.writeFileSync(sessionFile, JSON.stringify(store));
    assert.equal(verifyCustomerSessionToken(c.token), null);
    const metadata = Buffer.from(JSON.stringify({ sub: c.session.customerId, user_metadata: { phone: c.session.phone }, role: 'super_admin' })).toString('base64url');
    assert.equal(verifyCustomerSessionToken(`e30.${metadata}.forged`), null);
  } finally {
    if (prior === undefined) delete env.NODE_ENV; else env.NODE_ENV = prior;
    fs.writeFileSync(sessionFile, original);
    revokeCustomerSession(c.token);
  }
});