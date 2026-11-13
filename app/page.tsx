import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/page.tsx
// Server Component Entry Point — Fetches Customer-Safe Storefront Data from Repository
// Zero hardcoded business values; all vendor/cost fields are stripped on the server.

import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { HomepageClient } from '@/src/components/storefront/homepage-client';

export const dynamic = 'force-dynamic';

export default async function StorefrontHomePage() {
  const { siteSettings, categories, products } = await withRuntimePersistence(() => getPublicStorefrontData());

  return (
    <HomepageClient
      siteSettings={siteSettings}
      categories={categories}
      products={products}
    />
  );
}
