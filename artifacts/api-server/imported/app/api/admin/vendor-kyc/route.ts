import { z } from 'zod';
import { ApiRequest } from '@/src/lib/http';
import { backendRoute } from '@/src/lib/db/backend-route';
import { getActorSecurityContext } from '@/src/lib/admin/phase4a-service';
import { canAccessAdminWorkspace } from '@/src/types/permissions';
import { extractAdminSessionTokenFromRequest, verifyAdminSessionToken, verifyOriginAndCsrf, checkRateLimit } from '@/src/lib/security/crypto-session';
import { auditKyc, findOwnKycRecord, listKycRecords, privateKycStorage, reviewKycRecord } from '@/src/lib/vendor/vendor-kyc';

function authorized(req: ApiRequest) {
  const session = verifyAdminSessionToken(extractAdminSessionTokenFromRequest(req));
  const actor = session && session.purpose !== 'enrollment' ? getActorSecurityContext(session.userId) : null;
  return session && actor && actor.roleSlug === 'super_admin' && session.roleSlug === actor.roleSlug && canAccessAdminWorkspace(actor) ? { actor, session } : null;
}
export const GET = backendRoute(async (req: ApiRequest) => {
  const auth = authorized(req); if (!auth) return Response.json({ success: false }, { status: 403 });
  const id = new URL(req.url).searchParams.get('documentId');
  if (!id) return Response.json({ success: true, documents: listKycRecords(auth.actor) });
  const doc = findOwnKycRecord(auth.actor, id);
  if (!doc) return Response.json({ success: false }, { status: 404 });
  if (!checkRateLimit(`kyc_read:${auth.actor.userId}`, 30, 60_000).allowed) return Response.json({ success: false }, { status: 429 });
  try {
    const bucket = await privateKycStorage(); const result = await bucket.download(doc.storagePath);
    if (result.error || !result.data) return Response.json({ success: false, code: 'DOCUMENT_UNAVAILABLE' }, { status: 503 });
    auditKyc(auth.actor, 'ADMIN_KYC_VIEWED', doc.documentId);
    return new Response(await result.data.arrayBuffer(), { headers: { 'Content-Type': 'image/webp', 'Content-Disposition': 'attachment; filename="document.webp"', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ success: false, code: 'PRIVATE_STORAGE_UNAVAILABLE' }, { status: 503 }); }
});
const reviewSchema = z.object({ documentId: z.string().uuid(), decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(400) }).strict().refine(x => x.decision !== 'rejected' || x.note.length >= 3);
export const POST = backendRoute(async (req: ApiRequest) => {
  const auth = authorized(req); if (!auth || !verifyOriginAndCsrf(req, auth.session).ok) return Response.json({ success: false }, { status: 403 });
  if (!checkRateLimit(`kyc_review:${auth.actor.userId}`, 30, 60_000).allowed) return Response.json({ success: false }, { status: 429 });
  let body: unknown; try { body = await req.json(); } catch { return Response.json({ success: false }, { status: 400 }); }
  const parsed = reviewSchema.safeParse(body); if (!parsed.success) return Response.json({ success: false, errorBn: 'প্রত্যাখ্যানের কারণসহ সঠিক তথ্য দিন।' }, { status: 400 });
  return reviewKycRecord(auth.actor, parsed.data.documentId, parsed.data.decision, parsed.data.note) ? Response.json({ success: true }) : Response.json({ success: false, errorBn: 'অপেক্ষমাণ নথি পাওয়া যায়নি।' }, { status: 404 });
});
