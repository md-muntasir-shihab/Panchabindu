import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/account/page.tsx
// Server Component for Customer Wishlist & Order Tracking Lookup

import type { Metadata } from 'next';
import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { AccountClient } from '@/src/components/storefront/account-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'পছন্দের তালিকা ও অর্ডার ট্র্যাকিং | বঙ্গকনসাইন',
  description: 'আপনার সেভ করা পণ্য এবং অর্ডার ট্র্যাকিং।',
};

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
