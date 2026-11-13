// app/product/[slug]/page.tsx
// Server Component for Product Detail Page (PDP)
// Enforces server-side field hiding & generates dynamic SEO metadata

import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPublicProductBySlug } from '@/src/lib/db/repository';
import { buildVerifiedProductJsonLd } from '@/src/lib/storefront/phase6-storefront-engine';
import { ProductDetailClient } from '@/src/components/storefront/product-detail-client';

export const dynamic = 'force-dynamic';

interface ProductPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({
  params,
}: ProductPageProps): Promise<Metadata> {
  const { slug } = await params;
  const { product, siteSettings } = getPublicProductBySlug(slug);

  if (!product) {
    return {
      title: `পণ্য পাওয়া যায়নি | ${siteSettings.brandNameBn}`,
    };
  }

  return {
    title: `${product.nameBn} | ${siteSettings.brandNameBn}`,
    description: product.descriptionBn,
    alternates: {
      canonical: `/product/${product.slug}`,
    },
    openGraph: {
      title: `${product.nameBn} | ${siteSettings.brandNameEn}`,
      description: product.descriptionBn,
      images: product.images[0] ? [product.images[0]] : [],
    },
  };
}

export default async function ProductDetailPage({ params }: ProductPageProps) {
  const { slug } = await params;
  const {
    siteSettings,
    categories,
    product,
    leadTimeDays,
    reviews,
    relatedProducts,
  } = getPublicProductBySlug(slug);

  if (!product) {
    notFound();
  }

  const category = categories.find((c) => c.id === product.categoryId);
  const productJsonLd = buildVerifiedProductJsonLd({
    product,
    categoryNameEn: category?.nameEn,
    brandNameEn: siteSettings.brandNameEn,
  });

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd).replace(/</g, '\\u003c') }}
      />
      <ProductDetailClient
        siteSettings={siteSettings}
        categories={categories}
        product={product}
        leadTimeDays={leadTimeDays}
        reviews={reviews}
        relatedProducts={relatedProducts}
      />
    </>
  );
}
