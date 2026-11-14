// src/lib/admin/phase6.test.ts
// Automated Unit Tests for Phase 6 (Module S):
//   - Case 1: Abandoned Cart Reminder & 1-Click Conversion to Confirmed Order + Customer 360 Fraud Score Directory
//   - Case 2: Live Courier Webhook Receiver (HMAC-SHA256) & Bulk CSV Booking / Remittance Reconciliation
//   - Case 3: Verified-Purchase Product Review Moderation & Consignment Vendor Performance Scorecard
//   - Case 4: Full System Disaster Recovery Snapshot (SHA-256 Checksum) & Role Isolation

import test from 'node:test';
import assert from 'node:assert/strict';
import { getActorSecurityContext } from './phase4a-service';
import { readErpState } from '../db/repository';
import { readPhase4BStore } from './phase4b-service';
import {
  computeCustomer360Directory,
  computeVendorPerformanceScorecards,
  computeWebhookHmacSignature,
  generateBulkCourierBookingCsv,
  generateSystemBackupSnapshot,
  getModeratedReviewsList,
  getPhase6WorkspaceOverview,
  moderateProductReview,
  parseAndReconcileCourierRemittanceCsv,
  processCourierWebhookPayload,
  readPhase6Store,
  recordAbandonedCartReminderSent,
  recoverAbandonedCartToOrder,
  writePhase6Store,
} from './phase6-service';

test('Phase 6 Case 1: Abandoned Cart Recovery (wa.me Reminder & 1-Click Order Conversion) & Customer 360 CRM', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const p6 = readPhase6Store();
  const targetCart = p6.abandonedCarts[0];
  assert.ok(targetCart);

  // Ensure idempotency across repeated test runs
  if (targetCart.isRecovered) {
    targetCart.isRecovered = false;
    targetCart.recoveredOrderNo = null;
    writePhase6Store(p6);
  }

  const remRes = recordAbandonedCartReminderSent(
    adminCtx,
    targetCart.cartId,
    'wa_me'
  );
  assert.equal(remRes.success, true);
  assert.ok((remRes.cart?.reminderSentCount ?? 0) >= 1);

  const recRes = recoverAbandonedCartToOrder(adminCtx, targetCart.cartId);
  assert.equal(recRes.success, true);
  assert.ok(recRes.orderNo);
  assert.equal(recRes.cart?.isRecovered, true);

  const customers360 = computeCustomer360Directory();
  assert.ok(customers360.length >= 2);
  for (const c of customers360) {
    assert.ok(Number.isInteger(c.lifetimeSpendPoisha));
    assert.ok(c.fraudScore >= 0 && c.fraudScore <= 100);
    assert.ok(c.deliverySuccessRateBp >= 0 && c.deliverySuccessRateBp <= 10000);
  }
});

test('Phase 6 Case 2: Live Courier Webhook Receiver (HMAC-SHA256) & Bulk CSV Booking / Remittance Reconciliation', async () => {
  const { updateFullOrderDetails } = await import('./phase4a-service');
  const adminCtx = getActorSecurityContext('usr-super-admin')!;

  const sampleBody = JSON.stringify({
    provider: 'steadfast',
    orderNo: 'ORD-261106-0002',
    rawStatus: 'delivered',
  });
  const sig = computeWebhookHmacSignature(sampleBody, 'test-webhook-secret');
  assert.equal(sig.length, 64);

  const ordersBefore = structuredClone(readErpState());
  readPhase4BStore(); // initialize optional legacy fields before taking the snapshot
  const financeBefore = structuredClone(readPhase4BStore());
  const webhookBefore = structuredClone(readPhase6Store());
  const whRes = processCourierWebhookPayload(adminCtx, {
    provider: 'steadfast',
    orderNo: 'ORD-261106-0002',
    rawStatus: 'delivered',
    signatureHeader: sig,
  });
  assert.equal(whRes.success, false);
  assert.equal(whRes.code, 'NOT_INTEGRATED');

  const bookingCsv = generateBulkCourierBookingCsv();
  assert.ok(bookingCsv.includes('Invoice,Recipient_Name,Recipient_Phone'));
  assert.ok(bookingCsv.includes('ORD-261106-0001'));

  const reconRes = parseAndReconcileCourierRemittanceCsv(adminCtx, {
    provider: 'steadfast',
    settlementBatchRef: 'STF-TEST-BATCH-01',
    csvText:
      'order_no,consignment_id,remitted_bdt,courier_fee_bdt\nORD-261106-0001,CNS-ORD-261106-0001,2300,70',
  });
  assert.equal(reconRes.success, false);
  assert.equal(reconRes.result, undefined);
  assert.deepEqual(readErpState(), ordersBefore);
  assert.deepEqual(readPhase4BStore(), financeBefore);
  assert.deepEqual(readPhase6Store(), webhookBefore);

  // Restore ORD-261106-0001 to pending_confirmation so repeated runs of phase4a duplicate guard stay clean
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
});

test('Phase 6 Case 3: Verified-Purchase Product Review Moderation & Consignment Vendor Scorecard', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const reviews = getModeratedReviewsList();
  assert.ok(reviews.length >= 1);

  const firstReview = reviews[0]!;
  const modRes = moderateProductReview(adminCtx, {
    reviewId: firstReview.reviewId,
    decision: 'approved',
  });
  assert.equal(modRes.success, true);

  const scorecards = computeVendorPerformanceScorecards();
  assert.ok(scorecards.length >= 2);
  for (const sc of scorecards) {
    assert.ok(Number.isInteger(sc.grossSalesPoisha));
    assert.ok(Number.isInteger(sc.netVendorPayablePoisha));
    assert.ok(['A+', 'A', 'B', 'C'].includes(sc.slaGrade));
  }
});

test('Phase 6 Case 4: Full System Disaster Recovery Snapshot (SHA-256 Checksum) & Role Isolation', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const vendorCtx = getActorSecurityContext('usr-vendor-001')!;

  const vendorBlocked = generateSystemBackupSnapshot(vendorCtx);
  assert.equal(vendorBlocked.success, false);

  const snapRes = generateSystemBackupSnapshot(adminCtx);
  assert.equal(snapRes.success, true);
  assert.ok(snapRes.snapshot);
  assert.equal(snapRes.snapshot.sha256Checksum.length, 64);

  const vendorOverview = getPhase6WorkspaceOverview(vendorCtx);
  assert.equal(vendorOverview.abandonedCarts.length, 0);
  assert.equal(vendorOverview.backupSnapshots.length, 0);
  assert.ok(
    vendorOverview.vendorScorecards.every(
      (s) => s.vendorId === vendorCtx.vendorId
    )
  );
});
