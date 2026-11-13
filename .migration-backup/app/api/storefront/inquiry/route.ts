import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/storefront/inquiry/route.ts
// Customer Contact Inquiry Form Submission API

import { NextRequest, NextResponse } from 'next/server';
import { submitCustomerInquiry } from '@/src/lib/db/repository';
import { z } from 'zod';
import { bdPhoneSchema } from '@/src/lib/validators';
import { assertJsonBodySize, checkRateLimit, getClientIpFromRequest, verifyOriginAndCsrf } from '@/src/lib/security/crypto-session';

const inquirySchema = z.object({ name: z.string().trim().min(2).max(100), phone: bdPhoneSchema, subject: z.string().trim().max(200).default(''), message: z.string().trim().min(5).max(2000) });

async function handlePOST(req: NextRequest) {
  try {
    if (!verifyOriginAndCsrf(req).ok) return NextResponse.json({ success: false }, { status: 403 });
    if (!checkRateLimit(`inquiry:${getClientIpFromRequest(req)}`, 5, 60_000).allowed) return NextResponse.json({ success: false }, { status: 429 });
    const raw = await req.text();
    if (!assertJsonBodySize(raw, 16 * 1024).ok) return NextResponse.json({ success: false }, { status: 413 });
    const parsed = inquirySchema.safeParse(JSON.parse(raw));
    if (!parsed.success) return NextResponse.json({ success: false, error: { code: 'INVALID_INPUT', message: 'তথ্য সঠিক নয়।' } }, { status: 400 });
    const { name, phone, subject, message } = parsed.data;

    if (!name || !phone || !message) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'MISSING_FIELDS',
            message: 'আপনার নাম, মোবাইল নম্বর এবং বার্তা টাইপ করুন।',
          },
        },
        { status: 400 }
      );
    }

    const res = submitCustomerInquiry({ name, phone, subject, message });

    if (!res.success) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'SUBMISSION_FAILED',
            message: res.errorBn || 'বার্তা পাঠাতে ব্যর্থ হয়েছে।',
          },
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: res.inquiry,
      message: 'আপনার বার্তাটি এডমিন প্যানেলে সফলভাবে জমা হয়েছে।',
    });
  } catch {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: 'SERVER_ERROR',
          message:
            'বার্তা জমা দেওয়া সম্ভব হয়নি।',
        },
      },
      { status: 500 }
    );
  }
}

export const POST = backendRoute(handlePOST);
