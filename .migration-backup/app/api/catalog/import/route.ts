import { NextRequest } from 'next/server';
import { z } from 'zod';
import { backendRoute } from '@/src/lib/db/backend-route';
import { extractAdminSessionTokenFromRequest, verifyAdminSessionToken, verifyOriginAndCsrf, checkRateLimit } from '@/src/lib/security/crypto-session';
import { getActorSecurityContext } from '@/src/lib/admin/phase4a-service';
import { isFirstLoginGateCleared } from '@/src/types/permissions';
import { CATALOG_IMPORT_COLUMNS, commitCatalogImport, planCatalogImport } from '@/src/lib/media/catalog-import';

const schema = z.object({ mode: z.enum(['preview', 'commit']), csv: z.string().max(256 * 1024),
  previewHash: z.string().length(64).optional(), mapping: z.record(z.string(), z.string()).optional(),
});

export const POST = backendRoute(async (request: NextRequest) => {
  const session = verifyAdminSessionToken(extractAdminSessionTokenFromRequest(request));
  const actor = session && session.purpose !== 'enrollment' ? getActorSecurityContext(session.userId) : null;
  if (!actor || actor.roleSlug !== session?.roleSlug || !isFirstLoginGateCleared(actor)) return Response.json({ success: false }, { status: 401 });
  if (actor.roleSlug !== 'super_admin' || !verifyOriginAndCsrf(request, session).ok) return Response.json({ success: false }, { status: 403 });
  if (!checkRateLimit(`catalog-import:${actor.userId}`, 10, 60_000).allowed) return Response.json({ success: false }, { status: 429 });
  const raw = await request.text();
  if (Buffer.byteLength(raw) > 300 * 1024) return Response.json({ success: false }, { status: 413 });
  try {
    const body = schema.parse(JSON.parse(raw));
    if (body.mode === 'commit') return Response.json(commitCatalogImport(actor, body.csv, body.previewHash ?? '', body.mapping));
    const plan = planCatalogImport(body.csv, actor.userId, body.mapping);
    return Response.json({ success: true, columns: CATALOG_IMPORT_COLUMNS, previewHash: plan.previewHash, errors: plan.errors,
      rowCount: plan.rowCount, items: plan.items.map(item => ({ nameBn: item.nameBn, nameEn: item.nameEn, sku: item.variants[0].publicSku, status: 'draft' })),
    });
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_]+$/.test(error.message) ? error.message : 'INVALID_CSV';
    return Response.json({ success: false, code, errorBn: 'সিএসভি যাচাই করে আবার প্রিভিউ দেখুন।', errorEn: 'Check the CSV and review a fresh preview.' }, { status: 422 });
  }
});
