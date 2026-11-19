'use client';

import * as React from 'react';
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  Inbox,
  MessageSquare,
  Phone,
  Power,
  RefreshCw,
  Search,
  Send,
  Sliders,
  Store,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin/admin-fetch';
import type { CustomerInquiryRecord } from '@/lib/db/repository';
import type { SanitizedAdminUserDTO } from '@/lib/admin/phase4a-service';
import type {
  AutomationExecutionLogRecord,
  AutomationRuleRecord,
  MessageDispatchLogRecord,
  MessageEventKey,
  MessageTemplateRecord,
} from '@/lib/admin/phase4c-service';
import type {
  VendorLookupItem,
  VendorSupportTicketDTO,
} from '@/components/vendor/support-panel';
import { formatLocaleDateTime, formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { Badge, Button, Card, EmptyState } from '../ui/primitives';

export type MessagingHubSubTab = 'customer' | 'vendor' | 'templates';

type InquiryStatus = CustomerInquiryRecord['status'];
type InquiryPriority = NonNullable<CustomerInquiryRecord['priority']>;

const INQUIRY_STATUS_LABELS: Record<InquiryStatus, [string, string]> = {
  unread: ['অপঠিত', 'Unread'],
  in_progress: ['চলমান', 'In progress'],
  replied: ['উত্তর দেওয়া হয়েছে', 'Replied'],
  resolved: ['সমাধান হয়েছে', 'Resolved'],
};

const INQUIRY_PRIORITY_LABELS: Record<InquiryPriority, [string, string]> = {
  low: ['কম', 'Low'],
  normal: ['স্বাভাবিক', 'Normal'],
  high: ['জরুরি', 'High'],
};

export interface MessagingHubPanelProps {
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  initialSubTab?: MessagingHubSubTab;
  initialInquiryId?: string | null;
  inquiries: CustomerInquiryRecord[];
  users: SanitizedAdminUserDTO[];
  vendors: VendorLookupItem[];
  availableOrderNos: string[];
  messageTemplates: MessageTemplateRecord[];
  messageLogs: MessageDispatchLogRecord[];
  automationKillSwitchActive: boolean;
  automationRules: AutomationRuleRecord[];
  automationLogs: AutomationExecutionLogRecord[];
  onRefreshWorkspace: () => Promise<void>;
}

function CustomerInquiryDetail({
  inquiry,
  users,
  locale,
  onRefresh,
}: {
  inquiry: CustomerInquiryRecord;
  users: SanitizedAdminUserDTO[];
  locale: 'bn' | 'en';
  onRefresh: () => Promise<void>;
}) {
  const bn = locale === 'bn';
  const t = React.useCallback((b: string, e: string) => (bn ? b : e), [bn]);

  const [status, setStatus] = React.useState<InquiryStatus>(inquiry.status);
  const [priority, setPriority] = React.useState<InquiryPriority>(inquiry.priority ?? 'normal');
  const [assignedTo, setAssignedTo] = React.useState(inquiry.assignedTo ?? '');
  const [notes, setNotes] = React.useState(inquiry.adminNotes ?? '');
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  React.useEffect(() => {
    setStatus(inquiry.status);
    setPriority(inquiry.priority ?? 'normal');
    setAssignedTo(inquiry.assignedTo ?? '');
    setNotes(inquiry.adminNotes ?? '');
    setFeedback(null);
  }, [inquiry.id, inquiry.revision, inquiry.status, inquiry.priority, inquiry.assignedTo, inquiry.adminNotes]);

  const cleanDigits = inquiry.phone
    .replace(/[০-৯]/g, (d) => String('০১২৩৪৫৬৭৮৯'.indexOf(d)))
    .replace(/\D/g, '');
  const bdPhone =
    cleanDigits.startsWith('880') && cleanDigits.length === 13
      ? `0${cleanDigits.slice(3)}`
      : cleanDigits;
  const validPhone = /^01[3-9]\d{8}$/.test(bdPhone);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setFeedback(null);
    try {
      const response = await adminFetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'update_inquiry_status',
          inquiryId: inquiry.id,
          status,
          priority,
          assignedTo: assignedTo || null,
          adminNotes: notes,
          expectedRevision: inquiry.revision ?? 0,
        }),
      });
      const data = (await response.json()) as { success?: boolean; errorBn?: string };
      if (!response.ok || !data.success) {
        throw new Error(data.errorBn || t('সংরক্ষণ ব্যর্থ হয়েছে।', 'Could not save changes.'));
      }
      await onRefresh();
      setFeedback({ tone: 'success', text: t('পরিবর্তন সংরক্ষিত হয়েছে।', 'Changes saved.') });
    } catch (error) {
      setFeedback({
        tone: 'error',
        text:
          error instanceof Error ? error.message : t('সংযোগ ব্যর্থ হয়েছে।', 'Connection failed.'),
      });
    } finally {
      setSaving(false);
    }
  };

  const fieldCls =
    'w-full min-h-[44px] px-3 py-2 text-xs rounded-[var(--radius-md)] border border-border bg-bg text-ink focus:outline-none focus:border-ink';

  return (
    <Card surface="bg" padding="md" className="space-y-4 min-w-0">
      <div className="border-b border-border pb-3 space-y-1.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <h2 className="text-base font-bold text-ink break-words">{inquiry.subject}</h2>
          <Badge status={inquiry.status === 'resolved' ? 'success' : inquiry.status === 'unread' ? 'warning' : 'info'}>
            {INQUIRY_STATUS_LABELS[inquiry.status][bn ? 0 : 1]}
          </Badge>
        </div>
        <p className="text-xs text-ink">
          {inquiry.name} · <span className="font-mono tabular-nums">{inquiry.phone}</span>
        </p>
        <p className="text-[11px] text-muted tabular-nums">
          {formatLocaleDateTime(inquiry.createdAt, locale)} · {inquiry.id}
        </p>
      </div>

      <div className="whitespace-pre-wrap break-words text-sm text-ink rounded-[var(--radius-md)] border border-border bg-surface p-3.5">
        {inquiry.message}
      </div>

      {validPhone && (
        <div className="flex flex-wrap items-center gap-2">
          <a
            href={`tel:${bdPhone}`}
            className="inline-flex min-h-[40px] items-center gap-1.5 px-3 rounded-[var(--radius-md)] border border-border bg-surface text-xs font-medium text-ink hover:bg-bg"
          >
            <Phone className="w-3.5 h-3.5" aria-hidden="true" />
            {t('কল করুন', 'Call')}
          </a>
          <a
            href={`https://wa.me/88${bdPhone}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-[40px] items-center gap-1.5 px-3 rounded-[var(--radius-md)] border border-border bg-surface text-xs font-medium text-ink hover:bg-bg"
          >
            <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
            WhatsApp
          </a>
          <span className="text-[11px] text-muted">
            {t(
              'বাইরের অ্যাপে খুলবে; স্বয়ংক্রিয়ভাবে কোনো মেসেজ যায় না।',
              'Opens externally; no message is sent automatically.'
            )}
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <label className="text-xs text-ink space-y-1">
            <span className="block font-medium">{t('অবস্থা', 'Status')}</span>
            <select
              className={fieldCls}
              value={status}
              onChange={(e) => setStatus(e.target.value as InquiryStatus)}
            >
              {(Object.keys(INQUIRY_STATUS_LABELS) as InquiryStatus[]).map((k) => (
                <option key={k} value={k}>
                  {INQUIRY_STATUS_LABELS[k][bn ? 0 : 1]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink space-y-1">
            <span className="block font-medium">{t('অগ্রাধিকার', 'Priority')}</span>
            <select
              className={fieldCls}
              value={priority}
              onChange={(e) => setPriority(e.target.value as InquiryPriority)}
            >
              {(Object.keys(INQUIRY_PRIORITY_LABELS) as InquiryPriority[]).map((k) => (
                <option key={k} value={k}>
                  {INQUIRY_PRIORITY_LABELS[k][bn ? 0 : 1]}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-ink space-y-1">
            <span className="block font-medium">{t('দায়িত্বপ্রাপ্ত', 'Assigned to')}</span>
            <select
              className={fieldCls}
              value={assignedTo}
              onChange={(e) => setAssignedTo(e.target.value)}
            >
              <option value="">{t('নির্ধারিত নয়', 'Unassigned')}</option>
              {users
                .filter((u) => u.isActive && u.roleSlug === 'super_admin')
                .map((u) => (
                  <option key={u.username} value={u.username}>
                    {bn ? u.displayNameBn : u.displayNameEn} (@{u.username})
                  </option>
                ))}
            </select>
          </label>
        </div>

        <label className="block text-xs text-ink space-y-1">
          <span className="block font-medium">
            {t('অভ্যন্তরীণ নোট (গ্রাহক দেখবেন না)', 'Internal notes (not visible to customer)')}
          </span>
          <textarea
            className={`${fieldCls} min-h-[96px]`}
            maxLength={4000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="primary" disabled={saving}>
            {saving ? t('সংরক্ষণ হচ্ছে...', 'Saving...') : t('সংরক্ষণ করুন', 'Save changes')}
          </Button>
          {feedback && (
            <span
              role="status"
              className={`text-xs font-medium ${
                feedback.tone === 'success' ? 'text-success' : 'text-danger'
              }`}
            >
              {feedback.text}
            </span>
          )}
        </div>
      </form>

      {(inquiry.activity?.length ?? 0) > 0 && (
        <details className="text-xs border-t border-border pt-3">
          <summary className="font-medium text-ink cursor-pointer">
            {t('সাম্প্রতিক পরিবর্তন', 'Activity log')} (
            {formatLocaleNumber(inquiry.activity?.length ?? 0, locale)})
          </summary>
          <ul className="mt-2 space-y-1.5 text-muted">
            {[...(inquiry.activity ?? [])].reverse().map((entry, idx) => (
              <li key={`${entry.at}-${idx}`} className="tabular-nums">
                {formatLocaleDateTime(entry.at, locale)} · {entry.actor} ·{' '}
                {INQUIRY_STATUS_LABELS[entry.status][bn ? 0 : 1]} ·{' '}
                {INQUIRY_PRIORITY_LABELS[entry.priority][bn ? 0 : 1]}
                {entry.assignedTo ? ` · @${entry.assignedTo}` : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Card>
  );
}

export function MessagingHubPanel({
  locale,
  isSuperAdmin,
  initialSubTab = 'customer',
  initialInquiryId = null,
  inquiries,
  users,
  vendors,
  availableOrderNos,
  messageTemplates,
  messageLogs,
  automationKillSwitchActive,
  automationRules,
  automationLogs,
  onRefreshWorkspace,
}: MessagingHubPanelProps) {
  const bn = locale === 'bn';
  const t = React.useCallback((b: string, e: string) => (bn ? b : e), [bn]);

  const [subTab, setSubTab] = React.useState<MessagingHubSubTab>(initialSubTab);

  // Customer inbox state
  const [customerSearch, setCustomerSearch] = React.useState('');
  const [customerStatusFilter, setCustomerStatusFilter] = React.useState<'all' | InquiryStatus>('all');
  const [selectedInquiryId, setSelectedInquiryId] = React.useState<string | null>(
    initialInquiryId ?? inquiries[0]?.id ?? null
  );

  // Vendor inbox state
  const [vendorTickets, setVendorTickets] = React.useState<VendorSupportTicketDTO[]>([]);
  const [vendorLoading, setVendorLoading] = React.useState(false);
  const [vendorError, setVendorError] = React.useState('');
  const [vendorFilter, setVendorFilter] = React.useState<'all' | 'open' | 'closed'>('open');
  const [vendorSearch, setVendorSearch] = React.useState('');
  const [selectedTicketId, setSelectedTicketId] = React.useState<string | null>(null);
  const [vendorReplyText, setVendorReplyText] = React.useState('');
  const [vendorBusy, setVendorBusy] = React.useState(false);
  const [vendorNotice, setVendorNotice] = React.useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmCloseTicketId, setConfirmCloseTicketId] = React.useState<string | null>(null);

  // Templates & automation state
  const [selectedOrderNo, setSelectedOrderNo] = React.useState(availableOrderNos[0] ?? '');
  const [selectedEventKey, setSelectedEventKey] = React.useState<MessageEventKey>('ORDER_CONFIRMED');
  const [previewResult, setPreviewResult] = React.useState<{
    renderedText: string;
    waMeUrl: string;
    smsUrl: string;
    recipientPhone: string;
  } | null>(null);
  const [copiedPreview, setCopiedPreview] = React.useState(false);
  const [templateBusy, setTemplateBusy] = React.useState(false);
  const [templateNotice, setTemplateNotice] = React.useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);

  React.useEffect(() => {
    setSubTab(initialSubTab);
  }, [initialSubTab]);

  React.useEffect(() => {
    if (initialInquiryId) {
      setSelectedInquiryId(initialInquiryId);
      setSubTab('customer');
    }
  }, [initialInquiryId]);

  const vendorMap = React.useMemo(() => {
    const map = new Map<string, VendorLookupItem>();
    for (const v of vendors) map.set(v.vendorId, v);
    return map;
  }, [vendors]);

  const loadVendorTickets = React.useCallback(async () => {
    if (!isSuperAdmin) return;
    setVendorLoading(true);
    setVendorError('');
    try {
      const res = await adminFetch('/api/admin/vendor-support', { cache: 'no-store' });
      const data = (await res.json()) as {
        success?: boolean;
        tickets?: VendorSupportTicketDTO[];
      };
      if (!res.ok || !data.success || !Array.isArray(data.tickets)) {
        throw new Error();
      }
      setVendorTickets(data.tickets);
      setSelectedTicketId((prev) => prev ?? data.tickets?.[0]?.ticketId ?? null);
    } catch {
      setVendorError(
        t(
          'ভেন্ডর ইনবক্স লোড করা যায়নি। সেশন পরীক্ষা করে আবার চেষ্টা করুন।',
          'Could not load vendor inbox. Check your session and retry.'
        )
      );
    } finally {
      setVendorLoading(false);
    }
  }, [isSuperAdmin, t]);

  React.useEffect(() => {
    if (isSuperAdmin) {
      void loadVendorTickets();
    }
  }, [isSuperAdmin, loadVendorTickets]);

  const unreadCustomerCount = React.useMemo(
    () => inquiries.filter((i) => i.status === 'unread').length,
    [inquiries]
  );

  const openVendorCount = React.useMemo(
    () => vendorTickets.filter((tkt) => tkt.status === 'open').length,
    [vendorTickets]
  );

  const filteredInquiries = React.useMemo(() => {
    const q = customerSearch.trim().toLowerCase();
    return inquiries.filter((i) => {
      if (customerStatusFilter !== 'all' && i.status !== customerStatusFilter) return false;
      if (!q) return true;
      return (
        i.name.toLowerCase().includes(q) ||
        i.phone.toLowerCase().includes(q) ||
        i.subject.toLowerCase().includes(q) ||
        i.message.toLowerCase().includes(q)
      );
    });
  }, [inquiries, customerStatusFilter, customerSearch]);

  const activeInquiry = React.useMemo(
    () =>
      filteredInquiries.find((i) => i.id === selectedInquiryId) ??
      filteredInquiries[0] ??
      null,
    [filteredInquiries, selectedInquiryId]
  );

  const filteredVendorTickets = React.useMemo(() => {
    const q = vendorSearch.trim().toLowerCase();
    return vendorTickets.filter((tkt) => {
      if (vendorFilter !== 'all' && tkt.status !== vendorFilter) return false;
      if (!q) return true;
      const v = tkt.vendorId ? vendorMap.get(tkt.vendorId) : undefined;
      return (
        tkt.subject.toLowerCase().includes(q) ||
        (v?.businessNameBn.toLowerCase().includes(q) ?? false) ||
        (v?.vendorCode.toLowerCase().includes(q) ?? false) ||
        tkt.messages.some((m) => m.text.toLowerCase().includes(q))
      );
    });
  }, [vendorTickets, vendorFilter, vendorSearch, vendorMap]);

  const activeVendorTicket = React.useMemo(
    () =>
      filteredVendorTickets.find((tkt) => tkt.ticketId === selectedTicketId) ??
      filteredVendorTickets[0] ??
      null,
    [filteredVendorTickets, selectedTicketId]
  );

  const handleVendorAction = async (payload: {
    action: 'reply' | 'close';
    ticketId: string;
    text?: string;
  }) => {
    setVendorBusy(true);
    setVendorNotice(null);
    try {
      const res = await adminFetch('/api/admin/vendor-support', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error();
      if (payload.action === 'reply') setVendorReplyText('');
      if (payload.action === 'close') setConfirmCloseTicketId(null);
      await loadVendorTickets();
      await onRefreshWorkspace();
      setVendorNotice({
        tone: 'success',
        text:
          payload.action === 'reply'
            ? t('ভেন্ডরকে উত্তর পাঠানো হয়েছে।', 'Reply sent to vendor.')
            : t('টিকিট বন্ধ করা হয়েছে।', 'Ticket closed.'),
      });
    } catch {
      setVendorNotice({
        tone: 'error',
        text: t('কাজটি সম্পন্ন করা যায়নি। আবার চেষ্টা করুন।', 'Action failed. Please try again.'),
      });
    } finally {
      setVendorBusy(false);
    }
  };

  const handleGeneratePreview = async () => {
    if (!selectedOrderNo) {
      setTemplateNotice({
        tone: 'error',
        text: t('প্রথমে একটি অর্ডার নির্বাচন করুন।', 'Select an order first.'),
      });
      return;
    }
    setTemplateBusy(true);
    setTemplateNotice(null);
    try {
      const res = await adminFetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'preview_order_message',
          orderNo: selectedOrderNo,
          eventKey: selectedEventKey,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        renderedText?: string;
        waMeUrl?: string;
        smsUrl?: string;
        recipientPhone?: string;
        errorBn?: string;
      };
      if (!res.ok || !data.success || !data.renderedText) {
        setTemplateNotice({
          tone: 'error',
          text: data.errorBn || t('প্রিভিউ তৈরি ব্যর্থ।', 'Could not render preview.'),
        });
        return;
      }
      setPreviewResult({
        renderedText: data.renderedText,
        waMeUrl: data.waMeUrl ?? '',
        smsUrl: data.smsUrl ?? '',
        recipientPhone: data.recipientPhone ?? '',
      });
      setCopiedPreview(false);
    } catch {
      setTemplateNotice({
        tone: 'error',
        text: t('সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।', 'Server connection failed.'),
      });
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleToggleAutomation = async (payload: Record<string, unknown>) => {
    setTemplateBusy(true);
    setTemplateNotice(null);
    try {
      const res = await adminFetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'toggle_automation_rule',
          ...payload,
        }),
      });
      const data = (await res.json()) as { success?: boolean; errorBn?: string };
      if (!res.ok || !data.success) {
        setTemplateNotice({
          tone: 'error',
          text: data.errorBn || t('অটোমেশন আপডেট ব্যর্থ।', 'Could not update automation.'),
        });
        return;
      }
      await onRefreshWorkspace();
      setTemplateNotice({
        tone: 'success',
        text: t('অটোমেশন সেটিংস আপডেট হয়েছে।', 'Automation settings updated.'),
      });
    } catch {
      setTemplateNotice({
        tone: 'error',
        text: t('সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।', 'Server connection failed.'),
      });
    } finally {
      setTemplateBusy(false);
    }
  };

  const handleSimulateRule = async (ruleId: string) => {
    setTemplateBusy(true);
    setTemplateNotice(null);
    try {
      const res = await adminFetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'simulate_automation_rule',
          ruleId,
          sampleOrderNo: selectedOrderNo || availableOrderNos[0] || undefined,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        log?: AutomationExecutionLogRecord;
        errorBn?: string;
      };
      if (!res.ok || !data.success) {
        setTemplateNotice({
          tone: 'error',
          text: data.errorBn || t('সিমুলেশন ব্যর্থ।', 'Simulation failed.'),
        });
        return;
      }
      await onRefreshWorkspace();
      setTemplateNotice({
        tone: 'success',
        text: data.log?.outcomeSummaryBn || t('সিমুলেশন সম্পন্ন হয়েছে।', 'Simulation completed.'),
      });
    } catch {
      setTemplateNotice({
        tone: 'error',
        text: t('সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।', 'Server connection failed.'),
      });
    } finally {
      setTemplateBusy(false);
    }
  };

  return (
    <section className="space-y-5">
      {/* Header + 3-Tab Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-lg font-bold text-ink tracking-tight">
            {t('মেসেজিং ইনবক্স ও টেমপ্লেট', 'Messaging')}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {t(
              'কাস্টমার ইনকোয়ারি, ভেন্ডর সাপোর্ট মেসেজ এবং অর্ডার টেমপ্লেট এক জায়গায়।',
              'Customer inquiries, vendor support threads, and order message templates in one workspace.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label={t('মেসেজিং ট্যাব', 'Messaging tabs')}>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'customer'}
            onClick={() => setSubTab('customer')}
            className={`min-h-[44px] px-3.5 rounded-[var(--radius-md)] text-xs font-medium border inline-flex items-center gap-1.5 transition-colors ${
              subTab === 'customer'
                ? 'bg-ink text-bg border-ink'
                : 'bg-surface text-ink border-border hover:bg-bg'
            }`}
          >
            <Inbox className="w-3.5 h-3.5" aria-hidden="true" />
            {t('কাস্টমার ইনবক্স', 'Customer Inbox')}
            <span className="tabular-nums opacity-80">
              ({formatLocaleNumber(unreadCustomerCount > 0 ? unreadCustomerCount : inquiries.length, locale)})
            </span>
          </button>

          {isSuperAdmin && (
            <button
              type="button"
              role="tab"
              aria-selected={subTab === 'vendor'}
              onClick={() => setSubTab('vendor')}
              className={`min-h-[44px] px-3.5 rounded-[var(--radius-md)] text-xs font-medium border inline-flex items-center gap-1.5 transition-colors ${
                subTab === 'vendor'
                  ? 'bg-ink text-bg border-ink'
                  : 'bg-surface text-ink border-border hover:bg-bg'
              }`}
            >
              <Store className="w-3.5 h-3.5" aria-hidden="true" />
              {t('ভেন্ডর ইনবক্স', 'Vendor Inbox')}
              <span className="tabular-nums opacity-80">
                ({formatLocaleNumber(openVendorCount, locale)})
              </span>
            </button>
          )}

          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'templates'}
            onClick={() => setSubTab('templates')}
            className={`min-h-[44px] px-3.5 rounded-[var(--radius-md)] text-xs font-medium border inline-flex items-center gap-1.5 transition-colors ${
              subTab === 'templates'
                ? 'bg-ink text-bg border-ink'
                : 'bg-surface text-ink border-border hover:bg-bg'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" aria-hidden="true" />
            {t('টেমপ্লেট ও অটোমেশন', 'Templates')}
          </button>
        </div>
      </div>

      {/* ====================================================================
          TAB 1: CUSTOMER INBOX (Storefront Inquiries)
         ==================================================================== */}
      {subTab === 'customer' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 max-w-md">
              <Search
                className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder={t(
                  'নাম, ফোন বা বিষয় দিয়ে খুঁজুন...',
                  'Search by customer name, phone, or subject...'
                )}
                className="w-full min-h-[44px] pl-9 pr-3 rounded-[var(--radius-md)] border border-border bg-bg text-sm text-ink focus:outline-none focus:border-ink"
              />
            </div>

            <div className="flex flex-wrap gap-1.5 text-xs">
              {(
                [
                  ['all', t('সব', 'All')],
                  ['unread', t('অপঠিত', 'Unread')],
                  ['in_progress', t('চলমান', 'In progress')],
                  ['replied', t('উত্তর দেওয়া', 'Replied')],
                  ['resolved', t('সমাধান', 'Resolved')],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setCustomerStatusFilter(k)}
                  className={`min-h-[38px] px-3 rounded-[var(--radius-md)] border transition-colors ${
                    customerStatusFilter === k
                      ? 'bg-ink text-bg border-ink font-medium'
                      : 'bg-surface text-muted border-border hover:text-ink'
                  }`}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {filteredInquiries.length === 0 ? (
            <EmptyState
              title={t('কোনো কাস্টমার মেসেজ নেই', 'No customer inquiries')}
              description={t(
                'স্টোরফ্রন্ট কন্টাক্ট ফর্ম থেকে পাঠানো মেসেজগুলো এখানে দেখাবে।',
                'Messages submitted via the storefront contact form appear here.'
              )}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              <div className="lg:col-span-5 border border-border rounded-[var(--radius-md)] bg-surface divide-y divide-border max-h-[600px] overflow-y-auto">
                {filteredInquiries.map((inq) => {
                  const selected = activeInquiry?.id === inq.id;
                  return (
                    <button
                      key={inq.id}
                      type="button"
                      onClick={() => setSelectedInquiryId(inq.id)}
                      className={`w-full text-left p-3.5 transition-colors space-y-1 ${
                        selected ? 'bg-bg' : 'hover:bg-bg/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-ink line-clamp-1">
                          {inq.subject}
                        </span>
                        <Badge
                          status={
                            inq.status === 'unread'
                              ? 'warning'
                              : inq.status === 'resolved'
                                ? 'success'
                                : 'neutral'
                          }
                        >
                          {INQUIRY_STATUS_LABELS[inq.status][bn ? 0 : 1]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted line-clamp-1">{inq.message}</p>
                      <p className="text-[11px] text-muted tabular-nums">
                        {inq.name} · {inq.phone} · {formatLocaleDateTime(inq.createdAt, locale)}
                      </p>
                    </button>
                  );
                })}
              </div>

              <div className="lg:col-span-7 min-w-0">
                {activeInquiry && (
                  <CustomerInquiryDetail
                    inquiry={activeInquiry}
                    users={users}
                    locale={locale}
                    onRefresh={onRefreshWorkspace}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 2: VENDOR INBOX (Vendor Support Tickets)
         ==================================================================== */}
      {subTab === 'vendor' && isSuperAdmin && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="relative flex-1 max-w-md">
              <Search
                className="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                aria-hidden="true"
              />
              <input
                type="search"
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                placeholder={t(
                  'ভেন্ডরের নাম, কোড বা টিকিট বিষয় খুঁজুন...',
                  'Search by vendor name, code, or ticket subject...'
                )}
                className="w-full min-h-[44px] pl-9 pr-3 rounded-[var(--radius-md)] border border-border bg-bg text-sm text-ink focus:outline-none focus:border-ink"
              />
            </div>

            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  ['open', t('খোলা', 'Open')],
                  ['closed', t('বন্ধ', 'Closed')],
                  ['all', t('সব', 'All')],
                ] as const
              ).map(([k, lbl]) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setVendorFilter(k)}
                  className={`min-h-[38px] px-3 rounded-[var(--radius-md)] border transition-colors ${
                    vendorFilter === k
                      ? 'bg-ink text-bg border-ink font-medium'
                      : 'bg-surface text-muted border-border hover:text-ink'
                  }`}
                >
                  {lbl}
                </button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => void loadVendorTickets()}
                disabled={vendorLoading}
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${vendorLoading ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
              </Button>
            </div>
          </div>

          {vendorError && (
            <div className="rounded-[var(--radius-md)] border border-danger/40 bg-danger/10 px-3.5 py-2.5 text-xs text-danger flex items-center justify-between gap-3">
              <span>{vendorError}</span>
              <Button type="button" size="sm" variant="outline" onClick={() => void loadVendorTickets()}>
                {t('পুনরায় চেষ্টা', 'Retry')}
              </Button>
            </div>
          )}

          {vendorNotice && (
            <div
              role="status"
              className={`rounded-[var(--radius-md)] border px-3.5 py-2.5 text-xs font-medium ${
                vendorNotice.tone === 'success'
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-danger/40 bg-danger/10 text-danger'
              }`}
            >
              {vendorNotice.text}
            </div>
          )}

          {vendorLoading && vendorTickets.length === 0 ? (
            <div className="p-6 text-xs text-muted border border-border rounded-[var(--radius-md)] bg-surface">
              {t('ভেন্ডর মেসেজ লোড হচ্ছে...', 'Loading vendor messages...')}
            </div>
          ) : filteredVendorTickets.length === 0 ? (
            <EmptyState
              title={t('কোনো ভেন্ডর মেসেজ নেই', 'No vendor messages')}
              description={t(
                'ভেন্ডর পোর্টাল থেকে পাঠানো সাপোর্ট মেসেজগুলো এখানে দেখাবে এবং সরাসরি উত্তর দেওয়া যাবে।',
                'Support threads submitted by vendors appear here for direct replies.'
              )}
            />
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
              {/* Left: Vendor Thread List */}
              <div className="lg:col-span-5 border border-border rounded-[var(--radius-md)] bg-surface divide-y divide-border max-h-[600px] overflow-y-auto">
                {filteredVendorTickets.map((tkt) => {
                  const vendorInfo = tkt.vendorId ? vendorMap.get(tkt.vendorId) : undefined;
                  const lastMsg = tkt.messages[tkt.messages.length - 1];
                  const awaitingAdmin = tkt.status === 'open' && lastMsg?.sender === 'vendor';
                  const selected = activeVendorTicket?.ticketId === tkt.ticketId;

                  return (
                    <button
                      key={tkt.ticketId}
                      type="button"
                      onClick={() => {
                        setSelectedTicketId(tkt.ticketId);
                        setConfirmCloseTicketId(null);
                      }}
                      className={`w-full text-left p-3.5 transition-colors space-y-1 ${
                        selected ? 'bg-bg' : 'hover:bg-bg/50'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-semibold text-ink line-clamp-1">
                          {tkt.subject}
                        </span>
                        <Badge
                          status={
                            tkt.status === 'closed'
                              ? 'neutral'
                              : awaitingAdmin
                                ? 'warning'
                                : 'success'
                          }
                        >
                          {tkt.status === 'closed'
                            ? t('বন্ধ', 'Closed')
                            : awaitingAdmin
                              ? t('উত্তর অপেক্ষমাণ', 'Needs reply')
                              : t('খোলা', 'Open')}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted line-clamp-1">
                        {lastMsg?.text || '—'}
                      </p>
                      <p className="text-[11px] text-muted tabular-nums">
                        {vendorInfo
                          ? `${bn ? vendorInfo.businessNameBn : vendorInfo.businessNameEn || vendorInfo.businessNameBn} · ${vendorInfo.vendorCode}`
                          : tkt.vendorId?.slice(0, 8) || 'Vendor'}{' '}
                        · {formatLocaleDateTime(tkt.updatedAt, locale)}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Right: Vendor Thread Conversation */}
              {activeVendorTicket && (
                <Card surface="bg" padding="md" className="lg:col-span-7 space-y-4 min-w-0">
                  <div className="border-b border-border pb-3 flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h2 className="text-base font-bold text-ink break-words">
                        {activeVendorTicket.subject}
                      </h2>
                      <p className="text-xs text-muted mt-0.5 tabular-nums">
                        {(() => {
                          const v = activeVendorTicket.vendorId
                            ? vendorMap.get(activeVendorTicket.vendorId)
                            : undefined;
                          return v
                            ? `${bn ? v.businessNameBn : v.businessNameEn || v.businessNameBn} · ${v.vendorCode}`
                            : `${t('ভেন্ডর', 'Vendor')}: ${activeVendorTicket.vendorId ?? '—'}`;
                        })()}{' '}
                        · {formatLocaleNumber(activeVendorTicket.messages.length, locale)}{' '}
                        {t('টি বার্তা', 'messages')}
                      </p>
                    </div>
                    <Badge status={activeVendorTicket.status === 'open' ? 'info' : 'neutral'}>
                      {activeVendorTicket.status === 'open' ? t('খোলা', 'Open') : t('বন্ধ', 'Closed')}
                    </Badge>
                  </div>

                  {/* Messages Thread */}
                  <ol className="space-y-2.5 max-h-80 overflow-y-auto pr-1">
                    {activeVendorTicket.messages.map((msg) => (
                      <li
                        key={msg.messageId}
                        className={`rounded-[var(--radius-md)] border p-3 text-xs space-y-1 ${
                          msg.sender === 'admin'
                            ? 'border-ink/25 bg-surface ml-6'
                            : 'border-border bg-bg mr-6'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 text-[11px] text-muted">
                          <strong className="text-ink">
                            {msg.sender === 'admin' ? t('অ্যাডমিন', 'Admin') : t('ভেন্ডর', 'Vendor')}
                          </strong>
                          <span className="tabular-nums">
                            {formatLocaleDateTime(msg.createdAt, locale)}
                          </span>
                        </div>
                        <p className="whitespace-pre-wrap break-words text-ink text-sm">
                          {msg.text}
                        </p>
                      </li>
                    ))}
                  </ol>

                  {/* Reply / Close controls */}
                  {activeVendorTicket.status === 'open' && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!vendorReplyText.trim()) return;
                        void handleVendorAction({
                          action: 'reply',
                          ticketId: activeVendorTicket.ticketId,
                          text: vendorReplyText.trim(),
                        });
                      }}
                      className="space-y-3 border-t border-border pt-3"
                    >
                      <label className="block text-xs text-ink space-y-1">
                        <span className="font-medium">{t('উত্তর লিখুন', 'Write a reply')}</span>
                        <textarea
                          rows={3}
                          required
                          maxLength={2000}
                          value={vendorReplyText}
                          onChange={(e) => setVendorReplyText(e.target.value)}
                          placeholder={t(
                            'ভেন্ডরের জন্য স্পষ্ট উত্তর লিখুন...',
                            'Type a clear reply for the vendor...'
                          )}
                          className="w-full p-3 text-sm rounded-[var(--radius-md)] border border-border bg-surface text-ink focus:outline-none focus:border-ink"
                        />
                      </label>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Button
                          type="submit"
                          size="sm"
                          variant="primary"
                          disabled={
                            vendorBusy ||
                            !vendorReplyText.trim() ||
                            activeVendorTicket.messages.length >= 100
                          }
                        >
                          <Send className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                          {t('উত্তর পাঠান', 'Send Reply')}
                        </Button>

                        {confirmCloseTicketId === activeVendorTicket.ticketId ? (
                          <div className="flex items-center gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="danger"
                              disabled={vendorBusy}
                              onClick={() =>
                                void handleVendorAction({
                                  action: 'close',
                                  ticketId: activeVendorTicket.ticketId,
                                })
                              }
                            >
                              {t('হ্যাঁ, টিকিট বন্ধ করুন', 'Confirm Close')}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={vendorBusy}
                              onClick={() => setConfirmCloseTicketId(null)}
                            >
                              {t('বাতিল', 'Cancel')}
                            </Button>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={vendorBusy}
                            onClick={() => setConfirmCloseTicketId(activeVendorTicket.ticketId)}
                          >
                            {t('টিকিট বন্ধ করুন', 'Close Ticket')}
                          </Button>
                        )}
                      </div>
                    </form>
                  )}
                </Card>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====================================================================
          TAB 3: TEMPLATES & AUTOMATION RULES
         ==================================================================== */}
      {subTab === 'templates' && (
        <div className="space-y-5">
          {templateNotice && (
            <div
              role="status"
              className={`rounded-[var(--radius-md)] border px-3.5 py-2.5 text-xs font-medium ${
                templateNotice.tone === 'success'
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-danger/40 bg-danger/10 text-danger'
              }`}
            >
              {templateNotice.text}
            </div>
          )}

          {/* Quick Order Message Generator */}
          <Card surface="bg" padding="md" className="space-y-4">
            <div>
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <MessageSquare className="w-4 h-4" aria-hidden="true" />
                {t('অর্ডার মেসেজ জেনারেটর (ফ্রি wa.me ও SMS)', 'Order Message Generator (Free wa.me & SMS)')}
              </h2>
              <p className="text-xs text-muted mt-0.5">
                {t(
                  'অর্ডার ও ইভেন্ট বেছে নিয়ে দ্বিভাষিক মেসেজ তৈরি করুন এবং এক ক্লিকে WhatsApp বা SMS অ্যাপে পাঠান।',
                  'Generate bilingual order updates and launch directly into WhatsApp or SMS.'
                )}
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
              <label className="text-xs text-ink space-y-1">
                <span className="font-medium block">{t('অর্ডার নম্বর', 'Order No')}</span>
                <select
                  value={selectedOrderNo}
                  onChange={(e) => setSelectedOrderNo(e.target.value)}
                  className="w-full min-h-[44px] px-3 rounded-[var(--radius-md)] border border-border bg-surface text-xs text-ink"
                >
                  {availableOrderNos.length === 0 ? (
                    <option value="">{t('কোনো অর্ডার নেই', 'No orders')}</option>
                  ) : (
                    availableOrderNos.slice(0, 60).map((ordNo) => (
                      <option key={ordNo} value={ordNo}>
                        {ordNo}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="text-xs text-ink space-y-1">
                <span className="font-medium block">{t('টেমপ্লেট ইভেন্ট', 'Template Event')}</span>
                <select
                  value={selectedEventKey}
                  onChange={(e) => setSelectedEventKey(e.target.value as MessageEventKey)}
                  className="w-full min-h-[44px] px-3 rounded-[var(--radius-md)] border border-border bg-surface text-xs text-ink"
                >
                  {messageTemplates.map((tpl) => (
                    <option key={tpl.eventKey} value={tpl.eventKey}>
                      {tpl.eventLabelBn} ({tpl.eventKey})
                    </option>
                  ))}
                </select>
              </label>

              <Button
                type="button"
                variant="primary"
                disabled={templateBusy || !selectedOrderNo}
                onClick={() => void handleGeneratePreview()}
              >
                {t('মেসেজ প্রিভিউ তৈরি করুন', 'Generate Preview')}
              </Button>
            </div>

            {previewResult && (
              <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3.5 space-y-3">
                <p className="text-xs text-muted font-mono tabular-nums">
                  {t('প্রাপক', 'Recipient')}: {previewResult.recipientPhone}
                </p>
                <pre className="whitespace-pre-wrap text-xs text-ink font-sans leading-relaxed">
                  {previewResult.renderedText}
                </pre>
                <div className="flex flex-wrap gap-2">
                  {previewResult.waMeUrl && (
                    <a
                      href={previewResult.waMeUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex min-h-[40px] items-center gap-1.5 px-3 rounded-[var(--radius-md)] bg-ink text-bg text-xs font-semibold"
                    >
                      <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                      WhatsApp ↗
                    </a>
                  )}
                  {previewResult.smsUrl && (
                    <a
                      href={previewResult.smsUrl}
                      className="inline-flex min-h-[40px] items-center gap-1.5 px-3 rounded-[var(--radius-md)] border border-border bg-bg text-xs font-medium text-ink"
                    >
                      SMS ↗
                    </a>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(previewResult.renderedText);
                        setCopiedPreview(true);
                      } catch {
                        // ignore clipboard permission error
                      }
                    }}
                  >
                    {copiedPreview ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                        {t('কপি হয়েছে', 'Copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                        {t('কপি', 'Copy')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </Card>

          {/* Automation Rules & Global Kill-Switch */}
          {isSuperAdmin && (
            <Card surface="bg" padding="md" className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                <div>
                  <h2 className="text-sm font-bold text-ink">
                    {t('অটোমেশন রুলস', 'Automation Rules')}
                  </h2>
                  <p className="text-xs text-muted">
                    {t(
                      'ডিফল্টে Dry-Run মোডে থাকে; যেকোনো সময় কিল-সুইচ দিয়ে সব রুল বন্ধ করা যায়।',
                      'Rules default to Dry-Run; the global kill-switch pauses all rules instantly.'
                    )}
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant={automationKillSwitchActive ? 'danger' : 'outline'}
                  disabled={templateBusy}
                  onClick={() =>
                    void handleToggleAutomation({
                      globalKillSwitch: !automationKillSwitchActive,
                    })
                  }
                >
                  <Power className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  {automationKillSwitchActive
                    ? t('কিল-সুইচ চালু আছে (রিজিউম করুন)', 'Kill-Switch Active (Resume)')
                    : t('জরুরি কিল-সুইচ', 'Emergency Kill-Switch')}
                </Button>
              </div>

              <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] bg-surface">
                {automationRules.map((rule) => (
                  <div
                    key={rule.ruleId}
                    className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-ink">{rule.nameBn}</span>
                        <Badge status={rule.isEnabled ? 'success' : 'neutral'}>
                          {rule.isEnabled ? t('সক্রিয়', 'Active') : t('বন্ধ', 'Off')}
                        </Badge>
                        <span className="text-muted tabular-nums">
                          {rule.dryRunOnly ? 'Dry-Run' : 'Live'} ·{' '}
                          {formatLocaleNumber(rule.totalRunsCount, locale)} {t('রান', 'runs')}
                        </span>
                      </div>
                      <p className="text-muted">
                        {rule.conditionSummaryBn} → {rule.actionSummaryBn}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-1.5 shrink-0">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={templateBusy}
                        onClick={() =>
                          void handleToggleAutomation({
                            ruleId: rule.ruleId,
                            isEnabled: !rule.isEnabled,
                          })
                        }
                      >
                        {rule.isEnabled ? t('বন্ধ করুন', 'Disable') : t('চালু করুন', 'Enable')}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={templateBusy}
                        onClick={() =>
                          void handleToggleAutomation({
                            ruleId: rule.ruleId,
                            dryRunOnly: !rule.dryRunOnly,
                          })
                        }
                      >
                        {rule.dryRunOnly ? 'Switch Live' : 'Set Dry-Run'}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={templateBusy}
                        onClick={() => void handleSimulateRule(rule.ruleId)}
                      >
                        {t('টেস্ট রান', 'Test Run')}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {automationLogs.length > 0 && (
                <details className="text-xs pt-1">
                  <summary className="cursor-pointer font-medium text-ink">
                    {t('সাম্প্রতিক অটোমেশন লগ', 'Recent automation runs')} (
                    {formatLocaleNumber(automationLogs.length, locale)})
                  </summary>
                  <ul className="mt-2 divide-y divide-border border border-border rounded-[var(--radius-md)] bg-surface max-h-48 overflow-y-auto">
                    {automationLogs.slice(0, 12).map((log) => (
                      <li key={log.id} className="p-2.5 text-muted">
                        <span className="font-mono text-ink">[{log.mode}]</span> {log.ruleNameBn} ·{' '}
                        {log.outcomeSummaryBn} ·{' '}
                        <span className="tabular-nums">
                          {formatLocaleDateTime(log.createdAt, locale)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </Card>
          )}

          {/* Recent Dispatch Logs */}
          {messageLogs.length > 0 && (
            <Card surface="bg" padding="md" className="space-y-2.5">
              <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">
                {t('সাম্প্রতিক মেসেজ লগ', 'Recent Dispatch Log')} (
                {formatLocaleNumber(messageLogs.length, locale)})
              </h3>
              <ul className="divide-y divide-border border border-border rounded-[var(--radius-md)] bg-surface max-h-52 overflow-y-auto text-xs">
                {messageLogs.slice(0, 15).map((m) => (
                  <li key={m.id} className="p-2.5 flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <span className="font-mono font-semibold text-ink">{m.orderNo}</span> ·{' '}
                      <span className="text-muted">{m.channel}</span> ·{' '}
                      <span className="font-mono text-muted tabular-nums">{m.recipientPhone}</span>
                    </div>
                    <span className="text-[11px] text-muted tabular-nums">
                      {formatLocaleDateTime(m.createdAt, locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </section>
  );
}
