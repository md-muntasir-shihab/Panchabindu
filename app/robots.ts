// app/robots.ts
// Storefront Robots Policy (Phase 6 — Master Prompt Section 9.6)
// Allows indexing of public storefront & catalog pages; blocks /admin, /api, and private order tokens.

import type { MetadataRoute } from 'next';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() || 'https://panchagarh.com'
  ).replace(/\/$/, '');

  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/shop', '/search', '/categories', '/category/', '/product/', '/contact', '/legal/'],
        disallow: ['/admin', '/api/', '/account', '/checkout', '/order-tracking/'],
      },
    ],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
