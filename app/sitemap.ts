// app/sitemap.ts
// Dynamic Storefront Sitemap Generator (Phase 6 — Master Prompt Section 9.6)

import type { MetadataRoute } from 'next';
import { buildStorefrontSitemapEntries } from '@/src/lib/storefront/phase6-storefront-engine';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://panchagarh.com';
  return buildStorefrontSitemapEntries(baseUrl);
}
