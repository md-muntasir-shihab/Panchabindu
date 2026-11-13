'use client';
import { uiText } from '@/src/lib/i18n/ui-text';

import { LocalizedText } from '@/src/components/ui/localized-text';


// src/components/storefront/category-detail-client.tsx
// Dedicated Category Page Client with:
//   - Left Sidebar: Sub-categories list, in-stock filter, price range slider, category switcher
//   - Right Content: Category title, description, count, sorting dropdown, and 4:5 portrait product grid

import * as React from 'react';
import Link from 'next/link';
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
} from '@/src/lib/db/repository';
import type { StorefrontProductDTO } from '@/src/types/domain';
import { useLocaleStore } from '@/src/store/use-locale-store';
import { formatLocaleNumber } from '@/src/lib/i18n/dictionaries';
import { EmptyState } from '../ui/primitives';
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

  const resetFilters = () => {
    setInStockOnly(false);
    setMaxPriceBdt(10000);
    setSearchFilter('');
    setSortBy('popular');
  };

  return (
    <StorefrontShell
      siteSettings={siteSettings}
      categories={categories}
      activeCategorySlug={currentCategory.slug}
    >
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12 space-y-8">
        {/* Breadcrumb */}
        <nav
          aria-label={uiText("Breadcrumb", locale)}
          className="flex items-center gap-1.5 text-xs text-[#5A655D]"
        >
          <Link href="/" className="hover:text-[#1B4332] transition-colors">
            {dict.common.home}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-[#5A655D]" />
          <Link
            href="/categories"
            className="hover:text-[#1B4332] transition-colors"
          >
            {locale === 'bn' ? 'ক্যাটাগরি' : 'Categories'}
          </Link>
          <ChevronRight className="w-3.5 h-3.5 text-[#5A655D]" />
          <span className="text-[#162119] font-semibold">
            {locale === 'bn' ? currentCategory.nameBn : currentCategory.nameEn}
          </span>
        </nav>

        {/* Category Header Card */}
        <div className="p-6 sm:p-8 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <span className="text-xs font-semibold text-[#1B4332] uppercase tracking-wider">
              {locale === 'bn' ? 'ক্যাটাগরি ভিত্তিক কালেকশন' : 'Category Collection'}
            </span>
            <h1 className="text-2xl sm:text-4xl font-bold text-[#162119] tracking-tight">
              {locale === 'bn' ? currentCategory.nameBn : currentCategory.nameEn}
            </h1>
            <p className="text-xs sm:text-sm text-[#5A655D] leading-relaxed">
              {locale === 'bn'
                ? currentCategory.descriptionBn
                : currentCategory.descriptionEn}
            </p>
          </div>

          <div className="p-4 rounded-xl border border-[#E4E2DC] bg-[#FAF9F5] shrink-0 text-center md:text-right">
            <p className="text-xs text-[#5A655D]">
              {locale === 'bn' ? 'মোট উপলব্ধ পণ্য' : 'Available Products'}
            </p>
            <p className="text-2xl font-bold text-[#1B4332] tabular-nums mt-0.5">
              {formatLocaleNumber(displayedProducts.length, locale)}<LocalizedText source={"টি"} area="storefront" />{" "}</p>
          </div>
        </div>

        {/* 2-Column Layout: Left Sidebar + Right Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* LEFT SIDEBAR: Sub-categories & Filters (3.5 cols) */}
          <aside className="lg:col-span-3 space-y-6">
            {/* Category Directory Selector */}
            <div className="p-5 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] space-y-3.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#162119] uppercase tracking-wider">
                  {locale === 'bn' ? 'সকল ক্যাটাগরি' : 'All Categories'}
                </span>
                <Link
                  href="/categories"
                  className="text-[11px] font-semibold text-[#1B4332] hover:underline"
                >
                  {locale === 'bn' ? 'ডিরেক্টরি' : 'Directory'}
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
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold transition-all ${
                        isCurrent
                          ? 'bg-[#1B4332] text-[#FAF9F5] shadow-sm'
                          : 'bg-[#FAF9F5] text-[#162119] border border-[#E4E2DC]/80 hover:border-[#1B4332] hover:bg-white'
                      }`}
                    >
                      <span className="truncate">
                        {locale === 'bn' ? c.nameBn : c.nameEn}
                      </span>
                      <span
                        className={`text-[10px] tabular-nums font-medium ${
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
            <div className="p-5 rounded-2xl border border-[#E4E2DC] bg-[#FAF9F5] space-y-5 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-bold text-[#162119] uppercase tracking-wider text-[11px]">
                  {locale === 'bn' ? 'ফিল্টার ও বাজেট' : 'Filters'}
                </span>
                <button
                  type="button"
                  onClick={resetFilters}
                  className="text-[11px] text-[#5A655D] hover:text-[#1B4332] hover:underline cursor-pointer"
                >
                  {locale === 'bn' ? 'রিসেট' : 'Reset'}
                </button>
              </div>

              {/* In-Stock Only Toggle */}
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

              {/* Price Range Slider */}
              <div className="space-y-2 pt-3 border-t border-[#E4E2DC]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-[#5A655D]">
                    {locale === 'bn' ? 'সর্বোচ্চ বাজেট' : 'Max Budget'}
                  </span>
                  <span className="font-mono font-bold text-[#1B4332]">
                    <LocalizedText source={"৳"} area="storefront" />{maxPriceBdt}
                  </span>
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
            </div>
          </aside>

          {/* RIGHT GRID: Sorting Bar + Product Grid (9 cols) */}
          <main className="lg:col-span-9 space-y-6">
            {/* Sorting & Filter Summary Bar */}
            <div className="p-3.5 rounded-xl border border-[#E4E2DC] bg-[#F2EFE9] flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-[#162119]">
                  {locale === 'bn' ? currentCategory.nameBn : currentCategory.nameEn}
                </span>
                <span aria-hidden="true" className="text-[#5A655D]">·</span>
                <span className="text-[#5A655D] tabular-nums">
                  {formatLocaleNumber(displayedProducts.length, locale)}টি পণ্য পাওয়া গেছে
                </span>
              </div>

              {/* Sort Dropdown */}
              <div className="flex items-center gap-2">
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
                  className="min-h-[38px] px-3 py-1.5 text-xs font-semibold rounded-lg bg-[#FAF9F5] border border-[#E4E2DC] text-[#162119] focus:outline-none focus:border-[#1B4332]"
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
              <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 gap-x-5 gap-y-10">
                {displayedProducts.map((product) => (
                  <ProductCard key={product.productId} product={product} />
                ))}
              </div>
            )}
          </main>
        </div>
      </div>
    </StorefrontShell>
  );
}
