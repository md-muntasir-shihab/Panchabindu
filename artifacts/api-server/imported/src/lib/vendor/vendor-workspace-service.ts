// src/lib/vendor/vendor-workspace-service.ts
// Vendor-facing read model and self-service mutations for the consignment
// vendor panel.
//
// SECURITY CONTRACT (Rule A1/A2):
//   - Vendors are denied the shared admin workspace by design, so every vendor
//     action lives behind its own /api/vendor/* route.
//   - Every response below is a hand-built whitelist DTO: no platform margin,
//     no net profit, no other vendor's cost/SKU, no customer name/phone/street.
//   - Cross-vendor resources throw 404, never 403.
//   - Every mutation is gated by the admin-controlled capability registry
//     (vendor-control.ts) and by the vendor account status.

import {
  appendImmutableAuditLog,
  readAdminStore,
  writeAdminStore,
} from '../admin/phase4a-service';
import {
  readPhase4BStore,
  requestVendorPayout,
  VENDOR_ONBOARDING_15_QUESTIONS,
  type VendorProfileRecord,
} from '../admin/phase4b-service';
import {
  computeVendorPerformanceScorecards,
  type VendorScorecardRowDTO,
} from '../admin/phase6-service';
import {
  readPhase7Store,
  submitConsignmentDispatchLot,
  submitVendorPriceProposal,
} from '../admin/phase7-service';
import {
  readErpState,
  upsertAdminProduct,
  writeErpState,
  type InternalProductRecord,
} from '../db/repository';
import { computeVendorEscrowBalance } from '../money';
import type { ActorSecurityContext } from '../../types/permissions';
import type { Poisha } from '../../types/domain';
import type { VendorStatus } from '../../types/database.types';
import {
  getVendorCapabilities,
  getVendorRestrictionNote,
  type VendorCapabilityFlags,
} from './vendor-control';
import {
  appendVendorRequest,
  findPendingRequest,
  listVendorRequests,
  type VendorSelfServiceRequestRecord,
} from './vendor-request-store';

// ============================================================================
// 1. DTO SHAPES (all money is integer poisha)
// ============================================================================

export interface VendorProfileDTO {
  vendorCode: string;
  businessNameBn: string;
  businessNameEn: string;
  ownerNameBn: string;
  contactPhone: string;
  payoutMethodBn: string;
  payoutAccountMasked: string;
  status: VendorStatus;
  defaultCommissionBp: number | null;
  escrowHoldDaysOverride: number | null;
  joinedAt: string;
  onboardingAnsweredCount: number;
  onboardingTotalQuestions: number;
  /** Admin note explaining a disabled capability, shown verbatim to the vendor. */
  restrictionNoteBn: string | null;
}

export interface VendorVariantDTO {
  variantId: string;
  publicSku: string;
  titleBn: string;
  titleEn: string;
  attributes: Record<string, string>;
  imageUrl: string | null;
  /** The vendor's own cost — never another vendor's, never the platform margin. */
  supplierCostPoisha: Poisha;
  supplierPayablePoisha: Poisha;
  salePricePoisha: Poisha;
  weightGrams: number;
  stockAvailable: number;
  stockReserved: number;
  stockInTransit: number;
  lowStock: boolean;
}

export interface VendorProductDTO {
  productId: string;
  nameBn: string;
  nameEn: string;
  slug: string;
  categoryId: string;
  categoryNameBn: string;
  categoryNameEn: string;
  status: 'draft' | 'active' | 'archived';
  images: string[];
  descriptionBn: string;
  descriptionEn: string;
  specs: Array<{ labelBn: string; labelEn: string; valueBn: string; valueEn: string }>;
  isFreeDelivery: boolean;
  lowStockThreshold: number;
  leadTimeDays: number;
  totalSoldCount: number;
  totalReturnedCount: number;
  ratingAvgBp: number;
  reviewCount: number;
  variants: VendorVariantDTO[];
}

export interface VendorOrderLineDTO {
  productNameBn: string;
  productNameEn: string;
  variantTitleBn: string;
  variantTitleEn: string;
  publicSku: string;
  quantity: number;
  /** What the platform owes this vendor for these units. */
  supplierPayablePoisha: Poisha;
}

export interface VendorOrderDTO {
  orderNo: string;
  status: string;
  paymentStatus: string;
  deliveryMethod: string;
  districtNameBn: string;
  upazilaNameBn: string;
  createdAt: string;
  lines: VendorOrderLineDTO[];
  lineCount: number;
  unitCount: number;
  supplierPayablePoisha: Poisha;
}

export interface VendorLedgerEntryDTO {
  id: string;
  entryType: string;
  escrowBucket: string;
  amountPoisha: Poisha;
  orderNo: string | null;
  descriptionBn: string;
  createdAt: string;
  maturesAt: string | null;
}

export interface VendorPayoutDTO {
  payoutId: string;
  requestedAmountPoisha: Poisha;
  payoutMethodBn: string;
  payoutAccountMasked: string;
  status: string;
  rejectionReasonBn: string | null;
  paymentTrxId: string | null;
  requestedAt: string;
  resolvedAt: string | null;
}

export interface VendorLotDTO {
  lotId: string;
  lotCode: string;
  productNameBn: string;
  variantTitleBn: string;
  publicSku: string;
  dispatchedQty: number;
  qcAcceptedQty: number | null;
  qcRejectedQty: number | null;
  /** The vendor's own declared unit cost on that challan. */
  unitSupplierCostPoisha: Poisha;
  challanRef: string;
  status: string;
  noteBn: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface VendorProposalDTO {
  proposalId: string;
  publicSku: string;
  productNameBn: string;
  currentSupplierCostPoisha: Poisha;
  currentSalePricePoisha: Poisha;
  proposedSupplierCostPoisha: Poisha;
  proposedSalePricePoisha: Poisha;
  reasonBn: string;
  status: string;
  createdAt: string;
  reviewedAt: string | null;
}

export interface VendorScorecardDTO {
  activeProductsCount: number;
  totalUnitsSold: number;
  totalUnitsReturned: number;
  returnRateBp: number;
  supplierFaultReturnCount: number;
  grossSalesPoisha: Poisha;
  netVendorPayablePoisha: Poisha;
  averageRatingBp: number;
  slaGrade: 'A+' | 'A' | 'B' | 'C';
}

export interface VendorRequestDTO {
  requestId: string;
  kind: 'profile_update' | 'onboarding_update';
  status: 'pending_review' | 'approved' | 'rejected';
  payload: Record<string, unknown>;
  requestedAt: string;
  reviewedAt: string | null;
  reviewNoteBn: string | null;
}

export interface VendorCountersDTO {
  activeProducts: number;
  draftProducts: number;
  lowStockVariants: number;
  pendingLots: number;
  pendingProposals: number;
  pendingPayouts: number;
  openOrders: number;
}

export interface VendorEscrowSummaryDTO {
  pendingPoisha: Poisha;
  lockedPoisha: Poisha;
  availablePoisha: Poisha;
  payoutHoldPoisha: Poisha;
  clawbackDebtPoisha: Poisha;
  withdrawablePoisha: Poisha;
}

export interface VendorWorkspaceDTO {
  profile: VendorProfileDTO;
  capabilities: VendorCapabilityFlags;
  escrow: VendorEscrowSummaryDTO;
  counters: VendorCountersDTO;
  products: VendorProductDTO[];
  orders: VendorOrderDTO[];
  returns: Array<{ returnId: string; orderNo: string; faultType: string; quantity: number; vendorDebitPoisha: Poisha; restockQuantity: number; createdAt: string }>;
  ledger: VendorLedgerEntryDTO[];
  payouts: VendorPayoutDTO[];
  lots: VendorLotDTO[];
  proposals: VendorProposalDTO[];
  scorecard: VendorScorecardDTO | null;
  selfServiceRequests: VendorRequestDTO[];
  categories: Array<{ id: string; nameBn: string; nameEn: string }>;
  /** Storewide commercial rules the vendor is allowed to know. */
  rules: {
    minPayoutRequestPoisha: Poisha;
    globalEscrowHoldDays: number;
    globalDefaultCommissionBp: number;
    onboardingQuestions: Array<{ key: string; questionBn: string }>;
  };
  generatedAt: string;
}

// ============================================================================
// 2. HELPERS
// ============================================================================

export class VendorNotFoundError extends Error {
  statusCode = 404;
  constructor(message = 'Resource not found') {
    super(message);
  }
}

export function isVendorNotFound(error: unknown): boolean {
  return error instanceof VendorNotFoundError;
}

function maskAccount(account: string): string {
  const clean = account.trim();
  if (clean.length <= 4) return '••••';
  return `${'•'.repeat(Math.max(2, clean.length - 4))}${clean.slice(-4)}`;
}

const OPEN_ORDER_STATUSES = ['pending_confirmation', 'confirmed', 'packed', 'shipped', 'out_for_delivery'];

function requireOwnVariant(actor: ActorSecurityContext, variantId: string) {
  for (const product of readErpState().products) {
    const variant = product.variants.find((item) => item.variantId === variantId);
    if (!variant) continue;
    if (product.vendorId !== actor.vendorId) throw new VendorNotFoundError();
    return { product, variant };
  }
  throw new VendorNotFoundError();
}

function requireOwnProduct(actor: ActorSecurityContext, productId: string): InternalProductRecord {
  const product = readErpState().products.find((item) => item.productId === productId);
  if (!product || product.vendorId !== actor.vendorId) throw new VendorNotFoundError();
  return product;
}

export function requireOwnProfile(actor: ActorSecurityContext): VendorProfileRecord {
  const profile = readPhase4BStore().vendors.find((vendor) => vendor.vendorId === actor.vendorId);
  if (!profile) throw new VendorNotFoundError();
  return profile;
}

export function assertVendorAccountUsable(profile: VendorProfileRecord, allowOnboarding = false): { ok: boolean; errorBn?: string } {
  if (profile.status === 'pending_onboarding' && !allowOnboarding) {
    return { ok: false, errorBn: 'অনবোর্ডিং অনুমোদনের অপেক্ষায় আছে।' };
  }
  if (profile.status === 'suspended') {
    return { ok: false, errorBn: 'আপনার ভেন্ডর অ্যাকাউন্ট সাময়িকভাবে স্থগিত (Suspended) আছে। অ্যাডমিনের সাথে যোগাযোগ করুন।' };
  }
  if (profile.status === 'closed' || profile.status === 'closing_audit') {
    return { ok: false, errorBn: 'এই ভেন্ডর চুক্তি বন্ধ বা ক্লোজিং অডিটে আছে, নতুন কাজ করা যাবে না।' };
  }
  return { ok: true };
}

function capabilityDenied(label: string): { success: false; errorBn: string } {
  return {
    success: false,
    errorBn: `এই সুবিধাটি অ্যাডমিন বন্ধ রেখেছেন: ${label}। প্রয়োজনে অ্যাডমিনের সাথে যোগাযোগ করুন।`,
  };
}

function auditVendorAction(
  actor: ActorSecurityContext,
  actionCode: string,
  targetId: string,
  summaryBn: string,
  metadata: Record<string, unknown> = {}
): void {
  const adminStore = readAdminStore();
  appendImmutableAuditLog(adminStore, {
    actorUserId: actor.userId,
    actorUsername: actor.username,
    actorRole: actor.roleSlug,
    actionCode,
    targetType: 'system',
    targetId,
    summaryBn,
    metadata,
  });
  writeAdminStore(adminStore);
}

// ============================================================================
// 3. READ MODEL
// ============================================================================

function toProductDTO(
  product: InternalProductRecord,
  categories: Array<{ id: string; nameBn: string; nameEn: string }>
): VendorProductDTO {
  const category = categories.find((item) => item.id === product.categoryId);
  const threshold = product.lowStockThreshold ?? 5;
  return {
    productId: product.productId,
    nameBn: product.nameBn,
    nameEn: product.nameEn,
    slug: product.slug,
    categoryId: product.categoryId,
    categoryNameBn: category?.nameBn ?? '—',
    categoryNameEn: category?.nameEn ?? '—',
    status: product.status,
    images: product.images ?? [],
    descriptionBn: product.descriptionBn,
    descriptionEn: product.descriptionEn,
    specs: product.specs ?? [],
    isFreeDelivery: product.isFreeDelivery === true,
    lowStockThreshold: threshold,
    leadTimeDays: product.leadTimeDays ?? 3,
    totalSoldCount: product.totalSoldCount,
    totalReturnedCount: product.totalReturnedCount,
    ratingAvgBp: product.ratingAvgBp,
    reviewCount: product.reviewCount,
    variants: product.variants.map((variant) => ({
      variantId: variant.variantId,
      publicSku: variant.publicSku,
      titleBn: variant.titleBn,
      titleEn: variant.titleEn,
      attributes: variant.attributes ?? {},
      imageUrl: variant.imageUrl,
      supplierCostPoisha: variant.supplierCostPoisha,
      supplierPayablePoisha: variant.supplierPayablePoisha,
      salePricePoisha: variant.salePricePoisha,
      weightGrams: variant.weightGrams,
      stockAvailable: variant.stockAvailable,
      stockReserved: variant.stockReserved,
      stockInTransit: variant.stockInTransit,
      lowStock: variant.stockAvailable <= threshold,
    })),
  };
}

export function sanitizeScorecard(row: VendorScorecardRowDTO): VendorScorecardDTO {
  // platformMarginGeneratedPoisha and owner/vendor identifiers are deliberately dropped.
  return {
    activeProductsCount: row.activeProductsCount,
    totalUnitsSold: row.totalUnitsSold,
    totalUnitsReturned: row.totalUnitsReturned,
    returnRateBp: row.returnRateBp,
    supplierFaultReturnCount: row.supplierFaultReturnCount,
    grossSalesPoisha: row.grossSalesPoisha,
    netVendorPayablePoisha: row.netVendorPayablePoisha,
    averageRatingBp: row.averageRatingBp,
    slaGrade: row.slaGrade,
  };
}

function toRequestDTO(request: VendorSelfServiceRequestRecord): VendorRequestDTO {
  return {
    requestId: request.requestId,
    kind: request.kind,
    status: request.status,
    payload: request.payload,
    requestedAt: request.createdAt,
    reviewedAt: request.reviewedAt,
    reviewNoteBn: request.reviewNoteBn,
  };
}

export function getVendorWorkspace(actor: ActorSecurityContext): VendorWorkspaceDTO {
  const profile = requireOwnProfile(actor);
  const erp = readErpState();
  const p4b = readPhase4BStore();
  const p7 = readPhase7Store();

  const ownProducts = erp.products.filter((product) => product.vendorId === profile.vendorId);
  const ownLines = erp.orderLines.filter((line) => line.vendorId === profile.vendorId);
  const ownOrderIds = new Set(ownLines.map((line) => line.orderId));

  const orders: VendorOrderDTO[] = erp.orders
    .filter((order) => ownOrderIds.has(order.id))
    .map((order) => {
      const lines = ownLines.filter((line) => line.orderId === order.id);
      return {
        orderNo: order.orderNo,
        status: order.status,
        paymentStatus: order.paymentStatus,
        deliveryMethod: order.deliveryMethod,
        // District/upazila only: customer name, phone and street stay with the platform.
        districtNameBn: order.districtNameBn,
        upazilaNameBn: order.upazilaNameBn,
        createdAt: order.createdAt,
        lines: lines.map((line) => ({
          productNameBn: line.productNameBn,
          productNameEn: line.productNameEn ?? line.productNameBn,
          variantTitleBn: line.variantTitleBn,
          variantTitleEn: line.variantTitleEn ?? line.variantTitleBn,
          publicSku: line.publicSku,
          quantity: line.quantity,
          supplierPayablePoisha: line.snapSupplierPayablePoisha * line.quantity,
        })),
        lineCount: lines.length,
        unitCount: lines.reduce((sum, line) => sum + line.quantity, 0),
        supplierPayablePoisha: lines.reduce(
          (sum, line) => sum + line.snapSupplierPayablePoisha * line.quantity,
          0
        ),
      };
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const escrowEntries = p4b.vendorLedger.filter((entry) => entry.vendorId === profile.vendorId);
  const escrow = computeVendorEscrowBalance(profile.vendorId, escrowEntries);

  const lots: VendorLotDTO[] = p7.consignmentLots
    .filter((lot) => lot.vendorId === profile.vendorId)
    .map((lot) => ({
      lotId: lot.lotId,
      lotCode: lot.lotCode,
      productNameBn: lot.productNameBn,
      variantTitleBn: lot.variantTitleBn,
      publicSku: lot.publicSku,
      dispatchedQty: lot.dispatchedQty,
      qcAcceptedQty: lot.qcAcceptedQty,
      qcRejectedQty: lot.qcRejectedQty,
      unitSupplierCostPoisha: lot.unitSupplierCostPoisha,
      challanRef: lot.challanRef,
      status: lot.status,
      noteBn: lot.noteBn,
      createdAt: lot.createdAt,
      reviewedAt: lot.reviewedAt,
    }));

  const proposals: VendorProposalDTO[] = p7.priceProposals
    .filter((proposal) => proposal.vendorId === profile.vendorId)
    .map((proposal) => ({
      proposalId: proposal.proposalId,
      publicSku: proposal.publicSku,
      productNameBn: proposal.productNameBn,
      currentSupplierCostPoisha: proposal.currentSupplierCostPoisha,
      currentSalePricePoisha: proposal.currentSalePricePoisha,
      proposedSupplierCostPoisha: proposal.proposedSupplierCostPoisha,
      proposedSalePricePoisha: proposal.proposedSalePricePoisha,
      reasonBn: proposal.reasonBn,
      status: proposal.status,
      createdAt: proposal.createdAt,
      reviewedAt: proposal.reviewedAt,
    }));

  const payouts: VendorPayoutDTO[] = p4b.payoutRequests
    .filter((payout) => payout.vendorId === profile.vendorId)
    .map((payout) => ({
      payoutId: payout.payoutId,
      requestedAmountPoisha: payout.requestedAmountPoisha,
      payoutMethodBn: payout.payoutMethodBn,
      payoutAccountMasked: maskAccount(payout.payoutAccountNo),
      status: payout.status,
      rejectionReasonBn: payout.rejectionReasonBn,
      paymentTrxId: payout.paymentTrxId,
      requestedAt: payout.requestedAt,
      resolvedAt: payout.resolvedAt,
    }));

  const ledger: VendorLedgerEntryDTO[] = escrowEntries.slice(0, 200).map((entry) => ({
    id: entry.id,
    entryType: entry.entryType,
    escrowBucket: entry.escrowBucket,
    amountPoisha: entry.amountPoisha,
    orderNo: entry.orderNo,
    descriptionBn: entry.descriptionBn,
    createdAt: entry.createdAt,
    maturesAt: entry.maturesAt,
  }));

  const scorecardRow = computeVendorPerformanceScorecards().find(
    (row) => row.vendorId === profile.vendorId
  );

  const lowStockVariants = ownProducts.reduce(
    (sum, product) =>
      sum + product.variants.filter(
        (variant) => variant.stockAvailable <= (product.lowStockThreshold ?? 5)
      ).length,
    0
  );

  const answered = VENDOR_ONBOARDING_15_QUESTIONS.filter(
    (question) => (profile.onboardingAnswers15?.[question.key] ?? '').trim().length >= 2
  ).length;

  return {
    profile: {
      vendorCode: profile.vendorCode,
      businessNameBn: profile.businessNameBn,
      businessNameEn: profile.businessNameEn,
      ownerNameBn: profile.ownerNameBn,
      contactPhone: profile.contactPhone,
      payoutMethodBn: profile.payoutMethodBn,
      payoutAccountMasked: maskAccount(profile.payoutAccountNo),
      status: profile.status,
      defaultCommissionBp: profile.defaultCommissionBp,
      escrowHoldDaysOverride: profile.escrowHoldDaysOverride,
      joinedAt: profile.createdAt,
      onboardingAnsweredCount: answered,
      onboardingTotalQuestions: VENDOR_ONBOARDING_15_QUESTIONS.length,
      restrictionNoteBn: getVendorRestrictionNote(profile.vendorId),
    },
    capabilities: getVendorCapabilities(profile.vendorId),
    // Dropped vendorId on purpose: the vendor's own tenant key is not needed client-side.
    escrow: {
      pendingPoisha: escrow.pendingPoisha,
      lockedPoisha: escrow.lockedPoisha,
      availablePoisha: escrow.availablePoisha,
      payoutHoldPoisha: escrow.payoutHoldPoisha,
      clawbackDebtPoisha: escrow.clawbackDebtPoisha,
      withdrawablePoisha: escrow.withdrawablePoisha,
    },
    counters: {
      activeProducts: ownProducts.filter((product) => product.status === 'active').length,
      draftProducts: ownProducts.filter((product) => product.status === 'draft').length,
      lowStockVariants,
      pendingLots: lots.filter((lot) => lot.status === 'pending_qc').length,
      pendingProposals: proposals.filter((proposal) => proposal.status === 'pending_review').length,
      pendingPayouts: payouts.filter(
        (payout) => payout.status === 'requested' || payout.status === 'approved'
      ).length,
      openOrders: orders.filter((order) => OPEN_ORDER_STATUSES.includes(order.status)).length,
    },
    products: ownProducts.map((product) => toProductDTO(product, erp.categories)),
    orders,
    returns: p4b.returnResolutions.filter(item => item.vendorId === profile.vendorId).map(item => ({
      returnId: item.returnId, orderNo: item.orderNo, faultType: item.faultType,
      quantity: item.quantity, vendorDebitPoisha: item.vendorDebitPoisha,
      restockQuantity: item.restockQuantity, createdAt: item.createdAt,
    })).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    ledger,
    payouts,
    lots,
    proposals,
    scorecard: scorecardRow ? sanitizeScorecard(scorecardRow) : null,
    selfServiceRequests: listVendorRequests(profile.vendorId).map(toRequestDTO),
    categories: erp.categories
      .filter((category) => category.isActive !== false)
      .map((category) => ({ id: category.id, nameBn: category.nameBn, nameEn: category.nameEn })),
    rules: {
      minPayoutRequestPoisha: erp.siteSettings.minPayoutRequestPoisha,
      globalEscrowHoldDays: erp.siteSettings.globalEscrowHoldDays,
      globalDefaultCommissionBp: erp.siteSettings.globalDefaultCommissionBp,
      onboardingQuestions: VENDOR_ONBOARDING_15_QUESTIONS.map((question) => ({
        key: question.key,
        questionBn: question.questionBn,
      })),
    },
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================================
// 4. PRODUCT SELF-SERVICE
// ============================================================================

export interface VendorProductInput {
  productId?: string;
  categoryId: string;
  nameBn: string;
  nameEn: string;
  slug?: string;
  descriptionBn: string;
  descriptionEn?: string;
  images?: string[];
  specs?: Array<{ labelBn: string; labelEn: string; valueBn: string; valueEn: string }>;
  isFreeDelivery?: boolean;
  lowStockThreshold?: number;
  leadTimeDays?: number;
  variants: Array<{
    variantId?: string;
    publicSku: string;
    titleBn: string;
    titleEn?: string;
    attributes?: Record<string, string>;
    imageUrl?: string | null;
    supplierCostPoisha: Poisha;
    salePricePoisha: Poisha;
    weightGrams?: number;
  }>;
}

/** Minimum platform margin on a vendor-created product, in basis points of retail. */
export const VENDOR_MIN_PLATFORM_MARGIN_BP = 500;

export function vendorUpsertProduct(
  actor: ActorSecurityContext,
  input: VendorProductInput
): { success: boolean; errorBn?: string; product?: VendorProductDTO } {
  const profile = requireOwnProfile(actor);
  const usable = assertVendorAccountUsable(profile);
  if (!usable.ok) return { success: false, errorBn: usable.errorBn };

  const capabilities = getVendorCapabilities(profile.vendorId);
  const erp = readErpState();
  const isUpdate = Boolean(input.productId);

  if (isUpdate) {
    if (!capabilities.canEditProduct) return capabilityDenied('নিজের পণ্য সম্পাদনা');
    const existing = requireOwnProduct(actor, input.productId!);
    // Cost and retail price never move through the product editor.
    const existingByVariantId = new Map(
      existing.variants.map((variant) => [variant.variantId, variant])
    );
    for (const variant of input.variants) {
      const current = variant.variantId ? existingByVariantId.get(variant.variantId) : undefined;
      if (current && (current.supplierCostPoisha !== variant.supplierCostPoisha ||
          current.salePricePoisha !== variant.salePricePoisha)) {
        return {
          success: false,
          errorBn: 'ক্রয়মূল্য বা বিক্রয়মূল্য সরাসরি পরিবর্তন করা যায় না। "মূল্য প্রস্তাব" ট্যাব থেকে প্রস্তাব জমা দিন।',
        };
      }
    }
  } else if (!capabilities.canCreateProduct) {
    return capabilityDenied('নতুন পণ্য তৈরি');
  }

  if (!erp.categories.some((category) => category.id === input.categoryId)) {
    return { success: false, errorBn: 'নির্বাচিত ক্যাটাগরি পাওয়া যায়নি।' };
  }

  if (!Array.isArray(input.variants) || input.variants.length === 0) {
    return { success: false, errorBn: 'কমপক্ষে একটি ভ্যারিয়েন্ট যোগ করতে হবে।' };
  }

  for (const variant of input.variants) {
    if (!Number.isSafeInteger(variant.supplierCostPoisha) || !Number.isSafeInteger(variant.salePricePoisha) ||
        variant.supplierCostPoisha <= 0 || variant.salePricePoisha <= 0) {
      return { success: false, errorBn: 'ক্রয়মূল্য ও বিক্রয়মূল্য শূন্যের বেশি পূর্ণসংখ্যা পয়সায় হতে হবে।' };
    }
    if (variant.salePricePoisha <= variant.supplierCostPoisha) {
      return { success: false, errorBn: 'বিক্রয়মূল্য অবশ্যই আপনার ক্রয়মূল্যের চেয়ে বেশি হতে হবে।' };
    }
    const marginPoisha = variant.salePricePoisha - variant.supplierCostPoisha;
    if (marginPoisha * 10000 < variant.salePricePoisha * VENDOR_MIN_PLATFORM_MARGIN_BP) {
      return {
        success: false,
        errorBn: `বিক্রয়মূল্যে কমপক্ষে ${VENDOR_MIN_PLATFORM_MARGIN_BP / 100}% প্ল্যাটফর্ম মার্জিন থাকতে হবে। মূল্য বাড়ান।`,
      };
    }
  }

  const maxActive = capabilities.maxActiveProducts;
  if (!isUpdate && maxActive > 0) {
    const liveCount = erp.products.filter(
      (product) => product.vendorId === profile.vendorId && product.status !== 'archived'
    ).length;
    if (liveCount >= maxActive) {
      return {
        success: false,
        errorBn: `আপনার জন্য অনুমোদিত সর্বোচ্চ ${maxActive}টি পণ্যের সীমা পূর্ণ হয়েছে। অ্যাডমিনের সাথে যোগাযোগ করুন।`,
      };
    }
  }

  const result = upsertAdminProduct({
    productId: input.productId,
    vendorId: profile.vendorId,
    categoryId: input.categoryId,
    nameBn: input.nameBn,
    nameEn: input.nameEn,
    slug: input.slug,
    descriptionBn: input.descriptionBn,
    descriptionEn: input.descriptionEn,
    images: input.images,
    specs: input.specs,
    isFreeDelivery: input.isFreeDelivery,
    lowStockThreshold: input.lowStockThreshold,
    leadTimeDays: input.leadTimeDays,
    // New vendor products always start as drafts; publishing is a separate,
    // capability-gated action that the admin sees in the audit log.
    status: isUpdate ? undefined : 'draft',
    variants: input.variants.map((variant) => ({
      variantId: variant.variantId,
      publicSku: variant.publicSku,
      titleBn: variant.titleBn,
      titleEn: variant.titleEn,
      attributes: variant.attributes,
      imageUrl: variant.imageUrl,
      supplierCostPoisha: variant.supplierCostPoisha,
      supplierProfitPoisha: 0,
      salePricePoisha: variant.salePricePoisha,
      weightGrams: variant.weightGrams,
    })),
  });

  if (!result.success || !result.product) {
    return { success: false, errorBn: result.errorBn ?? 'পণ্য সংরক্ষণ করা যায়নি।' };
  }

  auditVendorAction(
    actor,
    isUpdate ? 'VENDOR_PRODUCT_UPDATED' : 'VENDOR_PRODUCT_CREATED',
    result.product.productId,
    `${profile.businessNameBn} (${profile.vendorCode}) ${isUpdate ? 'নিজের পণ্য আপডেট করেছে' : 'নতুন পণ্য তৈরি করেছে'}: ${result.product.nameBn}`,
    { variantCount: result.product.variants.length }
  );

  return { success: true, product: toProductDTO(result.product, erp.categories) };
}

export function vendorSetProductStatus(
  actor: ActorSecurityContext,
  input: { productId: string; status: 'draft' | 'active' | 'archived' }
): { success: boolean; errorBn?: string; status?: string } {
  const profile = requireOwnProfile(actor);
  const usable = assertVendorAccountUsable(profile);
  if (!usable.ok) return { success: false, errorBn: usable.errorBn };

  const capabilities = getVendorCapabilities(profile.vendorId);
  if (!capabilities.canChangeProductStatus) return capabilityDenied('পণ্য ড্রাফট/লাইভ করা');

  const product = requireOwnProduct(actor, input.productId);

  if (input.status === 'active') {
    const maxActive = capabilities.maxActiveProducts;
    if (maxActive > 0) {
      const liveCount = readErpState().products.filter(
        (item) => item.vendorId === profile.vendorId && item.status === 'active'
      ).length;
      if (liveCount >= maxActive) {
        return {
          success: false,
          errorBn: `আপনার জন্য অনুমোদিত সর্বোচ্চ ${maxActive}টি সক্রিয় পণ্যের সীমা পূর্ণ হয়েছে।`,
        };
      }
    }
    if (product.variants.every((variant) => variant.stockAvailable <= 0)) {
      return {
        success: false,
        errorBn: 'স্টক ছাড়া পণ্য লাইভ করা যাবে না। আগে কনসাইনমেন্ট চালান জমা দিন।',
      };
    }
    if (product.images.length === 0) {
      return { success: false, errorBn: 'কমপক্ষে একটি ছবি যোগ না করে পণ্য লাইভ করা যাবে না।' };
    }
  }

  const erp = readErpState();
  const stored = erp.products.find((item) => item.productId === input.productId);
  if (!stored) return { success: false, errorBn: 'পণ্যটি পাওয়া যায়নি।' };
  stored.status = input.status;
  writeErpState(erp);

  auditVendorAction(
    actor,
    'VENDOR_PRODUCT_STATUS_CHANGED',
    input.productId,
    `${profile.businessNameBn} পণ্য "${stored.nameBn}" স্ট্যাটাস ${input.status} করেছে।`,
    { status: input.status }
  );

  return { success: true, status: input.status };
}

// ============================================================================
// 5. CONSIGNMENT LOTS, PRICE PROPOSALS, PAYOUTS
// ============================================================================

export function vendorSubmitConsignmentLot(
  actor: ActorSecurityContext,
  input: { variantId: string; dispatchedQty: number; challanRef: string; noteBn: string }
) {
  const profile = requireOwnProfile(actor);
  const usable = assertVendorAccountUsable(profile);
  if (!usable.ok) return { success: false, errorBn: usable.errorBn };
  if (!getVendorCapabilities(profile.vendorId).canSubmitConsignmentLot) {
    return capabilityDenied('কনসাইনমেন্ট চালান জমা');
  }
  requireOwnVariant(actor, input.variantId);
  return submitConsignmentDispatchLot(actor, input);
}

export function vendorSubmitPriceProposal(
  actor: ActorSecurityContext,
  input: {
    variantId: string;
    proposedSupplierCostPoisha: number;
    proposedSalePricePoisha: number;
    reasonBn: string;
  }
) {
  const profile = requireOwnProfile(actor);
  const usable = assertVendorAccountUsable(profile);
  if (!usable.ok) return { success: false, errorBn: usable.errorBn };
  if (!getVendorCapabilities(profile.vendorId).canSubmitPriceProposal) {
    return capabilityDenied('মূল্য প্রস্তাব জমা');
  }
  requireOwnVariant(actor, input.variantId);
  return submitVendorPriceProposal(actor, input);
}

export function vendorRequestPayout(actor: ActorSecurityContext, input: { requestedAmountPoisha: number }) {
  const profile = requireOwnProfile(actor);
  const usable = assertVendorAccountUsable(profile);
  if (!usable.ok) return { success: false, errorBn: usable.errorBn };
  if (!getVendorCapabilities(profile.vendorId).canRequestPayout) return capabilityDenied('পেআউট অনুরোধ');
  return requestVendorPayout(actor, {
    vendorId: profile.vendorId,
    requestedAmountPoisha: input.requestedAmountPoisha,
  });
}

// ============================================================================
// 6. SELF-SERVICE REQUESTS (identity, payout account, onboarding answers)
// ============================================================================

export interface VendorProfileChangeInput {
  businessNameBn?: string;
  businessNameEn?: string;
  ownerNameBn?: string;
  contactPhone?: string;
  payoutMethodBn?: string;
  payoutAccountNo?: string;
}

export function vendorRequestProfileChange(
  actor: ActorSecurityContext,
  input: VendorProfileChangeInput
): { success: boolean; errorBn?: string; request?: VendorRequestDTO } {
  const profile = requireOwnProfile(actor);
  const usable = assertVendorAccountUsable(profile, true);
  if (!usable.ok) return { success: false, errorBn: usable.errorBn };
  const capabilities = getVendorCapabilities(profile.vendorId);

  const identityKeys = ['businessNameBn', 'businessNameEn', 'ownerNameBn', 'contactPhone'] as const;
  const payoutKeys = ['payoutMethodBn', 'payoutAccountNo'] as const;
  const wantsIdentity = identityKeys.some((key) => (input[key] ?? '').trim().length > 0);
  const wantsPayout = payoutKeys.some((key) => (input[key] ?? '').trim().length > 0);

  if (!wantsIdentity && !wantsPayout) {
    return { success: false, errorBn: 'পরিবর্তনের জন্য কমপক্ষে একটি তথ্য দিন।' };
  }
  if (wantsIdentity && !capabilities.canEditProfile) return capabilityDenied('প্রোফাইল সম্পাদনা');
  if (wantsPayout && !capabilities.canEditPayoutProfile) return capabilityDenied('পেআউট অ্যাকাউন্ট পরিবর্তন');

  const phone = input.contactPhone?.trim();
  if (phone && !/^01[3-9]\d{8}$/.test(phone)) {
    return { success: false, errorBn: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন 01712345678)।' };
  }

  const payload: Record<string, unknown> = {};
  for (const key of identityKeys) {
    const value = input[key]?.trim();
    if (value) payload[key] = value;
  }
  for (const key of payoutKeys) {
    const value = input[key]?.trim();
    if (value) payload[key] = value;
  }

  if (findPendingRequest(profile.vendorId, 'profile_update')) {
    return { success: false, errorBn: 'আপনার একটি প্রোফাইল পরিবর্তনের অনুরোধ ইতিমধ্যে অ্যাডমিন অনুমোদনের অপেক্ষায় আছে।' };
  }

  const request: VendorSelfServiceRequestRecord = {
    requestId: `vsr-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    kind: 'profile_update',
    vendorId: profile.vendorId,
    vendorCode: profile.vendorCode,
    vendorNameBn: profile.businessNameBn,
    payload,
    status: 'pending_review',
    requestedByUsername: actor.username,
    createdAt: new Date().toISOString(),
    reviewedByUsername: null,
    reviewedAt: null,
    reviewNoteBn: null,
  };
  appendVendorRequest(request);

  auditVendorAction(
    actor,
    'VENDOR_PROFILE_CHANGE_REQUESTED',
    profile.vendorCode,
    `${profile.businessNameBn} (${profile.vendorCode}) প্রোফাইল তথ্য পরিবর্তনের অনুরোধ দিয়েছে।`,
    { requestId: request.requestId, fields: Object.keys(payload) }
  );

  return { success: true, request: toRequestDTO(request) };
}

export function vendorSubmitOnboardingAnswers(
  actor: ActorSecurityContext,
  answers: Record<string, string>
): { success: boolean; errorBn?: string } {
  const profile = requireOwnProfile(actor);
  const usable = assertVendorAccountUsable(profile, true);
  if (!usable.ok) return { success: false, errorBn: usable.errorBn };
  if (!getVendorCapabilities(profile.vendorId).canSubmitOnboardingAnswers) {
    return capabilityDenied('অনবোর্ডিং ১৫ প্রশ্নের উত্তর');
  }

  for (const question of VENDOR_ONBOARDING_15_QUESTIONS) {
    if ((answers[question.key] ?? '').trim().length < 2) {
      return { success: false, errorBn: `অনবোর্ডিং ফর্ম অসম্পূর্ণ: "${question.questionBn}" এর উত্তর দিন।` };
    }
  }

  if (findPendingRequest(profile.vendorId, 'onboarding_update')) {
    return { success: false, errorBn: 'আপনার অনবোর্ডিং তথ্য ইতিমধ্যে অ্যাডমিন যাচাইয়ের অপেক্ষায় আছে।' };
  }

  appendVendorRequest({
    requestId: `vsr-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    kind: 'onboarding_update',
    vendorId: profile.vendorId,
    vendorCode: profile.vendorCode,
    vendorNameBn: profile.businessNameBn,
    payload: { answers15: answers },
    status: 'pending_review',
    requestedByUsername: actor.username,
    createdAt: new Date().toISOString(),
    reviewedByUsername: null,
    reviewedAt: null,
    reviewNoteBn: null,
  });

  auditVendorAction(
    actor,
    'VENDOR_ONBOARDING_ANSWERS_SUBMITTED',
    profile.vendorCode,
    `${profile.businessNameBn} (${profile.vendorCode}) অনবোর্ডিং ১৫ প্রশ্নের উত্তর জমা দিয়েছে।`
  );

  return { success: true };
}
