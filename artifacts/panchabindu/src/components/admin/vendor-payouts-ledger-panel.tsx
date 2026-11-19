'use client';

// src/components/admin/vendor-payouts-ledger-panel.tsx
// Unified Admin → Payouts & Escrow Ledger
// Single source of truth for all vendor money movement:
//   1. Payout Register & Settlement (per-vendor roll-up, unified Request/Direct Pay with
//      channel fee estimator, Maker-Checker approve / mark-paid with TrxID / reject)
//   2. Escrow Ledger & Maturity (real-time Pending -> Locked -> Withdrawable waterfall,
//      7-day maturity promoter, searchable append-only ledger, manual adjustment, and
//      Maker-Checker ledger reversals)
//   3. Returns & Liability (4-Way Return Engine + resolution history)

import * as React from 'react';
import {
  AlertTriangle,
  ArrowUpRight,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  ExternalLink,
  FileCheck2,
  Filter,
  Plus,
  Printer,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldAlert,
  Wallet,
  XCircle,
  Zap,
} from 'lucide-react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import { formatPoishaToBdt } from '@/lib/money';
import { Badge, Button, EmptyState, InfoTooltip, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type { ReturnFaultType } from '@/types/database.types';
import type { VendorEscrowBalance } from '@/types/domain';
import type {
  ImmutableVendorLedgerRecord,
  ReturnResolutionRecord,
  VendorProfileRecord,
} from '@/lib/admin/phase4b-service';
import type {
  EscrowMaturityBatchRecord,
  LedgerReversalRequestRecord,
} from '@/lib/admin/phase7-service';
import type {
  AdminPayoutStatus,
  AdminVendorPayoutRegisterDTO,
  AdminVendorPayoutRowDTO,
} from '@/lib/vendor/vendor-types';

export type PayoutsLedgerSubTab = 'register' | 'ledger' | 'returns';

export interface VendorPayoutsLedgerPanelProps {
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  initialSubTab?: PayoutsLedgerSubTab;
  initialVendorFilter?: string | null;
  initialStatusFilter?: 'all' | AdminPayoutStatus;
  openCreateMode?: 'request' | 'direct' | null;
  vendorsEscrow: Array<{
    profile: VendorProfileRecord;
    balance: VendorEscrowBalance;
  }>;
  ledgerEntries: ImmutableVendorLedgerRecord[];
  returnResolutions: ReturnResolutionRecord[];
  maturityBatches: EscrowMaturityBatchRecord[];
  ledgerReversals: LedgerReversalRequestRecord[];
  availableOrderNos: string[];
  onRefreshWorkspace: () => Promise<void>;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  onOpenVendorProfile: (vendorId: string) => void;
  onConsumeDeepLink?: () => void;
}

const STATUS_META: Record<
  AdminPayoutStatus,
  { bn: string; en: string; tone: 'warning' | 'info' | 'danger' | 'success' }
> = {
  requested: { bn: 'অনুরোধকৃত', en: 'Requested', tone: 'warning' },
  approved: { bn: 'অনুমোদিত', en: 'Approved', tone: 'info' },
  rejected: { bn: 'বাতিল', en: 'Rejected', tone: 'danger' },
  paid: { bn: 'পরিশোধিত', en: 'Paid', tone: 'success' },
};

const RETURN_FAULTS: Array<{
  value: ReturnFaultType;
  bn: string;
  en: string;
  impactBn: string;
  impactEn: string;
}> = [
  {
    value: 'CUSTOMER_INTACT_RETURN',
    bn: 'কাস্টমার রিটার্ন (পণ্য অক্ষত)',
    en: 'Customer Return (Intact)',
    impactBn: 'পণ্য পুনরায় স্টকে যোগ হবে, সাপ্লায়ার প্রদেয় বাতিল',
    impactEn: 'Item restocked, supplier payable reversed',
  },
  {
    value: 'SUPPLIER_DEFECT',
    bn: 'সাপ্লায়ার / উৎপাদন ত্রুটি',
    en: 'Supplier / Production Defect',
    impactBn: 'ভেন্ডর লেজার থেকে ডেবিট / ক্লব্যাক সমন্বয়',
    impactEn: 'Debited from vendor escrow / clawback debt',
  },
  {
    value: 'WAREHOUSE_PACKAGING_FAULT',
    bn: 'ওয়্যারহাউস প্যাকেজিং ত্রুটি',
    en: 'Warehouse Packaging Fault',
    impactBn: 'প্ল্যাটফর্ম দায়ভার, ভেন্ডরের পাওনা অক্ষুণ্ণ',
    impactEn: 'Platform absorbs cost, vendor payable protected',
  },
  {
    value: 'COURIER_NEGLIGENCE',
    bn: 'কুরিয়ার ক্ষতি / অবহেলা',
    en: 'Courier Negligence / Damage',
    impactBn: 'কুরিয়ার ক্লেম তৈরি, ভেন্ডরের পাওনা সুরক্ষিত',
    impactEn: 'Courier claim raised, vendor payable protected',
  },
];

const inputCls =
  'w-full min-h-[42px] px-3 py-2 text-xs bg-bg text-ink border border-border rounded-[var(--radius-md)] focus:outline-2 focus:outline-offset-0 focus:outline-ink';

function parseTaka(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

function fmtDateTime(iso: string | null | undefined, locale: 'bn' | 'en'): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function computeChannelFeePoisha(
  grossPoisha: number,
  channel: 'bkash_merchant' | 'personal_send' | 'bank_beftn'
): { feePoisha: number; netPoisha: number } {
  if (grossPoisha <= 0) return { feePoisha: 0, netPoisha: 0 };
  if (channel === 'bkash_merchant') {
    const fee = Math.round((grossPoisha * 185) / 10000);
    return { feePoisha: fee, netPoisha: Math.max(0, grossPoisha - fee) };
  }
  if (channel === 'personal_send') {
    const fee = 1000 + Math.round((grossPoisha * 185) / 10000);
    return { feePoisha: fee, netPoisha: Math.max(0, grossPoisha - fee) };
  }
  return { feePoisha: 0, netPoisha: grossPoisha };
}

export function VendorPayoutsLedgerPanel({
  locale,
  isSuperAdmin,
  initialSubTab,
  initialVendorFilter,
  initialStatusFilter,
  openCreateMode,
  vendorsEscrow,
  ledgerEntries,
  returnResolutions,
  maturityBatches,
  ledgerReversals,
  availableOrderNos,
  onRefreshWorkspace,
  onNotify,
  onOpenVendorProfile,
  onConsumeDeepLink,
}: VendorPayoutsLedgerPanelProps) {
  const bn = locale === 'bn';
  const t = React.useCallback((b: string, e: string) => (bn ? b : e), [bn]);
  const money = React.useCallback((p: number) => formatPoishaToBdt(p, locale), [locale]);

  const [subTab, setSubTab] = React.useState<PayoutsLedgerSubTab>(initialSubTab ?? 'register');
  const [data, setData] = React.useState<AdminVendorPayoutRegisterDTO | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  // Payout Register filters
  const [statusFilter, setStatusFilter] = React.useState<'all' | AdminPayoutStatus>(
    initialStatusFilter ?? 'all'
  );
  const [vendorFilter, setVendorFilter] = React.useState<string>(initialVendorFilter ?? 'all');
  const [search, setSearch] = React.useState('');
  const [openPayoutId, setOpenPayoutId] = React.useState<string | null>(null);

  // Per-row settlement drafts
  const [trxDraft, setTrxDraft] = React.useState<Record<string, string>>({});
  const [feeDraft, setFeeDraft] = React.useState<Record<string, string>>({});
  const [senderDraft, setSenderDraft] = React.useState<Record<string, string>>({});
  const [proofDraft, setProofDraft] = React.useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = React.useState<Record<string, string>>({});
  const [reasonDraft, setReasonDraft] = React.useState<Record<string, string>>({});
  const [overrideDraft, setOverrideDraft] = React.useState<Record<string, string>>({});

  // Unified Create / Direct Pay Form
  const [showCreate, setShowCreate] = React.useState(Boolean(openCreateMode));
  const [createMode, setCreateMode] = React.useState<'request' | 'direct'>(
    openCreateMode ?? 'direct'
  );
  const [createVendorId, setCreateVendorId] = React.useState(initialVendorFilter ?? '');
  const [createAmount, setCreateAmount] = React.useState('');
  const [createFee, setCreateFee] = React.useState('0');
  const [feeEstimatorChannel, setFeeEstimatorChannel] = React.useState<
    'bkash_merchant' | 'personal_send' | 'bank_beftn'
  >('bkash_merchant');
  const [createMethod, setCreateMethod] = React.useState('বিকাশ (bKash)');
  const [createSenderAcc, setCreateSenderAcc] = React.useState('');
  const [createReceiverAcc, setCreateReceiverAcc] = React.useState('');
  const [createTrxId, setCreateTrxId] = React.useState('');
  const [createProofUrl, setCreateProofUrl] = React.useState('');
  const [createNote, setCreateNote] = React.useState('');
  const [createPaidAt, setCreatePaidAt] = React.useState(() => {
    const d = new Date();
    return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
  });
  const [createAutoCredit, setCreateAutoCredit] = React.useState(false);
  const [createError, setCreateError] = React.useState<string | null>(null);

  // Escrow Ledger Tab State
  const [ledgerVendorId, setLedgerVendorId] = React.useState<string>(
    initialVendorFilter ?? vendorsEscrow[0]?.profile.vendorId ?? ''
  );
  const [ledgerBucketFilter, setLedgerBucketFilter] = React.useState<string>('all');
  const [ledgerSearch, setLedgerSearch] = React.useState('');
  const [showManualLedger, setShowManualLedger] = React.useState(false);
  const [showReversals, setShowReversals] = React.useState(false);

  // Manual Ledger Form State
  const [manBucket, setManBucket] = React.useState<'pending' | 'locked' | 'available'>('available');
  const [manDir, setManDir] = React.useState<'credit' | 'debit'>('credit');
  const [manAmount, setManAmount] = React.useState('');
  const [manOrderNo, setManOrderNo] = React.useState('');
  const [manMethod, setManMethod] = React.useState('বিকাশ (bKash)');
  const [manRef, setManRef] = React.useState('');
  const [manDesc, setManDesc] = React.useState('');
  const [manProofUrl, setManProofUrl] = React.useState('');

  // Maker-Checker Reversal State
  const [revOriginalEntryId, setRevOriginalEntryId] = React.useState(
    ledgerEntries[0]?.id ?? ''
  );
  const [revCorrectedBdt, setRevCorrectedBdt] = React.useState('0');
  const [revReasonBn, setRevReasonBn] = React.useState('');
  const [revEmergencyTotp, setRevEmergencyTotp] = React.useState('');

  // 4-Way Return State
  const [retOrderNo, setRetOrderNo] = React.useState(availableOrderNos[0] ?? '');
  const [retFaultType, setRetFaultType] = React.useState<ReturnFaultType>('CUSTOMER_INTACT_RETURN');
  const [retProofUrl, setRetProofUrl] = React.useState('');
  const [retNoteBn, setRetNoteBn] = React.useState('');
  const [retAlreadyPaidOut, setRetAlreadyPaidOut] = React.useState(false);

  // Sync deep-links from Notifications or 360° Vendor Profile
  React.useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
    if (initialStatusFilter) setStatusFilter(initialStatusFilter);
    if (initialVendorFilter) {
      setVendorFilter(initialVendorFilter);
      setLedgerVendorId(initialVendorFilter);
      setCreateVendorId(initialVendorFilter);
      const matched = vendorsEscrow.find((v) => v.profile.vendorId === initialVendorFilter);
      if (matched) {
        setCreateReceiverAcc(matched.profile.payoutAccountNo);
        if (matched.profile.payoutMethodBn) setCreateMethod(matched.profile.payoutMethodBn);
      }
    }
    if (openCreateMode) {
      setShowCreate(true);
      setCreateMode(openCreateMode);
    }
    if (initialSubTab || initialVendorFilter || initialStatusFilter || openCreateMode) {
      onConsumeDeepLink?.();
    }
  }, [
    initialStatusFilter,
    initialSubTab,
    initialVendorFilter,
    onConsumeDeepLink,
    openCreateMode,
    vendorsEscrow,
  ]);

  const loadRegister = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/vendor-payouts', { cache: 'no-store' });
      const payload = (await res.json()) as AdminVendorPayoutRegisterDTO;
      if (!res.ok || !payload.success) {
        setError(
          payload.errorBn ?? t('পেআউট রেজিস্টার লোড করা যায়নি।', 'Could not load payout register.')
        );
        setData(null);
        return;
      }
      setData(payload);
    } catch {
      setError(t('নেটওয়ার্ক ত্রুটি হয়েছে। আবার চেষ্টা করুন।', 'Network error. Please retry.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void loadRegister();
  }, [loadRegister]);

  const refreshAll = React.useCallback(async () => {
    await Promise.all([loadRegister(), onRefreshWorkspace()]);
  }, [loadRegister, onRefreshWorkspace]);

  const postPayoutApi = React.useCallback(
    async (body: Record<string, unknown>, successMsg: string): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await fetch('/api/admin/vendor-payouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = (await res.json()) as { success?: boolean; errorBn?: string };
        if (!res.ok || !payload.success) {
          onNotify(payload.errorBn ?? t('কাজটি সম্পন্ন হয়নি।', 'Action failed.'), 'error');
          return false;
        }
        onNotify(successMsg, 'success');
        await refreshAll();
        return true;
      } catch {
        onNotify(t('নেটওয়ার্ক ত্রুটি হয়েছে।', 'Network error.'), 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onNotify, refreshAll, t]
  );

  const postWorkspace = React.useCallback(
    async (body: Record<string, unknown>, successMsg: string): Promise<boolean> => {
      setBusy(true);
      try {
        const res = await fetch('/api/admin/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = (await res.json()) as {
          success?: boolean;
          errorBn?: string;
          batch?: { summaryBn?: string };
        };
        if (!res.ok || !payload.success) {
          onNotify(payload.errorBn ?? t('কাজটি সম্পন্ন হয়নি।', 'Action failed.'), 'error');
          return false;
        }
        onNotify(payload.batch?.summaryBn ?? successMsg, 'success');
        await refreshAll();
        return true;
      } catch {
        onNotify(t('নেটওয়ার্ক ত্রুটি হয়েছে।', 'Network error.'), 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [onNotify, refreshAll, t]
  );

  // Auto-fill payout account when selecting vendor in Create form
  const handleSelectCreateVendor = (vendorId: string) => {
    setCreateVendorId(vendorId);
    const matched = vendorsEscrow.find((v) => v.profile.vendorId === vendorId);
    if (matched) {
      setCreateReceiverAcc(matched.profile.payoutAccountNo || '');
      if (matched.profile.payoutMethodBn) setCreateMethod(matched.profile.payoutMethodBn);
    }
  };

  const rows = data?.rows ?? [];
  const filteredRows = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (vendorFilter !== 'all' && row.vendorId !== vendorFilter) return false;
      if (!q) return true;
      return [
        row.payoutId,
        row.vendorCode,
        row.vendorNameBn,
        row.paymentTrxId ?? '',
        row.requestedByUsername,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [rows, search, statusFilter, vendorFilter]);

  const activeEscrowVendor =
    vendorsEscrow.find((v) => v.profile.vendorId === ledgerVendorId) ?? vendorsEscrow[0] ?? null;

  const filteredLedger = React.useMemo(() => {
    if (!activeEscrowVendor) return [];
    let list = ledgerEntries.filter((e) => e.vendorId === activeEscrowVendor.profile.vendorId);
    if (ledgerBucketFilter === 'pending' || ledgerBucketFilter === 'locked' || ledgerBucketFilter === 'available') {
      list = list.filter((e) => e.escrowBucket === ledgerBucketFilter);
    } else if (ledgerBucketFilter === 'payout') {
      list = list.filter((e) => e.entryType.includes('PAYOUT'));
    } else if (ledgerBucketFilter === 'return') {
      list = list.filter((e) => e.entryType.includes('RETURN'));
    }
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase();
      list = list.filter(
        (e) =>
          e.id.toLowerCase().includes(q) ||
          (e.orderNo && e.orderNo.toLowerCase().includes(q)) ||
          e.descriptionBn.toLowerCase().includes(q)
      );
    }
    return list;
  }, [activeEscrowVendor, ledgerBucketFilter, ledgerEntries, ledgerSearch]);

  const pendingReversalsCount = ledgerReversals.filter(
    (r) => r.status === 'pending_checker_approval'
  ).length;
  const outstandingPayoutsCount =
    (data?.totals.requestedCount ?? 0) + (data?.totals.approvedCount ?? 0);

  if (loading && !data) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-[var(--radius-md)] border border-border bg-bg p-5 space-y-3">
        <div className="flex items-center gap-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <span>{error ?? t('তথ্য পাওয়া যায়নি।', 'No payout data available.')}</span>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void loadRegister()}
          leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />}
        >
          {t('আবার চেষ্টা করুন', 'Retry')}
        </Button>
      </div>
    );
  }

  const totals = data.totals;
  const parsedCreateAmount = parseTaka(createAmount) ?? 0;
  const feePreview = computeChannelFeePoisha(parsedCreateAmount, feeEstimatorChannel);

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-ink">
            {t('পেআউট ও এসক্রো লেজার', 'Payouts & Escrow Ledger')}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {t(
              'ভেন্ডর পেআউট রেজিস্টার, সরাসরি পরিশোধ, ৭-দিন এসক্রো ম্যাচুরিটি, লেজার এবং রিটার্ন সমন্বয়।',
              'Vendor payout register, direct settlement, 7-day escrow maturity, append-only ledger, and return adjustments.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshAll()}
            leftIcon={<RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} aria-hidden="true" />}
          >
            {t('রিফ্রেশ', 'Refresh')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {t('স্টেটমেন্ট প্রিন্ট', 'Print Statement')}
          </Button>
          {isSuperAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => {
                setSubTab('register');
                setShowCreate((open) => !open);
                setCreateError(null);
              }}
              leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {t('নতুন পেআউট / পরিশোধ', 'New Payout / Pay')}
            </Button>
          )}
        </div>
      </div>

      {/* 4 Financial KPI Tiles */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5">
          <p className="text-xs text-muted">{t('মোট পরিশোধিত', 'Total Disbursed')}</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-success">
            {money(totals.totalDisbursedPoisha)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {t(`${totals.paidCount} টি পেআউট`, `${totals.paidCount} paid payouts`)}
          </p>
        </div>

        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5">
          <p className="text-xs text-muted">{t('অনিষ্পন্ন / বাকি', 'Outstanding')}</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-warning">
            {money(totals.totalOutstandingPoisha)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {t(
              `${totals.requestedCount} অনুরোধকৃত · ${totals.approvedCount} অনুমোদিত`,
              `${totals.requestedCount} requested · ${totals.approvedCount} approved`
            )}
          </p>
        </div>

        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5">
          <p className="text-xs text-muted">{t('এসক্রোতে হোল্ড', 'Held in Escrow')}</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-ink">
            {money(totals.escrowHeldPoisha)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {t('মেয়াদপূর্তির অপেক্ষায়', 'Awaiting maturity')}
          </p>
        </div>

        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5">
          <p className="text-xs text-muted">{t('ক্যাশ-আউট চার্জ (আনুমানিক)', 'Est. Cash-Out Fees')}</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-danger">
            -{money(totals.estimatedFeePoisha)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {t('পরিশোধিত পেআউটে ১.৮৫%', '1.85% reference on paid')}
          </p>
        </div>
      </div>

      {/* Segmented Sub-Tab Navigation */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
        {(
          [
            {
              key: 'register' as const,
              label: t('পেআউট রেজিস্টার ও নিষ্পত্তি', 'Payout Register & Settlement'),
              icon: <Banknote className="h-4 w-4 shrink-0" aria-hidden="true" />,
              count: outstandingPayoutsCount,
              highlight: outstandingPayoutsCount > 0,
            },
            {
              key: 'ledger' as const,
              label: t('এসক্রো লেজার ও ম্যাচুরিটি', 'Escrow Ledger & Maturity'),
              icon: <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />,
              count: pendingReversalsCount > 0 ? pendingReversalsCount : undefined,
              highlight: pendingReversalsCount > 0,
            },
            {
              key: 'returns' as const,
              label: t('রিটার্ন ও দায় সমন্বয়', 'Returns & Liability'),
              icon: <RotateCcw className="h-4 w-4 shrink-0" aria-hidden="true" />,
              count: returnResolutions.length,
            },
          ] as Array<{
            key: PayoutsLedgerSubTab;
            label: string;
            icon: React.ReactNode;
            count?: number;
            highlight?: boolean;
          }>
        ).map((tab) => {
          const active = subTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setSubTab(tab.key)}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'inline-flex min-h-[42px] items-center gap-2 rounded-[var(--radius-md)] border px-3.5 py-2 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer',
                active
                  ? 'border-ink bg-ink text-bg'
                  : 'border-border bg-bg text-ink hover:bg-surface'
              )}
            >
              {tab.icon}
              <span>{tab.label}</span>
              {typeof tab.count === 'number' && (
                <span
                  className={cn(
                    'font-mono text-[11px] tabular-nums',
                    active
                      ? 'text-bg/80'
                      : tab.highlight
                        ? 'font-bold text-warning'
                        : 'text-muted'
                  )}
                >
                  ({tab.count})
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ====================================================================
          SUB-TAB 1: PAYOUT REGISTER & UNIFIED SETTLEMENT
         ==================================================================== */}
      {subTab === 'register' && (
        <div className="space-y-5">
          {/* Unified Create Request / Direct Immediate Pay Form */}
          {showCreate && isSuperAdmin && (
            <div className="rounded-[var(--radius-md)] border border-border bg-surface/50 p-4 space-y-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
                <h3 className="font-semibold text-ink">
                  {createMode === 'request'
                    ? t('ভেন্ডরের পক্ষে পেআউট অনুরোধ তৈরি', 'Create Payout Request (Hold Funds)')
                    : t('সরাসরি ভেন্ডর পেমেন্ট পরিশোধ (TrxID ও প্রমাণসহ)', 'Direct Immediate Settlement (With Proof)')}
                </h3>
                <div className="flex gap-1 rounded-[var(--radius-sm)] border border-border bg-bg p-0.5">
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMode('direct');
                      setCreateError(null);
                    }}
                    className={cn(
                      'min-h-[32px] rounded-[var(--radius-sm)] px-2.5 text-xs font-semibold cursor-pointer',
                      createMode === 'direct' ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
                    )}
                  >
                    {t('সরাসরি পরিশোধ', 'Direct Pay Now')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreateMode('request');
                      setCreateError(null);
                    }}
                    className={cn(
                      'min-h-[32px] rounded-[var(--radius-sm)] px-2.5 text-xs font-semibold cursor-pointer',
                      createMode === 'request' ? 'bg-ink text-bg' : 'text-muted hover:text-ink'
                    )}
                  >
                    {t('অনুরোধ (Hold)', 'Request (Hold)')}
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1">
                  <span className="font-medium text-ink">{t('ভেন্ডর *', 'Vendor *')}</span>
                  <select
                    className={inputCls}
                    value={createVendorId}
                    onChange={(e) => handleSelectCreateVendor(e.target.value)}
                  >
                    <option value="">{t('— নির্বাচন করুন —', '— select —')}</option>
                    {data.vendorRollups.map((v) => (
                      <option key={v.vendorId} value={v.vendorId}>
                        {v.vendorCode} · {v.vendorNameBn} ({t('পাওনা:', 'Owed:')} {money(v.totalOwedPoisha)})
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <span className="font-medium text-ink">{t('পরিমাণ (৳) *', 'Amount (৳) *')}</span>
                  <input
                    className={cn(inputCls, 'font-mono')}
                    inputMode="decimal"
                    placeholder="1000"
                    value={createAmount}
                    onChange={(e) => setCreateAmount(e.target.value)}
                  />
                </label>

                <label className="space-y-1">
                  <span className="font-medium text-ink">
                    {createMode === 'direct'
                      ? t('চার্জ / ফি (৳)', 'Fee (৳)')
                      : t('ফি ক্যালকুলেটর চ্যানেল', 'Fee Preview Channel')}
                  </span>
                  {createMode === 'direct' ? (
                    <input
                      className={cn(inputCls, 'font-mono')}
                      inputMode="decimal"
                      placeholder="0"
                      value={createFee}
                      onChange={(e) => setCreateFee(e.target.value)}
                    />
                  ) : (
                    <select
                      className={inputCls}
                      value={feeEstimatorChannel}
                      onChange={(e) =>
                        setFeeEstimatorChannel(
                          e.target.value as 'bkash_merchant' | 'personal_send' | 'bank_beftn'
                        )
                      }
                    >
                      <option value="bkash_merchant">{t('বিকাশ মার্চেন্ট (১.৮৫%)', 'bKash Merchant (1.85%)')}</option>
                      <option value="personal_send">{t('পার্সোনাল সেন্ড মানি (৳১০ + ১.৮৫%)', 'Personal Send (৳10 + 1.85%)')}</option>
                      <option value="bank_beftn">{t('ব্যাংক BEFTN (৳০)', 'Bank BEFTN (Free)')}</option>
                    </select>
                  )}
                </label>
              </div>

              {createMode === 'direct' && (
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="space-y-1">
                    <span className="font-medium text-ink">{t('মাধ্যম *', 'Channel *')}</span>
                    <select
                      className={inputCls}
                      value={createMethod}
                      onChange={(e) => setCreateMethod(e.target.value)}
                    >
                      <option value="বিকাশ (bKash)">বিকাশ (bKash)</option>
                      <option value="ব্যাংক ট্রান্সফার (Bank Transfer)">ব্যাংক ট্রান্সফার (Bank Transfer)</option>
                      <option value="নগদ ক্যাশ / অফিস (Cash)">নগদ ক্যাশ / অফিস (Cash)</option>
                    </select>
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium text-ink">{t('প্রেরকের অ্যাকাউন্ট', 'Sender Account')}</span>
                    <input
                      className={cn(inputCls, 'font-mono')}
                      placeholder="017..."
                      value={createSenderAcc}
                      onChange={(e) => setCreateSenderAcc(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium text-ink">{t('ভেন্ডরের অ্যাকাউন্ট *', 'Vendor Account *')}</span>
                    <input
                      className={cn(inputCls, 'font-mono')}
                      placeholder="017... / Bank Acc"
                      value={createReceiverAcc}
                      onChange={(e) => setCreateReceiverAcc(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium text-ink">{t('TrxID / রেফারেন্স *', 'TrxID / Reference *')}</span>
                    <input
                      className={cn(inputCls, 'font-mono')}
                      placeholder="TRX-2026..."
                      value={createTrxId}
                      onChange={(e) => setCreateTrxId(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium text-ink">{t('পরিশোধের সময় *', 'Paid Date & Time *')}</span>
                    <input
                      type="datetime-local"
                      className={cn(inputCls, 'font-mono')}
                      value={createPaidAt}
                      onChange={(e) => setCreatePaidAt(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="font-medium text-ink">{t('প্রমাণ লিংক (ঐচ্ছিক)', 'Proof URL (optional)')}</span>
                    <input
                      className={cn(inputCls, 'font-mono')}
                      placeholder="https://..."
                      value={createProofUrl}
                      onChange={(e) => setCreateProofUrl(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1 sm:col-span-2">
                    <span className="font-medium text-ink">{t('মন্তব্য / নোট', 'Settlement Note')}</span>
                    <input
                      className={inputCls}
                      value={createNote}
                      onChange={(e) => setCreateNote(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2 self-end rounded-[var(--radius-sm)] border border-border bg-bg p-2.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={createAutoCredit}
                      onChange={(e) => setCreateAutoCredit(e.target.checked)}
                      className="accent-ink"
                    />
                    <span className="text-[11px]">
                      {t(
                        'উত্তোলনযোগ্য কম থাকলে অগ্রিম যোগ করে পরিশোধ',
                        'Auto-credit advance if withdrawable is low'
                      )}
                    </span>
                  </label>
                </div>
              )}

              {/* Live balance & fee summary */}
              {(() => {
                const selectedRollup = data.vendorRollups.find((v) => v.vendorId === createVendorId);
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
                    <div className="space-y-0.5 text-[11px] text-muted font-mono tabular-nums">
                      {selectedRollup && (
                        <p>
                          {t('উত্তোলনযোগ্য:', 'Withdrawable:')}{' '}
                          <strong className="text-ink">
                            {money(selectedRollup.balance.withdrawablePoisha)}
                          </strong>
                          {' · '}
                          {t('মোট পাওনা:', 'Owed:')}{' '}
                          <strong className="text-ink">{money(selectedRollup.totalOwedPoisha)}</strong>
                          {' · '}
                          {t('সর্বনিম্ন:', 'Min:')} {money(data.minPayoutRequestPoisha)}
                        </p>
                      )}
                      {parsedCreateAmount > 0 && (
                        <p>
                          {t('আনুমানিক ফি:', 'Est. Fee:')}{' '}
                          <span className="text-danger">-{money(feePreview.feePoisha)}</span>
                          {' · '}
                          {t('নিট প্রদেয়:', 'Net Payable:')}{' '}
                          <strong className="text-success">{money(feePreview.netPoisha)}</strong>
                        </p>
                      )}
                      {createError && <p className="font-sans text-danger">{createError}</p>}
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="primary"
                        size="sm"
                        isLoading={busy}
                        onClick={async () => {
                          setCreateError(null);
                          if (!createVendorId) {
                            setCreateError(t('ভেন্ডর নির্বাচন করুন।', 'Select a vendor.'));
                            return;
                          }
                          const amt = parseTaka(createAmount);
                          if (amt === null || amt <= 0) {
                            setCreateError(t('সঠিক পরিমাণ লিখুন।', 'Enter a valid amount.'));
                            return;
                          }
                          if (createMode === 'request') {
                            if (amt < data.minPayoutRequestPoisha) {
                              setCreateError(
                                t(
                                  `সর্বনিম্ন পেআউট ${money(data.minPayoutRequestPoisha)}।`,
                                  `Minimum payout is ${money(data.minPayoutRequestPoisha)}.`
                                )
                              );
                              return;
                            }
                            const ok = await postPayoutApi(
                              {
                                operation: 'create_payout',
                                vendorId: createVendorId,
                                requestedAmountPoisha: amt,
                              },
                              t('পেআউট অনুরোধ তৈরি ও ব্যালেন্স হোল্ড হয়েছে।', 'Payout request created.')
                            );
                            if (ok) {
                              setShowCreate(false);
                              setCreateAmount('');
                            }
                          } else {
                            const feePoisha = parseTaka(createFee || '0') ?? 0;
                            if (createTrxId.trim().length < 3) {
                              setCreateError(
                                t('কমপক্ষে ৩ অক্ষরের TrxID দিন।', 'Enter a TrxID (min 3 chars).')
                              );
                              return;
                            }
                            if (!createReceiverAcc.trim()) {
                              setCreateError(
                                t('ভেন্ডরের অ্যাকাউন্ট নম্বর দিন।', 'Enter vendor account number.')
                              );
                              return;
                            }
                            const ok = await postPayoutApi(
                              {
                                operation: 'direct_payout',
                                vendorId: createVendorId,
                                requestedAmountPoisha: amt,
                                feePoisha,
                                payoutMethodBn: createMethod,
                                payoutAccountNo: createReceiverAcc.trim(),
                                senderAccountNo: createSenderAcc.trim() || undefined,
                                paymentTrxId: createTrxId.trim(),
                                proofUrl: createProofUrl.trim() || undefined,
                                noteBn: createNote.trim() || undefined,
                                paidAt: createPaidAt ? new Date(createPaidAt).toISOString() : undefined,
                                creditAndSettleIfInsufficient: createAutoCredit,
                              },
                              t('সরাসরি ভেন্ডর পেমেন্ট সংরক্ষিত হয়েছে।', 'Direct vendor payment saved.')
                            );
                            if (ok) {
                              setShowCreate(false);
                              setCreateAmount('');
                              setCreateTrxId('');
                              setCreateProofUrl('');
                              setCreateNote('');
                            }
                          }
                        }}
                      >
                        {createMode === 'request'
                          ? t('অনুরোধ তৈরি করুন', 'Create Request')
                          : t('পরিশোধ সংরক্ষণ করুন', 'Save Direct Payment')}
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                        {t('বাতিল', 'Cancel')}
                      </Button>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Per-Vendor Account Roll-Up Table */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <span>{t('ভেন্ডর অনুযায়ী হিসাব', 'Per-Vendor Balances')}</span>
                <InfoTooltip termKey="supplier_payable" locale={locale} />
              </h3>
              {vendorFilter !== 'all' && (
                <Button variant="outline" size="sm" onClick={() => setVendorFilter('all')}>
                  {t('ভেন্ডর ফিল্টার সরান', 'Clear Vendor Filter')}
                </Button>
              )}
            </div>

            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-bg">
              <table className="w-full min-w-[780px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/70 text-[11px] font-semibold text-muted">
                    <th className="py-2.5 px-3.5">{t('ভেন্ডর', 'Vendor')}</th>
                    <th className="py-2.5 px-3 text-right">{t('মোট অর্জিত', 'Total Earned')}</th>
                    <th className="py-2.5 px-3 text-right">{t('পরিশোধিত', 'Paid')}</th>
                    <th className="py-2.5 px-3 text-right">{t('মোট পাওনা', 'Total Owed')}</th>
                    <th className="py-2.5 px-3 text-right">{t('উত্তোলনযোগ্য', 'Withdrawable')}</th>
                    <th className="py-2.5 px-3 text-right">{t('সর্বশেষ পেমেন্ট', 'Last Paid')}</th>
                    <th className="py-2.5 px-3.5 text-right">{t('লিংক', 'Profile')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {data.vendorRollups.map((vendor) => {
                    const isFiltered = vendorFilter === vendor.vendorId;
                    return (
                      <tr
                        key={vendor.vendorId}
                        onClick={() =>
                          setVendorFilter((curr) =>
                            curr === vendor.vendorId ? 'all' : vendor.vendorId
                          )
                        }
                        className={cn(
                          'cursor-pointer transition-colors hover:bg-surface/60',
                          isFiltered && 'bg-surface/80'
                        )}
                      >
                        <td className="py-2.5 px-3.5">
                          <span className="font-mono text-[11px] text-muted">{vendor.vendorCode}</span>{' '}
                          <span className="font-semibold text-ink">{vendor.vendorNameBn}</span>
                          {isFiltered && (
                            <span className="ml-1.5 text-[11px] font-medium text-info">
                              · {t('ফিল্টার্ড', 'Filtered')}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                          {money(vendor.totalEarnedPoisha)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-success">
                          {money(vendor.paidPoisha)}{' '}
                          <span className="text-[10px] text-muted">({vendor.paidCount})</span>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-warning">
                          {money(vendor.totalOwedPoisha)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                          {money(vendor.balance.withdrawablePoisha)}
                        </td>
                        <td className="py-2.5 px-3 text-right text-muted whitespace-nowrap">
                          {fmtDateTime(vendor.lastPaidAt, locale)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenVendorProfile(vendor.vendorId);
                            }}
                            className="inline-flex items-center gap-0.5 text-xs font-medium text-ink hover:underline cursor-pointer"
                          >
                            {t('৩৬০°', '360°')}
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Search & Status Filters for Payout List */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[200px]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                className={cn(inputCls, 'pl-9')}
                placeholder={t(
                  'পেআউট আইডি, ভেন্ডর বা TrxID খুঁজুন...',
                  'Search payout ID, vendor, or TrxID...'
                )}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-1">
              <Filter className="mx-1.5 h-3.5 w-3.5 text-muted" aria-hidden="true" />
              {(['all', 'requested', 'approved', 'paid', 'rejected'] as const).map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => setStatusFilter(status)}
                  className={cn(
                    'min-h-[34px] rounded-[var(--radius-sm)] px-2.5 text-xs font-medium whitespace-nowrap shrink-0 cursor-pointer transition-colors',
                    statusFilter === status
                      ? 'bg-bg text-ink font-semibold shadow-xs'
                      : 'text-muted hover:text-ink'
                  )}
                >
                  {status === 'all' ? t('সব', 'All') : t(STATUS_META[status].bn, STATUS_META[status].en)}
                  {status !== 'all' && (
                    <span className="ml-1 font-mono text-[10px] text-muted">
                      {rows.filter((r) => r.status === status).length}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Payout Register Rows */}
          {filteredRows.length === 0 ? (
            <EmptyState
              title={t('কোনো পেআউট পাওয়া যায়নি', 'No payouts found')}
              description={t(
                'ভেন্ডর পেআউট অনুরোধ পাঠালে অথবা আপনি নতুন পেআউট তৈরি করলে এখানে তালিকাভুক্ত হবে।',
                'Vendor payout requests and direct settlements appear here.'
              )}
            />
          ) : (
            <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-bg">
              {filteredRows.map((row) => {
                const meta = STATUS_META[row.status];
                const open = openPayoutId === row.payoutId;
                return (
                  <div key={row.payoutId} className="p-3.5">
                    <button
                      type="button"
                      onClick={() => setOpenPayoutId(open ? null : row.payoutId)}
                      className="flex w-full items-center justify-between gap-3 text-left cursor-pointer"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        {open ? (
                          <ChevronDown className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        ) : (
                          <ChevronRight className="h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold text-ink">
                            <span className="font-mono text-muted">{row.vendorCode}</span> ·{' '}
                            {row.vendorNameBn}
                          </p>
                          <p className="mt-0.5 truncate font-mono text-[11px] text-muted">
                            {row.payoutId} · {fmtDateTime(row.requestedAt, locale)}
                            {row.paymentTrxId ? ` · TrxID ${row.paymentTrxId}` : ''}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <Badge status={meta.tone}>{t(meta.bn, meta.en)}</Badge>
                        <span className="font-mono text-sm font-bold tabular-nums text-ink">
                          {money(row.requestedAmountPoisha)}
                        </span>
                      </div>
                    </button>

                    {open && (
                      <PayoutDetailDrawer
                        row={row}
                        locale={locale}
                        busy={busy}
                        trxDraft={trxDraft[row.payoutId] ?? ''}
                        feeDraft={feeDraft[row.payoutId] ?? ''}
                        senderDraft={senderDraft[row.payoutId] ?? ''}
                        proofDraft={proofDraft[row.payoutId] ?? ''}
                        noteDraft={noteDraft[row.payoutId] ?? ''}
                        reasonDraft={reasonDraft[row.payoutId] ?? ''}
                        overrideDraft={overrideDraft[row.payoutId] ?? ''}
                        onChange={(field, val) => {
                          if (field === 'trx') setTrxDraft((d) => ({ ...d, [row.payoutId]: val }));
                          if (field === 'fee') setFeeDraft((d) => ({ ...d, [row.payoutId]: val }));
                          if (field === 'sender') setSenderDraft((d) => ({ ...d, [row.payoutId]: val }));
                          if (field === 'proof') setProofDraft((d) => ({ ...d, [row.payoutId]: val }));
                          if (field === 'note') setNoteDraft((d) => ({ ...d, [row.payoutId]: val }));
                          if (field === 'reason') setReasonDraft((d) => ({ ...d, [row.payoutId]: val }));
                          if (field === 'override') setOverrideDraft((d) => ({ ...d, [row.payoutId]: val }));
                        }}
                        onAction={(decision) => {
                          const parsedFee = feeDraft[row.payoutId]?.trim()
                            ? parseTaka(feeDraft[row.payoutId])
                            : null;
                          void postPayoutApi(
                            {
                              operation: 'resolve_payout',
                              payoutId: row.payoutId,
                              decision,
                              paymentTrxId:
                                decision === 'mark_paid'
                                  ? (trxDraft[row.payoutId] ?? '').trim()
                                  : undefined,
                              feePoisha:
                                decision === 'mark_paid' && parsedFee !== null
                                  ? parsedFee
                                  : undefined,
                              senderAccountNo:
                                decision === 'mark_paid'
                                  ? (senderDraft[row.payoutId] ?? '').trim() || undefined
                                  : undefined,
                              proofUrl:
                                decision === 'mark_paid'
                                  ? (proofDraft[row.payoutId] ?? '').trim() || undefined
                                  : undefined,
                              noteBn:
                                decision === 'mark_paid'
                                  ? (noteDraft[row.payoutId] ?? '').trim() || undefined
                                  : undefined,
                              rejectionReasonBn:
                                decision === 'reject'
                                  ? (reasonDraft[row.payoutId] ?? '').trim()
                                  : undefined,
                              selfApprovalOverrideReasonBn:
                                (overrideDraft[row.payoutId] ?? '').trim() || undefined,
                            },
                            decision === 'approve'
                              ? t('পেআউট অনুমোদিত হয়েছে।', 'Payout approved.')
                              : decision === 'mark_paid'
                                ? t('পেআউট পরিশোধিত হিসেবে চিহ্নিত হয়েছে।', 'Payout marked as paid.')
                                : t(
                                    'পেআউট বাতিল ও টাকা ভেন্ডরের ব্যালেন্সে ফেরত দেওয়া হয়েছে।',
                                    'Payout rejected and funds returned.'
                                  )
                          );
                        }}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 2: ESCROW LEDGER, MATURITY PROMOTER & REVERSALS
         ==================================================================== */}
      {subTab === 'ledger' && (
        <div className="space-y-5">
          {/* Vendor Selector + Maturity Promoter Bar */}
          <div className="flex flex-wrap items-end justify-between gap-3 rounded-[var(--radius-md)] border border-border bg-bg p-4">
            <label className="min-w-[240px] flex-1 space-y-1 text-xs font-medium">
              <span className="text-muted">{t('ভেন্ডর নির্বাচন করুন', 'Select Vendor')}</span>
              <select
                className={inputCls}
                value={activeEscrowVendor?.profile.vendorId ?? ''}
                onChange={(e) => setLedgerVendorId(e.target.value)}
              >
                {vendorsEscrow.map(({ profile, balance }) => (
                  <option key={profile.vendorId} value={profile.vendorId}>
                    {profile.vendorCode} — {profile.businessNameBn} ({t('উত্তোলনযোগ্য:', 'Avail:')}{' '}
                    {money(balance.withdrawablePoisha)})
                  </option>
                ))}
              </select>
            </label>

            {isSuperAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={busy}
                  onClick={() =>
                    void postWorkspace(
                      { operation: 'promote_matured_escrow', forcePromoteAllLocked: false },
                      t('মেয়াদপূর্ণ এসক্রো এন্ট্রি Available-এ উন্নীত হয়েছে।', 'Due escrow entries promoted.')
                    )
                  }
                  leftIcon={<Zap className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t('মেয়াদপূর্ণ এসক্রো রিলিজ', 'Promote Due Escrow')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  isLoading={busy}
                  onClick={() =>
                    void postWorkspace(
                      { operation: 'promote_matured_escrow', forcePromoteAllLocked: true },
                      t('সকল লকড এসক্রো Available-এ উন্নীত হয়েছে।', 'All locked escrow promoted.')
                    )
                  }
                >
                  {t('সব লকড রিলিজ', 'Force Release Locked')}
                </Button>
              </div>
            )}
          </div>

          {/* Escrow Waterfall Strip for Active Vendor */}
          {activeEscrowVendor && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
                <p className="text-[11px] text-muted">{t('পেন্ডিং (ট্রানজিট)', 'Pending (Transit)')}</p>
                <p className="mt-1 font-mono text-base font-bold tabular-nums text-ink">
                  {money(activeEscrowVendor.balance.pendingPoisha)}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
                <p className="text-[11px] text-muted">{t('লকড (হোল্ড)', 'Locked (Hold)')}</p>
                <p className="mt-1 font-mono text-base font-bold tabular-nums text-warning">
                  {money(activeEscrowVendor.balance.lockedPoisha)}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
                <p className="text-[11px] text-muted">{t('উত্তোলনযোগ্য', 'Withdrawable')}</p>
                <p className="mt-1 font-mono text-base font-bold tabular-nums text-success">
                  {money(activeEscrowVendor.balance.withdrawablePoisha)}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
                <p className="text-[11px] text-muted">{t('পেআউট হোল্ড', 'Payout Hold')}</p>
                <p className="mt-1 font-mono text-base font-bold tabular-nums text-ink">
                  {money(activeEscrowVendor.balance.payoutHoldPoisha)}
                </p>
              </div>
              <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3">
                <p className="text-[11px] text-muted">{t('ক্লব্যাক ডেট', 'Clawback Debt')}</p>
                <p className="mt-1 font-mono text-base font-bold tabular-nums text-danger">
                  {money(activeEscrowVendor.balance.clawbackDebtPoisha)}
                </p>
              </div>
            </div>
          )}

          {/* Ledger Filter Bar + Manual Entry & Reversals Toggles */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-2 flex-1 min-w-[220px]">
              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search
                  className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
                  aria-hidden="true"
                />
                <input
                  type="search"
                  className={cn(inputCls, 'pl-9')}
                  placeholder={t('অর্ডার বা বিবরণ খুঁজুন...', 'Search order or description...')}
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-1">
                {(
                  [
                    ['all', t('সব', 'All')],
                    ['pending', t('পেন্ডিং', 'Pending')],
                    ['locked', t('লকড', 'Locked')],
                    ['available', t('উত্তোলনযোগ্য', 'Available')],
                    ['payout', t('পেআউট', 'Payouts')],
                    ['return', t('রিটার্ন', 'Returns')],
                  ] as const
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setLedgerBucketFilter(key)}
                    className={cn(
                      'min-h-[32px] rounded-[var(--radius-sm)] px-2 text-xs font-medium cursor-pointer',
                      ledgerBucketFilter === key
                        ? 'bg-bg text-ink font-semibold shadow-xs'
                        : 'text-muted hover:text-ink'
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {isSuperAdmin && (
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant={showManualLedger ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setShowManualLedger((v) => !v)}
                  leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t('ম্যানুয়াল এন্ট্রি', 'Manual Entry')}
                </Button>
                <Button
                  variant={showReversals ? 'secondary' : 'outline'}
                  size="sm"
                  onClick={() => setShowReversals((v) => !v)}
                  leftIcon={<RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t(
                    `লেজার রিভার্সাল (${pendingReversalsCount})`,
                    `Reversals (${pendingReversalsCount})`
                  )}
                </Button>
              </div>
            )}
          </div>

          {/* Collapsible Manual Ledger Entry Form */}
          {showManualLedger && isSuperAdmin && activeEscrowVendor && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                const amt = parseTaka(manAmount);
                if (!amt || amt <= 0) return;
                const ok = await postWorkspace(
                  {
                    operation: 'record_manual_vendor_ledger',
                    vendorId: activeEscrowVendor.profile.vendorId,
                    escrowBucket: manBucket,
                    direction: manDir,
                    amountPoisha: amt,
                    orderNo: manOrderNo.trim() || undefined,
                    paymentMethodBn: manMethod.trim() || undefined,
                    referenceNo: manRef.trim() || undefined,
                    proofUrl: manProofUrl.trim() || undefined,
                    descriptionBn: manDesc.trim(),
                  },
                  t('ম্যানুয়াল লেজার এন্ট্রি যুক্ত হয়েছে।', 'Manual ledger entry recorded.')
                );
                if (ok) {
                  setShowManualLedger(false);
                  setManAmount('');
                  setManDesc('');
                  setManRef('');
                  setManProofUrl('');
                }
              }}
              className="rounded-[var(--radius-md)] border border-border bg-surface/50 p-4 space-y-3 text-xs"
            >
              <h4 className="font-semibold text-ink">
                {t('ম্যানুয়াল লেজার সমন্বয় (Append-Only)', 'Manual Ledger Adjustment (Append-Only)')}
              </h4>
              <div className="grid gap-2.5 sm:grid-cols-4">
                <select
                  className={inputCls}
                  value={manBucket}
                  onChange={(e) => setManBucket(e.target.value as 'pending' | 'locked' | 'available')}
                >
                  <option value="available">{t('Available (উত্তোলনযোগ্য)', 'Available')}</option>
                  <option value="locked">{t('Locked (হোল্ড)', 'Locked')}</option>
                  <option value="pending">{t('Pending (ট্রানজিট)', 'Pending')}</option>
                </select>
                <select
                  className={inputCls}
                  value={manDir}
                  onChange={(e) => setManDir(e.target.value as 'credit' | 'debit')}
                >
                  <option value="credit">{t('ক্রেডিট (+ যোগ)', 'Credit (+)')}</option>
                  <option value="debit">{t('ডেবিট (- বিয়োগ)', 'Debit (-)')}</option>
                </select>
                <input
                  className={cn(inputCls, 'font-mono')}
                  inputMode="decimal"
                  placeholder={t('পরিমাণ (৳) *', 'Amount (৳) *')}
                  value={manAmount}
                  onChange={(e) => setManAmount(e.target.value)}
                  required
                />
                <input
                  className={cn(inputCls, 'font-mono')}
                  placeholder={t('অর্ডার নং (ঐচ্ছিক)', 'Order No (opt.)')}
                  value={manOrderNo}
                  onChange={(e) => setManOrderNo(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder={t('বিবরণ / কারণ *', 'Description / reason *')}
                  value={manDesc}
                  onChange={(e) => setManDesc(e.target.value)}
                  required
                  minLength={3}
                />
                <input
                  className={inputCls}
                  placeholder={t('মাধ্যম', 'Payment method')}
                  value={manMethod}
                  onChange={(e) => setManMethod(e.target.value)}
                />
                <input
                  className={cn(inputCls, 'font-mono')}
                  placeholder={t('রেফারেন্স / TrxID', 'Reference / TrxID')}
                  value={manRef}
                  onChange={(e) => setManRef(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder={t('প্রুফ URL (https://...)', 'Proof URL (opt.)')}
                  value={manProofUrl}
                  onChange={(e) => setManProofUrl(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button type="submit" variant="primary" size="sm" isLoading={busy}>
                  {t('লেজারে যুক্ত করুন', 'Post Entry')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowManualLedger(false)}
                >
                  {t('বাতিল', 'Cancel')}
                </Button>
              </div>
            </form>
          )}

          {/* Collapsible Maker-Checker Ledger Reversals */}
          {showReversals && isSuperAdmin && (
            <div className="rounded-[var(--radius-md)] border border-border bg-surface/50 p-4 space-y-3.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h4 className="font-semibold text-ink">
                    {t('মেকার-চেকার লেজার রিভার্সাল', 'Maker-Checker Ledger Reversals')}
                  </h4>
                  <p className="text-[11px] text-muted">
                    {t(
                      'পোস্টকৃত এন্ট্রি সরাসরি এডিট না করে বিপরীত জার্নাল তৈরি ও অনুমোদন করুন।',
                      'Correct posted entries with audited counter-journals.'
                    )}
                  </p>
                </div>
                <label className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span>{t('২এফএ ওভাররাইড (ঐচ্ছিক):', '2FA Override (opt.):')}</span>
                  <input
                    maxLength={6}
                    value={revEmergencyTotp}
                    onChange={(e) => setRevEmergencyTotp(e.target.value)}
                    placeholder="123456"
                    className="h-8 w-20 rounded-[var(--radius-sm)] border border-border bg-bg px-2 text-center font-mono text-xs text-ink"
                  />
                </label>
              </div>

              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (!revOriginalEntryId.trim() || !revReasonBn.trim()) return;
                  const ok = await postWorkspace(
                    {
                      operation: 'create_ledger_reversal',
                      originalLedgerEntryId: revOriginalEntryId.trim(),
                      correctedCreditPoisha: Math.round((Number(revCorrectedBdt) || 0) * 100),
                      reasonBn: revReasonBn.trim(),
                    },
                    t('রিভার্সাল অনুরোধ জমা হয়েছে।', 'Reversal request created.')
                  );
                  if (ok) setRevReasonBn('');
                }}
                className="grid gap-2 sm:grid-cols-4"
              >
                <input
                  className={cn(inputCls, 'font-mono')}
                  placeholder={t('মূল লেজার আইডি *', 'Original Entry ID *')}
                  value={revOriginalEntryId}
                  onChange={(e) => setRevOriginalEntryId(e.target.value)}
                  required
                />
                <input
                  type="number"
                  min={0}
                  className={cn(inputCls, 'font-mono')}
                  placeholder={t('সংশোধিত অংক (৳)', 'Corrected Amount (৳)')}
                  value={revCorrectedBdt}
                  onChange={(e) => setRevCorrectedBdt(e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder={t('রিভার্সালের কারণ *', 'Audit reason *')}
                  value={revReasonBn}
                  onChange={(e) => setRevReasonBn(e.target.value)}
                  required
                />
                <Button type="submit" variant="primary" size="sm" isLoading={busy}>
                  {t('রিভার্সাল অনুরোধ', 'Create Reversal')}
                </Button>
              </form>

              {ledgerReversals.length > 0 && (
                <div className="divide-y divide-border rounded-[var(--radius-sm)] border border-border bg-bg">
                  {ledgerReversals.map((rev) => (
                    <div key={rev.reversalId} className="p-3 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-mono font-semibold text-ink">
                          {rev.reversalCode} · {rev.originalLedgerEntryId}
                        </span>
                        <span className="font-mono text-danger tabular-nums">
                          {money(rev.originalAmountPoisha)} → {money(rev.correctedCreditPoisha)} (
                          {rev.status})
                        </span>
                      </div>
                      <p className="text-[11px] text-muted">
                        Maker: @{rev.createdByUsername}
                        {rev.approvedByUsername ? ` · Checker: @${rev.approvedByUsername}` : ''} ·{' '}
                        {rev.reasonBn}
                      </p>
                      {rev.status === 'pending_checker_approval' && (
                        <div className="flex gap-2 pt-1">
                          <Button
                            variant="primary"
                            size="sm"
                            isLoading={busy}
                            onClick={() =>
                              void postWorkspace(
                                {
                                  operation: 'resolve_ledger_reversal',
                                  reversalId: rev.reversalId,
                                  decision: 'approve',
                                  emergencySelfApprovalOverride: Boolean(revEmergencyTotp.trim()),
                                  emergencyOverrideReasonBn:
                                    'সুপার অ্যাডমিন ২এফএ ইমার্জেন্সি ওভাররাইড।',
                                  totpCode: revEmergencyTotp.trim() || undefined,
                                },
                                t('লেজার রিভার্সাল অনুমোদিত হয়েছে।', 'Ledger reversal approved.')
                              )
                            }
                          >
                            {t('চেকার অনুমোদন', 'Approve Reversal')}
                          </Button>
                          <Button
                            variant="danger"
                            size="sm"
                            isLoading={busy}
                            onClick={() =>
                              void postWorkspace(
                                {
                                  operation: 'resolve_ledger_reversal',
                                  reversalId: rev.reversalId,
                                  decision: 'reject',
                                },
                                t('রিভার্সাল বাতিল করা হয়েছে।', 'Reversal rejected.')
                              )
                            }
                          >
                            {t('বাতিল', 'Reject')}
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Immutable Ledger Table */}
          {filteredLedger.length === 0 ? (
            <EmptyState
              title={t('কোনো লেজার এন্ট্রি নেই', 'No ledger entries')}
              description={t(
                'নির্বাচিত ফিল্টারে কোনো লেনদেন পাওয়া যায়নি।',
                'No ledger entries match the selected filter.'
              )}
            />
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-bg">
              <table className="w-full min-w-[700px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/70 text-[11px] font-semibold text-muted">
                    <th className="py-2.5 px-3.5">{t('তারিখ ও আইডি', 'Date & ID')}</th>
                    <th className="py-2.5 px-3">{t('বিবরণ', 'Description')}</th>
                    <th className="py-2.5 px-3">{t('বাকেট', 'Bucket')}</th>
                    <th className="py-2.5 px-3">{t('অর্ডার / রেফ', 'Order / Ref')}</th>
                    <th className="py-2.5 px-3.5 text-right">{t('পরিমাণ', 'Amount')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredLedger.map((entry) => (
                    <tr key={entry.id}>
                      <td className="py-2.5 px-3.5 whitespace-nowrap">
                        <p className="font-mono text-[11px] text-ink">
                          {fmtDateTime(entry.createdAt, locale)}
                        </p>
                        <p className="font-mono text-[10px] text-muted">{entry.id}</p>
                      </td>
                      <td className="py-2.5 px-3">
                        <p className="text-ink">{entry.descriptionBn}</p>
                        {entry.noteBn && (
                          <p className="text-[11px] text-muted">{entry.noteBn}</p>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <Badge
                          status={
                            entry.escrowBucket === 'available'
                              ? 'success'
                              : entry.escrowBucket === 'locked'
                                ? 'warning'
                                : 'neutral'
                          }
                        >
                          {entry.escrowBucket}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-muted whitespace-nowrap">
                        {entry.orderNo ?? entry.referenceNo ?? '—'}
                      </td>
                      <td
                        className={cn(
                          'py-2.5 px-3.5 text-right font-mono font-semibold tabular-nums whitespace-nowrap',
                          entry.amountPoisha >= 0 ? 'text-success' : 'text-danger'
                        )}
                      >
                        {entry.amountPoisha >= 0 ? '+' : ''}
                        {money(entry.amountPoisha)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Recent Maturity Batches (Quiet Inline Log) */}
          {maturityBatches.length > 0 && (
            <div className="rounded-[var(--radius-md)] border border-border bg-surface/40 p-3.5 text-xs space-y-1.5">
              <p className="font-semibold text-ink">
                {t('সাম্প্রতিক এসক্রো ম্যাচুরিটি ব্যাচ', 'Recent Escrow Maturity Runs')}
              </p>
              <ul className="space-y-1 text-[11px] text-muted">
                {maturityBatches.slice(0, 4).map((b) => (
                  <li key={b.batchId} className="font-mono">
                    {fmtDateTime(b.executedAt, locale)} · {b.summaryBn}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 3: RETURNS & LIABILITY (4-WAY RETURN ENGINE)
         ==================================================================== */}
      {subTab === 'returns' && (
        <div className="grid gap-5 lg:grid-cols-12">
          {/* Left: Process 4-Way Return */}
          {isSuperAdmin && (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                if (!retOrderNo.trim() || retNoteBn.trim().length < 2) return;
                const ok = await postWorkspace(
                  {
                    operation: 'process_four_way_return',
                    orderNo: retOrderNo.trim(),
                    faultType: retFaultType,
                    proofUrl: retProofUrl.trim(),
                    noteBn: retNoteBn.trim(),
                    wasAlreadyPaidOut: retAlreadyPaidOut,
                  },
                  t('রিটার্ন ও ভেন্ডর দায় সমন্বয় সম্পন্ন হয়েছে।', 'Return resolved and ledger updated.')
                );
                if (ok) {
                  setRetNoteBn('');
                  setRetProofUrl('');
                }
              }}
              className="rounded-[var(--radius-md)] border border-border bg-bg p-4 space-y-3 text-xs lg:col-span-5"
            >
              <div>
                <h3 className="text-sm font-semibold text-ink">
                  {t('৪-মুখী রিটার্ন ও দায় নিষ্পত্তি', '4-Way Return & Liability Resolution')}
                </h3>
                <p className="mt-0.5 text-[11px] text-muted">
                  {t(
                    'দোষের ধরন অনুযায়ী স্টক, ভেন্ডর লেজার ডেবিট বা কুরিয়ার ক্লেম স্বয়ংক্রিয়ভাবে সমন্বয় হবে।',
                    'Automatically adjusts inventory, vendor ledger debit/clawback, or courier claim by fault.'
                  )}
                </p>
              </div>

              <label className="block space-y-1">
                <span className="font-medium text-ink">{t('অর্ডার নম্বর *', 'Order Number *')}</span>
                <input
                  list="return-order-list"
                  className={cn(inputCls, 'font-mono')}
                  value={retOrderNo}
                  onChange={(e) => setRetOrderNo(e.target.value)}
                  placeholder="ORD-..."
                  required
                />
                <datalist id="return-order-list">
                  {availableOrderNos.slice(0, 50).map((no) => (
                    <option key={no} value={no} />
                  ))}
                </datalist>
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-ink">{t('রিটার্নের কারণ / দায়ভার *', 'Fault Type *')}</span>
                <select
                  className={inputCls}
                  value={retFaultType}
                  onChange={(e) => setRetFaultType(e.target.value as ReturnFaultType)}
                >
                  {RETURN_FAULTS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {t(f.bn, f.en)}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-muted">
                  {t(
                    RETURN_FAULTS.find((f) => f.value === retFaultType)?.impactBn ?? '',
                    RETURN_FAULTS.find((f) => f.value === retFaultType)?.impactEn ?? ''
                  )}
                </p>
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-ink">{t('প্রমাণ লিংক (ঐচ্ছিক)', 'Proof URL (optional)')}</span>
                <input
                  className={inputCls}
                  placeholder="https://..."
                  value={retProofUrl}
                  onChange={(e) => setRetProofUrl(e.target.value)}
                />
              </label>

              <label className="block space-y-1">
                <span className="font-medium text-ink">{t('যাচাই ও QC নোট *', 'Inspection Note *')}</span>
                <input
                  className={inputCls}
                  placeholder={t(
                    'যেমন: পণ্য অক্ষত অবস্থায় গুদামে ফেরত এসেছে',
                    'e.g. Returned intact and passed QC inspection'
                  )}
                  value={retNoteBn}
                  onChange={(e) => setRetNoteBn(e.target.value)}
                  required
                  minLength={2}
                />
              </label>

              <label className="flex items-center gap-2 rounded-[var(--radius-sm)] border border-border bg-surface/50 p-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={retAlreadyPaidOut}
                  onChange={(e) => setRetAlreadyPaidOut(e.target.checked)}
                  className="accent-ink"
                />
                <span>
                  {t(
                    'ভেন্ডরকে ইতিমধ্যে পেআউট হয়ে গেছে (Clawback Debt প্রযোজ্য)',
                    'Vendor was already paid out (apply clawback debt)'
                  )}
                </span>
              </label>

              <Button type="submit" variant="primary" size="sm" isLoading={busy} className="w-full">
                {t('রিটার্ন নিষ্পত্তি করুন', 'Process Return')}
              </Button>
            </form>
          )}

          {/* Right: Return Resolution History */}
          <div className={cn('space-y-3', isSuperAdmin ? 'lg:col-span-7' : 'lg:col-span-12')}>
            <h3 className="text-sm font-semibold text-ink">
              {t(
                `রিটার্ন নিষ্পত্তি ইতিহাস (${returnResolutions.length})`,
                `Return Resolution History (${returnResolutions.length})`
              )}
            </h3>

            {returnResolutions.length === 0 ? (
              <EmptyState
                title={t('কোনো রিটার্ন নিষ্পত্তি নেই', 'No return resolutions yet')}
                description={t(
                  'কোনো অর্ডার রিটার্ন প্রসেস করা হলে এখানে অডিট লগ দেখা যাবে।',
                  'Processed returns and vendor liability entries appear here.'
                )}
              />
            ) : (
              <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-bg">
                {returnResolutions.map((rr) => (
                  <div key={rr.returnId} className="p-3.5 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono font-semibold text-ink">
                        {rr.orderNo} · {rr.faultType}
                      </span>
                      <span className="font-mono text-[11px] text-muted">
                        {fmtDateTime(rr.createdAt, locale)}
                      </span>
                    </div>
                    <p className="text-ink">{rr.noteBn}</p>
                    <p className="font-mono text-[11px] text-muted tabular-nums">
                      {t('ভেন্ডর ডেবিট:', 'Vendor Debit:')}{' '}
                      <strong className={rr.vendorDebitPoisha > 0 ? 'text-danger' : 'text-ink'}>
                        {money(rr.vendorDebitPoisha)}
                      </strong>
                      {' · '}
                      {t('রিস্টক:', 'Restocked:')} {rr.restockQuantity} pcs
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------------------
// EXPANDED PAYOUT ROW DETAIL & MAKER-CHECKER ACTIONS
// ---------------------------------------------------------------------------

function PayoutDetailDrawer({
  row,
  locale,
  busy,
  trxDraft,
  feeDraft,
  senderDraft,
  proofDraft,
  noteDraft,
  reasonDraft,
  overrideDraft,
  onChange,
  onAction,
}: {
  row: AdminVendorPayoutRowDTO;
  locale: 'bn' | 'en';
  busy: boolean;
  trxDraft: string;
  feeDraft: string;
  senderDraft: string;
  proofDraft: string;
  noteDraft: string;
  reasonDraft: string;
  overrideDraft: string;
  onChange: (
    field: 'trx' | 'fee' | 'sender' | 'proof' | 'note' | 'reason' | 'override',
    value: string
  ) => void;
  onAction: (decision: 'approve' | 'reject' | 'mark_paid') => void;
}) {
  const bn = locale === 'bn';
  const t = (b: string, e: string) => (bn ? b : e);
  const money = (p: number) => formatPoishaToBdt(p, locale);

  return (
    <div className="mt-3 space-y-3 rounded-[var(--radius-md)] border border-border bg-surface/50 p-3.5 text-xs">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-[11px]">
        <div>
          <p className="text-muted">{t('অনুরোধকৃত', 'Requested')}</p>
          <p className="font-mono font-bold tabular-nums text-ink">
            {money(row.requestedAmountPoisha)}
          </p>
        </div>
        <div>
          <p className="text-muted">{t('চার্জ / ফি', 'Fee')}</p>
          <p className="font-mono font-bold tabular-nums text-danger">
            -{money(row.feePoisha ?? row.estimatedFeePoisha)}
          </p>
        </div>
        <div>
          <p className="text-muted">{t('নিট পরিশোধ', 'Net Paid/Payable')}</p>
          <p className="font-mono font-bold tabular-nums text-success">
            {money(row.netPaidPoisha ?? row.netPayablePoisha)}
          </p>
        </div>
        <div>
          <p className="text-muted">{t('মাধ্যম / অ্যাকাউন্ট', 'Channel / Account')}</p>
          <p className="font-mono font-semibold text-ink">
            {row.payoutMethodBn} · {row.payoutAccountMasked}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-2 text-[11px] text-muted">
        <span>
          {t('অনুরোধকারী:', 'Requested by:')}{' '}
          <strong className="text-ink">{row.requestedByUsername}</strong>
        </span>
        <span>
          {t('অনুমোদন:', 'Approved:')}{' '}
          <strong className="text-ink">{row.approvedByUsername ?? '—'}</strong>
        </span>
        <span>
          {t('পরিশোধ:', 'Paid:')}{' '}
          <strong className="text-ink">{row.paidByUsername ?? '—'}</strong>
        </span>
      </div>

      {row.noteBn && (
        <p className="text-[11px] text-muted">
          <strong>{t('নোট:', 'Note:')}</strong> {row.noteBn}
        </p>
      )}

      {row.rejectionReasonBn && (
        <p className="text-[11px] text-danger">
          <strong>{t('বাতিলের কারণ:', 'Rejection reason:')}</strong> {row.rejectionReasonBn}
        </p>
      )}

      {row.proofUrl && row.status === 'paid' && (
        <a
          href={row.proofUrl}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[11px] font-medium text-ink underline"
        >
          <FileCheck2 className="h-3.5 w-3.5" aria-hidden="true" />
          {t('পেমেন্ট প্রমাণ দেখুন', 'View payment proof')}
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      )}

      {row.timeline.length > 0 && (
        <ol className="space-y-1 border-t border-border pt-2">
          {row.timeline.map((ev, idx) => (
            <li key={`${ev.at}-${idx}`} className="flex items-start gap-1.5 text-[11px]">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden="true" />
              <span className="text-ink">{t(ev.eventBn, ev.eventEn)}</span>
              <span className="text-muted">
                · {ev.actor ?? '—'} · {fmtDateTime(ev.at, locale)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {(row.status === 'requested' || row.status === 'approved') && (
        <div className="space-y-2.5 border-t border-border pt-2.5">
          {row.blocksCurrentUser && (
            <p className="flex items-start gap-1.5 rounded-[var(--radius-sm)] border border-warning/50 bg-warning/10 p-2 text-[11px] text-ink">
              <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                {t(
                  'মেকার-চেকার নীতি: নিজে তৈরি করা অনুরোধ অনুমোদন করতে নিচে জরুরি কারণ (কমপক্ষে ৫ অক্ষর) লিখুন।',
                  'Maker-checker policy: enter an explicit override reason (min 5 chars) to self-settle.'
                )}
              </span>
            </p>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            {row.status === 'requested' && (
              <Button
                variant="primary"
                size="sm"
                isLoading={busy}
                disabled={row.blocksCurrentUser && overrideDraft.trim().length < 5}
                onClick={() => onAction('approve')}
                leftIcon={<BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                {t('অনুমোদন করুন', 'Approve Payout')}
              </Button>
            )}

            {row.status === 'approved' && (
              <div className="space-y-1.5">
                <input
                  className={cn(inputCls, 'font-mono')}
                  placeholder={t('বিকাশ / ব্যাংক TrxID *', 'bKash / Bank TrxID *')}
                  value={trxDraft}
                  onChange={(e) => onChange('trx', e.target.value)}
                />
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    className={cn(inputCls, 'font-mono')}
                    placeholder={t('চার্জ ৳ (ঐচ্ছিক)', 'Fee ৳ (opt.)')}
                    inputMode="decimal"
                    value={feeDraft}
                    onChange={(e) => onChange('fee', e.target.value)}
                  />
                  <input
                    className={cn(inputCls, 'font-mono')}
                    placeholder={t('প্রেরক নম্বর', 'Sender acc')}
                    value={senderDraft}
                    onChange={(e) => onChange('sender', e.target.value)}
                  />
                </div>
                <input
                  className={inputCls}
                  placeholder={t('প্রমাণ URL (ঐচ্ছিক)', 'Proof URL (opt.)')}
                  value={proofDraft}
                  onChange={(e) => onChange('proof', e.target.value)}
                />
                <input
                  className={inputCls}
                  placeholder={t('নোট (ঐচ্ছিক)', 'Note (opt.)')}
                  value={noteDraft}
                  onChange={(e) => onChange('note', e.target.value)}
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  isLoading={busy}
                  disabled={!trxDraft.trim() || (row.blocksCurrentUser && overrideDraft.trim().length < 5)}
                  onClick={() => onAction('mark_paid')}
                  leftIcon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t('পরিশোধিত চিহ্নিত করুন', 'Mark as Paid')}
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <input
                className={inputCls}
                placeholder={t('বাতিলের কারণ (আবশ্যক)', 'Rejection reason (required)')}
                value={reasonDraft}
                onChange={(e) => onChange('reason', e.target.value)}
              />
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                isLoading={busy}
                disabled={reasonDraft.trim().length < 3}
                onClick={() => onAction('reject')}
                leftIcon={<XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                {t('বাতিল ও টাকা ফেরত', 'Reject & Release')}
              </Button>
            </div>
          </div>

          {row.blocksCurrentUser && (
            <input
              className={inputCls}
              placeholder={t(
                'জরুরি ওভাররাইডের কারণ (কমপক্ষে ৫ অক্ষর)',
                'Emergency override reason (min 5 chars)'
              )}
              value={overrideDraft}
              onChange={(e) => onChange('override', e.target.value)}
            />
          )}
        </div>
      )}

      {row.status === 'paid' && (
        <p className="flex items-center gap-1 text-[11px] text-success">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" />
          {t('পরিশোধ সম্পন্ন:', 'Settled:')} {fmtDateTime(row.resolvedAt, locale)}
        </p>
      )}
    </div>
  );
}

export default VendorPayoutsLedgerPanel;
