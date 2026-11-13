// src/lib/admin/phase7-service.ts
// Server-Side Admin & Vendor ERP Service (Phase 7 — Module T):
//   1. Self-Service Vendor Consignment Portal:
//      - Consignment Stock Dispatch Lot Queue (LOT-...) -> Warehouse QC Approval -> Auto Stock Increment
//      - Vendor Cost / Retail Price Change Proposals (PRQ-...) -> 3-Tier Poisha Split Recalculation
//   2. Automated Escrow Maturity Promoter & Vendor Commission/Cashout Fee Statement:
//      - Batch promotion of matured Locked Escrow -> Available Balance (EARNING_MATURED)
//      - Per-Vendor Payout Fee Calculator (bKash 185 bp vs Bank 0 bp)
//   3. Margin-Safe Flash-Sale Campaign Engine:
//      - Enforces Golden Consignment Rule: Flash discount NEVER exceeds platformMarginPoisha
//   4. Executive BDT Double-Entry Accounting & VAT/Tax Ledger:
//      - Cash Collected vs Courier Receivable vs Vendor Escrow Liability vs Platform VAT (500 bp on Margin)

import path from 'node:path';
import { readLocalJsonStore, writeLocalJsonStore } from '../db/local-json-store';
import type { Poisha } from '../../types/domain';
import {
  checkMakerCheckerSeparation,
  type ActorSecurityContext,
} from '../../types/permissions';
import { readErpState, writeErpState } from '../db/repository';
import { computeVendorEscrowBalance } from '../money';
import {
  appendImmutableAuditLog,
  readAdminStore,
  verifyAdminActorTotp,
  writeAdminStore,
} from './phase4a-service';
import {
  readPhase4BStore,
  writePhase4BStore,
  type ImmutableVendorLedgerRecord,
} from './phase4b-service';
import { readPhase4CStore } from './phase4c-service';

// ============================================================================
// 1. INTERFACES & DATA STRUCTURES (PHASE 7 — MODULE T)
// ============================================================================

export type ConsignmentLotStatus =
  | 'pending_qc'
  | 'approved_stocked'
  | 'rejected';

export interface ConsignmentDispatchLotRecord {
  lotId: string;
  lotCode: string;
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  productId: string;
  variantId: string;
  productNameBn: string;
  variantTitleBn: string;
  publicSku: string;
  dispatchedQty: number;
  qcAcceptedQty: number | null;
  qcRejectedQty: number | null;
  unitSupplierCostPoisha: Poisha;
  challanRef: string;
  status: ConsignmentLotStatus;
  noteBn: string;
  reviewedByUsername: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export type PriceProposalStatus = 'pending_review' | 'approved' | 'rejected';

export interface VendorPriceProposalRecord {
  proposalId: string;
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  productId: string;
  variantId: string;
  productNameBn: string;
  publicSku: string;
  currentSupplierCostPoisha: Poisha;
  currentSalePricePoisha: Poisha;
  proposedSupplierCostPoisha: Poisha;
  proposedSalePricePoisha: Poisha;
  proposedCommissionBp: number;
  projectedPlatformMarginPoisha: Poisha;
  reasonBn: string;
  status: PriceProposalStatus;
  reviewedByUsername: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface FlashSaleCampaignRecord {
  campaignId: string;
  campaignCode: string;
  titleBn: string;
  productId: string;
  variantId: string;
  productNameBn: string;
  publicSku: string;
  regularSalePricePoisha: Poisha;
  supplierPayablePoisha: Poisha;
  regularPlatformMarginPoisha: Poisha;
  flashDiscountPoisha: Poisha;
  flashSalePricePoisha: Poisha;
  remainingPlatformMarginPoisha: Poisha;
  maxUnitsQuota: number;
  soldUnitsCount: number;
  isActive: boolean;
  createdByUsername: string;
  createdAt: string;
}

export interface EscrowMaturityBatchRecord {
  batchId: string;
  promotedEntriesCount: number;
  totalPromotedPoisha: Poisha;
  affectedVendorCodes: string[];
  executedByUsername: string;
  executedAt: string;
  summaryBn: string;
}

export interface ExecutiveAccountingSummaryDTO {
  totalDeliveredGrossRevenuePoisha: Poisha;
  totalCashRemittedAndAdvancePoisha: Poisha;
  totalCourierUnsettledReceivablePoisha: Poisha;
  totalVendorPendingLiabilityPoisha: Poisha;
  totalVendorLockedLiabilityPoisha: Poisha;
  totalVendorAvailableLiabilityPoisha: Poisha;
  totalVendorPaidDisbursedPoisha: Poisha;
  grossPlatformCommissionEarnedPoisha: Poisha;
  totalPromoAndFlashSubsidyPoisha: Poisha;
  totalOperatingAndAdExpensesPoisha: Poisha;
  estimatedVatOnMarginPoisha: Poisha; // 500 bp (5%) VAT on net platform commission margin
  netRetainedPlatformProfitPoisha: Poisha;
  payoutFeeSchedule: Array<{
    methodNameBn: string;
    feeRateBp: number;
    sample10kPayoutGrossPoisha: Poisha;
    sample10kFeeDeductedPoisha: Poisha;
    sample10kNetReceivedPoisha: Poisha;
  }>;
}

export type OfferAllocationPolicy =
  | 'priority_rank'
  | 'lowest_payable_highest_margin'
  | 'highest_stock';

export interface SupplierProductOfferRecord {
  offerId: string;
  productId: string;
  variantId: string;
  publicSku: string;
  productNameBn: string;
  variantTitleBn: string;
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  internalVendorSku: string;
  supplierCostPoisha: Poisha;
  supplierProfitPoisha: Poisha;
  supplierPayablePoisha: Poisha;
  salePricePoisha: Poisha;
  platformMarginPoisha: Poisha;
  stockAvailable: number;
  leadTimeDays: number;
  priorityRank: number;
  isActive: boolean;
  updatedAt: string;
}

export interface VendorFulfillmentGroupRecord {
  groupId: string;
  groupCode: string;
  orderNo: string;
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  allocationPolicyUsed: OfferAllocationPolicy;
  fulfillmentStatus:
    | 'allocated'
    | 'packed'
    | 'shipped'
    | 'delivered'
    | 'returned';
  totalUnits: number;
  groupSaleSubtotalPoisha: Poisha;
  groupSupplierCostPoisha: Poisha;
  groupSupplierProfitPoisha: Poisha;
  groupSupplierPayablePoisha: Poisha;
  groupPlatformMarginPoisha: Poisha;
  lines: Array<{
    variantId: string;
    publicSku: string;
    internalVendorSku: string;
    productNameBn: string;
    variantTitleBn: string;
    quantity: number;
    unitSupplierPayablePoisha: Poisha;
    unitPlatformMarginPoisha: Poisha;
    unitSalePricePoisha: Poisha;
    lineSubtotalPoisha: Poisha;
  }>;
  createdAt: string;
}

export interface LedgerReversalRequestRecord {
  reversalId: string;
  reversalCode: string;
  originalLedgerEntryId: string;
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  orderNo: string | null;
  originalAmountPoisha: Poisha;
  reversalDebitPoisha: Poisha;
  reversalCreditPoisha: Poisha;
  correctedCreditPoisha: Poisha;
  isBalancedDoubleEntry: boolean;
  reasonBn: string;
  status: 'pending_checker_approval' | 'approved_posted' | 'rejected';
  createdByUsername: string;
  approvedByUsername: string | null;
  usedEmergencyOverride: boolean;
  emergencyOverrideReasonBn: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface CustomerRefundExecutionRecord {
  refundId: string;
  refundCode: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  refundChannel: 'bkash_manual' | 'bank_transfer';
  refundAmountPoisha: Poisha;
  vendorClawbackPoisha: Poisha;
  platformSubsidyPoisha: Poisha;
  refundTrxId: string | null;
  reasonBn: string;
  status: 'pending_approval' | 'approved_paid' | 'rejected';
  requestedByUsername: string;
  approvedByUsername: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface Phase7PersistedStore {
  consignmentLots: ConsignmentDispatchLotRecord[];
  priceProposals: VendorPriceProposalRecord[];
  flashCampaigns: FlashSaleCampaignRecord[];
  maturityBatches: EscrowMaturityBatchRecord[];
  supplierProductOffers?: SupplierProductOfferRecord[];
  fulfillmentGroups?: VendorFulfillmentGroupRecord[];
  ledgerReversals?: LedgerReversalRequestRecord[];
  customerRefunds?: CustomerRefundExecutionRecord[];
}

export interface Phase7WorkspaceOverviewDTO {
  consignmentLots: ConsignmentDispatchLotRecord[];
  priceProposals: VendorPriceProposalRecord[];
  flashCampaigns: FlashSaleCampaignRecord[];
  maturityBatches: EscrowMaturityBatchRecord[];
  supplierProductOffers: SupplierProductOfferRecord[];
  fulfillmentGroups: VendorFulfillmentGroupRecord[];
  ledgerReversals: LedgerReversalRequestRecord[];
  customerRefunds: CustomerRefundExecutionRecord[];
  executiveAccounting: ExecutiveAccountingSummaryDTO | null;
}

// ============================================================================
// 2. PERSISTENCE ENGINE (.data/erp-phase7-store.json)
// ============================================================================

const PHASE7_STORE_PATH = path.join(
  process.cwd(),
  '.data',
  'erp-phase7-store.json'
);

function createSeedPhase7Store(): Phase7PersistedStore {
  return {
    consignmentLots: [
      {
        lotId: 'lot-seed-001',
        lotCode: 'LOT-261107-101',
        vendorId: '00000000-0000-4000-8000-000000000901',
        vendorCode: 'VND-001',
        vendorNameBn: 'রূপগঞ্জ উইভার্স কনসাইনমেন্ট হাউজ',
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        productNameBn: 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি (হাতে বোনা)',
        variantTitleBn: 'মেরুন ও গোল্ডেন জরি — ১২ হাত',
        publicSku: 'BG-JAM-201',
        dispatchedQty: 15,
        qcAcceptedQty: null,
        qcRejectedQty: null,
        unitSupplierCostPoisha: 185000,
        challanRef: 'CH-RUP-2026-88',
        status: 'pending_qc',
        noteBn: 'ঈদ ও বিয়ে মৌসুমের নতুন ১৫ পিস হাফ-সিল্ক জামদানি চালান।',
        reviewedByUsername: null,
        createdAt: '2026-11-07T06:30:00.000Z',
        reviewedAt: null,
      },
      {
        lotId: 'lot-seed-002',
        lotCode: 'LOT-261106-098',
        vendorId: '00000000-0000-4000-8000-000000000902',
        vendorCode: 'VND-002',
        vendorNameBn: 'হাজারীবাগ লেদার ক্রাফটস',
        productId: '00000000-0000-4000-8000-000000000102',
        variantId: '00000000-0000-4000-8000-000000000203',
        productNameBn: 'ফুল-গ্রেইন কাউহাইড লেদার এক্সিকিউটিভ ওয়ালেট',
        variantTitleBn: 'ভিন্টেজ ব্রাউন — RFID ব্লকিং',
        publicSku: 'BG-WAL-203',
        dispatchedQty: 25,
        qcAcceptedQty: 24,
        qcRejectedQty: 1,
        unitSupplierCostPoisha: 52000,
        challanRef: 'CH-HZB-2026-41',
        status: 'approved_stocked',
        noteBn: '২৪ পিস নিখুঁত, ১ পিস সেলাই ত্রুটির কারণে রিজেক্টেড।',
        reviewedByUsername: 'admin',
        createdAt: '2026-11-06T11:00:00.000Z',
        reviewedAt: '2026-11-06T14:20:00.000Z',
      },
    ],
    priceProposals: [
      {
        proposalId: 'prq-seed-001',
        vendorId: '00000000-0000-4000-8000-000000000901',
        vendorCode: 'VND-001',
        vendorNameBn: 'রূপগঞ্জ উইভার্স কনসাইনমেন্ট হাউজ',
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        productNameBn: 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি (হাতে বোনা)',
        publicSku: 'BG-JAM-201',
        currentSupplierCostPoisha: 185000,
        currentSalePricePoisha: 245000,
        proposedSupplierCostPoisha: 190000,
        proposedSalePricePoisha: 255000,
        proposedCommissionBp: 2549,
        projectedPlatformMarginPoisha: 65000,
        reasonBn: 'রেশম সুতার দাম বাড়ায় প্রতি শাড়িতে ৫০ টাকা সাপ্লায়ার কস্ট সমন্বয় প্রস্তাব।',
        status: 'pending_review',
        reviewedByUsername: null,
        createdAt: '2026-11-07T07:15:00.000Z',
        reviewedAt: null,
      },
    ],
    flashCampaigns: [
      {
        campaignId: 'fls-seed-001',
        campaignCode: 'WINTER-JAM-200',
        titleBn: 'হেমন্ত ফ্ল্যাশ ডিল — জামদানি শাড়ি ২০০ টাকা ছাড় (মার্জিন-সেফ)',
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        productNameBn: 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি (হাতে বোনা)',
        publicSku: 'BG-JAM-201',
        regularSalePricePoisha: 245000,
        supplierPayablePoisha: 185000,
        regularPlatformMarginPoisha: 60000,
        flashDiscountPoisha: 20000,
        flashSalePricePoisha: 225000,
        remainingPlatformMarginPoisha: 40000,
        maxUnitsQuota: 30,
        soldUnitsCount: 7,
        isActive: true,
        createdByUsername: 'admin',
        createdAt: '2026-11-06T09:00:00.000Z',
      },
    ],
    maturityBatches: [
      {
        batchId: 'MAT-261106-INIT',
        promotedEntriesCount: 2,
        totalPromotedPoisha: 289000,
        affectedVendorCodes: ['VND-001', 'VND-002'],
        executedByUsername: 'admin',
        executedAt: '2026-11-06T08:00:00.000Z',
        summaryBn:
          '৭-দিন হোল্ড পূর্ণ হওয়া ২টি এসক্রো এন্ট্রি (৳২,৮৯০) উত্তোলনযোগ্য (Available) বাকেটে প্রমোট হয়েছে।',
      },
    ],
    supplierProductOffers: [
      {
        offerId: 'spo-seed-001',
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        publicSku: 'BG-JAM-201',
        productNameBn: 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি (হাতে বোনা)',
        variantTitleBn: 'মেরুন ও গোল্ডেন জরি — ১২ হাত',
        vendorId: '00000000-0000-4000-8000-000000000901',
        vendorCode: 'VND-001',
        vendorNameBn: 'রূপগঞ্জ উইভার্স',
        internalVendorSku: 'VND001-JAM-MRN',
        supplierCostPoisha: 170000,
        supplierProfitPoisha: 30000,
        supplierPayablePoisha: 200000,
        salePricePoisha: 245000,
        platformMarginPoisha: 45000,
        stockAvailable: 14,
        leadTimeDays: 2,
        priorityRank: 1,
        isActive: true,
        updatedAt: '2026-11-06T08:00:00.000Z',
      },
      {
        offerId: 'spo-seed-002',
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        publicSku: 'BG-JAM-201',
        productNameBn: 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি (হাতে বোনা)',
        variantTitleBn: 'মেরুন ও গোল্ডেন জরি — ১২ হাত',
        vendorId: '00000000-0000-4000-8000-000000000903',
        vendorCode: 'VND-003',
        vendorNameBn: 'সুন্দরবন অর্গানিকস ও হ্যান্ডলুম',
        internalVendorSku: 'VND003-JAM-ALT',
        supplierCostPoisha: 165000,
        supplierProfitPoisha: 30000,
        supplierPayablePoisha: 195000,
        salePricePoisha: 245000,
        platformMarginPoisha: 50000,
        stockAvailable: 8,
        leadTimeDays: 3,
        priorityRank: 2,
        isActive: true,
        updatedAt: '2026-11-06T09:00:00.000Z',
      },
    ],
    fulfillmentGroups: [
      {
        groupId: 'vfg-seed-001',
        groupCode: 'VFG-ORD-261106-0001-VND001',
        orderNo: 'ORD-261106-0001',
        vendorId: '00000000-0000-4000-8000-000000000901',
        vendorCode: 'VND-001',
        vendorNameBn: 'রূপগঞ্জ উইভার্স',
        allocationPolicyUsed: 'priority_rank',
        fulfillmentStatus: 'allocated',
        totalUnits: 1,
        groupSaleSubtotalPoisha: 245000,
        groupSupplierCostPoisha: 170000,
        groupSupplierProfitPoisha: 30000,
        groupSupplierPayablePoisha: 200000,
        groupPlatformMarginPoisha: 45000,
        lines: [
          {
            variantId: '00000000-0000-4000-8000-000000000201',
            publicSku: 'BG-JAM-201',
            internalVendorSku: 'VND001-JAM-MRN',
            productNameBn: 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি (হাতে বোনা)',
            variantTitleBn: 'মেরুন ও গোল্ডেন জরি — ১২ হাত',
            quantity: 1,
            unitSupplierPayablePoisha: 200000,
            unitPlatformMarginPoisha: 45000,
            unitSalePricePoisha: 245000,
            lineSubtotalPoisha: 245000,
          },
        ],
        createdAt: '2026-11-06T06:35:00.000Z',
      },
    ],
    ledgerReversals: [
      {
        reversalId: 'rev-seed-001',
        reversalCode: 'REV-261107-001',
        originalLedgerEntryId: 'vled-seed-2',
        vendorId: '00000000-0000-4000-8000-000000000901',
        vendorCode: 'VND-001',
        vendorNameBn: 'রূপগঞ্জ উইভার্স',
        orderNo: 'ORD-261103-0098',
        originalAmountPoisha: 200000,
        reversalDebitPoisha: 200000,
        reversalCreditPoisha: 200000,
        correctedCreditPoisha: 190000,
        isBalancedDoubleEntry: true,
        reasonBn: 'আংশিক কিউসি ডিডাকশনের জন্য ১০০ টাকা সমন্বয় রিভার্সাল ও কারেকশন জার্নাল।',
        status: 'pending_checker_approval',
        createdByUsername: 'marketing_lead',
        approvedByUsername: null,
        usedEmergencyOverride: false,
        emergencyOverrideReasonBn: null,
        createdAt: '2026-11-07T08:30:00.000Z',
        resolvedAt: null,
      },
    ],
    customerRefunds: [
      {
        refundId: 'ref-seed-001',
        refundCode: 'REF-261107-001',
        orderNo: 'ORD-261106-0002',
        customerName: 'তানভীর আহমেদ',
        customerPhone: '01812345678',
        refundChannel: 'bkash_manual',
        refundAmountPoisha: 15000,
        vendorClawbackPoisha: 0,
        platformSubsidyPoisha: 15000,
        refundTrxId: 'BKRFD99812',
        reasonBn: 'অর্ডার ডিসপ্যাচের আগে গ্রাহকের অনুরোধে অগ্রিম ডেলিভারি চার্জ রিফান্ড।',
        status: 'approved_paid',
        requestedByUsername: 'marketing_lead',
        approvedByUsername: 'admin',
        createdAt: '2026-11-07T05:15:00.000Z',
        resolvedAt: '2026-11-07T06:00:00.000Z',
      },
    ],
  };
}

export function readPhase7Store(): Phase7PersistedStore {
  const parsed = readLocalJsonStore<Phase7PersistedStore>(PHASE7_STORE_PATH, {
    arrays: ['consignmentLots', 'priceProposals', 'flashCampaigns', 'maturityBatches'],
    optionalArrays: ['supplierProductOffers', 'fulfillmentGroups', 'ledgerReversals', 'customerRefunds'],
  });
  if (parsed) {
    return {
      ...parsed,
      supplierProductOffers: parsed.supplierProductOffers ?? [],
      fulfillmentGroups: parsed.fulfillmentGroups ?? [],
      ledgerReversals: parsed.ledgerReversals ?? [],
      customerRefunds: parsed.customerRefunds ?? [],
    };
  }
  const seed = createSeedPhase7Store();
  writePhase7Store(seed);
  return seed;
}

export function writePhase7Store(store: Phase7PersistedStore): void {
  writeLocalJsonStore(PHASE7_STORE_PATH, store);
}

// ============================================================================
// 3. CONSIGNMENT STOCK DISPATCH LOT & QC APPROVAL ENGINE
// ============================================================================

export function submitConsignmentDispatchLot(
  ctx: ActorSecurityContext,
  input: {
    variantId: string;
    dispatchedQty: number;
    challanRef: string;
    noteBn: string;
  }
): {
  success: boolean;
  errorBn?: string;
  lot?: ConsignmentDispatchLotRecord;
} {
  if (input.dispatchedQty < 1 || !Number.isInteger(input.dispatchedQty)) {
    return {
      success: false,
      errorBn: 'ডিসপ্যাচকৃত পণ্যের সংখ্যা কমপক্ষে ১ পূর্ণসংখ্যা হতে হবে।',
    };
  }

  const erp = readErpState();
  const p4b = readPhase4BStore();
  const store = readPhase7Store();
  const adminStore = readAdminStore();

  let matchedProduct = erp.products[0];
  let matchedVariant = matchedProduct?.variants[0];

  for (const prod of erp.products) {
    const v = prod.variants.find((vr) => vr.variantId === input.variantId);
    if (v) {
      matchedProduct = prod;
      matchedVariant = v;
      break;
    }
  }

  if (!matchedProduct || !matchedVariant) {
    return {
      success: false,
      errorBn: 'নির্বাচিত প্রোডাক্ট ভ্যারিয়েন্ট খুঁজে পাওয়া যায়নি।',
    };
  }

  // Enforce vendor ownership if actor is a vendor
  if (
    ctx.roleSlug === 'vendor' &&
    ctx.vendorId &&
    matchedProduct.vendorId !== ctx.vendorId
  ) {
    return {
      success: false,
      errorBn: 'আপনি শুধুমাত্র আপনার নিজস্ব ভেন্ডর পণ্যের চালান জমা দিতে পারবেন।',
    };
  }

  const vendorRec = p4b.vendors.find(
    (v) => v.vendorId === matchedProduct.vendorId
  );

  const lot: ConsignmentDispatchLotRecord = {
    lotId: `lot-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    lotCode: `LOT-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 899)}`,
    vendorId: matchedProduct.vendorId,
    vendorCode: vendorRec?.vendorCode ?? matchedProduct.vendorCode,
    vendorNameBn: vendorRec?.businessNameBn ?? 'কনসাইনমেন্ট ভেন্ডর',
    productId: matchedProduct.productId,
    variantId: matchedVariant.variantId,
    productNameBn: matchedProduct.nameBn,
    variantTitleBn: matchedVariant.titleBn,
    publicSku: matchedVariant.publicSku,
    dispatchedQty: input.dispatchedQty,
    qcAcceptedQty: null,
    qcRejectedQty: null,
    unitSupplierCostPoisha: matchedVariant.supplierCostPoisha,
    challanRef: input.challanRef.trim(),
    status: 'pending_qc',
    noteBn: input.noteBn.trim(),
    reviewedByUsername: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
  };

  store.consignmentLots.unshift(lot);
  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'CONSIGNMENT_LOT_SUBMITTED',
    targetType: 'product',
    targetId: lot.lotCode,
    summaryBn: `${lot.vendorNameBn} কর্তৃক ${lot.publicSku}-এর ${lot.dispatchedQty} পিস কনসাইনমেন্ট চালান (${lot.lotCode}) জমা দেওয়া হয়েছে।`,
    metadata: {
      lotCode: lot.lotCode,
      variantId: lot.variantId,
      dispatchedQty: lot.dispatchedQty,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, lot };
}

export function reviewConsignmentDispatchLot(
  ctx: ActorSecurityContext,
  input: {
    lotId: string;
    decision: 'approve' | 'reject';
    qcRejectedQty?: number;
    noteBn?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  lot?: ConsignmentDispatchLotRecord;
  updatedStockAvailable?: number;
} {
  if (ctx.roleSlug === 'vendor') {
    return {
      success: false,
      errorBn: 'ভেন্ডর রোল থেকে ওয়্যারহাউস কিউসি অনুমোদন করা যাবে না।',
    };
  }

  const store = readPhase7Store();
  const erp = readErpState();
  const adminStore = readAdminStore();

  const lot = store.consignmentLots.find((l) => l.lotId === input.lotId);
  if (!lot) {
    return {
      success: false,
      errorBn: 'কনসাইনমেন্ট লট খুঁজে পাওয়া যায়নি।',
    };
  }

  if (lot.status !== 'pending_qc') {
    return {
      success: false,
      errorBn: `এই চালানটি ইতিমধ্যে (${lot.status}) নিষ্পত্তি হয়েছে।`,
    };
  }

  const rejectedQty = Math.max(
    0,
    Math.min(lot.dispatchedQty, Math.trunc(input.qcRejectedQty ?? 0))
  );
  const acceptedQty =
    input.decision === 'approve'
      ? Math.max(0, lot.dispatchedQty - rejectedQty)
      : 0;

  lot.status =
    input.decision === 'approve' && acceptedQty > 0
      ? 'approved_stocked'
      : 'rejected';
  lot.qcAcceptedQty = acceptedQty;
  lot.qcRejectedQty =
    input.decision === 'approve' ? rejectedQty : lot.dispatchedQty;
  lot.reviewedByUsername = ctx.username;
  lot.reviewedAt = new Date().toISOString();
  if (input.noteBn?.trim()) {
    lot.noteBn = input.noteBn.trim();
  }

  let updatedStockAvailable = 0;

  if (lot.status === 'approved_stocked' && acceptedQty > 0) {
    for (const prod of erp.products) {
      const vr = prod.variants.find((v) => v.variantId === lot.variantId);
      if (vr) {
        vr.stockOnHand += acceptedQty;
        vr.stockAvailable += acceptedQty;
        updatedStockAvailable = vr.stockAvailable;
        break;
      }
    }
    writeErpState(erp);
  }

  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: `CONSIGNMENT_LOT_${lot.status.toUpperCase()}`,
    targetType: 'product',
    targetId: lot.lotCode,
    summaryBn: `কনসাইনমেন্ট লট ${lot.lotCode} কিউসি সম্পন্ন: গৃহীত ${acceptedQty} পিস, রিজেক্টেড ${lot.qcRejectedQty} পিস।`,
    metadata: {
      lotCode: lot.lotCode,
      acceptedQty,
      rejectedQty: lot.qcRejectedQty,
      updatedStockAvailable,
    },
  });
  writeAdminStore(adminStore);

  return {
    success: true,
    lot,
    updatedStockAvailable,
  };
}

// ============================================================================
// 4. VENDOR COST & RETAIL PRICE PROPOSAL ENGINE
// ============================================================================

export function submitVendorPriceProposal(
  ctx: ActorSecurityContext,
  input: {
    variantId: string;
    proposedSupplierCostPoisha: Poisha;
    proposedSalePricePoisha: Poisha;
    reasonBn: string;
  }
): {
  success: boolean;
  errorBn?: string;
  proposal?: VendorPriceProposalRecord;
} {
  if (
    !Number.isInteger(input.proposedSupplierCostPoisha) ||
    !Number.isInteger(input.proposedSalePricePoisha) ||
    input.proposedSupplierCostPoisha < 100 ||
    input.proposedSalePricePoisha <= input.proposedSupplierCostPoisha
  ) {
    return {
      success: false,
      errorBn:
        'প্রস্তাবিত খুচরা বিক্রয়মূল্য অবশ্যই সাপ্লায়ার কস্টের চেয়ে বেশি এবং পূর্ণসংখ্যা পয়সায় হতে হবে।',
    };
  }

  const erp = readErpState();
  const p4b = readPhase4BStore();
  const store = readPhase7Store();
  const adminStore = readAdminStore();

  let matchedProduct = erp.products[0];
  let matchedVariant = matchedProduct?.variants[0];

  for (const prod of erp.products) {
    const v = prod.variants.find((vr) => vr.variantId === input.variantId);
    if (v) {
      matchedProduct = prod;
      matchedVariant = v;
      break;
    }
  }

  if (!matchedProduct || !matchedVariant) {
    return {
      success: false,
      errorBn: 'প্রোডাক্ট ভ্যারিয়েন্ট পাওয়া যায়নি।',
    };
  }

  if (
    ctx.roleSlug === 'vendor' &&
    ctx.vendorId &&
    matchedProduct.vendorId !== ctx.vendorId
  ) {
    return {
      success: false,
      errorBn: 'আপনি শুধুমাত্র নিজস্ব পণ্যের মূল্য পরিবর্তনের প্রস্তাব দিতে পারবেন।',
    };
  }

  const proposedSupplierPayablePoisha =
    input.proposedSupplierCostPoisha + matchedVariant.supplierProfitPoisha;
  const projectedMarginPoisha = Math.max(
    0,
    input.proposedSalePricePoisha - proposedSupplierPayablePoisha
  );
  const proposedCommissionBp = Math.round(
    (projectedMarginPoisha * 10000) / input.proposedSalePricePoisha
  );

  const vendorRec = p4b.vendors.find(
    (v) => v.vendorId === matchedProduct.vendorId
  );

  const proposal: VendorPriceProposalRecord = {
    proposalId: `prq-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    vendorId: matchedProduct.vendorId,
    vendorCode: vendorRec?.vendorCode ?? matchedProduct.vendorCode,
    vendorNameBn: vendorRec?.businessNameBn ?? 'কনসাইনমেন্ট ভেন্ডর',
    productId: matchedProduct.productId,
    variantId: matchedVariant.variantId,
    productNameBn: matchedProduct.nameBn,
    publicSku: matchedVariant.publicSku,
    currentSupplierCostPoisha: matchedVariant.supplierCostPoisha,
    currentSalePricePoisha: matchedVariant.salePricePoisha,
    proposedSupplierCostPoisha: input.proposedSupplierCostPoisha,
    proposedSalePricePoisha: input.proposedSalePricePoisha,
    proposedCommissionBp,
    projectedPlatformMarginPoisha: projectedMarginPoisha,
    reasonBn: input.reasonBn.trim(),
    status: 'pending_review',
    reviewedByUsername: null,
    createdAt: new Date().toISOString(),
    reviewedAt: null,
  };

  store.priceProposals.unshift(proposal);
  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'VENDOR_PRICE_PROPOSAL_SUBMITTED',
    targetType: 'product',
    targetId: proposal.publicSku,
    summaryBn: `${proposal.publicSku}-এর নতুন মূল্য প্রস্তাব জমা হয়েছে (বিক্রয়মূল্য: ${Math.round(proposal.proposedSalePricePoisha / 100)} টাকা)।`,
    metadata: {
      proposalId: proposal.proposalId,
      proposedSupplierCostPoisha: proposal.proposedSupplierCostPoisha,
      proposedSalePricePoisha: proposal.proposedSalePricePoisha,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, proposal };
}

export function resolveVendorPriceProposal(
  ctx: ActorSecurityContext,
  input: {
    proposalId: string;
    decision: 'approved' | 'rejected';
  }
): {
  success: boolean;
  errorBn?: string;
  proposal?: VendorPriceProposalRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন মূল্য পরিবর্তনের প্রস্তাব অনুমোদন বা প্রত্যাখ্যান করতে পারবেন।',
    };
  }

  const store = readPhase7Store();
  const erp = readErpState();
  const adminStore = readAdminStore();

  const proposal = store.priceProposals.find(
    (p) => p.proposalId === input.proposalId
  );
  if (!proposal) {
    return { success: false, errorBn: 'মূল্য প্রস্তাব খুঁজে পাওয়া যায়নি।' };
  }

  proposal.status = input.decision;
  proposal.reviewedByUsername = ctx.username;
  proposal.reviewedAt = new Date().toISOString();

  if (input.decision === 'approved') {
    for (const prod of erp.products) {
      const vr = prod.variants.find((v) => v.variantId === proposal.variantId);
      if (vr) {
        vr.supplierCostPoisha = proposal.proposedSupplierCostPoisha;
        vr.supplierPayablePoisha =
          proposal.proposedSupplierCostPoisha + vr.supplierProfitPoisha;
        vr.salePricePoisha = proposal.proposedSalePricePoisha;
        vr.platformMarginPoisha = Math.max(
          0,
          proposal.proposedSalePricePoisha - vr.supplierPayablePoisha
        );
        break;
      }
    }
    writeErpState(erp);
  }

  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: `VENDOR_PRICE_PROPOSAL_${input.decision.toUpperCase()}`,
    targetType: 'product',
    targetId: proposal.publicSku,
    summaryBn: `${proposal.publicSku}-এর মূল্য প্রস্তাব "${input.decision}" হিসেবে নিষ্পত্তি হয়েছে।`,
    metadata: {
      proposalId: proposal.proposalId,
      decision: input.decision,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, proposal };
}

// ============================================================================
// 5. MARGIN-SAFE FLASH-SALE CAMPAIGN BUILDER
// ============================================================================

export function createMarginSafeFlashCampaign(
  ctx: ActorSecurityContext,
  input: {
    campaignCode: string;
    titleBn: string;
    variantId: string;
    flashDiscountPoisha: Poisha;
    maxUnitsQuota: number;
  }
): {
  success: boolean;
  errorBn?: string;
  campaign?: FlashSaleCampaignRecord;
} {
  if (ctx.roleSlug === 'vendor' || ctx.roleSlug === 'packaging_manager') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন বা মার্কেটিং ম্যানেজার ফ্ল্যাশ-সেল ক্যাম্পেইন তৈরি করতে পারবেন।',
    };
  }

  const erp = readErpState();
  const store = readPhase7Store();
  const adminStore = readAdminStore();

  let matchedProduct = erp.products[0];
  let matchedVariant = matchedProduct?.variants[0];

  for (const prod of erp.products) {
    const v = prod.variants.find((vr) => vr.variantId === input.variantId);
    if (v) {
      matchedProduct = prod;
      matchedVariant = v;
      break;
    }
  }

  if (!matchedProduct || !matchedVariant) {
    return { success: false, errorBn: 'প্রোডাক্ট ভ্যারিয়েন্ট পাওয়া যায়নি।' };
  }

  // Golden Rule Check: Flash discount MUST NOT exceed platformMarginPoisha
  if (input.flashDiscountPoisha >= matchedVariant.platformMarginPoisha) {
    return {
      success: false,
      errorBn: `ফ্ল্যাশ ডিসকাউন্ট (${Math.round(input.flashDiscountPoisha / 100)} টাকা) প্ল্যাটফর্ম মার্জিনের (${Math.round(matchedVariant.platformMarginPoisha / 100)} টাকা) সমান বা বেশি হতে পারবে না—সাপ্লায়ার প্রদেয় কখনোই কমানো যাবে না।`,
    };
  }

  const campaign: FlashSaleCampaignRecord = {
    campaignId: `fls-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    campaignCode: input.campaignCode.trim().toUpperCase(),
    titleBn: input.titleBn.trim(),
    productId: matchedProduct.productId,
    variantId: matchedVariant.variantId,
    productNameBn: matchedProduct.nameBn,
    publicSku: matchedVariant.publicSku,
    regularSalePricePoisha: matchedVariant.salePricePoisha,
    supplierPayablePoisha: matchedVariant.supplierPayablePoisha,
    regularPlatformMarginPoisha: matchedVariant.platformMarginPoisha,
    flashDiscountPoisha: input.flashDiscountPoisha,
    flashSalePricePoisha:
      matchedVariant.salePricePoisha - input.flashDiscountPoisha,
    remainingPlatformMarginPoisha:
      matchedVariant.platformMarginPoisha - input.flashDiscountPoisha,
    maxUnitsQuota: Math.max(1, Math.trunc(input.maxUnitsQuota)),
    soldUnitsCount: 0,
    isActive: true,
    createdByUsername: ctx.username,
    createdAt: new Date().toISOString(),
  };

  store.flashCampaigns.unshift(campaign);
  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'MARGIN_SAFE_FLASH_CAMPAIGN_CREATED',
    targetType: 'product',
    targetId: campaign.campaignCode,
    summaryBn: `মার্জিন-সেফ ফ্ল্যাশ ক্যাম্পেইন "${campaign.campaignCode}" চালু হয়েছে (সাপ্লায়ার প্রদেয় অক্ষুণ্ণ: ${Math.round(campaign.supplierPayablePoisha / 100)} টাকা)।`,
    metadata: {
      campaignCode: campaign.campaignCode,
      flashDiscountPoisha: campaign.flashDiscountPoisha,
      remainingPlatformMarginPoisha: campaign.remainingPlatformMarginPoisha,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, campaign };
}

// ============================================================================
// 6. AUTOMATED ESCROW MATURITY PROMOTER (LOCKED -> AVAILABLE)
// ============================================================================

export function promoteMaturedEscrowEntriesBatch(
  ctx: ActorSecurityContext,
  forcePromoteAllLocked = false
): {
  success: boolean;
  errorBn?: string;
  batch?: EscrowMaturityBatchRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন এসক্রো ম্যাচুরিটি প্রমোশন ব্যাচ রান করতে পারবেন।',
    };
  }
  if (forcePromoteAllLocked) return { success: false, errorBn: 'হোল্ড সময় ও আদায় যাচাই এড়িয়ে অর্থ ছাড় করা যাবে না।' };

  const p4b = readPhase4BStore();
  const store = readPhase7Store();
  const adminStore = readAdminStore();
  const nowIso = new Date().toISOString();

  // Clean up any legacy entries missing escrowBucket
  if (p4b.vendorLedger.some(entry => !Number.isSafeInteger(entry.amountPoisha) || !entry.escrowBucket)) {
    return { success: false, errorBn: 'লেজারে অসংগতি আছে। ইতিহাস অক্ষুণ্ণ রেখে সমন্বয় করুন।' };
  }

  // Identify EARNING_LOCKED entries that haven't been promoted to EARNING_MATURED yet
  const maturedSourceIds = new Set(p4b.vendorLedger.map(entry => entry.id));
  const erp = readErpState();

  const eligibleLocked = p4b.vendorLedger.filter((e) => {
    if (e.entryType !== 'EARNING_LOCKED' || e.amountPoisha <= 0) return false;
    if (maturedSourceIds.has(`vle-mat-${e.id}`)) return false;
    const order = erp.orders.find(order => order.orderNo === e.orderNo);
    return Boolean(e.maturesAt && e.maturesAt <= nowIso && order?.status === 'delivered' &&
      ['remitted', 'paid_verified'].includes(order.paymentStatus));
  });

  let totalPromotedPoisha = 0;
  const affectedVendors = new Set<string>();

  for (const lockedEntry of eligibleLocked) {
    const newEntry: ImmutableVendorLedgerRecord = {
      id: `vle-mat-${lockedEntry.id}`,
      vendorId: lockedEntry.vendorId,
      vendorCode: lockedEntry.vendorCode,
      orderNo: lockedEntry.orderNo,
      orderItemId: lockedEntry.orderItemId ?? null,
      entryType: 'EARNING_MATURED',
      escrowBucket: 'available',
      amountPoisha: lockedEntry.amountPoisha,
      deliveredAt: lockedEntry.deliveredAt ?? nowIso,
      maturesAt: nowIso,
      descriptionBn: `৭-দিন হোল্ড পূর্ণ হওয়ায় অর্ডার ${lockedEntry.orderNo ?? ''}-এর অর্থ উত্তোলনযোগ্য (Available) বাকেটে প্রমোট হয়েছে।`,
      recordedByUsername: ctx.username,
      createdAt: nowIso,
    };
    p4b.vendorLedger.unshift({ ...newEntry, id: `vle-mat-offset-${lockedEntry.id}`,
      entryType: 'MANUAL_ADJUSTMENT', escrowBucket: 'locked', amountPoisha: -lockedEntry.amountPoisha,
      descriptionBn: `ম্যাচুরিটি ট্রান্সফার: ${lockedEntry.id}`,
    }, newEntry);
    totalPromotedPoisha += lockedEntry.amountPoisha;
    affectedVendors.add(lockedEntry.vendorCode);
  }

  writePhase4BStore(p4b);

  const batch: EscrowMaturityBatchRecord = {
    batchId: `MAT-${Date.now().toString().slice(-6)}`,
    promotedEntriesCount: eligibleLocked.length,
    totalPromotedPoisha,
    affectedVendorCodes: Array.from(affectedVendors),
    executedByUsername: ctx.username,
    executedAt: nowIso,
    summaryBn:
      eligibleLocked.length > 0
        ? `${eligibleLocked.length}টি লকড এসক্রো এন্ট্রি (মোট ৳${Math.round(totalPromotedPoisha / 100)}) উত্তোলনযোগ্য বাকেটে প্রমোট হয়েছে।`
        : 'এই মুহূর্তে প্রমোশনযোগ্য কোনো নতুন লকড এসক্রো এন্ট্রি নেই।',
  };

  store.maturityBatches.unshift(batch);
  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'ESCROW_MATURITY_BATCH_EXECUTED',
    targetType: 'system',
    targetId: batch.batchId,
    summaryBn: batch.summaryBn,
    metadata: {
      promotedEntriesCount: batch.promotedEntriesCount,
      totalPromotedPoisha: batch.totalPromotedPoisha,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, batch };
}

// ============================================================================
// 7. EXECUTIVE BDT DOUBLE-ENTRY ACCOUNTING & VAT/TAX LEDGER
// ============================================================================

export function computeExecutiveAccountingSummary(
  ctx: ActorSecurityContext
): ExecutiveAccountingSummaryDTO | null {
  if (ctx.roleSlug === 'vendor' || ctx.roleSlug === 'packaging_manager') {
    return null;
  }

  const erp = readErpState();
  const p4b = readPhase4BStore();
  const p4c = readPhase4CStore();
  const nowIso = new Date().toISOString();

  let totalDeliveredGrossRevenuePoisha = 0;
  let totalCashRemittedAndAdvancePoisha = 0;
  let totalCourierUnsettledReceivablePoisha = 0;
  let grossPlatformCommissionEarnedPoisha = 0;
  let totalPromoAndFlashSubsidyPoisha = 0;

  // Include cumulative delivered units across active consignment products
  for (const prod of erp.products) {
    const primaryVar = prod.variants[0];
    if (primaryVar && prod.totalSoldCount > 0) {
      totalDeliveredGrossRevenuePoisha +=
        primaryVar.salePricePoisha * prod.totalSoldCount;
      grossPlatformCommissionEarnedPoisha +=
        primaryVar.platformMarginPoisha * prod.totalSoldCount;
    }
  }

  const deliveredOrderIds = new Set<string>();

  for (const ord of erp.orders) {
    totalCashRemittedAndAdvancePoisha += ord.advancePaidPoisha;
    if (ord.status === 'delivered') {
      deliveredOrderIds.add(ord.id);
      totalDeliveredGrossRevenuePoisha += ord.totalPayablePoisha;
      totalPromoAndFlashSubsidyPoisha += ord.discountPoisha;
    } else if (
      ord.status === 'shipped' ||
      ord.status === 'out_for_delivery' ||
      ord.status === 'confirmed' ||
      ord.status === 'packed'
    ) {
      totalCourierUnsettledReceivablePoisha += ord.codCollectablePoisha;
    }
  }

  for (const line of erp.orderLines) {
    if (deliveredOrderIds.has(line.orderId)) {
      grossPlatformCommissionEarnedPoisha +=
        line.snapPlatformMarginPoisha * line.quantity;
    }
  }

  for (const rem of p4b.courierRemittanceLedger) {
    totalCashRemittedAndAdvancePoisha += rem.remittedAmountPoisha;
  }

  let totalVendorPendingLiabilityPoisha = 0;
  let totalVendorLockedLiabilityPoisha = 0;
  let totalVendorAvailableLiabilityPoisha = 0;

  for (const v of p4b.vendors) {
    const vEntries = p4b.vendorLedger.filter(
      (e) =>
        e.vendorId === v.vendorId &&
        typeof e.amountPoisha === 'number' &&
        Boolean(e.escrowBucket)
    );
    const bal = computeVendorEscrowBalance(v.vendorId, vEntries, nowIso);
    totalVendorPendingLiabilityPoisha += bal.pendingPoisha;
    totalVendorLockedLiabilityPoisha += bal.lockedPoisha;
    totalVendorAvailableLiabilityPoisha += bal.availablePoisha;
  }

  const totalVendorPaidDisbursedPoisha = p4b.payoutRequests
    .filter((p) => p.status === 'paid')
    .reduce((acc, p) => acc + p.requestedAmountPoisha, 0);

  const totalOperatingAndAdExpensesPoisha = p4c.expenses.reduce(
    (acc, e) => acc + e.amountPoisha,
    0
  );

  const netCommissionAfterPromoPoisha = Math.max(
    0,
    grossPlatformCommissionEarnedPoisha - totalPromoAndFlashSubsidyPoisha
  );

  // 5% (500 bp) VAT calculated strictly on Net Platform Commission Margin (never on Vendor Principal)
  const estimatedVatOnMarginPoisha = Math.round(
    (netCommissionAfterPromoPoisha * 500) / 10000
  );

  const netRetainedPlatformProfitPoisha =
    netCommissionAfterPromoPoisha -
    estimatedVatOnMarginPoisha -
    totalOperatingAndAdExpensesPoisha;

  const sample10kPoisha = 1000000; // 10,000 BDT = 1,000,000 poisha
  const payoutFeeSchedule = [
    {
      methodNameBn: 'বিকাশ ক্যাশআউট / এজেন্ট পেআউট (১.৮৫%)',
      feeRateBp: 185,
      sample10kPayoutGrossPoisha: sample10kPoisha,
      sample10kFeeDeductedPoisha: Math.round((sample10kPoisha * 185) / 10000),
      sample10kNetReceivedPoisha:
        sample10kPoisha - Math.round((sample10kPoisha * 185) / 10000),
    },
    {
      methodNameBn: 'ব্যাংক EFT / BEFTN ট্রান্সফার (০% চার্জ)',
      feeRateBp: 0,
      sample10kPayoutGrossPoisha: sample10kPoisha,
      sample10kFeeDeductedPoisha: 0,
      sample10kNetReceivedPoisha: sample10kPoisha,
    },
  ];

  return {
    totalDeliveredGrossRevenuePoisha,
    totalCashRemittedAndAdvancePoisha,
    totalCourierUnsettledReceivablePoisha,
    totalVendorPendingLiabilityPoisha,
    totalVendorLockedLiabilityPoisha,
    totalVendorAvailableLiabilityPoisha,
    totalVendorPaidDisbursedPoisha,
    grossPlatformCommissionEarnedPoisha,
    totalPromoAndFlashSubsidyPoisha,
    totalOperatingAndAdExpensesPoisha,
    estimatedVatOnMarginPoisha,
    netRetainedPlatformProfitPoisha,
    payoutFeeSchedule,
  };
}

// ============================================================================
// 8. MULTI-SUPPLIER PRODUCT OFFERS & FULFILLMENT GROUP SPLIT ENGINE
// ============================================================================

export function upsertSupplierProductOffer(
  ctx: ActorSecurityContext,
  input: {
    variantId: string;
    vendorId: string;
    internalVendorSku: string;
    supplierCostPoisha: Poisha;
    supplierProfitPoisha: Poisha;
    stockAvailable: number;
    leadTimeDays?: number;
    priorityRank?: number;
  }
): {
  success: boolean;
  errorBn?: string;
  offer?: SupplierProductOfferRecord;
} {
  if (ctx.roleSlug === 'packaging_manager') {
    return {
      success: false,
      errorBn: 'প্যাকেজিং ম্যানেজার সাপ্লায়ার অফার মূল্য তৈরি বা পরিবর্তন করতে পারবেন না।',
    };
  }
  if (ctx.roleSlug === 'vendor' && ctx.vendorId !== input.vendorId) {
    return {
      success: false,
      errorBn: 'ভেন্ডর শুধুমাত্র নিজস্ব প্রতিষ্ঠানের সাপ্লায়ার অফার জমা দিতে পারবেন।',
    };
  }
  if (
    !Number.isInteger(input.supplierCostPoisha) ||
    !Number.isInteger(input.supplierProfitPoisha) ||
    input.supplierCostPoisha < 100 ||
    input.supplierProfitPoisha < 0
  ) {
    return {
      success: false,
      errorBn: 'সাপ্লায়ার কেনা দাম ও লাভ পূর্ণসংখ্যা পয়সায় হতে হবে।',
    };
  }

  const erp = readErpState();
  const p4b = readPhase4BStore();
  const store = readPhase7Store();
  const adminStore = readAdminStore();

  let matchedProduct = erp.products[0];
  let matchedVariant = matchedProduct?.variants[0];
  for (const prod of erp.products) {
    const vr = prod.variants.find((v) => v.variantId === input.variantId);
    if (vr) {
      matchedProduct = prod;
      matchedVariant = vr;
      break;
    }
  }
  if (!matchedProduct || !matchedVariant) {
    return { success: false, errorBn: 'প্রোডাক্ট ভ্যারিয়েন্ট খুঁজে পাওয়া যায়নি।' };
  }

  const vendor = p4b.vendors.find((v) => v.vendorId === input.vendorId);
  if (!vendor) {
    return { success: false, errorBn: 'সাপ্লায়ার প্রোফাইল খুঁজে পাওয়া যায়নি।' };
  }

  const supplierPayablePoisha =
    input.supplierCostPoisha + input.supplierProfitPoisha;
  const salePricePoisha = matchedVariant.salePricePoisha;
  if (supplierPayablePoisha >= salePricePoisha) {
    return {
      success: false,
      errorBn: `সাপ্লায়ার প্রদেয় (${Math.round(supplierPayablePoisha / 100)} টাকা) পণ্যের খুচরা বিক্রয়মূল্যের (${Math.round(salePricePoisha / 100)} টাকা) সমান বা বেশি হতে পারবে না।`,
    };
  }

  const platformMarginPoisha = salePricePoisha - supplierPayablePoisha;
  const offers = store.supplierProductOffers ?? [];
  const existingIdx = offers.findIndex(
    (o) => o.variantId === input.variantId && o.vendorId === input.vendorId
  );

  const record: SupplierProductOfferRecord = {
    offerId:
      existingIdx >= 0
        ? offers[existingIdx]!.offerId
        : `spo-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    productId: matchedProduct.productId,
    variantId: matchedVariant.variantId,
    publicSku: matchedVariant.publicSku,
    productNameBn: matchedProduct.nameBn,
    variantTitleBn: matchedVariant.titleBn,
    vendorId: vendor.vendorId,
    vendorCode: vendor.vendorCode,
    vendorNameBn: vendor.businessNameBn,
    internalVendorSku: input.internalVendorSku.trim().toUpperCase(),
    supplierCostPoisha: input.supplierCostPoisha,
    supplierProfitPoisha: input.supplierProfitPoisha,
    supplierPayablePoisha,
    salePricePoisha,
    platformMarginPoisha,
    stockAvailable: Math.max(0, Math.trunc(input.stockAvailable)),
    leadTimeDays: Math.max(1, Math.trunc(input.leadTimeDays ?? 2)),
    priorityRank: Math.max(1, Math.trunc(input.priorityRank ?? 1)),
    isActive: true,
    updatedAt: new Date().toISOString(),
  };

  if (existingIdx >= 0) {
    offers[existingIdx] = record;
  } else {
    offers.unshift(record);
  }
  store.supplierProductOffers = offers;
  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'SUPPLIER_PRODUCT_OFFER_UPSERTED',
    targetType: 'product',
    targetId: record.offerId,
    summaryBn: `${record.vendorNameBn} (${record.vendorCode})-এর জন্য ${record.publicSku} সাপ্লায়ার অফার সংরক্ষিত হয়েছে (প্রদেয়: ৳${Math.round(record.supplierPayablePoisha / 100)}, মার্জিন: ৳${Math.round(record.platformMarginPoisha / 100)})।`,
    metadata: {
      offerId: record.offerId,
      vendorCode: record.vendorCode,
      supplierPayablePoisha: record.supplierPayablePoisha,
      platformMarginPoisha: record.platformMarginPoisha,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, offer: record };
}

export function allocateSupplierOfferForVariant(
  variantId: string,
  requestedQty: number,
  policy: OfferAllocationPolicy = 'priority_rank'
): SupplierProductOfferRecord | null {
  const store = readPhase7Store();
  const candidates = (store.supplierProductOffers ?? []).filter(
    (o) =>
      o.variantId === variantId &&
      o.isActive &&
      o.stockAvailable >= requestedQty
  );
  if (candidates.length === 0) return null;

  const sorted = [...candidates].sort((a, b) => {
    if (policy === 'lowest_payable_highest_margin') {
      if (a.supplierPayablePoisha !== b.supplierPayablePoisha) {
        return a.supplierPayablePoisha - b.supplierPayablePoisha;
      }
      return a.priorityRank - b.priorityRank;
    }
    if (policy === 'highest_stock') {
      if (b.stockAvailable !== a.stockAvailable) {
        return b.stockAvailable - a.stockAvailable;
      }
      return a.priorityRank - b.priorityRank;
    }
    return a.priorityRank - b.priorityRank;
  });

  return sorted[0] ?? null;
}

export function splitOrderIntoVendorFulfillmentGroups(
  ctx: ActorSecurityContext,
  input: {
    orderNo: string;
    allocationPolicy?: OfferAllocationPolicy;
  }
): {
  success: boolean;
  errorBn?: string;
  groups: VendorFulfillmentGroupRecord[];
} {
  const erp = readErpState();
  const p4b = readPhase4BStore();
  const store = readPhase7Store();
  const adminStore = readAdminStore();

  const ord = erp.orders.find(
    (o) => o.orderNo.toUpperCase() === input.orderNo.trim().toUpperCase()
  );
  if (!ord) {
    return {
      success: false,
      errorBn: 'অর্ডার খুঁজে পাওয়া যায়নি।',
      groups: [],
    };
  }

  const policy = input.allocationPolicy ?? 'priority_rank';
  const rawLines = erp.orderLines.filter((l) => l.orderId === ord.id);
  const groupMap = new Map<string, VendorFulfillmentGroupRecord>();

  for (const line of rawLines) {
    const matchedOffer = allocateSupplierOfferForVariant(
      line.variantId,
      line.quantity,
      policy
    );
    const vendorId = matchedOffer?.vendorId ?? line.vendorId;
    const vendorRec = p4b.vendors.find((v) => v.vendorId === vendorId);
    const vendorCode =
      matchedOffer?.vendorCode ?? vendorRec?.vendorCode ?? 'VND-001';
    const vendorNameBn =
      matchedOffer?.vendorNameBn ?? vendorRec?.businessNameBn ?? 'সাপ্লায়ার';
    const internalSku =
      matchedOffer?.internalVendorSku ?? line.internalVendorSku;

    const unitCost =
      matchedOffer?.supplierCostPoisha ?? line.snapSupplierCostPoisha;
    const unitPayable =
      matchedOffer?.supplierPayablePoisha ?? line.snapSupplierPayablePoisha;
    const unitProfit = Math.max(0, unitPayable - unitCost);
    const unitSale = line.snapUnitSalePricePoisha;
    const unitMargin = Math.max(0, unitSale - unitPayable);
    const lineSubtotal = unitSale * line.quantity;

    const existing = groupMap.get(vendorCode) ?? {
      groupId: `vfg-${Date.now()}-${vendorCode}`,
      groupCode: `VFG-${ord.orderNo}-${vendorCode.replace('-', '')}`,
      orderNo: ord.orderNo,
      vendorId,
      vendorCode,
      vendorNameBn,
      allocationPolicyUsed: policy,
      fulfillmentStatus:
        ord.status === 'delivered'
          ? 'delivered'
          : ord.status === 'shipped' || ord.status === 'out_for_delivery'
          ? 'shipped'
          : ord.status === 'packed'
          ? 'packed'
          : 'allocated',
      totalUnits: 0,
      groupSaleSubtotalPoisha: 0,
      groupSupplierCostPoisha: 0,
      groupSupplierProfitPoisha: 0,
      groupSupplierPayablePoisha: 0,
      groupPlatformMarginPoisha: 0,
      lines: [],
      createdAt: new Date().toISOString(),
    };

    existing.totalUnits += line.quantity;
    existing.groupSaleSubtotalPoisha += lineSubtotal;
    existing.groupSupplierCostPoisha += unitCost * line.quantity;
    existing.groupSupplierProfitPoisha += unitProfit * line.quantity;
    existing.groupSupplierPayablePoisha += unitPayable * line.quantity;
    existing.groupPlatformMarginPoisha += unitMargin * line.quantity;
    existing.lines.push({
      variantId: line.variantId,
      publicSku: line.publicSku,
      internalVendorSku: internalSku,
      productNameBn: line.productNameBn,
      variantTitleBn: line.variantTitleBn,
      quantity: line.quantity,
      unitSupplierPayablePoisha: unitPayable,
      unitPlatformMarginPoisha: unitMargin,
      unitSalePricePoisha: unitSale,
      lineSubtotalPoisha: lineSubtotal,
    });

    groupMap.set(vendorCode, existing);
  }

  const createdGroups = Array.from(groupMap.values());
  const otherGroups = (store.fulfillmentGroups ?? []).filter(
    (g) => g.orderNo !== ord.orderNo
  );
  store.fulfillmentGroups = [...createdGroups, ...otherGroups];
  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'ORDER_FULFILLMENT_GROUPS_SPLIT',
    targetType: 'order',
    targetId: ord.orderNo,
    summaryBn: `${ord.orderNo} অর্ডারটি "${policy}" নীতিমালায় ${createdGroups.length}টি ভেন্ডর ফুলফিলমেন্ট গ্রুপে বিভাজন করা হয়েছে।`,
    metadata: {
      policy,
      groupsCount: createdGroups.length,
      vendorCodes: createdGroups.map((g) => g.vendorCode),
    },
  });
  writeAdminStore(adminStore);

  return {
    success: true,
    groups: createdGroups,
  };
}

// ============================================================================
// 9. MAKER-CHECKER DOUBLE-ENTRY LEDGER REVERSAL & REFUND EXECUTION
// ============================================================================

export function createLedgerReversalRequest(
  ctx: ActorSecurityContext,
  input: {
    originalLedgerEntryId: string;
    correctedCreditPoisha: Poisha;
    reasonBn: string;
  }
): {
  success: boolean;
  errorBn?: string;
  reversal?: LedgerReversalRequestRecord;
} {
  if (ctx.roleSlug === 'vendor' || ctx.roleSlug === 'packaging_manager') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র অনুমোদিত ফাইন্যান্স/মার্কেটিং বা সুপার অ্যাডমিন লেজার রিভার্সাল প্রস্তাব তৈরি করতে পারবেন।',
    };
  }
  if (
    !Number.isInteger(input.correctedCreditPoisha) ||
    input.correctedCreditPoisha < 0
  ) {
    return {
      success: false,
      errorBn: 'সংশোধিত অংক পূর্ণসংখ্যা পয়সায় (০ বা তদূর্ধ্ব) হতে হবে।',
    };
  }
  if (!input.reasonBn || input.reasonBn.trim().length < 5) {
    return {
      success: false,
      errorBn: 'লেজার রিভার্সালের সুনির্দিষ্ট কারণ উল্লেখ করা বাধ্যতামূলক।',
    };
  }

  const p4b = readPhase4BStore();
  const store = readPhase7Store();
  const adminStore = readAdminStore();

  const orig = p4b.vendorLedger.find(
    (e) => e.id === input.originalLedgerEntryId
  );
  if (!orig) {
    return {
      success: false,
      errorBn: 'মূল লেজার এন্ট্রি খুঁজে পাওয়া যায়নি।',
    };
  }

  const vendor = p4b.vendors.find((v) => v.vendorId === orig.vendorId);
  const origAbs = Math.abs(orig.amountPoisha);

  const reversal: LedgerReversalRequestRecord = {
    reversalId: `rev-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    reversalCode: `REV-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 899)}`,
    originalLedgerEntryId: orig.id,
    vendorId: orig.vendorId,
    vendorCode: orig.vendorCode,
    vendorNameBn: vendor?.businessNameBn ?? 'কনসাইনমেন্ট ভেন্ডর',
    orderNo: orig.orderNo,
    originalAmountPoisha: origAbs,
    reversalDebitPoisha: origAbs,
    reversalCreditPoisha: origAbs,
    correctedCreditPoisha: input.correctedCreditPoisha,
    isBalancedDoubleEntry: true,
    reasonBn: input.reasonBn.trim(),
    status: 'pending_checker_approval',
    createdByUsername: ctx.username,
    approvedByUsername: null,
    usedEmergencyOverride: false,
    emergencyOverrideReasonBn: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };

  store.ledgerReversals = [reversal, ...(store.ledgerReversals ?? [])];
  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'LEDGER_REVERSAL_REQUEST_CREATED',
    targetType: 'system',
    targetId: reversal.reversalCode,
    summaryBn: `মেকার (@${ctx.username}) কর্তৃক লেজার এন্ট্রি ${orig.id}-এর রিভার্সাল জার্নাল (${reversal.reversalCode}) তৈরি হয়েছে—চেকার অনুমোদনের অপেক্ষায়।`,
    metadata: {
      reversalCode: reversal.reversalCode,
      originalAmountPoisha: origAbs,
      correctedCreditPoisha: input.correctedCreditPoisha,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, reversal };
}

export function resolveLedgerReversalRequest(
  ctx: ActorSecurityContext,
  input: {
    reversalId: string;
    decision: 'approve' | 'reject';
    emergencySelfApprovalOverride?: boolean;
    emergencyOverrideReasonBn?: string;
    totpCode?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  reversal?: LedgerReversalRequestRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন (Checker) লেজার রিভার্সাল ও কারেকশন জার্নাল অনুমোদন করতে পারবেন।',
    };
  }

  const p4b = readPhase4BStore();
  const store = readPhase7Store();
  const adminStore = readAdminStore();

  const rev = (store.ledgerReversals ?? []).find(
    (r) => r.reversalId === input.reversalId
  );
  if (!rev) {
    return {
      success: false,
      errorBn: 'রিভার্সাল অনুরোধ খুঁজে পাওয়া যায়নি।',
    };
  }
  if (rev.status !== 'pending_checker_approval') {
    return {
      success: false,
      errorBn: `এই রিভার্সাল জার্নালটি ইতিমধ্যে (${rev.status}) নিষ্পত্তি হয়েছে।`,
    };
  }

  // Maker-Checker Separation of Duties Rule:
  // Creator cannot self-approve unless Super Admin explicitly invokes 2FA Emergency Override with mandatory reason
  const isSelfApproval = rev.createdByUsername === ctx.username;
  if (isSelfApproval && input.decision === 'approve') {
    const totpCheck = verifyAdminActorTotp(ctx.userId, input.totpCode ?? '');
    if (
      ctx.roleSlug !== 'super_admin' ||
      !input.emergencySelfApprovalOverride ||
      !input.emergencyOverrideReasonBn ||
      input.emergencyOverrideReasonBn.trim().length < 5 ||
      !totpCheck.valid
    ) {
      return {
        success: false,
        errorBn:
          totpCheck.reasonBn ??
          'মেকার-চেকার নীতি অনুযায়ী নিজের তৈরি জার্নাল নিজে অনুমোদন করা নিষিদ্ধ। জরুরি ক্ষেত্রে সুপার অ্যাডমিন ৬-ডিজিট RFC 6238 2FA কোড এবং সুনির্দিষ্ট কারণ দিয়ে Emergency Override ব্যবহার করুন।',
      };
    }
    rev.usedEmergencyOverride = true;
    rev.emergencyOverrideReasonBn = input.emergencyOverrideReasonBn.trim();
  }

  const nowIso = new Date().toISOString();
  rev.status = input.decision === 'approve' ? 'approved_posted' : 'rejected';
  rev.approvedByUsername = ctx.username;
  rev.resolvedAt = nowIso;

  if (input.decision === 'approve') {
    const netDiffPoisha = rev.correctedCreditPoisha - rev.originalAmountPoisha;
    if (netDiffPoisha !== 0) {
      p4b.vendorLedger.unshift({
        id: `vle-rev-${Date.now()}`,
        vendorId: rev.vendorId,
        vendorCode: rev.vendorCode,
        orderNo: rev.orderNo,
        orderItemId: null,
        entryType: netDiffPoisha < 0 ? 'MANUAL_ADJUSTMENT' : 'EARNING_MATURED',
        escrowBucket: 'available',
        amountPoisha: netDiffPoisha,
        deliveredAt: nowIso,
        maturesAt: nowIso,
        descriptionBn: `[${rev.reversalCode}] রিভার্সাল ও কারেকশন জার্নাল পোস্টেড (${rev.reasonBn})।`,
        recordedByUsername: ctx.username,
        createdAt: nowIso,
      });
      writePhase4BStore(p4b);
    }
  }

  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: rev.usedEmergencyOverride
      ? 'MAKER_CHECKER_EMERGENCY_OVERRIDE'
      : `LEDGER_REVERSAL_${rev.status.toUpperCase()}`,
    targetType: 'system',
    targetId: rev.reversalCode,
    summaryBn: `লেজার রিভার্সাল ${rev.reversalCode} "${rev.status}" হিসেবে নিষ্পত্তি হয়েছে (Checker: @${ctx.username})।`,
    metadata: {
      reversalCode: rev.reversalCode,
      usedEmergencyOverride: rev.usedEmergencyOverride,
      emergencyOverrideReasonBn: rev.emergencyOverrideReasonBn,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, reversal: rev };
}

export function executeCustomerRefundWorkflow(
  ctx: ActorSecurityContext,
  input: {
    orderNo: string;
    refundChannel: 'bkash_manual' | 'bank_transfer';
    refundAmountPoisha: Poisha;
    vendorClawbackPoisha?: Poisha;
    refundTrxId: string;
    reasonBn: string;
    checkerApprovedByUsername?: string;
    emergencySelfApprovalOverride?: boolean;
    emergencyOverrideReasonBn?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  refund?: CustomerRefundExecutionRecord;
} {
  if (ctx.roleSlug === 'vendor' || ctx.roleSlug === 'packaging_manager') {
    return {
      success: false,
      errorBn: 'ভেন্ডর বা প্যাকেজিং ম্যানেজার গ্রাহক রিফান্ড অনুমোদন করতে পারবেন না।',
    };
  }
  if (
    !Number.isInteger(input.refundAmountPoisha) ||
    input.refundAmountPoisha < 100
  ) {
    return {
      success: false,
      errorBn: 'রিফান্ডের পরিমাণ কমপক্ষে ১ টাকা (১০০ পয়সা) পূর্ণসংখ্যা হতে হবে।',
    };
  }
  if (!input.refundTrxId || input.refundTrxId.trim().length < 4) {
    return {
      success: false,
      errorBn: 'রিফান্ড ট্রানজেকশন আইডি (TrxID / রেফারেন্স) আবশ্যক।',
    };
  }

  const erp = readErpState();
  const store = readPhase7Store();
  const adminStore = readAdminStore();

  const ord = erp.orders.find(
    (o) => o.orderNo.toUpperCase() === input.orderNo.trim().toUpperCase()
  );
  if (!ord) {
    return { success: false, errorBn: 'অর্ডার খুঁজে পাওয়া যায়নি।' };
  }

  const clawback = Math.max(0, Math.trunc(input.vendorClawbackPoisha ?? 0));
  const platformSubsidy = Math.max(0, input.refundAmountPoisha - clawback);
  const nowIso = new Date().toISOString();

  // Maker-Checker Separation for Customer Refund:
  // A refund request initiated by a non-super-admin starts as 'pending_approval' until a different checker resolves it.
  // Super Admin can execute directly as emergency/authorized settlement or resolve a pending refund via resolveCustomerRefundRequest.
  const refund: CustomerRefundExecutionRecord = {
    refundId: `ref-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    refundCode: `REF-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 899)}`,
    orderNo: ord.orderNo,
    customerName: ord.customerName,
    customerPhone: ord.customerPhone,
    refundChannel: input.refundChannel,
    refundAmountPoisha: input.refundAmountPoisha,
    vendorClawbackPoisha: clawback,
    platformSubsidyPoisha: platformSubsidy,
    refundTrxId: input.refundTrxId.trim().toUpperCase(),
    reasonBn: input.reasonBn.trim(),
    status: ctx.roleSlug === 'super_admin' ? 'approved_paid' : 'pending_approval',
    requestedByUsername: ctx.username,
    approvedByUsername: ctx.roleSlug === 'super_admin' ? ctx.username : null,
    createdAt: nowIso,
    resolvedAt: ctx.roleSlug === 'super_admin' ? nowIso : null,
  };

  if (refund.status === 'approved_paid') {
    ord.paymentStatus = 'refunded';
    writeErpState(erp);
  }

  store.customerRefunds = [refund, ...(store.customerRefunds ?? [])];
  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'CUSTOMER_REFUND_EXECUTED',
    targetType: 'order',
    targetId: ord.orderNo,
    summaryBn: `${ord.orderNo} অর্ডারের গ্রাহককে ৳${Math.round(refund.refundAmountPoisha / 100)} রিফান্ড (${refund.refundCode}, TrxID: ${refund.refundTrxId}) রেকর্ড করা হয়েছে।`,
    metadata: {
      refundCode: refund.refundCode,
      refundAmountPoisha: refund.refundAmountPoisha,
      refundTrxId: refund.refundTrxId,
      status: refund.status,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, refund };
}

export function resolveCustomerRefundRequest(
  ctx: ActorSecurityContext,
  input: {
    refundId: string;
    decision: 'approve' | 'reject';
    emergencySelfApprovalOverride?: boolean;
    emergencyOverrideReasonBn?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  refund?: CustomerRefundExecutionRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন গ্রাহক রিফান্ড চূড়ান্ত অনুমোদন করতে পারেন।',
    };
  }
  const store = readPhase7Store();
  const erp = readErpState();
  const adminStore = readAdminStore();

  const refund = (store.customerRefunds ?? []).find(
    (r) => r.refundId === input.refundId
  );
  if (!refund) {
    return { success: false, errorBn: 'রিফান্ড অনুরোধ খুঁজে পাওয়া যায়নি।' };
  }
  if (refund.status !== 'pending_approval') {
    return {
      success: false,
      errorBn: `এই রিফান্ড অনুরোধ ইতিমধ্যে (${refund.status}) নিষ্পত্তি হয়েছে।`,
    };
  }

  if (input.decision === 'approve') {
    const mcCheck = checkMakerCheckerSeparation({
      makerUsername: refund.requestedByUsername,
      checkerCtx: ctx,
      emergencyOverride: input.emergencySelfApprovalOverride,
      emergencyReasonBn: input.emergencyOverrideReasonBn,
    });
    if (!mcCheck.allowed) {
      return { success: false, errorBn: mcCheck.errorBn };
    }
  }

  const nowIso = new Date().toISOString();
  refund.status = input.decision === 'approve' ? 'approved_paid' : 'rejected';
  refund.approvedByUsername = ctx.username;
  refund.resolvedAt = nowIso;

  if (refund.status === 'approved_paid') {
    const ord = erp.orders.find((o) => o.orderNo === refund.orderNo);
    if (ord) {
      ord.paymentStatus = 'refunded';
      writeErpState(erp);
    }
  }

  writePhase7Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: `CUSTOMER_REFUND_${refund.status.toUpperCase()}`,
    targetType: 'order',
    targetId: refund.orderNo,
    summaryBn: `রিফান্ড ${refund.refundCode} "${refund.status}" হিসেবে নিষ্পত্তি হয়েছে (Checker: @${ctx.username})।`,
    metadata: {
      refundCode: refund.refundCode,
      decision: input.decision,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, refund };
}

export function getPhase7WorkspaceOverview(
  ctx: ActorSecurityContext
): Phase7WorkspaceOverviewDTO {
  const store = readPhase7Store();
  const isVendor = ctx.roleSlug === 'vendor';

  return {
    consignmentLots: isVendor
      ? store.consignmentLots.filter((l) => l.vendorId === ctx.vendorId)
      : store.consignmentLots,
    priceProposals: isVendor
      ? store.priceProposals.filter((p) => p.vendorId === ctx.vendorId)
      : store.priceProposals,
    flashCampaigns: isVendor ? [] : store.flashCampaigns,
    maturityBatches: isVendor ? [] : store.maturityBatches,
    supplierProductOffers: isVendor
      ? (store.supplierProductOffers ?? []).filter(
          (o) => o.vendorId === ctx.vendorId
        )
      : store.supplierProductOffers ?? [],
    fulfillmentGroups: isVendor
      ? (store.fulfillmentGroups ?? []).filter(
          (g) => g.vendorId === ctx.vendorId
        )
      : store.fulfillmentGroups ?? [],
    ledgerReversals: isVendor ? [] : store.ledgerReversals ?? [],
    customerRefunds: isVendor ? [] : store.customerRefunds ?? [],
    executiveAccounting: computeExecutiveAccountingSummary(ctx),
  };
}
