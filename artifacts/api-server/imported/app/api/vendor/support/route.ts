import { z } from 'zod';
import { ApiRequest } from '@/src/lib/http';
import { backendRoute } from '@/src/lib/db/backend-route';
import { authenticateVendorRequest } from '@/src/lib/vendor/vendor-auth';
import { isVendorNotFound, requireOwnProfile } from '@/src/lib/vendor/vendor-workspace-service';
import { checkRateLimit } from '@/src/lib/security/crypto-session';
import { createSupport, listSupport, updateSupport } from '@/src/lib/vendor/vendor-support';

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), subject: z.string().trim().min(3).max(160), text: z.string().trim().min(3).max(2000) }).strict(),
  z.object({ action: z.literal('reply'), ticketId: z.string().uuid(), text: z.string().trim().min(1).max(2000) }).strict(),
]);
export const GET = backendRoute(async (req: ApiRequest) => {
  const auth = authenticateVendorRequest(req); if (!auth.ok) return Response.json({ success: false }, { status: auth.status });
  try { requireOwnProfile(auth.actor); return Response.json({ success: true, tickets: listSupport(auth.actor) }); }
  catch (error) { if (isVendorNotFound(error)) return Response.json({ success: false }, { status: 404 }); throw error; }
});
export const POST = backendRoute(async (req: ApiRequest) => {
  const auth = authenticateVendorRequest(req, { requireCsrf: true }); if (!auth.ok) return Response.json({ success: false }, { status: auth.status });
  if (!checkRateLimit(`support_vendor:${auth.actor.userId}`, 20, 60000).allowed) return Response.json({ success: false }, { status: 429 });
  let body: unknown; try { body = await req.json(); } catch { return Response.json({ success: false }, { status: 400 }); }
  const data = schema.safeParse(body); if (!data.success) return Response.json({ success: false }, { status: 400 });
  try {
    requireOwnProfile(auth.actor);
    const ticket = data.data.action === 'create' ? createSupport(auth.actor, data.data.subject, data.data.text) : updateSupport(auth.actor, data.data.ticketId, 'reply', data.data.text);
    return ticket ? Response.json({ success: true, ticket }, { status: data.data.action === 'create' ? 201 : 200 }) : Response.json({ success: false }, { status: 409 });
  } catch (error) { if (isVendorNotFound(error)) return Response.json({ success: false }, { status: 404 }); throw error; }
});
