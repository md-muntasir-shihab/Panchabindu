import { Router, type RequestHandler } from 'express';
import { Readable } from 'node:stream';
import { ApiRequest } from '../../imported/src/lib/http';
import * as account from '../../imported/app/api/account/orders/route';
import * as adminAuth from '../../imported/app/api/admin/auth/route';
import * as brandMedia from '../../imported/app/api/admin/brand-media/route';
import * as workspace from '../../imported/app/api/admin/workspace/route';
import * as abandoned from '../../imported/app/api/cart/abandoned/route';
import * as catalogImport from '../../imported/app/api/catalog/import/route';
import * as mediaAsset from '../../imported/app/api/media/[assetId]/route';
import * as media from '../../imported/app/api/media/route';
import * as cancellation from '../../imported/app/api/orders/cancellation-request/route';
import * as returns from '../../imported/app/api/orders/return-request/route';
import * as orders from '../../imported/app/api/orders/route';
import * as tracking from '../../imported/app/api/orders/track/[secureToken]/route';
import * as payments from '../../imported/app/api/payments/manual-bkash/submissions/route';
import * as print from '../../imported/app/api/print/[orderNo]/route';
import * as promo from '../../imported/app/api/promo/validate/route';
import * as reviews from '../../imported/app/api/reviews/route';
import * as inquiry from '../../imported/app/api/storefront/inquiry/route';
import * as storefront from '../../imported/app/api/storefront/route';
import * as vendor from '../../imported/app/api/vendor/overview/route';
import * as vendorWorkspace from '../../imported/app/api/vendor/workspace/route';
import * as vendorProducts from '../../imported/app/api/vendor/products/route';
import * as vendorStock from '../../imported/app/api/vendor/stock/route';
import * as vendorPriceProposals from '../../imported/app/api/vendor/price-proposals/route';
import * as vendorPayouts from '../../imported/app/api/vendor/payouts/route';
import * as vendorProfile from '../../imported/app/api/vendor/profile/route';
import * as vendorOnboarding from '../../imported/app/api/vendor/onboarding/route';
import * as adminVendors from '../../imported/app/api/admin/vendors/route';
import * as adminVendorPayouts from '../../imported/app/api/admin/vendor-payouts/route';
import * as webhook from '../../imported/app/api/webhooks/courier/route';
import { pageData, manifest, sitemap, robots } from './page-data';

type Handler = (request: ApiRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

/** Preserve original raw request bytes (including webhook signatures and multipart uploads). */
function adapt(handler: Handler): RequestHandler {
  return async (req, res) => {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        if (Array.isArray(value)) value.forEach(v => headers.append(key, v));
        else if (value !== undefined) headers.set(key, value);
      }
      const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers };
      if (!['GET', 'HEAD'].includes(req.method)) {
        init.body = Readable.toWeb(req) as ReadableStream;
        init.duplex = 'half';
      }
      const request = new ApiRequest(`${req.protocol}://${req.get('host')}${req.originalUrl}`, init);
      const response = await handler(request, { params: Promise.resolve(req.params as Record<string, string>) });
      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie' && key !== 'content-length') res.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('set-cookie', cookies);
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      req.log.error({ err: error }, 'Imported application request failed');
      res.status(500).json({ success: false, code: 'INTERNAL_ERROR', errorEn: 'The request could not be completed.' });
    }
  };
}

export const importedRouter = Router();
const routes: Array<[string, Record<string, unknown>]> = [
  ['/api/account/orders', account], ['/api/admin/auth', adminAuth],
  ['/api/admin/brand-media', brandMedia], ['/api/admin/workspace', workspace],
  ['/api/cart/abandoned', abandoned], ['/api/catalog/import', catalogImport],
  ['/api/media/:assetId', mediaAsset], ['/api/media', media],
  ['/api/orders/cancellation-request', cancellation], ['/api/orders/return-request', returns],
  ['/api/orders/track/:secureToken', tracking], ['/api/orders', orders],
  ['/api/payments/manual-bkash/submissions', payments], ['/api/print/:orderNo', print],
  ['/api/promo/validate', promo], ['/api/reviews', reviews],
  ['/api/storefront/inquiry', inquiry], ['/api/storefront', storefront],
  ['/api/admin/vendors', adminVendors],
  ['/api/admin/vendor-payouts', adminVendorPayouts],
  ['/api/vendor/overview', vendor], ['/api/vendor/workspace', vendorWorkspace],
  ['/api/vendor/products', vendorProducts], ['/api/vendor/stock', vendorStock],
  ['/api/vendor/price-proposals', vendorPriceProposals], ['/api/vendor/payouts', vendorPayouts],
  ['/api/vendor/profile', vendorProfile], ['/api/vendor/onboarding', vendorOnboarding],
  ['/api/webhooks/courier', webhook],
  ['/api/page-data', { GET: pageData }],
  ['/manifest.webmanifest', { GET: manifest }], ['/sitemap.xml', { GET: sitemap }],
  ['/robots.txt', { GET: robots }],
];
for (const [path, module] of routes) {
  importedRouter.all(path, (req, res, next) => {
    const handler = module[req.method === 'HEAD' ? 'GET' : req.method];
    if (typeof handler !== 'function') {
      res.setHeader('Allow', Object.keys(module).filter(k => /^[A-Z]+$/.test(k)).join(', '));
      res.status(405).json({ success: false, code: 'METHOD_NOT_ALLOWED' });
      return;
    }
    return adapt(handler as Handler)(req, res, next);
  });
}
