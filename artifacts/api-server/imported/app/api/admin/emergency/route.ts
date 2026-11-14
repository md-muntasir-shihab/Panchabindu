import { z } from 'zod';
import { ApiRequest, ApiResponse } from '@/src/lib/http';
import { backendRoute } from '@/src/lib/db/backend-route';
import { readPhase4CStore, writePhase4CStore } from '@/src/lib/admin/phase4c-service';
import { appendImmutableAuditLog, getActorSecurityContext, readAdminStore, writeAdminStore } from '@/src/lib/admin/phase4a-service';
import { canAccessAdminWorkspace } from '@/src/types/permissions';
import { ADMIN_SESSION_COOKIE_NAME, extractAdminSessionTokenFromRequest, verifyAdminSessionToken, verifyOriginAndCsrf } from '@/src/lib/security/crypto-session';

const schema = z.object({ active: z.boolean(), reason: z.string().trim().min(5).max(400) }).strict();

async function handlePOST(req: ApiRequest) {
  const token = req.cookies.get(ADMIN_SESSION_COOKIE_NAME)?.value || extractAdminSessionTokenFromRequest(req);
  const session = verifyAdminSessionToken(token);
  if (!session || session.purpose === 'enrollment') return ApiResponse.json({ success: false, errorBn: 'লগইন প্রয়োজন।' }, { status: 401 });
  if (!verifyOriginAndCsrf(req, session).ok) return ApiResponse.json({ success: false, errorBn: 'নিরাপত্তা যাচাই ব্যর্থ হয়েছে।' }, { status: 403 });
  const actor = getActorSecurityContext(session.userId);
  if (!actor || actor.roleSlug !== 'super_admin' || !canAccessAdminWorkspace(actor)) return ApiResponse.json({ success: false, errorBn: 'শুধু সুপার অ্যাডমিন এই নিয়ন্ত্রণ ব্যবহার করতে পারবেন।' }, { status: 403 });
  let body: unknown;
  try { body = await req.json(); } catch { return ApiResponse.json({ success: false, errorBn: 'অনুরোধের তথ্য সঠিক নয়।' }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return ApiResponse.json({ success: false, errorBn: 'সঠিক অবস্থা ও কারণ লিখুন।' }, { status: 400 });
  const state = readPhase4CStore();
  if ((state.emergencyStopActive === true) === parsed.data.active) return ApiResponse.json({ success: true, active: parsed.data.active });
  const admin = readAdminStore();
  state.emergencyStopActive = parsed.data.active;
  appendImmutableAuditLog(admin, { actorUserId: actor.userId, actorUsername: actor.username, actorRole: actor.roleSlug,
    actionCode: parsed.data.active ? 'EMERGENCY_STOP_ACTIVATED' : 'EMERGENCY_STOP_RECOVERED', targetType: 'system', targetId: 'emergency-stop',
    summaryBn: parsed.data.active ? 'জরুরি কার্যক্রম বন্ধ করা হয়েছে।' : 'জরুরি অবস্থা থেকে কার্যক্রম পুনরুদ্ধার করা হয়েছে।', metadata: { reason: parsed.data.reason } });
  writePhase4CStore(state); writeAdminStore(admin);
  return ApiResponse.json({ success: true, active: parsed.data.active });
}

export const POST = backendRoute(handlePOST);
