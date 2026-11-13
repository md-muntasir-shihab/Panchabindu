import { backendRoute } from '@/src/lib/db/backend-route';
// app/api/promo/validate/route.ts
// Server-Side Promo Code Validation Endpoint (Zod Validated)
// Never leaks vendor identity or platform margin to the browser.

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { validatePromoForCart } from '@/src/lib/db/repository';
import { assertJsonBodySize, checkRateLimit, getClientIpFromRequest, verifyOriginAndCsrf } from '@/src/lib/security/crypto-session';

const PromoValidateRequestSchema = z.object({
  code: z.string().trim().min(1, 'প্রোমো কোড লিখুন।').max(30),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1, 'কার্টে অন্তত ১টি পণ্য থাকতে হবে।'),
});

async function handlePOST(req: NextRequest) {
  try {
    if (!verifyOriginAndCsrf(req).ok) return NextResponse.json({ valid: false }, { status: 403 });
    if (!checkRateLimit(`promo:${getClientIpFromRequest(req)}`, 20, 60_000).allowed) return NextResponse.json({ valid: false }, { status: 429 });
    const raw = await req.text();
    if (!assertJsonBodySize(raw, 16 * 1024).ok) return NextResponse.json({ valid: false }, { status: 413 });
    const body = JSON.parse(raw);
    const parsed = PromoValidateRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        {
          valid: false,
          discountPoisha: 0,
          reasonBn: parsed.error.issues[0]?.message ?? 'অবৈধ প্রোমো রিকোয়েস্ট।',
        },
        { status: 400 }
      );
    }

    const result = validatePromoForCart(parsed.data.code, parsed.data.items);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json(
      {
        valid: false,
        discountPoisha: 0,
        reasonBn: 'সার্ভারে প্রোমো যাচাই করতে সমস্যা হয়েছে।',
      },
      { status: 500 }
    );
  }
}

export const POST = backendRoute(handlePOST);
