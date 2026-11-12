// app/api/orders/track/[secureToken]/route.ts
// Public Order Tracking API Endpoint (Phase 1 Hardened — Section 4.5 & 21.1)
// Enforces:
//   - Cryptographically random secureTrackingToken required (blocks sequential ORD-... enumeration)
//   - Zero-leak DTO (never exposes streetAddress, landmark, unmasked phone, raw TrxID, vendor identities, or costs)
//   - Rate limiting per IP

import { NextRequest, NextResponse } from 'next/server';
import { getPublicOrderTrackingByToken } from '@/src/lib/db/repository';
import {
  checkRateLimit,
  getClientIpFromRequest,
} from '@/src/lib/security/crypto-session';

function createRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ secureToken: string }> }
) {
  const requestId = createRequestId();
  const clientIp = getClientIpFromRequest(req);
  const rateLimit = checkRateLimit(
    `public_order_track:${clientIp}`,
    30,
    60 * 1000
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'RATE_LIMITED',
          message: 'অতিরিক্ত ট্র্যাকিং অনুরোধ। কিছুক্ষণ পর আবার চেষ্টা করুন।',
          field_errors: {},
        },
        request_id: requestId,
      },
      { status: 429 }
    );
  }

  const { secureToken } = await params;
  const cleanToken = decodeURIComponent(secureToken || '').trim();

  if (!cleanToken) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'MISSING_TOKEN',
          message: 'অর্ডার ট্র্যাকিং সিকিউর টোকেন প্রদান করুন।',
          field_errors: {},
        },
        request_id: requestId,
      },
      { status: 400 }
    );
  }

  const result = getPublicOrderTrackingByToken(cleanToken);
  if (!result.allowed || !result.order) {
    const status =
      result.code === 'SEQUENTIAL_ORDER_NO_FORBIDDEN'
        ? 403
        : result.code === 'INVALID_TOKEN'
        ? 400
        : result.code === 'TOKEN_EXPIRED'
        ? 410
        : 404;

    return NextResponse.json(
      {
        success: false,
        error: {
          code: result.code ?? 'ORDER_NOT_FOUND',
          message:
            result.errorBn ??
            'এই ট্র্যাকিং টোকেন দিয়ে কোনো অর্ডার খুঁজে পাওয়া যায়নি।',
          field_errors: {},
        },
        request_id: requestId,
      },
      { status }
    );
  }

  const tracking = result.order;
  return NextResponse.json({
    success: true,
    data: {
      currency: 'BDT',
      order: {
        ...tracking,
        subtotal_paisa: String(tracking.subtotalPoisha),
        discount_paisa: String(tracking.discountPoisha),
        delivery_charge_paisa: String(tracking.deliveryChargePoisha),
        total_payable_paisa: String(tracking.totalPayablePoisha),
      },
    },
    request_id: requestId,
  });
}
