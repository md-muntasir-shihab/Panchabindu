// src/lib/vendor/vendor-auth.ts
// Shared guard for every /api/vendor/* route.
// A vendor route only ever accepts a signed admin-session cookie that belongs to
// an active vendor account whose first-login gate is already cleared. Anything
// else is 401/403, and a route never trusts a caller-supplied vendor id.

import { getActorSecurityContext } from '../admin/phase4a-service';
import {
  ADMIN_SESSION_COOKIE_NAME,
  extractAdminSessionTokenFromRequest,
  verifyAdminSessionToken,
  verifyOriginAndCsrf,
} from '../security/crypto-session';
import { isFirstLoginGateCleared, type ActorSecurityContext } from '../../types/permissions';
import { ApiRequest, ApiResponse } from '../http';

export type VendorAuthResult =
  | { ok: true; actor: ActorSecurityContext; csrfToken: string }
  | { ok: false; status: number; errorBn: string; csrfToken?: string };

function readCookie(req: Request, name: string): string | undefined {
  if (req instanceof ApiRequest) return req.cookies.get(name)?.value;
  const match = req.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`));
  return match ? match[1] : undefined;
}

export function authenticateVendorRequest(
  req: Request,
  options: { requireCsrf?: boolean } = {}
): VendorAuthResult {
  const rawToken = readCookie(req, ADMIN_SESSION_COOKIE_NAME) ?? extractAdminSessionTokenFromRequest(req);
  const session = verifyAdminSessionToken(rawToken);
  if (!session || session.purpose === 'enrollment') {
    return { ok: false, status: 401, errorBn: 'ভেন্ডর প্যানেলে লগইন করুন (401 Unauthorized)।' };
  }

  const actor = getActorSecurityContext(session.userId);
  if (!actor || actor.roleSlug !== 'vendor' || !actor.vendorId || actor.roleSlug !== session.roleSlug) {
    return { ok: false, status: 403, errorBn: 'এই পেজটি শুধুমাত্র ভেন্ডর অ্যাকাউন্টের জন্য।', csrfToken: session.csrfToken };
  }
  if (!isFirstLoginGateCleared(actor)) {
    return { ok: false, status: 403, errorBn: 'প্রথম লগইনের পাসওয়ার্ড পরিবর্তন ও 2FA সম্পন্ন করুন।', csrfToken: session.csrfToken };
  }

  if (options.requireCsrf) {
    const check = verifyOriginAndCsrf(req, session);
    if (!check.ok) {
      return { ok: false, status: 403, errorBn: check.errorBn ?? 'CSRF অনুরোধ প্রত্যাখ্যাত।', csrfToken: session.csrfToken };
    }
  }

  return { ok: true, actor, csrfToken: session.csrfToken };
}

export function vendorJson(body: unknown, status = 200): Response {
  return ApiResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
}

export function vendorFailure(status: number, errorBn: string): Response {
  return vendorJson({ success: false, errorBn }, status);
}
