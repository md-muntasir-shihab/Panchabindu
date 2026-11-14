import { withRuntimePersistence, readRuntimeDocument } from './runtime-persistence';
import { uiText } from '../i18n/ui-text';
import { ApiRequest as NextRequest } from '@/src/lib/http';

function localizedResponse(response: Response, request: unknown): Promise<Response> {
  if (!response.headers.get('content-type')?.includes('application/json')) return Promise.resolve(response);
  const locale = request instanceof Request && request.headers.get('accept-language')?.toLowerCase().startsWith('en') ? 'en' : 'bn';
  return response.clone().json().then(body => {
    const decorate = (value: unknown): void => {
      if (Array.isArray(value)) { value.forEach(decorate); return; }
      if (!value || typeof value !== 'object') return;
      const record = value as Record<string, unknown>;
      for (const stem of ['error', 'message']) {
        const original = record[`${stem}Bn`];
        if (typeof original === 'string') {
          const translated = typeof record[`${stem}En`] === 'string' ? record[`${stem}En`] as string : uiText(original, 'en');
          record[`${stem}En`] = /[\u0980-\u09ff]/.test(translated)
            ? (response.status >= 400 ? 'Please check the request details and try again.' : 'Your request was completed.') : translated;
        }
      }
      if (typeof record.message === 'string') {
        const translated = uiText(record.message, locale);
        record.message = locale === 'en' && /[\u0980-\u09ff]/.test(translated)
          ? (response.status >= 400 ? 'Please check the request details and try again.' : 'Your request was completed.') : translated;
      }
      Object.values(record).forEach(decorate);
    };
    decorate(body);
    if (response.status >= 400 && body && typeof body === 'object' && !Array.isArray(body)) {
      const record = body as Record<string, unknown>;
      if (!record.code) record.code = ({ 400: 'INVALID_REQUEST', 401: 'AUTH_REQUIRED', 403: 'FORBIDDEN', 404: 'NOT_FOUND', 409: 'CONFLICT', 422: 'VALIDATION_FAILED', 429: 'RATE_LIMITED' } as Record<number, string>)[response.status] ?? 'SERVICE_UNAVAILABLE';
    }
    const headers = new Headers(response.headers);
    headers.delete('content-length');
    return Response.json(body, { status: response.status, headers });
  });
}

export function backendRoute<A extends unknown[]>(handler: (...args: A) => Promise<Response>, options?: { commitAuthFailure?: boolean }) {
  return async (...args: A): Promise<Response> => {
    try {
      const request = args[0];
      if (request instanceof Request && request.body && !['GET', 'HEAD'].includes(request.method)) {
        const pathname = new URL(request.url).pathname;
        const limit = ['/api/media', '/api/admin/brand-media', '/api/vendor/kyc'].includes(pathname) ? 6 * 1024 * 1024 : pathname === '/api/admin/workspace' ? 512 * 1024 : pathname === '/api/catalog/import' ? 300 * 1024 : 64 * 1024;
        const reader = request.body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        for (;;) {
          const chunk = await reader.read();
          if (chunk.done) break;
          size += chunk.value.byteLength;
          if (size > limit) {
            await reader.cancel();
            return Response.json({ success: false, code: 'PAYLOAD_TOO_LARGE', errorBn: 'অনুরোধের তথ্যের আকার অতিরিক্ত বড়।', errorEn: 'The request is too large.' }, { status: 413 });
          }
          chunks.push(chunk.value);
        }
        args[0] = new NextRequest(request.url, {
          method: request.method, headers: request.headers, body: Buffer.concat(chunks), signal: request.signal,
        });
      }
      const response = await withRuntimePersistence(async () => {
        const current = args[0];
        if (current instanceof Request && (!['GET', 'HEAD', 'OPTIONS'].includes(current.method) || (current.method === 'GET' && new URL(current.url).pathname.startsWith('/api/cron/')))) {
          const state = readRuntimeDocument('erp-phase4c-store.json').value as { emergencyStopActive?: unknown } | null;
          if (state?.emergencyStopActive !== undefined && typeof state.emergencyStopActive !== 'boolean') throw new Error('INVALID_EMERGENCY_STATE');
          if (state?.emergencyStopActive === true) {
            const path = new URL(current.url).pathname;
            let allowed = path === '/api/admin/auth' || path === '/api/admin/emergency';
            if (path === '/api/account/orders') {
              try {
                const body = await current.clone().json() as { action?: unknown };
                allowed = ['login', 'logout', 'change_password', 'get_orders'].includes(String(body.action));
              } catch { allowed = false; }
            }
            if (!allowed) return Response.json({ success: false, code: 'EMERGENCY_STOP', errorBn: 'জরুরি রক্ষণাবেক্ষণের কারণে নতুন কার্যক্রম সাময়িকভাবে বন্ধ।', errorEn: 'New operations are temporarily unavailable during emergency maintenance.' }, { status: 503 });
          }
        }
        return handler(...args);
      }, options);
      response.headers.set('Cache-Control', 'private, no-store');
      return await localizedResponse(response, args[0]);
    } catch (error) {
      const message = error instanceof Error ? error.message : '';
      const known = ['DATABASE_WRITE_CONFLICT', 'DATABASE_NOT_CONFIGURED', 'DATABASE_INITIALIZATION_REQUIRED', 'PRODUCTION_DATABASE_REQUIRED', 'DATABASE_COMMIT_FAILED', 'DATABASE_TRANSACTION_REQUIRED'];
      // Only log a fixed diagnostic code, never credentials or database error details.
      console.error('[backend-route]', known.includes(message) ? message : 'UNEXPECTED_FAILURE');
      const conflict = message === 'DATABASE_WRITE_CONFLICT';
      return Response.json({
        success: false,
        code: conflict ? 'WRITE_CONFLICT' : 'SERVICE_UNAVAILABLE',
        errorBn: conflict ? 'তথ্য পরিবর্তিত হয়েছে। রিফ্রেশ করে আবার চেষ্টা করুন।' : 'সার্ভিস প্রস্তুত নয়। কিছুক্ষণ পরে আবার চেষ্টা করুন।',
        errorEn: conflict ? 'The data changed. Refresh and try again.' : 'The service is unavailable. Please try again later.',
      }, { status: conflict ? 409 : 503, headers: { 'Cache-Control': 'private, no-store' } });
    }
  };
}
