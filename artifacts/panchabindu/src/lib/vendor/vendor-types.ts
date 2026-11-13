// src/lib/vendor/vendor-types.ts
// Client mirror of the server-side vendor workspace DTOs
// (artifacts/api-server/imported/src/lib/vendor/vendor-workspace-service.ts).
// All money is integer poisha; nothing here contains platform margin or profit.

export interface VendorCapabilityFlags {
  canCreateProduct: boolean;
  canEditProduct: boolean;
  canChangeProductStatus: boolean;
  canSubmitConsignmentLot: boolean;
  canSubmitPriceProposal: boolean;
  canRequestPayout: boolean;
  canEditProfile: boolean;
  canEditPayoutProfile: boolean;
  canSubmitOnboardingAnswers: boolean;
  maxActiveProducts: number;
}

export interface VendorProfileDTO {
  vendorCode: string;
  businessNameBn: string;
  businessNameEn: string;
  ownerNameBn: string;
  contactPhone: string;
  payoutMethodBn: string;
  payoutAccountMasked: string;
  status: string;
  defaultCommissionBp: number | null;
  escrowHoldDaysOverride: number | null;
  joinedAt: string;
  onboardingAnsweredCount: number;
  onboardingTotalQuestions: number;
  restrictionNoteBn: string | null;
}

export interface VendorVariantDTO {
  variantId: string;
  publicSku: string;
  titleBn: string;
  titleEn: string;
  attributes: Record<string, string>;
  imageUrl: string | null;
  supplierCostPoisha: number;
  supplierPayablePoisha: number;
  salePricePoisha: number;
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

export interface VendorOrderDTO {
  orderNo: string;
  status: string;
  paymentStatus: string;
  deliveryMethod: string;
  districtNameBn: string;
  upazilaNameBn: string;
  createdAt: string;
  lines: Array<{
    productNameBn: string;
    productNameEn: string;
    variantTitleBn: string;
    variantTitleEn: string;
    publicSku: string;
    quantity: number;
    supplierPayablePoisha: number;
  }>;
  lineCount: number;
  unitCount: number;
  supplierPayablePoisha: number;
}

export interface VendorLedgerEntryDTO {
  id: string;
  entryType: string;
  escrowBucket: string;
  amountPoisha: number;
  orderNo: string | null;
  descriptionBn: string;
  createdAt: string;
  maturesAt: string | null;
}

export interface VendorPayoutDTO {
  payoutId: string;
  requestedAmountPoisha: number;
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
  unitSupplierCostPoisha: number;
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
  currentSupplierCostPoisha: number;
  currentSalePricePoisha: number;
  proposedSupplierCostPoisha: number;
  proposedSalePricePoisha: number;
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
  grossSalesPoisha: number;
  netVendorPayablePoisha: number;
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

export interface VendorWorkspaceDTO {
  profile: VendorProfileDTO;
  capabilities: VendorCapabilityFlags;
  escrow: {
    pendingPoisha: number;
    lockedPoisha: number;
    availablePoisha: number;
    payoutHoldPoisha: number;
    clawbackDebtPoisha: number;
    withdrawablePoisha: number;
  };
  counters: {
    activeProducts: number;
    draftProducts: number;
    lowStockVariants: number;
    pendingLots: number;
    pendingProposals: number;
    pendingPayouts: number;
    openOrders: number;
  };
  products: VendorProductDTO[];
  orders: VendorOrderDTO[];
  ledger: VendorLedgerEntryDTO[];
  payouts: VendorPayoutDTO[];
  lots: VendorLotDTO[];
  proposals: VendorProposalDTO[];
  scorecard: VendorScorecardDTO | null;
  selfServiceRequests: VendorRequestDTO[];
  categories: Array<{ id: string; nameBn: string; nameEn: string }>;
  rules: {
    minPayoutRequestPoisha: number;
    globalEscrowHoldDays: number;
    globalDefaultCommissionBp: number;
    onboardingQuestions: Array<{ key: string; questionBn: string }>;
  };
  generatedAt: string;
}

export interface VendorWorkspaceResponse {
  success: boolean;
  csrfToken?: string;
  workspace?: VendorWorkspaceDTO;
  errorBn?: string;
}

// ---------------------------------------------------------------------------
// Admin control surface mirror
// ---------------------------------------------------------------------------

export interface AdminVendorRowDTO {
  vendorId: string;
  vendorCode: string;
  businessNameBn: string;
  businessNameEn: string;
  ownerNameBn: string;
  contactPhone: string;
  status: string;
  defaultCommissionBp: number | null;
  escrowHoldDaysOverride: number | null;
  payoutMethodBn: string;
  payoutAccountNo: string;
  createdAt: string;
  capabilities: VendorCapabilityFlags;
  restrictionNoteBn: string | null;
  balance: {
    pendingPoisha: number;
    lockedPoisha: number;
    availablePoisha: number;
    payoutHoldPoisha: number;
    clawbackDebtPoisha: number;
    withdrawablePoisha: number;
  };
  activeProducts: number;
  totalProducts: number;
  pendingRequests: number;
  pendingPayouts: number;
  linkedUsers: Array<{
    userId: string;
    username: string;
    isActive: boolean;
    mustChangePassword: boolean;
    totpEnrolled: boolean;
  }>;
}

export interface AdminVendorRequestDTO {
  requestId: string;
  kind: 'profile_update' | 'onboarding_update';
  status: 'pending_review' | 'approved' | 'rejected';
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  payload: Record<string, unknown>;
  requestedByUsername: string;
  createdAt: string;
  reviewedByUsername: string | null;
  reviewedAt: string | null;
  reviewNoteBn: string | null;
}

export interface AdminVendorControlSnapshot {
  success: boolean;
  vendors: AdminVendorRowDTO[];
  requests: AdminVendorRequestDTO[];
  capabilityLabels: Array<{
    key: keyof VendorCapabilityFlags;
    labelBn: string;
    labelEn: string;
    hintBn: string;
    hintEn: string;
  }>;
  globalRules: {
    globalDefaultCommissionBp: number;
    globalEscrowHoldDays: number;
    minPayoutRequestPoisha: number;
  };
  errorBn?: string;
}
