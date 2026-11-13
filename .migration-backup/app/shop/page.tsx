import { getStoreMetadata } from '@/src/lib/storefront/store-metadata';
import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/shop/page.tsx
// Dedicated All Products Catalog Page (/shop) — Phase 6 (Master Prompt Section 9.3)

import type { Metadata } from 'next';
import { getPublicStorefrontCatalog } from '@/src/lib/db/repository';
import { ShopCatalogClient } from '@/src/components/storefront/shop-catalog-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> { return getStoreMetadata('সকল পণ্য', false); }

interface ShopPageProps {
  searchParams: Promise<{ q?: string; category?: string }>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const { siteSettings, categories, products } = await withRuntimePersistence(() => getPublicStorefrontCatalog());

  return (
    <ShopCatalogClient
      siteSettings={siteSettings}
      categories={categories}
      products={products}
      mode="shop"
      initialQuery={params.q ?? ''}
      initialCategorySlug={params.category ?? null}
    />
  );
}
