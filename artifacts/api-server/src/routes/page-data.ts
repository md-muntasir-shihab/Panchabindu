import { ApiRequest, ApiResponse } from '../../imported/src/lib/http';
import { backendRoute } from '../../imported/src/lib/db/backend-route';
import {
  getPublicStorefrontData, getPublicProductBySlug, getAuthenticatedCustomerOrders,
  getPublicOrderTrackingByToken,
  getPublicCheckoutData,
} from '../../imported/src/lib/db/repository';
import { z } from 'zod';
import { getStoreMetadata } from '../../imported/src/lib/storefront/store-metadata';
import { buildVerifiedProductJsonLd, buildStorefrontSitemapEntries } from '../../imported/src/lib/storefront/phase6-storefront-engine';
import { getStorefrontConfig } from '../../imported/src/lib/storefront/storefront-config';
import { CUSTOMER_SESSION_COOKIE_NAME, verifyCustomerSessionToken } from '../../imported/src/lib/security/crypto-session';

// The existing page-data `q` parameter carries page-specific checkout quote input.
const checkoutQuerySchema = z.object({
  districtId: z.number().int().positive(),
  items: z.array(z.object({
    productId: z.union([z.string().uuid(), z.string().regex(/^prod-\d{13}-\d{3}$/)]), variantId: z.union([z.string().uuid(), z.string().regex(/^var-\d{13}-\d{3}$/)]),
    quantity: z.number().int().min(1).max(100),
  })).min(1).max(100),
  promoCode: z.string().trim().max(64).optional(),
});

/** Replaces server-rendered page loaders without sending private repository state to the browser. */
export const pageData = backendRoute(async (request: ApiRequest) => {
  const url = new URL(request.url);
  const pathname = (url.searchParams.get('path') || '/').replace(/\/$/, '') || '/';
  const parts = pathname.split('/').filter(Boolean).map(decodeURIComponent);
  const { siteSettings, categories, products } = getPublicStorefrontData();
  const common = { siteSettings, categories };
  let page = parts[0] || 'home';
  let props: Record<string, unknown> = { ...common, products };
  let jsonLd: unknown;
  const titles: Record<string, string> = {
    account: 'অ্যাকাউন্ট ও অর্ডার', categories: 'ক্যাটাগরি', checkout: 'চেকআউট',
    contact: 'যোগাযোগ', search: 'পণ্য অনুসন্ধান', shop: 'সকল পণ্য',
    tracking: 'অর্ডার ট্র্যাকিং',
  };
  if (['product', 'category', 'legal', 'order-tracking'].includes(page) && parts.length !== 2) page = 'not-found';
  else if (parts.length > 1 && !['product', 'category', 'legal', 'order-tracking'].includes(page)) page = 'not-found';
  switch (page) {
    case 'home': case 'account': case 'categories': break;
    case 'checkout': {
      let input: z.infer<typeof checkoutQuerySchema> | undefined;
      const query = url.searchParams.get('q');
      if (query !== null) {
        try {
          if (query.length > 30000) throw new Error('Query too long');
          input = checkoutQuerySchema.parse(JSON.parse(query));
        } catch {
          return ApiResponse.json({ success: false, errorBn: 'চেকআউটের তথ্য সঠিক নয়।' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
        }
      }
      try {
        props = { ...common, checkout: getPublicCheckoutData(input) };
      } catch {
        return ApiResponse.json({ success: false, errorBn: 'কার্টের পণ্য, স্টক বা জেলা যাচাই করা যায়নি। কার্ট ও ঠিকানা দেখে আবার চেষ্টা করুন।' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
      }
      break;
    }
    case 'contact': case 'admin': props = common; break;
    case 'vendor': props = {}; break;
    case 'shop': case 'search':
      props = { ...props, mode: page, initialQuery: url.searchParams.get('q') || '', initialCategorySlug: url.searchParams.get('category') || null };
      break;
    case 'category': {
      const currentCategory = categories.find(c => c.slug === parts[1]);
      if (!currentCategory) { page = 'not-found'; props = {}; break; }
      props = { ...props, currentCategory };
      break;
    }
    case 'legal': {
      const legalPage = siteSettings.legalPages[parts[1]];
      if (!legalPage) { page = 'not-found'; props = {}; break; }
      props = { ...common, page: legalPage };
      break;
    }
    case 'product': {
      const detail = getPublicProductBySlug(parts[1]);
      if (!detail.product) { page = 'not-found'; props = {}; break; }
      props = { ...common, ...detail };
      const category = categories.find(c => c.id === detail.product!.categoryId);
      jsonLd = buildVerifiedProductJsonLd({ product: detail.product, categoryNameEn: category?.nameEn, brandNameEn: siteSettings.brandNameEn });
      break;
    }
    case 'order-tracking': {
      page = 'tracking';
      const reference = parts[1].trim();
      const result = getPublicOrderTrackingByToken(reference);
      let order = result.allowed ? result.order : null;
      let trackingErrorBn = result.errorBn || null;
      if (result.code === 'SEQUENTIAL_ORDER_NO_FORBIDDEN') {
        const token = request.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
        if (verifyCustomerSessionToken(token)) {
          order = getAuthenticatedCustomerOrders(token).find(o => o.orderNo.toUpperCase() === reference.toUpperCase()) || null;
        }
      }
      if (order) trackingErrorBn = null;
      props = { ...common, initialOrderNo: reference, order, trackingErrorBn };
      break;
    }
    default: page = 'not-found'; props = {};
  }
  const metadata = await getStoreMetadata(titles[page], ['admin', 'vendor', 'account', 'checkout', 'tracking', 'search'].includes(page));
  if (page === 'product') {
    const product = props.product as NonNullable<ReturnType<typeof getPublicProductBySlug>['product']>;
    Object.assign(metadata, {
      title: `${product.nameBn} | ${siteSettings.brandNameBn}`,
      description: product.descriptionBn,
      alternates: { canonical: `/product/${product.slug}` },
      openGraph: { title: `${product.nameBn} | ${siteSettings.brandNameEn}`, description: product.descriptionBn, images: product.images[0] ? [product.images[0]] : [] },
    });
  }
  return ApiResponse.json({ success: true, data: { page, props, metadata, jsonLd } }, { status: page === 'not-found' ? 404 : 200 });
});

export const manifest = backendRoute(async () => {
  const { siteSettings } = getPublicStorefrontData();
  const config = getStorefrontConfig(siteSettings);
  return ApiResponse.json({
    name: `${siteSettings.brandNameBn} — ${siteSettings.brandNameEn}`,
    short_name: siteSettings.brandNameEn, description: siteSettings.taglineBn,
    start_url: '/', display: 'standalone', background_color: '#FFFFFF',
    theme_color: config.accentColor,
    icons: [{ src: config.faviconUrl || '/favicon.ico', sizes: 'any' }],
  }, { headers: { 'content-type': 'application/manifest+json' } });
});

export const sitemap = backendRoute(async (request: ApiRequest) => {
  const base = process.env.APP_URL?.trim() || new URL(request.url).origin;
  const escape = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  const entries = buildStorefrontSitemapEntries(base);
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${entries.map(e => `<url><loc>${escape(e.url)}</loc></url>`).join('')}</urlset>`, { headers: { 'content-type': 'application/xml; charset=utf-8' } });
});

export async function robots(request: ApiRequest) {
  const base = process.env.APP_URL?.trim() || new URL(request.url).origin;
  return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /vendor\nDisallow: /api/\nDisallow: /account\nDisallow: /checkout\nDisallow: /order-tracking/\nSitemap: ${base}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain; charset=utf-8' } });
}
