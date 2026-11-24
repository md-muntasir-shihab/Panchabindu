import { Router, type RequestHandler } from 'express';
import { ApiRequest } from '../../imported/src/lib/http';
import { captureServerException } from '../lib/observability';
import * as account from '../../imported/app/api/account/orders/route';
import * as adminAuth from '../../imported/app/api/admin/auth/route';
import * as emergency from '../../imported/app/api/admin/emergency/route';
import * as brandMedia from '../../imported/app/api/admin/brand-media/route';
import * as workspace from '../../imported/app/api/admin/workspace/route';
import * as abandoned from '../../imported/app/api/cart/abandoned/route';
import * as analyticsIngest from '../../imported/app/api/analytics/ingest/route';
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
import * as vendorStatement from '../../imported/app/api/vendor/statement/route';
import * as vendorProducts from '../../imported/app/api/vendor/products/route';
import * as vendorStock from '../../imported/app/api/vendor/stock/route';
import * as vendorPriceProposals from '../../imported/app/api/vendor/price-proposals/route';
import * as vendorPayouts from '../../imported/app/api/vendor/payouts/route';
import * as vendorProfile from '../../imported/app/api/vendor/profile/route';
import * as vendorOnboarding from '../../imported/app/api/vendor/onboarding/route';
import * as adminVendors from '../../imported/app/api/admin/vendors/route';
import * as vendorKyc from '../../imported/app/api/vendor/kyc/route';
import * as vendorSupport from '../../imported/app/api/vendor/support/route';
import * as adminVendorSupport from '../../imported/app/api/admin/vendor-support/route';
import * as adminSystemHealth from '../../imported/app/api/admin/system-health/route';
import * as adminKyc from '../../imported/app/api/admin/vendor-kyc/route';
import * as adminVendorPayouts from '../../imported/app/api/admin/vendor-payouts/route';
import * as webhook from '../../imported/app/api/webhooks/courier/route';
import * as courierStatusCron from '../../imported/app/api/cron/courier-status/route';
import { pageData, manifest, sitemap, robots } from './page-data';

type Handler = (request: ApiRequest, context: { params: Promise<Record<string, string>> }) => Promise<Response>;

const BODY_LIMIT_BYTES = 8 * 1024 * 1024;
// A serverless platform may hand over a body that never ends (already consumed upstream).
// Bind every read so a write request can never hang the browser indefinitely.
const BODY_READ_TIMEOUT_MS = (() => {
  const configured = Number(process.env.IMPORTED_BODY_TIMEOUT_MS);
  return Number.isFinite(configured) && configured > 0 ? configured : 15_000;
})();

type PlatformRequest = Parameters<RequestHandler>[0] & {
  body?: unknown;
  rawBody?: unknown;
  readableEnded?: boolean;
  destroyed?: boolean;
  readable?: boolean;
};

function declaredPayloadBytes(req: PlatformRequest): number {
  const length = Number(req.headers['content-length']);
  if (Number.isFinite(length) && length > 0) return length;
  return req.headers['transfer-encoding'] ? -1 : 0;
}

/** Rebuild raw bytes when the platform already parsed the body for us. */
function platformBodyBytes(req: PlatformRequest): Uint8Array | null {
  const candidates = [req.rawBody, req.body];
  for (const candidate of candidates) {
    if (candidate === undefined || candidate === null) continue;
    if (Buffer.isBuffer(candidate)) return candidate;
    if (candidate instanceof Uint8Array) return candidate;
    if (typeof candidate === 'string') return Buffer.from(candidate);
    if (typeof candidate === 'object') {
      const contentType = String(req.headers['content-type'] || '');
      // Re-serialising is only lossless for JSON/urlencoded bodies; never rewrite signed bytes.
      if (contentType.includes('application/json')) return Buffer.from(JSON.stringify(candidate));
      if (contentType.includes('application/x-www-form-urlencoded')) {
        return Buffer.from(new URLSearchParams(candidate as Record<string, string>).toString());
      }
      return null;
    }
  }
  return null;
}

async function readIncomingBody(req: PlatformRequest): Promise<{ bytes: Uint8Array; unavailable: boolean }> {
  const declared = declaredPayloadBytes(req);
  const parsed = declared > 0 ? platformBodyBytes(req) : null;
  if (parsed) return { bytes: parsed, unavailable: false };

  // The stream is already drained: nothing left to read, so never wait on an 'end' that never comes.
  if (req.readableEnded || req.destroyed || req.readable === false) {
    return { bytes: platformBodyBytes(req) ?? Buffer.alloc(0), unavailable: declared > 0 };
  }

  const read = await new Promise<{ bytes: Uint8Array; failure?: Error }>((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let settled = false;
    const finish = (failure?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      req.off('data', onData);
      req.off('end', onEnd);
      req.off('error', onError);
      resolve({ bytes: Buffer.concat(chunks), failure });
    };
    const timer = setTimeout(() => finish(new Error('BODY_READ_TIMEOUT')), BODY_READ_TIMEOUT_MS);
    timer.unref?.();
    const onData = (chunk: Buffer) => {
      size += chunk.length;
      if (size > BODY_LIMIT_BYTES) {
        finish(new Error('PAYLOAD_TOO_LARGE'));
        return;
      }
      chunks.push(chunk);
    };
    const onEnd = () => finish();
    const onError = (error: Error) => finish(error);
    req.on('data', onData);
    req.on('end', onEnd);
    req.on('error', onError);
    req.resume?.();
  });

  if (read.failure) {
    req.log?.error({ err: read.failure, declaredBytes: declared, url: req.originalUrl }, 'Imported application body read failed');
    if (read.failure.message === 'PAYLOAD_TOO_LARGE') {
      return { bytes: Buffer.alloc(0), unavailable: false };
    }
    return { bytes: read.bytes, unavailable: true };
  }
  return { bytes: read.bytes, unavailable: declared > 0 && read.bytes.length === 0 };
}

/** Preserve original raw request bytes (including webhook signatures and multipart uploads). */
function adapt(handler: Handler): RequestHandler {
  return async (req, res) => {
    try {
      const headers = new Headers();
      for (const [key, value] of Object.entries(req.headers)) {
        // The body is re-buffered below, so never forward framing headers that could contradict it.
        if (key === 'content-length' || key === 'transfer-encoding') continue;
        if (Array.isArray(value)) value.forEach(v => headers.append(key, v));
        else if (value !== undefined) headers.set(key, value);
      }
      const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers };
      if (!['GET', 'HEAD'].includes(req.method)) {
        const { bytes, unavailable } = await readIncomingBody(req as PlatformRequest);
        if (unavailable) {
          res.status(400).json({
            success: false,
            code: 'REQUEST_BODY_UNAVAILABLE',
            errorBn: 'অনুরোধের তথ্য সার্ভারে পৌঁছায়নি। পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।',
            errorEn: 'The request body did not reach the server. Refresh the page and try again.',
          });
          return;
        }
        init.body = bytes;
        init.duplex = 'half';
      }
      const request = new ApiRequest(`${req.protocol}://${req.get('host')}${req.originalUrl}`, init);
      const response = await handler(request, { params: Promise.resolve(req.params as Record<string, string>) });
      if (response.status >= 500) {
        // The imported handlers translate failures into responses, so the status is the only
        // signal that reaches the host; report it instead of losing it in a log line.
        captureServerException(new Error(`Imported route responded ${response.status}`), {
          method: req.method,
          path: req.originalUrl?.split('?')[0] ?? null,
          status: response.status,
        });
      }
      res.status(response.status);
      response.headers.forEach((value, key) => {
        if (key !== 'set-cookie' && key !== 'content-length') res.setHeader(key, value);
      });
      const cookies = response.headers.getSetCookie();
      if (cookies.length) res.setHeader('set-cookie', cookies);
      res.send(Buffer.from(await response.arrayBuffer()));
    } catch (error) {
      req.log.error({ err: error }, 'Imported application request failed');
      captureServerException(error, { method: req.method, path: req.originalUrl?.split('?')[0] ?? null });
      res.status(500).json({ success: false, code: 'INTERNAL_ERROR', errorEn: 'The request could not be completed.' });
    }
  };
}

export const importedRouter = Router();
const routes: Array<[string, Record<string, unknown>]> = [
  ['/api/account/orders', account], ['/api/admin/auth', adminAuth],
  ['/api/admin/emergency', emergency], ['/api/admin/brand-media', brandMedia], ['/api/admin/workspace', workspace],
  ['/api/admin/system-health', adminSystemHealth],
  ['/api/analytics/ingest', analyticsIngest],
  ['/api/cart/abandoned', abandoned], ['/api/catalog/import', catalogImport],
  ['/api/media/:assetId', mediaAsset], ['/api/media', media],
  ['/api/orders/cancellation-request', cancellation], ['/api/orders/return-request', returns],
  ['/api/orders/track/:secureToken', tracking], ['/api/orders', orders],
  ['/api/payments/manual-bkash/submissions', payments], ['/api/print/:orderNo', print],
  ['/api/promo/validate', promo], ['/api/reviews', reviews],
  ['/api/storefront/inquiry', inquiry], ['/api/storefront', storefront],
  ['/api/admin/vendor-support', adminVendorSupport], ['/api/vendor/support', vendorSupport],
  ['/api/admin/vendors', adminVendors], ['/api/admin/vendor-kyc', adminKyc], ['/api/vendor/kyc', vendorKyc],
  ['/api/admin/vendor-payouts', adminVendorPayouts],
  ['/api/vendor/overview', vendor], ['/api/vendor/workspace', vendorWorkspace], ['/api/vendor/statement', vendorStatement],
  ['/api/vendor/products', vendorProducts], ['/api/vendor/stock', vendorStock],
  ['/api/vendor/price-proposals', vendorPriceProposals], ['/api/vendor/payouts', vendorPayouts],
  ['/api/vendor/profile', vendorProfile], ['/api/vendor/onboarding', vendorOnboarding],
  ['/api/webhooks/courier', webhook], ['/api/cron/courier-status', courierStatusCron],
  ['/api/page-data', { GET: pageData }],
  ['/manifest.webmanifest', { GET: manifest }], ['/sitemap.xml', { GET: sitemap }], ['/robots.txt', { GET: robots }],
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
