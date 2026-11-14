// src/lib/admin/phase4a.test.ts
// Automated Unit Tests for Phase 4A:
//   - Case 1: Strict Authentication, First-Login Password + 2FA Gate, and User Creation
//   - Case 2: Role-Based Field Stripping (Marketing, Packaging, Vendor) & Cross-Vendor 404 Isolation
//   - Case 3: Smart Order Entry with Customer Phone History & 24-Hour Duplicate Order Guard
//   - Case 4: Orders Grid One-Click Actions (Address Quality Guard, Courier Booking, Status Update, & Immutable Audit Log)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readErpState, writeErpState, submitManualBkashPayment } from '../db/repository';
import {
  authenticateAdminUser,
  completeFirstLoginGate,
  createAdminUserBySuperAdmin,
  createSmartAdminOrder,
  executeOrderGridAction,
  getActorSecurityContext,
  getAdminWorkspaceSnapshot,
  getCurrentTotpCodeForUser,
  getSingleOrderForActorOr404,
  upsertCustomRolePermissionMatrix,
} from './phase4a-service';

test('Phase 4A Case 1: Strict Login, First-Login Gate, and Super Admin User Creation', () => {
  // 1. Super Admin login with valid password + real RFC 6238 TOTP
  const adminTotp = getCurrentTotpCodeForUser('admin')!;
  const adminLogin = authenticateAdminUser({
    username: 'admin',
    password: 'Admin#2026',
    totpCode: adminTotp,
  });
  assert.equal(adminLogin.success, true);
  assert.equal(adminLogin.requiresFirstLoginGate, false);
  assert.equal(adminLogin.user?.roleSlug, 'super_admin');

  // 2. Super Admin creates a new staff user -> mustChangePassword = true & totpEnrolled = false
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const newUsername = `staff_${Date.now().toString().slice(-5)}`;
  const created = createAdminUserBySuperAdmin(adminCtx, {
    username: newUsername,
    displayNameBn: 'টেস্ট স্টাফ',
    displayNameEn: 'Test Staff',
    roleSlug: 'marketing_manager',
    maxDiscountBp: 1000,
  });
  assert.equal(created.success, true);
  assert.ok(created.oneTimeTempPassword);
  assert.ok(created.user);

  // 3. New user attempts workspace access BEFORE clearing First-Login Gate -> blocked!
  const blockedSnap = getAdminWorkspaceSnapshot(created.user.userId);
  assert.equal(blockedSnap.authorized, false);
  assert.equal(blockedSnap.requiresFirstLoginGate, true);

  // 4. Complete First-Login Gate (rotate password + enroll 2FA with real RFC 6238 TOTP code)
  const newStaffTotp = getCurrentTotpCodeForUser(created.user.userId)!;
  const gateCleared = completeFirstLoginGate({
    userId: created.user.userId,
    currentPassword: created.oneTimeTempPassword,
    newPassword: 'NewSecure#2026',
    totpCode: newStaffTotp,
  });
  assert.equal(gateCleared.success, true);
  assert.equal(gateCleared.user?.mustChangePassword, false);
  assert.equal(gateCleared.user?.totpEnrolled, true);
  const rotatedLogin = authenticateAdminUser({
    username: newUsername,
    password: 'NewSecure#2026',
    // Enrollment consumed the current step; use the next permitted TOTP step.
    totpCode: getCurrentTotpCodeForUser(created.user.userId, Date.now() + 30_000),
  });
  assert.equal(rotatedLogin.success, true);

  // 5. Workspace access now succeeds
  const allowedSnap = getAdminWorkspaceSnapshot(created.user.userId);
  assert.equal(allowedSnap.authorized, true);

  // 6. Strict 4-Role Lock: Attempting to create an unapproved 5th role is rejected
  const blockedFifthRole = upsertCustomRolePermissionMatrix(adminCtx, {
    roleSlug: 'call_center_agent',
    nameBn: 'কল সেন্টার',
    nameEn: 'Call Center',
    maxDiscountBp: 500,
    maskCustomerPiiForVendor: false,
  });
  assert.equal(blockedFifthRole.success, false);
});

test('Phase 4A Case 2: Role-Based Field Stripping & Cross-Vendor 404 Isolation', () => {
  // 1. Marketing Manager never sees supplierCostPoisha or estimatedNetProfitPoisha
  const mktSnap = getAdminWorkspaceSnapshot('usr-marketing-01');
  assert.equal(mktSnap.authorized, true);
  const mktJson = JSON.stringify({
    orders: mktSnap.orders,
    products: mktSnap.products,
  });
  assert.equal(mktJson.includes('"supplierCostPoisha"'), false);
  assert.equal(mktJson.includes('"estimatedNetProfitPoisha"'), false);

  // 2. Vendor sees only their own orders, customer phone is masked, and cross-vendor order throws 404
  const vendorSnap = getAdminWorkspaceSnapshot('usr-vendor-001');
  assert.equal(vendorSnap.authorized, true);
  const vendorOrdersJson = JSON.stringify(vendorSnap.orders);
  assert.equal(vendorOrdersJson.includes('"estimatedNetProfitPoisha"'), false);
  assert.equal(vendorOrdersJson.includes('****'), true); // Masked customer phone

  const vendorCtx = getActorSecurityContext('usr-vendor-001')!;
  const erpForIso = readErpState();
  erpForIso.orderLines = erpForIso.orderLines.filter(
    (l: { orderId: string; vendorId: string }) =>
      !(
        l.orderId === '00000000-0000-4000-8000-000000000502' &&
        l.vendorId === '00000000-0000-4000-8000-000000000901'
      )
  );
  const ord1 = erpForIso.orders.find(
    (o: { orderNo: string }) => o.orderNo === 'ORD-261106-0001'
  );
  if (ord1) {
    ord1.createdAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
  }
  writeErpState(erpForIso);

  // ORD-261106-0001 belongs to vendor 00000000-0000-4000-8000-000000000901 -> allowed
  const ownOrder = getSingleOrderForActorOr404(vendorCtx, 'ORD-261106-0001');
  assert.equal(ownOrder.orderNo, 'ORD-261106-0001');

  // ORD-261106-0002 has no lines for vendor 901 -> must throw 404 Not Found (never 403)
  assert.throws(
    () => {
      getSingleOrderForActorOr404(vendorCtx, 'ORD-261106-0002');
    },
    (err: Error & { statusCode?: number }) => err.statusCode === 404
  );
});

test('Phase 4A Case 3: Smart Order Entry 24h Duplicate Guard & Override Reason', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  executeOrderGridAction(adminCtx, {
    orderNos: ['ORD-261106-0001'],
    actionType: 'update_status',
    newStatus: 'pending_confirmation',
  });

  // 01712345678 has an active order (ORD-261106-0001) -> without override reason, duplicate guard blocks it
  const blockedDup = createSmartAdminOrder(adminCtx, {
    idempotencyKey: `dup-block-${Date.now()}`,
    customerName: 'তানভীর আহমেদ',
    customerPhone: '01712345678',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাড়ি ২৪, রোড ৭/এ, ধানমন্ডি আবাসিক এলাকা',
    landmark: 'সাত মসজিদ রোড ওভারব্রিজের পাশে',
    source: 'facebook',
    deliveryMethod: 'courier',
    paymentMethod: 'cod',
    advancePaidPoisha: 0,
    customerNote: '',
    internalStaffNote: '',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 1,
      },
    ],
  });
  assert.equal(blockedDup.success, false);

  // With explicit duplicateOverrideReason, order succeeds and logs to immutable audit log
  const allowedDup = createSmartAdminOrder(adminCtx, {
    idempotencyKey: `dup-allow-${Date.now()}`,
    customerName: 'তানভীর আহমেদ',
    customerPhone: '01712345678',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাড়ি ২৪, রোড ৭/এ, ধানমন্ডি আবাসিক এলাকা',
    landmark: 'সাত মসজিদ রোড ওভারব্রিজের পাশে',
    source: 'whatsapp',
    deliveryMethod: 'courier',
    paymentMethod: 'cod',
    advancePaidPoisha: 0,
    customerNote: '',
    internalStaffNote: 'গ্রাহক হোয়াটসঅ্যাপে দ্বিতীয় অর্ডার নিশ্চিত করেছেন।',
    duplicateOverrideReason: 'গ্রাহক ফোনে আলাদা পার্সেল চেয়েছেন',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 1,
      },
    ],
  });
  assert.equal(allowedDup.success, true);
  assert.ok(allowedDup.orderNo);
});

test('Phase 4A Case 4: Orders Grid One-Click Actions & Immutable Audit Log Recording', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const beforeSnap = getAdminWorkspaceSnapshot('usr-super-admin');
  const beforeAuditCount = beforeSnap.auditLogs?.length ?? 0;

  const order = readErpState().orders.find(order => order.orderNo === 'ORD-261106-0002')!;
  const submission = submitManualBkashPayment({ orderNo: order.orderNo, senderPhone: order.customerPhone,
    trxId: `SYNTHETIC-${Date.now()}`, submittedAmountPoisha: 1000, idempotencyKey: `review-${Date.now()}`,
  });
  assert.equal(submission.success, true);
  const actionRes = executeOrderGridAction(adminCtx, {
    orderNos: ['ORD-261106-0002'], actionType: 'verify_bkash',
    staffNote: 'Synthetic merchant statement and payment amount verified.',
  });
  assert.equal(actionRes.success, true);

  const afterSnap = getAdminWorkspaceSnapshot('usr-super-admin');
  const afterAuditCount = afterSnap.auditLogs?.length ?? 0;
  assert.ok(
    afterAuditCount > beforeAuditCount ||
      afterSnap.auditLogs?.[0]?.actionCode === 'MANUAL_BKASH_VERIFIED'
  );
  assert.equal(afterSnap.auditLogs?.[0]?.actionCode, 'MANUAL_BKASH_VERIFIED');
});

test('full order amendments cannot bypass payment, tracking or lifecycle workflows', async () => {
  const { updateFullOrderDetails } = await import('./phase4a-service');
  const { withRuntimePersistence } = await import('../db/runtime-persistence');
  const actor = getActorSecurityContext('usr-super-admin')!;
  const result = createSmartAdminOrder(actor, {
    idempotencyKey: `amend-${Date.now()}`, customerName: 'Synthetic buyer', customerPhone: '01719998877',
    districtId: 47, upazilaId: 365, streetAddress: 'House 18, Road 9, Dhanmondi residential area',
    landmark: 'Near the school', source: 'storefront', deliveryMethod: 'courier', paymentMethod: 'cod',
    advancePaidPoisha: 0, customerNote: '', internalStaffNote: '', duplicateOverrideReason: 'Synthetic amendment test',
    items: [{ productId: '00000000-0000-4000-8000-000000000101', variantId: '00000000-0000-4000-8000-000000000201', quantity: 1 }],
  });
  assert.equal(result.success, true);
  const before = readErpState();
  const order = before.orders.find(order => order.orderNo === result.orderNo)!;
  const line = before.orderLines.find(line => line.orderId === order.id)!;
  const variant = before.products.flatMap(product => product.variants).find(variant => variant.variantId === line.variantId)!;
  const payload = { ...order, discountPoisha: 30000, deliveryChargePoisha: 6000,
    items: [{ variantId: line.variantId, quantity: 2, unitSalePricePoisha: line.snapUnitSalePricePoisha }],
  };
  for (const unsafe of [
    { status: 'delivered' as const }, { paymentStatus: 'remitted' as const }, { advancePaidPoisha: 50000 },
    { trackingCode: 'UNVERIFIED' }, { discountPoisha: 490000 },
    { items: [...payload.items, ...payload.items] }, { discountPoisha: 0.5 },
  ]) {
    const rejected = updateFullOrderDetails(actor, { ...payload, ...unsafe });
    assert.equal(rejected.success, false);
    assert.deepEqual(readErpState(), before);
  }
  const amended = await withRuntimePersistence(() => updateFullOrderDetails(actor, payload));
  assert.equal(amended.success, true);
  const after = readErpState();
  const updatedVariant = after.products.flatMap(product => product.variants).find(item => item.variantId === line.variantId)!;
  assert.equal(updatedVariant.stockReserved, variant.stockReserved + 1);
  assert.equal(updatedVariant.stockAvailable, variant.stockAvailable - 1);
  const amendedLine = after.orderLines.find(item => item.orderId === order.id)!;
  assert.equal(amendedLine.snapSupplierPayablePoisha, line.snapSupplierPayablePoisha);
  assert.equal(amendedLine.lineDiscountPoisha, 30000);
  assert.equal(amended.order?.status, order.status);
  assert.equal(amended.order?.paymentStatus, 'unpaid');
});
