import crypto from 'node:crypto';
import { ApiRequest } from '@/src/lib/http';
import { backendRoute } from '@/src/lib/db/backend-route';
import { onRuntimeRollback } from '@/src/lib/db/runtime-persistence';
import { boundedFormData, processProductImage } from '@/src/lib/media/product-image';
import { authenticateVendorRequest } from '@/src/lib/vendor/vendor-auth';
import { assertVendorAccountUsable, requireOwnProfile, isVendorNotFound } from '@/src/lib/vendor/vendor-workspace-service';
import { addKycRecord, auditKyc, findOwnKycRecord, listKycRecords, privateKycStorage } from '@/src/lib/vendor/vendor-kyc';
import { checkRateLimit } from '@/src/lib/security/crypto-session';

export const GET = backendRoute(async (req: ApiRequest) => {
  const auth = authenticateVendorRequest(req);
  if (!auth.ok) return Response.json({ success: false, errorBn: auth.errorBn }, { status: auth.status });
  const id = new URL(req.url).searchParams.get('documentId');
  if (!id) return Response.json({ success: true, documents: listKycRecords(auth.actor) });
  const doc = findOwnKycRecord(auth.actor, id);
  if (!doc) return Response.json({ success: false }, { status: 404 });
  if (!checkRateLimit(`kyc_read:${auth.actor.userId}`, 30, 60_000).allowed) return Response.json({ success: false }, { status: 429 });
  try {
    const bucket = await privateKycStorage(); const result = await bucket.download(doc.storagePath);
    if (result.error || !result.data) return Response.json({ success: false, code: 'DOCUMENT_UNAVAILABLE' }, { status: 503 });
    auditKyc(auth.actor, 'VENDOR_KYC_VIEWED', doc.documentId);
    return new Response(await result.data.arrayBuffer(), { headers: { 'Content-Type': 'image/webp', 'Content-Disposition': 'attachment; filename="document.webp"', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store' } });
  } catch { return Response.json({ success: false, code: 'PRIVATE_STORAGE_UNAVAILABLE' }, { status: 503 }); }
});

export const POST = backendRoute(async (req: ApiRequest) => {
  const auth = authenticateVendorRequest(req, { requireCsrf: true });
  if (!auth.ok) return Response.json({ success: false, errorBn: auth.errorBn }, { status: auth.status });
  if (!checkRateLimit(`kyc_upload:${auth.actor.userId}`, 10, 60_000).allowed) return Response.json({ success: false }, { status: 429 });
  try {
    const profile = requireOwnProfile(auth.actor);
    const usable = assertVendorAccountUsable(profile, true);
    if (!usable.ok) return Response.json({ success: false, errorBn: usable.errorBn }, { status: 403 });
    if (listKycRecords(auth.actor).length >= 20) return Response.json({ success: false, code: 'DOCUMENT_LIMIT' }, { status: 400 });
    const form = await boundedFormData(req);
    const category = form.get('category'); const file = form.get('file');
    if (typeof category !== 'string' || !['identity', 'business', 'other'].includes(category) || !(file instanceof File)) return Response.json({ success: false, code: 'INVALID_UPLOAD' }, { status: 400 });
    const image = await processProductImage(new Uint8Array(await file.arrayBuffer()), file.name, file.type);
    const documentId = crypto.randomUUID();
    const prefix = crypto.createHash('sha256').update(profile.vendorId).digest('hex');
    const storagePath = `vendor-kyc/${prefix}/${documentId}.webp`;
    const storage = await privateKycStorage();
    // Register compensating cleanup before upload: a provider timeout can be
    // ambiguous even if the object was already written.
    onRuntimeRollback(async () => { const removed = await storage.remove([storagePath]); if (removed.error) throw new Error('KYC_CLEANUP_FAILED'); });
    const result = await storage.upload(storagePath, image.bytes, { contentType: 'image/webp', upsert: false });
    if (result.error) return Response.json({ success: false, code: 'PRIVATE_STORAGE_UNAVAILABLE' }, { status: 503 });
    const saved = addKycRecord(auth.actor, { documentId, vendorId: profile.vendorId, category: category as 'identity' | 'business' | 'other', storagePath, status: 'pending_review', uploadedBy: auth.actor.userId, createdAt: new Date().toISOString(), reviewedBy: null, reviewedAt: null, reviewNote: null });
    if (!saved) return Response.json({ success: false, code: 'DOCUMENT_LIMIT' }, { status: 400 });
    return Response.json({ success: true, documentId }, { status: 201 });
  } catch (error) {
    if (isVendorNotFound(error)) return Response.json({ success: false }, { status: 404 });
    const message = error instanceof Error ? error.message : '';
    const unavailable = ['STORAGE_NOT_CONFIGURED', 'PRIVATE_STORAGE_UNAVAILABLE'].includes(message);
    return Response.json({ success: false, code: unavailable ? 'PRIVATE_STORAGE_UNAVAILABLE' : 'INVALID_UPLOAD', errorBn: unavailable ? 'ব্যক্তিগত স্টোরেজ সংযোগ পাওয়া যায়নি।' : 'শুধু বৈধ JPG, PNG বা WebP ছবি দিন।' }, { status: unavailable ? 503 : 400 });
  }
});
