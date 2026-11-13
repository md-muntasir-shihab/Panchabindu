import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/orders/cancellation-request/route.ts
// Public Customer Order Cancellation Request API (Section 9.4 & 21.1)
// Enforces:
//   - Customer phone verification
//   - Blocks cancellation if already dispatched to courier (requires Return Workflow)
//   - Releases reserved stock atomically and writes immutable audit log

import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import { customerOwnsOrder, requestOrderCancellation } from '@/src/lib/db/repository';
import { normalizeBdPhone } from '@/src/lib/validators';
import { CUSTOMER_SESSION_COOKIE_NAME, verifyCustomerSessionToken, verifyOriginAndCsrf, assertJsonBodySize, checkRateLimit } from '@/src/lib/security/crypto-session';
import {
  appendImmutableAuditLog,
  readAdminStore,
  writeAdminStore,
} from '@/src/lib/admin/phase4a-service';

function createRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const cancellationSchema = z.object({
  orderNo: z.string().trim().min(4, 'অর্ডার নম্বর আবশ্যক।'),
  customerPhone: z.string().trim().min(11, 'গ্রাহকের মোবাইল নম্বর আবশ্যক।'),
  reasonBn: z.string().trim().min(3, 'অর্ডার বাতিলের কারণ উল্লেখ করুন।'),
});

async function handlePOST(req: NextRequest) {
  const requestId = createRequestId();
  try {
    if (!verifyOriginAndCsrf(req).ok) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'অনুরোধ অনুমোদিত নয়।' }, request_id: requestId }, { status: 403 });
    }
    const session = verifyCustomerSessionToken(req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value);
    if (!session) {
      return NextResponse.json({ success: false, error: { code: 'AUTH_REQUIRED', message: 'আগে অ্যাকাউন্টে লগইন করুন।' }, request_id: requestId }, { status: 401 });
    }
    if (!checkRateLimit(`cancel:${session.customerId}`, 10, 60_000).allowed) return NextResponse.json({ success: false }, { status: 429 });
    const raw = await req.text();
    if (!assertJsonBodySize(raw, 16 * 1024).ok) return NextResponse.json({ success: false }, { status: 413 });
    const body = JSON.parse(raw);
    const parsed = cancellationSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: parsed.error.issues[0]?.message ?? 'তথ্য সঠিক নয়।',
            field_errors: parsed.error.flatten().fieldErrors,
          },
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    const normalizedPhone = normalizeBdPhone(parsed.data.customerPhone);
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_BD_PHONE',
            message: 'সঠিক বাংলাদেশি মোবাইল নম্বর প্রদান করুন।',
            field_errors: { customerPhone: ['Invalid BD phone'] },
          },
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    if (normalizedPhone !== session.phone) {
      return NextResponse.json({ success: false, error: { code: 'FORBIDDEN', message: 'আপনার অ্যাকাউন্টের অর্ডার ছাড়া বাতিল করা যাবে না।' }, request_id: requestId }, { status: 403 });
    }

    if (!customerOwnsOrder(req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value, parsed.data.orderNo)) {
      return NextResponse.json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'অর্ডার পাওয়া যায়নি।' } }, { status: 404 });
    }
    const res = requestOrderCancellation({
      orderNo: parsed.data.orderNo,
      customerPhone: normalizedPhone,
      reasonBn: parsed.data.reasonBn,
    });

    if (!res.success || !res.order) {
      const status =
        res.code === 'ORDER_NOT_FOUND'
          ? 404
          : res.code === 'PHONE_MISMATCH'
          ? 403
          : 409;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: res.code ?? 'CANCELLATION_DENIED',
            message: res.errorBn ?? 'অর্ডার বাতিল করা সম্ভব হয়নি।',
            field_errors: {},
          },
          request_id: requestId,
        },
        { status }
      );
    }

    const adminStore = readAdminStore();
    appendImmutableAuditLog(adminStore, {
      actorUserId: 'public_customer',
      actorUsername: 'customer_self_service',
      actorRole: 'public_customer',
      actionCode: 'ORDER_CANCELLED_BY_CUSTOMER',
      targetType: 'order',
      targetId: res.order.orderNo,
      summaryBn: `গ্রাহক কর্তৃক অর্ডার ${res.order.orderNo} বাতিল করা হয়েছে (রিজার্ভড স্টক রিলিজড)। কারণ: ${parsed.data.reasonBn}`,
      metadata: {
        reasonBn: parsed.data.reasonBn,
      },
    });
    writeAdminStore(adminStore);

    return NextResponse.json({
      success: true,
      data: {
        order: res.order,
      },
      request_id: requestId,
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'INTERNAL_ERROR',
          message: 'সার্ভারে অনুরোধ প্রক্রিয়াকরণে ত্রুটি ঘটেছে।',
          field_errors: {},
        },
        request_id: requestId,
      },
      { status: 500 }
    );
  }
}

export const POST = backendRoute(handlePOST);
