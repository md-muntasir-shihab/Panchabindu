'use client';
import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  Activity,
  ArrowDownRight,
  ArrowUpDown,
  ArrowUpRight,
  Banknote,
  Boxes,
  CalendarClock,
  ChevronRight,
  ClipboardList,
  Clock3,
  FileCheck2,
  Gauge,
  LayoutDashboard,
  MessageSquare,
  Package,
  Printer,
  RefreshCw,
  Search,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  TriangleAlert,
  Truck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import type { AdminTabKey } from './admin-erp-client';
import { DASHBOARD_STATUSES } from './dashboard-summary';

/**
 * Module: Admin Command Dashboard (default landing screen).
 *
 * Everything here is derived from the same role-filtered workspace snapshot the rest of the admin
 * panel uses, so a vendor sees only its own orders and a marketing manager never sees payouts.
 * No new endpoint, no fabricated metric: empty data shows an honest empty state.
 */

type Locale = 'bn' | 'en';

export interface DashboardOrder {
  orderNo?: string;
  customerName?: string;
  districtNameBn?: string;
  totalPayablePoisha?: number;
  status?: string;
  paymentStatus?: string;
  deliveryMethod?: string;
  nextBestAction?: string;
  createdAt?: string;
  items?: Array<{ productNameBn?: string; quantity?: number; lineSubtotalPoisha?: number }>;
}

export interface DashboardSnapshot {
  orders?: DashboardOrder[];
  todayQueues?: {
    callToConfirmCount?: number;
    fixAddressCount?: number;
    verifyBkashCount?: number;
    readyToPackCount?: number;
    readyToBookCourierCount?: number;
    awaitingCodRemittanceCount?: number;
    lowStockVariantsCount?: number;
    missingCourierInfoCount?: number;
  };
  moneyMapPnl?: {
    totalCourierStuckCodPoisha?: number;
    vendorAvailablePoisha?: number;
    vendorLockedPoisha?: number;
    estimatedOwnLiquidCashPoisha?: number;
    autoNetProfitPoisha?: number;
    isNetLoss?: boolean;
    deliveredGrossSalesPoisha?: number;
    totalExpensesPoisha?: number;
  } | null;
  product360?: Array<{
    productId?: string;
    productNameBn?: string;
    variantTitleBn?: string;
    stockAvailable?: number;
    lowStockThreshold?: number;
    isLowStock?: boolean;
    daysOfCover?: number;
    soldLast30Days?: number;
  }>;
  manualPaymentSubmissions?: Array<{ status?: string }>;
  inquiries?: Array<{ status?: string }>;
  vendorSupportTickets?: Array<{ status?: string }>;
  pendingVendorRequests?: unknown[];
  pendingVendorKycDocs?: unknown[];
  vendorEscrow?: { payoutRequests?: Array<{ status?: string; amountPoisha?: number }> } | null;
  auditLogs?: Array<{
    id?: string;
    actorUsername?: string;
    summaryBn?: string;
    actionCode?: string;
    targetType?: string;
    createdAt?: string;
  }>;
  currentUser?: { displayNameBn?: string; displayNameEn?: string; username?: string } | null;
  activeRole?: { nameBn?: string; nameEn?: string } | null;
  emergencyStopActive?: boolean;
}

export interface AdminCommandDashboardProps {
  locale: Locale;
  snapshot: DashboardSnapshot;
  loadedAt: Date | null;
  isSuperAdmin: boolean;
  isVendor: boolean;
  onRefresh: () => Promise<unknown> | unknown;
  onNavigate: (tab: AdminTabKey) => void;
  onOpenOrderStatus: (status: string) => void;
  onOpenOrderQueue: (action: string) => void;
}

/* ------------------------------------------------------------------ utilities */

const numberFormatterCache = new Map<string, Intl.NumberFormat>();
function numberFormat(locale: Locale): Intl.NumberFormat {
  const cached = numberFormatterCache.get(locale);
  if (cached) return cached;
  const created = new Intl.NumberFormat(locale === 'bn' ? 'bn-BD' : 'en-BD');
  numberFormatterCache.set(locale, created);
  return created;
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dayLabel(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short' }).format(date);
}

function safePoisha(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

const STATUS_COLORS: Record<string, string> = {
  pending_confirmation: '#D97706',
  confirmed: '#2563EB',
  packed: '#7C3AED',
  shipped: '#0EA5E9',
  out_for_delivery: '#0891B2',
  delivered: '#15803D',
  return_initiated: '#DC2626',
  returned: '#B91C1C',
  cancelled: '#6B7280',
};

const STATUS_LABELS: Record<string, { bn: string; en: string }> = Object.fromEntries(
  DASHBOARD_STATUSES.map((entry) => [entry.key, { bn: entry.bn, en: entry.en }]),
) as Record<string, { bn: string; en: string }>;

/* ------------------------------------------------------------------ animation */

function useAnimatedNumber(value: number, durationMs = 650): number {
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

const fadeIn = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0 },
};

/* ------------------------------------------------------------------ small parts */

function SortableHeader({
  label,
  active,
  direction,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  direction: 'asc' | 'desc';
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <th scope="col" className="px-2 py-2 font-semibold" aria-sort={active ? (direction === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        onClick={onClick}
        className={`inline-flex min-h-[32px] w-full items-center gap-1 rounded-md px-1 text-[11px] uppercase tracking-[0.06em] transition-colors hover:text-ink cursor-pointer ${align === 'right' ? 'justify-end' : 'justify-start'} ${active ? 'text-ink' : 'text-muted'}`}
      >
        <span>{label}</span>
        <ArrowUpDown className={`w-3 h-3 shrink-0 ${active ? 'opacity-100' : 'opacity-40'}`} aria-hidden="true" />
        <span className="sr-only">{direction === 'asc' ? 'sorted ascending' : 'sorted descending'}</span>
      </button>
    </th>
  );
}

function DeltaChip({ current, previous, locale }: { current: number; previous: number; locale: Locale }) {
  if (!previous && !current) return null;
  if (!previous) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-info/10 px-1.5 py-0.5 text-[10px] font-semibold text-info">
        <Sparkles className="w-3 h-3" aria-hidden="true" />
        {locale === 'bn' ? 'নতুন' : 'new'}
      </span>
    );
  }
  const change = ((current - previous) / previous) * 100;
  const up = change >= 0;
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${up ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'}`}
    >
      <Icon className="w-3 h-3" aria-hidden="true" />
      {numberFormat(locale).format(Math.abs(Math.round(change)))}%
    </span>
  );
}

function KpiCard({
  label,
  value,
  locale,
  money,
  hint,
  icon,
  tone = 'neutral',
  delta,
  onClick,
  index,
}: {
  label: string;
  value: number;
  locale: Locale;
  /** Render the animated value as BDT instead of a plain count. */
  money?: boolean;
  hint?: string;
  icon: React.ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'info';
  delta?: React.ReactNode;
  onClick?: () => void;
  index: number;
}) {
  const animated = useAnimatedNumber(value);
  const displayValue = money
    ? formatPoishaToBdt(Math.round(animated) || 0, locale)
    : formatLocaleNumber(Math.round(animated), locale);
  const toneRing: Record<string, string> = {
    neutral: 'border-border',
    success: 'border-success/35',
    warning: 'border-warning/35',
    danger: 'border-danger/35',
    info: 'border-info/35',
  };
  const toneIcon: Record<string, string> = {
    neutral: 'bg-surface text-ink',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    danger: 'bg-danger/10 text-danger',
    info: 'bg-info/10 text-info',
  };
  const body = (
    <div className="flex h-full flex-col justify-between gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-[0.07em] text-muted">{label}</p>
        <span className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${toneIcon[tone]}`}>{icon}</span>
      </div>
      <div className="space-y-1">
        <p className="font-mono text-2xl font-bold leading-none tabular-nums text-ink">{displayValue}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          {delta}
          {hint && <span className="text-[10px] text-muted">{hint}</span>}
        </div>
      </div>
    </div>
  );
  return (
    <motion.div
      variants={fadeIn}
      initial="hidden"
      animate="show"
      transition={{ duration: 0.4, delay: index * 0.05, ease: 'easeOut' }}
      whileHover={{ y: -3 }}
      className="h-full"
    >
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className={`h-full w-full rounded-[var(--radius-md)] border bg-bg p-3.5 text-left transition-shadow hover:shadow-[0_10px_24px_rgba(23,43,36,0.10)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink cursor-pointer ${toneRing[tone]}`}
        >
          {body}
        </button>
      ) : (
        <div className={`h-full w-full rounded-[var(--radius-md)] border bg-bg p-3.5 ${toneRing[tone]}`}>{body}</div>
      )}
    </motion.div>
  );
}

interface TrendPoint {
  key: string;
  label: string;
  revenue: number;
  orders: number;
}

function TrendChart({
  points,
  locale,
  metric,
  range,
  onRangeChange,
  onMetricChange,
}: {
  points: TrendPoint[];
  locale: Locale;
  metric: 'revenue' | 'orders';
  range: 7 | 14 | 30;
  onRangeChange: (range: 7 | 14 | 30) => void;
  onMetricChange: (metric: 'revenue' | 'orders') => void;
}) {
  const reduced = useReducedMotion();
  const [hover, setHover] = React.useState<number | null>(null);
  const width = 680;
  const height = 210;
  const padX = 14;
  const padTop = 16;
  const padBottom = 30;
  const values = points.map((point) => (metric === 'revenue' ? point.revenue : point.orders));
  const max = Math.max(1, ...values);
  const usableWidth = width - padX * 2;
  const usableHeight = height - padTop - padBottom;
  const stepX = points.length > 1 ? usableWidth / (points.length - 1) : 0;
  const coords = values.map((value, index) => ({
    x: padX + index * stepX,
    y: padTop + usableHeight - (value / max) * usableHeight,
  }));
  const line = coords.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ');
  const area = coords.length
    ? `${line} L${coords[coords.length - 1].x.toFixed(1)},${(padTop + usableHeight).toFixed(1)} L${coords[0].x.toFixed(1)},${(padTop + usableHeight).toFixed(1)} Z`
    : '';
  const labelEvery = points.length > 14 ? 5 : points.length > 7 ? 3 : 1;
  const hovered = hover !== null ? points[hover] : null;

  const toggleClass = (active: boolean) =>
    `min-h-[30px] rounded-full px-2.5 text-[11px] font-semibold transition-colors cursor-pointer ${active ? 'bg-ink text-white' : 'text-muted hover:text-ink'}`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-sm font-bold text-ink">{locale === 'bn' ? 'বিক্রয়ের প্রবণতা' : 'Sales trend'}</h2>
          <p className="text-[11px] text-muted">
            {locale === 'bn' ? 'বাতিল বাদে দৈনিক মোট (কাস্টমার যা দেবে)' : 'Daily payable total excluding cancellations'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label={locale === 'bn' ? 'মেট্রিক' : 'Metric'} className="flex items-center gap-1 rounded-full border border-border bg-surface p-0.5">
            <button type="button" className={toggleClass(metric === 'revenue')} aria-pressed={metric === 'revenue'} onClick={() => onMetricChange('revenue')}>
              {locale === 'bn' ? 'বিক্রি' : 'Revenue'}
            </button>
            <button type="button" className={toggleClass(metric === 'orders')} aria-pressed={metric === 'orders'} onClick={() => onMetricChange('orders')}>
              {locale === 'bn' ? 'অর্ডার' : 'Orders'}
            </button>
          </div>
          <div role="group" aria-label={locale === 'bn' ? 'সময়কাল' : 'Range'} className="flex items-center gap-1 rounded-full border border-border bg-surface p-0.5">
            {([7, 14, 30] as const).map((option) => (
              <button key={option} type="button" className={toggleClass(range === option)} aria-pressed={range === option} onClick={() => onRangeChange(option)}>
                {formatLocaleNumber(option, locale)}{locale === 'bn' ? 'দি' : 'd'}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="relative">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-[210px] w-full touch-none"
          role="img"
          aria-label={locale === 'bn' ? 'দৈনিক বিক্রয় ও অর্ডারের গ্রাফ' : 'Daily revenue and order chart'}
          onMouseLeave={() => setHover(null)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            const relative = ((event.clientX - rect.left) / rect.width) * width;
            const index = Math.max(0, Math.min(points.length - 1, Math.round((relative - padX) / (stepX || 1))));
            setHover(index);
          }}
        >
          <defs>
            <linearGradient id="pb-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#15803D" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#15803D" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((ratio) => (
            <line
              key={ratio}
              x1={padX}
              x2={width - padX}
              y1={padTop + usableHeight * ratio}
              y2={padTop + usableHeight * ratio}
              stroke="currentColor"
              className="text-border"
              strokeDasharray="3 6"
              strokeWidth="1"
            />
          ))}
          {area && <motion.path d={area} fill="url(#pb-trend-fill)" initial={reduced ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6 }} />}
          {line && (
            <motion.path
              d={line}
              fill="none"
              stroke="#15803D"
              strokeWidth="2.5"
              strokeLinecap="round"
              initial={reduced ? false : { pathLength: 0 }}
              animate={{ pathLength: 1 }}
              transition={{ duration: 0.9, ease: 'easeOut' }}
            />
          )}
          {coords.map((point, index) => (
            <g key={points[index]?.key ?? index}>
              <circle
                cx={point.x}
                cy={point.y}
                r={hover === index ? 4.5 : 2.5}
                className={hover === index ? 'fill-ink' : 'fill-success'}
                opacity={hover === null || hover === index ? 1 : 0.5}
              />
              {index % labelEvery === 0 && (
                <text x={point.x} y={height - 8} textAnchor="middle" className="fill-current text-[10px] text-muted">
                  {points[index]?.label}
                </text>
              )}
            </g>
          ))}
          {hover !== null && coords[hover] && (
            <line x1={coords[hover].x} x2={coords[hover].x} y1={padTop} y2={padTop + usableHeight} className="stroke-current text-ink/30" strokeWidth="1" strokeDasharray="3 3" />
          )}
        </svg>
        {hovered && (
          <div
            className="pointer-events-none absolute top-1 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-xs shadow-lg"
            style={{ left: `${Math.min(78, Math.max(2, ((hover ?? 0) / Math.max(1, points.length - 1)) * 100))}%` }}
          >
            <p className="font-semibold text-ink">{hovered.label}</p>
            <p className="tabular-nums text-muted">
              {locale === 'bn' ? 'বিক্রি ' : 'Revenue '}
              {formatPoishaToBdt(safePoisha(hovered.revenue), locale)}
            </p>
            <p className="tabular-nums text-muted">
              {locale === 'bn' ? 'অর্ডার ' : 'Orders '}
              {formatLocaleNumber(hovered.orders, locale)}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDonut({
  segments,
  total,
  locale,
  onSelect,
}: {
  segments: Array<{ key: string; count: number; color: string; label: string }>;
  total: number;
  locale: Locale;
  onSelect: (key: string) => void;
}) {
  const reduced = useReducedMotion();
  const size = 176;
  const stroke = 20;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const visible = segments.filter((segment) => segment.count > 0);

  return (
    <div className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-ink">{locale === 'bn' ? 'অর্ডার অবস্থা' : 'Order status'}</h2>
        <p className="text-[11px] text-muted">{locale === 'bn' ? 'স্লাইসে ক্লিক করে গ্রিড ফিল্টার করুন' : 'Select a slice to filter the grid'}</p>
      </div>
      <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center">
        <div className="relative shrink-0">
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={locale === 'bn' ? 'অর্ডার অবস্থার অনুপাত' : 'Order status distribution'}>
            <circle cx={size / 2} cy={size / 2} r={radius} fill="none" strokeWidth={stroke} className="stroke-current text-border/60" />
            {visible.map((segment) => {
              const fraction = total > 0 ? segment.count / total : 0;
              const dash = fraction * circumference;
              const element = (
                <motion.circle
                  key={segment.key}
                  cx={size / 2}
                  cy={size / 2}
                  r={radius}
                  fill="none"
                  stroke={segment.color}
                  strokeWidth={stroke}
                  strokeLinecap="butt"
                  strokeDasharray={`${Math.max(0, dash - 1.5)} ${circumference - Math.max(0, dash - 1.5)}`}
                  strokeDashoffset={-offset}
                  transform={`rotate(-90 ${size / 2} ${size / 2})`}
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.45 }}
                  className="cursor-pointer"
                  onClick={() => onSelect(segment.key)}
                >
                  <title>{`${segment.label}: ${segment.count}`}</title>
                </motion.circle>
              );
              offset += dash;
              return element;
            })}
            <text x="50%" y="46%" textAnchor="middle" className="fill-current text-[22px] font-bold text-ink">
              {formatLocaleNumber(total, locale)}
            </text>
            <text x="50%" y="60%" textAnchor="middle" className="fill-current text-[10px] uppercase tracking-[0.08em] text-muted">
              {locale === 'bn' ? 'মোট অর্ডার' : 'Total orders'}
            </text>
          </svg>
        </div>
        <ul className="grid w-full grid-cols-2 gap-x-3 gap-y-1.5 text-[11px] sm:grid-cols-1">
          {segments.map((segment) => (
            <li key={segment.key}>
              <button
                type="button"
                onClick={() => onSelect(segment.key)}
                className="flex min-h-[30px] w-full items-center justify-between gap-2 rounded-md px-1 text-left transition-colors hover:bg-surface cursor-pointer"
              >
                <span className="flex min-w-0 items-center gap-1.5">
                  <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden="true" />
                  <span className="truncate text-muted">{segment.label}</span>
                </span>
                <span className="font-mono tabular-nums text-ink">{formatLocaleNumber(segment.count, locale)}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function QueueTile({
  label,
  count,
  hint,
  icon,
  tone,
  onClick,
  index,
}: {
  label: string;
  count: number;
  hint?: string;
  icon: React.ReactNode;
  tone: 'warning' | 'danger' | 'info' | 'success' | 'neutral';
  onClick: () => void;
  index: number;
}) {
  const toneClasses: Record<string, string> = {
    warning: 'text-warning border-warning/30',
    danger: 'text-danger border-danger/30',
    info: 'text-info border-info/30',
    success: 'text-success border-success/30',
    neutral: 'text-ink border-border',
  };
  return (
    <motion.li variants={fadeIn} initial="hidden" animate="show" transition={{ duration: 0.35, delay: index * 0.04 }}>
      <button
        type="button"
        onClick={onClick}
        className={`group flex min-h-[68px] w-full items-center gap-3 rounded-[var(--radius-md)] border bg-bg p-3 text-left transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink cursor-pointer ${toneClasses[tone]}`}
      >
        <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-surface">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-xs font-semibold text-ink">{label}</span>
          {hint && <span className="block truncate text-[10px] text-muted">{hint}</span>}
        </span>
        <span className="font-mono text-lg font-bold tabular-nums text-ink">{formatLocaleNumber(count, 'bn')}</span>
        <ChevronRight className="w-4 h-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
      </button>
    </motion.li>
  );
}

function BarList({
  rows,
  locale,
  emptyLabel,
}: {
  rows: Array<{ key: string; label: string; value: number; caption?: string }>;
  locale: Locale;
  emptyLabel: string;
}) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return <p className="py-6 text-center text-xs text-muted">{emptyLabel}</p>;
  return (
    <ul className="space-y-2">
      {rows.map((row, index) => (
        <motion.li
          key={row.key}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.3, delay: index * 0.04 }}
          className="space-y-1"
        >
          <div className="flex items-baseline justify-between gap-2 text-xs">
            <span className="truncate text-ink">{row.label}</span>
            <span className="shrink-0 font-mono tabular-nums text-muted">{row.caption ?? formatLocaleNumber(row.value, locale)}</span>
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-surface">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-[#15803D] to-[#0EA5E9]"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(4, (row.value / max) * 100)}%` }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: index * 0.04 }}
            />
          </div>
        </motion.li>
      ))}
    </ul>
  );
}

/* ------------------------------------------------------------------ dashboard */

export function AdminCommandDashboard({
  locale,
  snapshot,
  loadedAt,
  isSuperAdmin,
  isVendor,
  onRefresh,
  onNavigate,
  onOpenOrderStatus,
  onOpenOrderQueue,
}: AdminCommandDashboardProps) {
  const reduced = useReducedMotion();
  const bn = locale === 'bn';
  const [range, setRange] = React.useState<7 | 14 | 30>(14);
  const [metric, setMetric] = React.useState<'revenue' | 'orders'>('revenue');
  const [refreshing, setRefreshing] = React.useState(false);
  // The workspace snapshot carries the whole runtime document set, so live polling stays opt-in
  // and deliberately slow: an admin who needs fresher data presses refresh.
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [clock, setClock] = React.useState(() => new Date());
  const [orderQuery, setOrderQuery] = React.useState('');
  const [topMetric, setTopMetric] = React.useState<'revenue' | 'quantity'>('revenue');
  const orderSort = React.useState<{ key: 'createdAt' | 'totalPayablePoisha' | 'status' | 'customerName' | 'orderNo'; direction: 'asc' | 'desc' }>({
    key: 'createdAt',
    direction: 'desc',
  });
  const [orderSortState, setOrderSortState] = orderSort;

  React.useEffect(() => {
    const timer = window.setInterval(() => setClock(new Date()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [onRefresh]);

  React.useEffect(() => {
    if (!autoRefresh) return undefined;
    const timer = window.setInterval(() => { void refresh(); }, 180_000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh]);

  const orders = React.useMemo(() => snapshot.orders ?? [], [snapshot.orders]);

  /** Revenue counts what the customer pays; cancelled and returned orders are excluded. */
  const countingOrders = React.useMemo(
    () => orders.filter((order) => order.status !== 'cancelled' && order.status !== 'returned'),
    [orders],
  );

  const todayKey = dayKey(new Date());
  const yesterdayKey = dayKey(new Date(Date.now() - 86_400_000));

  const stats = React.useMemo(() => {
    const bucket = (key: string) => countingOrders.filter((order) => (order.createdAt ? dayKey(new Date(order.createdAt)) === key : false));
    const todayOrders = bucket(todayKey);
    const yesterdayOrders = bucket(yesterdayKey);
    const sum = (list: DashboardOrder[]) => list.reduce((total, order) => total + safePoisha(order.totalPayablePoisha), 0);
    const revenueToday = sum(todayOrders);
    const revenueYesterday = sum(yesterdayOrders);
    const delivered = orders.filter((order) => order.status === 'delivered').length;
    const returned = orders.filter((order) => order.status === 'returned' || order.status === 'return_initiated').length;
    const deliveryRate = delivered + returned > 0 ? (delivered / (delivered + returned)) * 100 : 0;
    return {
      revenueToday,
      revenueYesterday,
      ordersToday: todayOrders.length,
      ordersYesterday: yesterdayOrders.length,
      averageOrderValue: countingOrders.length ? Math.round(sum(countingOrders) / countingOrders.length) : 0,
      revenueAll: sum(countingOrders),
      delivered,
      deliveryRate,
      pendingConfirmation: orders.filter((order) => order.status === 'pending_confirmation').length,
    };
  }, [countingOrders, orders, todayKey, yesterdayKey]);

  const trend = React.useMemo<TrendPoint[]>(() => {
    const buckets = new Map<string, { revenue: number; orders: number }>();
    for (let index = range - 1; index >= 0; index -= 1) {
      const date = new Date();
      date.setHours(0, 0, 0, 0);
      date.setDate(date.getDate() - index);
      buckets.set(dayKey(date), { revenue: 0, orders: 0 });
    }
    for (const order of countingOrders) {
      if (!order.createdAt) continue;
      const key = dayKey(new Date(order.createdAt));
      const bucket = buckets.get(key);
      if (!bucket) continue;
      bucket.revenue += safePoisha(order.totalPayablePoisha);
      bucket.orders += 1;
    }
    return [...buckets.entries()].map(([key, value]) => ({
      key,
      label: dayLabel(new Date(`${key}T00:00:00`), locale),
      revenue: value.revenue,
      orders: value.orders,
    }));
  }, [countingOrders, locale, range]);

  const statusSegments = React.useMemo(
    () =>
      DASHBOARD_STATUSES.map((entry) => ({
        key: entry.key,
        count: orders.filter((order) => order.status === entry.key).length,
        color: STATUS_COLORS[entry.key] ?? '#9CA3AF',
        label: bn ? entry.bn : entry.en,
      })),
    [orders, bn],
  );

  const topProducts = React.useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; quantity: number }>();
    for (const order of countingOrders) {
      for (const item of order.items ?? []) {
        const label = item.productNameBn?.trim() || (bn ? 'অজানা পণ্য' : 'Unknown product');
        const current = map.get(label) ?? { label, revenue: 0, quantity: 0 };
        current.revenue += safePoisha(item.lineSubtotalPoisha);
        current.quantity += Number(item.quantity) || 0;
        map.set(label, current);
      }
    }
    return [...map.values()]
      .sort((a, b) => (topMetric === 'revenue' ? b.revenue - a.revenue : b.quantity - a.quantity))
      .slice(0, 5);
  }, [countingOrders, topMetric, bn]);

  const topDistricts = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const order of countingOrders) {
      const label = order.districtNameBn?.trim();
      if (!label) continue;
      map.set(label, (map.get(label) ?? 0) + 1);
    }
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([label, value]) => ({ key: label, label, value }));
  }, [countingOrders]);

  const lowStock = React.useMemo(() => {
    const source = snapshot.product360?.length
      ? snapshot.product360.map((variant) => ({
          key: `${variant.productId ?? 'p'}-${variant.variantTitleBn ?? 'v'}`,
          label: variant.productNameBn ?? '',
          caption: variant.variantTitleBn ?? '',
          stock: Number(variant.stockAvailable) || 0,
          cover: Number(variant.daysOfCover) || 0,
        }))
      : [];
    return source.filter((row) => row.stock <= 5).sort((a, b) => a.stock - b.stock).slice(0, 5);
  }, [snapshot.product360]);

  const recentOrders = React.useMemo(() => {
    const query = orderQuery.trim().toLowerCase();
    const filtered = query
      ? orders.filter((order) =>
          [order.orderNo, order.customerName, order.districtNameBn, STATUS_LABELS[order.status ?? '']?.[bn ? 'bn' : 'en']]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(query)),
        )
      : orders.slice();
    const direction = orderSortState.direction === 'asc' ? 1 : -1;
    const value = (order: DashboardOrder) => {
      switch (orderSortState.key) {
        case 'totalPayablePoisha':
          return safePoisha(order.totalPayablePoisha);
        case 'status':
          return STATUS_LABELS[order.status ?? '']?.[bn ? 'bn' : 'en'] ?? order.status ?? '';
        case 'customerName':
          return order.customerName ?? '';
        case 'orderNo':
          return order.orderNo ?? '';
        default:
          return order.createdAt ?? '';
      }
    };
    return filtered.sort((a, b) => {
      const left = value(a);
      const right = value(b);
      if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
      return String(left).localeCompare(String(right)) * direction;
    });
  }, [orders, orderQuery, orderSortState, bn]);

  const toggleOrderSort = (key: typeof orderSortState.key) => {
    setOrderSortState((previous) =>
      previous.key === key
        ? { key, direction: previous.direction === 'asc' ? 'desc' : 'asc' }
        : { key, direction: key === 'createdAt' ? 'desc' : 'asc' },
    );
  };

  const pendingManualPayments = (snapshot.manualPaymentSubmissions ?? []).filter(
    (submission) => submission.status === 'pending_verification' || submission.status === 'under_review',
  ).length;
  const pendingPayouts = (snapshot.vendorEscrow?.payoutRequests ?? []).filter(
    (request) => request.status === 'requested' || request.status === 'approved',
  ).length;
  const openTickets = (snapshot.vendorSupportTickets ?? []).filter((ticket) => ticket.status === 'open').length;
  const unreadInquiries = (snapshot.inquiries ?? []).filter((inquiry) => inquiry.status === 'unread').length;

  const queues = snapshot.todayQueues ?? {};
  const greetingName = bn
    ? snapshot.currentUser?.displayNameBn || snapshot.currentUser?.username || 'অ্যাডমিন'
    : snapshot.currentUser?.displayNameEn || snapshot.currentUser?.username || 'Admin';
  const roleLabel = bn ? snapshot.activeRole?.nameBn : snapshot.activeRole?.nameEn;
  const hour = clock.getHours();
  const greeting = bn
    ? hour < 12 ? 'শুভ সকাল' : hour < 17 ? 'শুভ অপরাহ্ন' : 'শুভ সন্ধ্যা'
    : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const queueItems = [
    {
      key: 'call',
      label: bn ? 'কনফার্মেশন কল বাকি' : 'Calls to confirm',
      count: queues.callToConfirmCount ?? 0,
      tone: 'warning' as const,
      icon: <MessageSquare className="w-4 h-4" aria-hidden="true" />,
      onClick: () => onOpenOrderQueue('CALL_TO_CONFIRM'),
    },
    {
      key: 'address',
      label: bn ? 'ঠিকানা সংশোধন বাকি' : 'Address to fix',
      count: queues.fixAddressCount ?? 0,
      tone: 'danger' as const,
      icon: <TriangleAlert className="w-4 h-4" aria-hidden="true" />,
      onClick: () => onOpenOrderQueue('FIX_ADDRESS'),
    },
    {
      key: 'bkash',
      label: bn ? 'বিকাশ TrxID যাচাই' : 'bKash Trx to verify',
      count: Math.max(queues.verifyBkashCount ?? 0, pendingManualPayments),
      tone: 'warning' as const,
      icon: <Banknote className="w-4 h-4" aria-hidden="true" />,
      onClick: () => onOpenOrderQueue('VERIFY_BKASH_TRX'),
    },
    {
      key: 'pack',
      label: bn ? 'প্যাকিংয়ের জন্য প্রস্তুত' : 'Ready to pack',
      count: queues.readyToPackCount ?? 0,
      tone: 'info' as const,
      icon: <Package className="w-4 h-4" aria-hidden="true" />,
      onClick: () => onOpenOrderQueue('READY_TO_PACK'),
    },
    {
      key: 'courier',
      label: bn ? 'কুরিয়ার বুকিং বাকি' : 'Courier to book',
      count: queues.readyToBookCourierCount ?? 0,
      tone: 'info' as const,
      icon: <Truck className="w-4 h-4" aria-hidden="true" />,
      onClick: () => onOpenOrderQueue('READY_TO_BOOK_COURIER'),
    },
    {
      key: 'cod',
      label: bn ? 'সিওডি রেমিট্যান্স বাকি' : 'COD not remitted',
      count: queues.awaitingCodRemittanceCount ?? 0,
      tone: 'warning' as const,
      icon: <Wallet className="w-4 h-4" aria-hidden="true" />,
      onClick: () => onOpenOrderQueue('AWAITING_COD_REMITTANCE'),
    },
    {
      key: 'lowstock',
      label: bn ? 'লো-স্টক ভ্যারিয়েন্ট' : 'Low-stock variants',
      count: queues.lowStockVariantsCount ?? lowStock.length,
      tone: 'danger' as const,
      icon: <Boxes className="w-4 h-4" aria-hidden="true" />,
      onClick: () => onNavigate('product_studio'),
    },
    {
      key: 'inquiries',
      label: bn ? 'অপঠিত গ্রাহক বার্তা' : 'Unread customer messages',
      count: unreadInquiries,
      tone: 'neutral' as const,
      icon: <MessageSquare className="w-4 h-4" aria-hidden="true" />,
      onClick: () => onNavigate('crm_contacts'),
    },
  ];

  if (!isVendor && isSuperAdmin) {
    queueItems.push(
      {
        key: 'payouts',
        label: bn ? 'পেআউট অনুরোধ (পরিশোধ নয়)' : 'Payout requests (not paid)',
        count: pendingPayouts,
        tone: 'warning' as const,
        icon: <Wallet className="w-4 h-4" aria-hidden="true" />,
        onClick: () => onNavigate('vendor_payouts'),
      },
      {
        key: 'kyc',
        label: bn ? 'ভেন্ডর KYC / অনুরোধ' : 'Vendor KYC & requests',
        count: (snapshot.pendingVendorKycDocs?.length ?? 0) + (snapshot.pendingVendorRequests?.length ?? 0),
        tone: 'neutral' as const,
        icon: <FileCheck2 className="w-4 h-4" aria-hidden="true" />,
        onClick: () => onNavigate('vendors_hub'),
      },
      {
        key: 'tickets',
        label: bn ? 'খোলা ভেন্ডর সাপোর্ট টিকিট' : 'Open vendor tickets',
        count: openTickets,
        tone: 'neutral' as const,
        icon: <Users className="w-4 h-4" aria-hidden="true" />,
        onClick: () => onNavigate('vendors_hub'),
      },
    );
  }

  const openQueueCount = queueItems.reduce((total, item) => total + (item.count > 0 ? 1 : 0), 0);

  return (
    <section className="space-y-4 sm:space-y-5" aria-label={bn ? 'অ্যাডমিন ড্যাশবোর্ড' : 'Admin dashboard'}>
      {/* Hero */}
      <motion.div
        initial={reduced ? false : { opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45 }}
        className="relative overflow-hidden rounded-[var(--radius-lg,12px)] border border-ink/15 bg-gradient-to-br from-[#0F2A21] via-[#153A2C] to-[#1B4332] p-4 text-white sm:p-6"
      >
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 opacity-40">
          <motion.div
            className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[#7FD1A8]/30 blur-3xl"
            animate={reduced ? undefined : { scale: [1, 1.12, 1], opacity: [0.35, 0.6, 0.35] }}
            transition={{ duration: 9, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.div
            className="absolute -bottom-24 left-10 h-56 w-56 rounded-full bg-[#0EA5E9]/20 blur-3xl"
            animate={reduced ? undefined : { scale: [1.1, 1, 1.1], opacity: [0.25, 0.5, 0.25] }}
            transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <div className="relative space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 space-y-1">
              <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">
                <LayoutDashboard className="w-3 h-3" aria-hidden="true" />
                {bn ? 'কমান্ড ড্যাশবোর্ড' : 'Command dashboard'}
              </p>
              <h1 className="text-xl font-bold leading-tight sm:text-2xl">
                {greeting}, {greetingName}
              </h1>
              <p className="flex flex-wrap items-center gap-2 text-xs text-white/75">
                {roleLabel && <span className="rounded-full bg-white/10 px-2 py-0.5">{roleLabel}</span>}
                <span className="inline-flex items-center gap-1">
                  <CalendarClock className="w-3.5 h-3.5" aria-hidden="true" />
                  {new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(clock)}
                </span>
                {loadedAt && (
                  <span className="inline-flex items-center gap-1 text-white/60">
                    <Clock3 className="w-3.5 h-3.5" aria-hidden="true" />
                    {bn ? 'সর্বশেষ সিঙ্ক ' : 'Synced '}
                    {new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', { timeStyle: 'medium' }).format(loadedAt)}
                  </span>
                )}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setAutoRefresh((value) => !value)}
                aria-pressed={autoRefresh}
                className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 text-[11px] font-semibold transition-colors cursor-pointer ${autoRefresh ? 'border-emerald-300/50 bg-emerald-400/15 text-emerald-100' : 'border-white/25 text-white/70 hover:border-white/50'}`}
              >
                <span className={`h-1.5 w-1.5 rounded-full ${autoRefresh ? 'animate-pulse bg-emerald-300' : 'bg-white/50'}`} aria-hidden="true" />
                {bn ? 'লাইভ (৩ মিনিট)' : 'Live (3 min)'}
              </button>
              <button
                type="button"
                onClick={() => void refresh()}
                disabled={refreshing}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full border border-white/25 px-3 text-[11px] font-semibold text-white transition-colors hover:border-white/60 disabled:opacity-60 cursor-pointer"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} aria-hidden="true" />
                {bn ? 'রিফ্রেশ' : 'Refresh'}
              </button>
              {!isVendor && (
                <button
                  type="button"
                  onClick={() => onNavigate('smart_order_entry')}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-white px-3.5 text-[11px] font-bold text-[#0F2A21] transition-transform hover:scale-[1.02] cursor-pointer"
                >
                  <ShoppingBag className="w-3.5 h-3.5" aria-hidden="true" />
                  {bn ? 'নতুন অর্ডার' : 'New order'}
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: bn ? 'মোট অর্ডার মূল্য' : 'Total order value', value: formatPoishaToBdt(stats.revenueAll, locale) },
              { label: bn ? 'অপেক্ষমাণ কাজ' : 'Open work items', value: formatLocaleNumber(openQueueCount, locale) },
              { label: bn ? 'নিশ্চিতকরণ বাকি' : 'Awaiting confirmation', value: formatLocaleNumber(stats.pendingConfirmation, locale) },
              { label: bn ? 'ডেলিভারি সফলতার হার' : 'Delivery success', value: `${formatLocaleNumber(Math.round(stats.deliveryRate), locale)}%` },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-2">
                <p className="truncate text-[10px] uppercase tracking-[0.06em] text-white/60">{item.label}</p>
                <p className="font-mono text-sm font-bold tabular-nums text-white">{item.value}</p>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {snapshot.emergencyStopActive && (
        <div role="alert" className="flex flex-wrap items-center gap-2 rounded-[var(--radius-md)] border border-danger/40 bg-danger/10 p-3 text-xs text-danger">
          <Zap className="w-4 h-4" aria-hidden="true" />
          {bn ? 'জরুরি স্টপ চালু আছে — নতুন অর্ডার ও লেখা বন্ধ।' : 'Emergency stop is active — new orders and writes are blocked.'}
          {isSuperAdmin && (
            <button type="button" onClick={() => onNavigate('control_center')} className="ml-auto underline underline-offset-4 cursor-pointer">
              {bn ? 'কন্ট্রোল সেন্টার' : 'Control center'}
            </button>
          )}
        </div>
      )}

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          index={0}
          locale={locale}
          label={bn ? 'আজকের বিক্রি' : "Today's revenue"}
          value={stats.revenueToday}
          money
          icon={<TrendingUp className="w-4 h-4" aria-hidden="true" />}
          tone="success"
          delta={<DeltaChip current={stats.revenueToday} previous={stats.revenueYesterday} locale={locale} />}
          hint={bn ? 'বাতিল বাদে' : 'excl. cancellations'}
          onClick={() => onOpenOrderStatus('ALL')}
        />
        <KpiCard
          index={1}
          locale={locale}
          label={bn ? 'আজকের অর্ডার' : "Today's orders"}
          value={stats.ordersToday}
          icon={<ClipboardList className="w-4 h-4" aria-hidden="true" />}
          tone="info"
          delta={<DeltaChip current={stats.ordersToday} previous={stats.ordersYesterday} locale={locale} />}
          onClick={() => onNavigate('orders_grid')}
        />
        <KpiCard
          index={2}
          locale={locale}
          label={bn ? 'গড় অর্ডার মূল্য' : 'Average order value'}
          value={stats.averageOrderValue}
          money
          icon={<Gauge className="w-4 h-4" aria-hidden="true" />}
          hint={bn ? 'সব অর্ডারে' : 'across orders'}
          onClick={() => onNavigate('finance_product360')}
        />
        <KpiCard
          index={3}
          locale={locale}
          label={bn ? 'ডেলিভারি সম্পন্ন' : 'Delivered orders'}
          value={stats.delivered}
          icon={<Truck className="w-4 h-4" aria-hidden="true" />}
          tone="success"
          hint={`${formatLocaleNumber(Math.round(stats.deliveryRate), locale)}% ${bn ? 'সফল' : 'success'}`}
          onClick={() => onOpenOrderStatus('delivered')}
        />
        <KpiCard
          index={4}
          locale={locale}
          label={bn ? 'লো-স্টক ভ্যারিয়েন্ট' : 'Low-stock variants'}
          value={queues.lowStockVariantsCount ?? lowStock.length}
          icon={<Boxes className="w-4 h-4" aria-hidden="true" />}
          tone="danger"
          hint={bn ? 'পণ্য স্টুডিওতে দেখুন' : 'Open product studio'}
          onClick={() => onNavigate('product_studio')}
        />
        <KpiCard
          index={5}
          locale={locale}
          label={bn ? 'সিওডি আটকে আছে' : 'Stuck COD'}
          value={snapshot.moneyMapPnl?.totalCourierStuckCodPoisha ?? 0}
          money
          icon={<Wallet className="w-4 h-4" aria-hidden="true" />}
          tone="warning"
          hint={bn ? 'কুরিয়ারে অমীমাংসিত (হিসাব যাচাই সাপেক্ষ)' : 'Unsettled at courier (needs reconciliation)'}
          onClick={() => onOpenOrderQueue('AWAITING_COD_REMITTANCE')}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-3 xl:grid-cols-[1.55fr_1fr]">
        <Card surface="bg" padding="md" className="space-y-2">
          <TrendChart
            points={trend}
            locale={locale}
            metric={metric}
            range={range}
            onMetricChange={setMetric}
            onRangeChange={setRange}
          />
        </Card>
        <Card surface="bg" padding="md">
          <StatusDonut segments={statusSegments} total={orders.length} locale={locale} onSelect={onOpenOrderStatus} />
        </Card>
      </div>

      {/* Queues + top products */}
      <div className="grid gap-3 xl:grid-cols-[1.4fr_1fr]">
        <Card surface="bg" padding="md" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ink">{bn ? 'আজকের করণীয়' : "Today's work queue"}</h2>
              <p className="text-[11px] text-muted">{bn ? 'ক্লিক করলে সংশ্লিষ্ট তালিকা খুলবে' : 'Select a tile to open the matching queue'}</p>
            </div>
            <span className="inline-flex items-center gap-1 rounded-full bg-surface px-2 py-0.5 font-mono text-[10px] text-muted">
              <Activity className="w-3 h-3" aria-hidden="true" />
              {formatLocaleNumber(openQueueCount, locale)}
            </span>
          </div>
          <ul className="grid gap-2 sm:grid-cols-2">
            {queueItems.map((item, index) => (
              <QueueTile
                key={item.key}
                label={item.label}
                count={item.count}
                tone={item.tone}
                icon={item.icon}
                onClick={item.onClick}
                index={index}
              />
            ))}
          </ul>
        </Card>

        <Card surface="bg" padding="md" className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ink">{bn ? 'সেরা পণ্য' : 'Top products'}</h2>
              <p className="text-[11px] text-muted">{bn ? 'বাতিল বাদে বিক্রয় থেকে' : 'From non-cancelled sales'}</p>
            </div>
            <div role="group" aria-label={bn ? 'সাজানোর মাপকাঠি' : 'Ranking metric'} className="flex items-center gap-1 rounded-full border border-border bg-surface p-0.5">
              <button
                type="button"
                onClick={() => setTopMetric('revenue')}
                aria-pressed={topMetric === 'revenue'}
                className={`min-h-[28px] rounded-full px-2 text-[10px] font-semibold cursor-pointer ${topMetric === 'revenue' ? 'bg-ink text-white' : 'text-muted'}`}
              >
                {bn ? 'টাকা' : 'Revenue'}
              </button>
              <button
                type="button"
                onClick={() => setTopMetric('quantity')}
                aria-pressed={topMetric === 'quantity'}
                className={`min-h-[28px] rounded-full px-2 text-[10px] font-semibold cursor-pointer ${topMetric === 'quantity' ? 'bg-ink text-white' : 'text-muted'}`}
              >
                {bn ? 'সংখ্যা' : 'Units'}
              </button>
            </div>
          </div>
          <BarList
            rows={topProducts.map((row) => ({
              key: row.label,
              label: row.label,
              value: topMetric === 'revenue' ? row.revenue : row.quantity,
              caption:
                topMetric === 'revenue'
                  ? formatPoishaToBdt(row.revenue, locale)
                  : `${formatLocaleNumber(row.quantity, locale)} ${bn ? 'পিস' : 'pcs'}`,
            }))}
            locale={locale}
            emptyLabel={bn ? 'এখনো কোনো পণ্য বিক্রি হয়নি।' : 'No product sales yet.'}
          />
        </Card>
      </div>

      {/* Recent orders with sorting */}
      <Card surface="bg" padding="md" className="space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="text-sm font-bold text-ink">{bn ? 'সাম্প্রতিক অর্ডার' : 'Recent orders'}</h2>
            <p className="text-[11px] text-muted">
              {bn ? 'কলামে ক্লিক করে সাজান; সার্চ বক্সে খুঁজুন' : 'Select a column to sort, or search below'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
              <span className="sr-only">{bn ? 'অর্ডার খুঁজুন' : 'Search orders'}</span>
              <Search className="pointer-events-none absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                value={orderQuery}
                onChange={(event) => setOrderQuery(event.target.value)}
                placeholder={bn ? 'অর্ডার নম্বর / নাম / জেলা' : 'Order no / name / district'}
                className="min-h-[34px] w-52 rounded-lg border border-border bg-bg pl-8 pr-2 text-xs text-ink placeholder:text-muted focus:border-ink focus:outline-none"
              />
            </label>
            <button
              type="button"
              onClick={() => onNavigate('orders_grid')}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-border px-2.5 text-[11px] font-semibold text-ink transition-colors hover:border-ink cursor-pointer"
            >
              {bn ? 'সব অর্ডার' : 'All orders'}
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>

        {recentOrders.length === 0 ? (
          <p className="py-8 text-center text-xs text-muted">
            {orders.length ? (bn ? 'কোনো অর্ডার মেলেনি।' : 'No matching orders.') : bn ? 'এখনো কোনো অর্ডার নেই।' : 'No orders yet.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-left">
                  <SortableHeader label={bn ? 'অর্ডার' : 'Order'} active={orderSortState.key === 'orderNo'} direction={orderSortState.direction} onClick={() => toggleOrderSort('orderNo')} />
                  <SortableHeader label={bn ? 'গ্রাহক' : 'Customer'} active={orderSortState.key === 'customerName'} direction={orderSortState.direction} onClick={() => toggleOrderSort('customerName')} />
                  <SortableHeader label={bn ? 'অবস্থা' : 'Status'} active={orderSortState.key === 'status'} direction={orderSortState.direction} onClick={() => toggleOrderSort('status')} />
                  <SortableHeader label={bn ? 'টাকা' : 'Amount'} align="right" active={orderSortState.key === 'totalPayablePoisha'} direction={orderSortState.direction} onClick={() => toggleOrderSort('totalPayablePoisha')} />
                  <SortableHeader label={bn ? 'সময়' : 'Placed'} active={orderSortState.key === 'createdAt'} direction={orderSortState.direction} onClick={() => toggleOrderSort('createdAt')} />
                </tr>
              </thead>
              <tbody>
                {recentOrders.slice(0, 8).map((order, index) => {
                  const statusLabel = STATUS_LABELS[order.status ?? '']?.[bn ? 'bn' : 'en'] ?? order.status ?? '—';
                  return (
                    <motion.tr
                      key={order.orderNo ?? index}
                      initial={reduced ? false : { opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.25, delay: index * 0.03 }}
                      className="border-b border-border/60 last:border-b-0 hover:bg-surface/70"
                    >
                      <td className="px-2 py-2 font-mono text-[11px] text-ink">{order.orderNo ?? '—'}</td>
                      <td className="px-2 py-2">
                        <span className="block truncate text-ink">{order.customerName ?? '—'}</span>
                        <span className="block truncate text-[10px] text-muted">{order.districtNameBn ?? ''}</span>
                      </td>
                      <td className="px-2 py-2">
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                          style={{ backgroundColor: `${STATUS_COLORS[order.status ?? ''] ?? '#9CA3AF'}1A`, color: STATUS_COLORS[order.status ?? ''] ?? '#6B7280' }}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-right font-mono tabular-nums text-ink">{formatPoishaToBdt(safePoisha(order.totalPayablePoisha), locale)}</td>
                      <td className="px-2 py-2 text-muted">
                        {order.createdAt
                          ? new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(order.createdAt))
                          : '—'}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Bottom insight row */}
      <div className="grid gap-3 lg:grid-cols-3">
        <Card surface="bg" padding="md" className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-ink">{bn ? 'শীর্ষ জেলা' : 'Top districts'}</h2>
            <p className="text-[11px] text-muted">{bn ? 'অর্ডার সংখ্যা অনুযায়ী' : 'Ranked by order count'}</p>
          </div>
          <BarList rows={topDistricts} locale={locale} emptyLabel={bn ? 'জেলার তথ্য নেই।' : 'No district data.'} />
        </Card>

        <Card surface="bg" padding="md" className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ink">{bn ? 'ইনভেন্টরি অ্যালার্ট' : 'Inventory alerts'}</h2>
              <p className="text-[11px] text-muted">{bn ? 'সবচেয়ে কম স্টক আগে' : 'Lowest stock first'}</p>
            </div>
            <button type="button" onClick={() => onNavigate('product_studio')} className="text-[11px] font-semibold text-ink underline underline-offset-4 cursor-pointer">
              {bn ? 'স্টুডিও' : 'Studio'}
            </button>
          </div>
          {lowStock.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">{bn ? 'স্টক পরিস্থিতি স্বাভাবিক।' : 'Stock levels look healthy.'}</p>
          ) : (
            <ul className="space-y-1.5">
              {lowStock.map((row) => (
                <li key={row.key} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-2.5 py-1.5">
                  <span className="min-w-0">
                    <span className="block truncate text-xs text-ink">{row.label || '—'}</span>
                    <span className="block truncate text-[10px] text-muted">{row.caption}</span>
                  </span>
                  <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[10px] font-bold ${row.stock <= 0 ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                    {formatLocaleNumber(row.stock, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card surface="bg" padding="md" className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-ink">{bn ? 'সাম্প্রতিক অ্যাক্টিভিটি' : 'Recent activity'}</h2>
            <p className="text-[11px] text-muted">{bn ? 'অডিট লগ (পরিবর্তনযোগ্য নয়)' : 'Immutable audit log'}</p>
          </div>
          {(snapshot.auditLogs ?? []).length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">{bn ? 'কোনো লগ নেই।' : 'No activity recorded.'}</p>
          ) : (
            <ol className="space-y-2">
              {[...(snapshot.auditLogs ?? [])]
                .sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''))
                .slice(0, 5)
                .map((entry) => (
                  <li key={entry.id ?? `${entry.createdAt}-${entry.actionCode}`} className="flex gap-2">
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-success" aria-hidden="true" />
                    <span className="min-w-0">
                      <span className="block truncate text-xs text-ink">{entry.summaryBn || entry.actionCode || '—'}</span>
                      <span className="block text-[10px] text-muted">
                        {entry.actorUsername ?? 'system'}
                        {entry.createdAt
                          ? ` · ${new Intl.DateTimeFormat(bn ? 'bn-BD' : 'en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(entry.createdAt))}`
                          : ''}
                      </span>
                    </span>
                  </li>
                ))}
            </ol>
          )}
        </Card>
      </div>

      {/* Quick actions */}
      <Card surface="bg" padding="md" className="space-y-3">
        <h2 className="text-sm font-bold text-ink">{bn ? 'দ্রুত কাজ' : 'Quick actions'}</h2>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {[
            { key: 'smart_order_entry', label: bn ? 'নতুন অর্ডার' : 'New order', icon: <ShoppingBag className="w-4 h-4" aria-hidden="true" />, hidden: isVendor },
            { key: 'orders_grid', label: bn ? 'অর্ডার গ্রিড' : 'Orders grid', icon: <ClipboardList className="w-4 h-4" aria-hidden="true" /> },
            { key: 'product_studio', label: bn ? 'প্রোডাক্ট স্টুডিও' : 'Product studio', icon: <Package className="w-4 h-4" aria-hidden="true" /> },
            { key: 'print_engine', label: bn ? 'প্রিন্ট' : 'Print labels', icon: <Printer className="w-4 h-4" aria-hidden="true" /> },
            { key: 'courier_360', label: bn ? 'কুরিয়ার ৩৬০' : 'Courier 360', icon: <Truck className="w-4 h-4" aria-hidden="true" /> },
            { key: 'vendors_hub', label: bn ? 'ভেন্ডর হাব' : 'Vendors hub', icon: <Store className="w-4 h-4" aria-hidden="true" />, hidden: isVendor },
          ]
            .filter((action) => !action.hidden)
            .map((action) => (
              <button
                key={action.key}
                type="button"
                onClick={() => onNavigate(action.key as AdminTabKey)}
                className="inline-flex min-h-[52px] items-center gap-2 rounded-[var(--radius-md)] border border-border bg-bg px-3 text-left text-xs font-semibold text-ink transition-colors hover:border-ink hover:bg-surface cursor-pointer"
              >
                <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-surface">{action.icon}</span>
                <span className="truncate">{action.label}</span>
              </button>
            ))}
        </div>
        <p className="text-[10px] text-muted">
          {bn
            ? 'সব সংখ্যা রোল-অনুযায়ী ফিল্টার করা ওয়ার্কস্পেস স্ন্যাপশট থেকে; কুরিয়ার বুকিং ও লাইভ ট্র্যাকিং এখনো সংযুক্ত নয়, আর সিওডি/পেআউট সংখ্যা যাচাই সাপেক্ষ।'
            : 'Every figure comes from the role-filtered workspace snapshot; courier booking and live tracking are not connected, and COD/payout numbers require reconciliation.'}
        </p>
      </Card>
    </section>
  );
}

export default AdminCommandDashboard;
