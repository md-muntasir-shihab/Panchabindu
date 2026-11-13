import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/orders/route.ts
// Server-Side Order Creation & Public Tracking Endpoint
// Enforces:
//   - Zod Validation (createOrderInputSchema)
//   - Idempotency key deduplication
//   - Stock reservation & 3-tier price snapshot
//   - Strict server-side field hiding (Customer never receives vendor or cost fields)

import { NextRequest, NextResponse } from 'next/server';
import { createOrderInputSchema } from '@/src/lib/validators';
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  verifyCustomerSessionToken,
  verifyOriginAndCsrf,
  assertJsonBodySize,
  checkRateLimit,
  getClientIpFromRequest,
} from '@/src/lib/security/crypto-session';
import {
  createStorefrontOrder,
  getPublicOrderTrackingByToken,
} from '@/src/lib/db/repository';
import {
  buildAndPersistOrderFulfillmentGroups,
  computeOrthogonalOrderState,
  runWithAtomicStockLock,
  reconcileOrderReservationRecords,
} from '@/src/lib/inventory/phase3-inventory-order-engine';

async function handleGET(req: NextRequest) {
  if (!checkRateLimit(`tracking:${getClientIpFromRequest(req)}`, 30, 60_000).allowed) return NextResponse.json({ success: false }, { status: 429 });
  const { searchParams } = new URL(req.url);
  const token =
    searchParams.get('token') ?? searchParams.get('orderNo') ?? '';

  if (!token) {
    return NextResponse.json(
      { errorBn: 'নিরাপদ ট্র্যাকিং টোকেন প্রদান করুন।' },
      { status: 400 }
    );
  }

  // Enforces Phase 1 Rule 4.5: Reject sequential ORD-... enumeration on public GET
  const tracking = getPublicOrderTrackingByToken(token);
  if (!tracking.allowed || !tracking.order) {
    return NextResponse.json(
      {
        errorBn:
          'নিরাপত্তাজনিত কারণে সরাসরি অর্ডার নম্বর দিয়ে পাবলিক ট্র্যাকিং নিষিদ্ধ অথবা টোকেনটি সঠিক নয়।',
      },
      { status: 404 }
    );
  }

  return NextResponse.json({ order: tracking.order });
}

async function handlePOST(req: NextRequest) {
  try {
    if (!verifyOriginAndCsrf(req).ok) {
      return NextResponse.json({ success: false, errorBn: 'অনুরোধ অনুমোদিত নয়।' }, { status: 403 });
    }
    const session = verifyCustomerSessionToken(
      req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value
    );
    if (!session) {
      return NextResponse.json(
        { success: false, errorBn: 'অর্ডার দিতে আগে কাস্টমার অ্যাকাউন্টে লগইন করুন।' },
        { status: 401 }
      );
    }
    if (!checkRateLimit(`checkout:${session.customerId}`, 10, 60_000).allowed) return NextResponse.json({ success: false }, { status: 429 });
    const raw = await req.text();
    if (!assertJsonBodySize(raw, 32 * 1024).ok) return NextResponse.json({ success: false }, { status: 413 });
    const body = JSON.parse(raw);
    const parsed = createOrderInputSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          errorBn:
            parsed.error.issues[0]?.message ??
            'ফর্মের তথ্যগুলো সঠিকভাবে পূরণ করুন।',
          issues: parsed.error.issues,
        },
        { status: 400 }
      );
    }

    if (parsed.data.customerPhone !== session.phone) {
      return NextResponse.json(
        { success: false, errorBn: 'অর্ডারের ফোন নম্বরটি লগইন করা অ্যাকাউন্টের সঙ্গে মিলতে হবে।' },
        { status: 403 }
      );
    }

    const result = await runWithAtomicStockLock(() =>
      createStorefrontOrder({ ...parsed.data, source: 'storefront', advancePaidPoisha: 0, internalStaffNote: '' }, req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value)
    );
    if (!result.success || !result.order) {
      return NextResponse.json(
        {
          success: false,
          errorBn: result.errorBn ?? 'অর্ডার তৈরি করা সম্ভব হয়নি।',
        },
        { status: 422 }
      );
    }

    // Initialize Multi-Vendor Fulfillment Groups (VFG) & 5-Dimension Orthogonal State
    buildAndPersistOrderFulfillmentGroups(result.order.orderNo);
    reconcileOrderReservationRecords(result.order.orderNo, `customer:${session.customerId}`);
    computeOrthogonalOrderState(result.order.orderNo);

    return NextResponse.json({
      success: true,
      order: result.order,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        errorBn: 'সার্ভারে অর্ডার প্রসেস করতে সমস্যা হয়েছে।',
      },
      { status: 500 }
    );
  }
}

export const GET = backendRoute(handleGET);
export const POST = backendRoute(handlePOST);
