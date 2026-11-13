import { getStoreMetadata } from '@/src/lib/storefront/store-metadata';
import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/checkout/page.tsx
// Server Component for Single-Page Accordion Checkout

import type { Metadata } from 'next';
import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { CheckoutClient } from '@/src/components/storefront/checkout-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> { return getStoreMetadata('চেকআউট', true); }

export default async function CheckoutPage() {
  const { siteSettings, categories } = await withRuntimePersistence(() => getPublicStorefrontData());

  return (
    <CheckoutClient siteSettings={siteSettings} categories={categories} />
  );
}
