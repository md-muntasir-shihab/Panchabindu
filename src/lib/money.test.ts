// src/lib/money.test.ts
// Mandatory Golden Finance Unit Test Suite (Module G & Rule A1)
// Run with: npx --yes tsx --test src/lib/money.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBasisPointsHalfUp,
  assertIntegerPoisha,
  buildOrderItemPricingSnapshot,
  calculateAutoNetProfit,
  calculateMaturityTimestamp,
  calculatePromoDiscount,
  computeVendorEscrowBalance,
  evaluateFourWayReturn,
  formatPoishaToBdt,
  parseTakaStringToPoisha,
  resolveCommissionPriority,
  validatePayoutRequestEligibility,
} from './money';
import type { LedgerCalculationEntry } from '../types/domain';

test('Golden Case 1: Exact Poisha & Half-Up Rounding (Zero Floating-Point Drift)', () => {
  // Reject floating point numbers immediately
  assert.throws(() => assertIntegerPoisha(120.5), /EXACT_MONEY_VIOLATION/);

  // Parse string representations without float drift
  assert.equal(parseTakaStringToPoisha('120.50'), 12050);
  assert.equal(parseTakaStringToPoisha('১২৫০.৭৫'), 125075);

  // Half-up rounding at basis points boundary:
  // 105 poisha * 500 bp (5%) = 52500 / 10000 = 5.25 -> rounds to 5 poisha
  assert.equal(applyBasisPointsHalfUp(105, 500), 5);
  // 110 poisha * 500 bp (5%) = 55000 / 10000 = 5.50 -> rounds half-up to 6 poisha
  assert.equal(applyBasisPointsHalfUp(110, 500), 6);
});

test('Golden Case 2: Commission Priority (Product Override > Vendor Default > Global Default)', () => {
  const p1 = resolveCommissionPriority({
    productOverrideBp: 1200,
    vendorDefaultBp: 1500,
    globalDefaultBp: 2000,
  });
  assert.equal(p1.commissionBp, 1200);
  assert.equal(p1.source, 'PRODUCT_OVERRIDE');

  const p2 = resolveCommissionPriority({
    productOverrideBp: null,
    vendorDefaultBp: 1500,
    globalDefaultBp: 2000,
  });
  assert.equal(p2.commissionBp, 1500);
  assert.equal(p2.source, 'VENDOR_DEFAULT');

  const p3 = resolveCommissionPriority({
    productOverrideBp: undefined,
    vendorDefaultBp: null,
    globalDefaultBp: 2000,
  });
  assert.equal(p3.commissionBp, 2000);
  assert.equal(p3.source, 'GLOBAL_DEFAULT');
});

test('Golden Case 3: Three-Tier Consignment Pricing & Line Snapshot', () => {
  // Supplier Cost = 800 BDT (80000 poisha), Supplier Profit = 200 BDT (20000 poisha)
  // -> Supplier Payable = 1000 BDT (100000 poisha)
  // Platform Margin = 250 BDT (25000 poisha) -> Final Sale Price = 1250 BDT (125000 poisha)
  const snap = buildOrderItemPricingSnapshot({
    unitSupplierCostPoisha: 80000,
    unitSupplierProfitPoisha: 20000,
    unitPlatformMarginPoisha: 25000,
    quantity: 3,
    productCommissionOverrideBp: null,
    vendorDefaultCommissionBp: 2500,
    globalDefaultCommissionBp: 1500,
    vendorHoldDaysOverride: 5,
    globalHoldDays: 7,
  });

  assert.equal(snap.unitSupplierPayablePoisha, 100000);
  assert.equal(snap.unitSalePricePoisha, 125000);
  assert.equal(snap.lineSupplierPayablePoisha, 300000);
  assert.equal(snap.linePlatformMarginPoisha, 75000);
  assert.equal(snap.lineSubtotalPoisha, 375000);
  assert.equal(snap.escrowHoldDaysSnapshot, 5);
});

test('Golden Case 4: Promo Discount Deducts Strictly from Platform Margin (Supplier Payable Untouched)', () => {
  const item = buildOrderItemPricingSnapshot({
    unitSupplierCostPoisha: 80000,
    unitSupplierProfitPoisha: 20000,
    unitPlatformMarginPoisha: 25000,
    quantity: 2,
    globalDefaultCommissionBp: 2000,
    globalHoldDays: 7,
  });

  // Subtotal = 2500 BDT (250000 poisha), Supplier Payable = 2000 BDT (200000 poisha), Margin = 500 BDT (50000 poisha)
  // Apply 10% promo (1000 bp) -> 250 BDT (25000 poisha) discount
  const res = calculatePromoDiscount({
    promo: {
      code: 'EID10',
      discountType: 'percentage_bp',
      discountValue: 1000,
      maxDiscountPoisha: 30000,
      minOrderSubtotalPoisha: 100000,
      allowedVendorIds: [],
      isActive: true,
      expiresAt: null,
    },
    items: [item],
    itemVendorIds: ['vendor-1'],
  });

  assert.equal(res.valid, true);
  assert.equal(res.discountPoisha, 25000);
  assert.equal(res.totalSupplierPayablePoisha, 200000); // Supplier still gets full 2000 BDT!
  assert.equal(res.newPlatformMarginPoisha, 25000); // Platform margin reduced from 500 BDT to 250 BDT
});

test('holding maturity never releases money without an approved transfer', () => {
  const deliveredAt = '2026-11-01T10:00:00.000Z';
  const maturesAt = calculateMaturityTimestamp(deliveredAt, 7);
  assert.equal(maturesAt, '2026-11-08T10:00:00.000Z');

  const entries: LedgerCalculationEntry[] = [
    {
      id: 'e1',
      orderItemId: 'oi-1',
      entryType: 'EARNING_PENDING',
      escrowBucket: 'pending',
      amountPoisha: 90000,
      deliveredAt: null,
      maturesAt: null,
    },
    {
      id: 'e2',
      orderItemId: 'oi-2',
      entryType: 'EARNING_LOCKED',
      escrowBucket: 'locked',
      amountPoisha: 150000,
      deliveredAt,
      maturesAt,
    },
  ];

  // Read 3 days after delivery (still inside 7-day hold period): e2 stays in lockedPoisha
  const balBeforeMaturity = computeVendorEscrowBalance(
    'v1',
    entries,
    '2026-11-04T10:00:00.000Z'
  );
  assert.equal(balBeforeMaturity.pendingPoisha, 90000);
  assert.equal(balBeforeMaturity.lockedPoisha, 150000);
  assert.equal(balBeforeMaturity.withdrawablePoisha, 0);

  const balAfterMaturity = computeVendorEscrowBalance(
    'v1',
    entries,
    '2026-11-09T10:00:00.000Z'
  );
  assert.equal(balAfterMaturity.lockedPoisha, 150000);
  assert.equal(balAfterMaturity.availablePoisha, 0);
  assert.equal(balAfterMaturity.withdrawablePoisha, 0);
  const transferred = computeVendorEscrowBalance('v1', [...entries,
    { ...entries[1], id: 'offset', entryType: 'MANUAL_ADJUSTMENT', amountPoisha: -150000 },
    { ...entries[1], id: 'available', entryType: 'EARNING_MATURED', escrowBucket: 'available' },
  ]);
  assert.equal(transferred.lockedPoisha, 0);
  assert.equal(transferred.availablePoisha, 150000);
});

test('Golden Case 6: Four-Way Return Engine & Post-Payout Clawback', () => {
  // 6A: Fault #1 (Warehouse/Packaging Fault) -> Vendor Debit = 0, Platform absorbs loss
  const f1 = evaluateFourWayReturn({
    faultType: 'WAREHOUSE_PACKAGING_FAULT',
    quantity: 1,
    unitSupplierPayablePoisha: 100000,
    unitSalePricePoisha: 130000,
    unrecoveredCourierChargePoisha: 13000,
    wasInHoldPeriod: true,
    wasAlreadyPaidOut: false,
  });
  assert.equal(f1.vendorDebitPoisha, 0);
  assert.equal(f1.platformLossPoisha, 113000);
  assert.equal(f1.ledgerEntryToInsert, null);

  // 6B: Fault #2 (Supplier Defect during Hold Period) -> Reverses Locked Earning
  const f2Hold = evaluateFourWayReturn({
    faultType: 'SUPPLIER_DEFECT',
    quantity: 1,
    unitSupplierPayablePoisha: 100000,
    unitSalePricePoisha: 130000,
    unrecoveredCourierChargePoisha: 13000,
    wasInHoldPeriod: true,
    wasAlreadyPaidOut: false,
  });
  assert.equal(f2Hold.vendorDebitPoisha, 100000);
  assert.equal(f2Hold.ledgerEntryToInsert?.entryType, 'HOLD_PERIOD_RETURN_REVERSAL');
  assert.equal(f2Hold.ledgerEntryToInsert?.escrowBucket, 'locked');
  assert.equal(f2Hold.ledgerEntryToInsert?.amountPoisha, -100000);

  // 6C: Fault #2 (Supplier Defect AFTER Payout) -> Negative POST_PAYOUT_CLAWBACK on Available bucket
  const f2PostPayout = evaluateFourWayReturn({
    faultType: 'SUPPLIER_DEFECT',
    quantity: 1,
    unitSupplierPayablePoisha: 100000,
    unitSalePricePoisha: 130000,
    unrecoveredCourierChargePoisha: 13000,
    wasInHoldPeriod: false,
    wasAlreadyPaidOut: true,
  });
  assert.equal(f2PostPayout.ledgerEntryToInsert?.entryType, 'POST_PAYOUT_CLAWBACK');
  assert.equal(f2PostPayout.ledgerEntryToInsert?.escrowBucket, 'available');
  assert.equal(f2PostPayout.ledgerEntryToInsert?.amountPoisha, -100000);

  // 6D: Fault #3 (Customer Intact Return) -> Restocks item + cancels vendor earning
  const f3 = evaluateFourWayReturn({
    faultType: 'CUSTOMER_INTACT_RETURN',
    quantity: 2,
    unitSupplierPayablePoisha: 50000,
    unitSalePricePoisha: 70000,
    unrecoveredCourierChargePoisha: 7000,
    wasInHoldPeriod: true,
    wasAlreadyPaidOut: false,
  });
  assert.equal(f3.restockQuantity, 2);
  assert.equal(f3.vendorDebitPoisha, 100000);

  // 6E: Fault #4 (Courier Negligence) -> Vendor Debit = 0, Creates Courier Claim
  const f4 = evaluateFourWayReturn({
    faultType: 'COURIER_NEGLIGENCE',
    quantity: 1,
    unitSupplierPayablePoisha: 100000,
    unitSalePricePoisha: 130000,
    unrecoveredCourierChargePoisha: 0,
    wasInHoldPeriod: true,
    wasAlreadyPaidOut: false,
  });
  assert.equal(f4.vendorDebitPoisha, 0);
  assert.equal(f4.shouldCreateCourierClaim, true);
  assert.equal(f4.courierClaimPoisha, 130000);
});

test('Golden Case 7: Payout Limit & Double-Request Hold Protection', () => {
  // Minimum payout is 500 BDT (50000 poisha), available is 1200 BDT (120000 poisha)
  const belowMin = validatePayoutRequestEligibility({
    requestedAmountPoisha: 40000,
    withdrawablePoisha: 120000,
    minPayoutPoisha: 50000,
  });
  assert.equal(belowMin.allowed, false);

  const aboveAvailable = validatePayoutRequestEligibility({
    requestedAmountPoisha: 130000,
    withdrawablePoisha: 120000,
    minPayoutPoisha: 50000,
  });
  assert.equal(aboveAvailable.allowed, false);

  const validReq = validatePayoutRequestEligibility({
    requestedAmountPoisha: 100000,
    withdrawablePoisha: 120000,
    minPayoutPoisha: 50000,
  });
  assert.equal(validReq.allowed, true);
});

test('Golden Case 8: Partial Delivery & Auto Net Profit Formula', () => {
  // Ordered 3 units, 2 delivered, 1 returned intact:
  // Delivered sales = 2500 BDT (250000 poisha)
  // Supplier payable for 2 delivered = 2000 BDT (200000 poisha)
  // Promo discount = 50 BDT (5000 poisha)
  // Ad spend = 100 BDT (10000 poisha), Packaging = 30 BDT (3000 poisha)
  // Unrecovered courier charge = 70 BDT (7000 poisha), Return loss = 20 BDT (2000 poisha)
  // Warehouse damage = 0, Other = 50 BDT (5000 poisha)
  // Gross Margin = 250000 - 200000 - 5000 = 45000 poisha (450 BDT)
  // Deductions = 10000 + 3000 + 7000 + 2000 + 0 + 5000 = 27000 poisha (270 BDT)
  // Net Profit = 45000 - 27000 = 18000 poisha (180 BDT)
  const pnl = calculateAutoNetProfit({
    grossDeliveredSalesPoisha: 250000,
    supplierPayablePoisha: 200000,
    promoDiscountPoisha: 5000,
    adSpendPoisha: 10000,
    packagingCostPoisha: 3000,
    unrecoveredCourierChargePoisha: 7000,
    returnLossPoisha: 2000,
    damageLossPoisha: 0,
    otherExpensePoisha: 5000,
  });

  assert.equal(pnl.grossMarginPoisha, 45000);
  assert.equal(pnl.totalDeductionsPoisha, 27000);
  assert.equal(pnl.netProfitPoisha, 18000);
  assert.equal(pnl.isLoss, false);
  assert.equal(formatPoishaToBdt(pnl.netProfitPoisha, 'en'), '৳ 180');
});
