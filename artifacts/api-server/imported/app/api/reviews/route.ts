import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/reviews/route.ts
// Server-Side Product Review Submission Route with Zod Validation & Verified Purchase Check

import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import { submitProductReview } from '@/src/lib/db/repository';
import { bdPhoneSchema } from '@/src/lib/validators';
import { CUSTOMER_SESSION_COOKIE_NAME, verifyCustomerSessionToken, verifyOriginAndCsrf, assertJsonBodySize, checkRateLimit } from '@/src/lib/security/crypto-session';

const reviewInputSchema = z.object({
  productId: z.string().min(1),
  customerName: z.string().trim().min(2, 'নাম কমপক্ষে ২ অক্ষরের হতে হবে।'),
  customerPhone: bdPhoneSchema,
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(5, 'রিভিউ কমপক্ষে ৫ অক্ষরের হতে হবে।').max(1000),
});

async function handlePOST(req: NextRequest) {
  try {
    if (!verifyOriginAndCsrf(req).ok) return NextResponse.json({ success: false }, { status: 403 });
    const token = req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
    const session = verifyCustomerSessionToken(token);
    if (!session) return NextResponse.json({ success: false, errorBn: 'আগে অ্যাকাউন্টে লগইন করুন।' }, { status: 401 });
    if (!checkRateLimit(`review:${session.customerId}`, 5, 60_000).allowed) return NextResponse.json({ success: false }, { status: 429 });
    const raw = await req.text();
    if (!assertJsonBodySize(raw, 16 * 1024).ok) return NextResponse.json({ success: false }, { status: 413 });
    const body = JSON.parse(raw);
    const parsed = reviewInputSchema.safeParse(body);

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          success: false,
          errorBn: firstIssue?.message ?? 'রিভিউয়ের তথ্য সঠিক নয়।',
        },
        { status: 400 }
      );
    }

    const result = submitProductReview({ ...parsed.data, customerPhone: session.phone }, token);
    if (!result.success) {
      return NextResponse.json(result, { status: 400 });
    }

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json(
      {
        success: false,
        errorBn: 'সার্ভারে রিভিউ জমা দিতে সমস্যা হয়েছে।',
      },
      { status: 500 }
    );
  }
}

export const POST = backendRoute(handlePOST);
