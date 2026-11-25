/**
 * Customer 360 privacy route — POST /api/admin/customer-privacy
 * Actions: reveal (log-only), export (JSON of the customer's own data),
 * consent-record (append consent proof for a linked account).
 *
 * Server-side RBAC identical to the admin analytics route. Every action is
 * written to the append-only admin audit log with actor + action + target.
 *
 * [ASSUMED] — not run yet. Verify: pnpm --filter @workspace/api-server run typecheck.
 */
import { ApiRequest } from '@/src/lib/http';
import { backendRoute } from '@/src/lib/db/backend-route';
import { getActorSecurityContext } from '@/src/lib/admin/phase4a-service';
import { canAccessAdminWorkspace } from '@/src/types/permissions';
import {
  extractAdminSessionTokenFromRequest,
  verifyAdminSessionToken,
} from '@/src/lib/security/crypto-session';
import { assertJsonBodySize, checkRateLimit } from '@/src/lib/security/crypto-session';

interface CustomerPrivacyRequest {
  action: 'reveal' | 'export' | 'consent_record';
  /** normalized BD phone key, as used across the CRM panels */
  phoneKey: string;
  consentChoice?: 'accept' | 'decline' | 'choose';
  consentVersion?: number;
}

interface CustomerPrivacyResponse {
  success: boolean;
  code?: string;
  errorBn?: string;
  errorEn?: string;
  /** reveal action only: the full phone for the operator, never stored */
  fullPhone?: string;
  /** export action only: the customer's own data payload */
  exportPayload?: Record<string, unknown>;
}

function authorizedStaff(req: ApiRequest) {
  const session = verifyAdminSessionToken(extractAdminSessionTokenFromRequest(req));
  const actor =
    session && session.purpose !== 'enrollment'
      ? getActorSecurityContext(session.userId)
      : null;
  return session && actor && canAccessAdminWorkspace(actor)
    ? { actor, session }
    : null;
}

export const POST = backendRoute(async (req: ApiRequest) => {
  const auth = authorizedStaff(req);
  if (!auth) {
    return Response.json(
      {
        success: false,
        code: 'FORBIDDEN',
        errorBn: 'শুধুমাত্র অনুমোদিত স্টাফ গ্রাহকের তথ্য দেখতে পারবেন।',
        errorEn: 'Only authorized staff can access customer privacy actions.',
      } satisfies CustomerPrivacyResponse,
      { status: 403 }
    );
  }

  const raw = await req.text();
  if (!assertJsonBodySize(raw, 8 * 1024).ok) {
    return Response.json(
      { success: false, code: 'PAYLOAD_TOO_LARGE' } satisfies CustomerPrivacyResponse,
      { status: 413 }
    );
  }

  let body: CustomerPrivacyRequest;
  try {
    body = JSON.parse(raw) as CustomerPrivacyRequest;
  } catch {
    return Response.json({ success: false, code: 'INVALID_JSON' } satisfies CustomerPrivacyResponse, { status: 400 });
  }

  const phoneKey = typeof body.phoneKey === 'string' ? body.phoneKey.slice(0, 20) : '';
  if (!/^[0-9]{11}$/.test(phoneKey)) {
    return Response.json(
      {
        success: false,
        code: 'INVALID_PHONE_KEY',
        errorBn: 'সঠিক ফোন কী প্রয়োজন।',
        errorEn: 'A valid phone key is required.',
      } satisfies CustomerPrivacyResponse,
      { status: 400 }
    );
  }

  if (!checkRateLimit(`cust-privacy:${auth.actor.userId}`, 20, 60_000).allowed) {
    return Response.json(
      { success: false, code: 'RATE_LIMITED' } satisfies CustomerPrivacyResponse,
      { status: 429 }
    );
  }

  // Lazy import avoids cycles: phase4a exports the audit + admin-store helpers.
  const {
    appendImmutableAuditLog,
    readAdminStore,
    writeAdminStore,
  } = await import('@/src/lib/admin/phase4a-service');
  const { normalizeBdPhone } = await import('@/src/lib/validators');

  if (body.action === 'reveal') {
    const full = normalizeBdPhone(phoneKey) || phoneKey;
    const store = readAdminStore();
    appendImmutableAuditLog(store, {
      actorUserId: auth.actor.userId,
      actorUsername: auth.session.username,
      actorRole: auth.actor.roleSlug,
      actionCode: 'CUSTOMER_PII_REVEALED',
      targetType: 'user',
      targetId: phoneKey,
      summaryBn: `স্টাফ গ্রাহকের সম্পূর্ণ ফোন নম্বর দেখেছেন (${phoneKey.slice(0, 4)}•••••)।`,
      metadata: { phoneKey },
    });
    writeAdminStore(store);
    return Response.json(
      { success: true, fullPhone: full } satisfies CustomerPrivacyResponse,
      { status: 200 }
    );
  }

  if (body.action === 'export') {
    const store = readAdminStore();
    appendImmutableAuditLog(store, {
      actorUserId: auth.actor.userId,
      actorUsername: auth.session.username,
      actorRole: auth.actor.roleSlug,
      actionCode: 'CUSTOMER_DATA_EXPORTED',
      targetType: 'user',
      targetId: phoneKey,
      summaryBn: 'গ্রাহকের নিজের তথ্য এক্সপোর্ট করা হয়েছে (DSR)।',
      metadata: { phoneKey },
    });
    writeAdminStore(store);
    // The actual data assembly reuses the CRM panel's client-side join over the
    // workspace snapshot — the route only authorizes + audit-logs the export.
    // Full server-side assembly is a follow-up once the CRM service function is traced.
    return Response.json(
      { success: true, exportPayload: { phoneKey, note: 'ASSEMBLE_CLIENT_SIDE' } } satisfies CustomerPrivacyResponse,
      { status: 200 }
    );
  }

  if (body.action === 'consent_record') {
    const choice = body.consentChoice;
    if (choice !== 'accept' && choice !== 'decline' && choice !== 'choose') {
      return Response.json(
        { success: false, code: 'INVALID_CONSENT' } satisfies CustomerPrivacyResponse,
        { status: 400 }
      );
    }
    const store = readAdminStore();
    appendImmutableAuditLog(store, {
      actorUserId: auth.actor.userId,
      actorUsername: auth.session.username,
      actorRole: auth.actor.roleSlug,
      actionCode: 'CUSTOMER_CONSENT_RECORDED',
      targetType: 'user',
      targetId: phoneKey,
      summaryBn: `গ্রাহকের সম্মতি রেকর্ড: ${choice}`,
      metadata: { phoneKey, choice, version: body.consentVersion ?? 1 },
    });
    writeAdminStore(store);
    return Response.json({ success: true } satisfies CustomerPrivacyResponse, { status: 200 });
  }

  return Response.json(
    {
      success: false,
      code: 'UNKNOWN_ACTION',
      errorBn: 'অজানা অ্যাকশন।',
      errorEn: 'Unknown action.',
    } satisfies CustomerPrivacyResponse,
    { status: 400 }
  );
});
