import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/checkout/page.tsx
// Server Component for Single-Page Accordion Checkout

import type { Metadata } from 'next';
import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { CheckoutClient } from '@/src/components/storefront/checkout-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: 'চেকআউট | বঙ্গকনসাইন (BongoConsign)',
  description: 'ক্যাশ অন ডেলিভারি এবং বিকাশ পেমেন্টের মাধ্যমে সহজেই অর্ডার সম্পন্ন করুন।',
};

export default async function CheckoutPage() {
  const { siteSettings, categories } = await withRuntimePersistence(() => getPublicStorefrontData());

  return (
    <CheckoutClient siteSettings={siteSettings} categories={categories} />
  );
}
