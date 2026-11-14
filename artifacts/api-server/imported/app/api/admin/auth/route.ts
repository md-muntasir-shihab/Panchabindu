import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/admin/auth/route.ts
// Server-Side Admin Authentication & First-Login 2FA Gate Endpoint (Phase 1 Hardened)
// Enforces:
//   - Cryptographically signed & server-verified Session Token Cookie (bg_admin_session)
//   - HttpOnly, SameSite=lax, Secure in production, 8-hour expiry
//   - Session rotation on login & first-login completion, server-side revocation on logout
//   - Rate limiting, payload size cap, and CSRF/Origin protection

import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import { hasDurableRuntimeContext } from '@/src/lib/db/runtime-persistence';
import {
  authenticateAdminUser,
  completeFirstLoginGate,
  updateOwnSecurity,
} from '@/src/lib/admin/phase4a-service';
import {
  ADMIN_SESSION_COOKIE_NAME,
  assertJsonBodySize,
  checkRateLimit,
  createAdminSession,
  ADMIN_SESSION_TTL_MS,
  extractAdminSessionTokenFromRequest,
  getClientIpFromRequest,
  revokeAdminSession,
  verifyOriginAndCsrf,
  verifyAdminSessionToken,
} from '@/src/lib/security/crypto-session';

const authActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('login'),
    username: z.string().trim().min(2).max(64),
    password: z.string().min(4).max(128),
    totpCode: z.string().trim().optional(),
  }),
  z.object({
    action: z.literal('complete_first_login'),
    userId: z.string().min(1).max(64),
    currentPassword: z.string().min(4).max(128),
    newPassword: z.string().min(8).max(128),
    totpCode: z.string().trim().max(16),
  }),
  z.object({
    action: z.enum(['start_mfa', 'enable_mfa', 'disable_mfa', 'change_password']),
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().max(128).optional(),
    totpCode: z.string().trim().max(16).optional(),
  }),
  z.object({
    action: z.literal('logout'),
  }),
  z.object({
    action: z.literal('sandbox_totp_preview'),
    username: z.string().trim().min(2).max(64),
  }),
]);

async function handlePOST(req: NextRequest) {
  try {
    const csrfCheck = verifyOriginAndCsrf(req);
    if (!csrfCheck.ok) {
      return NextResponse.json(
        { success: false, errorBn: csrfCheck.errorBn },
        { status: 403 }
      );
    }

    const clientIp = getClientIpFromRequest(req);
    const rawBody = await req.text();
    const sizeCheck = assertJsonBodySize(rawBody, 16 * 1024);
    if (!sizeCheck.ok) {
      return NextResponse.json(
        { success: false, errorBn: sizeCheck.errorBn },
        { status: 413 }
      );
    }

    const body = JSON.parse(rawBody) as unknown;
    const parsed = authActionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          errorBn: 'লগইন তথ্য সঠিক নয়।',
        },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const isHttps =
      req.headers.get('x-forwarded-proto') === 'https' ||
      new URL(req.url).protocol === 'https:';
    const secureCookie = process.env.NODE_ENV === 'production' || isHttps;

    if (data.action === 'logout') {
      const existingToken =
        req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ||
        extractAdminSessionTokenFromRequest(req);
      const session = verifyAdminSessionToken(existingToken);
      if (session && !verifyOriginAndCsrf(req, session).ok) return NextResponse.json({ success: false }, { status: 403 });
      revokeAdminSession(existingToken);
      const res = NextResponse.json({ success: true });
      res.cookies.delete(ADMIN_SESSION_COOKIE_NAME);
      res.cookies.delete('bg_admin_session_uid');
      return res;
    }

    if (data.action === 'sandbox_totp_preview') {
      return NextResponse.json(
        { success: false, errorBn: 'TOTP প্রিভিউ নিষ্ক্রিয়। অথেনটিকেটর অ্যাপ ব্যবহার করুন।' },
        { status: 403 }
      );
    }

    if (process.env.NODE_ENV === 'production' && !hasDurableRuntimeContext()) {
      return NextResponse.json({ success: false, code: 'NOT_INTEGRATED', errorBn: 'Production identity adapter এখনও সংযুক্ত নয়।' }, { status: 503 });
    }

    // Rate limit authentication attempts per IP
    const rateLimit = checkRateLimit(
      `admin_auth:${clientIp}`,
      25,
      15 * 60 * 1000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          errorBn: `অতিরিক্ত লগইন প্রচেষ্টা। অনুগ্রহ করে ${rateLimit.retryAfterSeconds} সেকেন্ড পর চেষ্টা করুন।`,
        },
        { status: 429 }
      );
    }

    if (data.action === 'start_mfa' || data.action === 'enable_mfa' || data.action === 'disable_mfa' || data.action === 'change_password') {
      const token = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value || extractAdminSessionTokenFromRequest(req);
      const session = verifyAdminSessionToken(token);
      if (!session || session.purpose === 'enrollment' || !verifyOriginAndCsrf(req, session).ok) return NextResponse.json({ success: false, errorBn: 'সঠিক সেশন ও নিরাপত্তা যাচাই প্রয়োজন।' }, { status: 403 });
      const result = updateOwnSecurity(session.userId, data);
      const res = NextResponse.json(result, { status: result.success ? 200 : 400 });
      if (result.sessionRevoked) res.cookies.delete(ADMIN_SESSION_COOKIE_NAME);
      return res;
    }

    if (data.action === 'login') {
      const result = authenticateAdminUser({
        username: data.username,
        password: data.password,
        totpCode: data.totpCode?.trim(),
      });

      if (!result.success || !result.user) {
        return NextResponse.json(result, { status: 401 });
      }

      // Rotate any prior session token
      const existingToken =
        req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ||
        extractAdminSessionTokenFromRequest(req);
      revokeAdminSession(existingToken);

      if (!result.requiresFirstLoginGate) {
        const session = createAdminSession({
          userId: result.user.userId,
          username: result.user.username,
          roleSlug: result.user.roleSlug,
          previousToken: existingToken,
          userAgent: req.headers.get('user-agent') ?? 'unknown',
          ip: clientIp,
        });

        const res = NextResponse.json({
          ...result,
          totpSetupUri: undefined,
          sessionToken: session.token,
          csrfToken: session.csrfToken,
        });

        res.cookies.set(ADMIN_SESSION_COOKIE_NAME, session.token, {
          httpOnly: true,
          sameSite: 'lax',
          secure: secureCookie,
          path: '/',
          maxAge: ADMIN_SESSION_TTL_MS / 1000,
        });
        res.cookies.delete('bg_admin_session_uid');
        return res;
      }

      const enrollment = createAdminSession({ userId: result.user.userId, username: result.user.username, roleSlug: result.user.roleSlug, purpose: 'enrollment' });
      const res = NextResponse.json({
        ...result,
        totpSetupUri: result.totpSetupUri,
        sessionToken: enrollment.token,
        csrfToken: enrollment.csrfToken,
      });
      res.cookies.set(ADMIN_SESSION_COOKIE_NAME, enrollment.token, { httpOnly: true, sameSite: 'lax', secure: secureCookie, path: '/', maxAge: 600 });
      res.cookies.delete('bg_admin_session_uid');
      return res;
    }

    if (data.action === 'complete_first_login') {
      const gate = verifyAdminSessionToken(req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value || extractAdminSessionTokenFromRequest(req));
      if (!gate || gate.purpose !== 'enrollment' || gate.userId !== data.userId || !verifyOriginAndCsrf(req, gate).ok) {
        return NextResponse.json({ success: false, errorBn: 'নিরাপদ প্রথম-লগইন সেশন প্রয়োজন।' }, { status: 403 });
      }
      const result = completeFirstLoginGate({
        userId: gate.userId,
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
        totpCode: data.totpCode,
      });

      if (!result.success || !result.user) {
        return NextResponse.json(result, { status: 400 });
      }

      const existingToken =
        req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ||
        extractAdminSessionTokenFromRequest(req);
      revokeAdminSession(existingToken);

      const session = createAdminSession({
        userId: result.user.userId,
        username: result.user.username,
        roleSlug: result.user.roleSlug,
        previousToken: existingToken,
        userAgent: req.headers.get('user-agent') ?? 'unknown',
        ip: clientIp,
      });

      const res = NextResponse.json({
        ...result,
        sessionToken: session.token,
        csrfToken: session.csrfToken,
      });
      res.cookies.set(ADMIN_SESSION_COOKIE_NAME, session.token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: secureCookie,
        path: '/',
        maxAge: ADMIN_SESSION_TTL_MS / 1000,
      });
      res.cookies.delete('bg_admin_session_uid');
      return res;
    }

    return NextResponse.json(
      { success: false, errorBn: 'অবৈধ অনুরোধ।' },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      { success: false, errorBn: 'সার্ভার ত্রুটি।' },
      { status: 500 }
    );
  }
}

async function handleGET() {
  const localSandbox = process.env.NODE_ENV !== 'production' &&
    process.env.PANCHABINDU_ENABLE_SANDBOX_AUTH === '1';
  return NextResponse.json({
    // Optional code field remains available even in local sandboxes if a user enables MFA.
    twoFactorLoginEnabled: true,
    defaultAdminUsername: localSandbox
      ? process.env.PANCHABINDU_SANDBOX_ADMIN_USERNAME?.trim() || 'admin'
      : 'admin',
  });
}

export const GET = backendRoute(handleGET);
export const POST = backendRoute(handlePOST, { commitAuthFailure: true });
