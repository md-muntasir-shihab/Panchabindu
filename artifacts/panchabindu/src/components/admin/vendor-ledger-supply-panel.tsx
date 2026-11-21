'use client';

/**
 * Admin → Vendors Hub → "হিসাব ও সরবরাহ" (Money & Supply).
 *
 * Answers the two questions the hub could not answer before:
 *   1. কোন ভেন্ডর কবে কত টাকা পেল / পাবে — মাসিক ক্রেডিট, পরিশোধিত পেআউট ও বর্তমান পাওনা।
 *   2. কোন প্রোডাক্টের মাল পেয়েছি আর কোনটা এখনো পাইনি — চালানভিত্তিক পাঠানো/গৃহীত/রিজেক্ট/বাকি পিস,
 *      বাকি মালের টাকার অঙ্ক ও কত দিন ধরে অপেক্ষা করছে।
 *
 * Both variants (the sub-tab and the per-vendor drawer) use the same aggregation from
 * `vendor-ledger-summary.ts`, so the numbers cannot disagree.
 */

import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Banknote,
  CheckCircle2,
  Clock3,
  Coins,
  PackageCheck,
  PackageX,
  Truck,
  Wallet,
} from 'lucide-react';
import { Badge, EmptyState } from '@/components/ui/primitives';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { cn } from '@/lib/utils';
import { PAYOUT_STATUS_LABELS } from './dashboard-summary';
import {
  SUPPLY_STATE_LABELS,
  sortVendorMoneyRows,
  summarizeVendorLedger,
  type LotLike,
  type LedgerEntryLike,
  type PayoutLike,
  type SupplyLotRow,
  type VendorBalanceLike,
  type VendorMoneyRow,
  type VendorMoneySortKey,
  type VendorProfileLike,
} from './vendor-ledger-summary';

export interface VendorLedgerSupplyPanelProps {
  locale: 'bn' | 'en';
  vendors: Array<{ profile: VendorProfileLike; balance?: VendorBalanceLike }>;
  ledgerEntries: LedgerEntryLike[];
  payoutRequests: PayoutLike[];
  lots: LotLike[];
  /** 'hub' shows every vendor and the vendor table; 'vendor' is the 360° drawer view. */
  variant?: 'hub' | 'vendor';
  vendorId?: string;
  onOpenVendor?: (vendorId: string) => void;
  onViewPayouts?: (vendorId: string) => void;
}

const SUPPLY_FILTERS = ['all', 'not_received', 'partial', 'received', 'rejected'] as const;
type SupplyFilter = (typeof SUPPLY_FILTERS)[number];

function useCountUp(value: number, durationMs = 620): number {
  const reduced = useReducedMotion();
  const [display, setDisplay] = React.useState(value);
  const fromRef = React.useRef(value);
  React.useEffect(() => {
    if (reduced) {
      fromRef.current = value;
      setDisplay(value);
      return undefined;
    }
    const from = fromRef.current;
    if (from === value) return undefined;
    const started = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / durationMs);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(from + (value - from) * eased);
      if (progress < 1) frame = requestAnimationFrame(tick);
      else fromRef.current = value;
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, durationMs, reduced]);
  return display;
}

function AnimatedMoney({ value, locale, className }: { value: number; locale: 'bn' | 'en'; className?: string }) {
  const animated = useCountUp(value);
  return <span className={cn('font-mono tabular-nums', className)}>{formatPoishaToBdt(Math.round(animated) || 0, locale)}</span>;
}

function AnimatedCount({ value, locale, className }: { value: number; locale: 'bn' | 'en'; className?: string }) {
  const animated = useCountUp(value);
  return <span className={cn('font-mono tabular-nums', className)}>{formatLocaleNumber(Math.round(animated), locale)}</span>;
}

function fmtDate(value: string | null | undefined, locale: 'bn' | 'en'): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
  }).format(date);
}

function monthLabel(key: string, locale: 'bn' | 'en'): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', { month: 'short' }).format(
    new Date(year, month - 1, 1),
  );
}

function stateBadgeStatus(state: SupplyLotRow['state']): 'success' | 'warning' | 'danger' | 'info' {
  switch (state) {
    case 'received':
      return 'success';
    case 'partial':
      return 'warning';
    default:
      return 'danger';
  }
}

export function VendorLedgerSupplyPanel({
  locale,
  vendors,
  ledgerEntries,
  payoutRequests,
  lots,
  variant = 'hub',
  vendorId,
  onOpenVendor,
  onViewPayouts,
}: VendorLedgerSupplyPanelProps) {
  const bn = locale === 'bn';
  const t = React.useCallback((b: string, e: string) => (bn ? b : e), [bn]);
  const reduced = useReducedMotion();
  const [monthCount, setMonthCount] = React.useState<6 | 12>(6);
  const [sortKey, setSortKey] = React.useState<VendorMoneySortKey>('credited');
  const [supplyFilter, setSupplyFilter] = React.useState<SupplyFilter>('all');
  const [vendorFilter, setVendorFilter] = React.useState('');
  const [showAllLots, setShowAllLots] = React.useState(false);

  const activeVendorId = vendorId ?? (variant === 'hub' ? vendorFilter : '');

  const report = React.useMemo(
    () =>
      summarizeVendorLedger({
        vendors,
        ledger: ledgerEntries,
        payouts: payoutRequests,
        lots,
        monthCount,
        vendorId: activeVendorId || undefined,
      }),
    [vendors, ledgerEntries, payoutRequests, lots, monthCount, activeVendorId],
  );

  const sortedVendors = React.useMemo(
    () => sortVendorMoneyRows(report.vendors, sortKey),
    [report.vendors, sortKey],
  );

  const supplyRows = React.useMemo(
    () => report.lots.filter((row) => supplyFilter === 'all' || row.state === supplyFilter),
    [report.lots, supplyFilter],
  );

  const visibleLots = showAllLots ? supplyRows : supplyRows.slice(0, 12);
  const moneyMax = Math.max(1, ...report.months.flatMap((month) => [month.creditedPoisha, month.paidPoisha]));

  const pendingPayoutAmount = report.totals.requestedPoisha;
  const oldestPending = report.lots.reduce((max, row) => Math.max(max, row.waitingDays), 0);

  return (
    <div className="space-y-5">
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">{t('ভেন্ডর মোট আয় (ক্রেডিট)', 'Vendor earnings (credit)')}</p>
            <Coins className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
          </div>
          <AnimatedMoney value={report.totals.creditedPoisha} locale={locale} className="mt-1 block text-xl font-bold text-ink" />
          <p className="mt-0.5 text-[11px] text-muted">
            {t('লেজারে জমা হওয়া সব ক্রেডিট', 'Every credit written to the ledger')}
          </p>
        </div>

        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">{t('পরিশোধিত পেআউট', 'Payouts paid')}</p>
            <Banknote className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
          </div>
          <AnimatedMoney value={report.totals.paidPoisha} locale={locale} className="mt-1 block text-xl font-bold text-ink" />
          <p className="mt-0.5 text-[11px] text-muted">
            {t('শুধু paid স্ট্যাটাস', 'Only paid requests')}
            {pendingPayoutAmount > 0 && (
              <>
                {' · '}
                <span className="text-warning">
                  {t('অপেক্ষমাণ', 'pending')} {formatPoishaToBdt(pendingPayoutAmount, locale)}
                </span>
              </>
            )}
          </p>
        </div>

        <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">{t('এখন ভেন্ডর পাওনা', 'Owed to vendors now')}</p>
            <Wallet className="h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
          </div>
          <AnimatedMoney value={report.totals.owedPoisha} locale={locale} className="mt-1 block text-xl font-bold text-ink" />
          <p className="mt-0.5 text-[11px] text-muted">{t('পেন্ডিং + লকড + ছাড়যোগ্য', 'Pending + locked + available')}</p>
        </div>

        <div
          className={cn(
            'rounded-[var(--radius-md)] border p-3.5',
            report.totals.missingLots > 0 ? 'border-danger/40 bg-danger/5' : 'border-border bg-bg',
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs text-muted">{t('মাল বাকি আছে', 'Stock still missing')}</p>
            <PackageX
              className={cn('h-4 w-4 shrink-0', report.totals.missingLots > 0 ? 'text-danger' : 'text-success')}
              aria-hidden="true"
            />
          </div>
          <p className="mt-1 font-mono text-xl font-bold tabular-nums text-ink">
            <AnimatedCount value={report.totals.unresolvedQty} locale={locale} />
            <span className="ml-1 text-xs font-normal text-muted">
              {t('পিস · ', 'pcs · ')}
              <AnimatedCount value={report.totals.missingLots} locale={locale} /> {t('চালান', 'lots')}
            </span>
          </p>
          <p className="mt-0.5 text-[11px] text-muted">
            {t('বাকি মালের মূল্য', 'Value pending')} {formatPoishaToBdt(report.totals.pendingValuePoisha, locale)}
            {oldestPending > 0 && (
              <>
                {' · '}
                <span className="font-semibold text-danger">
                  {formatLocaleNumber(oldestPending, locale)} {t('দিন অপেক্ষা', 'days waiting')}
                </span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* Money timeline */}
      <div className="rounded-[var(--radius-md)] border border-border bg-bg p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Clock3 className="h-4 w-4 text-muted" aria-hidden="true" />
              {t('কবে কত টাকা এলো', 'When the money moved')}
            </h3>
            <p className="text-xs text-muted">
              {t(
                'মাস অনুযায়ী ভেন্ডরের অ্যাকাউন্টে জমা (ক্রেডিট) বনাম পরিশোধিত পেআউট।',
                'Credits into vendor accounts versus payouts actually paid, by month.',
              )}
            </p>
          </div>
          <div className="flex items-center gap-1 rounded-full border border-border bg-surface p-0.5" role="group" aria-label={t('মাসের পরিসর', 'Month range')}>
            {([6, 12] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setMonthCount(option)}
                aria-pressed={monthCount === option}
                className={cn(
                  'min-h-[28px] rounded-full px-2.5 text-[11px] font-semibold transition-colors cursor-pointer',
                  monthCount === option ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
                )}
              >
                {formatLocaleNumber(option, locale)} {t('মাস', 'm')}
              </button>
            ))}
          </div>
        </div>

        <ul className="mt-3 flex h-40 items-end gap-1.5 sm:gap-2" aria-label={t('মাসিক ক্রেডিট ও পেআউট', 'Monthly credits and payouts')}>
          {report.months.map((month, index) => {
            const creditedHeight = (month.creditedPoisha / moneyMax) * 100;
            const paidHeight = (month.paidPoisha / moneyMax) * 100;
            return (
              <li key={month.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
                <div className="flex h-28 w-full items-end justify-center gap-[3px]">
                  <motion.div
                    className="w-1/2 max-w-[18px] rounded-t-[3px] bg-gradient-to-t from-[#15803D] to-[#4ADE80]"
                    initial={reduced ? false : { height: 0 }}
                    animate={{ height: `${Math.max(creditedHeight > 0 ? 3 : 0, creditedHeight)}%` }}
                    transition={{ duration: 0.55, delay: index * 0.03, ease: 'easeOut' }}
                    title={`${monthLabel(month.key, locale)} · ${t('ক্রেডিট', 'Credit')}: ${formatPoishaToBdt(month.creditedPoisha, locale)}`}
                  />
                  <motion.div
                    className="w-1/2 max-w-[18px] rounded-t-[3px] bg-gradient-to-t from-[#1D4ED8] to-[#60A5FA]"
                    initial={reduced ? false : { height: 0 }}
                    animate={{ height: `${Math.max(paidHeight > 0 ? 3 : 0, paidHeight)}%` }}
                    transition={{ duration: 0.55, delay: index * 0.03 + 0.05, ease: 'easeOut' }}
                    title={`${monthLabel(month.key, locale)} · ${t('পরিশোধিত', 'Paid')}: ${formatPoishaToBdt(month.paidPoisha, locale)}`}
                  />
                </div>
                <span className="w-full truncate text-center text-[9px] text-muted">{monthLabel(month.key, locale)}</span>
                <span className="sr-only">
                  {formatPoishaToBdt(month.creditedPoisha, locale)} {t('ক্রেডিট,', 'credit,')}{' '}
                  {formatPoishaToBdt(month.paidPoisha, locale)} {t('পরিশোধিত', 'paid')}
                </span>
              </li>
            );
          })}
        </ul>

        <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] text-muted">
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#15803D]" aria-hidden="true" />
            {t('ক্রেডিট (জমা)', 'Credit in')}
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full bg-[#1D4ED8]" aria-hidden="true" />
            {t('পরিশোধিত পেআউট', 'Payout paid')}
          </span>
          <span>
            {t(
              'নোট: এসক্রো বাকেট বদলালে (ম্যাচুরিটি/হোল্ড) একই সময়ে ক্রেডিট ও ডেবিট দুইটাই লেখা হয় — ব্যালান্স বদলায় শুধু নিট অঙ্কে।',
              'Note: moving money between escrow buckets writes both a credit and a debit at once — only the net changes the balance.',
            )}
          </span>
        </div>
      </div>

      {/* Vendor table */}
      {variant === 'hub' && (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-ink">{t('ভেন্ডরভিত্তিক হিসাব', 'Money by vendor')}</h3>
              <p className="text-xs text-muted">
                {t(
                  'সারিতে ক্লিক করে সেই ভেন্ডরের ৩৬০° প্রোফাইল খুলুন।',
                  'Select a row to open that vendor’s 360° profile.',
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <label className="sr-only" htmlFor="vendor-money-filter">
                {t('ভেন্ডর বাছুন', 'Filter vendor')}
              </label>
              <select
                id="vendor-money-filter"
                value={vendorFilter}
                onChange={(event) => setVendorFilter(event.target.value)}
                className="min-h-[34px] rounded-[var(--radius-sm)] border border-border bg-bg px-2 text-xs text-ink focus:border-ink focus:outline-none"
              >
                <option value="">{t('সব ভেন্ডর', 'All vendors')}</option>
                {report.vendors.map((row) => (
                  <option key={row.vendorId} value={row.vendorId}>
                    {bn ? row.nameBn || row.nameEn || row.vendorCode : row.nameEn || row.nameBn || row.vendorCode}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-0.5 rounded-full border border-border bg-surface p-0.5" role="group" aria-label={t('সাজানোর মাপকাঠি', 'Sort by')}>
                {(
                  [
                    ['credited', t('আয়', 'Earned')],
                    ['paid', t('পরিশোধিত', 'Paid')],
                    ['owed', t('পাওনা', 'Owed')],
                    ['pendingSupply', t('মাল বাকি', 'Pending stock')],
                  ] as Array<[VendorMoneySortKey, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSortKey(key)}
                    aria-pressed={sortKey === key}
                    className={cn(
                      'min-h-[28px] rounded-full px-2 text-[10px] font-semibold transition-colors cursor-pointer',
                      sortKey === key ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {sortedVendors.length === 0 ? (
            <EmptyState
              title={t('কোনো ভেন্ডর নেই', 'No vendors yet')}
              description={t('ভেন্ডর অনবোর্ড করলে তাদের হিসাব এখানে দেখা যাবে।', 'Onboard a vendor and their ledger appears here.')}
            />
          ) : (
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-bg">
              <table className="w-full min-w-[860px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/60 text-[11px] font-semibold text-muted">
                    <th className="py-2.5 px-3.5">{t('ভেন্ডর', 'Vendor')}</th>
                    <th className="py-2.5 px-3 text-right">{t('মোট আয়', 'Earned')}</th>
                    <th className="py-2.5 px-3 text-right">{t('পরিশোধিত', 'Paid')}</th>
                    <th className="py-2.5 px-3 text-right">{t('এখন পাওনা', 'Owed')}</th>
                    <th className="py-2.5 px-3">{t('শেষ পেআউট', 'Last payout')}</th>
                    <th className="py-2.5 px-3 text-right">{t('মাল বাকি', 'Stock pending')}</th>
                    <th className="py-2.5 px-3.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sortedVendors.map((row) => (
                    <tr
                      key={row.vendorId}
                      onClick={() => onOpenVendor?.(row.vendorId)}
                      className={cn(
                        'transition-colors',
                        onOpenVendor ? 'cursor-pointer hover:bg-surface/70' : '',
                      )}
                    >
                      <td className="py-2.5 px-3.5">
                        <p className="font-semibold text-ink">
                          {bn ? row.nameBn || row.nameEn || row.vendorCode : row.nameEn || row.nameBn || row.vendorCode}
                        </p>
                        <p className="font-mono text-[11px] text-muted">
                          {row.vendorCode || '—'}
                          {row.status ? ` · ${row.status}` : ''}
                        </p>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                        {formatPoishaToBdt(row.creditedPoisha, locale)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums text-info">
                        {formatPoishaToBdt(row.paidPoisha, locale)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold tabular-nums text-ink">
                        {formatPoishaToBdt(row.owedPoisha, locale)}
                        {row.requestedPoisha > 0 && (
                          <span className="ml-1 block text-[10px] font-normal text-warning">
                            {t('চাওয়া', 'requested')} {formatPoishaToBdt(row.requestedPoisha, locale)}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-muted">
                        <span className="block">{fmtDate(row.lastPaidAt, locale)}</span>
                        <span className="block text-[10px]">
                          {t('শেষ জমা', 'last credit')} {fmtDate(row.lastCreditAt, locale)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        {row.supply.unresolvedQty > 0 ? (
                          <span className="inline-flex flex-col items-end gap-0.5">
                            <span className="font-mono font-semibold tabular-nums text-danger">
                              {formatLocaleNumber(row.supply.unresolvedQty, locale)} {t('পিস', 'pcs')}
                            </span>
                            <span className="text-[10px] text-muted">
                              {formatPoishaToBdt(row.supply.pendingValuePoisha, locale)}
                              {row.supply.oldestPendingDays > 0
                                ? ` · ${formatLocaleNumber(row.supply.oldestPendingDays, locale)} ${t('দিন', 'd')}`
                                : ''}
                            </span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-success">
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            {t('সব পেয়েছি', 'all received')}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3.5 text-right">
                        {onViewPayouts ? (
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              onViewPayouts(row.vendorId);
                            }}
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-ink underline underline-offset-4 cursor-pointer"
                          >
                            {t('পেআউট', 'Payouts')}
                            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                          </button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border bg-surface/40 text-[11px] font-semibold">
                    <th scope="row" className="py-2.5 px-3.5 text-left text-muted">
                      {t('মোট', 'Total')} ({formatLocaleNumber(sortedVendors.length, locale)})
                    </th>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                      {formatPoishaToBdt(report.totals.creditedPoisha, locale)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                      {formatPoishaToBdt(report.totals.paidPoisha, locale)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-ink">
                      {formatPoishaToBdt(report.totals.owedPoisha, locale)}
                    </td>
                    <td className="py-2.5 px-3" />
                    <td className="py-2.5 px-3 text-right font-mono tabular-nums text-danger">
                      {report.totals.missingLots > 0 ? formatPoishaToBdt(report.totals.pendingValuePoisha, locale) : '—'}
                    </td>
                    <td className="py-2.5 px-3.5" />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Supply: received vs not received */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h3 className="flex items-center gap-1.5 text-sm font-semibold text-ink">
              <Truck className="h-4 w-4 text-muted" aria-hidden="true" />
              {t('কোন প্রোডাক্ট পেয়েছি, কোনটা পাইনি', 'What arrived and what did not')}
            </h3>
            <p className="text-xs text-muted">
              {t(
                'ভেন্ডর চালান পাঠানোর পর QC-তে যা গৃহীত/রিজেক্ট হয়েছে, আর যা এখনো বাকি — পিস ও টাকার অঙ্কে।',
                'Vendor challans with QC accepted and rejected pieces, plus what is still missing — in pieces and taka.',
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-1 rounded-full border border-border bg-surface p-0.5" role="group" aria-label={t('সরবরাহ ফিল্টার', 'Supply filter')}>
            {SUPPLY_FILTERS.map((filter) => {
              const active = supplyFilter === filter;
              const label =
                filter === 'all'
                  ? t('সব', 'All')
                  : SUPPLY_STATE_LABELS[filter]?.[bn ? 'bn' : 'en'] ?? filter;
              return (
                <button
                  key={filter}
                  type="button"
                  onClick={() => setSupplyFilter(filter)}
                  aria-pressed={active}
                  className={cn(
                    'min-h-[28px] rounded-full px-2.5 text-[10px] font-semibold transition-colors cursor-pointer',
                    active ? 'bg-ink text-bg' : 'text-muted hover:text-ink',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        {report.lots.length === 0 ? (
          <EmptyState
            title={t('কোনো চালান নেই', 'No consignment lots')}
            description={t(
              'ভেন্ডর চালান পাঠালে বা অ্যাডমিন স্টক রিসিভ করলে এখানে দেখা যাবে।',
              'Consignment dispatches and admin receipts appear here.',
            )}
          />
        ) : supplyRows.length === 0 ? (
          <p className="rounded-[var(--radius-md)] border border-border bg-surface/40 p-3 text-xs text-muted">
            {t('এই ফিল্টারে কোনো চালান নেই।', 'No lots match this filter.')}
          </p>
        ) : (
          <>
            <div className="overflow-x-auto rounded-[var(--radius-md)] border border-border bg-bg">
              <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface/60 text-[11px] font-semibold text-muted">
                    <th className="py-2.5 px-3.5">{t('পণ্য ও ভেন্ডর', 'Product & vendor')}</th>
                    <th className="py-2.5 px-2.5 text-right">{t('পাঠানো', 'Sent')}</th>
                    <th className="py-2.5 px-2.5 text-right">{t('গৃহীত', 'Accepted')}</th>
                    <th className="py-2.5 px-2.5 text-right">{t('রিজেক্ট', 'Rejected')}</th>
                    <th className="py-2.5 px-2.5 text-right">{t('বাকি', 'Missing')}</th>
                    <th className="py-2.5 px-3">{t('গৃহীতের অনুপাত', 'Receive rate')}</th>
                    <th className="py-2.5 px-2.5 text-right">{t('বাকি টাকা', 'Value pending')}</th>
                    <th className="py-2.5 px-2.5">{t('অপেক্ষা', 'Waiting')}</th>
                    <th className="py-2.5 px-3.5">{t('অবস্থা', 'Status')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {visibleLots.map((row) => {
                    const rate = row.dispatchedQty > 0 ? row.acceptedQty / row.dispatchedQty : 0;
                    return (
                      <tr key={row.lotId} className="align-top">
                        <td className="py-2.5 px-3.5">
                          <p className="font-medium text-ink">
                            {row.productName || '—'}
                            {row.variantTitle ? <span className="font-normal text-muted"> ({row.variantTitle})</span> : null}
                          </p>
                          <p className="font-mono text-[10px] text-muted">
                            {row.sku || '—'}
                            {row.vendorName ? ` · ${row.vendorName}` : ''}
                          </p>
                          <p className="font-mono text-[10px] text-muted">
                            {row.lotCode}
                            {row.challanRef ? ` · ${t('চালান', 'challan')} ${row.challanRef}` : ''} · {fmtDate(row.dispatchedAt, locale)}
                          </p>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-ink">{formatLocaleNumber(row.dispatchedQty, locale)}</td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-success">{formatLocaleNumber(row.acceptedQty, locale)}</td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-danger">
                          {row.rejectedQty > 0 ? formatLocaleNumber(row.rejectedQty, locale) : '—'}
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono font-semibold tabular-nums">
                          <span className={row.unresolvedQty > 0 ? 'text-danger' : 'text-muted'}>
                            {formatLocaleNumber(row.unresolvedQty, locale)}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-surface">
                              <motion.div
                                className={cn(
                                  'h-full rounded-full',
                                  rate >= 1 ? 'bg-success' : rate > 0 ? 'bg-warning' : 'bg-danger',
                                )}
                                initial={reduced ? false : { width: 0 }}
                                animate={{ width: `${Math.max(2, Math.round(rate * 100))}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                              />
                            </div>
                            <span className="font-mono text-[10px] text-muted">{formatLocaleNumber(Math.round(rate * 100), locale)}%</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2.5 text-right font-mono tabular-nums text-ink">
                          {row.pendingValuePoisha > 0 ? formatPoishaToBdt(row.pendingValuePoisha, locale) : '—'}
                        </td>
                        <td className="py-2.5 px-2.5">
                          {row.state === 'not_received' ? (
                            <span
                              className={cn(
                                'inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-mono text-[10px] font-semibold',
                                row.waitingDays > 3 ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning',
                              )}
                            >
                              {row.waitingDays > 3 ? <AlertTriangle className="h-3 w-3" aria-hidden="true" /> : <Clock3 className="h-3 w-3" aria-hidden="true" />}
                              {formatLocaleNumber(row.waitingDays, locale)} {t('দিন', 'd')}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                              <PackageCheck className="h-3 w-3" aria-hidden="true" />
                              {fmtDate(row.receivedAt ?? row.dispatchedAt, locale)}
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3.5">
                          <Badge status={stateBadgeStatus(row.state)}>
                            {SUPPLY_STATE_LABELS[row.state]?.[bn ? 'bn' : 'en'] ?? row.state}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {supplyRows.length > 12 && (
              <button
                type="button"
                onClick={() => setShowAllLots((value) => !value)}
                className="inline-flex min-h-[32px] items-center gap-1 text-[11px] font-semibold text-ink underline underline-offset-4 cursor-pointer"
              >
                {showAllLots
                  ? t('কম দেখান', 'Show fewer')
                  : t(`সব ${supplyRows.length}টি চালান দেখান`, `Show all ${supplyRows.length} lots`)}
                {showAllLots ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}
              </button>
            )}
          </>
        )}
      </div>

      {/* Vendor-wide payout states, so "requested" is never mistaken for paid */}
      {report.vendors.length > 0 && (
        <div className="rounded-[var(--radius-md)] border border-border bg-surface/40 p-3">
          <p className="text-[11px] font-semibold text-ink">{t('পেআউট অনুরোধের অবস্থা', 'Payout request states')}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {(() => {
              const counts = new Map<string, { count: number; amount: number }>();
              for (const payout of payoutRequests) {
                if (activeVendorId && payout.vendorId !== activeVendorId) continue;
                const key = payout.status ?? 'unknown';
                const current = counts.get(key) ?? { count: 0, amount: 0 };
                current.count += 1;
                current.amount += Math.round(Number(payout.netPaidPoisha ?? payout.requestedAmountPoisha) || 0);
                counts.set(key, current);
              }
              if (counts.size === 0) {
                return <span className="text-[11px] text-muted">{t('কোনো পেআউট অনুরোধ নেই।', 'No payout requests yet.')}</span>;
              }
              return [...counts.entries()].map(([key, value]) => (
                <span
                  key={key}
                  className="inline-flex items-center gap-1 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px]"
                >
                  <span className="text-muted">{PAYOUT_STATUS_LABELS[key]?.[bn ? 'bn' : 'en'] ?? key}</span>
                  <span className="font-mono font-semibold tabular-nums text-ink">{formatPoishaToBdt(value.amount, locale)}</span>
                  <span className="text-muted">· {formatLocaleNumber(value.count, locale)}</span>
                </span>
              ));
            })()}
          </div>
          <p className="mt-1.5 text-[10px] text-muted">
            {t(
              '"অনুরোধ করা" বা "অনুমোদিত" মানে টাকা এখনো যায়নি — শুধু paid-ই পরিশোধ হিসেবে গণ্য।',
              '"Requested" or "approved" is not money sent — only paid counts as settled.',
            )}
          </p>
        </div>
      )}
    </div>
  );
}

export default VendorLedgerSupplyPanel;

/** Re-exported so the hub can type its rows without importing the summary module twice. */
export type { VendorMoneyRow };
