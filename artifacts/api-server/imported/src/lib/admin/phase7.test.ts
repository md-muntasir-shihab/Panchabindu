// src/lib/admin/phase7.test.ts
// Automated Unit Tests for Phase 7 (Module T):
//   - Case 1: Self-Service Consignment Stock Dispatch Lot Submission & Warehouse QC Approval (Stock Increment)
//   - Case 2: Vendor Cost/Retail Price Proposal & 3-Tier Consignment Split Recalculation
//   - Case 3: Margin-Safe Flash Campaign Guard (Supplier Payable Untouched) & Escrow Maturity Promoter
//   - Case 4: Executive BDT Double-Entry Accounting, 5% VAT on Margin & Strict Role Isolation

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getActorSecurityContext,
  getCurrentTotpCodeForUser,
  readAdminStore,
  writeAdminStore,
} from './phase4a-service';
import {
  allocateSupplierOfferForVariant,
  computeExecutiveAccountingSummary,
  createLedgerReversalRequest,
  createMarginSafeFlashCampaign,
  executeCustomerRefundWorkflow,
  getPhase7WorkspaceOverview,
  promoteMaturedEscrowEntriesBatch,
  resolveLedgerReversalRequest,
  resolveVendorPriceProposal,
  reviewConsignmentDispatchLot,
  splitOrderIntoVendorFulfillmentGroups,
  submitConsignmentDispatchLot,
  submitVendorPriceProposal,
  upsertSupplierProductOffer,
} from './phase7-service';
import { readErpState } from '../db/repository';

test('Phase 7 Case 1: Self-Service Consignment Stock Dispatch Lot & Warehouse QC Approval', () => {
  const vendorCtx = getActorSecurityContext('usr-vendor-001')!;
  const adminCtx = getActorSecurityContext('usr-super-admin')!;

  const beforeErp = readErpState();
  const targetVar = beforeErp.products[0]!.variants[0]!;
  const beforeAvail = targetVar.stockAvailable;

  // 1. Vendor submits a new consignment lot of 10 units
  const subRes = submitConsignmentDispatchLot(vendorCtx, {
    variantId: targetVar.variantId,
    dispatchedQty: 10,
    challanRef: 'CH-TEST-701',
    noteBn: '১০ পিস নতুন জামদানি চালান',
  });
  assert.equal(subRes.success, true);
  assert.ok(subRes.lot);
  assert.equal(subRes.lot.status, 'pending_qc');

  // 2. Vendor cannot approve their own QC
  const vendorApproveBlocked = reviewConsignmentDispatchLot(vendorCtx, {
    lotId: subRes.lot.lotId,
    decision: 'approve',
  });
  assert.equal(vendorApproveBlocked.success, false);

  // 3. Super Admin approves QC with 1 rejected unit (9 accepted)
  const qcRes = reviewConsignmentDispatchLot(adminCtx, {
    lotId: subRes.lot.lotId,
    decision: 'approve',
    qcRejectedQty: 1,
    noteBn: '৯ পিস উত্তীর্ণ, ১ পিস রিজেক্টেড',
  });
  assert.equal(qcRes.success, true);
  assert.equal(qcRes.lot?.status, 'approved_stocked');
  assert.equal(qcRes.lot?.qcAcceptedQty, 9);
  assert.equal(qcRes.updatedStockAvailable, beforeAvail + 9);
});

test('Phase 7 Case 2: Vendor Cost/Retail Price Proposal & 3-Tier Consignment Split Update', () => {
  const vendorCtx = getActorSecurityContext('usr-vendor-001')!;
  const adminCtx = getActorSecurityContext('usr-super-admin')!;

  const erpBefore = readErpState();
  const targetProduct =
    erpBefore.products.find(
      (p) => p.productId === '00000000-0000-4000-8000-000000000101'
    ) ?? erpBefore.products[0]!;
  const targetVar = targetProduct.variants[0]!;

  // 1. Submit valid price proposal (cost 165,000 + profit 40,000 = 205,000 payable; sale 255,000 -> 50,000 margin)
  const propRes = submitVendorPriceProposal(vendorCtx, {
    variantId: targetVar.variantId,
    proposedSupplierCostPoisha: 165000,
    proposedSalePricePoisha: 255000,
    reasonBn: 'সুতার দাম বৃদ্ধি',
  });
  assert.equal(propRes.success, true);
  assert.ok(propRes.proposal);
  assert.equal(propRes.proposal.projectedPlatformMarginPoisha, 50000);

  // 2. Super Admin approves -> variant updates to 255,000 sale, 165,000 cost, 205,000 payable, 50,000 margin
  const approveRes = resolveVendorPriceProposal(adminCtx, {
    proposalId: propRes.proposal.proposalId,
    decision: 'approved',
  });
  assert.equal(approveRes.success, true);

  const erpAfter = readErpState();
  const updatedProduct =
    erpAfter.products.find(
      (p) => p.productId === '00000000-0000-4000-8000-000000000101'
    ) ?? erpAfter.products[0]!;
  const updatedVar = updatedProduct.variants[0]!;
  assert.equal(updatedVar.salePricePoisha, 255000);
  assert.equal(updatedVar.supplierCostPoisha, 165000);
  assert.equal(updatedVar.supplierPayablePoisha, 205000);
  assert.equal(updatedVar.platformMarginPoisha, 50000);

  // Restore exact seed price (cost 160,000 + profit 40,000 = 200,000 payable; sale 245,000 -> 45,000 margin)
  const restoreProp = submitVendorPriceProposal(vendorCtx, {
    variantId: targetVar.variantId,
    proposedSupplierCostPoisha: 160000,
    proposedSalePricePoisha: 245000,
    reasonBn: 'রিস্টোর অরিজিনাল প্রাইস',
  });
  if (restoreProp.proposal) {
    resolveVendorPriceProposal(adminCtx, {
      proposalId: restoreProp.proposal.proposalId,
      decision: 'approved',
    });
  }
});

test('Phase 7 Case 3: Margin-Safe Flash Campaign Guard & Automated Escrow Maturity Promoter', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const erp = readErpState();
  const targetVar = erp.products[0]!.variants[0]!;

  // 1. Discount exceeding platform margin (45,000 poisha) must be blocked!
  const blockedFlash = createMarginSafeFlashCampaign(adminCtx, {
    campaignCode: 'BAD-FLASH-999',
    titleBn: 'অতিরিক্ত ছাড় টেস্ট',
    variantId: targetVar.variantId,
    flashDiscountPoisha: targetVar.platformMarginPoisha + 5000,
    maxUnitsQuota: 10,
  });
  assert.equal(blockedFlash.success, false);

  // 2. Even a margin-safe discount is quarantined by default (D-08).
  const validFlash = createMarginSafeFlashCampaign(adminCtx, {
    campaignCode: 'FLASH-JAM-150',
    titleBn: 'জামদানি ১৫০ টাকা ফ্ল্যাশ ছাড়',
    variantId: targetVar.variantId,
    flashDiscountPoisha: 15000,
    maxUnitsQuota: 20,
  });
  assert.equal(validFlash.success, false);
  assert.equal(validFlash.campaign, undefined);

  // 3. Automated Escrow Maturity Batch execution
  const matRes = promoteMaturedEscrowEntriesBatch(adminCtx, false);
  assert.equal(matRes.success, true);
  assert.ok(matRes.batch);
  assert.ok(Number.isInteger(matRes.batch.totalPromotedPoisha));
});

test('Phase 7 Case 4: Executive BDT Double-Entry Accounting & Strict Role Isolation', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const vendorCtx = getActorSecurityContext('usr-vendor-001')!;

  const acct = computeExecutiveAccountingSummary(adminCtx);
  assert.ok(acct);
  assert.ok(Number.isInteger(acct.totalDeliveredGrossRevenuePoisha));
  assert.ok(Number.isInteger(acct.estimatedVatOnMarginPoisha));
  assert.ok(Number.isInteger(acct.netRetainedPlatformProfitPoisha));
  assert.equal(acct.payoutFeeSchedule.length, 2);

  // Vendor must NEVER see executive accounting or other vendors' lots
  const vendorAcct = computeExecutiveAccountingSummary(vendorCtx);
  assert.equal(vendorAcct, null);

  const vendorOverview = getPhase7WorkspaceOverview(vendorCtx);
  assert.equal(vendorOverview.executiveAccounting, null);
  assert.equal(vendorOverview.flashCampaigns.length, 0);
  assert.ok(
    vendorOverview.consignmentLots.every(
      (l) => l.vendorId === vendorCtx.vendorId
    )
  );
});

test('Phase 7 Case 5: Multi-Supplier Product Offers & Multi-Vendor Fulfillment Group Split Engine', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const erp = readErpState();
  const targetProd =
    erp.products.find(
      (p) => p.productId === '00000000-0000-4000-8000-000000000101'
    ) ?? erp.products[0]!;
  const targetVar = targetProd.variants[0]!;

  // 1. Upsert a competing supplier offer for targetVar
  const offerRes = upsertSupplierProductOffer(adminCtx, {
    variantId: targetVar.variantId,
    vendorId: '00000000-0000-4000-8000-000000000902',
    internalVendorSku: 'VND002-JAM-COMP',
    supplierCostPoisha: 155000,
    supplierProfitPoisha: 25000,
    priorityRank: 2,
    leadTimeDays: 2,
    stockAvailable: 18,
  });
  assert.equal(offerRes.success, true);
  assert.ok(offerRes.offer);
  assert.equal(
    offerRes.offer.supplierCostPoisha + offerRes.offer.supplierProfitPoisha,
    offerRes.offer.supplierPayablePoisha
  );

  // 2. Deterministic allocation by priority_rank vs lowest_payable_highest_margin
  const bestMarginOffer = allocateSupplierOfferForVariant(
    targetVar.variantId,
    1,
    'lowest_payable_highest_margin'
  );
  assert.ok(bestMarginOffer);

  // 3. Split order ORD-261106-0001 into vendor fulfillment groups
  const splitRes = splitOrderIntoVendorFulfillmentGroups(adminCtx, {
    orderNo: 'ORD-261106-0001',
    allocationPolicy: 'priority_rank',
  });
  assert.equal(splitRes.success, true);
  assert.ok((splitRes.groups?.length ?? 0) >= 1);
  assert.ok(splitRes.groups?.[0]?.groupCode.startsWith('VFG-'));
});

test('Phase 7 Case 6: Maker-Checker Ledger Reversal Guard & Customer Refund Execution', () => {
  const adminCtx = getActorSecurityContext('usr-super-admin')!;
  const mktCtx = getActorSecurityContext('usr-marketing-01')!;

  // 1. Marketing Manager (Maker) submits a ledger reversal request
  const makerReq = createLedgerReversalRequest(mktCtx, {
    originalLedgerEntryId: 'vled-seed-2',
    correctedCreditPoisha: 185000,
    reasonBn: 'টেস্ট মেকার-চেকার রিভার্সাল ও কারেকশন এন্ট্রি',
  });
  assert.equal(makerReq.success, true);
  assert.ok(makerReq.reversal);
  assert.equal(makerReq.reversal.status, 'pending_checker_approval');

  // 2. Super Admin (Checker !== Maker) approves and posts balanced reversal without needing emergency override
  const checkerApprove = resolveLedgerReversalRequest(adminCtx, {
    reversalId: makerReq.reversal.reversalId,
    decision: 'approve',
  });
  assert.equal(checkerApprove.success, true);
  assert.equal(checkerApprove.reversal?.status, 'approved_posted');

  // 3. Super Admin creates a reversal as Maker, then attempts self-approval WITHOUT 2FA -> blocked!
  const selfMaker = createLedgerReversalRequest(adminCtx, {
    originalLedgerEntryId: 'vled-seed-2',
    correctedCreditPoisha: 175000,
    reasonBn: 'সেলফ মেকার টেস্ট রিভার্সাল জার্নাল',
  });
  assert.equal(selfMaker.success, true);
  const selfBlocked = resolveLedgerReversalRequest(adminCtx, {
    reversalId: selfMaker.reversal!.reversalId,
    decision: 'approve',
  });
  assert.equal(selfBlocked.success, false);

  // 4. Super Admin provides real 6-digit RFC 6238 2FA emergency override -> succeeds and records audit trail
  const store = readAdminStore();
  const adminRec = store.users.find((u) => u.userId === 'usr-super-admin')!;
  adminRec.lastUsedTotpStep = null;
  writeAdminStore(store);
  const realAdminTotp = getCurrentTotpCodeForUser('usr-super-admin')!;

  const selfOverride = resolveLedgerReversalRequest(adminCtx, {
    reversalId: selfMaker.reversal!.reversalId,
    decision: 'approve',
    emergencySelfApprovalOverride: true,
    emergencyOverrideReasonBn: 'জরুরি ফাইন্যান্স ক্লোজিং ওভাররাইড অনুমোদন',
    totpCode: realAdminTotp,
  });
  assert.equal(selfOverride.success, true);
  assert.equal(selfOverride.reversal?.usedEmergencyOverride, true);

  // 5. Execute customer refund workflow
  const refundRes = executeCustomerRefundWorkflow(adminCtx, {
    orderNo: 'ORD-261106-0002',
    refundAmountPoisha: 20000,
    refundChannel: 'bkash_manual',
    refundTrxId: 'BK-REF-TEST-77',
    reasonBn: 'গ্রাহক রিফান্ড টেস্ট',
  });
  assert.equal(refundRes.success, true);
  assert.ok(refundRes.refund?.refundCode.startsWith('REF-'));
});

