'use client';

// src/components/storefront/product-card.tsx
// Botanical Heritage Calm — Frameless 4:5 Portrait Product Card
// Features:
//   - Frameless 4:5 portrait image canvas (#F2EFE9) with hover 2nd product photo swap
//   - Floating Quick-Add CTA on hover (desktop) + accessible touch bar (mobile, >=44px)
//   - Clean unboxed metadata & tabular-nums Poisha price below the photo
//   - Wishlist heart toggle & next/image with referrerPolicy="no-referrer"

import * as React from 'react';
import { Link } from 'wouter';
import { Heart, ShoppingBag, Star, Check } from 'lucide-react';
import type { StorefrontProductDTO } from '@/types/domain';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber, toBanglaDigits } from '@/lib/i18n/dictionaries';
import { useLocaleStore } from '@/store/use-locale-store';
import { useCartStore } from '@/store/use-cart-store';
import { useWishlistStore } from '@/store/use-wishlist-store';

export interface ProductCardProps {
  product: StorefrontProductDTO;
}

export function ProductCard({ product }: ProductCardProps) {
  const locale = useLocaleStore((s) => s.locale);
  const dict = useLocaleStore((s) => s.t());
  const addItem = useCartStore((s) => s.addItem);
  const isWishlisted = useWishlistStore((s) => s.productIds.includes(product.productId));
  const toggleWishlist = useWishlistStore((s) => s.toggleWishlist);

  const [isHovered, setIsHovered] = React.useState(false);
  const [justAdded, setJustAdded] = React.useState(false);

  const primaryVariant = product.variants[0];
  if (!primaryVariant) return null;

  const totalStock = product.variants.reduce((sum, v) => sum + v.stockAvailable, 0);
  const isOutOfStock = totalStock <= 0;
  const isLowStock = !isOutOfStock && totalStock <= product.lowStockThreshold;

  const primaryImage = product.images[0] ?? '/assets/product-placeholder.svg';
  const secondaryImage = product.images[1] ?? primaryImage;
  const activeImage = isHovered ? secondaryImage : primaryImage;

  const displayName = locale === 'bn' ? product.nameBn : product.nameEn;
  const ratingValue = (product.ratingAvgBp / 100).toFixed(1);

  const handleQuickAdd = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isOutOfStock) return;

    const targetVariant =
      product.variants.find((v) => v.stockAvailable > 0) ?? primaryVariant;

    addItem(
      {
        productId: product.productId,
        variantId: targetVariant.variantId,
        slug: product.slug,
        nameBn: product.nameBn,
        nameEn: product.nameEn,
        variantTitleBn: targetVariant.titleBn,
        variantTitleEn: targetVariant.titleEn,
        publicSku: targetVariant.publicSku,
        imageUrl: targetVariant.imageUrl ?? primaryImage,
        unitSalePricePoisha: targetVariant.salePricePoisha,
        compareAtPricePoisha: targetVariant.compareAtPricePoisha,
        weightGrams: targetVariant.weightGrams,
        maxStockAvailable: targetVariant.stockAvailable,
        isFreeDeliveryProduct: product.isFreeDelivery,
        requiresAdvanceCourierCharge: product.requiresAdvanceCourierCharge,
        customAdvanceDepositPoisha: product.customAdvanceDepositPoisha,
      },
      1
    );

    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 950);
  };

  return (
    <article
      className="group flex flex-col justify-between bg-transparent"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div>
        {/* 4:5 Frameless Portrait Image Canvas */}
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-[#F2EFE9] border border-[#E4E2DC]/70">
          <Link
            href={`/product/${product.slug}`}
            className="block w-full h-full relative"
            aria-label={displayName}
          >
            <img
              
              src={activeImage}
              alt={displayName}
              referrerPolicy="no-referrer"
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105" loading="lazy" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} />
          </Link>

          {/* Subtle Top-Left Editorial Status Tag */}
          <div className="absolute top-3 left-3 flex flex-col gap-1 z-10 pointer-events-none">
            {isOutOfStock ? (
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-[#FAF9F5]/95 backdrop-blur-sm text-[#B91C1C] rounded-md border border-[#E4E2DC]">
                {dict.common.outOfStock}
              </span>
            ) : isLowStock ? (
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-[#FAF9F5]/95 backdrop-blur-sm text-[#B45309] rounded-md border border-[#E4E2DC]">
                {dict.common.lowStockRemaining(totalStock)}
              </span>
            ) : product.isFreeDelivery ? (
              <span className="px-2.5 py-1 text-[11px] font-semibold bg-[#FAF9F5]/95 backdrop-blur-sm text-[var(--store-accent)] rounded-md border border-[#E4E2DC]">
                {dict.common.freeDelivery}
              </span>
            ) : product.requiresAdvanceCourierCharge ? (
              <span className="px-2.5 py-1 text-[10px] font-semibold bg-[#FAF9F5]/95 backdrop-blur-sm text-[#B45309] rounded-md border border-[#B45309]/30">
                {locale === 'bn' ? 'অগ্রিম কুরিয়ার চার্জ' : 'Advance Courier'}
              </span>
            ) : null}
          </div>

          {/* Floating Wishlist Button */}
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              toggleWishlist(product.productId);
            }}
            aria-label={
              isWishlisted
                ? `Remove ${displayName} from wishlist`
                : `Add ${displayName} to wishlist`
            }
            className="absolute top-3 right-3 min-w-[40px] min-h-[40px] w-10 h-10 flex items-center justify-center rounded-full bg-[#FAF9F5]/90 backdrop-blur-sm text-[#162119] border border-[#E4E2DC]/80 hover:bg-white hover:border-[var(--store-accent)] cursor-pointer z-10 transition-all active:scale-95"
          >
            <Heart
              className={`w-4 h-4 transition-colors ${
                isWishlisted ? 'fill-[var(--store-accent)] text-[var(--store-accent)]' : 'text-[#162119]'
              }`}
              aria-hidden="true"
            />
          </button>

          {/* Desktop Hover Quick-Add Overlay CTA */}
          <div className="hidden sm:block absolute inset-x-3 bottom-3 z-10 opacity-0 translate-y-2 group-hover:opacity-100 group-hover:translate-y-0 focus-within:opacity-100 focus-within:translate-y-0 transition-all duration-200">
            <button
              type="button"
              disabled={isOutOfStock}
              onClick={handleQuickAdd}
              className={`w-full min-h-[42px] px-4 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer shadow-sm ${
                isOutOfStock
                  ? 'bg-[#FAF9F5]/90 text-[#5A655D] border border-[#E4E2DC] cursor-not-allowed'
                  : 'bg-[var(--store-accent)] text-[#FAF9F5] hover:opacity-90 active:scale-[0.98]'
              }`}
            >
              {justAdded ? (
                <Check className="w-4 h-4" aria-hidden="true" />
              ) : (
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              )}
              <span>
                {isOutOfStock
                  ? dict.common.outOfStock
                  : justAdded
                  ? locale === 'bn'
                    ? 'যুক্ত হয়েছে'
                    : 'Added'
                  : dict.common.addToCart}
              </span>
            </button>
          </div>
        </div>

        {/* Frameless Editorial Typography Below Image */}
        <div className="pt-3.5 space-y-1">
          {/* Unboxed Metadata Line (Zero-Pill Discipline) */}
          <div className="flex items-center gap-1.5 text-[11px] text-[#5A655D]">
            <span className="inline-flex items-center gap-1 font-medium text-[#162119]">
              <Star className="w-3.5 h-3.5 fill-[var(--store-accent)] text-[var(--store-accent)]" aria-hidden="true" />
              <span className="tabular-nums">
                {locale === 'bn' ? toBanglaDigits(ratingValue) : ratingValue}
              </span>
              <span className="text-[#5A655D] font-normal">
                ({formatLocaleNumber(product.reviewCount, locale)})
              </span>
            </span>
            {!isOutOfStock && (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-[#15803D] font-medium">
                  {dict.common.inStock}
                </span>
              </>
            )}
          </div>

          {/* Product Name */}
          <Link
            href={`/product/${product.slug}`}
            className="block text-sm sm:text-[15px] font-semibold text-[#162119] group-hover:text-[var(--store-accent)] line-clamp-2 leading-snug transition-colors"
          >
            {displayName}
          </Link>

          {/* Price Row (Exact Tabular Poisha) */}
          <div className="flex items-baseline gap-2 pt-0.5 tabular-nums">
            <span className="text-sm sm:text-base font-bold text-[#162119]">
              {formatPoishaToBdt(primaryVariant.salePricePoisha, locale)}
            </span>
            {primaryVariant.compareAtPricePoisha &&
              primaryVariant.compareAtPricePoisha >
                primaryVariant.salePricePoisha && (
                <span className="text-xs text-[#5A655D] line-through">
                  {formatPoishaToBdt(primaryVariant.compareAtPricePoisha, locale)}
                </span>
              )}
          </div>
        </div>
      </div>

      {/* Mobile Touch-Accessible Quick-Add Button (< 640px, >= 44px touch target) */}
      <div className="sm:hidden pt-2.5">
        <button
          type="button"
          disabled={isOutOfStock}
          onClick={handleQuickAdd}
          className={`w-full min-h-[44px] px-3 py-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
            isOutOfStock
              ? 'bg-[#F2EFE9] text-[#5A655D] border border-[#E4E2DC] cursor-not-allowed'
              : 'bg-[var(--store-accent)] text-[#FAF9F5] active:scale-[0.98]'
          }`}
        >
          {justAdded ? (
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          ) : (
            <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>
            {isOutOfStock
              ? dict.common.outOfStock
              : justAdded
              ? locale === 'bn'
                ? 'যুক্ত হয়েছে'
                : 'Added'
              : dict.common.addToCart}
          </span>
        </button>
      </div>
    </article>
  );
}
