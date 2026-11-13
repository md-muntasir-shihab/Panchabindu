import type { Metadata } from 'next';
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
    icons: { icon: config.faviconUrl || '/favicon.ico', apple: config.faviconUrl || '/favicon.ico' },
    openGraph: { title, description, type: 'website', images: config.socialImageUrl ? [config.socialImageUrl] : [] },
    twitter: { card: config.socialImageUrl ? 'summary_large_image' : 'summary', title, description, images: config.socialImageUrl ? [config.socialImageUrl] : [] },
    ...(privatePage ? { robots: { index: false, follow: false } } : {}),
  };
}
