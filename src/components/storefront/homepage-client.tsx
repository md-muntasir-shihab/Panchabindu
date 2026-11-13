'use client';
import { uiText } from '@/src/lib/i18n/ui-text';

import { LocalizedText } from '@/src/components/ui/localized-text';


// src/components/storefront/homepage-client.tsx
// Botanical Heritage Calm — Modern Minimalist Storefront Homepage
// Features:
//   - Spacious Split Editorial Hero on Soft Linen (#F2EFE9) with Forest Green (#1B4332) CTA
//   - Hairline-Divided 4-Pillar Trust Strip (COD, 64-District Courier, 7-Day Returns, Artisan Provenance)
//   - Unified Interactive Collection Showcase with Frameless 4:5 Portrait Product Grid (Zero Duplication)

import * as React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  Truck,
  RotateCcw,
  CheckCircle2,
  Tag,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  CategoryRecord,
  PublicSafeSiteSettingsDTO,
} from '@/src/lib/db/repository';
import type { StorefrontProductDTO } from '@/src/types/domain';
import { useLocaleStore } from '@/src/store/use-locale-store';
import { Button, EmptyState } from '../ui/primitives';
import { ResponsiveSheet } from '../ui/responsive-sheet';
import { ProductCard } from './product-card';
import { StorefrontShell } from './storefront-shell';
import { formatLocaleNumber } from '@/src/lib/i18n/dictionaries';

export interface HomepageClientProps {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
  products: StorefrontProductDTO[];
  initialCategorySlug?: string | null;
}

type CollectionTab = 'all' | 'featured' | 'best_sellers' | 'new_arrivals';

export function HomepageClient({
  siteSettings,
  categories,
  products,
  initialCategorySlug = null,
}: HomepageClientProps) {
  const locale = useLocaleStore((s) => s.locale);
  const dict = useLocaleStore((s) => s.t());

  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeCategorySlug, setActiveCategorySlug] = React.useState<string | null>(
    initialCategorySlug
  );
  const [activeCollection, setActiveCollection] = React.useState<CollectionTab>('all');
  const [sortBy, setSortBy] = React.useState<'popular' | 'price_asc' | 'price_desc' | 'rating'>(
    'popular'
  );
  const [inStockOnly, setInStockOnly] = React.useState(false);
  const [maxPriceBdt, setMaxPriceBdt] = React.useState<number>(8000);
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);

  // Active Category Object
  const activeCategory = React.useMemo(
    () => categories.find((c) => c.slug === activeCategorySlug) ?? null,
    [categories, activeCategorySlug]
  );

  // Unified Product Filtering & Sorting (NO DUPLICATES)
  const displayedProducts = React.useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const maxPoisha = maxPriceBdt * 100;

    let list = products.filter((p) => {
      if (activeCategory && p.categoryId !== activeCategory.id) {
        return false;
      }

      if (activeCollection === 'featured' && !p.isFeatured) {
        return false;
      }

      const primaryVariant = p.variants[0];
      if (primaryVariant && primaryVariant.salePricePoisha > maxPoisha) {
        return false;
      }

      if (inStockOnly) {
        const totalAvail = p.variants.reduce((sum, v) => sum + v.stockAvailable, 0);
        if (totalAvail <= 0) return false;
      }

      if (!q) return true;
      return (
        p.nameBn.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.variants.some((v) => v.publicSku.toLowerCase().includes(q))
      );
    });

    if (activeCollection === 'best_sellers') {
      list = [...list].sort((a, b) => b.totalSoldCount - a.totalSoldCount);
    } else if (activeCollection === 'new_arrivals') {
      list = [...list].reverse();
    }

    return [...list].sort((a, b) => {
      const priceA = a.variants[0]?.salePricePoisha ?? 0;
      const priceB = b.variants[0]?.salePricePoisha ?? 0;
      if (sortBy === 'price_asc') return priceA - priceB;
      if (sortBy === 'price_desc') return priceB - priceA;
      if (sortBy === 'rating') return b.ratingAvgBp - a.ratingAvgBp;
      if (activeCollection === 'all') {
        return b.totalSoldCount - a.totalSoldCount;
      }
      return 0;
    });
  }, [products, activeCategory, activeCollection, searchQuery, sortBy, inStockOnly, maxPriceBdt]);

  const isFiltering = Boolean(
    searchQuery.trim() ||
      activeCategorySlug ||
      activeCollection !== 'all' ||
      inStockOnly ||
      maxPriceBdt < 8000
  );

  const resetAllFilters = () => {
    setSearchQuery('');
    setActiveCategorySlug(null);
    setActiveCollection('all');
    setInStockOnly(false);
    setMaxPriceBdt(8000);
    setSortBy('popular');
  };

  const hero = siteSettings.heroBanners[0];

  return (
    <StorefrontShell
      siteSettings={siteSettings}
      categories={categories}
      products={products}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      activeCategorySlug={activeCategorySlug}
      onSelectCategory={setActiveCategorySlug}
    >
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-10 pb-24 md:pb-16 space-y-12 sm:space-y-14">
        {/* 1. BOTANICAL EDITORIAL HERO (Spacious Split Layout on Soft Linen) */}
        {!searchQuery.trim() && !activeCategorySlug && hero && (
          <section className="rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-12 items-center">
              <div className="lg:col-span-7 p-7 sm:p-12 lg:p-14 space-y-5">
                {/* Quiet Editorial Kicker (Unboxed Text) */}
                <p className="text-xs font-semibold text-[#1B4332] tracking-wide">
                  {locale === 'bn' ? hero.badgeBn : hero.badgeEn}
                </p>

                <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold tracking-tight text-[#162119] leading-[1.15] max-w-2xl">
                  {locale === 'bn' ? hero.titleBn : hero.titleEn}
                </h1>

                <p className="text-sm sm:text-base text-[#5A655D] max-w-xl leading-relaxed">
                  {locale === 'bn' ? hero.subtitleBn : hero.subtitleEn}
                </p>
              </div>

              <div className="lg:col-span-5 relative aspect-[16/11] lg:aspect-[4/3] w-full border-t lg:border-t-0 lg:border-l border-[#E4E2DC] bg-[#FAF9F5]">
                <Image
                  src={hero.imageUrl}
                  alt={locale === 'bn' ? hero.titleBn : hero.titleEn}
                  fill
                  priority
                  sizes="(max-width: 1024px) 100vw, 45vw"
                  referrerPolicy="no-referrer"
                  className="object-cover"
                />
              </div>
            </div>
          </section>
        )}

        {/* 2. MINIMALIST 4-PILLAR TRUST STRIP (Hairline Divided, Unboxed Typography) */}
        {!searchQuery.trim() && !activeCategorySlug && (
          <section
            aria-label={uiText("Trust guarantees", locale)}
            className="border-y border-[#E4E2DC] py-6 grid grid-cols-2 lg:grid-cols-4 gap-6"
          >
            {siteSettings.trustBadges.map((badge, idx) => {
              const icons = [Truck, RotateCcw, ShieldCheck, CheckCircle2];
              const IconComp = icons[idx % icons.length] ?? ShieldCheck;
              return (
                <div
                  key={badge.id}
                  className="flex items-start gap-3.5"
                >
                  <div className="w-10 h-10 shrink-0 rounded-full bg-[#E8F0EC] text-[#1B4332] flex items-center justify-center">
                    <IconComp className="w-4 h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xs sm:text-sm font-semibold text-[#162119]">
                      {locale === 'bn' ? badge.labelBn : badge.labelEn}
                    </h2>
                    <p className="text-xs text-[#5A655D] mt-0.5 leading-snug">
                      {locale === 'bn' ? badge.descBn : badge.descEn}
                    </p>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* 3. PROMO BANNER (If Active) */}
        {siteSettings.promoCampaign.enabled && (
          <section className="p-4 sm:p-5 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#E8F0EC] text-[#1B4332] flex items-center justify-center shrink-0">
                <Tag className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs font-semibold text-[#1B4332]">
                  {locale === 'bn'
                    ? siteSettings.promoCampaign.discountLabelBn
                    : siteSettings.promoCampaign.discountLabelEn}
                </p>
                <h2 className="text-sm sm:text-base font-bold text-[#162119] mt-0.5">
                  {locale === 'bn'
                    ? siteSettings.promoCampaign.titleBn
                    : siteSettings.promoCampaign.titleEn}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-[#5A655D]">
                {locale === 'bn' ? 'কুপন কোড:' : 'Code:'}
              </span>
              <span className="px-3.5 py-1.5 text-xs font-mono font-bold rounded-lg border border-[#1B4332]/30 bg-[#FAF9F5] text-[#1B4332]">
                {siteSettings.promoCampaign.code}
              </span>
            </div>
          </section>
        )}

        {/* 4. UNIFIED INTERACTIVE CATALOG SHOWCASE */}
        <section id="unified-catalog" className="space-y-7">
          {/* Editorial Section Header & Filter Trigger */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#E4E2DC] pb-4">
            <div>
              <div className="flex items-baseline gap-2.5">
                <h2 className="text-2xl sm:text-3xl font-bold text-[#162119] tracking-tight">
                  {activeCategory
                    ? locale === 'bn'
                      ? activeCategory.nameBn
                      : activeCategory.nameEn
                    : searchQuery.trim()
                    ? locale === 'bn'
                      ? `"${searchQuery}" এর সার্চ ফলাফল`
                      : `Search results for "${searchQuery}"`
                    : locale === 'bn'
                    ? 'নির্বাচিত পণ্য সম্ভার'
                    : 'Curated Collection'}
                </h2>
                <span aria-hidden="true" className="text-[#5A655D]">·</span>
                <span className="text-xs sm:text-sm font-medium text-[#5A655D] tabular-nums">
                  {formatLocaleNumber(displayedProducts.length, locale)}
                  {locale === 'bn' ? 'টি পণ্য' : ' items'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[#5A655D] mt-1">
                {activeCategory
                  ? locale === 'bn'
                    ? activeCategory.descriptionBn
                    : activeCategory.descriptionEn
                  : locale === 'bn'
                  ? 'সরাসরি কারিগর ও ভেরিফাইড সাপ্লায়ারদের থেকে সংগৃহীত খাঁটি পণ্যের কালেকশন।'
                  : 'Authentic artisan goods sourced directly from verified consignment partners.'}
              </p>
            </div>

            {/* Filter Drawer Trigger & Reset Button */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsFilterOpen(true)}
                className="inline-flex items-center gap-2 min-h-[38px] px-4 py-1.5 text-xs font-semibold rounded-full border border-[#E4E2DC] bg-[#F2EFE9] text-[#162119] hover:border-[#1B4332] transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#1B4332]" aria-hidden="true" />
                <span>{locale === 'bn' ? 'ফিল্টার ও বাজেট' : 'Filter & Budget'}</span>
              </button>
              {isFiltering && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center min-h-[38px] px-3.5 py-1.5 text-xs font-medium rounded-full border border-[#E4E2DC] bg-[#FAF9F5] text-[#5A655D] hover:text-[#162119] transition-colors cursor-pointer"
                >
                  {locale === 'bn' ? 'রিসেট' : 'Reset'}
                </button>
              )}
            </div>
          </div>

          {/* Interactive Collection Switcher Bar & Sort Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Segmented Collection Tabs */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-[#F2EFE9] border border-[#E4E2DC] overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveCollection('all')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeCollection === 'all'
                    ? 'bg-[#1B4332] text-[#FAF9F5]'
                    : 'text-[#5A655D] hover:text-[#162119]'
                }`}
              >
                {locale === 'bn' ? 'সব পণ্য' : 'All Products'}
              </button>

              <button
                type="button"
                onClick={() => setActiveCollection('featured')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeCollection === 'featured'
                    ? 'bg-[#1B4332] text-[#FAF9F5]'
                    : 'text-[#5A655D] hover:text-[#162119]'
                }`}
              >
                {locale === 'bn' ? 'নির্বাচিত' : 'Featured'}
              </button>

              <button
                type="button"
                onClick={() => setActiveCollection('best_sellers')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeCollection === 'best_sellers'
                    ? 'bg-[#1B4332] text-[#FAF9F5]'
                    : 'text-[#5A655D] hover:text-[#162119]'
                }`}
              >
                {locale === 'bn' ? 'বেস্ট সেলার' : 'Best Sellers'}
              </button>

              <button
                type="button"
                onClick={() => setActiveCollection('new_arrivals')}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  activeCollection === 'new_arrivals'
                    ? 'bg-[#1B4332] text-[#FAF9F5]'
                    : 'text-[#5A655D] hover:text-[#162119]'
                }`}
              >
                {locale === 'bn' ? 'নতুন আগমন' : 'New Arrivals'}
              </button>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-2 text-xs">
              <span className="text-[#5A655D] hidden sm:inline">
                {locale === 'bn' ? 'সাজান:' : 'Sort:'}
              </span>
              <select
                aria-label={uiText("Sort products", locale)}
                value={sortBy}
                onChange={(e) =>
                  setSortBy(
                    e.target.value as 'popular' | 'price_asc' | 'price_desc' | 'rating'
                  )
                }
                className="min-h-[38px] px-3 py-1.5 text-xs font-medium rounded-xl bg-[#F2EFE9] border border-[#E4E2DC] text-[#162119] focus:outline-none focus:border-[#1B4332]"
              >
                <option value="popular">
                  {locale === 'bn' ? 'জনপ্রিয়তা অনুযায়ী' : 'Most Popular'}
                </option>
                <option value="price_asc">
                  {locale === 'bn' ? 'দাম: কম থেকে বেশি' : 'Price: Low to High'}
                </option>
                <option value="price_desc">
                  {locale === 'bn' ? 'দাম: বেশি থেকে কম' : 'Price: High to Low'}
                </option>
                <option value="rating">
                  {locale === 'bn' ? 'টপ রেটেড' : 'Top Rated'}
                </option>
              </select>
            </div>
          </div>

          {/* Sub-Category Filter Tabs (Category Navigation with counts) */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 pt-1">
            <button
              type="button"
              onClick={() => setActiveCategorySlug(null)}
              className={`px-3.5 py-1.5 text-xs font-semibold rounded-full border transition-all whitespace-nowrap cursor-pointer ${
                !activeCategorySlug
                  ? 'bg-[#1B4332] text-[#FAF9F5] border-[#1B4332]'
                  : 'bg-[#FAF9F5] text-[#5A655D] border-[#E4E2DC] hover:text-[#162119] hover:border-[#1B4332]'
              }`}
            >
              <span>{locale === 'bn' ? 'সকল ক্যাটাগরি' : 'All Categories'}</span>
            </button>
            {categories.map((c) => {
              const count = products.filter((p) => p.categoryId === c.id).length;
              const isSelected = activeCategorySlug === c.slug;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setActiveCategorySlug(isSelected ? null : c.slug)}
                  className={`px-3.5 py-1.5 text-xs font-medium rounded-full border transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[#1B4332] text-[#FAF9F5] border-[#1B4332] font-semibold'
                      : 'bg-[#FAF9F5] text-[#5A655D] border-[#E4E2DC] hover:text-[#162119] hover:border-[#1B4332]'
                  }`}
                >
                  <span>{locale === 'bn' ? c.nameBn : c.nameEn}</span>
                  <span className={`text-[10px] tabular-nums ${isSelected ? 'text-[#E8F0EC]' : 'text-[#5A655D]'}`}>
                    ({formatLocaleNumber(count, locale)})
                  </span>
                </button>
              );
            })}
          </div>

          {/* Frameless 4:5 Portrait Product Grid */}
          {displayedProducts.length === 0 ? (
            <EmptyState
              title={dict.common.noResults}
              description={
                locale === 'bn'
                  ? 'আপনার নির্বাচিত ফিল্টারে কোনো পণ্য পাওয়া যায়নি। ফিল্টার রিসেট করে আবার চেষ্টা করুন।'
                  : 'No products matched your active filters. Try resetting the filter.'
              }
              actionLabel={locale === 'bn' ? 'সব পণ্য দেখান' : 'Reset All Filters'}
              onAction={resetAllFilters}
            />
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-5 gap-y-10">
              {displayedProducts.map((product) => (
                <ProductCard key={product.productId} product={product} />
              ))}
            </div>
          )}
        </section>
      </div>

      {/* FILTER DRAWER / SHEET */}
      <ResponsiveSheet
        open={isFilterOpen}
        onOpenChange={setIsFilterOpen}
        title={locale === 'bn' ? 'পণ্য ফিল্টার ও বাজেট' : 'Filter & Budget'}
      >
        <div className="p-4 space-y-6 text-xs">
          {/* Category Selector */}
          <div className="space-y-2">
            <label className="font-semibold uppercase text-[11px] tracking-wider text-[#5A655D]">
              {locale === 'bn' ? 'ক্যাটাগরি' : 'Category'}
            </label>
            <div className="space-y-1">
              <label className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-[#F2EFE9]">
                <input
                  type="radio"
                  name="catFilter"
                  checked={!activeCategorySlug}
                  onChange={() => setActiveCategorySlug(null)}
                  className="w-4 h-4 accent-[#1B4332]"
                />
                <span className="text-[#162119] font-medium">
                  {locale === 'bn' ? 'সকল ক্যাটাগরি' : 'All Categories'}
                </span>
              </label>
              {categories.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2.5 cursor-pointer p-2 rounded-lg hover:bg-[#F2EFE9]"
                >
                  <input
                    type="radio"
                    name="catFilter"
                    checked={activeCategorySlug === c.slug}
                    onChange={() => setActiveCategorySlug(c.slug)}
                    className="w-4 h-4 accent-[#1B4332]"
                  />
                  <span className="text-[#162119] font-medium">
                    {locale === 'bn' ? c.nameBn : c.nameEn}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {/* Budget Range Slider */}
          <div className="space-y-2 pt-3 border-t border-[#E4E2DC]">
            <div className="flex items-center justify-between">
              <label className="font-semibold uppercase text-[11px] tracking-wider text-[#5A655D]">
                {locale === 'bn' ? 'সর্বোচ্চ বাজেট' : 'Max Budget'}
              </label>
              <span className="font-mono font-bold text-[#1B4332]"><LocalizedText source={"৳"} area="storefront" />{maxPriceBdt}</span>
            </div>
            <input
              type="range"
              min={500}
              max={15000}
              step={100}
              value={maxPriceBdt}
              onChange={(e) => setMaxPriceBdt(Number(e.target.value))}
              className="w-full accent-[#1B4332]"
            />
            <div className="flex justify-between text-[10px] text-[#5A655D] font-mono">
              <span>৳৫০০</span>
              <span>৳১৫,০০০</span>
            </div>
          </div>

          {/* In Stock Only Checkbox */}
          <div className="pt-3 border-t border-[#E4E2DC]">
            <label className="flex items-center gap-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="w-4 h-4 accent-[#1B4332]"
              />
              <span className="font-semibold text-[#162119]">
                {locale === 'bn' ? 'শুধুমাত্র স্টকে থাকা পণ্য' : 'In-Stock Only'}
              </span>
            </label>
          </div>

          {/* Apply / Reset Buttons */}
          <div className="pt-4 border-t border-[#E4E2DC] flex items-center justify-end gap-2">
            <Button variant="outline" size="sm" onClick={resetAllFilters}>
              {locale === 'bn' ? 'রিসেট' : 'Reset'}
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={() => setIsFilterOpen(false)}
            >
              {locale === 'bn' ? 'প্রয়োগ করুন' : 'Apply'}
            </Button>
          </div>
        </div>
      </ResponsiveSheet>
    </StorefrontShell>
  );
}
