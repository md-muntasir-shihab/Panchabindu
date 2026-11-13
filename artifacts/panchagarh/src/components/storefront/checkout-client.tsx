'use client';
import { localizedFetch as fetch } from '@/lib/i18n/localized-fetch';
import { uiText } from '@/lib/i18n/ui-text';



// src/components/storefront/checkout-client.tsx
// Single-Page Accordion Checkout (01_FRONTEND_MASTER_PROMPT):
//   - Cascading 64-District -> Upazila Dropdown (official nuhil/bangladesh-geocode)
//   - Real-Time Address Quality Score & Landmark Prompt
//   - Weight & District-Based Delivery Method Selector (Courier vs Bangladesh Post Office vs Free Delivery)
//   - Server-Validated Promo Code Input (POST /api/promo/validate)
//   - COD & Manual bKash Send Money (TrxID) Payment Selector
//   - Idempotent Order Submission (POST /api/orders)

import * as React from 'react';
import { Link } from 'wouter';
import { useLocation } from 'wouter';
import {
  ShieldCheck,
  Truck,
  Tag,
  CreditCard,
  MapPin,
  AlertCircle,
  CheckCircle2,
  ShoppingBag,
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  Copy,
  Check,
} from 'lucide-react';
import type {
  CategoryRecord,
  PublicSafeSiteSettingsDTO,
} from '@/lib/db/repository';
import {
  BD_DISTRICTS,
  getDistrictById,
  getUpazilasByDistrict,
} from '@/lib/geo/bd-geocode';
import { formatPoishaToBdt as formatMoney } from '@/lib/money';
import {
  evaluateAddressQuality,
  normalizeBdPhone,
  checkoutDataSchema,
  type CheckoutData,
} from '@/lib/validators';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { useLocaleStore } from '@/store/use-locale-store';
import { useCartStore } from '@/store/use-cart-store';
import { Badge, Button, Card, EmptyState, Input } from '../ui/primitives';
import { StorefrontShell } from './storefront-shell';

export interface CheckoutClientProps {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
}

export function CheckoutClient({
  siteSettings,
  categories,
}: CheckoutClientProps) {
  const [, navigate] = useLocation();
  const locale = useLocaleStore((s) => s.locale);
  const dict = useLocaleStore((s) => s.t());

  const cartItems = useCartStore((s) => s.items);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const clearCart = useCartStore((s) => s.clearCart);

  // Customer & Address Form State
  const [customerName, setCustomerName] = React.useState('');
  const [customerPhone, setCustomerPhone] = React.useState('');
  const [districtId, setDistrictId] = React.useState<number>(47); // Default Dhaka (47)
  const upazilasForDistrict = React.useMemo(
    () => getUpazilasByDistrict(districtId),
    [districtId]
  );
  const [upazilaId, setUpazilaId] = React.useState<number>(
    () => getUpazilasByDistrict(47)[0]?.id ?? 365
  );
  const [streetAddress, setStreetAddress] = React.useState('');
  const [landmark, setLandmark] = React.useState('');
  const [customerNote, setCustomerNote] = React.useState('');

  const [deliveryMethod, setDeliveryMethod] = React.useState<
    'courier' | 'post_office'
  >('courier');
  const [paymentMethod, setPaymentMethod] = React.useState('');
  const [manualPaymentTrxId, setManualPaymentTrxId] = React.useState('');
  const [copiedMfsNumber, setCopiedMfsNumber] = React.useState(false);

  // Promo Code State
  const [promoInput, setPromoInput] = React.useState('');
  const [appliedPromoCode, setAppliedPromoCode] = React.useState<string | null>(
    null
  );
  const [promoMessage, setPromoMessage] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [isCheckingPromo, setIsCheckingPromo] = React.useState(false);

  // Submission & Idempotency State
  const [idempotencyKey] = React.useState(
    () => `chk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
  );
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const submittingRef = React.useRef(false);
  const [sessionStatus, setSessionStatus] = React.useState<'loading' | 'authenticated' | 'anonymous' | 'error'>('loading');

  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/account/orders', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json() as { authenticated?: boolean; customerPhone?: string };
        if (controller.signal.aborted) return;
        setSessionStatus(data.authenticated ? 'authenticated' : 'anonymous');
        if (data.authenticated && typeof data.customerPhone === 'string') setCustomerPhone(data.customerPhone);
      })
      .catch(() => {
        if (!controller.signal.aborted) setSessionStatus('error');
      });
    return () => controller.abort();
  }, []);

  // Keep upazilaId in sync when districtId changes
  const handleDistrictChange = (newDistrictId: number) => {
    setDistrictId(newDistrictId);
    const list = getUpazilasByDistrict(newDistrictId);
    if (list[0]) {
      setUpazilaId(list[0].id);
    }
  };

  // Only identifiers and quantities go to the server; stored cart prices are not trusted.
  const quoteQuery = JSON.stringify({
    districtId,
    items: cartItems.map(({ productId, variantId, quantity }) => ({ productId, variantId, quantity })),
    ...(appliedPromoCode ? { promoCode: appliedPromoCode } : {}),
  });
  const [checkoutResult, setCheckoutResult] = React.useState<{ key: string; data: CheckoutData } | null>(null);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);
  const [quoteRetry, setQuoteRetry] = React.useState(0);
  const hasCartItems = cartItems.length > 0;
  React.useEffect(() => {
    if (!hasCartItems) return;
    const controller = new AbortController();
    setQuoteError(null);
    fetch(`/api/page-data?${new URLSearchParams({ path: '/checkout', q: quoteQuery })}`, {
      cache: 'no-store', signal: controller.signal,
    }).then(async response => {
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.errorBn || 'হিসাব পাওয়া যায়নি।');
      const data = checkoutDataSchema.parse(body.data?.props?.checkout);
      if (!data.quote || !data.paymentMethods.length ||
        !data.quote.deliveryQuotes.some(q => q.method === 'courier') ||
        !data.quote.deliveryQuotes.some(q => q.method === 'post_office')) throw new Error('অসম্পূর্ণ চেকআউট তথ্য।');
      if (!controller.signal.aborted) setCheckoutResult({ key: quoteQuery, data });
    }).catch(() => {
      if (!controller.signal.aborted) setQuoteError(locale === 'bn'
        ? 'ডেলিভারি ও পেমেন্টের তথ্য পাওয়া যায়নি। আবার চেষ্টা করুন।'
        : 'Delivery and payment information could not be loaded. Please retry.');
    });
    return () => controller.abort();
  }, [quoteQuery, hasCartItems, quoteRetry, locale]);

  const checkoutData = checkoutResult?.data;
  const quote = checkoutData?.quote;
  const quoteReady = checkoutResult?.key === quoteQuery && !quoteError;
  const paymentMethods = checkoutData?.paymentMethods ?? [];
  const hasItemRequiringAdvance = quote?.hasItemRequiringAdvance ?? false;
  const selectedPayment = paymentMethods.find(method => method.code === paymentMethod &&
    (!hasItemRequiringAdvance || method.kind !== 'cash')) ??
    paymentMethods.find(method => !hasItemRequiringAdvance || method.kind !== 'cash');
  const effectivePaymentMethod = selectedPayment?.code ?? '';
  const isManualPayment = selectedPayment?.kind === 'manual';
  const subtotalPoisha = quote?.subtotalPoisha ?? 0;
  const promoDiscountPoisha = quote?.discountPoisha ?? 0;
  const selectedDistrict =
    getDistrictById(districtId) ?? getDistrictById(47)!;
  const courierChargeCalc = quote?.deliveryQuotes.find(q => q.method === 'courier');
  const bdPostChargeCalc = quote?.deliveryQuotes.find(q => q.method === 'post_office');
  const activeDeliveryCalc =
    deliveryMethod === 'post_office' ? bdPostChargeCalc : courierChargeCalc;
  const totalPayablePoisha = activeDeliveryCalc?.totalPayablePoisha ?? 0;
  const requiredAdvancePoisha = activeDeliveryCalc?.requiredAdvancePoisha ?? 0;
  const formatPoishaToBdt = (amount: number, language: typeof locale) =>
    quoteReady ? formatMoney(amount, language) : '…';

  // Live Address Quality Evaluation
  const addressQuality = React.useMemo(
    () =>
      evaluateAddressQuality({
        districtId,
        upazilaId,
        streetAddress,
        landmark,
        customerPhone: customerPhone || '01700000000',
      }),
    [districtId, upazilaId, streetAddress, landmark, customerPhone]
  );

  const handleApplyPromo = async () => {
    const code = promoInput.trim();
    if (!code || cartItems.length === 0) return;

    setIsCheckingPromo(true);
    setPromoMessage(null);
    try {
      const res = await fetch('/api/promo/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code,
          items: cartItems.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        }),
      });
      const data = (await res.json()) as {
        valid: boolean;
        code: string;
        discountPoisha: number;
        reasonBn: string;
      };

      if (data.valid) {
        setAppliedPromoCode(data.code);
        setPromoMessage({ type: 'success', text: data.reasonBn });
      } else {
        setAppliedPromoCode(null);
        setPromoMessage({ type: 'error', text: data.reasonBn });
      }
    } catch {
      setPromoMessage({
        type: 'error',
        text: 'প্রোমো কোড যাচাই করতে সমস্যা হয়েছে।',
      });
    } finally {
      setIsCheckingPromo(false);
    }
  };

  const handleRemovePromo = () => {
    setAppliedPromoCode(null);
    setPromoInput('');
    setPromoMessage(null);
  };

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setSubmitError(null);

    if (!quoteReady || !activeDeliveryCalc || !selectedPayment || isCheckingPromo) {
      setSubmitError(locale === 'bn' ? 'সার্ভারের হিসাব আসা পর্যন্ত অপেক্ষা করুন।' : 'Please wait for the server quote.');
      return;
    }
    if (sessionStatus === 'loading' || sessionStatus === 'error') {
      setSubmitError('চেকআউট প্রস্তুত হচ্ছে। কিছুক্ষণ পরে আবার চেষ্টা করুন।');
      return;
    }

    const normalizedPhone = normalizeBdPhone(customerPhone);
    if (!customerName.trim() || customerName.trim().length < 2) {
      setSubmitError('অনুগ্রহ করে আপনার পূর্ণ নাম লিখুন।');
      return;
    }
    if (!normalizedPhone) {
      setSubmitError(
        'সঠিক ১১ সংখ্যার বাংলাদেশি মোবাইল নম্বর দিন (যেমন: 017XXXXXXXX)।'
      );
      return;
    }
    if (streetAddress.trim().length < 6) {
      setSubmitError('বাড়ি, রোড ও এলাকার বিস্তারিত ঠিকানা লিখুন।');
      return;
    }
    if (hasItemRequiringAdvance && !isManualPayment) {
      setSubmitError(
        'এই অর্ডারে কুরিয়ার ডেলিভারি চার্জ অগ্রিম প্রযোজ্য। অনুগ্রহ করে বিকাশ নির্বাচন করুন।'
      );
      return;
    }
    if (isManualPayment && manualPaymentTrxId.trim().length < 5) {
      setSubmitError(
        'বিকাশ সেন্ড মানির সঠিক Transaction ID (TrxID) লিখুন।'
      );
      return;
    }

    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      const advancePortion =
        isManualPayment
          ? requiredAdvancePoisha > 0
            ? requiredAdvancePoisha
            : activeDeliveryCalc.finalChargePoisha
          : 0;

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          idempotencyKey,
          customerName: customerName.trim(),
          customerPhone: normalizedPhone,
          districtId,
          upazilaId,
          streetAddress: streetAddress.trim(),
          landmark: landmark.trim(),
          source: 'storefront',
          deliveryMethod,
          paymentMethod: effectivePaymentMethod,
          manualPaymentTrxId:
            isManualPayment
              ? manualPaymentTrxId.trim().toUpperCase()
              : undefined,
          advancePaidPoisha: advancePortion,
          promoCode: appliedPromoCode ?? undefined,
          customerNote: customerNote.trim(),
          items: cartItems.map((i) => ({
            productId: i.productId,
            variantId: i.variantId,
            quantity: i.quantity,
          })),
        }),
      });

      const result = (await response.json()) as {
        success: boolean;
        errorBn?: string;
        order?: { orderNo: string; secureTrackingToken?: string };
      };

      if (!response.ok || !result.success || !result.order) {
        if (response.status === 401) setSessionStatus('anonymous');
        setSubmitError(
          result.errorBn ?? 'অর্ডার সম্পন্ন করতে সমস্যা হয়েছে। আবার চেষ্টা করুন।'
        );
        setIsSubmitting(false);
        return;
      }

      const trackingRef =
        result.order.secureTrackingToken || result.order.orderNo;

      // Save secureTrackingToken to recent orders in localStorage for easy Customer Account lookup
      try {
        const rawRecent = window.localStorage.getItem('bg_recent_orders');
        const list: string[] = rawRecent ? JSON.parse(rawRecent) : [];
        if (!list.includes(trackingRef)) {
          list.unshift(trackingRef);
          window.localStorage.setItem(
            'bg_recent_orders',
            JSON.stringify(list.slice(0, 10))
          );
        }
      } catch {
        // Ignore storage error
      }

      clearCart();
      navigate(`/order-tracking/${encodeURIComponent(trackingRef)}`);
    } catch {
      setSubmitError('নেটওয়ার্ক ত্রুটি। অনুগ্রহ করে আবার চেষ্টা করুন।');
      setIsSubmitting(false);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return (
    <StorefrontShell siteSettings={siteSettings} categories={categories}>
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {sessionStatus === 'error' && (
          <Card className="space-y-3">
            <p role="status" className="text-sm">চেকআউট প্রস্তুত করা যায়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।</p>
          </Card>
        )}
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{dict.common.continueShopping}</span>
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-ink">
              {locale === 'bn'
                ? 'সিঙ্গেল-পেজ চেকআউট ও অর্ডার কনফার্মেশন'
                : 'Single-Page Checkout & Order Confirmation'}
            </h1>
          </div>
          <Badge status="info">{dict.common.codAvailable}</Badge>
        </div>

        {hasCartItems && (!quoteReady || quoteError) && (
          <Card className="space-y-3">
            <p role={quoteError ? 'alert' : 'status'} className="text-sm">
              {quoteError ?? (locale === 'bn' ? 'ডেলিভারি ও পেমেন্টের হিসাব আসছে…' : 'Loading delivery and payment information…')}
            </p>
            {quoteError && <Button type="button" variant="outline" onClick={() => {
              setCheckoutResult(null);
              setQuoteError(null);
              setQuoteRetry(value => value + 1);
            }}>{locale === 'bn' ? 'আবার চেষ্টা করুন' : 'Retry'}</Button>}
          </Card>
        )}
        {cartItems.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag className="w-6 h-6" aria-hidden="true" />}
            title={dict.cart.emptyTitle}
            description={dict.cart.emptySubtitle}
            actionLabel={dict.common.continueShopping}
            onAction={() => navigate('/')}
          />
        ) : !activeDeliveryCalc || !courierChargeCalc || !bdPostChargeCalc ? null : (
          <form
            onSubmit={handleConfirmOrder}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            {/* Left Column: 3-Step Single-Page Accordion Sections */}
            <div className="lg:col-span-7 space-y-6 min-w-0">
              {/* Step 1: Customer & Cascading 64-District -> Upazila Delivery Address */}
              <Card surface="bg" padding="md" className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-[var(--radius-sm)] bg-ink text-bg text-xs font-bold flex items-center justify-center">
                      ১
                    </span>
                    <h2 className="text-base font-bold text-ink">
                      {locale === 'bn'
                        ? 'গ্রাহকের তথ্য ও ডেলিভারি ঠিকানা'
                        : '1. Customer Details & Delivery Address'}
                    </h2>
                  </div>
                  <MapPin className="w-4 h-4 text-muted" aria-hidden="true" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={locale === 'bn' ? 'আপনার পূর্ণ নাম *' : 'Full Name *'}
                    placeholder={
                      locale === 'bn' ? 'যেমন: তানভীর আহমেদ' : 'e.g. Tanvir Ahmed'
                    }
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    required
                  />
                  <Input
                    label={
                      locale === 'bn'
                        ? 'মোবাইল নম্বর (১১ ডিজিট) *'
                        : 'Mobile Number (11 Digits) *'
                    }
                    placeholder="017XXXXXXXX / ০১৭XXXXXXXX"
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    onBlur={() => {
                      const norm = normalizeBdPhone(customerPhone);
                      if (norm && cartItems.length > 0) {
                        void fetch('/api/cart/abandoned', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            customerPhone: norm,
                            customerName: customerName.trim(),
                            districtId,
                            items: cartItems.map((i) => ({
                              variantId: i.variantId,
                              quantity: i.quantity,
                            })),
                          }),
                        });
                      }
                    }}
                    required
                  />
                </div>

                {/* Cascading 64 District -> Upazila Selectors */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label
                      htmlFor="checkout-district"
                      className="block text-xs font-medium text-ink"
                    >
                      {locale === 'bn'
                        ? 'জেলা নির্বাচন করুন (৬৪ জেলা) *'
                        : 'Select District (64 Districts) *'}
                    </label>
                    <select
                      id="checkout-district"
                      value={districtId}
                      onChange={(e) =>
                        handleDistrictChange(Number(e.target.value))
                      }
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)] focus:outline-2 focus:outline-ink"
                    >
                      {BD_DISTRICTS.map((d) => (
                        <option key={d.id} value={d.id}>
                          {locale === 'bn' ? d.name_bn : d.name_en}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label
                      htmlFor="checkout-upazila"
                      className="block text-xs font-medium text-ink"
                    >
                      {locale === 'bn'
                        ? 'উপজেলা / থানা নির্বাচন করুন *'
                        : 'Select Upazila / Thana *'}
                    </label>
                    <select
                      id="checkout-upazila"
                      value={upazilaId}
                      onChange={(e) => setUpazilaId(Number(e.target.value))}
                      className="w-full min-h-[44px] px-3.5 py-2 text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)] focus:outline-2 focus:outline-ink"
                    >
                      {upazilasForDistrict.map((u) => (
                        <option key={u.id} value={u.id}>
                          {locale === 'bn' ? u.name_bn : u.name_en}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <Input
                  label={
                    locale === 'bn'
                      ? 'বাড়ি, রোড ও এলাকার বিস্তারিত ঠিকানা *'
                      : 'House, Road & Area Address *'
                  }
                  placeholder={
                    locale === 'bn'
                      ? 'যেমন: বাড়ি ২৪, রোড ৭/এ, ধানমন্ডি আবাসিক এলাকা'
                      : 'e.g. House 24, Road 7/A, Dhanmondi'
                  }
                  value={streetAddress}
                  onChange={(e) => setStreetAddress(e.target.value)}
                  required
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label={
                      locale === 'bn'
                        ? 'পরিচিত ল্যান্ডমার্ক (ঐচ্ছিক কিন্তু দ্রুত ডেলিভারির জন্য সহায়ক)'
                        : 'Nearby Landmark (Recommended)'
                    }
                    placeholder={
                      locale === 'bn'
                        ? 'যেমন: সাত মসজিদ রোড ওভারব্রিজের পাশে'
                        : 'e.g. Near Satmasjid Road Overbridge'
                    }
                    value={landmark}
                    onChange={(e) => setLandmark(e.target.value)}
                  />
                  <Input
                    label={
                      locale === 'bn'
                        ? 'ডেলিভারি নোট (ঐচ্ছিক)'
                        : 'Delivery Note (Optional)'
                    }
                    placeholder={
                      locale === 'bn'
                        ? 'যেমন: ডেলিভারির আগে কল দিবেন'
                        : 'e.g. Call before delivery'
                    }
                    value={customerNote}
                    onChange={(e) => setCustomerNote(e.target.value)}
                  />
                </div>

                {/* Live Address Quality Feedback Bar */}
                {streetAddress.trim().length > 0 && (
                  <div className="p-3 border border-border rounded-[var(--radius-md)] bg-surface flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      {addressQuality.score >= 85 ? (
                        <CheckCircle2
                          className="w-4 h-4 text-success shrink-0"
                          aria-hidden="true"
                        />
                      ) : (
                        <AlertCircle
                          className="w-4 h-4 text-warning shrink-0"
                          aria-hidden="true"
                        />
                      )}
                      <span className="text-ink font-medium">
                        {addressQuality.score >= 85
                          ? locale === 'bn'
                            ? 'ঠিকানাটি কুরিয়ার ডেলিভারির জন্য সম্পূর্ণ উপযুক্ত।'
                            : 'Address is complete for fast courier dispatch.'
                          : locale === 'bn'
                          ? 'দ্রুত ডেলিভারির জন্য বাড়ি/রোড নম্বর এবং পাশের পরিচিত স্থান (Landmark) উল্লেখ করুন।'
                          : 'Add house/road number and a landmark for faster delivery.'}
                      </span>
                    </div>
                    <Badge
                      status={addressQuality.score >= 85 ? 'success' : 'warning'}
                    >
                      {formatLocaleNumber(addressQuality.score, locale)}%
                    </Badge>
                  </div>
                )}
              </Card>

              {/* Step 2: Delivery Method Selection */}
              <Card surface="bg" padding="md" className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-[var(--radius-sm)] bg-ink text-bg text-xs font-bold flex items-center justify-center">
                      ২
                    </span>
                    <h2 className="text-base font-bold text-ink">
                      {locale === 'bn'
                        ? 'ডেলিভারি মাধ্যম নির্বাচন করুন'
                        : '2. Select Delivery Method'}
                    </h2>
                  </div>
                  <Truck className="w-4 h-4 text-muted" aria-hidden="true" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('courier')}
                    className={`p-3.5 text-left border rounded-[var(--radius-md)] cursor-pointer transition-colors flex items-center justify-between ${
                      deliveryMethod === 'courier'
                        ? 'border-ink bg-surface ring-1 ring-ink'
                        : 'border-border bg-bg hover:border-ink'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-ink">
                        {locale === 'bn'
                          ? 'কুরিয়ার হোম ডেলিভারি'
                          : 'Courier Home Delivery'}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {quote?.isInsideDhaka
                          ? locale === 'bn'
                            ? 'ঢাকার ভেতরে ২৪-৪৮ ঘণ্টা'
                            : 'Inside Dhaka (24-48h)'
                          : locale === 'bn'
                          ? 'ঢাকার বাইরে ২-৪ কার্যদিবস'
                          : 'Outside Dhaka (2-4 Days)'}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-ink tabular-nums">
                      {quoteReady && courierChargeCalc.isFreeDeliveryApplied
                        ? dict.common.freeDelivery
                        : formatPoishaToBdt(
                            courierChargeCalc.finalChargePoisha,
                            locale
                          )}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryMethod('post_office')}
                    className={`p-3.5 text-left border rounded-[var(--radius-md)] cursor-pointer transition-colors flex items-center justify-between ${
                      deliveryMethod === 'post_office'
                        ? 'border-ink bg-surface ring-1 ring-ink'
                        : 'border-border bg-bg hover:border-ink'
                    }`}
                  >
                    <div>
                      <p className="text-sm font-bold text-ink">
                        {locale === 'bn'
                          ? 'বাংলাদেশ ডাক বিভাগ (BD Post)'
                          : 'Bangladesh Post Office'}
                      </p>
                      <p className="text-xs text-muted mt-0.5">
                        {locale === 'bn'
                          ? 'সাশ্রয়ী সরকারি ডাক সার্ভিস'
                          : 'Economy Government Post'}
                      </p>
                    </div>
                    <span className="text-sm font-bold text-ink tabular-nums">
                      {quoteReady && bdPostChargeCalc.isFreeDeliveryApplied
                        ? dict.common.freeDelivery
                        : formatPoishaToBdt(
                            bdPostChargeCalc.finalChargePoisha,
                            locale
                          )}
                    </span>
                  </button>
                </div>
              </Card>

              {/* Step 3: Payment Method (COD vs Manual bKash TrxID) */}
              <Card surface="bg" padding="md" className="space-y-4">
                <div className="flex items-center justify-between border-b border-border pb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-6 h-6 rounded-[var(--radius-sm)] bg-ink text-bg text-xs font-bold flex items-center justify-center">
                      ৩
                    </span>
                    <h2 className="text-base font-bold text-ink">
                      {locale === 'bn'
                        ? 'পেমেন্ট মাধ্যম নির্বাচন করুন'
                        : '3. Select Payment Method'}
                    </h2>
                  </div>
                  <CreditCard className="w-4 h-4 text-muted" aria-hidden="true" />
                </div>

                {/* Advance Courier Banner if products require it */}
                {hasItemRequiringAdvance && (
                  <div className="p-3.5 border border-[#B45309]/30 rounded-[var(--radius-md)] bg-[#FFFBEB] text-xs text-[#92400E] space-y-1">
                    <div className="flex items-center gap-2 font-bold">
                      <AlertCircle className="w-4 h-4 text-[#B45309] shrink-0" />
                      <span>
                        {locale === 'bn'
                          ? 'অগ্রিম কুরিয়ার চার্জ প্রযোজ্য'
                          : 'Advance Courier Charge Mandatory'}
                      </span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      {locale === 'bn'
                        ? `এই অর্ডারের কুরিয়ার চার্জ ${formatPoishaToBdt(requiredAdvancePoisha, locale)} অগ্রিম বিকাশে জমা দিতে হবে। যাচাইয়ের পর অর্থ প্রাপ্তি নিশ্চিত হবে।`
                        : `Submit the advance courier charge of ${formatPoishaToBdt(requiredAdvancePoisha, locale)} via bKash. Payment remains pending until verified.`}
                    </p>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {paymentMethods.map(method => method.kind === 'cash' ? <button
                    key={method.code}
                    type="button"
                    disabled={hasItemRequiringAdvance}
                    onClick={() => setPaymentMethod(method.code)}
                    className={`p-3.5 text-left border rounded-[var(--radius-md)] transition-colors ${
                      hasItemRequiringAdvance
                        ? 'opacity-50 cursor-not-allowed border-border bg-surface'
                        : effectivePaymentMethod === method.code
                        ? 'border-ink bg-surface ring-1 ring-ink cursor-pointer'
                        : 'border-border bg-bg hover:border-ink cursor-pointer'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-ink">
                        {locale === 'bn' ? method.nameBn : method.nameEn}
                      </p>
                      {hasItemRequiringAdvance && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-danger/10 text-danger font-medium">
                          {locale === 'bn' ? 'অগ্রিম প্রযোজ্য' : 'Advance Req'}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {hasItemRequiringAdvance
                        ? locale === 'bn'
                          ? 'অগ্রিম কুরিয়ার চার্জের জন্য প্রযোজ্য নয়'
                          : 'Not available when advance courier is required'
                        : locale === 'bn' ? method.descriptionBn : method.descriptionEn}
                    </p>
                  </button> : <button
                    key={method.code}
                    type="button"
                    onClick={() => setPaymentMethod(method.code)}
                    className={`p-3.5 text-left border rounded-[var(--radius-md)] cursor-pointer transition-colors ${
                      effectivePaymentMethod === method.code
                        ? 'border-[#E2136E] bg-[#E2136E]/5 ring-1 ring-[#E2136E]'
                        : 'border-border bg-bg hover:border-[#E2136E]/60'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-[#E2136E]">
                        {locale === 'bn' ? method.nameBn : method.nameEn}
                      </p>
                      <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#E2136E]/10 text-[#E2136E]">
                        {method.accountNumber}
                      </span>
                    </div>
                    <p className="text-xs text-muted mt-0.5">
                      {locale === 'bn' ? method.descriptionBn : method.descriptionEn}
                    </p>
                  </button>)}

                </div>

                {/* MFS Send Money Guidance Box */}
                {quoteReady && isManualPayment && selectedPayment && (
                  <div className="p-4 border border-border rounded-[var(--radius-md)] bg-surface space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2.5">
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 text-xs font-bold rounded-md bg-ink text-bg">
                          {locale === 'bn' ? selectedPayment.nameBn : selectedPayment.nameEn}</span>
                        <span className="text-xs text-muted">
                          {locale === 'bn'
                            ? 'পার্সোনাল সেন্ড মানি নম্বর:'
                            : 'Personal Send Money Number:'}
                        </span>
                        <span className="text-xs font-mono font-bold text-ink">
                          {selectedPayment.accountNumber}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={async () => {
                          const targetNum = selectedPayment.accountNumber;
                          try {
                            await navigator.clipboard.writeText(targetNum);
                            setCopiedMfsNumber(true);
                            window.setTimeout(() => setCopiedMfsNumber(false), 1500);
                          } catch {
                            setSubmitError('নম্বর কপি করা যায়নি। নম্বরটি নির্বাচন করে কপি করুন।');
                          }
                        }}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border border-border bg-bg text-ink hover:border-ink cursor-pointer"
                      >
                        {copiedMfsNumber ? (
                          <Check className="w-3.5 h-3.5 text-success" />
                        ) : (
                          <Copy className="w-3.5 h-3.5 text-muted" />
                        )}
                        <span>
                          {copiedMfsNumber
                            ? locale === 'bn'
                              ? 'কপি হয়েছে'
                              : 'Copied'
                            : locale === 'bn'
                            ? 'নম্বর কপি করুন'
                            : 'Copy Number'}
                        </span>
                      </button>
                    </div>

                    <div className="p-2.5 rounded-md bg-bg text-xs space-y-1 text-muted">
                      <p className="font-semibold text-ink">
                        {locale === 'bn'
                          ? selectedPayment.instructionBn
                          : selectedPayment.instructionEn}
                      </p>
                      <p className="text-[11px]">
                        {locale === 'bn'
                        ? `প্রদেয় অগ্রিম কুরিয়ার চার্জ: ${formatPoishaToBdt(requiredAdvancePoisha || activeDeliveryCalc.finalChargePoisha, locale)} | বাকি ${formatPoishaToBdt(Math.max(0, totalPayablePoisha - (requiredAdvancePoisha || activeDeliveryCalc.finalChargePoisha)), locale)} ডেলিভারির সময় প্রদেয় (COD)`
                        : `Payable Advance: ${formatPoishaToBdt(requiredAdvancePoisha || activeDeliveryCalc.finalChargePoisha, locale)} | Remaining ${formatPoishaToBdt(Math.max(0, totalPayablePoisha - (requiredAdvancePoisha || activeDeliveryCalc.finalChargePoisha)), locale)} on Delivery (COD)`}
                      </p>
                    </div>

                    <Input
                      label={
                        locale === 'bn'
                          ? 'বিকাশ Transaction ID (TrxID) *'
                          : 'bKash Transaction ID (TrxID) *'
                      }
                      placeholder={uiText("যেমন: 9K28X91A", locale)}
                      value={manualPaymentTrxId}
                      onChange={(e) => setManualPaymentTrxId(e.target.value)}
                      required
                    />
                  </div>
                )}
              </Card>
            </div>

            {/* Right Column: Order Summary, Promo Code, & Confirm CTA */}
            <div className="lg:col-span-5 min-w-0 space-y-4 lg:sticky lg:top-24">
              <Card surface="surface" padding="md" className="space-y-4">
                <h2 className="text-base font-bold text-ink border-b border-border pb-3">
                  {locale === 'bn'
                    ? `অর্ডার সামারি (${formatLocaleNumber(
                        cartItems.reduce((s, i) => s + i.quantity, 0),
                        locale
                      )} টি পণ্য)`
                    : `Order Summary (${cartItems.reduce(
                        (s, i) => s + i.quantity,
                        0
                      )} Items)`}
                </h2>

                <ul className="divide-y divide-border border border-border rounded-[var(--radius-md)] bg-bg max-h-80 overflow-y-auto">
                  {cartItems.map((item) => {
                    const name = locale === 'bn' ? item.nameBn : item.nameEn;
                    const vTitle =
                      locale === 'bn'
                        ? item.variantTitleBn
                        : item.variantTitleEn;
                    return (
                      <li key={item.variantId} className="p-3 flex gap-3">
                        <div className="relative w-14 h-14 shrink-0 border border-border rounded-[var(--radius-sm)] overflow-hidden bg-surface">
                          {item.imageUrl && (
                            <img
                              src={item.imageUrl}
                              alt={name}
                              referrerPolicy="no-referrer"
                              className="object-cover" loading="lazy" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-xs sm:text-sm font-semibold text-ink truncate">
                            {name}
                          </p>
                          <p className="text-xs text-muted">{vTitle}</p>
                          <div className="mt-1.5 flex items-center justify-between">
                            <div className="inline-flex items-center border border-border rounded-[var(--radius-sm)]">
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(
                                    item.variantId,
                                    item.quantity - 1
                                  )
                                }
                                aria-label={uiText("Decrease quantity", locale)}
                                className="p-1 text-ink hover:bg-surface cursor-pointer"
                              >
                                <Minus className="w-3 h-3" aria-hidden="true" />
                              </button>
                              <span className="px-2 text-xs font-bold tabular-nums">
                                {formatLocaleNumber(item.quantity, locale)}
                              </span>
                              <button
                                type="button"
                                onClick={() =>
                                  updateQuantity(
                                    item.variantId,
                                    item.quantity + 1
                                  )
                                }
                                aria-label={uiText("Increase quantity", locale)}
                                className="p-1 text-ink hover:bg-surface cursor-pointer"
                              >
                                <Plus className="w-3 h-3" aria-hidden="true" />
                              </button>
                            </div>

                            <div className="flex items-center gap-2">
                              <span className="text-xs sm:text-sm font-bold text-ink tabular-nums">
                                {formatPoishaToBdt(
                                  item.unitSalePricePoisha * item.quantity,
                                  locale
                                )}
                              </span>
                              <button
                                type="button"
                                onClick={() => removeItem(item.variantId)}
                                aria-label={`Remove ${name}`}
                                className="text-muted hover:text-danger cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                {/* Promo Code Box */}
                <div className="space-y-2 pt-1">
                  <label
                    htmlFor="promo-code-input"
                    className="block text-xs font-semibold text-ink"
                  >
                    {locale === 'bn'
                      ? 'প্রোমো কোড (যেমন: EID10 বা SAVE100)'
                      : 'Promo Code (e.g. EID10 or SAVE100)'}
                  </label>
                  <div className="flex gap-2">
                    <input
                      id="promo-code-input"
                      type="text"
                      value={promoInput}
                      onChange={(e) => setPromoInput(e.target.value)}
                      placeholder="EID10"
                      disabled={Boolean(appliedPromoCode)}
                      className="flex-1 min-h-[44px] px-3.5 py-2 text-sm font-mono uppercase bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                    />
                    {appliedPromoCode ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="md"
                        onClick={handleRemovePromo}
                      >
                        {dict.common.remove}
                      </Button>
                    ) : (
                      <Button
                        type="button"
                        variant="secondary"
                        size="md"
                        disabled={isCheckingPromo || !promoInput.trim()}
                        onClick={handleApplyPromo}
                        leftIcon={<Tag className="w-4 h-4" aria-hidden="true" />}
                      >
                        {dict.common.apply}
                      </Button>
                    )}
                  </div>
                  {promoMessage && (
                    <p
                      className={`text-xs font-medium ${
                        promoMessage.type === 'success'
                          ? 'text-success'
                          : 'text-danger'
                      }`}
                    >
                      {promoMessage.text}
                    </p>
                  )}
                </div>

                {/* Exact Poisha Breakdown */}
                <div className="space-y-2 border-t border-border pt-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted">{dict.common.subtotal}</span>
                    <span className="font-semibold text-ink tabular-nums">
                      {formatPoishaToBdt(subtotalPoisha, locale)}
                    </span>
                  </div>

                  {promoDiscountPoisha > 0 && (
                    <div className="flex items-center justify-between text-success">
                      <span>
                        {dict.common.discount} ({appliedPromoCode})
                      </span>
                      <span className="font-semibold tabular-nums">
                        -{formatPoishaToBdt(promoDiscountPoisha, locale)}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between">
                    <span className="text-muted">
                      {dict.common.deliveryCharge} (
                      {locale === 'bn'
                        ? selectedDistrict.name_bn
                        : selectedDistrict.name_en}
                      )
                    </span>
                    <span className="font-semibold text-ink tabular-nums">
                      {quoteReady && activeDeliveryCalc.isFreeDeliveryApplied
                        ? dict.common.freeDelivery
                        : formatPoishaToBdt(
                            activeDeliveryCalc.finalChargePoisha,
                            locale
                          )}
                    </span>
                  </div>

                  <div className="flex items-center justify-between border-t border-border pt-2.5 text-base font-bold text-ink">
                    <span>{dict.common.total}</span>
                    <span className="text-lg tabular-nums">
                      {formatPoishaToBdt(totalPayablePoisha, locale)}
                    </span>
                  </div>

                  {(hasItemRequiringAdvance || isManualPayment) && (
                    <div className="pt-2 border-t border-dashed border-border/80 space-y-1 text-xs">
                      <div className="flex items-center justify-between text-[#B45309] font-medium">
                        <span>
                          {locale === 'bn'
                            ? 'অগ্রিম প্রদেয় (বিকাশ):'
                            : 'Advance Payable (bKash):'}
                        </span>
                        <span className="font-bold tabular-nums">
                          {formatPoishaToBdt(
                            requiredAdvancePoisha > 0
                              ? requiredAdvancePoisha
                              : activeDeliveryCalc.finalChargePoisha,
                            locale
                          )}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-muted">
                        <span>
                          {locale === 'bn'
                            ? 'ডেলিভারির সময় প্রদেয় (COD):'
                            : 'Payable on Delivery (COD):'}
                        </span>
                        <span className="font-semibold text-ink tabular-nums">
                          {formatPoishaToBdt(
                            Math.max(
                              0,
                              totalPayablePoisha -
                                (requiredAdvancePoisha > 0
                                  ? requiredAdvancePoisha
                                  : activeDeliveryCalc.finalChargePoisha)
                            ),
                            locale
                          )}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Multi-Vendor Consignment Fulfillment & Separated Order/Payment Status Summary (Phase 6 Section 9.4) */}
                <div className="p-3 rounded-[var(--radius-md)] border border-border bg-bg space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-ink">
                      {locale === 'bn'
                        ? 'কনসাইনমেন্ট ফুলফিলমেন্ট সামারি'
                        : 'Consignment Fulfillment Summary'}
                    </span>
                    <Badge status="info">
                      {locale === 'bn'
                        ? `${formatLocaleNumber(cartItems.length, locale)}টি আইটেম`
                        : `${cartItems.length} Line(s)`}
                    </Badge>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    {locale === 'bn'
                      ? 'একাধিক কারিগর বা তাঁত হাবের পণ্য থাকলে সেগুলো কেন্দ্রীয় কিউসি (QC) ওয়্যারহাউসে একীভূত করে বা ভেন্ডর ফুলফিলমেন্ট গ্রুপ (VFG) অনুযায়ী পাঠানো হয়।'
                      : 'Items from multiple artisan hubs are QC-inspected and dispatched via Vendor Fulfillment Groups (VFG).'}
                  </p>
                  <div className="pt-1.5 border-t border-border grid grid-cols-2 gap-2 text-[11px]">
                    <div>
                      <span className="text-muted block">
                        {locale === 'bn' ? 'অর্ডার স্ট্যাটাস:' : 'Order Status:'}
                      </span>
                      <span className="font-semibold text-ink">
                        {locale === 'bn'
                          ? 'ফোন কনফার্মেশন পেন্ডিং'
                          : 'Pending Call Confirmation'}
                      </span>
                    </div>
                    <div>
                      <span className="text-muted block">
                        {locale === 'bn' ? 'পেমেন্ট স্ট্যাটাস:' : 'Payment Status:'}
                      </span>
                      <span className="font-semibold text-ink">
                        {isManualPayment
                          ? locale === 'bn'
                            ? 'বিকাশ TrxID ভেরিফিকেশন পেন্ডিং'
                            : 'Pending TrxID Verification'
                          : locale === 'bn'
                          ? 'ডেলিভারির সময় প্রদেয় (COD)'
                          : 'Unpaid (Pay on Delivery)'}
                      </span>
                    </div>
                  </div>
                </div>

                {submitError && (
                  <div
                    role="alert"
                    className="p-3 border border-danger rounded-[var(--radius-md)] bg-bg text-xs font-medium text-danger flex items-center gap-2"
                  >
                    <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{submitError}</span>
                  </div>
                )}

                <Button
                  type="submit"
                  variant="primary"
                  size="lg"
                  disabled={isSubmitting || isCheckingPromo || !quoteReady || !selectedPayment || sessionStatus === 'loading' || sessionStatus === 'error'}
                  className="w-full min-h-[46px] text-sm font-bold shadow-sm"
                  leftIcon={
                    <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  }
                >
                  {isSubmitting
                    ? locale === 'bn'
                      ? 'অর্ডার প্রসেস হচ্ছে...'
                      : 'Processing Order...'
                    : `${dict.common.confirmOrder} (${formatPoishaToBdt(
                        totalPayablePoisha,
                        locale
                      )})`}
                </Button>
              </Card>
            </div>

            {/* Mobile Sticky Order Confirmation Bar (< 1024px) */}
            <div className="lg:hidden fixed bottom-[calc(3.5rem+max(16px,env(safe-area-inset-bottom)))] md:bottom-0 left-0 right-0 z-30 p-3 bg-surface/95 backdrop-blur border-t border-border shadow-lg flex items-center justify-between gap-3 safe-bottom">
              <div>
                <p className="text-[11px] text-muted">{dict.common.total}</p>
                <p className="text-sm font-bold text-ink tabular-nums">
                  {formatPoishaToBdt(totalPayablePoisha, locale)}
                </p>
              </div>
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={isSubmitting || isCheckingPromo || !quoteReady || !selectedPayment || sessionStatus === 'loading' || sessionStatus === 'error'}
                className="min-h-[42px] px-4 font-bold"
                leftIcon={<ShieldCheck className="w-4 h-4" aria-hidden="true" />}
              >
                {isSubmitting
                  ? locale === 'bn'
                    ? 'প্রসেসিং...'
                    : 'Processing...'
                  : dict.common.confirmOrder}
              </Button>
            </div>
          </form>
        )}
      </div>
    </StorefrontShell>
  );
}
