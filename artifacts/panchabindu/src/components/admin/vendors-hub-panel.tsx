'use client';

// src/components/admin/vendors-hub-panel.tsx
// Unified Admin → Vendors Hub
// Consolidates Vendor Directory, 360° Partner Profile (Terms, Portal Permissions,
// Products & Stock Intake History, Linked Orders & Payouts, KYC & 15Q Onboarding),
// Approvals & Stock Queue (Consignment Lots QC, Price Proposals, Profile Requests, KYC),
// and SLA Performance & Multi-Supplier Offers into one minimalist, deeply connected workspace.

import * as React from 'react';
import {
  ArrowUpRight,
  Award,
  Banknote,
  Building2,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Coins,
  ExternalLink,
  GitFork,
  KeyRound,
  Layers,
  MessageSquare,
  Package,
  PackagePlus,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Search,
  ShieldAlert,
  Tag,
  User,
  Wallet,
  XCircle,
} from 'lucide-react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { localizedField } from '@/lib/i18n/ui-text';
import { Badge, Button, EmptyState, Skeleton } from '@/components/ui/primitives';
import { ResponsiveSheet } from '@/components/ui/responsive-sheet';
import { KycPanel } from '@/components/vendor/kyc-panel';
import { VendorLedgerSupplyPanel } from './vendor-ledger-supply-panel';
import { summarizeSupply, type SupplySummary } from './vendor-ledger-summary';
import { cn } from '@/lib/utils';
import type { OrderGridRowDTO, VendorEscrowBalance } from '@/types/domain';
import type {
  ImmutableVendorLedgerRecord,
  ManualCourierParcelRecord,
  VendorPayoutRequestRecord,
  VendorProfileRecord,
} from '@/lib/admin/phase4b-service';
import type { Product360VariantDTO } from '@/lib/admin/phase4c-service';
import type { VendorScorecardRowDTO } from '@/lib/admin/phase6-service';
import type {
  ConsignmentDispatchLotRecord,
  Phase7WorkspaceOverviewDTO,
  SupplierProductOfferRecord,
  VendorFulfillmentGroupRecord,
  VendorPriceProposalRecord,
} from '@/lib/admin/phase7-service';
import type {
  AdminVendorControlSnapshot,
  AdminVendorRequestDTO,
  AdminVendorRowDTO,
  VendorCapabilityFlags,
} from '@/lib/vendor/vendor-types';

export type VendorsHubSubTab = 'directory' | 'approvals' | 'ledger_supply' | 'performance';

export interface VendorsHubPanelProps {
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  initialSubTab?: VendorsHubSubTab;
  focusedVendorId?: string | null;
  initialStatusFilter?: 'all' | 'active' | 'pending_onboarding' | 'suspended';
  vendorsEscrow: Array<{
    profile: VendorProfileRecord;
    balance: VendorEscrowBalance;
  }>;
  ledgerEntries: ImmutableVendorLedgerRecord[];
  payoutRequests: VendorPayoutRequestRecord[];
  manualCourierParcels: ManualCourierParcelRecord[];
  product360: Product360VariantDTO[];
  orders: Array<Partial<OrderGridRowDTO>>;
  phase7Overview: Phase7WorkspaceOverviewDTO | null;
  vendorScorecards: VendorScorecardRowDTO[];
  openSupportCount: number;
  pendingKycCount: number;
  onRefreshWorkspace: () => Promise<void>;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  onOpenPayoutsForVendor: (
    vendorId: string,
    mode?: 'register' | 'direct_pay' | 'ledger'
  ) => void;
  onOpenOrderDetails: (orderNo: string) => void;
  onOpenProductStudio: () => void;
  onOpenVendorInbox: () => void;
  onOpenUsersRbac: () => void;
  onClearFocusedVendor?: () => void;
}

type ProfileTab =
  | 'overview'
  | 'permissions'
  | 'ledger_supply'
  | 'products_stock'
  | 'orders_payouts'
  | 'kyc_onboarding';

const ONBOARDING_15Q: Array<{
  key: string;
  questionBn: string;
  placeholderBn: string;
}> = [
  { key: 'q1_business_name', questionBn: '১. প্রতিষ্ঠানের নাম ও ট্রেড লাইসেন্স/এনআইডি নম্বর কী?', placeholderBn: 'হ্যাঁ, যাচাইকৃত' },
  { key: 'q2_product_category', questionBn: '২. মূল পণ্যের ক্যাটাগরি ও নিজস্ব উৎপাদন কি না?', placeholderBn: 'হ্যাঁ, নিজস্ব উৎপাদন' },
  { key: 'q3_consignment_agreement', questionBn: '৩. ১৮-দফা কনসাইনমেন্ট নীতিমালায় সম্মত কি?', placeholderBn: 'হ্যাঁ, সম্মত' },
  { key: 'q4_ownership_clause', questionBn: '৪. পণ্য বিক্রি না হওয়া পর্যন্ত মালিকানা সাপ্লায়ারের থাকবে—সম্মত কি?', placeholderBn: 'হ্যাঁ, সম্মত' },
  { key: 'q5_three_tier_pricing', questionBn: '৫. ৩-স্তরের মূল্য নির্ধারণ (কস্ট + লাভ = প্রদেয়)-এ সম্মত কি?', placeholderBn: 'হ্যাঁ, সম্মত' },
  { key: 'q6_escrow_hold_days', questionBn: '৬. ডেলিভারির পর নির্ধারিত এসক্রো হোল্ড পিরিয়ডে সম্মত কি?', placeholderBn: 'হ্যাঁ, ৭ দিন হোল্ডে সম্মত' },
  { key: 'q7_defect_liability', questionBn: '৭. উৎপাদনগত ত্রুটিতে সাপ্লায়ার লেজার সমন্বয়ে সম্মত কি?', placeholderBn: 'হ্যাঁ, প্রমাণ সাপেক্ষে সম্মত' },
  { key: 'q8_qc_inspection', questionBn: '৮. গুদামে ১০০% কিউসি ও ভিডিও রেকর্ডিং প্রক্রিয়ায় সম্মত কি?', placeholderBn: 'হ্যাঁ, সম্মত' },
  { key: 'q9_lead_time_days', questionBn: '৯. স্টক শেষের সতর্কতার পর কত দিনে নতুন স্টক পাঠাবেন?', placeholderBn: '৩ কার্যদিবস' },
  { key: 'q10_packaging_standard', questionBn: '১০. প্রতিটি পণ্যে ইন্টারনাল SKU ট্যাগ সংযুক্ত করে পাঠাবেন কি?', placeholderBn: 'হ্যাঁ, SKU স্টিকার থাকবে' },
  { key: 'q11_no_direct_customer_contact', questionBn: '১১. গ্রাহকের সাথে সরাসরি যোগাযোগ না করার শর্তে সম্মত কি?', placeholderBn: 'হ্যাঁ, হোয়াইট-লেবেল শর্তে সম্মত' },
  { key: 'q12_payout_schedule', questionBn: '১২. হোল্ড শেষে মিনিমাম ব্যালেন্সে পেআউট প্রক্রিয়ায় সম্মত কি?', placeholderBn: 'হ্যাঁ, সম্মত' },
  { key: 'q13_post_payout_clawback', questionBn: '১৩. পেআউটের পর ত্রুটি প্রমাণিত হলে পরবর্তী বিল সমন্বয়ে সম্মত কি?', placeholderBn: 'হ্যাঁ, সম্মত' },
  { key: 'q14_unsold_stock_withdrawal', questionBn: '১৪. অবিক্রিত পণ্য ফেরত নিতে ৭ দিন আগে নোটিশ দেবেন কি?', placeholderBn: 'হ্যাঁ, ৭ দিন আগে নোটিশ দেবো' },
  { key: 'q15_contract_closure_audit', questionBn: '১৫. চুক্তি সমাপ্তির আগে চূড়ান্ত অডিটে সম্মত কি?', placeholderBn: 'হ্যাঁ, চূড়ান্ত অডিটে সম্মত' },
];

const STATUS_META: Record<
  string,
  { bn: string; en: string; tone: 'success' | 'warning' | 'danger' | 'neutral' }
> = {
  active: { bn: 'সক্রিয়', en: 'Active', tone: 'success' },
  pending_onboarding: { bn: 'অনবোর্ডিং অপেক্ষমাণ', en: 'Pending Onboarding', tone: 'warning' },
  suspended: { bn: 'স্থগিত', en: 'Suspended', tone: 'danger' },
  closing_audit: { bn: 'ক্লোজিং অডিট', en: 'Closing Audit', tone: 'warning' },
  closed: { bn: 'বন্ধ', en: 'Closed', tone: 'neutral' },
};

const FIELD_LABELS: Record<string, { bn: string; en: string }> = {
  businessNameBn: { bn: 'ব্যবসার নাম (বাংলা)', en: 'Business Name (Bn)' },
  businessNameEn: { bn: 'ব্যবসার নাম (ইংরেজি)', en: 'Business Name (En)' },
  ownerNameBn: { bn: 'মালিকের নাম', en: 'Owner Name' },
  contactPhone: { bn: 'যোগাযোগ নম্বর', en: 'Contact Phone' },
  payoutMethodBn: { bn: 'পেআউট মাধ্যম', en: 'Payout Method' },
  payoutAccountNo: { bn: 'পেআউট অ্যাকাউন্ট', en: 'Payout Account' },
  answers15: { bn: 'অনবোর্ডিং উত্তর', en: 'Onboarding Answers' },
};

const inputCls =
  'w-full min-h-[42px] px-3 py-2 text-xs bg-bg text-ink border border-border rounded-[var(--radius-md)] focus:outline-2 focus:outline-offset-0 focus:outline-ink';

function fmtDate(iso: string | null | undefined, locale: 'bn' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function fmtDateTime(iso: string | null | undefined, locale: 'bn' | 'en'): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function VendorsHubPanel({
  locale,
  isSuperAdmin,
  initialSubTab,
  focusedVendorId,
  initialStatusFilter,
  vendorsEscrow,
  ledgerEntries,
  payoutRequests,
  manualCourierParcels,
  product360,
  orders,
  phase7Overview,
  vendorScorecards,
  openSupportCount,
  pendingKycCount,
  onRefreshWorkspace,
  onNotify,
  onOpenPayoutsForVendor,
  onOpenOrderDetails,
  onOpenProductStudio,
  onOpenVendorInbox,
  onOpenUsersRbac,
  onClearFocusedVendor,
}: VendorsHubPanelProps) {
  const bn = locale === 'bn';
  const t = React.useCallback((b: string, e: string) => (bn ? b : e), [bn]);
  const money = React.useCallback((p: number) => formatPoishaToBdt(p, locale), [locale]);

  const [subTab, setSubTab] = React.useState<VendorsHubSubTab>(initialSubTab ?? 'directory');
  const [statusFilter, setStatusFilter] = React.useState<
    'all' | 'active' | 'pending_onboarding' | 'suspended'
  >(initialStatusFilter ?? 'all');
  const [search, setSearch] = React.useState('');

  // Control API snapshot (/api/admin/vendors)
  const [controlSnapshot, setControlSnapshot] = React.useState<AdminVendorControlSnapshot | null>(
    null
  );
  const [controlLoading, setControlLoading] = React.useState(true);
  const [controlError, setControlError] = React.useState('');
  const [busyAction, setBusyAction] = React.useState<string | null>(null);

  // Selected vendor for 360° Profile Drawer
  const [drawerVendorId, setDrawerVendorId] = React.useState<string | null>(
    focusedVendorId ?? null
  );
  const [profileTab, setProfileTab] = React.useState<ProfileTab>('overview');

  // New Vendor Onboarding Sheet
  const [showNewVendorSheet, setShowNewVendorSheet] = React.useState(false);

  // Approvals sub-filter & Stock Intake drawer/collapse
  const [approvalFilter, setApprovalFilter] = React.useState<
    'all' | 'lots' | 'proposals' | 'profile_kyc'
  >('all');
  const [showIntakeForm, setShowIntakeForm] = React.useState(false);
  const [qcRejectByLot, setQcRejectByLot] = React.useState<Record<string, string>>({});

  // Sync external deep-link props
  React.useEffect(() => {
    if (initialSubTab) setSubTab(initialSubTab);
  }, [initialSubTab]);

  React.useEffect(() => {
    if (initialStatusFilter) setStatusFilter(initialStatusFilter);
  }, [initialStatusFilter]);

  React.useEffect(() => {
    if (focusedVendorId) {
      setDrawerVendorId(focusedVendorId);
      setProfileTab('overview');
    }
  }, [focusedVendorId]);

  const loadControlSnapshot = React.useCallback(async () => {
    if (!isSuperAdmin) {
      setControlLoading(false);
      return;
    }
    try {
      const res = await fetch('/api/admin/vendors', { cache: 'no-store' });
      const data = (await res.json()) as AdminVendorControlSnapshot;
      if (!res.ok || !data.success) {
        setControlError(
          data.errorBn || t('ভেন্ডর কন্ট্রোল ডেটা লোড হয়নি।', 'Could not load vendor controls.')
        );
        return;
      }
      setControlSnapshot(data);
      setControlError('');
    } catch {
      setControlError(t('নেটওয়ার্ক ত্রুটি হয়েছে।', 'Network error while loading vendors.'));
    } finally {
      setControlLoading(false);
    }
  }, [isSuperAdmin, t]);

  React.useEffect(() => {
    void loadControlSnapshot();
  }, [loadControlSnapshot]);

  const refreshAll = React.useCallback(async () => {
    setBusyAction('refresh');
    try {
      await Promise.all([onRefreshWorkspace(), loadControlSnapshot()]);
    } finally {
      setBusyAction(null);
    }
  }, [loadControlSnapshot, onRefreshWorkspace]);

  const postVendorControl = React.useCallback(
    async (
      actionKey: string,
      body: Record<string, unknown>,
      successMsg: { bn: string; en: string }
    ): Promise<boolean> => {
      setBusyAction(actionKey);
      try {
        const res = await fetch('/api/admin/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as {
          success?: boolean;
          errorBn?: string;
          errorEn?: string;
        };
        if (!res.ok || !data.success) {
          onNotify(
            (bn ? data.errorBn : data.errorEn || data.errorBn) ||
              t('কাজটি সম্পন্ন করা যায়নি।', 'Action failed.'),
            'error'
          );
          return false;
        }
        onNotify(bn ? successMsg.bn : successMsg.en, 'success');
        await Promise.all([loadControlSnapshot(), onRefreshWorkspace()]);
        return true;
      } catch {
        onNotify(t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.'), 'error');
        return false;
      } finally {
        setBusyAction(null);
      }
    },
    [bn, loadControlSnapshot, onNotify, onRefreshWorkspace, t]
  );

  const postWorkspace = React.useCallback(
    async (
      actionKey: string,
      body: Record<string, unknown>,
      successMsg: string
    ): Promise<Record<string, unknown> | null> => {
      setBusyAction(actionKey);
      try {
        const res = await fetch('/api/admin/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await res.json()) as Record<string, unknown> & {
          success?: boolean;
          errorBn?: string;
        };
        if (!res.ok || data.success === false) {
          onNotify(
            String(data.errorBn ?? t('কাজটি সম্পন্ন করা যায়নি।', 'Action failed.')),
            'error'
          );
          return null;
        }
        onNotify(successMsg, 'success');
        await Promise.all([onRefreshWorkspace(), loadControlSnapshot()]);
        return data;
      } catch {
        onNotify(t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.'), 'error');
        return null;
      } finally {
        setBusyAction(null);
      }
    },
    [loadControlSnapshot, onNotify, onRefreshWorkspace, t]
  );

  // Merge escrow & control rows into one clean directory model
  const lots: ConsignmentDispatchLotRecord[] = phase7Overview?.consignmentLots ?? [];
  const proposals: VendorPriceProposalRecord[] = phase7Overview?.priceProposals ?? [];
  const supplierOffers: SupplierProductOfferRecord[] =
    phase7Overview?.supplierProductOffers ?? [];
  const fulfillmentGroups: VendorFulfillmentGroupRecord[] =
    phase7Overview?.fulfillmentGroups ?? [];
  const vendorRequests: AdminVendorRequestDTO[] = controlSnapshot?.requests ?? [];

  const pendingLots = lots.filter((l) => l.status === 'pending_qc');
  const pendingProposals = proposals.filter((p) => p.status === 'pending_review');
  const pendingProfileRequests = vendorRequests.filter((r) => r.status === 'pending_review');
  const totalApprovalsPending =
    pendingLots.length +
    pendingProposals.length +
    pendingProfileRequests.length +
    pendingKycCount;

  const unifiedVendors = React.useMemo(() => {
    const controlById = new Map(
      (controlSnapshot?.vendors ?? []).map((row) => [row.vendorId, row])
    );
    const scorecardById = new Map(vendorScorecards.map((s) => [s.vendorId, s]));

    return vendorsEscrow.map(({ profile, balance }) => {
      const ctrl = controlById.get(profile.vendorId) ?? null;
      const score = scorecardById.get(profile.vendorId) ?? null;
      const vendorProducts = product360.filter((p) => p.vendorId === profile.vendorId);
      const vendorPayouts = payoutRequests.filter((p) => p.vendorId === profile.vendorId);
      const paidPoisha = vendorPayouts
        .filter((p) => p.status === 'paid')
        .reduce((sum, p) => sum + p.requestedAmountPoisha, 0);
      const pendingPayoutCount = vendorPayouts.filter(
        (p) => p.status === 'requested' || p.status === 'approved'
      ).length;
      const totalOwedPoisha = Math.max(
        0,
        balance.pendingPoisha + balance.lockedPoisha + balance.withdrawablePoisha
      );
      const totalEarnedPoisha = paidPoisha + totalOwedPoisha;
      const totalUnits = vendorProducts.reduce((sum, p) => sum + p.stockAvailable, 0);

      return {
        profile,
        balance,
        control: ctrl,
        scorecard: score,
        productsCount: vendorProducts.length,
        totalUnits,
        paidPoisha,
        totalOwedPoisha,
        totalEarnedPoisha,
        pendingPayoutCount,
        pendingRequests: ctrl?.pendingRequests ?? 0,
      };
    });
  }, [controlSnapshot, payoutRequests, product360, vendorScorecards, vendorsEscrow]);

  // Stock still missing per vendor, so the directory itself shows who owes goods (not only taka).
  const supplyByVendor = React.useMemo(() => {
    const grouped = new Map<string, typeof lots>();
    for (const lot of lots) {
      const list = grouped.get(lot.vendorId) ?? [];
      list.push(lot);
      grouped.set(lot.vendorId, list);
    }
    const summary = new Map<string, SupplySummary>();
    for (const [vendorId, vendorLots] of grouped) summary.set(vendorId, summarizeSupply(vendorLots));
    return summary;
  }, [lots]);

  const filteredVendors = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return unifiedVendors.filter((row) => {
      if (statusFilter === 'active' && row.profile.status !== 'active') return false;
      if (statusFilter === 'pending_onboarding' && row.profile.status !== 'pending_onboarding') {
        return false;
      }
      if (
        statusFilter === 'suspended' &&
        row.profile.status !== 'suspended' &&
        row.profile.status !== 'closing_audit' &&
        row.profile.status !== 'closed'
      ) {
        return false;
      }
      if (!q) return true;
      return [
        row.profile.vendorCode,
        row.profile.businessNameBn,
        row.profile.businessNameEn,
        row.profile.ownerNameBn,
        row.profile.contactPhone,
      ]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [search, statusFilter, unifiedVendors]);

  const totalOwedAllPoisha = unifiedVendors.reduce((sum, v) => sum + v.totalOwedPoisha, 0);
  const activeCount = unifiedVendors.filter((v) => v.profile.status === 'active').length;

  const selectedVendor = React.useMemo(
    () => unifiedVendors.find((v) => v.profile.vendorId === drawerVendorId) ?? null,
    [drawerVendorId, unifiedVendors]
  );

  return (
    <section className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div className="min-w-0">
          <h2 className="text-lg font-bold tracking-tight text-ink">
            {t('ভেন্ডর ও পার্টনার', 'Vendors & Partners')}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {t(
              'ভেন্ডর প্রোফাইল, পোর্টাল অনুমতি, পণ্যের চালান ইতিহাস, মূল্য প্রস্তাব এবং KYC অনুমোদন এক জায়গায়।',
              'Manage vendor profiles, portal permissions, consignment stock intake, price proposals, and KYC in one place.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refreshAll()}
            leftIcon={
              <RefreshCw
                className={cn('h-3.5 w-3.5', busyAction === 'refresh' && 'animate-spin')}
                aria-hidden="true"
              />
            }
          >
            {t('রিফ্রেশ', 'Refresh')}
          </Button>
          {isSuperAdmin && (
            <Button
              variant="primary"
              size="sm"
              onClick={() => setShowNewVendorSheet(true)}
              leftIcon={<Plus className="h-3.5 w-3.5" aria-hidden="true" />}
            >
              {t('নতুন ভেন্ডর', 'New Vendor')}
            </Button>
          )}
        </div>
      </div>

      {/* 4-Metric KPI Strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5">
          <p className="text-xs text-muted">{t('সক্রিয় ভেন্ডর', 'Active Vendors')}</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-ink">
            {formatLocaleNumber(activeCount, locale)}
            <span className="ml-1 text-xs font-normal text-muted">
              / {formatLocaleNumber(unifiedVendors.length, locale)}
            </span>
          </p>
        </div>

        <button
          type="button"
          onClick={() => setSubTab('approvals')}
          className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5 text-left transition-colors hover:border-ink cursor-pointer"
        >
          <p className="text-xs text-muted">{t('অপেক্ষমাণ অনুমোদন', 'Pending Approvals')}</p>
          <p
            className={cn(
              'mt-1 font-mono text-xl font-bold tabular-nums',
              totalApprovalsPending > 0 ? 'text-warning' : 'text-ink'
            )}
          >
            {formatLocaleNumber(totalApprovalsPending, locale)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted truncate">
            {t(
              `${pendingLots.length} চালান · ${pendingProposals.length} দাম · ${pendingProfileRequests.length + pendingKycCount} KYC/প্রোফাইল`,
              `${pendingLots.length} lots · ${pendingProposals.length} prices · ${pendingProfileRequests.length + pendingKycCount} KYC/profile`
            )}
          </p>
        </button>

        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5">
          <p className="text-xs text-muted">{t('মোট ভেন্ডর পাওনা', 'Total Vendor Owed')}</p>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-ink">
            {money(totalOwedAllPoisha)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {t('পেন্ডিং + লকড + উত্তোলনযোগ্য', 'Pending + locked + withdrawable')}
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenVendorInbox}
          className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5 text-left transition-colors hover:border-ink cursor-pointer"
        >
          <div className="flex items-center justify-between gap-1">
            <p className="text-xs text-muted">{t('খোলা সাপোর্ট টিকিট', 'Open Support Tickets')}</p>
            <ArrowUpRight className="h-3.5 w-3.5 text-muted shrink-0" aria-hidden="true" />
          </div>
          <p
            className={cn(
              'mt-1 font-mono text-xl font-bold tabular-nums',
              openSupportCount > 0 ? 'text-warning' : 'text-ink'
            )}
          >
            {formatLocaleNumber(openSupportCount, locale)}
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {t('মেসেজিং → ভেন্ডর ইনবক্স', 'Messaging → Vendor Inbox')}
          </p>
        </button>
      </div>

      {/* Segmented Sub-Tab Navigation */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border pb-3">
        {(
          [
            {
              key: 'directory' as const,
              label: t('ডিরেক্টরি ও ৩৬০° প্রোফাইল', 'Directory & 360° Profiles'),
              icon: <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />,
              count: unifiedVendors.length,
            },
            {
              key: 'approvals' as const,
              label: t('অনুমোদন ও স্টক কিউ', 'Approvals & Stock Queue'),
              icon: <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden="true" />,
              count: totalApprovalsPending,
              highlight: totalApprovalsPending > 0,
            },
            {
              key: 'ledger_supply' as const,
              label: t('হিসাব ও সরবরাহ', 'Money & Supply'),
              icon: <Coins className="h-4 w-4 shrink-0" aria-hidden="true" />,
              count: pendingLots.length,
              highlight: pendingLots.length > 0,
            },
            {
              key: 'performance' as const,
              label: t('SLA স্কোরকার্ড ও সাপ্লাই', 'SLA & Multi-Supplier'),
              icon: <Award className="h-4 w-4 shrink-0" aria-hidden="true" />,
            },
          ] as Array<{
            key: VendorsHubSubTab;
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

      {controlError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-md)] border border-danger/50 bg-danger/5 px-3.5 py-2.5 text-xs text-danger"
        >
          <span>{controlError}</span>
          <Button variant="outline" size="sm" onClick={() => void loadControlSnapshot()}>
            {t('আবার চেষ্টা করুন', 'Retry')}
          </Button>
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 1: DIRECTORY & 360° PROFILES
         ==================================================================== */}
      {subTab === 'directory' && (
        <div className="space-y-4">
          {/* Search + Status Filter Bar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative flex-1 min-w-[220px]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(
                  'ভেন্ডরের নাম, কোড, মালিক বা ফোন দিয়ে খুঁজুন...',
                  'Search by business name, code, owner, or phone...'
                )}
                className={cn(inputCls, 'pl-9')}
              />
            </div>

            <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-1">
              {(
                [
                  ['all', t('সব', 'All')],
                  ['active', t('সক্রিয়', 'Active')],
                  ['pending_onboarding', t('অপেক্ষমাণ', 'Pending')],
                  ['suspended', t('স্থগিত / অডিট', 'Suspended / Audit')],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setStatusFilter(key)}
                  className={cn(
                    'min-h-[34px] rounded-[var(--radius-sm)] px-2.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer',
                    statusFilter === key
                      ? 'bg-bg text-ink font-semibold shadow-xs'
                      : 'text-muted hover:text-ink'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Clean Vendor Directory Table */}
          {controlLoading && unifiedVendors.length === 0 ? (
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          ) : filteredVendors.length === 0 ? (
            <EmptyState
              icon={<Building2 className="h-6 w-6" aria-hidden="true" />}
              title={t('কোনো ভেন্ডর পাওয়া যায়নি', 'No matching vendors')}
              description={t(
                'সার্চ বা স্ট্যাটাস ফিল্টার পরিবর্তন করুন অথবা নতুন ভেন্ডর যুক্ত করুন।',
                'Adjust your search or status filter, or onboard a new vendor.'
              )}
              actionLabel={
                isSuperAdmin ? t('নতুন ভেন্ডর যুক্ত করুন', 'Add New Vendor') : undefined
              }
              onAction={isSuperAdmin ? () => setShowNewVendorSheet(true) : undefined}
            />
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-bg">
              <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/70 text-[11px] font-semibold text-muted">
                    <th className="py-2.5 px-3.5">{t('ভেন্ডর', 'Vendor')}</th>
                    <th className="py-2.5 px-3">{t('স্ট্যাটাস', 'Status')}</th>
                    <th className="py-2.5 px-3 text-right">{t('পণ্য (স্টক)', 'Products (Stock)')}</th>
                    <th className="py-2.5 px-3 text-right">{t('মোট অর্জিত', 'Total Earned')}</th>
                    <th className="py-2.5 px-3 text-right">{t('পরিশোধিত', 'Paid')}</th>
                    <th className="py-2.5 px-3 text-right">{t('মাল বাকি', 'Stock pending')}</th>
                    <th className="py-2.5 px-3 text-right">{t('পাওনা / উত্তোলনযোগ্য', 'Owed / Withdrawable')}</th>
                    <th className="py-2.5 px-3 text-right">SLA</th>
                    <th className="py-2.5 px-3.5 text-right">{t('অ্যাকশন', 'Action')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredVendors.map((row) => {
                    const meta = STATUS_META[row.profile.status] ?? {
                      bn: row.profile.status,
                      en: row.profile.status,
                      tone: 'neutral' as const,
                    };
                    return (
                      <tr
                        key={row.profile.vendorId}
                        onClick={() => {
                          setDrawerVendorId(row.profile.vendorId);
                          setProfileTab('overview');
                        }}
                        className="group cursor-pointer transition-colors hover:bg-surface/60"
                      >
                        <td className="py-3 px-3.5">
                          <p className="font-semibold text-ink">
                            {localizedField(row.profile, 'businessNameBn', locale)}
                          </p>
                          <p className="mt-0.5 text-[11px] text-muted">
                            <span className="font-mono">{row.profile.vendorCode}</span>
                            <span aria-hidden="true"> · </span>
                            <span>{row.profile.ownerNameBn}</span>
                            <span aria-hidden="true"> · </span>
                            <span className="font-mono">{row.profile.contactPhone}</span>
                          </p>
                        </td>

                        <td className="py-3 px-3 whitespace-nowrap">
                          <Badge status={meta.tone}>{t(meta.bn, meta.en)}</Badge>
                          {(row.pendingRequests > 0 || row.pendingPayoutCount > 0) && (
                            <p className="mt-1 text-[11px] text-warning font-medium">
                              {row.pendingPayoutCount > 0 &&
                                t(`${row.pendingPayoutCount} পেআউট`, `${row.pendingPayoutCount} payout`)}
                              {row.pendingPayoutCount > 0 && row.pendingRequests > 0 && ' · '}
                              {row.pendingRequests > 0 &&
                                t(`${row.pendingRequests} অনুরোধ`, `${row.pendingRequests} req`)}
                            </p>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums text-ink whitespace-nowrap">
                          {formatLocaleNumber(row.productsCount, locale)}
                          <span className="text-muted"> ({row.totalUnits})</span>
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums text-ink whitespace-nowrap">
                          {money(row.totalEarnedPoisha)}
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums text-success whitespace-nowrap">
                          {money(row.paidPoisha)}
                        </td>

                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {(() => {
                            const supply = supplyByVendor.get(row.profile.vendorId);
                            if (!supply || supply.lotCount === 0) {
                              return <span className="text-muted">—</span>;
                            }
                            if (supply.unresolvedQty === 0) {
                              return (
                                <span className="inline-flex items-center gap-1 text-[11px] text-success">
                                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                                  {t('সব পেয়েছি', 'all received')}
                                </span>
                              );
                            }
                            return (
                              <span className="inline-flex flex-col items-end">
                                <span className="font-mono font-semibold tabular-nums text-danger">
                                  {formatLocaleNumber(supply.unresolvedQty, locale)} {t('পিস', 'pcs')}
                                </span>
                                <span className="text-[10px] text-muted">
                                  {money(supply.pendingValuePoisha)}
                                  {supply.oldestPendingDays > 0
                                    ? ` · ${formatLocaleNumber(supply.oldestPendingDays, locale)} ${t('দিন', 'd')}`
                                    : ''}
                                </span>
                              </span>
                            );
                          })()}
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="font-semibold text-ink">{money(row.totalOwedPoisha)}</span>
                          <span className="block text-[11px] text-muted">
                            {t('উত্তোলন:', 'Avail:')} {money(row.balance.withdrawablePoisha)}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                          {row.scorecard ? (
                            <span
                              className={cn(
                                'font-semibold',
                                row.scorecard.slaGrade === 'A+' || row.scorecard.slaGrade === 'A'
                                  ? 'text-success'
                                  : row.scorecard.slaGrade === 'B'
                                    ? 'text-warning'
                                    : 'text-danger'
                              )}
                            >
                              {row.scorecard.slaGrade}
                            </span>
                          ) : (
                            <span className="text-muted">—</span>
                          )}
                        </td>

                        <td className="py-3 px-3.5 text-right whitespace-nowrap">
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-ink group-hover:underline">
                            {t('প্রোফাইল', 'Profile')}
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 2: APPROVALS & STOCK QUEUE
         ==================================================================== */}
      {subTab === 'approvals' && (
        <div className="space-y-5">
          {/* Top toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius-md)] border border-border bg-surface p-1">
              {(
                [
                  ['all', t(`সব (${totalApprovalsPending})`, `All (${totalApprovalsPending})`)],
                  ['lots', t(`স্টক চালান (${pendingLots.length})`, `Stock Lots (${pendingLots.length})`)],
                  [
                    'proposals',
                    t(`দাম প্রস্তাব (${pendingProposals.length})`, `Price Proposals (${pendingProposals.length})`),
                  ],
                  [
                    'profile_kyc',
                    t(
                      `প্রোফাইল ও KYC (${pendingProfileRequests.length + pendingKycCount})`,
                      `Profile & KYC (${pendingProfileRequests.length + pendingKycCount})`
                    ),
                  ],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setApprovalFilter(key)}
                  className={cn(
                    'min-h-[34px] rounded-[var(--radius-sm)] px-2.5 text-xs font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer',
                    approvalFilter === key
                      ? 'bg-bg text-ink font-semibold shadow-xs'
                      : 'text-muted hover:text-ink'
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {openSupportCount > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenVendorInbox}
                  leftIcon={<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t(`ভেন্ডর ইনবক্স (${openSupportCount})`, `Vendor Inbox (${openSupportCount})`)}
                </Button>
              )}
              <Button
                variant={showIntakeForm ? 'secondary' : 'primary'}
                size="sm"
                onClick={() => setShowIntakeForm((v) => !v)}
                leftIcon={<PackagePlus className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                {showIntakeForm
                  ? t('ফর্ম বন্ধ করুন', 'Close Intake Form')
                  : t('নতুন স্টক রিসিভ এন্ট্রি', 'Record Stock Received')}
              </Button>
            </div>
          </div>

          {/* Collapsible Admin Stock Receiving Intake Form */}
          {showIntakeForm && (
            <AdminStockIntakeForm
              locale={locale}
              productVariants={product360}
              busy={busyAction === 'stock-intake'}
              onSubmit={async (payload) => {
                const res = await postWorkspace(
                  'stock-intake',
                  { operation: 'record_admin_consignment_intake', ...payload },
                  t('কনসাইনমেন্ট স্টক সফলভাবে গ্রহণ ও স্টকে যোগ হয়েছে।', 'Stock received and added to inventory.')
                );
                if (res) setShowIntakeForm(false);
              }}
            />
          )}

          {/* 1. Consignment Stock Lots & QC Queue */}
          {(approvalFilter === 'all' || approvalFilter === 'lots') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">
                  {t('কনসাইনমেন্ট স্টক চালান ও QC কিউ', 'Consignment Stock Lots & QC Queue')}
                </h3>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {pendingLots.length} {t('অপেক্ষমাণ', 'pending')} · {lots.length} {t('মোট', 'total')}
                </span>
              </div>

              {lots.length === 0 ? (
                <EmptyState
                  title={t('কোনো কনসাইনমেন্ট চালান নেই', 'No consignment lots yet')}
                  description={t(
                    'ভেন্ডর চালান পাঠালে বা অ্যাডমিন স্টক রিসিভ এন্ট্রি দিলে এখানে দেখা যাবে।',
                    'Incoming vendor stock dispatches and admin receipts appear here.'
                  )}
                />
              ) : (
                <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-bg">
                  {lots.map((lot) => {
                    const isPending = lot.status === 'pending_qc';
                    return (
                      <div key={lot.lotId} className="p-3.5 space-y-2.5">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-xs font-semibold text-ink">
                              {localizedField(lot, 'productNameBn', locale)}{' '}
                              <span className="font-normal text-muted">
                                ({localizedField(lot, 'variantTitleBn', locale)})
                              </span>
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted">
                              <span className="font-mono">{lot.lotCode}</span>
                              {' · '}
                              <button
                                type="button"
                                onClick={() => {
                                  setDrawerVendorId(lot.vendorId);
                                  setProfileTab('products_stock');
                                }}
                                className="font-medium text-ink underline-offset-2 hover:underline cursor-pointer"
                              >
                                {localizedField(lot, 'vendorNameBn', locale)}
                              </button>
                              {' · '}
                              <span className="font-mono">{lot.publicSku}</span>
                              {' · '}
                              {t('চালান:', 'Challan:')} <span className="font-mono">{lot.challanRef}</span>
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Badge
                              status={
                                lot.status === 'approved_stocked'
                                  ? 'success'
                                  : lot.status === 'rejected'
                                    ? 'danger'
                                    : 'warning'
                              }
                            >
                              {lot.status === 'approved_stocked'
                                ? t('গৃহীত', 'Approved')
                                : lot.status === 'rejected'
                                  ? t('বাতিল', 'Rejected')
                                  : t('QC অপেক্ষমাণ', 'Pending QC')}
                            </Badge>
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted font-mono tabular-nums">
                          <span>
                            {t('পাঠানো:', 'Sent:')} <strong className="text-ink">{lot.dispatchedQty}</strong>
                          </span>
                          {lot.qcAcceptedQty !== null && (
                            <span>
                              {t('গৃহীত:', 'Accepted:')}{' '}
                              <strong className="text-success">{lot.qcAcceptedQty}</strong>
                            </span>
                          )}
                          {lot.qcRejectedQty !== null && lot.qcRejectedQty > 0 && (
                            <span>
                              {t('বাতিল:', 'Rejected:')}{' '}
                              <strong className="text-danger">{lot.qcRejectedQty}</strong>
                            </span>
                          )}
                          {lot.unitSupplierCostPoisha ? (
                            <span>
                              {t('ইউনিট দাম:', 'Unit Cost:')} {money(lot.unitSupplierCostPoisha)}
                            </span>
                          ) : null}
                          <span>
                            {t('তারিখ:', 'Date:')} {fmtDate(lot.dispatchedAt ?? lot.createdAt, locale)}
                          </span>
                          {lot.qcProofUrl && (
                            <a
                              href={lot.qcProofUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 font-sans text-ink underline"
                            >
                              <ExternalLink className="h-3 w-3" aria-hidden="true" />
                              {t('প্রমাণ', 'Proof')}
                            </a>
                          )}
                        </div>

                        {lot.noteBn && <p className="text-[11px] text-muted">{lot.noteBn}</p>}

                        {isPending && isSuperAdmin && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
                            <label className="flex items-center gap-1.5 text-[11px] text-muted">
                              <span>{t('ত্রুটিপূর্ণ/বাতিল (পিস):', 'Rejected qty:')}</span>
                              <input
                                type="number"
                                min={0}
                                max={lot.dispatchedQty}
                                value={qcRejectByLot[lot.lotId] ?? '0'}
                                onChange={(e) =>
                                  setQcRejectByLot((prev) => ({
                                    ...prev,
                                    [lot.lotId]: e.target.value,
                                  }))
                                }
                                className="h-9 w-20 rounded-[var(--radius-sm)] border border-border bg-bg px-2 font-mono text-xs text-ink"
                              />
                            </label>
                            <Button
                              variant="primary"
                              size="sm"
                              isLoading={busyAction === `lot-${lot.lotId}-approve`}
                              onClick={() =>
                                void postWorkspace(
                                  `lot-${lot.lotId}-approve`,
                                  {
                                    operation: 'review_consignment_lot',
                                    lotId: lot.lotId,
                                    decision: 'approve',
                                    qcRejectedQty: Number(qcRejectByLot[lot.lotId] ?? '0') || 0,
                                  },
                                  t('চালান QC অনুমোদিত ও স্টকে যুক্ত হয়েছে।', 'Lot approved and added to stock.')
                                )
                              }
                              leftIcon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                            >
                              {t('QC অনুমোদন', 'Approve QC')}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              isLoading={busyAction === `lot-${lot.lotId}-reject`}
                              onClick={() =>
                                void postWorkspace(
                                  `lot-${lot.lotId}-reject`,
                                  {
                                    operation: 'review_consignment_lot',
                                    lotId: lot.lotId,
                                    decision: 'reject',
                                    qcRejectedQty: lot.dispatchedQty,
                                  },
                                  t('চালান বাতিল করা হয়েছে।', 'Lot rejected.')
                                )
                              }
                              leftIcon={<XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                            >
                              {t('বাতিল', 'Reject')}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 2. Vendor Price Change Proposals */}
          {(approvalFilter === 'all' || approvalFilter === 'proposals') && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-ink">
                  {t('ভেন্ডর মূল্য পরিবর্তন প্রস্তাব', 'Vendor Price Change Proposals')}
                </h3>
                <span className="font-mono text-xs text-muted tabular-nums">
                  {pendingProposals.length} {t('অপেক্ষমাণ', 'pending')} · {proposals.length}{' '}
                  {t('মোট', 'total')}
                </span>
              </div>

              {proposals.length === 0 ? (
                <EmptyState
                  title={t('কোনো মূল্য প্রস্তাব নেই', 'No price proposals')}
                  description={t(
                    'ভেন্ডর কোনো পণ্যের দাম পরিবর্তনের প্রস্তাব দিলে এখানে রিভিউ করতে পারবেন।',
                    'Supplier price change proposals appear here for review.'
                  )}
                />
              ) : (
                <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-bg">
                  {proposals.map((prop) => {
                    const pending = prop.status === 'pending_review';
                    return (
                      <div key={prop.proposalId} className="p-3.5 space-y-2">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="text-xs font-semibold text-ink">
                              {localizedField(prop, 'productNameBn', locale)}{' '}
                              <span className="font-mono text-[11px] font-normal text-muted">
                                · {prop.publicSku}
                              </span>
                            </p>
                            <p className="mt-0.5 text-[11px] text-muted">
                              <button
                                type="button"
                                onClick={() => {
                                  setDrawerVendorId(prop.vendorId);
                                  setProfileTab('products_stock');
                                }}
                                className="font-medium text-ink hover:underline cursor-pointer"
                              >
                                {localizedField(prop, 'vendorNameBn', locale)}
                              </button>
                              {' · '}
                              {fmtDate(prop.createdAt, locale)}
                            </p>
                          </div>
                          <Badge
                            status={
                              prop.status === 'approved'
                                ? 'success'
                                : prop.status === 'rejected'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {prop.status === 'approved'
                              ? t('অনুমোদিত', 'Approved')
                              : prop.status === 'rejected'
                                ? t('বাতিল', 'Rejected')
                                : t('রিভিউ বাকি', 'Pending Review')}
                          </Badge>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-[11px] tabular-nums">
                          <span className="text-muted">
                            {t('সাপ্লায়ার কস্ট:', 'Supplier Cost:')}{' '}
                            {money(prop.currentSupplierCostPoisha)} →{' '}
                            <strong className="text-ink">{money(prop.proposedSupplierCostPoisha)}</strong>
                          </span>
                          <span className="text-muted">
                            {t('বিক্রয় মূল্য:', 'Sale Price:')}{' '}
                            {money(prop.currentSalePricePoisha)} →{' '}
                            <strong className="text-ink">{money(prop.proposedSalePricePoisha)}</strong>
                          </span>
                        </div>

                        {prop.reasonBn && <p className="text-[11px] text-muted">{prop.reasonBn}</p>}

                        {pending && isSuperAdmin && (
                          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
                            <Button
                              variant="primary"
                              size="sm"
                              isLoading={busyAction === `prop-${prop.proposalId}-approved`}
                              onClick={() =>
                                void postWorkspace(
                                  `prop-${prop.proposalId}-approved`,
                                  {
                                    operation: 'resolve_price_proposal',
                                    proposalId: prop.proposalId,
                                    decision: 'approved',
                                  },
                                  t('মূল্য প্রস্তাব অনুমোদিত হয়েছে।', 'Price proposal approved.')
                                )
                              }
                              leftIcon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
                            >
                              {t('অনুমোদন', 'Approve')}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              isLoading={busyAction === `prop-${prop.proposalId}-rejected`}
                              onClick={() =>
                                void postWorkspace(
                                  `prop-${prop.proposalId}-rejected`,
                                  {
                                    operation: 'resolve_price_proposal',
                                    proposalId: prop.proposalId,
                                    decision: 'rejected',
                                  },
                                  t('মূল্য প্রস্তাব বাতিল করা হয়েছে।', 'Price proposal rejected.')
                                )
                              }
                              leftIcon={<XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                            >
                              {t('বাতিল', 'Reject')}
                            </Button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* 3. Profile Change Requests & KYC Documents */}
          {(approvalFilter === 'all' || approvalFilter === 'profile_kyc') && isSuperAdmin && (
            <div className="space-y-5">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-ink">
                    {t('প্রোফাইল ও পেআউট অ্যাকাউন্ট পরিবর্তনের অনুরোধ', 'Profile & Payout Account Requests')}
                  </h3>
                  <span className="font-mono text-xs text-muted tabular-nums">
                    {pendingProfileRequests.length} {t('অপেক্ষমাণ', 'pending')}
                  </span>
                </div>

                {vendorRequests.length === 0 ? (
                  <EmptyState
                    title={t('কোনো প্রোফাইল অনুরোধ নেই', 'No profile requests')}
                    description={t(
                      'ভেন্ডর প্রোফাইল বা পেআউট অ্যাকাউন্ট পরিবর্তনের অনুরোধ করলে এখানে দেখা যাবে।',
                      'Vendor-submitted profile and payout account updates appear here.'
                    )}
                  />
                ) : (
                  <div className="space-y-2">
                    {vendorRequests.map((req) => (
                      <VendorRequestRow
                        key={req.requestId}
                        request={req}
                        locale={locale}
                        busy={busyAction === `req-${req.requestId}`}
                        onOpenVendor={() => {
                          setDrawerVendorId(req.vendorId);
                          setProfileTab('overview');
                        }}
                        onDecide={(decision, reviewNoteBn) =>
                          void postVendorControl(
                            `req-${req.requestId}`,
                            {
                              operation: 'decide_vendor_request',
                              requestId: req.requestId,
                              decision,
                              reviewNoteBn: reviewNoteBn || undefined,
                            },
                            decision === 'approve'
                              ? { bn: 'অনুরোধ অনুমোদিত হয়েছে।', en: 'Request approved.' }
                              : { bn: 'অনুরোধ প্রত্যাখ্যান করা হয়েছে।', en: 'Request rejected.' }
                          )
                        }
                      />
                    ))}
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <KycPanel locale={locale} mode="admin" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 3: SLA SCORECARD & MULTI-SUPPLIER OFFERS
         ==================================================================== */}
      {/* ====================================================================
          SUB-TAB: MONEY TIMELINE & STOCK SUPPLY (received / not received)
         ==================================================================== */}
      {subTab === 'ledger_supply' && (
        <VendorLedgerSupplyPanel
          locale={locale}
          vendors={vendorsEscrow}
          ledgerEntries={ledgerEntries}
          payoutRequests={payoutRequests}
          lots={lots}
          variant="hub"
          onOpenVendor={(vendorId) => {
            setDrawerVendorId(vendorId);
            setProfileTab('ledger_supply');
          }}
          onViewPayouts={(vendorId) => onOpenPayoutsForVendor(vendorId, 'register')}
        />
      )}

      {subTab === 'performance' && (
        <div className="space-y-6">
          <div className="space-y-3">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                {t('ভেন্ডর পারফরম্যান্স ও SLA স্কোরকার্ড', 'Vendor Performance & SLA Scorecard')}
              </h3>
              <p className="text-xs text-muted">
                {t(
                  'যেকোনো ভেন্ডরে ক্লিক করলে তাদের ৩৬০° প্রোফাইল ও সম্পূর্ণ হিসাব খুলবে।',
                  'Click any vendor row to open their 360° profile and full history.'
                )}
              </p>
            </div>

            {vendorScorecards.length === 0 ? (
              <EmptyState
                title={t('কোনো স্কোরকার্ড ডেটা নেই', 'No scorecard data yet')}
                description={t(
                  'অর্ডার সম্পন্ন হলে SLA স্কোরকার্ড স্বয়ংক্রিয়ভাবে হিসাব হবে।',
                  'SLA scorecards populate automatically as orders are fulfilled.'
                )}
              />
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-bg">
                <table className="w-full min-w-[740px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface/70 text-[11px] font-semibold text-muted">
                      <th className="py-2.5 px-3.5">{t('ভেন্ডর', 'Vendor')}</th>
                      <th className="py-2.5 px-3 text-right">{t('পণ্য', 'Products')}</th>
                      <th className="py-2.5 px-3 text-right">{t('বিক্রিত', 'Sold')}</th>
                      <th className="py-2.5 px-3 text-right">{t('রিটার্ন %', 'Return %')}</th>
                      <th className="py-2.5 px-3 text-right">{t('মোট বিক্রয়', 'Gross Sales')}</th>
                      <th className="py-2.5 px-3 text-right">{t('ভেন্ডর প্রাপ্য', 'Payable')}</th>
                      <th className="py-2.5 px-3 text-right">{t('প্ল্যাটফর্ম মার্জিন', 'Margin')}</th>
                      <th className="py-2.5 px-3.5 text-right">SLA</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {vendorScorecards.map((row) => (
                      <tr
                        key={row.vendorId}
                        onClick={() => {
                          setDrawerVendorId(row.vendorId);
                          setProfileTab('overview');
                        }}
                        className="cursor-pointer transition-colors hover:bg-surface/60"
                      >
                        <td className="py-2.5 px-3.5">
                          <p className="font-semibold text-ink">{row.businessNameBn}</p>
                          <p className="text-[11px] font-mono text-muted">
                            {row.vendorCode} · {row.ownerNameBn}
                          </p>
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                          {row.activeProductsCount}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                          {row.totalUnitsSold}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                          {(row.returnRateBp / 100).toFixed(1)}%
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                          {money(row.grossSalesPoisha)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                          {money(row.netVendorPayablePoisha)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono tabular-nums font-semibold text-ink">
                          {money(row.platformMarginGeneratedPoisha)}
                        </td>
                        <td className="py-2.5 px-3.5 text-right">
                          <Badge
                            status={
                              row.slaGrade === 'A+' || row.slaGrade === 'A'
                                ? 'success'
                                : row.slaGrade === 'B'
                                  ? 'warning'
                                  : 'danger'
                            }
                          >
                            {row.slaGrade}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Collapsible Multi-Supplier Offers & Split Allocation */}
          {isSuperAdmin && (
            <MultiSupplierOffersSection
              locale={locale}
              vendors={vendorsEscrow.map((v) => v.profile)}
              productVariants={product360}
              orders={orders}
              supplierOffers={supplierOffers}
              fulfillmentGroups={fulfillmentGroups}
              busyAction={busyAction}
              onUpsertOffer={(payload) =>
                void postWorkspace(
                  'upsert-offer',
                  { operation: 'upsert_supplier_offer', ...payload },
                  t('সাপ্লায়ার অফার সংরক্ষিত হয়েছে।', 'Supplier offer saved.')
                )
              }
              onSplitOrder={(payload) =>
                void postWorkspace(
                  'split-order',
                  { operation: 'split_order_fulfillment_groups', ...payload },
                  t('অর্ডার ভেন্ডর ফুলফিলমেন্ট গ্রুপে বিভক্ত হয়েছে।', 'Order split into fulfillment groups.')
                )
              }
            />
          )}
        </div>
      )}

      {/* ====================================================================
          360° VENDOR PROFILE DRAWER
         ==================================================================== */}
      <ResponsiveSheet
        open={Boolean(selectedVendor)}
        onOpenChange={(open) => {
          if (!open) {
            setDrawerVendorId(null);
            onClearFocusedVendor?.();
          }
        }}
        size="wide"
        title={
          selectedVendor
            ? `${localizedField(selectedVendor.profile, 'businessNameBn', locale)} (${selectedVendor.profile.vendorCode})`
            : t('ভেন্ডর প্রোফাইল', 'Vendor Profile')
        }
        description={
          selectedVendor
            ? `${selectedVendor.profile.ownerNameBn} · ${selectedVendor.profile.contactPhone} · ${t('যোগদান:', 'Joined:')} ${fmtDate(selectedVendor.profile.createdAt, locale)}`
            : undefined
        }
      >
        {selectedVendor && (
          <Vendor360ProfileBody
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            vendor={selectedVendor}
            controlSnapshot={controlSnapshot}
            activeTab={profileTab}
            onTabChange={setProfileTab}
            products={product360.filter((p) => p.vendorId === selectedVendor.profile.vendorId)}
            lots={lots.filter((l) => l.vendorId === selectedVendor.profile.vendorId)}
            payouts={payoutRequests.filter((p) => p.vendorId === selectedVendor.profile.vendorId)}
            ledger={ledgerEntries.filter((e) => e.vendorId === selectedVendor.profile.vendorId)}
            orders={orders}
            manualCourierParcels={manualCourierParcels}
            busyAction={busyAction}
            onPostControl={postVendorControl}
            onPostWorkspace={postWorkspace}
            onOpenPayouts={(mode) => {
              setDrawerVendorId(null);
              onOpenPayoutsForVendor(selectedVendor.profile.vendorId, mode);
            }}
            onOpenOrderDetails={onOpenOrderDetails}
            onOpenProductStudio={() => {
              setDrawerVendorId(null);
              onOpenProductStudio();
            }}
            onOpenVendorInbox={() => {
              setDrawerVendorId(null);
              onOpenVendorInbox();
            }}
            onOpenUsersRbac={() => {
              setDrawerVendorId(null);
              onOpenUsersRbac();
            }}
          />
        )}
      </ResponsiveSheet>

      {/* ====================================================================
          UNIFIED NEW VENDOR ONBOARDING SHEET
         ==================================================================== */}
      <ResponsiveSheet
        open={showNewVendorSheet}
        onOpenChange={setShowNewVendorSheet}
        title={t('নতুন ভেন্ডর যুক্ত করুন', 'Onboard New Vendor')}
        description={t(
          'দ্রুত নতুন ভেন্ডর তৈরি করুন অথবা ১৫-প্রশ্নের কনসাইনমেন্ট চুক্তিসহ অনবোর্ড করুন।',
          'Create a vendor quickly or complete the 15-question consignment onboarding agreement.'
        )}
      >
        <NewVendorForm
          locale={locale}
          defaultCommissionBp={controlSnapshot?.globalRules.globalDefaultCommissionBp ?? 1500}
          defaultHoldDays={controlSnapshot?.globalRules.globalEscrowHoldDays ?? 7}
          busy={busyAction === 'create-vendor'}
          onQuickCreate={async (payload) => {
            const ok = await postVendorControl(
              'create-vendor',
              { operation: 'create_vendor', ...payload },
              { bn: 'নতুন ভেন্ডর তৈরি হয়েছে।', en: 'Vendor created.' }
            );
            if (ok) setShowNewVendorSheet(false);
          }}
          onFullOnboard15Q={async (payload) => {
            const res = await postWorkspace(
              'create-vendor',
              { operation: 'submit_vendor_onboarding_15q', ...payload },
              t('১৫-প্রশ্নের চুক্তিসহ নতুন ভেন্ডর অনবোর্ড হয়েছে।', 'Vendor onboarded with 15-question agreement.')
            );
            if (res) setShowNewVendorSheet(false);
          }}
          onCancel={() => setShowNewVendorSheet(false)}
        />
      </ResponsiveSheet>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 360° VENDOR PROFILE DRAWER BODY
// ---------------------------------------------------------------------------

interface UnifiedVendorRow {
  profile: VendorProfileRecord;
  balance: VendorEscrowBalance;
  control: AdminVendorRowDTO | null;
  scorecard: VendorScorecardRowDTO | null;
  productsCount: number;
  totalUnits: number;
  paidPoisha: number;
  totalOwedPoisha: number;
  totalEarnedPoisha: number;
  pendingPayoutCount: number;
  pendingRequests: number;
}

function Vendor360ProfileBody({
  locale,
  isSuperAdmin,
  vendor,
  controlSnapshot,
  activeTab,
  onTabChange,
  products,
  lots,
  payouts,
  ledger,
  orders,
  manualCourierParcels,
  busyAction,
  onPostControl,
  onPostWorkspace,
  onOpenPayouts,
  onOpenOrderDetails,
  onOpenProductStudio,
  onOpenVendorInbox,
  onOpenUsersRbac,
}: {
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  vendor: UnifiedVendorRow;
  controlSnapshot: AdminVendorControlSnapshot | null;
  activeTab: ProfileTab;
  onTabChange: (tab: ProfileTab) => void;
  products: Product360VariantDTO[];
  lots: ConsignmentDispatchLotRecord[];
  payouts: VendorPayoutRequestRecord[];
  ledger: ImmutableVendorLedgerRecord[];
  orders: Array<Partial<OrderGridRowDTO>>;
  manualCourierParcels: ManualCourierParcelRecord[];
  busyAction: string | null;
  onPostControl: (
    key: string,
    body: Record<string, unknown>,
    successMsg: { bn: string; en: string }
  ) => Promise<boolean>;
  onPostWorkspace: (
    key: string,
    body: Record<string, unknown>,
    successMsg: string
  ) => Promise<Record<string, unknown> | null>;
  onOpenPayouts: (mode: 'register' | 'direct_pay' | 'ledger') => void;
  onOpenOrderDetails: (orderNo: string) => void;
  onOpenProductStudio: () => void;
  onOpenVendorInbox: () => void;
  onOpenUsersRbac: () => void;
}) {
  const bn = locale === 'bn';
  const t = (b: string, e: string) => (bn ? b : e);
  const money = (p: number) => formatPoishaToBdt(p, locale);

  // Terms Edit State
  const [form, setForm] = React.useState({
    businessNameBn: vendor.profile.businessNameBn,
    businessNameEn: vendor.profile.businessNameEn,
    ownerNameBn: vendor.profile.ownerNameBn,
    contactPhone: vendor.profile.contactPhone,
    payoutMethodBn: vendor.profile.payoutMethodBn,
    payoutAccountNo: vendor.profile.payoutAccountNo,
    commissionPercent:
      vendor.profile.defaultCommissionBp === null
        ? ''
        : String(vendor.profile.defaultCommissionBp / 100),
    holdDays:
      vendor.profile.escrowHoldDaysOverride === null
        ? ''
        : String(vendor.profile.escrowHoldDaysOverride),
    status: vendor.profile.status,
    activationReason: '',
  });

  // Permissions State
  const [capDraft, setCapDraft] = React.useState<VendorCapabilityFlags | null>(
    vendor.control ? { ...vendor.control.capabilities } : null
  );
  const [maxProducts, setMaxProducts] = React.useState(
    vendor.control ? String(vendor.control.capabilities.maxActiveProducts) : '0'
  );
  const [restrictionNote, setRestrictionNote] = React.useState(
    vendor.control?.restrictionNoteBn ?? ''
  );

  // Inline Stock Intake toggle inside 360° profile
  const [showProfileIntake, setShowProfileIntake] = React.useState(false);

  React.useEffect(() => {
    setForm({
      businessNameBn: vendor.profile.businessNameBn,
      businessNameEn: vendor.profile.businessNameEn,
      ownerNameBn: vendor.profile.ownerNameBn,
      contactPhone: vendor.profile.contactPhone,
      payoutMethodBn: vendor.profile.payoutMethodBn,
      payoutAccountNo: vendor.profile.payoutAccountNo,
      commissionPercent:
        vendor.profile.defaultCommissionBp === null
          ? ''
          : String(vendor.profile.defaultCommissionBp / 100),
      holdDays:
        vendor.profile.escrowHoldDaysOverride === null
          ? ''
          : String(vendor.profile.escrowHoldDaysOverride),
      status: vendor.profile.status,
      activationReason: '',
    });
    if (vendor.control) {
      setCapDraft({ ...vendor.control.capabilities });
      setMaxProducts(String(vendor.control.capabilities.maxActiveProducts));
      setRestrictionNote(vendor.control.restrictionNoteBn ?? '');
    }
  }, [vendor.profile, vendor.control]);

  // Orders & parcels connected to this vendor
  const vendorOrders = React.useMemo(() => {
    const skus = new Set(products.map((p) => p.publicSku));
    const prodIds = new Set(products.map((p) => p.productId));
    return orders.filter((o) => {
      const items = (
        o as { items?: Array<{ productId: string; publicSku: string }> }
      ).items;
      return items?.some((i) => skus.has(i.publicSku) || prodIds.has(i.productId));
    });
  }, [orders, products]);

  const vendorParcels = React.useMemo(() => {
    const orderNos = new Set(vendorOrders.map((o) => o.orderNo));
    return manualCourierParcels.filter(
      (p) =>
        p.vendorIds.includes(vendor.profile.vendorId) ||
        (p.orderNo ? orderNos.has(p.orderNo) : false)
    );
  }, [manualCourierParcels, vendor.profile.vendorId, vendorOrders]);

  const statusMeta = STATUS_META[vendor.profile.status] ?? {
    bn: vendor.profile.status,
    en: vendor.profile.status,
    tone: 'neutral' as const,
  };

  const needsActivationReason =
    vendor.profile.status === 'pending_onboarding' && form.status === 'active';

  const booleanCapKeys = (controlSnapshot?.capabilityLabels ?? [])
    .map((l) => l.key)
    .filter((k) => k !== 'maxActiveProducts');

  return (
    <div className="space-y-5">
      {/* Quick Connected Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <Badge status={statusMeta.tone}>{t(statusMeta.bn, statusMeta.en)}</Badge>
          {vendor.scorecard && (
            <span className="font-mono text-xs text-muted">
              SLA <strong className="text-ink">{vendor.scorecard.slaGrade}</strong>
            </span>
          )}
          <span className="text-muted">·</span>
          <span className="font-mono text-xs text-muted">
            {t('কমিশন', 'Comm.')}{' '}
            <strong className="text-ink">
              {((vendor.profile.defaultCommissionBp ?? 1500) / 100).toFixed(1)}%
            </strong>
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            variant="primary"
            size="sm"
            onClick={() => onOpenPayouts('direct_pay')}
            leftIcon={<Banknote className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {t('পেমেন্ট / পেআউট', 'Pay / Payout')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onOpenPayouts('ledger')}
            leftIcon={<Wallet className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {t('পূর্ণ লেজার', 'Full Ledger')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onOpenVendorInbox}
            leftIcon={<MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {t('ইনবক্স', 'Inbox')}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {t('প্রিন্ট', 'Print')}
          </Button>
        </div>
      </div>

      {/* 4-Column Financial Balance Strip */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-[var(--radius-md)] border border-border bg-surface/50 p-3">
          <p className="text-[11px] text-muted">{t('মোট অর্জিত', 'Total Earned')}</p>
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-ink">
            {money(vendor.totalEarnedPoisha)}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-border bg-surface/50 p-3">
          <p className="text-[11px] text-muted">{t('মোট পরিশোধিত', 'Total Paid')}</p>
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-success">
            {money(vendor.paidPoisha)}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-border bg-surface/50 p-3">
          <p className="text-[11px] text-muted">{t('উত্তোলনযোগ্য', 'Withdrawable')}</p>
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-ink">
            {money(vendor.balance.withdrawablePoisha)}
          </p>
        </div>
        <div className="rounded-[var(--radius-md)] border border-border bg-surface/50 p-3">
          <p className="text-[11px] text-muted">{t('পেন্ডিং / লকড', 'Pending / Locked')}</p>
          <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-warning">
            {money(vendor.balance.pendingPoisha + vendor.balance.lockedPoisha)}
          </p>
        </div>
      </div>

      {/* Profile Tabs */}
      <div className="flex flex-wrap gap-1 border-b border-border pb-2.5">
        {(
          [
            ['overview', t('তথ্য ও শর্তাবলি', 'Profile & Terms')],
            ['permissions', t('পোর্টাল অনুমতি', 'Permissions')],
            ['ledger_supply', t('হিসাব ও সরবরাহ', 'Money & Supply')],
            [
              'products_stock',
              t(`পণ্য ও চালান (${products.length}/${lots.length})`, `Products & Stock (${products.length}/${lots.length})`),
            ],
            [
              'orders_payouts',
              t(`অর্ডার ও পেআউট (${vendorOrders.length}/${payouts.length})`, `Orders & Payouts (${vendorOrders.length}/${payouts.length})`),
            ],
            ['kyc_onboarding', t('চুক্তি ও KYC', 'Contract & KYC')],
          ] as Array<[ProfileTab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onTabChange(key)}
            className={cn(
              'min-h-[36px] rounded-[var(--radius-sm)] border px-3 text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer',
              activeTab === key
                ? 'border-ink bg-ink text-bg'
                : 'border-border bg-bg text-ink hover:bg-surface'
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {/* TAB A: PROFILE & TERMS */}
      {activeTab === 'overview' && (
        <div className="space-y-5">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              if (needsActivationReason && form.activationReason.trim().length < 5) return;
              await onPostControl(
                'update-vendor',
                {
                  operation: 'update_vendor',
                  vendorId: vendor.profile.vendorId,
                  businessNameBn: form.businessNameBn.trim(),
                  businessNameEn: form.businessNameEn.trim() || undefined,
                  ownerNameBn: form.ownerNameBn.trim(),
                  contactPhone: form.contactPhone.trim(),
                  payoutMethodBn: form.payoutMethodBn.trim(),
                  payoutAccountNo: form.payoutAccountNo.trim(),
                  defaultCommissionBp: form.commissionPercent
                    ? Math.round(Number(form.commissionPercent) * 100)
                    : null,
                  escrowHoldDaysOverride: form.holdDays ? Number(form.holdDays) : null,
                  status: form.status,
                  activationReason: needsActivationReason
                    ? form.activationReason.trim()
                    : undefined,
                },
                { bn: 'ভেন্ডর প্রোফাইল ও শর্তাবলি আপডেট হয়েছে।', en: 'Vendor profile and terms updated.' }
              );
            }}
            className="grid gap-3 sm:grid-cols-2"
          >
            <label className="space-y-1 text-xs font-medium">
              <span>{t('ব্যবসার নাম (বাংলা)', 'Business Name (Bangla)')}</span>
              <input
                className={inputCls}
                value={form.businessNameBn}
                onChange={(e) => setForm((f) => ({ ...f, businessNameBn: e.target.value }))}
                required
                minLength={2}
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('ব্যবসার নাম (ইংরেজি)', 'Business Name (English)')}</span>
              <input
                className={inputCls}
                value={form.businessNameEn}
                onChange={(e) => setForm((f) => ({ ...f, businessNameEn: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('মালিকের নাম', 'Owner Name')}</span>
              <input
                className={inputCls}
                value={form.ownerNameBn}
                onChange={(e) => setForm((f) => ({ ...f, ownerNameBn: e.target.value }))}
                required
                minLength={2}
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('যোগাযোগ নম্বর', 'Contact Phone')}</span>
              <input
                className={cn(inputCls, 'font-mono')}
                inputMode="tel"
                value={form.contactPhone}
                onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                required
                minLength={11}
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('পেআউট মাধ্যম', 'Payout Method')}</span>
              <input
                className={inputCls}
                value={form.payoutMethodBn}
                onChange={(e) => setForm((f) => ({ ...f, payoutMethodBn: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('পেআউট অ্যাকাউন্ট নম্বর', 'Payout Account Number')}</span>
              <input
                className={cn(inputCls, 'font-mono')}
                value={form.payoutAccountNo}
                onChange={(e) => setForm((f) => ({ ...f, payoutAccountNo: e.target.value }))}
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('কমিশন (%)', 'Commission (%)')}</span>
              <input
                className={cn(inputCls, 'font-mono')}
                inputMode="decimal"
                value={form.commissionPercent}
                onChange={(e) => setForm((f) => ({ ...f, commissionPercent: e.target.value }))}
                placeholder={String(
                  (controlSnapshot?.globalRules.globalDefaultCommissionBp ?? 1500) / 100
                )}
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('এসক্রো হোল্ড (দিন)', 'Escrow Hold (days)')}</span>
              <input
                className={cn(inputCls, 'font-mono')}
                inputMode="numeric"
                value={form.holdDays}
                onChange={(e) =>
                  setForm((f) => ({ ...f, holdDays: e.target.value.replace(/\D/g, '') }))
                }
                placeholder={String(controlSnapshot?.globalRules.globalEscrowHoldDays ?? 7)}
              />
            </label>
            <label className="space-y-1 text-xs font-medium sm:col-span-2">
              <span>{t('অ্যাকাউন্ট স্ট্যাটাস', 'Account Status')}</span>
              <select
                className={inputCls}
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as typeof f.status }))}
              >
                <option value="active">{t('সক্রিয়', 'Active')}</option>
                <option value="pending_onboarding">{t('অনবোর্ডিং অপেক্ষমাণ', 'Pending Onboarding')}</option>
                <option value="suspended">{t('স্থগিত (সব কাজ বন্ধ)', 'Suspended (All Actions Blocked)')}</option>
                <option value="closing_audit">{t('ক্লোজিং অডিট', 'Closing Audit')}</option>
                {vendor.profile.status === 'closed' && (
                  <option value="closed">{t('বন্ধ', 'Closed')}</option>
                )}
              </select>
            </label>

            {needsActivationReason && (
              <label className="space-y-1 text-xs font-medium sm:col-span-2">
                <span className="text-warning">
                  {t(
                    'অ্যাক্টিভেশন রিভিউ নোট (কমপক্ষে ৫ অক্ষর) *',
                    'Onboarding activation review note (min 5 chars) *'
                  )}
                </span>
                <input
                  className={inputCls}
                  value={form.activationReason}
                  onChange={(e) => setForm((f) => ({ ...f, activationReason: e.target.value }))}
                  placeholder={t(
                    'যেমন: অনবোর্ডিং চুক্তি ও প্রাথমিক তথ্য যাচাই সম্পন্ন',
                    'e.g. Onboarding answers verified and approved'
                  )}
                  required
                  minLength={5}
                />
              </label>
            )}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 sm:col-span-2">
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={busyAction === 'update-vendor'}
                leftIcon={<Save className="h-3.5 w-3.5" aria-hidden="true" />}
              >
                {t('পরিবর্তন সংরক্ষণ', 'Save Changes')}
              </Button>

              {isSuperAdmin && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  isLoading={busyAction === 'closure-audit'}
                  onClick={async () => {
                    const data = await onPostWorkspace(
                      'closure-audit',
                      {
                        operation: 'audit_vendor_closure',
                        vendorId: vendor.profile.vendorId,
                      },
                      t('চুক্তি সমাপ্তি অডিট সম্পন্ন হয়েছে।', 'Closure audit evaluated.')
                    );
                    if (data && typeof data.reasonBn === 'string') {
                      // Backend returns detailed reasonBn
                    }
                  }}
                  leftIcon={<ShieldAlert className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t('চুক্তি সমাপ্তি অডিট', 'Closure Audit')}
                </Button>
              )}
            </div>
          </form>

          {/* Linked Login Accounts */}
          <div className="rounded-[var(--radius-md)] border border-border bg-surface/50 p-3.5 text-xs space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="font-semibold text-ink">
                {t('লিংকড ভেন্ডর পোর্টাল লগইন (/vendor)', 'Linked Vendor Portal Login (/vendor)')}
              </p>
              <Button variant="ghost" size="sm" onClick={onOpenUsersRbac}>
                {t('ইউজার ও RBAC খুলুন', 'Manage in Users & RBAC')}
              </Button>
            </div>

            {!vendor.control || vendor.control.linkedUsers.length === 0 ? (
              <p className="text-muted">
                {t(
                  'এখনো কোনো লগইন অ্যাকাউন্ট যুক্ত নেই — Users & RBAC থেকে vendor রোল দিয়ে তৈরি করুন।',
                  'No login linked yet — create a vendor-role account in Users & RBAC.'
                )}
              </p>
            ) : (
              <ul className="space-y-1">
                {vendor.control.linkedUsers.map((u) => (
                  <li key={u.userId} className="flex flex-wrap items-center gap-2">
                    <User className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    <span className="font-mono font-medium text-ink">@{u.username}</span>
                    <span className="text-muted">·</span>
                    <span className={u.isActive ? 'text-success' : 'text-danger'}>
                      {u.isActive ? t('সক্রিয়', 'Active') : t('নিষ্ক্রিয়', 'Inactive')}
                    </span>
                    {u.mustChangePassword && (
                      <span className="text-warning">
                        · {t('প্রথম লগইন বাকি', 'First login pending')}
                      </span>
                    )}
                    {u.totpEnrolled && <span className="text-muted">· 2FA</span>}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* TAB B: SERVER-ENFORCED PORTAL PERMISSIONS */}
      {activeTab === 'permissions' && (
        <div className="space-y-4">
          <p className="text-xs text-muted">
            {t(
              'বন্ধ রাখা সুবিধা ভেন্ডর প্যানেলে সার্ভার-সাইড থেকে ব্লক থাকবে — শুধু বাটন লুকানো নয়।',
              'Disabled capabilities are strictly enforced server-side on /api/vendor/*.'
            )}
          </p>

          {!capDraft || !controlSnapshot ? (
            <EmptyState
              title={t('অনুমতি ডেটা লোড হয়নি', 'Permissions unavailable')}
              description={t(
                'ভেন্ডর কন্ট্রোল ডেটা রিফ্রেশ করে আবার চেষ্টা করুন।',
                'Refresh the Vendors workspace to load portal permissions.'
              )}
            />
          ) : (
            <>
              <ul className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-bg">
                {booleanCapKeys.map((key) => {
                  const meta = controlSnapshot.capabilityLabels.find((l) => l.key === key);
                  if (!meta) return null;
                  const enabled = capDraft[key] === true;
                  return (
                    <li
                      key={key}
                      className="flex items-center justify-between gap-3 px-3.5 py-2.5"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-ink">
                          {t(meta.labelBn, meta.labelEn)}
                        </p>
                        <p className="text-[11px] text-muted">{t(meta.hintBn, meta.hintEn)}</p>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={enabled}
                        aria-label={t(meta.labelBn, meta.labelEn)}
                        onClick={() =>
                          setCapDraft((curr) =>
                            curr ? { ...curr, [key]: !curr[key] } : curr
                          )
                        }
                        className={cn(
                          'inline-flex min-h-[36px] min-w-[68px] shrink-0 items-center justify-center gap-1 rounded-[var(--radius-sm)] border px-2.5 text-[11px] font-semibold cursor-pointer transition-colors',
                          enabled
                            ? 'border-success/60 bg-success/5 text-success'
                            : 'border-danger/60 bg-danger/5 text-danger'
                        )}
                      >
                        {enabled ? t('চালু', 'On') : t('বন্ধ', 'Off')}
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-xs font-medium">
                  <span>{t('সর্বোচ্চ সক্রিয় পণ্য (০ = সীমাহীন)', 'Max Active Products (0 = unlimited)')}</span>
                  <input
                    className={cn(inputCls, 'font-mono')}
                    inputMode="numeric"
                    value={maxProducts}
                    onChange={(e) => setMaxProducts(e.target.value.replace(/\D/g, ''))}
                  />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  <span>{t('ভেন্ডরকে দেখানো নোট (ঐচ্ছিক)', 'Vendor Notice (optional)')}</span>
                  <input
                    className={inputCls}
                    value={restrictionNote}
                    onChange={(e) => setRestrictionNote(e.target.value)}
                    placeholder={t(
                      'যেমন: KYC যাচাই সম্পন্ন না হওয়া পর্যন্ত পেআউট বন্ধ',
                      'e.g. Payouts paused pending KYC review'
                    )}
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button
                  variant="primary"
                  size="sm"
                  isLoading={busyAction === 'save-caps'}
                  onClick={() =>
                    void onPostControl(
                      'save-caps',
                      {
                        operation: 'set_capabilities',
                        vendorId: vendor.profile.vendorId,
                        capabilities: {
                          ...capDraft,
                          maxActiveProducts: Number(maxProducts) || 0,
                        },
                        restrictionNoteBn: restrictionNote.trim() || undefined,
                      },
                      { bn: 'ভেন্ডর পোর্টালের অনুমতি আপডেট হয়েছে।', en: 'Vendor portal permissions saved.' }
                    )
                  }
                  leftIcon={<KeyRound className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t('অনুমতি সংরক্ষণ করুন', 'Save Permissions')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={busyAction === 'reset-caps'}
                  onClick={() =>
                    void onPostControl(
                      'reset-caps',
                      { operation: 'reset_capabilities', vendorId: vendor.profile.vendorId },
                      { bn: 'ডিফল্ট অনুমতিতে ফিরিয়ে নেওয়া হয়েছে।', en: 'Reset to default permissions.' }
                    )
                  }
                >
                  {t('ডিফল্টে ফেরান', 'Reset to Default')}
                </Button>
              </div>
            </>
          )}
        </div>
      )}

      {/* TAB C: PRODUCTS & CONSIGNMENT STOCK INTAKE HISTORY */}
      {activeTab === 'ledger_supply' && (
        <VendorLedgerSupplyPanel
          locale={locale}
          vendors={[{ profile: vendor.profile, balance: vendor.balance }]}
          ledgerEntries={ledger}
          payoutRequests={payouts}
          lots={lots}
          variant="vendor"
          vendorId={vendor.profile.vendorId}
          onViewPayouts={() => onOpenPayouts('register')}
        />
      )}

      {activeTab === 'products_stock' && (
        <div className="space-y-5">
          {/* Supplied Products */}
          <div className="space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-ink">
                {t(`সরবরাহকৃত পণ্য (${products.length})`, `Supplied Products (${products.length})`)}
              </h4>
              <div className="flex items-center gap-2">
                {products.length > 0 && (
                  <Button
                    variant={showProfileIntake ? 'secondary' : 'primary'}
                    size="sm"
                    onClick={() => setShowProfileIntake((v) => !v)}
                    leftIcon={<PackagePlus className="h-3.5 w-3.5" aria-hidden="true" />}
                  >
                    {t('স্টক রিসিভ এন্ট্রি', 'Receive Stock')}
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onOpenProductStudio}
                  leftIcon={<Package className="h-3.5 w-3.5" aria-hidden="true" />}
                >
                  {t('প্রোডাক্ট স্টুডিও', 'Product Studio')}
                </Button>
              </div>
            </div>

            {showProfileIntake && products.length > 0 && (
              <AdminStockIntakeForm
                locale={locale}
                productVariants={products}
                busy={busyAction === 'profile-stock-intake'}
                onSubmit={async (payload) => {
                  const res = await onPostWorkspace(
                    'profile-stock-intake',
                    { operation: 'record_admin_consignment_intake', ...payload },
                    t('স্টক গ্রহণ সম্পন্ন ও ইতিহাসে যুক্ত হয়েছে।', 'Stock received and recorded.')
                  );
                  if (res) setShowProfileIntake(false);
                }}
              />
            )}

            {products.length === 0 ? (
              <EmptyState
                title={t('কোনো পণ্য যুক্ত নেই', 'No products linked')}
                description={t(
                  'প্রোডাক্ট স্টুডিও থেকে এই ভেন্ডরের পণ্য যুক্ত করুন।',
                  'Link products to this vendor in Product Studio.'
                )}
              />
            ) : (
              <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-bg">
                <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-border bg-surface/60 text-[11px] font-semibold text-muted">
                      <th className="py-2 px-3">{t('পণ্য ও SKU', 'Product & SKU')}</th>
                      <th className="py-2 px-2.5 text-right">{t('স্টক', 'Stock')}</th>
                      <th className="py-2 px-2.5 text-right">{t('৩০ দিনে বিক্রি', '30d Sold')}</th>
                      <th className="py-2 px-2.5 text-right">{t('প্রদেয়', 'Payable')}</th>
                      <th className="py-2 px-2.5 text-right">{t('বিক্রয় মূল্য', 'Sale')}</th>
                      <th className="py-2 px-3 text-right">{t('মার্জিন', 'Margin')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {products.map((p) => (
                      <tr key={p.variantId}>
                        <td className="py-2 px-3">
                          <p className="font-medium text-ink">
                            {localizedField(p, 'productNameBn', locale)}
                          </p>
                          <p className="text-[11px] text-muted">
                            {localizedField(p, 'variantTitleBn', locale)} ·{' '}
                            <span className="font-mono">{p.publicSku}</span>
                          </p>
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-ink">
                          {p.stockAvailable}
                          {p.isLowStock && (
                            <span className="ml-1 text-[10px] text-danger">!</span>
                          )}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-muted">
                          {p.soldLast30Days}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-ink">
                          {p.supplierPayablePoisha !== undefined
                            ? money(p.supplierPayablePoisha)
                            : '—'}
                        </td>
                        <td className="py-2 px-2.5 text-right font-mono tabular-nums text-ink">
                          {money(p.salePricePoisha)}
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-semibold text-success">
                          {p.platformMarginPoisha !== undefined
                            ? money(p.platformMarginPoisha)
                            : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Consignment Stock Intake History */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-ink">
              {t(
                `পণ্য সরবরাহ ও স্টক চালান ইতিহাস (${lots.length})`,
                `Stock Supply & Challan History (${lots.length})`
              )}
            </h4>
            {lots.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-border bg-surface/40 p-3 text-xs text-muted">
                {t(
                  'এই ভেন্ডরের কোনো স্টক চালান এখনো রেকর্ড হয়নি।',
                  'No consignment stock deliveries recorded for this vendor yet.'
                )}
              </p>
            ) : (
              <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-bg">
                {lots.map((lot) => (
                  <div key={lot.lotId} className="p-3 text-xs space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-ink">
                        {localizedField(lot, 'productNameBn', locale)} ({lot.publicSku})
                      </span>
                      <Badge
                        status={
                          lot.status === 'approved_stocked'
                            ? 'success'
                            : lot.status === 'rejected'
                              ? 'danger'
                              : 'warning'
                        }
                      >
                        {lot.status === 'approved_stocked'
                          ? t('গৃহীত', 'Accepted')
                          : lot.status === 'rejected'
                            ? t('বাতিল', 'Rejected')
                            : t('QC বাকি', 'Pending QC')}
                      </Badge>
                    </div>
                    <p className="font-mono text-[11px] text-muted tabular-nums">
                      {lot.lotCode} · {t('চালান', 'Challan')} {lot.challanRef} · {t('পাঠানো', 'Sent')}{' '}
                      {lot.dispatchedQty}
                      {lot.qcAcceptedQty !== null
                        ? ` · ${t('গৃহীত', 'Acc')} ${lot.qcAcceptedQty}`
                        : ''}
                      {lot.unitSupplierCostPoisha
                        ? ` · ${money(lot.unitSupplierCostPoisha)}/pc`
                        : ''}
                      {' · '}
                      {fmtDate(lot.dispatchedAt ?? lot.createdAt, locale)}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB D: LINKED ORDERS, PARCELS & PAYOUT HISTORY */}
      {activeTab === 'orders_payouts' && (
        <div className="space-y-5">
          {/* Payout History */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h4 className="text-xs font-semibold text-ink">
                {t(`পেআউট ও পরিশোধ ইতিহাস (${payouts.length})`, `Payout History (${payouts.length})`)}
              </h4>
              <Button variant="outline" size="sm" onClick={() => onOpenPayouts('register')}>
                {t('পেআউট রেজিস্টারে দেখুন', 'Open in Payout Register')}
              </Button>
            </div>
            {payouts.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-border bg-surface/40 p-3 text-xs text-muted">
                {t('এখনো কোনো পেআউট হয়নি।', 'No payouts recorded yet.')}
              </p>
            ) : (
              <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-bg">
                {payouts.map((p) => (
                  <div
                    key={p.payoutId}
                    className="flex flex-wrap items-center justify-between gap-2 p-3 text-xs"
                  >
                    <div>
                      <p className="font-mono font-semibold text-ink">
                        {p.payoutId} · {p.payoutMethodBn}
                      </p>
                      <p className="text-[11px] text-muted">
                        {fmtDateTime(p.requestedAt, locale)}
                        {p.paymentTrxId ? ` · TrxID: ${p.paymentTrxId}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge
                        status={
                          p.status === 'paid'
                            ? 'success'
                            : p.status === 'rejected'
                              ? 'danger'
                              : p.status === 'approved'
                                ? 'info'
                                : 'warning'
                        }
                      >
                        {p.status}
                      </Badge>
                      <span className="font-mono font-bold tabular-nums text-ink">
                        {money(p.requestedAmountPoisha)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Linked Orders */}
          <div className="space-y-2.5">
            <h4 className="text-xs font-semibold text-ink">
              {t(
                `সংশ্লিষ্ট কাস্টমার অর্ডার (${vendorOrders.length}) ও পার্সেল (${vendorParcels.length})`,
                `Linked Customer Orders (${vendorOrders.length}) & Parcels (${vendorParcels.length})`
              )}
            </h4>
            {vendorOrders.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-border bg-surface/40 p-3 text-xs text-muted">
                {t('এই ভেন্ডরের পণ্যে এখনো কোনো অর্ডার নেই।', 'No customer orders for this vendor yet.')}
              </p>
            ) : (
              <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-bg">
                {vendorOrders.slice(0, 20).map((ord) => (
                  <button
                    key={ord.orderNo}
                    type="button"
                    onClick={() => ord.orderNo && onOpenOrderDetails(ord.orderNo)}
                    className="flex w-full items-center justify-between gap-2 p-3 text-left text-xs transition-colors hover:bg-surface/60 cursor-pointer"
                  >
                    <div>
                      <p className="font-mono font-semibold text-ink">{ord.orderNo}</p>
                      <p className="text-[11px] text-muted">
                        {ord.customerName} · {fmtDate(ord.createdAt, locale)}
                        {ord.trackingCode ? ` · ${ord.trackingCode}` : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <Badge status="neutral">{ord.status ?? '—'}</Badge>
                      <span className="font-mono font-semibold tabular-nums text-ink">
                        {money(ord.totalPayablePoisha ?? 0)}
                      </span>
                      <ArrowUpRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Recent Ledger Entries */}
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-ink">
              {t(`সাম্প্রতিক লেজার এন্ট্রি (${ledger.length})`, `Recent Ledger Entries (${ledger.length})`)}
            </h4>
            {ledger.length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-border bg-surface/40 p-3 text-xs text-muted">
                {t('কোনো লেজার এন্ট্রি নেই।', 'No ledger entries yet.')}
              </p>
            ) : (
              <div className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-bg">
                {ledger.slice(0, 8).map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 text-xs"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-ink">{entry.descriptionBn}</p>
                      <p className="font-mono text-[10px] text-muted">
                        {entry.escrowBucket} · {entry.orderNo ?? entry.id} ·{' '}
                        {fmtDate(entry.createdAt, locale)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        'font-mono font-semibold tabular-nums shrink-0',
                        entry.amountPoisha >= 0 ? 'text-success' : 'text-danger'
                      )}
                    >
                      {entry.amountPoisha >= 0 ? '+' : ''}
                      {money(entry.amountPoisha)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB E: 15-QUESTION CONTRACT & KYC */}
      {activeTab === 'kyc_onboarding' && (
        <div className="space-y-4">
          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-ink">
              {t(
                '১৫-প্রশ্নের কনসাইনমেন্ট অনবোর্ডিং উত্তর',
                '15-Question Consignment Onboarding Answers'
              )}
            </h4>
            {!vendor.profile.onboardingAnswers15 ||
            Object.keys(vendor.profile.onboardingAnswers15).length === 0 ? (
              <p className="rounded-[var(--radius-md)] border border-border bg-surface/40 p-3 text-xs text-muted">
                {t(
                  'এই ভেন্ডরের ১৫-প্রশ্নের উত্তর এখনো জমা হয়নি।',
                  'No onboarding agreement responses recorded for this vendor yet.'
                )}
              </p>
            ) : (
              <dl className="divide-y divide-border rounded-[var(--radius-md)] border border-border bg-bg text-xs">
                {ONBOARDING_15Q.map((q) => {
                  const ans = vendor.profile.onboardingAnswers15?.[q.key];
                  if (!ans) return null;
                  return (
                    <div key={q.key} className="p-3 space-y-0.5">
                      <dt className="text-[11px] font-medium text-muted">{q.questionBn}</dt>
                      <dd className="text-ink">{ans}</dd>
                    </div>
                  );
                })}
              </dl>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ADMIN STOCK RECEIVING INTAKE FORM (Reusable in Queue & 360° Profile)
// ---------------------------------------------------------------------------

function AdminStockIntakeForm({
  locale,
  productVariants,
  busy,
  onSubmit,
}: {
  locale: 'bn' | 'en';
  productVariants: Product360VariantDTO[];
  busy: boolean;
  onSubmit: (payload: {
    variantId: string;
    dispatchedQty: number;
    qcRejectedQty: number;
    unitSupplierCostPoisha?: number;
    challanRef: string;
    dispatchedAt?: string;
    receivedAt?: string;
    qcProofUrl?: string;
    noteBn: string;
  }) => Promise<void>;
}) {
  const bn = locale === 'bn';
  const t = (b: string, e: string) => (bn ? b : e);

  const [variantId, setVariantId] = React.useState(productVariants[0]?.variantId ?? '');
  const [sentQty, setSentQty] = React.useState('10');
  const [rejectedQty, setRejectedQty] = React.useState('0');
  const [unitCostBdt, setUnitCostBdt] = React.useState(
    typeof productVariants[0]?.supplierCostPoisha === 'number'
      ? String(Math.round(productVariants[0].supplierCostPoisha / 100))
      : ''
  );
  const [challanRef, setChallanRef] = React.useState(`CH-${new Date().toISOString().slice(0, 10)}`);
  const [dispatchedAt, setDispatchedAt] = React.useState(() => new Date().toISOString().slice(0, 16));
  const [receivedAt, setReceivedAt] = React.useState(() => new Date().toISOString().slice(0, 16));
  const [proofUrl, setProofUrl] = React.useState('');
  const [noteBn, setNoteBn] = React.useState(
    t('কনসাইনমেন্ট স্টক চালান গুদামে গৃহীত।', 'Consignment stock received at warehouse.')
  );

  const accepted = Math.max(0, (Number(sentQty) || 0) - (Number(rejectedQty) || 0));

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        if (!variantId) return;
        const unitCostPoisha = Math.round((Number(unitCostBdt) || 0) * 100);
        await onSubmit({
          variantId,
          dispatchedQty: Math.max(1, Number(sentQty) || 1),
          qcRejectedQty: Math.max(0, Number(rejectedQty) || 0),
          unitSupplierCostPoisha: unitCostPoisha >= 100 ? unitCostPoisha : undefined,
          challanRef: challanRef.trim(),
          dispatchedAt: dispatchedAt ? new Date(dispatchedAt).toISOString() : undefined,
          receivedAt: receivedAt ? new Date(receivedAt).toISOString() : undefined,
          qcProofUrl: proofUrl.trim() || undefined,
          noteBn: noteBn.trim(),
        });
      }}
      className="rounded-[var(--radius-md)] border border-border bg-surface/60 p-4 space-y-3 text-xs"
    >
      <h4 className="font-semibold text-ink">
        {t('কনসাইনমেন্ট স্টক রিসিভ এন্ট্রি', 'Record Consignment Stock Received')}
      </h4>

      <div className="grid gap-2.5 sm:grid-cols-2">
        <label className="space-y-1 sm:col-span-2">
          <span className="font-medium text-ink">{t('পণ্য ও ভ্যারিয়েন্ট *', 'Product Variant *')}</span>
          <select
            className={inputCls}
            value={variantId}
            onChange={(e) => {
              const id = e.target.value;
              setVariantId(id);
              const matched = productVariants.find((v) => v.variantId === id);
              if (typeof matched?.supplierCostPoisha === 'number') {
                setUnitCostBdt(String(Math.round(matched.supplierCostPoisha / 100)));
              }
            }}
            required
          >
            {productVariants.map((v) => (
              <option key={v.variantId} value={v.variantId}>
                {v.publicSku} — {localizedField(v, 'productNameBn', locale)} (
                {localizedField(v, 'variantTitleBn', locale)}) [{t('স্টক:', 'Stock:')} {v.stockAvailable}]
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className="font-medium text-ink">{t('পাঠানো সংখ্যা (পিস) *', 'Sent Qty *')}</span>
          <input
            type="number"
            min={1}
            className={cn(inputCls, 'font-mono')}
            value={sentQty}
            onChange={(e) => setSentQty(e.target.value)}
            required
          />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">{t('বাতিল / ত্রুটি (পিস)', 'Rejected Qty')}</span>
          <input
            type="number"
            min={0}
            max={Math.max(0, Number(sentQty) || 0)}
            className={cn(inputCls, 'font-mono')}
            value={rejectedQty}
            onChange={(e) => setRejectedQty(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">{t('ইউনিট ক্রয়মূল্য (৳)', 'Unit Cost (৳)')}</span>
          <input
            type="number"
            min={1}
            className={cn(inputCls, 'font-mono')}
            value={unitCostBdt}
            onChange={(e) => setUnitCostBdt(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">{t('চালান নম্বর *', 'Challan Ref *')}</span>
          <input
            className={cn(inputCls, 'font-mono')}
            value={challanRef}
            onChange={(e) => setChallanRef(e.target.value)}
            required
          />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">{t('পাঠানোর তারিখ', 'Sent Date')}</span>
          <input
            type="datetime-local"
            className={cn(inputCls, 'font-mono')}
            value={dispatchedAt}
            onChange={(e) => setDispatchedAt(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">{t('রিসিভ তারিখ', 'Received Date')}</span>
          <input
            type="datetime-local"
            className={cn(inputCls, 'font-mono')}
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">{t('চালান ছবির লিংক (ঐচ্ছিক)', 'Proof URL (optional)')}</span>
          <input
            type="url"
            placeholder="https://..."
            className={inputCls}
            value={proofUrl}
            onChange={(e) => setProofUrl(e.target.value)}
          />
        </label>
        <label className="space-y-1">
          <span className="font-medium text-ink">{t('নোট *', 'Note *')}</span>
          <input
            className={inputCls}
            value={noteBn}
            onChange={(e) => setNoteBn(e.target.value)}
            required
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <p className="font-mono text-[11px] text-muted tabular-nums">
          {t('স্টকে যোগ হবে:', 'Accepted to stock:')}{' '}
          <strong className="text-ink">{accepted}</strong> {t('পিস', 'pcs')}
        </p>
        <Button type="submit" variant="primary" size="sm" isLoading={busy}>
          {t('স্টক গ্রহণ সংরক্ষণ করুন', 'Save Stock Receipt')}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// VENDOR PROFILE / ONBOARDING REQUEST ROW
// ---------------------------------------------------------------------------

function VendorRequestRow({
  request,
  locale,
  busy,
  onOpenVendor,
  onDecide,
}: {
  request: AdminVendorRequestDTO;
  locale: 'bn' | 'en';
  busy: boolean;
  onOpenVendor: () => void;
  onDecide: (decision: 'approve' | 'reject', note: string) => void;
}) {
  const bn = locale === 'bn';
  const t = (b: string, e: string) => (bn ? b : e);
  const [note, setNote] = React.useState('');
  const pending = request.status === 'pending_review';

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5 space-y-2.5 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Badge
            status={
              request.status === 'approved'
                ? 'success'
                : request.status === 'rejected'
                  ? 'danger'
                  : 'warning'
            }
          >
            {request.status === 'approved'
              ? t('অনুমোদিত', 'Approved')
              : request.status === 'rejected'
                ? t('প্রত্যাখ্যাত', 'Rejected')
                : t('অপেক্ষমাণ', 'Pending')}
          </Badge>
          <button
            type="button"
            onClick={onOpenVendor}
            className="font-semibold text-ink hover:underline cursor-pointer"
          >
            {request.vendorNameBn}
          </button>
          <span className="font-mono text-[11px] text-muted">{request.vendorCode}</span>
          <span className="text-muted">·</span>
          <span className="text-muted">
            {request.kind === 'profile_update'
              ? t('প্রোফাইল পরিবর্তন', 'Profile change')
              : t('অনবোর্ডিং উত্তর', 'Onboarding answers')}
          </span>
        </div>
        <span className="font-mono text-[11px] text-muted">
          {fmtDateTime(request.createdAt, locale)}
        </span>
      </div>

      <dl className="grid gap-1.5 text-[11px] sm:grid-cols-2">
        {Object.entries(request.payload).map(([key, value]) => {
          const label = FIELD_LABELS[key] ? t(FIELD_LABELS[key].bn, FIELD_LABELS[key].en) : key;
          return (
            <div key={key} className="min-w-0">
              <dt className="font-semibold text-muted">{label}</dt>
              <dd className="break-words text-ink">
                {typeof value === 'object' && value !== null
                  ? Object.entries(value as Record<string, unknown>)
                      .map(([k, v]) => `${k}: ${String(v)}`)
                      .join(' · ')
                  : String(value)}
              </dd>
            </div>
          );
        })}
      </dl>

      {request.reviewNoteBn && (
        <p className="text-[11px] text-muted">
          {t('রিভিউ নোট:', 'Review note:')} {request.reviewNoteBn}
        </p>
      )}

      {pending && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2.5">
          <input
            className={cn(inputCls, 'flex-1 min-w-[180px]')}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={t('রিভিউ নোট (প্রত্যাখ্যানে আবশ্যক)', 'Review note (required to reject)')}
          />
          <Button
            variant="primary"
            size="sm"
            isLoading={busy}
            onClick={() => onDecide('approve', note.trim())}
            leftIcon={<CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {t('অনুমোদন', 'Approve')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            isLoading={busy}
            disabled={note.trim().length < 2}
            onClick={() => onDecide('reject', note.trim())}
            leftIcon={<XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
          >
            {t('প্রত্যাখ্যান', 'Reject')}
          </Button>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UNIFIED NEW VENDOR ONBOARDING FORM (Quick Create + Optional 15Q)
// ---------------------------------------------------------------------------

function NewVendorForm({
  locale,
  defaultCommissionBp,
  defaultHoldDays,
  busy,
  onQuickCreate,
  onFullOnboard15Q,
  onCancel,
}: {
  locale: 'bn' | 'en';
  defaultCommissionBp: number;
  defaultHoldDays: number;
  busy: boolean;
  onQuickCreate: (payload: Record<string, unknown>) => Promise<void>;
  onFullOnboard15Q: (payload: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}) {
  const bn = locale === 'bn';
  const t = (b: string, e: string) => (bn ? b : e);

  const [mode, setMode] = React.useState<'quick' | 'full_15q'>('quick');
  const [businessNameBn, setBusinessNameBn] = React.useState('');
  const [businessNameEn, setBusinessNameEn] = React.useState('');
  const [ownerNameBn, setOwnerNameBn] = React.useState('');
  const [contactPhone, setContactPhone] = React.useState('');
  const [payoutMethodBn, setPayoutMethodBn] = React.useState('বিকাশ মার্চেন্ট');
  const [payoutAccountNo, setPayoutAccountNo] = React.useState('');
  const [commissionPct, setCommissionPct] = React.useState(String(defaultCommissionBp / 100));
  const [holdDays, setHoldDays] = React.useState(String(defaultHoldDays));
  const [answers15, setAnswers15] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(ONBOARDING_15Q.map((q) => [q.key, q.placeholderBn]))
  );

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        const commBp = Math.round((Number(commissionPct) || 0) * 100);
        const holdNum = Math.max(1, Number(holdDays) || defaultHoldDays);
        if (mode === 'quick') {
          await onQuickCreate({
            businessNameBn: businessNameBn.trim(),
            businessNameEn: businessNameEn.trim() || undefined,
            ownerNameBn: ownerNameBn.trim(),
            contactPhone: contactPhone.trim(),
            defaultCommissionBp: commBp,
            escrowHoldDaysOverride: holdNum,
            payoutMethodBn: payoutMethodBn.trim() || 'বিকাশ মার্চেন্ট',
            payoutAccountNo: payoutAccountNo.trim() || contactPhone.trim(),
          });
        } else {
          await onFullOnboard15Q({
            businessNameBn: businessNameBn.trim(),
            businessNameEn: businessNameEn.trim() || undefined,
            ownerNameBn: ownerNameBn.trim(),
            contactPhone: contactPhone.trim(),
            defaultCommissionBp: commBp,
            escrowHoldDaysOverride: holdNum,
            payoutMethodBn: payoutMethodBn.trim() || 'বিকাশ মার্চেন্ট',
            payoutAccountNo: payoutAccountNo.trim() || contactPhone.trim(),
            answers15,
          });
        }
      }}
      className="space-y-4 text-xs"
    >
      <div className="flex gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface p-1">
        <button
          type="button"
          onClick={() => setMode('quick')}
          className={cn(
            'flex-1 min-h-[36px] rounded-[var(--radius-sm)] text-xs font-semibold cursor-pointer',
            mode === 'quick' ? 'bg-bg text-ink shadow-xs' : 'text-muted hover:text-ink'
          )}
        >
          {t('দ্রুত তৈরি', 'Quick Create')}
        </button>
        <button
          type="button"
          onClick={() => setMode('full_15q')}
          className={cn(
            'flex-1 min-h-[36px] rounded-[var(--radius-sm)] text-xs font-semibold cursor-pointer',
            mode === 'full_15q' ? 'bg-bg text-ink shadow-xs' : 'text-muted hover:text-ink'
          )}
        >
          {t('১৫-প্রশ্নের চুক্তিসহ', 'With 15-Question Contract')}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 font-medium">
          <span>{t('ব্যবসার নাম (বাংলা) *', 'Business Name (Bn) *')}</span>
          <input
            className={inputCls}
            value={businessNameBn}
            onChange={(e) => setBusinessNameBn(e.target.value)}
            required
            minLength={2}
          />
        </label>
        <label className="space-y-1 font-medium">
          <span>{t('ব্যবসার নাম (ইংরেজি)', 'Business Name (En)')}</span>
          <input
            className={inputCls}
            value={businessNameEn}
            onChange={(e) => setBusinessNameEn(e.target.value)}
          />
        </label>
        <label className="space-y-1 font-medium">
          <span>{t('মালিকের নাম *', 'Owner Name *')}</span>
          <input
            className={inputCls}
            value={ownerNameBn}
            onChange={(e) => setOwnerNameBn(e.target.value)}
            required
            minLength={2}
          />
        </label>
        <label className="space-y-1 font-medium">
          <span>{t('যোগাযোগ নম্বর *', 'Contact Phone *')}</span>
          <input
            className={cn(inputCls, 'font-mono')}
            inputMode="tel"
            placeholder="017XXXXXXXX"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            required
            minLength={11}
          />
        </label>
        <label className="space-y-1 font-medium">
          <span>{t('পেআউট মাধ্যম', 'Payout Method')}</span>
          <input
            className={inputCls}
            value={payoutMethodBn}
            onChange={(e) => setPayoutMethodBn(e.target.value)}
          />
        </label>
        <label className="space-y-1 font-medium">
          <span>{t('পেআউট অ্যাকাউন্ট', 'Payout Account')}</span>
          <input
            className={cn(inputCls, 'font-mono')}
            value={payoutAccountNo}
            onChange={(e) => setPayoutAccountNo(e.target.value)}
          />
        </label>
        <label className="space-y-1 font-medium">
          <span>{t('কমিশন (%)', 'Commission (%)')}</span>
          <input
            className={cn(inputCls, 'font-mono')}
            inputMode="decimal"
            value={commissionPct}
            onChange={(e) => setCommissionPct(e.target.value)}
          />
        </label>
        <label className="space-y-1 font-medium">
          <span>{t('এসক্রো হোল্ড (দিন)', 'Escrow Hold (days)')}</span>
          <input
            className={cn(inputCls, 'font-mono')}
            inputMode="numeric"
            value={holdDays}
            onChange={(e) => setHoldDays(e.target.value.replace(/\D/g, ''))}
          />
        </label>
      </div>

      {mode === 'full_15q' && (
        <div className="space-y-2.5 border-t border-border pt-3">
          <p className="font-semibold text-ink">
            {t('কনসাইনমেন্ট চুক্তির ১৫টি প্রশ্ন', '15-Question Consignment Agreement')}
          </p>
          <div className="space-y-2">
            {ONBOARDING_15Q.map((q) => (
              <label key={q.key} className="block space-y-1">
                <span className="text-[11px] text-muted">{q.questionBn}</span>
                <input
                  className={inputCls}
                  value={answers15[q.key] ?? ''}
                  onChange={(e) =>
                    setAnswers15((prev) => ({ ...prev, [q.key]: e.target.value }))
                  }
                  required
                />
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="flex items-center gap-2 pt-2">
        <Button type="submit" variant="primary" size="sm" isLoading={busy}>
          {t('ভেন্ডর তৈরি করুন', 'Create Vendor')}
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          {t('বাতিল', 'Cancel')}
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------------------
// MULTI-SUPPLIER OFFERS & ORDER SPLIT (Compact Collapsible Tool)
// ---------------------------------------------------------------------------

function MultiSupplierOffersSection({
  locale,
  vendors,
  productVariants,
  orders,
  supplierOffers,
  fulfillmentGroups,
  busyAction,
  onUpsertOffer,
  onSplitOrder,
}: {
  locale: 'bn' | 'en';
  vendors: VendorProfileRecord[];
  productVariants: Product360VariantDTO[];
  orders: Array<Partial<OrderGridRowDTO>>;
  supplierOffers: SupplierProductOfferRecord[];
  fulfillmentGroups: VendorFulfillmentGroupRecord[];
  busyAction: string | null;
  onUpsertOffer: (payload: Record<string, unknown>) => void;
  onSplitOrder: (payload: Record<string, unknown>) => void;
}) {
  const bn = locale === 'bn';
  const t = (b: string, e: string) => (bn ? b : e);
  const money = (p: number) => formatPoishaToBdt(p, locale);

  const [expanded, setExpanded] = React.useState(false);
  const [variantId, setVariantId] = React.useState(productVariants[0]?.variantId ?? '');
  const [vendorId, setVendorId] = React.useState(vendors[0]?.vendorId ?? '');
  const [internalSku, setInternalSku] = React.useState('');
  const [costBdt, setCostBdt] = React.useState('1500');
  const [profitBdt, setProfitBdt] = React.useState('200');
  const [rank, setRank] = React.useState('1');
  const [stock, setStock] = React.useState('10');

  const [splitOrderNo, setSplitOrderNo] = React.useState(orders[0]?.orderNo ?? '');
  const [splitPolicy, setSplitPolicy] = React.useState<
    'priority_rank' | 'lowest_payable_highest_margin' | 'highest_stock'
  >('priority_rank');

  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-bg">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left cursor-pointer hover:bg-surface/50"
      >
        <div className="flex items-center gap-2">
          <GitFork className="h-4 w-4 text-muted" aria-hidden="true" />
          <div>
            <p className="text-xs font-semibold text-ink">
              {t('মাল্টি-সাপ্লায়ার অফার ও অর্ডার স্প্লিট', 'Multi-Supplier Offers & Order Split')}
            </p>
            <p className="text-[11px] text-muted">
              {t(
                `${supplierOffers.length}টি অফার · ${fulfillmentGroups.length}টি ফুলফিলমেন্ট গ্রুপ`,
                `${supplierOffers.length} offers · ${fulfillmentGroups.length} fulfillment groups`
              )}
            </p>
          </div>
        </div>
        <ChevronRight
          className={cn('h-4 w-4 text-muted transition-transform', expanded && 'rotate-90')}
          aria-hidden="true"
        />
      </button>

      {expanded && (
        <div className="grid gap-5 border-t border-border p-4 lg:grid-cols-2 text-xs">
          {/* Left: Offers */}
          <div className="space-y-3">
            <h4 className="font-semibold text-ink">
              {t('সাপ্লায়ার অফার অ্যালোকেশন', 'Supplier Offer Allocation')}
            </h4>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                onUpsertOffer({
                  variantId,
                  vendorId,
                  internalVendorSku: internalSku.trim() || `SKU-${Date.now()}`,
                  supplierCostPoisha: Math.round((Number(costBdt) || 0) * 100),
                  supplierProfitPoisha: Math.round((Number(profitBdt) || 0) * 100),
                  priorityRank: Math.max(1, Number(rank) || 1),
                  stockAvailable: Math.max(0, Number(stock) || 0),
                });
              }}
              className="grid gap-2 sm:grid-cols-2"
            >
              <select
                className={inputCls}
                value={variantId}
                onChange={(e) => setVariantId(e.target.value)}
              >
                {productVariants.map((v) => (
                  <option key={v.variantId} value={v.variantId}>
                    {v.publicSku} — {localizedField(v, 'productNameBn', locale)}
                  </option>
                ))}
              </select>
              <select
                className={inputCls}
                value={vendorId}
                onChange={(e) => setVendorId(e.target.value)}
              >
                {vendors.map((v) => (
                  <option key={v.vendorId} value={v.vendorId}>
                    {v.vendorCode} — {localizedField(v, 'businessNameBn', locale)}
                  </option>
                ))}
              </select>
              <input
                className={cn(inputCls, 'font-mono')}
                placeholder={t('ইন্টারনাল SKU', 'Internal SKU')}
                value={internalSku}
                onChange={(e) => setInternalSku(e.target.value)}
              />
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  className={cn(inputCls, 'font-mono')}
                  placeholder={t('কস্ট ৳', 'Cost ৳')}
                  value={costBdt}
                  onChange={(e) => setCostBdt(e.target.value)}
                />
                <input
                  type="number"
                  className={cn(inputCls, 'font-mono')}
                  placeholder={t('লাভ ৳', 'Profit ৳')}
                  value={profitBdt}
                  onChange={(e) => setProfitBdt(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <input
                  type="number"
                  min={1}
                  className={cn(inputCls, 'font-mono')}
                  placeholder={t('র‍্যাংক', 'Rank')}
                  value={rank}
                  onChange={(e) => setRank(e.target.value)}
                />
                <input
                  type="number"
                  min={0}
                  className={cn(inputCls, 'font-mono')}
                  placeholder={t('স্টক', 'Stock')}
                  value={stock}
                  onChange={(e) => setStock(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                variant="primary"
                size="sm"
                isLoading={busyAction === 'upsert-offer'}
              >
                {t('অফার সংরক্ষণ', 'Save Offer')}
              </Button>
            </form>

            {supplierOffers.length > 0 && (
              <div className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
                {supplierOffers.map((o) => (
                  <div key={o.offerId} className="p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-medium text-ink truncate">
                        #{o.priorityRank} · {o.vendorCode} · {o.publicSku}
                      </p>
                      <p className="text-[11px] text-muted truncate">
                        {localizedField(o, 'productNameBn', locale)}
                      </p>
                    </div>
                    <span className="font-mono text-[11px] tabular-nums shrink-0 text-ink">
                      {money(o.supplierPayablePoisha)} · {o.stockAvailable} pcs
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Fulfillment Split */}
          <div className="space-y-3">
            <h4 className="font-semibold text-ink">
              {t('অর্ডার ফুলফিলমেন্ট স্প্লিট', 'Order Fulfillment Split')}
            </h4>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!splitOrderNo.trim()) return;
                onSplitOrder({
                  orderNo: splitOrderNo.trim(),
                  allocationPolicy: splitPolicy,
                });
              }}
              className="grid gap-2 sm:grid-cols-3"
            >
              <input
                className={cn(inputCls, 'font-mono')}
                placeholder="ORD-..."
                value={splitOrderNo}
                onChange={(e) => setSplitOrderNo(e.target.value)}
              />
              <select
                className={inputCls}
                value={splitPolicy}
                onChange={(e) =>
                  setSplitPolicy(
                    e.target.value as
                      | 'priority_rank'
                      | 'lowest_payable_highest_margin'
                      | 'highest_stock'
                  )
                }
              >
                <option value="priority_rank">{t('অগ্রাধিকার র‍্যাংক', 'Priority Rank')}</option>
                <option value="lowest_payable_highest_margin">
                  {t('সর্বোচ্চ মার্জিন', 'Highest Margin')}
                </option>
                <option value="highest_stock">{t('সর্বোচ্চ স্টক', 'Highest Stock')}</option>
              </select>
              <Button
                type="submit"
                variant="outline"
                size="sm"
                isLoading={busyAction === 'split-order'}
              >
                {t('অর্ডার স্প্লিট', 'Split Order')}
              </Button>
            </form>

            {fulfillmentGroups.length > 0 && (
              <div className="divide-y divide-border rounded-[var(--radius-sm)] border border-border">
                {fulfillmentGroups.map((fg) => (
                  <div key={fg.groupId} className="p-2.5 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-mono font-medium text-ink">
                        {fg.groupCode} · {fg.orderNo}
                      </p>
                      <p className="text-[11px] text-muted">
                        {fg.vendorCode} · {fg.totalUnits} pcs
                      </p>
                    </div>
                    <span className="font-mono text-[11px] tabular-nums shrink-0 text-ink">
                      {money(fg.groupSupplierPayablePoisha)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default VendorsHubPanel;
