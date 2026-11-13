import { backendRoute } from '@/src/lib/db/backend-route';
import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import { assertJsonBodySize } from '@/src/lib/security/crypto-session';
import { authenticateVendorRequest } from '@/src/lib/vendor/vendor-auth';
import {
  isVendorNotFound,
  vendorSubmitOnboardingAnswers,
} from '@/src/lib/vendor/vendor-workspace-service';

// POST /api/vendor/onboarding
// The 15-question consignment profile, submitted by the vendor for admin review.

const onboardingSchema = z.object({
  answers15: z.record(z.string(), z.string().max(1000)),
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

  const parsed = onboardingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errorBn: parsed.error.issues[0]?.message ?? 'তথ্য সঠিক নয়।' },
      { status: 400 }
    );
  }

  try {
    const result = vendorSubmitOnboardingAnswers(auth.actor, parsed.data.answers15);
    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  } catch (error) {
    if (isVendorNotFound(error)) {
      return NextResponse.json({ success: false, errorBn: 'ভেন্ডর অ্যাকাউন্ট পাওয়া যায়নি।' }, { status: 404 });
    }
    throw error;
  }
}

export const POST = backendRoute(handlePOST);
