'use client';
import { productImageUrl, productImageFallback } from '@/lib/storefront/product-image';
import { getStorefrontConfig, safeStoreUrl } from '@/lib/storefront/storefront-config';
import { uiText } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/storefront/homepage-client.tsx
// Botanical Heritage Calm — Modern Minimalist Storefront Homepage
// Features:
//   - Spacious Split Editorial Hero on Soft Linen with accent CTA (soft token elevation, rule-line kicker)
//   - Hairline-Divided 4-Pillar Trust Strip (COD, 64-District Courier, 7-Day Returns, Artisan Provenance)
//   - Unified Interactive Collection Showcase with Frameless 4:5 Portrait Product Grid (Zero Duplication)
// Design tokens only (tokens.css): no arbitrary hex in UI (HOME-01).

import * as React from 'react';
import { Link } from 'wouter';
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
} from '@/lib/db/repository';
import type { StorefrontProductDTO } from '@/types/domain';
import { useLocaleStore } from '@/store/use-locale-store';
import { Button, EmptyState } from '../ui/primitives';
import { ResponsiveSheet } from '../ui/responsive-sheet';
import { ProductCard } from './product-card';
import { StorefrontShell } from './storefront-shell';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';

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
  const config = getStorefrontConfig(siteSettings);
  const text = (bn: string, en: string) => locale === 'bn' ? bn : en;
  const [heroIndex, setHeroIndex] = React.useState(0);
  const section = (type: string) => siteSettings.homepageSections.find(v => v.type === type);
  const visible = (type: string) => section(type)?.enabled ?? false;
  const position = (type: string) => ({ order: section(type)?.order ?? 100 });
  const budgetLimit = Math.max(1, Math.ceil(Math.max(0, ...products.flatMap(p => p.variants.map(v => v.salePricePoisha))) / 100));

  const [searchQuery, setSearchQuery] = React.useState('');
  const [activeCategorySlug, setActiveCategorySlug] = React.useState<string | null>(
    initialCategorySlug
  );
  const [activeCollection, setActiveCollection] = React.useState<CollectionTab>('all');
  const [sortBy, setSortBy] = React.useState<'popular' | 'price_asc' | 'price_desc' | 'rating'>(
    'popular'
  );
  const [inStockOnly, setInStockOnly] = React.useState(false);
  const [maxPriceBdt, setMaxPriceBdt] = React.useState<number>(budgetLimit);
  const [isFilterOpen, setIsFilterOpen] = React.useState(false);
  const maxBudgetInputId = React.useId();
  const prevBudgetLimitRef = React.useRef(budgetLimit);

  React.useEffect(() => {
    setMaxPriceBdt((current) =>
      current >= prevBudgetLimitRef.current || current > budgetLimit ? budgetLimit : current
    );
    prevBudgetLimitRef.current = budgetLimit;
  }, [budgetLimit]);

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

      if (p.variants.length > 0 && !p.variants.some((v) => v.salePricePoisha <= maxPoisha)) {
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
      const priceA =
        a.variants.length > 0
          ? Math.min(...a.variants.map((v) => v.salePricePoisha))
          : 0;
      const priceB =
        b.variants.length > 0
          ? Math.min(...b.variants.map((v) => v.salePricePoisha))
          : 0;
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
      maxPriceBdt < budgetLimit
  );

  const resetAllFilters = () => {
    setSearchQuery('');
    setActiveCategorySlug(null);
    setActiveCollection('all');
    setInStockOnly(false);
    setMaxPriceBdt(budgetLimit);
    setSortBy('popular');
  };

  const hero = siteSettings.heroBanners[heroIndex] ?? siteSettings.heroBanners[0];
  const browsing = !searchQuery.trim() && !activeCategorySlug;

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
      <div className="max-w-[1600px] mx-auto px-3.5 sm:px-8 lg:px-10 py-4 sm:py-10 pb-8 sm:pb-16 flex flex-col gap-9 sm:gap-18">
        {/* 1. BOTANICAL EDITORIAL HERO (Variation 2) */}
        {browsing && visible('hero') && hero && (
          <section style={position('hero')} className="rounded-xl bg-surface overflow-hidden border border-border shadow-[var(--store-shadow-card)]">
            <div className="grid grid-cols-1 lg:grid-cols-12 items-stretch">
              <div className="lg:col-span-6 p-5 sm:p-12 lg:p-16 flex flex-col justify-center space-y-4 sm:space-y-6">
                {/* Quiet Editorial Kicker with Terracotta Rule Line */}
                <p className="flex items-center gap-2.5 font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-[var(--store-terracotta)]">
                  <span aria-hidden="true" className="h-px w-8 bg-[var(--store-terracotta)] shrink-0" />
                  {locale === 'bn' ? hero.badgeBn : hero.badgeEn}
                </p>

                <h1 className="font-display text-3xl sm:text-5xl lg:text-[3.6rem] font-bold tracking-tight text-ink leading-[1.1] max-w-2xl [text-wrap:balance]">
                  {locale === 'bn' ? hero.titleBn : hero.titleEn}
                </h1>

                <p className="text-sm sm:text-base text-ink/75 max-w-xl leading-relaxed text-left">
                  {locale === 'bn' ? hero.subtitleBn : hero.subtitleEn}
                </p>
                {hero.ctaHref && safeStoreUrl(hero.ctaHref) && (
                  <Link
                    href={hero.ctaHref}
                    className="inline-flex items-center justify-center gap-3 w-full sm:w-fit min-h-[46px] rounded-lg bg-[var(--store-accent)] px-6 py-3.5 sm:px-8 sm:py-4 font-mono text-xs uppercase tracking-[0.14em] text-white hover:bg-[var(--store-accent-hover)] hover:shadow-[var(--store-shadow-card)] active:scale-[0.98] transition-all"
                  >
                    {text(hero.ctaLabelBn, hero.ctaLabelEn) || text('কালেকশন দেখুন', 'Explore Collection')}
                    <ArrowRight className="w-4 h-4 shrink-0" />
                  </Link>
                )}
                {siteSettings.heroBanners.length > 1 && (
                  <div className="flex gap-2 pt-1" aria-label={text('ব্যানার নির্বাচন', 'Choose banner')}>
                    {siteSettings.heroBanners.map((slide, index) => (
                      <button
                        key={slide.id}
                        type="button"
                        onClick={() => setHeroIndex(index)}
                        aria-label={text(slide.titleBn, slide.titleEn) || String(index + 1)}
                        aria-pressed={index === heroIndex}
                        className={`h-11 min-w-11 rounded-lg font-mono border text-xs cursor-pointer transition-all ${
                          index === heroIndex
                            ? 'bg-[var(--store-accent)] text-white border-[var(--store-accent)]'
                            : 'border-border text-ink hover:border-accent hover:text-ink'
                        }`}
                      >
                        {formatLocaleNumber(index + 1, locale)}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="lg:col-span-6 relative aspect-[4/3] sm:aspect-[5/4] lg:aspect-auto lg:min-h-[480px] w-full border-t lg:border-t-0 lg:border-l border-border bg-bg">
                {hero.imageUrl && (
                  <img
                    src={productImageUrl(hero.imageUrl)}
                    onError={productImageFallback}
                    alt={locale === 'bn' ? hero.titleBn : hero.titleEn}
                    referrerPolicy="no-referrer"
                    className="object-cover"
                    loading="eager"
                    fetchPriority="high"
                    decoding="async"
                    style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }}
                  />
                )}
              </div>
            </div>
          </section>
        )}

        {/* 2. MINIMALIST 4-PILLAR TRUST STRIP */}
        {browsing && visible('trust_strip') && siteSettings.trustBadges.length > 0 && (
          <section
            style={position('trust_strip')}
            aria-label={uiText("Trust guarantees", locale)}
            className="border-y border-border py-5 sm:py-6 grid grid-cols-2 lg:grid-cols-4 gap-x-3.5 gap-y-5 sm:gap-6"
          >
            {siteSettings.trustBadges.map((badge, idx) => {
              const icons = [Truck, RotateCcw, ShieldCheck, CheckCircle2];
              const IconComp = icons[idx % icons.length] ?? ShieldCheck;
              return (
                <div key={badge.id} className="flex items-start gap-2.5 sm:gap-3.5 min-w-0">
                  <div className="w-8 h-8 sm:w-10 sm:h-10 shrink-0 rounded-full border border-border bg-accent-soft text-ink flex items-center justify-center">
                    <IconComp className="w-3.5 h-3.5 sm:w-4 sm:h-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-xs sm:text-sm font-semibold text-ink leading-snug">
                      {locale === 'bn' ? badge.labelBn : badge.labelEn}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-ink/80 mt-0.5 leading-snug">
                      {locale === 'bn' ? badge.descBn : badge.descEn}
                    </p>
                  </div>
                </div>
              );
            })}
          </section>
        )}

        {/* 3. PROMO BANNER (If Active) */}
        {browsing && visible('promo_banner') && siteSettings.promoCampaign.enabled && (
          <section style={position('promo_banner')} className="p-5 sm:p-6 rounded-xl border border-border bg-surface shadow-[var(--store-shadow-card)] flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full border border-border bg-bg text-[var(--store-terracotta)] flex items-center justify-center shrink-0">
                <Tag className="w-4 h-4" aria-hidden="true" />
              </div>
              <div>
                <p className="font-mono text-[11px] uppercase tracking-[0.1em] text-[var(--store-terracotta)]">
                  {locale === 'bn'
                    ? siteSettings.promoCampaign.discountLabelBn
                    : siteSettings.promoCampaign.discountLabelEn}
                </p>
                <h2 className="font-display text-lg sm:text-xl font-bold text-ink mt-0.5">
                  {locale === 'bn'
                    ? siteSettings.promoCampaign.titleBn
                    : siteSettings.promoCampaign.titleEn}
                </h2>
              </div>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/80">
                {locale === 'bn' ? 'কুপন কোড:' : 'Code:'}
              </span>
              <span className="px-3.5 py-1.5 rounded-lg text-xs font-mono font-bold border border-accent bg-bg text-ink">
                {siteSettings.promoCampaign.code}
              </span>
            </div>
          </section>
        )}

        {/* 4. UNIFIED INTERACTIVE CATALOG SHOWCASE */}
        {(visible('featured_products') || !browsing) && <section id="unified-catalog" style={position('featured_products')} className="space-y-5 sm:space-y-7 scroll-mt-24">
          {/* Editorial Section Header & Filter Trigger */}
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3.5 sm:gap-4 border-b border-border pb-4">
            <div className="min-w-0">
              {browsing && <p className="font-mono text-[10px] sm:text-[11px] uppercase tracking-[0.14em] text-[var(--store-terracotta)] mb-1.5">{text(section('featured_products')?.titleBn ?? '', section('featured_products')?.titleEn ?? '')}</p>}
              <div className="flex flex-wrap items-baseline gap-2">
                <h2 className="font-display text-2xl sm:text-4xl font-bold text-ink tracking-tight [text-wrap:balance]">
                  {activeCategory
                    ? locale === 'bn'
                      ? activeCategory.nameBn
                      : activeCategory.nameEn
                    : searchQuery.trim()
                    ? locale === 'bn'
                      ? `"${searchQuery}" এর সার্চ ফলাফল`
                      : `Search results for "${searchQuery}"`
                    : locale === 'bn'
                    ? config.collectionTitleBn
                    : config.collectionTitleEn}
                </h2>
                <span aria-hidden="true" className="text-ink/60">·</span>
                <span className="font-mono text-xs text-ink/80 tabular-nums">
                  {formatLocaleNumber(displayedProducts.length, locale)}
                  {locale === 'bn' ? 'টি পণ্য' : ' items'}
                </span>
              </div>
              <p className="text-xs sm:text-sm text-ink/80 mt-1">
                {activeCategory
                  ? locale === 'bn'
                    ? activeCategory.descriptionBn
                    : activeCategory.descriptionEn
                  : locale === 'bn'
                  ? config.collectionSubtitleBn
                  : config.collectionSubtitleEn}
              </p>
            </div>

            {/* Filter Drawer Trigger & Reset Button */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setIsFilterOpen(true)}
                className="inline-flex items-center gap-2 min-h-[44px] px-4 py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.1em] border border-accent bg-transparent text-ink hover:bg-accent hover:text-white transition-colors cursor-pointer"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{locale === 'bn' ? 'ফিল্টার ও বাজেট' : 'Filter & Budget'}</span>
              </button>
              {isFiltering && (
                <button
                  type="button"
                  onClick={resetAllFilters}
                  className="inline-flex items-center min-h-[44px] px-3.5 py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.1em] border border-border bg-surface text-ink hover:border-accent transition-colors cursor-pointer"
                >
                  {locale === 'bn' ? 'রিসেট' : 'Reset'}
                </button>
              )}
            </div>
          </div>

          {/* Interactive Collection Switcher Bar & Sort Selector */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-1">
            {/* Editorial Underline Collection Tabs */}
            <div className="inline-flex items-center gap-4 sm:gap-6 overflow-x-auto scrollbar-none max-w-full">
              <button
                type="button"
                onClick={() => setActiveCollection('all')}
                aria-pressed={activeCollection === 'all'}
                className={`min-h-[44px] px-1 py-2.5 font-mono text-xs uppercase tracking-[0.1em] border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeCollection === 'all'
                    ? 'border-accent text-ink font-bold'
                    : 'border-transparent text-ink/80 hover:text-ink'
                }`}
              >
                {locale === 'bn' ? 'সব পণ্য' : 'All Products'}
              </button>

              {visible('featured_products') && <button
                type="button"
                onClick={() => setActiveCollection('featured')}
                aria-pressed={activeCollection === 'featured'}
                className={`min-h-[44px] px-1 py-2.5 font-mono text-xs uppercase tracking-[0.1em] border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeCollection === 'featured'
                    ? 'border-accent text-ink font-bold'
                    : 'border-transparent text-ink/80 hover:text-ink'
                }`}
              >
                {locale === 'bn' ? 'নির্বাচিত' : 'Featured'}
              </button>}

              {visible('best_sellers') && <button
                type="button"
                onClick={() => setActiveCollection('best_sellers')}
                aria-pressed={activeCollection === 'best_sellers'}
                className={`min-h-[44px] px-1 py-2.5 font-mono text-xs uppercase tracking-[0.1em] border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeCollection === 'best_sellers'
                    ? 'border-accent text-ink font-bold'
                    : 'border-transparent text-ink/80 hover:text-ink'
                }`}
              >
                {locale === 'bn' ? 'বেস্ট সেলার' : 'Best Sellers'}
              </button>}

              {visible('new_arrivals') && <button
                type="button"
                onClick={() => setActiveCollection('new_arrivals')}
                aria-pressed={activeCollection === 'new_arrivals'}
                className={`min-h-[44px] px-1 py-2.5 font-mono text-xs uppercase tracking-[0.1em] border-b-2 transition-all cursor-pointer whitespace-nowrap ${
                  activeCollection === 'new_arrivals'
                    ? 'border-accent text-ink font-bold'
                    : 'border-transparent text-ink/80 hover:text-ink'
                }`}
              >
                {locale === 'bn' ? 'নতুন আগমন' : 'New Arrivals'}
              </button>}
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-2 text-xs pb-1.5">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/80 hidden sm:inline">
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
                className="min-h-[44px] px-2.5 py-2 text-base lg:text-xs font-medium bg-transparent border-0 border-b border-border text-ink focus:outline-none focus:border-accent"
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

          {/* Sub-Category Filter Tabs (Clean Editorial Buttons) */}
          <div className="flex items-center gap-2 overflow-x-auto scrollbar-none pb-1 pt-1">
            <button
              type="button"
              onClick={() => setActiveCategorySlug(null)}
              aria-pressed={!activeCategorySlug}
              className={`min-h-[44px] px-3.5 py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.08em] border transition-all whitespace-nowrap cursor-pointer ${
                !activeCategorySlug
                  ? 'bg-[var(--store-accent)] text-white border-[var(--store-accent)]'
                  : 'bg-bg text-ink border-border hover:border-accent'
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
                  aria-pressed={isSelected}
                  className={`min-h-[44px] px-3.5 py-2 rounded-lg font-mono text-[11px] uppercase tracking-[0.08em] border transition-all whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    isSelected
                      ? 'bg-[var(--store-accent)] text-white border-[var(--store-accent)]'
                      : 'bg-bg text-ink border-border hover:border-accent'
                  }`}
                >
                  <span>{locale === 'bn' ? c.nameBn : c.nameEn}</span>
                  <span className={`text-[10px] tabular-nums ${isSelected ? 'text-white/90' : 'text-ink/80'}`}>
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-6 sm:gap-y-10">
              {displayedProducts.map((product) => (
                <ProductCard key={product.productId} product={product} />
              ))}
            </div>
          )}
        </section>}
        {browsing && visible('categories') && categories.length > 0 && <section style={position('categories')} className="space-y-5 sm:space-y-6"><div className="flex items-end justify-between gap-4 border-b border-border pb-3"><h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">{text(section('categories')?.titleBn ?? '', section('categories')?.titleEn ?? '')}</h2><Link href="/shop" className="min-h-[44px] inline-flex items-center font-mono text-[11px] uppercase tracking-[0.1em] text-ink/85 hover:text-ink underline underline-offset-4 shrink-0">{text('সব দেখুন', 'View all')}</Link></div><div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">{categories.filter(c => !c.parentId).map(category => { const image = products.find(p => p.categoryId === category.id)?.images[0]; return <Link key={category.id} href={`/category/${category.slug}`} className="group space-y-2.5 sm:space-y-3 min-w-0"><div className="relative aspect-square bg-surface rounded-xl overflow-hidden border border-border store-product-media">{image ? <img  src={productImageUrl(image)} onError={productImageFallback} alt="" className="object-cover transition-transform duration-500 group-hover:scale-105" loading="lazy" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} /> : <span className="flex h-full items-center justify-center font-display text-4xl text-[var(--store-accent)]">{Array.from(text(category.nameBn, category.nameEn))[0]}</span>}</div><span className="flex items-center justify-between gap-1 text-xs sm:text-sm font-medium text-ink"><span className="truncate">{text(category.nameBn, category.nameEn)}</span><ArrowRight className="w-3.5 h-3.5 shrink-0 text-ink/75 group-hover:text-ink" /></span></Link>; })}</div></section>}
        {browsing && !visible('featured_products') && (['new_arrivals', 'best_sellers'] as const).filter(visible).map(type => { const list = type === 'best_sellers' ? [...products].filter(p => p.totalSoldCount > 0).sort((a,b) => b.totalSoldCount - a.totalSoldCount) : [...products].reverse(); return list.length > 0 && <section key={type} style={position(type)} className="space-y-5 sm:space-y-6"><div className="flex items-end justify-between gap-4 border-b border-border pb-3"><h2 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-ink">{text(section(type)?.titleBn ?? '', section(type)?.titleEn ?? '')}</h2><Link href="/shop" className="min-h-[44px] inline-flex items-center font-mono text-[11px] uppercase tracking-[0.1em] text-ink/85 hover:text-ink underline underline-offset-4 shrink-0">{text('সব পণ্য', 'Shop all')}</Link></div><div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-3 sm:gap-x-6 gap-y-6 sm:gap-y-8">{list.slice(0,4).map(product => <ProductCard key={product.productId} product={product} />)}</div></section>; })}
      </div>
      {/* FILTER DRAWER / SHEET */}
      <ResponsiveSheet
        open={isFilterOpen}
        onOpenChange={setIsFilterOpen}
        title={locale === 'bn' ? 'পণ্য ফিল্টার ও বাজেট' : 'Filter & Budget'}
      >
        <div className="p-4 space-y-6 text-xs">
          {/* Category Selector */}
          <fieldset className="space-y-2">
            <legend className="font-mono font-semibold uppercase text-[11px] tracking-[0.1em] text-ink/80">
              {locale === 'bn' ? 'ক্যাটাগরি' : 'Category'}
            </legend>
            <div className="space-y-1">
              <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer px-2 py-2 rounded-lg hover:bg-surface">
                <input
                  type="radio"
                  name="catFilter"
                  checked={!activeCategorySlug}
                  onChange={() => setActiveCategorySlug(null)}
                  className="w-4 h-4 accent-[var(--store-accent)]"
                />
                <span className="text-ink font-medium">
                  {locale === 'bn' ? 'সকল ক্যাটাগরি' : 'All Categories'}
                </span>
              </label>
              {categories.map((c) => (
                <label
                  key={c.id}
                  className="flex items-center gap-2.5 min-h-[44px] cursor-pointer px-2 py-2 rounded-lg hover:bg-surface"
                >
                  <input
                    type="radio"
                    name="catFilter"
                    checked={activeCategorySlug === c.slug}
                    onChange={() => setActiveCategorySlug(c.slug)}
                    className="w-4 h-4 accent-[var(--store-accent)]"
                  />
                  <span className="text-ink font-medium">
                    {locale === 'bn' ? c.nameBn : c.nameEn}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Budget Range Slider */}
          <div className="space-y-2 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <label
                htmlFor={maxBudgetInputId}
                className="font-mono font-semibold uppercase text-[11px] tracking-[0.1em] text-ink/80"
              >
                {locale === 'bn' ? 'সর্বোচ্চ বাজেট' : 'Max Budget'}
              </label>
              <span className="font-mono font-bold text-[var(--store-accent)]"><LocalizedText source="৳" area="storefront" />{formatLocaleNumber(maxPriceBdt, locale)}</span>
            </div>
            <input
              id={maxBudgetInputId}
              type="range"
              min={0}
              max={budgetLimit}
              step={1}
              value={maxPriceBdt}
              onChange={(e) => setMaxPriceBdt(Number(e.target.value))}
              className="w-full h-11 accent-[var(--store-accent)] cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-ink/80 font-mono">
              <span>৳{formatLocaleNumber(0, locale)}</span>
              <span>৳{formatLocaleNumber(budgetLimit, locale)}</span>
            </div>
          </div>

          {/* In Stock Only Checkbox */}
          <div className="pt-3 border-t border-border">
            <label className="flex items-center gap-2.5 min-h-[44px] cursor-pointer">
              <input
                type="checkbox"
                checked={inStockOnly}
                onChange={(e) => setInStockOnly(e.target.checked)}
                className="w-4 h-4 accent-[var(--store-accent)]"
              />
              <span className="font-semibold text-ink">
                {locale === 'bn' ? 'শুধুমাত্র স্টকে থাকা পণ্য' : 'In-Stock Only'}
              </span>
            </label>
          </div>

          {/* Apply / Reset Buttons */}
          <div className="pt-4 border-t border-border flex items-center justify-end gap-2">
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
