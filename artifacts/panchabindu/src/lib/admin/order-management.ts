import type { CourierProvider, OrderStatus } from '@/types/database.types';
import type { OrderGridRowDTO } from '@/types/domain';
import { getLiveCourierTrackingUrl } from '@/lib/courier/tracking-urls';

export type OrderStageTab =
  | 'all'
  | 'pending_confirmation'
  | 'confirmed'
  | 'packed'
  | 'in_transit'
  | 'delivered'
  | 'closed';

export type OrderQueueFilter =
  | 'ALL'
  | 'MISSING_COURIER'
  | 'CALL_TO_CONFIRM'
  | 'FIX_ADDRESS'
  | 'VERIFY_BKASH_TRX'
  | 'COLLECT_MANDATORY_ADVANCE'
  | 'READY_TO_PACK'
  | 'READY_TO_BOOK_COURIER'
  | 'HANDOVER_TO_COURIER'
  | 'AWAITING_COD_REMITTANCE'
  | 'PROCESS_PENDING_RETURN'
  | 'COMPLETED';

export type ActiveCourierProvider = 'steadfast' | 'pathao' | 'bd_post' | 'manual';

export const CUSTOM_COURIER_PRESETS: ReadonlyArray<{
  bn: string;
  en: string;
}> = [
  { bn: 'সুন্দরবন কুরিয়ার', en: 'Sundarban Courier' },
  { bn: 'এস.এ পরিবহন', en: 'SA Paribahan' },
  { bn: 'পেপারফ্লাই', en: 'Paperfly' },
  { bn: 'ই-কুরিয়ার', en: 'eCourier' },
  { bn: 'লোকাল রাইডার', en: 'Local Rider' },
];

export const ORDER_STATUS_META: Record<
  OrderStatus,
  { bn: string; en: string; tone: 'muted' | 'amber' | 'sky' | 'emerald' | 'rose' }
> = {
  pending_confirmation: { bn: 'কল বাকি', en: 'Pending Call', tone: 'amber' },
  confirmed: { bn: 'কনফার্মড', en: 'Confirmed', tone: 'sky' },
  packed: { bn: 'প্যাকড', en: 'Packed', tone: 'sky' },
  shipped: { bn: 'শিপড', en: 'Shipped', tone: 'sky' },
  out_for_delivery: { bn: 'ডেলিভারির পথে', en: 'Out for Delivery', tone: 'amber' },
  delivered: { bn: 'ডেলিভার্ড', en: 'Delivered', tone: 'emerald' },
  return_initiated: { bn: 'রিটার্ন চলছে', en: 'Return Initiated', tone: 'rose' },
  returned: { bn: 'রিটার্ন হয়েছে', en: 'Returned', tone: 'rose' },
  cancelled: { bn: 'বাতিল', en: 'Cancelled', tone: 'muted' },
};

export interface OrderPaymentSummary {
  totalPoisha: number;
  verifiedPaidPoisha: number;
  pendingClaimPoisha: number;
  duePoisha: number;
  isFullyPaid: boolean;
  hasPendingVerification: boolean;
  isAdvanceMandatory: boolean;
  trxId: string | null;
  netProfitPoisha: number | null;
}

export interface PendingMfsSubmissionLike {
  submissionId?: string;
  orderNo: string;
  trxId: string;
  provider?: 'bkash' | 'nagad' | 'rocket';
  senderPhone?: string;
  senderPhoneMasked?: string;
  senderPhoneMatchesOrderPhone?: boolean;
  submittedAmountPoisha: number;
  expectedPayablePoisha?: number;
  status: string;
  submittedByRole?: string;
  submittedByUsername?: string;
  submittedAt?: string;
  reviewedByUsername?: string | null;
  reviewedAt?: string | null;
  reviewNoteBn?: string | null;
}

export type CanonicalBdPostServiceType =
  | 'VPP_PARCEL'
  | 'GEP'
  | 'EMS_DAK'
  | 'REGISTERED_PARCEL';

export function normalizeBdPostServiceType(
  raw: string | null | undefined,
  hasCodDue = true
): CanonicalBdPostServiceType {
  const norm = (raw ?? '').trim().toLowerCase();
  if (norm === 'gep') return 'GEP';
  if (norm === 'ems' || norm === 'ems_dak') return 'EMS_DAK';
  if (norm === 'registered_parcel') return 'REGISTERED_PARCEL';
  if (norm === 'vpp_cod' || norm === 'vpp_parcel') return 'VPP_PARCEL';
  return hasCodDue ? 'VPP_PARCEL' : 'REGISTERED_PARCEL';
}

export function getAllowedNextStatuses(
  status: OrderStatus | undefined
): OrderStatus[] {
  switch (status) {
    case 'pending_confirmation':
      return ['confirmed', 'cancelled'];
    case 'confirmed':
      return ['packed', 'cancelled'];
    case 'packed':
      return ['shipped', 'cancelled'];
    case 'shipped':
      return ['out_for_delivery', 'delivered', 'return_initiated'];
    case 'out_for_delivery':
      return ['delivered', 'return_initiated'];
    case 'delivered':
      return ['return_initiated', 'returned'];
    case 'return_initiated':
      return ['returned'];
    default:
      return [];
  }
}

function hasAsciiControlChar(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return true;
  }
  return false;
}

export function isSafeHttpUrl(raw: string | null | undefined): boolean {
  const trimmed = (raw ?? '').trim();
  if (!trimmed || hasAsciiControlChar(trimmed)) return false;
  try {
    const parsed = new URL(trimmed);
    return (
      (parsed.protocol === 'https:' || parsed.protocol === 'http:') &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

export function computeOrderPaymentSummary(
  ord: Partial<OrderGridRowDTO>,
  pendingSubmission?: PendingMfsSubmissionLike | null
): OrderPaymentSummary {
  const totalPoisha = Math.max(0, Math.round(ord.totalPayablePoisha ?? 0));
  const verifiedPaidPoisha = Math.max(0, Math.round(ord.advancePaidPoisha ?? 0));
  const rawDue =
    typeof ord.codCollectablePoisha === 'number'
      ? Math.max(0, Math.round(ord.codCollectablePoisha))
      : Math.max(0, totalPoisha - verifiedPaidPoisha);

  const isPendingSubmission =
    pendingSubmission != null &&
    (pendingSubmission.status === 'pending_verification' ||
      pendingSubmission.status === 'submitted' ||
      pendingSubmission.status === 'under_review');

  const pendingClaimPoisha = isPendingSubmission
    ? Math.max(0, Math.round(pendingSubmission.submittedAmountPoisha ?? 0))
    : 0;

  const hasPendingVerification =
    isPendingSubmission ||
    (Boolean(ord.manualPaymentTrxId) &&
      verifiedPaidPoisha === 0 &&
      ord.paymentStatus === 'unpaid');

  const isFullyPaid =
    rawDue === 0 &&
    (totalPoisha === 0 ||
      verifiedPaidPoisha >= totalPoisha ||
      ord.paymentStatus === 'paid_verified' ||
      ord.paymentStatus === 'remitted');

  return {
    totalPoisha,
    verifiedPaidPoisha,
    pendingClaimPoisha,
    duePoisha: rawDue,
    isFullyPaid,
    hasPendingVerification,
    isAdvanceMandatory: Boolean(ord.isAdvanceMandatory),
    trxId: pendingSubmission?.trxId ?? ord.manualPaymentTrxId ?? null,
    netProfitPoisha:
      typeof ord.estimatedNetProfitPoisha === 'number'
        ? Math.round(ord.estimatedNetProfitPoisha)
        : null,
  };
}

export interface OrderTrackingDisplay {
  provider: CourierProvider;
  courierLabel: string;
  isCustomCourier: boolean;
  trackingCode: string | null;
  consignmentId: string | null;
  trackingUrl: string | null;
  isCustomTrackingUrl: boolean;
  hasTracking: boolean;
}

export function getCourierProviderLabel(
  provider: CourierProvider | undefined | null,
  customCourierName: string | null | undefined,
  locale: 'bn' | 'en' = 'bn'
): string {
  const custom = (customCourierName ?? '').trim();
  if (provider === 'manual') {
    if (custom) return custom;
    return locale === 'bn' ? 'কাস্টম কুরিয়ার' : 'Custom Courier';
  }
  if (provider === 'steadfast') return 'Steadfast';
  if (provider === 'pathao') return 'Pathao';
  if (provider === 'bd_post') {
    return locale === 'bn' ? 'ডাক বিভাগ' : 'BD Post';
  }
  if (provider === 'redx') return 'RedX';
  return locale === 'bn' ? 'অনির্ধারিত' : 'Unassigned';
}

export function getSuggestedTrackingUrl(
  provider: ActiveCourierProvider,
  trackingCode: string | null | undefined,
  consignmentId?: string | null
): string | null {
  const code = (trackingCode ?? '').trim();
  const cns = (consignmentId ?? '').trim();
  if (provider === 'steadfast' && code) {
    return getLiveCourierTrackingUrl('steadfast', code, cns);
  }
  if (provider === 'pathao' && (cns || code)) {
    return getLiveCourierTrackingUrl('pathao', code, cns);
  }
  if (provider === 'bd_post' && code) {
    return getLiveCourierTrackingUrl('bd_post', code, cns);
  }
  return null;
}

export function resolveOrderTrackingDisplay(
  ord: Partial<OrderGridRowDTO>,
  locale: 'bn' | 'en' = 'bn'
): OrderTrackingDisplay {
  const provider: CourierProvider = ord.courierProvider ?? 'steadfast';
  const isCustomCourier = provider === 'manual';
  const trackingCode = (ord.trackingCode ?? '').trim() || null;
  const consignmentId = (ord.consignmentId ?? '').trim() || null;
  const rawCustomUrl = (ord.customTrackingUrl ?? '').trim();
  const hasCustomUrl = isSafeHttpUrl(rawCustomUrl);

  let trackingUrl: string | null = null;
  if (hasCustomUrl) {
    trackingUrl = rawCustomUrl;
  } else if (
    provider === 'steadfast' ||
    provider === 'pathao' ||
    provider === 'bd_post'
  ) {
    trackingUrl = getSuggestedTrackingUrl(provider, trackingCode, consignmentId);
  }

  return {
    provider,
    courierLabel: getCourierProviderLabel(provider, ord.customCourierName, locale),
    isCustomCourier,
    trackingCode,
    consignmentId,
    trackingUrl,
    isCustomTrackingUrl: hasCustomUrl,
    hasTracking: Boolean(trackingCode || consignmentId),
  };
}

export interface DispatchValidationInput {
  courierProvider: string;
  customCourierName: string;
  trackingCode: string;
  consignmentId?: string;
  customTrackingUrl: string;
  requireTracking?: boolean;
}

export interface DispatchValidationResult {
  valid: boolean;
  errorBn?: string;
  errorEn?: string;
  normalized?: {
    courierProvider: ActiveCourierProvider;
    customCourierName: string | null;
    trackingCode: string;
    consignmentId: string | null;
    customTrackingUrl: string | null;
  };
}

export function validateDispatchInput(
  input: DispatchValidationInput
): DispatchValidationResult {
  const allowed: ActiveCourierProvider[] = ['steadfast', 'pathao', 'bd_post', 'manual'];
  if (!allowed.includes(input.courierProvider as ActiveCourierProvider)) {
    return {
      valid: false,
      errorBn: 'অনুগ্রহ করে অনুমোদিত কুরিয়ার নির্বাচন করুন (Steadfast, Pathao, ডাক বিভাগ বা কাস্টম কুরিয়ার)।',
      errorEn: 'Please select a supported courier (Steadfast, Pathao, BD Post, or Custom Courier).',
    };
  }
  const courierProvider = input.courierProvider as ActiveCourierProvider;
  const customName = input.customCourierName.trim();
  if (courierProvider === 'manual' && customName.length < 2) {
    return {
      valid: false,
      errorBn: 'কাস্টম কুরিয়ারের নাম লিখুন (যেমন: সুন্দরবন কুরিয়ার বা লোকাল রাইডার)।',
      errorEn: 'Please enter the custom courier name (e.g., Sundarban Courier or Local Rider).',
    };
  }

  const trackingCode = input.trackingCode.trim();
  const consignmentId = (input.consignmentId ?? '').trim();
  const requireTracking = input.requireTracking !== false;
  if (requireTracking && trackingCode.length < 3) {
    return {
      valid: false,
      errorBn: 'ট্র্যাকিং কোড কমপক্ষে ৩ অক্ষরের হতে হবে।',
      errorEn: 'Tracking code must be at least 3 characters.',
    };
  }

  const rawUrl = input.customTrackingUrl.trim();
  if (rawUrl && !isSafeHttpUrl(rawUrl)) {
    return {
      valid: false,
      errorBn: 'ট্র্যাকিং লিংক অবশ্যই সঠিক http:// বা https:// URL হতে হবে।',
      errorEn: 'Tracking link must be a valid http:// or https:// URL.',
    };
  }

  return {
    valid: true,
    normalized: {
      courierProvider,
      customCourierName: courierProvider === 'manual' ? customName : null,
      trackingCode,
      consignmentId: consignmentId || null,
      customTrackingUrl: rawUrl || null,
    },
  };
}

export function mapStatusToStage(status: OrderStatus | string | undefined): OrderStageTab {
  switch (status) {
    case 'pending_confirmation':
      return 'pending_confirmation';
    case 'confirmed':
      return 'confirmed';
    case 'packed':
      return 'packed';
    case 'shipped':
    case 'out_for_delivery':
      return 'in_transit';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
    case 'return_initiated':
    case 'returned':
      return 'closed';
    default:
      return 'all';
  }
}

export function summarizeOrderStages(
  orders: ReadonlyArray<Partial<OrderGridRowDTO>>
): Record<OrderStageTab, number> {
  const counts: Record<OrderStageTab, number> = {
    all: orders.length,
    pending_confirmation: 0,
    confirmed: 0,
    packed: 0,
    in_transit: 0,
    delivered: 0,
    closed: 0,
  };
  for (const ord of orders) {
    const stage = mapStatusToStage(ord.status);
    if (stage !== 'all') {
      counts[stage] += 1;
    }
  }
  return counts;
}

export function filterOrdersMinimal<T extends Partial<OrderGridRowDTO>>(
  orders: ReadonlyArray<T>,
  filters: {
    stage: OrderStageTab;
    queueFilter: OrderQueueFilter;
    search: string;
  }
): T[] {
  const q = filters.search.trim().toLowerCase();
  return orders.filter((ord) => {
    if (filters.stage !== 'all' && mapStatusToStage(ord.status) !== filters.stage) {
      return false;
    }
    if (filters.queueFilter === 'MISSING_COURIER') {
      if (!ord.courierReadiness || ord.courierReadiness.isReady) {
        return false;
      }
    } else if (filters.queueFilter !== 'ALL') {
      if (ord.nextBestAction !== filters.queueFilter) {
        return false;
      }
    }
    if (!q) return true;
    return (
      (ord.orderNo ?? '').toLowerCase().includes(q) ||
      (ord.customerName ?? '').toLowerCase().includes(q) ||
      (ord.customerPhone ?? '').toLowerCase().includes(q) ||
      (ord.districtNameBn ?? '').toLowerCase().includes(q) ||
      (ord.upazilaNameBn ?? '').toLowerCase().includes(q) ||
      (ord.postCode ?? '').toLowerCase().includes(q) ||
      (ord.recipientCity ?? '').toLowerCase().includes(q) ||
      (ord.recipientZone ?? '').toLowerCase().includes(q) ||
      (ord.trackingCode ?? '').toLowerCase().includes(q) ||
      (ord.customCourierName ?? '').toLowerCase().includes(q)
    );
  });
}

export function getAllowedSecondaryStatuses(
  status: OrderStatus | undefined
): OrderStatus[] {
  switch (status) {
    case 'pending_confirmation':
      return ['cancelled'];
    case 'confirmed':
      return ['cancelled'];
    case 'packed':
      return ['cancelled'];
    case 'shipped':
      return ['delivered', 'return_initiated'];
    case 'out_for_delivery':
      return ['return_initiated'];
    case 'delivered':
      return ['return_initiated'];
    case 'return_initiated':
      return ['returned'];
    default:
      return [];
  }
}
