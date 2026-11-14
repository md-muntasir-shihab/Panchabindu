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
  adminCreateVendor,
  adminDecideVendorRequest,
  adminResetVendorCapabilities,
  adminSetVendorCapabilities,
  adminUpdateVendorProfile,
  getAdminVendorControlSnapshot,
} from '@/src/lib/vendor/vendor-admin-service';
import { getVendorCapabilities } from '@/src/lib/vendor/vendor-control';

// Admin → Vendor control surface.
//   GET  : full vendor directory + per-vendor capability matrix + pending requests
//   POST : create/edit vendors, set commission & escrow hold, approve requests,
//          suspend/close, and toggle exactly what the vendor panel allows.
// Only the super admin may call this; vendor accounts are rejected outright.

function sessionActor(req: NextRequest): { actor: ActorSecurityContext | null; status: number; errorBn?: string } {
  const rawToken =
    req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? extractAdminSessionTokenFromRequest(req);
  const session = verifyAdminSessionToken(rawToken);
  if (!session || session.purpose === 'enrollment') {
    return { actor: null, status: 401, errorBn: 'অনুগ্রহ করে অ্যাডমিন প্যানেলে লগইন করুন (401 Unauthorized)।' };
  }
  const actor = getActorSecurityContext(session.userId);
  if (!actor) return { actor: null, status: 401, errorBn: 'অ্যাকাউন্ট নিষ্ক্রিয় অথবা পাওয়া যায়নি।' };
  if (actor.roleSlug === 'vendor') {
    return { actor: null, status: 403, errorBn: 'ভেন্ডর এই নিয়ন্ত্রণ প্যানেলে প্রবেশ করতে পারবেন না।' };
  }
  if (actor.roleSlug !== 'super_admin') {
    return { actor: null, status: 403, errorBn: 'শুধুমাত্র সুপার অ্যাডমিন ভেন্ডর নিয়ন্ত্রণ করতে পারবেন।' };
  }
  return { actor, status: 200 };
}

async function handleGET(req: NextRequest) {
  const auth = sessionActor(req);
  if (!auth.actor) return NextResponse.json({ success: false, errorBn: auth.errorBn }, { status: auth.status });

  const snapshot = getAdminVendorControlSnapshot();
  return NextResponse.json(
    { success: true, ...snapshot },
    { headers: { 'Cache-Control': 'private, no-store' } }
  );
}

const capabilityPatchSchema = z
  .object({
    canCreateProduct: z.boolean().optional(),
    canEditProduct: z.boolean().optional(),
    canChangeProductStatus: z.boolean().optional(),
    canSubmitConsignmentLot: z.boolean().optional(),
    canSubmitPriceProposal: z.boolean().optional(),
    canRequestPayout: z.boolean().optional(),
    canEditProfile: z.boolean().optional(),
    canEditPayoutProfile: z.boolean().optional(),
    canSubmitOnboardingAnswers: z.boolean().optional(),
    maxActiveProducts: z.number().int().min(0).max(10_000).optional(),
  })
  .strict();

const bodySchema = z.discriminatedUnion('operation', [
  z.object({
    operation: z.literal('create_vendor'),
    businessNameBn: z.string().trim().min(2),
    businessNameEn: z.string().trim().optional(),
    ownerNameBn: z.string().trim().min(2),
    contactPhone: z.string().trim().min(11),
    defaultCommissionBp: z.number().int().min(0).max(5000),
    escrowHoldDaysOverride: z.number().int().min(1).max(30),
    payoutMethodBn: z.string().trim().min(2),
    payoutAccountNo: z.string().trim().min(4),
    status: z.enum(['pending_onboarding', 'active', 'suspended', 'closing_audit', 'closed']).optional(),
  }),
  z.object({
    operation: z.literal('update_vendor'),
    vendorId: z.string().min(1),
    activationReason: z.string().trim().min(5).max(400).optional(),
    businessNameBn: z.string().trim().min(2).optional(),
    businessNameEn: z.string().trim().min(2).optional(),
    ownerNameBn: z.string().trim().min(2).optional(),
    contactPhone: z.string().trim().min(11).optional(),
    payoutMethodBn: z.string().trim().min(2).optional(),
    payoutAccountNo: z.string().trim().min(4).optional(),
    defaultCommissionBp: z.number().int().min(0).max(5000).nullable().optional(),
    escrowHoldDaysOverride: z.number().int().min(1).max(30).nullable().optional(),
    status: z.enum(['pending_onboarding', 'active', 'suspended', 'closing_audit', 'closed']).optional(),
  }),
  z.object({
    operation: z.literal('set_capabilities'),
    vendorId: z.string().min(1),
    capabilities: capabilityPatchSchema,
    restrictionNoteBn: z.string().trim().max(400).optional(),
  }),
  z.object({
    operation: z.literal('decide_vendor_request'),
    requestId: z.string().min(1),
    decision: z.enum(['approve', 'reject']),
    reviewNoteBn: z.string().trim().max(400).optional(),
  }),
  z.object({
    operation: z.literal('reset_capabilities'),
    vendorId: z.string().min(1),
  }),
]);

async function handlePOST(req: NextRequest) {
  const auth = sessionActor(req);
  if (!auth.actor) return NextResponse.json({ success: false, errorBn: auth.errorBn }, { status: auth.status });

  const session = verifyAdminSessionToken(
    req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value ?? extractAdminSessionTokenFromRequest(req)
  );
  const csrfCheck = verifyOriginAndCsrf(req, session);
  if (!csrfCheck.ok) {
    return NextResponse.json({ success: false, errorBn: csrfCheck.errorBn }, { status: 403 });
  }

  const rawBody = await req.text();
  const sizeCheck = assertJsonBodySize(rawBody, 32 * 1024);
  if (!sizeCheck.ok) return NextResponse.json({ success: false, errorBn: sizeCheck.errorBn }, { status: 413 });

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ success: false, errorBn: 'অনুরোধের তথ্য সঠিক JSON নয়।' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, errorBn: parsed.error.issues[0]?.message ?? 'তথ্য সঠিক নয়।' },
      { status: 400 }
    );
  }

  const payload = parsed.data;
  const actor = auth.actor;

  if (payload.operation === 'create_vendor') {
    const result = adminCreateVendor(actor, payload);
    return NextResponse.json(result, { status: result.success ? 201 : 400 });
  }

  if (payload.operation === 'update_vendor') {
    const { operation: _operation, ...input } = payload;
    const result = adminUpdateVendorProfile(actor, input);
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  if (payload.operation === 'set_capabilities') {
    const result = adminSetVendorCapabilities(actor, {
      vendorId: payload.vendorId,
      patch: payload.capabilities,
      restrictionNoteBn: payload.restrictionNoteBn,
    });
    return NextResponse.json(result, { status: result.success ? 200 : 400 });
  }

  if (payload.operation === 'reset_capabilities') {
    // Resetting clears only the admin overrides; the vendor falls back to the
    // conservative defaults defined in vendor-control.ts and the restriction
    // note disappears from their panel.
    const result = adminResetVendorCapabilities(actor, { vendorId: payload.vendorId });
    return NextResponse.json(
      { ...result, capabilities: getVendorCapabilities(payload.vendorId) },
      { status: result.success ? 200 : 400 }
    );
  }

  const result = adminDecideVendorRequest(actor, {
    requestId: payload.requestId,
    decision: payload.decision,
    reviewNoteBn: payload.reviewNoteBn,
  });
  return NextResponse.json(result, { status: result.success ? 200 : 400 });
}

export const GET = backendRoute(handleGET);
export const POST = backendRoute(handlePOST);
