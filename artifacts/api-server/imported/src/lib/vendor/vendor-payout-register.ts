// src/lib/vendor/vendor-payout-register.ts
// ADMIN → VENDOR PAYOUT REGISTER
// The admin payout screen answers one question above all others: "কে কত টাকা
// পেল, আর কে এখনো পায়নি?" Until now the workspace snapshot shipped the raw
// payout records, so the panel could only render a flat list — no totals, no
// per-vendor roll-up, no status trail, and no way to see who disbursed what.
//
// This module turns the append-only payout ledger into an accounting register:
//   • one row per payout with its full lifecycle trail
//   • per-vendor and per-method totals computed from the same rows
//   • explicit "who paid it" attribution from the immutable audit log
//   • the maker-checker state, so the UI can explain why a button is disabled
//
// Everything here is read-only except the four lifecycle actions, and each of
// those delegates to the existing audited domain functions rather than
// re-implementing settlement.

import { readAdminStore } from '../admin/phase4a-service';
import {
  readPhase4BStore,
  resolveVendorPayoutRequest,
  requestVendorPayout,
  type VendorPayoutRequestRecord,
} from '../admin/phase4b-service';
import { readErpState } from '../db/repository';
import { computeVendorEscrowBalance } from '../money';
import type { ActorSecurityContext } from '../../types/permissions';
import type { VendorEscrowBalance } from '../../types/domain';

/** bkash merchant cash-out, matching the rate the panel quotes elsewhere. */
export const DEFAULT_PAYOUT_FEE_BP = 185;

export type PayoutStatusValue = 'requested' | 'approved' | 'rejected' | 'paid';

export interface AdminVendorPayoutRowDTO {
  payoutId: string;
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  status: PayoutStatusValue;
  requestedAmountPoisha: number;
  /** Estimated cash-out deduction; null until a channel fee is known. */
  estimatedFeePoisha: number;
  /** What the vendor's account actually receives after the fee. */
  netPayablePoisha: number;
  payoutMethodBn: string;
  payoutAccountMasked: string;
  requestedByUsername: string;
  requestedAt: string;
  resolvedAt: string | null;
  rejectionReasonBn: string | null;
  paymentTrxId: string | null;
  proofUrl: string | null;
  /** Username of whoever marked it paid, resolved from the audit trail. */
  paidByUsername: string | null;
  /** Username of whoever approved it, resolved from the audit trail. */
  approvedByUsername: string | null;
  /**
   * True when the current viewer is the same person who raised the request, so
   * maker-checker will refuse. The UI shows this instead of letting the admin
   * press a button that is guaranteed to fail.
   */
  blocksCurrentUser: boolean;
  /** Ordered lifecycle trail for the detail drawer. */
  timeline: Array<{ at: string; eventBn: string; eventEn: string; actor: string | null }>;
}

export interface AdminVendorPayoutTotalsDTO {
  requestedCount: number;
  requestedPoisha: number;
  approvedCount: number;
  approvedPoisha: number;
  paidCount: number;
  paidPoisha: number;
  rejectedCount: number;
  rejectedPoisha: number;
  /** Sum of everything already disbursed, the headline "how much we paid". */
  totalDisbursedPoisha: number;
  /** Still owed to vendors but not yet sent. */
  totalOutstandingPoisha: number;
  estimatedFeePoisha: number;
  /** Funds still sitting in escrow waiting to mature across all vendors. */
  escrowHeldPoisha: number;
}

export interface AdminVendorPayoutVendorRollupDTO {
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  requestedCount: number;
  paidCount: number;
  paidPoisha: number;
  outstandingPoisha: number;
  lastPaidAt: string | null;
  balance: VendorEscrowBalance;
}

export interface AdminVendorPayoutRegisterDTO {
  rows: AdminVendorPayoutRowDTO[];
  totals: AdminVendorPayoutTotalsDTO;
  vendorRollups: AdminVendorPayoutVendorRollupDTO[];
  methodTotals: Array<{ payoutMethodBn: string; count: number; paidPoisha: number }>;
  minPayoutRequestPoisha: number;
  generatedAt: string;
}

interface AuditRow {
  actionCode: string;
  actorUsername: string;
  targetId: string;
  createdAt: string;
  summaryBn: string;
}

function maskAccount(accountNo: string): string {
  const digits = (accountNo ?? '').replace(/\s+/g, '');
  if (digits.length <= 4) return '•'.repeat(digits.length || 4);
  return `${'•'.repeat(digits.length - 4)}${digits.slice(-4)}`;
}

function feeFor(amountPoisha: number): number {
  return Math.round((amountPoisha * DEFAULT_PAYOUT_FEE_BP) / 10000);
}

/**
 * The audit log is the only place that records *who* settled a payout, so the
 * register joins on it. Reading it once and indexing by payout id keeps the
 * whole page to a single pass instead of an O(n·m) scan.
 */
function indexAuditTrail(): Map<string, AuditRow[]> {
  const index = new Map<string, AuditRow[]>();
  for (const log of readAdminStore().auditLogs) {
    if (!log.actionCode.startsWith('VENDOR_PAYOUT_')) continue;
    const row: AuditRow = {
      actionCode: log.actionCode,
      actorUsername: log.actorUsername,
      targetId: log.targetId,
      createdAt: log.createdAt,
      summaryBn: log.summaryBn,
    };
    const bucket = index.get(row.targetId);
    if (bucket) bucket.push(row);
    else index.set(row.targetId, [row]);
  }
  for (const rows of index.values()) {
    rows.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return index;
}

function actorFor(
  trail: AuditRow[] | undefined,
  actionCode: string
): string | null {
  if (!trail) return null;
  const match = trail.find((row) => row.actionCode === actionCode);
  return match ? match.actorUsername : null;
}

const EVENT_LABEL: Record<string, { bn: string; en: string }> = {
  VENDOR_PAYOUT_REQUESTED: { bn: 'পেআউট অনুরোধ ও টাকা হোল্ড', en: 'Payout requested, funds held' },
  VENDOR_PAYOUT_APPROVE: { bn: 'সুপার অ্যাডমিন অনুমোদন', en: 'Approved by super admin' },
  VENDOR_PAYOUT_MARK_PAID: { bn: 'পরিশোধ সম্পন্ন', en: 'Marked as paid' },
  VENDOR_PAYOUT_REJECT: { bn: 'বাতিল ও টাকা ফেরত', en: 'Rejected, funds released' },
};

/**
 * Builds the register. `viewer` is only used to compute `blocksCurrentUser`;
 * the caller must already have passed the super-admin gate.
 */
export function getAdminVendorPayoutRegister(
  viewer: ActorSecurityContext
): AdminVendorPayoutRegisterDTO {
  const erp = readErpState();
  const p4b = readPhase4BStore();
  const trail = indexAuditTrail();

  const vendorById = new Map(p4b.vendors.map((vendor) => [vendor.vendorId, vendor]));

  const rows: AdminVendorPayoutRowDTO[] = p4b.payoutRequests.map((payout: VendorPayoutRequestRecord) => {
    const audit = trail.get(payout.payoutId);
    const feePoisha = feeFor(payout.requestedAmountPoisha);
    const vendor = vendorById.get(payout.vendorId);
    const sameMaker =
      (payout.requestedByUsername ?? '').trim().toLowerCase() ===
      (viewer.username ?? '').trim().toLowerCase();

    const timeline: AdminVendorPayoutRowDTO['timeline'] = [];
    const pushEvent = (actionCode: string, at: string | null, actor: string | null) => {
      if (!at) return;
      const label = EVENT_LABEL[actionCode];
      if (!label) return;
      timeline.push({ at, eventBn: label.bn, eventEn: label.en, actor });
    };

    pushEvent('VENDOR_PAYOUT_REQUESTED', payout.requestedAt, payout.requestedByUsername);
    const approvedBy = actorFor(audit, 'VENDOR_PAYOUT_APPROVE');
    const paidBy = actorFor(audit, 'VENDOR_PAYOUT_MARK_PAID');
    const rejectedBy = actorFor(audit, 'VENDOR_PAYOUT_REJECT');

    if (approvedBy) {
      const at = audit?.find((row) => row.actionCode === 'VENDOR_PAYOUT_APPROVE')?.createdAt ?? null;
      pushEvent('VENDOR_PAYOUT_APPROVE', at, approvedBy);
    }
    if (paidBy) pushEvent('VENDOR_PAYOUT_MARK_PAID', payout.resolvedAt, paidBy);
    if (rejectedBy) pushEvent('VENDOR_PAYOUT_REJECT', payout.resolvedAt, rejectedBy);
    timeline.sort((a, b) => a.at.localeCompare(b.at));

    return {
      payoutId: payout.payoutId,
      vendorId: payout.vendorId,
      vendorCode: payout.vendorCode,
      vendorNameBn: vendor?.businessNameBn ?? payout.vendorNameBn,
      status: payout.status as PayoutStatusValue,
      requestedAmountPoisha: payout.requestedAmountPoisha,
      estimatedFeePoisha: feePoisha,
      netPayablePoisha: Math.max(0, payout.requestedAmountPoisha - feePoisha),
      payoutMethodBn: payout.payoutMethodBn,
      payoutAccountMasked: maskAccount(payout.payoutAccountNo),
      requestedByUsername: payout.requestedByUsername,
      requestedAt: payout.requestedAt,
      resolvedAt: payout.resolvedAt,
      rejectionReasonBn: payout.rejectionReasonBn,
      paymentTrxId: payout.paymentTrxId,
      proofUrl: payout.proofUrl,
      paidByUsername: paidBy,
      approvedByUsername: approvedBy,
      blocksCurrentUser:
        sameMaker && (payout.status === 'requested' || payout.status === 'approved'),
      timeline,
    };
  });

  rows.sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));

  const sumWhere = (predicate: (row: AdminVendorPayoutRowDTO) => boolean) =>
    rows.reduce((total, row) => (predicate(row) ? total + row.requestedAmountPoisha : total), 0);

  const escrowHeldPoisha = p4b.vendors.reduce((total, vendor) => {
    const entries = p4b.vendorLedger.filter((entry) => entry.vendorId === vendor.vendorId);
    const balance = computeVendorEscrowBalance(vendor.vendorId, entries);
    return total + balance.lockedPoisha + balance.pendingPoisha;
  }, 0);

  const totals: AdminVendorPayoutTotalsDTO = {
    requestedCount: rows.filter((row) => row.status === 'requested').length,
    requestedPoisha: sumWhere((row) => row.status === 'requested'),
    approvedCount: rows.filter((row) => row.status === 'approved').length,
    approvedPoisha: sumWhere((row) => row.status === 'approved'),
    paidCount: rows.filter((row) => row.status === 'paid').length,
    paidPoisha: sumWhere((row) => row.status === 'paid'),
    rejectedCount: rows.filter((row) => row.status === 'rejected').length,
    rejectedPoisha: sumWhere((row) => row.status === 'rejected'),
    totalDisbursedPoisha: sumWhere((row) => row.status === 'paid'),
    totalOutstandingPoisha: sumWhere(
      (row) => row.status === 'requested' || row.status === 'approved'
    ),
    estimatedFeePoisha: rows
      .filter((row) => row.status === 'paid')
      .reduce((total, row) => total + row.estimatedFeePoisha, 0),
    escrowHeldPoisha,
  };

  const vendorRollups: AdminVendorPayoutVendorRollupDTO[] = p4b.vendors.map((vendor) => {
    const own = rows.filter((row) => row.vendorId === vendor.vendorId);
    const paid = own.filter((row) => row.status === 'paid');
    const entries = p4b.vendorLedger.filter((entry) => entry.vendorId === vendor.vendorId);
    return {
      vendorId: vendor.vendorId,
      vendorCode: vendor.vendorCode,
      vendorNameBn: vendor.businessNameBn,
      requestedCount: own.length,
      paidCount: paid.length,
      paidPoisha: paid.reduce((total, row) => total + row.requestedAmountPoisha, 0),
      outstandingPoisha: own
        .filter((row) => row.status === 'requested' || row.status === 'approved')
        .reduce((total, row) => total + row.requestedAmountPoisha, 0),
      lastPaidAt: paid.length
        ? paid
            .map((row) => row.resolvedAt ?? row.requestedAt)
            .sort((a, b) => b.localeCompare(a))[0]
        : null,
      balance: computeVendorEscrowBalance(vendor.vendorId, entries),
    };
  });

  const methodMap = new Map<string, { count: number; paidPoisha: number }>();
  for (const row of rows) {
    if (row.status !== 'paid') continue;
    const key = row.payoutMethodBn || 'অজানা';
    const bucket = methodMap.get(key) ?? { count: 0, paidPoisha: 0 };
    bucket.count += 1;
    bucket.paidPoisha += row.requestedAmountPoisha;
    methodMap.set(key, bucket);
  }

  return {
    rows,
    totals,
    vendorRollups,
    methodTotals: [...methodMap.entries()]
      .map(([payoutMethodBn, value]) => ({ payoutMethodBn, ...value }))
      .sort((a, b) => b.paidPoisha - a.paidPoisha),
    minPayoutRequestPoisha: erp.siteSettings.minPayoutRequestPoisha,
    generatedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Lifecycle actions
// ---------------------------------------------------------------------------

export type PayoutLifecycleDecision = 'approve' | 'reject' | 'mark_paid';

export interface PayoutActionResult {
  success: boolean;
  errorBn?: string;
  payout?: VendorPayoutRequestRecord;
}

const STATUS_REQUIRED: Record<PayoutLifecycleDecision, PayoutStatusValue[]> = {
  approve: ['requested'],
  reject: ['requested', 'approved'],
  mark_paid: ['approved'],
};

/**
 * Every action funnels through `resolveVendorPayoutRequest`, which owns the
 * hold/release/escrow bookkeeping and the audit write. Re-implementing that
 * here would risk two sources of truth for vendor money.
 */
export function adminResolveVendorPayout(
  actor: ActorSecurityContext,
  input: {
    payoutId: string;
    decision: PayoutLifecycleDecision;
    rejectionReasonBn?: string;
    paymentTrxId?: string;
    proofUrl?: string;
    /**
     * Records an explicit reason when a super admin overrides maker-checker.
     * Without it the domain guard still refuses self-approval.
     */
    selfApprovalOverrideReasonBn?: string;
  }
): PayoutActionResult {
  const store = readPhase4BStore();
  const payout = store.payoutRequests.find((item) => item.payoutId === input.payoutId);
  if (!payout) return { success: false, errorBn: 'পেআউট অনুরোধ পাওয়া যায়নি।' };

  const allowedFrom = STATUS_REQUIRED[input.decision];
  if (!allowedFrom.includes(payout.status as PayoutStatusValue)) {
    return {
      success: false,
      errorBn:
        input.decision === 'mark_paid' && payout.status === 'requested'
          ? 'পরিশোধ মার্ক করার আগে পেআউটটি অনুমোদন করতে হবে।'
          : `এই পেআউট এখন "${payout.status}" অবস্থায় আছে, তাই এই কাজটি করা যাবে না।`,
    };
  }

  if (input.decision === 'mark_paid' && !input.paymentTrxId?.trim()) {
    return { success: false, errorBn: 'পরিশোধ মার্ক করতে ট্রানজেকশন আইডি (TrxID) দিন।' };
  }
  if (
    input.decision === 'reject' &&
    (input.rejectionReasonBn ?? '').trim().length < 3
  ) {
    return { success: false, errorBn: 'বাতিলের কারণ কমপক্ষে ৩ অক্ষরে লিখুন।' };
  }

  const reason = input.selfApprovalOverrideReasonBn?.trim();
  const overrideActive = Boolean(reason && reason.length >= 5);

  // Rejecting your own payout is not a conflict of interest: it only ever moves
  // money back to the vendor. So maker-checker applies to approve / mark_paid,
  // matching resolveVendorPayoutRequest, and the override only unlocks those.
  return resolveVendorPayoutRequest(actor, {
    payoutId: input.payoutId,
    decision: input.decision,
    rejectionReasonBn: input.rejectionReasonBn,
    paymentTrxId: input.paymentTrxId,
    proofUrl: input.proofUrl,
    emergencyOverride: overrideActive ? true : undefined,
    emergencyReasonBn: overrideActive ? reason : undefined,
  });
}

/**
 * Admin-initiated payout on a vendor's behalf, used from the register's
 * "new payout" flow. Kept separate so the register never has to guess a
 * vendor's balance.
 */
export function adminCreateVendorPayout(
  actor: ActorSecurityContext,
  input: {
    vendorId: string;
    requestedAmountPoisha: number;
    payoutMethodBn?: string;
    payoutAccountNo?: string;
  }
): PayoutActionResult {
  return requestVendorPayout(actor, input);
}
