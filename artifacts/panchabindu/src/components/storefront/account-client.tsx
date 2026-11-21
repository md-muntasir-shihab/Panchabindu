'use client';
import { fetchWithTimeout, isTimeoutError } from '@/lib/http/fetch-with-timeout';
import { localizedFetch as fetch } from '@/lib/i18n/localized-fetch';
import { uiText } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/storefront/account-client.tsx
// Professional Customer Account & User ID Dashboard:
//   - Customer Profile Banner with Avatar, User ID, and Quick Stats
//   - Tabbed Navigation: Order Tracking, Account Orders, Saved Addresses, Wishlist
//   - 1-Click Reorder, Address Management, & Live Order Status Lookup

import * as React from 'react';
import { Link } from 'wouter';
import { useLocation } from 'wouter';
import { useQueryClient } from '@tanstack/react-query';
import { usePageDataRefresh } from '@/lib/page-data/context';
import {
  Heart,
  ArrowRight,
  Trash2,
  RotateCcw,
  CheckCircle2,
  Copy,
  Check,
  ChevronDown,
  Plus,
  Phone,
  Mail,
  SlidersHorizontal,
  MapPin,
} from 'lucide-react';
import type {
  CategoryRecord,
  PublicOrderTrackingDTO,
  PublicSafeSiteSettingsDTO,
} from '@/lib/db/repository';
import type { StorefrontProductDTO } from '@/types/domain';
import {
  BD_DISTRICTS,
  getDistrictById,
  getUpazilaById,
  getThanasByDistrict,
} from '@/lib/geo/bd-geocode';
import {
  getPathaoAreasByZone,
  getPathaoZonesByCity,
  resolveGeoCourierDefaults,
} from '@/lib/geo/bd-courier-geo';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { useLocaleStore } from '@/store/use-locale-store';
import { useCartStore } from '@/store/use-cart-store';
import { useWishlistStore } from '@/store/use-wishlist-store';
import { EmptyState } from '../ui/primitives';
import { ProductCard } from './product-card';
import { StorefrontShell } from './storefront-shell';

export interface SavedCustomerAddress {
  id: string;
  label: string;
  districtId: number;
  upazilaId: number;
  postCode?: string;
  recipientCity?: string;
  recipientZone?: string;
  recipientArea?: string;
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
  const [, navigate] = useLocation();
  const refreshPageData = usePageDataRefresh();
  const queryClient = useQueryClient();
  const locale = useLocaleStore((s) => s.locale);
  const dict = useLocaleStore((s) => s.t());

  const wishlistIds = useWishlistStore((s) => s.productIds);
  const clearWishlist = useWishlistStore((s) => s.clearWishlist);
  const addItem = useCartStore((s) => s.addItem);
  const setCartOpen = useCartStore((s) => s.setDrawerOpen);

  const [activeTab, setActiveTab] = React.useState<
    'tracking' | 'orders' | 'addresses' | 'wishlist'
  >('orders');

  const [deliveryProfile, setDeliveryProfile] = React.useState<{
    customerName: string;
    customerPhone: string;
    customerEmail: string | null;
    districtId?: number;
    upazilaId?: number;
    postCode?: string;
    recipientCity?: string;
    recipientZone?: string;
    recipientArea?: string;
    streetAddress: string;
    landmark: string;
  } | null>(null);
  const [personalSaving, setPersonalSaving] = React.useState(false);
  const [personalFeedback, setPersonalFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [profileSaving, setProfileSaving] = React.useState(false);
  const [profileFeedback, setProfileFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [profName, setProfName] = React.useState('');
  const [profPhone, setProfPhone] = React.useState('');
  const [profEmail, setProfEmail] = React.useState('');
  const [profDistrictId, setProfDistrictId] = React.useState<number>(47);
  const [profUpazilaId, setProfUpazilaId] = React.useState<number>(365);
  const [profPostCode, setProfPostCode] = React.useState('1209');
  const [profCity, setProfCity] = React.useState('Dhaka');
  const [profZone, setProfZone] = React.useState('Dhanmondi');
  const [profArea, setProfArea] = React.useState('Dhanmondi 27');
  const [profStreet, setProfStreet] = React.useState('');
  const [profLandmark, setProfLandmark] = React.useState('');
  const [showDefaultCourierAdvanced, setShowDefaultCourierAdvanced] = React.useState(false);
  const [orderLookupNo, setOrderLookupNo] = React.useState('');
  const [recentOrders, setRecentOrders] = React.useState<string[]>([]);

  const [loginPhone, setLoginPhone] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [newPassword, setNewPassword] = React.useState('');
  const [registering, setRegistering] = React.useState(false);
  const [verifiedPhone, setVerifiedPhone] = React.useState<string | null>(null);
  const [authBypassed, setAuthBypassed] = React.useState(false);
  const [customerOrders, setCustomerOrders] = React.useState<PublicOrderTrackingDTO[]>([]);
  const [authLoading, setAuthLoading] = React.useState(false);
  const [sessionLoading, setSessionLoading] = React.useState(true);
  const [sessionRetry, setSessionRetry] = React.useState(0);
  const [authError, setAuthError] = React.useState<string | null>(null);
  const [authNotice, setAuthNotice] = React.useState<string | null>(null);

  // Saved Delivery Addresses
  const [savedAddresses, setSavedAddresses] = React.useState<
    SavedCustomerAddress[]
  >([]);
  const [isAddAddressOpen, setIsAddAddressOpen] = React.useState(false);
  const [showAddCourierAdvanced, setShowAddCourierAdvanced] = React.useState(false);
  const [addrLabel, setAddrLabel] = React.useState('');
  const [addrDistrictId, setAddrDistrictId] = React.useState<number>(47);
  const [addrUpazilaId, setAddrUpazilaId] = React.useState<number>(365);
  const [addrPostCode, setAddrPostCode] = React.useState('1209');
  const [addrCity, setAddrCity] = React.useState('Dhaka');
  const [addrZone, setAddrZone] = React.useState('Dhanmondi');
  const [addrArea, setAddrArea] = React.useState('Dhanmondi 27');
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
    let disposed = false;
    const sessionTimer = window.setTimeout(
      () => controller.abort(new DOMException('Request timed out', 'TimeoutError')),
      15_000,
    );
    setSessionLoading(true);
    fetch('/api/account/orders', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Account unavailable');
        const data = await response.json() as {
          authenticated?: boolean;
          authBypassed?: boolean;
          customerPhone?: string;
          customerEmail?: string | null;
          identifier?: string;
          deliveryProfile?: {
            customerName: string;
            customerPhone: string;
            customerEmail: string | null;
            districtId?: number;
            upazilaId?: number;
            postCode?: string;
            recipientCity?: string;
            recipientZone?: string;
            recipientArea?: string;
            streetAddress: string;
            landmark: string;
          } | null;
          orders?: PublicOrderTrackingDTO[];
        };
        if (controller.signal.aborted) return;
        if (data.authenticated && typeof data.customerPhone === 'string') {
          setVerifiedPhone(data.identifier || data.customerPhone);
          setAuthBypassed(Boolean(data.authBypassed));
          setLoginPhone(data.identifier || data.customerPhone);
          setCustomerOrders(Array.isArray(data.orders) ? data.orders : []);
          const prof = data.deliveryProfile ?? null;
          setDeliveryProfile(prof);
          setProfPhone(prof?.customerPhone || data.customerPhone || '');
          setProfEmail(prof?.customerEmail || data.customerEmail || '');
          if (prof) {
            const dId = prof.districtId ?? 47;
            const uId =
              prof.upazilaId ?? getThanasByDistrict(dId)[0]?.id ?? 365;
            const resolved = resolveGeoCourierDefaults({
              districtId: dId,
              upazilaId: uId,
              streetAddress: prof.streetAddress,
              landmark: prof.landmark,
              existingPostCode: prof.postCode,
              existingCity: prof.recipientCity,
              existingZone: prof.recipientZone,
              existingArea: prof.recipientArea,
            });
            setProfName(prof.customerName || '');
            setProfDistrictId(dId);
            setProfUpazilaId(uId);
            setProfPostCode(resolved.postCode);
            setProfCity(resolved.recipientCity);
            setProfZone(resolved.recipientZone);
            setProfArea(resolved.recipientArea);
            setProfStreet(prof.streetAddress || '');
            setProfLandmark(prof.landmark || '');
          }
        }
      })
      .catch(() => {
        if (!disposed) setAuthError(locale === 'bn' ? 'অ্যাকাউন্টের তথ্য লোড করা যায়নি। আবার চেষ্টা করুন।' : 'Could not load your account. Please try again.');
      }).finally(() => { window.clearTimeout(sessionTimer); if (!disposed) setSessionLoading(false); });
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
    return () => { disposed = true; window.clearTimeout(sessionTimer); controller.abort(); window.cancelAnimationFrame(frame); };
  }, [sessionRetry, locale]);

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
      queryClient.removeQueries({ predicate: query => query.queryKey[0] === 'page-data' && String(query.queryKey[1]).startsWith('/order-tracking') });
      setVerifiedPhone(null);
      setLoginPhone('');
      setCustomerOrders([]);
      setDeliveryProfile(null);
      setPassword('');
      refreshPageData();
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
      navigate(`/order-tracking/${encodeURIComponent(clean)}`);
    }
  };

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthError(null); setAuthNotice(null); setAuthLoading(true);
    try {
      const identifier = loginPhone.trim();
      const payload = registering ? { action: 'register', ...(identifier.includes('@') ? { email: identifier } : { phone: identifier }), password } : { action: 'login', identifier, password };
      const res = await fetchWithTimeout('/api/account/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json() as { success: boolean; errorBn?: string; errorEn?: string; customerPhone?: string; identifier?: string; deliveryProfile?: { customerName: string; customerPhone: string; customerEmail: string | null; districtId?: number; upazilaId?: number; postCode?: string; recipientCity?: string; recipientZone?: string; recipientArea?: string; streetAddress: string; landmark: string } | null; orders?: PublicOrderTrackingDTO[] };
      if (!res.ok || !data.success) setAuthError((locale === 'bn' ? data.errorBn : data.errorEn) ?? (locale === 'bn' ? 'লগইন করা যায়নি।' : 'Unable to sign in.'));
      else {
        queryClient.removeQueries({ predicate: query => query.queryKey[0] === 'page-data' && String(query.queryKey[1]).startsWith('/order-tracking') });
        setVerifiedPhone(data.identifier || identifier);
        setCustomerOrders(data.orders ?? []);
        const prof = data.deliveryProfile ?? null;
        setDeliveryProfile(prof);
        setProfName(prof?.customerName || '');
        setProfPhone(prof?.customerPhone || data.customerPhone || (identifier.includes('@') ? '' : identifier));
        setProfEmail(prof?.customerEmail || (identifier.includes('@') ? identifier : ''));
        if (prof) {
          const dId = prof.districtId ?? 47;
          const uId = prof.upazilaId ?? getThanasByDistrict(dId)[0]?.id ?? 365;
          setProfDistrictId(dId);
          setProfUpazilaId(uId);
          setProfPostCode(prof.postCode || '1209');
          setProfCity(prof.recipientCity || 'Dhaka');
          setProfZone(prof.recipientZone || 'Dhanmondi');
          setProfArea(prof.recipientArea || 'Dhanmondi 27');
          setProfStreet(prof.streetAddress || '');
          setProfLandmark(prof.landmark || '');
        }
        setPassword('');
        refreshPageData();
        const params = new URLSearchParams(window.location.search);
        if (params.get('returnTo') === 'checkout') navigate('/checkout');
        else if (params.get('returnTo') === 'tracking') {
          const reference = params.get('orderNo') || '';
          navigate(reference ? `/order-tracking/${encodeURIComponent(reference)}` : '/order-tracking');
        }
      }
    } catch (error) { setAuthError(isTimeoutError(error)
      ? 'সার্ভার সময়মতো সাড়া দেয়নি। ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।'
      : locale === 'bn' ? 'নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।' : 'Network error. Please try again.'); }
    finally { setAuthLoading(false); }
  };
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault(); setAuthLoading(true); setAuthError(null); setAuthNotice(null);
    try {
      const res = await fetch('/api/account/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'change_password', currentPassword: password, newPassword }) });
      const data = await res.json() as { success: boolean; errorBn?: string; errorEn?: string };
      if (!res.ok || !data.success) setAuthError((locale === 'bn' ? data.errorBn : data.errorEn) ?? 'Password change failed.');
      else { setVerifiedPhone(null); setCustomerOrders([]); setDeliveryProfile(null); setPassword(''); setNewPassword(''); setAuthNotice(locale === 'bn' ? 'পাসওয়ার্ড পরিবর্তিত হয়েছে। আবার লগইন করুন।' : 'Password changed. Please sign in again.'); }
    } catch { setAuthError(locale === 'bn' ? 'নেটওয়ার্ক ত্রুটি।' : 'Network error.'); }
    finally { setAuthLoading(false); }
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

  const handleSavePersonalProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profName.trim().length < 2) return;
    setPersonalSaving(true);
    setPersonalFeedback(null);
    try {
      const res = await fetch('/api/account/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_personal_profile',
          customerName: profName.trim(),
          customerPhone: profPhone.trim() || undefined,
          customerEmail: profEmail.trim() || null,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        errorBn?: string;
        deliveryProfile?: typeof deliveryProfile;
      };
      if (!res.ok || !data.success) {
        setPersonalFeedback({
          type: 'error',
          text:
            data.errorBn ??
            (locale === 'bn'
              ? 'ব্যক্তিগত তথ্য সেভ করা যায়নি।'
              : 'Could not update personal details.'),
        });
      } else {
        if (data.deliveryProfile) {
          setDeliveryProfile(data.deliveryProfile);
          setProfName(data.deliveryProfile.customerName || profName.trim());
          setProfPhone(data.deliveryProfile.customerPhone || profPhone.trim());
          setProfEmail(data.deliveryProfile.customerEmail || '');
        }
        setPersonalFeedback({
          type: 'success',
          text:
            locale === 'bn'
              ? 'আপনার নাম, মোবাইল নম্বর ও ইমেইল সংরক্ষিত হয়েছে।'
              : 'Your name, mobile number, and email have been updated.',
        });
      }
    } catch {
      setPersonalFeedback({
        type: 'error',
        text:
          locale === 'bn'
            ? 'নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।'
            : 'Network error. Please try again.',
      });
    } finally {
      setPersonalSaving(false);
    }
  };

  const handleSaveDefaultProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profStreet.trim()) return;
    setProfileSaving(true);
    setProfileFeedback(null);
    try {
      const res = await fetch('/api/account/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_delivery_profile',
          customerName: profName.trim() || deliveryProfile?.customerName || 'গ্রাহক',
          customerPhone: profPhone.trim() || undefined,
          customerEmail: profEmail.trim() || null,
          districtId: profDistrictId,
          upazilaId: profUpazilaId,
          postCode: profPostCode.trim(),
          recipientCity: profCity.trim(),
          recipientZone: profZone.trim(),
          recipientArea: profArea.trim(),
          streetAddress: profStreet.trim(),
          landmark: profLandmark.trim(),
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        errorBn?: string;
        deliveryProfile?: typeof deliveryProfile;
      };
      if (!res.ok || !data.success) {
        setProfileFeedback({
          type: 'error',
          text:
            data.errorBn ??
            (locale === 'bn'
              ? 'ডিফল্ট ঠিকানা সেভ করা যায়নি।'
              : 'Could not save default delivery address.'),
        });
      } else {
        if (data.deliveryProfile) {
          setDeliveryProfile(data.deliveryProfile);
        }
        setProfileFeedback({
          type: 'success',
          text:
            locale === 'bn'
              ? 'আপনার ডিফল্ট ডেলিভারি ঠিকানা সংরক্ষিত হয়েছে। পরবর্তী অর্ডারে এটি অটো-ফিল হবে।'
              : 'Your default delivery address has been saved and will auto-fill at checkout.',
        });
      }
    } catch {
      setProfileFeedback({
        type: 'error',
        text:
          locale === 'bn'
            ? 'নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।'
            : 'Network error. Please try again.',
      });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleSaveAddress = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addrStreet.trim()) return;
    const resolved = resolveGeoCourierDefaults({
      districtId: addrDistrictId,
      upazilaId: addrUpazilaId,
      streetAddress: addrStreet.trim(),
      landmark: addrLandmark.trim(),
      existingPostCode: addrPostCode,
      existingCity: addrCity,
      existingZone: addrZone,
      existingArea: addrArea,
    });
    const next: SavedCustomerAddress[] = [
      {
        id: `addr-${Date.now()}`,
        label: addrLabel.trim() || (locale === 'bn' ? 'ডেলিভারি ঠিকানা' : 'Delivery Address'),
        districtId: addrDistrictId,
        upazilaId: addrUpazilaId,
        postCode: resolved.postCode,
        recipientCity: resolved.recipientCity,
        recipientZone: resolved.recipientZone,
        recipientArea: resolved.recipientArea,
        streetAddress: addrStreet.trim(),
        landmark: addrLandmark.trim(),
      },
      ...savedAddresses,
    ];
    setSavedAddresses(next);
    setAddrLabel('');
    setAddrStreet('');
    setAddrLandmark('');
    setShowAddCourierAdvanced(false);
    setIsAddAddressOpen(false);
    try {
      window.localStorage.setItem('bg_saved_addresses', JSON.stringify(next));
    } catch {
      // Ignore storage error
    }
  };

  const handlePromoteAddressToDefault = (addr: SavedCustomerAddress) => {
    const resolved = resolveGeoCourierDefaults({
      districtId: addr.districtId,
      upazilaId: addr.upazilaId,
      streetAddress: addr.streetAddress,
      landmark: addr.landmark,
      existingPostCode: addr.postCode,
      existingCity: addr.recipientCity,
      existingZone: addr.recipientZone,
      existingArea: addr.recipientArea,
    });
    setProfDistrictId(addr.districtId);
    setProfUpazilaId(addr.upazilaId);
    setProfPostCode(resolved.postCode);
    setProfCity(resolved.recipientCity);
    setProfZone(resolved.recipientZone);
    setProfArea(resolved.recipientArea);
    setProfStreet(addr.streetAddress);
    setProfLandmark(addr.landmark);
    setProfileFeedback({
      type: 'success',
      text:
        locale === 'bn'
          ? 'ঠিকানাটি ডিফল্ট ফর্মে লোড হয়েছে — সংরক্ষণ করতে "ঠিকানা আপডেট করুন" চাপুন।'
          : 'Loaded into Default Delivery Address — click "Update Address" to save.',
    });
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

  const avatarInitial = React.useMemo(() => {
    const source =
      profName.trim() ||
      deliveryProfile?.customerName?.trim() ||
      (locale === 'bn' ? siteSettings.brandNameBn : siteSettings.brandNameEn) ||
      'P';
    return Array.from(source)[0]?.toUpperCase() || 'P';
  }, [profName, deliveryProfile?.customerName, locale, siteSettings.brandNameBn, siteSettings.brandNameEn]);

  const formatPaddedStat = (count: number) => {
    const padded = String(count).padStart(2, '0');
    return locale === 'bn'
      ? formatLocaleNumber(count, 'bn').padStart(2, '০')
      : padded;
  };

  const displayPhone = deliveryProfile?.customerPhone || profPhone || '';
  const displayEmail = deliveryProfile?.customerEmail || profEmail || '';
  const displayName = deliveryProfile?.customerName || profName || '';

  const editorialFieldLabel =
    'block text-[11px] uppercase font-semibold tracking-[0.06em] text-[#1B4332]/80';
  const editorialInputClass =
    'w-full min-h-[44px] rounded-lg border border-[#E5E2D9] bg-[#FDFCF8] px-3.5 py-2 text-sm text-[#1B4332] placeholder:text-[#1B4332]/40 focus:border-[#1B4332] focus:bg-white focus:outline-none transition-colors';
  const editorialSelectClass =
    'w-full min-h-[44px] rounded-lg border border-[#E5E2D9] bg-[#FDFCF8] px-3.5 py-2 text-sm text-[#1B4332] focus:border-[#1B4332] focus:bg-white focus:outline-none transition-colors cursor-pointer';
  const primaryEditorialBtn =
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-6 py-2.5 rounded-lg bg-[#1B4332] text-white font-mono text-xs uppercase tracking-[0.12em] hover:bg-[#143325] disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer';
  const outlineEditorialBtn =
    'inline-flex items-center justify-center gap-2 min-h-[44px] px-5 py-2.5 rounded-lg bg-transparent border border-[#1B4332]/35 text-[#1B4332] font-mono text-xs uppercase tracking-[0.12em] hover:border-[#1B4332] hover:bg-[#1B4332] hover:text-white disabled:opacity-50 disabled:pointer-events-none transition-colors cursor-pointer';

  return (
    <StorefrontShell siteSettings={siteSettings} categories={categories}>
      <div className="max-w-[1600px] min-w-0 mx-auto px-3.5 sm:px-8 lg:px-10 py-5 sm:py-10 pb-8 md:pb-14">
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5 sm:gap-8 lg:gap-10 items-start">
          {/* 1. Left Sidebar Profile Card */}
          <aside className="lg:sticky lg:top-28 min-w-0">
            <div className="bg-[#F9F8F3] p-4 sm:p-7 rounded-xl border border-[#E5E2D9]">
              <div
                aria-hidden="true"
                className="w-12 h-12 sm:w-16 sm:h-16 rounded-full bg-[#1B4332] text-white flex items-center justify-center font-display text-2xl sm:text-3xl font-semibold leading-none mb-3 sm:mb-4 select-none"
              >
                {avatarInitial}
              </div>

              <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-[#1B4332]/60 mb-1">
                {locale === 'bn' ? 'গ্রাহক প্রোফাইল' : 'Customer Profile'}
              </span>

              <h1 className="font-display text-xl sm:text-[1.85rem] font-semibold leading-tight text-[#1B4332] mb-2 break-words">
                {displayName || (locale === 'bn' ? 'আমার অ্যাকাউন্ট' : 'My Account')}
              </h1>

              {/* Clean Status & Logout Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 pb-3.5 sm:pb-4 border-b border-[#E5E2D9] text-xs">
                <span
                  className={`font-mono text-[11px] uppercase tracking-[0.06em] inline-flex items-center gap-1.5 ${
                    verifiedPhone ? 'text-[#15803D]' : 'text-[#1B4332]/60'
                  }`}
                >
                  {verifiedPhone && <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
                  {verifiedPhone
                    ? locale === 'bn'
                      ? 'লগইন করা আছে'
                      : 'Signed in'
                    : locale === 'bn'
                    ? 'গেস্ট অ্যাকাউন্ট'
                    : 'Guest Account'}
                </span>

                {verifiedPhone && !authBypassed && (
                  <button
                    type="button"
                    onClick={handleLogout}
                    disabled={authLoading}
                    className="inline-flex min-h-[36px] items-center px-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[#A84A28] hover:underline underline-offset-4 cursor-pointer disabled:opacity-50"
                  >
                    {locale === 'bn' ? 'লগআউট' : 'Log out'}
                  </button>
                )}
              </div>

              {/* Clean Contact Summary (ID, Mobile, Email — no repeated address clutter) */}
              <div className="mt-4 space-y-2.5 text-xs text-[#1B4332]/85">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[#1B4332]/55 shrink-0">
                    {locale === 'bn' ? 'আইডি' : 'ID'}
                  </span>
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-mono text-[11px] text-[#1B4332] truncate">
                      {verifiedPhone ?? '—'}
                    </span>
                    {verifiedPhone && (
                      <button
                        type="button"
                        onClick={handleCopyUserId}
                        aria-label={
                          locale === 'bn'
                            ? 'অ্যাকাউন্ট পরিচয় কপি করুন'
                            : 'Copy account identifier'
                        }
                        className="p-1 rounded-md text-[#1B4332]/60 hover:text-[#1B4332] hover:bg-white cursor-pointer inline-flex items-center shrink-0"
                      >
                        {isCopiedId ? (
                          <Check className="w-3.5 h-3.5 text-[#15803D]" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                {displayPhone && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[#1B4332]/60 shrink-0">
                      <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{locale === 'bn' ? 'মোবাইল' : 'Mobile'}</span>
                    </span>
                    <span className="font-mono text-[11px] text-[#1B4332] tabular-nums truncate">
                      {displayPhone}
                    </span>
                  </div>
                )}

                {displayEmail && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-[#1B4332]/60 shrink-0">
                      <Mail className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{locale === 'bn' ? 'ইমেইল' : 'Email'}</span>
                    </span>
                    <span className="text-[11px] text-[#1B4332] truncate">
                      {displayEmail}
                    </span>
                  </div>
                )}
              </div>

              {/* 3-Column Stats Grid */}
              <div className="grid grid-cols-3 gap-2 sm:gap-2.5 mt-4 sm:mt-6 pt-4 sm:pt-5 border-t border-[#E5E2D9]">
                <div className="text-center p-2 rounded-lg bg-[#FDFCF8] border border-[#E5E2D9]/70">
                  <span className="block font-display text-xl sm:text-2xl font-semibold text-[#1B4332] tabular-nums leading-none">
                    {verifiedPhone ? formatPaddedStat(customerOrders.length) : '—'}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-[#1B4332]/55 mt-1.5">
                    {locale === 'bn' ? 'অর্ডার' : 'Orders'}
                  </span>
                </div>

                <div className="text-center p-2 rounded-lg bg-[#FDFCF8] border border-[#E5E2D9]/70">
                  <span className="block font-display text-xl sm:text-2xl font-semibold text-[#1B4332] tabular-nums leading-none">
                    {formatPaddedStat(wishlistedProducts.length)}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-[#1B4332]/55 mt-1.5">
                    {locale === 'bn' ? 'উইশলিস্ট' : 'Wishlist'}
                  </span>
                </div>

                <div className="text-center p-2 rounded-lg bg-[#FDFCF8] border border-[#E5E2D9]/70">
                  <span className="block font-display text-xl sm:text-2xl font-semibold text-[#1B4332] tabular-nums leading-none">
                    {formatPaddedStat(savedAddresses.length + (deliveryProfile?.streetAddress ? 1 : 0))}
                  </span>
                  <span className="block font-mono text-[10px] uppercase tracking-[0.06em] text-[#1B4332]/55 mt-1.5">
                    {locale === 'bn' ? 'ঠিকানা' : 'Address'}
                  </span>
                </div>
              </div>
            </div>
          </aside>

          {/* 2. Right Content Shell */}
          <div className="flex flex-col gap-5 sm:gap-7 min-w-0">
            {/* Editorial Underline Tab Navigation */}
            <nav
              aria-label={locale === 'bn' ? 'অ্যাকাউন্ট মেনু' : 'Account navigation'}
              className="flex gap-5 sm:gap-9 border-b border-[#E5E2D9] overflow-x-auto scrollbar-none -mx-3.5 px-3.5 sm:mx-0 sm:px-0"
            >
              <button
                type="button"
                onClick={() => setActiveTab('tracking')}
                aria-current={activeTab === 'tracking' ? 'page' : undefined}
                className={`min-h-[44px] inline-flex items-center shrink-0 py-2.5 bg-transparent border-0 font-mono text-xs uppercase tracking-[0.1em] whitespace-nowrap cursor-pointer relative transition-opacity ${
                  activeTab === 'tracking'
                    ? 'opacity-100 text-[#1B4332] after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-[#1B4332]'
                    : 'opacity-50 hover:opacity-85 text-[#1B4332]'
                }`}
              >
                {locale === 'bn' ? 'অর্ডার স্ট্যাটাস' : 'Order Status'}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('orders')}
                aria-current={activeTab === 'orders' ? 'page' : undefined}
                className={`min-h-[44px] inline-flex items-center shrink-0 py-2.5 bg-transparent border-0 font-mono text-xs uppercase tracking-[0.1em] whitespace-nowrap cursor-pointer relative transition-opacity ${
                  activeTab === 'orders'
                    ? 'opacity-100 text-[#1B4332] after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-[#1B4332]'
                    : 'opacity-50 hover:opacity-85 text-[#1B4332]'
                }`}
              >
                {locale === 'bn'
                  ? `হিস্ট্রি (${formatLocaleNumber(customerOrders.length, locale)})`
                  : `History (${customerOrders.length})`}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('addresses')}
                aria-current={activeTab === 'addresses' ? 'page' : undefined}
                className={`min-h-[44px] inline-flex items-center shrink-0 py-2.5 bg-transparent border-0 font-mono text-xs uppercase tracking-[0.1em] whitespace-nowrap cursor-pointer relative transition-opacity ${
                  activeTab === 'addresses'
                    ? 'opacity-100 text-[#1B4332] after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-[#1B4332]'
                    : 'opacity-50 hover:opacity-85 text-[#1B4332]'
                }`}
              >
                {locale === 'bn' ? 'প্রোফাইল ও ঠিকানা' : 'Profile & Addresses'}
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('wishlist')}
                aria-current={activeTab === 'wishlist' ? 'page' : undefined}
                className={`min-h-[44px] inline-flex items-center shrink-0 py-2.5 bg-transparent border-0 font-mono text-xs uppercase tracking-[0.1em] whitespace-nowrap cursor-pointer relative transition-opacity ${
                  activeTab === 'wishlist'
                    ? 'opacity-100 text-[#1B4332] after:content-[""] after:absolute after:bottom-0 after:left-0 after:w-full after:h-[2px] after:bg-[#1B4332]'
                    : 'opacity-50 hover:opacity-85 text-[#1B4332]'
                }`}
              >
                {wishlistedProducts.length > 0
                  ? `${dict.common.wishlist} (${formatLocaleNumber(wishlistedProducts.length, locale)})`
                  : dict.common.wishlist}
              </button>
            </nav>

            {/* 3. Tab Panel 1: Order Lookup */}
            {activeTab === 'tracking' && (
              <section className="bg-white p-4 sm:p-8 rounded-xl border border-[#E5E2D9] shadow-[0_8px_24px_rgba(27,67,50,0.03)] space-y-5 sm:space-y-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3">
                  <h2 className="font-display text-2xl sm:text-[1.75rem] font-semibold text-[#1B4332]">
                    {locale === 'bn' ? 'অর্ডারের অবস্থা দেখুন' : 'Check Order Status'}
                  </h2>
                  <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#1B4332]/55">
                    {locale === 'bn' ? 'নিরাপদ ট্র্যাকিং' : 'Secure Lookup'}
                  </span>
                </div>

                <p className="text-sm text-[#1B4332]/70 max-w-2xl">
                  {locale === 'bn'
                    ? 'নিরাপদ ট্র্যাকিং টোকেন দিন, অথবা নিজের অর্ডার নম্বর দেখতে অ্যাকাউন্টে লগইন করুন। এখানে কুরিয়ারের লাইভ আপডেট দেখানো হয় না।'
                    : 'Enter a secure tracking token, or sign in to view your own order number. Live courier updates are not connected.'}
                </p>

                <form
                  onSubmit={handleTrackOrder}
                  className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-4 items-end pt-1"
                >
                  <div className="space-y-1.5">
                    <label htmlFor="order-lookup-input" className={editorialFieldLabel}>
                      {locale === 'bn'
                        ? 'ট্র্যাকিং টোকেন বা অর্ডার নম্বর'
                        : 'Tracking Token or Order Number'}
                    </label>
                    <input
                      id="order-lookup-input"
                      type="text"
                      value={orderLookupNo}
                      onChange={(e) => setOrderLookupNo(e.target.value)}
                      placeholder={
                        locale === 'bn'
                          ? 'trk_... অথবা নিজের অর্ডার নম্বর'
                          : 'trk_... or your order number'
                      }
                      aria-label={
                        locale === 'bn'
                          ? 'ট্র্যাকিং টোকেন বা অর্ডার নম্বর'
                          : 'Tracking token or order number'
                      }
                      className={`${editorialInputClass} font-mono`}
                    />
                  </div>
                  <button type="submit" className={primaryEditorialBtn}>
                    <span>{locale === 'bn' ? 'ট্র্যাক করুন' : 'Track Order'}</span>
                    <ArrowRight className="w-4 h-4" aria-hidden="true" />
                  </button>
                </form>

                {recentOrders.length > 0 && (
                  <div className="pt-5 border-t border-[#E5E2D9] flex flex-wrap items-center gap-2.5 text-xs">
                    <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[#1B4332]/55">
                      {locale === 'bn' ? 'সাম্প্রতিক অর্ডার:' : 'Recent Orders:'}
                    </span>
                    {recentOrders.map((ordNo) => (
                      <Link
                        key={ordNo}
                        href={`/order-tracking/${encodeURIComponent(ordNo)}`}
                        className="px-3 py-1.5 rounded-lg font-mono text-xs border border-[#E5E2D9] bg-[#F9F8F3] text-[#1B4332] hover:border-[#1B4332] transition-colors"
                      >
                        {ordNo}
                      </Link>
                    ))}
                  </div>
                )}
              </section>
            )}

            {/* 4. Tab Panel 2: Account Order History & Auth */}
            {activeTab === 'orders' && (
              <div className="space-y-5 sm:space-y-6">
                <section className="bg-white p-4 sm:p-8 rounded-xl border border-[#E5E2D9] shadow-[0_8px_24px_rgba(27,67,50,0.03)] space-y-5 sm:space-y-6">
                  <div className="flex flex-wrap items-baseline justify-between gap-3">
                    <h2 className="font-display text-2xl sm:text-[1.75rem] font-semibold text-[#1B4332]">
                      {verifiedPhone
                        ? locale === 'bn'
                          ? 'অর্ডার হিস্ট্রি'
                          : 'Order History'
                        : locale === 'bn'
                        ? 'গ্রাহক অ্যাকাউন্ট লগইন'
                        : 'Customer Account'}
                    </h2>
                    {verifiedPhone && (
                      <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-[#1B4332]/60">
                        {locale === 'bn'
                          ? `${formatLocaleNumber(customerOrders.length, locale)}টি অর্ডার`
                          : `${customerOrders.length} Orders`}
                      </span>
                    )}
                  </div>

                  {sessionLoading ? (
                    <p role="status" className="text-sm text-[#1B4332]/65 font-mono">
                      {locale === 'bn' ? 'অ্যাকাউন্ট যাচাই হচ্ছে…' : 'Checking your account…'}
                    </p>
                  ) : !verifiedPhone ? (
                    <div className="space-y-6">
                      <p className="text-sm text-[#1B4332]/70 max-w-2xl">
                        {locale === 'bn'
                          ? 'ফোন নম্বর বা ইমেইল ও পাসওয়ার্ড দিয়ে লগইন করুন। অতিথি হিসেবে করা অর্ডার স্বয়ংক্রিয়ভাবে যুক্ত হয় না।'
                          : 'Sign in with your phone number or email and password. Guest orders are not linked automatically.'}
                      </p>

                      <form
                        onSubmit={handlePasswordAuth}
                        className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
                      >
                        <div className="space-y-1.5">
                          <label htmlFor="account-login-identifier" className={editorialFieldLabel}>
                            {locale === 'bn' ? 'ফোন নম্বর অথবা ইমেইল' : 'Phone Number or Email'}
                          </label>
                          <input
                            id="account-login-identifier"
                            type="text"
                            value={loginPhone}
                            onChange={(e) => setLoginPhone(e.target.value)}
                            autoComplete="username"
                            required
                            className={editorialInputClass}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="account-login-password" className={editorialFieldLabel}>
                            {locale === 'bn' ? 'পাসওয়ার্ড' : 'Password'}
                          </label>
                          <input
                            id="account-login-password"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            minLength={registering ? 10 : 1}
                            maxLength={128}
                            autoComplete={registering ? 'new-password' : 'current-password'}
                            required
                            className={editorialInputClass}
                          />
                        </div>

                        <button type="submit" disabled={authLoading} className={primaryEditorialBtn}>
                          {registering
                            ? locale === 'bn'
                              ? 'অ্যাকাউন্ট তৈরি করুন'
                              : 'Create Account'
                            : locale === 'bn'
                            ? 'লগইন'
                            : 'Sign In'}
                        </button>
                      </form>

                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                        <button
                          type="button"
                          className="font-mono text-xs uppercase tracking-[0.08em] text-[#1B4332] underline underline-offset-4 cursor-pointer hover:text-[#A84A28]"
                          onClick={() => {
                            setRegistering(!registering);
                            setPassword('');
                            setAuthError(null);
                          }}
                        >
                          {registering
                            ? locale === 'bn'
                              ? 'আগেই অ্যাকাউন্ট আছে? লগইন'
                              : 'Already have an account? Sign in'
                            : locale === 'bn'
                            ? 'নতুন অ্যাকাউন্ট তৈরি করুন'
                            : 'Create an account'}
                        </button>

                        {registering && (
                          <p className="text-xs text-[#1B4332]/65">
                            {locale === 'bn'
                              ? 'পাসওয়ার্ড অন্তত ১০ অক্ষরের হতে হবে।'
                              : 'Use at least 10 characters for your password.'}
                          </p>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {authNotice && (
                    <p role="status" className="text-xs font-medium text-[#15803D] p-3.5 rounded-lg border border-[#15803D]/30 bg-[#F9F8F3]">
                      {authNotice}
                    </p>
                  )}

                  {authError && (
                    <div
                      role="alert"
                      className="text-xs font-medium text-[#B91C1C] p-3.5 rounded-lg border border-[#B91C1C]/30 bg-[#F9F8F3] space-y-1.5"
                    >
                      <p>{authError}</p>
                      {!verifiedPhone && (
                        <button
                          type="button"
                          className="font-mono uppercase tracking-[0.08em] underline cursor-pointer"
                          onClick={() => {
                            setAuthError(null);
                            setSessionRetry((n) => n + 1);
                          }}
                        >
                          {locale === 'bn' ? 'আবার চেষ্টা করুন' : 'Try again'}
                        </button>
                      )}
                    </div>
                  )}

                  {verifiedPhone && (
                    <div className="space-y-4">
                      {customerOrders.length === 0 ? (
                        <div className="p-8 rounded-xl border border-[#E5E2D9] bg-[#F9F8F3] text-center space-y-2">
                          <p className="text-sm text-[#1B4332]/75">
                            {locale === 'bn'
                              ? 'আপনার অ্যাকাউন্টে কোনো অর্ডার পাওয়া যায়নি।'
                              : 'No orders found in this account.'}
                          </p>
                        </div>
                      ) : (
                        <div className="divide-y divide-[#E5E2D9] rounded-xl border border-[#E5E2D9] overflow-hidden">
                          {customerOrders.map((ord) => (
                            <div
                              key={ord.orderNo}
                              className="p-4 sm:p-6 bg-[#F9F8F3]/60 hover:bg-[#F9F8F3] transition-colors flex flex-wrap items-center justify-between gap-3.5 sm:gap-4"
                            >
                              <div className="space-y-1.5 min-w-0 break-words">
                                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                                  <Link
                                    href={`/order-tracking/${encodeURIComponent(
                                      ord.secureTrackingToken || ord.orderNo
                                    )}`}
                                    className="font-mono text-sm font-bold text-[#1B4332] hover:underline underline-offset-4 break-all"
                                  >
                                    {ord.orderNo}
                                  </Link>
                                  <span className="text-[#1B4332]/30" aria-hidden="true">·</span>
                                  <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#A84A28]">
                                    {ord.status.replaceAll('_', ' ')}
                                  </span>
                                </div>
                                <p className="text-xs text-[#1B4332]/75">
                                  {ord.items
                                    .map((i) => `${i.productNameBn} × ${i.quantity}`)
                                    .join(', ')}
                                </p>
                                <p className="font-display text-lg font-bold text-[#1B4332] tabular-nums">
                                  {formatPoishaToBdt(ord.totalPayablePoisha, locale)}
                                </p>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                                <Link
                                  href={`/order-tracking/${encodeURIComponent(
                                    ord.secureTrackingToken || ord.orderNo
                                  )}`}
                                  className="inline-flex min-h-[44px] items-center justify-center px-3.5 sm:px-4 rounded-lg border border-[#1B4332]/35 text-[#1B4332] hover:border-[#1B4332] hover:bg-[#1B4332] hover:text-white font-mono text-[11px] uppercase tracking-[0.1em] transition-colors"
                                >
                                  {locale === 'bn' ? 'বিস্তারিত' : 'Details'}
                                </Link>

                                {ord.status === 'delivered' && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setReturnTargetOrderNo(
                                        returnTargetOrderNo === ord.orderNo ? null : ord.orderNo
                                      );
                                      setReturnFeedback(null);
                                    }}
                                    className="inline-flex min-h-[44px] items-center justify-center px-3.5 sm:px-4 rounded-lg border border-[#A84A28] text-[#A84A28] hover:bg-[#A84A28] hover:text-white font-mono text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer"
                                  >
                                    {locale === 'bn' ? 'রিটার্ন অনুরোধ' : 'Return'}
                                  </button>
                                )}

                                <button
                                  type="button"
                                  onClick={() => handleReorder(ord)}
                                  className="inline-flex min-h-[44px] items-center justify-center gap-1.5 px-3.5 sm:px-4 rounded-lg bg-[#1B4332] text-white hover:bg-[#143325] font-mono text-[11px] uppercase tracking-[0.1em] transition-colors cursor-pointer"
                                >
                                  <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                                  <span>{locale === 'bn' ? 'পুনরায় অর্ডার' : 'Reorder'}</span>
                                </button>
                              </div>

                              {returnTargetOrderNo === ord.orderNo && (
                                <div className="w-full pt-5 mt-3 border-t border-[#E5E2D9] space-y-4">
                                  <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-[#1B4332]">
                                    {locale === 'bn'
                                      ? `${ord.orderNo}-এর জন্য রিটার্ন অনুরোধ ফর্ম`
                                      : `Return Request for ${ord.orderNo}`}
                                  </p>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div className="space-y-1.5">
                                      <label
                                        htmlFor={`ret-reason-${ord.orderNo}`}
                                        className={editorialFieldLabel}
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
                                        className={editorialSelectClass}
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
                                    <div className="space-y-1.5">
                                      <label
                                        htmlFor={`ret-details-${ord.orderNo}`}
                                        className={editorialFieldLabel}
                                      >
                                        {locale === 'bn'
                                          ? 'বিস্তারিত বিবরণ (কমপক্ষে ৫ অক্ষর) *'
                                          : 'Details (Min 5 chars) *'}
                                      </label>
                                      <input
                                        id={`ret-details-${ord.orderNo}`}
                                        type="text"
                                        value={returnDetailsBn}
                                        onChange={(e) => setReturnDetailsBn(e.target.value)}
                                        placeholder={
                                          locale === 'bn'
                                            ? 'যেমন: শাড়ির পাড়ে সামান্য সুতা ছেঁড়া রয়েছে...'
                                            : 'Describe the issue...'
                                        }
                                        className={editorialInputClass}
                                      />
                                    </div>
                                  </div>
                                  <div className="flex flex-wrap items-center justify-end gap-2.5 pt-1">
                                    <button
                                      type="button"
                                      onClick={() => setReturnTargetOrderNo(null)}
                                      className="min-h-[44px] px-4 rounded-lg border border-[#E5E2D9] text-[#1B4332] font-mono text-[11px] uppercase tracking-[0.1em] hover:border-[#1B4332] cursor-pointer"
                                    >
                                      {locale === 'bn' ? 'বাতিল' : 'Cancel'}
                                    </button>
                                    <button
                                      type="button"
                                      disabled={
                                        returnSubmitting || returnDetailsBn.trim().length < 5
                                      }
                                      onClick={() => handleSubmitReturnRequest(ord)}
                                      className="min-h-[44px] px-4 rounded-lg bg-[#1B4332] text-white font-mono text-[11px] uppercase tracking-[0.1em] hover:bg-[#143325] disabled:opacity-50 cursor-pointer"
                                    >
                                      {returnSubmitting
                                        ? locale === 'bn'
                                          ? 'জমা হচ্ছে...'
                                          : 'Submitting...'
                                        : locale === 'bn'
                                        ? 'রিটার্ন জমা দিন'
                                        : 'Submit Return'}
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}

                      {returnFeedback && (
                        <p
                          className={`text-xs font-medium p-3.5 rounded-lg border ${
                            returnFeedback.type === 'success'
                              ? 'text-[#15803D] border-[#15803D]/35 bg-[#F9F8F3]'
                              : 'text-[#B91C1C] border-[#B91C1C]/35 bg-[#F9F8F3]'
                          }`}
                        >
                          {returnFeedback.text}
                        </p>
                      )}
                    </div>
                  )}
                </section>

                {/* Change Password Section */}
                {verifiedPhone && !authBypassed && (
                  <section className="bg-white p-4 sm:p-8 rounded-xl border border-[#E5E2D9] shadow-[0_8px_24px_rgba(27,67,50,0.03)] space-y-4 sm:space-y-5">
                    <h3 className="font-display text-xl sm:text-2xl font-semibold text-[#1B4332]">
                      {locale === 'bn' ? 'পাসওয়ার্ড পরিবর্তন' : 'Change Password'}
                    </h3>
                    <form
                      onSubmit={handleChangePassword}
                      className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
                    >
                      <div className="space-y-1.5">
                        <label htmlFor="account-current-pw" className={editorialFieldLabel}>
                          {locale === 'bn' ? 'বর্তমান পাসওয়ার্ড' : 'Current Password'}
                        </label>
                        <input
                          id="account-current-pw"
                          type="password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          autoComplete="current-password"
                          required
                          className={editorialInputClass}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <label htmlFor="account-new-pw" className={editorialFieldLabel}>
                          {locale === 'bn' ? 'নতুন পাসওয়ার্ড' : 'New Password'}
                        </label>
                        <input
                          id="account-new-pw"
                          type="password"
                          value={newPassword}
                          onChange={(e) => setNewPassword(e.target.value)}
                          minLength={10}
                          maxLength={128}
                          autoComplete="new-password"
                          required
                          className={editorialInputClass}
                        />
                      </div>
                      <button type="submit" disabled={authLoading} className={outlineEditorialBtn}>
                        {locale === 'bn' ? 'পাসওয়ার্ড পরিবর্তন' : 'Update Password'}
                      </button>
                    </form>
                  </section>
                )}
              </div>
            )}

            {/* 5. Tab Panel 3: Dedicated Personal Profile + Clean Addresses (Zero Duplication) */}
            {activeTab === 'addresses' && (
              <div className="flex flex-col gap-5 sm:gap-6">
                {verifiedPhone ? (
                  <>
                    {/* 5A. Dedicated Personal Information Card (Name, Mobile, Email) */}
                    <section className="bg-white p-4 sm:p-8 rounded-xl border border-[#E5E2D9] shadow-[0_8px_24px_rgba(27,67,50,0.03)] space-y-4 sm:space-y-5">
                      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#E5E2D9] pb-4">
                        <div>
                          <h2 className="font-display text-2xl sm:text-[1.65rem] font-semibold text-[#1B4332]">
                            {locale === 'bn' ? 'ব্যক্তিগত তথ্য' : 'Personal Information'}
                          </h2>
                          <p className="text-xs text-[#1B4332]/65 mt-0.5">
                            {locale === 'bn'
                              ? 'আপনার নাম, মোবাইল নম্বর ও ইমেইল এখান থেকে আপডেট করুন।'
                              : 'Keep your name, mobile number, and email updated for order notifications.'}
                          </p>
                        </div>
                      </div>

                      <form onSubmit={handleSavePersonalProfile} className="space-y-5">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <label htmlFor="prof-name" className={editorialFieldLabel}>
                              {locale === 'bn' ? 'পূর্ণ নাম *' : 'Full Name *'}
                            </label>
                            <input
                              id="prof-name"
                              type="text"
                              value={profName}
                              onChange={(e) => setProfName(e.target.value)}
                              placeholder={locale === 'bn' ? 'আপনার পূর্ণ নাম' : 'Your full name'}
                              minLength={2}
                              required
                              className={editorialInputClass}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label htmlFor="prof-phone" className={editorialFieldLabel}>
                              {locale === 'bn' ? 'মোবাইল নম্বর' : 'Mobile Number'}
                            </label>
                            <input
                              id="prof-phone"
                              type="tel"
                              value={profPhone}
                              onChange={(e) => setProfPhone(e.target.value)}
                              placeholder="01XXXXXXXXX"
                              className={`${editorialInputClass} font-mono`}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label htmlFor="prof-email" className={editorialFieldLabel}>
                              {locale === 'bn' ? 'ইমেইল' : 'Email Address'}
                            </label>
                            <input
                              id="prof-email"
                              type="email"
                              value={profEmail}
                              onChange={(e) => setProfEmail(e.target.value)}
                              placeholder="name@example.com"
                              className={editorialInputClass}
                            />
                          </div>
                        </div>

                        {personalFeedback && (
                          <p
                            role="status"
                            className={`text-xs font-medium p-3 rounded-lg border ${
                              personalFeedback.type === 'success'
                                ? 'text-[#15803D] border-[#15803D]/35 bg-[#F9F8F3]'
                                : 'text-[#B91C1C] border-[#B91C1C]/35 bg-[#F9F8F3]'
                            }`}
                          >
                            {personalFeedback.text}
                          </p>
                        )}

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={personalSaving}
                            className={`${primaryEditorialBtn} w-full sm:w-auto`}
                          >
                            {personalSaving
                              ? locale === 'bn'
                                ? 'সংরক্ষণ হচ্ছে...'
                                : 'Saving...'
                              : locale === 'bn'
                              ? 'তথ্য সংরক্ষণ করুন'
                              : 'Save Profile'}
                          </button>
                        </div>
                      </form>
                    </section>

                    {/* 5B. Clean Default Delivery Address Card (No Duplicate Name/Phone/Zone Walls) */}
                    <section className="bg-white p-4 sm:p-8 rounded-xl border border-[#E5E2D9] shadow-[0_8px_24px_rgba(27,67,50,0.03)] space-y-4 sm:space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E2D9] pb-4">
                        <div className="min-w-0">
                          <h2 className="font-display text-xl sm:text-[1.65rem] font-semibold text-[#1B4332]">
                            {locale === 'bn'
                              ? 'ডিফল্ট ডেলিভারি ঠিকানা'
                              : 'Default Delivery Address'}
                          </h2>
                          <p className="text-xs text-[#1B4332]/65 mt-0.5">
                            {locale === 'bn'
                              ? 'চেকআউটে স্বয়ংক্রিয়ভাবে এই ঠিকানা যুক্ত হবে।'
                              : 'Automatically pre-filled when you place an order.'}
                          </p>
                        </div>
                        <span className="inline-flex max-w-full min-w-0 items-center gap-1.5 px-3 py-1 rounded-lg bg-[#F9F8F3] border border-[#E5E2D9] font-mono text-[11px] text-[#1B4332]/75">
                          <MapPin className="w-3.5 h-3.5 text-[#A84A28] shrink-0" aria-hidden="true" />
                          <span className="truncate">
                            {profCity} → {profZone} ({profPostCode})
                          </span>
                        </span>
                      </div>

                      <form onSubmit={handleSaveDefaultProfile} className="space-y-5">
                        {/* Primary Row 1: District, Upazila / Thana, Post Code */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="space-y-1.5">
                            <label htmlFor="prof-district" className={editorialFieldLabel}>
                              {locale === 'bn' ? 'জেলা' : 'District'}
                            </label>
                            <select
                              id="prof-district"
                              aria-label={locale === 'bn' ? 'ডিফল্ট জেলা' : 'Default District'}
                              value={profDistrictId}
                              onChange={(e) => {
                                const dId = Number(e.target.value);
                                setProfDistrictId(dId);
                                const firstUpz = getThanasByDistrict(dId)[0];
                                const uId = firstUpz?.id ?? 365;
                                setProfUpazilaId(uId);
                                const synced = resolveGeoCourierDefaults({
                                  districtId: dId,
                                  upazilaId: uId,
                                  streetAddress: profStreet,
                                  landmark: profLandmark,
                                });
                                setProfPostCode(synced.postCode);
                                setProfCity(synced.recipientCity);
                                setProfZone(synced.recipientZone);
                                setProfArea(synced.recipientArea);
                              }}
                              className={editorialSelectClass}
                            >
                              {BD_DISTRICTS.map((d) => (
                                <option key={d.id} value={d.id}>
                                  {locale === 'bn' ? d.name_bn : d.name_en}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label htmlFor="prof-upazila" className={editorialFieldLabel}>
                              {locale === 'bn' ? 'উপজেলা / থানা' : 'Upazila / Thana'}
                            </label>
                            <select
                              id="prof-upazila"
                              aria-label={
                                locale === 'bn' ? 'ডিফল্ট উপজেলা বা থানা' : 'Default Upazila or Thana'
                              }
                              value={profUpazilaId}
                              onChange={(e) => {
                                const uId = Number(e.target.value);
                                setProfUpazilaId(uId);
                                const synced = resolveGeoCourierDefaults({
                                  districtId: profDistrictId,
                                  upazilaId: uId,
                                  streetAddress: profStreet,
                                  landmark: profLandmark,
                                });
                                setProfPostCode(synced.postCode);
                                setProfCity(synced.recipientCity);
                                setProfZone(synced.recipientZone);
                                setProfArea(synced.recipientArea);
                              }}
                              className={editorialSelectClass}
                            >
                              {getThanasByDistrict(profDistrictId).map((u) => (
                                <option key={u.id} value={u.id}>
                                  {locale === 'bn' ? u.name_bn : u.name_en}
                                </option>
                              ))}
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <label htmlFor="prof-postcode" className={editorialFieldLabel}>
                              {locale === 'bn' ? 'পোস্ট কোড' : 'Post Code'}
                            </label>
                            <input
                              id="prof-postcode"
                              type="text"
                              value={profPostCode}
                              maxLength={4}
                              onChange={(e) =>
                                setProfPostCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                              }
                              className={`${editorialInputClass} font-mono`}
                            />
                          </div>
                        </div>

                        {/* Primary Row 2: Street Address & Landmark */}
                        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                          <div className="space-y-1.5">
                            <label htmlFor="prof-street" className={editorialFieldLabel}>
                              {locale === 'bn'
                                ? 'বাড়ি, রোড ও এলাকার ঠিকানা *'
                                : 'Street Address (House, Road & Area) *'}
                            </label>
                            <input
                              id="prof-street"
                              type="text"
                              value={profStreet}
                              onChange={(e) => {
                                const val = e.target.value;
                                setProfStreet(val);
                                const synced = resolveGeoCourierDefaults({
                                  districtId: profDistrictId,
                                  upazilaId: profUpazilaId,
                                  streetAddress: val,
                                  landmark: profLandmark,
                                });
                                setProfZone(synced.recipientZone);
                                setProfArea(synced.recipientArea);
                              }}
                              placeholder={
                                locale === 'bn'
                                  ? 'বাড়ি ২৪, রোড ৭/এ, ধানমন্ডি'
                                  : 'House 24, Road 7/A, Dhanmondi'
                              }
                              required
                              className={editorialInputClass}
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label htmlFor="prof-landmark" className={editorialFieldLabel}>
                              {locale === 'bn' ? 'পরিচিত স্থান (ঐচ্ছিক)' : 'Nearby Landmark (Optional)'}
                            </label>
                            <input
                              id="prof-landmark"
                              type="text"
                              value={profLandmark}
                              onChange={(e) => setProfLandmark(e.target.value)}
                              placeholder={
                                locale === 'bn' ? 'যেমন: ওভারব্রিজের পাশে' : 'e.g. Near Overbridge'
                              }
                              className={editorialInputClass}
                            />
                          </div>
                        </div>

                        {/* Collapsible Courier Routing (Advanced) Toggle */}
                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setShowDefaultCourierAdvanced((prev) => !prev)}
                            aria-expanded={showDefaultCourierAdvanced}
                            className="inline-flex min-h-[44px] items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-[#1B4332]/75 hover:text-[#1B4332] hover:bg-[#F9F8F3] border border-transparent hover:border-[#E5E2D9] transition-colors cursor-pointer"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>
                              {locale === 'bn'
                                ? 'কুরিয়ার জোন ও এরিয়া (অ্যাডভান্সড)'
                                : 'Courier Zone & Area (Advanced)'}
                            </span>
                            <ChevronDown
                              className={`w-3.5 h-3.5 transition-transform duration-150 ${
                                showDefaultCourierAdvanced ? 'rotate-180' : ''
                              }`}
                              aria-hidden="true"
                            />
                          </button>

                          {showDefaultCourierAdvanced && (
                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#F9F8F3] p-4 rounded-xl border border-[#E5E2D9]">
                              <div className="space-y-1.5">
                                <label htmlFor="prof-city" className={editorialFieldLabel}>
                                  {locale === 'bn' ? 'কুরিয়ার সিটি' : 'Courier City'}
                                </label>
                                <input
                                  id="prof-city"
                                  type="text"
                                  value={profCity}
                                  onChange={(e) => setProfCity(e.target.value)}
                                  className={editorialInputClass}
                                />
                              </div>

                              <div className="space-y-1.5">
                                <label htmlFor="prof-zone" className={editorialFieldLabel}>
                                  {locale === 'bn' ? 'জোন' : 'Zone'}
                                </label>
                                <select
                                  id="prof-zone"
                                  value={profZone}
                                  onChange={(e) => {
                                    const z = e.target.value;
                                    setProfZone(z);
                                    const areas = getPathaoAreasByZone(z);
                                    if (areas[0]) setProfArea(areas[0]);
                                  }}
                                  className={editorialSelectClass}
                                >
                                  {Array.from(
                                    new Set([profZone, ...getPathaoZonesByCity(profCity)])
                                  )
                                    .filter(Boolean)
                                    .map((z) => (
                                      <option key={z} value={z}>
                                        {z}
                                      </option>
                                    ))}
                                </select>
                              </div>

                              <div className="space-y-1.5">
                                <label htmlFor="prof-area" className={editorialFieldLabel}>
                                  {locale === 'bn' ? 'এরিয়া' : 'Area'}
                                </label>
                                <select
                                  id="prof-area"
                                  value={profArea}
                                  onChange={(e) => setProfArea(e.target.value)}
                                  className={editorialSelectClass}
                                >
                                  {Array.from(
                                    new Set([profArea, ...getPathaoAreasByZone(profZone)])
                                  )
                                    .filter(Boolean)
                                    .map((a) => (
                                      <option key={a} value={a}>
                                        {a}
                                      </option>
                                    ))}
                                </select>
                              </div>
                            </div>
                          )}
                        </div>

                        {profileFeedback && (
                          <p
                            role="status"
                            className={`text-xs font-medium p-3 rounded-lg border ${
                              profileFeedback.type === 'success'
                                ? 'text-[#15803D] border-[#15803D]/35 bg-[#F9F8F3]'
                                : 'text-[#B91C1C] border-[#B91C1C]/35 bg-[#F9F8F3]'
                            }`}
                          >
                            {profileFeedback.text}
                          </p>
                        )}

                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={profileSaving}
                            className={`${primaryEditorialBtn} w-full sm:w-auto`}
                          >
                            {profileSaving
                              ? locale === 'bn'
                                ? 'সংরক্ষণ হচ্ছে...'
                                : 'Updating...'
                              : locale === 'bn'
                              ? 'ঠিকানা আপডেট করুন'
                              : 'Update Address'}
                          </button>
                        </div>
                      </form>
                    </section>
                  </>
                ) : (
                  <section className="bg-white p-4 sm:p-8 rounded-xl border border-[#E5E2D9] flex flex-wrap items-center justify-between gap-4">
                    <div className="space-y-1">
                      <h2 className="font-display text-xl font-semibold text-[#1B4332]">
                        {locale === 'bn' ? 'ব্যক্তিগত প্রোফাইল সংরক্ষণ করুন' : 'Sign in to manage your profile'}
                      </h2>
                      <p className="text-xs text-[#1B4332]/70">
                        {locale === 'bn'
                          ? 'নাম, মোবাইল, ইমেইল এবং ডিফল্ট ডেলিভারি ঠিকানা সিঙ্ক করতে লগইন করুন।'
                          : 'Sign in to save your name, mobile, email, and default checkout address.'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveTab('orders')}
                      className={`${primaryEditorialBtn} w-full sm:w-auto`}
                    >
                      {locale === 'bn' ? 'লগইন করুন' : 'Sign In'}
                    </button>
                  </section>
                )}

                {/* 5C. Saved Address Book + On-Demand Add New Address Panel */}
                <section className="bg-white p-4 sm:p-8 rounded-xl border border-[#E5E2D9] shadow-[0_8px_24px_rgba(27,67,50,0.03)] space-y-4 sm:space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#E5E2D9] pb-4">
                    <div>
                      <h2 className="font-display text-2xl sm:text-[1.65rem] font-semibold text-[#1B4332]">
                        {locale === 'bn' ? 'অতিরিক্ত সংরক্ষিত ঠিকানা' : 'Saved Addresses'}
                      </h2>
                      <p className="text-xs text-[#1B4332]/65 mt-0.5">
                        {locale === 'bn'
                          ? `বাসা, অফিস বা উপহারের ঠিকানা সংরক্ষণ করুন (${formatLocaleNumber(savedAddresses.length, locale)})`
                          : `Save home, office, or gift delivery addresses (${savedAddresses.length})`}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => setIsAddAddressOpen((prev) => !prev)}
                      aria-expanded={isAddAddressOpen}
                      className={outlineEditorialBtn}
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                      <span>
                        {isAddAddressOpen
                          ? locale === 'bn'
                            ? 'বন্ধ করুন'
                            : 'Close Form'
                          : locale === 'bn'
                          ? 'নতুন ঠিকানা যোগ করুন'
                          : 'Add New Address'}
                      </span>
                    </button>
                  </div>

                  {savedAddresses.length === 0 && !isAddAddressOpen ? (
                    <div className="p-6 rounded-xl bg-[#F9F8F3] border border-[#E5E2D9] text-center space-y-2">
                      <p className="text-sm text-[#1B4332]/75">
                        {locale === 'bn'
                          ? 'এখনো কোনো অতিরিক্ত ঠিকানা সংরক্ষণ করা হয়নি।'
                          : 'No extra delivery addresses saved yet.'}
                      </p>
                      <p className="text-xs text-[#1B4332]/55">
                        {locale === 'bn'
                          ? 'অফিস বা পরিবারের ঠিকানা যুক্ত করতে উপরের "নতুন ঠিকানা যোগ করুন" বাটনে ক্লিক করুন।'
                          : 'Click "Add New Address" above to save an office or family address.'}
                      </p>
                    </div>
                  ) : null}

                  {savedAddresses.length > 0 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {savedAddresses.map((addr) => {
                        const dist = getDistrictById(addr.districtId);
                        const upz = getUpazilaById(addr.upazilaId);
                        const geo = resolveGeoCourierDefaults({
                          districtId: addr.districtId,
                          upazilaId: addr.upazilaId,
                          streetAddress: addr.streetAddress,
                          landmark: addr.landmark,
                          existingPostCode: addr.postCode,
                          existingCity: addr.recipientCity,
                          existingZone: addr.recipientZone,
                          existingArea: addr.recipientArea,
                        });
                        return (
                          <div
                            key={addr.id}
                            className="p-4 border border-[#E5E2D9] rounded-xl bg-[#F9F8F3] flex flex-col justify-between gap-3 text-xs"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="space-y-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.08em] text-[#1B4332]/65">
                                  <span className="font-bold text-[#1B4332]">{addr.label}</span>
                                  <span aria-hidden="true">·</span>
                                  <span>{geo.postCode}</span>
                                </div>
                                <p className="font-medium text-sm text-[#1B4332] pt-0.5">
                                  {addr.streetAddress}
                                </p>
                                <p className="text-[#1B4332]/70">
                                  {locale === 'bn' ? upz?.name_bn : upz?.name_en},{' '}
                                  {locale === 'bn' ? dist?.name_bn : dist?.name_en}
                                  {addr.landmark ? ` (${addr.landmark})` : ''}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      locale === 'bn'
                                        ? 'এই ঠিকানাটি মুছে ফেলবেন?'
                                        : 'Remove this address?'
                                    )
                                  ) {
                                    handleRemoveAddress(addr.id);
                                  }
                                }}
                                aria-label={uiText('Remove address', locale)}
                                className="min-w-[40px] min-h-[40px] inline-flex items-center justify-center text-[#1B4332]/50 hover:text-[#B91C1C] cursor-pointer rounded-lg hover:bg-white transition-colors shrink-0"
                              >
                                <Trash2 className="w-4 h-4" aria-hidden="true" />
                              </button>
                            </div>

                            {verifiedPhone && (
                              <div className="pt-2 border-t border-[#E5E2D9]/80 flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono text-[10px] text-[#1B4332]/55 truncate">
                                  {geo.recipientCity} → {geo.recipientZone}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handlePromoteAddressToDefault(addr)}
                                  className="inline-flex min-h-[36px] items-center font-mono text-[11px] uppercase tracking-[0.06em] text-[#1B4332] hover:text-[#A84A28] underline underline-offset-4 cursor-pointer"
                                >
                                  {locale === 'bn' ? 'ডিফল্ট হিসেবে ব্যবহার করুন' : 'Use as Default'}
                                </button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* On-Demand Compact Add New Address Form */}
                  {isAddAddressOpen && (
                    <form
                      onSubmit={handleSaveAddress}
                      className="p-4 sm:p-6 rounded-xl bg-[#F9F8F3] border border-[#E5E2D9] space-y-4"
                    >
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label htmlFor="addr-label" className={editorialFieldLabel}>
                            {locale === 'bn'
                              ? 'ঠিকানার নাম (বাসা / অফিস)'
                              : 'Address Label (Home / Office)'}
                          </label>
                          <input
                            id="addr-label"
                            type="text"
                            value={addrLabel}
                            onChange={(e) => setAddrLabel(e.target.value)}
                            placeholder={locale === 'bn' ? 'যেমন: অফিস' : 'e.g. Office'}
                            className={editorialInputClass}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="addr-postcode" className={editorialFieldLabel}>
                            {locale === 'bn' ? 'পোস্ট কোড' : 'Post Code'}
                          </label>
                          <input
                            id="addr-postcode"
                            type="text"
                            value={addrPostCode}
                            maxLength={4}
                            placeholder="1200"
                            onChange={(e) =>
                              setAddrPostCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                            }
                            className={`${editorialInputClass} font-mono`}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                          <label htmlFor="addr-district" className={editorialFieldLabel}>
                            {locale === 'bn' ? 'জেলা' : 'District'}
                          </label>
                          <select
                            id="addr-district"
                            aria-label={uiText('Select District', locale)}
                            value={addrDistrictId}
                            onChange={(e) => {
                              const dId = Number(e.target.value);
                              setAddrDistrictId(dId);
                              const firstUpz = getThanasByDistrict(dId)[0];
                              const uId = firstUpz?.id ?? 365;
                              setAddrUpazilaId(uId);
                              const synced = resolveGeoCourierDefaults({
                                districtId: dId,
                                upazilaId: uId,
                                streetAddress: addrStreet,
                                landmark: addrLandmark,
                              });
                              setAddrPostCode(synced.postCode);
                              setAddrCity(synced.recipientCity);
                              setAddrZone(synced.recipientZone);
                              setAddrArea(synced.recipientArea);
                            }}
                            className={editorialSelectClass}
                          >
                            {BD_DISTRICTS.map((d) => (
                              <option key={d.id} value={d.id}>
                                {locale === 'bn' ? d.name_bn : d.name_en}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="addr-upazila" className={editorialFieldLabel}>
                            {locale === 'bn' ? 'উপজেলা / থানা' : 'Upazila / Thana'}
                          </label>
                          <select
                            id="addr-upazila"
                            aria-label={uiText('Select Upazila', locale)}
                            value={addrUpazilaId}
                            onChange={(e) => {
                              const uId = Number(e.target.value);
                              setAddrUpazilaId(uId);
                              const synced = resolveGeoCourierDefaults({
                                districtId: addrDistrictId,
                                upazilaId: uId,
                                streetAddress: addrStreet,
                                landmark: addrLandmark,
                              });
                              setAddrPostCode(synced.postCode);
                              setAddrCity(synced.recipientCity);
                              setAddrZone(synced.recipientZone);
                              setAddrArea(synced.recipientArea);
                            }}
                            className={editorialSelectClass}
                          >
                            {getThanasByDistrict(addrDistrictId).map((u) => (
                              <option key={u.id} value={u.id}>
                                {locale === 'bn' ? u.name_bn : u.name_en}
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr] gap-4">
                        <div className="space-y-1.5">
                          <label htmlFor="addr-street" className={editorialFieldLabel}>
                            {locale === 'bn' ? 'বিস্তারিত ঠিকানা *' : 'Street Address *'}
                          </label>
                          <input
                            id="addr-street"
                            type="text"
                            value={addrStreet}
                            onChange={(e) => setAddrStreet(e.target.value)}
                            placeholder={
                              locale === 'bn'
                                ? 'বাড়ি, রোড ও এলাকার নাম'
                                : 'House, Road & Area'
                            }
                            required
                            className={editorialInputClass}
                          />
                        </div>

                        <div className="space-y-1.5">
                          <label htmlFor="addr-landmark" className={editorialFieldLabel}>
                            {locale === 'bn' ? 'পরিচিত স্থান (ঐচ্ছিক)' : 'Nearby Landmark'}
                          </label>
                          <input
                            id="addr-landmark"
                            type="text"
                            value={addrLandmark}
                            onChange={(e) => setAddrLandmark(e.target.value)}
                            placeholder={
                              locale === 'bn' ? 'যেমন: ওভারব্রিজের পাশে' : 'e.g. Near Overbridge'
                            }
                            className={editorialInputClass}
                          />
                        </div>
                      </div>

                      {/* Optional Advanced Courier Routing inside Add Address */}
                      <div>
                        <button
                          type="button"
                          onClick={() => setShowAddCourierAdvanced((prev) => !prev)}
                          aria-expanded={showAddCourierAdvanced}
                          className="inline-flex min-h-[44px] items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-[#1B4332]/75 hover:text-[#1B4332] hover:bg-white border border-transparent hover:border-[#E5E2D9] transition-colors cursor-pointer"
                        >
                          <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                          <span>
                            {locale === 'bn'
                              ? 'কুরিয়ার জোন ও এরিয়া (অ্যাডভান্সড)'
                              : 'Courier Zone & Area (Advanced)'}
                          </span>
                          <ChevronDown
                            className={`w-3.5 h-3.5 transition-transform duration-150 ${
                              showAddCourierAdvanced ? 'rotate-180' : ''
                            }`}
                            aria-hidden="true"
                          />
                        </button>

                        {showAddCourierAdvanced && (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-[#E5E2D9]">
                            <div className="space-y-1.5">
                              <label htmlFor="addr-city" className={editorialFieldLabel}>
                                {locale === 'bn' ? 'কুরিয়ার সিটি' : 'Courier City'}
                              </label>
                              <input
                                id="addr-city"
                                type="text"
                                value={addrCity}
                                onChange={(e) => setAddrCity(e.target.value)}
                                className={editorialInputClass}
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label htmlFor="addr-zone" className={editorialFieldLabel}>
                                {locale === 'bn' ? 'জোন' : 'Zone'}
                              </label>
                              <select
                                id="addr-zone"
                                value={addrZone}
                                onChange={(e) => {
                                  const z = e.target.value;
                                  setAddrZone(z);
                                  const areas = getPathaoAreasByZone(z);
                                  if (areas[0]) setAddrArea(areas[0]);
                                }}
                                className={editorialSelectClass}
                              >
                                {Array.from(
                                  new Set([addrZone, ...getPathaoZonesByCity(addrCity)])
                                )
                                  .filter(Boolean)
                                  .map((z) => (
                                    <option key={z} value={z}>
                                      {z}
                                    </option>
                                  ))}
                              </select>
                            </div>
                            <div className="space-y-1.5">
                              <label htmlFor="addr-area" className={editorialFieldLabel}>
                                {locale === 'bn' ? 'এরিয়া' : 'Area'}
                              </label>
                              <select
                                id="addr-area"
                                value={addrArea}
                                onChange={(e) => setAddrArea(e.target.value)}
                                className={editorialSelectClass}
                              >
                                {Array.from(
                                  new Set([addrArea, ...getPathaoAreasByZone(addrZone)])
                                )
                                  .filter(Boolean)
                                  .map((a) => (
                                    <option key={a} value={a}>
                                      {a}
                                    </option>
                                  ))}
                              </select>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-2.5 sm:gap-3 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsAddAddressOpen(false)}
                          className="min-h-[44px] px-4 rounded-lg border border-[#E5E2D9] bg-white text-[#1B4332] font-mono text-xs uppercase tracking-[0.1em] hover:border-[#1B4332] cursor-pointer"
                        >
                          {locale === 'bn' ? 'বাতিল' : 'Cancel'}
                        </button>
                        <button type="submit" className={primaryEditorialBtn}>
                          <span>{locale === 'bn' ? 'ঠিকানা সংরক্ষণ করুন' : 'Save Address'}</span>
                        </button>
                      </div>
                    </form>
                  )}
                </section>
              </div>
            )}

            {/* 6. Tab Panel 4: Saved Wishlist Section */}
            {activeTab === 'wishlist' && (
              <section className="bg-white p-4 sm:p-8 rounded-xl border border-[#E5E2D9] shadow-[0_8px_24px_rgba(27,67,50,0.03)] space-y-5 sm:space-y-6">
                <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#E5E2D9] pb-4">
                  <h2 className="font-display text-xl sm:text-[1.75rem] font-semibold text-[#1B4332]">
                    {dict.common.wishlist} ({formatLocaleNumber(wishlistedProducts.length, locale)})
                  </h2>
                  {wishlistedProducts.length > 0 && (
                    <button
                      type="button"
                      onClick={clearWishlist}
                      className="inline-flex min-h-[36px] items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-[#A84A28] hover:underline underline-offset-4 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>{locale === 'bn' ? 'সব মুছুন' : 'Clear All'}</span>
                    </button>
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
                    onAction={() => navigate('/')}
                  />
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 gap-y-6 sm:gap-6">
                    {wishlistedProducts.map((product) => (
                      <ProductCard key={product.productId} product={product} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </StorefrontShell>
  );
}
