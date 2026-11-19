'use client';

import * as React from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Search,
  ShoppingCart,
  UserCheck,
  Users,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin/admin-fetch';
import type { CustomerInquiryRecord } from '@/lib/db/repository';
import type { Customer360ProfileDTO, ManagedAbandonedCartRecord } from '@/lib/admin/phase6-service';
import type { PendingMfsSubmissionLike } from '@/lib/admin/order-management';
import type { MessageDispatchLogRecord } from '@/lib/admin/phase4c-service';
import type { ReturnResolutionRecord } from '@/lib/admin/phase4b-service';
import type { CustomerRefundExecutionRecord } from '@/lib/admin/phase7-service';
import type { ImmutableAuditLogRecord } from '@/lib/admin/phase4a-service';
import { normalizeBdPhone } from '@/lib/validators';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleDateTime, formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { Button, EmptyState, Input } from '../ui/primitives';
import {
  CustomerAZProfileView,
  type ContactOrder,
  type CustomerAddressSummary,
  type CustomerAZProfile,
} from './customer-az-profile-view';

type CrmSubTab = 'directory' | 'abandoned' | 'blacklist';
type SegmentFilter = 'all' | 'repeat' | 'high_risk' | 'blacklisted' | 'has_inquiry';
type SortOption = 'recent' | 'spend_desc' | 'orders_desc' | 'risk_desc';

export interface CrmContactsPanelProps {
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  customers360: Customer360ProfileDTO[];
  orders: ContactOrder[];
  inquiries: CustomerInquiryRecord[];
  abandonedCarts: ManagedAbandonedCartRecord[];
  blacklistedPhones: Record<string, { reasonBn: string; addedAt: string }>;
  manualPaymentSubmissions?: PendingMfsSubmissionLike[];
  messageLogs?: MessageDispatchLogRecord[];
  returnResolutions?: ReturnResolutionRecord[];
  customerRefunds?: CustomerRefundExecutionRecord[];
  auditLogs?: ImmutableAuditLogRecord[];
  onOpenInquiryInInbox?: (inquiryId: string) => void;
  onRefreshWorkspace: () => Promise<void>;
}

function toNormalizedPhone(raw: string): string {
  const normalized = normalizeBdPhone(raw);
  if (normalized) return normalized;
  const digits = raw
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/\D/g, '');
  if (digits.startsWith('880') && digits.length === 13) return `0${digits.slice(3)}`;
  return digits || raw.trim();
}

export function CrmContactsPanel({
  locale,
  isSuperAdmin,
  customers360,
  orders,
  inquiries,
  abandonedCarts,
  blacklistedPhones,
  manualPaymentSubmissions = [],
  messageLogs = [],
  returnResolutions = [],
  customerRefunds = [],
  auditLogs = [],
  onOpenInquiryInInbox,
  onRefreshWorkspace,
}: CrmContactsPanelProps) {
  const bn = locale === 'bn';
  const t = React.useCallback((b: string, e: string) => (bn ? b : e), [bn]);

  const [subTab, setSubTab] = React.useState<CrmSubTab>('directory');
  const [search, setSearch] = React.useState('');
  const [segment, setSegment] = React.useState<SegmentFilter>('all');
  const [sortBy, setSortBy] = React.useState<SortOption>('recent');
  const [selectedPhone, setSelectedPhone] = React.useState<string | null>(null);
  const [busyKey, setBusyKey] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  // Blacklist registry add form state
  const [blPhone, setBlPhone] = React.useState('');
  const [blReason, setBlReason] = React.useState('');

  const notify = React.useCallback((text: string, tone: 'success' | 'error' = 'success') => {
    setFeedback({ tone, text });
  }, []);

  const unifiedContacts = React.useMemo<CustomerAZProfile[]>(() => {
    const map = new Map<string, CustomerAZProfile>();
    const orderNoToPhone = new Map<string, string>();
    const unknownLabel = t('অজানা গ্রাহক', 'Unknown customer');
    const blacklistedFallbackName = t('ব্ল্যাকলিস্টেড নম্বর', 'Blacklisted number');

    const ensure = (rawPhone: string, name: string, timestamp: string) => {
      const key = toNormalizedPhone(rawPhone);
      if (!key) return null;
      const cleanName = name.trim();
      const existing = map.get(key);
      if (existing) {
        if (
          cleanName &&
          cleanName !== unknownLabel &&
          cleanName !== blacklistedFallbackName
        ) {
          if (
            existing.name === unknownLabel ||
            existing.name === blacklistedFallbackName
          ) {
            existing.name = cleanName;
          } else if (
            existing.name.toLowerCase() !== cleanName.toLowerCase() &&
            !existing.alternateNames.some((n) => n.toLowerCase() === cleanName.toLowerCase())
          ) {
            existing.alternateNames.push(cleanName);
          }
        }
        if (timestamp) {
          if (!existing.lastActivityAt || timestamp > existing.lastActivityAt) {
            existing.lastActivityAt = timestamp;
          }
          if (!existing.firstSeenAt || timestamp < existing.firstSeenAt) {
            existing.firstSeenAt = timestamp;
          }
        }
        return existing;
      }

      const blEntry = blacklistedPhones[key] || blacklistedPhones[rawPhone];
      const fresh: CustomerAZProfile = {
        phoneKey: key,
        displayPhone: key,
        name: cleanName || unknownLabel,
        alternateNames: [],
        emails: [],
        customerIds: [],
        districtNameBn: '—',
        upazilaNameBn: '—',
        totalOrders: 0,
        deliveredOrders: 0,
        activeOrders: 0,
        returnedOrders: 0,
        cancelledOrders: 0,
        deliverySuccessRateBp: 0,
        isRepeatCustomer: false,
        fraudScore: blEntry ? 90 : 0,
        isBlacklisted: Boolean(blEntry),
        blacklistReasonBn: blEntry?.reasonBn ?? null,
        blacklistedAt: blEntry?.addedAt ?? null,
        lifetimeSpendPoisha: 0,
        averageOrderValuePoisha: 0,
        totalAdvancePaidPoisha: 0,
        pendingCodPoisha: 0,
        firstSeenAt: timestamp || '',
        lastOrderNo: null,
        lastActivityAt: timestamp || '',
        addresses: [],
        orders: [],
        manualPayments: [],
        returns: [],
        refunds: [],
        inquiries: [],
        messageLogs: [],
        abandonedCarts: [],
        auditEvents: [],
      };
      map.set(key, fresh);
      return fresh;
    };

    // 1. Seed from Customer 360 aggregates
    for (const c of customers360) {
      const entry = ensure(c.customerPhone, c.customerName, c.lastOrderAt);
      if (!entry) continue;
      if (c.customerName) entry.name = c.customerName;
      if (c.districtNameBn) entry.districtNameBn = c.districtNameBn;
      entry.totalOrders = c.totalOrders;
      entry.deliveredOrders = c.deliveredOrders;
      entry.returnedOrders = c.returnedOrders;
      entry.cancelledOrders = c.cancelledOrders;
      entry.deliverySuccessRateBp = c.deliverySuccessRateBp;
      entry.isRepeatCustomer = c.isRepeatCustomer;
      entry.fraudScore = c.fraudScore;
      entry.isBlacklisted = c.isBlacklisted || Boolean(blacklistedPhones[entry.phoneKey]);
      entry.blacklistReasonBn =
        c.blacklistReasonBn || blacklistedPhones[entry.phoneKey]?.reasonBn || null;
      entry.lifetimeSpendPoisha = c.lifetimeSpendPoisha;
      entry.lastOrderNo = c.lastOrderNo || entry.lastOrderNo;
    }

    // 2. Merge every order (with full items, addresses, payment & courier details)
    for (const ord of orders) {
      if (!ord.customerPhone) continue;
      const entry = ensure(ord.customerPhone, ord.customerName ?? '', ord.createdAt ?? '');
      if (!entry) continue;
      entry.orders.push(ord);
      if (ord.orderNo) {
        orderNoToPhone.set(ord.orderNo.toUpperCase(), entry.phoneKey);
      }
      if (ord.customerEmail?.trim()) {
        const em = ord.customerEmail.trim().toLowerCase();
        if (!entry.emails.includes(em)) entry.emails.push(em);
      }
      if (ord.customerId?.trim() && !entry.customerIds.includes(ord.customerId.trim())) {
        entry.customerIds.push(ord.customerId.trim());
      }
      if (ord.districtNameBn && entry.districtNameBn === '—') {
        entry.districtNameBn = ord.districtNameBn;
      }
      if (ord.upazilaNameBn && entry.upazilaNameBn === '—') {
        entry.upazilaNameBn = ord.upazilaNameBn;
      }
    }

    // 3. Merge Storefront Inquiries
    for (const inq of inquiries) {
      const entry = ensure(inq.phone, inq.name, inq.createdAt);
      if (!entry) continue;
      entry.inquiries.push(inq);
    }

    // 4. Merge Abandoned Carts
    for (const cart of abandonedCarts) {
      if (!cart.customerPhone) continue;
      const entry = ensure(cart.customerPhone, cart.customerName, cart.updatedAt || cart.createdAt);
      if (!entry) continue;
      entry.abandonedCarts.push(cart);
      if (cart.districtNameBn && entry.districtNameBn === '—') {
        entry.districtNameBn = cart.districtNameBn;
      }
    }

    // 5. Merge Blacklist entries
    for (const [rawPhone, bl] of Object.entries(blacklistedPhones)) {
      const entry = ensure(rawPhone, blacklistedFallbackName, bl.addedAt);
      if (!entry) continue;
      entry.isBlacklisted = true;
      entry.blacklistReasonBn = bl.reasonBn;
      entry.blacklistedAt = bl.addedAt;
      entry.fraudScore = Math.max(entry.fraudScore, 90);
    }

    // 6. Attach Manual Payment Submissions (by orderNo or senderPhone)
    for (const pay of manualPaymentSubmissions) {
      const phoneKey =
        orderNoToPhone.get((pay.orderNo ?? '').toUpperCase()) ??
        (pay.senderPhone ? toNormalizedPhone(pay.senderPhone) : null);
      if (!phoneKey) continue;
      const entry = map.get(phoneKey);
      if (entry) entry.manualPayments.push(pay);
    }

    // 7. Attach Outbound Message Logs (by recipientPhone or orderNo)
    for (const log of messageLogs) {
      const phoneKey =
        (log.recipientPhone ? toNormalizedPhone(log.recipientPhone) : null) ??
        orderNoToPhone.get((log.orderNo ?? '').toUpperCase()) ??
        null;
      if (!phoneKey) continue;
      const entry = map.get(phoneKey);
      if (entry) entry.messageLogs.push(log);
    }

    // 8. Attach Return Resolutions (by orderNo)
    for (const ret of returnResolutions) {
      const phoneKey = orderNoToPhone.get((ret.orderNo ?? '').toUpperCase());
      if (!phoneKey) continue;
      const entry = map.get(phoneKey);
      if (entry) entry.returns.push(ret);
    }

    // 9. Attach Customer Refunds (by orderNo or customerPhone)
    for (const ref of customerRefunds) {
      const phoneKey =
        orderNoToPhone.get((ref.orderNo ?? '').toUpperCase()) ??
        (ref.customerPhone ? toNormalizedPhone(ref.customerPhone) : null);
      if (!phoneKey) continue;
      const entry = map.get(phoneKey);
      if (entry) entry.refunds.push(ref);
    }

    // 10. Attach relevant Audit Trail events (by orderNo or customer phone)
    for (const ev of auditLogs) {
      const targetUpper = (ev.targetId ?? '').toUpperCase();
      const phoneFromOrder = orderNoToPhone.get(targetUpper);
      const phoneFromTarget = map.has(toNormalizedPhone(ev.targetId ?? ''))
        ? toNormalizedPhone(ev.targetId ?? '')
        : null;
      const phoneKey = phoneFromOrder ?? phoneFromTarget;
      if (!phoneKey) continue;
      const entry = map.get(phoneKey);
      if (entry) entry.auditEvents.push(ev);
    }

    // 11. Finalize derived metrics, sorted orders, and deduplicated addresses
    for (const entry of map.values()) {
      entry.orders.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      entry.inquiries.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      entry.messageLogs.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
      entry.abandonedCarts.sort((a, b) =>
        (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || '')
      );

      if (entry.orders.length > 0) {
        let delivered = 0;
        let returned = 0;
        let cancelled = 0;
        let active = 0;
        let totalAdvance = 0;
        let pendingCod = 0;
        let grossNonCancelledSpend = 0;
        const addrMap = new Map<string, CustomerAddressSummary>();

        for (const ord of entry.orders) {
          const st = (ord.status ?? '').toLowerCase();
          if (st === 'delivered') delivered += 1;
          else if (st === 'returned' || st === 'partial_return') returned += 1;
          else if (st === 'cancelled') cancelled += 1;
          else active += 1;

          totalAdvance += ord.advancePaidPoisha ?? 0;
          if (!['delivered', 'returned', 'cancelled'].includes(st)) {
            pendingCod += ord.codCollectablePoisha ?? 0;
          }
          if (st !== 'cancelled') {
            grossNonCancelledSpend += ord.totalPayablePoisha ?? 0;
          }

          const street = (ord.streetAddress ?? '').trim();
          const dist = (ord.districtNameBn ?? '').trim();
          const upazila = (ord.upazilaNameBn ?? '').trim();
          if (street || dist) {
            const addrKey = `${street.toLowerCase()}|${upazila.toLowerCase()}|${dist.toLowerCase()}`;
            const existingAddr = addrMap.get(addrKey);
            if (existingAddr) {
              existingAddr.usedCount += 1;
              if ((ord.createdAt ?? '') > existingAddr.lastUsedAt) {
                existingAddr.lastUsedAt = ord.createdAt ?? '';
              }
            } else {
              addrMap.set(addrKey, {
                key: addrKey,
                streetAddress: street,
                landmark: (ord.landmark ?? '').trim(),
                upazilaNameBn: upazila,
                districtNameBn: dist,
                postCode: (ord.postCode ?? '').trim(),
                recipientAreaSummary: [ord.recipientCity, ord.recipientZone, ord.recipientArea]
                  .filter(Boolean)
                  .join(' / '),
                addressQualityScore: ord.addressQualityScore ?? 0,
                usedCount: 1,
                lastUsedAt: ord.createdAt ?? '',
              });
            }
          }
        }

        if (entry.totalOrders === 0) {
          entry.totalOrders = entry.orders.length;
          entry.deliveredOrders = delivered;
          entry.returnedOrders = returned;
          entry.cancelledOrders = cancelled;
          entry.isRepeatCustomer = entry.orders.length >= 2;
          const completedDenominator = delivered + returned + cancelled;
          entry.deliverySuccessRateBp =
            completedDenominator > 0
              ? Math.round((delivered / completedDenominator) * 10000)
              : 0;
        }
        entry.activeOrders = active;
        entry.totalAdvancePaidPoisha = totalAdvance;
        entry.pendingCodPoisha = pendingCod;
        if (entry.lifetimeSpendPoisha === 0 && grossNonCancelledSpend > 0) {
          entry.lifetimeSpendPoisha = grossNonCancelledSpend;
        }
        entry.averageOrderValuePoisha =
          entry.totalOrders > 0 ? Math.round(entry.lifetimeSpendPoisha / entry.totalOrders) : 0;
        entry.lastOrderNo = entry.orders[0]?.orderNo || entry.lastOrderNo;
        if (entry.orders[0]?.districtNameBn) {
          entry.districtNameBn = entry.orders[0].districtNameBn;
        }
        if (entry.orders[0]?.upazilaNameBn) {
          entry.upazilaNameBn = entry.orders[0].upazilaNameBn;
        }
        entry.addresses = Array.from(addrMap.values()).sort((a, b) =>
          b.lastUsedAt.localeCompare(a.lastUsedAt)
        );
      }
    }

    return Array.from(map.values());
  }, [
    customers360,
    orders,
    inquiries,
    abandonedCarts,
    blacklistedPhones,
    manualPaymentSubmissions,
    messageLogs,
    returnResolutions,
    customerRefunds,
    auditLogs,
    t,
  ]);

  const filteredContacts = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = unifiedContacts.filter((c) => {
      if (segment === 'repeat' && !c.isRepeatCustomer) return false;
      if (segment === 'high_risk' && c.fraudScore < 55) return false;
      if (segment === 'blacklisted' && !c.isBlacklisted) return false;
      if (segment === 'has_inquiry' && c.inquiries.length === 0) return false;
      if (!q) return true;
      return (
        c.name.toLowerCase().includes(q) ||
        c.alternateNames.some((n) => n.toLowerCase().includes(q)) ||
        c.displayPhone.toLowerCase().includes(q) ||
        c.emails.some((e) => e.includes(q)) ||
        c.districtNameBn.toLowerCase().includes(q) ||
        c.upazilaNameBn.toLowerCase().includes(q) ||
        (c.lastOrderNo?.toLowerCase().includes(q) ?? false) ||
        c.orders.some((o) => (o.orderNo ?? '').toLowerCase().includes(q))
      );
    });

    return list.sort((a, b) => {
      if (sortBy === 'spend_desc') return b.lifetimeSpendPoisha - a.lifetimeSpendPoisha;
      if (sortBy === 'orders_desc') return b.totalOrders - a.totalOrders;
      if (sortBy === 'risk_desc') return b.fraudScore - a.fraudScore;
      return (b.lastActivityAt || '').localeCompare(a.lastActivityAt || '');
    });
  }, [unifiedContacts, segment, search, sortBy]);

  const selectedCustomer = React.useMemo(() => {
    if (!selectedPhone) return null;
    return unifiedContacts.find((c) => c.phoneKey === selectedPhone) ?? null;
  }, [unifiedContacts, selectedPhone]);

  const openCustomerProfile = React.useCallback((phoneKey: string) => {
    setSelectedPhone(phoneKey);
    setFeedback(null);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, []);

  const pendingCarts = React.useMemo(
    () => abandonedCarts.filter((c) => !c.isRecovered),
    [abandonedCarts]
  );
  const repeatCount = React.useMemo(
    () => unifiedContacts.filter((c) => c.isRepeatCustomer).length,
    [unifiedContacts]
  );
  const blacklistEntries = React.useMemo(
    () => Object.entries(blacklistedPhones),
    [blacklistedPhones]
  );

  const handleBlacklistMutation = async (
    phone: string,
    action: 'add' | 'remove',
    reasonBn = ''
  ) => {
    const cleanPhone = toNormalizedPhone(phone);
    if (!/^01[3-9]\d{8}$/.test(cleanPhone)) {
      notify(
        t('সঠিক ১১ সংখ্যার BD নম্বর দিন (01XXXXXXXXX)।', 'Enter a valid 11-digit BD phone number.'),
        'error'
      );
      return;
    }
    if (action === 'add' && reasonBn.trim().length < 3) {
      notify(
        t('ব্ল্যাকলিস্ট করার কারণ লিখুন (কমপক্ষে ৩ অক্ষর)।', 'Enter a reason (min 3 characters).'),
        'error'
      );
      return;
    }
    setBusyKey(`bl:${cleanPhone}`);
    setFeedback(null);
    try {
      const res = await adminFetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'upsert_blacklist',
          phone: cleanPhone,
          action,
          reasonBn: reasonBn.trim(),
        }),
      });
      const data = (await res.json()) as { success?: boolean; errorBn?: string };
      if (!res.ok || !data.success) {
        notify(
          data.errorBn || t('ব্ল্যাকলিস্ট আপডেট ব্যর্থ হয়েছে।', 'Could not update blacklist.'),
          'error'
        );
        return;
      }
      setBlPhone('');
      setBlReason('');
      notify(
        action === 'add'
          ? t(`${cleanPhone} ব্ল্যাকলিস্টে যুক্ত হয়েছে।`, `${cleanPhone} added to blacklist.`)
          : t(`${cleanPhone} ব্ল্যাকলিস্ট থেকে সরানো হয়েছে।`, `${cleanPhone} removed from blacklist.`)
      );
      await onRefreshWorkspace();
    } catch {
      notify(t('সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।', 'Server connection failed.'), 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const handleRecordCartReminder = async (
    cart: ManagedAbandonedCartRecord,
    channel: 'wa_me' | 'sms'
  ) => {
    setBusyKey(`rem:${cart.cartId}`);
    try {
      const res = await adminFetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'record_cart_reminder',
          cartId: cart.cartId,
          channel,
        }),
      });
      const data = (await res.json()) as { success?: boolean; errorBn?: string };
      if (res.ok && data.success) {
        notify(
          t(
            'রিমাইন্ডার লগ রেকর্ড হয়েছে। মেসেজ অ্যাপে পাঠানো নিশ্চিত করুন।',
            'Reminder logged. Confirm sending in the messaging app.'
          )
        );
        await onRefreshWorkspace();
      } else {
        notify(data.errorBn || t('রিমাইন্ডার লগ ব্যর্থ।', 'Failed to record reminder.'), 'error');
      }
    } catch {
      notify(t('সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।', 'Server connection failed.'), 'error');
    } finally {
      setBusyKey(null);
    }
  };

  const handleRecoverCart = async (cartId: string) => {
    setBusyKey(`rec:${cartId}`);
    setFeedback(null);
    try {
      const res = await adminFetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'recover_abandoned_cart',
          cartId,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        orderNo?: string;
        errorBn?: string;
      };
      if (!res.ok || !data.success) {
        notify(
          data.errorBn || t('অর্ডার কনভার্ট ব্যর্থ হয়েছে।', 'Failed to convert cart to order.'),
          'error'
        );
        return;
      }
      notify(
        t(
          `কার্ট সফলভাবে অর্ডার ${data.orderNo ?? ''} হিসেবে তৈরি হয়েছে।`,
          `Cart converted to order ${data.orderNo ?? ''}.`
        )
      );
      await onRefreshWorkspace();
    } catch {
      notify(t('সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।', 'Server connection failed.'), 'error');
    } finally {
      setBusyKey(null);
    }
  };

  // ============================================================================
  // FULL-SCREEN CUSTOMER A-Z PROFILE VIEW
  // ============================================================================
  if (selectedCustomer) {
    return (
      <CustomerAZProfileView
        customer={selectedCustomer}
        locale={locale}
        isSuperAdmin={isSuperAdmin}
        busyKey={busyKey}
        feedback={feedback}
        onBack={() => setSelectedPhone(null)}
        onBlacklistMutation={handleBlacklistMutation}
        onRecordCartReminder={handleRecordCartReminder}
        onRecoverCart={handleRecoverCart}
        onOpenInquiryInInbox={onOpenInquiryInInbox}
      />
    );
  }

  // ============================================================================
  // FULL-WIDTH CUSTOMER DIRECTORY, ABANDONED CARTS & BLACKLIST VIEW
  // ============================================================================
  return (
    <section className="space-y-5">
      {/* Header + Segmented Mode Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-lg font-bold text-ink tracking-tight">
            {t('সিআরএম ও কন্টাক্টস', 'CRM & Contacts')}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {t(
              'যেকোনো গ্রাহকের ওপর ক্লিক করে তাঁর সম্পূর্ণ A-Z প্রোফাইল, অর্ডার, পেমেন্ট, কুরিয়ার ও টাইমলাইন দেখুন।',
              'Click any customer to open their full A-Z profile, orders, payments, courier details, and timeline.'
            )}
          </p>
        </div>

        <div
          className="flex flex-wrap gap-1.5"
          role="tablist"
          aria-label={t('সিআরএম বিভাগ', 'CRM sections')}
        >
          {(
            [
              ['directory', t('সকল কাস্টমার', 'Customers'), unifiedContacts.length],
              ['abandoned', t('পরিত্যক্ত কার্ট', 'Abandoned Carts'), pendingCarts.length],
              ['blacklist', t('ব্ল্যাকলিস্ট', 'Blacklist'), blacklistEntries.length],
            ] as const
          ).map(([id, label, count]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={subTab === id}
              onClick={() => setSubTab(id)}
              className={`min-h-[44px] px-3.5 rounded-[var(--radius-md)] text-xs font-medium border transition-colors whitespace-nowrap shrink-0 ${
                subTab === id
                  ? 'bg-ink text-bg border-ink'
                  : 'bg-surface text-ink border-border hover:bg-bg'
              }`}
            >
              {label}{' '}
              <span className="tabular-nums opacity-75">
                ({formatLocaleNumber(count, locale)})
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* 4-Metric Hairline KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 border border-border rounded-[var(--radius-md)] bg-surface divide-y sm:divide-y-0 sm:divide-x divide-border">
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{t('মোট কাস্টমার', 'Total Customers')}</span>
            <Users className="w-4 h-4" aria-hidden="true" />
          </div>
          <p className="text-xl font-bold text-ink tabular-nums mt-1">
            {formatLocaleNumber(unifiedContacts.length, locale)}
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{t('রিপিট কাস্টমার', 'Repeat Customers')}</span>
            <UserCheck className="w-4 h-4" aria-hidden="true" />
          </div>
          <p className="text-xl font-bold text-ink tabular-nums mt-1">
            {formatLocaleNumber(repeatCount, locale)}
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{t('অপেক্ষমাণ কার্ট', 'Pending Carts')}</span>
            <ShoppingCart className="w-4 h-4" aria-hidden="true" />
          </div>
          <p className="text-xl font-bold text-ink tabular-nums mt-1">
            {formatLocaleNumber(pendingCarts.length, locale)}
          </p>
        </div>
        <div className="p-3.5 sm:p-4">
          <div className="flex items-center justify-between text-xs text-muted">
            <span>{t('ব্ল্যাকলিস্টেড', 'Blacklisted')}</span>
            <Ban className="w-4 h-4" aria-hidden="true" />
          </div>
          <p className="text-xl font-bold text-ink tabular-nums mt-1">
            {formatLocaleNumber(blacklistEntries.length, locale)}
          </p>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`rounded-[var(--radius-md)] border px-3.5 py-2.5 text-xs font-medium ${
            feedback.tone === 'success'
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-danger/40 bg-danger/10 text-danger'
          }`}
        >
          {feedback.text}
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 1: FULL-WIDTH CUSTOMER DIRECTORY
         ==================================================================== */}
      {subTab === 'directory' && (
        <div className="space-y-4">
          {/* Search + Segment Filters + Sort */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search
                className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t(
                  'নাম, ফোন, ইমেইল, জেলা বা অর্ডার নম্বর দিয়ে খুঁজুন...',
                  'Search by name, phone, email, district, or order no...'
                )}
                className="w-full min-h-[44px] pl-9 pr-3 rounded-[var(--radius-md)] border border-border bg-bg text-sm text-ink focus:outline-none focus:border-ink"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(
                  [
                    ['all', t('সবাই', 'All')],
                    ['repeat', t('রিপিট', 'Repeat')],
                    ['high_risk', t('উচ্চ ঝুঁকি', 'High Risk')],
                    ['blacklisted', t('ব্ল্যাকলিস্টেড', 'Blacklisted')],
                    ['has_inquiry', t('ইনকোয়ারি আছে', 'Has Inquiry')],
                  ] as const
                ).map(([key, lbl]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSegment(key)}
                    className={`min-h-[40px] px-3 rounded-[var(--radius-md)] border transition-colors whitespace-nowrap shrink-0 ${
                      segment === key
                        ? 'border-ink bg-ink text-bg font-medium'
                        : 'border-border bg-surface text-muted hover:text-ink'
                    }`}
                  >
                    {lbl}
                  </button>
                ))}
              </div>

              <label className="inline-flex items-center gap-1.5 text-xs text-muted">
                <span className="sr-only">{t('সাজানোর ক্রম', 'Sort customers')}</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortOption)}
                  className="min-h-[40px] px-3 rounded-[var(--radius-md)] border border-border bg-surface text-xs text-ink focus:outline-none focus:border-ink"
                >
                  <option value="recent">{t('সর্বশেষ অ্যাক্টিভিটি', 'Recent Activity')}</option>
                  <option value="spend_desc">{t('সর্বোচ্চ ক্রয় (LTV)', 'Highest Spend')}</option>
                  <option value="orders_desc">{t('সর্বোচ্চ অর্ডার', 'Most Orders')}</option>
                  <option value="risk_desc">{t('সর্বোচ্চ ঝুঁকি', 'Highest Risk')}</option>
                </select>
              </label>
            </div>
          </div>

          {filteredContacts.length === 0 ? (
            <EmptyState
              title={t('কোনো কাস্টমার পাওয়া যায়নি', 'No customers found')}
              description={t(
                'সার্চ বা ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।',
                'Try adjusting your search query or segment filter.'
              )}
            />
          ) : (
            <div className="border border-border rounded-[var(--radius-md)] bg-surface overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-border text-muted bg-bg/60">
                    <th className="py-3 px-4 font-medium">{t('গ্রাহক ও যোগাযোগ', 'Customer')}</th>
                    <th className="py-3 px-3 font-medium hidden md:table-cell">
                      {t('অবস্থান', 'Location')}
                    </th>
                    <th className="py-3 px-3 font-medium text-right">{t('অর্ডার', 'Orders')}</th>
                    <th className="py-3 px-3 font-medium text-right">{t('মোট ক্রয়', 'Lifetime Spend')}</th>
                    <th className="py-3 px-3 font-medium text-right hidden sm:table-cell">
                      {t('ডেলিভারি / ঝুঁকি', 'Delivery / Risk')}
                    </th>
                    <th className="py-3 px-4 font-medium text-right hidden xl:table-cell">
                      {t('সর্বশেষ অ্যাক্টিভিটি', 'Last Activity')}
                    </th>
                    <th className="py-3 pr-3 w-8" aria-hidden="true" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredContacts.map((c) => {
                    const ratePct = Math.round(c.deliverySuccessRateBp / 100);
                    return (
                      <tr
                        key={c.phoneKey}
                        tabIndex={0}
                        role="button"
                        onClick={() => openCustomerProfile(c.phoneKey)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            openCustomerProfile(c.phoneKey);
                          }
                        }}
                        className="cursor-pointer hover:bg-bg/60 focus-visible:outline-none focus-visible:bg-bg transition-colors group"
                      >
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            <span className="text-sm font-semibold text-ink group-hover:underline">
                              {c.name}
                            </span>
                            {c.isBlacklisted && (
                              <span className="text-[11px] font-semibold text-danger">
                                · {t('ব্লকড', 'Blocked')}
                              </span>
                            )}
                          </div>
                          <p className="text-muted font-mono tabular-nums mt-0.5">
                            {c.displayPhone}
                            {c.emails[0] ? ` · ${c.emails[0]}` : ''}
                            {c.inquiries.length > 0
                              ? ` · ${formatLocaleNumber(c.inquiries.length, locale)} ${t('ইনকোয়ারি', 'inq')}`
                              : ''}
                          </p>
                        </td>

                        <td className="py-3 px-3 text-muted hidden md:table-cell">
                          <span className="text-ink">{c.districtNameBn}</span>
                          {c.upazilaNameBn && c.upazilaNameBn !== '—' && (
                            <span className="block text-[11px] text-muted">{c.upazilaNameBn}</span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right tabular-nums">
                          <span className="text-ink font-semibold">
                            {formatLocaleNumber(c.totalOrders, locale)}
                          </span>
                          <span className="block text-[11px] text-muted">
                            {c.isRepeatCustomer ? t('রিপিট', 'Repeat') : t('একক', 'Single')}
                            {c.activeOrders > 0
                              ? ` · ${formatLocaleNumber(c.activeOrders, locale)} ${t('চলমান', 'open')}`
                              : ''}
                          </span>
                        </td>

                        <td className="py-3 px-3 text-right tabular-nums">
                          <span className="text-ink font-semibold">
                            {formatPoishaToBdt(c.lifetimeSpendPoisha, locale)}
                          </span>
                          {c.averageOrderValuePoisha > 0 && (
                            <span className="block text-[11px] text-muted">
                              {t('গড়', 'Avg')} {formatPoishaToBdt(c.averageOrderValuePoisha, locale)}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-3 text-right tabular-nums hidden sm:table-cell">
                          <span className="text-ink font-medium">{ratePct}%</span>
                          <span
                            className={`block text-[11px] ${
                              c.fraudScore >= 60
                                ? 'text-danger font-semibold'
                                : c.fraudScore >= 30
                                  ? 'text-warning'
                                  : 'text-muted'
                            }`}
                          >
                            {t('ঝুঁকি', 'Risk')} {c.fraudScore}/100
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right tabular-nums hidden xl:table-cell">
                          <span className="font-mono text-ink block">{c.lastOrderNo || '—'}</span>
                          <span className="text-[11px] text-muted">
                            {c.lastActivityAt
                              ? formatLocaleDateTime(c.lastActivityAt, locale)
                              : '—'}
                          </span>
                        </td>

                        <td className="py-3 pr-3 text-right">
                          <ChevronRight
                            className="w-4 h-4 text-muted group-hover:text-ink transition-colors inline-block"
                            aria-hidden="true"
                          />
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
          SUB-TAB 2: ABANDONED CARTS RECOVERY
         ==================================================================== */}
      {subTab === 'abandoned' && (
        <div className="space-y-3">
          {abandonedCarts.length === 0 ? (
            <EmptyState
              title={t('কোনো পরিত্যক্ত কার্ট নেই', 'No abandoned carts')}
              description={t(
                'চেকআউটে ড্রপ-অফ হওয়া কার্টগুলো এখানে স্বয়ংক্রিয়ভাবে জমা হবে।',
                'Incomplete checkouts will appear here automatically for follow-up.'
              )}
            />
          ) : (
            <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] bg-surface">
              {abandonedCarts.map((cart) => (
                <div
                  key={cart.cartId}
                  className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                      <button
                        type="button"
                        onClick={() => openCustomerProfile(toNormalizedPhone(cart.customerPhone))}
                        className="font-semibold text-sm text-ink hover:underline text-left"
                      >
                        {cart.customerName}
                      </button>
                      <span className="text-xs font-mono text-muted tabular-nums">
                        {cart.customerPhone}
                      </span>
                      <span
                        className={`text-xs font-medium ${
                          cart.isRecovered ? 'text-success' : 'text-warning'
                        }`}
                      >
                        ·{' '}
                        {cart.isRecovered
                          ? `${t('রিকভার্ড', 'Recovered')}${cart.recoveredOrderNo ? ` (${cart.recoveredOrderNo})` : ''}`
                          : t('অপেক্ষমাণ', 'Pending')}
                      </span>
                    </div>
                    <p className="text-xs text-muted">
                      {cart.districtNameBn} ·{' '}
                      {cart.items
                        .map((i) => `${i.productNameBn} (${i.variantTitleBn}) ×${i.quantity}`)
                        .join(', ')}
                    </p>
                    <p className="text-xs text-ink tabular-nums">
                      {t('মোট', 'Subtotal')}:{' '}
                      <strong>{formatPoishaToBdt(cart.subtotalPoisha, locale)}</strong> ·{' '}
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
                        onClick={() => void handleRecordCartReminder(cart, 'wa_me')}
                        className="inline-flex min-h-[40px] items-center gap-1 px-3 rounded-[var(--radius-md)] border border-border bg-bg text-xs font-medium text-ink hover:bg-surface whitespace-nowrap"
                      >
                        WhatsApp
                        <ExternalLink className="w-3 h-3" aria-hidden="true" />
                      </a>
                      <a
                        href={cart.smsRecoveryLink}
                        onClick={() => void handleRecordCartReminder(cart, 'sms')}
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
                        onClick={() => void handleRecoverCart(cart.cartId)}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                        {t('অর্ডারে কনভার্ট', 'Convert to Order')}
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 3: CUSTOMER BLACKLIST REGISTRY
         ==================================================================== */}
      {subTab === 'blacklist' && (
        <div className="space-y-4">
          {isSuperAdmin && (
            <div className="border border-border rounded-[var(--radius-md)] bg-surface p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void handleBlacklistMutation(blPhone, 'add', blReason);
                }}
                className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end"
              >
                <div className="md:col-span-4">
                  <Input
                    label={t('মোবাইল নম্বর (১১ সংখ্যা) *', 'Mobile Number (11 digits) *')}
                    value={blPhone}
                    onChange={(e) => setBlPhone(e.target.value)}
                    placeholder="017XXXXXXXX"
                    required
                  />
                </div>
                <div className="md:col-span-5">
                  <Input
                    label={t('ব্ল্যাকলিস্ট করার কারণ *', 'Reason *')}
                    value={blReason}
                    onChange={(e) => setBlReason(e.target.value)}
                    placeholder={t(
                      'যেমন: বারবার ভুয়া অর্ডার / পার্সেল রিজেক্ট',
                      'e.g. Repeated fake orders / parcel refusal'
                    )}
                    required
                  />
                </div>
                <div className="md:col-span-3">
                  <Button
                    type="submit"
                    variant="danger"
                    className="w-full min-h-[44px]"
                    disabled={busyKey !== null}
                  >
                    {t('ব্ল্যাকলিস্টে যুক্ত করুন', 'Add to Blacklist')}
                  </Button>
                </div>
              </form>
            </div>
          )}

          {blacklistEntries.length === 0 ? (
            <EmptyState
              title={t('ব্ল্যাকলিস্ট ফাঁকা', 'No blacklisted numbers')}
              description={t(
                'ভুয়া অর্ডার বা ফ্রড নম্বর এখানে যুক্ত করলে চেকআউট ও স্মার্ট অর্ডারে সতর্কতা দেখাবে।',
                'Blocked phone numbers will be flagged at checkout and order entry.'
              )}
            />
          ) : (
            <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] bg-surface">
              {blacklistEntries.map(([phone, entry]) => (
                <div
                  key={phone}
                  className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-0.5">
                    <button
                      type="button"
                      onClick={() => openCustomerProfile(toNormalizedPhone(phone))}
                      className="font-mono text-sm font-semibold text-ink tabular-nums hover:underline"
                    >
                      {phone}
                    </button>
                    <p className="text-xs text-danger">{entry.reasonBn}</p>
                    <p className="text-[11px] text-muted tabular-nums">
                      {formatLocaleDateTime(entry.addedAt, locale)}
                    </p>
                  </div>

                  {isSuperAdmin && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="min-h-[40px] shrink-0"
                      disabled={busyKey === `bl:${toNormalizedPhone(phone)}`}
                      onClick={() => void handleBlacklistMutation(phone, 'remove')}
                    >
                      {t('ব্ল্যাকলিস্ট সরান', 'Remove')}
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
