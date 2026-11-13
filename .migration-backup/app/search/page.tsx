import { getStoreMetadata } from '@/src/lib/storefront/store-metadata';
import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/search/page.tsx
// Dedicated Search Results Page (/search) — Phase 6 (Master Prompt Section 9.3)

import type { Metadata } from 'next';
import { getPublicStorefrontCatalog } from '@/src/lib/db/repository';
import { ShopCatalogClient } from '@/src/components/storefront/shop-catalog-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> { return getStoreMetadata('পণ্য অনুসন্ধান', true); }

interface SearchPageProps {
  searchParams: Promise<{ q?: string; category?: string }>;
}

export default async function SearchPage({ searchParams }: SearchPageProps) {
  const params = await searchParams;
  const { siteSettings, categories, products } = await withRuntimePersistence(() => getPublicStorefrontCatalog());

  return (
    <ShopCatalogClient
      siteSettings={siteSettings}
      categories={categories}
      products={products}
      mode="search"
      initialQuery={params.q ?? ''}
      initialCategorySlug={params.category ?? null}
    />
  );
}
