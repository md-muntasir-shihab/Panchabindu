// src/lib/db/product-sync.ts
// Product-Vendor Database Connection & Ledger Synchronization Engine
// Ensures:
//   1. Every product is linked to a valid, active VendorProfileRecord in the database.
//   2. Vendor metadata (vendorId, vendorCode, vendorBusinessName) is synchronized across product records.
//   3. Three-tier consignment pricing is automatically computed & verified:
//        Supplier Cost + Supplier Profit = Supplier Payable
//        Supplier Payable + Platform Margin = Final Sale Price
//   4. Automated margin calculations adhere to commission priority:
//        Product Override Bp -> Vendor Default Commission Bp -> Global Default (1500 bp / 15%)
//   5. Internal Vendor SKUs are tied to vendor codes for warehouse Part 3 packing slips.
//   6. Product sales and consignment inventory are connected to the Vendor's Immutable Ledger.

import {
  readErpState,
  writeErpState,
  type InternalProductRecord,
  type InternalVariantRecord,
} from '@/src/lib/db/repository';
import {
  readPhase4BStore,
  writePhase4BStore,
  type VendorProfileRecord,
  type ImmutableVendorLedgerRecord,
} from '@/src/lib/admin/phase4b-service';
import type {
  BasisPoints,
  Poisha,
  ThreeTierPriceSnapshot,
  CommissionSource,
} from '@/src/types/domain';
import type { EscrowBucket, VendorLedgerEntryType } from '@/src/types/database.types';
import {
  assertIntegerPoisha,
  assertBasisPoints,
  resolveCommissionPriority,
  applyBasisPointsHalfUp,
  formatPoishaToBdt,
} from '@/src/lib/money';

export const GLOBAL_DEFAULT_COMMISSION_BP: BasisPoints = 1500; // 15.00%
export const GLOBAL_ESCROW_HOLD_DAYS = 3; // 72 hours post-delivery

export interface ProductMarginCalculationResult {
  supplierCostPoisha: Poisha;
  supplierProfitPoisha: Poisha;
  supplierPayablePoisha: Poisha;
  platformMarginPoisha: Poisha;
  salePricePoisha: Poisha;
  commissionBp: BasisPoints;
  commissionSource: CommissionSource;
  marginPercentFormatted: string;
  vendorPayableSharePercent: string;
}

export interface ProductSyncResult {
  success: boolean;
  errorBn?: string;
  errorEn?: string;
  product?: InternalProductRecord;
  vendor?: VendorProfileRecord;
  marginSummary?: ProductMarginCalculationResult;
}

export interface BatchProductSyncReport {
  totalScanned: number;
  syncedCount: number;
  repairedCount: number;
  orphanedCount: number;
  orphanedProductIds: string[];
  details: Array<{
    productId: string;
    productNameBn: string;
    vendorId: string;
    vendorCode: string;
    vendorNameBn: string;
    status: 'synced' | 'repaired' | 'orphaned';
    variantCount: number;
    sampleMarginBn: string;
  }>;
}

export interface ProductVendorLinkValidation {
  isValid: boolean;
  productId: string;
  vendorId: string;
  vendorProfile?: VendorProfileRecord;
  errorBn?: string;
  errorEn?: string;
  marginSafeguardPassed: boolean;
  ledgerLinked: boolean;
}

/**
 * Resolves an existing vendor profile by vendorId.
 * Checks the database (Phase 4B store) and ensures the vendor exists and is active.
 */
export function resolveVendorProfile(vendorId: string): VendorProfileRecord | null {
  const p4bStore = readPhase4BStore();
  const normalizedId = vendorId.trim();
  const vendor = p4bStore.vendors.find(
    (v) => v.vendorId === normalizedId || v.vendorCode.toLowerCase() === normalizedId.toLowerCase()
  );
  return vendor ?? null;
}

/**
 * Calculates the automated margin and 3-tier price breakdown for a product variant.
 * Formula:
 *   Supplier Payable = Cost + Profit
 *   Commission priority: Product Override -> Vendor Default -> Global Default (1500 bp)
 *   Platform Margin = Commission on Supplier Payable
 *   Final Sale Price = Supplier Payable + Platform Margin
 */
export function calculateAutomatedMargin(params: {
  supplierCostPoisha: Poisha;
  supplierProfitPoisha?: Poisha;
  explicitPlatformMarginPoisha?: Poisha;
  explicitSalePricePoisha?: Poisha;
  productCommissionOverrideBp?: number | null;
  vendorDefaultCommissionBp?: number | null;
}): ProductMarginCalculationResult {
  const cost = assertIntegerPoisha(params.supplierCostPoisha, 'supplierCostPoisha');
  const profit = assertIntegerPoisha(params.supplierProfitPoisha ?? 0, 'supplierProfitPoisha');

  if (cost <= 0) {
    throw new RangeError('সাপ্লায়ার কস্ট শূন্যের বেশি হতে হবে (Cost must be greater than zero).');
  }

  const supplierPayablePoisha = cost + profit;

  const resolvedComm = resolveCommissionPriority({
    productOverrideBp: params.productCommissionOverrideBp,
    vendorDefaultBp: params.vendorDefaultCommissionBp,
    globalDefaultBp: GLOBAL_DEFAULT_COMMISSION_BP,
  });

  let platformMarginPoisha: Poisha;
  let salePricePoisha: Poisha;

  if (params.explicitSalePricePoisha !== undefined && params.explicitSalePricePoisha > 0) {
    salePricePoisha = assertIntegerPoisha(params.explicitSalePricePoisha, 'salePricePoisha');
    if (salePricePoisha <= supplierPayablePoisha) {
      throw new RangeError(
        `বিক্রয়মূল্য (${salePricePoisha / 100} ৳) প্রদেয় মূল্যের (${supplierPayablePoisha / 100} ৳) চেয়ে বেশি হতে হবে।`
      );
    }
    platformMarginPoisha = salePricePoisha - supplierPayablePoisha;
  } else if (params.explicitPlatformMarginPoisha !== undefined && params.explicitPlatformMarginPoisha >= 0) {
    platformMarginPoisha = assertIntegerPoisha(
      params.explicitPlatformMarginPoisha,
      'platformMarginPoisha'
    );
    salePricePoisha = supplierPayablePoisha + platformMarginPoisha;
  } else {
    // Automatically derive margin from resolved commission basis points
    platformMarginPoisha = applyBasisPointsHalfUp(supplierPayablePoisha, resolvedComm.commissionBp);
    salePricePoisha = supplierPayablePoisha + platformMarginPoisha;
  }

  const marginPct = ((platformMarginPoisha / salePricePoisha) * 100).toFixed(1);
  const vendorSharePct = ((supplierPayablePoisha / salePricePoisha) * 100).toFixed(1);

  return {
    supplierCostPoisha: cost,
    supplierProfitPoisha: profit,
    supplierPayablePoisha,
    platformMarginPoisha,
    salePricePoisha,
    commissionBp: resolvedComm.commissionBp,
    commissionSource: resolvedComm.source,
    marginPercentFormatted: `${marginPct}%`,
    vendorPayableSharePercent: `${vendorSharePct}%`,
  };
}

/**
 * Connects and synchronizes a newly created or updated product with its vendor profile and ledger.
 * - Validates vendor existence and active status.
 * - Enforces vendorCode and vendorBusinessName on the product.
 * - Generates synchronized internal vendor SKUs (`${vendorCode}-${publicSku}`).
 * - Recalculates 3-tier pricing and automated platform margins across all variants.
 * - Persists updates to the database (ERP repository).
 */
export function syncProductWithVendorProfile(
  product: InternalProductRecord,
  options?: {
    recordLedgerLinkageAudit?: boolean;
    operatorUsername?: string;
  }
): ProductSyncResult {
  const vendor = resolveVendorProfile(product.vendorId);
  if (!vendor) {
    return {
      success: false,
      errorBn: `ভেন্ডর আইডি "${product.vendorId}" ডাটাবেজে পাওয়া যায়নি।`,
      errorEn: `Vendor profile for ID "${product.vendorId}" not found in database.`,
    };
  }

  if (vendor.status !== 'active') {
    return {
      success: false,
      errorBn: `ভেন্ডর "${vendor.businessNameBn}" বর্তমানে সক্রিয় (Active) অবস্থায় নেই।`,
      errorEn: `Vendor "${vendor.businessNameEn}" is currently not active (status: ${vendor.status}).`,
    };
  }

  // Synchronize product-level vendor metadata
  product.vendorId = vendor.vendorId;
  product.vendorCode = vendor.vendorCode;
  product.vendorBusinessName = vendor.businessNameBn;

  let firstVariantMargin: ProductMarginCalculationResult | undefined;

  // Synchronize all variants
  product.variants = product.variants.map((v, idx) => {
    const margin = calculateAutomatedMargin({
      supplierCostPoisha: v.supplierCostPoisha,
      supplierProfitPoisha: v.supplierProfitPoisha,
      explicitPlatformMarginPoisha: v.platformMarginPoisha,
      explicitSalePricePoisha: v.salePricePoisha,
      productCommissionOverrideBp: product.commissionOverrideBp,
      vendorDefaultCommissionBp: vendor.defaultCommissionBp,
    });

    if (idx === 0) {
      firstVariantMargin = margin;
    }

    const publicSku = v.publicSku.trim().toUpperCase();
    const internalVendorSku =
      v.internalVendorSku && v.internalVendorSku.startsWith(`${vendor.vendorCode}-`)
        ? v.internalVendorSku
        : `${vendor.vendorCode}-${publicSku}`;

    return {
      ...v,
      publicSku,
      internalVendorSku,
      supplierCostPoisha: margin.supplierCostPoisha,
      supplierProfitPoisha: margin.supplierProfitPoisha,
      supplierPayablePoisha: margin.supplierPayablePoisha,
      platformMarginPoisha: margin.platformMarginPoisha,
      salePricePoisha: margin.salePricePoisha,
    };
  });

  // Persist updated product to ERP store
  const state = readErpState();
  const existingIdx = state.products.findIndex((p) => p.productId === product.productId);
  if (existingIdx >= 0) {
    state.products[existingIdx] = product;
  } else {
    state.products.unshift(product);
  }
  writeErpState(state);

  // Optionally record ledger audit linkage
  if (options?.recordLedgerLinkageAudit) {
    recordProductCatalogLedgerEntry({
      vendorId: vendor.vendorId,
      vendorCode: vendor.vendorCode,
      productId: product.productId,
      productNameBn: product.nameBn,
      variantCount: product.variants.length,
      operatorUsername: options.operatorUsername ?? 'system_sync',
    });
  }

  return {
    success: true,
    product,
    vendor,
    marginSummary: firstVariantMargin,
  };
}

/**
 * Validates the database linkage between a specific product and a vendor profile.
 */
export function validateProductVendorLink(productId: string): ProductVendorLinkValidation {
  const state = readErpState();
  const product = state.products.find((p) => p.productId === productId);
  if (!product) {
    return {
      isValid: false,
      productId,
      vendorId: '',
      marginSafeguardPassed: false,
      ledgerLinked: false,
      errorBn: 'পণ্যটি ডাটাবেজে পাওয়া যায়নি।',
      errorEn: 'Product not found in database.',
    };
  }

  const vendor = resolveVendorProfile(product.vendorId);
  if (!vendor) {
    return {
      isValid: false,
      productId,
      vendorId: product.vendorId,
      marginSafeguardPassed: false,
      ledgerLinked: false,
      errorBn: `ভেন্ডর প্রোফাইল "${product.vendorId}" অনুপস্থিত।`,
      errorEn: `Vendor profile for ID "${product.vendorId}" is missing.`,
    };
  }

  // Verify all variants have valid non-negative platform margins and integer math
  const marginSafeguardPassed = product.variants.every((v) => {
    return (
      v.supplierCostPoisha > 0 &&
      v.supplierPayablePoisha === v.supplierCostPoisha + v.supplierProfitPoisha &&
      v.platformMarginPoisha >= 0 &&
      v.salePricePoisha === v.supplierPayablePoisha + v.platformMarginPoisha
    );
  });

  // Check if vendor ledger has order or inventory history for this vendor
  const p4bStore = readPhase4BStore();
  const ledgerLinked = p4bStore.vendorLedger.some((entry) => entry.vendorId === vendor.vendorId);

  return {
    isValid: true,
    productId,
    vendorId: vendor.vendorId,
    vendorProfile: vendor,
    marginSafeguardPassed,
    ledgerLinked,
  };
}

/**
 * Scans all products in the database and synchronizes them with existing vendor profiles.
 * Detects orphaned products, fixes vendor codes/names, and ensures margin integrity.
 */
export function syncAllProductsWithVendors(): BatchProductSyncReport {
  const state = readErpState();
  const report: BatchProductSyncReport = {
    totalScanned: state.products.length,
    syncedCount: 0,
    repairedCount: 0,
    orphanedCount: 0,
    orphanedProductIds: [],
    details: [],
  };

  let hasUpdates = false;

  for (const product of state.products) {
    const vendor = resolveVendorProfile(product.vendorId);

    if (!vendor) {
      report.orphanedCount += 1;
      report.orphanedProductIds.push(product.productId);
      report.details.push({
        productId: product.productId,
        productNameBn: product.nameBn,
        vendorId: product.vendorId,
        vendorCode: product.vendorCode,
        vendorNameBn: product.vendorBusinessName,
        status: 'orphaned',
        variantCount: product.variants.length,
        sampleMarginBn: 'অনাথ পণ্য (ভেন্ডর প্রোফাইল নেই)',
      });
      continue;
    }

    const needsRepair =
      product.vendorCode !== vendor.vendorCode ||
      product.vendorBusinessName !== vendor.businessNameBn ||
      product.variants.some(
        (v) =>
          !v.internalVendorSku.startsWith(`${vendor.vendorCode}-`) ||
          v.supplierPayablePoisha !== v.supplierCostPoisha + v.supplierProfitPoisha ||
          v.salePricePoisha !== v.supplierPayablePoisha + v.platformMarginPoisha
      );

    const syncRes = syncProductWithVendorProfile(product);

    if (syncRes.success && syncRes.product) {
      if (needsRepair) {
        report.repairedCount += 1;
        hasUpdates = true;
      } else {
        report.syncedCount += 1;
      }

      const sampleMargin = syncRes.marginSummary
        ? `বিক্রয়: ${formatPoishaToBdt(syncRes.marginSummary.salePricePoisha)} | প্রদেয়: ${formatPoishaToBdt(syncRes.marginSummary.supplierPayablePoisha)} | মার্জিন: ${formatPoishaToBdt(syncRes.marginSummary.platformMarginPoisha)} (${syncRes.marginSummary.marginPercentFormatted})`
        : 'সফলভাবে সিঙ্কড';

      report.details.push({
        productId: product.productId,
        productNameBn: product.nameBn,
        vendorId: vendor.vendorId,
        vendorCode: vendor.vendorCode,
        vendorNameBn: vendor.businessNameBn,
        status: needsRepair ? 'repaired' : 'synced',
        variantCount: product.variants.length,
        sampleMarginBn: sampleMargin,
      });
    }
  }

  return report;
}

/**
 * Returns all products currently linked to a specific vendor ID.
 */
export function getProductsByVendor(vendorId: string): InternalProductRecord[] {
  const state = readErpState();
  const normalizedId = vendorId.trim();
  return state.products.filter(
    (p) => p.vendorId === normalizedId || p.vendorCode.toLowerCase() === normalizedId.toLowerCase()
  );
}

/**
 * Records an immutable catalog linkage log entry in the vendor ledger for administrative auditability.
 */
function recordProductCatalogLedgerEntry(params: {
  vendorId: string;
  vendorCode: string;
  productId: string;
  productNameBn: string;
  variantCount: number;
  operatorUsername: string;
}): ImmutableVendorLedgerRecord {
  const p4bStore = readPhase4BStore();
  const entryId = `led-cat-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`;

  const ledgerEntry: ImmutableVendorLedgerRecord = {
    id: entryId,
    vendorId: params.vendorId,
    vendorCode: params.vendorCode,
    orderNo: null,
    orderItemId: null,
    entryType: 'MANUAL_ADJUSTMENT',
    escrowBucket: 'available',
    amountPoisha: 0, // Zero balance impact audit log
    deliveredAt: null,
    maturesAt: null,
    descriptionBn: `পণ্য ক্যাটালগ সিঙ্ক: "${params.productNameBn}" (${params.variantCount}টি ভ্যারিয়েন্ট) সফলভাবে ভেন্ডর প্রোফাইল ও লেজারের সাথে সংযুক্ত হয়েছে।`,
    recordedByUsername: params.operatorUsername,
    createdAt: new Date().toISOString(),
  };

  p4bStore.vendorLedger.unshift(ledgerEntry);
  writePhase4BStore(p4bStore);

  return ledgerEntry;
}

/**
 * Automates vendor ledger entry creation when an order containing the product is placed or delivered.
 * Calculates exact supplier payable in integer Poisha based on the 3-tier price snapshot.
 */
export function recordVendorProductOrderAccrual(params: {
  orderNo: string;
  orderItemId: string;
  productId: string;
  variantId: string;
  quantity: number;
  deliveredAtIso?: string;
  operatorUsername?: string;
}): {
  success: boolean;
  ledgerEntry?: ImmutableVendorLedgerRecord;
  pricingSnapshot?: ThreeTierPriceSnapshot;
  errorBn?: string;
} {
  const state = readErpState();
  const product = state.products.find((p) => p.productId === params.productId);
  if (!product) {
    return { success: false, errorBn: 'পণ্য খুঁজে পাওয়া যায়নি।' };
  }

  const variant = product.variants.find((v) => v.variantId === params.variantId);
  if (!variant) {
    return { success: false, errorBn: 'ভ্যারিয়েন্ট খুঁজে পাওয়া যায়নি।' };
  }

  const vendor = resolveVendorProfile(product.vendorId);
  if (!vendor) {
    return { success: false, errorBn: 'ভেন্ডর প্রোফাইল খুঁজে পাওয়া যায়নি।' };
  }

  const unitSupplierPayablePoisha = variant.supplierPayablePoisha;
  const lineSupplierPayablePoisha = unitSupplierPayablePoisha * params.quantity;
  const unitPlatformMarginPoisha = variant.platformMarginPoisha;
  const linePlatformMarginPoisha = unitPlatformMarginPoisha * params.quantity;
  const unitSalePricePoisha = variant.salePricePoisha;
  const lineSubtotalPoisha = unitSalePricePoisha * params.quantity;

  const isDelivered = Boolean(params.deliveredAtIso);
  const escrowBucket: EscrowBucket = isDelivered ? 'locked' : 'pending';
  const entryType: VendorLedgerEntryType = isDelivered ? 'EARNING_LOCKED' : 'EARNING_PENDING';

  const holdDays = vendor.escrowHoldDaysOverride ?? GLOBAL_ESCROW_HOLD_DAYS;
  const maturesAt = params.deliveredAtIso
    ? new Date(
        new Date(params.deliveredAtIso).getTime() + holdDays * 86_400_000
      ).toISOString()
    : null;

  const p4bStore = readPhase4BStore();
  const ledgerId = `led-ord-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`;

  const ledgerEntry: ImmutableVendorLedgerRecord = {
    id: ledgerId,
    vendorId: vendor.vendorId,
    vendorCode: vendor.vendorCode,
    orderNo: params.orderNo,
    orderItemId: params.orderItemId,
    entryType,
    escrowBucket,
    amountPoisha: lineSupplierPayablePoisha,
    deliveredAt: params.deliveredAtIso ?? null,
    maturesAt,
    descriptionBn: `অর্ডার ${params.orderNo}: ${product.nameBn} (${variant.titleBn}) x ${params.quantity} পিস — প্রদেয় মূল্য জমা।`,
    recordedByUsername: params.operatorUsername ?? 'system_escrow',
    createdAt: new Date().toISOString(),
  };

  p4bStore.vendorLedger.unshift(ledgerEntry);
  writePhase4BStore(p4bStore);

  const snapshot: ThreeTierPriceSnapshot = {
    unitSupplierCostPoisha: variant.supplierCostPoisha,
    unitSupplierProfitPoisha: variant.supplierProfitPoisha,
    unitSupplierPayablePoisha,
    unitPlatformMarginPoisha,
    unitSalePricePoisha,
    commissionBp: vendor.defaultCommissionBp ?? GLOBAL_DEFAULT_COMMISSION_BP,
    commissionSource: product.commissionOverrideBp
      ? 'PRODUCT_OVERRIDE'
      : vendor.defaultCommissionBp
      ? 'VENDOR_DEFAULT'
      : 'GLOBAL_DEFAULT',
    quantity: params.quantity,
    lineSupplierPayablePoisha,
    linePlatformMarginPoisha,
    lineSubtotalPoisha,
    escrowHoldDaysSnapshot: holdDays,
  };

  return {
    success: true,
    ledgerEntry,
    pricingSnapshot: snapshot,
  };
}
