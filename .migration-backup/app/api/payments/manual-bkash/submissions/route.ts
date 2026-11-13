import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/payments/manual-bkash/submissions/route.ts
// Public Manual bKash TrxID Submission Endpoint (Section 2.3, 10.4B, 11.2 & 21.1)
// Enforces:
//   - Only Manual bKash submission (no automated payment gateway)
//   - Bangladesh Mobile Number normalization (01[3-9]\d{8})
//   - Duplicate TrxID detection across all orders
//   - Idempotency key deduplication
//   - Never auto-verifies payment (requires authorized reviewer approval)
//   - Appends immutable audit log entry

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { customerOwnsOrder, submitManualBkashPayment } from '@/src/lib/db/repository';
import { normalizeBdPhone } from '@/src/lib/validators';
import {
  appendImmutableAuditLog,
  readAdminStore,
  writeAdminStore,
} from '@/src/lib/admin/phase4a-service';
import {
  assertJsonBodySize,
  checkRateLimit,
  getClientIpFromRequest,
  CUSTOMER_SESSION_COOKIE_NAME,
  verifyCustomerSessionToken,
  verifyOriginAndCsrf,
} from '@/src/lib/security/crypto-session';

function createRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const manualBkashSubmissionSchema = z.object({
  orderNo: z.string().trim().min(4, 'সঠিক অর্ডার নম্বর প্রদান করুন।'),
  senderPhone: z.string().trim().min(11, 'বিকাশ প্রেরকের সঠিক মোবাইল নম্বর দিন।'),
  trxId: z
    .string()
    .trim()
    .min(5, 'বিকাশ TrxID কমপক্ষে ৫ অক্ষরের হতে হবে।')
    .max(32, 'বিকাশ TrxID সর্বাধিক ৩২ অক্ষরের হতে পারে।'),
  submittedAmountPoisha: z
    .number()
    .int()
    .positive('জমাকৃত টাকার পরিমাণ পয়সায় (Poisha > 0) হতে হবে।'),
  idempotencyKey: z
    .string()
    .trim()
    .min(6, 'Idempotency Key আবশ্যক।'),
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
    const clientIp = getClientIpFromRequest(req);
    const rateLimit = checkRateLimit(
      `manual_bkash_submit:${clientIp}`,
      12,
      10 * 60 * 1000
    );
    if (!rateLimit.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'RATE_LIMITED',
            message: 'অতিরিক্ত পেমেন্ট জমার প্রচেষ্টা। অনুগ্রহ করে কিছুক্ষণ পর চেষ্টা করুন।',
            field_errors: {},
          },
          request_id: requestId,
        },
        { status: 429 }
      );
    }

    const rawBody = await req.text();
    const sizeCheck = assertJsonBodySize(rawBody, 16 * 1024);
    if (!sizeCheck.ok) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: sizeCheck.errorBn ?? 'পেলোড আকার অনুমোদিত সীমার বেশি।',
            field_errors: {},
          },
          request_id: requestId,
        },
        { status: 413 }
      );
    }

    const body = JSON.parse(rawBody) as unknown;
    const parsed = manualBkashSubmissionSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'VALIDATION_ERROR',
            message: firstIssue?.message ?? 'অনুরোধের তথ্য সঠিক নয়।',
            field_errors: parsed.error.flatten().fieldErrors,
          },
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    const ownsOrder = customerOwnsOrder(req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value, parsed.data.orderNo);
    if (!ownsOrder) {
      return NextResponse.json({ success: false, error: { code: 'ORDER_NOT_FOUND', message: 'অর্ডার পাওয়া যায়নি।' }, request_id: requestId }, { status: 404 });
    }

    const normalizedPhone = normalizeBdPhone(parsed.data.senderPhone);
    if (!normalizedPhone) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_BD_PHONE',
            message: 'সঠিক ১১ ডিজিটের বাংলাদেশি মোবাইল নম্বর প্রদান করুন (01XXXXXXXXX)।',
            field_errors: { senderPhone: ['Invalid Bangladesh mobile number'] },
          },
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    const result = submitManualBkashPayment({
      orderNo: parsed.data.orderNo,
      senderPhone: normalizedPhone,
      trxId: parsed.data.trxId,
      submittedAmountPoisha: parsed.data.submittedAmountPoisha,
      idempotencyKey: parsed.data.idempotencyKey,
    });

    if (!result.success || !result.submission) {
      const status =
        result.code === 'ORDER_NOT_FOUND'
          ? 404
          : result.code === 'DUPLICATE_TRX_ID'
          ? 409
          : 422;
      return NextResponse.json(
        {
          success: false,
          error: {
            code: result.code ?? 'SUBMISSION_FAILED',
            message: result.errorBn ?? 'বিকাশ TrxID জমা দেওয়া সম্ভব হয়নি।',
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
      actorUsername: 'customer_checkout',
      actorRole: 'public_customer',
      actionCode: 'MANUAL_BKASH_SUBMITTED',
      targetType: 'order',
      targetId: result.submission.orderNo,
      summaryBn: `অর্ডার ${result.submission.orderNo}-এর জন্য ম্যানুয়াল বিকাশ TrxID (${result.submission.trxId}) ভেরিফিকেশনের জন্য জমা হয়েছে।`,
      metadata: {
        trxId: result.submission.trxId,
        submittedAmountPoisha: result.submission.submittedAmountPoisha,
        verificationStatus: result.submission.verificationStatus,
      },
    });
    writeAdminStore(adminStore);

    return NextResponse.json(
      {
        success: true,
        data: result.submission,
        request_id: requestId,
      },
      { status: 201 }
    );
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
