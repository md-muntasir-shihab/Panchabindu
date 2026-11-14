import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/account/orders/route.ts
// Server-Side Customer Account Phone + OTP Verification & Authenticated Order History Endpoint (Phase 1 Hardened)
// Enforces:
//   - Hardcoded '123456' OTP completely removed
//   - SHA-256 OTP hashing, 5-minute TTL, 5-attempt lockout, 60-second resend cooldown
//   - Honest SMS Gateway status reporting (NOT_INTEGRATED when env vars are absent; SANDBOX_TEST_ONLY in non-prod)
//   - Signed HttpOnly Customer Session Cookie (bg_customer_session) required for full customer order details

import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import { getAuthenticatedCustomerOrders } from '@/src/lib/db/repository';
import {
  assertJsonBodySize,
  checkRateLimit,
  CUSTOMER_SESSION_COOKIE_NAME,
  getClientIpFromRequest,
  isSmsOtpProviderConfigured,
  requestCustomerPhoneOtp,
  revokeCustomerSession,
  verifyCustomerPhoneOtp,
  verifyCustomerSessionToken,
  verifyOriginAndCsrf,
} from '@/src/lib/security/crypto-session';
import { bdPhoneSchema } from '@/src/lib/validators';

const customerAuthActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('request_otp'),
    customerPhone: bdPhoneSchema,
  }),
  z.object({
    action: z.literal('verify_otp'),
    customerPhone: bdPhoneSchema,
    otpCode: z.string().trim().length(6, '৬ সংখ্যার ওটিপি কোড দিন।'),
  }),
  z.object({
    action: z.literal('get_orders'),
    customerPhone: bdPhoneSchema.optional(),
  }),
  z.object({
    action: z.literal('logout'),
  }),
]);

async function handleGET(req: NextRequest) {
  const token = req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
  const session = verifyCustomerSessionToken(token);
  const smsConfigured = isSmsOtpProviderConfigured();
  const providerStatus = smsConfigured
    ? 'INTEGRATED'
    : process.env.NODE_ENV !== 'production' && (process.env.NODE_ENV === 'test' || process.env.PANCHABINDU_ENABLE_SANDBOX_AUTH === '1')
    ? 'SANDBOX_TEST_ONLY'
    : 'NOT_INTEGRATED';

  if (!session) {
    return NextResponse.json(
      {
        authenticated: false,
        providerStatus,
        orders: [],
      },
      { status: 200 }
    );
  }

  const orders = getAuthenticatedCustomerOrders(token);
  return NextResponse.json({
    authenticated: true,
    customerPhone: session.phone,
    providerStatus,
    orders,
  });
}

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
    const rateLimit = checkRateLimit(
      `customer_otp_api:${clientIp}`,
      20,
      10 * 60 * 1000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          errorBn: `অতিরিক্ত অনুরোধ। অনুগ্রহ করে ${rateLimit.retryAfterSeconds} সেকেন্ড পর চেষ্টা করুন।`,
        },
        { status: 429 }
      );
    }

    const rawBody = await req.text();
    const sizeCheck = assertJsonBodySize(rawBody, 16 * 1024);
    if (!sizeCheck.ok) {
      return NextResponse.json(
        { success: false, errorBn: sizeCheck.errorBn },
        { status: 413 }
      );
    }

    const body = JSON.parse(rawBody) as unknown;

    // Backwards-compatible shape detection: if no 'action' field is passed, treat as 'verify_otp'
    const normalizedBody =
      body && typeof body === 'object' && !('action' in body)
        ? { action: 'verify_otp', ...(body as Record<string, unknown>) }
        : body;

    const parsed = customerAuthActionSchema.safeParse(normalizedBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          errorBn: firstIssue?.message ?? 'সঠিক মোবাইল নম্বর ও ওটিপি দিন।',
        },
        { status: 400 }
      );
    }

    const data = parsed.data;

    if (data.action === 'logout') {
      const token = req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
      revokeCustomerSession(token);
      const res = NextResponse.json({ success: true });
      res.cookies.delete(CUSTOMER_SESSION_COOKIE_NAME);
      return res;
    }

    if (data.action === 'request_otp') {
      const result = requestCustomerPhoneOtp(data.customerPhone);
      const providerStatus =
        result.deliveryStatus === 'SENT_LIVE_SMS'
          ? 'INTEGRATED'
          : result.deliveryStatus;

      return NextResponse.json(
        {
          success: result.success,
          providerStatus,
          sandboxOtpPreview: result.sandboxOtpCode,
          expiresInSeconds: result.expiresInSeconds,
          retryAfterSeconds: result.retryAfterSeconds,
          messageBn: result.success
            ? result.deliveryStatus === 'SENT_LIVE_SMS'
              ? 'আপনার মোবাইল নম্বরে ৬ সংখ্যার ওটিপি পাঠানো হয়েছে।'
              : 'এসএমএস গেটওয়ে কনফিগার করা নেই (NOT_INTEGRATED — Sandbox Test Mode)। নিচের স্যান্ডবক্স ওটিপি ব্যবহার করুন।'
            : undefined,
          errorBn: result.errorBn,
        },
        {
          status: result.success
            ? 200
            : result.deliveryStatus === 'NOT_INTEGRATED'
            ? 503
            : 429,
        }
      );
    }

    if (data.action === 'verify_otp') {
      const verifyRes = verifyCustomerPhoneOtp(
        data.customerPhone,
        data.otpCode
      );

      if (!verifyRes.success || !verifyRes.sessionToken) {
        return NextResponse.json(
          {
            success: false,
            errorBn: verifyRes.errorBn ?? 'ওটিপি যাচাই ব্যর্থ হয়েছে।',
          },
          { status: 401 }
        );
      }

      const orders = getAuthenticatedCustomerOrders(verifyRes.sessionToken);

      const res = NextResponse.json({
        success: true,
        customerPhone: data.customerPhone,
        orders,
      });

      res.cookies.set(CUSTOMER_SESSION_COOKIE_NAME, verifyRes.sessionToken, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 24 * 60 * 60, // 24 hours customer session TTL
      });

      return res;
    }

    if (data.action === 'get_orders') {
      const token = req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
      const session = verifyCustomerSessionToken(token);
      if (!session) {
        return NextResponse.json(
          {
            success: false,
            errorBn: 'অনুগ্রহ করে মোবাইল ওটিপি দিয়ে সেশন যাচাই করুন (401 Unauthorized)।',
          },
          { status: 401 }
        );
      }

      if (data.customerPhone && data.customerPhone !== session.phone) {
        return NextResponse.json(
          {
            success: false,
            errorBn: 'আপনি শুধুমাত্র নিজের ভেরিফাইড ফোন নম্বরের অর্ডার দেখতে পারবেন (403 Forbidden)।',
          },
          { status: 403 }
        );
      }

      const orders = getAuthenticatedCustomerOrders(token);
      return NextResponse.json({
        success: true,
        customerPhone: session.phone,
        orders,
      });
    }

    return NextResponse.json(
      { success: false, errorBn: 'অবৈধ অনুরোধ।' },
      { status: 400 }
    );
  } catch {
    return NextResponse.json(
      {
        success: false,
        errorBn: 'অর্ডার হিস্ট্রি লোড করতে সমস্যা হয়েছে।',
      },
      { status: 500 }
    );
  }
}

export const GET = backendRoute(handleGET, { commitAuthFailure: true });
export const POST = backendRoute(handlePOST, { commitAuthFailure: true });
