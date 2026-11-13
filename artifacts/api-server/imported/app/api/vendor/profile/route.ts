import { backendRoute } from '@/src/lib/db/backend-route';
import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import { assertJsonBodySize } from '@/src/lib/security/crypto-session';
import { authenticateVendorRequest } from '@/src/lib/vendor/vendor-auth';
import {
  isVendorNotFound,
  vendorRequestProfileChange,
} from '@/src/lib/vendor/vendor-workspace-service';

// POST /api/vendor/profile
// Business identity, contact number and payout account are never self-applied:
// the vendor files a change request and a super admin approves it, so a stolen
// vendor session cannot redirect payouts.

const profileSchema = z.object({
  businessNameBn: z.string().trim().min(2).max(160).optional(),
  businessNameEn: z.string().trim().min(2).max(160).optional(),
  ownerNameBn: z.string().trim().min(2).max(160).optional(),
  contactPhone: z.string().trim().min(11).max(14).optional(),
  payoutMethodBn: z.string().trim().min(2).max(80).optional(),
  payoutAccountNo: z.string().trim().min(4).max(40).optional(),
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

  const parsed = profileSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errorBn: parsed.error.issues[0]?.message ?? 'তথ্য সঠিক নয়।' },
      { status: 400 }
    );
  }

  try {
    const result = vendorRequestProfileChange(auth.actor, parsed.data);
    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  } catch (error) {
    if (isVendorNotFound(error)) {
      return NextResponse.json({ success: false, errorBn: 'ভেন্ডর অ্যাকাউন্ট পাওয়া যায়নি।' }, { status: 404 });
    }
    throw error;
  }
}

export const POST = backendRoute(handlePOST);
