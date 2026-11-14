import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/webhooks/courier/route.ts
// Courier webhook endpoint: authenticated requests still fail closed until provider integration is verified.
// It verifies its legacy HMAC envelope but cannot mutate orders until a
// provider-specific contract and safe order/financial mapping are verified.

import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import {
  recordRejectedCourierWebhookAttempt,
  verifyCourierWebhookHmac,
} from '@/src/lib/admin/phase6-service';
import {
  assertJsonBodySize,
  checkRateLimit,
  getClientIpFromRequest,
} from '@/src/lib/security/crypto-session';

const courierWebhookBodySchema = z.object({
  provider: z.enum(['steadfast', 'pathao']),
  orderNo: z.string().min(3).max(40),
  consignmentId: z.string().max(64).optional(),
  eventId: z.string().max(128).optional(),
  rawStatus: z.enum([
    'delivered',
    'partial_delivered',
    'returned',
    'in_transit',
    'hold',
  ]),
  collectedCodPoisha: z.number().int().min(0).optional(),
});

async function handlePOST(req: NextRequest) {
  try {
    const clientIp = getClientIpFromRequest(req);
    const rateLimit = checkRateLimit(
      `courier_webhook:${clientIp}`,
      60,
      60 * 1000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          errorBn: 'অতিরিক্ত ওয়েবহুক অনুরোধ (429 Too Many Requests)।',
        },
        { status: 429 }
      );
    }

    const rawBody = await req.text();
    const sizeCheck = assertJsonBodySize(rawBody, 64 * 1024);
    if (!sizeCheck.ok) {
      return NextResponse.json(
        { success: false, errorBn: sizeCheck.errorBn },
        { status: 413 }
      );
    }

    const parsedJson = JSON.parse(rawBody) as unknown;
    const validated = courierWebhookBodySchema.safeParse(parsedJson);

    if (!validated.success) {
      return NextResponse.json(
        {
          success: false,
          errorBn: 'ওয়েবহুক পেলোড ফরম্যাট সঠিক নয়।',
        },
        { status: 400 }
      );
    }

    const payload = validated.data;
    const signatureHeader = req.headers.get('x-webhook-signature') ?? '';
    const timestampHeader = req.headers.get('x-webhook-timestamp');

    const secretEnvMap: Record<string, string | undefined> = {
      steadfast: process.env.STEADFAST_WEBHOOK_SECRET,
      pathao: process.env.PATHAO_WEBHOOK_SECRET,
      redx: process.env.REDX_WEBHOOK_SECRET,
      bd_post: process.env.BD_POST_WEBHOOK_SECRET,
      manual: process.env.MANUAL_COURIER_WEBHOOK_SECRET,
    };

    const configuredSecret = secretEnvMap[payload.provider];

    // CRITICAL SECURITY FIX (Phase 1): Fail closed when secret or signature is missing or invalid!
    const hmacVerification = verifyCourierWebhookHmac({
      rawPayload: rawBody,
      signatureHeader,
      secret: configuredSecret,
      timestampHeader,
      requireSignedTimestamp: true,
    });

    if (!hmacVerification.valid) {
      recordRejectedCourierWebhookAttempt({
        provider: payload.provider,
        orderNo: payload.orderNo,
        rawStatus: payload.rawStatus,
        reasonBn: hmacVerification.reasonBn ?? 'ওয়েবহুক স্বাক্ষর যাচাই ব্যর্থ।',
      });

      const status = hmacVerification.code === 'MISSING_SECRET' ? 503 : 401;
      return NextResponse.json(
        {
          success: false,
          code: hmacVerification.code,
          errorBn: hmacVerification.reasonBn,
        },
        { status }
      );
    }

    // This generic payload/signature contract has not been verified against
    // either provider. A valid signature alone does not prove that an event
    // matches an existing booking or that its financial effects are safe.
    // Keep automatic mutations disabled until provider-specific integration
    // and sandbox reconciliation tests have been completed.
    return NextResponse.json({ success: false, code: 'NOT_INTEGRATED', errorBn: 'কুরিয়ার ওয়েবহুক সংযোগ চালু নেই।', errorEn: 'Courier webhook integration is not available.' }, { status: 503 });
  } catch {
    return NextResponse.json(
      {
        success: false,
        errorBn: 'কুরিয়ার ওয়েবহুক প্রসেসিংয়ে ত্রুটি ঘটেছে।',
      },
      { status: 500 }
    );
  }
}

export const POST = backendRoute(handlePOST);
