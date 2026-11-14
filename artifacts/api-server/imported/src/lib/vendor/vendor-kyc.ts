import { readPhase4BStore, writePhase4BStore, type VendorKycDocument } from '../admin/phase4b-service';
import { appendImmutableAuditLog, readAdminStore, writeAdminStore } from '../admin/phase4a-service';
import type { ActorSecurityContext } from '../../types/permissions';
import { createSupabaseAdminClient, isSupabaseAdminConfigured } from '../supabase/admin';

export const KYC_BUCKET = 'private-ops-evidence';
export function publicKycRecord(doc: VendorKycDocument, admin = false) {
  const { documentId, category, status, createdAt, reviewedAt, reviewNote } = doc;
  return { documentId, category, status, createdAt, reviewedAt, reviewNote, ...(admin ? { vendorId: doc.vendorId, reviewedBy: doc.reviewedBy } : {}) };
}
export function listKycRecords(actor: ActorSecurityContext) {
  const records = readPhase4BStore().kycDocuments ?? [];
  return records.filter(doc => actor.roleSlug === 'super_admin' || (actor.roleSlug === 'vendor' && actor.vendorId === doc.vendorId)).map(doc => publicKycRecord(doc, actor.roleSlug === 'super_admin'));
}
export function findOwnKycRecord(actor: ActorSecurityContext, documentId: string) {
  return (readPhase4BStore().kycDocuments ?? []).find(doc => doc.documentId === documentId && (actor.roleSlug === 'super_admin' || (actor.roleSlug === 'vendor' && actor.vendorId === doc.vendorId))) ?? null;
}
export function auditKyc(actor: ActorSecurityContext, actionCode: string, documentId: string) {
  const admin = readAdminStore();
  appendImmutableAuditLog(admin, { actorUserId: actor.userId, actorUsername: actor.username, actorRole: actor.roleSlug, actionCode, targetType: 'system', targetId: documentId, summaryBn: 'ভেন্ডর নথিতে নিরাপত্তা কার্যক্রম সম্পন্ন হয়েছে।', metadata: {} });
  writeAdminStore(admin);
}
export function addKycRecord(actor: ActorSecurityContext, record: VendorKycDocument) {
  if (actor.roleSlug !== 'vendor' || !actor.vendorId || record.vendorId !== actor.vendorId) return false;
  const state = readPhase4BStore();
  state.kycDocuments ??= [];
  if (state.kycDocuments.filter(doc => doc.vendorId === actor.vendorId).length >= 20) return false;
  state.kycDocuments.push(record);
  writePhase4BStore(state);
  auditKyc(actor, 'VENDOR_KYC_SUBMITTED', record.documentId);
  return true;
}
export function reviewKycRecord(actor: ActorSecurityContext, documentId: string, decision: 'approved' | 'rejected', note: string) {
  if (actor.roleSlug !== 'super_admin') return false;
  const state = readPhase4BStore();
  const doc = state.kycDocuments?.find(item => item.documentId === documentId);
  if (!doc || doc.status !== 'pending_review') return false;
  doc.status = decision; doc.reviewNote = note.trim() || null; doc.reviewedBy = actor.username; doc.reviewedAt = new Date().toISOString();
  writePhase4BStore(state);
  auditKyc(actor, decision === 'approved' ? 'VENDOR_KYC_APPROVED' : 'VENDOR_KYC_REJECTED', documentId);
  return true;
}
export async function privateKycStorage() {
  if (!isSupabaseAdminConfigured()) throw new Error('STORAGE_NOT_CONFIGURED');
  const client = createSupabaseAdminClient();
  const bucket = await client.storage.getBucket(KYC_BUCKET);
  if (bucket.error || !bucket.data || bucket.data.public !== false) throw new Error('PRIVATE_STORAGE_UNAVAILABLE');
  return client.storage.from(KYC_BUCKET);
}
