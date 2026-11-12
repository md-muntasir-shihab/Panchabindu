// app/manifest.ts
// PWA Web App Manifest driven by Site Settings (01_FRONTEND_MASTER_PROMPT Section 12)

import type { MetadataRoute } from 'next';
import { getPublicStorefrontData } from '@/src/lib/db/repository';

export default function manifest(): MetadataRoute.Manifest {
  const { siteSettings } = getPublicStorefrontData();

  return {
    name: `${siteSettings.brandNameBn} — ${siteSettings.brandNameEn}`,
    short_name: siteSettings.brandNameEn,
    description: siteSettings.taglineBn,
    start_url: '/',
    display: 'standalone',
    background_color: '#FFFFFF',
    theme_color: '#09090B',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
    ],
  };
}
