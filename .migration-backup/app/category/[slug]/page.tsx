import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/category/[slug]/page.tsx
// Dedicated Category Page with Server-Side Sanitized Product Filtering

import { notFound } from 'next/navigation';
import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { CategoryDetailClient } from '@/src/components/storefront/category-detail-client';

export const dynamic = 'force-dynamic';

interface CategoryPageProps {
  params: Promise<{ slug: string }>;
}

export default async function CategoryPage({ params }: CategoryPageProps) {
  const { slug } = await params;
  const { siteSettings, categories, products } = await withRuntimePersistence(() => getPublicStorefrontData());

  const category = categories.find((c) => c.slug === slug);
  if (!category) {
    notFound();
  }

  return (
    <CategoryDetailClient
      siteSettings={siteSettings}
      categories={categories}
      products={products}
      currentCategory={category}
    />
  );
}

