// src/lib/storefront/phase6-catalog-facets.ts
// Client-Safe Pure Storefront Facet Extraction, Multi-Facet Filtering, Sorting,
// Verified Page/Cursor Pagination & Search Suggestion Engine (Master Prompt Section 9.3)
// Contains ZERO Node.js fs/crypto imports so it can be safely bundled in Client Components.

import type { CategoryRecord } from '../db/repository';
import type { Poisha, StorefrontProductDTO } from '../../types/domain';

export type StorefrontSortOption =
  | 'popular'
  | 'newest'
  | 'price_asc'
  | 'price_desc'
  | 'rating';

export type CatalogSortOption = StorefrontSortOption;

export interface CatalogFilterInput {
  searchQuery?: string;
  categorySlug?: string | null;
  minPricePoisha?: Poisha;
  maxPricePoisha?: Poisha;
  sizes?: string[];
  colors?: string[];
  inStockOnly?: boolean;
  freeDeliveryOnly?: boolean;
  sortBy?: StorefrontSortOption;
  page?: number;
  pageSize?: number;
  cursorProductId?: string;
}

export interface CatalogFacetsSummary {
  minPricePoisha: Poisha;
  maxPricePoisha: Poisha;
  availableSizes: string[];
  availableColors: string[];
  availableMaterials: string[];
  inStockProductsCount: number;
  freeDeliveryProductsCount: number;
  totalActiveProducts: number;
  /**
   * Honest Data Model Gap Declaration (Master Prompt Section 9.3):
   * Product schema does not have a dedicated `brand` column; Consignment Vendors are regional artisans/suppliers.
   * Per instructions: "যে Filter-এর জন্য Data নেই, Fake Filter তৈরি করবে না; Data Model Gap দেখাবে।"
   */
  brandFilterStatus: 'DATA_MODEL_GAP_NO_BRAND_COLUMN';
  brandFilterGapNoteBn: string;
}

export interface PaginatedCatalogResult {
  items: StorefrontProductDTO[];
  totalMatched: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
  nextCursorProductId: string | null;
  appliedFiltersCount: number;
  facets: CatalogFacetsSummary;
  zeroResultRecommendations: StorefrontProductDTO[];
}

export interface SearchSuggestionResult {
  query: string;
  matchedCategories: Array<{
    slug: string;
    nameBn: string;
    nameEn: string;
  }>;
  matchedProducts: Array<{
    productId: string;
    slug: string;
    nameBn: string;
    nameEn: string;
    thumbnailUrl: string;
    minSalePricePoisha: Poisha;
    inStock: boolean;
  }>;
  popularKeywordsBn: string[];
  suggestedKeywords: Array<{ labelBn: string; labelEn: string }>;
  fallbackRecommendations: StorefrontProductDTO[];
}

function getProductMinPrice(p: StorefrontProductDTO): Poisha {
  if (p.variants.length === 0) return 0;
  return Math.min(...p.variants.map((v) => v.salePricePoisha));
}

function isProductInStock(p: StorefrontProductDTO): boolean {
  return p.variants.some((v) => v.stockAvailable > 0);
}

function extractVariantSizes(p: StorefrontProductDTO): string[] {
  const sizes = new Set<string>();
  for (const v of p.variants) {
    for (const [k, val] of Object.entries(v.attributes ?? {})) {
      const keyLower = k.trim().toLowerCase();
      if (
        keyLower === 'size' ||
        keyLower === 'weight' ||
        keyLower === ' সাইজ' ||
        keyLower === 'ওজন' ||
        keyLower === 'পরিমাণ' ||
        keyLower === 'length'
      ) {
        if (val && val.trim()) sizes.add(val.trim());
      }
    }
  }
  return Array.from(sizes);
}

function extractVariantColors(p: StorefrontProductDTO): string[] {
  const colors = new Set<string>();
  for (const v of p.variants) {
    for (const [k, val] of Object.entries(v.attributes ?? {})) {
      const keyLower = k.trim().toLowerCase();
      if (keyLower === 'color' || keyLower === 'রঙ' || keyLower === 'কালার') {
        if (val && val.trim()) colors.add(val.trim());
      }
    }
  }
  return Array.from(colors);
}

/**
 * Extracts real catalog facets strictly from existing product variants & attributes.
 * Never fabricates a Brand filter when no `brand` column exists in the schema.
 */
export function extractCatalogFacets(
  products: StorefrontProductDTO[]
): CatalogFacetsSummary {
  const prices = products
    .map((p) => getProductMinPrice(p))
    .filter((pr) => pr > 0);
  const minPricePoisha = prices.length > 0 ? Math.min(...prices) : 0;
  const maxPricePoisha = prices.length > 0 ? Math.max(...prices) : 0;

  const sizeSet = new Set<string>();
  const colorSet = new Set<string>();
  const materialSet = new Set<string>();
  let inStockProductsCount = 0;
  let freeDeliveryProductsCount = 0;

  for (const p of products) {
    if (isProductInStock(p)) {
      inStockProductsCount += 1;
    }
    if (p.isFreeDelivery) {
      freeDeliveryProductsCount += 1;
    }
    for (const sz of extractVariantSizes(p)) {
      sizeSet.add(sz);
    }
    for (const cl of extractVariantColors(p)) {
      colorSet.add(cl);
    }
    for (const v of p.variants) {
      const mat = v.attributes?.material ?? v.attributes?.['উপাদান'];
      if (mat && mat.trim()) {
        materialSet.add(mat.trim());
      }
    }
  }

  return {
    minPricePoisha,
    maxPricePoisha,
    availableSizes: Array.from(sizeSet),
    availableColors: Array.from(colorSet),
    availableMaterials: Array.from(materialSet),
    inStockProductsCount,
    freeDeliveryProductsCount,
    totalActiveProducts: products.length,
    brandFilterStatus: 'DATA_MODEL_GAP_NO_BRAND_COLUMN',
    brandFilterGapNoteBn:
      'Data Model Gap: প্রোডাক্ট টেবিলে স্বতন্ত্র brand কলাম নেই (কনসাইনমেন্ট কারিগর/সাপ্লায়ার মডেল ব্যবহৃত)। তাই কোনো কৃত্রিম (Fake) Brand Filter দেখানো হয়নি।',
  };
}

/**
 * Queries, filters, sorts, and paginates the Storefront Catalog with verified Page & Cursor pagination.
 */
export function queryStorefrontCatalog(
  allProducts: StorefrontProductDTO[],
  allCategories: CategoryRecord[],
  filter: CatalogFilterInput
): PaginatedCatalogResult {
  const facets = extractCatalogFacets(allProducts);
  let appliedFiltersCount = 0;

  const cleanQuery = (filter.searchQuery ?? '').trim().toLowerCase();
  if (cleanQuery) appliedFiltersCount += 1;

  let targetCategoryId: string | null = null;
  if (filter.categorySlug && filter.categorySlug !== 'all') {
    const matchedCat = allCategories.find(
      (c) => c.slug === filter.categorySlug
    );
    if (matchedCat) {
      targetCategoryId = matchedCat.id;
      appliedFiltersCount += 1;
    }
  }

  if (
    typeof filter.minPricePoisha === 'number' &&
    filter.minPricePoisha > facets.minPricePoisha
  ) {
    appliedFiltersCount += 1;
  }
  if (
    typeof filter.maxPricePoisha === 'number' &&
    filter.maxPricePoisha < facets.maxPricePoisha
  ) {
    appliedFiltersCount += 1;
  }

  const wantedSizes = (filter.sizes ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  if (wantedSizes.length > 0) appliedFiltersCount += 1;

  const wantedColors = (filter.colors ?? [])
    .map((c) => c.trim())
    .filter(Boolean);
  if (wantedColors.length > 0) appliedFiltersCount += 1;

  if (filter.inStockOnly) appliedFiltersCount += 1;
  if (filter.freeDeliveryOnly) appliedFiltersCount += 1;

  const matched = allProducts.filter((p) => {
    if (targetCategoryId && p.categoryId !== targetCategoryId) {
      return false;
    }

    if (cleanQuery) {
      const hay = [
        p.nameBn,
        p.nameEn,
        p.descriptionBn,
        p.descriptionEn,
        ...(p.specs ?? []).map(
          (s) => `${s.labelBn} ${s.labelEn} ${s.valueBn} ${s.valueEn}`
        ),
        ...p.variants.map((v) => `${v.titleBn} ${v.titleEn} ${v.publicSku}`),
      ]
        .join(' ')
        .toLowerCase();
      if (!hay.includes(cleanQuery)) {
        return false;
      }
    }

    const minPrice = getProductMinPrice(p);
    if (
      typeof filter.minPricePoisha === 'number' &&
      minPrice < filter.minPricePoisha
    ) {
      return false;
    }
    if (
      typeof filter.maxPricePoisha === 'number' &&
      filter.maxPricePoisha > 0 &&
      minPrice > filter.maxPricePoisha
    ) {
      return false;
    }

    if (wantedSizes.length > 0) {
      const pSizes = extractVariantSizes(p);
      if (!wantedSizes.some((ws) => pSizes.includes(ws))) {
        return false;
      }
    }

    if (wantedColors.length > 0) {
      const pColors = extractVariantColors(p);
      if (!wantedColors.some((wc) => pColors.includes(wc))) {
        return false;
      }
    }

    if (filter.inStockOnly && !isProductInStock(p)) {
      return false;
    }

    if (filter.freeDeliveryOnly && !p.isFreeDelivery) {
      return false;
    }

    return true;
  });

  const sortBy: StorefrontSortOption = filter.sortBy ?? 'popular';
  const sorted = [...matched].sort((a, b) => {
    if (sortBy === 'price_asc') {
      return getProductMinPrice(a) - getProductMinPrice(b);
    }
    if (sortBy === 'price_desc') {
      return getProductMinPrice(b) - getProductMinPrice(a);
    }
    if (sortBy === 'rating') {
      if (b.ratingAvgBp !== a.ratingAvgBp) return b.ratingAvgBp - a.ratingAvgBp;
      return b.reviewCount - a.reviewCount;
    }
    if (sortBy === 'newest') {
      return b.productId.localeCompare(a.productId);
    }
    // default: popular (featured + totalSoldCount + reviewCount)
    const scoreA =
      (a.isFeatured ? 50 : 0) + a.totalSoldCount + a.reviewCount;
    const scoreB =
      (b.isFeatured ? 50 : 0) + b.totalSoldCount + b.reviewCount;
    return scoreB - scoreA;
  });

  const pageSize = Math.max(1, Math.min(48, filter.pageSize ?? 8));
  const totalMatched = sorted.length;
  const totalPages = Math.max(1, Math.ceil(totalMatched / pageSize));

  let startIndex = 0;
  let currentPage = Math.max(1, Math.min(totalPages, filter.page ?? 1));

  if (filter.cursorProductId) {
    const cursorIdx = sorted.findIndex(
      (p) => p.productId === filter.cursorProductId
    );
    if (cursorIdx >= 0 && cursorIdx + 1 < sorted.length) {
      startIndex = cursorIdx + 1;
      currentPage = Math.floor(startIndex / pageSize) + 1;
    }
  } else {
    startIndex = (currentPage - 1) * pageSize;
  }

  const pageItems = sorted.slice(startIndex, startIndex + pageSize);
  const hasNextPage = startIndex + pageSize < totalMatched;
  const hasPrevPage = startIndex > 0;
  const nextCursorProductId =
    hasNextPage && pageItems.length > 0
      ? pageItems[pageItems.length - 1]!.productId
      : null;

  const zeroResultRecommendations =
    totalMatched === 0
      ? allProducts.filter((p) => isProductInStock(p)).slice(0, 4)
      : [];

  return {
    items: pageItems,
    totalMatched,
    page: currentPage,
    pageSize,
    totalPages,
    hasNextPage,
    hasPrevPage,
    nextCursorProductId,
    appliedFiltersCount,
    facets,
    zeroResultRecommendations,
  };
}

/**
 * Generates real-time search suggestions and fallback recommendations for the Storefront Search bar & /search page.
 */
export function getSearchSuggestions(
  products: StorefrontProductDTO[],
  categories: CategoryRecord[],
  rawQuery: string
): SearchSuggestionResult {
  const clean = rawQuery.trim().toLowerCase();
  const popularKeywordsBn = ['জামদানি শাড়ি', 'সুন্দরবনের মধু', 'নকশিকাঁথা', 'হাঁড়িভাঙ্গা আম'];
  const suggestedKeywords = [
    { labelBn: 'জামদানি শাড়ি', labelEn: 'Jamdani Saree' },
    { labelBn: 'খলিশা ফুলের মধু', labelEn: 'Khalisha Honey' },
    { labelBn: 'নকশিকাঁথা', labelEn: 'Nakshi Kantha' },
    { labelBn: 'রাজশাহীর সিল্ক', labelEn: 'Rajshahi Silk' },
  ];

  const matchedCategories = clean
    ? categories
        .filter(
          (c) =>
            c.isActive &&
            (c.nameBn.toLowerCase().includes(clean) ||
              c.nameEn.toLowerCase().includes(clean) ||
              c.descriptionBn.toLowerCase().includes(clean))
        )
        .slice(0, 4)
        .map((c) => ({
          slug: c.slug,
          nameBn: c.nameBn,
          nameEn: c.nameEn,
        }))
    : [];

  const matchedProducts = clean
    ? products
        .filter((p) => {
          const hay = `${p.nameBn} ${p.nameEn} ${p.descriptionBn} ${p.variants
            .map((v) => v.publicSku)
            .join(' ')}`.toLowerCase();
          return hay.includes(clean);
        })
        .slice(0, 6)
        .map((p) => ({
          productId: p.productId,
          slug: p.slug,
          nameBn: p.nameBn,
          nameEn: p.nameEn,
          thumbnailUrl: p.images[0] ?? '',
          minSalePricePoisha: getProductMinPrice(p),
          inStock: isProductInStock(p),
        }))
    : [];

  const fallbackRecommendations = products
    .filter((p) => isProductInStock(p))
    .slice(0, 4);

  return {
    query: rawQuery.trim(),
    matchedCategories,
    matchedProducts,
    popularKeywordsBn,
    suggestedKeywords,
    fallbackRecommendations,
  };
}
