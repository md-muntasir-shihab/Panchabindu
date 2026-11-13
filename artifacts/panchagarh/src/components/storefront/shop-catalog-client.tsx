'use client';
import { getStorefrontConfig } from '@/lib/storefront/storefront-config';
import { localizedField } from '@/lib/i18n/ui-text';
import { uiText } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/storefront/shop-catalog-client.tsx
// Phase 6 (Section 9.3): Dedicated All Products (/shop) & Search Results (/search) Client
// Preserves Botanical Heritage Calm design (#FAF9F5, #F2EFE9, #1B4332, #162119, #E4E2DC)
// Features:
//   - Category Breadcrumb
//   - Min/Max Price Inputs & Price Range Slider
//   - Real Size & Color Attribute Filters (zero fake filters; explicit Brand Data Model Gap notice)
//   - Availability (In-Stock) & Free Delivery Filters
//   - Sorting & Verified Page/Cursor Pagination
//   - Mobile Filter Drawer (ResponsiveSheet)
//   - Search Suggestions & Zero-Result Fallback Recommendations

import * as React from 'react';
import { Link } from 'wouter';
import {
  ChevronRight,
  ChevronLeft,
  SlidersHorizontal,
  Search,
  RotateCcw,
  Info,
  Sparkles,
} from 'lucide-react';
import type {
  CategoryRecord,
  PublicSafeSiteSettingsDTO,
} from '@/lib/db/repository';
import type { StorefrontProductDTO } from '@/types/domain';
import {
  extractCatalogFacets,
  getSearchSuggestions,
  queryStorefrontCatalog,
  type CatalogSortOption,
} from '@/lib/storefront/phase6-catalog-facets';
import { useLocaleStore } from '@/store/use-locale-store';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { Button, EmptyState } from '../ui/primitives';
import { ResponsiveSheet } from '../ui/responsive-sheet';
import { ProductCard } from './product-card';
import { StorefrontShell } from './storefront-shell';

export interface ShopCatalogClientProps {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
  products: StorefrontProductDTO[];
  mode?: 'shop' | 'search';
  initialQuery?: string;
  initialCategorySlug?: string | null;
}

export function ShopCatalogClient({
  siteSettings,
  categories,
  products,
  mode = 'shop',
  initialQuery = '',
  initialCategorySlug = null,
}: ShopCatalogClientProps) {
  const locale = useLocaleStore((s) => s.locale);
  const dict = useLocaleStore((s) => s.t());

  const facets = React.useMemo(() => extractCatalogFacets(products), [products]);
  const defaultMinBdt = Math.floor(facets.minPricePoisha / 100);
  const defaultMaxBdt = Math.max(
    1000,
    Math.ceil(facets.maxPricePoisha / 100)
  );

  const [searchQuery, setSearchQuery] = React.useState(initialQuery);
  const [selectedCategorySlug, setSelectedCategorySlug] = React.useState<
    string | null
  >(initialCategorySlug);
  const [minPriceBdt, setMinPriceBdt] = React.useState<number>(defaultMinBdt);
  const [maxPriceBdt, setMaxPriceBdt] = React.useState<number>(defaultMaxBdt);
  const [selectedSizes, setSelectedSizes] = React.useState<string[]>([]);
  const [selectedColors, setSelectedColors] = React.useState<string[]>([]);
  const [inStockOnly, setInStockOnly] = React.useState(false);
  const [freeDeliveryOnly, setFreeDeliveryOnly] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<CatalogSortOption>('popular');
  const [page, setPage] = React.useState<number>(1);
  const [isMobileFilterOpen, setIsMobileFilterOpen] = React.useState(false);
  const [showBrandGapInfo, setShowBrandGapInfo] = React.useState(false);

  const pageSize = 8;

  const queryResult = React.useMemo(
    () =>
      queryStorefrontCatalog(products, categories, {
        categorySlug: selectedCategorySlug,
        searchQuery,
        minPricePoisha: Math.max(0, minPriceBdt * 100),
        maxPricePoisha: Math.max(minPriceBdt * 100, maxPriceBdt * 100),
        sizes: selectedSizes,
        colors: selectedColors,
        inStockOnly,
        freeDeliveryOnly,
        sortBy,
        page,
        pageSize,
      }),
    [
      products,
      categories,
      selectedCategorySlug,
      searchQuery,
      minPriceBdt,
      maxPriceBdt,
      selectedSizes,
      selectedColors,
      inStockOnly,
      freeDeliveryOnly,
      sortBy,
      page,
    ]
  );

  const suggestions = React.useMemo(
    () => getSearchSuggestions(products, categories, searchQuery),
    [products, categories, searchQuery]
  );

  const toggleSize = (sizeVal: string) => {
    setSelectedSizes((prev) =>
      prev.includes(sizeVal)
        ? prev.filter((x) => x !== sizeVal)
        : [...prev, sizeVal]
    );
  };

  const toggleColor = (colorVal: string) => {
    setSelectedColors((prev) =>
      prev.includes(colorVal)
        ? prev.filter((x) => x !== colorVal)
        : [...prev, colorVal]
    );
  };

  const handleResetFilters = () => {
    setSelectedCategorySlug(null);
    setSearchQuery('');
    setMinPriceBdt(defaultMinBdt);
    setMaxPriceBdt(defaultMaxBdt);
    setSelectedSizes([]);
    setSelectedColors([]);
    setInStockOnly(false);
    setFreeDeliveryOnly(false);
    setSortBy('popular');
    setPage(1);
  };

  const activeCategoryObj = selectedCategorySlug
    ? categories.find((c) => c.slug === selectedCategorySlug)
    : null;

  const filterControlsContent = (
    <div className="space-y-6 text-xs">
      {/* Header & Reset */}
      <div className="flex items-center justify-between border-b border-[#E4E2DC] pb-3">
        <span className="font-bold text-[#162119] uppercase tracking-wider text-[11px]">
          {locale === 'bn' ? 'ফিল্টার ও পরিশোধন' : 'Filter & Refine'}
        </span>
        <button
          type="button"
          onClick={handleResetFilters}
          className="inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--store-accent)] hover:underline cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" />
          {locale === 'bn' ? 'সব রিসেট' : 'Reset All'}
        </button>
      </div>

      {/* Category Filter */}
      <div className="space-y-2.5">
        <p className="font-bold text-[#162119]">
          {locale === 'bn' ? 'ক্যাটাগরি নির্বাচন' : 'Categories'}
        </p>
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => setSelectedCategorySlug(null)}
            className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              selectedCategorySlug === null
                ? 'bg-[var(--store-accent)] text-[#FAF9F5]'
                : 'bg-[#FAF9F5] text-[#162119] border border-[#E4E2DC] hover:border-[var(--store-accent)]'
            }`}
          >
            <span>{locale === 'bn' ? 'সকল ক্যাটাগরি' : 'All Categories'}</span>
            <span>({formatLocaleNumber(products.length, locale)})</span>
          </button>
          {categories.map((cat) => {
            const isSelected = selectedCategorySlug === cat.slug;
            const count = products.filter((p) => p.categoryId === cat.id).length;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategorySlug(cat.slug)}
                className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-[var(--store-accent)] text-[#FAF9F5]'
                    : 'bg-[#FAF9F5] text-[#162119] border border-[#E4E2DC] hover:border-[var(--store-accent)]'
                }`}
              >
                <span className="truncate">
                  {locale === 'bn' ? cat.nameBn : cat.nameEn}
                </span>
                <span>({formatLocaleNumber(count, locale)})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Availability & Free Delivery Toggles */}
      <div className="space-y-2.5 pt-3 border-t border-[#E4E2DC]">
        <p className="font-bold text-[#162119]">
          {locale === 'bn' ? 'উপলব্ধতা ও ডেলিভারি' : 'Availability & Delivery'}
        </p>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={inStockOnly}
            onChange={(e) => setInStockOnly(e.target.checked)}
            className="w-4 h-4 accent-[var(--store-accent)]"
          />
          <span className="font-medium text-[#162119]">
            {locale === 'bn'
              ? `শুধুমাত্র স্টকে থাকা পণ্য (${formatLocaleNumber(
                  facets.inStockProductsCount,
                  locale
                )})`
              : `In-Stock Only (${facets.inStockProductsCount})`}
          </span>
        </label>
        <label className="flex items-center gap-2.5 cursor-pointer">
          <input
            type="checkbox"
            checked={freeDeliveryOnly}
            onChange={(e) => setFreeDeliveryOnly(e.target.checked)}
            className="w-4 h-4 accent-[var(--store-accent)]"
          />
          <span className="font-medium text-[#162119]">
            {locale === 'bn'
              ? `ফ্রি ডেলিভারি পণ্য (${formatLocaleNumber(
                  facets.freeDeliveryProductsCount,
                  locale
                )})`
              : `Free Delivery Eligible (${facets.freeDeliveryProductsCount})`}
          </span>
        </label>
      </div>

      {/* Min / Max Price Filter & Range Slider */}
      <div className="space-y-3 pt-3 border-t border-[#E4E2DC]">
        <div className="flex items-center justify-between">
          <span className="font-bold text-[#162119]">
            {locale === 'bn' ? 'মূল্য সীমা (৳)' : 'Price Range (BDT)'}
          </span>
          <span className="font-mono font-bold text-[var(--store-accent)]">
            <LocalizedText source={"৳"} area="storefront" />{formatLocaleNumber(minPriceBdt, locale)} — ৳
            {formatLocaleNumber(maxPriceBdt, locale)}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <div>
            <label
              htmlFor="shop-min-price"
              className="block text-[10px] text-[#5A655D] mb-1"
            >
              {locale === 'bn' ? 'সর্বনিম্ন (৳)' : 'Min (BDT)'}
            </label>
            <input
              id="shop-min-price"
              type="number"
              min={0}
              max={maxPriceBdt}
              value={minPriceBdt}
              onChange={(e) =>
                setMinPriceBdt(Math.max(0, Number(e.target.value) || 0))
              }
              className="w-full h-9 px-2.5 rounded-lg border border-[#E4E2DC] bg-white text-xs font-mono text-[#162119]"
            />
          </div>
          <div>
            <label
              htmlFor="shop-max-price"
              className="block text-[10px] text-[#5A655D] mb-1"
            >
              {locale === 'bn' ? 'সর্বোচ্চ (৳)' : 'Max (BDT)'}
            </label>
            <input
              id="shop-max-price"
              type="number"
              min={minPriceBdt}
              max={50000}
              value={maxPriceBdt}
              onChange={(e) =>
                setMaxPriceBdt(
                  Math.max(minPriceBdt, Number(e.target.value) || defaultMaxBdt)
                )
              }
              className="w-full h-9 px-2.5 rounded-lg border border-[#E4E2DC] bg-white text-xs font-mono text-[#162119]"
            />
          </div>
        </div>

        <input
          type="range"
          aria-label={locale === 'bn' ? 'সর্বোচ্চ মূল্য স্লাইডার' : 'Max Price Slider'}
          min={defaultMinBdt}
          max={Math.max(defaultMaxBdt, 10000)}
          step={50}
          value={maxPriceBdt}
          onChange={(e) => setMaxPriceBdt(Number(e.target.value))}
          className="w-full accent-[var(--store-accent)]"
        />
      </div>

      {/* Real Color / Shade Filter */}
      {facets.availableColors.length > 0 && (
        <div className="space-y-2.5 pt-3 border-t border-[#E4E2DC]">
          <p className="font-bold text-[#162119]">
            {locale === 'bn' ? 'রঙ ও ভ্যারিয়েন্ট (Color)' : 'Color & Shade'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {facets.availableColors.map((colorVal) => {
              const active = selectedColors.includes(colorVal);
              return (
                <button
                  key={colorVal}
                  type="button"
                  onClick={() => toggleColor(colorVal)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--store-accent)] text-[#FAF9F5] border-[var(--store-accent)]'
                      : 'bg-white text-[#162119] border-[#E4E2DC] hover:border-[var(--store-accent)]'
                  }`}
                >
                  {colorVal}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Real Size / Weight Filter */}
      {facets.availableSizes.length > 0 && (
        <div className="space-y-2.5 pt-3 border-t border-[#E4E2DC]">
          <p className="font-bold text-[#162119]">
            {locale === 'bn' ? 'মাপ ও ওজন (Size / Weight)' : 'Size & Weight'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {facets.availableSizes.map((sizeVal) => {
              const active = selectedSizes.includes(sizeVal);
              return (
                <button
                  key={sizeVal}
                  type="button"
                  onClick={() => toggleSize(sizeVal)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-medium border transition-colors cursor-pointer ${
                    active
                      ? 'bg-[var(--store-accent)] text-[#FAF9F5] border-[var(--store-accent)]'
                      : 'bg-white text-[#162119] border-[#E4E2DC] hover:border-[var(--store-accent)]'
                  }`}
                >
                  {sizeVal}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Honest Data Model Gap Note for Brand Filter (Section 9.3 Rule) */}
      <div className="pt-3 border-t border-[#E4E2DC] space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-[#5A655D]">
            {locale === 'bn' ? 'ব্র্যান্ড ফিল্টার (Brand)' : 'Brand Filter'}
          </span>
          <button
            type="button"
            onClick={() => setShowBrandGapInfo((v) => !v)}
            aria-label="Brand Filter Data Model Info"
            className="inline-flex items-center gap-1 text-[11px] text-[var(--store-accent)] font-semibold cursor-pointer"
          >
            <Info className="w-3.5 h-3.5" aria-hidden="true" />
            <span>ⓘ</span>
          </button>
        </div>
        {showBrandGapInfo && (
          <p className="p-2.5 rounded-lg bg-[#F2EFE9] border border-[#E4E2DC] text-[11px] text-[#5A655D] leading-relaxed">
            {localizedField(facets, "brandFilterGapNoteBn", locale)}
          </p>
        )}
      </div>
    </div>
  );

  return (
    <StorefrontShell
      siteSettings={siteSettings}
      categories={categories}
      products={products}
      searchQuery={searchQuery}
      onSearchChange={setSearchQuery}
      activeCategorySlug={selectedCategorySlug}
      onSelectCategory={setSelectedCategorySlug}
    >
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-10 space-y-8">
        {/* 1. Category Breadcrumb */}
        <nav
          aria-label={uiText("Breadcrumb", locale)}
          className="flex flex-wrap items-center gap-1.5 text-xs text-[#5A655D]"
        >
          <Link href="/" className="hover:text-[var(--store-accent)] transition-colors">
            {dict.common.home}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-[#5A655D]" />
          {mode === 'search' ? (
            <span className="text-[#162119] font-semibold">
              {locale === 'bn' ? 'অনুসন্ধান ফলাফল' : 'Search Results'}
            </span>
          ) : (
            <Link
              href="/shop"
              onClick={() => setSelectedCategorySlug(null)}
              className={
                activeCategoryObj
                  ? 'hover:text-[var(--store-accent)] transition-colors'
                  : 'text-[#162119] font-semibold'
              }
            >
              {locale === 'bn' ? 'সকল পণ্য (Shop)' : 'All Products (Shop)'}
            </Link>
          )}
          {activeCategoryObj && (
            <>
              <ChevronRight className="w-3.5 h-3.5 text-[#5A655D]" />
              <span className="text-[#162119] font-semibold">
                {locale === 'bn'
                  ? activeCategoryObj.nameBn
                  : activeCategoryObj.nameEn}
              </span>
            </>
          )}
        </nav>

        {/* 2. Shop / Search Hero Banner */}
        <div className="p-6 sm:p-8 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[var(--store-accent)] uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
              {mode === 'search'
                ? locale === 'bn'
                  ? 'ক্যাটালগ অনুসন্ধান ইঞ্জিন'
                  : 'Catalog Search Engine'
                : locale === 'bn'
                ? siteSettings.taglineBn
                : siteSettings.taglineEn}
            </span>
            <h1 className="text-2xl sm:text-4xl font-bold text-[#162119] tracking-tight">
              {mode === 'search'
                ? searchQuery.trim()
                  ? locale === 'bn'
                    ? `"${searchQuery}"-এর অনুসন্ধান ফলাফল`
                    : `Search Results for "${searchQuery}"`
                  : locale === 'bn'
                  ? 'পণ্য অনুসন্ধান করুন'
                  : 'Search Products'
                : activeCategoryObj
                ? locale === 'bn'
                  ? activeCategoryObj.nameBn
                  : activeCategoryObj.nameEn
                : locale === 'bn'
                ? 'সকল পণ্য ও কারুশিল্প'
                : 'All Authentic Products'}
            </h1>
            <p className="text-xs sm:text-sm text-[#5A655D] leading-relaxed">
              {activeCategoryObj
                ? locale === 'bn'
                  ? activeCategoryObj.descriptionBn
                  : activeCategoryObj.descriptionEn
                : locale === 'bn'
                ? getStorefrontConfig(siteSettings).collectionSubtitleBn
                : getStorefrontConfig(siteSettings).collectionSubtitleEn}
            </p>
          </div>

          {/* Search Input inside Banner for instant refinement */}
          <div className="w-full md:w-80 space-y-2">
            <div className="relative">
              <Search
                className="w-4 h-4 text-[#5A655D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                aria-label={locale === 'bn' ? 'পণ্য খুঁজুন' : 'Search products'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={
                  locale === 'bn'
                    ? 'নাম, ক্যাটাগরি বা SKU দিয়ে খুঁজুন...'
                    : 'Search by name, category or SKU...'
                }
                className="w-full h-11 pl-10 pr-4 rounded-xl border border-[#E4E2DC] bg-[#FAF9F5] text-xs text-[#162119] placeholder:text-[#5A655D] focus:outline-none focus:border-[var(--store-accent)]"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {suggestions.suggestedKeywords.slice(0, 3).map((kw) => (
                <button
                  key={kw.labelEn}
                  type="button"
                  onClick={() =>
                    setSearchQuery(locale === 'bn' ? kw.labelBn : kw.labelEn)
                  }
                  className="px-2 py-0.5 rounded-full bg-[#FAF9F5] border border-[#E4E2DC] text-[10px] font-medium text-[#5A655D] hover:border-[var(--store-accent)] hover:text-[var(--store-accent)] cursor-pointer"
                >
                  {locale === 'bn' ? kw.labelBn : kw.labelEn}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 3. Main 2-Column Layout: Left Sidebar Filters + Right Product Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Desktop Left Filter Sidebar */}
          <aside className="hidden lg:block lg:col-span-3 p-5 rounded-2xl border border-[#E4E2DC] bg-[#FAF9F5]">
            {filterControlsContent}
          </aside>

          {/* Right Product Grid & Toolbar */}
          <div className="lg:col-span-9 space-y-6">
            {/* Top Toolbar: Mobile Filter Trigger, Count, and Sorting */}
            <div className="p-3.5 rounded-xl border border-[#E4E2DC] bg-[#F2EFE9] flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsMobileFilterOpen(true)}
                  className="lg:hidden inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-[#E4E2DC] bg-[#FAF9F5] text-xs font-semibold text-[#162119] cursor-pointer"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5 text-[var(--store-accent)]" />
                  <span>
                    {locale === 'bn' ? 'ফিল্টার' : 'Filters'}
                    {queryResult.appliedFiltersCount > 0
                      ? ` (${formatLocaleNumber(
                          queryResult.appliedFiltersCount,
                          locale
                        )})`
                      : ''}
                  </span>
                </button>

                <span className="text-xs font-semibold text-[#162119]">
                  {locale === 'bn'
                    ? `মোট ${formatLocaleNumber(
                        queryResult.totalMatched,
                        locale
                      )}টি পণ্য পাওয়া গেছে`
                    : `Showing ${queryResult.totalMatched} products`}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <label
                  htmlFor="shop-sort-select"
                  className="text-xs text-[#5A655D] font-medium"
                >
                  {locale === 'bn' ? 'সাজান:' : 'Sort by:'}
                </label>
                <select
                  id="shop-sort-select"
                  value={sortBy}
                  onChange={(e) =>
                    setSortBy(e.target.value as CatalogSortOption)
                  }
                  className="h-9 px-3 rounded-lg border border-[#E4E2DC] bg-[#FAF9F5] text-xs font-semibold text-[#162119] focus:outline-none focus:border-[var(--store-accent)]"
                >
                  <option value="popular">
                    {locale === 'bn' ? 'সর্বাধিক জনপ্রিয়' : 'Most Popular'}
                  </option>
                  <option value="newest">
                    {locale === 'bn' ? 'নতুন সংযোজন' : 'Newest Arrivals'}
                  </option>
                  <option value="price_asc">
                    {locale === 'bn'
                      ? 'মূল্য: কম থেকে বেশি'
                      : 'Price: Low to High'}
                  </option>
                  <option value="price_desc">
                    {locale === 'bn'
                      ? 'মূল্য: বেশি থেকে কম'
                      : 'Price: High to Low'}
                  </option>
                  <option value="rating">
                    {locale === 'bn' ? 'সর্বোচ্চ রেটিং' : 'Highest Rated'}
                  </option>
                </select>
              </div>
            </div>

            {/* Active Filter Chips */}
            {queryResult.appliedFiltersCount > 0 && (
              <div className="flex flex-wrap items-center gap-2">
                {selectedCategorySlug && activeCategoryObj && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F0EC] text-[var(--store-accent)] text-xs font-semibold">
                    {locale === 'bn'
                      ? activeCategoryObj.nameBn
                      : activeCategoryObj.nameEn}
                    <button
                      type="button"
                      onClick={() => setSelectedCategorySlug(null)}
                      className="hover:opacity-75 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {inStockOnly && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F0EC] text-[var(--store-accent)] text-xs font-semibold">
                    {locale === 'bn' ? 'স্টকে আছে' : 'In Stock'}
                    <button
                      type="button"
                      onClick={() => setInStockOnly(false)}
                      className="hover:opacity-75 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {freeDeliveryOnly && (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F0EC] text-[var(--store-accent)] text-xs font-semibold">
                    {locale === 'bn' ? 'ফ্রি ডেলিভারি' : 'Free Delivery'}
                    <button
                      type="button"
                      onClick={() => setFreeDeliveryOnly(false)}
                      className="hover:opacity-75 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                )}
                {selectedColors.map((col) => (
                  <span
                    key={col}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F0EC] text-[var(--store-accent)] text-xs font-semibold"
                  >
                    {col}
                    <button
                      type="button"
                      onClick={() => toggleColor(col)}
                      className="hover:opacity-75 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
                {selectedSizes.map((sz) => (
                  <span
                    key={sz}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E8F0EC] text-[var(--store-accent)] text-xs font-semibold"
                  >
                    {sz}
                    <button
                      type="button"
                      onClick={() => toggleSize(sz)}
                      className="hover:opacity-75 cursor-pointer"
                    >
                      ×
                    </button>
                  </span>
                ))}
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-xs font-semibold text-[#A84A28] hover:underline cursor-pointer"
                >
                  {locale === 'bn' ? 'সব ফিল্টার মুছুন' : 'Clear All'}
                </button>
              </div>
            )}

            {/* Product Grid or Empty State with Fallback Recommendations */}
            {queryResult.items.length === 0 ? (
              <div className="space-y-8">
                <EmptyState
                  title={
                    locale === 'bn'
                      ? 'এই ফিল্টারে কোনো পণ্য পাওয়া যায়নি'
                      : 'No matching products found'
                  }
                  description={
                    locale === 'bn'
                      ? 'আপনার অনুসন্ধান বা বাজেট ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।'
                      : 'Try adjusting your search keywords or resetting the price and attribute filters.'
                  }
                  actionLabel={
                    locale === 'bn' ? 'সকল ফিল্টার রিসেট করুন' : 'Reset All Filters'
                  }
                  onAction={handleResetFilters}
                />

                {suggestions.fallbackRecommendations.length > 0 && (
                  <div className="space-y-4 pt-4 border-t border-[#E4E2DC]">
                    <h2 className="text-base font-bold text-[#162119]">
                      {locale === 'bn'
                        ? 'আপনার জন্য প্রস্তাবিত জনপ্রিয় পণ্য'
                        : 'Recommended In-Stock Products'}
                    </h2>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                      {suggestions.fallbackRecommendations.map((prod) => (
                        <ProductCard key={prod.productId} product={prod} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                  {queryResult.items.map((product) => (
                    <ProductCard key={product.productId} product={product} />
                  ))}
                </div>

                {/* Verified Pagination Bar */}
                {queryResult.totalPages > 1 && (
                  <nav
                    aria-label={uiText("Pagination", locale)}
                    className="pt-6 border-t border-[#E4E2DC] flex items-center justify-between gap-4"
                  >
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!queryResult.hasPrevPage}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      leftIcon={<ChevronLeft className="w-4 h-4" />}
                    >
                      {locale === 'bn' ? 'পূর্ববর্তী' : 'Previous'}
                    </Button>

                    <div className="flex items-center gap-1.5">
                      {Array.from(
                        { length: queryResult.totalPages },
                        (_, idx) => idx + 1
                      ).map((pageNum) => (
                        <button
                          key={pageNum}
                          type="button"
                          onClick={() => setPage(pageNum)}
                          className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                            pageNum === queryResult.page
                              ? 'bg-[var(--store-accent)] text-[#FAF9F5]'
                              : 'border border-[#E4E2DC] bg-[#FAF9F5] text-[#162119] hover:border-[var(--store-accent)]'
                          }`}
                        >
                          {formatLocaleNumber(pageNum, locale)}
                        </button>
                      ))}
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={!queryResult.hasNextPage}
                      onClick={() =>
                        setPage((p) =>
                          Math.min(queryResult.totalPages, p + 1)
                        )
                      }
                      rightIcon={<ChevronRight className="w-4 h-4" />}
                    >
                      {locale === 'bn' ? 'পরবর্তী' : 'Next'}
                    </Button>
                  </nav>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Filter Drawer */}
      <ResponsiveSheet
        open={isMobileFilterOpen}
        onOpenChange={setIsMobileFilterOpen}
        title={locale === 'bn' ? 'পণ্য ফিল্টার ও বাজেট' : 'Product Filters'}
        description={
          locale === 'bn'
            ? 'ক্যাটাগরি, মূল্য সীমা, রঙ এবং স্টক স্ট্যাটাস অনুযায়ী পণ্য বাছাই করুন'
            : 'Filter products by category, price range, color, size, and availability'
        }
      >
        <div className="p-4 space-y-6">
          {filterControlsContent}
          <Button
            type="button"
            variant="primary"
            size="md"
            className="w-full"
            onClick={() => setIsMobileFilterOpen(false)}
          >
            {locale === 'bn'
              ? `${formatLocaleNumber(
                  queryResult.totalMatched,
                  locale
                )}টি পণ্য দেখুন`
              : `View ${queryResult.totalMatched} Products`}
          </Button>
        </div>
      </ResponsiveSheet>
    </StorefrontShell>
  );
}
