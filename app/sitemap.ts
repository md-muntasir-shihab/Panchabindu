// app/sitemap.ts
// Dynamic Storefront Sitemap Generator (Phase 6 — Master Prompt Section 9.6)

import type { MetadataRoute } from 'next';
import { buildStorefrontSitemapEntries } from '@/src/lib/storefront/phase6-storefront-engine';
import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';

export const dynamic = 'force-dynamic';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://panchagarh.com';
  return withRuntimePersistence(() => buildStorefrontSitemapEntries(baseUrl));
}
