import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/orders/return-request/route.ts
// Policy-Aware Customer Return Request API (Phase 6 — Master Prompt Section 9.3 & 9.5)
// Enforces:
//   - Authenticated customer session required; ownership currently uses its verified phone
//   - Only Delivered orders are eligible for a return request
//   - Rate limiting, payload cap, and CSRF/Origin protection

import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import {
  assertJsonBodySize,
  checkRateLimit,
  CUSTOMER_SESSION_COOKIE_NAME,
  getClientIpFromRequest,
  verifyCustomerSessionToken,
  verifyOriginAndCsrf,
} from '@/src/lib/security/crypto-session';
import { submitCustomerReturnRequest } from '@/src/lib/storefront/phase6-storefront-engine';
import { customerOwnsOrder } from '@/src/lib/db/repository';

const returnRequestSchema = z.object({
  orderNo: z.string().trim().min(5).max(64),
  secureTrackingToken: z.string().trim().max(128).optional(),
  reasonCode: z.enum([
    'damaged_in_transit',
    'wrong_item_sent',
    'quality_defect',
    'size_or_variant_mismatch',
  ]),
  detailsBn: z.string().trim().min(5).max(500),
});

async function handlePOST(req: NextRequest) {
  try {
    const csrfCheck = verifyOriginAndCsrf(req);
    if (!csrfCheck.ok) {
      return NextResponse.json(
        { success: false, messageBn: csrfCheck.errorBn },
        { status: 403 }
      );
    }

    const clientIp = getClientIpFromRequest(req);
    const rateLimit = checkRateLimit(
      `customer_return_req:${clientIp}`,
      10,
      15 * 60 * 1000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          messageBn: `অতিরিক্ত অনুরোধ। অনুগ্রহ করে ${rateLimit.retryAfterSeconds} সেকেন্ড পর চেষ্টা করুন।`,
        },
        { status: 429 }
      );
    }

    const rawBody = await req.text();
    const sizeCheck = assertJsonBodySize(rawBody, 16 * 1024);
    if (!sizeCheck.ok) {
      return NextResponse.json(
        { success: false, messageBn: sizeCheck.errorBn },
        { status: 413 }
      );
    }

    const parsed = returnRequestSchema.safeParse(JSON.parse(rawBody));
    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          messageBn:
            'রিটার্ন অনুরোধের তথ্য সঠিক নয়। অনুগ্রহ করে কারণ এবং অন্তত ৫ অক্ষরের বিবরণ দিন।',
        },
        { status: 400 }
      );
    }

    const customerCookie = req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
    const customerSession = verifyCustomerSessionToken(customerCookie);
    if (!customerSession) {
      return NextResponse.json({ success: false, messageBn: 'রিটার্ন অনুরোধের আগে অ্যাকাউন্টে লগইন করুন।' }, { status: 401 });
    }

    if (!customerOwnsOrder(customerCookie, parsed.data.orderNo)) {
      return NextResponse.json({ success: false, messageBn: 'অর্ডার পাওয়া যায়নি।' }, { status: 404 });
    }
    const res = submitCustomerReturnRequest({
      orderNo: parsed.data.orderNo,
      verifiedCustomerPhone: customerSession.phone,
      reasonCode: parsed.data.reasonCode,
      detailsBn: parsed.data.detailsBn,
    });

    const status = res.success
      ? 200
      : res.code === 'UNAUTHORIZED_OWNERSHIP'
      ? 403
      : res.code === 'ORDER_NOT_FOUND'
      ? 404
      : 400;

    return NextResponse.json(res, { status });
  } catch {
    return NextResponse.json(
      { success: false, messageBn: 'সার্ভার ত্রুটি।' },
      { status: 500 }
    );
  }
}

export const POST = backendRoute(handlePOST);
