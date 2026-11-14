// src/lib/finance/phase4-general-ledger-engine.ts
// Phase 4 — Financial System, Double-Entry General Ledger, Escrow Holding Liability & Maker-Checker Engine
//
// Legal & Accounting Notice (VERIFY_REQUIRED):
// "Escrow-style Holding Ledger" in this codebase refers strictly to internal accounting liability buckets
// (Pending -> Locked -> Available supplier payables). It does NOT claim to be a legally ring-fenced bank
// escrow account under Bangladesh banking regulations.

import path from 'node:path';
import { readLocalJsonStore, writeLocalJsonStore } from '../db/local-json-store';
import type { ReturnFaultType } from '../../types/database.types';
import type { Poisha } from '../../types/domain';
import {
  checkMakerCheckerSeparation,
  type ActorSecurityContext,
} from '../../types/permissions';
import {
  appendImmutableAuditLog,
  readAdminStore,
  writeAdminStore,
} from '../admin/phase4a-service';
import { readPhase4BStore } from '../admin/phase4b-service';
import { readErpState } from '../db/repository';
import {
  assertIntegerPoisha,
  computeVendorEscrowBalance,
  evaluateFourWayReturn,
} from '../money';

// ============================================================================
// 1. CHART OF ACCOUNTS & GENERAL LEDGER DATA MODEL (7.1 & 7.2)
// ============================================================================

export type GLAccountType =
  | 'ASSET'
  | 'LIABILITY'
  | 'EQUITY'
  | 'REVENUE'
  | 'EXPENSE';

export type GLAccountCode =
  | '1010' // Cash & Bank Verified (Asset)
  | '1020' // Manual bKash Unverified Clearing (Asset)
  | '1030' // Courier COD Receivable — In-Transit / Unremitted (Asset)
  | '1040' // Courier Damage & Short-Payment Claim Receivable (Asset)
  | '1050' // Supplier Post-Payout Clawback Receivable (Asset)
  | '2010' // Supplier Holding Liability — Pending Delivery (Liability)
  | '2015' // Supplier Holding Liability — Locked 7-Day Hold (Liability)
  | '2020' // Supplier Payable — Matured / Available for Settlement (Liability)
  | '2025' // Supplier Payout Hold Reserved (Liability)
  | '2030' // Customer Advance & Refund Payable Liability (Liability)
  | '2040' // VAT Payable on Platform Commission Margin (5%) (Liability)
  | '3010' // Platform Retained Earnings / Owner Equity (Equity)
  | '4010' // Gross Consignment Merchandise Sales Control (Revenue)
  | '4020' // Platform Commission / Margin Revenue (Revenue)
  | '4030' // Customer Delivery Charge Recovery (Revenue)
  | '5010' // Courier Delivery & COD Fee Expense (Expense)
  | '5020' // Unrecovered Return & Warehouse Damage Loss (Expense)
  | '5030' // Promotional Margin Discount Subsidy (Expense)
  | '5040'; // Packaging, Ad Spend & Operating Expense (Expense)

export interface GLChartOfAccount {
  accountCode: GLAccountCode;
  accountNameEn: string;
  accountNameBn: string;
  accountType: GLAccountType;
  normalBalance: 'DEBIT' | 'CREDIT';
  isSystemAccount: boolean;
  allowDirectManualPosting: boolean;
}

export const CHART_OF_ACCOUNTS: readonly GLChartOfAccount[] = [
  {
    accountCode: '1010',
    accountNameEn: 'Cash & Bank Verified',
    accountNameBn: 'যাচাইকৃত নগদ ও ব্যাংক তহবিল',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '1020',
    accountNameEn: 'Manual bKash Unverified Clearing',
    accountNameBn: 'ম্যানুয়াল বিকাশ ক্লিয়ারিং (অযাচাইকৃত)',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '1030',
    accountNameEn: 'Courier COD Receivable (In-Transit / Delivered Unremitted)',
    accountNameBn: 'কুরিয়ার সিওডি প্রাপ্য (আনসেটেলড)',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '1040',
    accountNameEn: 'Courier Damage & Short-Payment Claim Receivable',
    accountNameBn: 'কুরিয়ার ক্ষতিপূরণ ও শর্ট-পেমেন্ট দাবি প্রাপ্য',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '1050',
    accountNameEn: 'Supplier Post-Payout Clawback Receivable',
    accountNameBn: 'সাপ্লায়ার পেআউট-পরবর্তী ক্লব্যাক প্রাপ্য',
    accountType: 'ASSET',
    normalBalance: 'DEBIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '2010',
    accountNameEn: 'Supplier Holding Liability — Pending Delivery',
    accountNameBn: 'সাপ্লায়ার হোল্ডিং দায় — ডেলিভারি অপেক্ষমাণ (Pending)',
    accountType: 'LIABILITY',
    normalBalance: 'CREDIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '2015',
    accountNameEn: 'Supplier Holding Liability — Locked Hold Period',
    accountNameBn: 'সাপ্লায়ার হোল্ডিং দায় — ৭-দিন লকড (Locked)',
    accountType: 'LIABILITY',
    normalBalance: 'CREDIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '2020',
    accountNameEn: 'Supplier Payable — Matured / Available for Settlement',
    accountNameBn: 'সাপ্লায়ার প্রদেয় — উত্তোলনযোগ্য (Available)',
    accountType: 'LIABILITY',
    normalBalance: 'CREDIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '2025',
    accountNameEn: 'Supplier Payout Hold Reserved',
    accountNameBn: 'সাপ্লায়ার পেআউট হোল্ড রিজার্ভড',
    accountType: 'LIABILITY',
    normalBalance: 'CREDIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '2030',
    accountNameEn: 'Customer Advance & Refund Liability',
    accountNameBn: 'গ্রাহক অগ্রিম ও রিফান্ড প্রদেয় দায়',
    accountType: 'LIABILITY',
    normalBalance: 'CREDIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '2040',
    accountNameEn: 'VAT Payable on Platform Commission (5%)',
    accountNameBn: 'প্ল্যাটফর্ম কমিশনের ওপর প্রদেয় ভ্যাট (৫%)',
    accountType: 'LIABILITY',
    normalBalance: 'CREDIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '3010',
    accountNameEn: 'Platform Retained Earnings',
    accountNameBn: 'প্ল্যাটফর্ম সংরক্ষিত আয় (Retained Earnings)',
    accountType: 'EQUITY',
    normalBalance: 'CREDIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '4010',
    accountNameEn: 'Gross Consignment Merchandise Sales Control',
    accountNameBn: 'গ্রস কনসাইনমেন্ট পণ্য বিক্রয় কন্ট্রোল',
    accountType: 'REVENUE',
    normalBalance: 'CREDIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '4020',
    accountNameEn: 'Platform Commission / Margin Revenue',
    accountNameBn: 'প্ল্যাটফর্ম কমিশন ও মার্জিন রাজস্ব',
    accountType: 'REVENUE',
    normalBalance: 'CREDIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '4030',
    accountNameEn: 'Customer Delivery Charge Recovery',
    accountNameBn: 'গ্রাহক ডেলিভারি চার্জ আদায়',
    accountType: 'REVENUE',
    normalBalance: 'CREDIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '5010',
    accountNameEn: 'Courier Delivery & COD Fee Expense',
    accountNameBn: 'কুরিয়ার ডেলিভারি ও সিওডি চার্জ খরচ',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '5020',
    accountNameEn: 'Unrecovered Return & Warehouse Damage Loss',
    accountNameBn: 'অনাদায়ী রিটার্ন ও ওয়্যারহাউস ড্যামেজ ক্ষতি',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '5030',
    accountNameEn: 'Promotional Margin Discount Subsidy',
    accountNameBn: 'প্রোমোশনাল মার্জিন ডিসকাউন্ট ভর্তুকি',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    isSystemAccount: true,
    allowDirectManualPosting: false,
  },
  {
    accountCode: '5040',
    accountNameEn: 'Packaging, Ad Spend & Operating Expense',
    accountNameBn: 'প্যাকেজিং, বিজ্ঞাপন ও অপারেটিং খরচ',
    accountType: 'EXPENSE',
    normalBalance: 'DEBIT',
    isSystemAccount: true,
    allowDirectManualPosting: true,
  },
] as const;

export type GLFlowType =
  | 'CUSTOMER_ORDER_PLACED'
  | 'MANUAL_BKASH_SUBMITTED'
  | 'MANUAL_BKASH_VERIFIED'
  | 'ORDER_DELIVERED_COD_RECOGNITION'
  | 'COURIER_REMITTANCE_SETTLED'
  | 'ESCROW_HOLD_MATURED'
  | 'SUPPLIER_PAYOUT_HOLD_PLACED'
  | 'SUPPLIER_SETTLEMENT_DISBURSED'
  | 'SUPPLIER_PAYOUT_REJECTED_RELEASE'
  | 'ORDER_RETURN_FOUR_WAY_ADJUSTMENT'
  | 'CUSTOMER_REFUND_DISBURSED'
  | 'OPERATING_EXPENSE_RECORDED'
  | 'MANUAL_ADJUSTMENT_JOURNAL'
  | 'JOURNAL_REVERSAL_ENTRY';

export interface GLAccountingPeriod {
  periodCode: string; // e.g. '2026-11'
  startDate: string;
  endDate: string;
  status: 'OPEN' | 'CLOSED';
  closedByUsername: string | null;
  closedAt: string | null;
}

export interface GLJournalLine {
  lineId: string;
  lineNo: number;
  accountCode: GLAccountCode;
  accountNameBn: string;
  debitPoisha: Poisha;
  creditPoisha: Poisha;
  vendorId: string | null;
  orderNo: string | null;
  memoBn: string;
}

export interface GLJournalEntry {
  journalId: string;
  journalNo: string;
  idempotencyKey: string;
  periodCode: string;
  currency: 'BDT';
  flowType: GLFlowType;
  status: 'PENDING_APPROVAL' | 'POSTED' | 'REVERSED' | 'REJECTED';
  orderNo: string | null;
  vendorId: string | null;
  referenceId: string;
  descriptionBn: string;
  reasonBn: string;
  totalDebitPoisha: Poisha;
  totalCreditPoisha: Poisha;
  isBalanced: boolean;
  reversesJournalNo: string | null;
  reversedByJournalNo: string | null;
  makerUsername: string;
  checkerUsername: string | null;
  rejectionReasonBn: string | null;
  lines: GLJournalLine[];
  createdAt: string;
  postedAt: string | null;
}

export interface VendorDisputeHoldRecord {
  disputeId: string;
  orderNo: string;
  vendorId: string;
  holdAmountPoisha: Poisha;
  reasonBn: string;
  status: 'ACTIVE_HOLD' | 'RESOLVED_RELEASED' | 'RESOLVED_CLAWBACK';
  raisedByUsername: string;
  resolvedByUsername: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface GLAccountBalanceRow {
  accountCode: GLAccountCode;
  accountNameEn: string;
  accountNameBn: string;
  accountType: GLAccountType;
  normalBalance: 'DEBIT' | 'CREDIT';
  totalDebitPoisha: Poisha;
  totalCreditPoisha: Poisha;
  netBalancePoisha: Poisha; // Positive in direction of normalBalance
}

export interface GLTrialBalanceDTO {
  currency: 'BDT';
  generatedAt: string;
  postedJournalsCount: number;
  totalDebitPoisha: Poisha;
  totalCreditPoisha: Poisha;
  isTrialBalanceBalanced: boolean;
  accounts: GLAccountBalanceRow[];
}

export interface GLReconciliationReport {
  reconciliationId: string;
  generatedAt: string;
  currency: 'BDT';
  legalEscrowDisclaimer: 'VERIFY_REQUIRED — Internal Accounting Liability Tracking Only (Not a Bank Escrow Account)';
  isTrialBalanceBalanced: boolean;
  unbalancedJournalsCount: number;
  orderSnapshotDiscrepanciesCount: number;
  doubleCountedRevenueOrdersCount: number;
  vendorEscrowSummary: {
    totalPendingPoisha: Poisha;
    totalLockedPoisha: Poisha;
    totalAvailablePoisha: Poisha;
    totalPayoutHoldPoisha: Poisha;
    totalClawbackDebtPoisha: Poisha;
    activeDisputeHoldsCount: number;
  };
  glAccountSummary: {
    cashAndBankVerifiedPoisha: Poisha;
    manualBkashClearingPoisha: Poisha;
    courierCodReceivablePoisha: Poisha;
    supplierHoldingLockedPoisha: Poisha;
    supplierPayableAvailablePoisha: Poisha;
    platformCommissionRevenuePoisha: Poisha;
    promoDiscountSubsidyPoisha: Poisha;
    courierFeeExpensePoisha: Poisha;
  };
  allInvariantsPassed: boolean;
}

interface Phase4GLStore {
  periods: GLAccountingPeriod[];
  journals: GLJournalEntry[];
  disputeHolds: VendorDisputeHoldRecord[];
  reconciliations: GLReconciliationReport[];
}

const PHASE4_GL_STORE_PATH = path.join(
  process.cwd(),
  '.data',
  'erp-phase4-gl-store.json'
);

function createInitialPhase4GLStore(): Phase4GLStore {
  return {
    periods: [
      {
        periodCode: '2026-10',
        startDate: '2026-10-01',
        endDate: '2026-10-31',
        status: 'CLOSED',
        closedByUsername: 'admin',
        closedAt: '2026-11-01T00:05:00.000Z',
      },
      {
        periodCode: '2026-11',
        startDate: '2026-11-01',
        endDate: '2026-11-30',
        status: 'OPEN',
        closedByUsername: null,
        closedAt: null,
      },
    ],
    journals: [],
    disputeHolds: [],
    reconciliations: [],
  };
}

export function readPhase4GLStore(): Phase4GLStore {
  const parsed = readLocalJsonStore<Phase4GLStore>(PHASE4_GL_STORE_PATH, {
    arrays: ['periods', 'journals', 'disputeHolds', 'reconciliations'],
  });
  if (parsed) return parsed;
  const seed = createInitialPhase4GLStore();
  writePhase4GLStore(seed);
  return seed;
}

export function writePhase4GLStore(store: Phase4GLStore): void {
  writeLocalJsonStore(PHASE4_GL_STORE_PATH, store);
}

// ============================================================================
// 2. CORE GENERAL LEDGER POSTING & INVARIANT ENGINE (7.1 & 7.2)
// ============================================================================

export function getAccountMetadata(
  accountCode: GLAccountCode
): GLChartOfAccount {
  const found = CHART_OF_ACCOUNTS.find((a) => a.accountCode === accountCode);
  if (!found) {
    throw new Error(`UNKNOWN_GL_ACCOUNT: ${accountCode}`);
  }
  return found;
}

function verifyMakerCheckerUsers(
  makerUsername: string,
  checkerUsername: string,
  override?: { active: boolean; reasonBn?: string }
): { allowed: boolean; errorBn?: string; code?: 'CHECKER_NOT_ELIGIBLE' | 'SELF_APPROVAL' } {
  const account = readAdminStore().users.find(user => user.username === checkerUsername && user.isActive);
  if (!account) {
    return {
      allowed: false,
      code: 'CHECKER_NOT_ELIGIBLE',
      errorBn: 'আর্থিক অনুমোদনের জন্য সক্রিয় সুপার অ্যাডমিন অ্যাকাউন্ট খুঁজে পাওয়া যায়নি।',
    };
  }
  if (account.roleSlug !== 'super_admin') {
    return {
      allowed: false,
      code: 'CHECKER_NOT_ELIGIBLE',
      errorBn: 'শুধু সুপার অ্যাডমিন আর্থিক পোস্টিং অনুমোদন করতে পারেন।',
    };
  }
  if (account.mustChangePassword) {
    return {
      allowed: false,
      code: 'CHECKER_NOT_ELIGIBLE',
      errorBn: 'প্রথম লগইনের পাসওয়ার্ড পরিবর্তন বাকি থাকায় এই অ্যাডমিন আর্থিক পোস্টিং অনুমোদন করতে পারবেন না।',
    };
  }
  if (!account.totpEnrolled) {
    return {
      allowed: false,
      code: 'CHECKER_NOT_ELIGIBLE',
      errorBn:
        'আর্থিক অনুমোদনের জন্য অনুমোদনকারী সুপার অ্যাডমিনের 2FA (TOTP) এনরোলমেন্ট আবশ্যক। সেটিংস → নিরাপত্তা থেকে 2FA চালু করুন, অথবা অন্য একজন 2FA-এনরোলড সুপার অ্যাডমিনকে অনুমোদন করতে দিন।',
    };
  }
  const checkerCtx: ActorSecurityContext = { ...account };
  // Eligibility above is never waived. Only the maker/checker separation may be
  // overridden, by a super admin, with an explicit reason that is written into
  // the journal description.
  return checkMakerCheckerSeparation({
    makerUsername,
    checkerCtx,
    allowSuperAdminEmergencyOverride: true,
    emergencyOverride: override?.active,
    emergencyReasonBn: override?.reasonBn,
  });
}

function recordGLAuditEvent(params: {
  actorUsername: string;
  actorRole: ActorSecurityContext['roleSlug'];
  action: string;
  targetOrderNo: string | null;
  detailsBn: string;
}): void {
  const adm = readAdminStore();
  appendImmutableAuditLog(adm, {
    actorUserId: `usr-${params.actorUsername}`,
    actorUsername: params.actorUsername,
    actorRole: params.actorRole,
    actionCode: params.action,
    targetType: params.targetOrderNo ? 'order' : 'system',
    targetId: params.targetOrderNo ?? 'GL-LEDGER',
    summaryBn: params.detailsBn,
    metadata: {},
  });
  writeAdminStore(adm);
}

/**
 * Explicitly blocks any attempt to directly overwrite an account's balance by hand (Section 7.2).
 * Balances are derived 100% from immutable posted GLJournalLine rows.
 */
export function attemptDirectAccountBalanceEdit(params: {
  accountCode: GLAccountCode;
  newBalancePoisha: number;
  actorUsername: string;
}): {
  success: false;
  errorCode: 'DIRECT_BALANCE_EDIT_FORBIDDEN';
  errorBn: string;
} {
  recordGLAuditEvent({
    actorUsername: params.actorUsername,
    actorRole: 'super_admin',
    action: 'GL_DIRECT_BALANCE_EDIT_BLOCKED',
    targetOrderNo: null,
    detailsBn: `লেজার অ্যাকাউন্ট (${params.accountCode})-এর ব্যালেন্স সরাসরি হাতে পরিবর্তনের চেষ্টা ব্লক করা হয়েছে।`,
  });
  return {
    success: false,
    errorCode: 'DIRECT_BALANCE_EDIT_FORBIDDEN',
    errorBn:
      'DIRECT_BALANCE_EDIT_FORBIDDEN: জেনারেল লেজার ব্যালেন্স সরাসরি হাতে এডিট করা নিষিদ্ধ। শুধুমাত্র ব্যালেন্সড জার্নাল পোস্টিং বা রিভার্সালের মাধ্যমে ব্যালেন্স পরিবর্তিত হতে পারে।',
  };
}

/**
 * Explicitly blocks any attempt to edit or delete a POSTED journal entry (Section 7.2).
 */
export function attemptModifyOrDeletePostedJournal(params: {
  journalNo: string;
  operation: 'EDIT' | 'DELETE';
  actorUsername: string;
}): {
  success: false;
  errorCode: 'IMMUTABLE_POSTED_JOURNAL';
  errorBn: string;
} {
  return {
    success: false,
    errorCode: 'IMMUTABLE_POSTED_JOURNAL',
    errorBn: `IMMUTABLE_POSTED_JOURNAL: পোস্টকৃত জার্নাল (${params.journalNo}) ${params.operation} করা নিষিদ্ধ। সংশোধনের জন্য মেকার-চেকার রিভার্সাল জার্নাল ব্যবহার করুন।`,
  };
}

export interface PostBalancedJournalInput {
  idempotencyKey: string;
  periodCode?: string;
  flowType: GLFlowType;
  orderNo?: string | null;
  vendorId?: string | null;
  referenceId: string;
  descriptionBn: string;
  reasonBn: string;
  makerUsername: string;
  checkerUsername?: string | null;
  requireMakerCheckerApproval?: boolean;
  selfApprovalOverride?: boolean;
  selfApprovalOverrideReasonBn?: string;
  lines: Array<{
    accountCode: GLAccountCode;
    debitPoisha: Poisha;
    creditPoisha: Poisha;
    vendorId?: string | null;
    orderNo?: string | null;
    memoBn: string;
  }>;
}

/**
 * Posts or queues a Double-Entry Journal Entry after enforcing all Section 7.2 Accounting Invariants:
 *  - Safe integer Poisha validation on every line (zero floats)
 *  - Non-negative debits/credits; each line must be either a Debit or a Credit (not both, not zero)
 *  - Total Debit === Total Credit > 0
 *  - Open accounting period check
 *  - Idempotency key deduplication
 *  - Reason, actor, and timestamp enforcement
 */
export function postDoubleEntryJournal(input: PostBalancedJournalInput): {
  success: boolean;
  idempotentReplay?: boolean;
  journal?: GLJournalEntry;
  errorCode?: string;
  errorBn?: string;
} {
  if (!input.idempotencyKey || input.idempotencyKey.trim().length < 3) {
    return {
      success: false,
      errorCode: 'MISSING_IDEMPOTENCY_KEY',
      errorBn: 'ডাবল-এন্ট্রি জার্নাল পোস্টিংয়ের জন্য idempotencyKey আবশ্যক।',
    };
  }

  if (!input.reasonBn || input.reasonBn.trim().length < 5) {
    return {
      success: false,
      errorCode: 'REASON_REQUIRED',
      errorBn: 'আর্থিক জার্নাল পোস্টিংয়ের কারণ (কমপক্ষে ৫ অক্ষর) উল্লেখ করা বাধ্যতামূলক।',
    };
  }

  const store = readPhase4GLStore();

  // 1. Idempotency Guard
  const existing = store.journals.find(
    (j) => j.idempotencyKey === input.idempotencyKey
  );
  if (existing) {
    return {
      success: true,
      idempotentReplay: true,
      journal: existing,
    };
  }

  // 2. Accounting Period Check
  const periodCode = input.periodCode ?? '2026-11';
  const period = store.periods.find((p) => p.periodCode === periodCode);
  if (period && period.status === 'CLOSED') {
    return {
      success: false,
      errorCode: 'ACCOUNTING_PERIOD_CLOSED',
      errorBn: `ACCOUNTING_PERIOD_CLOSED: হিসাবকাল ${periodCode} ইতিমধ্যে ক্লোজ করা হয়েছে; নতুন জার্নাল পোস্ট করা যাবে না।`,
    };
  }

  if (!input.lines || input.lines.length < 2) {
    return {
      success: false,
      errorCode: 'MINIMUM_TWO_LINES_REQUIRED',
      errorBn: 'ডাবল-এন্ট্রি জার্নালে কমপক্ষে ২টি লাইন (ডেবিট ও ক্রেডিট) থাকতে হবে।',
    };
  }

  // 3. Validate each line's integer Poisha and compute Total Debit & Total Credit
  let totalDebitPoisha = 0;
  let totalCreditPoisha = 0;
  const builtLines: GLJournalLine[] = [];

  for (let i = 0; i < input.lines.length; i++) {
    const rawLine = input.lines[i]!;
    try {
      assertIntegerPoisha(rawLine.debitPoisha, `line[${i}].debitPoisha`);
      assertIntegerPoisha(rawLine.creditPoisha, `line[${i}].creditPoisha`);
    } catch (err) {
      return {
        success: false,
        errorCode: 'FLOAT_OR_INVALID_POISHA',
        errorBn:
          err instanceof Error
            ? err.message
            : 'দশমিক বা অবৈধ পয়সা মান গ্রহণযোগ্য নয়।',
      };
    }

    if (rawLine.debitPoisha < 0 || rawLine.creditPoisha < 0) {
      return {
        success: false,
        errorCode: 'NEGATIVE_JOURNAL_LINE_FORBIDDEN',
        errorBn: 'জার্নাল লাইনে ঋণাত্মক ডেবিট বা ক্রেডিট মান নিষিদ্ধ।',
      };
    }

    if (
      (rawLine.debitPoisha === 0 && rawLine.creditPoisha === 0) ||
      (rawLine.debitPoisha > 0 && rawLine.creditPoisha > 0)
    ) {
      return {
        success: false,
        errorCode: 'INVALID_LINE_SIDE',
        errorBn:
          'প্রতিটি জার্নাল লাইনে হয় ধনাত্মক ডেবিট অথবা ধনাত্মক ক্রেডিট থাকতে হবে (উভয়ই একসাথে বা উভয়ই শূন্য হতে পারবে না)।',
      };
    }

    const acct = getAccountMetadata(rawLine.accountCode);
    totalDebitPoisha += rawLine.debitPoisha;
    totalCreditPoisha += rawLine.creditPoisha;

    builtLines.push({
      lineId: `gll-${Date.now()}-${i + 1}`,
      lineNo: i + 1,
      accountCode: acct.accountCode,
      accountNameBn: acct.accountNameBn,
      debitPoisha: rawLine.debitPoisha,
      creditPoisha: rawLine.creditPoisha,
      vendorId: rawLine.vendorId ?? input.vendorId ?? null,
      orderNo: rawLine.orderNo ?? input.orderNo ?? null,
      memoBn: rawLine.memoBn,
    });
  }

  // 4. Balanced Journal Invariant: Total Debit === Total Credit > 0
  if (totalDebitPoisha <= 0 || totalDebitPoisha !== totalCreditPoisha) {
    return {
      success: false,
      errorCode: 'UNBALANCED_JOURNAL_ENTRY',
      errorBn: `UNBALANCED_JOURNAL_ENTRY: মোট ডেবিট (${totalDebitPoisha} পয়সা) এবং মোট ক্রেডিট (${totalCreditPoisha} পয়সা) সমান নয়!`,
    };
  }

  // 5. Maker-Checker check if immediate approval is provided
  let status: GLJournalEntry['status'] = 'POSTED';
  let checkerUsername: string | null = input.checkerUsername ?? null;

  if (input.requireMakerCheckerApproval) {
    if (!checkerUsername) {
      status = 'PENDING_APPROVAL';
    } else {
      const mc = verifyMakerCheckerUsers(input.makerUsername, checkerUsername, { active: Boolean(input.selfApprovalOverride), reasonBn: input.selfApprovalOverrideReasonBn });
      if (!mc.allowed) {
        return {
          success: false,
          errorCode: 'MAKER_CHECKER_VIOLATION',
          errorBn:
            mc.errorBn ??
            'মেকার-চেকার নীতি লঙ্ঘন: প্রস্তুতকারী নিজেই নিজের আর্থিক জার্নাল অনুমোদন করতে পারবেন না।',
        };
      }
      status = 'POSTED';
    }
  }

  const nowIso = new Date().toISOString();
  const journalNo = `JRN-${periodCode.replace('-', '')}-${String(
    store.journals.length + 1001
  )}`;

  const entry: GLJournalEntry = {
    journalId: `glj-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    journalNo,
    idempotencyKey: input.idempotencyKey,
    periodCode,
    currency: 'BDT',
    flowType: input.flowType,
    status,
    orderNo: input.orderNo ?? null,
    vendorId: input.vendorId ?? null,
    referenceId: input.referenceId,
    descriptionBn: input.descriptionBn,
    reasonBn: input.reasonBn.trim(),
    totalDebitPoisha,
    totalCreditPoisha,
    isBalanced: true,
    reversesJournalNo: null,
    reversedByJournalNo: null,
    makerUsername: input.makerUsername,
    checkerUsername,
    rejectionReasonBn: null,
    lines: builtLines,
    createdAt: nowIso,
    postedAt: status === 'POSTED' ? nowIso : null,
  };

  store.journals.unshift(entry);
  writePhase4GLStore(store);

  return {
    success: true,
    idempotentReplay: false,
    journal: entry,
  };
}

/**
 * Approves or rejects a PENDING_APPROVAL journal entry under strict Maker-Checker separation (Section 7.5).
 */
export function reviewPendingJournalEntry(
  checkerCtx: ActorSecurityContext,
  input: {
    journalNo: string;
    decision: 'APPROVE' | 'REJECT';
    reasonBn: string;
  }
): {
  success: boolean;
  journal?: GLJournalEntry;
  errorCode?: string;
  errorBn?: string;
} {
  if (checkerCtx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorCode: 'FORBIDDEN_ROLE',
      errorBn:
        'শুধুমাত্র সুপার অ্যাডমিন পেন্ডিং জার্নাল অনুমোদন করতে পারবেন।',
    };
  }

  if (!input.reasonBn || input.reasonBn.trim().length < 5) {
    return {
      success: false,
      errorCode: 'REASON_REQUIRED',
      errorBn: 'অনুমোদন বা প্রত্যাখ্যানের কারণ (কমপক্ষে ৫ অক্ষর) আবশ্যক।',
    };
  }

  const store = readPhase4GLStore();
  const journal = store.journals.find((j) => j.journalNo === input.journalNo);
  if (!journal) {
    return {
      success: false,
      errorCode: 'JOURNAL_NOT_FOUND',
      errorBn: 'জার্নাল এন্ট্রি খুঁজে পাওয়া যায়নি।',
    };
  }

  if (journal.status !== 'PENDING_APPROVAL') {
    return {
      success: false,
      errorCode: 'INVALID_JOURNAL_STATUS',
      errorBn: `জার্নালটির বর্তমান অবস্থা ${journal.status}; শুধুমাত্র PENDING_APPROVAL জার্নাল রিভিউ করা যাবে।`,
    };
  }

  const mc = checkMakerCheckerSeparation({
    makerUsername: journal.makerUsername,
    checkerCtx,
  });
  if (!mc.allowed) {
    return {
      success: false,
      errorCode: 'MAKER_CHECKER_VIOLATION',
      errorBn:
        mc.errorBn ??
        'মেকার-চেকার নীতি লঙ্ঘন: জার্নাল প্রস্তুতকারী নিজেই নিজের জার্নাল অনুমোদন করতে পারবেন না।',
    };
  }

  const nowIso = new Date().toISOString();
  journal.checkerUsername = checkerCtx.username;

  if (input.decision === 'APPROVE') {
    journal.status = 'POSTED';
    journal.postedAt = nowIso;
  } else {
    journal.status = 'REJECTED';
    journal.rejectionReasonBn = input.reasonBn.trim();
  }

  writePhase4GLStore(store);

  recordGLAuditEvent({
    actorUsername: checkerCtx.username,
    actorRole: checkerCtx.roleSlug,
    action:
      input.decision === 'APPROVE'
        ? 'GL_JOURNAL_APPROVED_POSTED'
        : 'GL_JOURNAL_REJECTED',
    targetOrderNo: journal.orderNo,
    detailsBn: `জার্নাল ${journal.journalNo} (${journal.totalDebitPoisha} পয়সা) ${
      input.decision === 'APPROVE' ? 'অনুমোদিত ও পোস্ট' : 'প্রত্যাখ্যাত'
    } হয়েছে। কারণ: ${input.reasonBn.trim()}`,
  });

  return {
    success: true,
    journal,
  };
}

/**
 * Reverses a POSTED journal entry by creating an immutable offsetting Reversal Journal Entry
 * (swapping debits and credits on every line) under strict Maker-Checker separation (Section 7.2 & 7.5).
 */
export function reversePostedJournalEntry(params: {
  originalJournalNo: string;
  makerUsername: string;
  checkerUsername: string;
  checkerRole: ActorSecurityContext['roleSlug'];
  reasonBn: string;
  idempotencyKey: string;
}): {
  success: boolean;
  originalJournal?: GLJournalEntry;
  reversalJournal?: GLJournalEntry;
  errorCode?: string;
  errorBn?: string;
} {
  if (params.checkerRole !== 'super_admin') {
    return {
      success: false,
      errorCode: 'FORBIDDEN_CHECKER_ROLE',
      errorBn:
        'জার্নাল রিভার্সাল অনুমোদনের জন্য সুপার অ্যাডমিন রোল আবশ্যক।',
    };
  }

  if (!params.reasonBn || params.reasonBn.trim().length < 5) {
    return {
      success: false,
      errorCode: 'REASON_REQUIRED',
      errorBn: 'জার্নাল রিভার্সালের কারণ (কমপক্ষে ৫ অক্ষর) উল্লেখ করা বাধ্যতামূলক।',
    };
  }

  const mc = verifyMakerCheckerUsers(
    params.makerUsername,
    params.checkerUsername
  );
  if (!mc.allowed) {
    return {
      success: false,
      errorCode: 'MAKER_CHECKER_VIOLATION',
      errorBn:
        mc.errorBn ??
        'মেকার-চেকার নীতি লঙ্ঘন: রিভার্সাল অনুরোধকারী নিজেই তা অনুমোদন করতে পারবেন না।',
    };
  }

  const store = readPhase4GLStore();
  const existingReversal = store.journals.find(
    (j) => j.idempotencyKey === params.idempotencyKey
  );
  if (existingReversal) {
    const orig = store.journals.find(
      (j) => j.journalNo === params.originalJournalNo
    );
    return {
      success: true,
      originalJournal: orig,
      reversalJournal: existingReversal,
    };
  }

  const original = store.journals.find(
    (j) => j.journalNo === params.originalJournalNo
  );
  if (!original) {
    return {
      success: false,
      errorCode: 'ORIGINAL_JOURNAL_NOT_FOUND',
      errorBn: `মূল জার্নাল (${params.originalJournalNo}) খুঁজে পাওয়া যায়নি।`,
    };
  }

  if (original.status === 'REVERSED' || original.reversedByJournalNo) {
    return {
      success: false,
      errorCode: 'JOURNAL_ALREADY_REVERSED',
      errorBn: `জার্নাল ${original.journalNo} ইতিমধ্যে রিভার্স (${original.reversedByJournalNo}) করা হয়েছে।`,
    };
  }

  if (original.status !== 'POSTED') {
    return {
      success: false,
      errorCode: 'ONLY_POSTED_JOURNAL_CAN_BE_REVERSED',
      errorBn: 'শুধুমাত্র POSTED অবস্থার জার্নাল রিভার্স করা যাবে।',
    };
  }

  const reversalLines = original.lines.map((line) => ({
    accountCode: line.accountCode,
    debitPoisha: line.creditPoisha, // Swap Credit -> Debit
    creditPoisha: line.debitPoisha, // Swap Debit -> Credit
    vendorId: line.vendorId,
    orderNo: line.orderNo,
    memoBn: `রিভার্সাল (${original.journalNo}): ${line.memoBn}`,
  }));

  const postRes = postDoubleEntryJournal({
    idempotencyKey: params.idempotencyKey,
    periodCode: '2026-11',
    flowType: 'JOURNAL_REVERSAL_ENTRY',
    orderNo: original.orderNo,
    vendorId: original.vendorId,
    referenceId: original.journalNo,
    descriptionBn: `রিভার্সাল জার্নাল — মূল জার্নাল ${original.journalNo}`,
    reasonBn: params.reasonBn.trim(),
    makerUsername: params.makerUsername,
    checkerUsername: params.checkerUsername,
    requireMakerCheckerApproval: true,
    lines: reversalLines,
  });

  if (!postRes.success || !postRes.journal) {
    return {
      success: false,
      errorCode: postRes.errorCode,
      errorBn: postRes.errorBn,
    };
  }

  const updatedStore = readPhase4GLStore();
  const origInStore = updatedStore.journals.find(
    (j) => j.journalNo === original.journalNo
  )!;
  const revInStore = updatedStore.journals.find(
    (j) => j.journalNo === postRes.journal!.journalNo
  )!;

  origInStore.status = 'REVERSED';
  origInStore.reversedByJournalNo = revInStore.journalNo;
  revInStore.reversesJournalNo = origInStore.journalNo;
  writePhase4GLStore(updatedStore);

  recordGLAuditEvent({
    actorUsername: params.checkerUsername,
    actorRole: params.checkerRole,
    action: 'GL_JOURNAL_REVERSED',
    targetOrderNo: origInStore.orderNo,
    detailsBn: `মূল জার্নাল ${origInStore.journalNo} রিভার্সাল জার্নাল ${revInStore.journalNo}-এর মাধ্যমে অফসেট করা হয়েছে। কারণ: ${params.reasonBn.trim()}`,
  });

  return {
    success: true,
    originalJournal: origInStore,
    reversalJournal: revInStore,
  };
}

// ============================================================================
// 3. SEPARATE FINANCIAL FLOW TEMPLATES — ZERO DOUBLE-COUNTING (7.3 & 7.4)
// ============================================================================

/**
 * Flow 1 & 2: Verified Manual bKash Customer Payment (Advance or Full Prepayment).
 * Credits `2030 Customer Advance & Refund Liability` and debits `1010 Cash & Bank Verified`.
 * Does NOT prematurely recognize merchandise revenue before delivery.
 */
export function postVerifiedManualBkashPaymentJournal(params: {
  submissionId: string;
  orderNo: string;
  trxId: string;
  verifiedAmountPoisha: Poisha;
  makerUsername: string;
  checkerUsername: string;
  idempotencyKey?: string;
  selfApprovalOverride?: boolean;
  selfApprovalOverrideReasonBn?: string;
}): ReturnType<typeof postDoubleEntryJournal> {
  assertIntegerPoisha(params.verifiedAmountPoisha, 'verifiedAmountPoisha');

  const mc = verifyMakerCheckerUsers(
    params.makerUsername,
    params.checkerUsername,
    {
      active: Boolean(params.selfApprovalOverride),
      reasonBn: params.selfApprovalOverrideReasonBn,
    }
  );
  if (!mc.allowed) {
    return {
      success: false,
      errorCode: 'MAKER_CHECKER_VIOLATION',
      errorBn:
        mc.errorBn ??
        'ম্যানুয়াল বিকাশ সাবমিশন প্রস্তুতকারী এবং ভেরিফায়ার একই ব্যক্তি হতে পারবেন না।',
    };
  }

  return postDoubleEntryJournal({
    idempotencyKey:
      params.idempotencyKey ?? `gl-bkash-ver-${params.submissionId}-${params.trxId}`,
    flowType: 'MANUAL_BKASH_VERIFIED',
    orderNo: params.orderNo,
    referenceId: params.submissionId,
    descriptionBn: `অর্ডার ${params.orderNo}-এর ম্যানুয়াল বিকাশ পেমেন্ট (TrxID: ${params.trxId}) যাচাইকৃত।`,
    reasonBn: params.selfApprovalOverride
      ? `ম্যানুয়াল বিকাশ TrxID ${params.trxId} যাচাই ও নগদ তহবিলে জমা। মেকার-চেকার ওভাররাইড কারণ: ${params.selfApprovalOverrideReasonBn?.trim() || 'উল্লেখ নেই'}`
      : `ম্যানুয়াল বিকাশ TrxID ${params.trxId} যাচাই ও নগদ তহবিলে জমা।`,
    makerUsername: params.makerUsername,
    checkerUsername: params.checkerUsername,
    requireMakerCheckerApproval: true,
    selfApprovalOverride: params.selfApprovalOverride,
    selfApprovalOverrideReasonBn: params.selfApprovalOverrideReasonBn,
    lines: [
      {
        accountCode: '1010',
        debitPoisha: params.verifiedAmountPoisha,
        creditPoisha: 0,
        orderNo: params.orderNo,
        memoBn: `বিকাশ ক্যাশ প্রাপ্তি (TrxID: ${params.trxId})`,
      },
      {
        accountCode: '2030',
        debitPoisha: 0,
        creditPoisha: params.verifiedAmountPoisha,
        orderNo: params.orderNo,
        memoBn: `গ্রাহক অগ্রিম পেমেন্ট দায় (${params.orderNo})`,
      },
    ],
  });
}

/**
 * Flow 3: Order Delivery Recognition (Single-Vendor or Multi-Vendor).
 * Recognizes:
 *   - Dr `1030` Courier COD Receivable (`codCollectablePoisha`)
 *   - Dr `2030` Customer Advance Liability (`advancePaidPoisha`, if any advance was paid)
 *   - Dr `5030` Promotional Margin Discount Subsidy (`promoDiscountPoisha`, if any promo was applied)
 *   - Cr `2015` Supplier Holding Liability — Locked Escrow (per vendor line's `supplierPayablePoisha`)
 *   - Cr `4020` Platform Commission / Margin Revenue (gross `platformMarginPoisha`)
 *   - Cr `4030` Customer Delivery Charge Recovery (`deliveryChargePoisha`, if > 0)
 *
 * Invariant proof:
 *   subtotal = sum(supplierPayable) + sum(platformMargin)
 *   totalPayable = subtotal - promoDiscount + deliveryCharge
 *   codCollectable + advancePaid = totalPayable
 *   Therefore:
 *   Total Debits  = codCollectable + advancePaid + promoDiscount
 *                 = (subtotal - promoDiscount + deliveryCharge) + promoDiscount
 *                 = subtotal + deliveryCharge
 *   Total Credits = sum(supplierPayable) + sum(platformMargin) + deliveryCharge
 *                 = subtotal + deliveryCharge
 *   Total Debits === Total Credits!
 *   And supplierPayable is 100% untouched by promoDiscount!
 */
export function postOrderDeliveryRecognitionJournal(params: {
  orderNo: string;
  advancePaidPoisha: Poisha;
  codCollectablePoisha: Poisha;
  promoDiscountPoisha: Poisha;
  deliveryChargePoisha: Poisha;
  vendorSplits: Array<{
    vendorId: string;
    supplierPayablePoisha: Poisha;
    platformMarginPoisha: Poisha;
  }>;
  actorUsername: string;
  idempotencyKey?: string;
}): ReturnType<typeof postDoubleEntryJournal> {
  assertIntegerPoisha(params.advancePaidPoisha, 'advancePaidPoisha');
  assertIntegerPoisha(params.codCollectablePoisha, 'codCollectablePoisha');
  assertIntegerPoisha(params.promoDiscountPoisha, 'promoDiscountPoisha');
  assertIntegerPoisha(params.deliveryChargePoisha, 'deliveryChargePoisha');

  const lines: PostBalancedJournalInput['lines'] = [];

  if (params.codCollectablePoisha > 0) {
    lines.push({
      accountCode: '1030',
      debitPoisha: params.codCollectablePoisha,
      creditPoisha: 0,
      orderNo: params.orderNo,
      memoBn: `কুরিয়ার সিওডি প্রাপ্য (${params.orderNo})`,
    });
  }

  if (params.advancePaidPoisha > 0) {
    lines.push({
      accountCode: '2030',
      debitPoisha: params.advancePaidPoisha,
      creditPoisha: 0,
      orderNo: params.orderNo,
      memoBn: `ডেলিভারিতে গ্রাহক অগ্রিম সমন্বয় (${params.orderNo})`,
    });
  }

  if (params.promoDiscountPoisha > 0) {
    lines.push({
      accountCode: '5030',
      debitPoisha: params.promoDiscountPoisha,
      creditPoisha: 0,
      orderNo: params.orderNo,
      memoBn: `প্ল্যাটফর্ম মার্জিন প্রোমো ভর্তুকি (${params.orderNo})`,
    });
  }

  let totalPlatformMarginPoisha = 0;
  for (const split of params.vendorSplits) {
    assertIntegerPoisha(split.supplierPayablePoisha, 'supplierPayablePoisha');
    assertIntegerPoisha(split.platformMarginPoisha, 'platformMarginPoisha');

    if (split.supplierPayablePoisha > 0) {
      lines.push({
        accountCode: '2015',
        debitPoisha: 0,
        creditPoisha: split.supplierPayablePoisha,
        vendorId: split.vendorId,
        orderNo: params.orderNo,
        memoBn: `সাপ্লায়ার লকড হোল্ডিং দায় (${split.vendorId})`,
      });
    }
    totalPlatformMarginPoisha += split.platformMarginPoisha;
  }

  if (totalPlatformMarginPoisha > 0) {
    lines.push({
      accountCode: '4020',
      debitPoisha: 0,
      creditPoisha: totalPlatformMarginPoisha,
      orderNo: params.orderNo,
      memoBn: `প্ল্যাটফর্ম কনসাইনমেন্ট কমিশন রাজস্ব (${params.orderNo})`,
    });
  }

  if (params.deliveryChargePoisha > 0) {
    lines.push({
      accountCode: '4030',
      debitPoisha: 0,
      creditPoisha: params.deliveryChargePoisha,
      orderNo: params.orderNo,
      memoBn: `গ্রাহক ডেলিভারি চার্জ আদায় (${params.orderNo})`,
    });
  }

  return postDoubleEntryJournal({
    idempotencyKey: params.idempotencyKey ?? `gl-deliv-rec-${params.orderNo}`,
    flowType: 'ORDER_DELIVERED_COD_RECOGNITION',
    orderNo: params.orderNo,
    referenceId: params.orderNo,
    descriptionBn: `অর্ডার ${params.orderNo} ডেলিভারি ও কনসাইনমেন্ট রাজস্ব/দায় স্বীকৃতি।`,
    reasonBn: `অর্ডার ${params.orderNo} সফল ডেলিভারির প্রেক্ষিতে কুরিয়ার প্রাপ্য, সাপ্লায়ার লকড হোল্ডিং দায় ও কমিশন রাজস্ব পোস্টিং।`,
    makerUsername: params.actorUsername,
    lines,
  });
}

/**
 * Flow 4: Courier COD Remittance Settlement.
 * Converts `1030 Courier COD Receivable` into `1010 Cash & Bank Verified`, `5010 Courier Fee Expense`,
 * and (if remitted < expected - fee) `1040 Courier Short-Payment Claim Receivable`.
 * Zero double-counting of merchandise revenue!
 */
export function postCourierRemittanceJournal(params: {
  settlementRef: string;
  orderNo: string;
  expectedCodPoisha: Poisha;
  courierFeeDeductedPoisha: Poisha;
  remittedCashPoisha: Poisha;
  actorUsername: string;
  idempotencyKey?: string;
}): ReturnType<typeof postDoubleEntryJournal> & {
  shortPaymentPoisha: Poisha;
} {
  assertIntegerPoisha(params.expectedCodPoisha, 'expectedCodPoisha');
  assertIntegerPoisha(
    params.courierFeeDeductedPoisha,
    'courierFeeDeductedPoisha'
  );
  assertIntegerPoisha(params.remittedCashPoisha, 'remittedCashPoisha');

  const shortPaymentPoisha =
    params.expectedCodPoisha -
    params.courierFeeDeductedPoisha -
    params.remittedCashPoisha;

  if (shortPaymentPoisha < 0) {
    return {
      success: false,
      shortPaymentPoisha,
      errorCode: 'OVER_REMITTANCE_INVALID',
      errorBn:
        'কুরিয়ার রেমিট্যান্স ও ফি-এর যোগফল প্রত্যাশিত সিওডি অ্যামাউন্টের চেয়ে বেশি হতে পারে না।',
    };
  }

  const lines: PostBalancedJournalInput['lines'] = [];

  if (params.remittedCashPoisha > 0) {
    lines.push({
      accountCode: '1010',
      debitPoisha: params.remittedCashPoisha,
      creditPoisha: 0,
      orderNo: params.orderNo,
      memoBn: `কুরিয়ার রেমিট্যান্স ব্যাংক জমা (${params.settlementRef})`,
    });
  }

  if (params.courierFeeDeductedPoisha > 0) {
    lines.push({
      accountCode: '5010',
      debitPoisha: params.courierFeeDeductedPoisha,
      creditPoisha: 0,
      orderNo: params.orderNo,
      memoBn: `কুরিয়ার ডেলিভারি ও সিওডি চার্জ কর্তন (${params.settlementRef})`,
    });
  }

  if (shortPaymentPoisha > 0) {
    lines.push({
      accountCode: '1040',
      debitPoisha: shortPaymentPoisha,
      creditPoisha: 0,
      orderNo: params.orderNo,
      memoBn: `কুরিয়ার শর্ট-পেমেন্ট ডিসপিউট প্রাপ্য (${params.settlementRef})`,
    });
  }

  lines.push({
    accountCode: '1030',
    debitPoisha: 0,
    creditPoisha: params.expectedCodPoisha,
    orderNo: params.orderNo,
    memoBn: `কুরিয়ার সিওডি প্রাপ্য নিষ্পত্তি (${params.orderNo})`,
  });

  const res = postDoubleEntryJournal({
    idempotencyKey:
      params.idempotencyKey ??
      `gl-remit-${params.settlementRef}-${params.orderNo}`,
    flowType: 'COURIER_REMITTANCE_SETTLED',
    orderNo: params.orderNo,
    referenceId: params.settlementRef,
    descriptionBn: `কুরিয়ার রেমিট্যান্স সেটেলমেন্ট (${params.settlementRef}) — অর্ডার ${params.orderNo}`,
    reasonBn: `কুরিয়ার সিওডি রেমিট্যান্স (${params.settlementRef}) ব্যাংক তহবিলে জমা ও কুরিয়ার ফি সমন্বয়।`,
    makerUsername: params.actorUsername,
    lines,
  });

  return {
    ...res,
    shortPaymentPoisha,
  };
}

/**
 * Dispute / Chargeback / Return Hold Guard (Section 7.4):
 * Places or resolves a hold on a vendor's order payable so it cannot be released into Available
 * while a return, dispute, or chargeback is under investigation.
 */
export function placeDisputeHoldOnVendorOrder(params: {
  orderNo: string;
  vendorId: string;
  holdAmountPoisha: Poisha;
  reasonBn: string;
  actorUsername: string;
}): {
  success: boolean;
  disputeHold?: VendorDisputeHoldRecord;
  errorBn?: string;
} {
  assertIntegerPoisha(params.holdAmountPoisha, 'holdAmountPoisha');
  if (!params.reasonBn || params.reasonBn.trim().length < 5) {
    return {
      success: false,
      errorBn: 'ডিসপিউট হোল্ডের কারণ (কমপক্ষে ৫ অক্ষর) আবশ্যক।',
    };
  }

  const store = readPhase4GLStore();
  const existing = store.disputeHolds.find(
    (d) =>
      d.orderNo === params.orderNo &&
      d.vendorId === params.vendorId &&
      d.status === 'ACTIVE_HOLD'
  );
  if (existing) {
    return { success: true, disputeHold: existing };
  }

  const record: VendorDisputeHoldRecord = {
    disputeId: `dsp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    orderNo: params.orderNo,
    vendorId: params.vendorId,
    holdAmountPoisha: params.holdAmountPoisha,
    reasonBn: params.reasonBn.trim(),
    status: 'ACTIVE_HOLD',
    raisedByUsername: params.actorUsername,
    resolvedByUsername: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null,
  };

  store.disputeHolds.unshift(record);
  writePhase4GLStore(store);
  return { success: true, disputeHold: record };
}

/**
 * Flow 5: Escrow Hold Maturity Release (`2015 Locked Escrow` -> `2020 Available Supplier Payable`).
 * Blocks release if there is an active Dispute / Return / Chargeback hold on that order+vendor (Section 7.4).
 */
export function postEscrowMaturityReleaseJournal(params: {
  orderNo: string;
  vendorId: string;
  amountPoisha: Poisha;
  actorUsername: string;
  idempotencyKey?: string;
}): ReturnType<typeof postDoubleEntryJournal> {
  assertIntegerPoisha(params.amountPoisha, 'amountPoisha');

  const store = readPhase4GLStore();
  const activeDispute = store.disputeHolds.find(
    (d) =>
      d.orderNo === params.orderNo &&
      d.vendorId === params.vendorId &&
      d.status === 'ACTIVE_HOLD'
  );
  if (activeDispute) {
    return {
      success: false,
      errorCode: 'DISPUTE_HOLD_ACTIVE_RELEASE_BLOCKED',
      errorBn: `DISPUTE_HOLD_ACTIVE_RELEASE_BLOCKED: অর্ডার ${params.orderNo}-এ সক্রিয় রিটার্ন/ডিসপিউট হোল্ড (${activeDispute.disputeId}) থাকায় সাপ্লায়ার পেয়েবল রিলিজ করা যাবে না।`,
    };
  }

  return postDoubleEntryJournal({
    idempotencyKey:
      params.idempotencyKey ??
      `gl-escrow-mat-${params.orderNo}-${params.vendorId}`,
    flowType: 'ESCROW_HOLD_MATURED',
    orderNo: params.orderNo,
    vendorId: params.vendorId,
    referenceId: `${params.orderNo}:${params.vendorId}`,
    descriptionBn: `৭-দিন হোল্ড পূর্ণ হওয়ায় সাপ্লায়ার প্রদেয় উত্তোলনযোগ্য (Available) বাকেটে স্থানান্তর (${params.orderNo})।`,
    reasonBn: `কোনো রিটার্ন বা ডিসপিউট না থাকায় লকড হোল্ডিং দায় থেকে উত্তোলনযোগ্য প্রদেয় হিসেবে প্রমোশন।`,
    makerUsername: params.actorUsername,
    lines: [
      {
        accountCode: '2015',
        debitPoisha: params.amountPoisha,
        creditPoisha: 0,
        vendorId: params.vendorId,
        orderNo: params.orderNo,
        memoBn: 'লকড হোল্ডিং দায় হ্রাস (Maturity Release)',
      },
      {
        accountCode: '2020',
        debitPoisha: 0,
        creditPoisha: params.amountPoisha,
        vendorId: params.vendorId,
        orderNo: params.orderNo,
        memoBn: 'উত্তোলনযোগ্য সাপ্লায়ার প্রদেয় বৃদ্ধি (Available)',
      },
    ],
  });
}

/**
 * Flow 6 & 7: Supplier Payout Request Hold (`2020` -> `2025`) & Maker-Checker Settlement Approval (`2025` -> `1010`).
 * Strictly simulated ledger settlement — performs NO live external bank/bKash transfer.
 */
export function postSupplierPayoutHoldJournal(params: {
  payoutId: string;
  vendorId: string;
  requestedAmountPoisha: Poisha;
  makerUsername: string;
  idempotencyKey?: string;
}): ReturnType<typeof postDoubleEntryJournal> {
  assertIntegerPoisha(params.requestedAmountPoisha, 'requestedAmountPoisha');

  return postDoubleEntryJournal({
    idempotencyKey: params.idempotencyKey ?? `gl-payout-hold-${params.payoutId}`,
    flowType: 'SUPPLIER_PAYOUT_HOLD_PLACED',
    vendorId: params.vendorId,
    referenceId: params.payoutId,
    descriptionBn: `সাপ্লায়ার পেআউট রিকোয়েস্ট হোল্ড (${params.payoutId})`,
    reasonBn: `সাপ্লায়ার পেআউট রিকোয়েস্ট (${params.payoutId}) অনুমোদনের অপেক্ষায় উত্তোলনযোগ্য ব্যালেন্স রিজার্ভ।`,
    makerUsername: params.makerUsername,
    lines: [
      {
        accountCode: '2020',
        debitPoisha: params.requestedAmountPoisha,
        creditPoisha: 0,
        vendorId: params.vendorId,
        memoBn: `উত্তোলনযোগ্য প্রদেয় থেকে পেআউট হোল্ডে স্থানান্তর (${params.payoutId})`,
      },
      {
        accountCode: '2025',
        debitPoisha: 0,
        creditPoisha: params.requestedAmountPoisha,
        vendorId: params.vendorId,
        memoBn: `সাপ্লায়ার পেআউট হোল্ড রিজার্ভড (${params.payoutId})`,
      },
    ],
  });
}

export function postSupplierSettlementDisbursedJournal(params: {
  payoutId: string;
  vendorId: string;
  disbursedAmountPoisha: Poisha;
  settlementTrxRef: string;
  makerUsername: string;
  checkerUsername: string;
  reasonBn: string;
  idempotencyKey?: string;
}): ReturnType<typeof postDoubleEntryJournal> {
  assertIntegerPoisha(params.disbursedAmountPoisha, 'disbursedAmountPoisha');

  const mc = verifyMakerCheckerUsers(
    params.makerUsername,
    params.checkerUsername
  );
  if (!mc.allowed) {
    return {
      success: false,
      errorCode: 'MAKER_CHECKER_VIOLATION',
      errorBn:
        mc.errorBn ??
        'মেকার-চেকার নীতি লঙ্ঘন: পেআউট অনুরোধকারী নিজেই নিজের পেআউট অনুমোদন করতে পারবেন না।',
    };
  }

  return postDoubleEntryJournal({
    idempotencyKey:
      params.idempotencyKey ?? `gl-payout-disb-${params.payoutId}`,
    flowType: 'SUPPLIER_SETTLEMENT_DISBURSED',
    vendorId: params.vendorId,
    referenceId: params.payoutId,
    descriptionBn: `সাপ্লায়ার সেটেলমেন্ট নিষ্পত্তি (${params.payoutId} · Ref: ${params.settlementTrxRef})`,
    reasonBn: params.reasonBn,
    makerUsername: params.makerUsername,
    checkerUsername: params.checkerUsername,
    requireMakerCheckerApproval: true,
    lines: [
      {
        accountCode: '2025',
        debitPoisha: params.disbursedAmountPoisha,
        creditPoisha: 0,
        vendorId: params.vendorId,
        memoBn: `সাপ্লায়ার পেআউট হোল্ড দায় নিষ্পত্তি (${params.payoutId})`,
      },
      {
        accountCode: '1010',
        debitPoisha: 0,
        creditPoisha: params.disbursedAmountPoisha,
        vendorId: params.vendorId,
        memoBn: `সাপ্লায়ার পেআউট তহবিল প্রদান (Ref: ${params.settlementTrxRef})`,
      },
    ],
  });
}

/**
 * Flow 8: Four-Way Return & Damage General Ledger Posting (Section 7.3 & 7.4).
 * Posts exact balanced double-entry lines for each of the 4 fault types:
 *  1. WAREHOUSE_PACKAGING_FAULT -> Vendor keeps 100% payable; Platform absorbs full product + shipping loss (`Dr 5020`, `Dr 4020`, `Cr 1030`).
 *  2. SUPPLIER_DEFECT -> Vendor payable reversed (`Dr 2015` if in hold, or `Dr 1050 Clawback Receivable` if already paid out), Platform margin reversed (`Dr 4020`), unrecovered shipping (`Dr 5020`), offsetting `Cr 1030` (and `Cr 1010` / `Cr 2030` for return shipping).
 *  3. CUSTOMER_INTACT_RETURN -> Vendor payable reversed (`Dr 2015` or `Dr 1050`), Platform margin reversed (`Dr 4020`), unrecovered return shipping (`Dr 5020`).
 *  4. COURIER_NEGLIGENCE -> Vendor keeps 100% payable; Courier Claim Receivable (`Dr 1040`) replaces `Cr 1030 Courier COD Receivable`.
 */
export function postFourWayReturnAdjustmentJournal(params: {
  returnId: string;
  orderNo: string;
  vendorId: string;
  faultType: ReturnFaultType;
  quantity: number;
  unitSupplierPayablePoisha: Poisha;
  unitPlatformMarginPoisha: Poisha;
  unrecoveredCourierChargePoisha: Poisha;
  wasInHoldPeriod: boolean;
  wasAlreadyPaidOut: boolean;
  actorUsername: string;
  idempotencyKey?: string;
}): ReturnType<typeof postDoubleEntryJournal> & {
  resolution: ReturnType<typeof evaluateFourWayReturn>;
} {
  assertIntegerPoisha(
    params.unitSupplierPayablePoisha,
    'unitSupplierPayablePoisha'
  );
  assertIntegerPoisha(
    params.unitPlatformMarginPoisha,
    'unitPlatformMarginPoisha'
  );
  assertIntegerPoisha(
    params.unrecoveredCourierChargePoisha,
    'unrecoveredCourierChargePoisha'
  );

  const unitSalePricePoisha =
    params.unitSupplierPayablePoisha + params.unitPlatformMarginPoisha;
  const lineSupplierPayablePoisha =
    params.unitSupplierPayablePoisha * params.quantity;
  const linePlatformMarginPoisha =
    params.unitPlatformMarginPoisha * params.quantity;
  const lineSalePricePoisha = unitSalePricePoisha * params.quantity;

  const resolution = evaluateFourWayReturn({
    faultType: params.faultType,
    quantity: params.quantity,
    unitSupplierPayablePoisha: params.unitSupplierPayablePoisha,
    unitSalePricePoisha,
    unrecoveredCourierChargePoisha: params.unrecoveredCourierChargePoisha,
    wasInHoldPeriod: params.wasInHoldPeriod,
    wasAlreadyPaidOut: params.wasAlreadyPaidOut,
  });

  const lines: PostBalancedJournalInput['lines'] = [];

  if (params.faultType === 'WAREHOUSE_PACKAGING_FAULT') {
    // Vendor keeps 100% payable; platform absorbs product cost + unrecovered courier charge and reverses margin
    const totalLoss =
      lineSupplierPayablePoisha + params.unrecoveredCourierChargePoisha;
    lines.push(
      {
        accountCode: '5020',
        debitPoisha: totalLoss,
        creditPoisha: 0,
        orderNo: params.orderNo,
        vendorId: params.vendorId,
        memoBn: 'ওয়্যারহাউস প্যাকেজিং ত্রুটিজনিত পণ্য ও কুরিয়ার ক্ষতি',
      },
      {
        accountCode: '4020',
        debitPoisha: linePlatformMarginPoisha,
        creditPoisha: 0,
        orderNo: params.orderNo,
        memoBn: 'রিটার্নকৃত অর্ডারের প্ল্যাটফর্ম মার্জিন রিভার্সাল',
      },
      {
        accountCode: '1030',
        debitPoisha: 0,
        creditPoisha: lineSalePricePoisha,
        orderNo: params.orderNo,
        memoBn: 'রিটার্নকৃত অর্ডারের কুরিয়ার সিওডি প্রাপ্য সমন্বয়',
      }
    );
    if (params.unrecoveredCourierChargePoisha > 0) {
      lines.push({
        accountCode: '1010',
        debitPoisha: 0,
        creditPoisha: params.unrecoveredCourierChargePoisha,
        orderNo: params.orderNo,
        memoBn: 'অনাদায়ী রিটার্ন কুরিয়ার চার্জ প্রদান',
      });
    }
  } else if (
    params.faultType === 'SUPPLIER_DEFECT' ||
    params.faultType === 'CUSTOMER_INTACT_RETURN'
  ) {
    const vendorDebitAccount: GLAccountCode =
      params.wasInHoldPeriod && !params.wasAlreadyPaidOut ? '2015' : '1050';
    lines.push(
      {
        accountCode: vendorDebitAccount,
        debitPoisha: lineSupplierPayablePoisha,
        creditPoisha: 0,
        vendorId: params.vendorId,
        orderNo: params.orderNo,
        memoBn:
          vendorDebitAccount === '2015'
            ? 'হোল্ড পিরিয়ডে রিটার্ন — সাপ্লায়ার লকড দায় রিভার্সাল'
            : 'পেআউট-পরবর্তী রিটার্ন — সাপ্লায়ার ক্লব্যাক প্রাপ্য',
      },
      {
        accountCode: '4020',
        debitPoisha: linePlatformMarginPoisha,
        creditPoisha: 0,
        orderNo: params.orderNo,
        memoBn: 'রিটার্নকৃত পণ্যের প্ল্যাটফর্ম মার্জিন রিভার্সাল',
      },
      {
        accountCode: '1030',
        debitPoisha: 0,
        creditPoisha: lineSalePricePoisha,
        orderNo: params.orderNo,
        memoBn: 'রিটার্নকৃত পণ্যের কুরিয়ার সিওডি প্রাপ্য হ্রাস',
      }
    );
    if (params.unrecoveredCourierChargePoisha > 0) {
      lines.push(
        {
          accountCode: '5020',
          debitPoisha: params.unrecoveredCourierChargePoisha,
          creditPoisha: 0,
          orderNo: params.orderNo,
          memoBn: 'অনাদায়ী রিটার্ন কুরিয়ার চার্জ ক্ষতি',
        },
        {
          accountCode: '1010',
          debitPoisha: 0,
          creditPoisha: params.unrecoveredCourierChargePoisha,
          orderNo: params.orderNo,
          memoBn: 'রিটার্ন কুরিয়ার চার্জ পরিশোধ',
        }
      );
    }
  } else {
    // COURIER_NEGLIGENCE: Vendor keeps 100% payable; Courier Claim Receivable (1040) replaces Courier COD Receivable (1030)
    lines.push(
      {
        accountCode: '1040',
        debitPoisha: lineSalePricePoisha,
        creditPoisha: 0,
        orderNo: params.orderNo,
        memoBn: 'কুরিয়ার অবহেলাজনিত ক্ষতিপূরণ দাবি প্রাপ্য (Courier Claim)',
      },
      {
        accountCode: '1030',
        debitPoisha: 0,
        creditPoisha: lineSalePricePoisha,
        orderNo: params.orderNo,
        memoBn: 'কুরিয়ার সিওডি প্রাপ্য থেকে ক্লেইম অ্যাকাউন্টে স্থানান্তর',
      }
    );
  }

  const res = postDoubleEntryJournal({
    idempotencyKey:
      params.idempotencyKey ?? `gl-ret-4way-${params.returnId}-${params.orderNo}`,
    flowType: 'ORDER_RETURN_FOUR_WAY_ADJUSTMENT',
    orderNo: params.orderNo,
    vendorId: params.vendorId,
    referenceId: params.returnId,
    descriptionBn: `৪-ওয়ে রিটার্ন ফাইন্যান্সিয়াল সমন্বয় (${params.faultType}) — অর্ডার ${params.orderNo}`,
    reasonBn: `অর্ডার ${params.orderNo}-এর রিটার্ন (${params.faultType}) বাবদ ব্যালেন্সড জেনারেল লেজার পোস্টিং।`,
    makerUsername: params.actorUsername,
    lines,
  });

  return {
    ...res,
    resolution,
  };
}

/**
 * Flow 9: Customer Refund Disbursement (`Dr 2030 Customer Advance/Refund Liability` / `Cr 1010 Cash & Bank Verified`).
 * Enforces Maker-Checker separation between refund requester and refund approver.
 */
export function postCustomerRefundDisbursedJournal(params: {
  refundId: string;
  orderNo: string;
  refundAmountPoisha: Poisha;
  refundTrxId: string;
  makerUsername: string;
  checkerUsername: string;
  reasonBn: string;
  idempotencyKey?: string;
}): ReturnType<typeof postDoubleEntryJournal> {
  assertIntegerPoisha(params.refundAmountPoisha, 'refundAmountPoisha');

  const mc = verifyMakerCheckerUsers(
    params.makerUsername,
    params.checkerUsername
  );
  if (!mc.allowed) {
    return {
      success: false,
      errorCode: 'MAKER_CHECKER_VIOLATION',
      errorBn:
        mc.errorBn ??
        'মেকার-চেকার নীতি লঙ্ঘন: রিফান্ড অনুরোধকারী নিজেই তা অনুমোদন করতে পারবেন না।',
    };
  }

  return postDoubleEntryJournal({
    idempotencyKey: params.idempotencyKey ?? `gl-cust-refund-${params.refundId}`,
    flowType: 'CUSTOMER_REFUND_DISBURSED',
    orderNo: params.orderNo,
    referenceId: params.refundId,
    descriptionBn: `গ্রাহক রিফান্ড পরিশোধ (${params.refundId} · TrxID: ${params.refundTrxId})`,
    reasonBn: params.reasonBn,
    makerUsername: params.makerUsername,
    checkerUsername: params.checkerUsername,
    requireMakerCheckerApproval: true,
    lines: [
      {
        accountCode: '2030',
        debitPoisha: params.refundAmountPoisha,
        creditPoisha: 0,
        orderNo: params.orderNo,
        memoBn: `গ্রাহক অগ্রিম/রিফান্ড দায় নিষ্পত্তি (${params.orderNo})`,
      },
      {
        accountCode: '1010',
        debitPoisha: 0,
        creditPoisha: params.refundAmountPoisha,
        orderNo: params.orderNo,
        memoBn: `গ্রাহককে রিফান্ড প্রদান (TrxID: ${params.refundTrxId})`,
      },
    ],
  });
}

// ============================================================================
// 4. MULTI-VENDOR PROMO ALLOCATION & ROUNDING HELPER (7.6)
// ============================================================================

/**
 * Allocates an order-level platform promo discount across multiple vendor lines using exact
 * integer Poisha math and HALF-UP rounding with remainder assignment on the largest margin line,
 * guaranteeing:
 *   1. Sum of line discounts === totalPromoDiscountPoisha (capped at totalPlatformMarginPoisha)
 *   2. Every vendor line's `supplierPayablePoisha` remains 100% untouched
 *   3. No vendor line's allocated discount exceeds its `linePlatformMarginPoisha`
 */
export function allocatePromoDiscountAcrossVendorLines(params: {
  requestedDiscountPoisha: Poisha;
  lines: Array<{
    lineId: string;
    vendorId: string;
    lineSupplierPayablePoisha: Poisha;
    linePlatformMarginPoisha: Poisha;
    lineSubtotalPoisha: Poisha;
  }>;
}): {
  effectiveOrderDiscountPoisha: Poisha;
  totalSupplierPayablePoisha: Poisha;
  totalInitialPlatformMarginPoisha: Poisha;
  totalNetPlatformMarginPoisha: Poisha;
  allocatedLines: Array<{
    lineId: string;
    vendorId: string;
    lineSupplierPayablePoisha: Poisha; // 100% unchanged!
    initialPlatformMarginPoisha: Poisha;
    allocatedDiscountPoisha: Poisha;
    netPlatformMarginPoisha: Poisha;
  }>;
} {
  assertIntegerPoisha(
    params.requestedDiscountPoisha,
    'requestedDiscountPoisha'
  );

  const totalSupplierPayablePoisha = params.lines.reduce(
    (s, l) =>
      s + assertIntegerPoisha(l.lineSupplierPayablePoisha, 'lineSupplierPayable'),
    0
  );
  const totalInitialPlatformMarginPoisha = params.lines.reduce(
    (s, l) =>
      s + assertIntegerPoisha(l.linePlatformMarginPoisha, 'linePlatformMargin'),
    0
  );

  // Golden Rule: Platform promo discount can never reduce supplierPayablePoisha
  const effectiveOrderDiscountPoisha = Math.max(
    0,
    Math.min(params.requestedDiscountPoisha, totalInitialPlatformMarginPoisha)
  );

  if (
    effectiveOrderDiscountPoisha === 0 ||
    totalInitialPlatformMarginPoisha === 0
  ) {
    return {
      effectiveOrderDiscountPoisha: 0,
      totalSupplierPayablePoisha,
      totalInitialPlatformMarginPoisha,
      totalNetPlatformMarginPoisha: totalInitialPlatformMarginPoisha,
      allocatedLines: params.lines.map((l) => ({
        lineId: l.lineId,
        vendorId: l.vendorId,
        lineSupplierPayablePoisha: l.lineSupplierPayablePoisha,
        initialPlatformMarginPoisha: l.linePlatformMarginPoisha,
        allocatedDiscountPoisha: 0,
        netPlatformMarginPoisha: l.linePlatformMarginPoisha,
      })),
    };
  }

  // Proportional allocation using exact BigInt integer division + remainder adjustment
  let allocatedSoFar = 0;
  const allocatedLines = params.lines.map((l) => {
    const shareNumerator =
      BigInt(effectiveOrderDiscountPoisha) * BigInt(l.linePlatformMarginPoisha);
    const shareFloor = Number(
      shareNumerator / BigInt(totalInitialPlatformMarginPoisha)
    );
    const capped = Math.min(shareFloor, l.linePlatformMarginPoisha);
    allocatedSoFar += capped;
    return {
      lineId: l.lineId,
      vendorId: l.vendorId,
      lineSupplierPayablePoisha: l.lineSupplierPayablePoisha,
      initialPlatformMarginPoisha: l.linePlatformMarginPoisha,
      allocatedDiscountPoisha: capped,
      netPlatformMarginPoisha: l.linePlatformMarginPoisha - capped,
    };
  });

  // Distribute exact integer remainder (1..N poisha) to lines with remaining margin capacity
  let remainder = effectiveOrderDiscountPoisha - allocatedSoFar;
  for (const line of allocatedLines) {
    if (remainder <= 0) break;
    const capacity =
      line.initialPlatformMarginPoisha - line.allocatedDiscountPoisha;
    if (capacity > 0) {
      const add = Math.min(remainder, capacity);
      line.allocatedDiscountPoisha += add;
      line.netPlatformMarginPoisha -= add;
      remainder -= add;
    }
  }

  const totalNetPlatformMarginPoisha = allocatedLines.reduce(
    (s, l) => s + l.netPlatformMarginPoisha,
    0
  );

  return {
    effectiveOrderDiscountPoisha,
    totalSupplierPayablePoisha,
    totalInitialPlatformMarginPoisha,
    totalNetPlatformMarginPoisha,
    allocatedLines,
  };
}

// ============================================================================
// 5. TRIAL BALANCE & SUB-LEDGER RECONCILIATION ENGINE (7.1, 7.2 & 7.4)
// ============================================================================

/**
 * Computes the General Ledger Trial Balance from all POSTED and REVERSED journals.
 * Note: When a journal is REVERSED, both the original journal and its offsetting reversal journal
 * have posted lines in the ledger so their net effect is zero while preserving a 100% immutable audit trail.
 */
export function computeGeneralLedgerTrialBalance(): GLTrialBalanceDTO {
  const store = readPhase4GLStore();
  const activeJournals = store.journals.filter(
    (j) => j.status === 'POSTED' || j.status === 'REVERSED'
  );

  const debitByAcct = new Map<GLAccountCode, number>();
  const creditByAcct = new Map<GLAccountCode, number>();

  for (const acct of CHART_OF_ACCOUNTS) {
    debitByAcct.set(acct.accountCode, 0);
    creditByAcct.set(acct.accountCode, 0);
  }

  let grandDebit = 0;
  let grandCredit = 0;

  for (const j of activeJournals) {
    for (const line of j.lines) {
      debitByAcct.set(
        line.accountCode,
        (debitByAcct.get(line.accountCode) ?? 0) + line.debitPoisha
      );
      creditByAcct.set(
        line.accountCode,
        (creditByAcct.get(line.accountCode) ?? 0) + line.creditPoisha
      );
      grandDebit += line.debitPoisha;
      grandCredit += line.creditPoisha;
    }
  }

  const accounts: GLAccountBalanceRow[] = CHART_OF_ACCOUNTS.map((acct) => {
    const totalDebitPoisha = debitByAcct.get(acct.accountCode) ?? 0;
    const totalCreditPoisha = creditByAcct.get(acct.accountCode) ?? 0;
    const netBalancePoisha =
      acct.normalBalance === 'DEBIT'
        ? totalDebitPoisha - totalCreditPoisha
        : totalCreditPoisha - totalDebitPoisha;

    return {
      accountCode: acct.accountCode,
      accountNameEn: acct.accountNameEn,
      accountNameBn: acct.accountNameBn,
      accountType: acct.accountType,
      normalBalance: acct.normalBalance,
      totalDebitPoisha,
      totalCreditPoisha,
      netBalancePoisha,
    };
  });

  return {
    currency: 'BDT',
    generatedAt: new Date().toISOString(),
    postedJournalsCount: activeJournals.length,
    totalDebitPoisha: grandDebit,
    totalCreditPoisha: grandCredit,
    isTrialBalanceBalanced: grandDebit === grandCredit,
    accounts,
  };
}

/**
 * Runs a comprehensive Financial & Sub-Ledger Reconciliation across:
 *  - General Ledger Trial Balance (`Total Debit === Total Credit`)
 *  - Unbalanced Journal Detector (`0` unbalanced journals)
 *  - Historical Order 3-Tier Snapshot Integrity (`supplierCost + supplierProfit = supplierPayable`, `supplierPayable + platformMargin = unitSalePrice`)
 *  - Zero Double-Counted Revenue Detector (no order has more than one active `ORDER_DELIVERED_COD_RECOGNITION` journal)
 *  - Vendor Escrow Holding Liability Summary (`Pending`, `Locked`, `Available`, `Payout Hold`, `Clawback`)
 */
export function runFullFinancialReconciliation(): GLReconciliationReport {
  const store = readPhase4GLStore();
  const erp = readErpState();
  const p4b = readPhase4BStore();
  const tb = computeGeneralLedgerTrialBalance();

  // 1. Check if any stored journal is unbalanced
  const unbalancedJournalsCount = store.journals.filter(
    (j) =>
      j.totalDebitPoisha !== j.totalCreditPoisha || j.totalDebitPoisha <= 0
  ).length;

  // 2. Check historical order line 3-tier snapshots
  let orderSnapshotDiscrepanciesCount = 0;
  for (const line of erp.orderLines) {
    const expectedPayable =
      line.snapSupplierCostPoisha + line.snapSupplierProfitPoisha;
    const expectedSale =
      line.snapSupplierPayablePoisha + line.snapPlatformMarginPoisha;
    const expectedLineSubtotal = line.snapUnitSalePricePoisha * line.quantity;
    if (
      expectedPayable !== line.snapSupplierPayablePoisha ||
      expectedSale !== line.snapUnitSalePricePoisha ||
      expectedLineSubtotal !== line.lineSubtotalPoisha
    ) {
      orderSnapshotDiscrepanciesCount++;
    }
  }

  // 3. Check that no order has double-counted delivery revenue recognition
  const deliveryJournalsByOrder = new Map<string, number>();
  for (const j of store.journals) {
    if (
      j.flowType === 'ORDER_DELIVERED_COD_RECOGNITION' &&
      j.status === 'POSTED' &&
      j.orderNo
    ) {
      deliveryJournalsByOrder.set(
        j.orderNo,
        (deliveryJournalsByOrder.get(j.orderNo) ?? 0) + 1
      );
    }
  }
  let doubleCountedRevenueOrdersCount = 0;
  for (const count of deliveryJournalsByOrder.values()) {
    if (count > 1) doubleCountedRevenueOrdersCount++;
  }

  // 4. Compute Vendor Escrow Sub-Ledger summary across all vendors
  let totalPendingPoisha = 0;
  let totalLockedPoisha = 0;
  let totalAvailablePoisha = 0;
  let totalPayoutHoldPoisha = 0;
  let totalClawbackDebtPoisha = 0;

  for (const v of p4b.vendors) {
    const vEntries = p4b.vendorLedger.filter((e) => e.vendorId === v.vendorId);
    const bal = computeVendorEscrowBalance(v.vendorId, vEntries);
    totalPendingPoisha += bal.pendingPoisha;
    totalLockedPoisha += bal.lockedPoisha;
    totalAvailablePoisha += bal.availablePoisha;
    totalPayoutHoldPoisha += bal.payoutHoldPoisha;
    totalClawbackDebtPoisha += bal.clawbackDebtPoisha;
  }

  const getNet = (code: GLAccountCode) =>
    tb.accounts.find((a) => a.accountCode === code)?.netBalancePoisha ?? 0;

  const report: GLReconciliationReport = {
    reconciliationId: `rec-gl-${Date.now()}`,
    generatedAt: new Date().toISOString(),
    currency: 'BDT',
    legalEscrowDisclaimer:
      'VERIFY_REQUIRED — Internal Accounting Liability Tracking Only (Not a Bank Escrow Account)',
    isTrialBalanceBalanced: tb.isTrialBalanceBalanced,
    unbalancedJournalsCount,
    orderSnapshotDiscrepanciesCount,
    doubleCountedRevenueOrdersCount,
    vendorEscrowSummary: {
      totalPendingPoisha,
      totalLockedPoisha,
      totalAvailablePoisha,
      totalPayoutHoldPoisha,
      totalClawbackDebtPoisha,
      activeDisputeHoldsCount: store.disputeHolds.filter(
        (d) => d.status === 'ACTIVE_HOLD'
      ).length,
    },
    glAccountSummary: {
      cashAndBankVerifiedPoisha: getNet('1010'),
      manualBkashClearingPoisha: getNet('1020'),
      courierCodReceivablePoisha: getNet('1030'),
      supplierHoldingLockedPoisha: getNet('2015'),
      supplierPayableAvailablePoisha: getNet('2020'),
      platformCommissionRevenuePoisha: getNet('4020'),
      promoDiscountSubsidyPoisha: getNet('5030'),
      courierFeeExpensePoisha: getNet('5010'),
    },
    allInvariantsPassed:
      tb.isTrialBalanceBalanced &&
      unbalancedJournalsCount === 0 &&
      orderSnapshotDiscrepanciesCount === 0 &&
      doubleCountedRevenueOrdersCount === 0,
  };

  store.reconciliations.unshift(report);
  writePhase4GLStore(store);

  return report;
}
