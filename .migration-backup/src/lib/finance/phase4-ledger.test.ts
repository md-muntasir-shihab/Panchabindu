// src/lib/finance/phase4-ledger.test.ts
// Phase 4 — Financial System, Double-Entry General Ledger, Escrow Holding Liability & Maker-Checker Test Suite

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ActorSecurityContext } from '../../types/permissions';
import {
  applyBasisPointsHalfUp,
  assertIntegerPoisha,
  parseTakaStringToPoisha,
} from '../money';
import {
  allocatePromoDiscountAcrossVendorLines,
  attemptDirectAccountBalanceEdit,
  attemptModifyOrDeletePostedJournal,
  CHART_OF_ACCOUNTS,
  computeGeneralLedgerTrialBalance,
  placeDisputeHoldOnVendorOrder,
  postCourierRemittanceJournal,
  postCustomerRefundDisbursedJournal,
  postDoubleEntryJournal,
  postEscrowMaturityReleaseJournal,
  postFourWayReturnAdjustmentJournal,
  postOrderDeliveryRecognitionJournal,
  postSupplierPayoutHoldJournal,
  postSupplierSettlementDisbursedJournal,
  postVerifiedManualBkashPaymentJournal,
  readPhase4GLStore,
  reversePostedJournalEntry,
  reviewPendingJournalEntry,
  runFullFinancialReconciliation,
  writePhase4GLStore,
} from './phase4-general-ledger-engine';

const superAdminCheckerCtx: ActorSecurityContext = {
  userId: 'usr-super-admin',
  username: 'admin',
  roleSlug: 'super_admin',
  vendorId: null,
  mustChangePassword: false,
  totpEnrolled: true,
  require2fa: true,
  maxDiscountBp: 5000,
  maskCustomerPiiForVendor: false,
};

describe('Phase 4 — Financial System & Double-Entry General Ledger (Section 7)', () => {
  it('7.1 & 7.2: enforces Chart of Accounts, balanced Debit === Credit invariant, integer Poisha, closed period lock, immutability, and idempotency', () => {
    assert.ok(CHART_OF_ACCOUNTS.length >= 16);

    // 1. Direct manual balance edit is strictly forbidden
    const directEdit = attemptDirectAccountBalanceEdit({
      accountCode: '1010',
      newBalancePoisha: 99999900,
      actorUsername: 'admin',
    });
    assert.equal(directEdit.success, false);
    assert.equal(directEdit.errorCode, 'DIRECT_BALANCE_EDIT_FORBIDDEN');

    // 2. Unbalanced journal entry (Debit !== Credit) is rejected
    const unbalanced = postDoubleEntryJournal({
      idempotencyKey: `idem-unbal-${Date.now()}`,
      flowType: 'MANUAL_ADJUSTMENT_JOURNAL',
      referenceId: 'REF-UNBAL-01',
      descriptionBn: 'অসমতুল্য জার্নাল টেস্ট',
      reasonBn: 'ডেবিট ও ক্রেডিট অসমান রেখে পোস্টিং চেষ্টা।',
      makerUsername: 'finance_maker',
      lines: [
        {
          accountCode: '5040',
          debitPoisha: 15000,
          creditPoisha: 0,
          memoBn: 'খরচ ডেবিট ১৫০ টাকা',
        },
        {
          accountCode: '1010',
          debitPoisha: 0,
          creditPoisha: 12000,
          memoBn: 'নগদ ক্রেডিট ১২০ টাকা (অসমতুল্য)',
        },
      ],
    });
    assert.equal(unbalanced.success, false);
    assert.equal(unbalanced.errorCode, 'UNBALANCED_JOURNAL_ENTRY');

    // 3. Floating-point Poisha is rejected
    const floatAttempt = postDoubleEntryJournal({
      idempotencyKey: `idem-float-${Date.now()}`,
      flowType: 'MANUAL_ADJUSTMENT_JOURNAL',
      referenceId: 'REF-FLOAT-01',
      descriptionBn: 'দশমিক পয়সা টেস্ট',
      reasonBn: 'দশমিক সংখ্যা দিয়ে জার্নাল পোস্টিং চেষ্টা।',
      makerUsername: 'finance_maker',
      lines: [
        {
          accountCode: '5040',
          debitPoisha: 100.5,
          creditPoisha: 0,
          memoBn: 'দশমিক ডেবিট',
        },
        {
          accountCode: '1010',
          debitPoisha: 0,
          creditPoisha: 100.5,
          memoBn: 'দশমিক ক্রেডিট',
        },
      ],
    });
    assert.equal(floatAttempt.success, false);
    assert.equal(floatAttempt.errorCode, 'FLOAT_OR_INVALID_POISHA');

    // 4. Posting into a CLOSED accounting period (2026-10) is rejected
    const closedPeriodPost = postDoubleEntryJournal({
      idempotencyKey: `idem-closed-${Date.now()}`,
      periodCode: '2026-10',
      flowType: 'OPERATING_EXPENSE_RECORDED',
      referenceId: 'EXP-OCT-01',
      descriptionBn: 'ক্লোজড পিরিয়ডে পোস্টিং চেষ্টা',
      reasonBn: 'অক্টোবর ২০২৬ ক্লোজড পিরিয়ডে এন্ট্রি টেস্ট।',
      makerUsername: 'finance_maker',
      lines: [
        {
          accountCode: '5040',
          debitPoisha: 10000,
          creditPoisha: 0,
          memoBn: 'অপারেটিং খরচ',
        },
        {
          accountCode: '1010',
          debitPoisha: 0,
          creditPoisha: 10000,
          memoBn: 'নগদ প্রদান',
        },
      ],
    });
    assert.equal(closedPeriodPost.success, false);
    assert.equal(closedPeriodPost.errorCode, 'ACCOUNTING_PERIOD_CLOSED');

    // 5. Valid balanced journal with Maker-Checker queue -> Self-approval blocked -> Distinct checker approves
    const idemKey = `idem-valid-exp-${Date.now()}`;
    const queued = postDoubleEntryJournal({
      idempotencyKey: idemKey,
      periodCode: '2026-11',
      flowType: 'OPERATING_EXPENSE_RECORDED',
      referenceId: 'EXP-NOV-101',
      descriptionBn: 'গুদাম প্যাকেজিং পলি ক্রয়',
      reasonBn: 'নভেম্বর মাসের ওয়্যারহাউস প্যাকেজিং উপকরণ ক্রয়।',
      makerUsername: 'packer_rafi',
      requireMakerCheckerApproval: true,
      lines: [
        {
          accountCode: '5040',
          debitPoisha: 25000,
          creditPoisha: 0,
          memoBn: 'প্যাকেজিং খরচ (৳২৫০)',
        },
        {
          accountCode: '1010',
          debitPoisha: 0,
          creditPoisha: 25000,
          memoBn: 'নগদ পরিশোধ (৳২৫০)',
        },
      ],
    });
    assert.equal(queued.success, true);
    assert.equal(queued.journal?.status, 'PENDING_APPROVAL');
    assert.equal(queued.journal?.currency, 'BDT');

    // Idempotent replay with same key returns exact same journal without duplicating
    const replay = postDoubleEntryJournal({
      idempotencyKey: idemKey,
      periodCode: '2026-11',
      flowType: 'OPERATING_EXPENSE_RECORDED',
      referenceId: 'EXP-NOV-101',
      descriptionBn: 'গুদাম প্যাকেজিং পলি ক্রয়',
      reasonBn: 'নভেম্বর মাসের ওয়্যারহাউস প্যাকেজিং উপকরণ ক্রয়।',
      makerUsername: 'packer_rafi',
      requireMakerCheckerApproval: true,
      lines: [
        {
          accountCode: '5040',
          debitPoisha: 25000,
          creditPoisha: 0,
          memoBn: 'প্যাকেজিং খরচ (৳২৫০)',
        },
        {
          accountCode: '1010',
          debitPoisha: 0,
          creditPoisha: 25000,
          memoBn: 'নগদ পরিশোধ (৳২৫০)',
        },
      ],
    });
    assert.equal(replay.success, true);
    assert.equal(replay.idempotentReplay, true);
    assert.equal(replay.journal?.journalNo, queued.journal?.journalNo);

    // Distinct checker (admin) approves the pending journal
    const approved = reviewPendingJournalEntry(superAdminCheckerCtx, {
      journalNo: queued.journal!.journalNo,
      decision: 'APPROVE',
      reasonBn: 'ভাউচার যাচাই করে প্যাকেজিং খরচ জার্নাল অনুমোদন করা হলো।',
    });
    assert.equal(approved.success, true);
    assert.equal(approved.journal?.status, 'POSTED');

    // Editing or deleting a POSTED journal is blocked
    const editAttempt = attemptModifyOrDeletePostedJournal({
      journalNo: queued.journal!.journalNo,
      operation: 'EDIT',
      actorUsername: 'admin',
    });
    assert.equal(editAttempt.success, false);
    assert.equal(editAttempt.errorCode, 'IMMUTABLE_POSTED_JOURNAL');

    // Reversing the posted journal creates an offsetting Reversal Journal so net impact is 0 Poisha
    const reversed = reversePostedJournalEntry({
      originalJournalNo: queued.journal!.journalNo,
      makerUsername: 'finance_maker',
      checkerUsername: 'admin',
      checkerRole: 'super_admin',
      reasonBn: 'ভাউচার অ্যামাউন্ট সংশোধনের জন্য মূল জার্নাল রিভার্স করা হলো।',
      idempotencyKey: `idem-rev-${queued.journal!.journalNo}`,
    });
    assert.equal(reversed.success, true);
    assert.equal(reversed.originalJournal?.status, 'REVERSED');
    assert.equal(reversed.reversalJournal?.status, 'POSTED');
    assert.equal(reversed.reversalJournal?.totalDebitPoisha, 25000);
    assert.equal(reversed.reversalJournal?.totalCreditPoisha, 25000);
  });

  it('7.3, 7.4, 7.5 & 7.6: models all 12 financial flows separately without double-counting revenue or cash, and passes full Trial Balance & Sub-Ledger Reconciliation', () => {
    const orderNo = `ORD-GL-${Date.now()}`;
    const vendor1Id = '00000000-0000-4000-8000-000000000901';
    const vendor2Id = '00000000-0000-4000-8000-000000000902';

    // 1. Multi-Vendor Allocation & Rounding (7.6):
    // Vendor 1 item: Payable 2,00,000 (৳2,000), Margin 45,000 (৳450), Subtotal 2,45,000
    // Vendor 2 item: Payable   80,000 (৳800),   Margin 20,000 (৳200), Subtotal 1,00,000
    // Total Subtotal = 3,45,000 Poisha; Total Payable = 2,80,000 Poisha; Total Initial Margin = 65,000 Poisha
    // Apply odd promo discount = 10,001 Poisha (৳100.01)
    const multiAlloc = allocatePromoDiscountAcrossVendorLines({
      requestedDiscountPoisha: 10001,
      lines: [
        {
          lineId: 'line-v1',
          vendorId: vendor1Id,
          lineSupplierPayablePoisha: 200000,
          linePlatformMarginPoisha: 45000,
          lineSubtotalPoisha: 245000,
        },
        {
          lineId: 'line-v2',
          vendorId: vendor2Id,
          lineSupplierPayablePoisha: 80000,
          linePlatformMarginPoisha: 20000,
          lineSubtotalPoisha: 100000,
        },
      ],
    });

    assert.equal(multiAlloc.effectiveOrderDiscountPoisha, 10001);
    assert.equal(multiAlloc.totalSupplierPayablePoisha, 280000); // 100% untouched!
    assert.equal(
      multiAlloc.allocatedLines[0]!.allocatedDiscountPoisha +
        multiAlloc.allocatedLines[1]!.allocatedDiscountPoisha,
      10001
    );
    assert.equal(
      multiAlloc.totalNetPlatformMarginPoisha,
      65000 - 10001
    );

    // 2. Partial Payment (Manual bKash Advance = 30,000 Poisha / ৳300)
    // Self-verification by maker is blocked (7.5 Maker-Checker)
    const selfVerifyBkash = postVerifiedManualBkashPaymentJournal({
      submissionId: `sub-${orderNo}`,
      orderNo,
      trxId: 'BKGL990011',
      verifiedAmountPoisha: 30000,
      makerUsername: 'moderator_01',
      checkerUsername: 'moderator_01',
    });
    assert.equal(selfVerifyBkash.success, false);
    assert.equal(selfVerifyBkash.errorCode, 'MAKER_CHECKER_VIOLATION');

    // Distinct checker verifies Manual bKash Advance -> Dr 1010 Cash (30,000), Cr 2030 Customer Advance Liability (30,000)
    const verBkash = postVerifiedManualBkashPaymentJournal({
      submissionId: `sub-${orderNo}`,
      orderNo,
      trxId: 'BKGL990011',
      verifiedAmountPoisha: 30000,
      makerUsername: 'moderator_01',
      checkerUsername: 'admin',
    });
    assert.equal(verBkash.success, true);

    // 3. Order Delivery Recognition (COD + Advance + Promo Subsidy + Delivery Charge):
    // Subtotal = 3,45,000; Promo = 10,001; Delivery Charge = 8,000
    // Total Customer Payable = 3,45,000 - 10,001 + 8,000 = 3,42,999 Poisha
    // Advance Paid = 30,000 -> COD Collectable = 3,12,999 Poisha
    const delivRec = postOrderDeliveryRecognitionJournal({
      orderNo,
      advancePaidPoisha: 30000,
      codCollectablePoisha: 312999,
      promoDiscountPoisha: 10001,
      deliveryChargePoisha: 8000,
      vendorSplits: [
        {
          vendorId: vendor1Id,
          supplierPayablePoisha: 200000,
          platformMarginPoisha: 45000,
        },
        {
          vendorId: vendor2Id,
          supplierPayablePoisha: 80000,
          platformMarginPoisha: 20000,
        },
      ],
      actorUsername: 'admin',
    });
    assert.equal(delivRec.success, true);
    assert.equal(delivRec.journal?.totalDebitPoisha, 353000);
    assert.equal(delivRec.journal?.totalCreditPoisha, 353000);

    // 4. Courier COD Remittance with Courier Fee & Short-Payment Detection:
    // Expected COD = 3,12,999; Courier Fee = 11,000; Remitted Cash = 3,00,000 -> Short-Payment = 1,999 Poisha
    const remit = postCourierRemittanceJournal({
      settlementRef: `STL-${orderNo}`,
      orderNo,
      expectedCodPoisha: 312999,
      courierFeeDeductedPoisha: 11000,
      remittedCashPoisha: 300000,
      actorUsername: 'admin',
    });
    assert.equal(remit.success, true);
    assert.equal(remit.shortPaymentPoisha, 1999);
    assert.equal(remit.journal?.totalDebitPoisha, 312999);
    assert.equal(remit.journal?.totalCreditPoisha, 312999);

    // 5. Escrow Hold & Dispute Protection (7.4):
    // Place an active dispute hold on Vendor 2's portion -> maturity release for Vendor 2 must be blocked!
    const holdRes = placeDisputeHoldOnVendorOrder({
      orderNo,
      vendorId: vendor2Id,
      holdAmountPoisha: 80000,
      reasonBn: 'গ্রাহক ভেন্ডর ২-এর পণ্যের সাইজ নিয়ে ডিসপিউট তুলেছেন।',
      actorUsername: 'admin',
    });
    assert.equal(holdRes.success, true);

    const blockedReleaseV2 = postEscrowMaturityReleaseJournal({
      orderNo,
      vendorId: vendor2Id,
      amountPoisha: 80000,
      actorUsername: 'admin',
    });
    assert.equal(blockedReleaseV2.success, false);
    assert.equal(
      blockedReleaseV2.errorCode,
      'DISPUTE_HOLD_ACTIVE_RELEASE_BLOCKED'
    );

    // Vendor 1 has no dispute -> Vendor 1's 2,00,000 Poisha matures cleanly from 2015 Locked -> 2020 Available
    const releaseV1 = postEscrowMaturityReleaseJournal({
      orderNo,
      vendorId: vendor1Id,
      amountPoisha: 200000,
      actorUsername: 'admin',
    });
    assert.equal(releaseV1.success, true);

    // 6. Supplier Payout Hold & Maker-Checker Settlement (7.4 & 7.5):
    const payoutId = `PO-${orderNo}-V1`;
    const payoutHold = postSupplierPayoutHoldJournal({
      payoutId,
      vendorId: vendor1Id,
      requestedAmountPoisha: 200000,
      makerUsername: 'vendor_rupganj',
    });
    assert.equal(payoutHold.success, true);

    // Self-approval by vendor is blocked
    const selfSettle = postSupplierSettlementDisbursedJournal({
      payoutId,
      vendorId: vendor1Id,
      disbursedAmountPoisha: 200000,
      settlementTrxRef: 'BANK-TRX-8899',
      makerUsername: 'vendor_rupganj',
      checkerUsername: 'vendor_rupganj',
      reasonBn: 'নিজেই পেআউট অনুমোদনের অবৈধ চেষ্টা',
    });
    assert.equal(selfSettle.success, false);
    assert.equal(selfSettle.errorCode, 'MAKER_CHECKER_VIOLATION');

    // Checker (admin) approves settlement -> Dr 2025 Payout Hold, Cr 1010 Cash & Bank
    const settledV1 = postSupplierSettlementDisbursedJournal({
      payoutId,
      vendorId: vendor1Id,
      disbursedAmountPoisha: 200000,
      settlementTrxRef: 'BANK-TRX-8899',
      makerUsername: 'vendor_rupganj',
      checkerUsername: 'admin',
      reasonBn: 'ভেন্ডর ১-এর ৭ দিন পূর্ণ হওয়া পেআউট ব্যাংক ট্রান্সফারের মাধ্যমে নিষ্পত্তি (সিমুলেটেড)।',
    });
    assert.equal(settledV1.success, true);

    // 7. Four-Way Return Adjustment on Vendor 2's item (SUPPLIER_DEFECT during hold period):
    const retV2 = postFourWayReturnAdjustmentJournal({
      returnId: `RET-${orderNo}-V2`,
      orderNo,
      vendorId: vendor2Id,
      faultType: 'SUPPLIER_DEFECT',
      quantity: 1,
      unitSupplierPayablePoisha: 80000,
      unitPlatformMarginPoisha: 20000,
      unrecoveredCourierChargePoisha: 7000,
      wasInHoldPeriod: true,
      wasAlreadyPaidOut: false,
      actorUsername: 'admin',
    });
    assert.equal(retV2.success, true);
    assert.equal(retV2.resolution.vendorDebitPoisha, 80000);

    // Clean up Vendor 2's dispute hold status after return resolution
    const glStore = readPhase4GLStore();
    const dsp = glStore.disputeHolds.find((d) => d.orderNo === orderNo);
    if (dsp) {
      dsp.status = 'RESOLVED_CLAWBACK';
      dsp.resolvedByUsername = 'admin';
      dsp.resolvedAt = new Date().toISOString();
      writePhase4GLStore(glStore);
    }

    // 8. Customer Refund Execution (Maker !== Checker):
    const refundRes = postCustomerRefundDisbursedJournal({
      refundId: `RFD-${orderNo}`,
      orderNo,
      refundAmountPoisha: 15000,
      refundTrxId: 'BK-RFD-7711',
      makerUsername: 'moderator_01',
      checkerUsername: 'admin',
      reasonBn: 'আংশিক রিটার্নের কারণে গ্রাহককে ১৫০ টাকা বিকাশ রিফান্ড প্রদান।',
    });
    assert.equal(refundRes.success, true);

    // 9. Rounding & Exact Integer Helpers Verification (7.6):
    assert.equal(parseTakaStringToPoisha('১২৫০.৫০'), 125050);
    assert.equal(applyBasisPointsHalfUp(15005, 1000), 1501); // 10% of 150.05 = 15.005 -> HALF-UP 1501 Poisha
    assert.throws(() => assertIntegerPoisha(19.99), /EXACT_MONEY_VIOLATION/);

    // 10. Full Trial Balance & Reconciliation Verification:
    const tb = computeGeneralLedgerTrialBalance();
    assert.equal(tb.currency, 'BDT');
    assert.equal(tb.isTrialBalanceBalanced, true);
    assert.ok(tb.totalDebitPoisha > 0);
    assert.equal(tb.totalDebitPoisha, tb.totalCreditPoisha);

    const recon = runFullFinancialReconciliation();
    assert.equal(recon.isTrialBalanceBalanced, true);
    assert.equal(recon.unbalancedJournalsCount, 0);
    assert.equal(recon.orderSnapshotDiscrepanciesCount, 0);
    assert.equal(recon.doubleCountedRevenueOrdersCount, 0);
    assert.equal(recon.allInvariantsPassed, true);
  });
});
