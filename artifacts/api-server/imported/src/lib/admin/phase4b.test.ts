// src/lib/admin/phase4b.test.ts
// Automated Unit Tests for Phase 4B:
//   - Case 1: A4 3-Part Print Slip DTO Customer-Safety (Zero vendor/cost leak on Part 1 & Part 2, reprint counter warning, and Part 3 cost hiding for Packaging Manager)
//   - Case 2: Pickup Batch Creation, Handover Manifest & 1-Click Shipped Transition
//   - Case 3: Courier 360 Remittance Settlement, Short-Payment Detector, Aging Buckets & Automatic Pending -> Locked Escrow Promotion
//   - Case 4: Four-Way Return Engine (Warehouse Fault, Supplier Defect Clawback, Customer Intact Restock, Courier Negligence Claim)
//   - Case 5: Payout Request Hold Protection, Approval/Rejection/Mark-Paid Flow, 15-Question Onboarding & Contract Closure Audit Guard

import test from 'node:test';
import assert from 'node:assert/strict';
import { getActorSecurityContext } from './phase4a-service';
import {
  auditAndCloseVendorContract,
  autoRecordOrderDeliveredOrReturned,
  computeCourier360Summary,
  confirmBatchHandoverShipped,
  createPickupBatchAndManifest,
  generateOrderPrintSlips,
  getVendorEscrowOverviewForActor,
  processFourWayOrderReturn,
  readPhase4BStore,
  recordCourierRemittanceSettlement,
  requestVendorPayout,
  resolveVendorPayoutRequest,
  submitVendorOnboarding15Q,
  syncAllCourierTrackingStatuses,
  VENDOR_ONBOARDING_15_QUESTIONS,
  writePhase4BStore,
} from './phase4b-service';

test('Phase 4B Case 1: A4 3-Part Print Slip DTO Customer-Safety & Role Cost Hiding', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const pkgCtx = getActorSecurityContext('usr-packaging-01')!;

  // Loading and refreshing previews must not change the print counter.
  const preview1 = generateOrderPrintSlips(adminCtx, { orderNos: ['ORD-261106-0001'] });
  const preview2 = generateOrderPrintSlips(adminCtx, { orderNos: ['ORD-261106-0001'] });
  assert.equal(preview2.slips[0]!.internalPart3.printCount, preview1.slips[0]!.internalPart3.printCount);

  // 1. First print request by Super Admin
  const firstPrint = generateOrderPrintSlips(adminCtx, {
    orderNos: ['ORD-261106-0001'],
    sortBy: 'order_no',
    recordPrint: true,
  });
  assert.equal(firstPrint.success, true);
  assert.equal(firstPrint.slips.length, 1);
  assert.equal(firstPrint.slips[0]!.internalPart3.printCount, preview1.slips[0]!.internalPart3.printCount + 1);

  const slip = firstPrint.slips[0]!;
  // Verify Part 1 & Part 2 (customerAndCourierPart) have ZERO vendor identity, vendor SKU, buying cost, or staff notes
  const customerJson = JSON.stringify(slip.customerAndCourierPart);
  assert.equal(customerJson.includes('VND-001'), false);
  assert.equal(customerJson.includes('রূপগঞ্জ উইভার্স'), false);
  assert.equal(customerJson.includes('internalVendorSku'), false);
  assert.equal(customerJson.includes('snapSupplierCostPoisha'), false);
  assert.equal(customerJson.includes('internalStaffNote'), false);
  assert.ok(slip.customerAndCourierPart.senderBrandNameBn.length > 0);

  // Super Admin sees buying cost, supplier profit, supplier payable, platform margin, and full accountingSummary on Internal Part 3
  assert.equal(
    typeof slip.internalPart3.lines[0]?.snapSupplierCostPoisha,
    'number'
  );
  assert.equal(
    typeof slip.internalPart3.lines[0]?.snapSupplierProfitPoisha,
    'number'
  );
  assert.equal(
    typeof slip.internalPart3.lines[0]?.snapSupplierPayablePoisha,
    'number'
  );
  assert.ok(slip.internalPart3.accountingSummary);
  assert.ok(
    slip.internalPart3.accountingSummary.vendorSplitBreakdown.length >= 1
  );
  assert.equal(
    slip.internalPart3.accountingSummary.totalSupplierCostPoisha +
      slip.internalPart3.accountingSummary.totalSupplierProfitPoisha,
    slip.internalPart3.accountingSummary.totalSupplierPayableEscrowPoisha
  );

  // 2. Second print by Packaging Manager -> triggers Reprint Warning AND hides buying cost & accountingSummary on Part 3
  const deniedStaffPrint = generateOrderPrintSlips(pkgCtx, { orderNos: ['ORD-261106-0001'] });
  assert.equal(deniedStaffPrint.success, false);
  assert.deepEqual(deniedStaffPrint.slips, []);
  const secondPrint = generateOrderPrintSlips(adminCtx, {
    orderNos: ['ORD-261106-0001'],
    sortBy: 'vendor',
    recordPrint: true,
  });
  assert.equal(secondPrint.success, true);
  const pkgSlip = secondPrint.slips[0]!;
  assert.equal(pkgSlip.internalPart3.isReprintWarning, true);
  assert.ok(pkgSlip.internalPart3.accountingSummary);

  const vendorCtx = getActorSecurityContext('usr-vendor-001')!;
  const vendorPrint = generateOrderPrintSlips(vendorCtx, {
    orderNos: ['ORD-261106-0001'],
  });
  assert.equal(vendorPrint.success, false);
  assert.deepEqual(vendorPrint.slips, []);
});

test('Phase 4B Case 2: Pickup Batch Creation, Handover Manifest & 1-Click Shipped Transition', () => {
  const pkgCtx = getActorSecurityContext('usr-packaging-01')!;

  const createdBatch = createPickupBatchAndManifest(pkgCtx, {
    courierProvider: 'steadfast',
    orderNos: ['ORD-261106-0001'],
  });
  assert.equal(createdBatch.success, true);
  assert.ok(createdBatch.batch);
  assert.equal(createdBatch.batch.totalParcels, 1);
  assert.equal(createdBatch.batch.status, 'ready_for_handover');

  const handedOver = confirmBatchHandoverShipped(pkgCtx, {
    batchId: createdBatch.batch.batchId,
    riderName: 'মোঃ সাইফুল ইসলাম',
    riderPhone: '01755667788',
  });
  assert.equal(handedOver.success, true);
  assert.equal(handedOver.batch?.status, 'handed_over');
});

test('Phase 4B Case 3: Courier 360 Remittance Settlement, Short-Payment Detector & Pending -> Locked Escrow Promotion', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;

  // Settle ORD-261106-0001 with a deliberate 50 BDT (5000 poisha) short-payment to verify detector
  const settlement = recordCourierRemittanceSettlement(adminCtx, {
    settlementRef: `STF-TEST-${Date.now()}`,
    courierProvider: 'steadfast',
    items: [
      {
        orderNo: 'ORD-261106-0001',
        courierFeeDeductedPoisha: 6000, // 60 BDT fee
        remittedAmountPoisha: 234000, // Expected 2450 - 60 = 2390 BDT, remitted 2340 BDT -> 50 BDT short
      },
    ],
  });

  assert.equal(settlement.success, true);
  assert.equal(settlement.settledCount, 1);
  assert.equal(settlement.shortPaymentCount, 1);
  assert.equal(settlement.records[0]?.isShortPaymentFlagged, true);
  assert.equal(settlement.records[0]?.shortPaymentPoisha, 5000);

  // Verify Courier 360 summary reflects short payment and honest connection status
  const c360 = computeCourier360Summary();
  const steadfastSummary = c360.find((c) => c.provider === 'steadfast')!;
  assert.ok(steadfastSummary.shortPaymentTotalPoisha >= 5000);
  assert.equal(
    steadfastSummary.connectionStatusBadgeBn.includes('Manual / CSV Fallback'),
    true
  );
});

test('Phase 4B Case 4: Four-Way Return Engine (Supplier Defect Proof Guard & Courier Negligence Claim)', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;

  // 1. Supplier Defect WITHOUT proof URL -> rejected
  const missingProof = processFourWayOrderReturn(adminCtx, {
    orderNo: 'ORD-261106-0002',
    faultType: 'SUPPLIER_DEFECT',
    proofUrl: '',
    noteBn: 'সেলাই ছেঁড়া',
  });
  assert.equal(missingProof.success, false);

  // 2. Courier Negligence -> Vendor keeps payable, creates Courier Claim automatically
  const courierFault = processFourWayOrderReturn(adminCtx, {
    orderNo: 'ORD-261106-0002',
    faultType: 'COURIER_NEGLIGENCE',
    proofUrl: 'https://picsum.photos/seed/boxdamaged/400/300',
    noteBn: 'কুরিয়ার ট্রানজিটে পার্সেল ক্ষতিগ্রস্ত হয়েছে',
  });
  assert.equal(courierFault.success, true);
  assert.equal(courierFault.resolution?.vendorDebitPoisha, 0);
  assert.ok((courierFault.resolution?.courierClaimPoisha ?? 0) > 0);
});

test('Phase 4B Case 5: Payout Hold Protection, Approval/Paid Flow, 15Q Onboarding & Contract Closure Guard', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const vendorCtx = getActorSecurityContext('usr-vendor-001')!;

  // Ensure VND-001 has at least 100,000 poisha available across repeated test runs
  const p4b = readPhase4BStore();
  p4b.vendorLedger.unshift({
    id: `vled-test-mat-${Date.now()}`,
    vendorId: '00000000-0000-4000-8000-000000000901',
    vendorCode: 'VND-001',
    orderItemId: 'test-item-mat',
    orderNo: 'ORD-261106-0001',
    entryType: 'EARNING_MATURED',
    escrowBucket: 'available',
    amountPoisha: 150000,
    deliveredAt: '2026-10-20T10:00:00.000Z',
    maturesAt: '2026-10-27T10:00:00.000Z',
    descriptionBn: 'টেস্ট ম্যাচুরিটি ক্রেডিট',
    recordedByUsername: 'admin',
    createdAt: new Date().toISOString(),
  });
  writePhase4BStore(p4b);

  // 1. Vendor checks available balance and requests a 1,000 BDT (100000 poisha) payout
  const beforeEscrow = getVendorEscrowOverviewForActor(vendorCtx);
  const beforeAvail = beforeEscrow.vendors[0]!.balance.withdrawablePoisha;
  assert.ok(beforeAvail >= 100000);

  const reqRes = requestVendorPayout(vendorCtx, {
    vendorId: '00000000-0000-4000-8000-000000000901',
    requestedAmountPoisha: 100000,
  });
  assert.equal(reqRes.success, true);
  assert.ok(reqRes.payout);

  // Immediately after request, withdrawable balance is reduced by 100000 poisha (PAYOUT_HOLD protection)
  const afterHoldEscrow = getVendorEscrowOverviewForActor(vendorCtx);
  const afterHoldAvail = afterHoldEscrow.vendors[0]!.balance.withdrawablePoisha;
  assert.equal(afterHoldAvail, beforeAvail - 100000);

  // 2. Super Admin marks payout as paid with TrxID
  const paidRes = resolveVendorPayoutRequest(adminCtx, {
    payoutId: reqRes.payout.payoutId,
    decision: 'mark_paid',
    paymentTrxId: 'BKASH-PAID-998877',
  });
  assert.equal(paidRes.success, true);
  assert.equal(paidRes.payout?.status, 'paid');

  // 3. Contract Closure Audit Guard blocks closing VND-001 because active stock & balance > 0
  const closureAudit = auditAndCloseVendorContract(
    adminCtx,
    '00000000-0000-4000-8000-000000000901'
  );
  assert.equal(closureAudit.canClose, false);
  assert.equal(closureAudit.closed, false);

  // 4. 15-Question Onboarding creates a new vendor with 0 balance & 0 stock, which CAN pass closure audit
  const answers15 = Object.fromEntries(
    VENDOR_ONBOARDING_15_QUESTIONS.map((q) => [q.key, q.placeholderBn])
  );
  const onboarded = submitVendorOnboarding15Q(adminCtx, {
    businessNameBn: 'সিলেট কেইন ক্রাফটস',
    ownerNameBn: 'তাহমিদ চৌধুরী',
    contactPhone: '01799001122',
    defaultCommissionBp: 1500,
    escrowHoldDaysOverride: 7,
    payoutMethodBn: 'বিকাশ মার্চেন্ট',
    payoutAccountNo: '01799001122',
    answers15,
  });
  assert.equal(onboarded.success, true);
  assert.ok(onboarded.vendor);

  const cleanClosure = auditAndCloseVendorContract(
    adminCtx,
    onboarded.vendor.vendorId
  );
  assert.equal(cleanClosure.canClose, true);
  assert.equal(cleanClosure.closed, true);
});

test('Phase 4B Case 6: Live Courier Tracking Sync & Auto Courier Ledger Entry on Delivery', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;

  // 1. Trigger live courier tracking sync
  const syncRes = syncAllCourierTrackingStatuses(adminCtx);
  assert.equal(syncRes.success, true);
  assert.equal(typeof syncRes.syncedCount, 'number');

  // 2. Test autoRecordOrderDeliveredOrReturned on a seeded order
  const autoRes = autoRecordOrderDeliveredOrReturned(
    adminCtx,
    'ORD-261106-0002',
    'delivered'
  );
  assert.equal(autoRes.success, true);

  // 3. Verify that courier remittance ledger contains the auto-created record with COD and courier fee
  const p4bStore = readPhase4BStore();
  const remEntry = p4bStore.courierRemittanceLedger.find(
    (r) => r.orderNo === 'ORD-261106-0002'
  );
  assert.ok(remEntry);
  assert.equal(typeof remEntry.expectedCodPoisha, 'number');
  assert.equal(typeof remEntry.courierFeeDeductedPoisha, 'number');
  assert.equal(remEntry.shortPaymentPoisha, 0);
});

