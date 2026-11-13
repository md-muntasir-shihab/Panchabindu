import { backendRoute } from '@/src/lib/db/backend-route';
import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import { assertJsonBodySize } from '@/src/lib/security/crypto-session';
import { authenticateVendorRequest } from '@/src/lib/vendor/vendor-auth';
import {
  isVendorNotFound,
  vendorSubmitConsignmentLot,
} from '@/src/lib/vendor/vendor-workspace-service';

// POST /api/vendor/stock
// A vendor dispatches a consignment lot (challan) to the warehouse. Stock only
// becomes sellable after the admin/warchouse QC approves the lot.

const lotSchema = z.object({
  action: z.literal('dispatch_lot'),
  variantId: z.string().min(1, 'ভ্যারিয়েন্ট নির্বাচন করুন।'),
  dispatchedQty: z.number().int().min(1, 'কমপক্ষে ১ পিস পাঠাতে হবে।').max(100_000),
  challanRef: z.string().trim().min(1, 'চালান রেফারেন্স আবশ্যক।').max(80),
  noteBn: z.string().trim().max(500).default(''),
});

async function handlePOST(req: NextRequest) {
  const auth = authenticateVendorRequest(req, { requireCsrf: true });
  if (!auth.ok) return NextResponse.json({ success: false, errorBn: auth.errorBn }, { status: auth.status });

  const rawBody = await req.text();
  const sizeCheck = assertJsonBodySize(rawBody, 32 * 1024);
  if (!sizeCheck.ok) return NextResponse.json({ success: false, errorBn: sizeCheck.errorBn }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, errorBn: 'অনুরোধের তথ্য সঠিক JSON নয়।' }, { status: 400 });
  }

  const parsed = lotSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errorBn: parsed.error.issues[0]?.message ?? 'তথ্য সঠিক নয়।' },
      { status: 400 }
    );
  }

  try {
    const result = vendorSubmitConsignmentLot(auth.actor, {
      variantId: parsed.data.variantId,
      dispatchedQty: parsed.data.dispatchedQty,
      challanRef: parsed.data.challanRef,
      noteBn: parsed.data.noteBn,
    });
    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  } catch (error) {
    if (isVendorNotFound(error)) {
      return NextResponse.json({ success: false, errorBn: 'ভ্যারিয়েন্টটি পাওয়া যায়নি।' }, { status: 404 });
    }
    throw error;
  }
}

export const POST = backendRoute(handlePOST);
