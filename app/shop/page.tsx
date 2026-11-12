// app/shop/page.tsx
// Dedicated All Products Catalog Page (/shop) — Phase 6 (Master Prompt Section 9.3)

import type { Metadata } from 'next';
import { getPublicStorefrontCatalog } from '@/src/lib/db/repository';
import { ShopCatalogClient } from '@/src/components/storefront/shop-catalog-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'সকল পণ্য (All Products) | পঞ্চগড় — কনসাইনমেন্ট মার্কেটপ্লেস',
  description:
    'পঞ্চগড় কনসাইনমেন্ট মার্কেটপ্লেসের সকল কিউসি-যাচাইকৃত জামদানি, নকশিকাঁথা, খাঁটি মধু, চামড়াজাত পণ্য এবং কারুশিল্প দেখুন।',
  alternates: {
    canonical: '/shop',
  },
};

interface ShopPageProps {
  searchParams: Promise<{ q?: string; category?: string }>;
}

export default async function ShopPage({ searchParams }: ShopPageProps) {
  const params = await searchParams;
  const { siteSettings, categories, products } = getPublicStorefrontCatalog();

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
