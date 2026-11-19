type Metadata = Record<string, unknown>;
import { getPublicStorefrontData } from '../db/repository';
import { withRuntimePersistence } from '../db/runtime-persistence';
import { getStorefrontConfig } from './storefront-config';

export async function getStoreMetadata(pageTitle?: string, privatePage = false): Promise<Metadata> {
  const { siteSettings } = await withRuntimePersistence(() => getPublicStorefrontData());
  const config = getStorefrontConfig(siteSettings);
  const title = pageTitle ? `${pageTitle} | ${siteSettings.brandNameBn}` : config.seoTitleBn || `${siteSettings.brandNameBn} — ${siteSettings.brandNameEn}`;
  const description = config.seoDescriptionBn || siteSettings.taglineBn;
  return {
    title, description,
    icons: config.faviconUrl
      ? { icon: config.faviconUrl, shortcut: config.faviconUrl, apple: config.faviconUrl }
      : {
          icon: [
            { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
            { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
            { url: '/favicon-192x192.png', sizes: '192x192', type: 'image/png' },
            { url: '/favicon.svg', type: 'image/svg+xml' },
          ],
          shortcut: '/favicon.ico',
          apple: [{ url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' }],
        },
    openGraph: { title, description, type: 'website', images: config.socialImageUrl ? [config.socialImageUrl] : [] },
    twitter: { card: config.socialImageUrl ? 'summary_large_image' : 'summary', title, description, images: config.socialImageUrl ? [config.socialImageUrl] : [] },
    ...(privatePage ? { robots: { index: false, follow: false } } : {}),
  };
}
