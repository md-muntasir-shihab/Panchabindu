// src/lib/admin/phase4b-service.ts
// Server-Side Admin ERP Service (Phase 4B):
//   - Module B & O: Native CSS A4 3-Part Portrait + 4x6 Thermal Print Engine, Batch Sort, Reprint Counter, & Editable Template
//   - Module C, D & M: District Delivery Rate Table, Courier Adapter (No Fake Success), Pickup Batch + Handover Manifest,
//                      Courier 360 Aging Buckets (0-3/4-7/8-14/15+d), Short-Payment Detector, & Courier Claim Tracker
//   - Module E: Append-Only Vendor Escrow Ledger (Pending -> Locked -> Available), 4-Way Return/Damage Engine,
//               Payout Request/Hold/Approval Flow, Vendor Statement, 15-Question Onboarding, & Contract Closure Audit

import path from 'node:path';
import crypto from 'node:crypto';
import { readLocalJsonStore, writeLocalJsonStore } from '../db/local-json-store';
import type {
  CourierProvider,
  EscrowBucket,
  OrderStatus,
  PayoutStatus,
  ReturnFaultType,
  VendorLedgerEntryType,
  VendorStatus,
} from '../../types/database.types';
import type {
  LedgerCalculationEntry,
  Poisha,
  VendorEscrowBalance,
} from '../../types/domain';
import {
  assertVendorOwnershipOr404,
  checkMakerCheckerSeparation,
  isFirstLoginGateCleared,
  type ActorSecurityContext,
} from '../../types/permissions';
import {
  getEffectiveDistrictDeliveryRates,
  readErpState,
  writeErpState,
} from '../db/repository';
import {
  BD_DISTRICTS,
  getDistrictDeliveryRates,
} from '../geo/bd-geocode';
import { resolveGeoCourierDefaults } from '../geo/bd-courier-geo';
import {
  computeOrderWeightGrams,
  evaluateOrderCourierReadiness,
} from '../courier/bulk-csv-exporter';
import {
  calculateMaturityTimestamp,
  computeVendorEscrowBalance,
  evaluateFourWayReturn,
  validatePayoutRequestEligibility,
} from '../money';
import {
  appendImmutableAuditLog,
  deriveNextBestAction,
  readAdminStore,
  writeAdminStore,
} from './phase4a-service';

// ============================================================================
// 1. INTERFACES & DATA STRUCTURES (PHASE 4B)
// ============================================================================

export interface PrintTemplateConfig {
  defaultMode: 'a4_3part' | 'thermal_4x6';
  part1TitleBn: string;
  part1TitleEn: string;
  part2TitleBn: string;
  part2TitleEn: string;
  part3TitleBn: string;
  part3TitleEn: string;
  part1HeightMm: number;
  part2HeightMm: number;
  part3HeightMm: number;
  checklistItemsBn: string[];
  footerNoteBn: string;
}

/** Customer-Safe Part 1 (Invoice) & Part 2 (Courier Box Sticker) DTO — ZERO Vendor/Cost Leak! */
export interface CustomerSafeSlipPartDTO {
  orderNo: string;
  createdAt: string;
  senderBrandNameBn: string;
  senderBrandNameEn: string;
  senderSupportPhone: string;
  senderAddressBn?: string;
  senderPostCode?: string;
  customerName: string;
  customerPhone: string;
  districtNameBn: string;
  upazilaNameBn: string;
  streetAddress: string;
  landmark: string;
  postCode?: string;
  recipientCity?: string;
  recipientZone?: string;
  recipientArea?: string;
  totalWeightGrams?: number;
  specialInstruction?: string;
  bdPostServiceType?: string;
  bdPostDeclaredValuePoisha?: Poisha;
  courierProvider: CourierProvider;
  consignmentId: string;
  trackingCode: string;
  trackingUrl: string;
  paymentMethod: string;
  paymentStatus: string;
  subtotalPoisha: Poisha;
  discountPoisha: Poisha;
  deliveryChargePoisha: Poisha;
  totalPayablePoisha: Poisha;
  advancePaidPoisha: Poisha;
  codCollectablePoisha: Poisha;
  items: Array<{
    productNameBn: string;
    variantTitleBn: string;
    publicSku: string;
    imageUrl: string;
    quantity: number;
    unitSalePricePoisha: Poisha;
    lineSubtotalPoisha: Poisha;
  }>;
}

/** Internal Part 3 (Admin/Accounts & Warehouse Master Copy) — Cost fields stripped for non-Super-Admin roles */
export interface InternalSlipPart3AccountingSummaryDTO {
  grossMerchandiseSubtotalPoisha: Poisha;
  promoCode: string | null;
  promoDiscountPoisha: Poisha;
  customerDeliveryChargePoisha: Poisha;
  estimatedActualCourierCostPoisha: Poisha;
  deliverySubsidyPoisha: Poisha;
  packagingMaterialCostPoisha: Poisha;
  totalCustomerPayablePoisha: Poisha;
  advancePaidPoisha: Poisha;
  codCollectablePoisha: Poisha;
  totalSupplierCostPoisha: Poisha;
  totalSupplierProfitPoisha: Poisha;
  totalSupplierPayableEscrowPoisha: Poisha;
  grossPlatformMarginPoisha: Poisha;
  estimatedVatOnMarginPoisha: Poisha;
  netPlatformRetainedProfitPoisha: Poisha;
  vendorSplitBreakdown: Array<{
    vendorCode: string;
    vendorNameBn: string;
    vendorContactPhone: string;
    payoutMethodBn: string;
    payoutAccountNo: string;
    itemsCount: number;
    totalUnits: number;
    supplierCostPoisha: Poisha;
    supplierProfitPoisha: Poisha;
    supplierPayablePoisha: Poisha;
    platformMarginPoisha: Poisha;
  }>;
}

export interface InternalSlipPart3DTO {
  orderNo: string;
  createdAt?: string;
  orderStatus?: string;
  orderSource?: string;
  callStatus?: string;
  callAttempts?: number;
  addressQualityScore?: number;
  fraudRiskTierBn?: string;
  courierProvider?: CourierProvider;
  consignmentId?: string;
  trackingCode?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  manualPaymentTrxId?: string | null;
  customerName?: string;
  customerPhone?: string;
  customerFullAddressBn?: string;
  postCode?: string;
  recipientCity?: string;
  recipientZone?: string;
  totalWeightGrams?: number;
  courierReadinessReady?: boolean;
  courierMissingSummaryBn?: string;
  printCount: number;
  isReprintWarning: boolean;
  escrowHoldDays: number;
  estimatedMaturityDaysLabelBn: string;
  internalStaffNote: string;
  checklistItemsBn: string[];
  accountingSummary?: InternalSlipPart3AccountingSummaryDTO;
  lines: Array<{
    lineNo?: number;
    vendorId?: string;
    vendorCode: string;
    vendorBusinessName: string;
    vendorContactPhone?: string;
    vendorPayoutMethodBn?: string;
    internalVendorSku: string;
    publicSku: string;
    productNameBn: string;
    variantTitleBn: string;
    weightGrams?: number;
    warehouseBinCode?: string;
    consignmentLotRef?: string;
    quantity: number;
    unitSalePricePoisha?: Poisha;
    lineSaleSubtotalPoisha?: Poisha;
    snapSupplierCostPoisha?: Poisha;
    snapSupplierProfitPoisha?: Poisha;
    snapSupplierPayablePoisha?: Poisha;
    lineSupplierCostTotalPoisha?: Poisha;
    lineSupplierProfitTotalPoisha?: Poisha;
    lineSupplierPayableTotalPoisha?: Poisha;
    snapPlatformMarginPoisha?: Poisha;
    linePlatformMarginTotalPoisha?: Poisha;
    commissionBp?: number;
    allocatedPromoDiscountPoisha?: Poisha;
    lineNetPlatformMarginPoisha?: Poisha;
  }>;
}

export interface OrderPrintSlipBundle {
  orderNo: string;
  customerAndCourierPart: CustomerSafeSlipPartDTO;
  internalPart3: InternalSlipPart3DTO;
}

export interface DistrictRateOverrideRecord {
  districtId: number;
  districtNameBn: string;
  districtNameEn: string;
  base1KgPoisha: Poisha;
  extraPerKgPoisha: Poisha;
  bdPostPerKgPoisha: Poisha;
  isFreeDeliveryDistrict: boolean;
}

export interface PickupBatchRecord {
  batchId: string;
  batchCode: string;
  courierProvider: CourierProvider;
  orderNos: string[];
  totalParcels: number;
  totalCodPoisha: Poisha;
  status: 'ready_for_handover' | 'handed_over';
  riderName: string | null;
  riderPhone: string | null;
  createdByUsername: string;
  createdAt: string;
  handedOverAt: string | null;
}

export type ManualParcelStatus =
  | 'dispatched'
  | 'in_transit'
  | 'delivered'
  | 'returned'
  | 'settled';

export interface ManualCourierParcelRecord {
  parcelId: string;
  isStandalone: boolean;
  orderNo: string | null;
  courierProvider: CourierProvider;
  deliveryMethodBn: string;
  consignmentId: string;
  trackingCode: string;
  districtId: number | null;
  districtNameBn: string;
  upazilaId: number | null;
  upazilaNameBn: string;
  destinationAddressBn: string;
  dispatchedAt: string;
  deliveredAt: string | null;
  returnedAt: string | null;
  collectableCodPoisha: Poisha;
  courierChargePoisha: Poisha;
  riderName: string | null;
  riderPhone: string | null;
  status: ManualParcelStatus;
  proofRef: string | null;
  proofUrl: string | null;
  noteBn: string;
  vendorIds: string[];
  recordedByUsername: string;
  createdAt: string;
  updatedAt: string;
}

export interface ManualCourierProviderAccountSummary {
  provider: CourierProvider;
  providerLabelBn: string;
  providerLabelEn: string;
  totalParcelsSent: number;
  inTransitParcels: number;
  deliveredParcels: number;
  returnedParcels: number;
  settledParcels: number;
  inTransitCodPoisha: Poisha;
  deliveredCollectableCodPoisha: Poisha;
  totalCourierFeesPoisha: Poisha;
  totalAdjustmentsPoisha: Poisha;
  totalReceivedPoisha: Poisha;
  netReceivablePoisha: Poisha;
  shortPaymentTotalPoisha: Poisha;
  openClaimsPoisha: Poisha;
}

export interface ManualCourierAccountsSummary {
  providers: ManualCourierProviderAccountSummary[];
  totals: {
    totalParcelsSent: number;
    inTransitCodPoisha: Poisha;
    deliveredCollectableCodPoisha: Poisha;
    totalCourierFeesPoisha: Poisha;
    totalAdjustmentsPoisha: Poisha;
    totalReceivedPoisha: Poisha;
    netReceivablePoisha: Poisha;
  };
}

export interface CourierRemittanceLedgerRecord {
  id: string;
  settlementRef: string;
  courierProvider: CourierProvider;
  orderNo: string;
  consignmentId: string;
  expectedCodPoisha: Poisha;
  courierFeeDeductedPoisha: Poisha;
  remittedAmountPoisha: Poisha;
  shortPaymentPoisha: Poisha; // > 0 when remitted < expected - fee
  isShortPaymentFlagged: boolean;
  recordedByUsername: string;
  createdAt: string;
  parcelId?: string | null;
  isStandalone?: boolean;
  adjustmentPoisha?: Poisha;
  paymentChannelBn?: string;
  settledAt?: string;
  proofUrl?: string | null;
  noteBn?: string;
}

export interface CourierClaimRecord {
  claimId: string;
  orderNo: string;
  consignmentId: string;
  courierProvider: CourierProvider;
  claimAmountPoisha: Poisha;
  reasonBn: string;
  proofUrl: string;
  status: 'open' | 'under_review' | 'settled' | 'rejected';
  createdAt: string;
}

export interface VendorProfileRecord {
  vendorId: string;
  vendorCode: string;
  businessNameBn: string;
  businessNameEn: string;
  ownerNameBn: string;
  contactPhone: string;
  defaultCommissionBp: number | null; // null -> use global default
  escrowHoldDaysOverride: number | null; // null -> use global hold days
  payoutMethodBn: string;
  payoutAccountNo: string;
  status: VendorStatus;
  onboardingAnswers15: Record<string, string>;
  createdAt: string;
}

export interface ImmutableVendorLedgerRecord extends LedgerCalculationEntry {
  vendorId: string;
  vendorCode: string;
  orderNo: string | null;
  descriptionBn: string;
  recordedByUsername: string;
  createdAt: string;
  referenceNo?: string | null;
  paymentMethodBn?: string | null;
  proofUrl?: string | null;
  noteBn?: string | null;
  eventTimestamp?: string;
}

export interface VendorPayoutRequestRecord {
  payoutId: string;
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  requestedAmountPoisha: Poisha;
  payoutMethodBn: string;
  payoutAccountNo: string;
  status: PayoutStatus;
  holdLedgerEntryId: string;
  rejectionReasonBn: string | null;
  paymentTrxId: string | null;
  proofUrl: string | null;
  requestedByUsername: string;
  requestedAt: string;
  resolvedAt: string | null;
  feePoisha?: Poisha;
  netPaidPoisha?: Poisha;
  senderAccountNo?: string | null;
  noteBn?: string | null;
  entryType?: 'vendor_request' | 'admin_created' | 'direct_settlement';
}

export interface ReturnResolutionRecord {
  returnId: string;
  orderNo: string;
  vendorId: string;
  faultType: ReturnFaultType;
  quantity: number;
  vendorDebitPoisha: Poisha;
  platformLossPoisha: Poisha;
  courierClaimPoisha: Poisha;
  restockQuantity: number;
  proofUrl: string;
  noteBn: string;
  createdAt: string;
}

export interface Courier360ProviderSummary {
  provider: CourierProvider;
  providerLabelBn: string;
  apiConnected: boolean;
  connectionStatusBadgeBn: string;
  inTransitCount: number;
  inTransitCodPoisha: Poisha;
  deliveredUnsettledCount: number;
  deliveredUnsettledCodPoisha: Poisha;
  settledCount: number;
  settledRemittedPoisha: Poisha;
  shortPaymentTotalPoisha: Poisha;
  openClaimsCount: number;
  openClaimsPoisha: Poisha;
  agingBuckets: {
    days0to3Poisha: Poisha;
    days4to7Poisha: Poisha;
    days8to14Poisha: Poisha;
    days15PlusPoisha: Poisha;
  };
  oldestUnsettledOrderNo: string | null;
  oldestUnsettledDays: number;
}

interface Phase4BPersistentStore {
  printConfig: PrintTemplateConfig;
  districtRateOverrides: Record<number, DistrictRateOverrideRecord>;
  pickupBatches: PickupBatchRecord[];
  courierRemittanceLedger: CourierRemittanceLedgerRecord[];
  courierClaims: CourierClaimRecord[];
  vendors: VendorProfileRecord[];
  vendorLedger: ImmutableVendorLedgerRecord[];
  payoutRequests: VendorPayoutRequestRecord[];
  returnResolutions: ReturnResolutionRecord[];
  printCountsByOrderNo?: Record<string, number>;
  manualCourierParcels?: ManualCourierParcelRecord[];
  /** Admin-controlled per-vendor capability matrix (vendor panel switches). */
  vendorControls?: Record<string, VendorControlEntry>;
  kycDocuments?: VendorKycDocument[];
  supportTickets?: VendorSupportTicket[];
  /** Vendor-filed profile / payout-account / onboarding change requests. */
  vendorRequests?: VendorRequestEntry[] | Record<string, VendorRequestEntry>;
}

export interface VendorSupportTicket {
  ticketId: string;
  vendorId: string;
  subject: string;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
  messages: Array<{ messageId: string; sender: 'vendor' | 'admin'; text: string; createdAt: string }>;
}

export interface VendorKycDocument {
  documentId: string;
  vendorId: string;
  category: 'identity' | 'business' | 'other';
  storagePath: string;
  status: 'pending_review' | 'approved' | 'rejected';
  uploadedBy: string;
  createdAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
}

export interface VendorControlEntry {
  capabilities: Record<string, boolean | number> | object;
  restrictionNoteBn?: string;
  updatedAt: string;
  updatedByUsername: string;
}

export interface VendorRequestEntry {
  requestId: string;
  kind: 'profile_update' | 'onboarding_update';
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  payload: Record<string, unknown>;
  status: 'pending_review' | 'approved' | 'rejected';
  requestedByUsername: string;
  createdAt: string;
  reviewedByUsername: string | null;
  reviewedAt: string | null;
  reviewNoteBn: string | null;
}

const PHASE4B_DATA_DIR = path.join(process.cwd(), '.data');
const PHASE4B_DATA_FILE = path.join(
  PHASE4B_DATA_DIR,
  'erp-phase4b-store.json'
);

export const VENDOR_ONBOARDING_15_QUESTIONS: Array<{
  key: string;
  questionBn: string;
  placeholderBn: string;
}> = [
  {
    key: 'q1_business_name',
    questionBn: '১. প্রতিষ্ঠানের নাম ও ট্রেড লাইসেন্স/এনআইডি নম্বর কী?',
    placeholderBn: 'যেমন: রূপগঞ্জ উইভার্স, NID: 19922690001',
  },
  {
    key: 'q2_product_category',
    questionBn: '২. আপনার মূল পণ্যের ক্যাটাগরি ও নিজস্ব উৎপাদন কি না?',
    placeholderBn: 'হাতে বোনা জামদানি ও তাঁত শাড়ি (নিজস্ব কারখানা)',
  },
  {
    key: 'q3_consignment_agreement',
    questionBn: '৩. ১৮-দফা কনসাইনমেন্ট নীতিমালা (অগ্রিম ছাড়া পণ্য জমা ও বিক্রির পর পেমেন্ট)-এ সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্পূর্ণ সম্মত',
  },
  {
    key: 'q4_ownership_clause',
    questionBn: '৪. পণ্য বিক্রি না হওয়া পর্যন্ত মালিকানা সাপ্লায়ারের থাকবে—এই শর্তে সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্মত',
  },
  {
    key: 'q5_three_tier_pricing',
    questionBn: '৫. ৩-স্তরের মূল্য নির্ধারণ (কেনা দাম + আপনার লাভ = আপনার প্রদেয়)-এ সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্মত',
  },
  {
    key: 'q6_escrow_hold_days',
    questionBn: '৬. ডেলিভারির পর রিটার্ন যাচাইয়ের জন্য নির্ধারিত এসক্রো হোল্ড পিরিয়ড (যেমন ৭ দিন)-এ সম্মত কি?',
    placeholderBn: 'হ্যাঁ, ৭ দিন হোল্ড পিরিয়ডে সম্মত',
  },
  {
    key: 'q7_defect_liability',
    questionBn: '৭. উৎপাদনগত ত্রুটি বা নিম্নমানের কারণে রিটার্ন হলে সাপ্লায়ার লেজার থেকে সমন্বয়ে সম্মত কি?',
    placeholderBn: 'হ্যাঁ, ছবি/ভিডিও প্রমাণ সাপেক্ষে সম্মত',
  },
  {
    key: 'q8_qc_inspection',
    questionBn: '৮. গুদামে পণ্য পাঠানোর সময় ১০০% কিউসি (QC) ও ভিডিও রেকর্ডিং প্রক্রিয়ায় সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্মত',
  },
  {
    key: 'q9_lead_time_days',
    questionBn: '৯. স্টক শেষের সতর্কতা পাওয়ার পর কত দিনের মধ্যে নতুন স্টক পাঠাতে পারবেন (Lead Time)?',
    placeholderBn: '৩ কার্যদিবসের মধ্যে',
  },
  {
    key: 'q10_packaging_standard',
    questionBn: '১০. প্রতিটি পণ্যে আপনার ইন্টারনাল ভেন্ডর SKU ট্যাগ সংযুক্ত করে পাঠাতে পারবেন কি?',
    placeholderBn: 'হ্যাঁ, প্রতিটি পিসে SKU স্টিকার থাকবে',
  },
  {
    key: 'q11_no_customer_contact',
    questionBn: '১১. পার্সেলে সাপ্লায়ারের নিজস্ব নাম/ফোন/কার্ড না দেওয়ার গোপনীয়তা শর্তে সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্পূর্ণ ব্র্যান্ড-নিরপেক্ষ থাকবে',
  },
  {
    key: 'q12_payout_channel',
    questionBn: '১২. আপনার পেআউট গ্রহণের মাধ্যম (বিকাশ মার্চেন্ট/পার্সোনাল বা ব্যাংক হিসাব) কী?',
    placeholderBn: 'বিকাশ পার্সোনাল: 01711223344',
  },
  {
    key: 'q13_return_pickup',
    questionBn: '১৩. অবিক্রিত বা চুক্তি সমাপ্তির পর অবশিষ্ট স্টক কত দিনের মধ্যে ফেরত নেবেন?',
    placeholderBn: '৭ কার্যদিবসের মধ্যে',
  },
  {
    key: 'q14_emergency_contact',
    questionBn: '১৪. জরুরি যোগাযোগের জন্য বিকল্প মোবাইল নম্বর ও ঠিকানা কী?',
    placeholderBn: 'রূপগঞ্জ, নারায়ণগঞ্জ — 01811223344',
  },
  {
    key: 'q15_contract_closure_audit',
    questionBn: '১৫. সব বকেয়া ও স্টক অডিট নিষ্পত্তি ছাড়া অ্যাকাউন্ট ক্লোজ হবে না—এই শর্তে সম্মত কি?',
    placeholderBn: 'হ্যাঁ, চূড়ান্ত অডিট শর্তে সম্মত',
  },
];

function getInitialPhase4BStore(): Phase4BPersistentStore {
  const printConfig: PrintTemplateConfig = {
    defaultMode: 'a4_3part',
    part1TitleBn: 'গ্রাহক কপি / Customer Invoice',
    part1TitleEn: 'Customer Invoice',
    part2TitleBn: 'কুরিয়ার বক্স স্টিকার / Courier Box Label',
    part2TitleEn: 'Courier Box Sticker',
    part3TitleBn: 'অভ্যন্তরীণ গুদাম ও প্যাকিং কপি / Internal QC Copy',
    part3TitleEn: 'Internal Warehouse & Supplier Copy',
    part1HeightMm: 98,
    part2HeightMm: 98,
    part3HeightMm: 98,
    checklistItemsBn: [
      'পণ্যের রঙ, সাইজ ও কোয়ালিটি (QC) যাচাইকৃত',
      'বাবল র‍্যাপ ও ওয়াটারপ্রুফ পলি সংযুক্ত',
      'গ্রাহক ইনভয়েস (Part 1) ভেতরে দেওয়া হয়েছে',
      'বক্সের ওপরে কুরিয়ার স্টিকার (Part 2) লাগানো হয়েছে',
    ],
    footerNoteBn:
      'পণ্য গ্রহণের সময় ডেলিভারি ম্যানের সামনে আনবক্সিং ভিডিও করার অনুরোধ করা হলো।',
  };

  const vendors: VendorProfileRecord[] = [
    {
      vendorId: '00000000-0000-4000-8000-000000000901',
      vendorCode: 'VND-001',
      businessNameBn: 'রূপগঞ্জ উইভার্স',
      businessNameEn: 'Rupganj Weavers',
      ownerNameBn: 'মুনতাসির শিহাব',
      contactPhone: '01711901901',
      defaultCommissionBp: 1500, // 15%
      escrowHoldDaysOverride: 7,
      payoutMethodBn: 'বিকাশ মার্চেন্ট',
      payoutAccountNo: '01711901901',
      status: 'active',
      onboardingAnswers15: Object.fromEntries(
        VENDOR_ONBOARDING_15_QUESTIONS.map((q) => [q.key, q.placeholderBn])
      ),
      createdAt: '2026-10-15T00:00:00.000Z',
    },
    {
      vendorId: '00000000-0000-4000-8000-000000000902',
      vendorCode: 'VND-002',
      businessNameBn: 'হাজারীবাগ লেদার ক্রাফট',
      businessNameEn: 'Hazaribagh Leather Craft',
      ownerNameBn: 'মুনতাসির শিহাব',
      contactPhone: '01811902902',
      defaultCommissionBp: 1800, // 18%
      escrowHoldDaysOverride: 5,
      payoutMethodBn: 'নগদ পার্সোনাল',
      payoutAccountNo: '01811902902',
      status: 'active',
      onboardingAnswers15: Object.fromEntries(
        VENDOR_ONBOARDING_15_QUESTIONS.map((q) => [q.key, q.placeholderBn])
      ),
      createdAt: '2026-10-18T00:00:00.000Z',
    },
    {
      vendorId: '00000000-0000-4000-8000-000000000903',
      vendorCode: 'VND-003',
      businessNameBn: 'সুন্দরবন অর্গানিকস',
      businessNameEn: 'Sundarban Organics',
      ownerNameBn: 'মুনতাসির শিহাব',
      contactPhone: '01911903903',
      defaultCommissionBp: 1200, // 12%
      escrowHoldDaysOverride: 7,
      payoutMethodBn: 'সিটি ব্যাংক পিএলসি',
      payoutAccountNo: '14029384756',
      status: 'active',
      onboardingAnswers15: Object.fromEntries(
        VENDOR_ONBOARDING_15_QUESTIONS.map((q) => [q.key, q.placeholderBn])
      ),
      createdAt: '2026-10-20T00:00:00.000Z',
    },
  ];

  // Seed Append-Only Vendor Ledger demonstrating Pending, Locked (countdown), and Available (matured) buckets
  const vendorLedger: ImmutableVendorLedgerRecord[] = [
    {
      id: 'vled-seed-1',
      vendorId: '00000000-0000-4000-8000-000000000901',
      vendorCode: 'VND-001',
      orderItemId: 'item-hist-001',
      orderNo: 'ORD-261025-0091',
      entryType: 'EARNING_MATURED',
      escrowBucket: 'available',
      amountPoisha: 400000, // 4,000 BDT matured & withdrawable
      deliveredAt: '2026-10-26T10:00:00.000Z',
      maturesAt: '2026-11-02T10:00:00.000Z',
      descriptionBn: 'অর্ডার ORD-261025-0091 ডেলিভারি ও ৭ দিন হোল্ড পিরিয়ড পূর্ণ হয়েছে।',
      recordedByUsername: 'system_cron',
      createdAt: '2026-11-02T10:05:00.000Z',
    },
    {
      id: 'vled-seed-2',
      vendorId: '00000000-0000-4000-8000-000000000901',
      vendorCode: 'VND-001',
      orderItemId: 'item-hist-002',
      orderNo: 'ORD-261103-0098',
      entryType: 'EARNING_LOCKED',
      escrowBucket: 'locked',
      amountPoisha: 200000, // 2,000 BDT in locked hold period
      deliveredAt: '2026-11-04T12:00:00.000Z',
      maturesAt: '2099-11-11T12:00:00.000Z',
      descriptionBn: 'অর্ডার ORD-261103-0098 ডেলিভারড — ৭ দিনের রিটার্ন হোল্ড পিরিয়ডে লকড।',
      recordedByUsername: 'admin',
      createdAt: '2026-11-04T12:00:00.000Z',
    },
    {
      id: 'vled-seed-3',
      vendorId: '00000000-0000-4000-8000-000000000901',
      vendorCode: 'VND-001',
      orderItemId: 'item-ord-0001',
      orderNo: 'ORD-261106-0001',
      entryType: 'EARNING_PENDING',
      escrowBucket: 'pending',
      amountPoisha: 200000, // 2,000 BDT pending delivery
      deliveredAt: null,
      maturesAt: null,
      descriptionBn: 'অর্ডার ORD-261106-0001 কনফার্মড — ডেলিভারি ও রেমিট্যান্সের অপেক্ষায় পেন্ডিং।',
      recordedByUsername: 'admin',
      createdAt: '2026-11-06T06:30:00.000Z',
    },
    {
      id: 'vled-seed-4',
      vendorId: '00000000-0000-4000-8000-000000000902',
      vendorCode: 'VND-002',
      orderItemId: 'item-ord-0002',
      orderNo: 'ORD-261106-0002',
      entryType: 'EARNING_PENDING',
      escrowBucket: 'pending',
      amountPoisha: 112000, // 1,120 BDT (2 leather wallets * 560 BDT payable)
      deliveredAt: null,
      maturesAt: null,
      descriptionBn: 'অর্ডার ORD-261106-0002 পেন্ডিং কনফার্মেশন — সাপ্লায়ার প্রদেয় স্ন্যাপশট।',
      recordedByUsername: 'admin',
      createdAt: '2026-11-06T07:10:00.000Z',
    },
  ];

  const courierRemittanceLedger: CourierRemittanceLedgerRecord[] = [
    {
      id: 'rem-seed-1',
      settlementRef: 'STF-REM-261102',
      courierProvider: 'steadfast',
      orderNo: 'ORD-261025-0091',
      consignmentId: 'CNS-ORD-261025-0091',
      expectedCodPoisha: 245000,
      courierFeeDeductedPoisha: 7000,
      remittedAmountPoisha: 238000,
      shortPaymentPoisha: 0,
      isShortPaymentFlagged: false,
      recordedByUsername: 'admin',
      createdAt: '2026-11-02T09:00:00.000Z',
    },
  ];

  const courierClaims: CourierClaimRecord[] = [
    {
      claimId: 'CLM-261101-01',
      orderNo: 'ORD-261028-0044',
      consignmentId: 'CNS-ORD-261028-0044',
      courierProvider: 'pathao',
      claimAmountPoisha: 125000, // 1,250 BDT honey jar broken by courier
      reasonBn: 'কুরিয়ার ট্রানজিটে কাঁচের জার ভেঙে যাওয়ায় ৪-মুখী রিটার্ন ইঞ্জিন থেকে ক্লেইম তৈরি।',
      proofUrl: 'https://picsum.photos/seed/claimproof1/400/300',
      status: 'open',
      createdAt: '2026-11-01T14:00:00.000Z',
    },
  ];

  return {
    printConfig,
    districtRateOverrides: {},
    pickupBatches: [],
    courierRemittanceLedger,
    courierClaims,
    vendors,
    vendorLedger,
    payoutRequests: [],
    returnResolutions: [],
    manualCourierParcels: [],
  };
}

export function readPhase4BStore(): Phase4BPersistentStore {
  const parsed = readLocalJsonStore<Phase4BPersistentStore>(PHASE4B_DATA_FILE, {
    arrays: ['pickupBatches', 'courierRemittanceLedger', 'courierClaims', 'vendors', 'vendorLedger', 'payoutRequests', 'returnResolutions'],
    objects: ['printConfig', 'districtRateOverrides'],
    optionalObjects: ['printCountsByOrderNo'],
    optionalArrays: ['kycDocuments', 'supportTickets', 'manualCourierParcels'],
    optionalArraysAndObjects: ['vendorControls', 'vendorRequests'],
  });
  if (parsed) {
    return {
      ...parsed,
      printCountsByOrderNo: parsed.printCountsByOrderNo ?? {},
      manualCourierParcels: parsed.manualCourierParcels ?? [],
      vendorControls: (parsed.vendorControls as Record<string, VendorControlEntry>) ?? {},
      vendorRequests: (parsed.vendorRequests as VendorRequestEntry[]) ?? [],
    };
  }

  const initial = getInitialPhase4BStore();
  writePhase4BStore(initial);
  return initial;
}

export function writePhase4BStore(store: Phase4BPersistentStore): void {
  writeLocalJsonStore(PHASE4B_DATA_FILE, store);
}

// ============================================================================
// 2. MODULE B & O: A4 3-PART PORTRAIT & 4X6 THERMAL PRINT ENGINE
// ============================================================================

/**
 * Generates Role-Protected Print Slip Bundles for single or batch orders.
 * Enforces Rule A2:
 *   - Part 1 (Customer Invoice) & Part 2 (Courier Sticker) NEVER contain vendor name,
 *     vendor code, internal SKU, buying price, or internal staff notes.
 *   - Courier sender name is ALWAYS the Platform Brand Name.
 *   - Part 3 (Internal Copy) strips buying cost & margin for non-Super-Admin roles.
 */
export function generateOrderPrintSlips(
  ctx: ActorSecurityContext,
  input: {
    orderNos: string[];
    sortBy?: 'order_no' | 'vendor' | 'courier' | 'district' | 'sku';
    recordPrint?: boolean;
  }
): {
  success: boolean;
  errorBn?: string;
  printConfig: PrintTemplateConfig;
  slips: OrderPrintSlipBundle[];
} {
  const p4bStore = readPhase4BStore();
  if (!(['super_admin'] as string[]).includes(ctx.roleSlug)) {
    return {
      success: false,
      errorBn: 'Part 3-সহ প্রিন্ট বান্ডল শুধু অনুমোদিত অ্যাডমিন ব্যবহার করতে পারবেন।',
      printConfig: p4bStore.printConfig,
      slips: [],
    };
  }
  if (!isFirstLoginGateCleared(ctx)) {
    return {
      success: false,
      errorBn: 'প্রিন্ট করার আগে প্রথম লগইন সিকিউরিটি গেট সম্পন্ন করুন।',
      printConfig: p4bStore.printConfig,
      slips: [],
    };
  }

  const erpState = readErpState();
  const adminStore = readAdminStore();
  const requestedSet = new Set(
    input.orderNos.map((n) => n.trim().toUpperCase())
  );

  const matchedOrders = erpState.orders.filter((o) =>
    requestedSet.has(o.orderNo.toUpperCase())
  );

  const bundles: Array<{
    bundle: OrderPrintSlipBundle;
    firstVendorCode: string;
    firstSku: string;
    courier: string;
    district: string;
  }> = [];

  for (const ord of matchedOrders) {
    const rawLines = erpState.orderLines.filter((l) => l.orderId === ord.id);

    // Cross-vendor isolation: if vendor role, verify ownership or throw 404
    if (ctx.roleSlug === 'vendor') {
      const hasOwnLine = rawLines.some((l) => l.vendorId === ctx.vendorId);
      if (!hasOwnLine) {
        assertVendorOwnershipOr404(ctx, 'other-vendor-id');
      }
    }

    const prevPrintCount = Math.max(
      ord.printCount ?? 0,
      p4bStore.printCountsByOrderNo?.[ord.orderNo] ?? 0
    );
    const printCount = prevPrintCount + (input.recordPrint ? 1 : 0);
    if (input.recordPrint) {
      ord.printCount = printCount;
      p4bStore.printCountsByOrderNo = p4bStore.printCountsByOrderNo ?? {};
      p4bStore.printCountsByOrderNo[ord.orderNo] = printCount;
    }

    const meta = adminStore.orderMeta[ord.orderNo];
    const trackingCode = ord.trackingCode ?? '';
    const consignmentId = ord.consignmentId ?? '';

    const customerSafeItems = rawLines.map((l) => {
      const prod = erpState.products.find((p) => p.productId === l.productId);
      const variant = prod?.variants.find((v) => v.variantId === l.variantId);
      return {
        productNameBn: l.productNameBn,
        variantTitleBn: l.variantTitleBn,
        publicSku: l.publicSku,
        imageUrl:
          variant?.imageUrl ??
          prod?.images[0] ??
          '',
        quantity: l.quantity,
        unitSalePricePoisha: l.snapUnitSalePricePoisha,
        lineSubtotalPoisha: l.lineSubtotalPoisha,
      };
    });

    const resolvedGeo = resolveGeoCourierDefaults({
      districtId: ord.districtId,
      upazilaId: ord.upazilaId,
      streetAddress: ord.streetAddress,
      landmark: ord.landmark,
      existingPostCode: ord.postCode,
      existingCity: ord.recipientCity,
      existingZone: ord.recipientZone,
      existingArea: ord.recipientArea,
    });
    const postCode = ord.postCode?.trim() || resolvedGeo.postCode;
    const recipientCity =
      ord.recipientCity?.trim() || resolvedGeo.recipientCity;
    const recipientZone =
      ord.recipientZone?.trim() || resolvedGeo.recipientZone;
    const recipientArea =
      ord.recipientArea?.trim() || resolvedGeo.recipientArea;
    const totalWeightGrams = computeOrderWeightGrams(
      ord,
      rawLines,
      erpState.products
    );
    const readiness = evaluateOrderCourierReadiness({
      order: {
        ...ord,
        postCode,
        recipientCity,
        recipientZone,
        recipientArea,
        totalWeightGrams,
      },
      orderLines: rawLines,
      products: erpState.products,
      siteSettings: erpState.siteSettings,
    });

    const customerAndCourierPart: CustomerSafeSlipPartDTO = {
      orderNo: ord.orderNo,
      createdAt: ord.createdAt,
      senderBrandNameBn:
        erpState.siteSettings.courierSenderNameBn ||
        erpState.siteSettings.brandNameBn,
      senderBrandNameEn: erpState.siteSettings.brandNameEn,
      senderSupportPhone:
        erpState.siteSettings.courierSenderPhone ||
        erpState.siteSettings.supportPhone,
      senderAddressBn:
        erpState.siteSettings.courierSenderAddressBn ||
        erpState.siteSettings.aboutContactPage?.warehouseAddressBn ||
        'বাড়ি ১২, রোড ৫, ধানমন্ডি, ঢাকা-১২০৫',
      senderPostCode: erpState.siteSettings.courierSenderPostCode || '1205',
      customerName: ord.customerName,
      customerPhone:
        ctx.roleSlug === 'vendor' && ctx.maskCustomerPiiForVendor
          ? `${ord.customerPhone.slice(0, 3)}****${ord.customerPhone.slice(-3)}`
          : ord.customerPhone,
      districtNameBn: ord.districtNameBn,
      upazilaNameBn: ord.upazilaNameBn,
      streetAddress:
        ctx.roleSlug === 'vendor' && ctx.maskCustomerPiiForVendor
          ? '*** (গোপনীয় গ্রাহক ঠিকানা)'
          : ord.streetAddress,
      landmark: ord.landmark,
      postCode,
      recipientCity,
      recipientZone,
      recipientArea,
      totalWeightGrams,
      specialInstruction:
        ord.specialInstruction?.trim() || ord.customerNote?.trim() || '',
      bdPostServiceType:
        ord.bdPostServiceType ||
        erpState.siteSettings.defaultBdPostServiceType ||
        (ord.codCollectablePoisha > 0 ? 'VPP_PARCEL' : 'REGISTERED_PARCEL'),
      bdPostDeclaredValuePoisha:
        ord.bdPostDeclaredValuePoisha ?? ord.subtotalPoisha,
      courierProvider: ord.courierProvider,
      consignmentId,
      trackingCode,
      trackingUrl: ord.secureTrackingToken ? `/order-tracking/${encodeURIComponent(ord.secureTrackingToken)}` : '',
      paymentMethod: ord.paymentMethod,
      paymentStatus: ord.paymentStatus,
      subtotalPoisha: ord.subtotalPoisha,
      discountPoisha: ord.discountPoisha,
      deliveryChargePoisha: ord.deliveryChargePoisha,
      totalPayablePoisha: ord.totalPayablePoisha,
      advancePaidPoisha: ord.advancePaidPoisha,
      codCollectablePoisha: ord.codCollectablePoisha,
      items: customerSafeItems,
    };

    const orderSubtotalSafe = Math.max(1, ord.subtotalPoisha);
    const internalLines = rawLines
      .filter((l) => (ctx.roleSlug === 'vendor' ? l.vendorId === ctx.vendorId : true))
      .map((l, idx) => {
        const prod = erpState.products.find((p) => p.productId === l.productId);
        const variant = prod?.variants.find((v) => v.variantId === l.variantId);
        const vendor = p4bStore.vendors.find((v) => v.vendorId === l.vendorId);
        const unitCost = l.snapSupplierCostPoisha;
        const unitPayable = l.snapSupplierPayablePoisha;
        const unitProfit = Math.max(0, unitPayable - unitCost);
        const unitMargin = l.snapPlatformMarginPoisha;
        const unitSale = l.snapUnitSalePricePoisha;
        const lineSaleSubtotal = l.lineSubtotalPoisha;
        const allocatedPromo =
          ord.discountPoisha > 0
            ? Math.round((ord.discountPoisha * lineSaleSubtotal) / orderSubtotalSafe)
            : 0;

        const baseLine: InternalSlipPart3DTO['lines'][number] = {
          lineNo: idx + 1,
          vendorId: l.vendorId,
          vendorCode: vendor?.vendorCode ?? prod?.vendorCode ?? 'VND-SYS',
          vendorBusinessName:
            vendor?.businessNameBn ?? prod?.vendorBusinessName ?? 'সাপ্লায়ার',
          vendorContactPhone:
            ctx.roleSlug === 'vendor' ? undefined : vendor?.contactPhone ?? '',
          vendorPayoutMethodBn:
            ctx.roleSlug === 'super_admin' ||
            (ctx.roleSlug === 'vendor' && l.vendorId === ctx.vendorId)
              ? vendor?.payoutMethodBn ?? ''
              : undefined,
          internalVendorSku: l.internalVendorSku,
          publicSku: l.publicSku,
          productNameBn: l.productNameBn,
          variantTitleBn: l.variantTitleBn,
          weightGrams: variant?.weightGrams ?? undefined,
          quantity: l.quantity,
          unitSalePricePoisha: unitSale,
          lineSaleSubtotalPoisha: lineSaleSubtotal,
        };

        // Only Super Admin or the owning Vendor sees Supplier Cost / Profit / Payable on Part 3
        if (ctx.roleSlug === 'super_admin') {
          baseLine.snapSupplierCostPoisha = unitCost;
          baseLine.snapSupplierProfitPoisha = unitProfit;
          baseLine.snapSupplierPayablePoisha = unitPayable;
          baseLine.lineSupplierCostTotalPoisha = unitCost * l.quantity;
          baseLine.lineSupplierProfitTotalPoisha = unitProfit * l.quantity;
          baseLine.lineSupplierPayableTotalPoisha = unitPayable * l.quantity;
          baseLine.snapPlatformMarginPoisha = unitMargin;
          baseLine.linePlatformMarginTotalPoisha = unitMargin * l.quantity;
          baseLine.commissionBp =
            unitSale > 0 ? Math.round((unitMargin * 10000) / unitSale) : 0;
          baseLine.allocatedPromoDiscountPoisha = allocatedPromo;
          baseLine.lineNetPlatformMarginPoisha = Math.max(
            0,
            unitMargin * l.quantity - allocatedPromo
          );
        } else if (ctx.roleSlug === 'vendor' && l.vendorId === ctx.vendorId) {
          baseLine.snapSupplierCostPoisha = unitCost;
          baseLine.snapSupplierProfitPoisha = unitProfit;
          baseLine.snapSupplierPayablePoisha = unitPayable;
          baseLine.lineSupplierCostTotalPoisha = unitCost * l.quantity;
          baseLine.lineSupplierProfitTotalPoisha = unitProfit * l.quantity;
          baseLine.lineSupplierPayableTotalPoisha = unitPayable * l.quantity;
        }

        return baseLine;
      });

    // Build Order-Level Accounting Summary & Multi-Vendor Split exclusively for Super Admin
    let accountingSummary: InternalSlipPart3AccountingSummaryDTO | undefined;
    if (ctx.roleSlug === 'super_admin') {
      let totalSupplierCostPoisha = 0;
      let totalSupplierProfitPoisha = 0;
      let totalSupplierPayableEscrowPoisha = 0;
      let grossPlatformMarginPoisha = 0;

      const vendorMap = new Map<
        string,
        InternalSlipPart3AccountingSummaryDTO['vendorSplitBreakdown'][number]
      >();

      for (const l of rawLines) {
        const prod = erpState.products.find((p) => p.productId === l.productId);
        const vendor = p4bStore.vendors.find((v) => v.vendorId === l.vendorId);
        const vCode = vendor?.vendorCode ?? prod?.vendorCode ?? 'VND-SYS';
        const vName =
          vendor?.businessNameBn ?? prod?.vendorBusinessName ?? 'সাপ্লায়ার';
        const unitCost = l.snapSupplierCostPoisha;
        const unitPayable = l.snapSupplierPayablePoisha;
        const unitProfit = Math.max(0, unitPayable - unitCost);
        const unitMargin = l.snapPlatformMarginPoisha;

        const lineCost = unitCost * l.quantity;
        const lineProfit = unitProfit * l.quantity;
        const linePayable = unitPayable * l.quantity;
        const lineMargin = unitMargin * l.quantity;

        totalSupplierCostPoisha += lineCost;
        totalSupplierProfitPoisha += lineProfit;
        totalSupplierPayableEscrowPoisha += linePayable;
        grossPlatformMarginPoisha += lineMargin;

        const existing = vendorMap.get(vCode) ?? {
          vendorCode: vCode,
          vendorNameBn: vName,
          vendorContactPhone: vendor?.contactPhone ?? '',
          payoutMethodBn: vendor?.payoutMethodBn ?? '',
          payoutAccountNo: vendor?.payoutAccountNo ?? '',
          itemsCount: 0,
          totalUnits: 0,
          supplierCostPoisha: 0,
          supplierProfitPoisha: 0,
          supplierPayablePoisha: 0,
          platformMarginPoisha: 0,
        };
        existing.itemsCount += 1;
        existing.totalUnits += l.quantity;
        existing.supplierCostPoisha += lineCost;
        existing.supplierProfitPoisha += lineProfit;
        existing.supplierPayablePoisha += linePayable;
        existing.platformMarginPoisha += lineMargin;
        vendorMap.set(vCode, existing);
      }

      const districtRates = getEffectiveDistrictDeliveryRates(
        ord.districtId,
        erpState.siteSettings.bdPostDefaultPerKgPoisha
      );
      const estimatedActualCourierCostPoisha =
        ord.courierProvider === 'bd_post'
          ? districtRates.bdPostPerKgPoisha
          : districtRates.base1KgPoisha;
      const deliverySubsidyPoisha = Math.max(
        0,
        estimatedActualCourierCostPoisha - ord.deliveryChargePoisha
      );
      const packagingMaterialCostPoisha =
        erpState.siteSettings.defaultPackagingCostPoisha;
      const netMarginAfterPromo = Math.max(
        0,
        grossPlatformMarginPoisha - ord.discountPoisha
      );
      const estimatedVatOnMarginPoisha = Math.round(
        (netMarginAfterPromo * 500) / 10000
      );
      const netPlatformRetainedProfitPoisha =
        netMarginAfterPromo -
        deliverySubsidyPoisha -
        packagingMaterialCostPoisha -
        estimatedVatOnMarginPoisha;

      accountingSummary = {
        grossMerchandiseSubtotalPoisha: ord.subtotalPoisha,
        promoCode:
          (ord as { promoCode?: string | null }).promoCode ?? null,
        promoDiscountPoisha: ord.discountPoisha,
        customerDeliveryChargePoisha: ord.deliveryChargePoisha,
        estimatedActualCourierCostPoisha,
        deliverySubsidyPoisha,
        packagingMaterialCostPoisha,
        totalCustomerPayablePoisha: ord.totalPayablePoisha,
        advancePaidPoisha: ord.advancePaidPoisha,
        codCollectablePoisha: ord.codCollectablePoisha,
        totalSupplierCostPoisha,
        totalSupplierProfitPoisha,
        totalSupplierPayableEscrowPoisha,
        grossPlatformMarginPoisha,
        estimatedVatOnMarginPoisha,
        netPlatformRetainedProfitPoisha,
        vendorSplitBreakdown: Array.from(vendorMap.values()),
      };
    }

    const holdDays = erpState.siteSettings.globalEscrowHoldDays;
    const internalPart3: InternalSlipPart3DTO = {
      orderNo: ord.orderNo,
      createdAt: ord.createdAt,
      orderStatus: ord.status,
      orderSource: ord.source,
      callStatus: meta?.callStatus ?? 'confirmed_yes',
      callAttempts: meta?.callAttempts ?? 1,
      addressQualityScore: ord.addressQualityScore,
      fraudRiskTierBn:
        ord.addressQualityScore >= 80
          ? 'নিরাপদ (Low Risk)'
          : ord.addressQualityScore >= 55
          ? 'মাঝারি ঝুঁকি (Medium)'
          : 'উচ্চ ঝুঁকি — যাচাই আবশ্যক',
      courierProvider: ord.courierProvider,
      consignmentId,
      trackingCode,
      paymentMethod: ord.paymentMethod,
      paymentStatus: ord.paymentStatus,
      manualPaymentTrxId: ord.manualPaymentTrxId,
      customerName: ord.customerName,
      customerPhone:
        ctx.roleSlug === 'vendor' && ctx.maskCustomerPiiForVendor
          ? `${ord.customerPhone.slice(0, 3)}****${ord.customerPhone.slice(-3)}`
          : ord.customerPhone,
      customerFullAddressBn:
        ctx.roleSlug === 'vendor' && ctx.maskCustomerPiiForVendor
          ? `${ord.upazilaNameBn}, ${ord.districtNameBn} (মাস্কড)`
          : `${ord.upazilaNameBn}, ${ord.districtNameBn} — ${ord.streetAddress}${ord.landmark ? ` (${ord.landmark})` : ''}`,
      postCode,
      recipientCity,
      recipientZone,
      totalWeightGrams,
      courierReadinessReady:
        ctx.roleSlug === 'vendor' ? undefined : readiness.isReady,
      courierMissingSummaryBn:
        ctx.roleSlug === 'vendor'
          ? undefined
          : readiness.missingFields.map((m) => m.labelBn).join(', '),
      printCount,
      isReprintWarning: input.recordPrint ? prevPrintCount > 0 : printCount > 0,
      escrowHoldDays: holdDays,
      estimatedMaturityDaysLabelBn: `ডেলিভারির ${holdDays} দিন পর উত্তোলনযোগ্য (Available)`,
      internalStaffNote:
        ctx.roleSlug === 'vendor' ? '' : meta?.internalStaffNote ?? '',
      checklistItemsBn: p4bStore.printConfig.checklistItemsBn,
      accountingSummary,
      lines: internalLines,
    };

    bundles.push({
      bundle: {
        orderNo: ord.orderNo,
        customerAndCourierPart,
        internalPart3,
      },
      firstVendorCode: internalLines[0]?.vendorCode ?? '',
      firstSku: customerSafeItems[0]?.publicSku ?? '',
      courier: ord.courierProvider,
      district: ord.districtNameBn,
    });

    if (input.recordPrint) {
      appendImmutableAuditLog(adminStore, {
        actorUserId: ctx.userId,
        actorUsername: ctx.username,
        actorRole: ctx.roleSlug,
        actionCode: prevPrintCount > 0 ? 'ORDER_SLIP_REPRINTED' : 'ORDER_SLIP_PRINTED',
        targetType: 'order',
        targetId: ord.orderNo,
        summaryBn: `${ord.orderNo} অর্ডারের প্রিন্ট অনুরোধ করা হয়েছে (কাউন্টার: ${printCount})।`,
        metadata: { printCount, event: 'print_requested' },
      });
    }
  }

  // Sort batch according to user selection
  const sortBy = input.sortBy ?? 'order_no';
  bundles.sort((a, b) => {
    if (sortBy === 'vendor') {
      return a.firstVendorCode.localeCompare(b.firstVendorCode);
    }
    if (sortBy === 'courier') {
      return a.courier.localeCompare(b.courier);
    }
    if (sortBy === 'district') {
      return a.district.localeCompare(b.district);
    }
    if (sortBy === 'sku') {
      return a.firstSku.localeCompare(b.firstSku);
    }
    return a.bundle.orderNo.localeCompare(b.bundle.orderNo);
  });

  if (input.recordPrint) {
    writeErpState(erpState);
    writePhase4BStore(p4bStore);
    writeAdminStore(adminStore);
  }

  return {
    success: true,
    printConfig: p4bStore.printConfig,
    slips: bundles.map((b) => b.bundle),
  };
}

export function updatePrintTemplateConfig(
  ctx: ActorSecurityContext,
  patch: Partial<PrintTemplateConfig>
): {
  success: boolean;
  errorBn?: string;
  printConfig?: PrintTemplateConfig;
} {
  if (ctx.roleSlug !== 'super_admin' && ctx.roleSlug !== 'packaging_manager') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন বা প্যাকেজিং ম্যানেজার প্রিন্ট টেমপ্লেট আপডেট করতে পারবেন।',
    };
  }

  const p4bStore = readPhase4BStore();
  p4bStore.printConfig = {
    ...p4bStore.printConfig,
    ...patch,
  };
  writePhase4BStore(p4bStore);

  return {
    success: true,
    printConfig: p4bStore.printConfig,
  };
}

// ============================================================================
// 3. MODULE C, D & M: DELIVERY RATES, PICKUP BATCH & COURIER 360
// ============================================================================

export function getAllDistrictDeliveryRatesWithOverrides(): DistrictRateOverrideRecord[] {
  const p4bStore = readPhase4BStore();
  const erpState = readErpState();

  return BD_DISTRICTS.map((d) => {
    const override = p4bStore.districtRateOverrides[d.id];
    if (override) return override;

    const defaults = getDistrictDeliveryRates(
      d.id,
      erpState.siteSettings.bdPostDefaultPerKgPoisha
    );
    return {
      districtId: d.id,
      districtNameBn: d.name_bn,
      districtNameEn: d.name_en,
      base1KgPoisha: defaults.base1KgPoisha,
      extraPerKgPoisha: defaults.extraPerKgPoisha,
      bdPostPerKgPoisha: defaults.bdPostPerKgPoisha,
      isFreeDeliveryDistrict: erpState.siteSettings.globalFreeDelivery,
    };
  });
}

export function upsertDistrictDeliveryRateOverride(
  ctx: ActorSecurityContext,
  input: {
    districtId: number;
    base1KgPoisha: Poisha;
    extraPerKgPoisha: Poisha;
    bdPostPerKgPoisha: Poisha;
    isFreeDeliveryDistrict: boolean;
  }
): {
  success: boolean;
  errorBn?: string;
  record?: DistrictRateOverrideRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন জেলাভিত্তিক ডেলিভারি চার্জ পরিবর্তন করতে পারবেন।',
    };
  }

  const district = BD_DISTRICTS.find((d) => d.id === input.districtId);
  if (!district) {
    return { success: false, errorBn: 'জেলা খুঁজে পাওয়া যায়নি।' };
  }

  const p4bStore = readPhase4BStore();
  const adminStore = readAdminStore();

  const updated: DistrictRateOverrideRecord = {
    districtId: district.id,
    districtNameBn: district.name_bn,
    districtNameEn: district.name_en,
    base1KgPoisha: Math.max(0, Math.round(input.base1KgPoisha)),
    extraPerKgPoisha: Math.max(0, Math.round(input.extraPerKgPoisha)),
    bdPostPerKgPoisha: Math.max(0, Math.round(input.bdPostPerKgPoisha)),
    isFreeDeliveryDistrict: input.isFreeDeliveryDistrict,
  };

  p4bStore.districtRateOverrides[district.id] = updated;

  const erpState = readErpState();
  erpState.siteSettings.districtRateOverrides =
    erpState.siteSettings.districtRateOverrides ?? {};
  erpState.siteSettings.districtRateOverrides[district.id] = {
    base1KgPoisha: updated.base1KgPoisha,
    extraPerKgPoisha: updated.extraPerKgPoisha,
    bdPostPerKgPoisha: updated.bdPostPerKgPoisha,
    isFreeDeliveryDistrict: updated.isFreeDeliveryDistrict,
  };
  writeErpState(erpState);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'DISTRICT_DELIVERY_RATE_UPDATED',
    targetType: 'system',
    targetId: String(district.id),
    summaryBn: `${district.name_bn} জেলার ডেলিভারি রেট আপডেট করা হয়েছে (১ কেজি: ${updated.base1KgPoisha / 100} টাকা)।`,
    metadata: { ...updated },
  });

  writePhase4BStore(p4bStore);
  writeAdminStore(adminStore);
  return { success: true, record: updated };
}

/**
 * Module C: Groups Packed Orders into a Pickup Batch + Printable Handover Manifest
 */
export function createPickupBatchAndManifest(
  ctx: ActorSecurityContext,
  input: {
    courierProvider: CourierProvider;
    orderNos?: string[];
  }
): {
  success: boolean;
  errorBn?: string;
  batch?: PickupBatchRecord;
} {
  return { success: false, errorBn: 'কুরিয়ার বুকিং ও নিরাপদ ম্যানিফেস্ট সংযোগ চালু নেই; কোনো অর্ডার পরিবর্তন করা হয়নি।' };
}

/**
 * Module C: One-Click Handover Confirmation -> Marks all orders in Batch as "shipped"
 */
export function confirmBatchHandoverShipped(
  ctx: ActorSecurityContext,
  input: {
    batchId: string;
    riderName: string;
    riderPhone: string;
  }
): {
  success: boolean;
  errorBn?: string;
  batch?: PickupBatchRecord;
} {
  return { success: false, errorBn: 'নিরাপদ ব্যাচ হ্যান্ডওভার সংযোগ চালু নেই; কোনো অর্ডার পরিবর্তন করা হয়নি।' };
}

/**
 * Module C, D & E: Records Courier COD Remittance Settlement, Detects Short-Payments,
 * and Promotes Vendor Escrow from Pending -> Locked with Maturity Countdown!
 */
export function recordCourierRemittanceSettlement(
  ctx: ActorSecurityContext,
  input: {
    settlementRef: string;
    courierProvider: CourierProvider;
    items: Array<{
      orderNo: string;
      courierFeeDeductedPoisha: Poisha;
      remittedAmountPoisha: Poisha;
    }>;
  }
): {
  success: boolean;
  errorBn?: string;
  settledCount: number;
  shortPaymentCount: number;
  records: CourierRemittanceLedgerRecord[];
} {
  return { success: false, errorBn: 'প্রমাণভিত্তিক maker-checker ও লেজার রিকনসিলিয়েশন ছাড়া রেমিট্যান্স সেটেলমেন্ট বন্ধ।', settledCount: 0, shortPaymentCount: 0, records: [] };
}

/**
 * Module M: Computes Courier 360 Summary (In-Transit, Unsettled, Aging Buckets 0-3/4-7/8-14/15+d, & Claims)
 */
export function computeCourier360Summary(): Courier360ProviderSummary[] {
  const erpState = readErpState();
  const p4bStore = readPhase4BStore();
  const nowMs = Date.now();

  const providers: Array<{ provider: CourierProvider; labelBn: string }> = [
    { provider: 'steadfast', labelBn: 'Steadfast Courier' },
    { provider: 'pathao', labelBn: 'Pathao Courier' },
    { provider: 'redx', labelBn: 'RedX Logistics' },
    { provider: 'bd_post', labelBn: 'বাংলাদেশ ডাক বিভাগ (BD Post)' },
  ];

  return providers.map(({ provider, labelBn }) => {
    const providerOrders = erpState.orders.filter(
      (o) => o.courierProvider === provider
    );

    const inTransitOrders = providerOrders.filter(
      (o) =>
        o.status === 'packed' ||
        o.status === 'shipped' ||
        o.status === 'out_for_delivery'
    );
    const unsettledDeliveredOrders = providerOrders.filter(
      (o) => o.status === 'delivered' && o.paymentStatus !== 'remitted'
    );

    const remittances = p4bStore.courierRemittanceLedger.filter(
      (r) => r.courierProvider === provider
    );
    const claims = p4bStore.courierClaims.filter(
      (c) => c.courierProvider === provider && c.status !== 'rejected'
    );

    const agingBuckets = {
      days0to3Poisha: 0,
      days4to7Poisha: 0,
      days8to14Poisha: 0,
      days15PlusPoisha: 0,
    };

    let oldestUnsettledOrderNo: string | null = null;
    let oldestUnsettledDays = 0;

    for (const ord of [...inTransitOrders, ...unsettledDeliveredOrders]) {
      const ageDays = Math.max(
        0,
        Math.floor((nowMs - new Date(ord.createdAt).getTime()) / (24 * 60 * 60 * 1000))
      );
      if (ageDays >= oldestUnsettledDays) {
        oldestUnsettledDays = ageDays;
        oldestUnsettledOrderNo = ord.orderNo;
      }

      if (ageDays <= 3) {
        agingBuckets.days0to3Poisha += ord.codCollectablePoisha;
      } else if (ageDays <= 7) {
        agingBuckets.days4to7Poisha += ord.codCollectablePoisha;
      } else if (ageDays <= 14) {
        agingBuckets.days8to14Poisha += ord.codCollectablePoisha;
      } else {
        agingBuckets.days15PlusPoisha += ord.codCollectablePoisha;
      }
    }

    // Credentials alone do not establish a working courier integration. The
    // live tracking/booking adapters are disabled, so always report honestly.
    return {
      provider,
      providerLabelBn: labelBn,
      apiConnected: false,
      connectionStatusBadgeBn: 'Not integrated — manual reconciliation only',
      inTransitCount: inTransitOrders.length,
      inTransitCodPoisha: inTransitOrders.reduce(
        (s, o) => s + o.codCollectablePoisha,
        0
      ),
      deliveredUnsettledCount: unsettledDeliveredOrders.length,
      deliveredUnsettledCodPoisha: unsettledDeliveredOrders.reduce(
        (s, o) => s + o.codCollectablePoisha,
        0
      ),
      settledCount: remittances.length,
      settledRemittedPoisha: remittances.reduce(
        (s, r) => s + r.remittedAmountPoisha,
        0
      ),
      shortPaymentTotalPoisha: remittances.reduce(
        (s, r) => s + r.shortPaymentPoisha,
        0
      ),
      openClaimsCount: claims.length,
      openClaimsPoisha: claims.reduce((s, c) => s + c.claimAmountPoisha, 0),
      agingBuckets,
      oldestUnsettledOrderNo,
      oldestUnsettledDays,
    };
  });
}

/**
 * Automatically records COD collectable and courier delivery fee into Courier Remittance Ledger
 * and promotes vendor escrow earnings upon order delivery or return.
 */
export function autoRecordOrderDeliveredOrReturned(
  ctx: ActorSecurityContext,
  orderNo: string,
  newStatus: OrderStatus,
  nowIso: string = new Date().toISOString()
): {
  success: boolean;
  ledgerRecordAdded: boolean;
  escrowPromoted: boolean;
  messageBn: string;
} {
  return { success: false, ledgerRecordAdded: false, escrowPromoted: false, messageBn: 'ডেলিভারি স্ট্যাটাস থেকে স্বয়ংক্রিয় রেমিট্যান্স বা ভেন্ডর পাওনা তৈরি বন্ধ।' };
}

export { getLiveCourierTrackingUrl } from '@/src/lib/courier/tracking-urls';

/**
 * No provider-backed poller is currently implemented. Fail closed here as well
 * as at the HTTP boundary so future callers cannot accidentally run the old
 * simulated state transitions against real orders or finance records.
 */
export function syncAllCourierTrackingStatuses(_ctx: ActorSecurityContext): {
  success: boolean;
  syncedCount: number;
  updatedCount: number;
  messageBn: string;
  syncedOrders: Array<{
    orderNo: string;
    previousStatus: OrderStatus;
    newStatus: OrderStatus;
    courierProvider: CourierProvider;
    trackingCode: string;
    courierEventBn: string;
  }>;
} {
  return { success: false, syncedCount: 0, updatedCount: 0,
    messageBn: 'কুরিয়ার ট্র্যাকিং সংযোগ চালু নেই; কোনো অর্ডার আপডেট করা হয়নি।', syncedOrders: [] };
}

// ============================================================================
// 4. MODULE E: APPEND-ONLY VENDOR ESCROW LEDGER, 4-WAY RETURN & PAYOUT ENGINE
// ============================================================================

export function getVendorEscrowOverviewForActor(
  ctx: ActorSecurityContext,
  requestedVendorId?: string
): {
  vendors: Array<{
    profile: VendorProfileRecord;
    balance: VendorEscrowBalance;
  }>;
  ledgerEntries: ImmutableVendorLedgerRecord[];
  payoutRequests: VendorPayoutRequestRecord[];
  returnResolutions: ReturnResolutionRecord[];
} {
  const p4bStore = readPhase4BStore();

  if (ctx.roleSlug === 'vendor') {
    if (requestedVendorId && requestedVendorId !== ctx.vendorId) {
      assertVendorOwnershipOr404(ctx, requestedVendorId);
    }
  }

  const visibleVendors = p4bStore.vendors.filter((v) =>
    ctx.roleSlug === 'vendor' ? v.vendorId === ctx.vendorId : true
  );

  const vendorSummaries = visibleVendors.map((profile) => {
    const entriesForVendor = p4bStore.vendorLedger.filter(
      (e) => e.vendorId === profile.vendorId
    );
    const balance = computeVendorEscrowBalance(
      profile.vendorId,
      entriesForVendor
    );
    return { profile, balance };
  });

  const visibleLedger = p4bStore.vendorLedger.filter((e) =>
    ctx.roleSlug === 'vendor' ? e.vendorId === ctx.vendorId : true
  );

  const visiblePayouts = p4bStore.payoutRequests.filter((p) =>
    ctx.roleSlug === 'vendor' ? p.vendorId === ctx.vendorId : true
  );

  const visibleReturns = p4bStore.returnResolutions.filter((r) =>
    ctx.roleSlug === 'vendor' ? r.vendorId === ctx.vendorId : true
  );

  return {
    vendors: vendorSummaries,
    ledgerEntries: visibleLedger,
    payoutRequests: visiblePayouts,
    returnResolutions: visibleReturns,
  };
}

/**
 * Module E: Four-Way Damage & Return Engine
 *   1. WAREHOUSE_PACKAGING_FAULT -> Supplier keeps 100% payable; Platform absorbs loss
 *   2. SUPPLIER_DEFECT -> Deducts from supplier (Hold-period reversal or Post-payout clawback)
 *   3. CUSTOMER_INTACT_RETURN -> Restocks inventory & reverses supplier earning
 *   4. COURIER_NEGLIGENCE -> Supplier keeps 100% payable; creates Courier Claim
 */
export function processFourWayOrderReturn(
  ctx: ActorSecurityContext,
  input: {
    orderNo: string;
    faultType: ReturnFaultType;
    proofUrl: string;
    noteBn: string;
    wasAlreadyPaidOut?: boolean;
  }
): {
  success: boolean;
  errorBn?: string;
  resolution?: ReturnResolutionRecord;
} {
  return { success: false, errorBn: 'এই পুরোনো রিটার্ন প্রক্রিয়ায় একাধিক পণ্য ও হিসাব নিরাপদে যাচাই হয় না; কার্যক্রম বন্ধ।' };
}

/**
 * Module E: Vendor Payout Request Flow (Only from Available Balance >= Min Threshold; Immediately Holds Funds)
 */
export function requestVendorPayout(
  ctx: ActorSecurityContext,
  input: {
    vendorId: string;
    requestedAmountPoisha: Poisha;
    payoutMethodBn?: string;
    payoutAccountNo?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  payout?: VendorPayoutRequestRecord;
} {
  if (ctx.roleSlug === 'vendor' && input.vendorId !== ctx.vendorId) {
    assertVendorOwnershipOr404(ctx, input.vendorId);
  }

  const erpState = readErpState();
  const p4bStore = readPhase4BStore();
  const adminStore = readAdminStore();

  const vendor = p4bStore.vendors.find((v) => v.vendorId === input.vendorId);
  if (!vendor) {
    return { success: false, errorBn: 'ভেন্ডর খুঁজে পাওয়া যায়নি।' };
  }

  const vendorEntries = p4bStore.vendorLedger.filter(
    (e) => e.vendorId === vendor.vendorId
  );
  const balance = computeVendorEscrowBalance(vendor.vendorId, vendorEntries);

  const eligibility = validatePayoutRequestEligibility({
    requestedAmountPoisha: input.requestedAmountPoisha,
    withdrawablePoisha: balance.withdrawablePoisha,
    minPayoutPoisha: erpState.siteSettings.minPayoutRequestPoisha,
  });

  if (!eligibility.allowed) {
    return {
      success: false,
      errorBn: eligibility.reasonBn ?? 'পেআউট রিকোয়েস্ট অনুমোদিত নয়।',
    };
  }

  const holdEntryId = `vled-hold-${Date.now()}`;
  const nowIso = new Date().toISOString();

  // Immediately insert PAYOUT_HOLD to prevent double-requests
  p4bStore.vendorLedger.unshift({
    id: holdEntryId,
    vendorId: vendor.vendorId,
    vendorCode: vendor.vendorCode,
    orderItemId: null,
    orderNo: null,
    entryType: 'PAYOUT_HOLD',
    escrowBucket: 'available',
    amountPoisha: -input.requestedAmountPoisha,
    deliveredAt: null,
    maturesAt: null,
    descriptionBn: `পেআউট রিকোয়েস্ট হোল্ড (${vendor.vendorCode}) — অ্যাডমিন অনুমোদনের অপেক্ষায়।`,
    recordedByUsername: ctx.username,
    createdAt: nowIso,
  });

  const payout: VendorPayoutRequestRecord = {
    payoutId: `pay-${Date.now()}`,
    vendorId: vendor.vendorId,
    vendorCode: vendor.vendorCode,
    vendorNameBn: vendor.businessNameBn,
    requestedAmountPoisha: input.requestedAmountPoisha,
    payoutMethodBn: input.payoutMethodBn?.trim() || vendor.payoutMethodBn,
    payoutAccountNo: input.payoutAccountNo?.trim() || vendor.payoutAccountNo,
    status: 'requested',
    holdLedgerEntryId: holdEntryId,
    rejectionReasonBn: null,
    paymentTrxId: null,
    proofUrl: null,
    requestedByUsername: ctx.username,
    requestedAt: nowIso,
    resolvedAt: null,
  };

  p4bStore.payoutRequests.unshift(payout);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'VENDOR_PAYOUT_REQUESTED',
    targetType: 'system',
    targetId: payout.payoutId,
    summaryBn: `${vendor.businessNameBn} (${vendor.vendorCode}) ${
      input.requestedAmountPoisha / 100
    } টাকার পেআউট রিকোয়েস্ট করেছেন (টাকা হোল্ড করা হয়েছে)।`,
    metadata: { requestedAmountPoisha: input.requestedAmountPoisha },
  });

  writePhase4BStore(p4bStore);
  // The audit entry lives in the admin store; persisting only the phase-4B
  // document would drop the payout trail on the floor.
  writeAdminStore(adminStore);
  return { success: true, payout };
}

/**
 * Module E: Super Admin Approves, Rejects (releases hold), or Marks Paid (with TrxID + proof)
 */
export function resolveVendorPayoutRequest(
  ctx: ActorSecurityContext,
  input: {
    payoutId: string;
    decision: 'approve' | 'reject' | 'mark_paid';
    rejectionReasonBn?: string;
    paymentTrxId?: string;
    proofUrl?: string;
    feePoisha?: Poisha;
    senderAccountNo?: string;
    noteBn?: string;
    paidAt?: string;
    /**
     * A super admin who raised the payout themselves may still settle it, but
     * only by recording an explicit override reason. Without this, an
     * admin-initiated payout (the console's own "initiate payout" flow) could
     * never be marked paid: maker-checker would refuse every attempt forever.
     */
    emergencyOverride?: boolean;
    emergencyReasonBn?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  payout?: VendorPayoutRequestRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন পেআউট অনুমোদন বা পরিশোধ মার্ক করতে পারবেন।',
    };
  }

  const p4bStore = readPhase4BStore();
  const adminStore = readAdminStore();

  const payout = p4bStore.payoutRequests.find(
    (p) => p.payoutId === input.payoutId
  );
  if (!payout) {
    return { success: false, errorBn: 'পেআউট রিকোয়েস্ট পাওয়া যায়নি।' };
  }

  if (input.decision === 'approve' || input.decision === 'mark_paid') {
    const mc = checkMakerCheckerSeparation({
      makerUsername: payout.requestedByUsername,
      checkerCtx: ctx,
      allowSuperAdminEmergencyOverride: true,
      emergencyOverride: input.emergencyOverride,
      emergencyReasonBn: input.emergencyReasonBn,
    });
    if (!mc.allowed) {
      return {
        success: false,
        errorBn: mc.errorBn,
      };
    }
  }

  const nowIso = new Date().toISOString();

  if (input.decision === 'approve') {
    payout.status = 'approved';
  } else if (input.decision === 'reject') {
    if (!input.rejectionReasonBn || input.rejectionReasonBn.trim().length < 3) {
      return {
        success: false,
        errorBn: 'পেআউট বাতিলের ক্ষেত্রে কারণ (Rejection Reason) লেখা বাধ্যতামূলক।',
      };
    }
    payout.status = 'rejected';
    payout.rejectionReasonBn = input.rejectionReasonBn.trim();
    payout.resolvedAt = nowIso;

    // Release held funds back to Available via Append-Only offsetting entry
    p4bStore.vendorLedger.unshift({
      id: `vled-rel-${Date.now()}`,
      vendorId: payout.vendorId,
      vendorCode: payout.vendorCode,
      orderItemId: null,
      orderNo: null,
      entryType: 'PAYOUT_HOLD_RELEASE',
      escrowBucket: 'available',
      amountPoisha: payout.requestedAmountPoisha,
      deliveredAt: null,
      maturesAt: null,
      descriptionBn: `পেআউট রিকোয়েস্ট (${payout.payoutId}) বাতিল হওয়ায় হোল্ডকৃত টাকা পুনরায় Available ব্যালেন্সে ফেরত। কারণ: ${payout.rejectionReasonBn}`,
      recordedByUsername: ctx.username,
      createdAt: nowIso,
    });
  } else if (input.decision === 'mark_paid') {
    if (!input.paymentTrxId || input.paymentTrxId.trim().length < 4) {
      return {
        success: false,
        errorBn: 'পেমেন্ট পরিশোধ মার্ক করতে ট্রানজেকশন আইডি (TrxID) দেওয়া বাধ্যতামূলক।',
      };
    }
    const feePoisha =
      input.feePoisha !== undefined && Number.isSafeInteger(input.feePoisha) && input.feePoisha >= 0
        ? input.feePoisha
        : Math.round((payout.requestedAmountPoisha * 185) / 10000);
    const paidIso =
      input.paidAt && Number.isFinite(Date.parse(input.paidAt))
        ? new Date(input.paidAt).toISOString()
        : nowIso;

    payout.status = 'paid';
    payout.paymentTrxId = input.paymentTrxId.trim();
    payout.proofUrl = input.proofUrl?.trim() || null;
    payout.feePoisha = feePoisha;
    payout.netPaidPoisha = Math.max(0, payout.requestedAmountPoisha - feePoisha);
    payout.senderAccountNo = input.senderAccountNo?.trim() || null;
    payout.noteBn = input.noteBn?.trim() || null;
    payout.resolvedAt = paidIso;

    // Append PAYOUT_DISBURSED audit entry (0 net impact on available since PAYOUT_HOLD already deducted it)
    p4bStore.vendorLedger.unshift({
      id: `vled-paid-${Date.now()}`,
      vendorId: payout.vendorId,
      vendorCode: payout.vendorCode,
      orderItemId: null,
      orderNo: null,
      entryType: 'PAYOUT_DISBURSED',
      escrowBucket: 'available',
      amountPoisha: 0,
      deliveredAt: null,
      maturesAt: null,
      descriptionBn: `পেআউট পরিশোধিত (${payout.payoutMethodBn} — TrxID: ${payout.paymentTrxId}, পরিমাণ: ${
        payout.requestedAmountPoisha / 100
      } টাকা, চার্জ: ${feePoisha / 100} টাকা)।`,
      referenceNo: payout.paymentTrxId,
      paymentMethodBn: payout.payoutMethodBn,
      proofUrl: payout.proofUrl,
      noteBn: payout.noteBn,
      eventTimestamp: paidIso,
      recordedByUsername: ctx.username,
      createdAt: paidIso,
    });
  }

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: `VENDOR_PAYOUT_${input.decision.toUpperCase()}`,
    targetType: 'system',
    targetId: payout.payoutId,
    summaryBn: `সুপার অ্যাডমিন ভেন্ডর ${payout.vendorCode}-এর পেআউট (${payout.payoutId})-এ "${input.decision}" সম্পন্ন করেছেন।`,
    metadata: {
      decision: input.decision,
      paymentTrxId: payout.paymentTrxId,
      feePoisha: payout.feePoisha,
      netPaidPoisha: payout.netPaidPoisha,
      proofUrl: payout.proofUrl,
      selfApprovalOverrideReasonBn: input.emergencyOverride
        ? input.emergencyReasonBn
        : undefined,
    },
  });

  writePhase4BStore(p4bStore);
  writeAdminStore(adminStore);
  return { success: true, payout };
}

/**
 * Module E: 15-Question Vendor Onboarding Submission
 */
export function submitVendorOnboarding15Q(
  ctx: ActorSecurityContext,
  input: {
    businessNameBn: string;
    businessNameEn?: string;
    ownerNameBn: string;
    contactPhone: string;
    defaultCommissionBp: number;
    escrowHoldDaysOverride: number;
    payoutMethodBn: string;
    payoutAccountNo: string;
    answers15: Record<string, string>;
  },
  options?: { draft?: boolean }
): {
  success: boolean;
  errorBn?: string;
  vendor?: VendorProfileRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন নতুন কনসাইনমেন্ট ভেন্ডর অনবোর্ড করতে পারবেন।',
    };
  }

  // Verify all 15 questions are answered
  for (const q of options?.draft ? [] : VENDOR_ONBOARDING_15_QUESTIONS) {
    const ans = input.answers15[q.key];
    if (!ans || ans.trim().length < 2) {
      return {
        success: false,
        errorBn: `১৫-প্রশ্নের অনবোর্ডিং ফর্ম অসম্পূর্ণ: "${q.questionBn}" এর উত্তর দিন।`,
      };
    }
  }

  const p4bStore = readPhase4BStore();
  const adminStore = readAdminStore();

  let nextNumber = p4bStore.vendors.length + 1;
  while (p4bStore.vendors.some(v => v.vendorCode === `VND-${String(nextNumber).padStart(3, '0')}`)) nextNumber++;
  const vendorCode = `VND-${String(nextNumber).padStart(3, '0')}`;

  const newVendor: VendorProfileRecord = {
    vendorId: `vnd-${crypto.randomUUID()}`,
    vendorCode,
    businessNameBn: input.businessNameBn.trim(),
    businessNameEn:
      input.businessNameEn?.trim() || input.businessNameBn.trim(),
    ownerNameBn: input.ownerNameBn.trim(),
    contactPhone: input.contactPhone.trim(),
    defaultCommissionBp: input.defaultCommissionBp,
    escrowHoldDaysOverride: input.escrowHoldDaysOverride,
    payoutMethodBn: input.payoutMethodBn.trim(),
    payoutAccountNo: input.payoutAccountNo.trim(),
    status: 'pending_onboarding',
    onboardingAnswers15: input.answers15,
    createdAt: new Date().toISOString(),
  };

  p4bStore.vendors.push(newVendor);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'VENDOR_ONBOARDED_15Q',
    targetType: 'system',
    targetId: newVendor.vendorCode,
    summaryBn: `নতুন ভেন্ডর ${newVendor.businessNameBn} (${newVendor.vendorCode}) অনবোর্ডিং অপেক্ষায় যুক্ত করা হয়েছে।`,
    metadata: { vendorCode: newVendor.vendorCode },
  });

  writePhase4BStore(p4bStore);
  writeAdminStore(adminStore);
  return { success: true, vendor: newVendor };
}

/**
 * Module E: Contract Closure Audit Guard
 * Blocks closing a vendor account unless all balances (Pending, Locked, Available, Hold, Clawback)
 * and all active warehouse stock are 0.
 */
export function auditAndCloseVendorContract(
  ctx: ActorSecurityContext,
  vendorId: string
): {
  canClose: boolean;
  closed: boolean;
  reasonBn: string;
  unsettledPoisha: Poisha;
  remainingStockUnits: number;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      canClose: false,
      closed: false,
      reasonBn: 'শুধুমাত্র সুপার অ্যাডমিন চুক্তি সমাপ্তি অডিট সম্পন্ন করতে পারবেন।',
      unsettledPoisha: 0,
      remainingStockUnits: 0,
    };
  }

  const erpState = readErpState();
  const p4bStore = readPhase4BStore();
  const adminStore = readAdminStore();

  const vendor = p4bStore.vendors.find((v) => v.vendorId === vendorId);
  if (!vendor) {
    return {
      canClose: false,
      closed: false,
      reasonBn: 'ভেন্ডর খুঁজে পাওয়া যায়নি।',
      unsettledPoisha: 0,
      remainingStockUnits: 0,
    };
  }

  const entries = p4bStore.vendorLedger.filter((e) => e.vendorId === vendorId);
  const bal = computeVendorEscrowBalance(vendorId, entries);

  const unsettledPoisha =
    bal.pendingPoisha +
    bal.lockedPoisha +
    Math.abs(bal.availablePoisha) +
    bal.payoutHoldPoisha +
    bal.clawbackDebtPoisha;

  const vendorProducts = erpState.products.filter(
    (p) => p.vendorId === vendorId
  );
  let remainingStockUnits = 0;
  for (const p of vendorProducts) {
    for (const v of p.variants) {
      remainingStockUnits += v.stockOnHand + v.stockReserved + v.stockInTransit;
    }
  }

  if (unsettledPoisha > 0 || remainingStockUnits > 0) {
    return {
      canClose: false,
      closed: false,
      reasonBn: `চুক্তি সমাপ্তি ব্লকড: ভেন্ডরের অনিষ্পন্ন লেজার ব্যালেন্স ${
        unsettledPoisha / 100
      } টাকা এবং গুদামে অবশিষ্ট স্টক ${remainingStockUnits} পিস। সব বকেয়া ও স্টক নিষ্পত্তি না হলে অ্যাকাউন্ট বন্ধ করা যাবে না।`,
      unsettledPoisha,
      remainingStockUnits,
    };
  }

  vendor.status = 'closed';
  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'VENDOR_CONTRACT_CLOSED_AFTER_AUDIT',
    targetType: 'system',
    targetId: vendor.vendorCode,
    summaryBn: `সকল বকেয়া ও স্টক শূন্য নিশ্চিত করে ভেন্ডর ${vendor.vendorCode}-এর চুক্তি সমাপ্ত করা হয়েছে।`,
    metadata: {},
  });

  writePhase4BStore(p4bStore);
  writeAdminStore(adminStore);
  return {
    canClose: true,
    closed: true,
    reasonBn: 'সকল বকেয়া ও স্টক নিষ্পত্তি হওয়ায় ভেন্ডর অ্যাকাউন্ট সফলভাবে ক্লোজ করা হয়েছে।',
    unsettledPoisha: 0,
    remainingStockUnits: 0,
  };
}

// ============================================================================
// 5. MANUAL COURIER PARCEL DISPATCH, REMITTANCE & VENDOR LEDGER / SETTLEMENT
// ============================================================================

const COURIER_PROVIDER_META: Record<
  CourierProvider,
  { bn: string; en: string }
> = {
  steadfast: { bn: 'Steadfast Courier', en: 'Steadfast Courier' },
  pathao: { bn: 'Pathao Courier', en: 'Pathao Courier' },
  bd_post: { bn: 'বাংলাদেশ ডাক বিভাগ (BD Post)', en: 'Bangladesh Post' },
  manual: { bn: 'ম্যানুয়াল / নিজস্ব রাইডার', en: 'Manual / Own Rider' },
  redx: { bn: 'RedX (পুরোনো রেকর্ড)', en: 'RedX (Historical)' },
};

function syncLinkedOrderVendorEscrow(params: {
  ctx: ActorSecurityContext;
  erpState: ReturnType<typeof readErpState>;
  p4bStore: Phase4BPersistentStore;
  orderNo: string;
  targetStage: ManualParcelStatus;
  eventIso: string;
  proofRef?: string | null;
  proofUrl?: string | null;
  deliveryMethodBn?: string;
  noteBn?: string;
  parcelId?: string;
  courierProvider: CourierProvider;
  trackingCode?: string;
}): void {
  const {
    ctx,
    erpState,
    p4bStore,
    orderNo,
    targetStage,
    eventIso,
    proofRef,
    proofUrl,
    deliveryMethodBn,
    noteBn,
    parcelId,
    courierProvider,
    trackingCode,
  } = params;
  const ord = erpState.orders.find(
    (o) => o.orderNo.toUpperCase() === orderNo.toUpperCase()
  );
  if (!ord) return;

  const lines = erpState.orderLines.filter((l) => l.orderId === ord.id);
  if (lines.length === 0) return;

  const byVendor = new Map<string, { payablePoisha: number; firstLineId: string }>();
  for (const line of lines) {
    const linePayable = line.snapSupplierPayablePoisha * line.quantity;
    const prev = byVendor.get(line.vendorId);
    if (prev) {
      prev.payablePoisha += linePayable;
    } else {
      byVendor.set(line.vendorId, {
        payablePoisha: linePayable,
        firstLineId: `${line.orderId}:${line.variantId}`,
      });
    }
  }

  for (const [vendorId, info] of byVendor.entries()) {
    if (info.payablePoisha <= 0) continue;
    const vendor = p4bStore.vendors.find((v) => v.vendorId === vendorId);
    const vendorCode = vendor?.vendorCode ?? vendorId;

    const existingEntries = p4bStore.vendorLedger.filter(
      (e) => e.vendorId === vendorId && e.orderNo === ord.orderNo
    );

    if (targetStage === 'dispatched' || targetStage === 'in_transit') {
      const hasAnyPositive = existingEntries.some((e) => e.amountPoisha > 0);
      if (!hasAnyPositive) {
        p4bStore.vendorLedger.unshift({
          id: `vled-pend-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
          vendorId,
          vendorCode,
          orderItemId: info.firstLineId,
          orderNo: ord.orderNo,
          entryType: 'EARNING_PENDING',
          escrowBucket: 'pending',
          amountPoisha: info.payablePoisha,
          deliveredAt: null,
          maturesAt: null,
          descriptionBn: `পার্সেল ডিসপ্যাচ (${parcelId ?? trackingCode ?? ord.orderNo}) — ডেলিভারির অপেক্ষায় পেন্ডিং এসক্রো।`,
          referenceNo: proofRef ?? trackingCode ?? null,
          paymentMethodBn: deliveryMethodBn ?? null,
          proofUrl: proofUrl ?? null,
          noteBn: noteBn ?? null,
          eventTimestamp: eventIso,
          recordedByUsername: ctx.username,
          createdAt: eventIso,
        });
      }
    } else if (targetStage === 'delivered' || targetStage === 'settled') {
      const alreadyLockedOrMatured = existingEntries.some(
        (e) =>
          (e.entryType === 'EARNING_LOCKED' || e.entryType === 'EARNING_MATURED') &&
          e.amountPoisha > 0
      );
      if (!alreadyLockedOrMatured) {
        const netPending = existingEntries
          .filter((e) => e.escrowBucket === 'pending')
          .reduce((sum, e) => sum + e.amountPoisha, 0);
        if (netPending > 0) {
          p4bStore.vendorLedger.unshift({
            id: `vled-prel-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
            vendorId,
            vendorCode,
            orderItemId: null,
            orderNo: ord.orderNo,
            entryType: 'EARNING_PENDING',
            escrowBucket: 'pending',
            amountPoisha: -netPending,
            deliveredAt: null,
            maturesAt: null,
            descriptionBn: `অর্ডার ${ord.orderNo} ডেলিভারড (${parcelId ?? courierProvider}) — Pending থেকে Locked এসক্রোতে স্থানান্তর।`,
            referenceNo: proofRef ?? trackingCode ?? null,
            paymentMethodBn: deliveryMethodBn ?? null,
            proofUrl: proofUrl ?? null,
            noteBn: noteBn ?? null,
            eventTimestamp: eventIso,
            recordedByUsername: ctx.username,
            createdAt: eventIso,
          });
        }

        const holdDays =
          vendor?.escrowHoldDaysOverride ??
          erpState.siteSettings.globalEscrowHoldDays ??
          7;
        const maturesAt = calculateMaturityTimestamp(eventIso, Math.max(0, holdDays));
        p4bStore.vendorLedger.unshift({
          id: `vled-lock-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
          vendorId,
          vendorCode,
          orderItemId: info.firstLineId,
          orderNo: ord.orderNo,
          entryType: 'EARNING_LOCKED',
          escrowBucket: 'locked',
          amountPoisha: info.payablePoisha,
          deliveredAt: eventIso,
          maturesAt,
          descriptionBn: `অর্ডার ${ord.orderNo} ডেলিভারি সম্পন্ন (${COURIER_PROVIDER_META[courierProvider].en}${trackingCode ? ` · ${trackingCode}` : ''}) — ${holdDays} দিন হোল্ড পিরিয়ডে লকড।`,
          referenceNo: proofRef ?? trackingCode ?? null,
          paymentMethodBn: deliveryMethodBn ?? null,
          proofUrl: proofUrl ?? null,
          noteBn: noteBn ?? null,
          eventTimestamp: eventIso,
          recordedByUsername: ctx.username,
          createdAt: eventIso,
        });
      }
    } else if (targetStage === 'returned') {
      const netPending = existingEntries
        .filter((e) => e.escrowBucket === 'pending')
        .reduce((sum, e) => sum + e.amountPoisha, 0);
      if (netPending > 0) {
        p4bStore.vendorLedger.unshift({
          id: `vled-ret-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
          vendorId,
          vendorCode,
          orderItemId: null,
          orderNo: ord.orderNo,
          entryType: 'HOLD_PERIOD_RETURN_REVERSAL',
          escrowBucket: 'pending',
          amountPoisha: -netPending,
          deliveredAt: null,
          maturesAt: null,
          descriptionBn: `পার্সেল রিটার্ন হওয়ায় পেন্ডিং এসক্রো সমন্বয় (${ord.orderNo})।`,
          referenceNo: proofRef ?? trackingCode ?? null,
          paymentMethodBn: deliveryMethodBn ?? null,
          proofUrl: proofUrl ?? null,
          noteBn: noteBn ?? null,
          eventTimestamp: eventIso,
          recordedByUsername: ctx.username,
          createdAt: eventIso,
        });
      }
    }
  }
}

export function upsertManualCourierParcel(
  ctx: ActorSecurityContext,
  input: {
    parcelId?: string;
    isStandalone: boolean;
    orderNo?: string | null;
    courierProvider: CourierProvider;
    deliveryMethodBn: string;
    consignmentId?: string;
    trackingCode?: string;
    districtId?: number | null;
    districtNameBn?: string;
    upazilaId?: number | null;
    upazilaNameBn?: string;
    destinationAddressBn: string;
    dispatchedAt?: string;
    deliveredAt?: string | null;
    returnedAt?: string | null;
    collectableCodPoisha: Poisha;
    courierChargePoisha: Poisha;
    riderName?: string | null;
    riderPhone?: string | null;
    status: ManualParcelStatus;
    proofRef?: string | null;
    proofUrl?: string | null;
    noteBn?: string;
    vendorIds?: string[];
  }
): {
  success: boolean;
  errorBn?: string;
  parcel?: ManualCourierParcelRecord;
} {
  if (!['super_admin', 'packaging_manager'].includes(ctx.roleSlug)) {
    return {
      success: false,
      errorBn: 'কুরিয়ার পার্সেল এন্ট্রি করার অনুমতি আপনার রোলের নেই।',
    };
  }
  if (input.courierProvider === 'redx') {
    return {
      success: false,
      errorBn: 'RedX-এ নতুন পার্সেল এন্ট্রি অনুমোদিত নয়। Steadfast, Pathao, ডাক বিভাগ বা ম্যানুয়াল নির্বাচন করুন।',
    };
  }
  if (
    !Number.isSafeInteger(input.collectableCodPoisha) ||
    input.collectableCodPoisha < 0 ||
    !Number.isSafeInteger(input.courierChargePoisha) ||
    input.courierChargePoisha < 0
  ) {
    return {
      success: false,
      errorBn: 'COD এবং কুরিয়ার চার্জ অবশ্যই শূন্য বা ধনাত্মক পূর্ণ সংখ্যা (পয়সা) হতে হবে।',
    };
  }

  const nowIso = new Date().toISOString();
  const dispatchedIso =
    input.dispatchedAt && Number.isFinite(Date.parse(input.dispatchedAt))
      ? new Date(input.dispatchedAt).toISOString()
      : nowIso;
  const deliveredIso =
    input.deliveredAt && Number.isFinite(Date.parse(input.deliveredAt))
      ? new Date(input.deliveredAt).toISOString()
      : input.status === 'delivered' || input.status === 'settled'
      ? nowIso
      : null;
  const returnedIso =
    input.returnedAt && Number.isFinite(Date.parse(input.returnedAt))
      ? new Date(input.returnedAt).toISOString()
      : input.status === 'returned'
      ? nowIso
      : null;

  const erpState = readErpState();
  const p4bStore = readPhase4BStore();
  const adminStore = readAdminStore();
  p4bStore.manualCourierParcels = p4bStore.manualCourierParcels ?? [];

  let linkedOrder: (typeof erpState.orders)[number] | undefined;
  const trimmedOrderNo = input.orderNo?.trim() || null;
  if (!input.isStandalone && trimmedOrderNo) {
    linkedOrder = erpState.orders.find(
      (o) => o.orderNo.toUpperCase() === trimmedOrderNo.toUpperCase()
    );
    if (!linkedOrder) {
      return {
        success: false,
        errorBn: `অর্ডার নম্বর "${trimmedOrderNo}" সিস্টেমে খুঁজে পাওয়া যায়নি। স্বতন্ত্র পার্সেল হলে Standalone বেছে নিন।`,
      };
    }
  }

  const existingIdx = input.parcelId
    ? p4bStore.manualCourierParcels.findIndex((p) => p.parcelId === input.parcelId)
    : linkedOrder
    ? p4bStore.manualCourierParcels.findIndex(
        (p) => !p.isStandalone && p.orderNo?.toUpperCase() === linkedOrder!.orderNo.toUpperCase()
      )
    : -1;
  const existing = existingIdx >= 0 ? p4bStore.manualCourierParcels[existingIdx] : undefined;

  const distObj = input.districtId
    ? BD_DISTRICTS.find((d) => d.id === input.districtId)
    : linkedOrder?.districtId
    ? BD_DISTRICTS.find((d) => d.id === linkedOrder!.districtId)
    : undefined;

  const resolvedDistrictNameBn =
    input.districtNameBn?.trim() ||
    distObj?.name_bn ||
    linkedOrder?.districtNameBn ||
    'অনির্ধারিত';
  const resolvedUpazilaNameBn =
    input.upazilaNameBn?.trim() || linkedOrder?.upazilaNameBn || '';

  const orderVendorIds = linkedOrder
    ? Array.from(
        new Set(
          erpState.orderLines
            .filter((l) => l.orderId === linkedOrder!.id)
            .map((l) => l.vendorId)
        )
      )
    : [];
  const vendorIds = Array.from(
    new Set([...(input.vendorIds ?? []), ...orderVendorIds])
  ).filter(Boolean);

  const parcelId =
    existing?.parcelId ??
    `PCL-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 8999)}`;

  const record: ManualCourierParcelRecord = {
    parcelId,
    isStandalone: input.isStandalone || !linkedOrder,
    orderNo: linkedOrder ? linkedOrder.orderNo : trimmedOrderNo,
    courierProvider: input.courierProvider,
    deliveryMethodBn: input.deliveryMethodBn.trim() || 'হোম ডেলিভারি (COD)',
    consignmentId:
      input.consignmentId?.trim() ||
      existing?.consignmentId ||
      `CNS-${parcelId}`,
    trackingCode:
      input.trackingCode?.trim() ||
      existing?.trackingCode ||
      `TRK-${parcelId}`,
    districtId: input.districtId ?? linkedOrder?.districtId ?? distObj?.id ?? null,
    districtNameBn: resolvedDistrictNameBn,
    upazilaId: input.upazilaId ?? linkedOrder?.upazilaId ?? null,
    upazilaNameBn: resolvedUpazilaNameBn,
    destinationAddressBn:
      input.destinationAddressBn?.trim() ||
      linkedOrder?.streetAddress ||
      existing?.destinationAddressBn ||
      '',
    dispatchedAt: dispatchedIso,
    deliveredAt: deliveredIso,
    returnedAt: returnedIso,
    collectableCodPoisha: input.collectableCodPoisha,
    courierChargePoisha: input.courierChargePoisha,
    riderName: input.riderName?.trim() || null,
    riderPhone: input.riderPhone?.trim() || null,
    status: input.status,
    proofRef: input.proofRef?.trim() || null,
    proofUrl: input.proofUrl?.trim() || null,
    noteBn: input.noteBn?.trim() || '',
    vendorIds,
    recordedByUsername: ctx.username,
    createdAt: existing?.createdAt ?? nowIso,
    updatedAt: nowIso,
  };

  if (existingIdx >= 0) {
    p4bStore.manualCourierParcels[existingIdx] = record;
  } else {
    p4bStore.manualCourierParcels.unshift(record);
  }

  // Auto-sync linked order & vendor escrow
  if (linkedOrder) {
    linkedOrder.courierProvider = record.courierProvider;
    linkedOrder.consignmentId = record.consignmentId;
    linkedOrder.trackingCode = record.trackingCode;

    if (record.status === 'dispatched') {
      if (
        ['pending_confirmation', 'confirmed', 'packed'].includes(linkedOrder.status)
      ) {
        linkedOrder.status = 'shipped';
      }
    } else if (record.status === 'in_transit') {
      if (
        ['pending_confirmation', 'confirmed', 'packed', 'shipped'].includes(
          linkedOrder.status
        )
      ) {
        linkedOrder.status = 'out_for_delivery';
      }
    } else if (record.status === 'delivered' || record.status === 'settled') {
      linkedOrder.status = 'delivered';
      if (record.status === 'settled') {
        linkedOrder.paymentStatus = 'remitted';
      }
    } else if (record.status === 'returned') {
      linkedOrder.status = 'returned';
    }
    linkedOrder.nextBestAction = deriveNextBestAction(linkedOrder);

    syncLinkedOrderVendorEscrow({
      ctx,
      erpState,
      p4bStore,
      orderNo: linkedOrder.orderNo,
      targetStage: record.status,
      eventIso: record.deliveredAt ?? record.dispatchedAt,
      proofRef: record.proofRef,
      proofUrl: record.proofUrl,
      deliveryMethodBn: record.deliveryMethodBn,
      noteBn: record.noteBn,
      parcelId: record.parcelId,
      courierProvider: record.courierProvider,
      trackingCode: record.trackingCode,
    });
  }

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: existing ? 'MANUAL_COURIER_PARCEL_UPDATED' : 'MANUAL_COURIER_PARCEL_RECORDED',
    targetType: linkedOrder ? 'order' : 'system',
    targetId: linkedOrder ? linkedOrder.orderNo : record.parcelId,
    summaryBn: `কুরিয়ার পার্সেল ${record.parcelId} (${COURIER_PROVIDER_META[record.courierProvider].en}) — ${record.districtNameBn}, COD ৳${record.collectableCodPoisha / 100}, স্ট্যাটাস: ${record.status}${linkedOrder ? ` (অর্ডার ${linkedOrder.orderNo} ও ভেন্ডর এসক্রো সমন্বিত)` : ' (স্বতন্ত্র)'}।`,
    metadata: {
      parcelId: record.parcelId,
      orderNo: record.orderNo,
      courierProvider: record.courierProvider,
      status: record.status,
      collectableCodPoisha: record.collectableCodPoisha,
      courierChargePoisha: record.courierChargePoisha,
      dispatchedAt: record.dispatchedAt,
      deliveredAt: record.deliveredAt,
      proofRef: record.proofRef,
    },
  });

  writeErpState(erpState);
  writePhase4BStore(p4bStore);
  writeAdminStore(adminStore);
  return { success: true, parcel: record };
}

export function recordManualCourierRemittance(
  ctx: ActorSecurityContext,
  input: {
    isStandalone: boolean;
    parcelId?: string | null;
    orderNo?: string | null;
    courierProvider: CourierProvider;
    consignmentId?: string;
    settlementRef: string;
    paymentChannelBn: string;
    expectedCodPoisha: Poisha;
    courierFeeDeductedPoisha: Poisha;
    adjustmentPoisha?: Poisha;
    remittedAmountPoisha: Poisha;
    settledAt?: string;
    proofUrl?: string | null;
    noteBn?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  record?: CourierRemittanceLedgerRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন কুরিয়ার পেমেন্ট/রেমিট্যান্স গ্রহণ রেকর্ড করতে পারবেন।',
    };
  }
  if (input.courierProvider === 'redx') {
    return {
      success: false,
      errorBn: 'RedX-এ নতুন লেনদেন অনুমোদিত নয়।',
    };
  }
  const adjustmentPoisha = input.adjustmentPoisha ?? 0;
  if (
    !Number.isSafeInteger(input.expectedCodPoisha) ||
    input.expectedCodPoisha < 0 ||
    !Number.isSafeInteger(input.courierFeeDeductedPoisha) ||
    input.courierFeeDeductedPoisha < 0 ||
    !Number.isSafeInteger(adjustmentPoisha) ||
    adjustmentPoisha < 0 ||
    !Number.isSafeInteger(input.remittedAmountPoisha) ||
    input.remittedAmountPoisha < 0
  ) {
    return {
      success: false,
      errorBn: 'সব টাকার অঙ্ক শূন্য বা ধনাত্মক পূর্ণ সংখ্যা (পয়সা) হতে হবে।',
    };
  }
  if (
    input.remittedAmountPoisha === 0 &&
    input.courierFeeDeductedPoisha === 0 &&
    adjustmentPoisha === 0
  ) {
    return {
      success: false,
      errorBn: 'প্রাপ্ত টাকা, কুরিয়ার চার্জ বা সমন্বয়ের কমপক্ষে একটি ০-এর বেশি হতে হবে।',
    };
  }

  const nowIso = new Date().toISOString();
  const settledIso =
    input.settledAt && Number.isFinite(Date.parse(input.settledAt))
      ? new Date(input.settledAt).toISOString()
      : nowIso;

  const erpState = readErpState();
  const p4bStore = readPhase4BStore();
  const adminStore = readAdminStore();
  p4bStore.manualCourierParcels = p4bStore.manualCourierParcels ?? [];

  const trimmedOrderNo = input.orderNo?.trim() || '';
  const linkedOrder =
    !input.isStandalone && trimmedOrderNo
      ? erpState.orders.find(
          (o) => o.orderNo.toUpperCase() === trimmedOrderNo.toUpperCase()
        )
      : undefined;

  if (!input.isStandalone && trimmedOrderNo && !linkedOrder && !input.parcelId) {
    return {
      success: false,
      errorBn: `অর্ডার নম্বর "${trimmedOrderNo}" পাওয়া যায়নি।`,
    };
  }

  const linkedParcel = input.parcelId
    ? p4bStore.manualCourierParcels.find((p) => p.parcelId === input.parcelId)
    : linkedOrder
    ? p4bStore.manualCourierParcels.find(
        (p) => p.orderNo?.toUpperCase() === linkedOrder.orderNo.toUpperCase()
      )
    : undefined;

  const netExpected = Math.max(
    0,
    input.expectedCodPoisha - input.courierFeeDeductedPoisha - adjustmentPoisha
  );
  const shortPaymentPoisha =
    input.expectedCodPoisha > 0
      ? Math.max(0, netExpected - input.remittedAmountPoisha)
      : 0;

  const record: CourierRemittanceLedgerRecord = {
    id: `rem-man-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    settlementRef: input.settlementRef.trim(),
    courierProvider: input.courierProvider,
    orderNo: linkedOrder?.orderNo ?? linkedParcel?.orderNo ?? (trimmedOrderNo || 'STANDALONE'),
    consignmentId:
      input.consignmentId?.trim() ||
      linkedParcel?.consignmentId ||
      linkedOrder?.consignmentId ||
      input.settlementRef.trim(),
    expectedCodPoisha: input.expectedCodPoisha,
    courierFeeDeductedPoisha: input.courierFeeDeductedPoisha,
    remittedAmountPoisha: input.remittedAmountPoisha,
    shortPaymentPoisha,
    isShortPaymentFlagged: shortPaymentPoisha > 0,
    recordedByUsername: ctx.username,
    createdAt: settledIso,
    parcelId: linkedParcel?.parcelId ?? input.parcelId ?? null,
    isStandalone: Boolean(input.isStandalone || (!linkedOrder && !linkedParcel)),
    adjustmentPoisha,
    paymentChannelBn: input.paymentChannelBn.trim() || 'ব্যাংক ট্রান্সফার',
    settledAt: settledIso,
    proofUrl: input.proofUrl?.trim() || null,
    noteBn: input.noteBn?.trim() || '',
  };

  p4bStore.courierRemittanceLedger.unshift(record);

  if (linkedParcel) {
    linkedParcel.status = 'settled';
    linkedParcel.deliveredAt = linkedParcel.deliveredAt ?? settledIso;
    linkedParcel.updatedAt = nowIso;
  }

  if (linkedOrder) {
    linkedOrder.paymentStatus = 'remitted';
    if (linkedOrder.status !== 'delivered' && linkedOrder.status !== 'returned') {
      linkedOrder.status = 'delivered';
    }
    linkedOrder.nextBestAction = deriveNextBestAction(linkedOrder);

    syncLinkedOrderVendorEscrow({
      ctx,
      erpState,
      p4bStore,
      orderNo: linkedOrder.orderNo,
      targetStage: 'settled',
      eventIso: linkedParcel?.deliveredAt ?? settledIso,
      proofRef: record.settlementRef,
      proofUrl: record.proofUrl,
      deliveryMethodBn: record.paymentChannelBn,
      noteBn: record.noteBn,
      parcelId: linkedParcel?.parcelId,
      courierProvider: record.courierProvider,
      trackingCode: linkedOrder.trackingCode ?? undefined,
    });
  }

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'MANUAL_COURIER_REMITTANCE_RECORDED',
    targetType: linkedOrder ? 'order' : 'system',
    targetId: linkedOrder ? linkedOrder.orderNo : record.id,
    summaryBn: `কুরিয়ার পেমেন্ট গ্রহণ (${COURIER_PROVIDER_META[record.courierProvider].en}) — রেফারেন্স ${record.settlementRef}, প্রাপ্ত ৳${record.remittedAmountPoisha / 100}, চার্জ ৳${record.courierFeeDeductedPoisha / 100}${record.orderNo !== 'STANDALONE' ? ` (${record.orderNo})` : ' (স্বতন্ত্র)'}।`,
    metadata: {
      remittanceId: record.id,
      settlementRef: record.settlementRef,
      courierProvider: record.courierProvider,
      remittedAmountPoisha: record.remittedAmountPoisha,
      courierFeeDeductedPoisha: record.courierFeeDeductedPoisha,
      adjustmentPoisha,
      shortPaymentPoisha,
      settledAt: settledIso,
      proofUrl: record.proofUrl,
    },
  });

  writeErpState(erpState);
  writePhase4BStore(p4bStore);
  writeAdminStore(adminStore);
  return { success: true, record };
}

export function computeManualCourierAccountsSummary(): ManualCourierAccountsSummary {
  const erpState = readErpState();
  const p4bStore = readPhase4BStore();
  const parcels = p4bStore.manualCourierParcels ?? [];
  const remittances = p4bStore.courierRemittanceLedger;
  const claims = p4bStore.courierClaims;

  const activeProviders: CourierProvider[] = ['steadfast', 'pathao', 'bd_post', 'manual'];
  const hasRedx =
    erpState.orders.some((o) => o.courierProvider === 'redx') ||
    parcels.some((p) => p.courierProvider === 'redx') ||
    remittances.some((r) => r.courierProvider === 'redx');
  const providersToRender: CourierProvider[] = hasRedx
    ? [...activeProviders, 'redx']
    : activeProviders;

  const parcelByOrderUpper = new Map<string, ManualCourierParcelRecord>();
  for (const parcel of parcels) {
    if (!parcel.isStandalone && parcel.orderNo) {
      parcelByOrderUpper.set(parcel.orderNo.trim().toUpperCase(), parcel);
    }
  }

  const summaries: ManualCourierProviderAccountSummary[] = providersToRender.map((provider) => {
    const provParcels = parcels.filter((p) => p.courierProvider === provider);
    // Orders with this provider that do NOT have an overriding ManualCourierParcelRecord
    const unlinkedProvOrders = erpState.orders.filter((o) => {
      if (o.courierProvider !== provider) return false;
      const existingParcel = parcelByOrderUpper.get(o.orderNo.trim().toUpperCase());
      if (existingParcel) return false;
      return ['shipped', 'out_for_delivery', 'delivered', 'returned'].includes(o.status);
    });

    let totalParcelsSent = 0;
    let inTransitParcels = 0;
    let deliveredParcels = 0;
    let returnedParcels = 0;
    let settledParcels = 0;
    let inTransitCodPoisha = 0;
    let deliveredCollectableCodPoisha = 0;
    let totalCourierFeesPoisha = 0;

    const countedOrderKeys = new Set<string>();
    const countedParcelIds = new Set<string>();

    for (const p of provParcels) {
      totalParcelsSent += 1;
      countedParcelIds.add(p.parcelId);
      if (p.orderNo) countedOrderKeys.add(p.orderNo.trim().toUpperCase());
      totalCourierFeesPoisha += p.courierChargePoisha;

      if (p.status === 'dispatched' || p.status === 'in_transit') {
        inTransitParcels += 1;
        inTransitCodPoisha += p.collectableCodPoisha;
      } else if (p.status === 'delivered') {
        deliveredParcels += 1;
        deliveredCollectableCodPoisha += p.collectableCodPoisha;
      } else if (p.status === 'settled') {
        deliveredParcels += 1;
        settledParcels += 1;
        deliveredCollectableCodPoisha += p.collectableCodPoisha;
      } else if (p.status === 'returned') {
        returnedParcels += 1;
      }
    }

    for (const o of unlinkedProvOrders) {
      totalParcelsSent += 1;
      countedOrderKeys.add(o.orderNo.trim().toUpperCase());
      if (o.status === 'shipped' || o.status === 'out_for_delivery') {
        inTransitParcels += 1;
        inTransitCodPoisha += o.codCollectablePoisha;
      } else if (o.status === 'delivered') {
        deliveredParcels += 1;
        if (o.paymentStatus === 'remitted') settledParcels += 1;
        deliveredCollectableCodPoisha += o.codCollectablePoisha;
      } else if (o.status === 'returned') {
        returnedParcels += 1;
      }
    }

    const provRemittances = remittances.filter((r) => r.courierProvider === provider);
    let remittanceFeeTotal = 0;
    let totalAdjustmentsPoisha = 0;
    let totalReceivedPoisha = 0;
    let shortPaymentTotalPoisha = 0;

    for (const r of provRemittances) {
      remittanceFeeTotal += r.courierFeeDeductedPoisha;
      totalAdjustmentsPoisha += r.adjustmentPoisha ?? 0;
      totalReceivedPoisha += r.remittedAmountPoisha;
      shortPaymentTotalPoisha += r.shortPaymentPoisha;

      const orderKey = r.orderNo?.trim().toUpperCase() || '';
      const alreadyCountedParcelOrOrder =
        (r.parcelId && countedParcelIds.has(r.parcelId)) ||
        (orderKey && orderKey !== 'STANDALONE' && countedOrderKeys.has(orderKey));

      if (!r.isStandalone && !alreadyCountedParcelOrOrder && r.expectedCodPoisha > 0) {
        deliveredCollectableCodPoisha += r.expectedCodPoisha;
        settledParcels += 1;
        totalParcelsSent += 1;
      }
    }

    // Avoid double-counting parcel-level vs remittance-level fees: remittance fees override if >0, else sum parcel charge where unremitted
    const effectiveFeesPoisha =
      remittanceFeeTotal > 0 ? remittanceFeeTotal : totalCourierFeesPoisha;

    const netReceivablePoisha = Math.max(
      0,
      deliveredCollectableCodPoisha -
        effectiveFeesPoisha -
        totalAdjustmentsPoisha -
        totalReceivedPoisha
    );

    const openClaimsPoisha = claims
      .filter((c) => c.courierProvider === provider && c.status !== 'rejected' && c.status !== 'settled')
      .reduce((s, c) => s + c.claimAmountPoisha, 0);

    return {
      provider,
      providerLabelBn: COURIER_PROVIDER_META[provider].bn,
      providerLabelEn: COURIER_PROVIDER_META[provider].en,
      totalParcelsSent,
      inTransitParcels,
      deliveredParcels,
      returnedParcels,
      settledParcels,
      inTransitCodPoisha,
      deliveredCollectableCodPoisha,
      totalCourierFeesPoisha: effectiveFeesPoisha,
      totalAdjustmentsPoisha,
      totalReceivedPoisha,
      netReceivablePoisha,
      shortPaymentTotalPoisha,
      openClaimsPoisha,
    };
  });

  const totals = summaries.reduce(
    (acc, item) => ({
      totalParcelsSent: acc.totalParcelsSent + item.totalParcelsSent,
      inTransitCodPoisha: acc.inTransitCodPoisha + item.inTransitCodPoisha,
      deliveredCollectableCodPoisha:
        acc.deliveredCollectableCodPoisha + item.deliveredCollectableCodPoisha,
      totalCourierFeesPoisha: acc.totalCourierFeesPoisha + item.totalCourierFeesPoisha,
      totalAdjustmentsPoisha: acc.totalAdjustmentsPoisha + item.totalAdjustmentsPoisha,
      totalReceivedPoisha: acc.totalReceivedPoisha + item.totalReceivedPoisha,
      netReceivablePoisha: acc.netReceivablePoisha + item.netReceivablePoisha,
    }),
    {
      totalParcelsSent: 0,
      inTransitCodPoisha: 0,
      deliveredCollectableCodPoisha: 0,
      totalCourierFeesPoisha: 0,
      totalAdjustmentsPoisha: 0,
      totalReceivedPoisha: 0,
      netReceivablePoisha: 0,
    }
  );

  return { providers: summaries, totals };
}

export function recordManualVendorLedgerEntry(
  ctx: ActorSecurityContext,
  input: {
    vendorId: string;
    orderNo?: string | null;
    escrowBucket: EscrowBucket;
    direction: 'credit' | 'debit';
    amountPoisha: Poisha;
    descriptionBn: string;
    referenceNo?: string | null;
    paymentMethodBn?: string | null;
    proofUrl?: string | null;
    noteBn?: string | null;
    eventTimestamp?: string;
    holdDays?: number;
  }
): {
  success: boolean;
  errorBn?: string;
  entry?: ImmutableVendorLedgerRecord;
  balance?: VendorEscrowBalance;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন ম্যানুয়াল ভেন্ডর লেজার এন্ট্রি করতে পারবেন।',
    };
  }
  if (!Number.isSafeInteger(input.amountPoisha) || input.amountPoisha <= 0) {
    return {
      success: false,
      errorBn: 'টাকার পরিমাণ অবশ্যই ০-এর বেশি পূর্ণ সংখ্যা (পয়সা) হতে হবে।',
    };
  }
  if (!input.descriptionBn || input.descriptionBn.trim().length < 3) {
    return {
      success: false,
      errorBn: 'লেজার এন্ট্রির বিবরণ কমপক্ষে ৩ অক্ষরে লিখুন।',
    };
  }

  const p4bStore = readPhase4BStore();
  const adminStore = readAdminStore();
  const erpState = readErpState();
  const vendor = p4bStore.vendors.find((v) => v.vendorId === input.vendorId);
  if (!vendor) {
    return { success: false, errorBn: 'ভেন্ডর খুঁজে পাওয়া যায়নি।' };
  }

  const nowIso = new Date().toISOString();
  const eventIso =
    input.eventTimestamp && Number.isFinite(Date.parse(input.eventTimestamp))
      ? new Date(input.eventTimestamp).toISOString()
      : nowIso;
  const signedAmount =
    input.direction === 'debit' ? -input.amountPoisha : input.amountPoisha;

  const orderNoTrimmed = input.orderNo?.trim() || null;
  if (orderNoTrimmed) {
    const existsOrder = erpState.orders.some(
      (o) => o.orderNo.toUpperCase() === orderNoTrimmed.toUpperCase()
    );
    if (!existsOrder) {
      return {
        success: false,
        errorBn: `অর্ডার নম্বর "${orderNoTrimmed}" সিস্টেমে পাওয়া যায়নি।`,
      };
    }
  }

  const holdDays =
    input.holdDays ??
    vendor.escrowHoldDaysOverride ??
    erpState.siteSettings.globalEscrowHoldDays ??
    7;

  const entry: ImmutableVendorLedgerRecord = {
    id: `vled-man-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    vendorId: vendor.vendorId,
    vendorCode: vendor.vendorCode,
    orderItemId: null,
    orderNo: orderNoTrimmed,
    entryType: 'MANUAL_ADJUSTMENT',
    escrowBucket: input.escrowBucket,
    amountPoisha: signedAmount,
    deliveredAt: input.escrowBucket === 'locked' ? eventIso : null,
    maturesAt:
      input.escrowBucket === 'locked'
        ? calculateMaturityTimestamp(eventIso, Math.max(0, holdDays))
        : null,
    descriptionBn: input.descriptionBn.trim(),
    referenceNo: input.referenceNo?.trim() || null,
    paymentMethodBn: input.paymentMethodBn?.trim() || null,
    proofUrl: input.proofUrl?.trim() || null,
    noteBn: input.noteBn?.trim() || null,
    eventTimestamp: eventIso,
    recordedByUsername: ctx.username,
    createdAt: eventIso,
  };

  p4bStore.vendorLedger.unshift(entry);
  const vendorEntries = p4bStore.vendorLedger.filter(
    (e) => e.vendorId === vendor.vendorId
  );
  const balance = computeVendorEscrowBalance(vendor.vendorId, vendorEntries);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'MANUAL_VENDOR_LEDGER_RECORDED',
    targetType: 'system',
    targetId: entry.id,
    summaryBn: `ভেন্ডর ${vendor.businessNameBn} (${vendor.vendorCode})-এর "${input.escrowBucket}" বাকেটে ম্যানুয়াল ${input.direction === 'debit' ? 'কর্তন' : 'যোগ'} ৳${input.amountPoisha / 100}${orderNoTrimmed ? ` (অর্ডার ${orderNoTrimmed})` : ''} — ${entry.descriptionBn}`,
    metadata: {
      vendorId: vendor.vendorId,
      escrowBucket: input.escrowBucket,
      direction: input.direction,
      amountPoisha: input.amountPoisha,
      referenceNo: entry.referenceNo,
      proofUrl: entry.proofUrl,
    },
  });

  writePhase4BStore(p4bStore);
  writeAdminStore(adminStore);
  return { success: true, entry, balance };
}

export function adminDirectVendorSettlement(
  ctx: ActorSecurityContext,
  input: {
    vendorId: string;
    requestedAmountPoisha: Poisha;
    feePoisha?: Poisha;
    payoutMethodBn: string;
    payoutAccountNo: string;
    senderAccountNo?: string | null;
    paymentTrxId: string;
    proofUrl?: string | null;
    noteBn?: string | null;
    paidAt?: string;
    creditAndSettleIfInsufficient?: boolean;
  }
): {
  success: boolean;
  errorBn?: string;
  payout?: VendorPayoutRequestRecord;
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন সরাসরি ভেন্ডর পেমেন্ট নিষ্পত্তি করতে পারবেন।',
    };
  }
  if (!Number.isSafeInteger(input.requestedAmountPoisha) || input.requestedAmountPoisha <= 0) {
    return {
      success: false,
      errorBn: 'পরিশোধের পরিমাণ অবশ্যই ০-এর বেশি পূর্ণ সংখ্যা (পয়সা) হতে হবে।',
    };
  }
  const feePoisha = input.feePoisha ?? 0;
  if (!Number.isSafeInteger(feePoisha) || feePoisha < 0) {
    return {
      success: false,
      errorBn: 'লেনদেন চার্জ ঋণাত্মক হতে পারবে না।',
    };
  }
  if (!input.paymentTrxId || input.paymentTrxId.trim().length < 3) {
    return {
      success: false,
      errorBn: 'প্রমাণ হিসেবে TrxID বা ব্যাংক রেফারেন্স (কমপক্ষে ৩ অক্ষর) দিন।',
    };
  }

  const p4bStore = readPhase4BStore();
  const adminStore = readAdminStore();
  const vendor = p4bStore.vendors.find((v) => v.vendorId === input.vendorId);
  if (!vendor) {
    return { success: false, errorBn: 'ভেন্ডর খুঁজে পাওয়া যায়নি।' };
  }

  const paidIso =
    input.paidAt && Number.isFinite(Date.parse(input.paidAt))
      ? new Date(input.paidAt).toISOString()
      : new Date().toISOString();

  const entries = p4bStore.vendorLedger.filter((e) => e.vendorId === vendor.vendorId);
  const bal = computeVendorEscrowBalance(vendor.vendorId, entries);

  if (input.requestedAmountPoisha > bal.withdrawablePoisha) {
    if (!input.creditAndSettleIfInsufficient) {
      return {
        success: false,
        errorBn: `উত্তোলনযোগ্য ব্যালেন্স (৳${bal.withdrawablePoisha / 100}) পর্যাপ্ত নয়। স্বতন্ত্র/অগ্রিম পরিশোধ হিসেবে রেকর্ড করতে "অটো-ক্রেডিটসহ পরিশোধ" বিকল্পটি চালু করুন অথবা আগে ম্যানুয়াল লেজারে পাওনা যোগ করুন।`,
      };
    }
    const shortfall = input.requestedAmountPoisha - bal.withdrawablePoisha;
    p4bStore.vendorLedger.unshift({
      id: `vled-adv-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      vendorId: vendor.vendorId,
      vendorCode: vendor.vendorCode,
      orderItemId: null,
      orderNo: null,
      entryType: 'MANUAL_ADJUSTMENT',
      escrowBucket: 'available',
      amountPoisha: shortfall,
      deliveredAt: null,
      maturesAt: null,
      descriptionBn: `সরাসরি পেমেন্টের বিপরীতে স্বতন্ত্র/অগ্রিম পাওনা সমন্বয় (${input.paymentTrxId.trim()})${input.noteBn ? ` — ${input.noteBn.trim()}` : ''}`,
      referenceNo: input.paymentTrxId.trim(),
      paymentMethodBn: input.payoutMethodBn.trim(),
      proofUrl: input.proofUrl?.trim() || null,
      noteBn: input.noteBn?.trim() || null,
      eventTimestamp: paidIso,
      recordedByUsername: ctx.username,
      createdAt: paidIso,
    });
  }

  const payoutId = `pay-dir-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`;
  const disbursedEntryId = `vled-paid-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`;
  const netPaidPoisha = Math.max(0, input.requestedAmountPoisha - feePoisha);

  p4bStore.vendorLedger.unshift({
    id: disbursedEntryId,
    vendorId: vendor.vendorId,
    vendorCode: vendor.vendorCode,
    orderItemId: null,
    orderNo: null,
    entryType: 'PAYOUT_DISBURSED',
    escrowBucket: 'available',
    amountPoisha: -input.requestedAmountPoisha,
    deliveredAt: null,
    maturesAt: null,
    descriptionBn: `সরাসরি পেআউট সম্পন্ন (${input.payoutMethodBn.trim()} · TrxID: ${input.paymentTrxId.trim()}, মোট: ৳${input.requestedAmountPoisha / 100}, চার্জ: ৳${feePoisha / 100}, নিট: ৳${netPaidPoisha / 100})।`,
    referenceNo: input.paymentTrxId.trim(),
    paymentMethodBn: input.payoutMethodBn.trim(),
    proofUrl: input.proofUrl?.trim() || null,
    noteBn: input.noteBn?.trim() || null,
    eventTimestamp: paidIso,
    recordedByUsername: ctx.username,
    createdAt: paidIso,
  });

  const payout: VendorPayoutRequestRecord = {
    payoutId,
    vendorId: vendor.vendorId,
    vendorCode: vendor.vendorCode,
    vendorNameBn: vendor.businessNameBn,
    requestedAmountPoisha: input.requestedAmountPoisha,
    payoutMethodBn: input.payoutMethodBn.trim() || vendor.payoutMethodBn,
    payoutAccountNo: input.payoutAccountNo.trim() || vendor.payoutAccountNo,
    status: 'paid',
    holdLedgerEntryId: disbursedEntryId,
    rejectionReasonBn: null,
    paymentTrxId: input.paymentTrxId.trim(),
    proofUrl: input.proofUrl?.trim() || null,
    requestedByUsername: ctx.username,
    requestedAt: paidIso,
    resolvedAt: paidIso,
    feePoisha,
    netPaidPoisha,
    senderAccountNo: input.senderAccountNo?.trim() || null,
    noteBn: input.noteBn?.trim() || null,
    entryType: 'direct_settlement',
  };

  p4bStore.payoutRequests.unshift(payout);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'VENDOR_PAYOUT_MARK_PAID',
    targetType: 'system',
    targetId: payout.payoutId,
    summaryBn: `ভেন্ডর ${vendor.businessNameBn} (${vendor.vendorCode})-কে সরাসরি পেআউট ৳${input.requestedAmountPoisha / 100} পরিশোধ করা হয়েছে (${payout.payoutMethodBn} · TrxID: ${payout.paymentTrxId})।`,
    metadata: {
      payoutId: payout.payoutId,
      vendorId: vendor.vendorId,
      requestedAmountPoisha: payout.requestedAmountPoisha,
      feePoisha,
      netPaidPoisha,
      paymentTrxId: payout.paymentTrxId,
      proofUrl: payout.proofUrl,
      paidAt: paidIso,
      directSettlement: true,
    },
  });

  writePhase4BStore(p4bStore);
  writeAdminStore(adminStore);
  return { success: true, payout };
}

