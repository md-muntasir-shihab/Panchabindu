'use client';

import * as React from 'react';
import {
  ArrowLeft,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageSquare,
  Phone,
} from 'lucide-react';
import type { CustomerInquiryRecord } from '@/lib/db/repository';
import type { ManagedAbandonedCartRecord } from '@/lib/admin/phase6-service';
import type { PendingMfsSubmissionLike } from '@/lib/admin/order-management';
import type { MessageDispatchLogRecord } from '@/lib/admin/phase4c-service';
import type { ReturnResolutionRecord } from '@/lib/admin/phase4b-service';
import type { CustomerRefundExecutionRecord } from '@/lib/admin/phase7-service';
import type { ImmutableAuditLogRecord } from '@/lib/admin/phase4a-service';
import type { OrderGridRowDTO } from '@/types/domain';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleDateTime, formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { Button, EmptyState } from '../ui/primitives';

export type ContactOrder = Partial<OrderGridRowDTO> & {
  callAttempts?: number;
  callStatus?:
    | 'pending'
    | 'confirmed_yes'
    | 'not_answered_busy'
    | 'cancelled_no'
    | 'call_back_requested';
  callStatusNote?: string;
  internalStaffNote?: string;
  items?: Array<{
    productId?: string;
    variantId?: string;
    productNameBn: string;
    variantTitleBn: string;
    publicSku?: string;
    quantity: number;
    unitSalePricePoisha: number;
    lineSubtotalPoisha?: number;
  }>;
};

export interface CustomerAddressSummary {
  key: string;
  streetAddress: string;
  landmark: string;
  upazilaNameBn: string;
  districtNameBn: string;
  postCode: string;
  recipientAreaSummary: string;
  addressQualityScore: number;
  usedCount: number;
  lastUsedAt: string;
}

export interface CustomerAZProfile {
  phoneKey: string;
  displayPhone: string;
  name: string;
  alternateNames: string[];
  emails: string[];
  customerIds: string[];
  districtNameBn: string;
  upazilaNameBn: string;
  totalOrders: number;
  deliveredOrders: number;
  activeOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  deliverySuccessRateBp: number;
  isRepeatCustomer: boolean;
  fraudScore: number;
  isBlacklisted: boolean;
  blacklistReasonBn: string | null;
  blacklistedAt: string | null;
  lifetimeSpendPoisha: number;
  averageOrderValuePoisha: number;
  totalAdvancePaidPoisha: number;
  pendingCodPoisha: number;
  firstSeenAt: string;
  lastOrderNo: string | null;
  lastActivityAt: string;
  addresses: CustomerAddressSummary[];
  orders: ContactOrder[];
  manualPayments: PendingMfsSubmissionLike[];
  returns: ReturnResolutionRecord[];
  refunds: CustomerRefundExecutionRecord[];
  inquiries: CustomerInquiryRecord[];
  messageLogs: MessageDispatchLogRecord[];
  abandonedCarts: ManagedAbandonedCartRecord[];
  auditEvents: ImmutableAuditLogRecord[];
}

type ProfileTab = 'overview' | 'orders' | 'timeline' | 'messages';
type OrderFilter = 'all' | 'active' | 'delivered' | 'returned_cancelled';
type TimelineFilter = 'all' | 'orders' | 'payments' | 'comms' | 'audit';

interface TimelineEntry {
  id: string;
  timestamp: string;
  category: Exclude<TimelineFilter, 'all'>;
  typeLabelBn: string;
  typeLabelEn: string;
  title: string;
  subtitle: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  refCode?: string;
}

export interface CustomerAZProfileViewProps {
  customer: CustomerAZProfile;
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  busyKey: string | null;
  feedback: { tone: 'success' | 'error'; text: string } | null;
  onBack: () => void;
  onBlacklistMutation: (phone: string, action: 'add' | 'remove', reasonBn?: string) => Promise<void>;
  onRecordCartReminder: (cart: ManagedAbandonedCartRecord, channel: 'wa_me' | 'sms') => Promise<void>;
  onRecoverCart: (cartId: string) => Promise<void>;
  onOpenInquiryInInbox?: (inquiryId: string) => void;
}

const ORDER_STATUS_LABELS: Record<string, { bn: string; en: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  pending: { bn: 'পেন্ডিং', en: 'Pending', tone: 'warning' },
  pending_confirmation: { bn: 'কনফার্মেশন অপেক্ষায়', en: 'Pending Confirmation', tone: 'warning' },
  confirmed: { bn: 'কনফার্মড', en: 'Confirmed', tone: 'neutral' },
  packed: { bn: 'প্যাকড', en: 'Packed', tone: 'neutral' },
  shipped: { bn: 'শিপড', en: 'Shipped', tone: 'neutral' },
  in_transit: { bn: 'ট্রানজিটে', en: 'In Transit', tone: 'neutral' },
  out_for_delivery: { bn: 'ডেলিভারির পথে', en: 'Out for Delivery', tone: 'neutral' },
  delivered: { bn: 'ডেলিভারড', en: 'Delivered', tone: 'success' },
  returned: { bn: 'রিটার্নড', en: 'Returned', tone: 'danger' },
  partial_return: { bn: 'আংশিক রিটার্ন', en: 'Partial Return', tone: 'warning' },
  cancelled: { bn: 'বাতিল', en: 'Cancelled', tone: 'danger' },
};

const SOURCE_LABELS: Record<string, { bn: string; en: string }> = {
  website: { bn: 'ওয়েবসাইট', en: 'Website' },
  facebook: { bn: 'ফেসবুক', en: 'Facebook' },
  messenger: { bn: 'মেসেঞ্জার', en: 'Messenger' },
  whatsapp: { bn: 'হোয়াটসঅ্যাপ', en: 'WhatsApp' },
  phone: { bn: 'ফোন কল', en: 'Phone Call' },
  instagram: { bn: 'ইনস্টাগ্রাম', en: 'Instagram' },
  admin: { bn: 'অ্যাডমিন এন্ট্রি', en: 'Admin Entry' },
  manual: { bn: 'ম্যানুয়াল', en: 'Manual' },
};

const PAYMENT_METHOD_LABELS: Record<string, { bn: string; en: string }> = {
  cod: { bn: 'ক্যাশ অন ডেলিভারি (COD)', en: 'Cash on Delivery (COD)' },
  bkash_manual: { bn: 'বিকাশ (ম্যানুয়াল)', en: 'bKash (Manual)' },
  nagad_manual: { bn: 'নগদ (ম্যানুয়াল)', en: 'Nagad (Manual)' },
  rocket_manual: { bn: 'রকেট (ম্যানুয়াল)', en: 'Rocket (Manual)' },
  sslcommerz: { bn: 'SSLCommerz', en: 'SSLCommerz' },
  bank_transfer: { bn: 'ব্যাংক ট্রান্সফার', en: 'Bank Transfer' },
  partial_advance_cod: { bn: 'অগ্রিম + COD', en: 'Advance + COD' },
};

const CALL_STATUS_LABELS: Record<string, { bn: string; en: string }> = {
  pending: { bn: 'কল অপেক্ষায়', en: 'Pending Call' },
  confirmed_yes: { bn: 'কনফার্ম করেছে', en: 'Confirmed' },
  not_answered_busy: { bn: 'রিসিভ করেনি / ব্যস্ত', en: 'No Answer / Busy' },
  cancelled_no: { bn: 'কাস্টমার বাতিল করেছে', en: 'Declined by Customer' },
  call_back_requested: { bn: 'কলব্যাক চেয়েছে', en: 'Callback Requested' },
};

function statusToneTextClass(tone: 'neutral' | 'success' | 'warning' | 'danger'): string {
  if (tone === 'success') return 'text-success';
  if (tone === 'warning') return 'text-warning';
  if (tone === 'danger') return 'text-danger';
  return 'text-ink';
}

function getOrderStatusMeta(status: string | undefined, bn: boolean) {
  const key = (status ?? 'pending').toLowerCase();
  const mapped = ORDER_STATUS_LABELS[key];
  if (mapped) return { label: bn ? mapped.bn : mapped.en, tone: mapped.tone };
  return { label: status || (bn ? 'অজানা' : 'Unknown'), tone: 'neutral' as const };
}

function getSourceLabel(source: string | undefined, bn: boolean): string {
  if (!source) return bn ? 'ওয়েবসাইট' : 'Website';
  const mapped = SOURCE_LABELS[source.toLowerCase()];
  return mapped ? (bn ? mapped.bn : mapped.en) : source;
}

function getPaymentMethodLabel(method: string | undefined, bn: boolean): string {
  if (!method) return bn ? 'উল্লেখ নেই' : 'Unspecified';
  const mapped = PAYMENT_METHOD_LABELS[method.toLowerCase()];
  return mapped ? (bn ? mapped.bn : mapped.en) : method;
}

function getCourierLabel(ord: ContactOrder, bn: boolean): string {
  if (ord.customCourierName?.trim()) return ord.customCourierName.trim();
  const provider = (ord.courierProvider ?? '').toLowerCase();
  if (!provider || provider === 'unassigned') return bn ? 'কুরিয়ার নির্ধারিত নয়' : 'Unassigned';
  if (provider === 'steadfast') return 'Steadfast';
  if (provider === 'pathao') return 'Pathao';
  if (provider === 'redx') return 'RedX';
  if (provider === 'bd_post') return 'Bangladesh Post';
  if (provider === 'sundarban') return 'Sundarban Courier';
  return ord.courierProvider ?? (bn ? 'অজানা' : 'Unknown');
}

function buildTrackingHref(ord: ContactOrder): string | null {
  if (ord.customTrackingUrl && /^https?:\/\//i.test(ord.customTrackingUrl)) {
    return ord.customTrackingUrl;
  }
  const code = ord.trackingCode?.trim();
  if (!code) return null;
  const provider = (ord.courierProvider ?? '').toLowerCase();
  if (provider === 'steadfast') {
    return `https://steadfast.com.bd/t/${encodeURIComponent(code)}`;
  }
  if (provider === 'redx') {
    return `https://redx.com.bd/track-global-parcel/?trackingId=${encodeURIComponent(code)}`;
  }
  return null;
}

export function CustomerAZProfileView({
  customer,
  locale,
  isSuperAdmin,
  busyKey,
  feedback,
  onBack,
  onBlacklistMutation,
  onRecordCartReminder,
  onRecoverCart,
  onOpenInquiryInInbox,
}: CustomerAZProfileViewProps) {
  const bn = locale === 'bn';
  const t = React.useCallback((b: string, e: string) => (bn ? b : e), [bn]);

  const [activeTab, setActiveTab] = React.useState<ProfileTab>('overview');
  const [orderFilter, setOrderFilter] = React.useState<OrderFilter>('all');
  const [timelineFilter, setTimelineFilter] = React.useState<TimelineFilter>('all');
  const [expandedOrderKeys, setExpandedOrderKeys] = React.useState<Record<string, boolean>>({});
  const [showBlacklistForm, setShowBlacklistForm] = React.useState(false);
  const [blacklistReason, setBlacklistReason] = React.useState('');

  // Reset per-customer view state and auto-expand the most recent order
  React.useEffect(() => {
    setShowBlacklistForm(false);
    setBlacklistReason('');
    setOrderFilter('all');
    setTimelineFilter('all');
    const firstOrderKey = customer.orders[0]?.orderNo || customer.orders[0]?.id;
    setExpandedOrderKeys(firstOrderKey ? { [firstOrderKey]: true } : {});
  }, [customer.phoneKey, customer.orders]);

  // Escape key returns to directory unless typing in an input
  React.useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const target = event.target as HTMLElement | null;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      onBack();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onBack]);

  const filteredOrders = React.useMemo(() => {
    return customer.orders.filter((ord) => {
      const st = (ord.status ?? '').toLowerCase();
      if (orderFilter === 'delivered') return st === 'delivered';
      if (orderFilter === 'returned_cancelled') {
        return st === 'returned' || st === 'partial_return' || st === 'cancelled';
      }
      if (orderFilter === 'active') {
        return !['delivered', 'returned', 'partial_return', 'cancelled'].includes(st);
      }
      return true;
    });
  }, [customer.orders, orderFilter]);

  const allOrdersExpanded =
    filteredOrders.length > 0 &&
    filteredOrders.every((ord) => Boolean(expandedOrderKeys[ord.orderNo || ord.id || '']));

  const toggleExpandAllOrders = () => {
    if (allOrdersExpanded) {
      setExpandedOrderKeys({});
      return;
    }
    const next: Record<string, boolean> = {};
    for (const ord of filteredOrders) {
      const k = ord.orderNo || ord.id;
      if (k) next[k] = true;
    }
    setExpandedOrderKeys(next);
  };

  // Channel & payment preference breakdown
  const channelSummary = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const ord of customer.orders) {
      const label = getSourceLabel(ord.source, bn);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [customer.orders, bn]);

  const paymentPreferenceSummary = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const ord of customer.orders) {
      const label = getPaymentMethodLabel(ord.paymentMethod, bn);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [customer.orders, bn]);

  const courierPreferenceSummary = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const ord of customer.orders) {
      const label = getCourierLabel(ord, bn);
      counts.set(label, (counts.get(label) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [customer.orders, bn]);

  // Unified chronological A-Z timeline
  const timeline = React.useMemo<TimelineEntry[]>(() => {
    const entries: TimelineEntry[] = [];

    for (const ord of customer.orders) {
      const statusMeta = getOrderStatusMeta(ord.status, bn);
      const itemCount = (ord.items ?? []).reduce((sum, i) => sum + (i.quantity || 1), 0);
      entries.push({
        id: `ord:${ord.orderNo || ord.id}`,
        timestamp: ord.createdAt || '',
        category: 'orders',
        typeLabelBn: 'অর্ডার',
        typeLabelEn: 'Order',
        refCode: ord.orderNo,
        title: `${t('অর্ডার প্লেসড', 'Order placed')} · ${formatPoishaToBdt(ord.totalPayablePoisha ?? 0, locale)}`,
        subtitle: [
          statusMeta.label,
          getSourceLabel(ord.source, bn),
          getPaymentMethodLabel(ord.paymentMethod, bn),
          getCourierLabel(ord, bn),
          itemCount > 0 ? `${formatLocaleNumber(itemCount, locale)} ${t('আইটেম', 'items')}` : null,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: statusMeta.tone,
      });
    }

    for (const pay of customer.manualPayments) {
      const tone =
        pay.status === 'approved' || pay.status === 'verified'
          ? 'success'
          : pay.status === 'rejected'
            ? 'danger'
            : 'warning';
      entries.push({
        id: `mfs:${pay.submissionId || pay.trxId}`,
        timestamp: pay.reviewedAt || pay.submittedAt || '',
        category: 'payments',
        typeLabelBn: 'ম্যানুয়াল পেমেন্ট',
        typeLabelEn: 'Manual Payment',
        refCode: pay.orderNo,
        title: `${(pay.provider ?? 'bkash').toUpperCase()} TrxID ${pay.trxId} · ${formatPoishaToBdt(pay.submittedAmountPoisha, locale)}`,
        subtitle: [
          `${t('স্ট্যাটাস', 'Status')}: ${pay.status}`,
          pay.senderPhoneMasked ? `${t('প্রেরক', 'Sender')}: ${pay.senderPhoneMasked}` : null,
          pay.reviewedByUsername ? `${t('যাচাইকারী', 'Reviewed by')}: ${pay.reviewedByUsername}` : null,
          pay.reviewNoteBn || null,
        ]
          .filter(Boolean)
          .join(' · '),
        tone,
      });
    }

    for (const ret of customer.returns) {
      entries.push({
        id: `ret:${ret.returnId}`,
        timestamp: ret.createdAt,
        category: 'payments',
        typeLabelBn: 'রিটার্ন',
        typeLabelEn: 'Return',
        refCode: ret.orderNo,
        title: `${t('রিটার্ন রেজোলিউশন', 'Return resolution')} · ${formatLocaleNumber(ret.quantity, locale)} ${t('পিস', 'pcs')}`,
        subtitle: [
          `${t('দায়ভার', 'Fault')}: ${ret.faultType}`,
          `${t('রিস্টক', 'Restock')}: ${formatLocaleNumber(ret.restockQuantity, locale)}`,
          ret.noteBn || null,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: 'danger',
      });
    }

    for (const ref of customer.refunds) {
      entries.push({
        id: `ref:${ref.refundId}`,
        timestamp: ref.resolvedAt || ref.createdAt,
        category: 'payments',
        typeLabelBn: 'রিফান্ড',
        typeLabelEn: 'Refund',
        refCode: ref.refundCode || ref.orderNo,
        title: `${t('গ্রাহক রিফান্ড', 'Customer refund')} · ${formatPoishaToBdt(ref.refundAmountPoisha, locale)}`,
        subtitle: [
          `${t('অর্ডার', 'Order')}: ${ref.orderNo}`,
          `${t('স্ট্যাটাস', 'Status')}: ${ref.status}`,
          ref.refundTrxId ? `TrxID: ${ref.refundTrxId}` : null,
          ref.reasonBn || null,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: ref.status === 'approved_paid' ? 'success' : ref.status === 'rejected' ? 'danger' : 'warning',
      });
    }

    for (const inq of customer.inquiries) {
      entries.push({
        id: `inq:${inq.id}`,
        timestamp: inq.createdAt,
        category: 'comms',
        typeLabelBn: 'ইনকোয়ারি',
        typeLabelEn: 'Inquiry',
        title: inq.subject || t('স্টোরফ্রন্ট মেসেজ', 'Storefront inquiry'),
        subtitle: [`${t('স্ট্যাটাস', 'Status')}: ${inq.status}`, inq.message.slice(0, 120)]
          .filter(Boolean)
          .join(' · '),
        tone: inq.status === 'resolved' ? 'success' : 'neutral',
      });
    }

    for (const log of customer.messageLogs) {
      entries.push({
        id: `msg:${log.id}`,
        timestamp: log.createdAt,
        category: 'comms',
        typeLabelBn: 'আউটবাউন্ড মেসেজ',
        typeLabelEn: 'Outbound Message',
        refCode: log.orderNo || undefined,
        title: `${log.channel} · ${log.eventKey}`,
        subtitle: log.renderedMessage.slice(0, 140),
        tone: log.status === 'blocked_not_connected' ? 'warning' : 'neutral',
      });
    }

    for (const cart of customer.abandonedCarts) {
      entries.push({
        id: `cart:${cart.cartId}`,
        timestamp: cart.updatedAt || cart.createdAt,
        category: 'comms',
        typeLabelBn: 'পরিত্যক্ত কার্ট',
        typeLabelEn: 'Abandoned Cart',
        refCode: cart.recoveredOrderNo || undefined,
        title: cart.isRecovered
          ? `${t('কার্ট রিকভার্ড', 'Cart recovered')} · ${formatPoishaToBdt(cart.subtotalPoisha, locale)}`
          : `${t('চেকআউট ড্রপ-অফ', 'Checkout drop-off')} · ${formatPoishaToBdt(cart.subtotalPoisha, locale)}`,
        subtitle: `${cart.items.map((i) => `${i.productNameBn} ×${i.quantity}`).join(', ')} · ${t('রিমাইন্ডার', 'Reminders')}: ${formatLocaleNumber(cart.reminderSentCount, locale)}`,
        tone: cart.isRecovered ? 'success' : 'warning',
      });
    }

    for (const ev of customer.auditEvents) {
      entries.push({
        id: `audit:${ev.id}`,
        timestamp: ev.createdAt,
        category: 'audit',
        typeLabelBn: 'অডিট লগ',
        typeLabelEn: 'Audit',
        refCode: ev.targetId,
        title: ev.summaryBn || ev.actionCode,
        subtitle: `${ev.actorUsername} (${ev.actorRole}) · ${ev.actionCode}`,
        tone: 'neutral',
      });
    }

    if (customer.isBlacklisted && customer.blacklistedAt) {
      entries.push({
        id: `bl:${customer.phoneKey}`,
        timestamp: customer.blacklistedAt,
        category: 'audit',
        typeLabelBn: 'ব্ল্যাকলিস্ট',
        typeLabelEn: 'Blacklist',
        title: t('নম্বরটি ব্ল্যাকলিস্টে যুক্ত করা হয়েছে', 'Phone number added to blacklist'),
        subtitle: customer.blacklistReasonBn || t('কারণ উল্লেখ নেই', 'No reason recorded'),
        tone: 'danger',
      });
    }

    return entries.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));
  }, [customer, bn, locale, t]);

  const filteredTimeline = React.useMemo(() => {
    if (timelineFilter === 'all') return timeline;
    return timeline.filter((e) => e.category === timelineFilter);
  }, [timeline, timelineFilter]);

  const totalCommsCount =
    customer.inquiries.length + customer.messageLogs.length + customer.abandonedCarts.length;
  const deliveryRatePct = Math.round(customer.deliverySuccessRateBp / 100);
  const validBdPhone = /^01[3-9]\d{8}$/.test(customer.phoneKey);

  const riskLabel = customer.isBlacklisted
    ? { text: t('ব্ল্যাকলিস্টেড', 'Blacklisted'), cls: 'text-danger font-semibold' }
    : customer.fraudScore >= 60
      ? { text: `${t('উচ্চ ঝুঁকি', 'High Risk')} (${customer.fraudScore}/100)`, cls: 'text-danger font-semibold' }
      : customer.fraudScore >= 30
        ? { text: `${t('মাঝারি ঝুঁকি', 'Moderate Risk')} (${customer.fraudScore}/100)`, cls: 'text-warning font-medium' }
        : customer.isRepeatCustomer
          ? { text: t('নির্ভরযোগ্য রিপিট গ্রাহক', 'Trusted Repeat'), cls: 'text-success font-medium' }
          : { text: t('সাধারণ গ্রাহক', 'Standard'), cls: 'text-muted' };

  return (
    <section className="space-y-6" aria-label={t('গ্রাহকের সম্পূর্ণ প্রোফাইল', 'Customer A-Z profile')}>
      {/* Top Full-Screen Profile Header & Back Bar */}
      <div className="space-y-4 border-b border-border pb-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex min-h-[44px] items-center gap-2 px-3 -ml-3 rounded-[var(--radius-md)] text-sm font-medium text-muted hover:text-ink hover:bg-surface transition-colors whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>{t('সকল কাস্টমারে ফিরে যান', 'Back to Customers')}</span>
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {validBdPhone && (
              <>
                <a
                  href={`tel:${customer.phoneKey}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 px-3.5 rounded-[var(--radius-md)] border border-border bg-surface text-xs font-medium text-ink hover:bg-bg transition-colors whitespace-nowrap shrink-0"
                >
                  <Phone className="w-3.5 h-3.5" aria-hidden="true" />
                  {t('কল করুন', 'Call')}
                </a>
                <a
                  href={`https://wa.me/88${customer.phoneKey}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 px-3.5 rounded-[var(--radius-md)] border border-border bg-surface text-xs font-medium text-ink hover:bg-bg transition-colors whitespace-nowrap shrink-0"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  WhatsApp
                </a>
              </>
            )}

            {isSuperAdmin && validBdPhone && (
              customer.isBlacklisted ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] whitespace-nowrap shrink-0"
                  disabled={busyKey === `bl:${customer.phoneKey}`}
                  onClick={() => void onBlacklistMutation(customer.phoneKey, 'remove')}
                >
                  {t('ব্ল্যাকলিস্ট সরান', 'Remove Blacklist')}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="min-h-[44px] whitespace-nowrap shrink-0"
                  onClick={() => setShowBlacklistForm((v) => !v)}
                >
                  <Ban className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  {t('ব্ল্যাকলিস্ট', 'Blacklist')}
                </Button>
              )
            )}
          </div>
        </div>

        {/* Customer Identity Title + Clean Unboxed Metadata */}
        <div className="space-y-1.5">
          <h1 className="text-xl sm:text-2xl font-bold text-ink tracking-tight">
            {customer.name}
          </h1>
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-muted">
            <span className="font-mono text-ink tabular-nums">{customer.displayPhone}</span>
            {customer.emails[0] && (
              <>
                <span aria-hidden="true">·</span>
                <span>{customer.emails[0]}</span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span>
              {customer.upazilaNameBn && customer.upazilaNameBn !== '—'
                ? `${customer.upazilaNameBn}, ${customer.districtNameBn}`
                : customer.districtNameBn}
            </span>
            {customer.firstSeenAt && (
              <>
                <span aria-hidden="true">·</span>
                <span className="tabular-nums">
                  {t('প্রথম রেকর্ড', 'First seen')}: {formatLocaleDateTime(customer.firstSeenAt, locale)}
                </span>
              </>
            )}
            <span aria-hidden="true">·</span>
            <span className={riskLabel.cls}>{riskLabel.text}</span>
          </div>

          {customer.isBlacklisted && customer.blacklistReasonBn && (
            <p className="text-xs text-danger pt-1">
              {t('ব্ল্যাকলিস্টের কারণ', 'Blacklist reason')}: {customer.blacklistReasonBn}
            </p>
          )}
        </div>

        {/* Inline Blacklist Reason Form */}
        {showBlacklistForm && isSuperAdmin && !customer.isBlacklisted && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void onBlacklistMutation(customer.phoneKey, 'add', blacklistReason).then(() => {
                setShowBlacklistForm(false);
                setBlacklistReason('');
              });
            }}
            className="pt-3 border-t border-border flex flex-col sm:flex-row gap-2.5 items-stretch sm:items-center max-w-2xl"
          >
            <input
              type="text"
              required
              minLength={3}
              value={blacklistReason}
              onChange={(e) => setBlacklistReason(e.target.value)}
              placeholder={t(
                'ব্ল্যাকলিস্ট করার কারণ লিখুন (যেমন: বারবার ফেক অর্ডার বা পার্সেল রিজেক্ট)...',
                'Reason for blacklisting (e.g., repeated fake orders or parcel refusals)...'
              )}
              className="flex-1 min-h-[44px] px-3 rounded-[var(--radius-md)] border border-border bg-surface text-xs text-ink focus:outline-none focus:border-ink"
            />
            <div className="flex gap-2 shrink-0">
              <Button
                type="submit"
                size="sm"
                variant="danger"
                className="min-h-[44px]"
                disabled={busyKey === `bl:${customer.phoneKey}`}
              >
                {t('ব্লক নিশ্চিত করুন', 'Confirm Block')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-[44px]"
                onClick={() => setShowBlacklistForm(false)}
              >
                {t('বাতিল', 'Cancel')}
              </Button>
            </div>
          </form>
        )}

        {/* Minimal 4-Tab Underline Navigation */}
        <nav
          className="flex items-center gap-1 overflow-x-auto pt-2 -mb-5"
          role="tablist"
          aria-label={t('কাস্টমার প্রোফাইল বিভাগ', 'Customer profile sections')}
        >
          {(
            [
              ['overview', t('সংক্ষিপ্ত তথ্য', 'Overview'), null],
              ['orders', t('অর্ডার ইতিহাস', 'Orders'), customer.orders.length],
              ['timeline', t('সম্পূর্ণ টাইমলাইন', 'Timeline'), timeline.length],
              ['messages', t('মেসেজ ও কার্ট', 'Messages'), totalCommsCount],
            ] as const
          ).map(([id, label, count]) => {
            const active = activeTab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(id)}
                className={`min-h-[44px] px-4 text-xs sm:text-sm font-medium border-b-2 transition-colors whitespace-nowrap shrink-0 ${
                  active
                    ? 'border-ink text-ink'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                {label}
                {count !== null && (
                  <span className="ml-1.5 text-xs tabular-nums opacity-70">
                    ({formatLocaleNumber(count, locale)})
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-[var(--radius-md)] border px-4 py-2.5 text-xs font-medium ${
            feedback.tone === 'success'
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-danger/40 bg-danger/10 text-danger'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* ====================================================================
          TAB 1: OVERVIEW (A-Z AT-A-GLANCE DOSSIER)
         ==================================================================== */}
      {activeTab === 'overview' && (
        <div className="space-y-6">
          {/* 4-Metric Hairline Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border border-border rounded-[var(--radius-md)] bg-surface divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="p-4 space-y-1">
              <p className="text-xs text-muted">{t('মোট ক্রয় (LTV)', 'Lifetime Spend')}</p>
              <p className="text-lg sm:text-xl font-bold text-ink tabular-nums">
                {formatPoishaToBdt(customer.lifetimeSpendPoisha, locale)}
              </p>
              <p className="text-xs text-muted tabular-nums">
                {t('গড় অর্ডার', 'Avg order')}: {formatPoishaToBdt(customer.averageOrderValuePoisha, locale)}
              </p>
            </div>
            <div className="p-4 space-y-1">
              <p className="text-xs text-muted">{t('মোট অর্ডার', 'Total Orders')}</p>
              <p className="text-lg sm:text-xl font-bold text-ink tabular-nums">
                {formatLocaleNumber(customer.totalOrders, locale)}
              </p>
              <p className="text-xs text-muted tabular-nums">
                {formatLocaleNumber(customer.deliveredOrders, locale)} {t('ডেলিভারড', 'delivered')} ·{' '}
                {formatLocaleNumber(customer.activeOrders, locale)} {t('চলমান', 'active')} ·{' '}
                {formatLocaleNumber(customer.returnedOrders + customer.cancelledOrders, locale)} {t('রিটার্ন/বাতিল', 'ret/canc')}
              </p>
            </div>
            <div className="p-4 space-y-1">
              <p className="text-xs text-muted">{t('ডেলিভারি সফলতা ও ঝুঁকি', 'Delivery & Risk')}</p>
              <p className="text-lg sm:text-xl font-bold text-ink tabular-nums">
                {formatLocaleNumber(deliveryRatePct, locale)}%
              </p>
              <p className="text-xs tabular-nums">
                <span className={riskLabel.cls}>
                  {t('ঝুঁকি স্কোর', 'Risk')}: {formatLocaleNumber(customer.fraudScore, locale)}/100
                </span>
              </p>
            </div>
            <div className="p-4 space-y-1">
              <p className="text-xs text-muted">{t('অগ্রিম বনাম বাকি COD', 'Paid vs Pending COD')}</p>
              <p className="text-lg sm:text-xl font-bold text-ink tabular-nums">
                {formatPoishaToBdt(customer.totalAdvancePaidPoisha, locale)}
              </p>
              <p className="text-xs text-muted tabular-nums">
                {t('চলমান COD বাকি', 'Open COD')}: {formatPoishaToBdt(customer.pendingCodPoisha, locale)}
              </p>
            </div>
          </div>

          {/* 2-Column Structured Dossier */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column: Identity + Delivery Addresses */}
            <div className="lg:col-span-7 space-y-6">
              <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5 space-y-4">
                <h2 className="text-sm font-semibold text-ink">
                  {t('পরিচিতি ও যোগাযোগের তথ্য', 'Identity & Contact Details')}
                </h2>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-xs border-t border-border pt-4">
                  <div>
                    <dt className="text-muted">{t('মূল নাম', 'Primary Name')}</dt>
                    <dd className="text-ink font-medium mt-0.5">{customer.name}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('মোবাইল নম্বর', 'Phone Number')}</dt>
                    <dd className="text-ink font-mono tabular-nums mt-0.5">{customer.displayPhone}</dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('ইমেইল', 'Email')}</dt>
                    <dd className="text-ink mt-0.5">
                      {customer.emails.length > 0 ? customer.emails.join(', ') : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('গ্রাহক আইডি', 'Customer Account ID')}</dt>
                    <dd className="text-ink font-mono mt-0.5">
                      {customer.customerIds.length > 0 ? customer.customerIds.join(', ') : t('গেস্ট চেকআউট', 'Guest checkout')}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('সর্বশেষ অ্যাক্টিভিটি', 'Last Activity')}</dt>
                    <dd className="text-ink tabular-nums mt-0.5">
                      {customer.lastActivityAt ? formatLocaleDateTime(customer.lastActivityAt, locale) : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t('সর্বশেষ অর্ডার', 'Latest Order')}</dt>
                    <dd className="text-ink font-mono mt-0.5">{customer.lastOrderNo || '—'}</dd>
                  </div>
                  {customer.alternateNames.length > 0 && (
                    <div className="sm:col-span-2">
                      <dt className="text-muted">{t('পূর্বের অর্ডারে ব্যবহৃত অন্যান্য নাম', 'Other Names Used')}</dt>
                      <dd className="text-ink mt-0.5">{customer.alternateNames.join(' · ')}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5 space-y-4">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold text-ink">
                    {t('ডেলিভারি ঠিকানাসমূহ', 'Recorded Delivery Addresses')}
                  </h2>
                  <span className="text-xs text-muted tabular-nums">
                    {formatLocaleNumber(customer.addresses.length, locale)} {t('টি ঠিকানা', 'addresses')}
                  </span>
                </div>

                {customer.addresses.length === 0 ? (
                  <p className="text-xs text-muted border-t border-border pt-4">
                    {t('এই গ্রাহকের কোনো ডেলিভারি ঠিকানা এখনো সংরক্ষিত নেই।', 'No shipping addresses recorded yet.')}
                  </p>
                ) : (
                  <ul className="divide-y divide-border border-t border-border">
                    {customer.addresses.map((addr) => (
                      <li key={addr.key} className="py-3.5 first:pt-4 last:pb-0 space-y-1 text-xs">
                        <p className="text-ink font-medium">{addr.streetAddress || '—'}</p>
                        {addr.landmark && (
                          <p className="text-muted">
                            {t('ল্যান্ডমার্ক', 'Landmark')}: {addr.landmark}
                          </p>
                        )}
                        <p className="text-muted">
                          {[
                            addr.upazilaNameBn,
                            addr.districtNameBn,
                            addr.postCode ? `${t('পোস্টকোড', 'Post')} ${addr.postCode}` : null,
                            addr.recipientAreaSummary || null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                        <p className="text-muted tabular-nums">
                          {t('ব্যবহৃত', 'Used')} {formatLocaleNumber(addr.usedCount, locale)}{' '}
                          {t('বার', 'times')}
                          {addr.addressQualityScore > 0
                            ? ` · ${t('ঠিকানা মান', 'Quality')}: ${formatLocaleNumber(addr.addressQualityScore, locale)}/100`
                            : ''}
                          {addr.lastUsedAt
                            ? ` · ${formatLocaleDateTime(addr.lastUsedAt, locale)}`
                            : ''}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Right Column: Preferences + Manual Payments + Returns/Refunds */}
            <div className="lg:col-span-5 space-y-6">
              <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5 space-y-4">
                <h2 className="text-sm font-semibold text-ink">
                  {t('অর্ডারিং ও পেমেন্ট আচরণ', 'Ordering & Payment Profile')}
                </h2>

                <div className="space-y-4 border-t border-border pt-4 text-xs">
                  <div className="space-y-1.5">
                    <p className="text-muted">{t('অর্ডারের মাধ্যম', 'Order Channels')}</p>
                    {channelSummary.length === 0 ? (
                      <p className="text-muted">—</p>
                    ) : (
                      <p className="text-ink">
                        {channelSummary
                          .map(([lbl, cnt]) => `${lbl} (${formatLocaleNumber(cnt, locale)})`)
                          .join(' · ')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-muted">{t('পেমেন্ট মাধ্যম', 'Payment Methods')}</p>
                    {paymentPreferenceSummary.length === 0 ? (
                      <p className="text-muted">—</p>
                    ) : (
                      <p className="text-ink">
                        {paymentPreferenceSummary
                          .map(([lbl, cnt]) => `${lbl} (${formatLocaleNumber(cnt, locale)})`)
                          .join(' · ')}
                      </p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <p className="text-muted">{t('ব্যবহৃত কুরিয়ার', 'Couriers Used')}</p>
                    {courierPreferenceSummary.length === 0 ? (
                      <p className="text-muted">—</p>
                    ) : (
                      <p className="text-ink">
                        {courierPreferenceSummary
                          .map(([lbl, cnt]) => `${lbl} (${formatLocaleNumber(cnt, locale)})`)
                          .join(' · ')}
                      </p>
                    )}
                  </div>
                </div>
              </div>

              {/* Manual Payments & Returns/Refunds Snapshot */}
              <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5 space-y-4">
                <h2 className="text-sm font-semibold text-ink">
                  {t('পেমেন্ট ভেরিফিকেশন, রিটার্ন ও রিফান্ড', 'Payments, Returns & Refunds')}
                </h2>

                <div className="space-y-4 border-t border-border pt-4 text-xs">
                  {customer.manualPayments.length === 0 &&
                  customer.returns.length === 0 &&
                  customer.refunds.length === 0 ? (
                    <p className="text-muted">
                      {t(
                        'এই গ্রাহকের কোনো ম্যানুয়াল TrxID দাবি, রিটার্ন বা রিফান্ড রেকর্ড নেই।',
                        'No manual MFS claims, returns, or refund records for this customer.'
                      )}
                    </p>
                  ) : (
                    <>
                      {customer.manualPayments.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-muted font-medium">
                            {t('ম্যানুয়াল MFS পেমেন্ট', 'Manual MFS Submissions')} (
                            {formatLocaleNumber(customer.manualPayments.length, locale)})
                          </p>
                          <ul className="divide-y divide-border border-t border-border">
                            {customer.manualPayments.map((pay) => (
                              <li key={pay.submissionId || `${pay.orderNo}-${pay.trxId}`} className="py-2 space-y-0.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-ink font-medium">
                                    {(pay.provider ?? 'bkash').toUpperCase()} · {pay.trxId}
                                  </span>
                                  <span className="tabular-nums text-ink font-medium">
                                    {formatPoishaToBdt(pay.submittedAmountPoisha, locale)}
                                  </span>
                                </div>
                                <p className="text-muted">
                                  {pay.orderNo} · {pay.status}
                                  {pay.reviewedByUsername ? ` · ${pay.reviewedByUsername}` : ''}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {customer.returns.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-muted font-medium">
                            {t('রিটার্ন রেকর্ড', 'Return Resolutions')} (
                            {formatLocaleNumber(customer.returns.length, locale)})
                          </p>
                          <ul className="divide-y divide-border border-t border-border">
                            {customer.returns.map((ret) => (
                              <li key={ret.returnId} className="py-2 space-y-0.5">
                                <p className="text-ink font-medium">
                                  <span className="font-mono">{ret.orderNo}</span> · {ret.faultType} (
                                  {formatLocaleNumber(ret.quantity, locale)} {t('পিস', 'pcs')})
                                </p>
                                {ret.noteBn && <p className="text-muted">{ret.noteBn}</p>}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {customer.refunds.length > 0 && (
                        <div className="space-y-2">
                          <p className="text-muted font-medium">
                            {t('গ্রাহক রিফান্ড', 'Customer Refunds')} (
                            {formatLocaleNumber(customer.refunds.length, locale)})
                          </p>
                          <ul className="divide-y divide-border border-t border-border">
                            {customer.refunds.map((ref) => (
                              <li key={ref.refundId} className="py-2 space-y-0.5">
                                <div className="flex items-center justify-between gap-2">
                                  <span className="font-mono text-ink font-medium">{ref.refundCode}</span>
                                  <span className="tabular-nums text-ink font-medium">
                                    {formatPoishaToBdt(ref.refundAmountPoisha, locale)}
                                  </span>
                                </div>
                                <p className="text-muted">
                                  {ref.orderNo} · {ref.status}
                                  {ref.reasonBn ? ` · ${ref.reasonBn}` : ''}
                                </p>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ====================================================================
          TAB 2: ORDERS (COMPLETE A-Z ITEMS, PAYMENT & COURIER DETAILS)
         ==================================================================== */}
      {activeTab === 'orders' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(
                [
                  ['all', t('সব অর্ডার', 'All Orders')],
                  ['active', t('চলমান', 'Active')],
                  ['delivered', t('ডেলিভারড', 'Delivered')],
                  ['returned_cancelled', t('রিটার্ন / বাতিল', 'Returned / Cancelled')],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setOrderFilter(key)}
                  className={`min-h-[40px] px-3.5 rounded-[var(--radius-md)] border transition-colors whitespace-nowrap shrink-0 ${
                    orderFilter === key
                      ? 'border-ink bg-ink text-bg font-medium'
                      : 'border-border bg-surface text-muted hover:text-ink'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {filteredOrders.length > 0 && (
              <button
                type="button"
                onClick={toggleExpandAllOrders}
                className="min-h-[40px] px-3 text-xs font-medium text-muted hover:text-ink transition-colors whitespace-nowrap shrink-0"
              >
                {allOrdersExpanded
                  ? t('সব সংকুচিত করুন', 'Collapse All')
                  : t('সব বিস্তারিত দেখুন', 'Expand All')}
              </button>
            )}
          </div>

          {filteredOrders.length === 0 ? (
            <EmptyState
              title={t('কোনো অর্ডার পাওয়া যায়নি', 'No orders found')}
              description={t(
                'এই ফিল্টারে গ্রাহকের কোনো অর্ডার রেকর্ড নেই।',
                'There are no orders matching this filter for this customer.'
              )}
            />
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((ord) => {
                const orderKey = ord.orderNo || ord.id || '';
                const expanded = Boolean(expandedOrderKeys[orderKey]);
                const statusMeta = getOrderStatusMeta(ord.status, bn);
                const items = ord.items ?? [];
                const totalQty = items.reduce((sum, i) => sum + (i.quantity || 1), 0);
                const matchedPayments = customer.manualPayments.filter(
                  (p) => p.orderNo === ord.orderNo
                );
                const matchedReturns = customer.returns.filter((r) => r.orderNo === ord.orderNo);
                const matchedRefunds = customer.refunds.filter((r) => r.orderNo === ord.orderNo);
                const trackingHref = buildTrackingHref(ord);

                return (
                  <article
                    key={orderKey}
                    className="border border-border rounded-[var(--radius-md)] bg-surface overflow-hidden"
                  >
                    {/* Order Summary Trigger Row */}
                    <button
                      type="button"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedOrderKeys((prev) => ({ ...prev, [orderKey]: !prev[orderKey] }))
                      }
                      className="w-full text-left px-4 sm:px-5 py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 hover:bg-bg/40 transition-colors"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-sm">
                          <span className="font-mono font-bold text-ink">{ord.orderNo || '—'}</span>
                          <span className={`text-xs font-semibold ${statusToneTextClass(statusMeta.tone)}`}>
                            {statusMeta.label}
                          </span>
                          {ord.isDuplicateFlagged && (
                            <span className="text-xs text-warning font-medium">
                              · {t('সম্ভাব্য ডুপ্লিকেট', 'Duplicate Flag')}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted tabular-nums">
                          {[
                            ord.createdAt ? formatLocaleDateTime(ord.createdAt, locale) : null,
                            getSourceLabel(ord.source, bn),
                            getPaymentMethodLabel(ord.paymentMethod, bn),
                            getCourierLabel(ord, bn),
                            totalQty > 0 ? `${formatLocaleNumber(totalQty, locale)} ${t('পিস', 'pcs')}` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      </div>

                      <div className="flex items-center justify-between md:justify-end gap-4 shrink-0">
                        <div className="text-left md:text-right">
                          <p className="text-sm font-bold text-ink tabular-nums">
                            {formatPoishaToBdt(ord.totalPayablePoisha ?? 0, locale)}
                          </p>
                          <p className="text-[11px] text-muted tabular-nums">
                            {t('অগ্রিম', 'Paid')}: {formatPoishaToBdt(ord.advancePaidPoisha ?? 0, locale)} ·{' '}
                            COD: {formatPoishaToBdt(ord.codCollectablePoisha ?? 0, locale)}
                          </p>
                        </div>
                        {expanded ? (
                          <ChevronUp className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronDown className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                        )}
                      </div>
                    </button>

                    {/* Expanded A-Z Order Detail (Hairline Zones, Zero Nested Cards) */}
                    {expanded && (
                      <div className="border-t border-border bg-bg/30 px-4 sm:px-5 py-5 space-y-6 text-xs">
                        {/* Zone A: Full Ordered Items Table + Financial Breakdown */}
                        <div className="space-y-3">
                          <h3 className="font-semibold text-ink">
                            {t('অর্ডারকৃত পণ্য ও হিসাব', 'Ordered Items & Price Breakdown')}
                          </h3>

                          {items.length === 0 ? (
                            <p className="text-muted">
                              {ord.itemDescSummary ||
                                t('আইটেম তালিকা পাওয়া যায়নি।', 'No line items recorded.')}
                            </p>
                          ) : (
                            <div className="overflow-x-auto border-t border-b border-border">
                              <table className="w-full text-left">
                                <thead>
                                  <tr className="border-b border-border text-muted">
                                    <th className="py-2 pr-3 font-medium">{t('পণ্য ও ভ্যারিয়েন্ট', 'Product & Variant')}</th>
                                    <th className="py-2 px-3 font-medium">{t('SKU', 'SKU')}</th>
                                    <th className="py-2 px-3 font-medium text-right">{t('পরিমাণ', 'Qty')}</th>
                                    <th className="py-2 px-3 font-medium text-right">{t('একক মূল্য', 'Unit Price')}</th>
                                    <th className="py-2 pl-3 font-medium text-right">{t('মোট', 'Subtotal')}</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-border/70">
                                  {items.map((item, idx) => {
                                    const lineTotal =
                                      item.lineSubtotalPoisha ??
                                      item.unitSalePricePoisha * item.quantity;
                                    return (
                                      <tr key={`${orderKey}-item-${idx}`}>
                                        <td className="py-2.5 pr-3">
                                          <p className="text-ink font-medium">{item.productNameBn}</p>
                                          {item.variantTitleBn && (
                                            <p className="text-muted">{item.variantTitleBn}</p>
                                          )}
                                        </td>
                                        <td className="py-2.5 px-3 font-mono text-muted whitespace-nowrap">
                                          {item.publicSku || '—'}
                                        </td>
                                        <td className="py-2.5 px-3 text-right tabular-nums text-ink">
                                          {formatLocaleNumber(item.quantity, locale)}
                                        </td>
                                        <td className="py-2.5 px-3 text-right tabular-nums text-ink">
                                          {formatPoishaToBdt(item.unitSalePricePoisha, locale)}
                                        </td>
                                        <td className="py-2.5 pl-3 text-right tabular-nums font-medium text-ink">
                                          {formatPoishaToBdt(lineTotal, locale)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          )}

                          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-1">
                            <div>
                              <span className="text-muted block">{t('সাবটোটাল', 'Subtotal')}</span>
                              <span className="text-ink font-medium tabular-nums">
                                {formatPoishaToBdt(ord.subtotalPoisha ?? 0, locale)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted block">{t('ডিসকাউন্ট', 'Discount')}</span>
                              <span className="text-ink font-medium tabular-nums">
                                -{formatPoishaToBdt(ord.discountPoisha ?? 0, locale)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted block">{t('ডেলিভারি চার্জ', 'Delivery')}</span>
                              <span className="text-ink font-medium tabular-nums">
                                {formatPoishaToBdt(ord.deliveryChargePoisha ?? 0, locale)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted block">{t('সর্বমোট বিল', 'Total Payable')}</span>
                              <span className="text-ink font-bold tabular-nums">
                                {formatPoishaToBdt(ord.totalPayablePoisha ?? 0, locale)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted block">{t('অগ্রিম পরিশোধ', 'Advance Paid')}</span>
                              <span className="text-success font-semibold tabular-nums">
                                {formatPoishaToBdt(ord.advancePaidPoisha ?? 0, locale)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted block">{t('COD কালেকশন', 'COD Collectable')}</span>
                              <span className="text-ink font-bold tabular-nums">
                                {formatPoishaToBdt(ord.codCollectablePoisha ?? 0, locale)}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Zone B & C: Payment + Courier & Address side-by-side */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 border-t border-border pt-5">
                          {/* Payment & Verification */}
                          <div className="space-y-3">
                            <h3 className="font-semibold text-ink">
                              {t('পেমেন্ট ও ভেরিফিকেশন', 'Payment & Verification')}
                            </h3>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                              <div>
                                <dt className="text-muted">{t('পেমেন্ট মাধ্যম', 'Method')}</dt>
                                <dd className="text-ink font-medium mt-0.5">
                                  {getPaymentMethodLabel(ord.paymentMethod, bn)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted">{t('পেমেন্ট স্ট্যাটাস', 'Payment Status')}</dt>
                                <dd className="text-ink font-medium mt-0.5">
                                  {ord.paymentStatus || '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted">{t('ম্যানুয়াল TrxID', 'Manual TrxID')}</dt>
                                <dd className="text-ink font-mono mt-0.5">
                                  {ord.manualPaymentTrxId || '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted">{t('অগ্রিম বাধ্যতামূলক', 'Advance Policy')}</dt>
                                <dd className="text-ink mt-0.5">
                                  {ord.isAdvanceMandatory
                                    ? t('হ্যাঁ (বাধ্যতামূলক)', 'Required')
                                    : t('না', 'Optional')}
                                </dd>
                              </div>
                            </dl>

                            {matchedPayments.length > 0 && (
                              <div className="border-t border-border/70 pt-2.5 space-y-1.5">
                                <p className="text-muted font-medium">
                                  {t('সাবমিট করা MFS রেকর্ড', 'Submitted MFS Claims')}
                                </p>
                                {matchedPayments.map((mp) => (
                                  <p key={mp.submissionId || mp.trxId} className="text-ink tabular-nums">
                                    {(mp.provider ?? 'bkash').toUpperCase()} ·{' '}
                                    <span className="font-mono">{mp.trxId}</span> ·{' '}
                                    {formatPoishaToBdt(mp.submittedAmountPoisha, locale)} ·{' '}
                                    <span className="text-muted">{mp.status}</span>
                                    {mp.senderPhoneMasked ? ` · ${mp.senderPhoneMasked}` : ''}
                                    {mp.reviewedByUsername ? ` · ${t('যাচাই', 'By')}: ${mp.reviewedByUsername}` : ''}
                                  </p>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Courier, Tracking & Full Shipping Address */}
                          <div className="space-y-3">
                            <h3 className="font-semibold text-ink">
                              {t('কুরিয়ার, ট্র্যাকিং ও ডেলিভারি ঠিকানা', 'Courier, Tracking & Address')}
                            </h3>
                            <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                              <div>
                                <dt className="text-muted">{t('কুরিয়ার', 'Courier')}</dt>
                                <dd className="text-ink font-medium mt-0.5">
                                  {getCourierLabel(ord, bn)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted">{t('ডেলিভারি ধরন', 'Delivery Method')}</dt>
                                <dd className="text-ink mt-0.5">{ord.deliveryMethod || '—'}</dd>
                              </div>
                              <div>
                                <dt className="text-muted">{t('কনসাইনমেন্ট আইডি', 'Consignment ID')}</dt>
                                <dd className="text-ink font-mono mt-0.5">
                                  {ord.consignmentId || '—'}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted">{t('ট্র্যাকিং কোড', 'Tracking Code')}</dt>
                                <dd className="text-ink font-mono mt-0.5 flex items-center gap-1.5">
                                  <span>{ord.trackingCode || '—'}</span>
                                  {trackingHref && (
                                    <a
                                      href={trackingHref}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-0.5 text-ink underline hover:opacity-75 font-sans"
                                    >
                                      {t('ট্র্যাক', 'Track')}
                                      <ExternalLink className="w-3 h-3" aria-hidden="true" />
                                    </a>
                                  )}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted">{t('ওজন ও প্রিন্ট', 'Weight & Prints')}</dt>
                                <dd className="text-ink tabular-nums mt-0.5">
                                  {ord.totalWeightGrams
                                    ? `${(ord.totalWeightGrams / 1000).toFixed(2)} kg`
                                    : '—'}{' '}
                                  · {t('স্লিপ প্রিন্ট', 'Prints')}:{' '}
                                  {formatLocaleNumber(ord.printCount ?? 0, locale)}
                                </dd>
                              </div>
                              <div>
                                <dt className="text-muted">{t('ঠিকানার মান', 'Address Quality')}</dt>
                                <dd className="text-ink tabular-nums mt-0.5">
                                  {ord.addressQualityScore !== undefined
                                    ? `${formatLocaleNumber(ord.addressQualityScore, locale)}/100`
                                    : '—'}
                                </dd>
                              </div>
                              <div className="col-span-2">
                                <dt className="text-muted">{t('সম্পূর্ণ ঠিকানা', 'Full Shipping Address')}</dt>
                                <dd className="text-ink mt-0.5 leading-relaxed">
                                  {[
                                    ord.streetAddress,
                                    ord.landmark ? `(${ord.landmark})` : null,
                                    ord.upazilaNameBn,
                                    ord.districtNameBn,
                                    ord.postCode ? `${t('পোস্টকোড', 'Post')}: ${ord.postCode}` : null,
                                  ]
                                    .filter(Boolean)
                                    .join(', ') || '—'}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        </div>

                        {/* Zone D: Confirmation Call, Notes & Return/Refund Links */}
                        <div className="border-t border-border pt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div>
                            <span className="text-muted block">{t('কনফার্মেশন কল', 'Confirmation Call')}</span>
                            <p className="text-ink mt-0.5 tabular-nums">
                              {CALL_STATUS_LABELS[ord.callStatus ?? 'pending']
                                ? bn
                                  ? CALL_STATUS_LABELS[ord.callStatus ?? 'pending'].bn
                                  : CALL_STATUS_LABELS[ord.callStatus ?? 'pending'].en
                                : ord.callStatus || '—'}{' '}
                              ({t('চেষ্টা', 'Attempts')}: {formatLocaleNumber(ord.callAttempts ?? 0, locale)})
                            </p>
                            {ord.callStatusNote && (
                              <p className="text-muted mt-0.5">{ord.callStatusNote}</p>
                            )}
                          </div>
                          <div>
                            <span className="text-muted block">{t('গ্রাহকের নোট / নির্দেশনা', 'Customer Note')}</span>
                            <p className="text-ink mt-0.5">
                              {[ord.customerNote, ord.specialInstruction].filter(Boolean).join(' · ') || '—'}
                            </p>
                          </div>
                          <div>
                            <span className="text-muted block">{t('অভ্যন্তরীণ স্টাফ নোট', 'Internal Staff Note')}</span>
                            <p className="text-ink mt-0.5">{ord.internalStaffNote || '—'}</p>
                          </div>
                        </div>

                        {(matchedReturns.length > 0 || matchedRefunds.length > 0) && (
                          <div className="border-t border-border pt-4 space-y-1.5">
                            {matchedReturns.map((ret) => (
                              <p key={ret.returnId} className="text-danger">
                                {t('রিটার্ন রেকর্ড', 'Return')}: {ret.faultType} ·{' '}
                                {formatLocaleNumber(ret.quantity, locale)} {t('পিস', 'pcs')} ·{' '}
                                {t('রিস্টক', 'Restock')}: {formatLocaleNumber(ret.restockQuantity, locale)}
                                {ret.noteBn ? ` · ${ret.noteBn}` : ''}
                              </p>
                            ))}
                            {matchedRefunds.map((ref) => (
                              <p key={ref.refundId} className="text-warning">
                                {t('রিফান্ড', 'Refund')} {ref.refundCode}:{' '}
                                {formatPoishaToBdt(ref.refundAmountPoisha, locale)} · {ref.status}
                                {ref.refundTrxId ? ` · TrxID ${ref.refundTrxId}` : ''}
                                {ref.reasonBn ? ` · ${ref.reasonBn}` : ''}
                              </p>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 3: UNIFIED CHRONOLOGICAL A-Z TIMELINE
         ==================================================================== */}
      {activeTab === 'timeline' && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5 text-xs">
            {(
              [
                ['all', t('সব ইভেন্ট', 'All Activity')],
                ['orders', t('অর্ডার', 'Orders')],
                ['payments', t('পেমেন্ট ও রিটার্ন', 'Payments & Returns')],
                ['comms', t('মেসেজ ও কার্ট', 'Messages & Carts')],
                ['audit', t('অডিট ট্রেইল', 'Audit Trail')],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTimelineFilter(key)}
                className={`min-h-[40px] px-3.5 rounded-[var(--radius-md)] border transition-colors whitespace-nowrap shrink-0 ${
                  timelineFilter === key
                    ? 'border-ink bg-ink text-bg font-medium'
                    : 'border-border bg-surface text-muted hover:text-ink'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {filteredTimeline.length === 0 ? (
            <EmptyState
              title={t('কোনো অ্যাক্টিভিটি পাওয়া যায়নি', 'No activity found')}
              description={t(
                'এই ক্যাটাগরিতে এখনো কোনো ইভেন্ট রেকর্ড হয়নি।',
                'No timeline events recorded under this filter yet.'
              )}
            />
          ) : (
            <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5">
              <ol className="relative border-l border-border ml-2 pl-6 space-y-5">
                {filteredTimeline.map((entry) => (
                  <li key={entry.id} className="relative space-y-1">
                    <span
                      aria-hidden="true"
                      className="absolute -left-[29px] top-1.5 w-2 h-2 rounded-full bg-border border border-surface"
                    />
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`font-semibold ${statusToneTextClass(entry.tone)}`}>
                          {bn ? entry.typeLabelBn : entry.typeLabelEn}
                        </span>
                        {entry.refCode && (
                          <>
                            <span className="text-muted" aria-hidden="true">·</span>
                            <span className="font-mono text-ink">{entry.refCode}</span>
                          </>
                        )}
                      </div>
                      <time className="text-muted tabular-nums">
                        {entry.timestamp ? formatLocaleDateTime(entry.timestamp, locale) : '—'}
                      </time>
                    </div>
                    <p className="text-sm font-medium text-ink">{entry.title}</p>
                    {entry.subtitle && (
                      <p className="text-xs text-muted leading-relaxed">{entry.subtitle}</p>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 4: MESSAGES, OUTBOUND LOGS & CUSTOMER ABANDONED CARTS
         ==================================================================== */}
      {activeTab === 'messages' && (
        <div className="space-y-6">
          {/* Storefront Inquiries */}
          <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">
                {t('গ্রাহকের ইনকোয়ারি ও মেসেজ', 'Storefront Inquiries')}
              </h2>
              <span className="text-xs text-muted tabular-nums">
                {formatLocaleNumber(customer.inquiries.length, locale)}
              </span>
            </div>

            {customer.inquiries.length === 0 ? (
              <p className="text-xs text-muted border-t border-border pt-4">
                {t('এই গ্রাহকের কোনো ইনকোয়ারি মেসেজ নেই।', 'No storefront inquiries from this customer.')}
              </p>
            ) : (
              <ul className="divide-y divide-border border-t border-border">
                {customer.inquiries.map((inq) => (
                  <li
                    key={inq.id}
                    className="py-4 first:pt-4 last:pb-0 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                  >
                    <div className="space-y-1 min-w-0">
                      <p className="text-sm font-semibold text-ink">{inq.subject}</p>
                      <p className="text-xs text-muted tabular-nums">
                        {inq.status} · {formatLocaleDateTime(inq.createdAt, locale)}
                      </p>
                      <p className="text-xs text-ink leading-relaxed whitespace-pre-wrap">
                        {inq.message}
                      </p>
                      {inq.adminNotes && (
                        <p className="text-xs text-muted">
                          {t('অ্যাডমিন নোট', 'Admin note')}: {inq.adminNotes}
                        </p>
                      )}
                    </div>
                    {onOpenInquiryInInbox && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-[40px] shrink-0 whitespace-nowrap"
                        onClick={() => onOpenInquiryInInbox(inq.id)}
                      >
                        <MessageSquare className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                        {t('ইনবক্সে খুলুন', 'Open in Inbox')}
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Outbound Dispatched Messages */}
          <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">
                {t('পাঠানো মেসেজ ও অটোমেশন লগ', 'Outbound Message Logs')}
              </h2>
              <span className="text-xs text-muted tabular-nums">
                {formatLocaleNumber(customer.messageLogs.length, locale)}
              </span>
            </div>

            {customer.messageLogs.length === 0 ? (
              <p className="text-xs text-muted border-t border-border pt-4">
                {t('কোনো আউটবাউন্ড মেসেজ লগ নেই।', 'No outbound messages logged for this customer.')}
              </p>
            ) : (
              <ul className="divide-y divide-border border-t border-border text-xs">
                {customer.messageLogs.map((log) => (
                  <li key={log.id} className="py-3.5 first:pt-4 last:pb-0 space-y-1">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-ink">
                        {log.channel} · {log.eventKey}
                        {log.orderNo ? ` · ${log.orderNo}` : ''}
                      </span>
                      <span className="text-muted tabular-nums">
                        {log.status} · {formatLocaleDateTime(log.createdAt, locale)}
                      </span>
                    </div>
                    <p className="text-muted leading-relaxed whitespace-pre-wrap">
                      {log.renderedMessage}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Customer's Abandoned Carts */}
          <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">
                {t('গ্রাহকের পরিত্যক্ত কার্ট', 'Customer Abandoned Carts')}
              </h2>
              <span className="text-xs text-muted tabular-nums">
                {formatLocaleNumber(customer.abandonedCarts.length, locale)}
              </span>
            </div>

            {customer.abandonedCarts.length === 0 ? (
              <p className="text-xs text-muted border-t border-border pt-4">
                {t('কোনো পরিত্যক্ত কার্ট রেকর্ড নেই।', 'No abandoned carts for this customer.')}
              </p>
            ) : (
              <ul className="divide-y divide-border border-t border-border text-xs">
                {customer.abandonedCarts.map((cart) => (
                  <li
                    key={cart.cartId}
                    className="py-4 first:pt-4 last:pb-0 flex flex-col md:flex-row md:items-center justify-between gap-3"
                  >
                    <div className="space-y-1">
                      <p className="font-medium text-ink tabular-nums">
                        {formatPoishaToBdt(cart.subtotalPoisha, locale)} ·{' '}
                        <span className={cart.isRecovered ? 'text-success' : 'text-warning'}>
                          {cart.isRecovered
                            ? `${t('রিকভার্ড', 'Recovered')}${cart.recoveredOrderNo ? ` (${cart.recoveredOrderNo})` : ''}`
                            : t('অপেক্ষমাণ', 'Pending')}
                        </span>
                      </p>
                      <p className="text-muted">
                        {cart.items
                          .map((i) => `${i.productNameBn} (${i.variantTitleBn}) ×${i.quantity}`)
                          .join(', ')}
                      </p>
                      <p className="text-muted tabular-nums">
                        {t('রিমাইন্ডার', 'Reminders')}:{' '}
                        {formatLocaleNumber(cart.reminderSentCount, locale)} ·{' '}
                        {formatLocaleDateTime(cart.updatedAt, locale)}
                      </p>
                    </div>

                    {!cart.isRecovered && (
                      <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <a
                          href={cart.waMeRecoveryLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={() => void onRecordCartReminder(cart, 'wa_me')}
                          className="inline-flex min-h-[40px] items-center gap-1 px-3 rounded-[var(--radius-md)] border border-border bg-bg text-xs font-medium text-ink hover:bg-surface whitespace-nowrap"
                        >
                          WhatsApp
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                        </a>
                        <a
                          href={cart.smsRecoveryLink}
                          onClick={() => void onRecordCartReminder(cart, 'sms')}
                          className="inline-flex min-h-[40px] items-center gap-1 px-3 rounded-[var(--radius-md)] border border-border bg-bg text-xs font-medium text-ink hover:bg-surface whitespace-nowrap"
                        >
                          SMS
                        </a>
                        <Button
                          type="button"
                          size="sm"
                          variant="primary"
                          className="min-h-[40px] whitespace-nowrap"
                          disabled={busyKey === `rec:${cart.cartId}`}
                          onClick={() => void onRecoverCart(cart.cartId)}
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                          {t('অর্ডারে কনভার্ট', 'Convert to Order')}
                        </Button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
