'use client';
import { productImageUrl, productImageFallback } from '@/lib/storefront/product-image';

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

  const primaryImage = productImageUrl(product.images[0]);
  const secondaryImage = product.images[1] ? productImageUrl(product.images[1]) : primaryImage;
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
      className="group flex flex-col justify-between bg-transparent min-w-0"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="min-w-0">
        {/* 4:5 Editorial Portrait Image Canvas */}
        <div className="relative aspect-[4/5] w-full overflow-hidden rounded-xl bg-[#F9F8F3] border border-[#E5E2D9]">
          <Link
            href={`/product/${product.slug}`}
            className="block w-full h-full relative"
            aria-label={displayName}
          >
            <img
              src={activeImage}
              alt={displayName}
              referrerPolicy="no-referrer"
              onError={productImageFallback}
              className="object-cover transition-transform duration-500 ease-out group-hover:scale-105" loading="lazy" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} />
          </Link>

          {/* Subtle Top-Left Editorial Status Tag (bounded to avoid colliding with wishlist button on 360px 2-col) */}
          <div className="absolute top-2 left-2 sm:top-3 sm:left-3 max-w-[calc(100%-3.25rem)] sm:max-w-[calc(100%-4rem)] flex flex-col gap-1 z-10 pointer-events-none">
            {isOutOfStock ? (
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.06em] bg-[#FDFCF8]/95 text-[#B91C1C] border border-[#E5E2D9] truncate">
                {dict.common.outOfStock}
              </span>
            ) : isLowStock ? (
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.06em] bg-[#FDFCF8]/95 text-[#A84A28] border border-[#E5E2D9] truncate">
                {dict.common.lowStockRemaining(totalStock)}
              </span>
            ) : product.isFreeDelivery ? (
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.06em] bg-[#FDFCF8]/95 text-[#1B4332] border border-[#E5E2D9] truncate">
                {dict.common.freeDelivery}
              </span>
            ) : product.requiresAdvanceCourierCharge ? (
              <span className="px-2 py-0.5 sm:px-2.5 sm:py-1 rounded-md sm:rounded-lg font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.06em] bg-[#FDFCF8]/95 text-[#A84A28] border border-[#E5E2D9] truncate">
                {locale === 'bn' ? 'অগ্রিম চার্জ' : 'Advance'}
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
            className="absolute top-2 right-2 sm:top-3 sm:right-3 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-full bg-[#FDFCF8]/90 text-[#1B4332] border border-[#E5E2D9] hover:bg-white hover:border-[#1B4332] cursor-pointer z-10 transition-all active:scale-95"
          >
            <Heart
              className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-colors ${
                isWishlisted ? 'fill-[#A84A28] text-[#A84A28]' : 'text-[#1B4332]'
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
              className={`w-full min-h-[42px] px-4 py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.12em] flex items-center justify-center gap-2 transition-all cursor-pointer ${
                isOutOfStock
                  ? 'bg-[#FDFCF8]/95 text-[#1B4332]/50 border border-[#E5E2D9] cursor-not-allowed'
                  : 'bg-[var(--store-accent)] text-white hover:opacity-90 active:scale-[0.98]'
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
        </div>

        {/* Frameless Editorial Typography Below Image */}
        <div className="pt-2.5 sm:pt-3.5 space-y-1 min-w-0">
          {/* Unboxed Metadata Line */}
          <div className="flex items-center gap-1 sm:gap-1.5 text-[10px] sm:text-[11px] text-[#1B4332]/65 min-w-0 overflow-hidden">
            <span className="inline-flex items-center gap-0.5 sm:gap-1 font-medium text-[#1B4332] shrink-0">
              <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-[#A84A28] text-[#A84A28]" aria-hidden="true" />
              <span className="font-mono tabular-nums">
                {locale === 'bn' ? toBanglaDigits(ratingValue) : ratingValue}
              </span>
              <span className="text-[#1B4332]/55 font-normal">
                ({formatLocaleNumber(product.reviewCount, locale)})
              </span>
            </span>
            {!isOutOfStock && (
              <>
                <span aria-hidden="true" className="shrink-0">·</span>
                <span className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.05em] text-[#15803D] truncate">
                  {dict.common.inStock}
                </span>
              </>
            )}
          </div>

          {/* Product Name */}
          <Link
            href={`/product/${product.slug}`}
            className="block font-display text-[15px] sm:text-lg font-semibold text-[#1B4332] group-hover:text-[#A84A28] line-clamp-2 leading-snug transition-colors"
          >
            {displayName}
          </Link>

          {/* Price Row */}
          <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 pt-0.5 tabular-nums">
            <span className="text-sm sm:text-base font-semibold text-[#1B4332]">
              {formatPoishaToBdt(primaryVariant.salePricePoisha, locale)}
            </span>
            {primaryVariant.compareAtPricePoisha &&
              primaryVariant.compareAtPricePoisha >
                primaryVariant.salePricePoisha && (
                <span className="text-[11px] sm:text-xs text-[#1B4332]/50 line-through">
                  {formatPoishaToBdt(primaryVariant.compareAtPricePoisha, locale)}
                </span>
              )}
          </div>
        </div>
      </div>

      {/* Mobile Touch-Accessible Quick-Add Button */}
      <div className="sm:hidden pt-2">
        <button
          type="button"
          disabled={isOutOfStock}
          onClick={handleQuickAdd}
          className={`w-full min-h-[44px] px-2.5 py-2 rounded-lg font-mono text-[10px] uppercase tracking-[0.06em] flex items-center justify-center gap-1.5 transition-all cursor-pointer whitespace-nowrap ${
            isOutOfStock
              ? 'bg-[#F9F8F3] text-[#1B4332]/50 border border-[#E5E2D9] cursor-not-allowed'
              : 'bg-[var(--store-accent)] text-white active:scale-[0.98]'
          }`}
        >
          {justAdded ? (
            <Check className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <ShoppingBag className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
          )}
          <span className="truncate">
            {isOutOfStock
              ? dict.common.outOfStock
              : justAdded
              ? locale === 'bn'
                ? 'যুক্ত হয়েছে'
                : 'Added'
              : locale === 'bn'
              ? 'কার্টে যোগ'
              : 'Add to Cart'}
          </span>
        </button>
      </div>
    </article>
  );
}
