'use client';

// src/components/admin/vendor-control-panel.tsx
// ADMIN → VENDOR CONTROL SURFACE
// This panel is the single place where the super admin decides everything the
// consignment vendor panel may do:
//   1. Vendor directory  — create, edit, suspend/close, commission & escrow hold
//   2. Capability matrix — per-vendor switches for each vendor-panel action
//   3. Request inbox     — approve/reject vendor-filed profile & onboarding edits
//   4. Vendor panel preview — the exact permission view the vendor sees
// Backed by /api/admin/vendors (super admin only; vendors are refused).

import * as React from 'react';
import { SupportPanel } from '@/components/vendor/support-panel';
import { KycPanel } from '@/components/vendor/kyc-panel';
import {
  BadgeCheck,
  Building2,
  CheckCircle2,
  ClipboardCheck,
  Cog,
  Eye,
  KeyRound,
  Percent,
  PlusCircle,
  RefreshCw,
  Save,
  ShieldAlert,
  ShieldCheck,
  User,
  Wallet,
  XCircle,
} from 'lucide-react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import { formatPoishaToBdt } from '@/lib/money';
import { useLocaleStore } from '@/store/use-locale-store';
import { Badge, Button, Card, EmptyState, Input, Skeleton } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type {
  AdminVendorControlSnapshot,
  AdminVendorRequestDTO,
  AdminVendorRowDTO,
  VendorCapabilityFlags,
} from '@/lib/vendor/vendor-types';

type SubTab = 'directory' | 'permissions' | 'requests';

interface VendorControlPanelProps {
  locale?: 'bn' | 'en';
  onNotify?: (message: string, tone?: 'success' | 'error') => void;
}

const STATUS_BN: Record<string, [string, string]> = {
  active: ['সক্রিয়', 'Active'],
  pending_onboarding: ['অনবোর্ডিং অপেক্ষমাণ', 'Pending onboarding'],
  suspended: ['স্থগিত', 'Suspended'],
  closing_audit: ['ক্লোজিং অডিট', 'Closing audit'],
  closed: ['বন্ধ', 'Closed'],
};

const inputCls =
  'w-full min-h-[44px] px-3 py-2 text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)] focus:outline-2 focus:outline-offset-0 focus:outline-ink';

function parseTaka(value: string): number | null {
  const clean = value.replace(/[৳,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

export function VendorControlPanel({ locale: localeProp, onNotify }: VendorControlPanelProps) {
  const storeLocale = useLocaleStore((state) => state.adminLocale);
  const locale = localeProp ?? storeLocale;
  const bn = locale === 'bn';
  const t = React.useCallback((b: string, e: string) => (bn ? b : e), [bn]);
  const money = React.useCallback((p: number) => formatPoishaToBdt(p, locale), [locale]);

  const [snapshot, setSnapshot] = React.useState<AdminVendorControlSnapshot | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [loadError, setLoadError] = React.useState('');
  const [subTab, setSubTab] = React.useState<SubTab>('directory');
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const notify = React.useCallback(
    (message: string, tone: 'success' | 'error' = 'success') => {
      setFeedback({ tone, text: message });
      onNotify?.(message, tone);
      window.setTimeout(() => setFeedback(null), 6000);
    },
    [onNotify]
  );

  const load = React.useCallback(async () => {
    try {
      const response = await fetch('/api/admin/vendors', { cache: 'no-store' });
      const data = (await response.json()) as AdminVendorControlSnapshot;
      if (!response.ok || !data.success) {
        setLoadError(data.errorBn || t('ভেন্ডর নিয়ন্ত্রণ লোড করা যায়নি।', 'Could not load vendor control.'));
        setSnapshot(null);
        return;
      }
      setSnapshot(data);
      setLoadError('');
      setSelectedId((current) => current ?? data.vendors[0]?.vendorId ?? null);
    } catch {
      setLoadError(t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.'));
      setSnapshot(null);
    } finally {
      setLoading(false);
    }
  }, [t]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const post = React.useCallback(
    async (body: Record<string, unknown>, successMessage: { bn: string; en: string }) => {
      setBusy(true);
      try {
        const response = await fetch('/api/admin/vendors', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const data = (await response.json()) as { success?: boolean; errorBn?: string; errorEn?: string };
        if (!response.ok || !data.success) {
          notify((bn ? data.errorBn : data.errorEn || data.errorBn) || t('কাজটি সম্পন্ন হয়নি।', 'The action failed.'), 'error');
          return false;
        }
        notify(bn ? successMessage.bn : successMessage.en);
        await load();
        return true;
      } catch {
        notify(t('নেটওয়ার্ক সমস্যা হয়েছে।', 'Network error.'), 'error');
        return false;
      } finally {
        setBusy(false);
      }
    },
    [bn, load, notify, t]
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (!snapshot) {
    return (
      <Card surface="surface" padding="md" className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-bold text-danger">
          <ShieldAlert className="h-4 w-4" aria-hidden="true" />
          {t('ভেন্ডর নিয়ন্ত্রণ প্যানেল', 'Vendor control panel')}
        </div>
        <p className="text-xs text-muted">{loadError || t('শুধুমাত্র সুপার অ্যাডমিন প্রবেশ করতে পারেন।', 'Only the super admin can open this panel.')}</p>
        <Button variant="outline" size="sm" onClick={() => void load()} leftIcon={<RefreshCw className="h-4 w-4" aria-hidden="true" />}>
          {t('আবার চেষ্টা করুন', 'Retry')}
        </Button>
      </Card>
    );
  }

  const pendingRequests = snapshot.requests.filter((request) => request.status === 'pending_review');
  const selected = snapshot.vendors.find((vendor) => vendor.vendorId === selectedId) ?? null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-bold text-ink">
            <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            {t('ভেন্ডর নিয়ন্ত্রণ কেন্দ্র', 'Vendor control center')}
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {t(
              'এখান থেকেই ঠিক করা হয় ভেন্ডর প্যানেলে ভেন্ডর কী করতে পারবে, কী পারবে না।',
              'Everything a vendor may do in the vendor panel is decided here.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" size="sm" onClick={() => void load()} leftIcon={<RefreshCw className={cn('h-4 w-4', busy && 'animate-spin')} aria-hidden="true" />}>
            {t('রিফ্রেশ', 'Refresh')}
          </Button>
          <Button
            variant="primary"
            size="sm"
            leftIcon={<PlusCircle className="h-4 w-4" aria-hidden="true" />}
            onClick={() => {
              setCreating(true);
              setSubTab('directory');
            }}
          >
            {t('নতুন ভেন্ডর', 'New vendor')}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label={t('মোট ভেন্ডর', 'Vendors')} value={String(snapshot.vendors.length)} />
        <Kpi
          label={t('সক্রিয়', 'Active')}
          value={String(snapshot.vendors.filter((vendor) => vendor.status === 'active').length)}
          tone="positive"
        />
        <Kpi
          label={t('স্থগিত', 'Suspended')}
          value={String(snapshot.vendors.filter((vendor) => vendor.status === 'suspended').length)}
          tone={snapshot.vendors.some((vendor) => vendor.status === 'suspended') ? 'danger' : 'neutral'}
        />
        <Kpi
          label={t('অনুরোধ অপেক্ষমাণ', 'Pending requests')}
          value={String(pendingRequests.length)}
          tone={pendingRequests.length > 0 ? 'warning' : 'neutral'}
        />
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border pb-2">
        {(
          [
            ['directory', t('ডাইরেক্টরি ও শর্তাবলি', 'Directory & terms'), <Building2 key="d" className="h-4 w-4" aria-hidden="true" />],
            ['permissions', t('ভেন্ডর কী পারবে', 'Vendor permissions'), <KeyRound key="k" className="h-4 w-4" aria-hidden="true" />],
            ['requests', t('অনুরোধ ইনবক্স', 'Request inbox'), <ClipboardCheck key="c" className="h-4 w-4" aria-hidden="true" />],
          ] as Array<[SubTab, string, React.ReactNode]>
        ).map(([key, label, icon]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSubTab(key)}
            aria-current={subTab === key ? 'page' : undefined}
            className={cn(
              'flex min-h-[44px] items-center gap-1.5 rounded-[var(--radius-md)] border px-3 text-xs font-semibold',
              subTab === key ? 'border-ink bg-ink text-bg' : 'border-border bg-bg text-ink hover:bg-surface'
            )}
          >
            {icon}
            {label}
            {key === 'requests' && pendingRequests.length > 0 && (
              <span className={cn('ml-1 inline-flex min-w-[18px] justify-center rounded-full border px-1 text-[10px] font-bold', subTab === key ? 'border-bg text-bg' : 'border-warning text-warning')}>
                {pendingRequests.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          role="alert"
          className={cn(
            'rounded-[var(--radius-md)] border p-2 text-xs',
            feedback.tone === 'success' ? 'border-success text-success' : 'border-danger text-danger'
          )}
        >
          {feedback.text}
        </div>
      )}

      {subTab === 'directory' && (
        <DirectorySection
          snapshot={snapshot}
          selected={selected}
          creating={creating}
          busy={busy}
          t={t}
          money={money}
          onSelect={setSelectedId}
          onCancelCreate={() => setCreating(false)}
          post={post}
        />
      )}

      {subTab === 'permissions' && (
        <PermissionsSection
          snapshot={snapshot}
          selected={selected}
          busy={busy}
          t={t}
          onSelect={setSelectedId}
          post={post}
        />
      )}

      {subTab === 'requests' && <SupportPanel locale={locale} mode="admin" />}
      {subTab === 'requests' && <KycPanel locale={locale} mode="admin" />}
      {subTab === 'requests' && (
        <RequestsSection snapshot={snapshot} busy={busy} t={t} post={post} />
      )}
    </div>
  );
}

function Kpi({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
}) {
  const toneClass =
    tone === 'positive' ? 'text-success' : tone === 'warning' ? 'text-warning' : tone === 'danger' ? 'text-danger' : 'text-ink';
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className={cn('mt-1 text-lg font-bold tabular-nums', toneClass)}>{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. DIRECTORY: create, edit terms, status
// ---------------------------------------------------------------------------

function DirectorySection({
  snapshot,
  selected,
  creating,
  busy,
  t,
  money,
  onSelect,
  onCancelCreate,
  post,
}: {
  snapshot: AdminVendorControlSnapshot;
  selected: AdminVendorRowDTO | null;
  creating: boolean;
  busy: boolean;
  t: (b: string, e: string) => string;
  money: (p: number) => string;
  onSelect: (id: string) => void;
  onCancelCreate: () => void;
  post: (body: Record<string, unknown>, success: { bn: string; en: string }) => Promise<boolean>;
}) {
  const [form, setForm] = React.useState({
    businessNameBn: '',
    businessNameEn: '',
    ownerNameBn: '',
    contactPhone: '',
    payoutMethodBn: '',
    payoutAccountNo: '',
    commissionPercent: '',
    holdDays: '',
    status: 'pending_onboarding',
  });

  React.useEffect(() => {
    if (!selected || creating) return;
    setForm({
      businessNameBn: selected.businessNameBn,
      businessNameEn: selected.businessNameEn,
      ownerNameBn: selected.ownerNameBn,
      contactPhone: selected.contactPhone,
      payoutMethodBn: selected.payoutMethodBn,
      payoutAccountNo: selected.payoutAccountNo,
      commissionPercent:
        selected.defaultCommissionBp === null ? '' : String(selected.defaultCommissionBp / 100),
      holdDays: selected.escrowHoldDaysOverride === null ? '' : String(selected.escrowHoldDaysOverride),
      status: selected.status,
    });
  }, [selected, creating]);

  const update = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));

  async function submitCreate(event: React.FormEvent) {
    event.preventDefault();
    const commission = Number(form.commissionPercent || '0');
    const holdDays = Number(form.holdDays || '7');
    const ok = await post(
      {
        operation: 'create_vendor',
        businessNameBn: form.businessNameBn.trim(),
        businessNameEn: form.businessNameEn.trim() || undefined,
        ownerNameBn: form.ownerNameBn.trim(),
        contactPhone: form.contactPhone.trim(),
        defaultCommissionBp: Math.round(commission * 100),
        escrowHoldDaysOverride: holdDays,
        payoutMethodBn: form.payoutMethodBn.trim() || 'বিকাশ মার্চেন্ট',
        payoutAccountNo: form.payoutAccountNo.trim() || form.contactPhone.trim(),
      },
      { bn: 'নতুন ভেন্ডর তৈরি হয়েছে।', en: 'Vendor created.' }
    );
    if (ok) onCancelCreate();
  }

  async function submitUpdate(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    let activationReason: string | undefined;
    if (selected.status === 'pending_onboarding' && form.status === 'active') {
      activationReason = window.prompt(t('অনবোর্ডিং পর্যালোচনার কারণ লিখুন (অন্তত ৫ অক্ষর; ব্যক্তিগত তথ্য নয়)', 'Enter the onboarding review reason (at least 5 characters; no personal data)'))?.trim();
      if (!activationReason || activationReason.length < 5) return;
    }
    await post(
      {
        operation: 'update_vendor',
        activationReason,
        vendorId: selected.vendorId,
        businessNameBn: form.businessNameBn.trim(),
        businessNameEn: form.businessNameEn.trim() || undefined,
        ownerNameBn: form.ownerNameBn.trim(),
        contactPhone: form.contactPhone.trim(),
        payoutMethodBn: form.payoutMethodBn.trim(),
        payoutAccountNo: form.payoutAccountNo.trim(),
        defaultCommissionBp: form.commissionPercent ? Math.round(Number(form.commissionPercent) * 100) : null,
        escrowHoldDaysOverride: form.holdDays ? Number(form.holdDays) : null,
        status: form.status,
      },
      { bn: 'ভেন্ডরের শর্তাবলি আপডেট হয়েছে।', en: 'Vendor terms updated.' }
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <Card surface="bg" padding="none" className="divide-y divide-border">
        <div className="p-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {t('ভেন্ডর ডাইরেক্টরি', 'Vendor directory')}
        </div>
        {snapshot.vendors.length === 0 && <p className="p-4 text-xs text-muted">{t('কোনো ভেন্ডর নেই।', 'No vendors yet.')}</p>}
        {snapshot.vendors.map((vendor) => (
          <button
            key={vendor.vendorId}
            type="button"
            onClick={() => onSelect(vendor.vendorId)}
            className={cn(
              'flex w-full min-h-[56px] flex-col gap-1 p-2 text-left hover:bg-surface',
              selected?.vendorId === vendor.vendorId && 'bg-surface'
            )}
          >
            <span className="flex w-full items-center gap-1.5">
              <span className="truncate text-xs font-bold">{vendor.businessNameBn}</span>
              <Badge
                status={
                  vendor.status === 'active'
                    ? 'success'
                    : vendor.status === 'suspended'
                    ? 'danger'
                    : 'warning'
                }
              >
                {t(...(STATUS_BN[vendor.status] ?? [vendor.status, vendor.status]))}
              </Badge>
              {vendor.pendingRequests > 0 && <Badge status="warning">{vendor.pendingRequests}</Badge>}
            </span>
            <span className="flex w-full flex-wrap items-center gap-2 text-[10px] text-muted">
              <span className="font-mono">{vendor.vendorCode}</span>
              <span>{t('পণ্য', 'Products')} {vendor.activeProducts}/{vendor.totalProducts}</span>
              <span>{t('উত্তোলনযোগ্য', 'Withdrawable')} {money(vendor.balance.withdrawablePoisha)}</span>
            </span>
          </button>
        ))}
      </Card>

      <Card surface="surface" padding="md" className="space-y-3">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          {creating ? <PlusCircle className="h-4 w-4" aria-hidden="true" /> : <Cog className="h-4 w-4" aria-hidden="true" />}
          {creating ? t('নতুন ভেন্ডর অনবোর্ড', 'Onboard a new vendor') : t('শর্তাবলি ও প্রোফাইল', 'Terms & profile')}
        </h3>

        {!creating && !selected && <p className="text-xs text-muted">{t('বাম থেকে একজন ভেন্ডর নির্বাচন করুন।', 'Select a vendor on the left.')}</p>}

        {(creating || selected) && (
          <form onSubmit={creating ? submitCreate : submitUpdate} className="grid gap-2 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium">
              <span>{t('ব্যবসার নাম (বাংলা)', 'Business name (Bangla)')}</span>
              <input className={inputCls} value={form.businessNameBn} onChange={(e) => update('businessNameBn', e.target.value)} required minLength={2} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('ব্যবসার নাম (ইংরেজি)', 'Business name (English)')}</span>
              <input className={inputCls} value={form.businessNameEn} onChange={(e) => update('businessNameEn', e.target.value)} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('মালিকের নাম', 'Owner name')}</span>
              <input className={inputCls} value={form.ownerNameBn} onChange={(e) => update('ownerNameBn', e.target.value)} required minLength={2} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('যোগাযোগ নম্বর', 'Contact phone')}</span>
              <input className={inputCls} inputMode="tel" value={form.contactPhone} onChange={(e) => update('contactPhone', e.target.value)} required minLength={11} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('পেআউট পদ্ধতি', 'Payout method')}</span>
              <input className={inputCls} value={form.payoutMethodBn} onChange={(e) => update('payoutMethodBn', e.target.value)} placeholder={t('বিকাশ মার্চেন্ট', 'bKash merchant')} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('পেআউট অ্যাকাউন্ট', 'Payout account')}</span>
              <input className={inputCls} value={form.payoutAccountNo} onChange={(e) => update('payoutAccountNo', e.target.value)} />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('কমিশন (%)', 'Commission (%)')}</span>
              <input
                className={inputCls}
                inputMode="decimal"
                value={form.commissionPercent}
                onChange={(e) => update('commissionPercent', e.target.value)}
                placeholder={String(snapshot.globalRules.globalDefaultCommissionBp / 100)}
              />
              <span className="text-[10px] font-normal text-muted">
                {t('ফাঁকা = গ্লোবাল ডিফল্ট', 'Blank = global default')} ({snapshot.globalRules.globalDefaultCommissionBp / 100}%)
              </span>
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('এসক্রো হোল্ড (দিন)', 'Escrow hold (days)')}</span>
              <input
                className={inputCls}
                inputMode="numeric"
                value={form.holdDays}
                onChange={(e) => update('holdDays', e.target.value.replace(/\D/g, ''))}
                placeholder={String(snapshot.globalRules.globalEscrowHoldDays)}
              />
              <span className="text-[10px] font-normal text-muted">
                {t('ফাঁকা = গ্লোবাল ডিফল্ট', 'Blank = global default')} ({snapshot.globalRules.globalEscrowHoldDays})
              </span>
            </label>
            <label className="space-y-1 text-xs font-medium sm:col-span-2">
              <span>{t('অ্যাকাউন্ট স্ট্যাটাস', 'Account status')}</span>
              {selected?.status === 'pending_onboarding' && <p className="text-muted">{t('সক্রিয় করার আগে অনবোর্ডিং উত্তর জমা ও অনুমোদন করুন। নথি/KYC যাচাই আলাদাভাবে নিশ্চিত করুন।', 'Approve the onboarding answers before activation. Verify documents/KYC separately.')}</p>}
              <select disabled={creating} className={inputCls} value={creating ? 'pending_onboarding' : form.status} onChange={(e) => update('status', e.target.value)}>
                <option value="active">{t('সক্রিয়', 'Active')}</option>
                <option value="pending_onboarding">{t('অনবোর্ডিং অপেক্ষমাণ', 'Pending onboarding')}</option>
                <option value="suspended">{t('স্থগিত (সব কাজ বন্ধ)', 'Suspended (all actions blocked)')}</option>
                <option value="closing_audit">{t('ক্লোজিং অডিট', 'Closing audit')}</option>
                {selected?.status === 'closed' && <option value="closed">{t('বন্ধ', 'Closed')}</option>}
              </select>
            </label>

            {selected && !creating && (
              <div className="sm:col-span-2 rounded-[var(--radius-md)] border border-border bg-bg p-2 text-[11px]">
                <p className="font-semibold text-ink">{t('লিংকড লগইন অ্যাকাউন্ট', 'Linked login accounts')}</p>
                {selected.linkedUsers.length === 0 ? (
                  <p className="text-muted">
                    {t(
                      'এখনো কোনো লগইন অ্যাকাউন্ট নেই — "Users & RBAC" ট্যাব থেকে vendor রোল দিয়ে তৈরি করুন।',
                      'No login account yet — create one with the vendor role in the Users & RBAC tab.'
                    )}
                  </p>
                ) : (
                  <ul className="mt-1 space-y-0.5">
                    {selected.linkedUsers.map((user) => (
                      <li key={user.userId} className="flex items-center gap-2">
                        <User className="h-3 w-3" aria-hidden="true" />
                        <span className="font-mono">@{user.username}</span>
                        {user.isActive ? <Badge status="success">{t('সক্রিয়', 'Active')}</Badge> : <Badge status="danger">{t('নিষ্ক্রিয়', 'Inactive')}</Badge>}
                        {user.mustChangePassword && <Badge status="warning">{t('প্রথম লগইন বাকি', 'First login pending')}</Badge>}
                        {user.totpEnrolled ? <Badge status="info">2FA</Badge> : null}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 sm:col-span-2">
              <Button type="submit" variant="primary" isLoading={busy} leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}>
                {creating ? t('ভেন্ডর তৈরি করুন', 'Create vendor') : t('পরিবর্তন সংরক্ষণ', 'Save changes')}
              </Button>
              {creating && (
                <Button type="button" variant="outline" onClick={onCancelCreate}>
                  {t('বাতিল', 'Cancel')}
                </Button>
              )}
            </div>
          </form>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. PERMISSIONS: the capability matrix that drives the vendor panel
// ---------------------------------------------------------------------------

function PermissionsSection({
  snapshot,
  selected,
  busy,
  t,
  onSelect,
  post,
}: {
  snapshot: AdminVendorControlSnapshot;
  selected: AdminVendorRowDTO | null;
  busy: boolean;
  t: (b: string, e: string) => string;
  onSelect: (id: string) => void;
  post: (body: Record<string, unknown>, success: { bn: string; en: string }) => Promise<boolean>;
}) {
  const [draft, setDraft] = React.useState<VendorCapabilityFlags | null>(null);
  const [note, setNote] = React.useState('');
  const [maxProducts, setMaxProducts] = React.useState('0');

  React.useEffect(() => {
    if (!selected) {
      setDraft(null);
      return;
    }
    setDraft({ ...selected.capabilities });
    setNote(selected.restrictionNoteBn ?? '');
    setMaxProducts(String(selected.capabilities.maxActiveProducts));
  }, [selected]);

  if (snapshot.vendors.length === 0) {
    return <EmptyState icon={<Building2 className="h-6 w-6" aria-hidden="true" />} title={t('কোনো ভেন্ডর নেই', 'No vendors yet')} />;
  }

  const toggle = (key: keyof VendorCapabilityFlags) => {
    if (key === 'maxActiveProducts' || !draft) return;
    setDraft({ ...draft, [key]: !draft[key] });
  };

  const booleanKeys = snapshot.capabilityLabels
    .map((label) => label.key)
    .filter((key) => key !== 'maxActiveProducts');

  return (
    <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
      <Card surface="bg" padding="none" className="divide-y divide-border">
        {snapshot.vendors.map((vendor) => (
          <button
            key={vendor.vendorId}
            type="button"
            onClick={() => onSelect(vendor.vendorId)}
            className={cn(
              'flex min-h-[44px] w-full items-center gap-1.5 p-2 text-left text-xs hover:bg-surface',
              selected?.vendorId === vendor.vendorId && 'bg-surface font-bold'
            )}
          >
            <span className="truncate">{vendor.businessNameBn}</span>
            <span className="ml-auto font-mono text-[10px] text-muted">{vendor.vendorCode}</span>
          </button>
        ))}
      </Card>

      <Card surface="surface" padding="md" className="space-y-3">
        {!selected || !draft ? (
          <p className="text-xs text-muted">{t('একজন ভেন্ডর নির্বাচন করুন।', 'Select a vendor.')}</p>
        ) : (
          <>
            <div>
              <h3 className="flex items-center gap-1.5 text-sm font-bold">
                <KeyRound className="h-4 w-4" aria-hidden="true" />
                {t('ভেন্ডর প্যানেলে কী কী করতে পারবে', 'What this vendor may do in their panel')}
              </h3>
              <p className="mt-0.5 text-[11px] text-muted">
                {t(
                  'বন্ধ রাখা সুবিধা ভেন্ডর সার্ভার-সাইডে ব্যবহার করতে পারবে না, শুধু বাটন লুকানো নয়।',
                  'Disabled capabilities are enforced server-side — not merely hidden in the UI.'
                )}
              </p>
            </div>

            <ul className="divide-y divide-border">
              {booleanKeys.map((key) => {
                const label = snapshot.capabilityLabels.find((item) => item.key === key);
                if (!label) return null;
                const enabled = draft[key] === true;
                return (
                  <li key={key} className="flex items-start justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-ink">{t(label.labelBn, label.labelEn)}</p>
                      <p className="text-[11px] text-muted">{t(label.hintBn, label.hintEn)}</p>
                    </div>
                    <button
                      type="button"
                      role="switch"
                      aria-checked={enabled}
                      aria-label={t(label.labelBn, label.labelEn)}
                      onClick={() => toggle(key)}
                      className={cn(
                        'flex min-h-[36px] min-w-[64px] shrink-0 items-center justify-center gap-1 rounded-[var(--radius-md)] border px-2 text-[11px] font-bold',
                        enabled ? 'border-success bg-bg text-success' : 'border-danger bg-bg text-danger'
                      )}
                    >
                      {enabled ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                      {enabled ? t('চালু', 'On') : t('বন্ধ', 'Off')}
                    </button>
                  </li>
                );
              })}
            </ul>

            <label className="block space-y-1 text-xs font-medium">
              <span>{t('সর্বোচ্চ পণ্য সংখ্যা (০ = সীমাহীন)', 'Maximum products (0 = unlimited)')}</span>
              <input
                className={inputCls}
                inputMode="numeric"
                value={maxProducts}
                onChange={(e) => setMaxProducts(e.target.value.replace(/\D/g, ''))}
              />
            </label>

            <label className="block space-y-1 text-xs font-medium">
              <span>{t('ভেন্ডরকে দেখানো নোট (ঐচ্ছিক)', 'Note shown to the vendor (optional)')}</span>
              <input
                className={inputCls}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={t('যেমন: পেআউট যাচাই চলছে, সাময়িকভাবে বন্ধ', 'e.g. Payout verification in progress, temporarily off')}
              />
            </label>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="primary"
                isLoading={busy}
                leftIcon={<Save className="h-4 w-4" aria-hidden="true" />}
                onClick={() =>
                  void post(
                    {
                      operation: 'set_capabilities',
                      vendorId: selected.vendorId,
                      capabilities: { ...draft, maxActiveProducts: Number(maxProducts) || 0 },
                      restrictionNoteBn: note.trim() || undefined,
                    },
                    { bn: 'ভেন্ডর প্যানেলের অনুমতি আপডেট হয়েছে।', en: 'Vendor permissions updated.' }
                  )
                }
              >
                {t('শক্তি প্রয়োগ করুন', 'Apply permissions')}
              </Button>
              <Button
                variant="outline"
                isLoading={busy}
                onClick={() =>
                  void post(
                    { operation: 'reset_capabilities', vendorId: selected.vendorId },
                    { bn: 'ডিফল্ট অনুমতিতে ফিরিয়ে নেওয়া হয়েছে।', en: 'Reset to default permissions.' }
                  )
                }
              >
                {t('ডিফল্টে ফেরান', 'Reset to default')}
              </Button>
            </div>

            <div className="rounded-[var(--radius-md)] border border-border bg-bg p-2 text-[11px]">
              <p className="mb-1 flex items-center gap-1 font-semibold text-ink">
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                {t('ভেন্ডর এখন যা দেখবে', 'What the vendor currently sees')}
              </p>
              <ul className="flex flex-wrap gap-1">
                {Object.entries(selected.capabilities)
                  .filter(([key]) => key !== 'maxActiveProducts')
                  .map(([key, value]) => {
                    const label = snapshot.capabilityLabels.find((item) => item.key === key);
                    return (
                      <li key={key}>
                        <Badge status={value ? 'success' : 'danger'}>
                          {label ? t(label.labelBn, label.labelEn) : key}
                        </Badge>
                      </li>
                    );
                  })}
              </ul>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 3. REQUESTS: vendor-filed profile / onboarding changes
// ---------------------------------------------------------------------------

function RequestsSection({
  snapshot,
  busy,
  t,
  post,
}: {
  snapshot: AdminVendorControlSnapshot;
  busy: boolean;
  t: (b: string, e: string) => string;
  post: (body: Record<string, unknown>, success: { bn: string; en: string }) => Promise<boolean>;
}) {
  if (snapshot.requests.length === 0) {
    return (
      <EmptyState
        icon={<ClipboardCheck className="h-6 w-6" aria-hidden="true" />}
        title={t('কোনো অনুরোধ নেই', 'No requests')}
        description={t(
          'ভেন্ডর প্রোফাইল বা পেআউট অ্যাকাউন্ট বদলাতে চাইলে অনুরোধ এখানে আসবে।',
          'Vendor profile and payout-account change requests arrive here.'
        )}
      />
    );
  }

  return (
    <div className="space-y-2">
      {snapshot.requests.map((request) => (
        <RequestRow key={request.requestId} request={request} busy={busy} t={t} post={post} />
      ))}
    </div>
  );
}

const FIELD_BN: Record<string, string> = {
  businessNameBn: 'ব্যবসার নাম (বাংলা)',
  businessNameEn: 'ব্যবসার নাম (ইংরেজি)',
  ownerNameBn: 'মালিকের নাম',
  contactPhone: 'যোগাযোগ নম্বর',
  payoutMethodBn: 'পেআউট পদ্ধতি',
  payoutAccountNo: 'পেআউট অ্যাকাউন্ট',
  answers15: 'অনবোর্ডিং উত্তর',
};

function RequestRow({
  request,
  busy,
  t,
  post,
}: {
  request: AdminVendorRequestDTO;
  busy: boolean;
  t: (b: string, e: string) => string;
  post: (body: Record<string, unknown>, success: { bn: string; en: string }) => Promise<boolean>;
}) {
  const [note, setNote] = React.useState('');
  const isPending = request.status === 'pending_review';

  return (
    <Card surface="surface" padding="sm" className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge status={request.status === 'approved' ? 'success' : request.status === 'rejected' ? 'danger' : 'warning'}>
          {request.status === 'approved' ? t('অনুমোদিত', 'Approved') : request.status === 'rejected' ? t('প্রত্যাখ্যাত', 'Rejected') : t('অপেক্ষমাণ', 'Pending')}
        </Badge>
        <span className="font-bold">{request.vendorNameBn}</span>
        <span className="font-mono text-[10px] text-muted">{request.vendorCode}</span>
        <span className="text-[11px] text-muted">
          {request.kind === 'profile_update' ? t('প্রোফাইল পরিবর্তন', 'Profile change') : t('অনবোর্ডিং উত্তর', 'Onboarding answers')}
        </span>
        <span className="ml-auto text-[10px] text-muted">{new Date(request.createdAt).toLocaleString()}</span>
      </div>

      <dl className="grid gap-1 text-[11px] sm:grid-cols-2">
        {Object.entries(request.payload).map(([key, value]) => (
          <div key={key} className="min-w-0 sm:col-span-2">
            <dt className="font-semibold text-muted">{t(FIELD_BN[key] ?? key, key)}:</dt>
            <dd className="min-w-0 whitespace-pre-wrap break-words text-ink">
              {key === 'answers15' && typeof value === 'object' && value !== null && !Array.isArray(value)
                ? <dl className="mt-1 space-y-2">{Object.entries(value).map(([question, answer]) => <div key={question}><dt className="font-semibold">{question}</dt><dd className="whitespace-pre-wrap break-words">{String(answer)}</dd></div>)}</dl>
                : typeof value === 'object' && value !== null ? JSON.stringify(value) : String(value)}
            </dd>
          </div>
        ))}
      </dl>

      {request.reviewNoteBn && (
        <p className="text-[11px] text-muted">
          {t('রিভিউ নোট', 'Review note')}: {request.reviewNoteBn}
        </p>
      )}

      {isPending && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="min-w-[200px] flex-1 space-y-1 text-[11px] font-medium">
            <span>{t('নোট (প্রত্যাখ্যানে আবশ্যক)', 'Note (required to reject)')}</span>
            <input className={inputCls} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <Button
            variant="primary"
            size="sm"
            isLoading={busy}
            leftIcon={<CheckCircle2 className="h-4 w-4" aria-hidden="true" />}
            onClick={() =>
              void post(
                { operation: 'decide_vendor_request', requestId: request.requestId, decision: 'approve', reviewNoteBn: note.trim() || undefined },
                { bn: 'অনুরোধ অনুমোদিত হয়েছে।', en: 'Request approved.' }
              )
            }
          >
            {t('অনুমোদন', 'Approve')}
          </Button>
          <Button
            variant="danger"
            size="sm"
            isLoading={busy}
            leftIcon={<XCircle className="h-4 w-4" aria-hidden="true" />}
            onClick={() =>
              void post(
                { operation: 'decide_vendor_request', requestId: request.requestId, decision: 'reject', reviewNoteBn: note.trim() },
                { bn: 'অনুরোধ প্রত্যাখ্যান করা হয়েছে।', en: 'Request rejected.' }
              )
            }
          >
            {t('প্রত্যাখ্যান', 'Reject')}
          </Button>
        </div>
      )}
    </Card>
  );
}

export default VendorControlPanel;
