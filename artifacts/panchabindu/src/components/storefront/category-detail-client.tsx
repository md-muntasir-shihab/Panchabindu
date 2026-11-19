'use client';
import { uiText } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/storefront/category-detail-client.tsx
// Dedicated Category Page Client with:
//   - Left Sidebar: Sub-categories list, in-stock filter, price range slider, category switcher
//   - Right Content: Category title, description, count, sorting dropdown, and 4:5 portrait product grid

import * as React from 'react';
import { Link } from 'wouter';
import {
  ChevronRight,
  Filter,
  SlidersHorizontal,
  Package,
  ArrowLeft,
  Grid,
} from 'lucide-react';
import type {
  CategoryRecord,
  PublicSafeSiteSettingsDTO,
} from '@/lib/db/repository';
import type { StorefrontProductDTO } from '@/types/domain';
import { useLocaleStore } from '@/store/use-locale-store';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { Button, EmptyState } from '../ui/primitives';
import { ResponsiveSheet } from '../ui/responsive-sheet';
import { ProductCard } from './product-card';
import { StorefrontShell } from './storefront-shell';

export interface CategoryDetailClientProps {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
  products: StorefrontProductDTO[];
  currentCategory: CategoryRecord;
}

export function CategoryDetailClient({
  siteSettings,
  categories,
  products,
  currentCategory,
}: CategoryDetailClientProps) {
  const locale = useLocaleStore((s) => s.locale);
  const dict = useLocaleStore((s) => s.t());

  const [sortBy, setSortBy] = React.useState<
    'popular' | 'price_asc' | 'price_desc' | 'rating'
  >('popular');
  const [inStockOnly, setInStockOnly] = React.useState(false);
  const [maxPriceBdt, setMaxPriceBdt] = React.useState<number>(10000);
  const [searchFilter, setSearchFilter] = React.useState('');
  const [isMobileFilterOpen, setIsMobileFilterOpen] = React.useState(false);

  // Products belonging strictly to this category
  const categoryProducts = React.useMemo(() => {
    return products.filter((p) => p.categoryId === currentCategory.id);
  }, [products, currentCategory.id]);

  // Filtered & Sorted Products
  const displayedProducts = React.useMemo(() => {
    const q = searchFilter.trim().toLowerCase();
    const maxPoisha = maxPriceBdt * 100;

    const list = categoryProducts.filter((p) => {
      // In Stock filter
      if (inStockOnly) {
        const totalAvail = p.variants.reduce((sum, v) => sum + v.stockAvailable, 0);
        if (totalAvail <= 0) return false;
      }

      // Budget filter
      const primaryVariant = p.variants[0];
      if (primaryVariant && primaryVariant.salePricePoisha > maxPoisha) {
        return false;
      }

      // Keyword query
      if (!q) return true;
      return (
        p.nameBn.toLowerCase().includes(q) ||
        p.nameEn.toLowerCase().includes(q) ||
        p.slug.toLowerCase().includes(q) ||
        p.variants.some((v) => v.publicSku.toLowerCase().includes(q))
      );
    });

    // Sorting
    return list.sort((a, b) => {
      const priceA = a.variants[0]?.salePricePoisha ?? 0;
      const priceB = b.variants[0]?.salePricePoisha ?? 0;
      if (sortBy === 'price_asc') return priceA - priceB;
      if (sortBy === 'price_desc') return priceB - priceA;
      if (sortBy === 'rating') return b.ratingAvgBp - a.ratingAvgBp;
      return b.totalSoldCount - a.totalSoldCount;
    });
  }, [categoryProducts, inStockOnly, maxPriceBdt, searchFilter, sortBy]);

  const activeFiltersCount = (inStockOnly ? 1 : 0) + (maxPriceBdt < 10000 ? 1 : 0);

  const resetFilters = () => {
    setInStockOnly(false);
    setMaxPriceBdt(10000);
    setSearchFilter('');
    setSortBy('popular');
  };

  const sidebarControls = (
    <div className="space-y-6">
      {/* Category Directory Selector */}
      <div className="p-4 sm:p-5 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-[#162119] uppercase tracking-wider">
            {locale === 'bn' ? 'সকল ক্যাটাগরি' : 'All Categories'}
          </span>
          <Link
            href="/shop"
            onClick={() => setIsMobileFilterOpen(false)}
            className="text-[11px] font-semibold text-[var(--store-accent)] hover:underline"
          >
            {locale === 'bn' ? 'সব পণ্য' : 'Shop all'}
          </Link>
        </div>

        <div className="space-y-1">
          {categories.map((c) => {
            const isCurrent = c.id === currentCategory.id;
            const cCount = products.filter((p) => p.categoryId === c.id).length;
            return (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                onClick={() => setIsMobileFilterOpen(false)}
                className={`w-full min-h-[42px] flex items-center justify-between px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
                  isCurrent
                    ? 'bg-[var(--store-accent)] text-[#FAF9F5] shadow-sm'
                    : 'bg-[#FAF9F5] text-[#162119] border border-[#E4E2DC]/80 hover:border-[var(--store-accent)] hover:bg-white'
                }`}
              >
                <span className="truncate">
                  {locale === 'bn' ? c.nameBn : c.nameEn}
                </span>
                <span
                  className={`text-[10px] tabular-nums font-medium shrink-0 ${
                    isCurrent ? 'text-[#E8F0EC]' : 'text-[#5A655D]'
                  }`}
                >
                  ({formatLocaleNumber(cCount, locale)})
                </span>
              </Link>
            );
          })}
        </div>
      </div>

      {/* In-Category Filter Controls */}
      <div className="p-4 sm:p-5 rounded-2xl border border-[#E4E2DC] bg-[#FAF9F5] space-y-5 text-xs">
        <div className="flex items-center justify-between">
          <span className="font-bold text-[#162119] uppercase tracking-wider text-[11px]">
            {locale === 'bn' ? 'ফিল্টার ও বাজেট' : 'Filters'}
          </span>
          <button
            type="button"
            onClick={resetFilters}
            className="text-[11px] text-[#5A655D] hover:text-[var(--store-accent)] hover:underline cursor-pointer"
          >
            {locale === 'bn' ? 'রিসেট' : 'Reset'}
          </button>
        </div>

        {/* In-Stock Only Toggle */}
        <label className="flex items-center gap-2.5 min-h-[36px] cursor-pointer">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setInStockOnly(e.target.checked)}
            className="w-4 h-4 accent-[var(--store-accent)]"
          />
          <span className="font-semibold text-[#162119]">
            {locale === 'bn' ? 'শুধুমাত্র স্টকে থাকা পণ্য' : 'In-Stock Only'}
          </span>
        </label>

        {/* Price Range Slider */}
        <div className="space-y-2 pt-3 border-t border-[#E4E2DC]">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-[#5A655D]">
              {locale === 'bn' ? 'সর্বোচ্চ বাজেট' : 'Max Budget'}
            </span>
            <span className="font-mono font-bold text-[var(--store-accent)]">
              <LocalizedText source={"৳"} area="storefront" />{formatLocaleNumber(maxPriceBdt, locale)}
            </span>
          </div>
          <input
            type="range"
            min={500}
            max={15000}
            step={100}
            value={maxPriceBdt}
            onChange={(e) => setMaxPriceBdt(Number(e.target.value))}
            className="w-full accent-[var(--store-accent)]"
          />
          <div className="flex justify-between text-[10px] text-[#5A655D] font-mono">
            <span>৳{formatLocaleNumber(500, locale)}</span>
            <span>৳{formatLocaleNumber(15000, locale)}</span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <StorefrontShell
      siteSettings={siteSettings}
      categories={categories}
      products={products}
      activeCategorySlug={currentCategory.slug}
    >
      <div className="max-w-7xl mx-auto px-3.5 sm:px-4 py-5 sm:py-12 space-y-5 sm:space-y-8">
        {/* Breadcrumb */}
        <nav
          aria-label={uiText("Breadcrumb", locale)}
          className="flex flex-wrap items-center gap-1.5 text-xs text-[#5A655D]"
        >
          <Link href="/" className="hover:text-[var(--store-accent)] transition-colors">
            {dict.common.home}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-[#5A655D]" />
          <Link
            href="/shop"
            className="hover:text-[var(--store-accent)] transition-colors"
          >
            {locale === 'bn' ? 'কেনাকাটা' : 'Shop'}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-[#5A655D]" />
          <span className="text-[#162119] font-semibold">
            {locale === 'bn' ? currentCategory.nameBn : currentCategory.nameEn}
          </span>
        </nav>

        {/* Category Header Card */}
        <div className="p-4 sm:p-8 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] flex flex-col md:flex-row md:items-center justify-between gap-4 sm:gap-6">
          <div className="space-y-1.5 sm:space-y-2 max-w-2xl">
            <span className="text-[11px] sm:text-xs font-semibold text-[var(--store-accent)] uppercase tracking-wider">
              {locale === 'bn' ? 'ক্যাটাগরি ভিত্তিক কালেকশন' : 'Category Collection'}
            </span>
            <h1 className="text-xl sm:text-4xl font-bold text-[#162119] tracking-tight [text-wrap:balance]">
              {locale === 'bn' ? currentCategory.nameBn : currentCategory.nameEn}
            </h1>
            <p className="text-xs sm:text-sm text-[#5A655D] leading-relaxed">
              {locale === 'bn'
                ? currentCategory.descriptionBn
                : currentCategory.descriptionEn}
            </p>
          </div>

          <div className="px-4 py-3 sm:p-4 rounded-xl border border-[#E4E2DC] bg-[#FAF9F5] shrink-0 flex md:block items-center justify-between md:text-right">
            <p className="text-xs text-[#5A655D]">
              {locale === 'bn' ? 'মোট উপলব্ধ পণ্য' : 'Available Products'}
            </p>
            <p className="text-lg sm:text-2xl font-bold text-[var(--store-accent)] tabular-nums md:mt-0.5">
              {formatLocaleNumber(displayedProducts.length, locale)}{locale === 'bn' ? 'টি' : ''}
            </p>
          </div>
        </div>

        {/* Mobile Quick Category Switcher (< lg) */}
        <div className="lg:hidden flex items-center gap-2 overflow-x-auto scrollbar-none pb-1">
          {categories.map((c) => {
            const isCurrent = c.id === currentCategory.id;
            return (
              <Link
                key={c.id}
                href={`/category/${c.slug}`}
                className={`min-h-[38px] px-3.5 py-1.5 inline-flex items-center rounded-lg font-mono text-[11px] border whitespace-nowrap transition-colors ${
                  isCurrent
                    ? 'bg-[var(--store-accent)] text-[#FAF9F5] border-[var(--store-accent)]'
                    : 'bg-[#FAF9F5] text-[#162119] border-[#E4E2DC]'
                }`}
              >
                {locale === 'bn' ? c.nameBn : c.nameEn}
              </Link>
            );
          })}
        </div>

        {/* 2-Column Layout: Left Sidebar (Desktop only) + Right Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
          {/* LEFT SIDEBAR: Desktop Only */}
          <aside className="hidden lg:block lg:col-span-3">
            {sidebarControls}
          </aside>

          {/* RIGHT GRID: Sorting Bar + Product Grid (9 cols) */}
          <div className="lg:col-span-9 space-y-5 sm:space-y-6 min-w-0">
            {/* Sorting & Filter Summary Bar */}
            <div className="p-3 sm:p-3.5 rounded-xl border border-[#E4E2DC] bg-[#F2EFE9] flex flex-wrap items-center justify-between gap-2.5 sm:gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(true)}
                  className="lg:hidden inline-flex items-center gap-1.5 min-h-[44px] px-3.5 rounded-lg border border-[#E4E2DC] bg-[#FAF9F5] text-xs font-semibold text-[#162119] cursor-pointer shrink-0"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--store-accent)]" />
                  <span>
                    {locale === 'bn' ? 'ফিল্টার' : 'Filters'}
                    {activeFiltersCount > 0 ? ` (${formatLocaleNumber(activeFiltersCount, locale)})` : ''}
                  </span>
                </button>
                <span className="font-semibold text-[#162119] truncate hidden sm:inline">
                  {locale === 'bn' ? currentCategory.nameBn : currentCategory.nameEn}
                </span>
                <span aria-hidden="true" className="text-[#5A655D] hidden sm:inline">·</span>
                <span className="text-[#5A655D] tabular-nums truncate">
                  {locale === 'bn'
                    ? `${formatLocaleNumber(displayedProducts.length, locale)}টি পণ্য`
                    : `${displayedProducts.length} items`}
                </span>
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-2 w-full sm:w-auto justify-between sm:justify-end">
                <span className="text-[#5A655D] shrink-0">
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
                  className="min-h-[44px] sm:min-h-[38px] flex-1 sm:flex-none px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#FAF9F5] border border-[#E4E2DC] text-[#162119] focus:outline-none focus:border-[var(--store-accent)]"
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

            {/* Product Grid */}
            {displayedProducts.length === 0 ? (
              <EmptyState
                icon={<Package className="w-8 h-8 text-[#5A655D]" />}
                title={locale === 'bn' ? 'কোনো পণ্য পাওয়া যায়নি' : 'No products found'}
                description={
                  locale === 'bn'
                    ? 'আপনার নির্বাচিত ফিল্টারে কোনো পণ্য মেলেনি। বাজেট বা স্টক ফিল্টার রিসেট করে আবার চেষ্টা করুন।'
                    : 'No products matched your active filters in this category.'
                }
                actionLabel={locale === 'bn' ? 'ফিল্টার রিসেট করুন' : 'Reset Filters'}
                onAction={resetFilters}
              />
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-x-3 sm:gap-x-5 gap-y-6 sm:gap-y-10">
                {displayedProducts.map((product) => (
                  <ProductCard key={product.productId} product={product} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Filter & Categories Sheet */}
      <ResponsiveSheet
        open={isMobileFilterOpen}
        onOpenChange={setIsMobileFilterOpen}
        title={locale === 'bn' ? 'ক্যাটাগরি ও ফিল্টার' : 'Categories & Filters'}
      >
        <div className="p-2 sm:p-4 space-y-5">
          {sidebarControls}
          <Button
            type="button"
            variant="primary"
            size="md"
            className="w-full min-h-[44px]"
            onClick={() => setIsMobileFilterOpen(false)}
          >
            {locale === 'bn'
              ? `${formatLocaleNumber(displayedProducts.length, locale)}টি পণ্য দেখুন`
              : `View ${displayedProducts.length} Products`}
          </Button>
        </div>
      </ResponsiveSheet>
    </StorefrontShell>
  );
}
