import { ApiRequest as NextRequest } from '@/src/lib/http';
import crypto from 'node:crypto';
import { backendRoute } from '@/src/lib/db/backend-route';
import { readErpState, writeErpState } from '@/src/lib/db/repository';
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
  if (!verifyOriginAndCsrf(request, session).ok || !['super_admin', 'vendor'].includes(actor.roleSlug)) return Response.json({ success: false }, { status: 403 });
  if (!checkRateLimit(`media:${actor.userId}`, 20, 60_000).allowed) return Response.json({ success: false }, { status: 429 });
  if (!isSupabaseAdminConfigured()) return Response.json({ success: false, code: 'STORAGE_NOT_CONFIGURED' }, { status: 503 });
  try {
    const form = await boundedFormData(request);
    const productId = form.get('productId');
    const file = form.get('file');
    if (typeof productId !== 'string' || !(file instanceof File)) return Response.json({ success: false, code: 'INVALID_UPLOAD' }, { status: 400 });
    const state = readErpState();
    const product = state.products.find(product => product.productId === productId);
    if (!product || (actor.roleSlug === 'vendor' && actor.vendorId !== product.vendorId)) return Response.json({ success: false }, { status: 404 });
    const processed = await processProductImage(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    const hash = crypto.createHash('sha256').update(processed.bytes).digest('hex');
    const duplicate = state.mediaAssets?.find(asset => asset.productId === productId && asset.sha256 === hash);
    if (duplicate) return Response.json({ success: true, assetId: duplicate.assetId, status: duplicate.status });
    const assetId = crypto.randomUUID();
    const stagingPath = `${product.vendorId}/${assetId}.webp`;
    const storage = createSupabaseAdminClient().storage.from('product-staging');
    const uploaded = await storage.upload(stagingPath, processed.bytes, { contentType: 'image/webp', upsert: false });
    if (uploaded.error) throw new Error('STORAGE_UPLOAD_FAILED');
    onRuntimeRollback(() => storage.remove([stagingPath]));
    state.mediaAssets ??= [];
    state.mediaAssets.push({ assetId, productId, vendorId: product.vendorId, uploaderId: actor.userId,
      stagingPath, publicPath: null, status: 'pending', sha256: hash, width: processed.width, height: processed.height,
      createdAt: new Date().toISOString(), approvedBy: null,
    });
    writeErpState(state);
    const audit = readAdminStore();
    appendImmutableAuditLog(audit, { actorUserId: actor.userId, actorUsername: actor.username, actorRole: actor.roleSlug,
      actionCode: 'PRODUCT_MEDIA_STAGED', targetType: 'product', targetId: productId,
      summaryBn: 'পণ্যের ছবি নিরাপদ যাচাই শেষে অনুমোদনের জন্য জমা হয়েছে।', metadata: { assetId, sha256: hash },
    });
    writeAdminStore(audit);
    return Response.json({ success: true, assetId, status: 'pending' }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error && ['UPLOAD_TOO_LARGE', 'INVALID_IMAGE', 'INVALID_IMAGE_DIMENSIONS'].includes(error.message) ? error.message : 'UPLOAD_FAILED';
    return Response.json({ success: false, code }, { status: code === 'UPLOAD_TOO_LARGE' ? 413 : 422 });
  }
});
