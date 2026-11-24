'use client';
import { productImageUrl, productImageFallback } from '@/lib/storefront/product-image';
import { getStorefrontConfig, safeStoreUrl } from '@/lib/storefront/storefront-config';
import { BrandMark } from './brand-mark';
import { uiText } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/storefront/storefront-shell.tsx
// Botanical Heritage Calm — Global Storefront Layout Shell:
//   - Accent Utility Bar (Delivery, QC Provenance & Helpline)
//   - Sticky Minimalist Header on Warm Alabaster with Brand Monogram, Pill Live Search, Bilingual Switcher, Wishlist & Cart
//   - Clean Horizontal Category Navigation Bar
//   - Mobile Bottom Tab Navigation (Home, Categories, Cart, Account — <= 768px)
//   - Slide-in / Bottom-Sheet Cart Drawer with 4:5 Portrait Thumbnails & Free Delivery Progress Bar
//   - Spacious Editorial Linen Footer
// Design tokens only (tokens.css): no arbitrary hex in UI (SHELL-01).

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
  Menu,
  Package,
  ChevronRight,
  ChevronDown,
  X,
  LogOut,
  CircleUserRound,
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
  React.useEffect(() => {
    // Edge-to-edge applies only to storefront pages; do not change admin/vendor viewport behavior.
    const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewport) return;
    const original = viewport.content;
    viewport.content = 'width=device-width, initial-scale=1, viewport-fit=cover';
    return () => { viewport.content = original; };
  }, []);
  const hasMobileStickyActionBar =
    pathname === '/checkout' || pathname.startsWith('/product/');
  const floatingContactPosition = hasMobileStickyActionBar
    ? 'hidden md:inline-flex md:bottom-[calc(6rem+var(--safe-bottom))] lg:bottom-[calc(1.5rem+var(--safe-bottom))]'
    : 'inline-flex bottom-[calc(4.5rem+var(--safe-bottom))] md:bottom-[calc(1.5rem+var(--safe-bottom))]';
  const [localQuery, setLocalQuery] = React.useState('');
  const searchQuery = controlledSearchChange ? controlledQuery : localQuery;
  const onSearchChange = controlledSearchChange ?? setLocalQuery;
  const handleSearchKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && searchQuery.trim()) {
      event.preventDefault();
      setIsSearchFocused(false);
      setIsMobileSearchOpen(false);
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
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', config.accentColor);
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
  const [isMobileSearchOpen, setIsMobileSearchOpen] = React.useState(false);
  React.useEffect(() => {
    const media = window.matchMedia('(min-width: 1280px)');
    const closeOnDesktop = () => {
      if (media.matches) {
        setIsMenuOpen(false);
        setIsMobileSearchOpen(false);
      }
    };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, []);
  React.useEffect(() => {
    setIsMenuOpen(false);
    setIsMobileSearchOpen(false);
    setIsSearchFocused(false);
  }, [pathname]);
  const [isCategoryAccordionOpen, setIsCategoryAccordionOpen] = React.useState(true);

  // Account menu: sign-in state is read lazily so guests never see a log-out action.
  const [accountMenuOpen, setAccountMenuOpen] = React.useState(false);
  const [accountIdentifier, setAccountIdentifier] = React.useState<string | null>(null);
  const [accountBusy, setAccountBusy] = React.useState(false);

  const openAccountMenu = React.useCallback(() => {
    setAccountMenuOpen((open) => !open);
    void (async () => {
      try {
        const response = await fetch('/api/account/orders', { cache: 'no-store' });
        const data = (await response.json()) as {
          authenticated?: boolean;
          identifier?: string;
          customerPhone?: string;
          customerEmail?: string | null;
        };
        setAccountIdentifier(
          data.authenticated ? (data.identifier || data.customerPhone || data.customerEmail || '') : null,
        );
      } catch {
        setAccountIdentifier(null);
      }
    })();
  }, []);

  const handleShellLogout = React.useCallback(async () => {
    if (accountBusy) return;
    setAccountBusy(true);
    try {
      await fetch('/api/account/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'logout' }),
      });
    } catch {
      // Ignore: the menu is reset either way so a stale session cannot trap the shopper.
    } finally {
      setAccountBusy(false);
      setAccountMenuOpen(false);
      setAccountIdentifier(null);
      window.location.assign('/account');
    }
  }, [accountBusy]);

  React.useEffect(() => {
    if (!accountMenuOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setAccountMenuOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [accountMenuOpen]);

  // Live Instant Search State
  const [isSearchFocused, setIsSearchFocused] = React.useState(false);
  const searchContainerRef = React.useRef<HTMLDivElement>(null);
  const mobileSearchContainerRef = React.useRef<HTMLDivElement>(null);
  const mobileSearchToggleRef = React.useRef<HTMLButtonElement>(null);
  const desktopSearchInputRef = React.useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (isMobileSearchOpen) {
      const id = window.requestAnimationFrame(() => {
        mobileSearchInputRef.current?.focus();
      });
      return () => window.cancelAnimationFrame(id);
    }
    return undefined;
  }, [isMobileSearchOpen]);

  const totalCartCount = cartItems.reduce((sum, i) => sum + i.quantity, 0);
  const freeDeliveryProgress = calculateCartFreeDeliveryProgress(
    cartItems,
    siteSettings.freeDeliveryThresholdPoisha,
    siteSettings.globalFreeDelivery
  );

  const brandName =
    locale === 'bn' ? siteSettings.brandNameBn : siteSettings.brandNameEn;
  const whatsappDigits = (siteSettings.whatsappNumber || '').replace(/\D/g, '');
  const safeSupportPhoneHref = (siteSettings.supportPhone || '').replace(/[^\d+\-() ]/g, '').trim();

  // Click Outside to Dismiss Search & Category Dropdown
  React.useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const insideDesktop = searchContainerRef.current?.contains(target);
      const insideMobile = mobileSearchContainerRef.current?.contains(target);
      const insideToggle = mobileSearchToggleRef.current?.contains(target);
      if (!insideDesktop && !insideMobile && !insideToggle) {
        setIsSearchFocused(false);
        setIsMobileSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Keyboard shortcut: '/' or 'Ctrl+K' focuses search (desktop or mobile), 'Escape' blurs
  React.useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (
        (event.key === '/' || (event.ctrlKey && event.key.toLowerCase() === 'k')) &&
        !['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement)?.tagName)
      ) {
        event.preventDefault();
        if (window.matchMedia('(min-width: 1280px)').matches) {
          desktopSearchInputRef.current?.focus();
          setIsSearchFocused(true);
        } else {
          setIsMobileSearchOpen(true);
          setIsSearchFocused(true);
        }
      } else if (event.key === 'Escape') {
        setIsSearchFocused(false);
        setIsMobileSearchOpen(false);
        desktopSearchInputRef.current?.blur();
        mobileSearchInputRef.current?.blur();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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
      <div className="min-h-screen flex flex-col items-center justify-center p-6 storefront-theme bg-bg text-ink">
        <div className="max-w-md w-full border border-border rounded-xl p-8 text-center space-y-4 bg-surface">
          <div className="w-12 h-12 mx-auto flex items-center justify-center rounded-full border border-border bg-bg">
            <Wrench className="w-5 h-5 text-[var(--store-accent)]" aria-hidden="true" />
          </div>
          <h1 className="font-display text-2xl font-bold text-ink">{brandName}</h1>
          <p className="text-sm text-ink/75">
            {text(siteSettings.maintenanceMessageBn, siteSettings.maintenanceMessageEn ?? 'We will be back shortly.')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div style={{ '--store-accent': config.accentColor } as React.CSSProperties} className={`min-h-[100dvh] flex flex-col min-w-0 storefront-theme storefront-shell bg-bg text-ink ${pathname === '/checkout' ? 'pb-[calc(8.75rem+var(--safe-bottom))] md:pb-24 lg:pb-0' : pathname.startsWith('/product/') ? 'pb-[calc(8.75rem+var(--safe-bottom))] md:pb-0' : 'pb-[calc(4rem+var(--safe-bottom))] md:pb-0'}`}>
      {/* 1. Accent Top Utility Banner */}
      {siteSettings.delayBanner.enabled && (
        <div className="storefront-delay-banner bg-[var(--store-accent)] text-white px-3.5 sm:px-6 lg:px-10 py-1.5 sm:py-2 text-[11px] sm:text-xs tracking-[0.04em]">
          <div className="max-w-[1600px] mx-auto flex justify-center sm:justify-between items-center gap-4">
            <p className="leading-snug sm:leading-relaxed text-center sm:text-left font-normal line-clamp-2 sm:line-clamp-none">
              {text(siteSettings.delayBanner.messageBn, siteSettings.delayBanner.messageEn)}
            </p>
            {config.showSupportPhone && safeSupportPhoneHref && (
              <a
                href={`tel:${safeSupportPhoneHref}`}
                className="hidden sm:inline-flex gap-2 shrink-0 items-center font-mono text-[11px] tracking-[0.08em] hover:opacity-85 transition-opacity"
              >
                <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                {siteSettings.supportPhone}
              </a>
            )}
          </div>
        </div>
      )}

      {/* 2. Sticky Editorial Header (Compact single row on mobile) */}
      <header className="storefront-header sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-sm">
        <div className="max-w-[1600px] mx-auto px-3.5 sm:px-8 lg:px-10 py-2.5 sm:py-4">
          <div className="flex items-center justify-between gap-2 sm:gap-6">
            {/* Left: Brand Identity & Tablet Menu Trigger */}
            <div className="flex items-center gap-2.5 min-w-0 shrink-0">
              <button
                type="button"
                onClick={() => setIsMenuOpen(true)}
                aria-label={locale === 'bn' ? 'মেনু খুলুন' : 'Open menu'}
                className="hidden md:flex xl:hidden p-2 -ml-1 text-ink hover:bg-surface border border-border rounded-lg cursor-pointer touch-target items-center justify-center transition-colors"
              >
                <Menu className="w-5 h-5" aria-hidden="true" />
              </button>

              <Link
                href="/"
                onClick={() => onSelectCategory?.(null)}
                className="flex items-center gap-3 min-h-[44px] min-w-0 group select-none"
                aria-label={`${brandName} — ${dict.common.home}`}
              >
                <BrandMark settings={siteSettings} />
              </Link>
            </div>

            {/* Center: Clean Editorial Navigation + Subtle Search */}
            <div className="hidden xl:flex items-center justify-center gap-7 flex-1 min-w-0">
              <nav aria-label={uiText("Main Navigation", locale)} className="flex items-center gap-6 text-xs uppercase tracking-[0.09em] font-medium">
                {config.navigation.filter(link => link.enabled).map(link => {
                  const isActive = pathname === link.href || (link.href !== '/' && pathname.startsWith(link.href));
                  const isTrackingLink =
                    link.id === 'order-tracking' || link.href.startsWith('/order-tracking');
                  if (isTrackingLink) {
                    return (
                      <Link
                        key={link.id}
                        href={link.href}
                        className={`whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg border font-mono text-[11px] uppercase tracking-[0.08em] transition-colors ${
                          isActive
                            ? 'bg-[var(--store-accent)] text-white border-[var(--store-accent)]'
                            : 'bg-surface text-ink border-accent/25 hover:border-[var(--store-accent)] hover:bg-[var(--store-accent)] hover:text-white'
                        }`}
                      >
                        <Package className="w-3.5 h-3.5" aria-hidden="true" />
                        <span>{text(link.labelBn, link.labelEn)}</span>
                      </Link>
                    );
                  }
                  return (
                    <Link
                      key={link.id}
                      href={link.href}
                      className={`whitespace-nowrap shrink-0 inline-flex items-center min-h-[44px] px-1 py-1 transition-all border-b-2 ${
                        isActive
                          ? 'text-ink border-accent font-semibold'
                          : 'text-ink/85 border-transparent hover:text-ink hover:border-accent/40'
                      }`}
                    >
                      {text(link.labelBn, link.labelEn)}
                    </Link>
                  );
                })}
              </nav>

              {/* Desktop Live Instant Search (Editorial Underline Style) */}
              <div
                ref={searchContainerRef}
                className="w-full max-w-[260px] relative"
              >
                <div className="relative w-full">
                  <Search
                    className="w-3.5 h-3.5 text-ink/75 absolute left-0 top-1/2 -translate-y-1/2 pointer-events-none"
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
                        ? 'পণ্য বা এসকেইউ খুঁজুন...'
                        : 'Search products or SKU...'
                    }
                    aria-label={dict.common.searchPlaceholder}
                    className="w-full min-h-[44px] pl-6 pr-10 py-2 text-sm bg-transparent text-ink border-0 border-b border-border placeholder:text-ink/65 focus:border-accent focus:outline-none transition-colors"
                  />
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center">
                    {searchQuery ? (
                      <button
                        type="button"
                        onClick={() => {
                          onSearchChange?.('');
                          desktopSearchInputRef.current?.focus();
                        }}
                        aria-label={uiText("Clear search", locale)}
                        className="w-11 h-11 flex items-center justify-center text-ink/80 hover:text-ink cursor-pointer transition-colors"
                      >
                        <X className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    ) : (
                      <kbd className="hidden md:inline-flex items-center text-[10px] font-mono px-1.5 py-0.5 rounded border border-border bg-surface text-ink/80 select-none">
                        /
                      </kbd>
                    )}
                  </div>
                </div>

                {/* Live Instant Search Dropdown (Desktop) */}
                {isSearchFocused && (
                  <div className="absolute top-full right-0 w-[420px] mt-3 z-50 bg-bg border border-border rounded-xl shadow-[0_14px_36px_rgba(27,67,50,0.08)] overflow-hidden max-h-[420px] overflow-y-auto">
                    {searchQuery.trim().length > 0 ? (
                      <div className="p-5 space-y-4">
                        {matchingCategories.length > 0 && (
                          <div className="space-y-2">
                            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink/80">
                              {locale === 'bn' ? 'সংশ্লিষ্ট ক্যাটাগরি' : 'Matching Categories'}
                            </p>
                            <div className="flex flex-wrap gap-3">
                              {matchingCategories.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => {
                                    onSearchChange?.('');
                                    onSelectCategory?.(c.slug);
                                    setIsSearchFocused(false);
                                  }}
                                  className="min-h-[36px] text-xs font-medium text-ink underline underline-offset-4 decoration-border hover:decoration-accent transition-colors cursor-pointer"
                                >
                                  {locale === 'bn' ? c.nameBn : c.nameEn}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between pb-1">
                            <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink/60">
                              {locale === 'bn' ? 'পণ্যসমূহ' : 'Matching Products'}
                            </p>
                            {matchingProducts.length > 0 && (
                              <span className="font-mono text-[10px] text-ink/60">
                                {formatLocaleNumber(matchingProducts.length, locale)} {locale === 'bn' ? 'টি' : 'items'}
                              </span>
                            )}
                          </div>

                          {matchingProducts.length > 0 ? (
                            <div className="divide-y divide-border">
                              {matchingProducts.map((p) => {
                                const variant = p.variants[0];
                                return (
                                  <Link
                                    key={p.productId}
                                    href={`/product/${p.slug}`}
                                    onClick={() => setIsSearchFocused(false)}
                                    className="flex items-center gap-3 py-2.5 px-1.5 hover:bg-surface transition-colors group"
                                  >
                                    {p.images[0] ? (
                                      <div className="w-10 h-12 rounded-lg border border-border overflow-hidden shrink-0 bg-surface relative">
                                        <img
                                          src={productImageUrl(p.images[0])}
                                          onError={productImageFallback}
                                          alt={locale === 'bn' ? p.nameBn : p.nameEn}
                                          className="object-cover"
                                          referrerPolicy="no-referrer" loading="lazy" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} />
                                      </div>
                                    ) : (
                                      <div className="w-10 h-12 rounded-lg border border-border bg-surface flex items-center justify-center shrink-0">
                                        <Package className="w-4 h-4 text-ink/50" />
                                      </div>
                                    )}
                                    <div className="flex-1 min-w-0">
                                      <p className="text-xs font-semibold text-ink truncate group-hover:text-[var(--store-terracotta)]">
                                        {locale === 'bn' ? p.nameBn : p.nameEn}
                                      </p>
                                      <p className="font-mono text-[10px] text-ink/60 truncate">
                                        <LocalizedText source={"SKU:"} area="storefront" />{" "}{variant?.publicSku || 'BG-SKU'}
                                      </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                      <p className="text-xs font-semibold text-ink tabular-nums">
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
                              <p className="text-xs font-semibold text-ink">
                                {locale === 'bn'
                                  ? `"${searchQuery}" নামে কোনো পণ্য পাওয়া যায়নি`
                                  : `No products found for "${searchQuery}"`}
                              </p>
                              <p className="text-[11px] text-ink/60">
                                {locale === 'bn'
                                  ? 'বানান পরীক্ষা করুন অথবা নিচের ক্যাটাগরিগুলো থেকে বেছে নিন'
                                  : 'Check your spelling or explore our categories'}
                              </p>
                            </div>
                          )}

                          <div className="pt-3 border-t border-border flex items-center justify-between">
                            <Link
                              href={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
                              onClick={() => setIsSearchFocused(false)}
                              className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink hover:underline flex items-center gap-1"
                            >
                              <span>
                                {locale === 'bn'
                                  ? 'সব ফলাফল দেখুন'
                                  : 'All results'}
                              </span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </Link>
                            <Link
                              href="/shop"
                              onClick={() => setIsSearchFocused(false)}
                              className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink/60 hover:text-ink"
                            >
                              {locale === 'bn' ? 'সকল পণ্য' : 'Shop All'}
                            </Link>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="p-5 space-y-4">
                        <div className="space-y-2.5">
                          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink/60 flex items-center gap-1.5">
                            <TrendingUp className="w-3.5 h-3.5 text-[var(--store-terracotta)]" />
                            <span>{locale === 'bn' ? 'জনপ্রিয় অনুসন্ধান' : 'Popular Searches'}</span>
                          </p>
                          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                            {trendingQueries.map((item, idx) => (
                              <button
                                key={idx}
                                type="button"
                                onClick={() => {
                                  const term = locale === 'bn' ? item.labelBn : item.labelEn;
                                  onSearchChange?.(term);
                                  setIsSearchFocused(true);
                                }}
                                className="text-xs font-medium text-ink/80 hover:text-ink underline underline-offset-4 decoration-border hover:decoration-accent transition-colors cursor-pointer"
                              >
                                {locale === 'bn' ? item.labelBn : item.labelEn}
                              </button>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-2 pt-3 border-t border-border">
                          <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink/60">
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
                                className="flex items-center justify-between p-2 text-xs font-medium border border-border bg-surface hover:border-accent text-left text-ink transition-colors cursor-pointer rounded-lg"
                              >
                                <span className="truncate">
                                  {locale === 'bn' ? c.nameBn : c.nameEn}
                                </span>
                                <ChevronRight className="w-3.5 h-3.5 text-ink/50 shrink-0" />
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Right Action Cluster (Compact on mobile, Editorial on desktop) */}
            <div className="flex shrink-0 items-center gap-1.5 sm:gap-3.5">
              {/* On-demand Search Trigger (< xl) */}
              <button
                ref={mobileSearchToggleRef}
                type="button"
                onClick={() => {
                  setIsMobileSearchOpen((prev) => {
                    const next = !prev;
                    setIsSearchFocused(next);
                    return next;
                  });
                }}
                aria-expanded={isMobileSearchOpen}
                aria-label={locale === 'bn' ? 'অনুসন্ধান খুলুন' : 'Toggle search'}
                className={`xl:hidden w-11 h-11 inline-flex items-center justify-center rounded-lg border transition-colors cursor-pointer ${
                  isMobileSearchOpen
                    ? 'border-[var(--store-accent)] bg-[var(--store-accent)] text-white'
                    : 'border-border bg-surface text-ink hover:border-accent'
                }`}
              >
                {isMobileSearchOpen ? (
                  <X className="w-4 h-4" aria-hidden="true" />
                ) : (
                  <Search className="w-4 h-4" aria-hidden="true" />
                )}
              </button>

              {/* Language Switcher (BN | EN mono text) */}
              <button
                type="button"
                onClick={toggleLocale}
                title={uiText("Toggle language", locale)}
                className="inline-flex items-center gap-1 font-mono text-[11px] tracking-[0.08em] min-h-[44px] min-w-[44px] justify-center px-2 text-ink cursor-pointer transition-opacity whitespace-nowrap shrink-0"
              >
                <span className={locale === 'bn' ? 'font-bold underline underline-offset-4 text-ink' : 'text-ink/75 hover:text-ink'}>
                  <LocalizedText source={"BN"} area="storefront" />
                </span>
                <span className="text-ink/60" aria-hidden="true">|</span>
                <span className={locale === 'en' ? 'font-bold underline underline-offset-4 text-ink' : 'text-ink/75 hover:text-ink'}>
                  <LocalizedText source={"EN"} area="storefront" />
                </span>
                <span className="sr-only"> — {uiText("Toggle language", locale)}</span>
              </button>

              {/* Circular Account Trigger + Menu (sign in / sign out) */}
              <div className="relative hidden sm:block">
                <button
                  type="button"
                  onClick={openAccountMenu}
                  aria-label={dict.common.account}
                  aria-haspopup="menu"
                  aria-expanded={accountMenuOpen}
                  className={`inline-flex items-center justify-center w-11 h-11 rounded-full border transition-colors cursor-pointer ${
                    accountMenuOpen || pathname === '/account'
                      ? 'border-accent bg-accent text-white'
                      : 'border-accent text-ink hover:bg-accent hover:text-white'
                  }`}
                  title={dict.common.account}
                >
                  {accountIdentifier ? (
                    <CircleUserRound className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <User className="w-4 h-4" aria-hidden="true" />
                  )}
                </button>
                {accountMenuOpen && (
                  <>
                    <div
                      className="fixed inset-0 z-40"
                      aria-hidden="true"
                      onClick={() => setAccountMenuOpen(false)}
                    />
                    <div
                      role="menu"
                      aria-label={dict.common.account}
                      className="absolute right-0 top-full z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border bg-bg shadow-[0_18px_40px_rgba(27,67,50,0.14)]"
                    >
                      <p className="border-b border-border px-3.5 py-2.5 font-mono text-[10px] uppercase tracking-[0.1em] text-ink/60 break-all">
                        {accountIdentifier
                          ? accountIdentifier
                          : locale === 'bn'
                          ? 'লগইন করা নেই'
                          : 'Not signed in'}
                      </p>
                      <Link
                        role="menuitem"
                        href="/account"
                        onClick={() => setAccountMenuOpen(false)}
                        className="flex min-h-[44px] w-full items-center gap-2 px-3.5 text-sm text-ink transition-colors hover:bg-surface"
                      >
                        <User className="w-4 h-4" aria-hidden="true" />
                        {locale === 'bn' ? 'আমার অ্যাকাউন্ট' : 'My account'}
                      </Link>
                      {accountIdentifier ? (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={handleShellLogout}
                          disabled={accountBusy}
                          className="flex min-h-[44px] w-full items-center gap-2 border-t border-border px-3.5 text-sm text-[var(--store-terracotta)] transition-colors hover:bg-surface disabled:opacity-60 cursor-pointer"
                        >
                          <LogOut className="w-4 h-4" aria-hidden="true" />
                          {locale === 'bn' ? 'লগ আউট' : 'Log out'}
                        </button>
                      ) : (
                        <Link
                          role="menuitem"
                          href="/account"
                          onClick={() => setAccountMenuOpen(false)}
                          className="flex min-h-[44px] w-full items-center gap-2 border-t border-border px-3.5 text-sm text-ink transition-colors hover:bg-surface"
                        >
                          <LogOut className="w-4 h-4 rotate-180" aria-hidden="true" />
                          {locale === 'bn' ? 'লগ ইন করুন' : 'Sign in'}
                        </Link>
                      )}
                    </div>
                  </>
                )}
              </div>

              {/* Minimal Wishlist Icon Trigger */}
              <Link
                href="/account?tab=wishlist"
                aria-label={dict.common.wishlist}
                className="relative w-11 h-11 hidden sm:inline-flex items-center justify-center rounded-full border border-border text-ink hover:border-accent transition-colors"
                title={dict.common.wishlist}
              >
                <Heart className="w-4 h-4" aria-hidden="true" />
                {wishlistCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 flex items-center justify-center text-[10px] font-mono bg-[var(--store-terracotta)] text-white rounded-full tabular-nums">
                    {formatLocaleNumber(wishlistCount, locale)}
                  </span>
                )}
              </Link>

              {/* Soft-Rounded Cart CTA */}
              <button
                type="button"
                onClick={() => setCartOpen(true)}
                aria-label={dict.common.cart}
                className="inline-flex items-center justify-center gap-1.5 sm:gap-2 min-h-[44px] px-3 sm:px-4 rounded-lg bg-[var(--store-accent)] text-white hover:opacity-90 font-mono text-[11px] uppercase tracking-[0.08em] tabular-nums cursor-pointer transition-opacity whitespace-nowrap shrink-0"
              >
                <ShoppingBag className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">{dict.common.cart}</span>
                <span className="tabular-nums opacity-95">
                  ({formatLocaleNumber(totalCartCount, locale)})
                </span>
              </button>
            </div>
          </div>

          {/* On-Demand Expandable Mobile & Tablet Search Panel (< xl) */}
          {isMobileSearchOpen && (
            <div
              ref={mobileSearchContainerRef}
              className="xl:hidden pt-2.5 mt-2.5 border-t border-border relative"
            >
              <div className="relative w-full">
                <Search
                  className="w-4 h-4 text-ink/55 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                  aria-hidden="true"
                />
                <input
                  ref={mobileSearchInputRef}
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
                      ? 'পণ্য, ক্যাটাগরি বা SKU খুঁজুন...'
                      : 'Search products, categories or SKU...'
                  }
                  aria-label={dict.common.searchPlaceholder}
                  className="w-full min-h-[44px] pl-9 pr-11 py-2 text-base rounded-lg bg-surface text-ink border border-border placeholder:text-ink/65 focus:border-[var(--store-accent)] focus:bg-white focus:outline-none"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      onSearchChange?.('');
                      mobileSearchInputRef.current?.focus();
                    }}
                    aria-label={uiText("Clear search", locale)}
                    className="absolute right-0 top-1/2 -translate-y-1/2 w-11 h-11 flex items-center justify-center text-ink/80 hover:text-ink cursor-pointer"
                  >
                    <X className="w-4 h-4" aria-hidden="true" />
                  </button>
                )}
              </div>

              {isSearchFocused && (
                <div className="mt-2 bg-bg border border-border rounded-xl shadow-[0_14px_36px_rgba(27,67,50,0.08)] overflow-hidden max-h-[min(360px,55dvh)] overflow-y-auto p-3.5 space-y-3">
                  {searchQuery.trim().length > 0 ? (
                    <>
                      {matchingProducts.length > 0 ? (
                        <div className="divide-y divide-border">
                          {matchingProducts.map((p) => {
                            const variant = p.variants[0];
                            return (
                              <Link
                                key={p.productId}
                                href={`/product/${p.slug}`}
                                onClick={() => {
                                  setIsSearchFocused(false);
                                  setIsMobileSearchOpen(false);
                                }}
                                className="flex items-center gap-3 py-2.5 min-h-[44px] hover:bg-surface transition-colors"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-semibold text-ink truncate">
                                    {locale === 'bn' ? p.nameBn : p.nameEn}
                                  </p>
                                  <p className="text-xs font-mono text-ink/65 tabular-nums">
                                    {variant
                                      ? formatPoishaToBdt(variant.salePricePoisha, locale)
                                      : ''}
                                  </p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-ink/50 shrink-0" />
                              </Link>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-xs text-center py-4 text-ink/65">
                          {locale === 'bn' ? 'কোনো পণ্য খুঁজে পাওয়া যায়নি' : 'No products found'}
                        </p>
                      )}
                      <div className="pt-2.5 border-t border-border flex items-center justify-between">
                        <Link
                          href={`/search?q=${encodeURIComponent(searchQuery.trim())}`}
                          onClick={() => {
                            setIsSearchFocused(false);
                            setIsMobileSearchOpen(false);
                          }}
                          className="min-h-[36px] inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-[0.08em] text-[var(--store-accent)] font-semibold"
                        >
                          <span>{locale === 'bn' ? 'সব ফলাফল দেখুন' : 'All results'}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Link>
                        <Link
                          href="/shop"
                          onClick={() => {
                            setIsSearchFocused(false);
                            setIsMobileSearchOpen(false);
                          }}
                          className="min-h-[36px] inline-flex items-center font-mono text-[11px] uppercase tracking-[0.08em] text-ink/65"
                        >
                          {locale === 'bn' ? 'সকল পণ্য' : 'Shop All'}
                        </Link>
                      </div>
                    </>
                  ) : (
                    <div className="space-y-2.5">
                      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink/60">
                        {locale === 'bn' ? 'জনপ্রিয় অনুসন্ধান' : 'Popular Searches'}
                      </p>
                      <div className="flex flex-wrap gap-2">
                        {trendingQueries.map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => {
                              const term = locale === 'bn' ? item.labelBn : item.labelEn;
                              onSearchChange?.(term);
                              if (!controlledSearchChange) {
                                setIsMobileSearchOpen(false);
                                setIsSearchFocused(false);
                                navigate(`/search?q=${encodeURIComponent(term)}`);
                              }
                            }}
                            className="px-3 py-1.5 min-h-[36px] rounded-lg border border-border bg-surface text-xs font-medium text-ink hover:border-[var(--store-accent)] cursor-pointer"
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
          )}
        </div>
      </header>

      {/* 3. Main Content */}
      <main className="flex-1 min-w-0">{children}</main>

      {/* 4. Editorial Linen Footer (Variation 2) */}
      <footer className="border-t border-border bg-surface mt-10 sm:mt-20">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-8 lg:px-10 py-9 sm:py-14 grid grid-cols-1 md:grid-cols-12 gap-8 sm:gap-10">
          <div className="md:col-span-5 space-y-4">
            <Link href="/" aria-label={brandName}>
              <BrandMark settings={siteSettings} compact />
            </Link>
            <p className="text-sm text-ink/80 leading-7 max-w-sm whitespace-pre-line">
              {text(config.footerTextBn, config.footerTextEn)}
            </p>
            <div className="flex flex-col gap-1.5 text-xs font-mono text-ink/85">
              {safeSupportPhoneHref && (
                <a href={`tel:${safeSupportPhoneHref}`} className="hover:text-ink break-all">
                  {siteSettings.supportPhone}
                </a>
              )}
              {siteSettings.supportEmail && (
                <a href={`mailto:${siteSettings.supportEmail}`} className="hover:text-ink break-all">
                  {siteSettings.supportEmail}
                </a>
              )}
              <p className="font-sans text-xs text-ink/80">
                {text(siteSettings.aboutContactPage?.helplineHoursBn ?? '', siteSettings.aboutContactPage?.helplineHoursEn ?? '')}
              </p>
            </div>
            <div className="flex flex-wrap gap-4 text-xs font-mono uppercase tracking-[0.08em]">
              {config.socialLinks.filter(link => link.enabled && safeStoreUrl(link.href)).map(link => (
                <a
                  key={link.id}
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink/85 hover:text-ink underline underline-offset-4"
                >
                  {text(link.labelBn, link.labelEn)}
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 md:contents gap-6">
            <div className="md:col-span-3">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink/80 mb-3 sm:mb-4">
                {text('সাথে থাকুন', 'Explore')}
              </h2>
              <ul className="space-y-1.5 sm:space-y-2.5 text-sm text-ink/85">
                {config.footerLinks.filter(link => link.enabled).map(link => (
                  <li key={link.id}>
                    <Link className="inline-flex min-h-[44px] sm:min-h-[36px] items-center hover:text-ink hover:underline underline-offset-4" href={link.href}>
                      {text(link.labelBn, link.labelEn)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div className="md:col-span-4">
              <h2 className="font-mono text-[11px] font-bold uppercase tracking-[0.12em] text-ink/80 mb-3 sm:mb-4">
                {text('নীতিমালা', 'Useful information')}
              </h2>
              <ul className="space-y-1.5 sm:space-y-2.5 text-sm text-ink/85">
                {Object.entries(siteSettings.legalPages).map(([slug, page]) => (
                  <li key={slug}>
                    <Link href={`/legal/${slug}`} className="inline-flex min-h-[44px] sm:min-h-[36px] items-center hover:text-ink hover:underline underline-offset-4">
                      {text(page.titleBn, page.titleEn)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="storefront-footer-bottom border-t border-border px-4 sm:px-8 lg:px-10 py-5">
          <div className="max-w-[1600px] mx-auto flex flex-wrap justify-between items-center gap-3 text-[11px] text-ink/80">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
              <span>
                {text(config.copyrightBn, config.copyrightEn)
                  .replaceAll('{year}', String(new Date().getFullYear()))
                  .replaceAll('{brand}', brandName)}
              </span>
              {text(config.footerNoteBn, config.footerNoteEn) && (
                <span className="text-ink/80">
                  {text(config.footerNoteBn, config.footerNoteEn)}
                </span>
              )}
            </div>
            <div className="hidden sm:flex flex-wrap items-center gap-6">
              {Object.entries(siteSettings.legalPages).slice(0, 3).map(([slug, page]) => (
                <Link key={slug} href={`/legal/${slug}`} className="hover:text-ink transition-colors">
                  {text(page.titleBn, page.titleEn)}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </footer>

      {config.showWhatsApp && whatsappDigits && (
        <a
          href={`https://wa.me/${whatsappDigits}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={text('WhatsApp — হোয়াটসঅ্যাপে যোগাযোগ', 'WhatsApp — Contact on WhatsApp')}
          className={`storefront-floating-contact fixed ${floatingContactPosition} z-30 min-h-[44px] items-center rounded-lg bg-[var(--store-accent)] text-white shadow-md px-3.5 sm:px-4 py-2 sm:py-2.5 font-mono text-[11px] uppercase tracking-[0.08em] hover:opacity-90 transition-opacity`}
        >
          WhatsApp ↗
        </a>
      )}

      {/* 5. Mobile 5-Button Bottom Tab Bar (< 768px) */}
      <nav
        aria-label={uiText("Mobile bottom navigation", locale)}
        className="storefront-bottom-nav md:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-bg/95 backdrop-blur safe-bottom-bar"
      >
        <div className="grid grid-cols-5 h-14">
          <Link
            href="/"
            onClick={() => onSelectCategory?.(null)}
            aria-current={pathname === '/' ? 'page' : undefined}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold leading-none active:scale-95 transition-transform ${pathname === '/' ? 'text-[var(--store-accent)]' : 'text-ink/80 hover:text-ink'}`}
          >
            <Home className="w-[18px] h-[18px]" aria-hidden="true" />
            <span className="truncate max-w-full">{dict.common.home}</span>
          </Link>

          <Link
            href="/shop"
            aria-current={pathname === '/shop' ? 'page' : pathname.startsWith('/category/') || pathname === '/categories' || pathname.startsWith('/product/') || pathname.startsWith('/search') ? 'location' : undefined}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold leading-none active:scale-95 transition-transform ${pathname === '/shop' || pathname.startsWith('/category/') || pathname === '/categories' || pathname.startsWith('/product/') || pathname.startsWith('/search') ? 'text-[var(--store-accent)]' : 'text-ink/80 hover:text-ink'}`}
          >
            <Grid className="w-[18px] h-[18px]" aria-hidden="true" />
            <span className="truncate max-w-full">{locale === 'bn' ? 'শপ' : 'Shop'}</span>
          </Link>

          <Link
            href="/order-tracking"
            aria-current={pathname.startsWith('/order-tracking') ? 'page' : undefined}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold leading-none active:scale-95 transition-transform ${pathname.startsWith('/order-tracking') ? 'text-[var(--store-accent)]' : 'text-ink/80 hover:text-ink'}`}
          >
            <Package className="w-[18px] h-[18px]" aria-hidden="true" />
            <span className="truncate max-w-full">{locale === 'bn' ? 'ট্র্যাক' : 'Track'}</span>
          </Link>

          <Link
            href="/account"
            aria-current={pathname === '/account' ? 'page' : undefined}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold leading-none active:scale-95 transition-transform ${pathname === '/account' ? 'text-[var(--store-accent)]' : 'text-ink/80 hover:text-ink'}`}
          >
            <User className="w-[18px] h-[18px]" aria-hidden="true" />
            <span className="truncate max-w-full">{dict.common.account}</span>
          </Link>

          <button
            type="button"
            onClick={() => setIsMenuOpen(true)}
            data-active={isMenuOpen ? 'true' : undefined}
            aria-expanded={isMenuOpen}
            aria-label={locale === 'bn' ? 'মেনু খুলুন' : 'Open menu'}
            className={`min-h-[44px] flex flex-col items-center justify-center gap-0.5 px-1 text-[10px] font-semibold leading-none cursor-pointer active:scale-95 transition-transform ${isMenuOpen ? 'text-[var(--store-accent)]' : 'text-ink/80 hover:text-ink'}`}
          >
            <Menu className="w-[18px] h-[18px]" aria-hidden="true" />
            <span className="truncate max-w-full">{locale === 'bn' ? 'মেনু' : 'Menu'}</span>
          </button>
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
                <span className="text-ink/70">{dict.common.subtotal}</span>
                <span className="font-display text-xl font-bold text-ink tabular-nums">
                  {formatPoishaToBdt(freeDeliveryProgress.subtotalPoisha, locale)}
                </span>
              </div>
              <Link
                href="/checkout"
                onClick={() => setCartOpen(false)}
                className="flex w-full min-h-[46px] items-center justify-center rounded-lg px-5 py-3 bg-[var(--store-accent)] text-white hover:opacity-90 font-mono text-xs uppercase tracking-[0.15em] transition-opacity cursor-pointer"
              >
                {dict.cart.proceedToCheckout}
              </Link>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-4">
          {/* Free Delivery Threshold Progress Booster */}
          <div className="p-3.5 border border-border rounded-xl bg-surface space-y-2">
            <div className="flex items-center justify-between text-xs font-medium">
              {freeDeliveryProgress.isQualifiedForFreeDelivery ? (
                <span className="text-success font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4" aria-hidden="true" />
                  {dict.cart.unlockedFreeDelivery}
                </span>
              ) : (
                <span className="text-ink">
                  {dict.cart.addMoreForFreeDelivery(
                    formatPoishaToBdt(
                      freeDeliveryProgress.remainingForFreeDeliveryPoisha,
                      locale
                    )
                  )}
                </span>
              )}
              <span className="font-mono tabular-nums text-ink/65">
                {formatLocaleNumber(freeDeliveryProgress.progressPercent, locale)}%
              </span>
            </div>
            <div className="w-full h-1.5 rounded-full bg-bg border border-border overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--store-accent)] transition-all duration-200"
                style={{ width: `${freeDeliveryProgress.progressPercent}%` }}
              />
            </div>
          </div>

          {/* Undo Remove Banner */}
          {lastRemovedItem && (
            <div className="flex items-center justify-between gap-2 p-3 border border-border rounded-xl bg-surface text-xs">
              <span className="text-ink truncate">
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
            <ul className="divide-y divide-border border border-border rounded-xl overflow-hidden">
              {cartItems.map((item) => {
                const itemName = locale === 'bn' ? item.nameBn : item.nameEn;
                const variantTitle =
                  locale === 'bn' ? item.variantTitleBn : item.variantTitleEn;
                return (
                  <li key={item.variantId} className="p-3 sm:p-3.5 flex gap-3 sm:gap-3.5 bg-bg min-w-0">
                    {/* 4:5 Portrait Thumbnail */}
                    <div className="relative w-16 h-20 shrink-0 border border-border rounded-lg overflow-hidden bg-surface">
                      {item.imageUrl && (
                        <img
                          src={productImageUrl(item.imageUrl)}
                          onError={productImageFallback}
                          alt={itemName}
                          referrerPolicy="no-referrer"
                          className="object-cover" loading="lazy" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-display text-base font-bold text-ink truncate">
                        {itemName}
                      </p>
                      <p className="text-xs text-ink/80">{variantTitle}</p>
                      <p className="font-mono text-xs font-bold text-ink mt-1 tabular-nums">
                        {formatPoishaToBdt(
                          item.unitSalePricePoisha * item.quantity,
                          locale
                        )}
                      </p>

                      <div className="mt-2.5 flex items-center justify-between">
                        <div className="inline-flex items-center border border-border rounded-lg bg-surface overflow-hidden">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.variantId, item.quantity - 1)
                            }
                            aria-label={uiText("Decrease quantity", locale)}
                            className="w-11 h-11 flex items-center justify-center text-ink hover:bg-white cursor-pointer"
                          >
                            <Minus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <span className="px-3 font-mono text-xs font-semibold tabular-nums text-ink">
                            {formatLocaleNumber(item.quantity, locale)}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(item.variantId, item.quantity + 1)
                            }
                            aria-label={uiText("Increase quantity", locale)}
                            className="w-11 h-11 flex items-center justify-center text-ink hover:bg-white cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>

                        <button
                          type="button"
                          onClick={() => removeItem(item.variantId)}
                          aria-label={locale === 'bn' ? `${itemName} সরান` : `Remove ${itemName}`}
                          className="w-11 h-11 flex items-center justify-center text-ink/80 hover:text-[var(--store-terracotta)] cursor-pointer"
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

      {/* Mobile & Tablet Navigation Drawer */}
      <ResponsiveSheet
        open={isMenuOpen}
        onOpenChange={setIsMenuOpen}
        title={locale === 'bn' ? 'মেনু ও নেভিগেশন' : 'Menu & Navigation'}
      >
        <div className="space-y-5">
          {/* Top Live Order Tracking CTA */}
          <Link
            href="/order-tracking"
            onClick={() => setIsMenuOpen(false)}
            className="flex items-center justify-between p-3.5 rounded-xl bg-[var(--store-accent)] text-white active:scale-[0.98] transition-transform cursor-pointer"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-lg bg-white/15 flex items-center justify-center text-white shrink-0">
                <ShieldCheck className="w-5 h-5" aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold leading-tight">
                  {locale === 'bn' ? 'অর্ডার ট্র্যাকিং' : 'Order Tracking'}
                </p>
                <p className="text-[11px] opacity-85 mt-0.5 truncate">
                  {locale === 'bn'
                    ? 'ট্র্যাকিং আইডি দিয়ে স্ট্যাটাস দেখুন'
                    : 'Track your parcel status'}
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 opacity-90 shrink-0" aria-hidden="true" />
          </Link>

          {/* Primary Navigation Links + Wishlist */}
          <div className="space-y-1.5">
            <p className="px-1 font-mono text-[11px] uppercase tracking-[0.1em] text-ink/60">
              {locale === 'bn' ? 'প্রধান পেজসমূহ' : 'Main Pages'}
            </p>

            <div className="grid grid-cols-2 gap-2">
              {config.navigation.filter(link => link.enabled).map(link => (
                <Link
                  key={link.id}
                  href={link.href}
                  onClick={() => setIsMenuOpen(false)}
                  className="p-3 min-h-[44px] min-w-0 break-words flex items-center rounded-lg border border-border bg-bg text-sm font-medium text-ink hover:bg-surface"
                >
                  {text(link.labelBn, link.labelEn)}
                </Link>
              ))}
              <Link
                href="/account?tab=wishlist"
                onClick={() => setIsMenuOpen(false)}
                className="p-3 min-h-[44px] min-w-0 flex items-center justify-between gap-2 rounded-lg border border-border bg-bg text-sm font-medium text-ink hover:bg-surface"
              >
                <span className="inline-flex items-center gap-1.5 truncate">
                  <Heart className="w-3.5 h-3.5 text-[var(--store-terracotta)] shrink-0" aria-hidden="true" />
                  <span className="truncate">{dict.common.wishlist}</span>
                </span>
                {wishlistCount > 0 && (
                  <span className="px-1.5 py-0.5 text-[10px] font-mono bg-[var(--store-terracotta)] text-white rounded-full tabular-nums shrink-0">
                    {formatLocaleNumber(wishlistCount, locale)}
                  </span>
                )}
              </Link>
            </div>
          </div>

          {/* Touch-Friendly Category Accordion */}
          <div className="space-y-2 border-t border-border pt-4">
            <button
              type="button"
              onClick={() => setIsCategoryAccordionOpen((prev) => !prev)}
              aria-expanded={isCategoryAccordionOpen}
              className="w-full min-h-[44px] flex items-center justify-between px-1 py-1 font-mono text-xs uppercase tracking-[0.1em] text-ink cursor-pointer"
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
                    if (onSelectCategory) {
                      onSelectCategory(null);
                    } else {
                      navigate('/shop');
                    }
                    setIsMenuOpen(false);
                  }}
                  className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition-all border cursor-pointer ${
                    !activeCategorySlug
                      ? 'bg-[var(--store-accent)] text-white border-[var(--store-accent)]'
                      : 'bg-bg text-ink border-border hover:bg-surface'
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
                        if (onSelectCategory) {
                          onSelectCategory(cat.slug);
                        } else {
                          navigate(`/category/${cat.slug}`);
                        }
                        setIsMenuOpen(false);
                      }}
                      className={`w-full min-h-[44px] flex items-center justify-between px-3 py-2.5 rounded-lg text-xs font-semibold text-left transition-all border cursor-pointer ${
                        isSelected
                          ? 'bg-[var(--store-accent)] text-white border-[var(--store-accent)]'
                          : 'bg-bg text-ink border-border hover:bg-surface'
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

          {/* Footer Options: Language Toggle, Support, Portals */}
          <div className="pt-4 border-t border-border space-y-2.5">
            <div className="flex items-center justify-between p-3 border border-border rounded-xl bg-surface">
              <span className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink">
                {locale === 'bn' ? 'ভাষা / Language' : 'Switch Language'}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleLocale}
                className="font-mono text-xs px-3 min-h-[44px]"
              >
                {dict.common.languageToggle}
              </Button>
            </div>

            {safeSupportPhoneHref && (
              <a
                href={`tel:${safeSupportPhoneHref}`}
                className="p-3 min-h-[44px] border border-border rounded-xl bg-surface flex items-center justify-between text-xs hover:border-[var(--store-accent)] transition-colors"
              >
                <span className="text-ink/80 font-medium flex items-center gap-2">
                  <PhoneCall className="w-3.5 h-3.5 text-[var(--store-accent)]" aria-hidden="true" />
                  <span>{locale === 'bn' ? 'হেল্পলাইন:' : 'Helpline:'}</span>
                </span>
                <span className="font-mono font-bold text-ink tabular-nums text-xs">
                  {siteSettings.supportPhone}
                </span>
              </a>
            )}

            {config.showWhatsApp && whatsappDigits && (
              <a
                href={`https://wa.me/${whatsappDigits}`}
                target="_blank"
                rel="noopener noreferrer"
                className="p-3 min-h-[44px] rounded-xl border border-success/30 bg-success/10 flex items-center justify-between text-xs font-semibold text-ink"
              >
                <span>{text('হোয়াটসঅ্যাপ সাপোর্ট', 'WhatsApp Support')}</span>
                <ArrowUpRight className="w-4 h-4 text-[var(--store-accent)]" aria-hidden="true" />
              </a>
            )}
          </div>
        </div>
      </ResponsiveSheet>
    </div>
  );
}
