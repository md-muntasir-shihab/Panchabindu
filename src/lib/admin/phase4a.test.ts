// src/lib/admin/phase4a.test.ts
// Automated Unit Tests for Phase 4A:
//   - Case 1: Strict Authentication, First-Login Password + 2FA Gate, and User Creation
//   - Case 2: Role-Based Field Stripping (Marketing, Packaging, Vendor) & Cross-Vendor 404 Isolation
//   - Case 3: Smart Order Entry with Customer Phone History & 24-Hour Duplicate Order Guard
//   - Case 4: Orders Grid One-Click Actions (Address Quality Guard, Courier Booking, Status Update, & Immutable Audit Log)

import test from 'node:test';
import assert from 'node:assert/strict';
import { readErpState, writeErpState } from '../db/repository';
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

  const actionRes = executeOrderGridAction(adminCtx, {
    orderNos: ['ORD-261106-0002'],
    actionType: 'verify_bkash',
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

test('Phase 4A Case 5: Full Order Master Editor (Customer, Address, Items, Discount, Manual Courier Tracking & Call Confirmation)', async () => {
  const { updateFullOrderDetails } = await import('./phase4a-service');
  const { getLiveCourierTrackingUrl } = await import('../courier/tracking-urls');
  const adminCtx = getActorSecurityContext('usr-super-admin')!;

  // Ensure ORD-261106-0001 stays at its seed 245,000 poisha COD for Phase 4B tests
  updateFullOrderDetails(adminCtx, {
    orderNo: 'ORD-261106-0001',
    customerName: 'তানভীর আহমেদ',
    customerPhone: '01712345678',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাড়ি ২৪, রোড ৭/এ, ধানমন্ডি আবাসিক এলাকা',
    landmark: 'সাত মসজিদ রোড ওভারব্রিজের পাশে',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 1,
        unitSalePricePoisha: 239000,
      },
    ],
    discountPoisha: 0,
    deliveryChargePoisha: 6000,
    advancePaidPoisha: 0,
    paymentMethod: 'cod',
    paymentStatus: 'unpaid',
    courierProvider: 'steadfast',
    consignmentId: 'CNS-ORD-0001',
    trackingCode: 'SF-BD-990011',
    status: 'pending_confirmation',
    source: 'storefront',
  });

  // Create a dedicated order to test full master editing
  const createdForEdit = createSmartAdminOrder(adminCtx, {
    idempotencyKey: `edit-test-${Date.now()}`,
    customerName: 'আরিফুল ইসলাম',
    customerPhone: '01719998877',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাড়ি ১৮, রোড ৯/এ, ধানমন্ডি আবাসিক এলাকা',
    landmark: 'স্কুলের পাশে',
    source: 'storefront',
    deliveryMethod: 'courier',
    paymentMethod: 'cod',
    advancePaidPoisha: 0,
    customerNote: '',
    internalStaffNote: '',
    duplicateOverrideReason: 'এডিট টেস্ট অর্ডার',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 1,
      },
    ],
  });
  assert.equal(createdForEdit.success, true);
  const targetOrderNo = createdForEdit.orderNo!;

  const updateRes = updateFullOrderDetails(adminCtx, {
    orderNo: targetOrderNo,
    customerName: 'আরিফুল ইসলাম (ভিআইপি)',
    customerPhone: '01719998877',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাড়ি ১৮, রোড ৯/এ, ধানমন্ডি আবাসিক এলাকা (তৃতীয় তলা)',
    landmark: 'সাত মসজিদ রোড ওভারব্রিজের পাশে',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 2,
        unitSalePricePoisha: 245000, // 2,450 BDT * 2 = 4,900 BDT (490,000 poisha)
      },
    ],
    discountPoisha: 30000, // 300 BDT discount
    deliveryChargePoisha: 6000, // 60 BDT delivery
    advancePaidPoisha: 50000, // 500 BDT advance
    paymentMethod: 'cod',
    paymentStatus: 'partial_verified',
    manualPaymentTrxId: 'BK-998877',
    courierProvider: 'steadfast',
    consignmentId: 'CNS-SF-9090',
    trackingCode: 'SF-TRACK-778899',
    status: 'confirmed',
    source: 'phone_call',
    callStatus: 'confirmed_yes',
    callStatusNote: 'গ্রাহক ফোনে ২ পিস নিশ্চিত করেছেন এবং ৩০০ টাকা ডিসকাউন্ট দেওয়া হয়েছে।',
    internalStaffNote: 'দ্রুত প্যাকিং করতে হবে।',
  });

  assert.equal(updateRes.success, true);
  assert.equal(updateRes.order?.subtotalPoisha, 490000);
  assert.equal(updateRes.order?.discountPoisha, 30000);
  assert.equal(updateRes.order?.deliveryChargePoisha, 6000);
  // Total = 490,000 - 30,000 + 6,000 = 466,000 poisha
  assert.equal(updateRes.order?.totalPayablePoisha, 466000);
  // COD Collectable = 466,000 - 50,000 = 416,000 poisha
  assert.equal(updateRes.order?.codCollectablePoisha, 416000);
  assert.equal(updateRes.order?.courierProvider, 'steadfast');
  assert.equal(updateRes.order?.trackingCode, 'SF-TRACK-778899');
  assert.equal(updateRes.order?.status, 'confirmed');

  const liveUrl = getLiveCourierTrackingUrl(
    'steadfast',
    'SF-TRACK-778899',
    'CNS-SF-9090',
    targetOrderNo
  );
  assert.equal(liveUrl, 'https://steadfast.com.bd/t/SF-TRACK-778899');
});
