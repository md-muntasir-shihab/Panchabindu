'use client';
import * as React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowDownRight,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  Clock3,
  Gauge,
  LayoutDashboard,
  Receipt,
  RefreshCw,
  Scale,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingDown,
  TrendingUp,
  Truck,
  Users,
  Wallet,
  Zap,
} from 'lucide-react';
import { Card } from '@/components/ui/primitives';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import type { AdminTabKey } from './admin-erp-client';
import {
  EXPENSE_CATEGORY_LABELS,
  PAYOUT_STATUS_LABELS,
  PNL_LINE_LABELS,
  buildPnlBreakdown,
  poisha,
  summarizeExpenses,
  summarizeVendorEscrow,
} from './dashboard-summary';

/**
 * Module: Admin money dashboard (default landing screen).
 *
 * This screen answers one question: **where is the company's money?** Revenue, cost, profit, cash
 * at the courier, vendor payable and the expense ledger — every figure is animated from the
 * role-filtered workspace snapshot, so a vendor sees only its own orders and nobody sees invented
 * numbers. The action queues (call to confirm, pack, book courier…) deliberately live on the Today
 * screen instead of being repeated here.
 */

type Locale = 'bn' | 'en';

export interface DashboardOrder {
  orderNo?: string;
  customerName?: string;
  districtNameBn?: string;
  totalPayablePoisha?: number;
  subtotalPoisha?: number;
  discountPoisha?: number;
  deliveryChargePoisha?: number;
  advancePaidPoisha?: number;
  codCollectablePoisha?: number;
  estimatedNetProfitPoisha?: number;
  snapTotalSupplierPayablePoisha?: number;
  paymentMethod?: string;
  paymentStatus?: string;
  source?: string;
  courierProvider?: string;
  status?: string;
  createdAt?: string;
  items?: Array<{ productNameBn?: string; quantity?: number; lineSubtotalPoisha?: number }>;
}

export interface DashboardSnapshot {
  orders?: DashboardOrder[];
  moneyMapPnl?: {
    courierInTransitCodPoisha?: number;
    courierDeliveredUnsettledCodPoisha?: number;
    totalCourierStuckCodPoisha?: number;
    vendorPendingPoisha?: number;
    vendorLockedPoisha?: number;
    vendorAvailablePoisha?: number;
    vendorPayoutHoldPoisha?: number;
    totalExpensesPoisha?: number;
    estimatedOwnLiquidCashPoisha?: number;
    deliveredGrossSalesPoisha?: number;
    totalSupplierPayablePoisha?: number;
    totalPromoDiscountPoisha?: number;
    totalAdSpendPoisha?: number;
    totalPackagingCostPoisha?: number;
    totalUnrecoveredCourierCostPoisha?: number;
    totalDamageLossPoisha?: number;
    totalOtherExpensesPoisha?: number;
    autoNetProfitPoisha?: number;
    isNetLoss?: boolean;
    channelRoas?: Array<{
      source?: string;
      ordersCount?: number;
      revenuePoisha?: number;
      adSpendPoisha?: number;
      cpoPoisha?: number;
      roasMultiple?: string;
    }>;
  } | null;
  expenses?: Array<{
    id?: string;
    category?: string;
    sourceChannel?: string;
    campaignName?: string;
    amountPoisha?: number;
    expenseDate?: string;
    isRecurring?: boolean;
    noteBn?: string;
  }>;
  vendorEscrow?: {
    vendors?: Array<{
      profile?: { vendorId?: string; businessNameBn?: string; businessNameEn?: string; status?: string };
      balance?: {
        pendingPoisha?: number;
        lockedPoisha?: number;
        availablePoisha?: number;
        payoutHoldPoisha?: number;
        clawbackDebtPoisha?: number;
        withdrawablePoisha?: number;
      };
    }>;
    payoutRequests?: Array<{ status?: string; requestedAmountPoisha?: number; vendorNameBn?: string }>;
  } | null;
  remittanceLedger?: Array<{
    id?: string;
    courierProvider?: string;
    expectedCodPoisha?: number;
    courierFeeDeductedPoisha?: number;
    remittedAmountPoisha?: number;
    shortPaymentPoisha?: number;
    isShortPaymentFlagged?: boolean;
  }>;
  product360?: Array<{
    productId?: string;
    productNameBn?: string;
    variantTitleBn?: string;
    stockAvailable?: number;
    daysOfCover?: number;
  }>;
  vendorSupportTickets?: Array<{ status?: string }>;
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

function monthLabel(key: string, locale: Locale): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat(locale === 'bn' ? 'bn-BD' : 'en-GB', { month: 'short' }).format(new Date(year, month - 1, 1));
}

/* ------------------------------------------------------------------ animation */

function useAnimatedNumber(value: number, durationMs = 720): number {
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
  suffix,
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
  suffix?: string;
}) {
  const animated = useAnimatedNumber(value);
  const displayValue = money
    ? formatPoishaToBdt(Math.round(animated) || 0, locale)
    : `${formatLocaleNumber(Math.round(animated), locale)}${suffix ?? ''}`;
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

function Ring({
  fraction,
  valueText,
  caption,
  tone,
  locale,
}: {
  fraction: number;
  valueText: string;
  caption: string;
  tone: 'success' | 'warning' | 'danger';
  locale: Locale;
}) {
  const reduced = useReducedMotion();
  const size = 132;
  const stroke = 13;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const colors: Record<string, string> = { success: '#7FD1A8', warning: '#FBBF24', danger: '#F87171' };
  const clamped = Math.min(1, Math.max(0, fraction));
  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label={`${caption}: ${valueText}`}
      className="shrink-0"
    >
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="rgba(255,255,255,0.16)" strokeWidth={stroke} />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={colors[tone]}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={reduced ? false : { strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: circumference * (1 - clamped) }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
      <text x="50%" y="47%" textAnchor="middle" className="fill-current text-[19px] font-bold tabular-nums text-white">
        {valueText}
      </text>
      <text x="50%" y="61%" textAnchor="middle" className="fill-current text-[9px] uppercase tracking-[0.09em] text-white/60">
        {caption}
      </text>
      <title>{locale === 'bn' ? 'লাইভ হিসাব' : 'Live figures'}</title>
    </svg>
  );
}

function StackedBar({
  segments,
  locale,
  emptyLabel,
}: {
  segments: Array<{ key: string; label: string; value: number; color: string }>;
  locale: Locale;
  emptyLabel: string;
}) {
  const visible = segments.filter((segment) => segment.value > 0);
  const total = visible.reduce((sum, segment) => sum + segment.value, 0);
  if (!visible.length) return <p className="py-4 text-center text-xs text-muted">{emptyLabel}</p>;
  return (
    <div className="space-y-2">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface" role="img" aria-label={visible.map((segment) => `${segment.label}: ${formatPoishaToBdt(segment.value, locale)}`).join(', ')}>
        {visible.map((segment, index) => (
          <motion.span
            key={segment.key}
            className="h-full first:rounded-l-full last:rounded-r-full"
            style={{ backgroundColor: segment.color }}
            initial={{ width: 0 }}
            animate={{ width: `${(segment.value / total) * 100}%` }}
            transition={{ duration: 0.7, ease: 'easeOut', delay: index * 0.06 }}
          />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted">
        {visible.map((segment) => (
          <li key={segment.key} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: segment.color }} aria-hidden="true" />
            <span>{segment.label}</span>
            <span className="font-mono tabular-nums text-ink">{formatPoishaToBdt(segment.value, locale)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function BarList({
  rows,
  locale,
  emptyLabel,
  tone = 'brand',
}: {
  rows: Array<{ key: string; label: string; value: number; caption?: string }>;
  locale: Locale;
  emptyLabel: string;
  tone?: 'brand' | 'cost';
}) {
  const max = Math.max(1, ...rows.map((row) => Math.abs(row.value)));
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
              className={`h-full rounded-full ${tone === 'cost' ? 'bg-gradient-to-r from-[#D97706] to-[#DC2626]' : 'bg-gradient-to-r from-[#15803D] to-[#0EA5E9]'}`}
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(4, (Math.abs(row.value) / max) * 100)}%` }}
              transition={{ duration: 0.6, ease: 'easeOut', delay: index * 0.04 }}
            />
          </div>
        </motion.li>
      ))}
    </ul>
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
          <h2 className="text-sm font-bold text-ink">{locale === 'bn' ? 'বিক্রয়ের গতি' : 'Sales momentum'}</h2>
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
              {formatPoishaToBdt(poisha(hovered.revenue), locale)}
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
  const bn = locale === 'bn';
  const reduced = useReducedMotion();
  const [range, setRange] = React.useState<7 | 14 | 30>(14);
  const [metric, setMetric] = React.useState<'revenue' | 'orders'>('revenue');
  const [expenseRange, setExpenseRange] = React.useState<3 | 6 | 12>(6);
  const [refreshing, setRefreshing] = React.useState(false);
  // The workspace snapshot carries the whole runtime document set, so live polling stays opt-in
  // and deliberately slow: an admin who needs fresher data presses refresh.
  const [autoRefresh, setAutoRefresh] = React.useState(false);
  const [clock, setClock] = React.useState(() => new Date());

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
    const sum = (list: DashboardOrder[]) => list.reduce((total, order) => total + poisha(order.totalPayablePoisha), 0);
    const deliveredOrders = orders.filter((order) => order.status === 'delivered');
    const returnedOrders = orders.filter((order) => order.status === 'returned' || order.status === 'return_initiated');
    const cancelledOrders = orders.filter((order) => order.status === 'cancelled');
    const delivered = deliveredOrders.length;
    const returned = returnedOrders.length;
    const deliveryRate = delivered + returned > 0 ? (delivered / (delivered + returned)) * 100 : 0;
    const deliveredValue = deliveredOrders.reduce((total, order) => total + poisha(order.totalPayablePoisha), 0);
    const supplierPayable = deliveredOrders.reduce(
      (total, order) => total + poisha(order.snapTotalSupplierPayablePoisha),
      0,
    );
    const estimatedNet = deliveredOrders.reduce((total, order) => total + poisha(order.estimatedNetProfitPoisha), 0);
    return {
      revenueToday: sum(todayOrders),
      revenueYesterday: sum(yesterdayOrders),
      ordersToday: todayOrders.length,
      ordersYesterday: yesterdayOrders.length,
      averageOrderValue: countingOrders.length ? Math.round(sum(countingOrders) / countingOrders.length) : 0,
      revenueAll: sum(countingOrders),
      collected: countingOrders.reduce((total, order) => total + poisha(order.advancePaidPoisha), 0),
      delivered,
      returned,
      cancelled: cancelledOrders.length,
      deliveredValue,
      supplierPayable,
      estimatedNet,
      deliveryRate,
      returnedValue: returnedOrders.reduce((total, order) => total + poisha(order.totalPayablePoisha), 0),
      cancelledValue: cancelledOrders.reduce((total, order) => total + poisha(order.totalPayablePoisha), 0),
    };
  }, [countingOrders, orders, todayKey, yesterdayKey]);

  const pnl = React.useMemo(() => buildPnlBreakdown(snapshot.moneyMapPnl), [snapshot.moneyMapPnl]);
  const expenseSummary = React.useMemo(
    () => summarizeExpenses(snapshot.expenses, { monthCount: expenseRange, now: clock }),
    // `clock` only advances the month window every 30s; minutes-level churn is not worth it.
    [snapshot.expenses, expenseRange],
  );
  const vendorSummary = React.useMemo(
    () => summarizeVendorEscrow(snapshot.vendorEscrow?.vendors, snapshot.vendorEscrow?.payoutRequests),
    [snapshot.vendorEscrow],
  );

  const remittance = React.useMemo(() => {
    const rows = snapshot.remittanceLedger ?? [];
    return {
      count: rows.length,
      remitted: rows.reduce((total, row) => total + poisha(row.remittedAmountPoisha), 0),
      fees: rows.reduce((total, row) => total + poisha(row.courierFeeDeductedPoisha), 0),
      short: rows.reduce((total, row) => total + poisha(row.shortPaymentPoisha), 0),
      flagged: rows.filter((row) => row.isShortPaymentFlagged).length,
    };
  }, [snapshot.remittanceLedger]);

  /**
   * Company-wide money is only meaningful when the server sent the profit block; vendors and
   * restricted roles get an honest, smaller dashboard instead of fake zeros.
   */
  const showFinance = !isVendor && Boolean(snapshot.moneyMapPnl);
  const showVendorLedger = !isVendor && isSuperAdmin && Boolean(snapshot.vendorEscrow?.vendors?.length);
  const showExpenses = !isVendor && Boolean(snapshot.expenses?.length);

  const courierStuck = poisha(snapshot.moneyMapPnl?.totalCourierStuckCodPoisha);
  const courierInTransit = poisha(snapshot.moneyMapPnl?.courierInTransitCodPoisha);
  const courierUnsettled = poisha(snapshot.moneyMapPnl?.courierDeliveredUnsettledCodPoisha) || Math.max(0, courierStuck - courierInTransit);
  const vendorPayable = showVendorLedger
    ? vendorSummary.totals.payableToVendors
    : poisha(snapshot.moneyMapPnl?.vendorPendingPoisha) +
      poisha(snapshot.moneyMapPnl?.vendorLockedPoisha) +
      poisha(snapshot.moneyMapPnl?.vendorAvailablePoisha) +
      poisha(snapshot.moneyMapPnl?.vendorPayoutHoldPoisha);
  const liquidCash = poisha(snapshot.moneyMapPnl?.estimatedOwnLiquidCashPoisha);
  const costRatio = pnl.gross > 0 ? (pnl.totalCost / pnl.gross) * 100 : pnl.totalCost > 0 ? 100 : 0;

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
      bucket.revenue += poisha(order.totalPayablePoisha);
      bucket.orders += 1;
    }
    return [...buckets.entries()].map(([key, value]) => ({
      key,
      label: dayLabel(new Date(`${key}T00:00:00`), locale),
      revenue: value.revenue,
      orders: value.orders,
    }));
  }, [countingOrders, locale, range]);

  const topProducts = React.useMemo(() => {
    const map = new Map<string, { label: string; revenue: number; quantity: number }>();
    for (const order of countingOrders) {
      for (const item of order.items ?? []) {
        const label = item.productNameBn?.trim() || (bn ? 'অজানা পণ্য' : 'Unknown product');
        const current = map.get(label) ?? { label, revenue: 0, quantity: 0 };
        current.revenue += poisha(item.lineSubtotalPoisha);
        current.quantity += Number(item.quantity) || 0;
        map.set(label, current);
      }
    }
    return [...map.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [countingOrders, bn]);

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

  const channels = React.useMemo(
    () =>
      (snapshot.moneyMapPnl?.channelRoas ?? [])
        .map((row) => ({
          key: row.source ?? 'other',
          revenue: poisha(row.revenuePoisha),
          spend: poisha(row.adSpendPoisha),
          orders: Number(row.ordersCount) || 0,
          roas: row.roasMultiple ?? '—',
        }))
        .sort((a, b) => b.revenue - a.revenue),
    [snapshot.moneyMapPnl?.channelRoas],
  );

  const greetingName = bn
    ? snapshot.currentUser?.displayNameBn || snapshot.currentUser?.username || 'অ্যাডমিন'
    : snapshot.currentUser?.displayNameEn || snapshot.currentUser?.username || 'Admin';
  const roleLabel = bn ? snapshot.activeRole?.nameBn : snapshot.activeRole?.nameEn;
  const hour = clock.getHours();
  const greeting = bn
    ? hour < 12 ? 'শুভ সকাল' : hour < 17 ? 'শুভ অপরাহ্ন' : 'শুভ সন্ধ্যা'
    : hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const heroStats = showFinance
    ? [
        { label: bn ? 'ডেলিভারি বিক্রি' : 'Delivered sales', value: formatPoishaToBdt(pnl.gross, locale) },
        { label: bn ? 'মোট খরচ' : 'Total cost', value: formatPoishaToBdt(pnl.totalCost, locale) },
        {
          label: pnl.isNetLoss ? (bn ? 'নিট লোকসান' : 'Net loss') : bn ? 'নিট লাভ' : 'Net profit',
          value: formatPoishaToBdt(Math.abs(pnl.net), locale),
        },
        { label: bn ? 'হাতে নগদ (আনুমানিক)' : 'Liquid cash (est.)', value: formatPoishaToBdt(liquidCash, locale) },
      ]
    : [
        { label: bn ? 'মোট অর্ডার মূল্য' : 'Order value', value: formatPoishaToBdt(stats.revenueAll, locale) },
        { label: bn ? 'ডেলিভারি সম্পন্ন' : 'Delivered', value: formatLocaleNumber(stats.delivered, locale) },
        { label: bn ? 'গড় অর্ডার' : 'Average order', value: formatPoishaToBdt(stats.averageOrderValue, locale) },
        { label: bn ? 'ফেরতের মূল্য' : 'Returned value', value: formatPoishaToBdt(stats.returnedValue, locale) },
      ];

  const ringValue = showFinance ? costRatio : stats.deliveryRate;
  const ringText = `${formatLocaleNumber(Math.round(Math.abs(ringValue)), locale)}%`;
  const ringCaption = showFinance
    ? bn ? 'খরচ / বিক্রি' : 'cost / sales'
    : bn ? 'ডেলিভারি সফল' : 'delivered';
  const ringTone: 'success' | 'warning' | 'danger' = showFinance
    ? costRatio > 100 ? 'danger' : costRatio > 70 ? 'warning' : 'success'
    : stats.deliveryRate >= 85 ? 'success' : stats.deliveryRate >= 60 ? 'warning' : 'danger';

  const kpis: Array<React.ComponentProps<typeof KpiCard>> = showFinance
    ? [
        {
          index: 0,
          locale,
          // Per-delivery profit instead of repeating the headline net figure a third time.
          label: pnl.isNetLoss ? (bn ? 'প্রতি ডেলিভারিতে ক্ষতি' : 'Loss per delivery') : bn ? 'প্রতি ডেলিভারিতে লাভ' : 'Profit per delivery',
          value: stats.delivered > 0 ? Math.round(pnl.net / stats.delivered) : 0,
          money: true,
          icon: pnl.isNetLoss ? <TrendingDown className="w-4 h-4" aria-hidden="true" /> : <TrendingUp className="w-4 h-4" aria-hidden="true" />,
          tone: pnl.isNetLoss ? 'danger' : 'success',
          hint: `${formatLocaleNumber(stats.delivered, locale)} ${bn ? 'ডেলিভারি' : 'deliveries'} · ${formatLocaleNumber(Math.round(Math.abs(pnl.marginPercent)), locale)}% ${bn ? 'মার্জিন' : 'margin'}`,
        },
        {
          index: 1,
          locale,
          label: bn ? 'আজকের বিক্রি' : "Today's revenue",
          value: stats.revenueToday,
          money: true,
          icon: <Gauge className="w-4 h-4" aria-hidden="true" />,
          tone: 'info',
          delta: <DeltaChip current={stats.revenueToday} previous={stats.revenueYesterday} locale={locale} />,
          hint: bn ? 'বাতিল বাদে' : 'excl. cancellations',
          onClick: () => onOpenOrderStatus('ALL'),
        },
        {
          index: 2,
          locale,
          label: bn ? 'কুরিয়ারে আটকে সিওডি' : 'COD stuck at courier',
          value: courierStuck,
          money: true,
          icon: <Truck className="w-4 h-4" aria-hidden="true" />,
          tone: 'warning',
          hint: bn ? 'মিলান সাপেক্ষ' : 'needs reconciliation',
          onClick: () => onOpenOrderQueue('AWAITING_COD_REMITTANCE'),
        },
        {
          index: 3,
          locale,
          label: bn ? 'ভেন্ডরকে দিতে হবে' : 'Owed to vendors',
          value: vendorPayable,
          money: true,
          icon: <Store className="w-4 h-4" aria-hidden="true" />,
          tone: 'info',
          hint: bn ? 'এসক্রোতে' : 'in escrow',
          onClick: () => onNavigate('vendor_payouts'),
        },
        {
          index: 4,
          locale,
          label: bn ? 'লেজারে লেখা খরচ' : 'Logged expenses',
          value: expenseSummary.total || poisha(snapshot.moneyMapPnl?.totalExpensesPoisha),
          money: true,
          icon: <Receipt className="w-4 h-4" aria-hidden="true" />,
          tone: 'danger',
          hint: bn ? 'বিজ্ঞাপন, প্যাকেজিং, পরিচালনা' : 'ads, packaging, operations',
          onClick: () => onNavigate('finance_product360'),
        },
        {
          index: 5,
          locale,
          label: bn ? 'হাতে নগদ (আনুমানিক)' : 'Liquid cash (est.)',
          value: liquidCash,
          money: true,
          icon: <Wallet className="w-4 h-4" aria-hidden="true" />,
          tone: 'success',
          hint: bn ? 'কুরিয়ার মিলান বাদে' : 'after courier settlement',
        },
      ]
    : [
        {
          index: 0,
          locale,
          label: bn ? 'মোট অর্ডার মূল্য' : 'Total order value',
          value: stats.revenueAll,
          money: true,
          icon: <ShoppingBag className="w-4 h-4" aria-hidden="true" />,
          tone: 'info',
          hint: bn ? 'বাতিল বাদে' : 'excl. cancellations',
          onClick: () => onOpenOrderStatus('ALL'),
        },
        {
          index: 1,
          locale,
          label: bn ? 'আজকের বিক্রি' : "Today's revenue",
          value: stats.revenueToday,
          money: true,
          icon: <Gauge className="w-4 h-4" aria-hidden="true" />,
          delta: <DeltaChip current={stats.revenueToday} previous={stats.revenueYesterday} locale={locale} />,
        },
        {
          index: 2,
          locale,
          label: bn ? 'ডেলিভারি সম্পন্ন' : 'Delivered',
          value: stats.delivered,
          icon: <Truck className="w-4 h-4" aria-hidden="true" />,
          tone: 'success',
          hint: `${formatLocaleNumber(Math.round(stats.deliveryRate), locale)}% ${bn ? 'সফল' : 'success'}`,
          onClick: () => onOpenOrderStatus('delivered'),
        },
        {
          index: 3,
          locale,
          label: bn ? 'ফেরতের মূল্য' : 'Returned value',
          value: stats.returnedValue,
          money: true,
          icon: <Scale className="w-4 h-4" aria-hidden="true" />,
          tone: 'danger',
          hint: `${formatLocaleNumber(stats.returned, locale)} ${bn ? 'টি অর্ডার' : 'orders'}`,
        },
      ];

  return (
    <section className="space-y-4 sm:space-y-5" aria-label={bn ? 'কোম্পানির আর্থিক ড্যাশবোর্ড' : 'Company money dashboard'}>
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

        <div className="relative grid gap-4 lg:grid-cols-[1fr_auto] lg:items-center">
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-2 py-0.5 font-mono text-[10px] uppercase tracking-[0.14em] text-white/80">
                  <LayoutDashboard className="w-3 h-3" aria-hidden="true" />
                  {bn ? 'কোম্পানির টাকার হিসাব' : 'Company money'}
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
              {heroStats.map((item) => (
                <div key={item.label} className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-2">
                  <p className="truncate text-[10px] uppercase tracking-[0.06em] text-white/60">{item.label}</p>
                  <p className="mt-0.5 font-mono text-sm font-bold tabular-nums text-white">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-center gap-4 lg:flex-col">
            <Ring fraction={ringValue / 100} valueText={ringText} caption={ringCaption} tone={ringTone} locale={locale} />
            <button
              type="button"
              onClick={() => onNavigate('today_screen')}
              className="inline-flex min-h-[36px] items-center gap-1 rounded-full border border-white/25 px-3 text-[11px] font-semibold text-white transition-colors hover:border-white/60 cursor-pointer"
            >
              {bn ? 'আজকের কাজ' : "Today's work"}
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
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
      <div className={`grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${showFinance ? 'xl:grid-cols-6' : 'xl:grid-cols-4'}`}>
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} />
        ))}
      </div>

      {/* Profit and loss */}
      {showFinance && (
        <Card surface="bg" padding="md" className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ink">{bn ? 'লাভ-ক্ষতির হিসাব' : 'Profit and loss'}</h2>
              <p className="text-[11px] text-muted">
                {bn
                  ? 'শুধু ডেলিভারি হওয়া অর্ডারের টাকা থেকে, সার্ভারের হিসাব অনুযায়ী'
                  : 'From delivered orders only, following the server-calculated ledger'}
              </p>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-mono text-[11px] font-bold ${pnl.isNetLoss ? 'bg-danger/10 text-danger' : 'bg-success/10 text-success'}`}
            >
              {pnl.isNetLoss ? <TrendingDown className="w-3.5 h-3.5" aria-hidden="true" /> : <TrendingUp className="w-3.5 h-3.5" aria-hidden="true" />}
              {pnl.isNetLoss ? (bn ? 'লোকসান ' : 'loss ') : bn ? 'লাভ ' : 'profit '}
              {formatPoishaToBdt(Math.abs(pnl.net), locale)}
            </span>
          </div>

          {pnl.isEmpty ? (
            <p className="py-6 text-center text-xs text-muted">
              {bn
                ? 'এখনো ডেলিভারি হওয়া বিক্রি বা খরচ নেই — হিসাব শুরু হলে এখানে লাইন ধরে দেখাবে।'
                : 'No delivered sales or expenses yet — the breakdown appears as soon as there is money to explain.'}
            </p>
          ) : (
            <div className="space-y-2.5">
              <PnlLine
                label={bn ? 'ডেলিভারি হওয়া বিক্রি' : 'Delivered sales'}
                amount={pnl.gross}
                share={1}
                locale={locale}
                tone="revenue"
                index={0}
              />
              {pnl.costs.map((row, index) => (
                <PnlLine
                  key={row.key}
                  label={PNL_LINE_LABELS[row.key]?.[bn ? 'bn' : 'en'] ?? row.key}
                  amount={row.amount}
                  share={row.share}
                  locale={locale}
                  tone="cost"
                  index={index + 1}
                />
              ))}
              <div className="border-t border-border pt-2">
                <PnlLine
                  label={pnl.isNetLoss ? (bn ? 'নিট লোকসান' : 'Net loss') : bn ? 'নিট লাভ' : 'Net profit'}
                  amount={pnl.net}
                  share={Math.min(1, Math.abs(pnl.net) / Math.max(pnl.gross, 1))}
                  locale={locale}
                  tone={pnl.isNetLoss ? 'loss' : 'profit'}
                  index={pnl.costs.length + 1}
                  emphasis
                />
              </div>
            </div>
          )}
        </Card>
      )}

      {/* Money map + remittance */}
      <div className="grid gap-3 xl:grid-cols-[1.25fr_1fr]">
        {showFinance && (
          <Card surface="bg" padding="md" className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-ink">{bn ? 'টাকা এখন কোথায়' : 'Where the money sits'}</h2>
              <p className="text-[11px] text-muted">
                {bn ? 'কুরিয়ার, ভেন্ডর এসক্রো ও নিজের হাতে — এক নজরে' : 'Courier, vendor escrow and your own cash, at a glance'}
              </p>
            </div>
            <StackedBar
              locale={locale}
              emptyLabel={bn ? 'এখনো কোনো টাকা আটকে নেই।' : 'No money is tied up right now.'}
              segments={[
                { key: 'courier', label: bn ? 'কুরিয়ারে সিওডি' : 'COD at courier', value: courierStuck, color: '#D97706' },
                { key: 'vendor', label: bn ? 'ভেন্ডর এসক্রো' : 'Vendor escrow', value: vendorPayable, color: '#2563EB' },
                { key: 'cash', label: bn ? 'নিজের নগদ' : 'Own cash', value: liquidCash, color: '#15803D' },
              ]}
            />
            <dl className="grid grid-cols-2 gap-2 text-[11px] sm:grid-cols-3">
              {[
                { label: bn ? 'পথে আছে' : 'In transit', value: courierInTransit },
                { label: bn ? 'ডেলিভারি, মিলান বাকি' : 'Delivered, unsettled', value: courierUnsettled },
                { label: bn ? 'ভেন্ডর পেআউট হোল্ড' : 'Vendor payout hold', value: poisha(snapshot.moneyMapPnl?.vendorPayoutHoldPoisha) },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-surface px-2 py-1.5">
                  <dt className="truncate text-[10px] text-muted">{item.label}</dt>
                  <dd className="font-mono text-xs font-semibold tabular-nums text-ink">{formatPoishaToBdt(item.value, locale)}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        <Card surface="bg" padding="md" className="space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ink">{bn ? 'কুরিয়ার মিলান' : 'Courier reconciliation'}</h2>
              <p className="text-[11px] text-muted">
                {bn ? 'রেমিট্যান্স লেজার থেকে' : 'From the remittance ledger'}
              </p>
            </div>
            {remittance.flagged > 0 && (
              <span className="rounded-full bg-danger/10 px-2 py-0.5 font-mono text-[10px] font-bold text-danger">
                {formatLocaleNumber(remittance.flagged, locale)} {bn ? 'শর্ট' : 'short'}
              </span>
            )}
          </div>
          {remittance.count === 0 ? (
            <p className="py-6 text-center text-xs text-muted">
              {bn ? 'এখনো কোনো রেমিট্যান্স রেকর্ড নেই।' : 'No remittance recorded yet.'}
            </p>
          ) : (
            <dl className="grid grid-cols-2 gap-2 text-[11px]">
              {[
                { label: bn ? 'রেমিট্যান্স' : 'Remitted', value: remittance.remitted },
                { label: bn ? 'কুরিয়ার ফি কাটা' : 'Courier fee', value: remittance.fees },
                { label: bn ? 'শর্ট পেমেন্ট' : 'Short payment', value: remittance.short },
                { label: bn ? 'রেকর্ড সংখ্যা' : 'Records', value: remittance.count, count: true },
              ].map((item) => (
                <div key={item.label} className="rounded-lg border border-border bg-surface px-2 py-1.5">
                  <dt className="truncate text-[10px] text-muted">{item.label}</dt>
                  <dd className="font-mono text-xs font-semibold tabular-nums text-ink">
                    {item.count ? formatLocaleNumber(item.value, locale) : formatPoishaToBdt(item.value, locale)}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          <button
            type="button"
            onClick={() => onNavigate('courier_360')}
            className="inline-flex min-h-[32px] items-center gap-1 text-[11px] font-semibold text-ink underline underline-offset-4 cursor-pointer"
          >
            {bn ? 'কুরিয়ার ৩৬০ খুলুন' : 'Open Courier 360'}
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </Card>
      </div>

      {/* Vendor ledger */}
      {showVendorLedger && (
        <Card surface="bg" padding="md" className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-bold text-ink">{bn ? 'ভেন্ডর পাওনা ও পেআউট' : 'Vendor payable and payouts'}</h2>
              <p className="text-[11px] text-muted">
                {bn ? 'এসক্রো ব্যালান্স আলাদা ব্যালান্স; অনুরোধ করা পেআউট মানেই পরিশোধ নয়।' : 'Escrow buckets are separate; a requested payout is not a paid one.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {vendorSummary.payoutsByStatus.length === 0 ? (
                <span className="text-[11px] text-muted">{bn ? 'কোনো পেআউট অনুরোধ নেই' : 'No payout requests'}</span>
              ) : (
                vendorSummary.payoutsByStatus.map((row) => (
                  <span key={row.key} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface px-2 py-0.5 text-[10px]">
                    <span className="text-muted">{PAYOUT_STATUS_LABELS[row.key]?.[bn ? 'bn' : 'en'] ?? row.key}</span>
                    <span className="font-mono font-semibold tabular-nums text-ink">{formatPoishaToBdt(row.amount, locale)}</span>
                    <span className="text-muted">· {formatLocaleNumber(row.count, locale)}</span>
                  </span>
                ))
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { label: bn ? 'পেন্ডিং' : 'Pending', value: vendorSummary.totals.pending, color: 'text-muted' },
              { label: bn ? 'লকড' : 'Locked', value: vendorSummary.totals.locked, color: 'text-info' },
              { label: bn ? 'ছাড়যোগ্য' : 'Available', value: vendorSummary.totals.available, color: 'text-success' },
              { label: bn ? 'পেআউট হোল্ড' : 'Payout hold', value: vendorSummary.totals.hold, color: 'text-warning' },
            ].map((item) => (
              <div key={item.label} className="rounded-lg border border-border bg-surface px-2 py-1.5">
                <p className="text-[10px] text-muted">{item.label}</p>
                <p className={`font-mono text-xs font-bold tabular-nums ${item.color}`}>{formatPoishaToBdt(item.value, locale)}</p>
              </div>
            ))}
          </div>

          {vendorSummary.rows.length === 0 ? (
            <p className="py-6 text-center text-xs text-muted">{bn ? 'ভেন্ডর তালিকা খালি।' : 'No vendors on the ledger yet.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.06em] text-muted">
                    <th scope="col" className="px-2 py-2 font-semibold">{bn ? 'ভেন্ডর' : 'Vendor'}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{bn ? 'পেন্ডিং + লকড' : 'Pending + locked'}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{bn ? 'ছাড়যোগ্য' : 'Available'}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{bn ? 'হোল্ড' : 'Hold'}</th>
                    <th scope="col" className="px-2 py-2 text-right font-semibold">{bn ? 'মোট পাওনা' : 'Total owed'}</th>
                  </tr>
                </thead>
                <tbody>
                  {vendorSummary.rows.slice(0, 6).map((row, index) => {
                    const pending = poisha(row.balance.pendingPoisha);
                    const locked = poisha(row.balance.lockedPoisha);
                    const available = poisha(row.balance.availablePoisha);
                    const hold = poisha(row.balance.payoutHoldPoisha);
                    const total = pending + locked + available + hold;
                    return (
                      <motion.tr
                        key={row.vendorId || index}
                        initial={reduced ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.25, delay: index * 0.04 }}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <td className="px-2 py-2">
                          <span className="block truncate text-ink">{bn ? row.nameBn || row.nameEn || '—' : row.nameEn || row.nameBn || '—'}</span>
                        </td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-ink">{formatPoishaToBdt(pending + locked, locale)}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-success">{formatPoishaToBdt(available, locale)}</td>
                        <td className="px-2 py-2 text-right font-mono tabular-nums text-warning">{formatPoishaToBdt(hold, locale)}</td>
                        <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums text-ink">{formatPoishaToBdt(total, locale)}</td>
                      </motion.tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border text-[11px]">
                    <th scope="row" className="px-2 py-2 text-left font-semibold text-muted">{bn ? 'মোট' : 'Total'}</th>
                    <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums text-ink">
                      {formatPoishaToBdt(vendorSummary.totals.pending + vendorSummary.totals.locked, locale)}
                    </td>
                    <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums text-ink">{formatPoishaToBdt(vendorSummary.totals.available, locale)}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums text-ink">{formatPoishaToBdt(vendorSummary.totals.hold, locale)}</td>
                    <td className="px-2 py-2 text-right font-mono font-semibold tabular-nums text-ink">{formatPoishaToBdt(vendorSummary.totals.payableToVendors, locale)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
          <button
            type="button"
            onClick={() => onNavigate('vendor_payouts')}
            className="inline-flex min-h-[32px] items-center gap-1 text-[11px] font-semibold text-ink underline underline-offset-4 cursor-pointer"
          >
            {bn ? 'পেআউট লেজার খুলুন' : 'Open payout ledger'}
            <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </Card>
      )}

      {/* Expenses */}
      {showExpenses && (
        <div className="grid gap-3 xl:grid-cols-[1.15fr_1fr]">
          <Card surface="bg" padding="md" className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-ink">{bn ? 'খরচের বিভাজন' : 'Expense breakdown'}</h2>
                <p className="text-[11px] text-muted">
                  {bn ? 'মোট ' : 'Total '}
                  {formatPoishaToBdt(expenseSummary.total, locale)}
                  {expenseSummary.recurring > 0 && (
                    <>
                      {' · '}
                      {bn ? 'নিয়মিত ' : 'recurring '}
                      {formatPoishaToBdt(expenseSummary.recurring, locale)}
                    </>
                  )}
                </p>
              </div>
              <div role="group" aria-label={bn ? 'মাসের পরিসর' : 'Month range'} className="flex items-center gap-1 rounded-full border border-border bg-surface p-0.5">
                {([3, 6, 12] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setExpenseRange(option)}
                    aria-pressed={expenseRange === option}
                    className={`min-h-[28px] rounded-full px-2 text-[10px] font-semibold cursor-pointer ${expenseRange === option ? 'bg-ink text-white' : 'text-muted'}`}
                  >
                    {formatLocaleNumber(option, locale)}{bn ? 'মাস' : 'm'}
                  </button>
                ))}
              </div>
            </div>
            <BarList
              locale={locale}
              tone="cost"
              rows={expenseSummary.byCategory.map((row) => ({
                key: row.key,
                label: EXPENSE_CATEGORY_LABELS[row.key]?.[bn ? 'bn' : 'en'] ?? row.key,
                value: row.amount,
                caption: `${formatPoishaToBdt(row.amount, locale)} · ${formatLocaleNumber(Math.round(row.share * 100), locale)}%`,
              }))}
              emptyLabel={bn ? 'এই সময়ে কোনো খরচ নেই।' : 'No expenses in this period.'}
            />
            <div>
              <p className="mb-1 text-[10px] uppercase tracking-[0.07em] text-muted">{bn ? 'মাস অনুযায়ী' : 'By month'}</p>
              <ExpenseColumns
                rows={expenseSummary.byMonth.map((row) => ({ key: row.key, label: monthLabel(row.key, locale), value: row.amount }))}
                locale={locale}
              />
            </div>
          </Card>

          <Card surface="bg" padding="md" className="space-y-3">
            <div>
              <h2 className="text-sm font-bold text-ink">{bn ? 'ক্যাম্পেইন খরচ' : 'Campaign spend'}</h2>
              <p className="text-[11px] text-muted">{bn ? 'সবচেয়ে বেশি খরচ হওয়া ক্যাম্পেইন' : 'Highest spending campaigns'}</p>
            </div>
            <BarList
              locale={locale}
              tone="cost"
              rows={expenseSummary.byCampaign.map((row) => ({
                key: row.key,
                label: row.channel ? `${row.key} · ${row.channel}` : row.key,
                value: row.amount,
                caption: formatPoishaToBdt(row.amount, locale),
              }))}
              emptyLabel={bn ? 'ক্যাম্পেইনের নাম দেওয়া খরচ নেই।' : 'No campaign-labelled expenses.'}
            />
            {channels.length > 0 && (
              <div className="space-y-2 border-t border-border pt-2">
                <p className="text-[10px] uppercase tracking-[0.07em] text-muted">{bn ? 'চ্যানেলভিত্তিক আরওএএস' : 'Channel ROAS'}</p>
                <ul className="space-y-1.5">
                  {channels.map((row, index) => (
                    <motion.li
                      key={row.key}
                      initial={reduced ? false : { opacity: 0, x: -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.25, delay: index * 0.04 }}
                      className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-2 py-1.5 text-[11px]"
                    >
                      <span className="truncate text-ink">{row.key}</span>
                      <span className="shrink-0 font-mono tabular-nums text-muted">
                        {formatPoishaToBdt(row.revenue, locale)} · ROAS {row.roas}
                      </span>
                      <span className="shrink-0 rounded-full bg-success/10 px-1.5 font-mono text-[10px] font-semibold text-success">
                        {formatLocaleNumber(row.orders, locale)}
                      </span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Sales analytics */}
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

      <div className="grid gap-3 lg:grid-cols-3">
        <Card surface="bg" padding="md" className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-ink">{bn ? 'সেরা পণ্য' : 'Top products'}</h2>
            <p className="text-[11px] text-muted">{bn ? 'বাতিল বাদে বিক্রয় থেকে' : 'From non-cancelled sales'}</p>
          </div>
          <BarList
            rows={topProducts.map((row) => ({
              key: row.label,
              label: row.label,
              value: row.revenue,
              caption: `${formatPoishaToBdt(row.revenue, locale)} · ${formatLocaleNumber(row.quantity, locale)} ${bn ? 'পিস' : 'pcs'}`,
            }))}
            locale={locale}
            emptyLabel={bn ? 'এখনো কোনো পণ্য বিক্রি হয়নি।' : 'No product sales yet.'}
          />
        </Card>

        <Card surface="bg" padding="md" className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-ink">{bn ? 'শীর্ষ জেলা' : 'Top districts'}</h2>
            <p className="text-[11px] text-muted">{bn ? 'অর্ডার সংখ্যা অনুযায়ী' : 'Ranked by order count'}</p>
          </div>
          <BarList rows={topDistricts} locale={locale} emptyLabel={bn ? 'জেলার তথ্য নেই।' : 'No district data.'} />
        </Card>

        <Card surface="bg" padding="md" className="space-y-3">
          <div>
            <h2 className="text-sm font-bold text-ink">{bn ? 'অর্ডার পরিণতি' : 'Order outcomes'}</h2>
            <p className="text-[11px] text-muted">{bn ? 'টাকার অঙ্কে, মোট দৃশ্যমান অর্ডার' : 'In taka, across visible orders'}</p>
          </div>
          <ul className="space-y-2">
            {[
              { key: 'delivered', label: bn ? 'ডেলিভারি সম্পন্ন' : 'Delivered', count: stats.delivered, value: stats.deliveredValue, tone: 'text-success', color: '#15803D' },
              { key: 'returned', label: bn ? 'ফেরত' : 'Returned', count: stats.returned, value: stats.returnedValue, tone: 'text-danger', color: '#DC2626' },
              { key: 'cancelled', label: bn ? 'বাতিল' : 'Cancelled', count: stats.cancelled, value: stats.cancelledValue, tone: 'text-muted', color: '#6B7280' },
            ].map((row, index) => {
              const max = Math.max(1, stats.deliveredValue, stats.returnedValue, stats.cancelledValue);
              return (
                <li key={row.key} className="space-y-1">
                  <div className="flex items-baseline justify-between gap-2 text-xs">
                    <button type="button" onClick={() => onOpenOrderStatus(row.key)} className="truncate text-left text-ink underline-offset-4 hover:underline cursor-pointer">
                      {row.label}
                    </button>
                    <span className={`shrink-0 font-mono tabular-nums ${row.tone}`}>{formatPoishaToBdt(row.value, locale)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
                      <motion.div
                        className="h-full rounded-full"
                        style={{ backgroundColor: row.color }}
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.max(3, (row.value / max) * 100)}%` }}
                        transition={{ duration: 0.6, delay: index * 0.05 }}
                      />
                    </div>
                    <span className="w-10 shrink-0 text-right font-mono text-[10px] text-muted">{formatLocaleNumber(row.count, locale)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
          <p className="text-[10px] text-muted">
            {bn ? 'অর্ডার তালিকা ও স্ট্যাটাস ফিল্টার "আজকের কাজ" স্ক্রিনে।' : 'Order lists and status filters live on the Today screen.'}
          </p>
        </Card>
      </div>

      {/* Single pointer to the action screen, so the two screens never look alike */}
      <Card surface="surface" padding="md" className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">{bn ? 'করণীয় দেখতে চান?' : 'Looking for the action list?'}</h2>
          <p className="text-[11px] text-muted">
            {bn
              ? 'কল কনফার্ম, ঠিকানা সংশোধন, বিকাশ যাচাই, প্যাকিং ও কুরিয়ার বুকিং — সব "আজকের কাজ" স্ক্রিনে। এখানে শুধু টাকার হিসাব।'
              : 'Calls, address fixes, bKash checks, packing and courier booking all live on the Today screen. This screen is only about money.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => onNavigate('today_screen')}
          className="inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full bg-ink px-4 text-xs font-bold text-white transition-transform hover:scale-[1.02] cursor-pointer"
        >
          <Users className="w-4 h-4" aria-hidden="true" />
          {bn ? 'আজকের কাজ খুলুন' : "Open Today's work"}
          <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
        </button>
      </Card>

      <p className="px-1 text-[10px] leading-relaxed text-muted">
        {bn
          ? 'সব সংখ্যা রোল-অনুযায়ী ফিল্টার করা ওয়ার্কস্পেস স্ন্যাপশট থেকে, কোনো অনুমান যোগ করা হয়নি। কুরিয়ার বুকিং ও লাইভ ট্র্যাকিং এখনো সংযুক্ত নয়, তাই সিওডি, পেআউট ও নগদ সংখ্যা মিলান সাপেক্ষ।'
          : 'Every figure comes from the role-filtered workspace snapshot with no estimated additions. Courier booking and live tracking are not connected yet, so COD, payout and cash numbers require reconciliation.'}
      </p>
    </section>
  );
}

/* ------------------------------------------------------------------ P&L line */

function PnlLine({
  label,
  amount,
  share,
  locale,
  tone,
  index,
  emphasis,
}: {
  label: string;
  amount: number;
  share: number;
  locale: Locale;
  tone: 'revenue' | 'cost' | 'profit' | 'loss';
  index: number;
  emphasis?: boolean;
}) {
  const animated = useAnimatedNumber(amount);
  const tones: Record<string, string> = {
    revenue: 'bg-gradient-to-r from-[#15803D] to-[#7FD1A8]',
    cost: 'bg-gradient-to-r from-[#D97706] to-[#F87171]',
    profit: 'bg-gradient-to-r from-[#15803D] to-[#0EA5E9]',
    loss: 'bg-gradient-to-r from-[#DC2626] to-[#F87171]',
  };
  const text: Record<string, string> = {
    revenue: 'text-ink',
    cost: 'text-ink',
    profit: 'text-success',
    loss: 'text-danger',
  };
  return (
    <div className="space-y-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className={`truncate ${emphasis ? 'font-bold text-ink' : 'text-muted'}`}>{label}</span>
        <span className={`shrink-0 font-mono tabular-nums ${emphasis ? 'text-sm font-bold' : 'font-semibold'} ${text[tone]}`}>
          {formatPoishaToBdt(Math.round(animated) || 0, locale)}
        </span>
      </div>
      <div className={`overflow-hidden rounded-full bg-surface ${emphasis ? 'h-2.5' : 'h-1.5'}`}>
        <motion.div
          className={`h-full rounded-full ${tones[tone]}`}
          initial={{ width: 0 }}
          animate={{ width: `${Math.max(3, Math.min(100, share * 100))}%` }}
          transition={{ duration: 0.7, ease: 'easeOut', delay: index * 0.05 }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ expense columns */

function ExpenseColumns({
  rows,
  locale,
}: {
  rows: Array<{ key: string; label: string; value: number }>;
  locale: Locale;
}) {
  const reduced = useReducedMotion();
  const max = Math.max(1, ...rows.map((row) => row.value));
  if (!rows.length) return null;
  return (
    <ul className="flex h-28 items-end gap-1.5" aria-label={locale === 'bn' ? 'মাস অনুযায়ী খরচ' : 'Expenses by month'}>
      {rows.map((row, index) => (
        <li key={row.key} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
          <motion.div
            className="w-full rounded-t-md bg-gradient-to-t from-[#D97706] to-[#F59E0B]"
            initial={reduced ? false : { height: 0 }}
            animate={{ height: `${Math.max(4, (row.value / max) * 82)}px` }}
            transition={{ duration: 0.6, delay: index * 0.05, ease: 'easeOut' }}
            title={`${row.label}: ${formatPoishaToBdt(row.value, locale)}`}
          />
          <span className="w-full truncate text-center text-[9px] text-muted">{row.label}</span>
          <span className="sr-only">{formatPoishaToBdt(row.value, locale)}</span>
        </li>
      ))}
    </ul>
  );
}

export default AdminCommandDashboard;
