// src/lib/money.ts
// Exact Integer Poisha (1 BDT = 100 Poisha) & Basis Points (10% = 1000 bp) Financial Engine
// Rule A1 & A2:
//   - NEVER use floating-point math for money or percentages.
//   - Rounding is strictly HALF-UP, applied at the line level.
//   - Three-tier pricing: Supplier Cost + Supplier Profit = Supplier Payable; + Platform Margin = Sale Price.
//   - Promo discounts deduct strictly from Platform Margin (Supplier Payable is never reduced).

import type {
  BasisPoints,
  CommissionSource,
  LedgerCalculationEntry,
  Poisha,
  PromoRuleInput,
  ReturnResolutionCalculation,
  ThreeTierPriceSnapshot,
  VendorEscrowBalance,
} from '../types/domain';
import type { ReturnFaultType } from '../types/database.types';

const BENGALI_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'] as const;

/**
 * Validates that a value is a safe integer (throws if float, NaN, or unsafe integer).
 */
export function assertIntegerPoisha(value: number, label = 'amount'): Poisha {
  if (!Number.isSafeInteger(value)) {
    throw new TypeError(
      `EXACT_MONEY_VIOLATION: "${label}" must be an exact safe integer in poisha, received ${value}`
    );
  }
  return value;
}

/**
 * Validates that a basis point value is an integer between 0 and 10000 (0% to 100%).
 */
export function assertBasisPoints(bp: number, label = 'rateBp'): BasisPoints {
  if (!Number.isSafeInteger(bp) || bp < 0 || bp > 10000) {
    throw new RangeError(
      `BASIS_POINTS_VIOLATION: "${label}" must be an integer between 0 and 10000, received ${bp}`
    );
  }
  return bp;
}

/**
 * Converts integer Taka to Poisha: 120 -> 12000 poisha.
 */
export function takaToPoisha(wholeTaka: number): Poisha {
  if (!Number.isSafeInteger(wholeTaka)) {
    throw new TypeError('takaToPoisha requires an integer Taka amount. Use parseTakaStringToPoisha for decimal input strings.');
  }
  return assertIntegerPoisha(wholeTaka * 100, 'convertedPoisha');
}

/**
 * Safely parses a user-entered string like "1250", "1250.5", or "1250.50" into exact integer poisha
 * without using IEEE-754 floating-point multiplication.
 */
export function parseTakaStringToPoisha(input: string): Poisha {
  const normalized = input
    .trim()
    .replace(/[০-৯]/g, (d) => String(BENGALI_DIGITS.indexOf(d as (typeof BENGALI_DIGITS)[number])))
    .replace(/,/g, '');

  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) {
    throw new SyntaxError(`Invalid Taka string format: "${input}"`);
  }

  const isNegative = normalized.startsWith('-');
  const clean = isNegative ? normalized.slice(1) : normalized;
  const [takaPart, fracPart = ''] = clean.split('.');
  const paddedFrac = (fracPart + '00').slice(0, 2);

  const poisha = Number(takaPart) * 100 + Number(paddedFrac);
  const signed = isNegative ? -poisha : poisha;
  return assertIntegerPoisha(signed, 'parsedPoisha');
}

/**
 * Applies basis points to an integer poisha amount using exact BigInt arithmetic
 * and HALF-UP rounding: floor((amount * bp + 5000) / 10000).
 * Example: 10% (1000 bp) of 15005 poisha -> 1501 poisha.
 */
export function applyBasisPointsHalfUp(amountPoisha: Poisha, rateBp: BasisPoints): Poisha {
  assertIntegerPoisha(amountPoisha, 'amountPoisha');
  assertBasisPoints(rateBp, 'rateBp');

  if (amountPoisha === 0 || rateBp === 0) return 0;

  const sign = amountPoisha < 0 ? BigInt(-1) : BigInt(1);
  const absAmount = BigInt(Math.abs(amountPoisha));
  const bp = BigInt(rateBp);

  const numerator = absAmount * bp + BigInt(5000);
  const result = (numerator / BigInt(10000)) * sign;
  return Number(result);
}

/**
 * Resolves Commission Priority:
 *   Product-level override > Vendor default > Global default
 */
export function resolveCommissionPriority(params: {
  productOverrideBp: number | null | undefined;
  vendorDefaultBp: number | null | undefined;
  globalDefaultBp: number;
}): { commissionBp: BasisPoints; source: CommissionSource } {
  if (params.productOverrideBp !== null && params.productOverrideBp !== undefined) {
    return {
      commissionBp: assertBasisPoints(params.productOverrideBp, 'productOverrideBp'),
      source: 'PRODUCT_OVERRIDE',
    };
  }
  if (params.vendorDefaultBp !== null && params.vendorDefaultBp !== undefined) {
    return {
      commissionBp: assertBasisPoints(params.vendorDefaultBp, 'vendorDefaultBp'),
      source: 'VENDOR_DEFAULT',
    };
  }
  return {
    commissionBp: assertBasisPoints(params.globalDefaultBp, 'globalDefaultBp'),
    source: 'GLOBAL_DEFAULT',
  };
}

/**
 * Resolves Escrow Hold Days Priority:
 *   Vendor hold_days_override > Global default hold days
 */
export function resolveEscrowHoldDays(params: {
  vendorHoldDaysOverride: number | null | undefined;
  globalHoldDays: number;
}): number {
  if (
    params.vendorHoldDaysOverride !== null &&
    params.vendorHoldDaysOverride !== undefined
  ) {
    if (!Number.isSafeInteger(params.vendorHoldDaysOverride) || params.vendorHoldDaysOverride < 0) {
      throw new RangeError('Invalid vendorHoldDaysOverride');
    }
    return params.vendorHoldDaysOverride;
  }
  if (!Number.isSafeInteger(params.globalHoldDays) || params.globalHoldDays < 0) {
    throw new RangeError('Invalid globalHoldDays');
  }
  return params.globalHoldDays;
}

/**
 * Calculates the 3-Tier Consignment Price Snapshot for an Order Item at Order Creation:
 *   Supplier Cost + Supplier Profit = Supplier Payable
 *   Supplier Payable + Platform Margin = Final Sale Price
 * If platformMarginPoisha is not explicitly set, it can be derived from commissionBp on supplierPayablePoisha.
 */
export function buildOrderItemPricingSnapshot(params: {
  unitSupplierCostPoisha: Poisha;
  unitSupplierProfitPoisha: Poisha;
  unitPlatformMarginPoisha?: Poisha;
  quantity: number;
  productCommissionOverrideBp?: number | null;
  vendorDefaultCommissionBp?: number | null;
  globalDefaultCommissionBp: number;
  vendorHoldDaysOverride?: number | null;
  globalHoldDays: number;
}): ThreeTierPriceSnapshot {
  const cost = assertIntegerPoisha(params.unitSupplierCostPoisha, 'unitSupplierCostPoisha');
  const profit = assertIntegerPoisha(params.unitSupplierProfitPoisha, 'unitSupplierProfitPoisha');
  if (cost < 0 || profit < 0) {
    throw new RangeError('Supplier cost and profit cannot be negative');
  }
  if (!Number.isSafeInteger(params.quantity) || params.quantity <= 0) {
    throw new RangeError('Quantity must be a positive integer');
  }

  const resolvedComm = resolveCommissionPriority({
    productOverrideBp: params.productCommissionOverrideBp,
    vendorDefaultBp: params.vendorDefaultCommissionBp,
    globalDefaultBp: params.globalDefaultCommissionBp,
  });

  const unitSupplierPayablePoisha = cost + profit;

  const unitPlatformMarginPoisha =
    params.unitPlatformMarginPoisha !== undefined
      ? assertIntegerPoisha(params.unitPlatformMarginPoisha, 'unitPlatformMarginPoisha')
      : applyBasisPointsHalfUp(unitSupplierPayablePoisha, resolvedComm.commissionBp);

  if (unitPlatformMarginPoisha < 0) {
    throw new RangeError('Platform margin cannot be negative');
  }

  const unitSalePricePoisha = unitSupplierPayablePoisha + unitPlatformMarginPoisha;
  const holdDays = resolveEscrowHoldDays({
    vendorHoldDaysOverride: params.vendorHoldDaysOverride,
    globalHoldDays: params.globalHoldDays,
  });

  return {
    unitSupplierCostPoisha: cost,
    unitSupplierProfitPoisha: profit,
    unitSupplierPayablePoisha,
    unitPlatformMarginPoisha,
    unitSalePricePoisha,
    commissionBp: resolvedComm.commissionBp,
    commissionSource: resolvedComm.source,
    quantity: params.quantity,
    lineSupplierPayablePoisha: unitSupplierPayablePoisha * params.quantity,
    linePlatformMarginPoisha: unitPlatformMarginPoisha * params.quantity,
    lineSubtotalPoisha: unitSalePricePoisha * params.quantity,
    escrowHoldDaysSnapshot: holdDays,
  };
}

/**
 * Validates and calculates a Promo Code discount.
 * Rule Module G: Discount deducts strictly from our Platform Margin; Supplier Payable NEVER decreases!
 */
export function calculatePromoDiscount(params: {
  promo: PromoRuleInput;
  items: ThreeTierPriceSnapshot[];
  itemVendorIds: string[];
  nowIso?: string;
}): {
  valid: boolean;
  discountPoisha: Poisha;
  newPlatformMarginPoisha: Poisha;
  totalSupplierPayablePoisha: Poisha;
  reasonBn?: string;
} {
  const { promo, items, itemVendorIds } = params;
  const now = params.nowIso ? new Date(params.nowIso).getTime() : Date.now();

  const totalSubtotalPoisha = items.reduce((sum, i) => sum + i.lineSubtotalPoisha, 0);
  const totalSupplierPayablePoisha = items.reduce(
    (sum, i) => sum + i.lineSupplierPayablePoisha,
    0
  );
  const totalPlatformMarginPoisha = items.reduce(
    (sum, i) => sum + i.linePlatformMarginPoisha,
    0
  );

  if (!promo.isActive) {
    return {
      valid: false,
      discountPoisha: 0,
      newPlatformMarginPoisha: totalPlatformMarginPoisha,
      totalSupplierPayablePoisha,
      reasonBn: 'প্রোমো কোডটি বর্তমানে চালু নেই।',
    };
  }

  if (promo.expiresAt && new Date(promo.expiresAt).getTime() < now) {
    return {
      valid: false,
      discountPoisha: 0,
      newPlatformMarginPoisha: totalPlatformMarginPoisha,
      totalSupplierPayablePoisha,
      reasonBn: 'প্রোমো কোডটির মেয়াদ শেষ হয়ে গেছে।',
    };
  }

  if (totalSubtotalPoisha < promo.minOrderSubtotalPoisha) {
    return {
      valid: false,
      discountPoisha: 0,
      newPlatformMarginPoisha: totalPlatformMarginPoisha,
      totalSupplierPayablePoisha,
      reasonBn: 'সর্বনিম্ন অর্ডার অ্যামাউন্ট পূরণ হয়নি।',
    };
  }

  // Filter eligible lines by vendor restriction if any
  const eligibleSubtotalPoisha = items.reduce((sum, item, idx) => {
    const vendorId = itemVendorIds[idx];
    if (
      promo.allowedVendorIds.length === 0 ||
      (vendorId && promo.allowedVendorIds.includes(vendorId))
    ) {
      return sum + item.lineSubtotalPoisha;
    }
    return sum;
  }, 0);

  if (eligibleSubtotalPoisha === 0) {
    return {
      valid: false,
      discountPoisha: 0,
      newPlatformMarginPoisha: totalPlatformMarginPoisha,
      totalSupplierPayablePoisha,
      reasonBn: 'এই পণ্যের জন্য প্রোমো কোডটি প্রযোজ্য নয়।',
    };
  }

  let rawDiscountPoisha = 0;
  if (promo.discountType === 'fixed_poisha') {
    rawDiscountPoisha = assertIntegerPoisha(promo.discountValue, 'promo.discountValue');
  } else {
    rawDiscountPoisha = applyBasisPointsHalfUp(
      eligibleSubtotalPoisha,
      assertBasisPoints(promo.discountValue, 'promo.discountValue')
    );
  }

  if (promo.maxDiscountPoisha !== null && rawDiscountPoisha > promo.maxDiscountPoisha) {
    rawDiscountPoisha = promo.maxDiscountPoisha;
  }

  if (rawDiscountPoisha > eligibleSubtotalPoisha) {
    rawDiscountPoisha = eligibleSubtotalPoisha;
  }

  return {
    valid: true,
    discountPoisha: rawDiscountPoisha,
    // Supplier payable remains 100% untouched; discount comes out of platform margin
    newPlatformMarginPoisha: totalPlatformMarginPoisha - rawDiscountPoisha,
    totalSupplierPayablePoisha,
  };
}

/**
 * Computes the exact UTC timestamp when a Delivered order's Locked Escrow matures into Available.
 */
export function calculateMaturityTimestamp(deliveredAtIso: string, holdDays: number): string {
  if (!Number.isSafeInteger(holdDays) || holdDays < 0) {
    throw new RangeError('holdDays must be a non-negative integer');
  }
  const deliveredMs = new Date(deliveredAtIso).getTime();
  if (Number.isNaN(deliveredMs)) {
    throw new RangeError(`Invalid deliveredAtIso: ${deliveredAtIso}`);
  }
  const maturesMs = deliveredMs + holdDays * 24 * 60 * 60 * 1000;
  return new Date(maturesMs).toISOString();
}


export function computeVendorEscrowBalance(
  vendorId: string,
  entries: readonly LedgerCalculationEntry[],
  nowIso?: string
): VendorEscrowBalance {
  if (nowIso && !Number.isFinite(Date.parse(nowIso))) throw new Error('INVALID_BALANCE_DATE');

  let pendingPoisha = 0;
  let lockedPoisha = 0;
  let availablePoisha = 0;
  let payoutHoldPoisha = 0;
  let clawbackDebtPoisha = 0;

  for (const entry of entries) {
    const amt = assertIntegerPoisha(entry.amountPoisha, `entry(${entry.id}).amountPoisha`);

    if (entry.escrowBucket === 'pending') {
      pendingPoisha += amt;
    } else if (entry.escrowBucket === 'locked') {
      lockedPoisha += amt;
    } else if (entry.escrowBucket === 'available') {
      availablePoisha += amt;
      if (entry.entryType === 'PAYOUT_HOLD') {
        payoutHoldPoisha += Math.abs(amt);
      } else if (entry.entryType === 'PAYOUT_HOLD_RELEASE' || entry.entryType === 'PAYOUT_DISBURSED') {
        payoutHoldPoisha = Math.max(0, payoutHoldPoisha - Math.abs(amt));
      } else if (entry.entryType === 'POST_PAYOUT_CLAWBACK' && amt < 0) {
        clawbackDebtPoisha += Math.abs(amt);
      }
    }
  }

  const withdrawablePoisha = Math.max(0, availablePoisha);

  return {
    vendorId,
    pendingPoisha: Math.max(0, pendingPoisha),
    lockedPoisha: Math.max(0, lockedPoisha),
    availablePoisha,
    payoutHoldPoisha,
    clawbackDebtPoisha,
    withdrawablePoisha,
  };
}

/**
 * Four-Way Return & Damage Engine (Module E):
 * 1. WAREHOUSE_PACKAGING_FAULT -> Vendor keeps 100% payable; Platform absorbs damage loss.
 * 2. SUPPLIER_DEFECT -> Vendor is debited (Hold-period reversal if in hold; Post-payout clawback if already matured/paid).
 * 3. CUSTOMER_INTACT_RETURN -> Item restocked; if in hold period, vendor earning is reversed; unrecovered courier charge is platform return loss.
 * 4. COURIER_NEGLIGENCE -> Vendor is NOT blamed (keeps full payable); Courier Claim is created for full sale value.
 */
export function evaluateFourWayReturn(params: {
  faultType: ReturnFaultType;
  quantity: number;
  unitSupplierPayablePoisha: Poisha;
  unitSalePricePoisha: Poisha;
  unrecoveredCourierChargePoisha: Poisha;
  wasInHoldPeriod: boolean;
  wasAlreadyPaidOut: boolean;
}): ReturnResolutionCalculation {
  const {
    faultType,
    quantity,
    unitSupplierPayablePoisha,
    unitSalePricePoisha,
    unrecoveredCourierChargePoisha,
    wasInHoldPeriod,
    wasAlreadyPaidOut,
  } = params;

  assertIntegerPoisha(unitSupplierPayablePoisha, 'unitSupplierPayablePoisha');
  assertIntegerPoisha(unitSalePricePoisha, 'unitSalePricePoisha');
  assertIntegerPoisha(unrecoveredCourierChargePoisha, 'unrecoveredCourierChargePoisha');

  const lineSupplierPayable = unitSupplierPayablePoisha * quantity;
  const lineSaleAmount = unitSalePricePoisha * quantity;

  switch (faultType) {
    case 'WAREHOUSE_PACKAGING_FAULT': {
      // Fault 1: Admin/Warehouse fault -> Supplier gets full payable; our net profit absorbs the loss
      return {
        faultType,
        wasInHoldPeriod,
        wasAlreadyPaidOut,
        vendorDebitPoisha: 0,
        platformLossPoisha: lineSupplierPayable + unrecoveredCourierChargePoisha,
        courierClaimPoisha: 0,
        restockQuantity: 0,
        ledgerEntryToInsert: null,
        shouldCreateCourierClaim: false,
      };
    }

    case 'SUPPLIER_DEFECT': {
      // Fault 2: Supplier defect -> Deduct from supplier ledger
      const bucket = wasInHoldPeriod && !wasAlreadyPaidOut ? 'locked' : 'available';
      const entryType =
        wasInHoldPeriod && !wasAlreadyPaidOut
          ? 'HOLD_PERIOD_RETURN_REVERSAL'
          : 'POST_PAYOUT_CLAWBACK';

      return {
        faultType,
        wasInHoldPeriod,
        wasAlreadyPaidOut,
        vendorDebitPoisha: lineSupplierPayable,
        platformLossPoisha: unrecoveredCourierChargePoisha,
        courierClaimPoisha: 0,
        restockQuantity: 0,
        ledgerEntryToInsert: {
          entryType,
          escrowBucket: bucket,
          amountPoisha: -lineSupplierPayable,
        },
        shouldCreateCourierClaim: false,
      };
    }

    case 'CUSTOMER_INTACT_RETURN': {
      // Fault 3: Customer intact return -> Verify & restock to main inventory; cancel earning
      const bucket = wasInHoldPeriod && !wasAlreadyPaidOut ? 'locked' : 'available';
      const entryType =
        wasInHoldPeriod && !wasAlreadyPaidOut
          ? 'HOLD_PERIOD_RETURN_REVERSAL'
          : 'POST_PAYOUT_CLAWBACK';

      return {
        faultType,
        wasInHoldPeriod,
        wasAlreadyPaidOut,
        vendorDebitPoisha: lineSupplierPayable,
        platformLossPoisha: unrecoveredCourierChargePoisha,
        courierClaimPoisha: 0,
        restockQuantity: quantity,
        ledgerEntryToInsert: {
          entryType,
          escrowBucket: bucket,
          amountPoisha: -lineSupplierPayable,
        },
        shouldCreateCourierClaim: false,
      };
    }

    case 'COURIER_NEGLIGENCE': {
      // Fault 4: Courier negligence -> Supplier is NOT responsible; goes to Courier Claim Tracker
      return {
        faultType,
        wasInHoldPeriod,
        wasAlreadyPaidOut,
        vendorDebitPoisha: 0,
        platformLossPoisha: 0,
        courierClaimPoisha: lineSaleAmount,
        restockQuantity: 0,
        ledgerEntryToInsert: null,
        shouldCreateCourierClaim: true,
      };
    }
  }
}

/**
 * Validates whether a Vendor Payout Request can be placed from Available balance.
 */
export function validatePayoutRequestEligibility(params: {
  requestedAmountPoisha: Poisha;
  withdrawablePoisha: Poisha;
  minPayoutPoisha: Poisha;
}): { allowed: boolean; reasonBn?: string } {
  const req = assertIntegerPoisha(params.requestedAmountPoisha, 'requestedAmountPoisha');
  const avail = assertIntegerPoisha(params.withdrawablePoisha, 'withdrawablePoisha');
  const min = assertIntegerPoisha(params.minPayoutPoisha, 'minPayoutPoisha');

  if (req <= 0) {
    return { allowed: false, reasonBn: 'উত্তোলনের পরিমাণ অবশ্যই শূন্যের বেশি হতে হবে।' };
  }
  if (req < min) {
    return {
      allowed: false,
      reasonBn: `সর্বনিম্ন উত্তোলনযোগ্য পরিমাণ ${formatPoishaToBdt(min, 'bn')}।`,
    };
  }
  if (req > avail) {
    return {
      allowed: false,
      reasonBn: 'আপনার উত্তোলনযোগ্য (Available) ব্যালেন্সের চেয়ে বেশি টাকা রিকোয়েস্ট করা যাবে না।',
    };
  }
  return { allowed: true };
}

/**
 * Auto Net Profit Formula (Module G - Admin Only):
 *   Net Profit = Gross Delivered Sales
 *              - Supplier Payable
 *              - Promo Discounts
 *              - Ad Spend
 *              - Packaging Costs
 *              - Unrecovered Courier Charges
 *              - Return Losses
 *              - Warehouse Damage Losses
 *              - Other Operating Expenses
 */
export function calculateAutoNetProfit(params: {
  grossDeliveredSalesPoisha: Poisha;
  supplierPayablePoisha: Poisha;
  promoDiscountPoisha: Poisha;
  adSpendPoisha: Poisha;
  packagingCostPoisha: Poisha;
  unrecoveredCourierChargePoisha: Poisha;
  returnLossPoisha: Poisha;
  damageLossPoisha: Poisha;
  otherExpensePoisha: Poisha;
}): {
  grossMarginPoisha: Poisha;
  totalDeductionsPoisha: Poisha;
  netProfitPoisha: Poisha;
  isLoss: boolean;
} {
  const sales = assertIntegerPoisha(params.grossDeliveredSalesPoisha, 'grossDeliveredSalesPoisha');
  const supplierPayable = assertIntegerPoisha(params.supplierPayablePoisha, 'supplierPayablePoisha');
  const discount = assertIntegerPoisha(params.promoDiscountPoisha, 'promoDiscountPoisha');
  const adSpend = assertIntegerPoisha(params.adSpendPoisha, 'adSpendPoisha');
  const packaging = assertIntegerPoisha(params.packagingCostPoisha, 'packagingCostPoisha');
  const unrecoveredCourier = assertIntegerPoisha(
    params.unrecoveredCourierChargePoisha,
    'unrecoveredCourierChargePoisha'
  );
  const returnLoss = assertIntegerPoisha(params.returnLossPoisha, 'returnLossPoisha');
  const damageLoss = assertIntegerPoisha(params.damageLossPoisha, 'damageLossPoisha');
  const otherExpense = assertIntegerPoisha(params.otherExpensePoisha, 'otherExpensePoisha');

  const grossMarginPoisha = sales - supplierPayable - discount;
  const totalDeductionsPoisha =
    adSpend + packaging + unrecoveredCourier + returnLoss + damageLoss + otherExpense;
  const netProfitPoisha = grossMarginPoisha - totalDeductionsPoisha;

  return {
    grossMarginPoisha,
    totalDeductionsPoisha,
    netProfitPoisha,
    isLoss: netProfitPoisha < 0,
  };
}

/**
 * Calculates weight-based Delivery Charge in exact integer Poisha (Module C & Checkout):
 * - Supports Courier Home Delivery (base 1kg + extra per kg above 1kg)
 * - Supports Bangladesh Post Office (flat per kg rate)
 * - Automatically applies Free Delivery if global free delivery, all items free delivery, or order subtotal >= threshold.
 */
export function calculateDeliveryCharge(params: {
  method: 'courier' | 'post_office' | 'free';
  totalWeightGrams: number;
  orderSubtotalPoisha: Poisha;
  freeDeliveryThresholdPoisha: Poisha;
  isGlobalFreeDelivery: boolean;
  isAllItemsFreeDelivery: boolean;
  courierBaseRate1KgPoisha: Poisha;
  courierExtraPerKgPoisha: Poisha;
  bdPostPerKgPoisha: Poisha;
}): {
  finalChargePoisha: Poisha;
  actualCourierCostPoisha: Poisha;
  isFreeDeliveryApplied: boolean;
} {
  const totalKgCeil = Math.max(1, Math.ceil(Math.max(1, params.totalWeightGrams) / 1000));
  const extraKg = Math.max(0, totalKgCeil - 1);

  const rawCourierPoisha =
    params.courierBaseRate1KgPoisha + extraKg * params.courierExtraPerKgPoisha;
  const rawBdPostPoisha = totalKgCeil * params.bdPostPerKgPoisha;

  const actualCourierCostPoisha =
    params.method === 'post_office' ? rawBdPostPoisha : rawCourierPoisha;

  const isFreeDeliveryApplied =
    params.method === 'free' ||
    params.isGlobalFreeDelivery ||
    params.isAllItemsFreeDelivery ||
    (params.freeDeliveryThresholdPoisha > 0 &&
      params.orderSubtotalPoisha >= params.freeDeliveryThresholdPoisha);

  return {
    finalChargePoisha: isFreeDeliveryApplied ? 0 : actualCourierCostPoisha,
    actualCourierCostPoisha,
    isFreeDeliveryApplied,
  };
}

/**
 * Formats integer poisha to human-readable BDT string in Bangla or English:
 *   125000 -> "৳ ১,২৫০" (or "৳ ১,২৫০.৫০" if fractional poisha exists)
 */
export function formatPoishaToBdt(
  amountPoisha: Poisha,
  locale: 'bn' | 'en' = 'bn',
  options?: { alwaysShowPoisha?: boolean }
): string {
  assertIntegerPoisha(amountPoisha, 'amountPoisha');

  const isNegative = amountPoisha < 0;
  const absPoisha = Math.abs(amountPoisha);
  const taka = Math.floor(absPoisha / 100);
  const remPoisha = absPoisha % 100;

  const formattedTaka = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD').format(taka);

  let formatted = `৳ ${formattedTaka}`;
  if (remPoisha > 0 || options?.alwaysShowPoisha) {
    const padded = String(remPoisha).padStart(2, '0');
    const frac =
      locale === 'bn'
        ? padded.replace(/\d/g, (d) => BENGALI_DIGITS[Number(d)])
        : padded;
    formatted += `.${frac}`;
  }

  return isNegative ? `-${formatted}` : formatted;
}

