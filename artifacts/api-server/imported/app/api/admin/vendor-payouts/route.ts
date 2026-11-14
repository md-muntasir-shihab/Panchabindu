import { backendRoute } from '@/src/lib/db/backend-route';
import { ApiRequest as NextRequest, ApiResponse as NextResponse } from '@/src/lib/http';
import { z } from 'zod';
import {
  ADMIN_SESSION_COOKIE_NAME,
  assertJsonBodySize,
  extractAdminSessionTokenFromRequest,
  verifyAdminSessionToken,
  verifyOriginAndCsrf,
} from '@/src/lib/security/crypto-session';
import { getActorSecurityContext } from '@/src/lib/admin/phase4a-service';
import type { ActorSecurityContext } from '@/src/types/permissions';
import {
  adminCreateVendorPayout,
  adminResolveVendorPayout,
  getAdminVendorPayoutRegister,
} from '@/src/lib/vendor/vendor-payout-register';

// ADMIN → VENDOR PAYOUT REGISTER
//   GET  : every payout ever raised, with per-vendor roll-ups, life-cycle trail,
//          maker-checker state and the totals an accountant reconciles against.
//   POST : create a payout, approve, reject (releases the hold), or mark paid
//          with a TrxID and proof. All four are audited.
// Super admin only. Money movement never happens in the browser.

function sessionActor(
  req: NextRequest
): { actor: ActorSecurityContext | null; status: number; errorBn?: string } {
  const rawToken =
    req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? extractAdminSessionTokenFromRequest(req);
  const session = verifyAdminSessionToken(rawToken);
  if (!session || session.purpose === 'enrollment') {
    return { actor: null, status: 401, errorBn: 'অনুগ্রহ করে অ্যাডমিন প্যানেলে লগইন করুন (401 Unauthorized)।' };
  }
  const actor = getActorSecurityContext(session.userId);
  if (!actor) return { actor: null, status: 401, errorBn: 'অ্যাকাউন্ট নিষ্ক্রিয় অথবা পাওয়া যায়নি।' };
  if (actor.roleSlug !== 'super_admin') {
    return { actor: null, status: 403, errorBn: 'শুধুমাত্র সুপার অ্যাডমিন ভেন্ডর পেআউট পরিচালনা করতে পারবেন।' };
  }
  return { actor, status: 200 };
}

async function handleGET(req: NextRequest) {
  const auth = sessionActor(req);
  if (!auth.actor) {
    return NextResponse.json({ success: false, errorBn: auth.errorBn }, { status: auth.status });
  }

  const register = getAdminVendorPayoutRegister(auth.actor);
  return NextResponse.json(
    { success: true, ...register },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

const payoutActions = z.discriminatedUnion('operation', [
  z
    .object({
      operation: z.literal('create_payout'),
      vendorId: z.string().min(1).max(64),
      requestedAmountPoisha: z.number().int().min(100).max(100_000_000),
      payoutMethodBn: z.string().trim().min(2).max(80).optional(),
      payoutAccountNo: z.string().trim().min(4).max(40).optional(),
    })
    .strict(),
  z
    .object({
      operation: z.literal('resolve_payout'),
      payoutId: z.string().min(1).max(80),
      decision: z.enum(['approve', 'reject', 'mark_paid']),
      rejectionReasonBn: z.string().trim().max(400).optional(),
      paymentTrxId: z.string().trim().max(80).optional(),
      proofUrl: z.string().trim().max(500).optional(),
      selfApprovalOverrideReasonBn: z.string().trim().max(240).optional(),
    })
    .strict(),
]);

async function handlePOST(req: NextRequest) {
  const auth = sessionActor(req);
  if (!auth.actor) {
    return NextResponse.json({ success: false, errorBn: auth.errorBn }, { status: auth.status });
  }

  const session = verifyAdminSessionToken(
    req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? extractAdminSessionTokenFromRequest(req)
  );
  const csrfCheck = verifyOriginAndCsrf(req, session);
  if (!csrfCheck.ok) {
    return NextResponse.json({ success: false, errorBn: csrfCheck.errorBn }, { status: 403 });
  }

  const rawBody = await req.text();
  const sizeCheck = assertJsonBodySize(rawBody, 16 * 1024);
  if (!sizeCheck.ok) {
    return NextResponse.json({ success: false, errorBn: sizeCheck.errorBn }, { status: 413 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, errorBn: 'অনুরোধের তথ্য সঠিক JSON নয়।' }, { status: 400 });
  }

  const parsed = payoutActions.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errorBn: 'পেআউট অনুরোধের তথ্য সঠিক নয়।' },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  if (payload.operation === 'create_payout') {
    const result = adminCreateVendorPayout(auth.actor, payload);
    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  }

  const result = adminResolveVendorPayout(auth.actor, payload);
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

export const GET = backendRoute(handleGET);
export const POST = backendRoute(handlePOST);
