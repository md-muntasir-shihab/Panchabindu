'use client';

// src/components/admin/vendor-payout-register-panel.tsx
// ADMIN → VENDOR PAYOUT REGISTER
// Answers the question this screen exists for: "কে কত টাকা পেল, কে এখনো
// পায়নি, আর কোন মাধ্যম দিয়ে গেল?" — with the full detail behind every number.
//
//   1. Totals        — disbursed, outstanding, rejected, fees, escrow still held
//   2. Vendor roll-up— per-vendor paid / outstanding / withdrawable
//   3. Register      — searchable, filterable list with a per-payout detail drawer
//   4. Lifecycle     — create → approve → mark paid (TrxID) or reject (release)
//
// All money movement is server-side; this panel never computes a balance.

import * as React from 'react';
import {
  AlertTriangle,
  BadgeCheck,
  Banknote,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileCheck2,
  Filter,
  RefreshCw,
  Search,
  ShieldAlert,
  Wallet,
  XCircle,
} from 'lucide-react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import { formatPoishaToBdt } from '@/lib/money';
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type {
  AdminPayoutStatus,
  AdminVendorPayoutRegisterDTO,
  AdminVendorPayoutRowDTO,
} from '@/lib/vendor/vendor-types';

type Locale = 'bn' | 'en';
type StatusFilter = 'all' | AdminPayoutStatus;

interface Props {
  locale?: Locale;
  onNotify?: (message: string, tone?: 'success' | 'error') => void;
}

const STATUS_META: Record<AdminPayoutStatus, { bn: string; en: string; tone: 'warning' | 'info' | 'danger' | 'success' }> = {
  requested: { bn: 'অনুরোধকৃত', en: 'Requested', tone: 'warning' },
  approved: { bn: 'অনুমোদিত', en: 'Approved', tone: 'info' },
  rejected: { bn: 'বাতিল', en: 'Rejected', tone: 'danger' },
  paid: { bn: 'পরিশোধিত', en: 'Paid', tone: 'success' },
};

const inputCls =
  'w-full min-h-[44px] px-3 py-2 text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)] focus:outline-2 focus:outline-offset-0 focus:outline-ink';

function parseTaka(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
  return Math.round(Number(trimmed) * 100);
}

function fmtDate(iso: string | null, locale: Locale): string {
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

export function VendorPayoutRegisterPanel({ locale = 'bn', onNotify }: Props) {
  const t = React.useCallback(
    (bn: string, en: string) => (locale === 'bn' ? bn : en),
    [locale]
  );

  const [data, setData] = React.useState<AdminVendorPayoutRegisterDTO | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>('all');
  const [vendorFilter, setVendorFilter] = React.useState<string>('all');
  const [search, setSearch] = React.useState('');
  const [openPayoutId, setOpenPayoutId] = React.useState<string | null>(null);

  // Per-row settlement inputs, kept separate so typing in one row cannot
  // overwrite another row's TrxID.
  const [trxDraft, setTrxDraft] = React.useState<Record<string, string>>({});
  const [reasonDraft, setReasonDraft] = React.useState<Record<string, string>>({});
  const [overrideDraft, setOverrideDraft] = React.useState<Record<string, string>>({});

  const [showCreate, setShowCreate] = React.useState(false);
  const [createVendorId, setCreateVendorId] = React.useState('');
  const [createAmount, setCreateAmount] = React.useState('');
  const [createError, setCreateError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/vendor-payouts');
      const payload = (await res.json()) as AdminVendorPayoutRegisterDTO;
      if (!res.ok || !payload.success) {
        setError(payload.errorBn ?? t('পেআউট তালিকা লোড করা যায়নি।', 'Could not load the payout register.'));
        setData(null);
        return;
      }
      setData(payload);
    } catch {
      setError(t('নেটওয়ার্ক ত্রুটি। আবার চেষ্টা করুন।', 'Network error. Please retry.'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const rows = data?.rows ?? [];

  const filtered = React.useMemo(() => {
    const needle = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (statusFilter !== 'all' && row.status !== statusFilter) return false;
      if (vendorFilter !== 'all' && row.vendorId !== vendorFilter) return false;
      if (!needle) return true;
      return [row.payoutId, row.vendorCode, row.vendorNameBn, row.paymentTrxId ?? '', row.requestedByUsername]
        .join(' ')
        .toLowerCase()
        .includes(needle);
    });
  }, [rows, statusFilter, vendorFilter, search]);

  const filteredTotal = filtered.reduce((total, row) => total + row.requestedAmountPoisha, 0);

  const post = React.useCallback(
    async (body: Record<string, unknown>, successMessage: string) => {
      setBusy(true);
      try {
        const res = await fetch('/api/admin/vendor-payouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const payload = (await res.json()) as { success?: boolean; errorBn?: string };
        if (!res.ok || !payload.success) {
          onNotify?.(payload.errorBn ?? t('কাজটি সম্পন্ন হয়নি।', 'The action did not complete.'), 'error');
          return false;
        }
        onNotify?.(successMessage, 'success');
        await load();
        return true;
      } catch {
        onNotify?.(t('নেটওয়ার্ক ত্রুটি।', 'Network error.'), 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [load, onNotify, t]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card surface="bg" padding="md" className="space-y-3">
        <div className="flex items-center gap-2 text-sm text-danger">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <span>{error ?? t('তথ্য পাওয়া যায়নি।', 'No data available.')}</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
          {t('আবার চেষ্টা করুন', 'Retry')}
        </Button>
      </Card>
    );
  }

  const totals = data.totals;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-ink">
            <Banknote className="h-4 w-4" aria-hidden="true" />
            {t('ভেন্ডর পেআউট রেজিস্টার', 'Vendor Payout Register')}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {t(
              'কে কত টাকা পেয়েছে, কে এখনো পায়নি এবং কোন মাধ্যমে গেছে — প্রতিটি ভেন্ডর পেআউটের পূর্ণ হিসাব।',
              'Who was paid what, who is still owed, and through which channel — the full account of every vendor payout.'
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void load()} leftIcon={<RefreshCw className="h-3.5 w-3.5" />}>
            {t('রিফ্রেশ', 'Refresh')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => {
              setShowCreate((open) => !open);
              setCreateError(null);
            }}
          >
            {t('নতুন পেআউট', 'New payout')}
          </Button>
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Card surface="bg" padding="sm">
          <p className="text-[11px] font-semibold text-muted">{t('মোট পরিশোধিত', 'Total disbursed')}</p>
          <p className="mt-1 font-mono text-lg font-bold text-success">
            {formatPoishaToBdt(totals.totalDisbursedPoisha, locale)}
          </p>
          <p className="text-[11px] text-muted">{t(`${totals.paidCount} টি পেআউট`, `${totals.paidCount} payouts`)}</p>
        </Card>
        <Card surface="bg" padding="sm">
          <p className="text-[11px] font-semibold text-muted">{t('বাকি / অনিষ্পন্ন', 'Outstanding')}</p>
          <p className="mt-1 font-mono text-lg font-bold text-warning">
            {formatPoishaToBdt(totals.totalOutstandingPoisha, locale)}
          </p>
          <p className="text-[11px] text-muted">
            {t(
              `${totals.requestedCount} অনুরোধকৃত · ${totals.approvedCount} অনুমোদিত`,
              `${totals.requestedCount} requested · ${totals.approvedCount} approved`
            )}
          </p>
        </Card>
        <Card surface="bg" padding="sm">
          <p className="text-[11px] font-semibold text-muted">{t('ক্যাশ-আউট চার্জ (আনুমানিক)', 'Cash-out fees (est.)')}</p>
          <p className="mt-1 font-mono text-lg font-bold text-danger">
            -{formatPoishaToBdt(totals.estimatedFeePoisha, locale)}
          </p>
          <p className="text-[11px] text-muted">{t('পরিশোধিত পেআউটের উপর ১.৮৫%', '1.85% on paid payouts')}</p>
        </Card>
        <Card surface="bg" padding="sm">
          <p className="text-[11px] font-semibold text-muted">{t('এসক্রোতে আটকে আছে', 'Held in escrow')}</p>
          <p className="mt-1 font-mono text-lg font-bold text-ink">
            {formatPoishaToBdt(totals.escrowHeldPoisha, locale)}
          </p>
          <p className="text-[11px] text-muted">{t('মেয়াদপূর্তির অপেক্ষায়', 'Awaiting maturity')}</p>
        </Card>
      </div>

      {/* Create payout */}
      {showCreate && (
        <Card surface="bg" padding="md" className="space-y-3">
          <h3 className="flex items-center gap-2 text-sm font-bold text-ink">
            <Wallet className="h-4 w-4" aria-hidden="true" />
            {t('ভেন্ডরের পক্ষে পেআউট তৈরি করুন', 'Create a payout on a vendor’s behalf')}
          </h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-ink">{t('ভেন্ডর', 'Vendor')}</span>
              <select
                className={inputCls}
                value={createVendorId}
                onChange={(e) => setCreateVendorId(e.target.value)}
              >
                <option value="">{t('— নির্বাচন করুন —', '— select —')}</option>
                {data.vendorRollups.map((vendor) => (
                  <option key={vendor.vendorId} value={vendor.vendorId}>
                    {vendor.vendorCode} · {vendor.vendorNameBn} ({formatPoishaToBdt(vendor.balance.withdrawablePoisha, locale)})
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-semibold text-ink">{t('পরিমাণ (৳)', 'Amount (৳)')}</span>
              <input
                className={cn(inputCls, 'font-mono')}
                inputMode="decimal"
                placeholder="1000"
                value={createAmount}
                onChange={(e) => setCreateAmount(e.target.value)}
              />
            </label>
          </div>
          {(() => {
            const selected = data.vendorRollups.find((v) => v.vendorId === createVendorId);
            const amount = parseTaka(createAmount);
            return (
              <div className="space-y-2 text-[11px]">
                {selected && (
                  <p className="text-muted">
                    {t('উত্তোলনযোগ্য:', 'Withdrawable:')}{' '}
                    <strong className="font-mono text-ink">
                      {formatPoishaToBdt(selected.balance.withdrawablePoisha, locale)}
                    </strong>
                    {' · '}
                    {t('সর্বনিম্ন:', 'Minimum:')}{' '}
                    <strong className="font-mono text-ink">
                      {formatPoishaToBdt(data.minPayoutRequestPoisha, locale)}
                    </strong>
                  </p>
                )}
                {amount !== null && amount > 0 && (
                  <p className="text-muted">
                    {t('নিট প্রদেয় (১.৮৫% বাদে):', 'Net payable (after 1.85%):')}{' '}
                    <strong className="font-mono text-success">
                      {formatPoishaToBdt(amount - Math.round((amount * 185) / 10000), locale)}
                    </strong>
                  </p>
                )}
                {createError && (
                  <p className="flex items-center gap-1 text-danger">
                    <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                    {createError}
                  </p>
                )}
                <div className="flex gap-2">
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
                      const amount = parseTaka(createAmount);
                      if (amount === null || amount <= 0) {
                        setCreateError(t('সঠিক পরিমাণ লিখুন (যেমন ১০০০.৫০)।', 'Enter a valid amount (e.g. 1000.50).'));
                        return;
                      }
                      if (amount < data.minPayoutRequestPoisha) {
                        setCreateError(
                          t(
                            `সর্বনিম্ন পেআউট ${formatPoishaToBdt(data.minPayoutRequestPoisha, locale)}।`,
                            `Minimum payout is ${formatPoishaToBdt(data.minPayoutRequestPoisha, locale)}.`
                          )
                        );
                        return;
                      }
                      const ok = await post(
                        { operation: 'create_payout', vendorId: createVendorId, requestedAmountPoisha: amount },
                        t('পেআউট অনুরোধ তৈরি হয়েছে এবং টাকা হোল্ড করা হয়েছে।', 'Payout created and funds held.')
                      );
                      if (ok) {
                        setShowCreate(false);
                        setCreateAmount('');
                      }
                    }}
                  >
                    {t('অনুরোধ তৈরি করুন', 'Create request')}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setShowCreate(false)}>
                    {t('বাতিল', 'Cancel')}
                  </Button>
                </div>
              </div>
            );
          })()}
        </Card>
      )}

      {/* Vendor roll-up */}
      <Card surface="bg" padding="md" className="space-y-2">
        <h3 className="text-sm font-bold text-ink">{t('ভেন্ডর অনুযায়ী হিসাব', 'Per-vendor account')}</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-xs">
            <thead>
              <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted">
                <th className="py-1.5 pr-2 font-semibold">{t('ভেন্ডর', 'Vendor')}</th>
                <th className="py-1.5 pr-2 text-right font-semibold">{t('পরিশোধিত', 'Paid')}</th>
                <th className="py-1.5 pr-2 text-right font-semibold">{t('বাকি', 'Outstanding')}</th>
                <th className="py-1.5 pr-2 text-right font-semibold">{t('উত্তোলনযোগ্য', 'Withdrawable')}</th>
                <th className="py-1.5 text-right font-semibold">{t('সর্বশেষ পেমেন্ট', 'Last paid')}</th>
              </tr>
            </thead>
            <tbody>
              {data.vendorRollups.map((vendor) => (
                <tr
                  key={vendor.vendorId}
                  className="cursor-pointer border-b border-border/60 hover:bg-bg/60"
                  onClick={() =>
                    setVendorFilter((current) => (current === vendor.vendorId ? 'all' : vendor.vendorId))
                  }
                >
                  <td className="py-1.5 pr-2">
                    <span className="font-mono text-[11px] text-muted">{vendor.vendorCode}</span>{' '}
                    <strong className="text-ink">{vendor.vendorNameBn}</strong>
                    {vendorFilter === vendor.vendorId && (
                      <Badge status="info" className="ml-1">
                        {t('ফিল্টার', 'filter')}
                      </Badge>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-success">
                    {formatPoishaToBdt(vendor.paidPoisha, locale)}
                    <span className="ml-1 text-[10px] text-muted">({vendor.paidCount})</span>
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-warning">
                    {formatPoishaToBdt(vendor.outstandingPoisha, locale)}
                  </td>
                  <td className="py-1.5 pr-2 text-right font-mono text-ink">
                    {formatPoishaToBdt(vendor.balance.withdrawablePoisha, locale)}
                  </td>
                  <td className="py-1.5 text-right text-muted">{fmtDate(vendor.lastPaidAt, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data.methodTotals.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-border pt-2">
            {data.methodTotals.map((method) => (
              <Badge key={method.payoutMethodBn} status="neutral">
                {method.payoutMethodBn}: {formatPoishaToBdt(method.paidPoisha, locale)} ({method.count})
              </Badge>
            ))}
          </div>
        )}
      </Card>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            className={cn(inputCls, 'pl-9')}
            placeholder={t('পেআউট আইডি, ভেন্ডর বা TrxID খুঁজুন', 'Search payout id, vendor or TrxID')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1">
          <Filter className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
          {(['all', 'requested', 'approved', 'paid', 'rejected'] as StatusFilter[]).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setStatusFilter(status)}
              className={cn(
                'min-h-[36px] rounded-[var(--radius-sm)] border px-2.5 text-[11px] font-semibold transition-colors',
                statusFilter === status
                  ? 'border-ink bg-ink text-bg'
                  : 'border-border bg-bg text-ink hover:border-ink'
              )}
            >
              {status === 'all' ? t('সব', 'All') : t(STATUS_META[status].bn, STATUS_META[status].en)}
              {status !== 'all' && (
                <span className="ml-1 font-mono text-[10px] opacity-70">
                  {rows.filter((row) => row.status === status).length}
                </span>
              )}
            </button>
          ))}
        </div>
        {vendorFilter !== 'all' && (
          <Button variant="outline" size="sm" onClick={() => setVendorFilter('all')}>
            {t('ভেন্ডর ফিল্টার সরান', 'Clear vendor filter')}
          </Button>
        )}
      </div>

      {/* Register list */}
      <Card surface="bg" padding="md" className="space-y-2">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h3 className="text-sm font-bold text-ink">{t('পেআউট তালিকা', 'Payout list')}</h3>
          <span className="font-mono text-[11px] text-muted">
            {filtered.length}/{rows.length} · {formatPoishaToBdt(filteredTotal, locale)}
          </span>
        </div>

        {filtered.length === 0 ? (
          <EmptyState
            title={t('কোনো পেআউট পাওয়া যায়নি', 'No payouts found')}
            description={t(
              'এই ফিল্টারে কোনো পেআউট নেই। ভেন্ডর প্যানেল থেকে অনুরোধ এলে অথবা এখান থেকে নতুন পেআউট তৈরি করলে তালিকায় দেখা যাবে।',
              'No payouts match this filter. They appear here once a vendor requests one or you create one.'
            )}
          />
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((row) => {
              const meta = STATUS_META[row.status];
              const open = openPayoutId === row.payoutId;
              return (
                <div key={row.payoutId} className="py-2.5">
                  <button
                    type="button"
                    onClick={() => setOpenPayoutId(open ? null : row.payoutId)}
                    className="flex w-full items-center justify-between gap-2 text-left"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {open ? (
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-xs font-bold text-ink">
                          <span className="font-mono">{row.vendorCode}</span> · {row.vendorNameBn}
                        </p>
                        <p className="truncate font-mono text-[10px] text-muted">
                          {row.payoutId} · {fmtDate(row.requestedAt, locale)}
                          {row.paymentTrxId ? ` · TrxID ${row.paymentTrxId}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge status={meta.tone}>{t(meta.bn, meta.en)}</Badge>
                      <span className="font-mono text-sm font-bold text-ink">
                        {formatPoishaToBdt(row.requestedAmountPoisha, locale)}
                      </span>
                    </div>
                  </button>

                  {open && (
                    <PayoutDetail
                      row={row}
                      locale={locale}
                      t={t}
                      busy={busy}
                      trxDraft={trxDraft[row.payoutId] ?? ''}
                      reasonDraft={reasonDraft[row.payoutId] ?? ''}
                      overrideDraft={overrideDraft[row.payoutId] ?? ''}
                      onTrx={(value) => setTrxDraft((d) => ({ ...d, [row.payoutId]: value }))}
                      onReason={(value) => setReasonDraft((d) => ({ ...d, [row.payoutId]: value }))}
                      onOverride={(value) => setOverrideDraft((d) => ({ ...d, [row.payoutId]: value }))}
                      onAction={(decision) =>
                        void post(
                          {
                            operation: 'resolve_payout',
                            payoutId: row.payoutId,
                            decision,
                            paymentTrxId:
                              decision === 'mark_paid' ? (trxDraft[row.payoutId] ?? '').trim() : undefined,
                            rejectionReasonBn:
                              decision === 'reject' ? (reasonDraft[row.payoutId] ?? '').trim() : undefined,
                            selfApprovalOverrideReasonBn:
                              (overrideDraft[row.payoutId] ?? '').trim() || undefined,
                          },
                          decision === 'approve'
                            ? t('পেআউট অনুমোদিত হয়েছে।', 'Payout approved.')
                            : decision === 'mark_paid'
                              ? t('পেআউট পরিশোধিত হিসেবে চিহ্নিত হয়েছে।', 'Payout marked as paid.')
                              : t('পেআউট বাতিল, টাকা ভেন্ডরের ব্যালেন্সে ফেরত দেওয়া হয়েছে।', 'Payout rejected and funds returned.')
                        )
                      }
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}

interface PayoutDetailProps {
  row: AdminVendorPayoutRowDTO;
  locale: Locale;
  t: (bn: string, en: string) => string;
  busy: boolean;
  trxDraft: string;
  reasonDraft: string;
  overrideDraft: string;
  onTrx: (value: string) => void;
  onReason: (value: string) => void;
  onOverride: (value: string) => void;
  onAction: (decision: 'approve' | 'reject' | 'mark_paid') => void;
}

function PayoutDetail({
  row,
  locale,
  t,
  busy,
  trxDraft,
  reasonDraft,
  overrideDraft,
  onTrx,
  onReason,
  onOverride,
  onAction,
}: PayoutDetailProps) {
  return (
    <div className="mt-2 space-y-2 rounded-[var(--radius-md)] border border-border bg-bg p-2.5">
      {/* Money breakdown */}
      <div className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-4">
        <div>
          <p className="text-muted">{t('অনুরোধকৃত', 'Requested')}</p>
          <p className="font-mono font-bold text-ink">{formatPoishaToBdt(row.requestedAmountPoisha, locale)}</p>
        </div>
        <div>
          <p className="text-muted">{t('চার্জ (১.৮৫%)', 'Fee (1.85%)')}</p>
          <p className="font-mono font-bold text-danger">-{formatPoishaToBdt(row.estimatedFeePoisha, locale)}</p>
        </div>
        <div>
          <p className="text-muted">{t('নিট প্রদেয়', 'Net payable')}</p>
          <p className="font-mono font-bold text-success">{formatPoishaToBdt(row.netPayablePoisha, locale)}</p>
        </div>
        <div>
          <p className="text-muted">{t('মাধ্যম / অ্যাকাউন্ট', 'Channel / account')}</p>
          <p className="font-mono font-bold text-ink">
            {row.payoutMethodBn} · {row.payoutAccountMasked}
          </p>
        </div>
      </div>

      {/* Attribution */}
      <div className="grid gap-1 border-t border-border pt-2 text-[11px] text-muted sm:grid-cols-2">
        <p>
          {t('অনুরোধ করেছেন:', 'Requested by:')}{' '}
          <strong className="text-ink">{row.requestedByUsername}</strong> · {fmtDate(row.requestedAt, locale)}
        </p>
        <p>
          {t('অনুমোদন:', 'Approved by:')} <strong className="text-ink">{row.approvedByUsername ?? '—'}</strong>
          {' · '}
          {t('পরিশোধ:', 'Paid by:')} <strong className="text-ink">{row.paidByUsername ?? '—'}</strong>
        </p>
      </div>

      {row.rejectionReasonBn && (
        <p className="flex items-start gap-1 rounded-[var(--radius-sm)] border border-danger/40 bg-danger/5 p-2 text-[11px] text-danger">
          <XCircle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
          <span>
            <strong>{t('বাতিলের কারণ:', 'Rejection reason:')}</strong> {row.rejectionReasonBn}
          </span>
        </p>
      )}

      {row.proofUrl && row.status === 'paid' && (
        <p className="flex items-center gap-1 text-[11px] text-muted">
          <FileCheck2 className="h-3 w-3" aria-hidden="true" />
          <a href={row.proofUrl} target="_blank" rel="noreferrer" className="underline">
            {t('পেমেন্ট প্রমাণ দেখুন', 'View payment proof')}
          </a>
        </p>
      )}

      {/* Timeline */}
      {row.timeline.length > 0 && (
        <ol className="space-y-1 border-t border-border pt-2">
          {row.timeline.map((event, index) => (
            <li key={`${event.at}-${index}`} className="flex items-start gap-1.5 text-[11px]">
              <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden="true" />
              <span className="text-ink">{t(event.eventBn, event.eventEn)}</span>
              <span className="text-muted">
                · {event.actor ?? '—'} · {fmtDate(event.at, locale)}
              </span>
            </li>
          ))}
        </ol>
      )}

      {/* Actions */}
      {(row.status === 'requested' || row.status === 'approved') && (
        <div className="space-y-2 border-t border-border pt-2">
          {row.blocksCurrentUser && (
            <p className="flex items-start gap-1 rounded-[var(--radius-sm)] border border-warning/50 bg-warning/10 p-2 text-[11px] text-ink">
              <ShieldAlert className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
              <span>
                {t(
                  'এই পেআউট অনুরোধ আপনি নিজেই তৈরি করেছেন। মেকার-চেকার নীতি অনুযায়ী অনুমোদন/পরিশোধ করতে অন্য অ্যাডমিন লাগবে — অথবা জরুরি ক্ষেত্রে নিচে কারণ লিখে ওভাররাইড করুন।',
                  'You raised this payout yourself. Maker-checker blocks self-approval; either have another admin settle it, or record an explicit override reason below.'
                )}
              </span>
            </p>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            {row.status === 'requested' && (
              <Button
                variant="primary"
                size="sm"
                isLoading={busy}
                disabled={row.blocksCurrentUser && overrideDraft.trim().length < 5}
                onClick={() => onAction('approve')}
                leftIcon={<BadgeCheck className="h-3.5 w-3.5" />}
              >
                {t('অনুমোদন করুন', 'Approve')}
              </Button>
            )}
            {row.status === 'approved' && (
              <div className="space-y-1.5">
                <input
                  className={cn(inputCls, 'font-mono text-xs')}
                  placeholder={t('বিকাশ/ব্যাংক TrxID *', 'bKash/bank TrxID *')}
                  value={trxDraft}
                  onChange={(e) => onTrx(e.target.value)}
                />
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  isLoading={busy}
                  disabled={!trxDraft.trim() || (row.blocksCurrentUser && overrideDraft.trim().length < 5)}
                  onClick={() => onAction('mark_paid')}
                  leftIcon={<CheckCircle2 className="h-3.5 w-3.5" />}
                >
                  {t('পরিশোধিত চিহ্নিত করুন', 'Mark as paid')}
                </Button>
              </div>
            )}
            <div className="space-y-1.5">
              <input
                className={cn(inputCls, 'text-xs')}
                placeholder={t('বাতিলের কারণ (আবশ্যক)', 'Rejection reason (required)')}
                value={reasonDraft}
                onChange={(e) => onReason(e.target.value)}
              />
              <Button
                variant="danger"
                size="sm"
                className="w-full"
                isLoading={busy}
                disabled={reasonDraft.trim().length < 3}
                onClick={() => onAction('reject')}
                leftIcon={<XCircle className="h-3.5 w-3.5" />}
              >
                {t('বাতিল ও টাকা ফেরত', 'Reject & release funds')}
              </Button>
            </div>
          </div>

          {row.blocksCurrentUser && (
            <input
              className={cn(inputCls, 'text-xs')}
              placeholder={t(
                'জরুরি ওভাররাইডের কারণ (কমপক্ষে ৫ অক্ষর) — অডিট লগে সংরক্ষিত হবে',
                'Emergency override reason (min 5 chars) — written to the audit log'
              )}
              value={overrideDraft}
              onChange={(e) => onOverride(e.target.value)}
            />
          )}
        </div>
      )}

      {row.status === 'paid' && (
        <p className="flex items-center gap-1 text-[11px] text-success">
          <Clock className="h-3 w-3" aria-hidden="true" />
          {t('পরিশোধ সম্পন্ন:', 'Settled:')} {fmtDate(row.resolvedAt, locale)}
        </p>
      )}
    </div>
  );
}

export default VendorPayoutRegisterPanel;
