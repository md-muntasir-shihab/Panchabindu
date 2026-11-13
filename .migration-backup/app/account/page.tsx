import { getStoreMetadata } from '@/src/lib/storefront/store-metadata';
import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/account/page.tsx
// Server Component for Customer Wishlist & Order Tracking Lookup

import type { Metadata } from 'next';
import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { AccountClient } from '@/src/components/storefront/account-client';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> { return getStoreMetadata('অ্যাকাউন্ট ও অর্ডার', true); }

export default async function AccountPage() {
  const { siteSettings, categories, products } = await withRuntimePersistence(() => getPublicStorefrontData());

  return (
    <AccountClient
      siteSettings={siteSettings}
      categories={categories}
      products={products}
    />
  );
}
