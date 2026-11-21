'use client';

import * as React from 'react';
import {
  AlertTriangle,
  Check,
  Copy,
  ExternalLink,
  Link2,
  MapPin,
  MessageSquare,
  Minus,
  Package,
  PhoneCall,
  PhoneMissed,
  Plus,
  Printer,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Truck,
  Wallet,
  X,
  XSquare,
} from 'lucide-react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import { ResponsiveSheet } from '@/components/ui/responsive-sheet';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { localizedField } from '@/lib/i18n/ui-text';
import { BD_DISTRICTS, getThanasByDistrict } from '@/lib/geo/bd-geocode';
import {
  getPathaoZonesForDistrict,
  resolveCourierGeoForAddress,
} from '@/lib/geo/bd-courier-geo';
import { evaluateAddressQuality, normalizeBdPhone } from '@/lib/validators';
import {
  CUSTOM_COURIER_PRESETS,
  ORDER_STATUS_META,
  computeOrderPaymentSummary,
  getAllowedNextStatuses,
  getSuggestedTrackingUrl,
  isSafeHttpUrl,
  normalizeBdPostServiceType,
  validateDispatchInput,
  type ActiveCourierProvider,
  type CanonicalBdPostServiceType,
  type PendingMfsSubmissionLike,
} from '@/lib/admin/order-management';
import type {
  OrderSource,
  OrderStatus,
  PaymentMethod,
} from '@/types/database.types';
import type { MinimalOrderRow } from './orders-grid-minimal';
import type { PublicSafeSiteSettingsDTO } from '@/lib/db/repository';

export interface ProductCatalogOption {
  productId?: string;
  nameBn?: string;
  nameEn?: string;
  variants?: Array<{
    variantId: string;
    titleBn?: string;
    titleEn?: string;
    publicSku?: string;
    salePricePoisha?: number;
  }>;
}

export interface OrderDetailsSheetProps {
  order: MinimalOrderRow | null;
  initialFocus?: 'top' | 'payment' | 'courier';
  locale: 'bn' | 'en';
  isVendor: boolean;
  isSuperAdmin: boolean;
  products: ProductCatalogOption[];
  manualPaymentSubmissions: PendingMfsSubmissionLike[];
  siteSettings: PublicSafeSiteSettingsDTO;
  getOrderStatusUrl: (ord: MinimalOrderRow) => string | undefined;
  onClose: () => void;
  onRefreshWorkspace: () => Promise<void>;
  onLogCall: (orderNo: string) => void;
  onOpenMessage: (ord: MinimalOrderRow) => void;
  onOpenPrint: (orderNo: string) => void;
  onFeedback?: (fb: { type: 'success' | 'error'; text: string }) => void;
}

interface EditableOrderItem {
  productId: string;
  variantId: string;
  productNameBn: string;
  variantTitleBn: string;
  publicSku: string;
  quantity: number;
  unitSalePricePoisha: number;
  lineSubtotalPoisha: number;
}

const COURIER_OPTIONS: ReadonlyArray<{
  key: ActiveCourierProvider;
  labelBn: string;
  labelEn: string;
}> = [
  { key: 'steadfast', labelBn: 'Steadfast', labelEn: 'Steadfast' },
  { key: 'pathao', labelBn: 'Pathao', labelEn: 'Pathao' },
  { key: 'bd_post', labelBn: 'ডাক বিভাগ', labelEn: 'BD Post' },
  { key: 'manual', labelBn: 'কাস্টম কুরিয়ার', labelEn: 'Custom Courier' },
];

const PAYMENT_STATUS_LABELS: Record<string, { bn: string; en: string }> = {
  unpaid: { bn: 'অপরিশোধিত (COD)', en: 'Unpaid (COD)' },
  partial_verified: { bn: 'আংশিক অগ্রিম যাচাইকৃত', en: 'Partially Paid' },
  paid_verified: { bn: 'সম্পূর্ণ পরিশোধিত', en: 'Fully Paid' },
  remitted: { bn: 'কুরিয়ার সেটেল্ড', en: 'Remitted' },
  refunded: { bn: 'রিফান্ডেড', en: 'Refunded' },
};

const SUBMISSION_STATUS_LABELS: Record<
  string,
  { bn: string; en: string; toneClass: string }
> = {
  pending_verification: {
    bn: 'যাচাই বাকি (ধাপ ২)',
    en: 'Pending Verification',
    toneClass: 'text-amber-700 dark:text-amber-400',
  },
  submitted: {
    bn: 'যাচাই বাকি (ধাপ ২)',
    en: 'Pending Verification',
    toneClass: 'text-amber-700 dark:text-amber-400',
  },
  under_review: {
    bn: 'পর্যালোচনাধীন',
    en: 'Under Review',
    toneClass: 'text-amber-700 dark:text-amber-400',
  },
  approved: {
    bn: 'যাচাইকৃত (Approved)',
    en: 'Verified',
    toneClass: 'text-emerald-700 dark:text-emerald-400',
  },
  rejected: {
    bn: 'প্রত্যাখ্যাত (Rejected)',
    en: 'Rejected',
    toneClass: 'text-rose-700 dark:text-rose-400',
  },
  reversed: {
    bn: 'রিভার্সড',
    en: 'Reversed',
    toneClass: 'text-muted',
  },
};

function formatDateTime(iso: string | null | undefined, locale: 'bn' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function detectBdCarrier(phone: string): string | null {
  const norm = normalizeBdPhone(phone);
  if (!norm) return null;
  const pfx = norm.slice(0, 3);
  if (pfx === '017' || pfx === '013') return 'Grameenphone (GP)';
  if (pfx === '018') return 'Robi';
  if (pfx === '019' || pfx === '014') return 'Banglalink';
  if (pfx === '015') return 'Teletalk';
  if (pfx === '016') return 'Airtel';
  return 'BD Mobile';
}

export function OrderDetailsSheet({
  order,
  initialFocus = 'top',
  locale,
  isVendor,
  isSuperAdmin,
  products,
  manualPaymentSubmissions,
  siteSettings,
  getOrderStatusUrl,
  onClose,
  onRefreshWorkspace,
  onLogCall,
  onOpenMessage,
  onOpenPrint,
  onFeedback,
}: OrderDetailsSheetProps) {
  const bn = locale === 'bn';
  const paymentCourierSectionRef = React.useRef<HTMLDivElement>(null);

  // Customer & Address state
  const [customerName, setCustomerName] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [districtId, setDistrictId] = React.useState(47);
  const [upazilaId, setUpazilaId] = React.useState(365);
  const [streetAddress, setStreetAddress] = React.useState('');
  const [landmark, setLandmark] = React.useState('');

  // Items state
  const [items, setItems] = React.useState<EditableOrderItem[]>([]);

  // Financial & Payment state
  const [discountTaka, setDiscountTaka] = React.useState(0);
  const [deliveryChargeTaka, setDeliveryChargeTaka] = React.useState(0);
  const [paymentMethod, setPaymentMethod] = React.useState<PaymentMethod>('cod');

  // Courier, Tracking & Geo state
  const [courierProvider, setCourierProvider] =
    React.useState<ActiveCourierProvider>('steadfast');
  const [customCourierName, setCustomCourierName] = React.useState('');
  const [trackingCode, setTrackingCode] = React.useState('');
  const [consignmentId, setConsignmentId] = React.useState('');
  const [trackingUrl, setTrackingUrl] = React.useState('');
  const [urlManuallyEdited, setUrlManuallyEdited] = React.useState(false);

  const [postCode, setPostCode] = React.useState('');
  const [recipientCity, setRecipientCity] = React.useState('');
  const [recipientZone, setRecipientZone] = React.useState('');
  const [recipientArea, setRecipientArea] = React.useState('');
  const [pathaoStoreName, setPathaoStoreName] = React.useState('');
  const [pathaoItemType, setPathaoItemType] = React.useState<
    'parcel' | 'document' | 'fragile'
  >('parcel');
  const [totalWeightGrams, setTotalWeightGrams] = React.useState(500);
  const [bdPostServiceType, setBdPostServiceType] =
    React.useState<CanonicalBdPostServiceType>('VPP_PARCEL');
  const [specialInstruction, setSpecialInstruction] = React.useState('');
  const [showGeoDetails, setShowGeoDetails] = React.useState(false);

  // Call, Status & Notes state
  const [orderStatus, setOrderStatus] = React.useState<OrderStatus>(
    'pending_confirmation'
  );
  const [orderSource, setOrderSource] = React.useState<OrderSource>('storefront');
  const [callStatus, setCallStatus] = React.useState<
    | 'pending'
    | 'confirmed_yes'
    | 'not_answered_busy'
    | 'cancelled_no'
    | 'call_back_requested'
  >('pending');
  const [callStatusNote, setCallStatusNote] = React.useState('');
  const [staffNote, setStaffNote] = React.useState('');
  const [overrideReason, setOverrideReason] = React.useState('');

  // Step 1 Inline Advance Entry state
  const [showAddAdvance, setShowAddAdvance] = React.useState(false);
  const [advSenderPhone, setAdvSenderPhone] = React.useState('');
  const [advAmountTaka, setAdvAmountTaka] = React.useState('');
  const [advTrxId, setAdvTrxId] = React.useState('');
  const [advNote, setAdvNote] = React.useState('');
  const [isSubmittingAdvance, setIsSubmittingAdvance] = React.useState(false);

  // Step 2 Inline Verification state (per TrxID)
  const [reviewNotesByTrx, setReviewNotesByTrx] = React.useState<
    Record<string, string>
  >({});
  const [overrideReasonByTrx, setOverrideReasonByTrx] = React.useState<
    Record<string, string>
  >({});
  const [makerCheckerBlockedTrx, setMakerCheckerBlockedTrx] = React.useState<
    Record<string, boolean>
  >({});
  const [verifyingTrx, setVerifyingTrx] = React.useState<string | null>(null);

  // Save & UI feedback state
  const [isSaving, setIsSaving] = React.useState(false);
  const [panelFeedback, setPanelFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);

  const hydratedOrderKeyRef = React.useRef<string | null>(null);

  // Hydrate form whenever the opened order changes or its server snapshot updates
  React.useEffect(() => {
    if (!order?.orderNo) {
      hydratedOrderKeyRef.current = null;
      return;
    }

    const orderKey = `${order.orderNo}|${order.status}|${order.advancePaidPoisha}|${order.codCollectablePoisha}|${order.trackingCode ?? ''}|${order.customTrackingUrl ?? ''}|${order.courierProvider ?? ''}|${order.discountPoisha ?? 0}|${order.deliveryChargePoisha ?? 0}`;
    const isNewOrder =
      hydratedOrderKeyRef.current === null ||
      !hydratedOrderKeyRef.current.startsWith(`${order.orderNo}|`);

    if (hydratedOrderKeyRef.current === orderKey) return;
    hydratedOrderKeyRef.current = orderKey;

    setCustomerName(order.customerName ?? '');
    setCustomerPhone(order.customerPhone ?? '');
    const distId = order.districtId ?? 47;
    const upzId = order.upazilaId ?? 365;
    setDistrictId(distId);
    setUpazilaId(upzId);
    setStreetAddress(order.streetAddress ?? '');
    setLandmark(order.landmark ?? '');

    const geo = resolveCourierGeoForAddress({
      districtId: distId,
      districtNameEn: order.districtNameEn,
      upazilaId: upzId,
      upazilaNameEn: order.upazilaNameEn,
      streetAddress: order.streetAddress,
      landmark: order.landmark,
      existingPostCode: order.postCode,
      existingCity: order.recipientCity,
      existingZone: order.recipientZone,
      existingArea: order.recipientArea,
    });
    setPostCode(order.postCode || geo.postCode);
    setRecipientCity(order.recipientCity || geo.recipientCity);
    setRecipientZone(order.recipientZone || geo.recipientZone);
    setRecipientArea(order.recipientArea || geo.recipientArea);
    setPathaoStoreName(
      order.pathaoStoreName ||
        siteSettings.pathaoDefaultStoreName ||
        'Panchabindu Store'
    );
    setPathaoItemType(
      order.pathaoItemType || siteSettings.pathaoDefaultItemType || 'parcel'
    );
    setTotalWeightGrams(order.totalWeightGrams || 500);
    setBdPostServiceType(
      normalizeBdPostServiceType(
        order.bdPostServiceType || siteSettings.defaultBdPostServiceType,
        (order.codCollectablePoisha ?? 0) > 0
      )
    );
    setSpecialInstruction(order.specialInstruction || '');

    setItems(
      order.items && order.items.length > 0
        ? order.items.map((item) => ({ ...item }))
        : []
    );

    setDiscountTaka(Math.round((order.discountPoisha ?? 0) / 100));
    setDeliveryChargeTaka(Math.round((order.deliveryChargePoisha ?? 0) / 100));
    setPaymentMethod(
      order.paymentMethod === 'bkash_manual' ? 'bkash_manual' : 'cod'
    );

    const rawProvider = order.courierProvider;
    const nextProvider: ActiveCourierProvider =
      rawProvider === 'pathao' ||
      rawProvider === 'steadfast' ||
      rawProvider === 'bd_post' ||
      rawProvider === 'manual'
        ? rawProvider
        : 'steadfast';
    const nextCode = (order.trackingCode ?? '').trim();
    const nextCns = (order.consignmentId ?? '').trim();
    const savedCustomUrl = (order.customTrackingUrl ?? '').trim();

    setCourierProvider(nextProvider);
    setCustomCourierName((order.customCourierName ?? '').trim());
    setTrackingCode(nextCode);
    setConsignmentId(nextCns);

    if (savedCustomUrl) {
      setTrackingUrl(savedCustomUrl);
      setUrlManuallyEdited(true);
    } else {
      setTrackingUrl(
        getSuggestedTrackingUrl(nextProvider, nextCode, nextCns) ?? ''
      );
      setUrlManuallyEdited(false);
    }

    setOrderStatus(order.status ?? 'pending_confirmation');
    setOrderSource(order.source ?? 'storefront');
    setCallStatus(order.callStatus ?? 'pending');
    setCallStatusNote(order.callStatusNote ?? '');
    setStaffNote(order.internalStaffNote ?? '');
    setOverrideReason('');

    if (isNewOrder) {
      setPanelFeedback(null);
      setShowAddAdvance(initialFocus === 'payment');
      setShowGeoDetails(Boolean(order.courierReadiness && !order.courierReadiness.isReady));
      setAdvSenderPhone(order.customerPhone ?? '');
      setAdvAmountTaka('');
      setAdvTrxId('');
      setAdvNote('');
      setMakerCheckerBlockedTrx({});
      setOverrideReasonByTrx({});
    }
  }, [order, initialFocus, siteSettings]);

  // Smooth scroll to Payment & Courier section if opened directly via payment shortcut
  React.useEffect(() => {
    if (order && (initialFocus === 'payment' || initialFocus === 'courier')) {
      const timer = setTimeout(() => {
        paymentCourierSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }, 120);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [order?.orderNo, initialFocus]);

  // Auto-suggest official courier URL unless manually overridden
  React.useEffect(() => {
    if (urlManuallyEdited) return;
    if (courierProvider === 'manual') {
      setTrackingUrl('');
      return;
    }
    setTrackingUrl(
      getSuggestedTrackingUrl(courierProvider, trackingCode, consignmentId) ?? ''
    );
  }, [courierProvider, trackingCode, consignmentId, urlManuallyEdited]);

  const orderSubmissions = React.useMemo(() => {
    if (!order?.orderNo) return [];
    return manualPaymentSubmissions
      .filter((s) => s.orderNo.toUpperCase() === order.orderNo!.toUpperCase())
      .sort((a, b) => {
        const tA = a.submittedAt ? new Date(a.submittedAt).getTime() : 0;
        const tB = b.submittedAt ? new Date(b.submittedAt).getTime() : 0;
        return tB - tA;
      });
  }, [manualPaymentSubmissions, order?.orderNo]);

  const pendingSubmission = React.useMemo(
    () =>
      orderSubmissions.find(
        (s) =>
          s.status === 'pending_verification' ||
          s.status === 'submitted' ||
          s.status === 'under_review'
      ) ?? null,
    [orderSubmissions]
  );

  // Live financial calculation
  const liveSubtotalPoisha = React.useMemo(
    () =>
      items.length > 0
        ? items.reduce(
            (sum, item) => sum + item.quantity * item.unitSalePricePoisha,
            0
          )
        : Math.max(0, Math.round(order?.subtotalPoisha ?? 0)),
    [items, order?.subtotalPoisha]
  );

  const liveDiscountPoisha = Math.max(0, Math.round((discountTaka || 0) * 100));
  const liveDeliveryPoisha = Math.max(
    0,
    Math.round((deliveryChargeTaka || 0) * 100)
  );
  const liveTotalPoisha = Math.max(
    0,
    liveSubtotalPoisha - liveDiscountPoisha + liveDeliveryPoisha
  );
  const verifiedAdvancePoisha = Math.max(
    0,
    Math.round(order?.advancePaidPoisha ?? 0)
  );
  const liveDuePoisha = Math.max(0, liveTotalPoisha - verifiedAdvancePoisha);

  const livePaymentSummary = React.useMemo(
    () =>
      order
        ? computeOrderPaymentSummary(
            {
              ...order,
              totalPayablePoisha: liveTotalPoisha,
              advancePaidPoisha: verifiedAdvancePoisha,
              codCollectablePoisha: liveDuePoisha,
            },
            pendingSubmission
          )
        : null,
    [order, liveTotalPoisha, verifiedAdvancePoisha, liveDuePoisha, pendingSubmission]
  );

  const suggestedOfficialUrl =
    courierProvider !== 'manual'
      ? getSuggestedTrackingUrl(courierProvider, trackingCode, consignmentId)
      : null;
  const trimmedTrackingUrl = trackingUrl.trim();
  const isCustomUrlOverride =
    Boolean(trimmedTrackingUrl) &&
    (courierProvider === 'manual' ||
      trimmedTrackingUrl !== (suggestedOfficialUrl ?? ''));
  const previewTrackingUrl = isSafeHttpUrl(trimmedTrackingUrl)
    ? trimmedTrackingUrl
    : suggestedOfficialUrl;

  const addressQuality = React.useMemo(
    () =>
      evaluateAddressQuality({
        districtId,
        upazilaId,
        streetAddress,
        landmark,
        customerPhone,
      }),
    [districtId, upazilaId, streetAddress, landmark, customerPhone]
  );

  const allowedNextStatuses = React.useMemo(
    () => getAllowedNextStatuses(order?.status),
    [order?.status]
  );

  const isClosedOrder =
    order?.status === 'cancelled' || order?.status === 'returned';
  const canEditCoreOrder = !isVendor && isSuperAdmin && !isClosedOrder;
  const canEditOperations = !isVendor && !isClosedOrder;

  const copyTimerRef = React.useRef<number | null>(null);
  React.useEffect(() => {
    return () => {
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
    };
  }, []);

  const handleCopyText = async (key: string, text: string) => {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedKey(key);
      if (copyTimerRef.current !== null) {
        window.clearTimeout(copyTimerRef.current);
      }
      copyTimerRef.current = window.setTimeout(() => {
        setCopiedKey(null);
        copyTimerRef.current = null;
      }, 2000);
    } catch {
      // Ignore clipboard restriction
    }
  };

  // Item handlers
  const handleQuantityChange = (index: number, nextQty: number) => {
    if (nextQty < 1) return;
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              quantity: nextQty,
              lineSubtotalPoisha: nextQty * item.unitSalePricePoisha,
            }
          : item
      )
    );
  };

  const handlePriceChange = (index: number, nextTaka: number) => {
    const unitPoisha = Math.max(0, Math.round((nextTaka || 0) * 100));
    setItems((prev) =>
      prev.map((item, idx) =>
        idx === index
          ? {
              ...item,
              unitSalePricePoisha: unitPoisha,
              lineSubtotalPoisha: item.quantity * unitPoisha,
            }
          : item
      )
    );
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
  };

  const handleAddVariant = (variantId: string) => {
    if (!variantId) return;
    // Prevent duplicate variantId: increment quantity if already in order
    const existingIdx = items.findIndex((item) => item.variantId === variantId);
    if (existingIdx >= 0) {
      handleQuantityChange(existingIdx, items[existingIdx].quantity + 1);
      return;
    }
    for (const prod of products) {
      const variant = prod.variants?.find((v) => v.variantId === variantId);
      if (variant) {
        const unitSalePricePoisha = variant.salePricePoisha ?? 0;
        setItems((prev) => [
          ...prev,
          {
            productId: prod.productId ?? '',
            variantId: variant.variantId,
            productNameBn: prod.nameBn ?? 'পণ্য',
            variantTitleBn: variant.titleBn ?? 'ডিফল্ট',
            publicSku: variant.publicSku ?? 'SKU',
            quantity: 1,
            unitSalePricePoisha,
            lineSubtotalPoisha: unitSalePricePoisha,
          },
        ]);
        break;
      }
    }
  };

  // Step 1: Submit a new Advance Payment entry (unverified pending claim)
  const handleSubmitStep1Advance = async () => {
    if (!order?.orderNo) return;
    setPanelFeedback(null);

    const cleanTrx = advTrxId.trim().toUpperCase();
    if (cleanTrx.length < 4) {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'সঠিক Transaction ID (কমপক্ষে ৪ অক্ষর) লিখুন।'
          : 'Please enter a valid Transaction ID (at least 4 characters).',
      });
      return;
    }

    const trimmedAmt = advAmountTaka.trim();
    const parts = trimmedAmt.split('.');
    const isValidDecimalFormat =
      parts.length <= 2 &&
      parts[0].length > 0 &&
      [...parts[0]].every((ch) => ch >= '0' && ch <= '9') &&
      (parts.length === 1 ||
        (parts[1].length >= 1 &&
          parts[1].length <= 2 &&
          [...parts[1]].every((ch) => ch >= '0' && ch <= '9')));
    const amt = Number(trimmedAmt);
    if (
      !isValidDecimalFormat ||
      !Number.isFinite(amt) ||
      !Number.isSafeInteger(Math.round(amt * 100)) ||
      amt <= 0
    ) {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'সঠিক অগ্রিম টাকার পরিমাণ লিখুন।'
          : 'Please enter a valid positive advance amount.',
      });
      return;
    }

    const normPhone = normalizeBdPhone(advSenderPhone || order.customerPhone || '');
    if (!normPhone) {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'প্রেরকের সঠিক ১১ ডিজিটের মোবাইল নম্বর দিন।'
          : 'Please enter a valid 11-digit sender mobile number.',
      });
      return;
    }

    setIsSubmittingAdvance(true);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'input_manual_mfs',
          orderNo: order.orderNo,
          provider: 'bkash',
          senderPhone: normPhone,
          trxId: cleanTrx,
          amountTaka: amt,
          autoVerify: false,
          reviewNoteBn: advNote.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setPanelFeedback({
          type: 'error',
          text:
            data.errorBn ||
            (bn
              ? 'অগ্রিম এন্ট্রি জমা দেওয়া যায়নি।'
              : 'Could not record advance entry.'),
        });
        return;
      }

      const msg = bn
        ? `ধাপ ১ সম্পন্ন: বিকাশ TrxID (${cleanTrx}, ৳${amt}) জমা হয়েছে। নিচের হিস্ট্রি থেকে এখন যাচাই (ধাপ ২) করুন।`
        : `Step 1 recorded: bKash TrxID (${cleanTrx}, ৳${amt}) is now pending Step 2 verification.`;
      setPanelFeedback({ type: 'success', text: msg });
      onFeedback?.({ type: 'success', text: msg });
      setAdvAmountTaka('');
      setAdvTrxId('');
      setAdvNote('');
      setShowAddAdvance(false);
      await onRefreshWorkspace();
    } catch {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।'
          : 'Network error while saving advance entry.',
      });
    } finally {
      setIsSubmittingAdvance(false);
    }
  };

  // Step 2: Verify (Approve) or Reject a pending advance submission
  const handleReviewAdvance = async (
    sub: PendingMfsSubmissionLike,
    decision: 'approved' | 'rejected'
  ) => {
    if (!order?.orderNo) return;
    setPanelFeedback(null);

    const note =
      (reviewNotesByTrx[sub.trxId] ?? '').trim() ||
      (decision === 'approved'
        ? `অ্যাডমিন ডিটেইলস প্যানেল থেকে TrxID ${sub.trxId} যাচাই ও অনুমোদন সম্পন্ন।`
        : `TrxID ${sub.trxId} পাওয়া যায়নি / প্রত্যাখ্যাত।`);
    const overrideText = (overrideReasonByTrx[sub.trxId] ?? '').trim();

    if (
      decision === 'approved' &&
      makerCheckerBlockedTrx[sub.trxId] &&
      overrideText.length < 5
    ) {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'মেকার-চেকার ওভাররাইডের জন্য কমপক্ষে ৫ অক্ষরের স্পষ্ট কারণ লিখুন।'
          : 'Please enter an audited reason (min 5 characters) for self-approval override.',
      });
      return;
    }

    setVerifyingTrx(sub.trxId);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'review_manual_bkash',
          orderNo: order.orderNo,
          trxId: sub.trxId,
          decision,
          reviewNoteBn: note,
          selfApprovalOverrideReasonBn:
            overrideText.length >= 5 ? overrideText : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        if (data?.makerCheckerBlocked) {
          setMakerCheckerBlockedTrx((prev) => ({ ...prev, [sub.trxId]: true }));
          setPanelFeedback({
            type: 'error',
            text: bn
              ? 'মেকার-চেকার নীতি: আপনি নিজেই এই এন্ট্রি জমা দিয়েছেন। নিচে ওভাররাইডের কারণ লিখে অনুমোদন করুন অথবা অন্য অ্যাডমিনকে যাচাই করতে দিন।'
              : 'Maker-checker policy: you submitted this entry. Provide an audited override reason below or let another admin verify it.',
          });
          return;
        }
        setPanelFeedback({
          type: 'error',
          text:
            data.errorBn ||
            (bn
              ? 'পেমেন্ট যাচাই সম্পন্ন করা যায়নি।'
              : 'Could not review advance payment.'),
        });
        return;
      }

      const msg =
        decision === 'approved'
          ? bn
            ? `ধাপ ২ সম্পন্ন: TrxID (${sub.trxId}) ভেরিফাই হয়ে অগ্রিম হিসাবে যুক্ত হয়েছে।`
            : `Step 2 complete: TrxID (${sub.trxId}) verified and credited.`
          : bn
          ? `TrxID (${sub.trxId}) প্রত্যাখ্যাত (Rejected) করা হয়েছে।`
          : `TrxID (${sub.trxId}) rejected.`;
      setMakerCheckerBlockedTrx((prev) => ({ ...prev, [sub.trxId]: false }));
      setPanelFeedback({ type: 'success', text: msg });
      onFeedback?.({ type: 'success', text: msg });
      await onRefreshWorkspace();
    } catch {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।'
          : 'Network error while verifying advance.',
      });
    } finally {
      setVerifyingTrx(null);
    }
  };

  // Master Save Orchestrator: routes each modified domain cleanly through audited endpoints
  const handleSaveAllChanges = async () => {
    if (!order?.orderNo) return;
    setPanelFeedback(null);

    if (canEditCoreOrder && !normalizeBdPhone(customerPhone)) {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'গ্রাহকের ১১ ডিজিটের সঠিক বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 01712345678)।'
          : 'Please enter a valid 11-digit Bangladeshi phone number.',
      });
      return;
    }

    if (liveTotalPoisha < verifiedAdvancePoisha) {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'মোট বিল ইতোমধ্যে যাচাইকৃত অগ্রিমের চেয়ে কম হতে পারবে না।'
          : 'Total payable cannot be less than already verified advance.',
      });
      return;
    }

    const customUrlToPersist = isCustomUrlOverride ? trimmedTrackingUrl : '';
    const trimmedTracking = trackingCode.trim();
    const trimmedCns = consignmentId.trim();
    const trimmedCustomCourier = customCourierName.trim();

    if (trimmedCustomCourier && courierProvider === 'manual' && trimmedCustomCourier.length < 2) {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'কাস্টম কুরিয়ারের নাম কমপক্ষে ২ অক্ষরের হতে হবে।'
          : 'Custom courier name must be at least 2 characters.',
      });
      return;
    }

    if (customUrlToPersist && !isSafeHttpUrl(customUrlToPersist)) {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'ট্র্যাকিং লিংক অবশ্যই সঠিক http:// বা https:// URL হতে হবে।'
          : 'Tracking URL must be a valid http:// or https:// URL.',
      });
      return;
    }

    if (trimmedTracking) {
      const dispatchCheck = validateDispatchInput({
        courierProvider,
        customCourierName: trimmedCustomCourier,
        trackingCode: trimmedTracking,
        consignmentId: trimmedCns,
        customTrackingUrl: customUrlToPersist,
        requireTracking: true,
      });
      if (!dispatchCheck.valid) {
        setPanelFeedback({
          type: 'error',
          text: bn
            ? dispatchCheck.errorBn ?? 'কুরিয়ার ও ট্র্যাকিং তথ্য সঠিক নয়।'
            : dispatchCheck.errorEn ?? 'Invalid courier & tracking info.',
        });
        return;
      }
    }

    const initialProvider = order.courierProvider ?? 'steadfast';
    const initialCustomCourier = (order.customCourierName ?? '').trim();
    const initialTracking = (order.trackingCode ?? '').trim();
    const initialCns = (order.consignmentId ?? '').trim();
    const initialCustomUrl = (order.customTrackingUrl ?? '').trim();
    const initialCallStatus = order.callStatus ?? 'pending';
    const initialCallNote = (order.callStatusNote ?? '').trim();

    const courierTrackingChanged =
      courierProvider !== initialProvider ||
      trimmedCustomCourier !== initialCustomCourier ||
      trimmedTracking !== initialTracking ||
      trimmedCns !== initialCns ||
      customUrlToPersist !== initialCustomUrl;

    const callChanged =
      callStatus !== initialCallStatus ||
      callStatusNote.trim() !== initialCallNote;

    const statusChanged = orderStatus !== (order.status ?? 'pending_confirmation');

    setIsSaving(true);
    try {
      const completedSteps: string[] = [];

      // Step 1: Core order details (Customer, Address, Items, Discount, Delivery, Geo, Notes)
      if (canEditCoreOrder) {
        const corePayload = {
          operation: 'update_full_order' as const,
          orderNo: order.orderNo,
          customerName: customerName.trim(),
          customerPhone: customerPhone.trim(),
          districtId,
          upazilaId,
          streetAddress: streetAddress.trim(),
          landmark: landmark.trim(),
          postCode: postCode.trim() || undefined,
          recipientCity: recipientCity.trim() || undefined,
          recipientZone: recipientZone.trim() || undefined,
          recipientArea: recipientArea.trim() || undefined,
          pathaoStoreName: pathaoStoreName.trim() || undefined,
          pathaoItemType,
          totalWeightGrams,
          bdPostServiceType,
          specialInstruction: specialInstruction.trim(),
          items:
            items.length > 0
              ? items.map((i) => ({
                  productId: i.productId || undefined,
                  variantId: i.variantId,
                  quantity: i.quantity,
                  unitSalePricePoisha: i.unitSalePricePoisha,
                }))
              : undefined,
          discountPoisha: liveDiscountPoisha,
          deliveryChargePoisha: liveDeliveryPoisha,
          // Keep current server workflow fields intact so audited transitions below handle them cleanly
          advancePaidPoisha: verifiedAdvancePoisha,
          paymentMethod,
          paymentStatus: order.paymentStatus ?? 'unpaid',
          manualPaymentTrxId: order.manualPaymentTrxId ?? null,
          courierProvider,
          customCourierName:
            courierProvider === 'manual' ? trimmedCustomCourier || null : null,
          customTrackingUrl: customUrlToPersist || null,
          consignmentId: order.consignmentId ?? null,
          trackingCode: order.trackingCode ?? null,
          status: order.status ?? 'pending_confirmation',
          source: orderSource,
          callStatus: initialCallStatus,
          internalStaffNote: staffNote.trim(),
          addressOverrideReason: overrideReason.trim() || undefined,
        };

        const res = await fetch('/api/admin/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(corePayload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          setPanelFeedback({
            type: 'error',
            text:
              data.errorBn ||
              (bn
                ? 'অর্ডারের মূল তথ্য সংরক্ষণ করা যায়নি।'
                : 'Could not save order details.'),
          });
          return;
        }
        completedSteps.push(bn ? 'অর্ডার তথ্য' : 'order details');
      } else if (canEditOperations) {
        // Non-super-admin staff: update courier meta + staff note
        const metaRes = await fetch('/api/admin/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'update_order_courier_meta',
            orderNo: order.orderNo,
            customerName: customerName.trim(),
            customerPhone: customerPhone.trim(),
            districtId,
            upazilaId,
            streetAddress: streetAddress.trim(),
            landmark: landmark.trim(),
            postCode: postCode.trim() || undefined,
            recipientCity: recipientCity.trim() || undefined,
            recipientZone: recipientZone.trim() || undefined,
            recipientArea: recipientArea.trim() || undefined,
            pathaoStoreName: pathaoStoreName.trim() || undefined,
            pathaoItemType,
            totalWeightGrams,
            bdPostServiceType,
            specialInstruction: specialInstruction.trim(),
            courierProvider,
            customCourierName:
              courierProvider === 'manual' ? trimmedCustomCourier || null : null,
            customTrackingUrl: customUrlToPersist || null,
            autoSyncGeo: false,
          }),
        });
        const metaData = await metaRes.json();
        if (!metaRes.ok || !metaData.success) {
          setPanelFeedback({
            type: 'error',
            text:
              metaData.errorBn ||
              (bn
                ? 'কুরিয়ার ও ঠিকানা তথ্য সংরক্ষণ করা যায়নি।'
                : 'Could not save courier & address info.'),
          });
          return;
        }
        if (staffNote.trim() !== (order.internalStaffNote ?? '').trim()) {
          await fetch('/api/admin/workspace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              operation: 'order_grid_action',
              orderNos: [order.orderNo],
              actionType: 'add_staff_note',
              staffNote: staffNote.trim(),
            }),
          });
        }
        completedSteps.push(bn ? 'কুরিয়ার ও নোট' : 'courier & notes');
      }

      // Step 2: Attach/Update Courier Tracking (must happen BEFORE moving packed -> shipped)
      if (canEditOperations && courierTrackingChanged && trimmedTracking) {
        const trackRes = await fetch('/api/admin/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'order_grid_action',
            orderNos: [order.orderNo],
            actionType: 'attach_tracking',
            courierProvider,
            customCourierName:
              courierProvider === 'manual' ? trimmedCustomCourier : null,
            trackingCode: trimmedTracking,
            consignmentId: trimmedCns || undefined,
            customTrackingUrl: customUrlToPersist || null,
          }),
        });
        const trackData = await trackRes.json();
        const firstTrackResult = trackData?.results?.[0];
        if (!trackRes.ok || !trackData.success || (firstTrackResult && !firstTrackResult.ok)) {
          setPanelFeedback({
            type: 'error',
            text:
              firstTrackResult?.messageBn ||
              trackData.errorBn ||
              (bn
                ? 'কুরিয়ার ট্র্যাকিং সংরক্ষণ করা যায়নি।'
                : 'Could not save courier tracking.'),
          });
          await onRefreshWorkspace();
          return;
        }
        completedSteps.push(bn ? 'কুরিয়ার ট্র্যাকিং' : 'courier tracking');
      }

      // Step 3: Call Outcome Logging
      let statusAfterCall: OrderStatus = order.status ?? 'pending_confirmation';
      if (canEditOperations && callChanged && callStatus !== 'pending') {
        const callRes = await fetch('/api/admin/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'order_grid_action',
            orderNos: [order.orderNo],
            actionType: 'log_call_status',
            callStatus,
            callStatusNote: callStatusNote.trim() || undefined,
            staffNote: staffNote.trim() || undefined,
          }),
        });
        const callData = await callRes.json();
        const firstCallResult = callData?.results?.[0];
        if (!callRes.ok || !callData.success || (firstCallResult && !firstCallResult.ok)) {
          setPanelFeedback({
            type: 'error',
            text:
              firstCallResult?.messageBn ||
              callData.errorBn ||
              (bn ? 'কল স্ট্যাটাস সংরক্ষণ করা যায়নি।' : 'Could not log call status.'),
          });
          await onRefreshWorkspace();
          return;
        }
        if (callStatus === 'confirmed_yes' && statusAfterCall === 'pending_confirmation') {
          statusAfterCall = 'confirmed';
        } else if (callStatus === 'cancelled_no') {
          statusAfterCall = 'cancelled';
        }
        completedSteps.push(bn ? 'কল ফলাফল' : 'call outcome');
      }

      // Step 4: Order Status Transition (if still different from target)
      if (canEditOperations && statusChanged && orderStatus !== statusAfterCall) {
        const stRes = await fetch('/api/admin/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'order_grid_action',
            orderNos: [order.orderNo],
            actionType: 'update_status',
            newStatus: orderStatus,
            staffNote: staffNote.trim() || undefined,
          }),
        });
        const stData = await stRes.json();
        const firstStResult = stData?.results?.[0];
        if (!stRes.ok || !stData.success || (firstStResult && !firstStResult.ok)) {
          setPanelFeedback({
            type: 'error',
            text:
              firstStResult?.messageBn ||
              stData.errorBn ||
              (bn
                ? 'অর্ডার স্ট্যাটাস পরিবর্তন করা যায়নি।'
                : 'Could not update order status.'),
          });
          await onRefreshWorkspace();
          return;
        }
        completedSteps.push(bn ? 'অর্ডার স্ট্যাটাস' : 'order status');
      }

      const successText = bn
        ? `${order.orderNo}: সব পরিবর্তন (${completedSteps.join(', ')}) সফলভাবে সংরক্ষিত হয়েছে।`
        : `${order.orderNo}: saved changes (${completedSteps.join(', ')}).`;
      setPanelFeedback({ type: 'success', text: successText });
      onFeedback?.({ type: 'success', text: successText });
      await onRefreshWorkspace();
    } catch {
      setPanelFeedback({
        type: 'error',
        text: bn
          ? 'সার্ভারের সাথে সংযোগ স্থাপন করা যায়নি।'
          : 'Failed to connect to server.',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const customerTrackingLink = order ? getOrderStatusUrl(order) : undefined;
  const currentStatusMeta = order?.status ? ORDER_STATUS_META[order.status] : null;
  const paymentStatusLabel =
    PAYMENT_STATUS_LABELS[order?.paymentStatus ?? 'unpaid'] ??
    PAYMENT_STATUS_LABELS.unpaid;
  const bdCarrier = detectBdCarrier(customerPhone);

  return (
    <ResponsiveSheet
      open={Boolean(order)}
      onOpenChange={(open) => {
        if (!open && !isSaving) onClose();
      }}
      size="wide"
      title={
        order?.orderNo
          ? bn
            ? `অর্ডার ডিটেইলস ও এডিটর — ${order.orderNo}`
            : `Order Details & Editor — ${order.orderNo}`
          : bn
          ? 'অর্ডার ডিটেইলস'
          : 'Order Details'
      }
      description={
        order
          ? `${formatDateTime(order.createdAt, locale)} · ${
              currentStatusMeta
                ? bn
                  ? currentStatusMeta.bn
                  : currentStatusMeta.en
                : order.status
            } · ${bn ? 'কল' : 'Calls'}: ${formatLocaleNumber(
              order.callAttempts ?? 0,
              locale
            )}`
          : undefined
      }
      footer={
        order && (
          <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono tabular-nums">
              <span className="text-muted">
                {bn ? 'মোট:' : 'Total:'}{' '}
                <strong className="text-ink">
                  {formatPoishaToBdt(liveTotalPoisha, locale)}
                </strong>
              </span>
              <span className="text-muted">
                {bn ? 'অগ্রিম:' : 'Paid:'}{' '}
                <strong className="text-emerald-700 dark:text-emerald-400">
                  {formatPoishaToBdt(verifiedAdvancePoisha, locale)}
                </strong>
              </span>
              <span className="text-muted">
                {bn ? 'বাকি (COD):' : 'Due:'}{' '}
                <strong className="text-ink">
                  {liveDuePoisha === 0
                    ? bn
                      ? 'পরিশোধিত'
                      : 'Paid'
                    : formatPoishaToBdt(liveDuePoisha, locale)}
                </strong>
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={isSaving}
                onClick={onClose}
                className="min-h-[38px] px-3.5 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:bg-surface font-medium cursor-pointer disabled:opacity-50"
              >
                {bn ? 'বন্ধ করুন' : 'Close'}
              </button>
              {canEditOperations && (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void handleSaveAllChanges()}
                  className="min-h-[38px] px-4 py-1.5 rounded-[var(--radius-sm)] bg-ink text-bg hover:opacity-90 font-semibold inline-flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      <span>{bn ? 'সংরক্ষণ হচ্ছে...' : 'Saving...'}</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>
                        {bn ? 'সব পরিবর্তন সংরক্ষণ করুন' : 'Save All Changes'}
                      </span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )
      }
    >
      {order && livePaymentSummary && (
        <div className="space-y-5 text-xs">
          {/* Top Quick Action Bar + 4-Metric Financial Snapshot */}
          <div className="p-4 border border-border rounded-[var(--radius-md)] bg-surface space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-muted">
                <span className="font-mono font-bold text-sm text-ink">
                  {order.orderNo}
                </span>
                <span aria-hidden="true">·</span>
                <span>{orderSource}</span>
                <span aria-hidden="true">·</span>
                <span>
                  {bn ? paymentStatusLabel.bn : paymentStatusLabel.en}
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono">
                  {bn ? 'রিস্ক' : 'Risk'}: {order.riskScore ?? 0}
                </span>
              </div>

              {/* Direct Call, Message, Print actions right inside Details */}
              <div className="flex items-center gap-1.5">
                {!isVendor && order.customerPhone && (
                  <a
                    href={`tel:${order.customerPhone}`}
                    onClick={() => {
                      if (order.orderNo) onLogCall(order.orderNo);
                    }}
                    className="min-h-[34px] px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:border-ink inline-flex items-center gap-1.5 font-medium whitespace-nowrap"
                  >
                    <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{bn ? 'কল' : 'Call'}</span>
                  </a>
                )}
                {!isVendor && (
                  <button
                    type="button"
                    onClick={() => onOpenMessage(order)}
                    className="min-h-[34px] px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:border-ink inline-flex items-center gap-1.5 font-medium cursor-pointer whitespace-nowrap"
                  >
                    <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{bn ? 'মেসেজ' : 'Message'}</span>
                  </button>
                )}
                {order.orderNo && (
                  <button
                    type="button"
                    onClick={() => onOpenPrint(order.orderNo!)}
                    className="min-h-[34px] px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:border-ink inline-flex items-center gap-1.5 font-medium cursor-pointer whitespace-nowrap"
                  >
                    <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{bn ? 'প্রিন্ট' : 'Print'}</span>
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-3 border-t border-border/70 font-mono tabular-nums">
              <div>
                <span className="block font-sans text-[11px] text-muted">
                  {bn ? 'মোট বিল' : 'Total Payable'}
                </span>
                <span className="text-sm font-bold text-ink">
                  {formatPoishaToBdt(liveTotalPoisha, locale)}
                </span>
              </div>
              <div>
                <span className="block font-sans text-[11px] text-muted">
                  {bn ? 'যাচাইকৃত অগ্রিম' : 'Verified Advance'}
                </span>
                <span className="text-sm font-bold text-emerald-700 dark:text-emerald-400">
                  {formatPoishaToBdt(verifiedAdvancePoisha, locale)}
                </span>
              </div>
              <div>
                <span className="block font-sans text-[11px] text-muted">
                  {bn ? 'বাকি (COD)' : 'Due (COD)'}
                </span>
                <span className="text-sm font-bold text-ink">
                  {liveDuePoisha === 0
                    ? bn
                      ? 'পরিশোধিত (৳০)'
                      : 'Paid (৳0)'
                    : formatPoishaToBdt(liveDuePoisha, locale)}
                </span>
              </div>
              <div>
                <span className="block font-sans text-[11px] text-muted">
                  {bn ? 'পেন্ডিং দাবি' : 'Pending Claim'}
                </span>
                <span
                  className={`text-sm font-bold ${
                    livePaymentSummary.pendingClaimPoisha > 0
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-muted'
                  }`}
                >
                  {livePaymentSummary.pendingClaimPoisha > 0
                    ? formatPoishaToBdt(livePaymentSummary.pendingClaimPoisha, locale)
                    : bn
                    ? 'নেই'
                    : 'None'}
                </span>
              </div>
            </div>
          </div>

          {/* Inline Feedback Banner inside Details Panel */}
          {panelFeedback && (
            <div
              role={panelFeedback.type === 'error' ? 'alert' : 'status'}
              className={`p-3 rounded-[var(--radius-sm)] border flex items-start justify-between gap-2 text-xs font-medium ${
                panelFeedback.type === 'error'
                  ? 'border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400'
                  : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
              }`}
            >
              <span>{panelFeedback.text}</span>
              <button
                type="button"
                onClick={() => setPanelFeedback(null)}
                aria-label={bn ? 'বার্তা বন্ধ করুন' : 'Dismiss'}
                className="shrink-0 opacity-75 hover:opacity-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}

          {isClosedOrder && (
            <div className="p-3 rounded-[var(--radius-sm)] border border-border bg-surface text-muted text-xs">
              {bn
                ? 'এই অর্ডারটি বাতিল বা রিটার্ন সম্পন্ন অবস্থায় আছে, তাই তথ্য রিড-অনলি হিসেবে দেখানো হচ্ছে।'
                : 'This order is cancelled or returned and is shown in read-only mode.'}
            </div>
          )}

          {/* =================================================================
              SECTION 1: MERGED PAYMENT/ADVANCE & COURIER/TRACKING HUB
             ================================================================= */}
          <section
            ref={paymentCourierSectionRef}
            className="p-4 border border-border rounded-[var(--radius-md)] bg-bg space-y-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
              <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                <Wallet className="w-4 h-4 text-ink shrink-0" aria-hidden="true" />
                <span>
                  {bn
                    ? '১. পেমেন্ট, অগ্রিম ও কুরিয়ার হাব'
                    : '1. Payment, Advance & Courier Hub'}
                </span>
              </h3>
              <span className="text-[11px] text-muted">
                {bn
                  ? 'অগ্রিম ইতিহাস (২-ধাপ যাচাই) এবং কুরিয়ার ও ট্র্যাকিং একসাথে'
                  : 'Advance ledger (2-step verify) + courier & tracking'}
              </span>
            </div>

            {/* Part A: Payment & Advance Ledger */}
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-ink">
                  {bn ? 'পেমেন্ট ও অগ্রিম হিসাব' : 'Payment & Advance Accounting'}
                </h4>
                {canEditOperations && liveDuePoisha > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowAddAdvance((prev) => !prev)}
                    className="min-h-[32px] px-2.5 py-1 rounded-[var(--radius-sm)] border border-ink bg-bg text-ink hover:bg-ink hover:text-bg text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap"
                  >
                    {showAddAdvance
                      ? bn
                        ? 'এন্ট্রি ফর্ম বন্ধ করুন'
                        : 'Hide Advance Form'
                      : bn
                      ? '+ নতুন অগ্রিম এন্ট্রি (ধাপ ১)'
                      : '+ Record Advance (Step 1)'}
                  </button>
                )}
              </div>

              {/* Editable Billing Controls: Discount, Delivery Charge, Payment Method */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="order-edit-discount"
                    className="block text-[11px] font-semibold text-ink"
                  >
                    {bn ? 'বিশেষ ছাড় / ডিসকাউন্ট (৳)' : 'Special Discount (৳)'}
                  </label>
                  <input
                    id="order-edit-discount"
                    type="number"
                    min={0}
                    disabled={!canEditCoreOrder}
                    value={discountTaka}
                    onChange={(e) =>
                      setDiscountTaka(Math.max(0, parseInt(e.target.value, 10) || 0))
                    }
                    className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono font-semibold text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="order-edit-delivery"
                    className="block text-[11px] font-semibold text-ink"
                  >
                    {bn ? 'ডেলিভারি চার্জ (৳)' : 'Delivery Charge (৳)'}
                  </label>
                  <input
                    id="order-edit-delivery"
                    type="number"
                    min={0}
                    disabled={!canEditCoreOrder}
                    value={deliveryChargeTaka}
                    onChange={(e) =>
                      setDeliveryChargeTaka(
                        Math.max(0, parseInt(e.target.value, 10) || 0)
                      )
                    }
                    className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono font-semibold text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                  />
                  {canEditCoreOrder && (
                    <div className="flex items-center gap-1 pt-0.5">
                      {[
                        { label: bn ? 'ফ্রি ৳০' : 'Free ৳0', val: 0 },
                        { label: bn ? 'ঢাকা ৳৭০' : 'Dhaka ৳70', val: 70 },
                        { label: bn ? 'বাইরে ৳১২০' : 'Outside ৳120', val: 120 },
                      ].map((preset) => (
                        <button
                          key={preset.val}
                          type="button"
                          onClick={() => setDeliveryChargeTaka(preset.val)}
                          className="px-1.5 py-0.5 rounded-[var(--radius-sm)] border border-border bg-bg text-[10px] text-muted hover:text-ink hover:border-ink cursor-pointer"
                        >
                          {preset.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="order-edit-payment-method"
                    className="block text-[11px] font-semibold text-ink"
                  >
                    {bn ? 'পেমেন্ট মেথড' : 'Payment Method'}
                  </label>
                  <select
                    id="order-edit-payment-method"
                    disabled={!canEditCoreOrder}
                    value={paymentMethod}
                    onChange={(e) =>
                      setPaymentMethod(e.target.value as PaymentMethod)
                    }
                    className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                  >
                    <option value="cod">
                      {bn ? 'ক্যাশ অন ডেলিভারি (COD)' : 'Cash on Delivery (COD)'}
                    </option>
                    <option value="bkash_manual">
                      {bn ? 'বিকাশ ম্যানুয়াল (bKash)' : 'bKash Manual'}
                    </option>
                  </select>
                </div>
              </div>

              {/* Step 1: Inline Advance Entry Form */}
              {showAddAdvance && canEditOperations && (
                <div className="p-3.5 border border-ink/40 rounded-[var(--radius-sm)] bg-surface space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold text-ink text-xs">
                      {bn
                        ? 'ধাপ ১: নতুন অগ্রিম পেমেন্ট এন্ট্রি দিন (বিকাশ)'
                        : 'Step 1: Record New Advance Entry (bKash)'}
                    </p>
                    <span className="text-[11px] text-muted font-mono tabular-nums">
                      {bn ? 'সর্বোচ্চ বকেয়া:' : 'Max due:'}{' '}
                      {formatPoishaToBdt(liveDuePoisha, locale)}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <div className="space-y-1">
                      <label
                        htmlFor="adv-amount"
                        className="block text-[11px] font-medium text-ink"
                      >
                        {bn ? 'অগ্রিম পরিমাণ (৳) *' : 'Advance Amount (৳) *'}
                      </label>
                      <input
                        id="adv-amount"
                        type="number"
                        min="1"
                        step="0.01"
                        value={advAmountTaka}
                        onChange={(e) => setAdvAmountTaka(e.target.value)}
                        placeholder={bn ? 'যেমন: 150' : 'e.g. 150'}
                        className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-bg text-ink font-mono text-xs focus:outline-none focus:border-ink"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="adv-trx"
                        className="block text-[11px] font-medium text-ink"
                      >
                        {bn ? 'বিকাশ TrxID *' : 'bKash TrxID *'}
                      </label>
                      <input
                        id="adv-trx"
                        type="text"
                        value={advTrxId}
                        onChange={(e) => setAdvTrxId(e.target.value.toUpperCase())}
                        placeholder="BL8K9M2P10"
                        className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-bg text-ink font-mono text-xs focus:outline-none focus:border-ink"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="adv-phone"
                        className="block text-[11px] font-medium text-ink"
                      >
                        {bn ? 'প্রেরকের নম্বর *' : 'Sender Phone *'}
                      </label>
                      <input
                        id="adv-phone"
                        type="text"
                        value={advSenderPhone}
                        onChange={(e) => setAdvSenderPhone(e.target.value)}
                        placeholder="017XXXXXXXX"
                        className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-bg text-ink font-mono text-xs focus:outline-none focus:border-ink"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                    <input
                      id="adv-note"
                      type="text"
                      aria-label={bn ? 'অগ্রিম পেমেন্ট মন্তব্য (ঐচ্ছিক)' : 'Advance payment optional note'}
                      value={advNote}
                      onChange={(e) => setAdvNote(e.target.value)}
                      placeholder={
                        bn
                          ? 'মন্তব্য (ঐচ্ছিক, যেমন: বিকাশ পার্সোনাল নম্বরে সেন্ড মানি)'
                          : 'Optional note (e.g. bKash Send Money)'
                      }
                      className="flex-1 min-h-[44px] sm:min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-bg text-ink text-xs focus:outline-none focus:border-ink"
                    />
                    <button
                      type="button"
                      disabled={isSubmittingAdvance}
                      onClick={() => void handleSubmitStep1Advance()}
                      className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-[var(--radius-sm)] bg-ink text-bg hover:opacity-90 font-semibold text-xs inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                    >
                      {isSubmittingAdvance && (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      )}
                      <span>
                        {bn ? 'অগ্রিম এন্ট্রি জমা দিন' : 'Submit Advance Entry'}
                      </span>
                    </button>
                  </div>

                  <p className="text-[11px] text-muted">
                    {bn
                      ? 'জমা দেওয়ার পর এটি "যাচাই বাকি" অবস্থায় নিচের অগ্রিম হিস্ট্রিতে আসবে—ভেরিফাই (ধাপ ২) করলে তবেই COD থেকে বাদ যাবে।'
                      : 'Submitted entries appear as pending below and only deduct from COD after Step 2 verification.'}
                  </p>
                </div>
              )}

              {/* Advance Payment History Ledger (How much, How, When, Sender, Verification) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-muted">
                    {bn
                      ? 'অগ্রিম পেমেন্ট হিস্ট্রি (কত টাকা · কীভাবে · কখন · যাচাই)'
                      : 'Advance Payment History (Amount · Method · When · Verification)'}
                  </span>
                  <span className="font-mono text-[11px] text-muted tabular-nums">
                    {formatLocaleNumber(orderSubmissions.length, locale)}{' '}
                    {bn ? 'টি রেকর্ড' : 'records'}
                  </span>
                </div>

                {orderSubmissions.length === 0 ? (
                  <div className="py-3 px-3 border border-border/80 rounded-[var(--radius-sm)] bg-surface/50 text-muted text-[11px] flex flex-wrap items-center justify-between gap-2">
                    <span>
                      {verifiedAdvancePoisha > 0
                        ? bn
                          ? `অর্ডারে ${formatPoishaToBdt(
                              verifiedAdvancePoisha,
                              locale
                            )} অগ্রিম পরিশোধিত আছে${
                              order.manualPaymentTrxId
                                ? ` (TrxID: ${order.manualPaymentTrxId})`
                                : ''
                            }।`
                          : `Order has ${formatPoishaToBdt(
                              verifiedAdvancePoisha,
                              locale
                            )} verified advance${
                              order.manualPaymentTrxId
                                ? ` (TrxID: ${order.manualPaymentTrxId})`
                                : ''
                            }.`
                        : bn
                        ? 'এই অর্ডারে এখনো কোনো অগ্রিম পেমেন্ট জমা হয়নি (সম্পূর্ণ COD)।'
                        : 'No advance payment recorded yet (full COD).'}
                    </span>
                    {order.manualPaymentTrxId && verifiedAdvancePoisha === 0 && (
                      <span className="font-mono text-amber-700 dark:text-amber-400">
                        TrxID: {order.manualPaymentTrxId}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="divide-y divide-border border border-border rounded-[var(--radius-sm)] bg-surface/40">
                    {orderSubmissions.map((sub) => {
                      const statusMeta = SUBMISSION_STATUS_LABELS[sub.status] ?? {
                        bn: sub.status,
                        en: sub.status,
                        toneClass: 'text-muted',
                      };
                      const isPending =
                        sub.status === 'pending_verification' ||
                        sub.status === 'submitted' ||
                        sub.status === 'under_review';
                      const isBusyRow = verifyingTrx === sub.trxId;
                      const needsOverride = Boolean(makerCheckerBlockedTrx[sub.trxId]);

                      return (
                        <div
                          key={sub.submissionId ?? `${sub.orderNo}-${sub.trxId}`}
                          className="p-3 space-y-2"
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-mono font-bold text-sm text-ink tabular-nums">
                                {formatPoishaToBdt(sub.submittedAmountPoisha, locale)}
                              </span>
                              <span className="text-muted" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-semibold text-ink uppercase">
                                {sub.provider ?? 'bkash'}
                              </span>
                              <span className="text-muted" aria-hidden="true">
                                ·
                              </span>
                              <span className="font-mono font-semibold text-ink select-all">
                                {sub.trxId}
                              </span>
                              <button
                                type="button"
                                onClick={() => void handleCopyText(`trx-${sub.trxId}`, sub.trxId)}
                                className="text-muted hover:text-ink cursor-pointer inline-flex items-center"
                                title={bn ? 'TrxID কপি করুন' : 'Copy TrxID'}
                              >
                                {copiedKey === `trx-${sub.trxId}` ? (
                                  <Check className="w-3 h-3 text-emerald-600" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </button>
                            </div>
                            <span
                              className={`text-[11px] font-semibold ${statusMeta.toneClass}`}
                            >
                              {bn ? statusMeta.bn : statusMeta.en}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
                            <span>
                              {bn ? 'প্রেরক:' : 'From:'}{' '}
                              <span className="font-mono text-ink">
                                {sub.senderPhone || sub.senderPhoneMasked || '—'}
                              </span>
                              {sub.senderPhoneMatchesOrderPhone === false && (
                                <span className="text-amber-700 dark:text-amber-400 ml-1">
                                  ({bn ? 'অর্ডার নম্বরের সাথে ভিন্ন' : 'differs from order phone'})
                                </span>
                              )}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>
                              {bn ? 'জমার সময়:' : 'Submitted:'}{' '}
                              <span className="font-mono text-ink">
                                {formatDateTime(sub.submittedAt, locale)}
                              </span>
                            </span>
                            {sub.submittedByUsername && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {bn ? 'এন্ট্রি:' : 'By:'} {sub.submittedByUsername}
                                </span>
                              </>
                            )}
                          </div>

                          {(sub.reviewedByUsername || sub.reviewNoteBn) && (
                            <div className="text-[11px] text-muted pt-1 border-t border-border/50 flex flex-wrap items-center gap-x-3 gap-y-1">
                              {sub.reviewedByUsername && (
                                <span>
                                  <ShieldCheck
                                    className="w-3 h-3 inline mr-1 text-emerald-600"
                                    aria-hidden="true"
                                  />
                                  {bn ? 'যাচাইকারী:' : 'Reviewed by:'}{' '}
                                  <strong className="text-ink">
                                    {sub.reviewedByUsername}
                                  </strong>
                                  {sub.reviewedAt
                                    ? ` (${formatDateTime(sub.reviewedAt, locale)})`
                                    : ''}
                                </span>
                              )}
                              {sub.reviewNoteBn && (
                                <span className="text-ink">
                                  {bn ? 'নোট:' : 'Note:'} {sub.reviewNoteBn}
                                </span>
                              )}
                            </div>
                          )}

                          {/* Step 2 Inline Verification Controls */}
                          {isPending && canEditOperations && (
                            <div className="pt-2 border-t border-border/60 space-y-2">
                              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                                <input
                                  type="text"
                                  value={reviewNotesByTrx[sub.trxId] ?? ''}
                                  onChange={(e) =>
                                    setReviewNotesByTrx((prev) => ({
                                      ...prev,
                                      [sub.trxId]: e.target.value,
                                    }))
                                  }
                                  placeholder={
                                    bn
                                      ? 'যাচাই নোট (যেমন: বিকাশ অ্যাপে SMS মিলিয়ে পাওয়া গেছে)'
                                      : 'Verification note (e.g. matched in bKash SMS)'
                                  }
                                  className="flex-1 min-h-[34px] px-2.5 py-1 border border-border rounded-[var(--radius-sm)] bg-bg text-ink text-xs focus:outline-none focus:border-ink"
                                />
                                <div className="flex items-center gap-1.5">
                                  <button
                                    type="button"
                                    disabled={isBusyRow}
                                    onClick={() =>
                                      void handleReviewAdvance(sub, 'approved')
                                    }
                                    className="min-h-[34px] px-3 py-1 rounded-[var(--radius-sm)] bg-emerald-700 hover:bg-emerald-800 text-white font-semibold text-xs inline-flex items-center gap-1 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                  >
                                    {isBusyRow ? (
                                      <RefreshCw
                                        className="w-3 h-3 animate-spin"
                                        aria-hidden="true"
                                      />
                                    ) : (
                                      <Check className="w-3.5 h-3.5" aria-hidden="true" />
                                    )}
                                    <span>
                                      {bn ? 'ভেরিফাই (ধাপ ২)' : 'Verify (Step 2)'}
                                    </span>
                                  </button>
                                  <button
                                    type="button"
                                    disabled={isBusyRow}
                                    onClick={() =>
                                      void handleReviewAdvance(sub, 'rejected')
                                    }
                                    className="min-h-[34px] px-2.5 py-1 rounded-[var(--radius-sm)] border border-rose-500/40 bg-bg text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 font-semibold text-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                  >
                                    {bn ? 'প্রত্যাখ্যান' : 'Reject'}
                                  </button>
                                </div>
                              </div>

                              {needsOverride && isSuperAdmin && (
                                <div className="p-2.5 border border-amber-500/40 bg-amber-500/10 rounded-[var(--radius-sm)] space-y-2">
                                  <p className="text-[11px] font-medium text-amber-800 dark:text-amber-300">
                                    {bn
                                      ? 'আপনি নিজেই এন্ট্রিটি জমা দিয়েছেন। সুপার অ্যাডমিন হিসেবে অডিট লগসহ অনুমোদন করতে কারণ লিখুন (কমপক্ষে ৫ অক্ষর):'
                                      : 'You submitted this entry. Enter an audited reason (min 5 chars) to override as Super Admin:'}
                                  </p>
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <input
                                      type="text"
                                      value={overrideReasonByTrx[sub.trxId] ?? ''}
                                      onChange={(e) =>
                                        setOverrideReasonByTrx((prev) => ({
                                          ...prev,
                                          [sub.trxId]: e.target.value,
                                        }))
                                      }
                                      placeholder={
                                        bn
                                          ? 'যেমন: একক অপারেটর শিফটে বিকাশ স্টেটমেন্ট যাচাই করা হয়েছে'
                                          : 'e.g. Solo operator shift, verified against bKash statement'
                                      }
                                      className="flex-1 min-h-[34px] px-2.5 py-1 border border-border rounded-[var(--radius-sm)] bg-bg text-ink text-xs"
                                    />
                                    <button
                                      type="button"
                                      disabled={isBusyRow}
                                      onClick={() =>
                                        void handleReviewAdvance(sub, 'approved')
                                      }
                                      className="min-h-[34px] px-3 py-1 rounded-[var(--radius-sm)] bg-ink text-bg font-semibold text-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
                                    >
                                      {bn ? 'কারণসহ ভেরিফাই করুন' : 'Approve with Reason'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Hairline divider merging Payment/Advance & Courier cleanly */}
            <div className="border-t border-border pt-4 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-ink flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-ink" aria-hidden="true" />
                  <span>
                    {bn
                      ? 'কুরিয়ার, ট্র্যাকিং ও ডেলিভারি জিও'
                      : 'Courier, Tracking & Delivery Geo'}
                  </span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowGeoDetails((prev) => !prev)}
                  className="text-[11px] font-medium text-ink underline hover:opacity-80 cursor-pointer"
                >
                  {showGeoDetails
                    ? bn
                      ? 'পোস্টকোড ও Pathao জোন লুকান'
                      : 'Hide PostCode & Pathao Geo'
                    : bn
                    ? 'পোস্টকোড, ওজন ও Pathao জোন এডিট করুন'
                    : 'Edit PostCode, Weight & Pathao Geo'}
                </button>
              </div>

              {order.courierReadiness && !order.courierReadiness.isReady && (
                <div className="p-2.5 border border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400 rounded-[var(--radius-sm)] flex items-start gap-2 text-[11px] font-medium">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{order.courierReadiness.summaryBn}</span>
                </div>
              )}

              {/* Courier Provider Segmented Selector */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {COURIER_OPTIONS.map((opt) => {
                  const active = courierProvider === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      disabled={!canEditOperations}
                      onClick={() => {
                        setCourierProvider(opt.key);
                        setUrlManuallyEdited(false);
                      }}
                      className={`min-h-[36px] px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-xs font-semibold transition-colors cursor-pointer disabled:opacity-60 whitespace-nowrap ${
                        active
                          ? 'bg-ink text-bg border-ink'
                          : 'bg-surface text-ink border-border hover:border-ink'
                      }`}
                    >
                      {bn ? opt.labelBn : opt.labelEn}
                    </button>
                  );
                })}
              </div>

              {/* Custom Courier Name & Presets */}
              {courierProvider === 'manual' && (
                <div className="space-y-2">
                  <label
                    htmlFor="details-custom-courier"
                    className="block text-[11px] font-semibold text-ink"
                  >
                    {bn ? 'কাস্টম কুরিয়ারের নাম *' : 'Custom Courier Name *'}
                  </label>
                  <input
                    id="details-custom-courier"
                    type="text"
                    disabled={!canEditOperations}
                    value={customCourierName}
                    onChange={(e) => setCustomCourierName(e.target.value)}
                    placeholder={
                      bn
                        ? 'যেমন: সুন্দরবন কুরিয়ার, এস.এ পরিবহন, লোকাল রাইডার'
                        : 'e.g. Sundarban Courier, SA Paribahan, Local Rider'
                    }
                    className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs focus:outline-none focus:border-ink"
                  />
                  {canEditOperations && (
                    <div className="flex flex-wrap gap-1.5">
                      {CUSTOM_COURIER_PRESETS.map((preset) => {
                        const label = bn ? preset.bn : preset.en;
                        const selected = customCourierName.trim() === label;
                        return (
                          <button
                            key={preset.en}
                            type="button"
                            onClick={() => setCustomCourierName(label)}
                            className={`px-2 py-1 rounded-[var(--radius-sm)] border text-[11px] cursor-pointer transition-colors ${
                              selected
                                ? 'bg-ink text-bg border-ink font-semibold'
                                : 'bg-bg text-muted border-border hover:text-ink hover:border-ink'
                            }`}
                          >
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Editable Tracking Code & Consignment ID */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="details-tracking-code"
                    className="block text-[11px] font-semibold text-ink"
                  >
                    {bn ? 'ট্র্যাকিং কোড / রসিদ নম্বর' : 'Tracking Code'}
                  </label>
                  <input
                    id="details-tracking-code"
                    type="text"
                    disabled={!canEditOperations}
                    value={trackingCode}
                    onChange={(e) => setTrackingCode(e.target.value.toUpperCase())}
                    placeholder={
                      courierProvider === 'steadfast'
                        ? 'SF-123456'
                        : courierProvider === 'pathao'
                        ? 'PT-987654'
                        : 'SB-2026-001'
                    }
                    className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono font-semibold text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="details-consignment-id"
                    className="block text-[11px] font-semibold text-ink"
                  >
                    {bn ? 'কনসাইনমেন্ট আইডি (Consignment ID)' : 'Consignment ID'}
                  </label>
                  <input
                    id="details-consignment-id"
                    type="text"
                    disabled={!canEditOperations}
                    value={consignmentId}
                    onChange={(e) => setConsignmentId(e.target.value)}
                    placeholder="CNS-ORD-XXXXXX"
                    className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                  />
                </div>
              </div>

              {/* Editable Tracking Link */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label
                    htmlFor="details-tracking-url"
                    className="text-[11px] font-semibold text-ink inline-flex items-center gap-1"
                  >
                    <Link2 className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                    <span>
                      {bn ? 'কুরিয়ার ট্র্যাকিং লিংক (এডিটযোগ্য)' : 'Courier Tracking URL (Editable)'}
                    </span>
                  </label>
                  {suggestedOfficialUrl &&
                    trackingUrl !== suggestedOfficialUrl &&
                    canEditOperations && (
                      <button
                        type="button"
                        onClick={() => {
                          setTrackingUrl(suggestedOfficialUrl);
                          setUrlManuallyEdited(false);
                        }}
                        className="text-[11px] text-ink underline cursor-pointer"
                      >
                        {bn ? 'অটো লিংক বসান' : 'Use auto link'}
                      </button>
                    )}
                </div>
                <input
                  id="details-tracking-url"
                  type="url"
                  disabled={!canEditOperations}
                  value={trackingUrl}
                  onChange={(e) => {
                    setTrackingUrl(e.target.value);
                    setUrlManuallyEdited(true);
                  }}
                  placeholder={suggestedOfficialUrl ?? 'https://...'}
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                  {previewTrackingUrl ? (
                    <a
                      href={previewTrackingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-ink hover:underline truncate max-w-[75%]"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                      <span className="truncate font-mono">{previewTrackingUrl}</span>
                    </a>
                  ) : (
                    <span>
                      {bn
                        ? 'ট্র্যাকিং কোড দিলে অফিসিয়াল লিংক অটো তৈরি হবে বা কাস্টম লিংক পেস্ট করুন।'
                        : 'Enter a tracking code for auto-link or paste a custom URL.'}
                    </span>
                  )}

                  {previewTrackingUrl && (
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyText('courier-url', previewTrackingUrl)
                      }
                      className="inline-flex items-center gap-1 text-ink hover:underline cursor-pointer whitespace-nowrap"
                    >
                      {copiedKey === 'courier-url' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>{bn ? 'কপি হয়েছে' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{bn ? 'লিংক কপি' : 'Copy link'}</span>
                        </>
                      )}
                    </button>
                  )}
                </div>

                {customerTrackingLink && (
                  <div className="pt-1.5 border-t border-border/60 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                    <div className="truncate max-w-[78%]">
                      <span>
                        {bn ? 'গ্রাহক স্ট্যাটাস পেজ: ' : 'Customer tracking page: '}
                      </span>
                      <a
                        href={customerTrackingLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-ink hover:underline"
                      >
                        {customerTrackingLink}
                      </a>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopyText('customer-url', customerTrackingLink)
                      }
                      className="inline-flex items-center gap-1 text-ink hover:underline cursor-pointer whitespace-nowrap"
                    >
                      {copiedKey === 'customer-url' ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>{bn ? 'কপি হয়েছে' : 'Copied'}</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>{bn ? 'কপি' : 'Copy'}</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>

              {/* Courier Geo, PostCode, Weight & BD Post Service Type */}
              {showGeoDetails && (
                <div className="pt-3 border-t border-border/70 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-muted">
                      {bn
                        ? 'কুরিয়ার জিও, পোস্টকোড ও পার্সেল মেটাডেটা'
                        : 'Courier Geo, PostCode & Parcel Metadata'}
                    </span>
                    {canEditOperations && (
                      <button
                        type="button"
                        onClick={() => {
                          const synced = resolveCourierGeoForAddress({
                            districtId,
                            upazilaId,
                            streetAddress,
                            landmark,
                          });
                          setPostCode(synced.postCode);
                          setRecipientCity(synced.recipientCity);
                          setRecipientZone(synced.recipientZone);
                          setRecipientArea(synced.recipientArea);
                        }}
                        className="px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-surface text-ink hover:border-ink text-[11px] font-semibold cursor-pointer"
                      >
                        {bn ? 'অটো-সিঙ্ক পোস্টকোড ও জোন' : 'Auto-Sync Geo'}
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="space-y-1">
                      <label
                        htmlFor="details-post-code"
                        className="block text-[11px] font-medium text-ink"
                      >
                        {bn ? 'পোস্টকোড' : 'Post Code'}
                      </label>
                      <input
                        id="details-post-code"
                        type="text"
                        maxLength={6}
                        disabled={!canEditOperations}
                        value={postCode}
                        onChange={(e) => setPostCode(e.target.value)}
                        placeholder="1209"
                        className="w-full min-h-[34px] px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="details-pathao-city"
                        className="block text-[11px] font-medium text-ink"
                      >
                        Pathao City
                      </label>
                      <input
                        id="details-pathao-city"
                        type="text"
                        disabled={!canEditOperations}
                        value={recipientCity}
                        onChange={(e) => setRecipientCity(e.target.value)}
                        placeholder="Dhaka"
                        className="w-full min-h-[34px] px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="details-pathao-zone"
                        className="block text-[11px] font-medium text-ink"
                      >
                        Pathao Zone
                      </label>
                      <input
                        id="details-pathao-zone"
                        type="text"
                        disabled={!canEditOperations}
                        value={recipientZone}
                        onChange={(e) => setRecipientZone(e.target.value)}
                        list="details-pathao-zones"
                        placeholder="Dhanmondi"
                        className="w-full min-h-[34px] px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono text-xs"
                      />
                      <datalist id="details-pathao-zones">
                        {getPathaoZonesForDistrict(districtId).map((z) => (
                          <option key={z} value={z} />
                        ))}
                      </datalist>
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="details-pathao-area"
                        className="block text-[11px] font-medium text-ink"
                      >
                        Pathao Area
                      </label>
                      <input
                        id="details-pathao-area"
                        type="text"
                        disabled={!canEditOperations}
                        value={recipientArea}
                        onChange={(e) => setRecipientArea(e.target.value)}
                        placeholder="Road 27"
                        className="w-full min-h-[34px] px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="space-y-1">
                      <label
                        htmlFor="details-pathao-store"
                        className="block text-[11px] font-medium text-ink"
                      >
                        Pathao Store
                      </label>
                      <input
                        id="details-pathao-store"
                        type="text"
                        disabled={!canEditOperations}
                        value={pathaoStoreName}
                        onChange={(e) => setPathaoStoreName(e.target.value)}
                        className="w-full min-h-[34px] px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="details-weight-grams"
                        className="block text-[11px] font-medium text-ink"
                      >
                        {bn ? 'ওজন (গ্রাম)' : 'Weight (g)'}
                      </label>
                      <input
                        id="details-weight-grams"
                        type="number"
                        min={50}
                        step={50}
                        disabled={!canEditOperations}
                        value={totalWeightGrams}
                        onChange={(e) =>
                          setTotalWeightGrams(
                            Math.max(50, parseInt(e.target.value, 10) || 500)
                          )
                        }
                        className="w-full min-h-[34px] px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="details-bdpost-service"
                        className="block text-[11px] font-medium text-ink"
                      >
                        {bn ? 'BD Post সার্ভিস' : 'BD Post Service'}
                      </label>
                      <select
                        id="details-bdpost-service"
                        disabled={!canEditOperations}
                        value={bdPostServiceType}
                        onChange={(e) =>
                          setBdPostServiceType(
                            normalizeBdPostServiceType(e.target.value)
                          )
                        }
                        className="w-full min-h-[34px] px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs"
                      >
                        <option value="VPP_PARCEL">VPP / COD</option>
                        <option value="GEP">GEP</option>
                        <option value="EMS_DAK">EMS</option>
                        <option value="REGISTERED_PARCEL">Registered Parcel</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label
                        htmlFor="details-special-instruction"
                        className="block text-[11px] font-medium text-ink"
                      >
                        {bn ? 'ডেলিভারি নির্দেশনা' : 'Special Instruction'}
                      </label>
                      <input
                        id="details-special-instruction"
                        type="text"
                        disabled={!canEditOperations}
                        value={specialInstruction}
                        onChange={(e) => setSpecialInstruction(e.target.value)}
                        placeholder={bn ? 'ডেলিভারির আগে কল দিন' : 'Call before delivery'}
                        className="w-full min-h-[34px] px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* =================================================================
              SECTION 2: CUSTOMER & DELIVERY ADDRESS
             ================================================================= */}
          <section className="p-4 border border-border rounded-[var(--radius-md)] bg-bg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                <MapPin className="w-4 h-4 text-ink shrink-0" aria-hidden="true" />
                <span>
                  {bn ? '২. গ্রাহক ও ডেলিভারি ঠিকানা' : '2. Customer & Delivery Address'}
                </span>
              </h3>
              <span className="font-mono text-[11px] text-muted tabular-nums">
                {bn ? 'ঠিকানা স্কোর:' : 'Address score:'}{' '}
                <strong
                  className={
                    addressQuality.score < 70
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-ink'
                  }
                >
                  {addressQuality.score}%
                </strong>
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="details-customer-name"
                  className="block text-[11px] font-semibold text-ink"
                >
                  {bn ? 'গ্রাহকের নাম' : 'Customer Name'}
                </label>
                <input
                  id="details-customer-name"
                  type="text"
                  disabled={!canEditOperations}
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="details-customer-phone"
                  className="block text-[11px] font-semibold text-ink"
                >
                  {bn ? 'মোবাইল নম্বর (১১ ডিজিট)' : 'Phone (11 digits)'}
                </label>
                <input
                  id="details-customer-phone"
                  type="text"
                  disabled={!canEditOperations}
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                  placeholder="017XXXXXXXX"
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-mono text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                />
                {bdCarrier && (
                  <p className="text-[10px] text-muted">
                    {bn ? 'অপারেটর:' : 'Carrier:'} {bdCarrier}
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="details-district"
                  className="block text-[11px] font-semibold text-ink"
                >
                  {bn ? 'জেলা (District)' : 'District'}
                </label>
                <select
                  id="details-district"
                  disabled={!canEditOperations}
                  value={districtId}
                  onChange={(e) => {
                    const nextDist = Number(e.target.value);
                    setDistrictId(nextDist);
                    const upzList = getThanasByDistrict(nextDist);
                    if (upzList.length > 0) setUpazilaId(upzList[0].id);
                  }}
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                >
                  {BD_DISTRICTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name_bn} ({d.name_en})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="details-upazila"
                  className="block text-[11px] font-semibold text-ink"
                >
                  {bn ? 'উপজেলা / থানা' : 'Upazila / Thana'}
                </label>
                <select
                  id="details-upazila"
                  disabled={!canEditOperations}
                  value={upazilaId}
                  onChange={(e) => setUpazilaId(Number(e.target.value))}
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                >
                  {getThanasByDistrict(districtId).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name_bn} ({u.name_en})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="details-street"
                  className="block text-[11px] font-semibold text-ink"
                >
                  {bn ? 'বিস্তারিত ঠিকানা (বাড়ি, রোড, এলাকা)' : 'Street Address'}
                </label>
                <input
                  id="details-street"
                  type="text"
                  disabled={!canEditOperations}
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="details-landmark"
                  className="block text-[11px] font-semibold text-ink"
                >
                  {bn ? 'পরিচিত ল্যান্ডমার্ক' : 'Landmark'}
                </label>
                <input
                  id="details-landmark"
                  type="text"
                  disabled={!canEditOperations}
                  value={landmark}
                  onChange={(e) => setLandmark(e.target.value)}
                  placeholder={bn ? 'স্কুল, মসজিদ, বাজার বা মোড়' : 'School, mosque, market'}
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                />
              </div>
            </div>
          </section>

          {/* =================================================================
              SECTION 3: ORDER ITEMS (PRODUCTS, QUANTITY & UNIT PRICE)
             ================================================================= */}
          <section className="p-4 border border-border rounded-[var(--radius-md)] bg-bg space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                <Package className="w-4 h-4 text-ink shrink-0" aria-hidden="true" />
                <span>
                  {bn ? '৩. অর্ডারের পণ্য ও পরিমাণ' : '3. Order Items & Pricing'}
                </span>
              </h3>
              <span className="font-mono text-[11px] text-muted tabular-nums">
                {formatLocaleNumber(
                  items.reduce((s, i) => s + i.quantity, 0),
                  locale
                )}{' '}
                {bn ? 'টি আইটেম' : 'units'} ·{' '}
                <strong className="text-ink">
                  {formatPoishaToBdt(liveSubtotalPoisha, locale)}
                </strong>
              </span>
            </div>

            {items.length === 0 ? (
              <p className="text-muted text-xs py-2">
                {bn ? 'কোনো পণ্যের তালিকা পাওয়া যায়নি।' : 'No line items found.'}
              </p>
            ) : (
              <div className="divide-y divide-border border border-border rounded-[var(--radius-sm)]">
                {items.map((item, idx) => (
                  <div
                    key={`${item.variantId}-${idx}`}
                    className="p-3 bg-surface/30 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-ink">
                          {localizedField(item, 'productNameBn', locale)}
                        </p>
                        <p className="text-[11px] text-muted">
                          {localizedField(item, 'variantTitleBn', locale)} ·{' '}
                          <span className="font-mono">{item.publicSku}</span>
                        </p>
                      </div>
                      {canEditCoreOrder && items.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveItem(idx)}
                          aria-label={bn ? 'পণ্য বাদ দিন' : 'Remove item'}
                          className="p-1.5 rounded-[var(--radius-sm)] text-rose-700 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-3 gap-2 items-end pt-1 tabular-nums">
                      <div>
                        <span className="block text-[10px] text-muted mb-1">
                          {bn ? 'পরিমাণ' : 'Quantity'}
                        </span>
                        <div className="inline-flex items-center border border-border rounded-[var(--radius-sm)] bg-bg">
                          <button
                            type="button"
                            disabled={!canEditCoreOrder || item.quantity <= 1}
                            onClick={() =>
                              handleQuantityChange(idx, item.quantity - 1)
                            }
                            className="px-2 py-1.5 hover:bg-surface disabled:opacity-40 cursor-pointer"
                            aria-label={bn ? 'কমান' : 'Decrease'}
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            min={1}
                            aria-label={
                              bn
                                ? `${item.productNameBn} পরিমাণ`
                                : `${item.productNameBn} quantity`
                            }
                            disabled={!canEditCoreOrder}
                            value={item.quantity}
                            onChange={(e) =>
                              handleQuantityChange(
                                idx,
                                parseInt(e.target.value, 10) || 1
                              )
                            }
                            className="w-10 text-center font-mono font-bold text-xs bg-transparent py-1"
                          />
                          <button
                            type="button"
                            disabled={!canEditCoreOrder}
                            onClick={() =>
                              handleQuantityChange(idx, item.quantity + 1)
                            }
                            className="px-2 py-1.5 hover:bg-surface disabled:opacity-40 cursor-pointer"
                            aria-label={bn ? 'বাড়ান' : 'Increase'}
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor={`details-item-price-${idx}`}
                          className="block text-[10px] text-muted mb-1"
                        >
                          {bn ? 'একক মূল্য (৳)' : 'Unit Price (৳)'}
                        </label>
                        <input
                          id={`details-item-price-${idx}`}
                          type="number"
                          min={0}
                          disabled={!canEditCoreOrder}
                          value={Math.round(item.unitSalePricePoisha / 100)}
                          onChange={(e) =>
                            handlePriceChange(
                              idx,
                              parseInt(e.target.value, 10) || 0
                            )
                          }
                          className="w-full min-h-[32px] px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-bg font-mono font-semibold text-xs disabled:opacity-60"
                        />
                      </div>

                      <div className="text-right">
                        <span className="block text-[10px] text-muted mb-1">
                          {bn ? 'সাবটোটাল' : 'Line Total'}
                        </span>
                        <span className="font-mono font-bold text-ink text-xs">
                          {formatPoishaToBdt(item.lineSubtotalPoisha, locale)}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {canEditCoreOrder && products.length > 0 && (
              <div className="pt-1">
                <select
                  aria-label={bn ? 'নতুন পণ্য যোগ করুন' : 'Add product'}
                  defaultValue=""
                  onChange={(e) => {
                    if (e.target.value) {
                      handleAddVariant(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs cursor-pointer focus:outline-none focus:border-ink"
                >
                  <option value="">
                    {bn
                      ? '+ অর্ডারে নতুন পণ্য যোগ করুন...'
                      : '+ Add product variant to order...'}
                  </option>
                  {products.map((prod) =>
                    prod.variants?.map((v) => (
                      <option key={v.variantId} value={v.variantId}>
                        {localizedField(prod, 'nameBn', locale)} —{' '}
                        {localizedField(v, 'titleBn', locale)} (
                        {formatPoishaToBdt(v.salePricePoisha ?? 0, locale)})
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}
          </section>

          {/* =================================================================
              SECTION 4: CALL CONFIRMATION, ORDER STATUS & STAFF NOTES
             ================================================================= */}
          <section className="p-4 border border-border rounded-[var(--radius-md)] bg-bg space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
              <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-ink shrink-0" aria-hidden="true" />
                <span>
                  {bn
                    ? '৪. কল কনফার্মেশন, স্ট্যাটাস ও নোট'
                    : '4. Call Outcome, Order Status & Notes'}
                </span>
              </h3>
              <span className="font-mono text-[11px] text-muted tabular-nums">
                {bn ? 'মোট কল চেষ্টা:' : 'Call attempts:'}{' '}
                {formatLocaleNumber(order.callAttempts ?? 0, locale)}
              </span>
            </div>

            {canEditOperations && (
              <div className="space-y-1.5">
                <span className="block text-[11px] font-semibold text-ink">
                  {bn ? 'কল ফলাফল (Call Outcome)' : 'Call Outcome'}
                </span>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCallStatus('confirmed_yes');
                      if (order.status === 'pending_confirmation') {
                        setOrderStatus('confirmed');
                      }
                    }}
                    className={`min-h-[36px] px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      callStatus === 'confirmed_yes'
                        ? 'bg-emerald-700 text-white border-emerald-700'
                        : 'bg-surface text-ink border-border hover:border-ink'
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{bn ? 'হ্যাঁ (নিশ্চিত)' : 'Confirmed'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCallStatus('not_answered_busy')}
                    className={`min-h-[36px] px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      callStatus === 'not_answered_busy'
                        ? 'bg-amber-600 text-white border-amber-600'
                        : 'bg-surface text-ink border-border hover:border-ink'
                    }`}
                  >
                    <PhoneMissed className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{bn ? 'ব্যস্ত / ধরেননি' : 'No Answer'}</span>
                  </button>

                  <button
                    type="button"
                    disabled={
                      !['pending_confirmation', 'confirmed', 'packed'].includes(
                        order.status ?? ''
                      )
                    }
                    onClick={() => {
                      setCallStatus('cancelled_no');
                      setOrderStatus('cancelled');
                    }}
                    className={`min-h-[36px] px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors disabled:opacity-40 ${
                      callStatus === 'cancelled_no'
                        ? 'bg-rose-700 text-white border-rose-700'
                        : 'bg-surface text-ink border-border hover:border-ink'
                    }`}
                  >
                    <XSquare className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{bn ? 'না (বাতিল)' : 'Cancel Order'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setCallStatus('call_back_requested')}
                    className={`min-h-[36px] px-2.5 py-1.5 rounded-[var(--radius-sm)] border text-xs font-semibold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-colors ${
                      callStatus === 'call_back_requested'
                        ? 'bg-ink text-bg border-ink'
                        : 'bg-surface text-ink border-border hover:border-ink'
                    }`}
                  >
                    <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{bn ? 'পরে কল' : 'Call Back'}</span>
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="details-order-status"
                  className="block text-[11px] font-semibold text-ink"
                >
                  {bn ? 'অর্ডার স্ট্যাটাস (এডিটযোগ্য)' : 'Order Status (Editable)'}
                </label>
                <select
                  id="details-order-status"
                  disabled={!canEditOperations || allowedNextStatuses.length === 0}
                  value={orderStatus}
                  onChange={(e) => setOrderStatus(e.target.value as OrderStatus)}
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink font-semibold text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                >
                  {order.status && (
                    <option value={order.status}>
                      {bn
                        ? `${ORDER_STATUS_META[order.status]?.bn ?? order.status} (বর্তমান)`
                        : `${ORDER_STATUS_META[order.status]?.en ?? order.status} (Current)`}
                    </option>
                  )}
                  {allowedNextStatuses.map((st) => (
                    <option key={st} value={st}>
                      → {bn ? ORDER_STATUS_META[st]?.bn ?? st : ORDER_STATUS_META[st]?.en ?? st}
                    </option>
                  ))}
                </select>
                {order.status === 'packed' && orderStatus === 'shipped' && !trackingCode.trim() && (
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">
                    {bn
                      ? 'শিপড করার জন্য উপরে ট্র্যাকিং কোড যুক্ত করুন।'
                      : 'Enter a tracking code above to mark as Shipped.'}
                  </p>
                )}
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="details-order-source"
                  className="block text-[11px] font-semibold text-ink"
                >
                  {bn ? 'অর্ডার সোর্স' : 'Order Source'}
                </label>
                <select
                  id="details-order-source"
                  disabled={!canEditCoreOrder}
                  value={orderSource}
                  onChange={(e) => setOrderSource(e.target.value as OrderSource)}
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                >
                  <option value="storefront">
                    {bn ? 'ওয়েবসাইট (Storefront)' : 'Storefront'}
                  </option>
                  <option value="whatsapp">WhatsApp</option>
                  <option value="phone_call">
                    {bn ? 'ফোন কল (Phone Call)' : 'Phone Call'}
                  </option>
                  <option value="facebook">Facebook</option>
                  <option value="instagram">Instagram</option>
                  <option value="other">{bn ? 'অন্যান্য' : 'Other'}</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label
                  htmlFor="details-staff-note"
                  className="block text-[11px] font-semibold text-ink"
                >
                  {bn ? 'অভ্যন্তরীণ স্টাফ নোট' : 'Internal Staff Note'}
                </label>
                <input
                  id="details-staff-note"
                  type="text"
                  disabled={!canEditOperations}
                  value={staffNote}
                  onChange={(e) => setStaffNote(e.target.value)}
                  placeholder={
                    bn
                      ? 'যেমন: গ্রাহক বিকেলে ডেলিভারি চেয়েছেন'
                      : 'e.g. Customer requested afternoon delivery'
                  }
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                />
              </div>

              <div className="space-y-1">
                <label
                  htmlFor="details-call-note"
                  className="block text-[11px] font-semibold text-ink"
                >
                  {bn ? 'কল নোট / ওভাররাইড মন্তব্য' : 'Call / Override Note'}
                </label>
                <input
                  id="details-call-note"
                  type="text"
                  disabled={!canEditOperations}
                  value={callStatusNote}
                  onChange={(e) => {
                    setCallStatusNote(e.target.value);
                    setOverrideReason(e.target.value);
                  }}
                  placeholder={
                    bn
                      ? 'যেমন: ফোনে কথা বলে ঠিকানা নিশ্চিত করা হয়েছে'
                      : 'e.g. Address verified over phone call'
                  }
                  className="w-full min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink text-xs disabled:opacity-60 focus:outline-none focus:border-ink"
                />
              </div>
            </div>
          </section>
        </div>
      )}
    </ResponsiveSheet>
  );
}
