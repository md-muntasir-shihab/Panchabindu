'use client';
import { localizedFetch as fetch } from '@/lib/i18n/localized-fetch';
import { uiText } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/storefront/product-detail-client.tsx
// Botanical Heritage Calm — Product Detail Page (PDP)
// Features:
//   - Frameless 4:5 portrait gallery (#F2EFE9) with thumbnail switcher
//   - Dynamic Variant Selector with live Poisha price, compare-at price, Public SKU, & stock status
//   - Interactive 64-District Delivery Rate & Lead-Time Estimator (Courier vs BD Post)
//   - Specifications Table, Verified Purchase Reviews, & Related Products Grid (4:5 Portrait Cards)
//   - Zero vendor/cost leakage

import * as React from 'react';
import { Link } from 'wouter';
import { useLocation } from 'wouter';
import {
  ShoppingBag,
  Heart,
  Star,
  Truck,
  ShieldCheck,
  RotateCcw,
  Check,
  Minus,
  Plus,
  MapPin,
  ChevronRight,
  CheckCircle2,
  Share2,
  MessageSquarePlus,
  BellRing,
} from 'lucide-react';
import type {
  CategoryRecord,
  ProductReviewRecord,
  PublicSafeSiteSettingsDTO,
} from '@/lib/db/repository';
import type { StorefrontProductDTO } from '@/types/domain';
import {
  BD_DISTRICTS,
  getDistrictById,
  getDistrictDeliveryRates,
} from '@/lib/geo/bd-geocode';
import { calculateDeliveryCharge, formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber, toBanglaDigits } from '@/lib/i18n/dictionaries';
import { useLocaleStore } from '@/store/use-locale-store';
import { useCartStore } from '@/store/use-cart-store';
import { useWishlistStore } from '@/store/use-wishlist-store';
import { Button, Input } from '../ui/primitives';
import { ResponsiveSheet } from '../ui/responsive-sheet';
import { ProductCard } from './product-card';
import { StorefrontShell } from './storefront-shell';

export interface ProductDetailClientProps {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
  product: StorefrontProductDTO;
  leadTimeDays: number;
  reviews: ProductReviewRecord[];
  relatedProducts: StorefrontProductDTO[];
}

export function ProductDetailClient({
  siteSettings,
  categories,
  product,
  leadTimeDays,
  reviews,
  relatedProducts,
}: ProductDetailClientProps) {
  const [, navigate] = useLocation();
  const locale = useLocaleStore((s) => s.locale);
  const dict = useLocaleStore((s) => s.t());

  const addItem = useCartStore((s) => s.addItem);
  const setDrawerOpen = useCartStore((s) => s.setDrawerOpen);
  const isWishlisted = useWishlistStore((s) =>
    s.productIds.includes(product.productId)
  );
  const toggleWishlist = useWishlistStore((s) => s.toggleWishlist);

  const [selectedVariantId, setSelectedVariantId] = React.useState<string>(
    product.variants[0]?.variantId ?? ''
  );
  const [selectedImageIdx, setSelectedImageIdx] = React.useState(0);
  const [quantity, setQuantity] = React.useState(1);
  const [estimatorDistrictId, setEstimatorDistrictId] = React.useState<number>(47); // Default Dhaka (47)
  const [justAdded, setJustAdded] = React.useState(false);
  const [copiedLink, setCopiedLink] = React.useState(false);

  // Out-of-stock Notify Me state
  const [notifyPhone, setNotifyPhone] = React.useState('');
  const [notifySaved, setNotifySaved] = React.useState(false);

  // Review Submission Sheet State
  const [reviewList, setReviewList] =
    React.useState<ProductReviewRecord[]>(reviews);
  const [isReviewSheetOpen, setIsReviewSheetOpen] = React.useState(false);
  const [revName, setRevName] = React.useState('');
  const [revPhone, setRevPhone] = React.useState('');
  const [revRating, setRevRating] = React.useState<number>(5);
  const [revComment, setRevComment] = React.useState('');
  const [revSubmitting, setRevSubmitting] = React.useState(false);
  const [revError, setRevError] = React.useState<string | null>(null);

  const selectedVariant =
    product.variants.find((v) => v.variantId === selectedVariantId) ??
    product.variants[0];

  if (!selectedVariant) return null;

  const isOutOfStock = selectedVariant.stockAvailable <= 0;
  const isLowStock =
    !isOutOfStock && selectedVariant.stockAvailable <= product.lowStockThreshold;

  const allImages =
    product.images.length > 0
      ? product.images
      : ['https://picsum.photos/seed/fallback/800/1000'];
  const activeImageUrl =
    allImages[selectedImageIdx] ?? selectedVariant.imageUrl ?? allImages[0];

  const category = categories.find((c) => c.id === product.categoryId);
  const displayName = locale === 'bn' ? product.nameBn : product.nameEn;
  const displayDesc =
    locale === 'bn' ? product.descriptionBn : product.descriptionEn;
  const ratingValue = (product.ratingAvgBp / 100).toFixed(1);

  // Calculate live delivery rate estimate for selected district and quantity
  const selectedDistrict =
    getDistrictById(estimatorDistrictId) ?? getDistrictById(47)!;
  const districtRates = getDistrictDeliveryRates(
    selectedDistrict.id,
    siteSettings.bdPostDefaultPerKgPoisha
  );
  const lineWeightGrams = selectedVariant.weightGrams * quantity;
  const lineSubtotalPoisha = selectedVariant.salePricePoisha * quantity;

  const courierEstimate = calculateDeliveryCharge({
    method: 'courier',
    totalWeightGrams: lineWeightGrams,
    orderSubtotalPoisha: lineSubtotalPoisha,
    freeDeliveryThresholdPoisha: siteSettings.freeDeliveryThresholdPoisha,
    isGlobalFreeDelivery: siteSettings.globalFreeDelivery,
    isAllItemsFreeDelivery: product.isFreeDelivery,
    courierBaseRate1KgPoisha: districtRates.base1KgPoisha,
    courierExtraPerKgPoisha: districtRates.extraPerKgPoisha,
    bdPostPerKgPoisha: districtRates.bdPostPerKgPoisha,
  });

  const bdPostEstimate = calculateDeliveryCharge({
    method: 'post_office',
    totalWeightGrams: lineWeightGrams,
    orderSubtotalPoisha: lineSubtotalPoisha,
    freeDeliveryThresholdPoisha: siteSettings.freeDeliveryThresholdPoisha,
    isGlobalFreeDelivery: siteSettings.globalFreeDelivery,
    isAllItemsFreeDelivery: product.isFreeDelivery,
    courierBaseRate1KgPoisha: districtRates.base1KgPoisha,
    courierExtraPerKgPoisha: districtRates.extraPerKgPoisha,
    bdPostPerKgPoisha: districtRates.bdPostPerKgPoisha,
  });

  const handleAddToCart = (openCheckout: boolean) => {
    if (isOutOfStock) return;
    addItem(
      {
        productId: product.productId,
        variantId: selectedVariant.variantId,
        slug: product.slug,
        nameBn: product.nameBn,
        nameEn: product.nameEn,
        variantTitleBn: selectedVariant.titleBn,
        variantTitleEn: selectedVariant.titleEn,
        publicSku: selectedVariant.publicSku,
        imageUrl: selectedVariant.imageUrl ?? allImages[0],
        unitSalePricePoisha: selectedVariant.salePricePoisha,
        compareAtPricePoisha: selectedVariant.compareAtPricePoisha,
        weightGrams: selectedVariant.weightGrams,
        maxStockAvailable: selectedVariant.stockAvailable,
        isFreeDeliveryProduct: product.isFreeDelivery,
        requiresAdvanceCourierCharge: product.requiresAdvanceCourierCharge,
        customAdvanceDepositPoisha: product.customAdvanceDepositPoisha,
      },
      quantity
    );

    if (openCheckout) {
      setDrawerOpen(false);
      navigate('/checkout');
    } else {
      setJustAdded(true);
      window.setTimeout(() => setJustAdded(false), 1000);
    }
  };

  return (
    <StorefrontShell
      siteSettings={siteSettings}
      categories={categories}
      products={[product, ...relatedProducts]}
    >
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-10 space-y-14">
        {/* Breadcrumb */}
        <nav
          aria-label={uiText("Breadcrumb", locale)}
          className="flex flex-wrap items-center gap-1.5 text-xs text-[#5A655D]"
        >
          <Link href="/" className="hover:text-[var(--store-accent)] hover:underline">
            {dict.common.home}
          </Link>
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          {category && (
            <>
              <span className="text-[#5A655D]">
                {locale === 'bn' ? category.nameBn : category.nameEn}
              </span>
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </>
          )}
          <span className="text-[#162119] font-medium truncate max-w-xs">
            {displayName}
          </span>
        </nav>

        {/* Main PDP 2-Column Editorial Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start">
          {/* Left: 4:5 Portrait Product Image Gallery */}
          <div className="lg:col-span-6 min-w-0 space-y-3.5">
            <div className="relative aspect-[4/5] w-full border border-[#E4E2DC] rounded-2xl overflow-hidden bg-[#F2EFE9]">
              <img
                  
                src={activeImageUrl}
                alt={displayName}
                referrerPolicy="no-referrer"
                className="object-cover" loading="eager" fetchPriority="high" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} />
              <div className="absolute top-3.5 left-3.5 flex flex-col gap-1.5">
                {isOutOfStock ? (
                  <span className="px-3 py-1 text-xs font-semibold bg-[#FAF9F5]/95 backdrop-blur-sm text-[#B91C1C] rounded-md border border-[#E4E2DC]">
                    {dict.common.outOfStock}
                  </span>
                ) : isLowStock ? (
                  <span className="px-3 py-1 text-xs font-semibold bg-[#FAF9F5]/95 backdrop-blur-sm text-[#B45309] rounded-md border border-[#E4E2DC]">
                    {dict.common.lowStockRemaining(
                      selectedVariant.stockAvailable
                    )}
                  </span>
                ) : product.isFreeDelivery ? (
                  <span className="px-3 py-1 text-xs font-semibold bg-[#FAF9F5]/95 backdrop-blur-sm text-[var(--store-accent)] rounded-md border border-[#E4E2DC]">
                    {dict.common.freeDelivery}
                  </span>
                ) : null}
              </div>
            </div>

            {allImages.length > 1 && (
              <div className="flex items-center gap-3 overflow-x-auto pb-1">
                {allImages.map((imgUrl, idx) => (
                  <button
                    key={imgUrl}
                    type="button"
                    onClick={() => setSelectedImageIdx(idx)}
                    aria-label={`View image ${idx + 1}`}
                    className={`relative w-20 h-24 rounded-xl border overflow-hidden shrink-0 cursor-pointer transition-all ${
                      selectedImageIdx === idx
                        ? 'border-[var(--store-accent)] ring-2 ring-[var(--store-accent)]/20'
                        : 'border-[#E4E2DC] opacity-75 hover:opacity-100'
                    }`}
                  >
                    <img
                  
                      src={imgUrl}
                      alt={`${displayName} thumbnail ${idx + 1}`}
                      referrerPolicy="no-referrer"
                      className="object-cover" loading="lazy" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Right: Editorial Details, Variant Selector, Pricing & Estimator */}
          <div className="lg:col-span-6 min-w-0 space-y-7">
            <div className="space-y-3 border-b border-[#E4E2DC] pb-5">
              {/* Unboxed Metadata Row */}
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#5A655D]">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 font-semibold text-[#162119]">
                    <Star
                      className="w-4 h-4 fill-[var(--store-accent)] text-[var(--store-accent)]"
                      aria-hidden="true"
                    />
                    <span className="tabular-nums">
                      {locale === 'bn' ? toBanglaDigits(ratingValue) : ratingValue}
                    </span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>
                    {formatLocaleNumber(product.reviewCount, locale)}{' '}
                    {locale === 'bn' ? 'টি রিভিউ' : 'Reviews'}
                  </span>
                  {!isOutOfStock && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span
                        className={`font-semibold ${
                          isLowStock ? 'text-[#B45309]' : 'text-[#15803D]'
                        }`}
                      >
                        {isLowStock
                          ? dict.common.lowStockRemaining(
                              selectedVariant.stockAvailable
                            )
                          : dict.common.inStock}
                      </span>
                    </>
                  )}
                </div>

                <span className="font-mono text-[#5A655D]">
                  <LocalizedText source={"SKU:"} area="storefront" />{" "}{selectedVariant.publicSku}
                </span>
              </div>

              <h1 className="text-2xl sm:text-3xl font-bold text-[#162119] leading-snug tracking-tight">
                {displayName}
              </h1>

              <div className="flex items-baseline gap-3 pt-1 tabular-nums">
                <span className="text-2xl sm:text-3xl font-bold text-[#162119]">
                  {formatPoishaToBdt(selectedVariant.salePricePoisha, locale)}
                </span>
                {selectedVariant.compareAtPricePoisha &&
                  selectedVariant.compareAtPricePoisha >
                    selectedVariant.salePricePoisha && (
                    <span className="text-sm text-[#5A655D] line-through">
                      {formatPoishaToBdt(
                        selectedVariant.compareAtPricePoisha,
                        locale
                      )}
                    </span>
                  )}
              </div>
            </div>

            <p className="text-sm sm:text-[15px] text-[#5A655D] leading-relaxed">
              {displayDesc}
            </p>

            {/* Dynamic Variant Selector */}
            <div className="space-y-2.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[#5A655D]">
                {locale === 'bn' ? 'ভ্যারিয়েন্ট নির্বাচন করুন' : 'Select Variant'}
              </label>
              <div className="flex flex-wrap gap-2.5">
                {product.variants.map((v) => {
                  const isSelected = v.variantId === selectedVariant.variantId;
                  const vOut = v.stockAvailable <= 0;
                  return (
                    <button
                      key={v.variantId}
                      type="button"
                      onClick={() => {
                        setSelectedVariantId(v.variantId);
                        setQuantity(1);
                      }}
                      className={`min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium rounded-xl border transition-all cursor-pointer flex items-center gap-2 ${
                        isSelected
                          ? 'bg-[var(--store-accent)] text-[#FAF9F5] border-[var(--store-accent)] font-semibold'
                          : vOut
                          ? 'bg-[#F2EFE9] text-[#5A655D] border-[#E4E2DC] line-through'
                          : 'bg-[#FAF9F5] text-[#162119] border-[#E4E2DC] hover:border-[var(--store-accent)]'
                      }`}
                    >
                      <span>{locale === 'bn' ? v.titleBn : v.titleEn}</span>
                      <span
                        className={`text-xs tabular-nums ${
                          isSelected ? 'text-[#E8F0EC]' : 'text-[#5A655D]'
                        }`}
                      >
                        ({formatPoishaToBdt(v.salePricePoisha, locale)})
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Quantity & Primary Actions */}
            <div className="space-y-3.5 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                <div className="inline-flex items-center border border-[#E4E2DC] rounded-xl bg-[#FAF9F5] min-h-[44px]">
                  <button
                    type="button"
                    onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                    disabled={isOutOfStock || quantity <= 1}
                    aria-label={uiText("Decrease quantity", locale)}
                    className="px-3.5 py-2.5 text-[#162119] hover:bg-[#F2EFE9] rounded-l-xl disabled:opacity-40 cursor-pointer"
                  >
                    <Minus className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <span className="px-4 text-sm font-bold tabular-nums">
                    {formatLocaleNumber(quantity, locale)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setQuantity((q) =>
                        Math.min(selectedVariant.stockAvailable, q + 1)
                      )
                    }
                    disabled={
                      isOutOfStock || quantity >= selectedVariant.stockAvailable
                    }
                    aria-label={uiText("Increase quantity", locale)}
                    className="px-3.5 py-2.5 text-[#162119] hover:bg-[#F2EFE9] rounded-r-xl disabled:opacity-40 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => toggleWishlist(product.productId)}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium rounded-xl border border-[#E4E2DC] bg-[#FAF9F5] text-[#162119] hover:border-[var(--store-accent)] transition-colors cursor-pointer"
                >
                  <Heart
                    className={`w-4 h-4 ${
                      isWishlisted ? 'fill-[var(--store-accent)] text-[var(--store-accent)]' : 'text-[#162119]'
                    }`}
                    aria-hidden="true"
                  />
                  <span>{dict.common.wishlist}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (typeof window !== 'undefined' && navigator.clipboard) {
                      void navigator.clipboard.writeText(window.location.href);
                      setCopiedLink(true);
                      window.setTimeout(() => setCopiedLink(false), 1500);
                    }
                  }}
                  className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 text-xs sm:text-sm font-medium rounded-xl border border-[#E4E2DC] bg-[#FAF9F5] text-[#162119] hover:border-[var(--store-accent)] transition-colors cursor-pointer"
                >
                  {copiedLink ? (
                    <Check className="w-4 h-4 text-[#15803D]" aria-hidden="true" />
                  ) : (
                    <Share2 className="w-4 h-4" aria-hidden="true" />
                  )}
                  <span>
                    {copiedLink
                      ? locale === 'bn'
                        ? 'লিংক কপি হয়েছে'
                        : 'Link Copied'
                      : locale === 'bn'
                      ? 'শেয়ার'
                      : 'Share'}
                  </span>
                </button>
              </div>

              {isOutOfStock ? (
                <div className="p-4 rounded-xl border border-[#E4E2DC] bg-[#F2EFE9] space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-[#162119]">
                    <BellRing className="w-4 h-4 text-[var(--store-accent)]" aria-hidden="true" />
                    <span>
                      {locale === 'bn'
                        ? 'পণ্যটি স্টকে এলে এসএমএস পেতে নম্বর দিন:'
                        : 'Get notified via SMS when back in stock:'}
                    </span>
                  </div>
                  {notifySaved ? (
                    <p className="text-xs font-semibold text-[#15803D]">
                      {locale === 'bn'
                        ? 'আপনার নম্বরটি সংরক্ষিত হয়েছে। স্টকে আসা মাত্রই জানানো হবে।'
                        : 'Your number has been registered for restock alert.'}
                    </p>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="tel"
                        value={notifyPhone}
                        onChange={(e) => setNotifyPhone(e.target.value)}
                        placeholder="017XXXXXXXX"
                        className="flex-1 min-h-[40px] px-3 py-1.5 text-xs bg-[#FAF9F5] text-[#162119] border border-[#E4E2DC] rounded-lg"
                      />
                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        onClick={() => {
                          if (notifyPhone.trim().length >= 11) {
                            setNotifySaved(true);
                          }
                        }}
                      >
                        {locale === 'bn' ? 'স্টকে এলে জানান' : 'Notify Me'}
                      </Button>
                    </div>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => handleAddToCart(false)}
                    className="min-h-[48px] px-5 py-3 rounded-xl border border-[var(--store-accent)] bg-[#FAF9F5] text-[var(--store-accent)] hover:bg-[#E8F0EC] text-sm font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                  >
                    {justAdded ? (
                      <Check className="w-4 h-4" aria-hidden="true" />
                    ) : (
                      <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                    )}
                    <span>
                      {justAdded
                        ? locale === 'bn'
                          ? 'কার্টে যুক্ত হয়েছে'
                          : 'Added to Cart'
                        : dict.common.addToCart}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isOutOfStock}
                    onClick={() => handleAddToCart(true)}
                    className="min-h-[48px] px-5 py-3 rounded-xl bg-[var(--store-accent)] text-[#FAF9F5] hover:opacity-90 text-sm font-semibold flex items-center justify-center transition-colors cursor-pointer"
                  >
                    {dict.common.buyNow}
                  </button>
                </div>
              )}
            </div>

            {/* Interactive 64-District Delivery Charge & Lead-Time Estimator */}
            <div className="p-5 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-[#162119]">
                  <MapPin className="w-4 h-4 text-[var(--store-accent)]" aria-hidden="true" />
                  <span>
                    {locale === 'bn'
                      ? 'জেলাভিত্তিক ডেলিভারি চার্জ ও সময় হিসাব'
                      : 'District Delivery Rate & Time Estimator'}
                  </span>
                </div>

                <select
                  aria-label={uiText("Select delivery district", locale)}
                  value={estimatorDistrictId}
                  onChange={(e) =>
                    setEstimatorDistrictId(Number(e.target.value))
                  }
                  className="min-h-[38px] px-3 py-1.5 text-xs font-medium border border-[#E4E2DC] rounded-lg bg-[#FAF9F5] text-[#162119]"
                >
                  {BD_DISTRICTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {locale === 'bn' ? d.name_bn : d.name_en}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div className="p-3.5 border border-[#E4E2DC] rounded-xl bg-[#FAF9F5] flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#162119]">
                      {locale === 'bn'
                        ? 'কুরিয়ার হোম ডেলিভারি'
                        : 'Courier Home Delivery'}
                    </p>
                    <p className="text-[#5A655D] mt-0.5">
                      {locale === 'bn' ? `আনুমানিক ${toBanglaDigits(leadTimeDays)}-${toBanglaDigits(leadTimeDays + 1)} কার্যদিবস` : `Est. ${leadTimeDays}-${leadTimeDays + 1} business days`}

                    </p>
                  </div>
                  <span className="text-sm font-bold text-[#162119] tabular-nums">
                    {courierEstimate.isFreeDeliveryApplied
                      ? dict.common.freeDelivery
                      : formatPoishaToBdt(
                          courierEstimate.finalChargePoisha,
                          locale
                        )}
                  </span>
                </div>

                <div className="p-3.5 border border-[#E4E2DC] rounded-xl bg-[#FAF9F5] flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-[#162119]">
                      {locale === 'bn'
                        ? 'বাংলাদেশ ডাক বিভাগ (BD Post)'
                        : 'Bangladesh Post Office'}
                    </p>
                    <p className="text-[#5A655D] mt-0.5">
                      {locale === 'bn'
                        ? 'সরকারি ডাক বিভাগ (জিপিও)'
                        : 'Government Post Office'}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-[#162119] tabular-nums">
                    {bdPostEstimate.isFreeDeliveryApplied
                      ? dict.common.freeDelivery
                      : formatPoishaToBdt(
                          bdPostEstimate.finalChargePoisha,
                          locale
                        )}
                  </span>
                </div>
              </div>

              {product.requiresAdvanceCourierCharge && (
                <div className="p-3 rounded-xl border border-[#B45309]/30 bg-[#FFFBEB] text-xs text-[#92400E] flex items-start gap-2.5">
                  <span className="font-bold text-sm">ⓘ</span>
                  <div>
                    <span className="font-bold block">
                      {locale === 'bn'
                        ? 'অগ্রিম কুরিয়ার চার্জ প্রযোজ্য'
                        : 'Advance Courier Charge Required'}
                    </span>
                    <p className="mt-0.5 text-[11px] leading-relaxed">
                      {locale === 'bn'
                        ? 'এই পণ্যটির অর্ডার নিশ্চিত করতে কুরিয়ার ডেলিভারি চার্জ অগ্রিম ম্যানুয়াল বিকাশে পরিশোধ করতে হবে। অবশিষ্ট পণ্যের মূল্য ডেলিভারির সময় ক্যাশ অন ডেলিভারি (COD)-তে প্রদেয়।'
                        : 'To confirm the order for this artisan product, courier delivery charge must be paid in advance via manual bKash. Product price will be paid upon delivery (COD).'}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-4 pt-1 text-xs text-[#5A655D]">{siteSettings.trustBadges.map(badge => <span key={badge.id} className="inline-flex items-center gap-1.5"><ShieldCheck className="w-3.5 h-3.5 text-[var(--store-accent)]" />{locale === 'bn' ? badge.labelBn : badge.labelEn}</span>)}</div>
            </div>

            {/* Product Specifications */}
            {product.specs.length > 0 && (
              <div className="space-y-2.5">
                <h2 className="text-sm font-semibold text-[#162119]">
                  {locale === 'bn' ? 'পণ্যের বিবরণী' : 'Product Specifications'}
                </h2>
                <div className="border border-[#E4E2DC] rounded-xl divide-y divide-[#E4E2DC] overflow-hidden text-xs">
                  {product.specs.map((spec, i) => (
                    <div
                      key={i}
                      className="grid grid-cols-3 gap-2 p-3 bg-[#FAF9F5] items-center [&>*]:min-w-0 [&>*]:break-words"
                    >
                      <span className="text-[#5A655D] font-medium">
                        {locale === 'bn' ? spec.labelBn : spec.labelEn}
                      </span>
                      <span className="col-span-2 text-[#162119] font-semibold">
                        {locale === 'bn' ? spec.valueBn : spec.valueEn}
                      </span>
                    </div>
                  ))}
                  <div className="grid grid-cols-3 gap-2 p-3 bg-[#FAF9F5] items-center [&>*]:min-w-0 [&>*]:break-words">
                    <span className="text-[#5A655D] font-medium">
                      {locale === 'bn' ? 'ওজন' : 'Unit Weight'}
                    </span>
                    <span className="col-span-2 text-[#162119] font-semibold tabular-nums">
                      {formatLocaleNumber(selectedVariant.weightGrams, locale)}{' '}
                      {locale === 'bn' ? 'গ্রাম' : 'g'}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Verified Customer Reviews */}
        <section className="space-y-5 border-t border-[#E4E2DC] pt-10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-xl sm:text-2xl font-bold text-[#162119]">
              {locale === 'bn'
                ? `গ্রাহক রিভিউ (${toBanglaDigits(reviewList.length)})`
                : `Verified Customer Reviews (${reviewList.length})`}
            </h2>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsReviewSheetOpen(true)}
              leftIcon={
                <MessageSquarePlus className="w-4 h-4" aria-hidden="true" />
              }
            >
              {locale === 'bn' ? 'রিভিউ লিখুন' : 'Write a Review'}
            </Button>
          </div>

          {reviewList.length === 0 ? (
            <p className="text-sm text-[#5A655D]">
              {locale === 'bn'
                ? 'এই পণ্যে এখনো কোনো রিভিউ যোগ হয়নি।'
                : 'No reviews yet for this product.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {reviewList.map((rev) => (
                <div
                  key={rev.id}
                  className="p-5 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-sm font-bold text-[#162119]">
                        {rev.customerName}
                      </span>
                      {rev.isVerifiedPurchase && (
                        <>
                          <span aria-hidden="true" className="text-[#5A655D]">·</span>
                          <span className="inline-flex items-center gap-1 text-[#15803D] font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            <span>{locale === 'bn' ? 'ভেরিফাইড ক্রেতা' : 'Verified Buyer'}</span>
                          </span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-0.5 text-[var(--store-accent)]">
                      {Array.from({ length: rev.rating }).map((_, idx) => (
                        <Star
                          key={idx}
                          className="w-3.5 h-3.5 fill-[var(--store-accent)] text-[var(--store-accent)]"
                          aria-hidden="true"
                        />
                      ))}
                    </div>
                  </div>
                  <p className="text-xs sm:text-sm text-[#162119] leading-relaxed">
                    {rev.comment}
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Related Products (Frameless 4:5 Portrait Grid) */}
        {relatedProducts.length > 0 && (
          <section className="space-y-6 border-t border-[#E4E2DC] pt-10 pb-16 md:pb-0">
            <h2 className="text-xl sm:text-2xl font-bold text-[#162119]">
              {locale === 'bn' ? 'সম্পর্কিত অন্যান্য পণ্য' : 'Related Products'}
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-x-5 gap-y-10">
              {relatedProducts.map((rel) => (
                <ProductCard key={rel.productId} product={rel} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Responsive Review Submission Sheet */}
      <ResponsiveSheet
        open={isReviewSheetOpen}
        onOpenChange={setIsReviewSheetOpen}
        title={
          locale === 'bn'
            ? 'পণ্যটির জন্য আপনার রিভিউ লিখুন'
            : 'Write a Customer Review'
        }
      >
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setRevError(null);
            setRevSubmitting(true);
            try {
              const res = await fetch('/api/reviews', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  productId: product.productId,
                  customerName: revName,
                  customerPhone: revPhone,
                  rating: revRating,
                  comment: revComment,
                }),
              });
              const data = (await res.json()) as {
                success: boolean;
                errorBn?: string;
                review?: ProductReviewRecord;
              };
              if (!res.ok || !data.success || !data.review) {
                setRevError(data.errorBn ?? 'রিভিউ জমা দিতে সমস্যা হয়েছে।');
              } else {
                setReviewList((prev) => [data.review!, ...prev]);
                setRevName('');
                setRevPhone('');
                setRevComment('');
                setIsReviewSheetOpen(false);
              }
            } catch {
              setRevError('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।');
            } finally {
              setRevSubmitting(false);
            }
          }}
          className="space-y-4"
        >
          <Input
            label={locale === 'bn' ? 'আপনার নাম *' : 'Your Name *'}
            value={revName}
            onChange={(e) => setRevName(e.target.value)}
            placeholder={locale === 'bn' ? 'যেমন: তানভীর আহমেদ' : 'Tanvir Ahmed'}
            required
          />
          <Input
            label={
              locale === 'bn'
                ? 'অর্ডার করা মোবাইল নম্বর (ভেরিফাইড ব্যাজের জন্য) *'
                : 'Order Mobile Number (For Verified Badge) *'
            }
            value={revPhone}
            onChange={(e) => setRevPhone(e.target.value)}
            placeholder="01712345678"
            required
          />
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#162119]">
              {locale === 'bn' ? 'রেটিং নির্বাচন করুন *' : 'Select Rating *'}
            </label>
            <div className="flex items-center gap-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRevRating(star)}
                  className={`min-h-[40px] px-3 py-1.5 border rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer ${
                    revRating >= star
                      ? 'bg-[var(--store-accent)] text-[#FAF9F5] border-[var(--store-accent)]'
                      : 'bg-[#FAF9F5] text-[#162119] border-[#E4E2DC]'
                  }`}
                >
                  <Star className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                  <span>{star}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[#162119]">
              {locale === 'bn' ? 'আপনার মতামত *' : 'Your Review *'}
            </label>
            <textarea
              rows={3}
              value={revComment}
              onChange={(e) => setRevComment(e.target.value)}
              placeholder={
                locale === 'bn'
                  ? 'পণ্যের মান ও ডেলিভারি সম্পর্কে আপনার অভিজ্ঞতা লিখুন...'
                  : 'Share your experience with the product quality...'
              }
              required
              className="w-full p-3 text-sm bg-[#FAF9F5] text-[#162119] border border-[#E4E2DC] rounded-xl"
            />
          </div>
          {revError && (
            <p className="text-xs font-medium text-[#B91C1C]">{revError}</p>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            disabled={revSubmitting}
            className="w-full"
          >
            {revSubmitting
              ? locale === 'bn'
                ? 'জমা হচ্ছে...'
                : 'Submitting...'
              : locale === 'bn'
              ? 'রিভিউ জমা দিন'
              : 'Submit Review'}
          </Button>
        </form>
      </ResponsiveSheet>

      {/* Single Mobile Sticky Purchase Bar (< 768px) */}
      {!isOutOfStock && (
        <div className="md:hidden fixed bottom-[calc(3.5rem+max(16px,env(safe-area-inset-bottom)))] left-0 right-0 z-30 p-3 bg-[#FAF9F5]/95 backdrop-blur border-t border-[#E4E2DC] flex items-center justify-between gap-3 safe-bottom">
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold text-[#162119] truncate">{displayName}</p>
            <p className="text-sm font-bold text-[#162119] tabular-nums">
              {formatPoishaToBdt(selectedVariant.salePricePoisha, locale)}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => handleAddToCart(false)}
              className="min-h-[42px] px-3.5 py-2 rounded-lg border border-[var(--store-accent)] bg-[#FAF9F5] text-[var(--store-accent)] text-xs font-semibold cursor-pointer"
            >
              {dict.common.addToCart}
            </button>
            <button
              type="button"
              onClick={() => handleAddToCart(true)}
              className="min-h-[42px] px-4 py-2 rounded-lg bg-[var(--store-accent)] text-[#FAF9F5] text-xs font-semibold cursor-pointer"
            >
              {dict.common.buyNow}
            </button>
          </div>
        </div>
      )}
    </StorefrontShell>
  );
}
