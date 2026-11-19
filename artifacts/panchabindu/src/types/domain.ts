// src/types/domain.ts
// Shared Domain Interfaces for Storefront & Multi-Vendor Consignment Admin ERP
// Rule A1: All money is integer poisha (1 BDT = 100 poisha). All rates in basis points (10% = 1000 bp).

import type {
  CourierProvider,
  DeliveryMethod,
  DiscountType,
  EscrowBucket,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnFaultType,
  VendorLedgerEntryType,
} from './database.types';

/** Branded semantic type alias for integer poisha (1 BDT = 100 poisha) */
export type Poisha = number;

/** Branded semantic type alias for integer basis points (1% = 100 bp, 10% = 1000 bp) */
export type BasisPoints = number;

export type CommissionSource =
  | 'PRODUCT_OVERRIDE'
  | 'VENDOR_DEFAULT'
  | 'GLOBAL_DEFAULT';

/** Three-Tier Consignment Pricing Breakdown (Per Unit & Line Level) */
export interface ThreeTierPriceSnapshot {
  unitSupplierCostPoisha: Poisha;
  unitSupplierProfitPoisha: Poisha;
  unitSupplierPayablePoisha: Poisha;
  unitPlatformMarginPoisha: Poisha;
  unitSalePricePoisha: Poisha;
  commissionBp: BasisPoints;
  commissionSource: CommissionSource;
  quantity: number;
  lineSupplierPayablePoisha: Poisha;
  linePlatformMarginPoisha: Poisha;
  lineSubtotalPoisha: Poisha;
  escrowHoldDaysSnapshot: number;
}

/** Customer-Safe Storefront Product DTO (Zero Vendor or Cost Fields) */
export interface StorefrontProductDTO {
  productId: string;
  categoryId: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
  specs: Array<{ labelBn: string; labelEn: string; valueBn: string; valueEn: string }>;
  variantAxes: string[];
  images: string[];
  isFeatured: boolean;
  isFreeDelivery: boolean;
  requiresAdvanceCourierCharge?: boolean;
  customAdvanceDepositPoisha?: Poisha;
  lowStockThreshold: number;
  totalSoldCount: number;
  ratingAvgBp: BasisPoints;
  reviewCount: number;
  variants: Array<{
    variantId: string;
    publicSku: string;
    titleBn: string;
    titleEn: string;
    attributes: Record<string, string>;
    imageUrl: string | null;
    salePricePoisha: Poisha;
    compareAtPricePoisha: Poisha | null;
    weightGrams: number;
    stockAvailable: number;
  }>;
}

/** Escrow Ledger Real-Time Balance Summary for a Vendor */
export interface VendorEscrowBalance {
  vendorId: string;
  pendingPoisha: Poisha;
  lockedPoisha: Poisha;
  availablePoisha: Poisha;
  payoutHoldPoisha: Poisha;
  clawbackDebtPoisha: Poisha;
  withdrawablePoisha: Poisha;
}

/** Raw Ledger Row Input for Real-Time Escrow Calculation */
export interface LedgerCalculationEntry {
  id: string;
  orderItemId: string | null;
  entryType: VendorLedgerEntryType;
  escrowBucket: EscrowBucket;
  amountPoisha: Poisha;
  deliveredAt: string | null;
  maturesAt: string | null;
}

/** Four-Way Return & Damage Resolution Output */
export interface ReturnResolutionCalculation {
  faultType: ReturnFaultType;
  wasInHoldPeriod: boolean;
  wasAlreadyPaidOut: boolean;
  vendorDebitPoisha: Poisha;
  platformLossPoisha: Poisha;
  courierClaimPoisha: Poisha;
  restockQuantity: number;
  ledgerEntryToInsert: {
    entryType: VendorLedgerEntryType;
    escrowBucket: EscrowBucket;
    amountPoisha: Poisha;
  } | null;
  shouldCreateCourierClaim: boolean;
}

/** Promo Code Rule Definition */
export interface PromoRuleInput {
  code: string;
  discountType: DiscountType;
  discountValue: number;
  maxDiscountPoisha: Poisha | null;
  minOrderSubtotalPoisha: Poisha;
  allowedVendorIds: string[];
  isActive: boolean;
  expiresAt: string | null;
}

/** Common Courier Adapter Contract (Pathao, Steadfast, RedX, Manual) */
export interface CourierShipmentRequest {
  orderId: string;
  orderNo: string;
  recipientName: string;
  recipientPhone: string;
  recipientAddress: string;
  districtNameEn: string;
  upazilaNameEn: string;
  codCollectablePoisha: Poisha;
  weightGrams: number;
  itemDescription: string;
  note?: string;
  idempotencyKey: string;
}

export interface CourierShipmentResponse {
  connected: boolean;
  provider: CourierProvider;
  success: boolean;
  consignmentId: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  setupGuideMessageBn?: string;
  errorMessage?: string;
}

export interface CourierAdapter {
  readonly provider: CourierProvider;
  isConfigured(): Promise<boolean>;
  createShipment(req: CourierShipmentRequest): Promise<CourierShipmentResponse>;
  bulkCreate(reqs: CourierShipmentRequest[]): Promise<CourierShipmentResponse[]>;
  getStatus(consignmentId: string): Promise<{
    connected: boolean;
    rawStatus: string | null;
    mappedOrderStatus: OrderStatus | null;
  }>;
  verifyWebhookSignature(rawBody: string, signatureHeader: string | null): Promise<boolean>;
}

/** Next Best Action Badge Types for Module N (Orders Grid) */
export type NextBestActionCode =
  | 'CALL_TO_CONFIRM'
  | 'FIX_ADDRESS'
  | 'COLLECT_MANDATORY_ADVANCE'
  | 'VERIFY_BKASH_TRX'
  | 'READY_TO_PACK'
  | 'READY_TO_BOOK_COURIER'
  | 'HANDOVER_TO_COURIER'
  | 'SHIP_OVERDUE'
  | 'AWAITING_COD_REMITTANCE'
  | 'PROCESS_PENDING_RETURN'
  | 'COMPLETED';

export type { CourierProvider, OrderStatus };

export type BdPostServiceType =
  | 'registered_parcel'
  | 'vpp_cod'
  | 'ecommerce_cod'
  | 'speed_post'
  | 'gep'
  | 'ems'
  | 'VPP_PARCEL'
  | 'REGISTERED_PARCEL'
  | 'GEP'
  | 'EMS_DAK'
  | 'EMS_GEP'
  | 'DOMESTIC_PARCEL';

export type PathaoItemType = 'parcel' | 'document' | 'fragile';

export type CourierFormatKey = 'pathao' | 'steadfast' | 'bd_post';
export type CourierBulkExportFormat = CourierFormatKey;

export interface CourierMissingFieldDTO {
  fieldKey: string;
  columnName: string;
  labelBn: string;
  labelEn: string;
}

export interface CourierReadinessDTO {
  isReady: boolean;
  pathaoReady: boolean;
  steadfastReady: boolean;
  bdPostReady: boolean;
  missingFields: CourierMissingFieldDTO[];
  missingCellKeys: string[];
  weightKg: string;
  summaryBn?: string;
}

export interface CourierPreviewRowDTO {
  orderId: string;
  orderNo: string;
  status: OrderStatus;
  courierProvider: CourierProvider;
  createdAt: string;
  isReady: boolean;
  missingFields: CourierMissingFieldDTO[];
  missingCellKeys: string[];
  values: Record<string, string>;
  editSeed: {
    orderId: string;
    orderNo: string;
    customerName: string;
    customerPhone: string;
    districtId: number;
    upazilaId: number;
    streetAddress: string;
    landmark: string;
    postCode: string;
    recipientCity: string;
    recipientZone: string;
    recipientArea: string;
    pathaoItemType: PathaoItemType;
    pathaoStoreName: string;
    totalWeightGrams: number;
    specialInstruction: string;
    bdPostServiceType: BdPostServiceType;
  };
}

export interface CourierBulkExportBundleDTO {
  format: CourierFormatKey;
  headers: string[];
  totalMatchedCount: number;
  readyCount: number;
  flaggedCount: number;
  exportedCount: number;
  previewRows: CourierPreviewRowDTO[];
  csvContent: string;
  filename: string;
}

export interface CustomerDefaultProfileRecord {
  customerId: string;
  fullName: string;
  phone: string;
  email?: string | null;
  districtId: number;
  upazilaId: number;
  postCode: string;
  recipientCity: string;
  recipientZone: string;
  recipientArea: string;
  streetAddress: string;
  landmark: string;
  updatedAt: string;
}

/** Order Summary DTO for Admin Grid */
export interface OrderGridRowDTO {
  id: string;
  customerId?: string | null;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  districtId: number;
  districtNameBn: string;
  districtNameEn?: string;
  upazilaId: number;
  upazilaNameBn: string;
  upazilaNameEn?: string;
  streetAddress: string;
  landmark: string;
  postCode?: string;
  recipientCity?: string;
  recipientZone?: string;
  recipientArea?: string;
  pathaoItemType?: PathaoItemType;
  pathaoStoreName?: string;
  totalWeightGrams?: number;
  itemDescSummary?: string;
  specialInstruction?: string;
  customerNote?: string;
  internalStaffNote?: string;
  bdPostServiceType?: BdPostServiceType;
  bdPostDeclaredValuePoisha?: Poisha;
  courierReadiness?: CourierReadinessDTO;
  addressQualityScore: number;
  addressFlags: string[];
  source: OrderSource;
  status: OrderStatus;
  deliveryMethod: DeliveryMethod;
  courierProvider: CourierProvider;
  customCourierName?: string | null;
  consignmentId: string | null;
  trackingCode: string | null;
  customTrackingUrl?: string | null;
  subtotalPoisha: Poisha;
  discountPoisha: Poisha;
  deliveryChargePoisha: Poisha;
  totalPayablePoisha: Poisha;
  advancePaidPoisha: Poisha;
  codCollectablePoisha: Poisha;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  manualPaymentTrxId: string | null;
  riskScore: number;
  isAdvanceMandatory: boolean;
  isDuplicateFlagged: boolean;
  nextBestAction: NextBestActionCode;
  printCount: number;
  estimatedNetProfitPoisha?: Poisha;
  snapTotalSupplierPayablePoisha?: Poisha;
  secureTrackingToken?: string;
  trackingTokenExpiresAt?: string | null;
  createdAt: string;
}


