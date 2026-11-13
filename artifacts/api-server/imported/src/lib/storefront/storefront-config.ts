import { z } from 'zod';

export const safeStoreUrl = (value: string) => {
  if (!value) return true;
  if (/[\s\\\u0000-\u001f]/.test(value)) return false;
  if (value.startsWith('#')) return true;
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; }
};
const text = z.string().trim().max(500);
const longText = z.string().trim().max(12000);
const url = z.string().trim().max(2048).refine(safeStoreUrl, 'Use a relative path or HTTPS URL');
const imageUrl = url.refine(v => !v || !v.startsWith('#'), 'Use an image URL');
const link = z.object({ id: text.min(1), labelBn: text.min(1), labelEn: text.min(1), href: url.min(1), enabled: z.boolean() });
const uniqueIds = <T extends { id: string }>(items: T[]) => new Set(items.map(v => v.id)).size === items.length;
export const storefrontConfigSchema = z.object({
  // D-08: quarantined by default; not a public storefront capability.
  flashCampaignsEnabled: z.boolean().optional(),
  logoUrl: imageUrl, faviconUrl: imageUrl, logoWidth: z.number().int().min(32).max(200),
  showBrandName: z.boolean(), showTagline: z.boolean(), showSupportPhone: z.boolean(), showWhatsApp: z.boolean(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).refine(hex => {
    const c = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return (1.05 / (.2126 * c[0] + .7152 * c[1] + .0722 * c[2] + .05)) >= 4.5;
  }, 'Choose a darker accent for readable white button text'),
  footerTextBn: longText, footerTextEn: longText, copyrightBn: text, copyrightEn: text,
  footerNoteBn: text, footerNoteEn: text, collectionTitleBn: text, collectionTitleEn: text,
  collectionSubtitleBn: text, collectionSubtitleEn: text,
  seoTitleBn: text, seoTitleEn: text, seoDescriptionBn: text, seoDescriptionEn: text,
  socialImageUrl: imageUrl,
  navigation: z.array(link).max(8).refine(uniqueIds, 'Link IDs must be unique'),
  footerLinks: z.array(link).max(12).refine(uniqueIds, 'Link IDs must be unique'),
  socialLinks: z.array(link).max(8).refine(uniqueIds, 'Link IDs must be unique'),
});
export type StorefrontConfig = z.infer<typeof storefrontConfigSchema>;

export function getStorefrontConfig(settings: { storefront?: StorefrontConfig; taglineBn?: string; taglineEn?: string }): StorefrontConfig {
  const config = {
    flashCampaignsEnabled: false,
    logoUrl: '', faviconUrl: '', logoWidth: 44, showBrandName: true, showTagline: false,
    showSupportPhone: true, showWhatsApp: true, accentColor: '#1B4332',
    footerTextBn: settings.taglineBn ?? '', footerTextEn: settings.taglineEn ?? '',
    copyrightBn: '© {year} {brand}। সর্বস্বত্ব সংরক্ষিত।', copyrightEn: '© {year} {brand}. All rights reserved.',
    footerNoteBn: '', footerNoteEn: '', collectionTitleBn: 'নির্বাচিত পণ্যসম্ভার', collectionTitleEn: 'Considered essentials. Everyday favourites.',
    collectionSubtitleBn: 'আপনার পছন্দের পণ্য খুঁজে নিন।', collectionSubtitleEn: 'Discover something worth bringing home.',
    seoTitleBn: '', seoTitleEn: '', seoDescriptionBn: settings.taglineBn ?? '', seoDescriptionEn: settings.taglineEn ?? '', socialImageUrl: '',
    navigation: [
      { id: 'home', labelBn: 'হোম', labelEn: 'Home', href: '/', enabled: true },
      { id: 'shop', labelBn: 'কেনাকাটা', labelEn: 'Shop', href: '/shop', enabled: true },
      { id: 'categories', labelBn: 'ক্যাটাগরি', labelEn: 'Categories', href: '/categories', enabled: true },
      { id: 'contact', labelBn: 'আমাদের পরিচিতি', labelEn: 'Our story', href: '/contact', enabled: true },
    ],
    footerLinks: [
      { id: 'shop', labelBn: 'সব পণ্য', labelEn: 'Shop all', href: '/shop', enabled: true },
      { id: 'account', labelBn: 'অ্যাকাউন্ট ও অর্ডার', labelEn: 'Account & orders', href: '/account', enabled: true },
      { id: 'contact', labelBn: 'যোগাযোগ', labelEn: 'Contact', href: '/contact', enabled: true },
    ], socialLinks: [], ...settings.storefront,
  };
  return storefrontConfigSchema.parse(config);
}

export const storefrontContentSchema = z.object({
  brandNameBn: text.min(1).max(100), brandNameEn: text.min(1).max(100), taglineBn: text, taglineEn: text,
  supportPhone: z.string().trim().max(30).regex(/^[+\d ()-]*$/), supportEmail: z.union([z.literal(''), z.email()]),
  whatsappNumber: z.string().trim().regex(/^\d{0,15}$/),
  maintenanceMessageBn: text, maintenanceMessageEn: text,
  delayBanner: z.object({ enabled: z.boolean(), messageBn: text, messageEn: text }),
  promoCampaign: z.object({ enabled: z.boolean(), titleBn: text, titleEn: text, code: text, discountLabelBn: text, discountLabelEn: text }),
  trustBadges: z.array(z.object({ id: text.min(1), labelBn: text, labelEn: text, descBn: text, descEn: text })).max(8).refine(uniqueIds),
  heroBanners: z.array(z.object({ id: text.min(1), titleBn: text, titleEn: text, subtitleBn: text, subtitleEn: text,
    ctaLabelBn: text, ctaLabelEn: text, ctaHref: url, badgeBn: text, badgeEn: text, imageUrl })).max(8).refine(uniqueIds),
  homepageSections: z.array(z.object({ id: text.min(1), type: z.enum(['hero', 'trust_strip', 'categories', 'featured_products', 'promo_banner', 'new_arrivals', 'best_sellers']),
    enabled: z.boolean(), order: z.number().int().min(0).max(100), titleBn: text, titleEn: text })).max(7)
    .refine(items => uniqueIds(items) && new Set(items.map(v => v.type)).size === items.length, 'Sections must be unique'),
  legalPages: z.record(z.string().regex(/^[a-z0-9_-]{1,50}$/), z.object({ titleBn: text, titleEn: text, contentBn: longText, contentEn: longText }))
    .refine(pages => Object.keys(pages).length <= 12),
  storefront: storefrontConfigSchema,
});
export type StorefrontContent = z.infer<typeof storefrontContentSchema>;
