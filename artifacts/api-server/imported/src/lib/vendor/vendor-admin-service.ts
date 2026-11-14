// src/lib/vendor/vendor-admin-service.ts
// Super-admin control surface for the vendor panel: create vendors, edit their
// commercial terms, approve self-service requests, and toggle exactly what each
// vendor is allowed to do inside the vendor panel.

import {
  appendImmutableAuditLog,
  readAdminStore,
  writeAdminStore,
} from '../admin/phase4a-service';
import {
  readPhase4BStore,
  submitVendorOnboarding15Q,
  VENDOR_ONBOARDING_15_QUESTIONS,
  writePhase4BStore,
  type VendorProfileRecord,
} from '../admin/phase4b-service';
import { readErpState } from '../db/repository';
import { computeVendorEscrowBalance } from '../money';
import type { ActorSecurityContext } from '../../types/permissions';
import type { VendorEscrowBalance } from '../../types/domain';
import type { VendorStatus } from '../../types/database.types';
import {
  getVendorCapabilities,
  getVendorRestrictionNote,
  resetVendorControls,
  setVendorCapabilities,
  VENDOR_CAPABILITY_LABELS,
  type VendorCapabilityFlags,
} from './vendor-control';
import {
  listVendorRequests,
  updateVendorRequest,
  type VendorSelfServiceRequestRecord,
} from './vendor-request-store';

export interface AdminVendorRowDTO {
  vendorId: string;
  vendorCode: string;
  businessNameBn: string;
  businessNameEn: string;
  ownerNameBn: string;
  contactPhone: string;
  status: VendorStatus;
  defaultCommissionBp: number | null;
  escrowHoldDaysOverride: number | null;
  payoutMethodBn: string;
  payoutAccountNo: string;
  createdAt: string;
  capabilities: VendorCapabilityFlags;
  restrictionNoteBn: string | null;
  balance: VendorEscrowBalance;
  activeProducts: number;
  totalProducts: number;
  pendingRequests: number;
  pendingPayouts: number;
  linkedUsers: Array<{
    userId: string;
    username: string;
    isActive: boolean;
    mustChangePassword: boolean;
    totpEnrolled: boolean;
  }>;
}

export interface AdminVendorRequestDTO {
  requestId: string;
  kind: 'profile_update' | 'onboarding_update';
  status: 'pending_review' | 'approved' | 'rejected';
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  payload: Record<string, unknown>;
  requestedByUsername: string;
  createdAt: string;
  reviewedByUsername: string | null;
  reviewedAt: string | null;
  reviewNoteBn: string | null;
}

export interface AdminVendorControlSnapshot {
  vendors: AdminVendorRowDTO[];
  requests: AdminVendorRequestDTO[];
  capabilityLabels: Array<{
    key: keyof VendorCapabilityFlags;
    labelBn: string;
    labelEn: string;
    hintBn: string;
    hintEn: string;
  }>;
  globalRules: {
    globalDefaultCommissionBp: number;
    globalEscrowHoldDays: number;
    minPayoutRequestPoisha: number;
  };
}

function requireSuperAdmin(actor: ActorSecurityContext): { ok: true } | { ok: false; errorBn: string } {
  if (actor.roleSlug !== 'super_admin') {
    return { ok: false, errorBn: 'শুধুমাত্র সুপার অ্যাডমিন ভেন্ডর নিয়ন্ত্রণ করতে পারবেন।' };
  }
  return { ok: true };
}

function auditAdminVendorAction(
  actor: ActorSecurityContext,
  actionCode: string,
  targetId: string,
  summaryBn: string,
  metadata: Record<string, unknown> = {}
): void {
  const adminStore = readAdminStore();
  appendImmutableAuditLog(adminStore, {
    actorUserId: actor.userId,
    actorUsername: actor.username,
    actorRole: actor.roleSlug,
    actionCode,
    targetType: 'system',
    targetId,
    summaryBn,
    metadata,
  });
  writeAdminStore(adminStore);
}

function toAdminRequestDTO(request: VendorSelfServiceRequestRecord): AdminVendorRequestDTO {
  return {
    requestId: request.requestId,
    kind: request.kind,
    status: request.status,
    vendorId: request.vendorId,
    vendorCode: request.vendorCode,
    vendorNameBn: request.vendorNameBn,
    payload: request.payload,
    requestedByUsername: request.requestedByUsername,
    createdAt: request.createdAt,
    reviewedByUsername: request.reviewedByUsername,
    reviewedAt: request.reviewedAt,
    reviewNoteBn: request.reviewNoteBn,
  };
}

export function getAdminVendorControlSnapshot(): AdminVendorControlSnapshot {
  const erp = readErpState();
  const p4b = readPhase4BStore();
  const adminStore = readAdminStore();
  const requests = listVendorRequests();

  const vendors: AdminVendorRowDTO[] = p4b.vendors.map((vendor: VendorProfileRecord) => {
    const entries = p4b.vendorLedger.filter((entry) => entry.vendorId === vendor.vendorId);
    const ownProducts = erp.products.filter((product) => product.vendorId === vendor.vendorId);
    return {
      vendorId: vendor.vendorId,
      vendorCode: vendor.vendorCode,
      businessNameBn: vendor.businessNameBn,
      businessNameEn: vendor.businessNameEn,
      ownerNameBn: vendor.ownerNameBn,
      contactPhone: vendor.contactPhone,
      status: vendor.status,
      defaultCommissionBp: vendor.defaultCommissionBp,
      escrowHoldDaysOverride: vendor.escrowHoldDaysOverride,
      payoutMethodBn: vendor.payoutMethodBn,
      payoutAccountNo: vendor.payoutAccountNo,
      createdAt: vendor.createdAt,
      capabilities: getVendorCapabilities(vendor.vendorId),
      restrictionNoteBn: getVendorRestrictionNote(vendor.vendorId),
      balance: computeVendorEscrowBalance(vendor.vendorId, entries),
      activeProducts: ownProducts.filter((product) => product.status === 'active').length,
      totalProducts: ownProducts.length,
      pendingRequests: requests.filter(
        (request) => request.vendorId === vendor.vendorId && request.status === 'pending_review'
      ).length,
      pendingPayouts: p4b.payoutRequests.filter(
        (payout) =>
          payout.vendorId === vendor.vendorId &&
          (payout.status === 'requested' || payout.status === 'approved')
      ).length,
      linkedUsers: adminStore.users
        .filter((user) => user.vendorId === vendor.vendorId)
        .map((user) => ({
          userId: user.userId,
          username: user.username,
          isActive: user.isActive,
          mustChangePassword: user.mustChangePassword,
          totpEnrolled: user.totpEnrolled,
        })),
    };
  });

  return {
    vendors,
    requests: requests.map(toAdminRequestDTO),
    capabilityLabels: VENDOR_CAPABILITY_LABELS,
    globalRules: {
      globalDefaultCommissionBp: erp.siteSettings.globalDefaultCommissionBp,
      globalEscrowHoldDays: erp.siteSettings.globalEscrowHoldDays,
      minPayoutRequestPoisha: erp.siteSettings.minPayoutRequestPoisha,
    },
  };
}

export function adminSetVendorCapabilities(
  actor: ActorSecurityContext,
  input: { vendorId: string; patch: Partial<VendorCapabilityFlags>; restrictionNoteBn?: string }
): { success: boolean; errorBn?: string; capabilities?: VendorCapabilityFlags } {
  const guard = requireSuperAdmin(actor);
  if (!guard.ok) return { success: false, errorBn: guard.errorBn };

  const vendor = readPhase4BStore().vendors.find((item) => item.vendorId === input.vendorId);
  if (!vendor) return { success: false, errorBn: 'ভেন্ডর পাওয়া যায়নি।' };

  const capabilities = setVendorCapabilities(
    vendor.vendorId,
    input.patch,
    actor.username,
    input.restrictionNoteBn
  );

  auditAdminVendorAction(
    actor,
    'VENDOR_CAPABILITIES_UPDATED',
    vendor.vendorCode,
    `${vendor.businessNameBn} (${vendor.vendorCode}) এর ভেন্ডর প্যানেল অনুমতি আপডেট হয়েছে।`,
    { capabilities }
  );

  return { success: true, capabilities };
}

export function adminResetVendorCapabilities(
  actor: ActorSecurityContext,
  input: { vendorId: string }
): { success: boolean; errorBn?: string; capabilities?: VendorCapabilityFlags } {
  const guard = requireSuperAdmin(actor);
  if (!guard.ok) return { success: false, errorBn: guard.errorBn };

  const vendor = readPhase4BStore().vendors.find((item) => item.vendorId === input.vendorId);
  if (!vendor) return { success: false, errorBn: 'ভেন্ডর পাওয়া যায়নি।' };

  const capabilities = resetVendorControls(vendor.vendorId, actor.username);

  auditAdminVendorAction(
    actor,
    'VENDOR_CAPABILITIES_RESET',
    vendor.vendorCode,
    `${vendor.businessNameBn} (${vendor.vendorCode}) এর ভেন্ডর প্যানেল অনুমতি ডিফল্টে ফেরানো হয়েছে।`,
    { capabilities }
  );

  return { success: true, capabilities };
}

export function adminUpdateVendorProfile(
  actor: ActorSecurityContext,
  input: {
    vendorId: string;
    businessNameBn?: string;
    businessNameEn?: string;
    ownerNameBn?: string;
    contactPhone?: string;
    payoutMethodBn?: string;
    payoutAccountNo?: string;
    defaultCommissionBp?: number | null;
    escrowHoldDaysOverride?: number | null;
    status?: VendorStatus;
    activationReason?: string;
  }
): { success: boolean; errorBn?: string } {
  const guard = requireSuperAdmin(actor);
  if (!guard.ok) return { success: false, errorBn: guard.errorBn };

  const p4b = readPhase4BStore();
  const vendor = p4b.vendors.find((item) => item.vendorId === input.vendorId);
  if (!vendor) return { success: false, errorBn: 'ভেন্ডর পাওয়া যায়নি।' };
  if (input.status === 'closed' && vendor.status !== 'closed') return { success: false, errorBn: 'অ্যাকাউন্ট বন্ধ করতে স্টক ও আর্থিক ক্লোজিং অডিট ব্যবহার করুন।' };
  if (vendor.status === 'closed' && input.status && input.status !== 'closed') return { success: false, errorBn: 'বন্ধ চুক্তি এই পদ্ধতিতে পুনরায় চালু করা যাবে না।' };
  if (vendor.status === 'pending_onboarding' && input.status && !['pending_onboarding', 'active'].includes(input.status)) return { success: false, errorBn: 'অপেক্ষমাণ ভেন্ডরকে আগে পর্যালোচনা করুন; অ্যাকাউন্ট বন্ধ করতে ক্লোজিং অডিট ব্যবহার করুন।' };
  if (vendor.status === 'pending_onboarding' && input.status === 'active') {
    const unanswered = VENDOR_ONBOARDING_15_QUESTIONS.some(q => (vendor.onboardingAnswers15?.[q.key] ?? '').trim().length < 2);
    if (unanswered) return { success: false, errorBn: 'ভেন্ডরের ১৫টি অনবোর্ডিং উত্তর জমা ও অনুমোদন করা প্রয়োজন।' };
    if ((input.activationReason ?? '').trim().length < 5) return { success: false, errorBn: 'পর্যালোচনার কারণ অন্তত ৫ অক্ষরে লিখুন।' };
  }

  if (input.contactPhone && !/^01[3-9]\d{8}$/.test(input.contactPhone.trim())) {
    return { success: false, errorBn: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন।' };
  }
  if (input.defaultCommissionBp !== undefined && input.defaultCommissionBp !== null &&
      (!Number.isInteger(input.defaultCommissionBp) || input.defaultCommissionBp < 0 || input.defaultCommissionBp > 5000)) {
    return { success: false, errorBn: 'কমিশন ০–৫০% (০–৫০০০ bp) এর মধ্যে হতে হবে।' };
  }
  if (input.escrowHoldDaysOverride !== undefined && input.escrowHoldDaysOverride !== null &&
      (!Number.isInteger(input.escrowHoldDaysOverride) || input.escrowHoldDaysOverride < 1 || input.escrowHoldDaysOverride > 30)) {
    return { success: false, errorBn: 'এসক্রো হোল্ড ১–৩০ দিনের মধ্যে হতে হবে।' };
  }

  const wasPendingActivation = vendor.status === 'pending_onboarding' && input.status === 'active';
  const before = JSON.stringify(vendor);
  if (input.businessNameBn?.trim()) vendor.businessNameBn = input.businessNameBn.trim();
  if (input.businessNameEn?.trim()) vendor.businessNameEn = input.businessNameEn.trim();
  if (input.ownerNameBn?.trim()) vendor.ownerNameBn = input.ownerNameBn.trim();
  if (input.contactPhone?.trim()) vendor.contactPhone = input.contactPhone.trim();
  if (input.payoutMethodBn?.trim()) vendor.payoutMethodBn = input.payoutMethodBn.trim();
  if (input.payoutAccountNo?.trim()) vendor.payoutAccountNo = input.payoutAccountNo.trim();
  if (input.defaultCommissionBp !== undefined) vendor.defaultCommissionBp = input.defaultCommissionBp;
  if (input.escrowHoldDaysOverride !== undefined) vendor.escrowHoldDaysOverride = input.escrowHoldDaysOverride;
  if (input.status) vendor.status = input.status;

  writePhase4BStore(p4b);

  auditAdminVendorAction(
    actor,
    'VENDOR_PROFILE_UPDATED_BY_ADMIN',
    vendor.vendorCode,
    `সুপার অ্যাডমিন ${vendor.businessNameBn} (${vendor.vendorCode}) এর প্রোফাইল/শর্তাবলি আপডেট করেছেন।`,
    { changed: before !== JSON.stringify(vendor), status: vendor.status, ...(wasPendingActivation ? { activationReason: input.activationReason!.trim() } : {}) }
  );

  return { success: true };
}

export function adminDecideVendorRequest(
  actor: ActorSecurityContext,
  input: { requestId: string; decision: 'approve' | 'reject'; reviewNoteBn?: string }
): { success: boolean; errorBn?: string } {
  const guard = requireSuperAdmin(actor);
  if (!guard.ok) return { success: false, errorBn: guard.errorBn };

  const request = listVendorRequests().find((item) => item.requestId === input.requestId);
  if (!request) return { success: false, errorBn: 'অনুরোধ পাওয়া যায়নি।' };
  if (request.status !== 'pending_review') {
    return { success: false, errorBn: 'এই অনুরোধ ইতিমধ্যে নিষ্পত্তি হয়েছে।' };
  }
  if (input.decision === 'reject' && (input.reviewNoteBn ?? '').trim().length < 3) {
    return { success: false, errorBn: 'প্রত্যাখ্যানের কারণ লিখুন।' };
  }

  if (input.decision === 'approve') {
    const p4b = readPhase4BStore();
    const vendor = p4b.vendors.find((item) => item.vendorId === request.vendorId);
    if (!vendor) return { success: false, errorBn: 'ভেন্ডর পাওয়া যায়নি।' };

    if (request.kind === 'profile_update') {
      const payload = request.payload as Record<string, string | undefined>;
      if (payload.businessNameBn) vendor.businessNameBn = payload.businessNameBn;
      if (payload.businessNameEn) vendor.businessNameEn = payload.businessNameEn;
      if (payload.ownerNameBn) vendor.ownerNameBn = payload.ownerNameBn;
      if (payload.contactPhone) vendor.contactPhone = payload.contactPhone;
      if (payload.payoutMethodBn) vendor.payoutMethodBn = payload.payoutMethodBn;
      if (payload.payoutAccountNo) vendor.payoutAccountNo = payload.payoutAccountNo;
      writePhase4BStore(p4b);
    } else {
      const answers = (request.payload as { answers15?: Record<string, string> }).answers15 ?? {};
      const missing = VENDOR_ONBOARDING_15_QUESTIONS.filter(
        (question) => (answers[question.key] ?? '').trim().length < 2
      );
      if (missing.length > 0) return { success: false, errorBn: '১৫-প্রশ্নের সব উত্তর সম্পূর্ণ নয়।' };
      vendor.onboardingAnswers15 = { ...vendor.onboardingAnswers15, ...answers };
      writePhase4BStore(p4b);
    }
  }

  const nextStatus: 'approved' | 'rejected' = input.decision === 'approve' ? 'approved' : 'rejected';
  updateVendorRequest(request.requestId, {
    status: nextStatus,
    reviewedByUsername: actor.username,
    reviewedAt: new Date().toISOString(),
    reviewNoteBn: input.reviewNoteBn?.trim() || null,
  });

  auditAdminVendorAction(
    actor,
    `VENDOR_REQUEST_${nextStatus.toUpperCase()}`,
    request.vendorCode,
    `${request.vendorNameBn} (${request.vendorCode}) এর ${request.kind === 'profile_update' ? 'প্রোফাইল' : 'অনবোর্ডিং'} অনুরোধ ${nextStatus === 'approved' ? 'অনুমোদিত' : 'প্রত্যাখ্যাত'} হয়েছে।`,
    { requestId: request.requestId }
  );

  return { success: true };
}

/** Creates a vendor profile in one step (no 15-question wizard) for admin onboarding. */
export function adminCreateVendor(
  actor: ActorSecurityContext,
  input: {
    businessNameBn: string;
    businessNameEn?: string;
    ownerNameBn: string;
    contactPhone: string;
    defaultCommissionBp: number;
    escrowHoldDaysOverride: number;
    payoutMethodBn: string;
    payoutAccountNo: string;
    status?: VendorStatus;
  }
): { success: boolean; errorBn?: string; vendorCode?: string; vendorId?: string } {
  const guard = requireSuperAdmin(actor);
  if (!guard.ok) return { success: false, errorBn: guard.errorBn };

  if (!/^01[3-9]\d{8}$/.test(input.contactPhone.trim())) {
    return { success: false, errorBn: 'সঠিক বাংলাদেশি মোবাইল নম্বর দিন।' };
  }

  const result = submitVendorOnboarding15Q(actor, {
    businessNameBn: input.businessNameBn,
    businessNameEn: input.businessNameEn,
    ownerNameBn: input.ownerNameBn,
    contactPhone: input.contactPhone,
    defaultCommissionBp: input.defaultCommissionBp,
    escrowHoldDaysOverride: input.escrowHoldDaysOverride,
    payoutMethodBn: input.payoutMethodBn,
    payoutAccountNo: input.payoutAccountNo,
    answers15: {},
  }, { draft: true });

  if (!result.success || !result.vendor) {
    return { success: false, errorBn: result.errorBn ?? 'ভেন্ডর তৈরি করা যায়নি।' };
  }


  return { success: true, vendorCode: result.vendor.vendorCode, vendorId: result.vendor.vendorId };
}
