import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/orders/route.ts
// Server-Side Order Creation & Public Tracking Endpoint
// Enforces:
//   - Zod Validation (createOrderInputSchema)
//   - Idempotency key deduplication
//   - Stock reservation & 3-tier price snapshot
//   - Strict server-side field hiding (Customer never receives vendor or cost fields)

import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
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
    const rateLimitKey = session?.customerId ?? `guest:${getClientIpFromRequest(req)}`;
    if (!checkRateLimit(`checkout:${rateLimitKey}`, 10, 60_000).allowed) return NextResponse.json({ success: false }, { status: 429 });
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

    // Guest retry keys also protect access to the returned tracking token.
    if (!session && !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(parsed.data.idempotencyKey)) {
      return NextResponse.json({ success: false, errorBn: 'নিরাপদ অর্ডার কী প্রয়োজন। পেজটি রিফ্রেশ করুন।' }, { status: 400 });
    }

    if (session?.phone && parsed.data.customerPhone !== session.phone) {
      return NextResponse.json(
        { success: false, errorBn: 'অর্ডারের ফোন নম্বরটি লগইন করা অ্যাকাউন্টের সঙ্গে মিলতে হবে।' },
        { status: 403 }
      );
    }

    const result = await runWithAtomicStockLock(() =>
      createStorefrontOrder({ ...parsed.data, source: 'storefront', advancePaidPoisha: 0, internalStaffNote: '' }, session ? req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value : undefined)
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
    reconcileOrderReservationRecords(result.order.orderNo, session ? `customer:${session.customerId}` : `guest:${getClientIpFromRequest(req)}`);
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
