import { ApiRequest as NextRequest } from '@/src/lib/http';
import { backendRoute } from '@/src/lib/db/backend-route';
import { readErpState, writeErpState } from '@/src/lib/db/repository';
import { onRuntimeRollback } from '@/src/lib/db/runtime-persistence';
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from '@/src/lib/supabase/admin';
import { extractAdminSessionTokenFromRequest, verifyAdminSessionToken, verifyOriginAndCsrf } from '@/src/lib/security/crypto-session';
import { getActorSecurityContext, appendImmutableAuditLog, readAdminStore, writeAdminStore } from '@/src/lib/admin/phase4a-service';
import { isFirstLoginGateCleared } from '@/src/types/permissions';
import { prioritizeApprovedImage } from '@/src/lib/media/product-gallery';

type Context = { params: Promise<{ assetId: string }> };

export const GET = backendRoute(async (request: NextRequest, context: Context) => {
  const session = verifyAdminSessionToken(extractAdminSessionTokenFromRequest(request));
  const actor = session && session.purpose !== 'enrollment' ? getActorSecurityContext(session.userId) : null;
  if (!actor || actor.roleSlug !== session?.roleSlug || !isFirstLoginGateCleared(actor)) return Response.json({ success: false }, { status: 401 });
  const { assetId } = await context.params;
  const asset = readErpState().mediaAssets?.find(asset => asset.assetId === assetId);
  if (!asset || (actor.roleSlug !== 'super_admin' && (actor.roleSlug !== 'vendor' || actor.vendorId !== asset.vendorId))) {
    return Response.json({ success: false }, { status: 404 });
  }
  if (!isSupabaseAdminConfigured()) return Response.json({ success: false, code: 'STORAGE_NOT_CONFIGURED' }, { status: 503 });
  const result = await createSupabaseAdminClient().storage.from('product-staging').createSignedUrl(asset.stagingPath, 600);
  if (result.error) return Response.json({ success: false }, { status: 503 });
  return Response.json({ success: true, assetId, status: asset.status, previewUrl: result.data.signedUrl });
});

export const POST = backendRoute(async (request: NextRequest, context: Context) => {
  const session = verifyAdminSessionToken(extractAdminSessionTokenFromRequest(request));
  const actor = session && session.purpose !== 'enrollment' ? getActorSecurityContext(session.userId) : null;
  if (!actor || actor.roleSlug !== session?.roleSlug || !isFirstLoginGateCleared(actor)) return Response.json({ success: false }, { status: 401 });
  if (actor.roleSlug !== 'super_admin' || !verifyOriginAndCsrf(request, session).ok) return Response.json({ success: false }, { status: 403 });
  const { assetId } = await context.params;
  const state = readErpState();
  const asset = state.mediaAssets?.find(asset => asset.assetId === assetId);
  const product = asset && state.products.find(product => product.productId === asset.productId && product.vendorId === asset.vendorId);
  if (!asset || !product) return Response.json({ success: false }, { status: 404 });
  if (!isSupabaseAdminConfigured()) return Response.json({ success: false, code: 'STORAGE_NOT_CONFIGURED' }, { status: 503 });
  const storage = createSupabaseAdminClient().storage;
  if (asset.status === 'approved' && asset.publicPath) {
    return Response.json({ success: true, url: storage.from('public-catalog-media').getPublicUrl(asset.publicPath).data.publicUrl });
  }
  const source = await storage.from('product-staging').download(asset.stagingPath);
  if (source.error) return Response.json({ success: false }, { status: 503 });
  const publicPath = `${asset.vendorId}/${asset.assetId}.webp`;
  const result = await storage.from('public-catalog-media').upload(publicPath, source.data, { contentType: 'image/webp', upsert: false });
  if (result.error) return Response.json({ success: false }, { status: 503 });
  onRuntimeRollback(() => storage.from('public-catalog-media').remove([publicPath]));
  const url = storage.from('public-catalog-media').getPublicUrl(publicPath).data.publicUrl;
  asset.status = 'approved';
  asset.approvedBy = actor.userId;
  asset.publicPath = publicPath;
  // The newly approved image must be visible as the product card cover.
  product.images = prioritizeApprovedImage(product.images, url);
  writeErpState(state);
  const audit = readAdminStore();
  appendImmutableAuditLog(audit, { actorUserId: actor.userId, actorUsername: actor.username, actorRole: actor.roleSlug,
    actionCode: 'PRODUCT_MEDIA_APPROVED', targetType: 'product', targetId: product.productId,
    summaryBn: 'পণ্যের ছবি পর্যালোচনা শেষে প্রকাশের অনুমোদন দেওয়া হয়েছে।', metadata: { assetId },
  });
  writeAdminStore(audit);
  return Response.json({ success: true, assetId, url });
});
