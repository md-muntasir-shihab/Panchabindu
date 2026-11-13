import { NextRequest } from 'next/server';
import crypto from 'node:crypto';
import { backendRoute } from '@/src/lib/db/backend-route';
import { onRuntimeRollback } from '@/src/lib/db/runtime-persistence';
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from '@/src/lib/supabase/admin';
import { extractAdminSessionTokenFromRequest, verifyAdminSessionToken, verifyOriginAndCsrf, checkRateLimit } from '@/src/lib/security/crypto-session';
import { getActorSecurityContext, appendImmutableAuditLog, readAdminStore, writeAdminStore } from '@/src/lib/admin/phase4a-service';
import { isFirstLoginGateCleared } from '@/src/types/permissions';
import { boundedFormData, processProductImage } from '@/src/lib/media/product-image';

export const runtime = 'nodejs';
export const POST = backendRoute(async (request: NextRequest) => {
  const session = verifyAdminSessionToken(extractAdminSessionTokenFromRequest(request));
  const actor = session && session.purpose !== 'enrollment' ? getActorSecurityContext(session.userId) : null;
  if (!actor || actor.roleSlug !== session?.roleSlug || !isFirstLoginGateCleared(actor)) return Response.json({ success: false }, { status: 401 });
  if (!verifyOriginAndCsrf(request, session).ok || actor.roleSlug !== 'super_admin') return Response.json({ success: false }, { status: 403 });
  if (!checkRateLimit(`brand-media:${actor.userId}`, 15, 60_000).allowed) return Response.json({ success: false }, { status: 429 });
  if (!isSupabaseAdminConfigured()) return Response.json({ success: false, code: 'STORAGE_NOT_CONFIGURED', errorBn: 'ছবি আপলোডের জন্য স্টোরেজ কনফিগার করুন।', errorEn: 'Configure Storage to upload images, or use an existing image URL.' }, { status: 503 });
  try {
    const form = await boundedFormData(request);
    const file = form.get('file');
    if (!(file instanceof File)) return Response.json({ success: false }, { status: 400 });
    const processed = await processProductImage(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    const assetId = crypto.randomUUID();
    const path = `brand/${assetId}.webp`;
    const bucket = createSupabaseAdminClient().storage.from('public-catalog-media');
    const uploaded = await bucket.upload(path, processed.bytes, { contentType: 'image/webp', upsert: false });
    if (uploaded.error) throw new Error('UPLOAD_FAILED');
    onRuntimeRollback(() => bucket.remove([path]));
    const audit = readAdminStore();
    appendImmutableAuditLog(audit, { actorUserId: actor.userId, actorUsername: actor.username, actorRole: actor.roleSlug,
      actionCode: 'BRAND_MEDIA_UPLOADED', targetType: 'system', targetId: assetId,
      summaryBn: 'সুপার অ্যাডমিন স্টোরের জন্য যাচাইকৃত ছবি আপলোড করেছেন।', metadata: { path, sha256: crypto.createHash('sha256').update(processed.bytes).digest('hex') } });
    writeAdminStore(audit);
    return Response.json({ success: true, url: bucket.getPublicUrl(path).data.publicUrl });
  } catch {
    return Response.json({ success: false, code: 'INVALID_IMAGE', errorBn: '৬ এমবির মধ্যে বৈধ JPG, PNG বা WebP ছবি দিন।', errorEn: 'Choose a valid JPG, PNG or WebP image under 6 MB.' }, { status: 422 });
  }
});
