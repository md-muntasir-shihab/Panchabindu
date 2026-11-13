'use client';
import { getStorefrontConfig } from '@/lib/storefront/storefront-config';
import { BrandMark } from './brand-mark';
import { localizedField } from '@/lib/i18n/ui-text';
import { uiText } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/storefront/storefront-shell.tsx
// Botanical Heritage Calm — Global Storefront Layout Shell:
//   - Deep Forest Green (#1B4332) Top Utility Bar (Delivery, QC Provenance & Helpline)
//   - Sticky Minimalist Header on Warm Alabaster (#FAF9F5) with Brand Monogram, Pill Live Search, Bilingual Switcher, Wishlist, Cart & Admin Link
//   - Clean Horizontal Category Navigation Bar
//   - Mobile Bottom Tab Navigation (Home, Categories, Cart, Account — <= 768px)
//   - Slide-in / Bottom-Sheet Cart Drawer with 4:5 Portrait Thumbnails & Forest-Green Free Delivery Progress Bar
//   - Spacious Editorial Linen Footer (#F2EFE9)

import * as React from 'react';
import { Link } from 'wouter';
import { useLocation } from 'wouter';
import {
  ShoppingBag,
  Heart,
  Search,
  Home,
  Grid,
  User,
  ShieldCheck,
  Trash2,
  Plus,
  Minus,
  RotateCcw,
  PhoneCall,
  Wrench,
  LayoutDashboard,
  Menu,
  Package,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  X,
  TrendingUp,
  ArrowUpRight,
} from 'lucide-react';
import type {
  CategoryRecord,
  PublicSafeSiteSettingsDTO,
} from '@/lib/db/repository';
import type { StorefrontProductDTO } from '@/types/domain';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { useLocaleStore } from '@/store/use-locale-store';
import {
  calculateCartFreeDeliveryProgress,
  useCartStore,
} from '@/store/use-cart-store';
import { useWishlistStore } from '@/store/use-wishlist-store';
import { Button, EmptyState } from '../ui/primitives';
import { ResponsiveSheet } from '../ui/responsive-sheet';

export interface StorefrontShellProps {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
  products?: StorefrontProductDTO[];
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  activeCategorySlug?: string | null;
  onSelectCategory?: (slug: string | null) => void;
  children: React.ReactNode;
}

export function StorefrontShell({
  siteSettings,
  categories,
  products = [],
  searchQuery: controlledQuery = '',
  onSearchChange: controlledSearchChange,
  activeCategorySlug,
  onSelectCategory,
  children,
}: StorefrontShellProps) {
  const [pathname, navigate] = useLocation();
  const floatingContactPosition = pathname === '/checkout'
    ? 'bottom-[calc(10.5rem+env(safe-area-inset-bottom))] md:bottom-24 lg:bottom-6'
    : pathname.startsWith('/product/')
      ? 'bottom-[calc(10.5rem+env(safe-area-inset-bottom))] md:bottom-6'
      : 'bottom-[calc(5.5rem+env(safe-area-inset-bottom))] md:bottom-6';
  const [localQuery, setLocalQuery] = React.useState('');
  const searchQuery = controlledSearchChange ? controlledQuery : localQuery;
  const onSearchChange = controlledSearchChange ?? setLocalQuery;
  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && searchQuery.trim()) {
      event.preventDefault();
      setIsSearchFocused(false);
      navigate(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  };
  const locale = useLocaleStore((s) => s.locale);
  const toggleLocale = useLocaleStore((s) => s.toggleLocale);
  React.useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  const dict = useLocaleStore((s) => s.t());
  const config = getStorefrontConfig(siteSettings);
  const text = (bn: string, en: string) => locale === 'bn' ? bn : en;
  React.useEffect(() => {
    document.documentElement.style.setProperty('--store-accent', config.accentColor);
    if (window.location.pathname === '/') {
      document.title = (locale === 'bn' ? config.seoTitleBn : config.seoTitleEn) || `${siteSettings.brandNameBn} — ${siteSettings.brandNameEn}`;
      document.querySelector('meta[name="description"]')?.setAttribute('content', locale === 'bn' ? config.seoDescriptionBn : config.seoDescriptionEn);
    }
  }, [config.accentColor, config.seoTitleBn, config.seoTitleEn, config.seoDescriptionBn, config.seoDescriptionEn, locale, siteSettings.brandNameBn, siteSettings.brandNameEn]);

  const cartItems = useCartStore((s) => s.items);
  const isCartOpen = useCartStore((s) => s.isDrawerOpen);
  const setCartOpen = useCartStore((s) => s.setDrawerOpen);
  const updateQuantity = useCartStore((s) => s.updateQuantity);
  const removeItem = useCartStore((s) => s.removeItem);
  const lastRemovedItem = useCartStore((s) => s.lastRemovedItem);
  const undoRemoveLastItem = useCartStore((s) => s.undoRemoveLastItem);

  const wishlistCount = useWishlistStore((s) => s.productIds.length);
  const [isMenuOpen, setIsMenuOpen] = React.useState(false);
  const [isCategoryAccordionOpen, setIsCategoryAccordionOpen] = React.useState(true);

  // Live Instant Search State
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);
  const mobileSearchContainerRef = React.useRef<HTMLDivElement>(null);
  const desktopSearchInputRef = React.useRef<HTMLInputElement>(null);

  // Category Tab Horizontal Scroll State
  const categoryScrollRef = React.useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = React.useState(false);
  const [canScrollRight, setCanScrollRight] = React.useState(false);

  const totalCartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const freeDeliveryProgress = calculateCartFreeDeliveryProgress(
    cartItems,
    siteSettings.freeDeliveryThresholdPoisha,
    siteSettings.globalFreeDelivery
  );

  const brandName =
    locale === 'bn' ? siteSettings.brandNameBn : siteSettings.brandNameEn;

  // Click Outside to Dismiss Search & Category Dropdown
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const insideDesktop = searchContainerRef.current?.contains(target);
      const insideMobile = mobileSearchContainerRef.current?.contains(target);
      if (!insideDesktop && !insideMobile) {
        setIsSearchFocused(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: '/' or 'Ctrl+K' focuses search, 'Escape' blurs
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.key === '/' || (event.ctrlKey && event.key.toLowerCase() === 'k')) &&
        !['INPUT', 'TEXTAREA'].includes((event.target as HTMLElement)?.tagName)
      ) {
        event.preventDefault();
        desktopSearchInputRef.current?.focus();
        setIsSearchFocused(true);
      } else if (event.key === 'Escape') {
        setIsSearchFocused(false);
        desktopSearchInputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Check Category Scroll Boundary for Chevrons
  const checkCategoryScroll = React.useCallback(() => {
    const el = categoryScrollRef.current;
    if (el) {
      setCanScrollLeft(el.scrollLeft > 6);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 6);
    }
  }, []);

  React.useEffect(() => {
    checkCategoryScroll();
    const el = categoryScrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkCategoryScroll, { passive: true });
      window.addEventListener('resize', checkCategoryScroll, { passive: true });
      return () => {
        el.removeEventListener('scroll', checkCategoryScroll);
        window.removeEventListener('resize', checkCategoryScroll);
      };
    }
    return undefined;
  }, [checkCategoryScroll, categories]);

  const scrollCategories = (direction: 'left' | 'right') => {
    if (categoryScrollRef.current) {
      const distance = direction === 'left' ? -240 : 240;
      categoryScrollRef.current.scrollBy({ left: distance, behavior: 'smooth' });
    }
  };

  // Live Instant Search Matching
  const matchingProducts = React.useMemo(() => {
    if (!products || !searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return products
      .filter(
        (p) =>
          p.nameBn.toLowerCase().includes(q) ||
          p.nameEn.toLowerCase().includes(q) ||
          p.slug.toLowerCase().includes(q) ||
          p.variants.some((v) => v.publicSku.toLowerCase().includes(q))
      )
      .slice(0, 5);
  }, [products, searchQuery]);

  const matchingCategories = React.useMemo(() => {
    if (!searchQuery.trim()) return [];
    const q = searchQuery.trim().toLowerCase();
    return categories
      .filter(
        (c) =>
          c.nameBn.toLowerCase().includes(q) ||
          c.nameEn.toLowerCase().includes(q) ||
          c.slug.toLowerCase().includes(q)
      )
      .slice(0, 3);
  }, [categories, searchQuery]);

  const trendingQueries = [
    { labelBn: 'জামদানি শাড়ি', labelEn: 'Jamdani Saree' },
    { labelBn: 'লেদার ওয়ালেট', labelEn: 'Leather Wallet' },
    { labelBn: 'সুন্দরবনের মধু', labelEn: 'Sundarban Honey' },
    { labelBn: 'পিতলের প্রদীপ', labelEn: 'Brass Crafts' },
    { labelBn: 'নকশিকাঁথা', labelEn: 'Nakshi Kantha' },
  ];

  // Maintenance Mode Gate (Admin Toggle)
  if (siteSettings.maintenanceMode) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 storefront-theme bg-[#FAF9F5] text-[#162119]">
        <div className="max-w-md w-full border border-[#E4E2DC] rounded-2xl p-8 text-center space-y-4 bg-[#F2EFE9]">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-xl border border-[#E4E2DC] bg-[#FAF9F5]">
            <Wrench className="w-6 h-6 text-[var(--store-accent)]" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-bold text-[#162119]">{brandName}</h1>
          <p className="text-sm text-[#5A655D]">
            {text(siteSettings.maintenanceMessageBn, siteSettings.maintenanceMessageEn ?? 'We will be back shortly.')}
          </p>
          <div className="pt-2">
            <Link href="/admin">
              <Button variant="outline" size="sm">
                {dict.common.adminPanel}
              </Button>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ '--store-accent': config.accentColor } as React.CSSProperties} className="min-h-[100dvh] flex flex-col min-w-0 storefront-theme bg-[#FAF9F5] text-[#162119] pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      {siteSettings.delayBanner.enabled && <div className="bg-[var(--store-accent)] text-white px-4 py-2.5 text-xs"><div className="max-w-7xl mx-auto flex justify-center sm:justify-between items-center gap-5"><p className="leading-relaxed text-center sm:text-left">{text(siteSettings.delayBanner.messageBn, siteSettings.delayBanner.messageEn)}</p>{config.showSupportPhone && siteSettings.supportPhone && <a href={`tel:${siteSettings.supportPhone}`} className="hidden sm:inline-flex gap-2 shrink-0 items-center"><PhoneCall className="w-3.5 h-3.5" />{siteSettings.supportPhone}</a>}</div></div>}

      {/* 2. Sticky Minimalist Header */}
      <header className="sticky top-0 z-40 border-b border-[#E4E2DC] bg-[#FAF9F5]/95 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-4 py-3 sm:py-3.5 space-y-2.5 lg:space-y-0">
          <div className="flex items-center justify-between gap-3 sm:gap-6">
            {/* Mobile Hamburger & Brand Identity */}
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                aria-label={locale === 'bn' ? 'মেনু খুলুন' : 'Open menu'}
                className="xl:hidden p-2 -ml-1 text-[#162119] hover:bg-[#F2EFE9] border border-[#E4E2DC] rounded-lg cursor-pointer touch-target flex items-center justify-center transition-colors"
              >
                <Menu className="w-5 h-5" aria-hidden="true" />
              </button>

              <Link
                href="/"
                onClick={() => onSelectCategory?.(null)}
                className="flex items-center gap-3 min-w-0 group select-none"
                aria-label={`${brandName} — ${dict.common.home}`}
              >
                <BrandMark settings={siteSettings} />
              </Link>

              {/* Desktop Top-Level Navigation Links */}
              <nav aria-label={uiText("Main Navigation", locale)} className="hidden xl:flex items-center gap-1 ml-4 text-xs font-medium">
                {config.navigation.filter(link => link.enabled).map(link => <Link key={link.id} href={link.href} className="px-3 py-2 rounded-full hover:bg-[#F2EFE9] transition-colors">{text(link.labelBn, link.labelEn)}</Link>)}
              </nav>
            </div>

            {/* Desktop Center Live Instant Search Input */}
            <div
              ref={searchContainerRef}
              className="hidden lg:flex flex-1 min-w-0 max-w-lg mx-2 relative"
            >
              <div className="relative w-full">
                <Search
                  className="w-4 h-4 text-[#5A655D] absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={desktopSearchInputRef}
                  type="search"
                  onKeyDown={handleSearchKeyDown}
                  value={searchQuery}
                  onFocus={() => setIsSearchFocused(true)}
                  onChange={(e) => {
                    onSearchChange?.(e.target.value);
                    setIsSearchFocused(true);
                  }}
                  placeholder={
                    locale === 'bn'
                      ? 'জামদানি, মধু, হস্তশিল্প বা এসকেইউ খুঁজুন...'
                      : 'Search Jamdani, honey, crafts or SKU...'
                  }
                  aria-label={dict.common.searchPlaceholder}
                  className="w-full min-h-[42px] pl-11 pr-14 py-2 text-sm bg-[#F2EFE9] text-[#162119] border border-[#E4E2DC] rounded-full placeholder:text-[#5A655D] focus:bg-white focus:border-[var(--store-accent)] focus:outline-none transition-all"
                />
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5">
                  {searchQuery ? (
                    <button
                      type="button"
                      onClick={() => {
                        onSearchChange?.('');
                        desktopSearchInputRef.current?.focus();
                      }}
                      aria-label={uiText("Clear search", locale)}
                      className="p-1 text-[#5A655D] hover:text-[#162119] cursor-pointer transition-colors"
                    >
                      <X className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  ) : (
                    <kbd className="hidden md:inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border border-[#E4E2DC] bg-[#FAF9F5] text-[#5A655D] select-none">
                      /
                    </kbd>
                  )}
                </div>
              </div>

              {/* Live Instant Search Dropdown (Desktop) */}
              {isSearchFocused && (
                <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#FAF9F5] border border-[#E4E2DC] rounded-2xl shadow-lg overflow-hidden animate-in fade-in-0 zoom-in-95 duration-100 max-h-[420px] overflow-y-auto">
                  {searchQuery.trim().length > 0 ? (
                    <div className="p-4 space-y-3">
                      {matchingCategories.length > 0 && (
                        <div className="space-y-1.5">
                          <p className="text-[11px] font-semibold text-[#5A655D]">
                            {locale === 'bn' ? 'সংশ্লিষ্ট ক্যাটাগরি' : 'Matching Categories'}
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {matchingCategories.map((c) => (
                              <button
                                key={c.id}
                                type="button"
                                onClick={() => {
                                  onSelectCategory?.(c.slug);
                                  setIsSearchFocused(false);
                                }}
                                className="px-3 py-1 text-xs font-medium rounded-full border border-[#E4E2DC] bg-[#F2EFE9] hover:border-[var(--store-accent)] text-[#162119] transition-colors cursor-pointer"
                              >
                                {locale === 'bn' ? c.nameBn : c.nameEn}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-1">
                        <div className="flex items-center justify-between pb-1">
                          <p className="text-[11px] font-semibold text-[#5A655D]">
                            {locale === 'bn' ? 'পণ্যসমূহ' : 'Matching Products'}
                          </p>
                          {matchingProducts.length > 0 && (
                            <span className="text-[11px] text-[#5A655D]">
                              {formatLocaleNumber(matchingProducts.length, locale)}টি আইটেম
                            </span>
                          )}
                        </div>

                        {matchingProducts.length > 0 ? (
                          <div className="divide-y divide-[#E4E2DC]">
                            {matchingProducts.map((p) => {
                              const variant = p.variants[0];
                              return (
                                <Link
                                  key={p.productId}
                                  href={`/product/${p.slug}`}
                                  onClick={() => setIsSearchFocused(false)}
                                  className="flex items-center gap-3 p-2 hover:bg-[#F2EFE9] rounded-xl transition-colors group"
                                >
                                  {p.images[0] ? (
                                    <div className="w-10 h-12 rounded-lg border border-[#E4E2DC] overflow-hidden shrink-0 bg-[#F2EFE9] relative">
                                      <img
                                        src={p.images[0]}
                                        alt={locale === 'bn' ? p.nameBn : p.nameEn}
                                        className="object-cover"
                                        referrerPolicy="no-referrer" loading="lazy" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} />
                                    </div>
                                  ) : (
                                    <div className="w-10 h-12 rounded-lg border border-[#E4E2DC] bg-[#F2EFE9] flex items-center justify-center shrink-0">
                                      <Package className="w-4 h-4 text-[#5A655D]" />
                                    </div>
                                  )}
                                  <div className="flex-1 min-w-0">
                                    <p className="text-xs font-semibold text-[#162119] truncate group-hover:text-[var(--store-accent)]">
                                      {locale === 'bn' ? p.nameBn : p.nameEn}
                                    </p>
                                    <p className="text-[11px] text-[#5A655D] truncate">
                                      <LocalizedText source={"SKU:"} area="storefront" />{" "}{variant?.publicSku || 'BG-SKU'}
                                    </p>
                                  </div>
                                  <div className="text-right shrink-0">
                                    <p className="text-xs font-bold text-[#162119] tabular-nums">
                                      {variant
                                        ? formatPoishaToBdt(variant.salePricePoisha, locale)
                                        : '৳ 0'}
                                    </p>
                                  </div>
                                </Link>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="py-6 text-center space-y-1">
                            <p className="text-xs font-semibold text-[#162119]">
                              {locale === 'bn'
                                ? `"${searchQuery}" নামে কোনো পণ্য পাওয়া যায়নি`
                                : `No products found for "${searchQuery}"`}
                            </p>
                            <p className="text-[11px] text-[#5A655D]">
                              বানান পরীক্ষা করুন অথবা নিচের ক্যাটাগরিগুলো থেকে বেছে নিন
                            </p>
                          </div>
                        )}

                        <div className="pt-2 border-t border-[#E4E2DC] flex items-center justify-between">
                          <Link
                            href={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
                            onClick={() => setIsSearchFocused(false)}
                            className="text-xs font-semibold text-[var(--store-accent)] hover:underline flex items-center gap-1"
                          >
                            <span>
                              {locale === 'bn'
                                ? 'সম্পূর্ণ অনুসন্ধান পেজে দেখুন'
                                : 'Open full search results page'}
                            </span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </Link>
                          <Link
                            href="/shop"
                            onClick={() => setIsSearchFocused(false)}
                            className="text-xs text-[#5A655D] hover:text-[#162119]"
                          >
                            {locale === 'bn' ? 'সকল পণ্য' : 'All Products'}
                          </Link>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-[#E4E2DC] flex items-center justify-between text-xs">
                        <button
                          type="button"
                          onClick={() => setIsSearchFocused(false)}
                          className="font-semibold text-[var(--store-accent)] hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>সব ফলাফল ব্রাউজ করুন</span>
                          <ArrowUpRight className="w-3.5 h-3.5" />
                        </button>
                        <span className="text-[10px] text-[#5A655D]">Esc চাপুন বন্ধ করতে</span>
                      </div>
                    </div>
                  ) : (
                    <div className="p-4 space-y-4">
                      <div className="space-y-2">
                        <p className="text-xs font-semibold text-[#5A655D] flex items-center gap-1.5">
                          <TrendingUp className="w-3.5 h-3.5 text-[var(--store-accent)]" />
                          <span>{locale === 'bn' ? 'জনপ্রিয় অনুসন্ধান' : 'Popular Searches'}</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {trendingQueries.map((item, idx) => (
                            <button
                              key={idx}
                              type="button"
                              onClick={() => {
                                const term = locale === 'bn' ? item.labelBn : item.labelEn;
                                onSearchChange?.(term);
                                setIsSearchFocused(true);
                              }}
                              className="px-3 py-1 text-xs font-medium rounded-full border border-[#E4E2DC] bg-[#F2EFE9] hover:border-[var(--store-accent)] hover:bg-white text-[#162119] transition-colors cursor-pointer"
                            >
                              {locale === 'bn' ? item.labelBn : item.labelEn}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t border-[#E4E2DC]">
                        <p className="text-xs font-semibold text-[#5A655D]">
                          {locale === 'bn' ? 'ক্যাটাগরি অনুযায়ী দেখুন' : 'Explore Categories'}
                        </p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {categories.map((c) => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => {
                                onSelectCategory?.(c.slug);
                                setIsSearchFocused(false);
                              }}
                              className="flex items-center justify-between p-2.5 text-xs font-medium rounded-xl border border-[#E4E2DC] bg-[#F2EFE9] hover:border-[var(--store-accent)] text-left text-[#162119] transition-colors cursor-pointer"
                            >
                              <span className="truncate">
                                {locale === 'bn' ? c.nameBn : c.nameEn}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5 text-[#5A655D] shrink-0" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Right Action Cluster */}
            <div className="flex shrink-0 items-center gap-1 sm:gap-2">
              {/* Segmented Language Switcher */}
              <button
                type="button"
                onClick={toggleLocale}
                aria-label={uiText("Toggle language", locale)}
                className="flex items-center text-xs font-semibold border border-[#E4E2DC] rounded-full p-0.5 bg-[#F2EFE9] h-10 sm:h-9 shrink-0 transition-colors cursor-pointer"
              >
                <span
                  className={`px-2.5 py-1 rounded-full transition-colors ${
                    locale === 'bn'
                      ? 'bg-[var(--store-accent)] text-[#FAF9F5] font-semibold'
                      : 'text-[#5A655D] hover:text-[#162119]'
                  }`}
                >
                  <LocalizedText source={"বাং"} area="storefront" />{" "}</span>
                <span
                  className={`px-2.5 py-1 rounded-full transition-colors ${
                    locale === 'en'
                      ? 'bg-[var(--store-accent)] text-[#FAF9F5] font-semibold'
                      : 'text-[#5A655D] hover:text-[#162119]'
                  }`}
                >
                  <LocalizedText source={"EN"} area="storefront" />{" "}</span>
              </button>

              {/* Admin Dashboard Portal Link */}
              <Link
                href="/admin"
                className="hidden 2xl:inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-medium border border-[#E4E2DC] rounded-full bg-[#F2EFE9] text-[#162119] hover:border-[var(--store-accent)] hover:bg-white transition-colors"
                title={dict.common.adminPanel}
              >
                <LayoutDashboard className="w-3.5 h-3.5 text-[var(--store-accent)]" aria-hidden="true" />
                <span>{dict.common.adminPanel}</span>
              </Link>

              {/* User Profile / Account Shortcut Button */}
              <Link
                href="/account"
                className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3.5 text-xs font-semibold border border-[#E4E2DC] rounded-full bg-[#F2EFE9] text-[#162119] hover:border-[var(--store-accent)] hover:bg-white transition-colors"
                title={dict.common.account}
              >
                <User className="w-3.5 h-3.5 text-[var(--store-accent)]" aria-hidden="true" />
                <span>{locale === 'bn' ? 'অ্যাকাউন্ট / লগইন' : 'Account / Sign in'}</span>
              </Link>

              {/* Wishlist Shortcut Button */}
              <Link
                href="/account?tab=wishlist"
                aria-label={dict.common.wishlist}
                className="relative w-9 h-9 hidden sm:inline-flex items-center justify-center rounded-full border border-[#E4E2DC] bg-[#F2EFE9] text-[#162119] hover:border-[var(--store-accent)] hover:bg-white transition-colors"
                title={dict.common.wishlist}
              >
                <Heart className="w-4 h-4 text-[var(--store-accent)]" aria-hidden="true" />
                {wishlistCount > 0 && (
                  <span className="absolute -top-1 -right-1 px-1.5 py-0.2 text-[10px] font-bold bg-[var(--store-accent)] text-[#FAF9F5] rounded-full tabular-nums">
                    {formatLocaleNumber(wishlistCount, locale)}
                  </span>
                )}
              </Link>

              {/* Cart Drawer Trigger Button */}
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                aria-label={dict.common.cart}
                className="inline-flex items-center gap-2 h-10 sm:h-9 px-3 sm:px-3.5 rounded-full bg-[var(--store-accent)] text-[#FAF9F5] hover:opacity-90 font-semibold text-xs tabular-nums cursor-pointer active:scale-95 transition-all"
              >
                <ShoppingBag className="w-4 h-4" aria-hidden="true" />
                <span className="hidden sm:inline">{dict.common.cart}</span>
                <span className="px-1.5 py-0.5 text-[11px] rounded-full bg-[#FAF9F5] text-[var(--store-accent)] font-bold">
                  {formatLocaleNumber(totalCartCount, locale)}
                </span>
              </button>
            </div>
          </div>

          {/* Mobile Search Bar (< 640px) */}
          <div
            ref={mobileSearchContainerRef}
            className="lg:hidden pt-0.5 relative"
          >
            <div className="relative w-full">
              <Search
                className="w-4 h-4 text-[#5A655D] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                onKeyDown={handleSearchKeyDown}
                value={searchQuery}
                onFocus={() => setIsSearchFocused(true)}
                onChange={(e) => {
                  onSearchChange?.(e.target.value);
                  setIsSearchFocused(true);
                }}
                placeholder={
                  locale === 'bn'
                    ? 'পণ্য বা ক্যাটাগরি খুঁজুন...'
                    : 'Search products or categories...'
                }
                aria-label={dict.common.searchPlaceholder}
                className="w-full min-h-[42px] pl-10 pr-10 py-2 text-xs bg-[#F2EFE9] text-[#162119] border border-[#E4E2DC] rounded-full placeholder:text-[#5A655D] focus:bg-white focus:border-[var(--store-accent)] focus:outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => onSearchChange?.('')}
                  aria-label={uiText("Clear search", locale)}
                  className="absolute right-1 top-1/2 -translate-y-1/2 w-10 h-10 flex items-center justify-center text-[#5A655D] hover:text-[#162119] cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            {isSearchFocused && (
              <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-[#FAF9F5] border border-[#E4E2DC] rounded-2xl shadow-lg overflow-hidden max-h-[min(360px,60dvh)] overflow-y-auto p-3.5 space-y-3">
                {searchQuery.trim().length > 0 ? (
                  matchingProducts.length > 0 ? (
                    <div className="divide-y divide-[#E4E2DC]">
                      {matchingProducts.map((p) => {
                        const variant = p.variants[0];
                        return (
                          <Link
                            key={p.productId}
                            href={`/product/${p.slug}`}
                            onClick={() => setIsSearchFocused(false)}
                            className="flex items-center gap-2.5 py-2 hover:bg-[#F2EFE9] transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-[#162119] truncate">
                                {locale === 'bn' ? p.nameBn : p.nameEn}
                              </p>
                              <p className="text-[10px] text-[#5A655D]">
                                {variant
                                  ? formatPoishaToBdt(variant.salePricePoisha, locale)
                                  : ''}
                              </p>
                            </div>
                            <ChevronRight className="w-3.5 h-3.5 text-[#5A655D] shrink-0" />
                          </Link>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-center py-4 text-[#5A655D]">
                      কোনো পণ্য খুঁজে পাওয়া যায়নি
                    </p>
                  )
                ) : (
                  <div className="space-y-2">
                    <p className="text-[11px] font-semibold text-[#5A655D]">
                      জনপ্রিয় অনুসন্ধান
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {trendingQueries.map((item, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => {
                            onSearchChange?.(
                              locale === 'bn' ? item.labelBn : item.labelEn
                            );
                            setIsSearchFocused(false);
                          }}
                          className="px-3 py-1 text-xs rounded-full border border-[#E4E2DC] bg-[#F2EFE9] text-[#162119]"
                        >
                          {locale === 'bn' ? item.labelBn : item.labelEn}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

      </header>

      {/* 3. Main Content */}
      <main className="flex-1 min-w-0">{children}</main>

      <footer className="border-t border-[#E4E2DC] bg-[#F2EFE9] mt-16 sm:mt-24">
        <div className="max-w-7xl mx-auto px-5 py-12 sm:py-16 grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-5 space-y-5"><Link href="/" aria-label={brandName}><BrandMark settings={siteSettings} compact /></Link><p className="text-sm text-[#5A655D] leading-7 max-w-sm whitespace-pre-line">{text(config.footerTextBn, config.footerTextEn)}</p><div className="flex flex-col gap-2 text-sm">{siteSettings.supportPhone && <a href={`tel:${siteSettings.supportPhone}`}>{siteSettings.supportPhone}</a>}{siteSettings.supportEmail && <a href={`mailto:${siteSettings.supportEmail}`}>{siteSettings.supportEmail}</a>}<p className="text-xs text-[#5A655D]">{text(siteSettings.aboutContactPage?.helplineHoursBn ?? '', siteSettings.aboutContactPage?.helplineHoursEn ?? '')}</p></div><div className="flex flex-wrap gap-3 text-xs">{config.socialLinks.filter(link => link.enabled).map(link => <a key={link.id} href={link.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4">{text(link.labelBn, link.labelEn)}</a>)}</div></div>
          <div className="md:col-span-3"><h2 className="text-xs font-semibold uppercase tracking-widest mb-5">{text('সাথে থাকুন', 'Explore')}</h2><ul className="space-y-3 text-sm text-[#5A655D]">{config.footerLinks.filter(link => link.enabled).map(link => <li key={link.id}><Link className="hover:underline underline-offset-4" href={link.href}>{text(link.labelBn, link.labelEn)}</Link></li>)}</ul></div>
          <div className="md:col-span-4"><h2 className="text-xs font-semibold uppercase tracking-widest mb-5">{text('নীতিমালা', 'Useful information')}</h2><ul className="space-y-3 text-sm text-[#5A655D]">{Object.entries(siteSettings.legalPages).map(([slug, page]) => <li key={slug}><Link href={`/legal/${slug}`} className="hover:underline underline-offset-4">{text(page.titleBn, page.titleEn)}</Link></li>)}</ul></div>
        </div>
        <div className="border-t border-[#E4E2DC] px-5 py-5"><div className="max-w-7xl mx-auto flex flex-wrap justify-between gap-3 text-xs text-[#5A655D]"><span>{text(config.copyrightBn, config.copyrightEn).replaceAll('{year}', String(new Date().getFullYear())).replaceAll('{brand}', brandName)}</span><span>{text(config.footerNoteBn, config.footerNoteEn)}</span></div></div>
      </footer>
      {config.showWhatsApp && siteSettings.whatsappNumber && <a href={`https://wa.me/${siteSettings.whatsappNumber}`} target="_blank" rel="noopener noreferrer" aria-label={text('হোয়াটসঅ্যাপে যোগাযোগ', 'Contact on WhatsApp')} className={`fixed ${floatingContactPosition} right-4 sm:right-5 z-30 min-h-[44px] inline-flex items-center rounded-full bg-[var(--store-accent)] text-white shadow-lg px-4 py-3 text-xs font-semibold`}>WhatsApp ↗</a>}

      {/* 5. Mobile Bottom Tab Bar (<= 768px) */}
      <nav
        aria-label={uiText("Mobile bottom navigation", locale)}
        className="md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-[#E4E2DC] bg-[#FAF9F5]/95 backdrop-blur safe-bottom"
      >
        <div className="grid grid-cols-4 h-14">
          <Link
            href="/"
            onClick={() => onSelectCategory?.(null)}
            className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#162119] hover:text-[var(--store-accent)] active:scale-95 transition-transform"
          >
            <Home className="w-4 h-4" aria-hidden="true" />
            <span>{dict.common.home}</span>
          </Link>

          <Link
            href="/categories"
            className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[#5A655D] hover:text-[#162119] active:scale-95 transition-transform"
          >
            <Grid className="w-4 h-4" aria-hidden="true" />
            <span>{dict.common.categories}</span>
          </Link>

          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="relative flex flex-col items-center justify-center gap-0.5 text-[11px] font-semibold text-[#162119] cursor-pointer active:scale-95 transition-transform"
          >
            <div className="relative">
              <ShoppingBag className="w-4 h-4" aria-hidden="true" />
              {totalCartCount > 0 && (
                <span className="absolute -top-1.5 -right-2 px-1 text-[10px] font-bold bg-[var(--store-accent)] text-[#FAF9F5] rounded-full tabular-nums">
                  {formatLocaleNumber(totalCartCount, locale)}
                </span>
              )}
            </div>
            <span>{dict.common.cart}</span>
          </button>

          <Link
            href="/account"
            className="flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium text-[#5A655D] hover:text-[#162119] active:scale-95 transition-transform"
          >
            <User className="w-4 h-4" aria-hidden="true" />
            <span>{dict.common.account}</span>
          </Link>
        </div>
      </nav>

      {/* 6. Cart Drawer / Mobile Bottom Sheet */}
      <ResponsiveSheet
        open={isCartOpen}
        onOpenChange={setCartOpen}
        title={`${dict.cart.title} (${formatLocaleNumber(totalCartCount, locale)})`}
        footer={
          cartItems.length > 0 ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-[#5A655D]">{dict.common.subtotal}</span>
                <span className="text-base font-bold text-[#162119] tabular-nums">
                  {formatPoishaToBdt(freeDeliveryProgress.subtotalPoisha, locale)}
                </span>
              </div>
              <Link
                href="/checkout"
                onClick={() => setCartOpen(false)}
                className="flex w-full min-h-[46px] items-center justify-center px-5 py-3 rounded-xl bg-[var(--store-accent)] text-[#FAF9F5] hover:opacity-90 text-sm font-semibold transition-colors cursor-pointer"
              >
                {dict.cart.proceedToCheckout}
              </Link>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {/* Free Delivery Threshold Progress Booster */}
          <div className="p-3.5 border border-[#E4E2DC] rounded-xl bg-[#F2EFE9] space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              {freeDeliveryProgress.isQualifiedForFreeDelivery ? (
                <span className="text-[#15803D] font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  {dict.cart.unlockedFreeDelivery}
                </span>
              ) : (
                <span className="text-[#162119]">
                  {dict.cart.addMoreForFreeDelivery(
                    formatPoishaToBdt(
                      freeDeliveryProgress.remainingForFreeDeliveryPoisha,
                      locale
                    )
                  )}
                </span>
              )}
              <span className="tabular-nums text-[#5A655D]">
                {formatLocaleNumber(freeDeliveryProgress.progressPercent, locale)}%
              </span>
            </div>
            <div className="w-full h-2 bg-[#FAF9F5] border border-[#E4E2DC] rounded-full overflow-hidden">
              <div
                className="h-full bg-[var(--store-accent)] transition-all duration-200"
                style={{ width: `${freeDeliveryProgress.progressPercent}%` }}
              />
            </div>
          </div>

          {/* Undo Remove Banner */}
          {lastRemovedItem && (
            <div className="flex items-center justify-between gap-2 p-3 border border-[#E4E2DC] rounded-xl bg-[#F2EFE9] text-xs">
              <span className="text-[#162119] truncate">
                {dict.cart.itemRemovedToast}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={undoRemoveLastItem}
                leftIcon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
              >
                {dict.common.undo}
              </Button>
            </div>
          )}

          {cartItems.length === 0 ? (
            <EmptyState
              icon={<ShoppingBag className="w-6 h-6" aria-hidden="true" />}
              title={dict.cart.emptyTitle}
              description={dict.cart.emptySubtitle}
              actionLabel={dict.common.continueShopping}
              onAction={() => setCartOpen(false)}
            />
          ) : (
            <ul className="divide-y divide-[#E4E2DC] border border-[#E4E2DC] rounded-xl overflow-hidden">
              {cartItems.map((item) => {
                const itemName = locale === 'bn' ? item.nameBn : item.nameEn;
                const variantTitle =
                  locale === 'bn' ? item.variantTitleBn : item.variantTitleEn;
                return (
                  <li key={item.variantId} className="p-3 sm:p-3.5 flex gap-3 sm:gap-3.5 bg-[#FAF9F5] min-w-0">
                    {/* 4:5 Portrait Thumbnail */}
                    <div className="relative w-16 h-20 shrink-0 border border-[#E4E2DC] rounded-lg overflow-hidden bg-[#F2EFE9]">
                      {item.imageUrl && (
                        <img
                          src={item.imageUrl}
                          alt={itemName}
                          referrerPolicy="no-referrer"
                          className="object-cover" loading="lazy" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[#162119] truncate">
                        {itemName}
                      </p>
                      <p className="text-xs text-[#5A655D]">{variantTitle}</p>
                      <p className="text-sm font-bold text-[#162119] mt-1 tabular-nums">
                        {formatPoishaToBdt(
                          item.unitSalePricePoisha * item.quantity,
                          locale
                        )}
                      </p>

                      <div className="mt-2.5 flex items-center justify-between">
                        <div className="inline-flex items-center border border-[#E4E2DC] rounded-lg bg-[#F2EFE9]">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.variantId, item.quantity - 1)
                            }
                            aria-label={uiText("Decrease quantity", locale)}
                            className="w-10 h-10 flex items-center justify-center text-[#162119] hover:bg-white rounded-l-lg cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <span className="px-3 text-xs font-semibold tabular-nums">
                            {formatLocaleNumber(item.quantity, locale)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.variantId, item.quantity + 1)
                            }
                            aria-label={uiText("Increase quantity", locale)}
                            className="w-10 h-10 flex items-center justify-center text-[#162119] hover:bg-white rounded-r-lg cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.variantId)}
                          aria-label={locale === 'bn' ? `${itemName} সরান` : `Remove ${itemName}`}
                          className="w-10 h-10 flex items-center justify-center text-[#5A655D] hover:text-[#B91C1C] cursor-pointer"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </ResponsiveSheet>

      {/* 7. Mobile Hamburger Menu Drawer */}
      <ResponsiveSheet
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        title={locale === 'bn' ? 'মেনু ও নেভিগেশন' : 'Menu & Navigation'}
      >
        <div className="space-y-5">
          {/* Top Live Order Tracking CTA */}
          <Link
            href="/order-tracking/ORD-261106-0001"
            onClick={() => setIsMenuOpen(false)}
            className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--store-accent)] text-[#FAF9F5] active:scale-98 transition-transform cursor-pointer"
          >
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#FAF9F5]/15 flex items-center justify-center text-[#FAF9F5] shrink-0">
                <ShieldCheck className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <p className="text-xs sm:text-sm font-bold leading-tight">
                  {locale === 'bn' ? 'লাইভ অর্ডার ট্র্যাকিং' : 'Live Order Tracking'}
                </p>
                <p className="text-[11px] opacity-85 mt-0.5">
                  {locale === 'bn'
                    ? 'ট্র্যাকিং আইডি দিয়ে স্ট্যাটাস দেখুন'
                    : 'Track your parcel status'}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 opacity-90 shrink-0" aria-hidden="true" />
          </Link>

          {/* Primary Navigation Links */}
          <div className="space-y-1.5">
            <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-[#5A655D]">
              {locale === 'bn' ? 'প্রধান পেজসমূহ' : 'Main Pages'}
            </p>

            <div className="grid grid-cols-2 gap-2">{config.navigation.filter(link => link.enabled).map(link => <Link key={link.id} href={link.href} onClick={() => setIsMenuOpen(false)} className="p-3 min-h-[44px] min-w-0 break-words rounded-xl border border-[#E4E2DC] text-sm font-medium hover:bg-[#F2EFE9]">{text(link.labelBn, link.labelEn)}</Link>)}</div>
          </div>

          {/* Touch-Friendly Category Accordion */}
          <div className="space-y-2 border-t border-[#E4E2DC] pt-4">
            <button
              type="button"
              onClick={() => setIsCategoryAccordionOpen((prev) => !prev)}
              aria-expanded={isCategoryAccordionOpen}
              className="w-full min-h-[44px] flex items-center justify-between px-1 py-1 text-xs font-semibold uppercase tracking-wider text-[#162119] cursor-pointer"
            >
              <span>
                {dict.common.categories} ({formatLocaleNumber(categories.length, locale)})
              </span>
              <ChevronDown
                className={`w-4 h-4 transition-transform duration-200 ${
                  isCategoryAccordionOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {isCategoryAccordionOpen && (
              <div className="space-y-1.5 pt-1">
                <button
                  type="button"
                  onClick={() => {
                    onSelectCategory?.(null);
                    setIsMenuOpen(false);
                  }}
                  className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold text-left transition-all border cursor-pointer ${
                    !activeCategorySlug
                      ? 'bg-[var(--store-accent)] text-[#FAF9F5] border-[var(--store-accent)]'
                      : 'bg-[#FAF9F5] text-[#162119] border-[#E4E2DC] hover:bg-[#F2EFE9]'
                  }`}
                >
                  <span>{locale === 'bn' ? 'সব কালেকশন' : 'All Collections'}</span>
                  <ChevronRight className="w-4 h-4 opacity-70" aria-hidden="true" />
                </button>

                {categories.map((cat) => {
                  const isSelected = activeCategorySlug === cat.slug;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => {
                        onSelectCategory?.(cat.slug);
                        setIsMenuOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-2.5 rounded-xl text-xs font-semibold text-left transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--store-accent)] text-[#FAF9F5] border-[var(--store-accent)]'
                          : 'bg-[#FAF9F5] text-[#162119] border-[#E4E2DC] hover:bg-[#F2EFE9]'
                      }`}
                    >
                      <span className="truncate">
                        {locale === 'bn' ? cat.nameBn : cat.nameEn}
                      </span>
                      <ChevronRight className="w-4 h-4 opacity-70 shrink-0" aria-hidden="true" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Footer Options: Language Toggle & Phone Support */}
          <div className="pt-4 border-t border-[#E4E2DC] space-y-3">
            <div className="flex items-center justify-between p-3 border border-[#E4E2DC] rounded-xl bg-[#F2EFE9]">
              <span className="text-xs font-semibold text-[#162119]">
                {locale === 'bn' ? 'ভাষা / Language' : 'Switch Language'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleLocale}
                className="font-semibold text-xs px-3 min-h-[34px]"
              >
                {dict.common.languageToggle}
              </Button>
            </div>

            <div className="p-3 border border-[#E4E2DC] rounded-xl bg-[#F2EFE9] flex items-center justify-between text-xs">
              <span className="text-[#5A655D] font-medium flex items-center gap-2">
                <PhoneCall className="w-3.5 h-3.5 text-[var(--store-accent)]" aria-hidden="true" />
                <span>{locale === 'bn' ? 'হেল্পলাইন:' : 'Helpline:'}</span>
              </span>
              <span className="font-bold text-[#162119] tabular-nums text-sm">
                {siteSettings.supportPhone}
              </span>
            </div>
          </div>
        </div>
      </ResponsiveSheet>
    </div>
  );
}
