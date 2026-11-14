import { backendRoute } from '@/src/lib/db/backend-route';
import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import { assertJsonBodySize } from '@/src/lib/security/crypto-session';
import { authenticateVendorRequest } from '@/src/lib/vendor/vendor-auth';
import {
  isVendorNotFound,
  vendorSubmitPriceProposal,
} from '@/src/lib/vendor/vendor-workspace-service';

// POST /api/vendor/price-proposals
// Vendors never edit live prices directly — they file a proposal that a super
// admin approves in the admin panel.

const proposalSchema = z.object({
  variantId: z.string().min(1, 'ভ্যারিয়েন্ট নির্বাচন করুন।'),
  proposedSupplierCostPoisha: z.number().int().min(100, 'ক্রয়মূল্য কমপক্ষে ১ টাকা হতে হবে।'),
  proposedSalePricePoisha: z.number().int().min(100, 'বিক্রয়মূল্য কমপক্ষে ১ টাকা হতে হবে।'),
  reasonBn: z.string().trim().min(2, 'পরিবর্তনের কারণ লিখুন।').max(500),
});

async function handlePOST(req: NextRequest) {
  const auth = authenticateVendorRequest(req, { requireCsrf: true });
  if (!auth.ok) return NextResponse.json({ success: false, errorBn: auth.errorBn }, { status: auth.status });

  const rawBody = await req.text();
  const sizeCheck = assertJsonBodySize(rawBody, 16 * 1024);
  if (!sizeCheck.ok) return NextResponse.json({ success: false, errorBn: sizeCheck.errorBn }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, errorBn: 'অনুরোধের তথ্য সঠিক JSON নয়।' }, { status: 400 });
  }

  const parsed = proposalSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errorBn: parsed.error.issues[0]?.message ?? 'তথ্য সঠিক নয়।' },
      { status: 400 }
    );
  }

  try {
    const result = vendorSubmitPriceProposal(auth.actor, parsed.data);
    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  } catch (error) {
    if (isVendorNotFound(error)) {
      return NextResponse.json({ success: false, errorBn: 'ভ্যারিয়েন্টটি পাওয়া যায়নি।' }, { status: 404 });
    }
    throw error;
  }
}

export const POST = backendRoute(handlePOST);
