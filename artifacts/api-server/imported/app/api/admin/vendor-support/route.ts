import { z } from 'zod';
import { ApiRequest } from '@/src/lib/http';
import { backendRoute } from '@/src/lib/db/backend-route';
import { getActorSecurityContext } from '@/src/lib/admin/phase4a-service';
import { canAccessAdminWorkspace } from '@/src/types/permissions';
import { extractAdminSessionTokenFromRequest, verifyAdminSessionToken, verifyOriginAndCsrf, checkRateLimit } from '@/src/lib/security/crypto-session';
import { listSupport, updateSupport } from '@/src/lib/vendor/vendor-support';
function authorized(req: ApiRequest) {
  const session = verifyAdminSessionToken(extractAdminSessionTokenFromRequest(req));
  const actor = session && session.purpose !== 'enrollment' ? getActorSecurityContext(session.userId) : null;
  return session && actor && actor.roleSlug === 'super_admin' && session.roleSlug === actor.roleSlug && canAccessAdminWorkspace(actor) ? { actor, session } : null;
}
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('reply'), ticketId: z.string().uuid(), text: z.string().trim().min(1).max(2000) }).strict(),
  z.object({ action: z.literal('close'), ticketId: z.string().uuid() }).strict(),
]);
export const GET = backendRoute(async (req: ApiRequest) => {
  const auth = authorized(req); if (!auth) return Response.json({ success: false }, { status: 403 });
  return Response.json({ success: true, tickets: listSupport(auth.actor) });
});
export const POST = backendRoute(async (req: ApiRequest) => {
  const auth = authorized(req); if (!auth || !verifyOriginAndCsrf(req, auth.session).ok) return Response.json({ success: false }, { status: 403 });
  if (!checkRateLimit(`support_admin:${auth.actor.userId}`, 40, 60000).allowed) return Response.json({ success: false }, { status: 429 });
  let body: unknown; try { body = await req.json(); } catch { return Response.json({ success: false }, { status: 400 }); }
  const data = schema.safeParse(body); if (!data.success) return Response.json({ success: false }, { status: 400 });
  const ticket = updateSupport(auth.actor, data.data.ticketId, data.data.action, data.data.action === 'reply' ? data.data.text : undefined);
  return ticket ? Response.json({ success: true, ticket }) : Response.json({ success: false }, { status: 409 });
});
