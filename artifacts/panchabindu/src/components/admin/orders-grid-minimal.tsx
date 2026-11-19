'use client';

import * as React from 'react';
import {
  Check,
  Download,
  ExternalLink,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  PhoneCall,
  Plus,
  Printer,
  RefreshCw,
  Search,
  Truck,
  Wallet,
} from 'lucide-react';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import type { OrderStatus } from '@/types/database.types';
import type { OrderGridRowDTO } from '@/types/domain';
import {
  ORDER_STATUS_META,
  computeOrderPaymentSummary,
  getAllowedSecondaryStatuses,
  resolveOrderTrackingDisplay,
  summarizeOrderStages,
  type OrderQueueFilter,
  type OrderStageTab,
  type PendingMfsSubmissionLike,
} from '@/lib/admin/order-management';
import type { DispatchSheetMode } from './order-dispatch-sheet';

export type MinimalOrderRow = Partial<OrderGridRowDTO> & {
  callAttempts: number;
  callStatus?:
    | 'pending'
    | 'confirmed_yes'
    | 'not_answered_busy'
    | 'cancelled_no'
    | 'call_back_requested';
  callStatusNote?: string;
  internalStaffNote?: string;
  items?: Array<{
    productId: string;
    variantId: string;
    productNameBn: string;
    variantTitleBn: string;
    publicSku: string;
    quantity: number;
    unitSalePricePoisha: number;
    lineSubtotalPoisha: number;
  }>;
};

export interface OrdersGridMinimalProps {
  orders: MinimalOrderRow[];
  filteredOrders: MinimalOrderRow[];
  manualPaymentSubmissions: PendingMfsSubmissionLike[];
  locale: 'bn' | 'en';
  isVendor: boolean;
  isSuperAdmin: boolean;
  stageFilter: OrderStageTab;
  onStageFilterChange: (stage: OrderStageTab) => void;
  queueFilter: OrderQueueFilter;
  onQueueFilterChange: (queue: OrderQueueFilter) => void;
  searchQuery: string;
  onSearchQueryChange: (q: string) => void;
  selectedOrderNos: string[];
  onSelectedOrderNosChange: React.Dispatch<React.SetStateAction<string[]>>;
  pendingActionOrderNos: string[];
  trackingSyncAvailable: boolean;
  isSyncingTracking: boolean;
  onSyncTracking: () => void;
  onExportOrders: () => void;
  onOpenBulkCsv: () => void;
  onNewOrder: () => void;
  onUpdateStatus: (orderNos: string[], newStatus: OrderStatus) => void;
  onLogCall: (orderNo: string) => void;
  onOpenDispatch: (ord: MinimalOrderRow, mode: DispatchSheetMode) => void;
  onOpenMfs: (ord: MinimalOrderRow) => void;
  onOpenMessage: (ord: MinimalOrderRow) => void;
  onOpenPrint: (orderNo: string) => void;
  onOpenDetails: (ord: MinimalOrderRow) => void;
}

const STAGE_TABS: ReadonlyArray<{
  key: OrderStageTab;
  labelBn: string;
  labelEn: string;
}> = [
  { key: 'all', labelBn: 'সব', labelEn: 'All' },
  { key: 'pending_confirmation', labelBn: 'কল বাকি', labelEn: 'Pending' },
  { key: 'confirmed', labelBn: 'কনফার্মড', labelEn: 'Confirmed' },
  { key: 'packed', labelBn: 'প্যাকড', labelEn: 'Packed' },
  { key: 'in_transit', labelBn: 'শিপড / পথে', labelEn: 'In Transit' },
  { key: 'delivered', labelBn: 'ডেলিভার্ড', labelEn: 'Delivered' },
  { key: 'closed', labelBn: 'বাতিল / রিটার্ন', labelEn: 'Closed' },
];

function getStatusToneClass(status: OrderStatus | undefined): string {
  const tone = status ? ORDER_STATUS_META[status]?.tone : 'muted';
  switch (tone) {
    case 'emerald':
      return 'text-emerald-700 dark:text-emerald-400';
    case 'amber':
      return 'text-amber-700 dark:text-amber-400';
    case 'rose':
      return 'text-rose-700 dark:text-rose-400';
    case 'sky':
      return 'text-sky-700 dark:text-sky-400';
    default:
      return 'text-muted';
  }
}

function formatShortOrderDate(iso: string | undefined, locale: 'bn' | 'en'): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    day: 'numeric',
    month: 'short',
  });
}

export function OrdersGridMinimal({
  orders,
  filteredOrders,
  manualPaymentSubmissions,
  locale,
  isVendor,
  isSuperAdmin,
  stageFilter,
  onStageFilterChange,
  queueFilter,
  onQueueFilterChange,
  searchQuery,
  onSearchQueryChange,
  selectedOrderNos,
  onSelectedOrderNosChange,
  pendingActionOrderNos,
  trackingSyncAvailable,
  isSyncingTracking,
  onSyncTracking,
  onExportOrders,
  onOpenBulkCsv,
  onNewOrder,
  onUpdateStatus,
  onLogCall,
  onOpenDispatch,
  onOpenMfs,
  onOpenMessage,
  onOpenPrint,
  onOpenDetails,
}: OrdersGridMinimalProps) {
  const bn = locale === 'bn';
  const [openMenuOrderNo, setOpenMenuOrderNo] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!openMenuOrderNo) return;
    const handleOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-order-row-menu="true"]')) return;
      setOpenMenuOrderNo(null);
    };
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenMenuOrderNo(null);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [openMenuOrderNo]);

  const stageCounts = React.useMemo(() => summarizeOrderStages(orders), [orders]);

  const missingCourierCount = React.useMemo(
    () => orders.filter((o) => o.courierReadiness && !o.courierReadiness.isReady).length,
    [orders]
  );

  const pendingSubmissionByOrderNo = React.useMemo(() => {
    const map = new Map<string, PendingMfsSubmissionLike>();
    for (const sub of manualPaymentSubmissions) {
      if (
        sub.status === 'pending_verification' ||
        sub.status === 'submitted' ||
        sub.status === 'under_review'
      ) {
        map.set(sub.orderNo, sub);
      }
    }
    return map;
  }, [manualPaymentSubmissions]);

  const allVisibleSelected =
    filteredOrders.length > 0 &&
    filteredOrders.every((o) => o.orderNo && selectedOrderNos.includes(o.orderNo));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      onSelectedOrderNosChange([]);
    } else {
      onSelectedOrderNosChange(
        filteredOrders.map((o) => o.orderNo ?? '').filter(Boolean)
      );
    }
  };

  const toggleSelectOrder = (orderNo: string) => {
    onSelectedOrderNosChange((prev) =>
      prev.includes(orderNo)
        ? prev.filter((id) => id !== orderNo)
        : [...prev, orderNo]
    );
  };

  const bulkShipEligible = React.useMemo(
    () =>
      orders
        .filter(
          (ord) =>
            ord.orderNo &&
            selectedOrderNos.includes(ord.orderNo) &&
            ord.status === 'packed' &&
            Boolean(ord.trackingCode?.trim() || ord.consignmentId?.trim())
        )
        .map((ord) => ord.orderNo!),
    [orders, selectedOrderNos]
  );

  const renderPrimaryAction = (
    ord: MinimalOrderRow,
    isBusy: boolean,
    tracking: ReturnType<typeof resolveOrderTrackingDisplay>
  ) => {
    const status = ord.status;
    if (isVendor || !ord.orderNo) return null;

    if (status === 'pending_confirmation') {
      return (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onUpdateStatus([ord.orderNo!], 'confirmed')}
          className="min-h-[34px] px-3 py-1.5 rounded-[var(--radius-sm)] bg-ink text-bg hover:opacity-90 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {isBusy ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>{bn ? 'কনফার্ম করুন' : 'Confirm'}</span>
        </button>
      );
    }

    if (status === 'confirmed') {
      return (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onUpdateStatus([ord.orderNo!], 'packed')}
          className="min-h-[34px] px-3 py-1.5 rounded-[var(--radius-sm)] bg-ink text-bg hover:opacity-90 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          {isBusy && <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
          <span>{bn ? 'প্যাকড করুন' : 'Mark Packed'}</span>
        </button>
      );
    }

    if (status === 'packed') {
      return (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onOpenDispatch(ord, 'ship')}
          className="min-h-[34px] px-3 py-1.5 rounded-[var(--radius-sm)] bg-ink text-bg hover:opacity-90 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
        >
          <Truck className="w-3.5 h-3.5" aria-hidden="true" />
          <span>{bn ? 'কুরিয়ার ও শিপ' : 'Courier & Ship'}</span>
        </button>
      );
    }

    if (status === 'shipped') {
      return (
        <div className="space-y-1.5">
          <button
            type="button"
            disabled={isBusy}
            onClick={() => onOpenDispatch(ord, 'out_for_delivery')}
            className="min-h-[34px] px-3 py-1.5 rounded-[var(--radius-sm)] bg-ink text-bg hover:opacity-90 text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5"
          >
            <Truck className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{bn ? 'আউট ফর ডেলিভারি' : 'Out for Delivery'}</span>
          </button>
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className="truncate max-w-[140px]">{tracking.courierLabel}</span>
            {tracking.trackingUrl && (
              <>
                <span>·</span>
                <a
                  href={tracking.trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-ink hover:underline inline-flex items-center gap-0.5 whitespace-nowrap"
                >
                  <span>{bn ? 'লিংক' : 'Link'}</span>
                  <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                </a>
              </>
            )}
          </div>
        </div>
      );
    }

    if (status === 'out_for_delivery') {
      return (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onUpdateStatus([ord.orderNo!], 'delivered')}
          className="min-h-[34px] px-3 py-1.5 rounded-[var(--radius-sm)] border border-ink bg-bg text-ink hover:bg-ink hover:text-bg text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 transition-colors"
        >
          {isBusy ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
          ) : (
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
          )}
          <span>{bn ? 'ডেলিভার্ড করুন' : 'Mark Delivered'}</span>
        </button>
      );
    }

    if (status === 'return_initiated') {
      return (
        <button
          type="button"
          disabled={isBusy}
          onClick={() => onUpdateStatus([ord.orderNo!], 'returned')}
          className="min-h-[34px] px-3 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:border-ink text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
        >
          {bn ? 'রিটার্ন সম্পন্ন' : 'Mark Returned'}
        </button>
      );
    }

    return null;
  };

  return (
    <section className="space-y-4">
      {/* 1. Minimalist Page Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-baseline gap-2.5">
          <h1 className="text-lg sm:text-xl font-bold text-ink tracking-tight">
            {bn ? 'অর্ডার ম্যানেজমেন্ট' : 'Orders'}
          </h1>
          <span className="text-xs text-muted tabular-nums">
            {formatLocaleNumber(filteredOrders.length, locale)}
            {filteredOrders.length !== orders.length
              ? ` / ${formatLocaleNumber(orders.length, locale)}`
              : ''}{' '}
            {bn ? 'টি' : 'total'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {trackingSyncAvailable && (
            <button
              type="button"
              disabled={isSyncingTracking}
              onClick={onSyncTracking}
              className="min-h-[36px] px-3 py-1.5 border border-border bg-bg hover:bg-surface text-ink font-medium rounded-[var(--radius-sm)] inline-flex items-center gap-1.5 text-xs transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${isSyncingTracking ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{bn ? 'সিঙ্ক' : 'Sync'}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onExportOrders}
            className="min-h-[36px] px-3 py-1.5 border border-border bg-bg hover:bg-surface text-ink font-medium rounded-[var(--radius-sm)] inline-flex items-center gap-1.5 text-xs transition-colors cursor-pointer whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
            <span>{bn ? 'CSV' : 'Export CSV'}</span>
          </button>

          {!isVendor && (
            <>
              <button
                type="button"
                onClick={onOpenBulkCsv}
                className="min-h-[36px] px-3 py-1.5 border border-border bg-bg hover:bg-surface text-ink font-medium rounded-[var(--radius-sm)] inline-flex items-center gap-1.5 text-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <Truck className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                <span>{bn ? 'কুরিয়ার CSV' : 'Courier CSV'}</span>
              </button>

              <button
                type="button"
                onClick={onNewOrder}
                className="min-h-[36px] px-3.5 py-1.5 rounded-[var(--radius-sm)] bg-ink text-bg hover:opacity-90 font-semibold inline-flex items-center gap-1.5 text-xs transition-opacity cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{bn ? 'নতুন অর্ডার' : 'New Order'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. Unified Stage Tabs + Clean Search & Queue Filter */}
      <div className="space-y-3">
        <div
          role="tablist"
          aria-label={bn ? 'অর্ডার ধাপ' : 'Order stages'}
          className="flex items-center gap-1 overflow-x-auto border-b border-border"
        >
          {STAGE_TABS.map((tab) => {
            const active = stageFilter === tab.key;
            const count = stageCounts[tab.key];
            return (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onStageFilterChange(tab.key)}
                className={`px-3 py-2 text-xs whitespace-nowrap shrink-0 border-b-2 -mb-px transition-colors cursor-pointer inline-flex items-center gap-1.5 ${
                  active
                    ? 'border-ink text-ink font-semibold'
                    : 'border-transparent text-muted hover:text-ink font-medium'
                }`}
              >
                <span>{bn ? tab.labelBn : tab.labelEn}</span>
                <span className="tabular-nums text-[11px] opacity-75">
                  {formatLocaleNumber(count, locale)}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
          <div className="relative flex-1">
            <Search
              className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              placeholder={
                bn
                  ? 'অর্ডার নম্বর, গ্রাহকের নাম, ফোন, কুরিয়ার বা ট্র্যাকিং কোড খুঁজুন...'
                  : 'Search order no, customer, phone, courier, or tracking...'
              }
              className="w-full min-h-[38px] pl-9 pr-3 py-1.5 text-xs bg-bg text-ink border border-border rounded-[var(--radius-sm)] focus:outline-none focus:border-ink"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              aria-label={bn ? 'করণীয় ফিল্টার' : 'Filter by queue'}
              value={queueFilter}
              onChange={(e) => onQueueFilterChange(e.target.value as OrderQueueFilter)}
              className="min-h-[38px] px-3 py-1.5 text-xs bg-bg text-ink border border-border rounded-[var(--radius-sm)] focus:outline-none focus:border-ink cursor-pointer"
            >
              <option value="ALL">
                {bn ? 'সব করণীয়' : 'All Queues'}
              </option>
              {!isVendor && (
                <option value="MISSING_COURIER">
                  {bn
                    ? `কুরিয়ার তথ্য অসম্পূর্ণ (${formatLocaleNumber(missingCourierCount, locale)})`
                    : `Incomplete Courier Info (${missingCourierCount})`}
                </option>
              )}
              <option value="CALL_TO_CONFIRM">
                {bn ? 'কল বাকি' : 'Pending Call'}
              </option>
              <option value="VERIFY_BKASH_TRX">
                {bn ? 'বিকাশ যাচাই বাকি' : 'Verify bKash'}
              </option>
              <option value="COLLECT_MANDATORY_ADVANCE">
                {bn ? 'অগ্রিম বাকি' : 'Advance Due'}
              </option>
              <option value="FIX_ADDRESS">
                {bn ? 'ঠিকানা সংশোধন' : 'Fix Address'}
              </option>
              <option value="READY_TO_PACK">
                {bn ? 'প্যাকিং বাকি' : 'Ready to Pack'}
              </option>
              <option value="READY_TO_BOOK_COURIER">
                {bn ? 'কুরিয়ার যুক্ত করা বাকি' : 'Needs Courier'}
              </option>
              <option value="PROCESS_PENDING_RETURN">
                {bn ? 'রিটার্ন প্রক্রিয়াধীন' : 'Pending Return'}
              </option>
            </select>

            {(stageFilter !== 'all' || queueFilter !== 'ALL' || searchQuery.trim()) && (
              <button
                type="button"
                onClick={() => {
                  onStageFilterChange('all');
                  onQueueFilterChange('ALL');
                  onSearchQueryChange('');
                }}
                className="min-h-[38px] px-2.5 text-xs text-muted hover:text-ink underline whitespace-nowrap shrink-0 cursor-pointer"
              >
                {bn ? 'রিসেট' : 'Reset'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 3. Contextual Bulk Action Bar */}
      {selectedOrderNos.length > 0 && !isVendor && (
        <div className="px-3.5 py-2.5 border border-ink/40 rounded-[var(--radius-sm)] bg-surface flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-ink tabular-nums">
            {bn
              ? `${formatLocaleNumber(selectedOrderNos.length, locale)} টি অর্ডার নির্বাচিত`
              : `${selectedOrderNos.length} orders selected`}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => onUpdateStatus(selectedOrderNos, 'confirmed')}
              className="min-h-[32px] px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:border-ink font-medium cursor-pointer"
            >
              {bn ? 'কনফার্ম' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => onUpdateStatus(selectedOrderNos, 'packed')}
              className="min-h-[32px] px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:border-ink font-medium cursor-pointer"
            >
              {bn ? 'প্যাকড' : 'Mark Packed'}
            </button>
            {bulkShipEligible.length > 0 && (
              <button
                type="button"
                onClick={() => onUpdateStatus(bulkShipEligible, 'shipped')}
                className="min-h-[32px] px-2.5 py-1 rounded-[var(--radius-sm)] bg-ink text-bg hover:opacity-90 font-semibold cursor-pointer"
              >
                {bn
                  ? `শিপড (${formatLocaleNumber(bulkShipEligible.length, locale)})`
                  : `Ship (${bulkShipEligible.length})`}
              </button>
            )}
            <button
              type="button"
              onClick={() => onSelectedOrderNosChange([])}
              className="min-h-[32px] px-2 text-muted hover:text-ink cursor-pointer"
            >
              {bn ? 'বাতিল' : 'Clear'}
            </button>
          </div>
        </div>
      )}

      {/* 4. Empty State OR Minimalist Orders List / Table */}
      {filteredOrders.length === 0 ? (
        <div className="py-12 px-4 text-center border border-border rounded-[var(--radius-md)] bg-bg">
          <p className="text-sm font-medium text-ink">
            {bn ? 'কোনো অর্ডার পাওয়া যায়নি' : 'No matching orders found'}
          </p>
          <p className="text-xs text-muted mt-1">
            {bn
              ? 'ফিল্টার পরিবর্তন করুন অথবা নতুন অর্ডার যুক্ত করুন।'
              : 'Adjust your filters or create a new order.'}
          </p>
        </div>
      ) : (
        <>
          {/* Mobile Minimalist Cards */}
          <div className="lg:hidden space-y-2.5">
            {filteredOrders.map((ord, idx) => {
              const orderNo = ord.orderNo ?? `row-${idx}`;
              const isBusy = Boolean(ord.orderNo && pendingActionOrderNos.includes(ord.orderNo));
              const payment = computeOrderPaymentSummary(
                ord,
                ord.orderNo ? pendingSubmissionByOrderNo.get(ord.orderNo) : null
              );
              const tracking = resolveOrderTrackingDisplay(ord, locale);
              const statusMeta = ord.status ? ORDER_STATUS_META[ord.status] : null;
              const canEditCourier =
                !isVendor &&
                Boolean(ord.status) &&
                ['confirmed', 'packed', 'shipped', 'out_for_delivery'].includes(
                  ord.status!
                );

              return (
                <article
                  key={ord.id ?? orderNo}
                  className="p-3.5 border border-border rounded-[var(--radius-md)] bg-bg space-y-3 text-xs"
                >
                  {/* Card Top: Order No + Status */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-ink text-sm">
                          {ord.orderNo}
                        </span>
                        <span className="text-[11px] text-muted">
                          {formatShortOrderDate(ord.createdAt, locale)}
                        </span>
                      </div>
                      <p className="font-medium text-ink truncate mt-0.5">
                        {ord.customerName}
                      </p>
                      <p className="text-muted text-[11px]">
                        <span className="font-mono text-ink">{ord.customerPhone}</span>
                        {ord.districtNameBn ? ` · ${ord.districtNameBn}` : ''}
                      </p>
                    </div>
                    <span
                      className={`text-[11px] font-semibold whitespace-nowrap ${getStatusToneClass(
                        ord.status
                      )}`}
                    >
                      {statusMeta
                        ? bn
                          ? statusMeta.bn
                          : statusMeta.en
                        : ord.status}
                    </span>
                  </div>

                  {/* Minimalist 3-Column Payment Breakdown */}
                  <div className="grid grid-cols-3 gap-2 py-2 border-y border-border/70 tabular-nums">
                    <div>
                      <span className="block text-[10px] text-muted">
                        {bn ? 'মোট' : 'Total'}
                      </span>
                      <span className="font-semibold text-ink">
                        {formatPoishaToBdt(payment.totalPoisha, locale)}
                      </span>
                    </div>
                    <div>
                      <span className="block text-[10px] text-muted">
                        {bn ? 'অগ্রিম / জমা' : 'Paid'}
                      </span>
                      <span className="font-medium text-ink">
                        {formatPoishaToBdt(payment.verifiedPaidPoisha, locale)}
                      </span>
                      {payment.hasPendingVerification && (
                        <span className="block text-[10px] text-amber-700 dark:text-amber-400">
                          {bn ? 'যাচাই বাকি' : 'Pending verify'}
                        </span>
                      )}
                    </div>
                    <div className="text-right">
                      <span className="block text-[10px] text-muted">
                        {bn ? 'বাকি (COD)' : 'Due (COD)'}
                      </span>
                      <span
                        className={`font-bold ${
                          payment.isFullyPaid
                            ? 'text-emerald-700 dark:text-emerald-400'
                            : 'text-ink'
                        }`}
                      >
                        {payment.isFullyPaid
                          ? bn
                            ? 'পরিশোধিত'
                            : 'Paid'
                          : formatPoishaToBdt(payment.duePoisha, locale)}
                      </span>
                    </div>
                  </div>

                  {/* Courier & Tracking Line */}
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                      <span className="font-medium text-ink">
                        {tracking.courierLabel}
                      </span>
                      {tracking.trackingCode && (
                        <>
                          <span className="text-muted">·</span>
                          <span className="font-mono text-muted">
                            {tracking.trackingCode}
                          </span>
                        </>
                      )}
                      {tracking.trackingUrl && (
                        <a
                          href={tracking.trackingUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-ink underline inline-flex items-center gap-0.5 ml-1"
                        >
                          <span>{bn ? 'ট্র্যাকিং' : 'Track'}</span>
                          <ExternalLink className="w-2.5 h-2.5" aria-hidden="true" />
                        </a>
                      )}
                    </div>

                    {canEditCourier && (
                      <button
                        type="button"
                        onClick={() => onOpenDispatch(ord, 'edit')}
                        className="text-muted hover:text-ink underline cursor-pointer whitespace-nowrap"
                      >
                        {bn ? 'কুরিয়ার এডিট' : 'Edit courier'}
                      </button>
                    )}
                  </div>

                  {/* Card Footer: Primary CTA + Call, Message, Print, Details */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    <div>{renderPrimaryAction(ord, isBusy, tracking)}</div>
                    <div className="flex items-center gap-1.5">
                      {!isVendor && ord.customerPhone && (
                        <a
                          href={`tel:${ord.customerPhone}`}
                          onClick={() => {
                            if (ord.orderNo) onLogCall(ord.orderNo);
                          }}
                          title={bn ? 'কল করুন' : 'Call'}
                          aria-label={bn ? 'কল করুন' : 'Call'}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-border rounded-[var(--radius-sm)] bg-surface text-ink hover:border-ink"
                        >
                          <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                        </a>
                      )}
                      {!isVendor && (
                        <button
                          type="button"
                          onClick={() => onOpenMessage(ord)}
                          title={bn ? 'মেসেজ পাঠান' : 'Message'}
                          aria-label={bn ? 'মেসেজ পাঠান' : 'Message'}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-border rounded-[var(--radius-sm)] bg-surface text-ink hover:border-ink cursor-pointer"
                        >
                          <MessageSquare className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                      {ord.orderNo && (
                        <button
                          type="button"
                          onClick={() => onOpenPrint(ord.orderNo!)}
                          title={bn ? 'প্রিন্ট প্রিভিউ' : 'Print preview'}
                          aria-label={bn ? 'প্রিন্ট প্রিভিউ' : 'Print preview'}
                          className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center border border-border rounded-[var(--radius-sm)] bg-surface text-ink hover:border-ink cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onOpenDetails(ord)}
                        className="min-h-[36px] px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink hover:border-ink font-medium cursor-pointer whitespace-nowrap"
                      >
                        {bn ? 'বিস্তারিত' : 'Details'}
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {/* Desktop Streamlined 5-Column Table */}
          <div className="hidden lg:block border border-border rounded-[var(--radius-md)] bg-bg">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface text-[11px] font-semibold text-muted">
                    {!isVendor && (
                      <th className="py-2.5 pl-3 pr-1 w-8">
                        <input
                          type="checkbox"
                          aria-label={bn ? 'সব অর্ডার নির্বাচন করুন' : 'Select all orders'}
                          checked={allVisibleSelected}
                          onChange={toggleSelectAll}
                          className="cursor-pointer"
                        />
                      </th>
                    )}
                    <th className="py-2.5 px-3 font-semibold">
                      {bn ? 'অর্ডার ও গ্রাহক' : 'Order & Customer'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      {bn ? 'কুরিয়ার ও ট্র্যাকিং' : 'Courier & Tracking'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold w-[220px]">
                      {bn ? 'হিসাব' : 'Payment'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold w-[210px]">
                      {bn ? 'অবস্থা ও পরবর্তী ধাপ' : 'Status & Next Step'}
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right w-[176px]">
                      {bn ? 'টুলস' : 'Actions'}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/70">
                  {filteredOrders.map((ord, idx) => {
                    const orderNo = ord.orderNo ?? `row-${idx}`;
                    const isBusy = Boolean(
                      ord.orderNo && pendingActionOrderNos.includes(ord.orderNo)
                    );
                    const payment = computeOrderPaymentSummary(
                      ord,
                      ord.orderNo ? pendingSubmissionByOrderNo.get(ord.orderNo) : null
                    );
                    const tracking = resolveOrderTrackingDisplay(ord, locale);
                    const statusMeta = ord.status
                      ? ORDER_STATUS_META[ord.status]
                      : null;
                    const canEditCourier =
                      !isVendor &&
                      Boolean(ord.status) &&
                      ['confirmed', 'packed', 'shipped', 'out_for_delivery'].includes(
                        ord.status!
                      );
                    const secondaryStatuses = getAllowedSecondaryStatuses(ord.status);
                    const isMenuOpen = openMenuOrderNo === orderNo;
                    const hasIncompleteCourierInfo =
                      !isVendor &&
                      Boolean(ord.courierReadiness && !ord.courierReadiness.isReady) &&
                      ['pending_confirmation', 'confirmed', 'packed'].includes(
                        ord.status ?? ''
                      );

                    return (
                      <tr
                        key={ord.id ?? orderNo}
                        className="hover:bg-surface/60 transition-colors align-top"
                      >
                        {!isVendor && (
                          <td className="py-3.5 pl-3 pr-1">
                            <input
                              type="checkbox"
                              aria-label={orderNo}
                              checked={Boolean(
                                ord.orderNo && selectedOrderNos.includes(ord.orderNo)
                              )}
                              onChange={() => {
                                if (ord.orderNo) toggleSelectOrder(ord.orderNo);
                              }}
                              className="mt-0.5 cursor-pointer"
                            />
                          </td>
                        )}

                        {/* Column 1: Order & Customer */}
                        <td className="py-3.5 px-3 min-w-[230px]">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => onOpenDetails(ord)}
                                className="font-mono font-bold text-ink hover:underline cursor-pointer"
                              >
                                {ord.orderNo}
                              </button>
                              <span className="text-[11px] text-muted">
                                {formatShortOrderDate(ord.createdAt, locale)}
                              </span>
                            </div>
                            <p className="font-medium text-ink">{ord.customerName}</p>
                            <p className="text-[11px] text-muted">
                              <span className="font-mono text-ink/90">
                                {ord.customerPhone}
                              </span>
                              {ord.districtNameBn ? ` · ${ord.districtNameBn}` : ''}
                              {ord.upazilaNameBn ? `, ${ord.upazilaNameBn}` : ''}
                            </p>
                            {hasIncompleteCourierInfo && (
                              <p className="text-[11px] text-rose-700 dark:text-rose-400 pt-0.5">
                                {bn ? 'ঠিকানা / কুরিয়ার তথ্য অসম্পূর্ণ' : 'Incomplete address/courier info'}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Column 2: Courier & Tracking */}
                        <td className="py-3.5 px-3 min-w-[200px]">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span className="font-semibold text-ink">
                                {tracking.courierLabel}
                              </span>
                              {tracking.isCustomCourier && (
                                <span className="text-[10px] text-muted">
                                  ({bn ? 'কাস্টম' : 'Custom'})
                                </span>
                              )}
                              {canEditCourier && (
                                <button
                                  type="button"
                                  onClick={() => onOpenDispatch(ord, 'edit')}
                                  title={
                                    bn
                                      ? 'কুরিয়ার ও ট্র্যাকিং লিংক এডিট করুন'
                                      : 'Edit courier and tracking link'
                                  }
                                  className="p-0.5 text-muted hover:text-ink cursor-pointer"
                                >
                                  <Pencil className="w-3 h-3" aria-hidden="true" />
                                </button>
                              )}
                            </div>

                            {tracking.trackingCode ? (
                              <p className="font-mono text-[11px] text-muted">
                                {tracking.trackingCode}
                              </p>
                            ) : (
                              <p className="text-[11px] text-muted">
                                {bn ? 'ট্র্যাকিং যুক্ত হয়নি' : 'No tracking yet'}
                              </p>
                            )}

                            {tracking.trackingUrl && (
                              <a
                                href={tracking.trackingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-ink hover:underline"
                              >
                                <span>
                                  {bn ? 'ট্র্যাকিং লিংক' : 'Tracking link'}
                                </span>
                                <ExternalLink
                                  className="w-3 h-3 text-muted"
                                  aria-hidden="true"
                                />
                              </a>
                            )}
                          </div>
                        </td>

                        {/* Column 3: Minimalist Payment Breakdown */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1 tabular-nums max-w-[200px]">
                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-[11px] text-muted">
                                {bn ? 'মোট' : 'Total'}
                              </span>
                              <span className="font-medium text-ink">
                                {formatPoishaToBdt(payment.totalPoisha, locale)}
                              </span>
                            </div>

                            <div className="flex items-baseline justify-between gap-3">
                              <span className="text-[11px] text-muted">
                                {bn ? 'অগ্রিম' : 'Paid'}
                              </span>
                              <span
                                className={
                                  payment.verifiedPaidPoisha > 0
                                    ? 'font-medium text-emerald-700 dark:text-emerald-400'
                                    : 'text-muted'
                                }
                              >
                                {formatPoishaToBdt(payment.verifiedPaidPoisha, locale)}
                              </span>
                            </div>

                            <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-border/60">
                              <span className="text-[11px] font-medium text-muted">
                                {bn ? 'বাকি' : 'Due'}
                              </span>
                              <span
                                className={`font-bold ${
                                  payment.isFullyPaid
                                    ? 'text-emerald-700 dark:text-emerald-400'
                                    : 'text-ink'
                                }`}
                              >
                                {payment.isFullyPaid
                                  ? bn
                                    ? 'পরিশোধিত'
                                    : 'Paid'
                                  : formatPoishaToBdt(payment.duePoisha, locale)}
                              </span>
                            </div>

                            {payment.hasPendingVerification && !isVendor && (
                              <button
                                type="button"
                                onClick={() => onOpenMfs(ord)}
                                className="block text-[11px] font-medium text-amber-700 dark:text-amber-400 hover:underline pt-0.5 cursor-pointer text-left"
                              >
                                {bn
                                  ? `বিকাশ যাচাই বাকি (${payment.trxId ?? 'TrxID'})`
                                  : `Verify bKash (${payment.trxId ?? 'TrxID'})`}
                              </button>
                            )}

                            {!payment.hasPendingVerification &&
                              payment.isAdvanceMandatory &&
                              payment.verifiedPaidPoisha === 0 &&
                              !isVendor && (
                                <button
                                  type="button"
                                  onClick={() => onOpenMfs(ord)}
                                  className="block text-[11px] text-muted hover:text-ink underline pt-0.5 cursor-pointer text-left"
                                >
                                  {bn ? '+ অগ্রিম জমা দিন' : '+ Record advance'}
                                </button>
                              )}

                            {isSuperAdmin && payment.netProfitPoisha !== null && (
                              <div className="flex items-baseline justify-between gap-3 text-[10px] text-muted pt-0.5">
                                <span>{bn ? 'আনুমানিক লাভ' : 'Est. profit'}</span>
                                <span>
                                  {formatPoishaToBdt(payment.netProfitPoisha, locale)}
                                </span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Column 4: Status & Next Step */}
                        <td className="py-3.5 px-3">
                          <div className="space-y-1.5">
                            <p
                              className={`text-[11px] font-semibold ${getStatusToneClass(
                                ord.status
                              )}`}
                            >
                              {statusMeta
                                ? bn
                                  ? statusMeta.bn
                                  : statusMeta.en
                                : ord.status}
                            </p>
                            {renderPrimaryAction(ord, isBusy, tracking)}
                          </div>
                        </td>

                        {/* Column 5: Minimal Utility Tools */}
                        <td className="py-3.5 px-3 text-right">
                          <div className="inline-flex items-center justify-end gap-1">
                            {!isVendor && ord.customerPhone && (
                              <a
                                href={`tel:${ord.customerPhone}`}
                                onClick={() => {
                                  if (ord.orderNo) onLogCall(ord.orderNo);
                                }}
                                title={bn ? 'কল করুন' : 'Call customer'}
                                aria-label={bn ? 'কল করুন' : 'Call customer'}
                                className="p-1.5 rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface transition-colors"
                              >
                                <PhoneCall className="w-3.5 h-3.5" aria-hidden="true" />
                              </a>
                            )}

                            {!isVendor && (
                              <button
                                type="button"
                                onClick={() => onOpenMessage(ord)}
                                title={bn ? 'মেসেজ পাঠান' : 'Message customer'}
                                aria-label={bn ? 'মেসেজ পাঠান' : 'Message customer'}
                                className="p-1.5 rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
                              >
                                <MessageSquare
                                  className="w-3.5 h-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                            )}

                            {ord.orderNo && (
                              <button
                                type="button"
                                onClick={() => onOpenPrint(ord.orderNo!)}
                                title={bn ? 'সরাসরি প্রিন্ট প্রিভিউ' : 'Direct print preview'}
                                aria-label={bn ? 'সরাসরি প্রিন্ট প্রিভিউ' : 'Direct print preview'}
                                className="p-1.5 rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
                              >
                                <Printer
                                  className="w-3.5 h-3.5"
                                  aria-hidden="true"
                                />
                              </button>
                            )}

                            <button
                              type="button"
                              onClick={() => onOpenDetails(ord)}
                              className="px-2 py-1 rounded-[var(--radius-sm)] border border-border bg-bg hover:border-ink text-ink text-[11px] font-medium cursor-pointer whitespace-nowrap shrink-0"
                            >
                              {bn ? 'বিস্তারিত' : 'Details'}
                            </button>

                            <div className="relative" data-order-row-menu="true">
                              <button
                                type="button"
                                aria-label={bn ? 'আরও অপশন' : 'More actions'}
                                aria-expanded={isMenuOpen}
                                onClick={() =>
                                  setOpenMenuOrderNo((curr) =>
                                    curr === orderNo ? null : orderNo
                                  )
                                }
                                className="p-1.5 rounded-[var(--radius-sm)] text-muted hover:text-ink hover:bg-surface transition-colors cursor-pointer"
                              >
                                <MoreHorizontal
                                  className="w-4 h-4"
                                  aria-hidden="true"
                                />
                              </button>

                              {isMenuOpen && (
                                <div className="absolute right-0 mt-1 w-48 py-1 rounded-[var(--radius-md)] border border-border bg-bg shadow-lg z-30 text-left text-xs">
                                  {canEditCourier && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuOrderNo(null);
                                        onOpenDispatch(ord, 'edit');
                                      }}
                                      className="w-full px-3 py-2 text-left text-ink hover:bg-surface flex items-center gap-2 cursor-pointer"
                                    >
                                      <Truck className="w-3.5 h-3.5 text-muted" />
                                      <span>
                                        {bn
                                          ? 'কুরিয়ার ও ট্র্যাকিং এডিট'
                                          : 'Edit Courier & Tracking'}
                                      </span>
                                    </button>
                                  )}

                                  {!isVendor && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuOrderNo(null);
                                        onOpenMfs(ord);
                                      }}
                                      className="w-full px-3 py-2 text-left text-ink hover:bg-surface flex items-center gap-2 cursor-pointer"
                                    >
                                      <Wallet className="w-3.5 h-3.5 text-muted" />
                                      <span>
                                        {bn
                                          ? 'বিকাশ / অগ্রিম পেমেন্ট'
                                          : 'Payment / Advance'}
                                      </span>
                                    </button>
                                  )}

                                  {ord.orderNo && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setOpenMenuOrderNo(null);
                                        onOpenPrint(ord.orderNo!);
                                      }}
                                      className="w-full px-3 py-2 text-left text-ink hover:bg-surface flex items-center gap-2 cursor-pointer"
                                    >
                                      <Printer className="w-3.5 h-3.5 text-muted" />
                                      <span>{bn ? 'স্লিপ প্রিন্ট' : 'Print Slip'}</span>
                                    </button>
                                  )}

                                  {!isVendor && secondaryStatuses.length > 0 && (
                                    <div className="my-1 border-t border-border pt-1">
                                      {secondaryStatuses.map((st) => {
                                        const meta = ORDER_STATUS_META[st];
                                        const isDestructive =
                                          st === 'cancelled' ||
                                          st === 'return_initiated';
                                        return (
                                          <button
                                            key={st}
                                            type="button"
                                            disabled={isBusy}
                                            onClick={() => {
                                              setOpenMenuOrderNo(null);
                                              if (ord.orderNo) {
                                                onUpdateStatus([ord.orderNo], st);
                                              }
                                            }}
                                            className={`w-full px-3 py-1.5 text-left hover:bg-surface cursor-pointer disabled:opacity-50 ${
                                              isDestructive
                                                ? 'text-rose-700 dark:text-rose-400'
                                                : 'text-ink'
                                            }`}
                                          >
                                            {bn
                                              ? `→ ${meta?.bn ?? st}`
                                              : `→ ${meta?.en ?? st}`}
                                          </button>
                                        );
                                      })}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
