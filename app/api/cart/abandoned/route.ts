// app/api/cart/abandoned/route.ts
// Server-Side Abandoned Cart Snapshot Capture Route (Triggered when customer enters BD phone on checkout)

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { saveAbandonedCartSnapshot } from '@/src/lib/db/repository';
import { bdPhoneSchema } from '@/src/lib/validators';
import { CUSTOMER_SESSION_COOKIE_NAME, verifyCustomerSessionToken, verifyOriginAndCsrf, assertJsonBodySize, checkRateLimit } from '@/src/lib/security/crypto-session';

const abandonedCartSchema = z.object({
  customerPhone: bdPhoneSchema,
  customerName: z.string().optional().default(''),
  districtId: z.number().int().min(1).max(64).default(47),
  items: z
    .array(
      z.object({
        variantId: z.string().min(1),
        quantity: z.number().int().min(1).max(99),
      })
    )
    .min(1),
});

export async function POST(req: NextRequest) {
  try {
    if (!verifyOriginAndCsrf(req).ok) return NextResponse.json({ saved: false }, { status: 403 });
    const session = verifyCustomerSessionToken(req.cookies.get(CUSTOMER_SESSION_COOKIE_NAME)?.value);
    if (!session) return NextResponse.json({ saved: false }, { status: 401 });
    if (!checkRateLimit(`cart:${session.customerId}`, 10, 60_000).allowed) return NextResponse.json({ saved: false }, { status: 429 });
    const raw = await req.text();
    if (!assertJsonBodySize(raw, 16 * 1024).ok) return NextResponse.json({ saved: false }, { status: 413 });
    const body = JSON.parse(raw);
    const parsed = abandonedCartSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ saved: false }, { status: 400 });
    }

    const res = saveAbandonedCartSnapshot({ ...parsed.data, customerPhone: session.phone });
    return NextResponse.json(res);
  } catch {
    return NextResponse.json({ saved: false }, { status: 500 });
  }
}
