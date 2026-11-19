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

test('Phase 4A Case 4: Orders Grid One-Click Actions, Today Queue Sync & Immutable Audit Log Recording', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const beforeSnap = getAdminWorkspaceSnapshot('usr-super-admin');
  const beforeAuditCount = beforeSnap.auditLogs?.length ?? 0;

  // Before any new pending submission, ORD-261106-0002's seeded bKash claim is already approved,
  // so verifyBkashCount must match pending manualBkashSubmissions (0).
  const initialPendingClaims = (readErpState().manualBkashSubmissions ?? []).filter(
    (s) => s.status === 'pending_verification' || s.status === 'under_review'
  ).length;
  assert.equal(initialPendingClaims, 0);
  assert.equal(beforeSnap.todayQueues?.verifyBkashCount, initialPendingClaims);

  const order = readErpState().orders.find(order => order.orderNo === 'ORD-261106-0002')!;
  const submission = submitManualBkashPayment({ orderNo: order.orderNo, senderPhone: order.customerPhone,
    trxId: `SYNTHETIC-${Date.now()}`, submittedAmountPoisha: 1000, idempotencyKey: `review-${Date.now()}`,
  });
  assert.equal(submission.success, true);

  // While submission is pending_verification, both counters must increment to 1
  const pendingSnap = getAdminWorkspaceSnapshot('usr-super-admin');
  const pendingClaimsCount = (readErpState().manualBkashSubmissions ?? []).filter(
    (s) => s.status === 'pending_verification' || s.status === 'under_review'
  ).length;
  assert.equal(pendingClaimsCount, 1);
  assert.equal(pendingSnap.todayQueues?.verifyBkashCount, 1);

  const actionRes = executeOrderGridAction(adminCtx, {
    orderNos: ['ORD-261106-0002'], actionType: 'verify_bkash',
    staffNote: 'Synthetic merchant statement and payment amount verified.',
  });
  assert.equal(actionRes.success, true);

  const afterSnap = getAdminWorkspaceSnapshot('usr-super-admin');
  const afterPendingClaimsCount = (readErpState().manualBkashSubmissions ?? []).filter(
    (s) => s.status === 'pending_verification' || s.status === 'under_review'
  ).length;
  assert.equal(afterPendingClaimsCount, 0);
  assert.equal(afterSnap.todayQueues?.verifyBkashCount, 0);

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

test('attach_tracking supports custom courier, editable tracking URL, and atomic ship/out_for_delivery transitions', () => {
  const actor = getActorSecurityContext('usr-super-admin')!;
  const created = createSmartAdminOrder(actor, {
    idempotencyKey: `dispatch-test-${Date.now()}`,
    customerName: 'কাস্টম কুরিয়ার টেস্ট',
    customerPhone: '01718887766',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাড়ি ১২, রোড ৪, মিরপুর ১০',
    landmark: 'গোলচত্বরের পাশে',
    source: 'phone_call',
    deliveryMethod: 'courier',
    paymentMethod: 'cod',
    advancePaidPoisha: 0,
    customerNote: '',
    internalStaffNote: '',
    duplicateOverrideReason: 'Dispatch test',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 1,
      },
    ],
  });
  assert.equal(created.success, true);
  const orderNo = created.orderNo!;

  // Mark synthetic order as not requiring mandatory advance so confirmed -> packed can run
  const stateForPack = readErpState();
  const createdOrd = stateForPack.orders.find((o) => o.orderNo === orderNo)!;
  createdOrd.isAdvanceMandatory = false;
  writeErpState(stateForPack);

  // Move to confirmed -> packed
  assert.equal(
    executeOrderGridAction(actor, {
      orderNos: [orderNo],
      actionType: 'update_status',
      newStatus: 'confirmed',
    }).results[0].ok,
    true
  );
  assert.equal(
    executeOrderGridAction(actor, {
      orderNos: [orderNo],
      actionType: 'update_status',
      newStatus: 'packed',
    }).results[0].ok,
    true
  );

  // Reject unsafe URL
  const unsafeUrlRes = executeOrderGridAction(actor, {
    orderNos: [orderNo],
    actionType: 'attach_tracking',
    courierProvider: 'manual',
    customCourierName: 'সুন্দরবন কুরিয়ার',
    trackingCode: 'SB-1001',
    customTrackingUrl: 'javascript:alert(1)',
    advanceToStatus: 'shipped',
  });
  assert.equal(unsafeUrlRes.results[0].ok, false);

  // Reject custom courier without name
  const missingNameRes = executeOrderGridAction(actor, {
    orderNos: [orderNo],
    actionType: 'attach_tracking',
    courierProvider: 'manual',
    customCourierName: ' ',
    trackingCode: 'SB-1001',
    advanceToStatus: 'shipped',
  });
  assert.equal(missingNameRes.results[0].ok, false);

  // Save custom courier + custom tracking link and atomically advance packed -> shipped
  const shippedRes = executeOrderGridAction(actor, {
    orderNos: [orderNo],
    actionType: 'attach_tracking',
    courierProvider: 'manual',
    customCourierName: 'সুন্দরবন কুরিয়ার',
    trackingCode: 'SB-778899',
    customTrackingUrl: 'https://sundarban.example.com/track/SB-778899',
    advanceToStatus: 'shipped',
  });
  assert.equal(shippedRes.results[0].ok, true);
  let saved = readErpState().orders.find((o) => o.orderNo === orderNo)!;
  assert.equal(saved.status, 'shipped');
  assert.equal(saved.courierProvider, 'manual');
  assert.equal(saved.customCourierName, 'সুন্দরবন কুরিয়ার');
  assert.equal(saved.trackingCode, 'SB-778899');
  assert.equal(saved.customTrackingUrl, 'https://sundarban.example.com/track/SB-778899');

  // Edit tracking link right before Out for Delivery and advance shipped -> out_for_delivery
  const ofdRes = executeOrderGridAction(actor, {
    orderNos: [orderNo],
    actionType: 'attach_tracking',
    courierProvider: 'manual',
    customCourierName: 'এস.এ পরিবহন',
    trackingCode: 'SA-990011',
    customTrackingUrl: 'https://saparibahan.example.com/track/SA-990011',
    advanceToStatus: 'out_for_delivery',
  });
  assert.equal(ofdRes.results[0].ok, true);
  saved = readErpState().orders.find((o) => o.orderNo === orderNo)!;
  assert.equal(saved.status, 'out_for_delivery');
  assert.equal(saved.customCourierName, 'এস.এ পরিবহন');
  assert.equal(saved.trackingCode, 'SA-990011');
  assert.equal(saved.customTrackingUrl, 'https://saparibahan.example.com/track/SA-990011');
});

test('all-stage order editing works on packed, shipped, and advance-paid orders with stage-aware stock reconciliation', async () => {
  const { updateFullOrderDetails } = await import('./phase4a-service');
  const actor = getActorSecurityContext('usr-super-admin')!;
  const created = createSmartAdminOrder(actor, {
    idempotencyKey: `allstage-${Date.now()}`,
    customerName: 'অল-স্টেজ টেস্ট গ্রাহক',
    customerPhone: '01715554433',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাড়ি ৫, রোড ২, ধানমন্ডি',
    landmark: 'রবীন্দ্র সরোবরের পাশে',
    source: 'facebook',
    deliveryMethod: 'courier',
    paymentMethod: 'bkash_manual',
    advancePaidPoisha: 0,
    customerNote: '',
    internalStaffNote: '',
    duplicateOverrideReason: 'All-stage edit test',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 1,
      },
    ],
  });
  assert.equal(created.success, true);
  const orderNo = created.orderNo!;

  // 1) Attach tracking even while order is still pending_confirmation
  const pendingTrack = executeOrderGridAction(actor, {
    orderNos: [orderNo],
    actionType: 'attach_tracking',
    courierProvider: 'steadfast',
    trackingCode: 'SF-PRE-101',
  });
  assert.equal(pendingTrack.results[0].ok, true);

  // 2) Simulate verified advance paid and advance to packed -> shipped
  const state = readErpState();
  const ord = state.orders.find((o) => o.orderNo === orderNo)!;
  const line = state.orderLines.find((l) => l.orderId === ord.id)!;
  ord.isAdvanceMandatory = false;
  ord.advancePaidPoisha = 50000; // ৳500 verified advance
  ord.paymentStatus = 'partial_verified';
  ord.codCollectablePoisha = Math.max(0, ord.totalPayablePoisha - 50000);
  writeErpState(state);

  assert.equal(
    executeOrderGridAction(actor, {
      orderNos: [orderNo],
      actionType: 'update_status',
      newStatus: 'confirmed',
    }).results[0].ok,
    true
  );
  assert.equal(
    executeOrderGridAction(actor, {
      orderNos: [orderNo],
      actionType: 'update_status',
      newStatus: 'packed',
    }).results[0].ok,
    true
  );

  // 3) Edit customer, delivery, custom courier metadata while packed + advance paid
  const packedOrder = readErpState().orders.find((o) => o.orderNo === orderNo)!;
  const packedEdit = updateFullOrderDetails(actor, {
    ...packedOrder,
    customerName: 'আপডেটেড প্যাকড গ্রাহক',
    deliveryChargePoisha: 12000,
    courierProvider: 'manual',
    customCourierName: 'সুন্দরবন কুরিয়ার',
    customTrackingUrl: 'https://sundarban.example.com/t/SF-PRE-101',
    items: [
      {
        variantId: line.variantId,
        quantity: 1,
        unitSalePricePoisha: line.snapUnitSalePricePoisha,
      },
    ],
  });
  assert.equal(packedEdit.success, true);
  assert.equal(packedEdit.order?.customerName, 'আপডেটেড প্যাকড গ্রাহক');
  assert.equal(packedEdit.order?.customCourierName, 'সুন্দরবন কুরিয়ার');
  assert.equal(
    packedEdit.order?.codCollectablePoisha,
    packedEdit.order!.totalPayablePoisha - 50000
  );

  // 4) Ship order and verify post-ship quantity edit adjusts stockOnHand & stockAvailable
  assert.equal(
    executeOrderGridAction(actor, {
      orderNos: [orderNo],
      actionType: 'update_status',
      newStatus: 'shipped',
    }).results[0].ok,
    true
  );
  const beforeShipEdit = readErpState();
  const variantBefore = beforeShipEdit.products
    .flatMap((p) => p.variants)
    .find((v) => v.variantId === line.variantId)!;
  const shippedOrder = beforeShipEdit.orders.find((o) => o.orderNo === orderNo)!;
  const shippedEdit = updateFullOrderDetails(actor, {
    ...shippedOrder,
    items: [
      {
        variantId: line.variantId,
        quantity: 2,
        unitSalePricePoisha: line.snapUnitSalePricePoisha,
      },
    ],
  });
  assert.equal(shippedEdit.success, true);
  const variantAfter = readErpState().products
    .flatMap((p) => p.variants)
    .find((v) => v.variantId === line.variantId)!;
  assert.equal(variantAfter.stockOnHand, variantBefore.stockOnHand - 1);
  assert.equal(variantAfter.stockAvailable, variantBefore.stockAvailable - 1);
  assert.equal(variantAfter.stockReserved, variantBefore.stockReserved);

  // 5) Deliver order and verify tracking can still be corrected post-delivery
  assert.equal(
    executeOrderGridAction(actor, {
      orderNos: [orderNo],
      actionType: 'update_status',
      newStatus: 'delivered',
    }).results[0].ok,
    true
  );
  const deliveredTrack = executeOrderGridAction(actor, {
    orderNos: [orderNo],
    actionType: 'attach_tracking',
    courierProvider: 'manual',
    customCourierName: 'সুন্দরবন কুরিয়ার',
    trackingCode: 'SB-FINAL-999',
  });
  assert.equal(deliveredTrack.results[0].ok, true);
});


