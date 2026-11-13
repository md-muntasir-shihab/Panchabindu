'use client';

// src/components/storefront/account-client.tsx
// Professional Customer Account & User ID Dashboard:
//   - Customer Profile Banner with Avatar, User ID, and Quick Stats
//   - Tabbed Navigation: Order Tracking, Phone OTP Orders, Saved Addresses, Wishlist
//   - 1-Click Reorder, Address Management, & Live Order Status Lookup

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  User,
  Heart,
  PackageSearch,
  ArrowRight,
  Trash2,
  Smartphone,
  RotateCcw,
  MapPin,
  Plus,
  ShieldCheck,
  Package,
  CheckCircle2,
  Copy,
  Check,
} from 'lucide-react';
import type {
  CategoryRecord,
  PublicOrderTrackingDTO,
  PublicSafeSiteSettingsDTO,
} from '@/src/lib/db/repository';
import type { StorefrontProductDTO } from '@/src/types/domain';
import {
  BD_DISTRICTS,
  getDistrictById,
  getUpazilaById,
  getUpazilasByDistrict,
} from '@/src/lib/geo/bd-geocode';
import { formatPoishaToBdt } from '@/src/lib/money';
import { formatLocaleNumber } from '@/src/lib/i18n/dictionaries';
import { useLocaleStore } from '@/src/store/use-locale-store';
import { useCartStore } from '@/src/store/use-cart-store';
import { useWishlistStore } from '@/src/store/use-wishlist-store';
import { Badge, Button, Card, EmptyState, Input } from '../ui/primitives';
import { ProductCard } from './product-card';
import { StorefrontShell } from './storefront-shell';

export interface SavedCustomerAddress {
  id: string;
  label: string;
  districtId: number;
  upazilaId: number;
  streetAddress: string;
  landmark: string;
}

export interface AccountClientProps {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
  products: StorefrontProductDTO[];
}

export function AccountClient({
  siteSettings,
  categories,
  products,
}: AccountClientProps) {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const dict = useLocaleStore((s) => s.t());

  const wishlistIds = useWishlistStore((s) => s.productIds);
  const clearWishlist = useWishlistStore((s) => s.clearWishlist);
  const addItem = useCartStore((s) => s.addItem);
  const setCartOpen = useCartStore((s) => s.setDrawerOpen);

  const [activeTab, setActiveTab] = React.useState<
    'tracking' | 'orders' | 'addresses' | 'wishlist'
  >('tracking');

  const [orderLookupNo, setOrderLookupNo] = React.useState('');
  const [recentOrders, setRecentOrders] = React.useState<string[]>([]);

  // Phone + OTP Login for Customer Order History (Phase 1 Hardened)
  const [loginPhone, setLoginPhone] = React.useState('');
  const [otpCode, setOtpCode] = React.useState('');
  const [otpSentMessage, setOtpSentMessage] = React.useState<string | null>(null);
  const [sandboxOtpPreview, setSandboxOtpPreview] = React.useState<string | null>(null);
  const [smsProviderStatus, setSmsProviderStatus] = React.useState<
    'INTEGRATED' | 'NOT_INTEGRATED' | 'SANDBOX_TEST_ONLY'
  >('NOT_INTEGRATED');
  const [verifiedPhone, setVerifiedPhone] = React.useState<string | null>(null);
  const [customerOrders, setCustomerOrders] = React.useState<
    PublicOrderTrackingDTO[]
  >([]);
  const [authLoading, setAuthLoading] = React.useState(false);
  const [otpRequestLoading, setOtpRequestLoading] = React.useState(false);
  const [authError, setAuthError] = React.useState<string | null>(null);

  // Saved Delivery Addresses
  const [savedAddresses, setSavedAddresses] = React.useState<
    SavedCustomerAddress[]
  >([]);
  const [addrLabel, setAddrLabel] = React.useState('');
  const [addrDistrictId, setAddrDistrictId] = React.useState<number>(47);
  const [addrUpazilaId, setAddrUpazilaId] = React.useState<number>(365);
  const [addrStreet, setAddrStreet] = React.useState('');
  const [addrLandmark, setAddrLandmark] = React.useState('');
  const [isCopiedId, setIsCopiedId] = React.useState(false);

  // Policy-Aware Return Request State (Phase 6 Section 9.3)
  const [returnTargetOrderNo, setReturnTargetOrderNo] = React.useState<string | null>(null);
  const [returnReasonCode, setReturnReasonCode] = React.useState<
    'damaged_in_transit' | 'wrong_item_sent' | 'quality_defect' | 'size_or_variant_mismatch'
  >('quality_defect');
  const [returnDetailsBn, setReturnDetailsBn] = React.useState('');
  const [returnSubmitting, setReturnSubmitting] = React.useState(false);
  const [returnFeedback, setReturnFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const wishlistedProducts = products.filter((p) =>
    wishlistIds.includes(p.productId)
  );

  React.useEffect(() => {
    const controller = new AbortController();
    fetch('/api/account/orders', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Account unavailable');
        const data = await response.json() as {
          authenticated?: boolean;
          customerPhone?: string;
          providerStatus?: 'INTEGRATED' | 'NOT_INTEGRATED' | 'SANDBOX_TEST_ONLY';
          orders?: PublicOrderTrackingDTO[];
        };
        if (controller.signal.aborted) return;
        setSmsProviderStatus(data.providerStatus ?? 'NOT_INTEGRATED');
        if (data.authenticated && typeof data.customerPhone === 'string') {
          setVerifiedPhone(data.customerPhone);
          setLoginPhone(data.customerPhone);
          setCustomerOrders(Array.isArray(data.orders) ? data.orders : []);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) setAuthError('অ্যাকাউন্টের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।');
      });
    const frame = window.requestAnimationFrame(() => {
      try {
        const recent: unknown = JSON.parse(window.localStorage.getItem('bg_recent_orders') ?? '[]');
        if (Array.isArray(recent)) setRecentOrders(recent.filter((value): value is string => typeof value === 'string').slice(0, 10));
        const addresses: unknown = JSON.parse(window.localStorage.getItem('bg_saved_addresses') ?? '[]');
        if (Array.isArray(addresses)) setSavedAddresses(addresses.filter((value): value is SavedCustomerAddress => Boolean(value && typeof value === 'object' && typeof value.id === 'string' && typeof value.label === 'string' && typeof value.streetAddress === 'string' && typeof value.landmark === 'string' && Number.isInteger(value.districtId) && Number.isInteger(value.upazilaId))));
      } catch {
        setAuthError('এই ব্রাউজারে সংরক্ষিত তথ্য পড়া যায়নি।');
      }
      const tab = new URLSearchParams(window.location.search).get('tab');
      if (tab === 'orders' || tab === 'addresses' || tab === 'wishlist' || tab === 'tracking') setActiveTab(tab);
    });
    return () => { controller.abort(); window.cancelAnimationFrame(frame); };
  }, []);

  const handleCopyUserId = async () => {
    if (!verifiedPhone) return;
    try {
      await navigator.clipboard.writeText(verifiedPhone);
      setIsCopiedId(true);
      setTimeout(() => setIsCopiedId(false), 1500);
    } catch {
      setAuthError('কপি করা যায়নি। নম্বরটি নির্বাচন করে কপি করুন।');
    }
  };

  const handleLogout = async () => {
    if (authLoading) return;
    setAuthLoading(true);
    setAuthError(null);
    try {
      const response = await fetch('/api/account/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
      const data = await response.json() as { success?: boolean };
      if (!response.ok || !data.success) throw new Error('Logout failed');
      setVerifiedPhone(null);
      setCustomerOrders([]);
      setOtpCode('');
      setSandboxOtpPreview(null);
      setOtpSentMessage(null);
      router.refresh();
    } catch {
      setAuthError('লগআউট করা যায়নি। আবার চেষ্টা করুন।');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleTrackOrder = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = orderLookupNo.trim();
    if (clean) {
      router.push(`/order-tracking/${encodeURIComponent(clean)}`);
    }
  };

  const handleRequestOtp = async () => {
    setAuthError(null);
    setOtpSentMessage(null);
    setSandboxOtpPreview(null);
    setOtpRequestLoading(true);
    try {
      const res = await fetch('/api/account/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'request_otp',
          customerPhone: loginPhone,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        providerStatus?: 'INTEGRATED' | 'NOT_INTEGRATED' | 'SANDBOX_TEST_ONLY';
        sandboxOtpPreview?: string;
        messageBn?: string;
        errorBn?: string;
      };
      if (data.providerStatus) {
        setSmsProviderStatus(data.providerStatus);
      }
      if (!res.ok || !data.success) {
        setAuthError(data.errorBn ?? 'ওটিপি পাঠানো সম্ভব হয়নি।');
      } else {
        setOtpSentMessage(data.messageBn ?? 'ওটিপি কোড জেনারেট হয়েছে।');
        if (data.sandboxOtpPreview) {
          setSandboxOtpPreview(data.sandboxOtpPreview);
          setOtpCode(data.sandboxOtpPreview);
        }
      }
    } catch {
      setAuthError('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।');
    } finally {
      setOtpRequestLoading(false);
    }
  };

  const handleVerifyPhoneOrders = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthLoading(true);
    try {
      const res = await fetch('/api/account/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_otp',
          customerPhone: loginPhone,
          otpCode,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
        customerPhone?: string;
        orders?: PublicOrderTrackingDTO[];
      };
      if (!res.ok || !data.success) {
        setAuthError(data.errorBn ?? 'ভেরিফিকেশন ব্যর্থ হয়েছে।');
      } else {
        setVerifiedPhone(data.customerPhone ?? loginPhone);
        setCustomerOrders(data.orders ?? []);
        setOtpSentMessage(null);
        if (new URLSearchParams(window.location.search).get('returnTo') === 'checkout') router.push('/checkout');
      }
    } catch {
      setAuthError('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSubmitReturnRequest = async (ord: PublicOrderTrackingDTO) => {
    setReturnFeedback(null);
    setReturnSubmitting(true);
    try {
      const res = await fetch('/api/orders/return-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          orderNo: ord.orderNo,
          secureTrackingToken: ord.secureTrackingToken,
          reasonCode: returnReasonCode,
          detailsBn: returnDetailsBn,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        messageBn: string;
        newStatus?: string;
      };
      if (!res.ok || !data.success) {
        setReturnFeedback({
          type: 'error',
          text: data.messageBn ?? 'রিটার্ন অনুরোধ পাঠানো যায়নি।',
        });
      } else {
        setReturnFeedback({
          type: 'success',
          text: data.messageBn,
        });
        setCustomerOrders((prev) =>
          prev.map((o) =>
            o.orderNo === ord.orderNo
              ? { ...o, status: 'return_initiated' }
              : o
          )
        );
        setReturnTargetOrderNo(null);
        setReturnDetailsBn('');
      }
    } catch {
      setReturnFeedback({
        type: 'error',
        text: 'নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।',
      });
    } finally {
      setReturnSubmitting(false);
    }
  };

  const handleReorder = (order: PublicOrderTrackingDTO) => {
    for (const line of order.items) {
      for (const prod of products) {
        const variant = prod.variants.find((v) => v.publicSku === line.publicSku);
        if (variant && variant.stockAvailable > 0) {
          addItem(
            {
              productId: prod.productId,
              variantId: variant.variantId,
              slug: prod.slug,
              nameBn: prod.nameBn,
              nameEn: prod.nameEn,
              variantTitleBn: variant.titleBn,
              variantTitleEn: variant.titleEn,
              publicSku: variant.publicSku,
              imageUrl: variant.imageUrl ?? prod.images[0] ?? null,
              unitSalePricePoisha: variant.salePricePoisha,
              compareAtPricePoisha: variant.compareAtPricePoisha,
              weightGrams: variant.weightGrams,
              maxStockAvailable: variant.stockAvailable,
              isFreeDeliveryProduct: prod.isFreeDelivery,
            },
            Math.min(line.quantity, variant.stockAvailable)
          );
        }
      }
    }
    setCartOpen(true);
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrStreet.trim()) return;
    const next: SavedCustomerAddress[] = [
      {
        id: `addr-${Date.now()}`,
        label: addrLabel.trim() || 'ডেলিভারি ঠিকানা',
        districtId: addrDistrictId,
        upazilaId: addrUpazilaId,
        streetAddress: addrStreet.trim(),
        landmark: addrLandmark.trim(),
      },
      ...savedAddresses,
    ];
    setSavedAddresses(next);
    setAddrLabel('');
    setAddrStreet('');
    setAddrLandmark('');
    try {
      window.localStorage.setItem('bg_saved_addresses', JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  };

  const handleRemoveAddress = (id: string) => {
    const next = savedAddresses.filter((a) => a.id !== id);
    setSavedAddresses(next);
    try {
      window.localStorage.setItem('bg_saved_addresses', JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  };

  return (
    <StorefrontShell siteSettings={siteSettings} categories={categories}>
      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8 space-y-8 pb-24 md:pb-12">
        {/* 1. Customer User ID Header Banner */}
        <Card
          surface="surface"
          padding="lg"
          className="border border-border rounded-[var(--radius-lg)] bg-surface shadow-sm"
        >
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="relative w-14 h-14 sm:w-16 sm:h-16 rounded-full bg-ink text-bg flex items-center justify-center font-bold text-xl sm:text-2xl shadow-md shrink-0 border-2 border-border">
                <User className="w-7 h-7 sm:w-8 sm:h-8" aria-hidden="true" />
              </div>

              <div className="space-y-1">
                {verifiedPhone && <Button variant="outline" size="sm" onClick={handleLogout} isLoading={authLoading}>{locale === 'bn' ? 'লগআউট' : 'Log out'}</Button>}
                <div className="flex items-center gap-2">
                  <h1 className="text-lg sm:text-2xl font-bold text-ink tracking-tight">
                    {verifiedPhone
                      ? locale === 'bn'
                        ? `গ্রাহক: ${verifiedPhone}`
                        : `Customer: ${verifiedPhone}`
                      : locale === 'bn'
                      ? 'মাই অ্যাকাউন্ট ও ড্যাশবোর্ড'
                      : 'My Account & Dashboard'}
                  </h1>
                  {verifiedPhone ? (
                    <Badge status="success">
                      <CheckCircle2 className="w-3 h-3" aria-hidden="true" />
                      {smsProviderStatus === 'SANDBOX_TEST_ONLY' ? 'Sandbox session' : locale === 'bn' ? 'লগইন করা আছে' : 'Signed in'}
                    </Badge>
                  ) : (
                    <Badge status="neutral">
                      {locale === 'bn' ? 'গেস্ট অ্যাকাউন্ট' : 'Guest Account'}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-muted">
                  <span className="font-mono">
                    {locale === 'bn' ? 'মোবাইল: ' : 'Phone: '}{verifiedPhone ?? '—'}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyUserId}
                    aria-label="Copy phone number"
                    disabled={!verifiedPhone}
                    className="p-1 hover:text-ink cursor-pointer inline-flex items-center gap-1"
                  >
                    {isCopiedId ? (
                      <Check className="w-3.5 h-3.5 text-success" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Stats Badges */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 shrink-0">
              <div className="p-3 border border-border rounded-[var(--radius-md)] bg-bg text-center">
                <p className="text-[11px] text-muted font-medium">
                  {locale === 'bn' ? 'মোট অর্ডার' : 'Total Orders'}
                </p>
                <p className="text-sm sm:text-base font-bold text-ink tabular-nums mt-0.5">
                  {formatLocaleNumber(
                    customerOrders.length,
                    locale
                  )}
                </p>
              </div>

              <div className="p-3 border border-border rounded-[var(--radius-md)] bg-bg text-center">
                <p className="text-[11px] text-muted font-medium">
                  {locale === 'bn' ? 'উইশলিস্ট' : 'Wishlist'}
                </p>
                <p className="text-sm sm:text-base font-bold text-ink tabular-nums mt-0.5">
                  {formatLocaleNumber(wishlistedProducts.length, locale)}
                </p>
              </div>

              <div className="p-3 border border-border rounded-[var(--radius-md)] bg-bg text-center">
                <p className="text-[11px] text-muted font-medium">
                  {locale === 'bn' ? 'ঠিকানা' : 'Addresses'}
                </p>
                <p className="text-sm sm:text-base font-bold text-ink tabular-nums mt-0.5">
                  {formatLocaleNumber(savedAddresses.length, locale)}
                </p>
              </div>
            </div>
          </div>
        </Card>

        {/* 2. Dashboard Tab Navigation */}
        <div className="flex border-b border-border gap-2 overflow-x-auto scrollbar-none pb-0.5">
          <button
            type="button"
            onClick={() => setActiveTab('tracking')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'tracking'
                ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-md)]'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <PackageSearch className="w-4 h-4" aria-hidden="true" />
            <span>{locale === 'bn' ? 'লাইভ ট্র্যাকিং' : 'Live Order Tracking'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('orders')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'orders'
                ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-md)]'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Smartphone className="w-4 h-4" aria-hidden="true" />
            <span>{locale === 'bn' ? 'অর্ডার হিস্ট্রি ও ওটিপি' : 'Order History'}</span>
            {customerOrders.length > 0 && (
              <Badge status="info">
                {formatLocaleNumber(customerOrders.length, locale)}
              </Badge>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('addresses')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'addresses'
                ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-md)]'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <MapPin className="w-4 h-4" aria-hidden="true" />
            <span>{locale === 'bn' ? 'সংরক্ষিত ঠিকানা' : 'Saved Addresses'}</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('wishlist')}
            className={`px-4 py-2.5 text-xs sm:text-sm font-bold border-b-2 whitespace-nowrap transition-colors cursor-pointer flex items-center gap-2 ${
              activeTab === 'wishlist'
                ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-md)]'
                : 'border-transparent text-muted hover:text-ink'
            }`}
          >
            <Heart className="w-4 h-4" aria-hidden="true" />
            <span>{dict.common.wishlist}</span>
            {wishlistedProducts.length > 0 && (
              <Badge status="neutral">
                {formatLocaleNumber(wishlistedProducts.length, locale)}
              </Badge>
            )}
          </button>
        </div>

        {/* 3. Tab Panel 1: Order Lookup */}
        {activeTab === 'tracking' && (
          <Card surface="bg" padding="md" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-1">
                <h2 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                  <PackageSearch className="w-5 h-5 text-ink" aria-hidden="true" />
                  <span>
                    {locale === 'bn'
                      ? 'আপনার পার্সেল ট্র্যাক করুন'
                      : 'Track Your Parcel'}
                  </span>
                </h2>
                <p className="text-xs text-muted">
                  {locale === 'bn'
                    ? 'অর্ডার নম্বর লিখে রিয়েল-টাইম কুরিয়ার ও পেমেন্ট স্ট্যাটাস দেখুন।'
                    : 'Enter your Order No for live courier tracking status.'}
                </p>
              </div>

              <form
                onSubmit={handleTrackOrder}
                className="flex items-center gap-2 w-full sm:w-auto"
              >
                <input
                  type="text"
                  value={orderLookupNo}
                  onChange={(e) => setOrderLookupNo(e.target.value)}
                  placeholder="ORD-261106-0001"
                  aria-label="Order Number"
                  className="flex-1 sm:w-56 min-h-[44px] px-3.5 py-2 text-sm font-mono uppercase bg-surface text-ink border border-border rounded-[var(--radius-md)] focus:outline-2 focus:outline-ink"
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  rightIcon={<ArrowRight className="w-4 h-4" aria-hidden="true" />}
                >
                  {locale === 'bn' ? 'ট্র্যাক করুন' : 'Track'}
                </Button>
              </form>
            </div>

            {recentOrders.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-border text-xs">
                <span className="text-muted font-medium">
                  {locale === 'bn' ? 'সাম্প্রতিক অর্ডার:' : 'Recent Orders:'}
                </span>
                {recentOrders.map((ordNo) => (
                  <Link
                    key={ordNo}
                    href={`/order-tracking/${encodeURIComponent(ordNo)}`}
                    className="px-2.5 py-1 font-mono font-bold border border-border rounded-[var(--radius-sm)] bg-surface text-ink hover:border-ink"
                  >
                    {ordNo}
                  </Link>
                ))}
              </div>
            )}
          </Card>
        )}

        {/* 4. Tab Panel 2: Phone OTP Order History */}
        {activeTab === 'orders' && (
          <Card surface="bg" padding="md" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <h2 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                <Smartphone className="w-5 h-5" aria-hidden="true" />
                <span>
                  {locale === 'bn'
                    ? 'মোবাইল ওটিপি দিয়ে অর্ডার হিস্ট্রি'
                    : 'Phone OTP Verified Order History'}
                </span>
              </h2>
              <Badge
                status={
                  smsProviderStatus === 'INTEGRATED'
                    ? 'success'
                    : smsProviderStatus === 'NOT_INTEGRATED'
                    ? 'warning'
                    : 'info'
                }
              >
                {smsProviderStatus === 'INTEGRATED'
                  ? 'SMS Gateway: Connected'
                  : smsProviderStatus === 'NOT_INTEGRATED'
                  ? 'SMS Gateway: NOT_INTEGRATED'
                  : 'SMS Gateway: NOT_INTEGRATED (Sandbox OTP)'}
              </Badge>
            </div>

            <form
              onSubmit={handleVerifyPhoneOrders}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 items-end"
            >
              <Input
                label={locale === 'bn' ? 'মোবাইল নম্বর' : 'Mobile Number'}
                value={loginPhone}
                onChange={(e) => setLoginPhone(e.target.value)}
                placeholder="01712345678"
                required
              />
              <Button
                type="button"
                variant="outline"
                size="md"
                disabled={otpRequestLoading}
                onClick={handleRequestOtp}
              >
                {otpRequestLoading
                  ? locale === 'bn'
                    ? 'পাঠানো হচ্ছে...'
                    : 'Requesting...'
                  : locale === 'bn'
                  ? '১. ওটিপি কোড চান'
                  : '1. Request OTP'}
              </Button>
              <Input
                label={locale === 'bn' ? 'ওটিপি কোড (৬ সংখ্যা)' : 'OTP Code (6 Digits)'}
                value={otpCode}
                onChange={(e) => setOtpCode(e.target.value)}
                placeholder="6-Digit OTP"
                required
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={authLoading || otpCode.trim().length !== 6}
              >
                {authLoading
                  ? locale === 'bn'
                    ? 'যাচাই হচ্ছে...'
                    : 'Verifying...'
                  : locale === 'bn'
                  ? '২. অর্ডার হিস্ট্রি দেখুন'
                  : '2. Verify & View Orders'}
              </Button>
            </form>

            {otpSentMessage && (
              <p className="text-xs font-medium text-ink bg-surface border border-border p-2.5 rounded-[var(--radius-sm)]">
                {otpSentMessage}
                {sandboxOtpPreview ? (
                  <span className="ml-2 font-mono font-bold">
                    [Sandbox OTP: {sandboxOtpPreview}]
                  </span>
                ) : null}
              </p>
            )}

            {authError && (
              <p className="text-xs font-medium text-danger">{authError}</p>
            )}

            {verifiedPhone && (
              <div className="space-y-3 pt-3 border-t border-border">
                <p className="text-xs font-semibold text-success flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  {locale === 'bn'
                    ? `${verifiedPhone} নম্বরের অর্ডার তালিকা (${customerOrders.length} টি):`
                    : `Verified Orders for ${verifiedPhone} (${customerOrders.length}):`}
                </p>
                {customerOrders.length === 0 ? (
                  <p className="text-xs text-muted">
                    {locale === 'bn'
                      ? 'এই নম্বরে কোনো অর্ডার পাওয়া যায়নি।'
                      : 'No orders found for this phone number.'}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {customerOrders.map((ord) => (
                      <div
                        key={ord.orderNo}
                        className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface flex flex-wrap items-center justify-between gap-3 shadow-2xs"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <Link
                              href={`/order-tracking/${encodeURIComponent(
                                ord.secureTrackingToken || ord.orderNo
                              )}`}
                              className="font-mono text-sm font-bold text-ink hover:underline"
                            >
                              {ord.orderNo}
                            </Link>
                            <Badge status="info">{ord.status}</Badge>
                          </div>
                          <p className="text-xs text-muted">
                            {ord.items
                              .map(
                                (i) => `${i.productNameBn} × ${i.quantity}`
                              )
                              .join(', ')}
                          </p>
                          <p className="text-xs font-bold text-ink tabular-nums">
                            {formatPoishaToBdt(
                              ord.totalPayablePoisha,
                              locale
                            )}
                          </p>
                        </div>

                        <div className="flex items-center gap-2">
                          {ord.status === 'delivered' && (
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              onClick={() => {
                                setReturnTargetOrderNo(
                                  returnTargetOrderNo === ord.orderNo
                                    ? null
                                    : ord.orderNo
                                );
                                setReturnFeedback(null);
                              }}
                            >
                              {locale === 'bn'
                                ? 'রিটার্ন অনুরোধ করুন'
                                : 'Request Return'}
                            </Button>
                          )}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleReorder(ord)}
                            leftIcon={
                              <RotateCcw
                                className="w-3.5 h-3.5"
                                aria-hidden="true"
                              />
                            }
                          >
                            {locale === 'bn'
                              ? 'পুনরায় অর্ডার করুন'
                              : 'Reorder'}
                          </Button>
                        </div>

                        {returnTargetOrderNo === ord.orderNo && (
                          <div className="w-full pt-3 mt-2 border-t border-border space-y-3 text-xs">
                            <p className="font-bold text-ink">
                              {locale === 'bn'
                                ? `${ord.orderNo}-এর জন্য রিটার্ন অনুরোধ ফর্ম (শুধুমাত্র ডেলিভারি সম্পন্ন অর্ডারের জন্য প্রযোজ্য)`
                                : `Return Request for ${ord.orderNo}`}
                            </p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <label
                                  htmlFor={`ret-reason-${ord.orderNo}`}
                                  className="block text-[11px] font-semibold text-muted mb-1"
                                >
                                  {locale === 'bn' ? 'রিটার্নের কারণ *' : 'Reason *'}
                                </label>
                                <select
                                  id={`ret-reason-${ord.orderNo}`}
                                  value={returnReasonCode}
                                  onChange={(e) =>
                                    setReturnReasonCode(
                                      e.target.value as typeof returnReasonCode
                                    )
                                  }
                                  className="w-full h-10 px-3 rounded-[var(--radius-md)] border border-border bg-bg text-xs text-ink"
                                >
                                  <option value="quality_defect">
                                    {locale === 'bn'
                                      ? 'পণ্যের মান বা বুননে ত্রুটি (Quality Defect)'
                                      : 'Quality Defect'}
                                  </option>
                                  <option value="damaged_in_transit">
                                    {locale === 'bn'
                                      ? 'পরিবহনে ক্ষতিগ্রস্ত (Damaged in Transit)'
                                      : 'Damaged in Transit'}
                                  </option>
                                  <option value="wrong_item_sent">
                                    {locale === 'bn'
                                      ? 'ভুল পণ্য বা ভ্যারিয়েন্ট এসেছে (Wrong Item)'
                                      : 'Wrong Item Sent'}
                                  </option>
                                  <option value="size_or_variant_mismatch">
                                    {locale === 'bn'
                                      ? 'মাপ বা সাইজ অমিল (Size Mismatch)'
                                      : 'Size Mismatch'}
                                  </option>
                                </select>
                              </div>
                              <Input
                                label={
                                  locale === 'bn'
                                    ? 'বিস্তারিত বিবরণ (কমপক্ষে ৫ অক্ষর) *'
                                    : 'Details (Min 5 chars) *'
                                }
                                value={returnDetailsBn}
                                onChange={(e) => setReturnDetailsBn(e.target.value)}
                                placeholder={
                                  locale === 'bn'
                                    ? 'যেমন: শাড়ির পাড়ে সামান্য সুতা ছেঁড়া রয়েছে...'
                                    : 'Describe the issue...'
                                }
                              />
                            </div>
                            <div className="flex items-center justify-end gap-2">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setReturnTargetOrderNo(null)}
                              >
                                {locale === 'bn' ? 'বাতিল' : 'Cancel'}
                              </Button>
                              <Button
                                type="button"
                                variant="primary"
                                size="sm"
                                disabled={
                                  returnSubmitting ||
                                  returnDetailsBn.trim().length < 5
                                }
                                onClick={() => handleSubmitReturnRequest(ord)}
                              >
                                {returnSubmitting
                                  ? locale === 'bn'
                                    ? 'জমা হচ্ছে...'
                                    : 'Submitting...'
                                  : locale === 'bn'
                                  ? 'রিটার্ন অনুরোধ জমা দিন'
                                  : 'Submit Return Request'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {returnFeedback && (
                  <p
                    className={`text-xs font-semibold p-2.5 rounded-[var(--radius-sm)] border ${
                      returnFeedback.type === 'success'
                        ? 'text-success border-success bg-surface'
                        : 'text-danger border-danger bg-surface'
                    }`}
                  >
                    {returnFeedback.text}
                  </p>
                )}
              </div>
            )}
          </Card>
        )}

        {/* 5. Tab Panel 3: Saved Delivery Addresses */}
        {activeTab === 'addresses' && (
          <Card surface="bg" padding="md" className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-base sm:text-lg font-bold text-ink flex items-center gap-2">
                <MapPin className="w-5 h-5 text-ink" aria-hidden="true" />
                <span>
                  {locale === 'bn' ? 'এই ব্রাউজারে সংরক্ষিত ঠিকানা' : 'Addresses saved in this browser'}
                </span>
              </h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {savedAddresses.map((addr) => {
                const dist = getDistrictById(addr.districtId);
                const upz = getUpazilaById(addr.upazilaId);
                return (
                  <div
                    key={addr.id}
                    className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface flex items-start justify-between gap-2 text-xs shadow-2xs"
                  >
                    <div className="space-y-1">
                      <span className="px-2 py-0.5 text-[10px] font-bold border border-border rounded-[var(--radius-sm)] bg-bg text-ink">
                        {addr.label}
                      </span>
                      <p className="font-semibold text-ink pt-1">{addr.streetAddress}</p>
                      <p className="text-muted">
                        {upz?.name_bn}, {dist?.name_bn}
                        {addr.landmark ? ` (${addr.landmark})` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => { if (window.confirm(locale === 'bn' ? 'এই ঠিকানাটি মুছে ফেলবেন?' : 'Remove this address?')) handleRemoveAddress(addr.id); }}
                      aria-label="Remove address"
                      className="text-muted hover:text-danger cursor-pointer p-1"
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                );
              })}
            </div>

            <form
              onSubmit={handleSaveAddress}
              className="space-y-3 pt-3 border-t border-border"
            >
              <h3 className="text-xs sm:text-sm font-bold text-ink">
                {locale === 'bn' ? 'নতুন ঠিকানা যোগ করুন' : 'Add New Address'}
              </h3>
              <Input
                label={
                  locale === 'bn'
                    ? 'ঠিকানার নাম (যেমন: বাসা / অফিস)'
                    : 'Address Label (Home / Office)'
                }
                value={addrLabel}
                onChange={(e) => setAddrLabel(e.target.value)}
                placeholder={locale === 'bn' ? 'বাসা' : 'Home'}
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-ink">
                    {locale === 'bn' ? 'জেলা' : 'District'}
                  </label>
                  <select
                    aria-label="Select District"
                    value={addrDistrictId}
                    onChange={(e) => {
                      const dId = Number(e.target.value);
                      setAddrDistrictId(dId);
                      const firstUpz = getUpazilasByDistrict(dId)[0];
                      if (firstUpz) setAddrUpazilaId(firstUpz.id);
                    }}
                    className="w-full min-h-[42px] px-3 py-2 text-xs bg-surface text-ink border border-border rounded-[var(--radius-md)]"
                  >
                    {BD_DISTRICTS.map((d) => (
                      <option key={d.id} value={d.id}>
                        {locale === 'bn' ? d.name_bn : d.name_en}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-semibold text-ink">
                    {locale === 'bn' ? 'উপজেলা / থানা' : 'Upazila / Thana'}
                  </label>
                  <select
                    aria-label="Select Upazila"
                    value={addrUpazilaId}
                    onChange={(e) => setAddrUpazilaId(Number(e.target.value))}
                    className="w-full min-h-[42px] px-3 py-2 text-xs bg-surface text-ink border border-border rounded-[var(--radius-md)]"
                  >
                    {getUpazilasByDistrict(addrDistrictId).map((u) => (
                      <option key={u.id} value={u.id}>
                        {locale === 'bn' ? u.name_bn : u.name_en}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Input
                  label={locale === 'bn' ? 'বিস্তারিত ঠিকানা *' : 'Street Address *'}
                  value={addrStreet}
                  onChange={(e) => setAddrStreet(e.target.value)}
                  placeholder={
                    locale === 'bn'
                      ? 'বাড়ি, রোড ও এলাকার নাম'
                      : 'House, Road & Area'
                  }
                  required
                />
                <Input
                  label={
                    locale === 'bn' ? 'পরিচিত স্থান (Landmark)' : 'Nearby Landmark'
                  }
                  value={addrLandmark}
                  onChange={(e) => setAddrLandmark(e.target.value)}
                  placeholder={
                    locale === 'bn' ? 'যেমন: ওভারব্রিজের পাশে' : 'e.g. Near Overbridge'
                  }
                />
              </div>

              <Button
                type="submit"
                variant="outline"
                size="md"
                leftIcon={<Plus className="w-4 h-4" aria-hidden="true" />}
              >
                {locale === 'bn' ? 'নতুন ঠিকানা সেভ করুন' : 'Save New Address'}
              </Button>
            </form>
          </Card>
        )}

        {/* 6. Tab Panel 4: Saved Wishlist Section */}
        {activeTab === 'wishlist' && (
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 className="text-lg sm:text-xl font-bold text-ink flex items-center gap-2">
                <Heart className="w-5 h-5 text-ink" aria-hidden="true" />
                <span>
                  {dict.common.wishlist} ({formatLocaleNumber(wishlistedProducts.length, locale)})
                </span>
              </h2>
              {wishlistedProducts.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearWishlist}
                  leftIcon={<Trash2 className="w-3.5 h-3.5" aria-hidden="true" />}
                >
                  {locale === 'bn' ? 'সব মুছুন' : 'Clear All'}
                </Button>
              )}
            </div>

            {wishlistedProducts.length === 0 ? (
              <EmptyState
                icon={<Heart className="w-6 h-6" aria-hidden="true" />}
                title={
                  locale === 'bn'
                    ? 'আপনার পছন্দের তালিকায় কোনো পণ্য নেই'
                    : 'Your wishlist is empty'
                }
                description={
                  locale === 'bn'
                    ? 'পণ্যের কার্ডের হার্ট আইকনে ট্যাপ করে পরবর্তীতে কেনার জন্য সেভ করে রাখুন।'
                    : 'Tap the heart icon on any product card to save items for later.'
                }
                actionLabel={dict.common.continueShopping}
                onAction={() => router.push('/')}
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                {wishlistedProducts.map((product) => (
                  <ProductCard key={product.productId} product={product} />
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </StorefrontShell>
  );
}
