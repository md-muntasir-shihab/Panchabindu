import { getStorefrontConfig } from '@/src/lib/storefront/storefront-config';
import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/manifest.ts
// PWA Web App Manifest driven by Site Settings (01_FRONTEND_MASTER_PROMPT Section 12)

import type { MetadataRoute } from 'next';
import { getPublicStorefrontData } from '@/src/lib/db/repository';

export const dynamic = 'force-dynamic';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const { siteSettings } = await withRuntimePersistence(() => getPublicStorefrontData());

  const config = getStorefrontConfig(siteSettings);
  return {
    name: `${siteSettings.brandNameBn} — ${siteSettings.brandNameEn}`,
    short_name: siteSettings.brandNameEn,
    description: siteSettings.taglineBn,
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: config.accentColor,
    icons: [
      {
        src: config.faviconUrl || '/favicon.ico',
        sizes: 'any',
      },
    ],
  };
}
