'use client';
import { localizedField } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/admin/phase6-ops-panel.tsx
// Phase 6 (Module S): Live Operations, Abandoned Cart Recovery & Customer 360 CRM,
// Courier Webhook & Bulk CSV Reconciliation, Verified Review Moderation & Vendor Scorecard,
// and Full System SHA-256 Disaster Recovery Snapshot Center

import * as React from 'react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import {
  ShoppingCart,
  Users,
  Webhook,
  FileSpreadsheet,
  Star,
  Award,
  DatabaseBackup,
  CheckCircle2,
  AlertCircle,
  Send,
  MessageSquare,
  RefreshCw,
  Download,
  Copy,
  Check,
  ShieldCheck,
  ArrowRight,
  Truck,
} from 'lucide-react';
import type { CourierProvider } from '@/types/database.types';
import type {
  BulkCsvReconciliationResultDTO,
  Phase6WorkspaceOverviewDTO,
} from '@/lib/admin/phase6-service';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { Badge, Button, Input } from '../ui/primitives';

export interface Phase6LiveOpsPanelProps {
  locale: 'bn' | 'en';
  overview: Phase6WorkspaceOverviewDTO;
  availableOrderNos: string[];
  onRefreshWorkspace: () => Promise<void>;
}

type Phase6SubTab =
  | 'abandoned_crm'
  | 'webhook_csv'
  | 'reviews_scorecard'
  | 'backup_restore';

export function Phase6LiveOpsPanel({
  locale,
  overview,
  availableOrderNos,
  onRefreshWorkspace,
}: Phase6LiveOpsPanelProps) {
  const [activeSubTab, setActiveSubTab] =
    React.useState<Phase6SubTab>('abandoned_crm');
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [isBusy, setIsBusy] = React.useState(false);

  // Webhook Simulator State
  const [whProvider, setWhProvider] =
    React.useState<CourierProvider>('steadfast');
  const [whOrderNo, setWhOrderNo] = React.useState<string>(
    availableOrderNos[0] ?? 'ORD-261106-0001'
  );
  const [whRawStatus, setWhRawStatus] = React.useState<
    'delivered' | 'partial_delivered' | 'returned' | 'in_transit' | 'hold'
  >('delivered');

  // Bulk CSV Remittance Reconciliation State
  const [csvProvider, setCsvProvider] =
    React.useState<CourierProvider>('steadfast');
  const [csvBatchRef, setCsvBatchRef] = React.useState<string>(
    `STF-BATCH-${new Date().toISOString().slice(5, 10).replace('-', '')}`
  );
  const [csvInputText, setCsvInputText] = React.useState<string>(
    'order_no,consignment_id,remitted_bdt,courier_fee_bdt\nORD-261106-0001,CNS-ORD-261106-0001,2380,70\nORD-261106-0002,CNS-ORD-261106-0002,1340,120'
  );
  const [csvReconResult, setCsvReconResult] =
    React.useState<BulkCsvReconciliationResultDTO | null>(null);
  const [copiedBookingCsv, setCopiedBookingCsv] = React.useState(false);

  const pendingCartsCount = overview.abandonedCarts.filter(
    (c) => !c.isRecovered
  ).length;
  const recoveredCartsCount = overview.abandonedCarts.filter(
    (c) => c.isRecovered
  ).length;
  const pendingReviewsCount = overview.moderatedReviews.filter(
    (r) => r.moderationStatus === 'pending'
  ).length;

  const handleConvertCartToOrder = async (cartId: string) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'recover_abandoned_cart',
          cartId,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        orderNo?: string;
        errorBn?: string;
      };
      if (data.success && data.orderNo) {
        setFeedback({
          type: 'success',
          message: `পরিত্যক্ত কার্ট সফলভাবে অর্ডার ${data.orderNo}-এ রূপান্তরিত হয়েছে এবং স্টক রিজার্ভ হয়েছে!`,
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          message: data.errorBn ?? 'কার্ট অর্ডারে রূপান্তর করা যায়নি।',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleRecordCartReminder = async (
    cartId: string,
    channel: 'wa_me' | 'sms_link'
  ) => {
    await fetch('/api/admin/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'record_cart_reminder',
        cartId,
        channel,
      }),
    });
    await onRefreshWorkspace();
  };

  const handleSimulateWebhook = async () => {
    setIsBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'simulate_courier_webhook',
          provider: whProvider,
          orderNo: whOrderNo,
          rawStatus: whRawStatus,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        event?: { summaryBn: string };
        errorBn?: string;
      };
      if (data.success && data.event) {
        setFeedback({
          type: 'success',
          message: data.event.summaryBn,
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          message: data.errorBn ?? 'ওয়েবহুক সিমুলেশন ব্যর্থ হয়েছে।',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleReconcileCsv = async () => {
    setIsBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'reconcile_courier_csv',
          provider: csvProvider,
          settlementBatchRef: csvBatchRef,
          csvText: csvInputText,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        result?: BulkCsvReconciliationResultDTO;
        errorBn?: string;
      };
      if (data.success && data.result) {
        setCsvReconResult(data.result);
        setFeedback({
          type: 'success',
          message: data.result.summaryBn,
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          message: data.errorBn ?? 'সিএসভি রিকনসিলিয়েশন ব্যর্থ হয়েছে।',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleModerateReview = async (
    reviewId: string,
    decision: 'approved' | 'rejected'
  ) => {
    setIsBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'moderate_product_review',
          reviewId,
          decision,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
      };
      if (data.success) {
        setFeedback({
          type: 'success',
          message:
            decision === 'approved'
              ? 'কাস্টমার রিভিউ অনুমোদিত (Approved) হয়েছে এবং প্রোডাক্ট রেটিং আপডেট হয়েছে।'
              : 'কাস্টমার রিভিউ প্রত্যাখ্যান (Rejected) করা হয়েছে।',
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          message: data.errorBn ?? 'রিভিউ মডারেট করা যায়নি।',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateSystemBackup = async () => {
    setIsBusy(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'create_system_backup_snapshot',
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        snapshot?: { snapshotId: string; sha256Checksum: string };
        errorBn?: string;
      };
      if (data.success && data.snapshot) {
        setFeedback({
          type: 'success',
          message: `নতুন ডিজাস্টার রিকভারি ব্যাকআপ স্ন্যাপশট (${data.snapshot.snapshotId}) সফলভাবে তৈরি হয়েছে!`,
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          message: data.errorBn ?? 'ব্যাকআপ স্ন্যাপশট তৈরি করা যায়নি।',
        });
      }
    } finally {
      setIsBusy(false);
    }
  };

  const handleCopyBookingCsv = () => {
    if (!overview.bookingCsvPreview) return;
    navigator.clipboard.writeText(overview.bookingCsvPreview);
    setCopiedBookingCsv(true);
    setTimeout(() => setCopiedBookingCsv(false), 2000);
  };

  const handleDownloadBookingCsv = () => {
    if (!overview.bookingCsvPreview) return;
    const blob = new Blob([overview.bookingCsvPreview], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `bongoconsign-courier-booking-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-6">
      {/* 1. Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Webhook className="w-5 h-5 text-ink" aria-hidden="true" />
            <h1 className="text-xl font-bold text-ink">
              {locale === 'bn'
                ? 'লাইভ অপারেশনস, কার্ট রিকভারি সিআরএম, কুরিয়ার ওয়েবহুক ও সিস্টেম ব্যাকআপ (Phase 6 — Module S)'
                : 'Live Operations, Cart Recovery CRM, Courier Webhooks & System Backup (Phase 6)'}
            </h1>
          </div>
          <p className="text-xs text-muted mt-1">
            {locale === 'bn'
              ? 'পরিত্যক্ত কার্ট ১-ক্লিক অর্ডারে রূপান্তর, কাস্টমার ৩৬০ ফ্রড ডিরেক্টরি, HMAC কুরিয়ার ওয়েবহুক ও বাল্ক সিএসভি রিকনসিলিয়েশন, ভেরিফায়েড রিভিউ মডারেশন এবং SHA-256 সিস্টেম স্ন্যাপশট।'
              : '1-click abandoned cart recovery, Customer 360 fraud directory, HMAC courier webhooks & CSV reconciliation, review moderation, and SHA-256 system snapshots.'}
          </p>
        </div>

        <Button
          size="sm"
          variant="secondary"
          onClick={() => void onRefreshWorkspace()}
          disabled={isBusy}
        >
          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
          <LocalizedText source={"ডেটা রিফ্রেশ করুন"} area="admin" />{" "}</Button>
      </div>

      {/* Feedback Banner */}
      {feedback && (
        <div
          className={`p-3 border rounded-[var(--radius-md)] flex items-center justify-between gap-2 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-success bg-surface text-ink'
              : 'border-danger bg-surface text-danger'
          }`}
          role="status"
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-success shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-danger shrink-0" />
            )}
            <span>{feedback.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-xs underline text-muted hover:text-ink cursor-pointer"
          >
            <LocalizedText source={"বন্ধ করুন"} area="admin" />{" "}</button>
        </div>
      )}

      {/* 2. Top KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-ink">
            <span><LocalizedText source={"পরিত্যক্ত কার্ট (Abandoned Carts)"} area="admin" /></span>
            <Badge status={pendingCartsCount > 0 ? 'warning' : 'success'}>
              {pendingCartsCount} {" "}<LocalizedText source={"অপেক্ষমাণ"} area="admin" />{" "}</Badge>
          </div>
          <p className="text-xl font-bold font-mono text-ink tabular-nums">
            {formatLocaleNumber(overview.abandonedCarts.length, locale)} {" "}<LocalizedText source={"টি কার্ট"} area="admin" />{" "}</p>
          <p className="text-[11px] text-muted">
            <LocalizedText source={"রিকভারড:"} area="admin" />{" "}{formatLocaleNumber(recoveredCartsCount, locale)} {" "}<LocalizedText source={"টি · ফ্রি wa.me / ১-ক্লিক অর্ডার"} area="admin" />{" "}</p>
        </div>

        <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-ink">
            <span><LocalizedText source={"কাস্টমার ৩৬০ ও ফ্রড প্রোফাইল"} area="admin" /></span>
            <Badge status="info"><LocalizedText source={"CRM"} area="admin" /></Badge>
          </div>
          <p className="text-xl font-bold font-mono text-ink tabular-nums">
            {formatLocaleNumber(overview.customers360.length, locale)} {" "}<LocalizedText source={"জন গ্রাহক"} area="admin" />{" "}</p>
          <p className="text-[11px] text-muted">
            <LocalizedText source={"ডেলিভারি সাকসেস রেট, রিপিট ব্যাজ ও রিস্ক স্কোর ট্র্যাকিং"} area="admin" />{" "}</p>
        </div>

        <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-ink">
            <span><LocalizedText source={"কুরিয়ার ওয়েবহুক ও সিএসভি সিঙ্ক"} area="admin" /></span>
            <Badge status="success"><LocalizedText source={"HMAC SHA-256"} area="admin" /></Badge>
          </div>
          <p className="text-xl font-bold font-mono text-ink tabular-nums">
            {formatLocaleNumber(overview.webhookEvents.length, locale)} {" "}<LocalizedText source={"টি ইভেন্ট"} area="admin" />{" "}</p>
          <p className="text-[11px] text-muted">
            <LocalizedText source={"POST /api/webhooks/courier + বাল্ক সিএসভি রিকনসিলিয়েশন"} area="admin" />{" "}</p>
        </div>

        <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-ink">
            <span><LocalizedText source={"রিভিউ ও ভেন্ডর স্কোরকার্ড"} area="admin" /></span>
            <Badge status={pendingReviewsCount > 0 ? 'warning' : 'success'}>
              {pendingReviewsCount} {" "}<LocalizedText source={"পেন্ডিং রিভিউ"} area="admin" />{" "}</Badge>
          </div>
          <p className="text-xl font-bold font-mono text-ink tabular-nums">
            {formatLocaleNumber(overview.vendorScorecards.length, locale)} {" "}<LocalizedText source={"জন ভেন্ডর"} area="admin" />{" "}</p>
          <p className="text-[11px] text-muted">
            <LocalizedText source={"ভেরিফায়েড পারচেজ রিভিউ ও ভেন্ডর SLA গ্রেডিং (A+..C)"} area="admin" />{" "}</p>
        </div>
      </div>

      {/* 3. Sub-Navigation Tabs */}
      <div className="border-b border-border flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('abandoned_crm')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'abandoned_crm'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <ShoppingCart className="w-4 h-4" />
          <span>
            <LocalizedText source={"১. পরিত্যক্ত কার্ট রিকভারি ও কাস্টমার সিআরএম ("} area="admin" />{overview.abandonedCarts.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('webhook_csv')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'webhook_csv'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Webhook className="w-4 h-4" />
          <span><LocalizedText source={"২. কুরিয়ার ওয়েবহুক ও বাল্ক সিএসভি রিকনসিলিয়েশন"} area="admin" /></span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('reviews_scorecard')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'reviews_scorecard'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>
            <LocalizedText source={"৩. রিভিউ মডারেশন ও ভেন্ডর স্কোরকার্ড ("} area="admin" />{overview.moderatedReviews.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('backup_restore')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'backup_restore'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <DatabaseBackup className="w-4 h-4" />
          <span>
            <LocalizedText source={"৪. ফুল সিস্টেম ব্যাকআপ স্ন্যাপশট ("} area="admin" />{overview.backupSnapshots.length})
          </span>
        </button>
      </div>

      {/* TAB 1: ABANDONED CART RECOVERY & CUSTOMER 360 CRM */}
      {activeSubTab === 'abandoned_crm' && (
        <div className="space-y-6">
          {/* Abandoned Carts List */}
          <div className="p-4 border border-border bg-bg rounded-[var(--radius-md)] space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <ShoppingCart className="w-4 h-4 text-ink" />
                  <span>
                    <LocalizedText source={"চেকআউট পরিত্যক্ত কার্ট রিকভারি কিউ (Abandoned Carts Recovery Engine)"} area="admin" />{" "}</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  <LocalizedText source={"চেকআউট পেজে ফোন নম্বর দেওয়ার পর যারা অর্ডার সম্পন্ন করেননি তাদের ফ্রি `wa.me` / `sms:` রিমাইন্ডার পাঠান অথবা ১-ক্লিকে কনফার্মড অর্ডারে রূপান্তর করুন।"} area="admin" />{" "}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {overview.abandonedCarts.map((cart) => (
                <div
                  key={cart.cartId}
                  className="p-4 border border-border bg-surface rounded-[var(--radius-md)] flex flex-col justify-between gap-3"
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-ink">
                          {cart.cartId}
                        </span>
                        <Badge
                          status={cart.isRecovered ? 'success' : 'warning'}
                        >
                          {cart.isRecovered
                            ? `Recovered (${cart.recoveredOrderNo})`
                            : 'Abandoned (অপেক্ষমাণ)'}
                        </Badge>
                      </div>
                      <span className="text-sm font-bold font-mono text-ink tabular-nums">
                        {formatPoishaToBdt(cart.subtotalPoisha, locale)}
                      </span>
                    </div>

                    <div>
                      <p className="text-sm font-bold text-ink">
                        {cart.customerName} ·{' '}
                        <span className="font-mono">{cart.customerPhone}</span>
                      </p>
                      <p className="text-xs text-muted">
                        <LocalizedText source={"জেলা:"} area="admin" />{" "}{localizedField(cart, "districtNameBn", locale)} — {cart.streetAddress}
                      </p>
                    </div>

                    <div className="p-2.5 border border-border bg-bg rounded-[var(--radius-sm)] space-y-1">
                      {cart.items.map((it, idx) => (
                        <div
                          key={`${cart.cartId}-it-${idx}`}
                          className="flex items-center justify-between text-xs text-ink"
                        >
                          <span>
                            {localizedField(it, "productNameBn", locale)} ({localizedField(it, "variantTitleBn", locale)}) ×{' '}
                            {it.quantity}
                          </span>
                          <span className="font-mono font-semibold tabular-nums">
                            {formatPoishaToBdt(
                              it.unitSalePricePoisha * it.quantity,
                              locale
                            )}
                          </span>
                        </div>
                      ))}
                    </div>

                    <p className="text-[11px] text-muted">
                      <LocalizedText source={"রিমাইন্ডার পাঠানো হয়েছে:"} area="admin" />{' '}
                      <strong className="text-ink">
                        {cart.reminderSentCount} {" "}<LocalizedText source={"বার"} area="admin" />{" "}</strong>
                      {cart.lastReminderSentAt
                        ? ` · সর্বশেষ: ${new Date(cart.lastReminderSentAt).toLocaleString('bn-BD')}`
                        : ''}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                    <div className="flex items-center gap-2">
                      <a
                        href={cart.waMeRecoveryLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          void handleRecordCartReminder(cart.cartId, 'wa_me')
                        }
                        className="px-3 py-1.5 text-xs font-semibold border border-border bg-bg text-ink rounded-[var(--radius-sm)] hover:bg-surface inline-flex items-center gap-1.5"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span><LocalizedText source={"wa.me রিকভারি"} area="admin" /></span>
                      </a>

                      <a
                        href={cart.smsRecoveryLink}
                        onClick={() =>
                          void handleRecordCartReminder(cart.cartId, 'sms_link')
                        }
                        className="px-3 py-1.5 text-xs font-semibold border border-border bg-bg text-ink rounded-[var(--radius-sm)] hover:bg-surface inline-flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span><LocalizedText source={"SMS অ্যাপ"} area="admin" /></span>
                      </a>
                    </div>

                    {!cart.isRecovered ? (
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={isBusy}
                        onClick={() => void handleConvertCartToOrder(cart.cartId)}
                      >
                        <ArrowRight className="w-3.5 h-3.5 mr-1" />
                        <LocalizedText source={"১-ক্লিক অর্ডারে রূপান্তর"} area="admin" />{" "}</Button>
                    ) : (
                      <span className="text-xs font-mono font-semibold text-success">
                        <LocalizedText source={"অর্ডার:"} area="admin" />{" "}{cart.recoveredOrderNo}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Customer 360 & Fraud Score Directory */}
          <div className="p-4 border border-border bg-bg rounded-[var(--radius-md)] space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Users className="w-4 h-4 text-ink" />
                  <span>
                    <LocalizedText source={"কাস্টমার ৩৬০, ডেলিভারি সাকসেস রেট ও ফ্রড স্কোর ডিরেক্টরি (Customer 360 CRM)"} area="admin" />{" "}</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  <LocalizedText source={"গ্রাহকের ফোন নম্বরভিত্তিক মোট অর্ডার, ডেলিভারি হার, রিটার্ন হিস্ট্রি, রিপিট কাস্টমার স্ট্যাটাস এবং ফ্রড রিস্ক স্কোর।"} area="admin" />{" "}</p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface text-muted">
                    <th className="py-2.5 px-3 font-semibold"><LocalizedText source={"গ্রাহক ও ফোন"} area="admin" /></th>
                    <th className="py-2.5 px-3 font-semibold"><LocalizedText source={"জেলা"} area="admin" /></th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"মোট অর্ডার"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"ডেলিভারড / রিটার্ন"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"ডেলিভারি হার"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"ফ্রড স্কোর"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"মোট ক্রয় (LTV)"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold"><LocalizedText source={"স্ট্যাটাস"} area="admin" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {overview.customers360.map((cust) => (
                    <tr key={cust.customerPhone} className="hover:bg-surface/60">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-ink">
                          {cust.customerName}
                        </div>
                        <div className="font-mono text-muted">
                          {cust.customerPhone}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-ink">
                        {localizedField(cust, "districtNameBn", locale)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-ink tabular-nums">
                        {cust.totalOrders}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        <span className="text-success font-semibold">
                          {cust.deliveredOrders}
                        </span>{' '}
                        /{' '}
                        <span className="text-danger font-semibold">
                          {cust.returnedOrders}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-ink tabular-nums">
                        {(cust.deliverySuccessRateBp / 100).toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold tabular-nums">
                        <span
                          className={
                            cust.fraudScore >= 70
                              ? 'text-danger'
                              : cust.fraudScore >= 40
                              ? 'text-warning'
                              : 'text-success'
                          }
                        >
                          {cust.fraudScore}/100
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-ink tabular-nums">
                        {formatPoishaToBdt(cust.lifetimeSpendPoisha, locale)}
                      </td>
                      <td className="py-2.5 px-3">
                        {cust.isBlacklisted ? (
                          <Badge status="danger"><LocalizedText source={"Blacklisted"} area="admin" /></Badge>
                        ) : cust.isRepeatCustomer ? (
                          <Badge status="success"><LocalizedText source={"Repeat Customer"} area="admin" /></Badge>
                        ) : (
                          <Badge status="neutral"><LocalizedText source={"Verified"} area="admin" /></Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: COURIER WEBHOOK & BULK CSV RECONCILIATION */}
      {activeSubTab === 'webhook_csv' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* HMAC Courier Webhook Simulator */}
            <div className="p-4 border border-border bg-bg rounded-[var(--radius-md)] space-y-4">
              <div className="border-b border-border pb-3">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Webhook className="w-4 h-4 text-ink" />
                  <span>
                    <LocalizedText source={"লাইভ কুরিয়ার ওয়েবহুক রিসিভার ও সিমুলেটর (POST /api/webhooks/courier)"} area="admin" />{" "}</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  <LocalizedText source={"Steadfast, Pathao বা RedX থেকে ওয়েবহুক পেলোড এলে স্বয়ংক্রিয়ভাবে অর্ডার স্ট্যাটাস, কুরিয়ার লেজার এবং ভেন্ডর এসক্রো (`Pending → Locked`) আপডেট হয়।"} area="admin" />{" "}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    <LocalizedText source={"কুরিয়ার প্রোভাইডার"} area="admin" />{" "}</label>
                  <select
                    value={whProvider}
                    onChange={(e) =>
                      setWhProvider(e.target.value as CourierProvider)
                    }
                    className="w-full h-10 px-3 text-xs border border-border rounded-[var(--radius-md)] bg-surface text-ink"
                  >
                    <option value="steadfast"><LocalizedText source={"Steadfast Courier"} area="admin" /></option>
                    <option value="pathao"><LocalizedText source={"Pathao Hermes"} area="admin" /></option>

                    <option value="bd_post"><LocalizedText source={"BD Post Office"} area="admin" /></option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    <LocalizedText source={"টার্গেট অর্ডার নম্বর"} area="admin" />{" "}</label>
                  <select
                    value={whOrderNo}
                    onChange={(e) => setWhOrderNo(e.target.value)}
                    className="w-full h-10 px-3 text-xs border border-border rounded-[var(--radius-md)] bg-surface text-ink font-mono"
                  >
                    {availableOrderNos.map((no) => (
                      <option key={no} value={no}>
                        {no}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    <LocalizedText source={"ওয়েবহুক ইভেন্ট স্ট্যাটাস"} area="admin" />{" "}</label>
                  <select
                    value={whRawStatus}
                    onChange={(e) =>
                      setWhRawStatus(
                        e.target.value as
                          | 'delivered'
                          | 'partial_delivered'
                          | 'returned'
                          | 'in_transit'
                          | 'hold'
                      )
                    }
                    className="w-full h-10 px-3 text-xs border border-border rounded-[var(--radius-md)] bg-surface text-ink"
                  >
                    <option value="delivered"><LocalizedText source={"delivered (ডেলিভারড)"} area="admin" /></option>
                    <option value="partial_delivered">
                      <LocalizedText source={"partial_delivered (আংশিক ডেলিভারি)"} area="admin" />{" "}</option>
                    <option value="in_transit"><LocalizedText source={"in_transit (ইন-ট্রানজিট)"} area="admin" /></option>
                    <option value="returned"><LocalizedText source={"returned (রিটার্নড)"} area="admin" /></option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] font-mono text-muted">
                  ওয়েবহুক ইন্টিগ্রেশন চালু নেই / Webhook integration unavailable{" "}</span>
                <Button
                  size="sm"
                  variant="primary"
                  disabled
                  title="ওয়েবহুক চালু নেই / Webhook unavailable"
                  onClick={() => void handleSimulateWebhook()}
                >
                  <Truck className="w-3.5 h-3.5 mr-1.5" />
                  <LocalizedText source={"ওয়েবহুক ইভেন্ট ফায়ার করুন"} area="admin" />{" "}</Button>
              </div>

              {/* Recent Webhook Events */}
              <div className="space-y-2 pt-3 border-t border-border">
                <h3 className="text-xs font-bold text-ink">
                  <LocalizedText source={"সাম্প্রতিক কুরিয়ার ওয়েবহুক লগ ("} area="admin" />{overview.webhookEvents.length})
                </h3>
                <div className="space-y-2 max-h-56 overflow-y-auto">
                  {overview.webhookEvents.map((ev) => (
                    <div
                      key={ev.webhookId}
                      className="p-2.5 border border-border bg-surface rounded-[var(--radius-sm)] text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-bold text-ink">
                          {ev.orderNo} · {ev.provider.toUpperCase()}
                        </span>
                        <Badge
                          status={
                            ev.mappedStatus === 'delivered'
                              ? 'success'
                              : ev.mappedStatus === 'returned'
                              ? 'danger'
                              : 'info'
                          }
                        >
                          {ev.rawStatus} → {ev.mappedStatus}
                        </Badge>
                      </div>
                      <p className="text-muted">{ev.summaryBn}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Bulk CSV Courier Remittance Reconciliation */}
            <div className="p-4 border border-border bg-bg rounded-[var(--radius-md)] space-y-4">
              <div className="border-b border-border pb-3">
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-ink" />
                  <span>
                    <LocalizedText source={"বাল্ক কুরিয়ার রেমিট্যান্স সিএসভি রিকনসিলিয়েশন ও শর্ট-পেমেন্ট ডিটেক্টর"} area="admin" />{" "}</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  <LocalizedText source={"কুরিয়ারের পেমেন্ট শিট থেকে `order_no,consignment_id,remitted_bdt,courier_fee_bdt` পেস্ট করে এক ক্লিকে সব অর্ডারের সিওডি নিষ্পত্তি ও শর্ট-পেমেন্ট যাচাই করুন।"} area="admin" />{" "}</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-ink mb-1">
                    <LocalizedText source={"কুরিয়ার প্রোভাইডার"} area="admin" />{" "}</label>
                  <select
                    value={csvProvider}
                    onChange={(e) =>
                      setCsvProvider(e.target.value as CourierProvider)
                    }
                    className="w-full h-10 px-3 text-xs border border-border rounded-[var(--radius-md)] bg-surface text-ink"
                  >
                    <option value="steadfast"><LocalizedText source={"Steadfast Courier"} area="admin" /></option>
                    <option value="pathao"><LocalizedText source={"Pathao Hermes"} area="admin" /></option>

                    <option value="bd_post"><LocalizedText source={"BD Post Office"} area="admin" /></option>
                  </select>
                </div>

                <Input
                  label="সেটেলমেন্ট ব্যাচ রেফারেন্স"
                  value={csvBatchRef}
                  onChange={(e) => setCsvBatchRef(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-ink mb-1">
                  <LocalizedText source={"রেমিট্যান্স সিএসভি রো সমূহ (order_no,consignment_id,remitted_bdt,courier_fee_bdt)"} area="admin" />{" "}</label>
                <textarea
                  rows={4}
                  value={csvInputText}
                  onChange={(e) => setCsvInputText(e.target.value)}
                  className="w-full p-2.5 text-xs font-mono border border-border rounded-[var(--radius-md)] bg-surface text-ink"
                />
              </div>

              <div className="flex items-center justify-end">
                <Button
                  size="sm"
                  variant="primary"
                  disabled
                  title="রেমিট্যান্স রিকনসিলিয়েশন বন্ধ / Remittance reconciliation unavailable"
                  onClick={() => void handleReconcileCsv()}
                >
                  <CheckCircle2 className="w-3.5 h-3.5 mr-1.5" />
                  <LocalizedText source={"বাল্ক সিএসভি রিকনসাইল করুন"} area="admin" />{" "}</Button>
              </div>

              {csvReconResult && (
                <div className="p-3 border border-border bg-surface rounded-[var(--radius-sm)] text-xs space-y-1">
                  <p className="font-bold text-ink">
                    {csvReconResult.summaryBn}
                  </p>
                  <p className="font-mono text-muted">
                    <LocalizedText source={"Expected COD:"} area="admin" />{' '}
                    {formatPoishaToBdt(
                      csvReconResult.totalExpectedCodPoisha,
                      locale
                    )}{' '}
                    <LocalizedText source={"| Remitted:"} area="admin" />{' '}
                    {formatPoishaToBdt(
                      csvReconResult.totalRemittedPoisha,
                      locale
                    )}{' '}
                    <LocalizedText source={"| Short-Payment:"} area="admin" />{' '}
                    {formatPoishaToBdt(
                      csvReconResult.totalShortPaymentPoisha,
                      locale
                    )}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Bulk Courier Booking CSV Export Preview */}
          <div className="p-4 border border-border bg-bg rounded-[var(--radius-md)] space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <div>
                <h3 className="text-sm font-bold text-ink">
                  <LocalizedText source={"বাল্ক কুরিয়ার বুকিং সিএসভি এক্সপোর্ট (Steadfast / Pathao / RedX Bulk Upload Sheet)"} area="admin" />{" "}</h3>
                <p className="text-xs text-muted">
                  <LocalizedText source={"এপিআই কী সংযুক্ত না থাকলেও এই সিএসভি ফাইলটি ডাউনলোড করে সরাসরি কুরিয়ার পোর্টালে বাল্ক আপলোড করা যাবে।"} area="admin" />{" "}</p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={handleCopyBookingCsv}
                >
                  {copiedBookingCsv ? (
                    <Check className="w-3.5 h-3.5 mr-1.5 text-success" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                  )}
                  {copiedBookingCsv ? 'কপি হয়েছে' : 'CSV কপি করুন'}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  onClick={handleDownloadBookingCsv}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" />
                  <LocalizedText source={".CSV ডাউনলোড করুন"} area="admin" />{" "}</Button>
              </div>
            </div>
            <pre className="p-3 border border-border bg-surface rounded-[var(--radius-sm)] text-[11px] font-mono text-ink overflow-x-auto max-h-44">
              {overview.bookingCsvPreview}
            </pre>
          </div>
        </div>
      )}

      {/* TAB 3: PRODUCT REVIEW MODERATION & VENDOR SCORECARD */}
      {activeSubTab === 'reviews_scorecard' && (
        <div className="space-y-6">
          {/* Review Moderation Queue */}
          <div className="p-4 border border-border bg-bg rounded-[var(--radius-md)] space-y-4">
            <div className="border-b border-border pb-3">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <Star className="w-4 h-4 text-ink" />
                <span>
                  <LocalizedText source={"ভেরিফায়েড পারচেজ প্রোডাক্ট রিভিউ মডারেশন কিউ (Customer Review Moderation)"} area="admin" />{" "}</span>
              </h2>
              <p className="text-xs text-muted mt-0.5">
                <LocalizedText source={"ডেলিভারিকৃত অর্ডারের বিপরীতে জমা হওয়া কাস্টমার রিভিউ যাচাই করে স্টোরফ্রন্টে প্রকাশের জন্য অনুমোদন বা প্রত্যাখ্যান করুন।"} area="admin" />{" "}</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {overview.moderatedReviews.map((rev) => (
                <div
                  key={rev.reviewId}
                  className="p-3.5 border border-border bg-surface rounded-[var(--radius-md)] flex flex-col justify-between gap-3"
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-ink">
                        {localizedField(rev, "productNameBn", locale)}{' '}
                        <span className="font-mono text-muted">
                          ({rev.publicSku})
                        </span>
                      </span>
                      <Badge
                        status={
                          rev.moderationStatus === 'approved'
                            ? 'success'
                            : rev.moderationStatus === 'rejected'
                            ? 'danger'
                            : 'warning'
                        }
                      >
                        {rev.moderationStatus.toUpperCase()}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-ink">
                        {rev.customerName}
                      </span>
                      <span>·</span>
                      <span className="font-mono font-bold text-ink">
                        <LocalizedText source={"রেটিং:"} area="admin" />{" "}{rev.rating} / 5
                      </span>
                      {rev.isVerifiedPurchase && (
                        <>
                          <span>·</span>
                          <span className="text-success font-semibold">
                            <LocalizedText source={"Verified Purchase"} area="admin" />{" "}</span>
                        </>
                      )}
                    </div>

                    <p className="text-xs text-ink bg-bg p-2.5 border border-border rounded-[var(--radius-sm)]">
                      {rev.comment}
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <span className="text-[11px] text-muted">
                      <LocalizedText source={"তারিখ:"} area="admin" />{' '}
                      {new Date(rev.createdAt).toLocaleDateString('bn-BD')}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant={
                          rev.moderationStatus === 'approved'
                            ? 'primary'
                            : 'secondary'
                        }
                        disabled={isBusy}
                        onClick={() =>
                          void handleModerateReview(rev.reviewId, 'approved')
                        }
                      >
                        <LocalizedText source={"অনুমোদন (Approve)"} area="admin" />{" "}</Button>
                      <Button
                        size="sm"
                        variant="secondary"
                        disabled={isBusy}
                        onClick={() =>
                          void handleModerateReview(rev.reviewId, 'rejected')
                        }
                      >
                        <LocalizedText source={"প্রত্যাখ্যান (Reject)"} area="admin" />{" "}</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Consignment Vendor Performance Scorecard */}
          <div className="p-4 border border-border bg-bg rounded-[var(--radius-md)] space-y-3">
            <div className="border-b border-border pb-3">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <Award className="w-4 h-4 text-ink" />
                <span>
                  <LocalizedText source={"কনসাইনমেন্ট ভেন্ডর পারফরম্যান্স ও কোয়ালিটি স্কোরকার্ড (Vendor SLA Scorecard)"} area="admin" />{" "}</span>
              </h2>
              <p className="text-xs text-muted mt-0.5">
                <LocalizedText source={"প্রতিটি ভেন্ডরের বিক্রিত ইউনিট, ডিফেক্ট রিটার্ন হার (Basis Points), গ্রস বিক্রয়, ভেন্ডর প্রাপ্য ও প্ল্যাটফর্ম মার্জিন অবদান।"} area="admin" />{" "}</p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-surface text-muted">
                    <th className="py-2.5 px-3 font-semibold"><LocalizedText source={"ভেন্ডর"} area="admin" /></th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"পণ্য সংখ্যা"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"বিক্রিত ইউনিট"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"রিটার্ন হার"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"গ্রস বিক্রয়"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"ভেন্ডর নিট প্রাপ্য"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <LocalizedText source={"প্ল্যাটফর্ম মার্জিন"} area="admin" />{" "}</th>
                    <th className="py-2.5 px-3 font-semibold text-center">
                      <LocalizedText source={"SLA গ্রেড"} area="admin" />{" "}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {overview.vendorScorecards.map((sc) => (
                    <tr key={sc.vendorId} className="hover:bg-surface/60">
                      <td className="py-2.5 px-3">
                        <div className="font-bold text-ink">
                          {localizedField(sc, "businessNameBn", locale)}{' '}
                          <span className="font-mono text-muted">
                            ({sc.vendorCode})
                          </span>
                        </div>
                        <div className="text-muted"><LocalizedText source={"মালিক:"} area="admin" />{" "}{localizedField(sc, "ownerNameBn", locale)}</div>
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-ink tabular-nums">
                        {sc.activeProductsCount}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-bold text-ink tabular-nums">
                        {sc.totalUnitsSold}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                        {(sc.returnRateBp / 100).toFixed(1)}%
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-ink tabular-nums">
                        {formatPoishaToBdt(sc.grossSalesPoisha, locale)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-success tabular-nums">
                        {formatPoishaToBdt(sc.netVendorPayablePoisha, locale)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-ink tabular-nums">
                        {formatPoishaToBdt(
                          sc.platformMarginGeneratedPoisha,
                          locale
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          status={
                            sc.slaGrade === 'A+' || sc.slaGrade === 'A'
                              ? 'success'
                              : sc.slaGrade === 'B'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          <LocalizedText source={"Grade"} area="admin" />{" "}{sc.slaGrade}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: FULL SYSTEM DISASTER RECOVERY SNAPSHOT & SHA-256 CHECKSUM */}
      {activeSubTab === 'backup_restore' && (
        <div className="p-4 border border-border bg-bg rounded-[var(--radius-md)] space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <DatabaseBackup className="w-4 h-4 text-ink" />
                <span>
                  <LocalizedText source={"ফুল সিস্টেম ডিজাস্টার রিকভারি স্ন্যাপশট ও SHA-256 ইন্টেগ্রিটি ভল্ট"} area="admin" />{" "}</span>
              </h2>
              <p className="text-xs text-muted mt-0.5">
                <LocalizedText source={"অর্ডার, ভেন্ডর এসক্রো লেজার, প্রোডাক্ট ভ্যারিয়েন্ট, এক্সপেন্স এবং অডিট লগের অপরিবর্তনীয় চেকসাম ব্যাকআপ তৈরি ও যাচাই করুন।"} area="admin" />{" "}</p>
            </div>

            <Button
              size="sm"
              variant="primary"
              disabled={isBusy}
              onClick={() => void handleCreateSystemBackup()}
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
              <LocalizedText source={"নতুন SHA-256 ব্যাকআপ স্ন্যাপশট তৈরি করুন"} area="admin" />{" "}</Button>
          </div>

          <div className="space-y-3">
            {overview.backupSnapshots.map((snap) => (
              <div
                key={snap.snapshotId}
                className="p-3.5 border border-border bg-surface rounded-[var(--radius-md)] flex flex-wrap items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-ink">
                      {snap.snapshotId}
                    </span>
                    <Badge status="success"><LocalizedText source={"SHA-256 VERIFIED"} area="admin" /></Badge>
                    <span className="text-muted">
                      <LocalizedText source={"তৈরি করেছেন: @"} area="admin" />{snap.createdByUsername} ·{' '}
                      {new Date(snap.createdAt).toLocaleString('bn-BD')}
                    </span>
                  </div>
                  <p className="font-mono text-[11px] text-muted break-all">
                    <LocalizedText source={"SHA-256:"} area="admin" />{" "}{snap.sha256Checksum}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-4 font-mono text-xs text-ink tabular-nums">
                  <span><LocalizedText source={"Orders:"} area="admin" />{" "}{snap.totalOrdersCount}</span>
                  <span><LocalizedText source={"Products:"} area="admin" />{" "}{snap.totalProductsCount}</span>
                  <span><LocalizedText source={"Vendors:"} area="admin" />{" "}{snap.totalVendorsCount}</span>
                  <span><LocalizedText source={"Ledger:"} area="admin" />{" "}{snap.totalLedgerEntriesCount}</span>
                  <span>
                    <LocalizedText source={"Size:"} area="admin" />{" "}{(snap.payloadSizeBytes / 1024).toFixed(1)} {" "}<LocalizedText source={"KB"} area="admin" />{" "}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
