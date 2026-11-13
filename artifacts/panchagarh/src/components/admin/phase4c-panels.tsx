'use client';
import { StorefrontContentPanel } from './storefront-content-panel';
import { localizedField } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/admin/phase4c-panels.tsx
// Phase 4C Admin ERP UI Panels:
//   1. FinanceProduct360AndExpensesPanel (Module F, G & M: Money Map, Auto Net Profit, ROAS/CPO, Expenses, Promo Engine, Product 360 & QC Stock Receipt)
//   2. MessagingAutomationAndSheetsPanel (Module H, I, J & K: Bilingual Message Templates, Trigger Matrix, Customer Blacklist, Automation Rules & Kill-Switch, Google Sheets One-Way Mirror + Code.gs)
//   3. SuperAdminControlCenterPanel (Module L & R: Dynamic Branding, Maintenance Mode, Masked Credentials Vault, Scheduled Cron Jobs & Backup Export)

import * as React from 'react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import {
  TrendingUp,
  Package,
  Tag,
  MessageSquare,
  Zap,
  FileSpreadsheet,
  ShieldAlert,
  KeyRound,
  Settings,
  Play,
  Copy,
  Check,
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  Download,
  Lock,
} from 'lucide-react';
import type { OrderSource } from '@/types/database.types';
import type { PromoRuleInput } from '@/types/domain';
import type {
  AboutContactPageSettings,
  CustomerInquiryRecord,
  SiteSettingsRecord,
} from '@/lib/db/repository';
import type {
  AutomationExecutionLogRecord,
  AutomationRuleRecord,
  ExpenseCategoryKey,
  ExpenseLedgerRecord,
  IntegrationCredentialKey,
  MaskedCredentialStatusDTO,
  MessageDispatchLogRecord,
  MessageEventKey,
  MessageTemplateRecord,
  MoneyMapAndPnlDTO,
  Product360VariantDTO,
  ScheduledJobRecord,
  SheetsSyncJobRecord,
} from '@/lib/admin/phase4c-service';
import { formatPoishaToBdt, takaToPoisha } from '@/lib/money';
import { Badge, Button, Card, Input } from '../ui/primitives';

type SupportedLocale = 'bn' | 'en';

const CLIENT_GOOGLE_APPS_SCRIPT_CODE_GS = `/**
 * BongoConsign ERP — Google Sheets One-Way Mirror Webhook (Code.gs)
 * সতর্কতা: এই শিটটি শুধুমাত্র One-Way Mirror। শিটে কোনো পরিবর্তন করলে তা মূল অ্যাপে ফেরত যাবে না।
 */
const SHARED_SECRET = 'REPLACE_WITH_YOUR_BONGOCONSIGN_SYNC_SECRET';

function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    if (payload.secret !== SHARED_SECRET) {
      return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'Unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const tabs = payload.tabs || {};
    Object.keys(tabs).forEach(function(tabName) {
      let sheet = ss.getSheetByName(tabName);
      if (!sheet) {
        sheet = ss.insertSheet(tabName);
      }
      if (payload.mode === 'full_resync') {
        sheet.clearContents();
      }
      const rows = tabs[tabName] || [];
      if (rows.length > 0) {
        sheet.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
      }
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true, syncedAt: new Date().toISOString() }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}`;

// ============================================================================
// 1. FINANCE, MONEY MAP, AUTO NET PROFIT, ROAS/CPO, PROMO & PRODUCT 360 PANEL
// ============================================================================

export interface FinanceProduct360AndExpensesPanelProps {
  locale: SupportedLocale;
  isSuperAdmin: boolean;
  isVendor: boolean;
  roleSlug: string;
  product360: Product360VariantDTO[];
  moneyMapPnl: MoneyMapAndPnlDTO | null;
  expenses: ExpenseLedgerRecord[];
  promoCodes: PromoRuleInput[];
  onRefreshWorkspace: () => Promise<void>;
}

export function FinanceProduct360AndExpensesPanel({
  locale,
  isSuperAdmin,
  isVendor,
  roleSlug,
  product360,
  moneyMapPnl,
  expenses,
  promoCodes,
  onRefreshWorkspace,
}: FinanceProduct360AndExpensesPanelProps) {
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Consignment QC Stock Receipt State
  const [qcVariantId, setQcVariantId] = React.useState<string>(
    product360[0]?.variantId ?? '00000000-0000-4000-8000-000000000201'
  );
  const [qcReceivedQty, setQcReceivedQty] = React.useState<string>('15');
  const [qcRejectedQty, setQcRejectedQty] = React.useState<string>('0');
  const [qcProofUrl, setQcProofUrl] = React.useState<string>(
    'https://picsum.photos/seed/qcproof2026/600/400'
  );
  const [qcNoteBn, setQcNoteBn] = React.useState<string>(
    'লট #১২ কিউসি পাস — তাঁত ও জামদানি ভ্যারিয়েন্ট গুদামে গ্রহণ'
  );
  const [submittingQc, setSubmittingQc] = React.useState(false);

  // Expense / Ad Spend Form State
  const [expCategory, setExpCategory] =
    React.useState<ExpenseCategoryKey>('ad_spend');
  const [expChannel, setExpChannel] = React.useState<OrderSource | 'general'>(
    'facebook'
  );
  const [expCampaign, setExpCampaign] = React.useState<string>(
    'FB-Boost-Winter-Wedding'
  );
  const [expAmountTaka, setExpAmountTaka] = React.useState<string>('1500');
  const [expNoteBn, setExpNoteBn] = React.useState<string>(
    'ফেসবুক বুস্টিং ও রিলস অ্যাড স্পেন্ড'
  );
  const [submittingExp, setSubmittingExp] = React.useState(false);

  // Promo Code Rule Form State
  const [promoCodeStr, setPromoCodeStr] = React.useState<string>('WINTER150');
  const [promoType, setPromoType] = React.useState<
    'percentage_bp' | 'fixed_poisha'
  >('fixed_poisha');
  const [promoValueInput, setPromoValueInput] = React.useState<string>('150');
  const [promoMinOrderTaka, setPromoMinOrderTaka] =
    React.useState<string>('1500');
  const [submittingPromo, setSubmittingPromo] = React.useState(false);

  const handleReceiveQcStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingQc(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'receive_qc_stock',
          variantId: qcVariantId,
          receivedQty: Math.max(1, Number(qcReceivedQty) || 1),
          qcRejectedQty: Math.max(0, Number(qcRejectedQty) || 0),
          qcProofUrl,
          noteBn: qcNoteBn,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
        newStockAvailable?: number;
      };
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text: `কনসাইনমেন্ট QC স্টক যুক্ত হয়েছে (নতুন Available: ${data.newStockAvailable})।`,
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          text: data.errorBn ?? 'স্টক গ্রহণ ব্যর্থ হয়েছে।',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'নেটওয়ার্ক ত্রুটি।' });
    } finally {
      setSubmittingQc(false);
    }
  };

  const handleAddExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingExp(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'add_expense_or_ad',
          category: expCategory,
          sourceChannel: expChannel,
          campaignName: expCampaign,
          amountPoisha: takaToPoisha(Number(expAmountTaka) || 0),
          isRecurring: false,
          noteBn: expNoteBn,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
      };
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text: 'খরচ / অ্যাড স্পেন্ড লেজারে সংরক্ষিত হয়েছে।',
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          text: data.errorBn ?? 'খরচ সংরক্ষণ ব্যর্থ হয়েছে।',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'নেটওয়ার্ক ত্রুটি।' });
    } finally {
      setSubmittingExp(false);
    }
  };

  const handleUpsertPromo = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingPromo(true);
    setFeedback(null);
    try {
      const rawVal = Number(promoValueInput) || 0;
      const value =
        promoType === 'percentage_bp'
          ? Math.round(rawVal * 100)
          : takaToPoisha(rawVal);

      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'upsert_promo_code',
          code: promoCodeStr,
          discountType: promoType,
          value,
          minOrderSubtotalPoisha: takaToPoisha(Number(promoMinOrderTaka) || 0),
          maxDiscountCapPoisha: null,
          isActive: true,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
      };
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text: `প্রোমো কোড ${promoCodeStr.toUpperCase()} সংরক্ষিত হয়েছে (প্ল্যাটফর্ম মার্জিন থেকে কর্তনযোগ্য)।`,
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          text: data.errorBn ?? 'প্রোমো কোড সংরক্ষণ করা যায়নি।',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'নেটওয়ার্ক ত্রুটি।' });
    } finally {
      setSubmittingPromo(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="text-xl font-bold text-ink">
            {locale === 'bn'
              ? 'ফাইন্যান্স, মানি ম্যাপ, প্রোমো ও প্রোডাক্ট ৩৬০ (Module F & G)'
              : 'Finance, Money Map, Promo & Product 360'}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {isSuperAdmin
              ? 'কুরিয়ারে আটকে থাকা টাকা, ভেন্ডর প্রদেয়, অটো নেট প্রফিট, ROAS/CPO এবং ইনভেন্টরি কভারেজ'
              : 'ইনভেন্টরি ৩৬০, চ্যানেল ROAS/CPO এবং কনসাইনমেন্ট স্টক স্ট্যাটাস'}
          </p>
        </div>
        <Badge status={isSuperAdmin ? 'success' : 'info'}>
          {isSuperAdmin ? 'Full Financial P&L Visible' : `Role: ${roleSlug}`}
        </Badge>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3 border rounded-[var(--radius-md)] bg-surface flex items-center justify-between gap-2 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-success text-success'
              : 'border-danger text-danger'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            ) : (
              <AlertCircle className="w-4 h-4 shrink-0" aria-hidden="true" />
            )}
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline cursor-pointer text-ink"
          >
            <LocalizedText source={"বন্ধ করুন"} area="admin" />{" "}</button>
        </div>
      )}

      {/* SUPER ADMIN ONLY: MONEY MAP & AUTO NET PROFIT BREAKDOWN */}
      {isSuperAdmin && moneyMapPnl && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card
            surface="surface"
            padding="md"
            className="lg:col-span-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                <TrendingUp className="w-4 h-4" aria-hidden="true" />
                <span><LocalizedText source={"মানি ম্যাপ: কোথায় কত টাকা আটকে আছে (Money Map)"} area="admin" /></span>
              </h2>
              <Badge status="info"><LocalizedText source={"Super Admin Only"} area="admin" /></Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="p-3 border border-border rounded-[var(--radius-md)] bg-bg space-y-1">
                <p className="text-muted"><LocalizedText source={"কুরিয়ার ইন-ট্রানজিট COD"} area="admin" /></p>
                <p className="text-base font-bold font-mono text-ink tabular-nums">
                  {formatPoishaToBdt(
                    moneyMapPnl.courierInTransitCodPoisha,
                    locale
                  )}
                </p>
              </div>
              <div className="p-3 border border-border rounded-[var(--radius-md)] bg-bg space-y-1">
                <p className="text-muted"><LocalizedText source={"ডেলিভারড কিন্তু কুরিয়ারে বকেয়া"} area="admin" /></p>
                <p className="text-base font-bold font-mono text-warning tabular-nums">
                  {formatPoishaToBdt(
                    moneyMapPnl.courierDeliveredUnsettledCodPoisha,
                    locale
                  )}
                </p>
              </div>
              <div className="p-3 border border-border rounded-[var(--radius-md)] bg-bg space-y-1">
                <p className="text-muted"><LocalizedText source={"ভেন্ডর লকড + উত্তোলনযোগ্য"} area="admin" /></p>
                <p className="text-base font-bold font-mono text-ink tabular-nums">
                  {formatPoishaToBdt(
                    moneyMapPnl.vendorLockedPoisha +
                      moneyMapPnl.vendorAvailablePoisha,
                    locale
                  )}
                </p>
              </div>
              <div className="p-3 border border-ink rounded-[var(--radius-md)] bg-surface space-y-1">
                <p className="text-muted"><LocalizedText source={"আনুমানিক নিজস্ব তরল ক্যাশ"} area="admin" /></p>
                <p className="text-base font-bold font-mono text-success tabular-nums">
                  {formatPoishaToBdt(
                    moneyMapPnl.estimatedOwnLiquidCashPoisha,
                    locale
                  )}
                </p>
              </div>
            </div>
          </Card>

          <Card
            surface="surface"
            padding="md"
            className="lg:col-span-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="text-sm font-bold text-ink">
                <LocalizedText source={"অটো নেট প্রফিট ব্রেকডাউন (Auto Net Profit Formula)"} area="admin" />{" "}</h2>
              <Badge status={moneyMapPnl.isNetLoss ? 'danger' : 'success'}>
                {moneyMapPnl.isNetLoss ? 'NET LOSS' : 'NET PROFIT'}
              </Badge>
            </div>
            <div className="space-y-1.5 text-xs font-mono">
              <div className="flex justify-between">
                <span className="text-muted"><LocalizedText source={"(+) ডেলিভারড গ্রস সেলস:"} area="admin" /></span>
                <span className="font-bold text-ink">
                  {formatPoishaToBdt(
                    moneyMapPnl.deliveredGrossSalesPoisha ?? 0,
                    locale
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted"><LocalizedText source={"(-) সাপ্লায়ার প্রদেয় (Payable):"} area="admin" /></span>
                <span>
                  {formatPoishaToBdt(
                    moneyMapPnl.totalSupplierPayablePoisha ?? 0,
                    locale
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted"><LocalizedText source={"(-) প্রোমো ডিসকাউন্ট ভর্তুকি:"} area="admin" /></span>
                <span>
                  {formatPoishaToBdt(
                    moneyMapPnl.totalPromoDiscountPoisha ?? 0,
                    locale
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted"><LocalizedText source={"(-) মার্কেটিং ও অ্যাড স্পেন্ড:"} area="admin" /></span>
                <span>
                  {formatPoishaToBdt(moneyMapPnl.totalAdSpendPoisha, locale)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">
                  <LocalizedText source={"(-) প্যাকেজিং + কুরিয়ার রিটার্ন লস + ড্যামেজ:"} area="admin" />{" "}</span>
                <span>
                  {formatPoishaToBdt(
                    (moneyMapPnl.totalPackagingCostPoisha ?? 0) +
                      (moneyMapPnl.totalUnrecoveredCourierCostPoisha ?? 0) +
                      (moneyMapPnl.totalDamageLossPoisha ?? 0) +
                      (moneyMapPnl.totalOtherExpensesPoisha ?? 0),
                    locale
                  )}
                </span>
              </div>
              <div className="pt-2 border-t border-border flex justify-between text-sm font-bold">
                <span className="text-ink"><LocalizedText source={"(=) চূড়ান্ত অটো নেট প্রফিট:"} area="admin" /></span>
                <span
                  className={
                    moneyMapPnl.isNetLoss ? 'text-danger' : 'text-success'
                  }
                >
                  {formatPoishaToBdt(
                    moneyMapPnl.autoNetProfitPoisha ?? 0,
                    locale
                  )}
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* CHANNEL ROAS/CPO & EXPENSE / PROMO FORMS (Non-Vendor) */}
      {!isVendor && moneyMapPnl && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <Card
            surface="surface"
            padding="md"
            className="lg:col-span-7 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h2 className="text-sm font-bold text-ink">
                <LocalizedText source={"চ্যানেল ভিত্তিক ROAS এবং Cost Per Order (CPO)"} area="admin" />{" "}</h2>
              <Badge status="neutral"><LocalizedText source={"Marketing & Super Admin"} area="admin" /></Badge>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-muted">
                    <th className="py-2 px-2"><LocalizedText source={"সোর্স চ্যানেল"} area="admin" /></th>
                    <th className="py-2 px-2"><LocalizedText source={"অর্ডার সংখ্যা"} area="admin" /></th>
                    <th className="py-2 px-2"><LocalizedText source={"রেভিনিউ"} area="admin" /></th>
                    <th className="py-2 px-2"><LocalizedText source={"অ্যাড স্পেন্ড"} area="admin" /></th>
                    <th className="py-2 px-2"><LocalizedText source={"CPO"} area="admin" /></th>
                    <th className="py-2 px-2"><LocalizedText source={"ROAS"} area="admin" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border font-mono">
                  {moneyMapPnl.channelRoas.map((ch) => (
                    <tr key={ch.source}>
                      <td className="py-2 px-2 font-bold uppercase text-ink">
                        {ch.source}
                      </td>
                      <td className="py-2 px-2">{ch.ordersCount}</td>
                      <td className="py-2 px-2">
                        {formatPoishaToBdt(ch.revenuePoisha, locale)}
                      </td>
                      <td className="py-2 px-2">
                        {formatPoishaToBdt(ch.adSpendPoisha, locale)}
                      </td>
                      <td className="py-2 px-2">
                        {formatPoishaToBdt(ch.cpoPoisha, locale)}
                      </td>
                      <td className="py-2 px-2 font-bold text-success">
                        {ch.roasMultiple}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="pt-3 border-t border-border space-y-2">
              <h3 className="text-xs font-bold text-ink">
                <LocalizedText source={"সাম্প্রতিক খরচ ও অ্যাড স্পেন্ড এন্ট্রি সমূহ ("} area="admin" />{expenses.length})
              </h3>
              <div className="max-h-40 overflow-y-auto divide-y divide-border border border-border rounded-[var(--radius-md)] text-xs">
                {expenses.map((exp) => (
                  <div
                    key={exp.id}
                    className="p-2.5 bg-bg flex items-center justify-between gap-2"
                  >
                    <div>
                      <span className="font-mono font-bold text-ink">
                        [{exp.category}]
                      </span>{' '}
                      <span>{localizedField(exp, "noteBn", locale)}</span>{' '}
                      <span className="text-muted">({exp.campaignName})</span>
                    </div>
                    <span className="font-mono font-bold text-ink shrink-0">
                      {formatPoishaToBdt(exp.amountPoisha, locale)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          <div className="lg:col-span-5 space-y-6">
            {/* Add Expense / Ad Spend Card */}
            <Card surface="surface" padding="md" className="space-y-3">
              <h2 className="text-sm font-bold text-ink border-b border-border pb-2">
                <LocalizedText source={"নতুন খরচ / অ্যাড স্পেন্ড যোগ করুন"} area="admin" />{" "}</h2>
              <form onSubmit={handleAddExpense} className="space-y-3 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block font-medium text-ink mb-1">
                      <LocalizedText source={"ক্যাটাগরি"} area="admin" />{" "}</label>
                    <select
                      value={expCategory}
                      onChange={(e) =>
                        setExpCategory(e.target.value as ExpenseCategoryKey)
                      }
                      className="w-full h-9 px-2 rounded-[var(--radius-md)] border border-border bg-bg text-ink"
                    >
                      <option value="ad_spend"><LocalizedText source={"Ad Spend (বুস্টিং)"} area="admin" /></option>
                      {isSuperAdmin && (
                        <>
                          <option value="packaging"><LocalizedText source={"Packaging (প্যাকেজিং)"} area="admin" /></option>
                          <option value="courier_return_loss">
                            <LocalizedText source={"Courier Return Loss"} area="admin" />{" "}</option>
                          <option value="damage_compensation">
                            <LocalizedText source={"Damage Loss"} area="admin" />{" "}</option>
                          <option value="office_ops"><LocalizedText source={"Office Operations"} area="admin" /></option>
                        </>
                      )}
                    </select>
                  </div>
                  <div>
                    <label className="block font-medium text-ink mb-1">
                      <LocalizedText source={"চ্যানেল"} area="admin" />{" "}</label>
                    <select
                      value={expChannel}
                      onChange={(e) =>
                        setExpChannel(e.target.value as OrderSource | 'general')
                      }
                      className="w-full h-9 px-2 rounded-[var(--radius-md)] border border-border bg-bg text-ink"
                    >
                      <option value="facebook"><LocalizedText source={"Facebook"} area="admin" /></option>
                      <option value="instagram"><LocalizedText source={"Instagram"} area="admin" /></option>
                      <option value="whatsapp"><LocalizedText source={"WhatsApp"} area="admin" /></option>
                      <option value="storefront"><LocalizedText source={"Storefront"} area="admin" /></option>
                      <option value="general"><LocalizedText source={"General"} area="admin" /></option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    label="ক্যাম্পেইন কোড"
                    value={expCampaign}
                    onChange={(e) => setExpCampaign(e.target.value)}
                  />
                  <Input
                    label="পরিমাণ (টাকা BDT) *"
                    type="number"
                    value={expAmountTaka}
                    onChange={(e) => setExpAmountTaka(e.target.value)}
                    required
                  />
                </div>
                <Input
                  label="বিবরণ (বাংলায়) *"
                  value={expNoteBn}
                  onChange={(e) => setExpNoteBn(e.target.value)}
                  required
                />
                <Button
                  type="submit"
                  variant="primary"
                  size="sm"
                  disabled={submittingExp}
                  className="w-full"
                >
                  {submittingExp ? 'সংরক্ষণ হচ্ছে...' : 'খরচ লেজারে যুক্ত করুন'}
                </Button>
              </form>
            </Card>

            {/* Super Admin Promo Code Rule Engine */}
            {isSuperAdmin && (
              <Card surface="surface" padding="md" className="space-y-3">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <h2 className="text-sm font-bold text-ink flex items-center gap-1.5">
                    <Tag className="w-4 h-4" aria-hidden="true" />
                    <span><LocalizedText source={"প্রোমো কোড ইঞ্জিন (মার্জিন থেকে কর্তন)"} area="admin" /></span>
                  </h2>
                  <Badge status="info">{promoCodes.length} {" "}<LocalizedText source={"সক্রিয়"} area="admin" /></Badge>
                </div>
                <form
                  onSubmit={handleUpsertPromo}
                  className="space-y-2.5 text-xs"
                >
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label="প্রোমো কোড *"
                      value={promoCodeStr}
                      onChange={(e) => setPromoCodeStr(e.target.value)}
                      required
                    />
                    <div>
                      <label className="block font-medium text-ink mb-1">
                        <LocalizedText source={"ডিসকাউন্ট ধরন"} area="admin" />{" "}</label>
                      <select
                        value={promoType}
                        onChange={(e) =>
                          setPromoType(
                            e.target.value as 'percentage_bp' | 'fixed_poisha'
                          )
                        }
                        className="w-full h-9 px-2 rounded-[var(--radius-md)] border border-border bg-bg text-ink"
                      >
                        <option value="fixed_poisha"><LocalizedText source={"Fixed BDT (টাকা)"} area="admin" /></option>
                        <option value="percentage_bp"><LocalizedText source={"Percentage (%)"} area="admin" /></option>
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      label={
                        promoType === 'percentage_bp'
                          ? 'ডিসকাউন্ট শতকরা (%) *'
                          : 'ডিসকাউন্ট টাকা (BDT) *'
                      }
                      type="number"
                      value={promoValueInput}
                      onChange={(e) => setPromoValueInput(e.target.value)}
                      required
                    />
                    <Input
                      label="সর্বনিম্ন অর্ডার (BDT) *"
                      type="number"
                      value={promoMinOrderTaka}
                      onChange={(e) => setPromoMinOrderTaka(e.target.value)}
                      required
                    />
                  </div>
                  <Button
                    type="submit"
                    variant="outline"
                    size="sm"
                    disabled={submittingPromo}
                    className="w-full"
                  >
                    <LocalizedText source={"প্রোমো কোড সংরক্ষণ করুন"} area="admin" />{" "}</Button>
                </form>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* PRODUCT 360 & CONSIGNMENT QC STOCK RECEIPT */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card
          surface="surface"
          padding="md"
          className="lg:col-span-8 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Package className="w-4 h-4" aria-hidden="true" />
              <span><LocalizedText source={"প্রোডাক্ট ৩৬০ ও ইনভেন্টরি কভারেজ (Product 360)"} area="admin" /></span>
            </h2>
            <Badge status="neutral">{product360.length} {" "}<LocalizedText source={"ভ্যারিয়েন্ট"} area="admin" /></Badge>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="py-2 px-2"><LocalizedText source={"পণ্য ও ভ্যারিয়েন্ট"} area="admin" /></th>
                  <th className="py-2 px-2"><LocalizedText source={"On-Hand / Avail"} area="admin" /></th>
                  <th className="py-2 px-2"><LocalizedText source={"৩০ দিনে বিক্রি"} area="admin" /></th>
                  <th className="py-2 px-2"><LocalizedText source={"Days of Cover"} area="admin" /></th>
                  <th className="py-2 px-2"><LocalizedText source={"বিক্রয় মূল্য"} area="admin" /></th>
                  {(isSuperAdmin || isVendor) && (
                    <th className="py-2 px-2"><LocalizedText source={"সাপ্লায়ার প্রদেয়"} area="admin" /></th>
                  )}
                  {isSuperAdmin && (
                    <th className="py-2 px-2"><LocalizedText source={"প্ল্যাটফর্ম মার্জিন"} area="admin" /></th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {product360.map((v) => (
                  <tr key={v.variantId}>
                    <td className="py-2.5 px-2">
                      <p className="font-bold text-ink">{localizedField(v, "productNameBn", locale)}</p>
                      <p className="text-muted">
                        {localizedField(v, "variantTitleBn", locale)} ·{' '}
                        <span className="font-mono">{v.publicSku}</span>
                      </p>
                    </td>
                    <td className="py-2.5 px-2 font-mono">
                      <span className="font-bold text-ink">
                        {v.stockOnHand}
                      </span>{' '}
                      / <span className="text-success">{v.stockAvailable}</span>{' '}
                      {v.isLowStock && (
                        <Badge status="danger"><LocalizedText source={"Low Stock"} area="admin" /></Badge>
                      )}
                    </td>
                    <td className="py-2.5 px-2 font-mono">
                      {v.soldLast30Days} {" "}<LocalizedText source={"টি (7d:"} area="admin" />{" "}{v.soldLast7Days})
                    </td>
                    <td className="py-2.5 px-2 font-mono">
                      {v.daysOfCover} {" "}<LocalizedText source={"দিন"} area="admin" />{" "}</td>
                    <td className="py-2.5 px-2 font-mono font-bold text-ink">
                      {formatPoishaToBdt(v.salePricePoisha, locale)}
                    </td>
                    {(isSuperAdmin || isVendor) && (
                      <td className="py-2.5 px-2 font-mono text-ink">
                        {v.supplierPayablePoisha !== undefined
                          ? formatPoishaToBdt(v.supplierPayablePoisha, locale)
                          : 'HIDDEN'}
                      </td>
                    )}
                    {isSuperAdmin && (
                      <td className="py-2.5 px-2 font-mono font-bold text-success">
                        {v.platformMarginPoisha !== undefined
                          ? formatPoishaToBdt(v.platformMarginPoisha, locale)
                          : 'HIDDEN'}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {!isVendor && (
          <Card
            surface="surface"
            padding="md"
            className="lg:col-span-4 space-y-3"
          >
            <h2 className="text-sm font-bold text-ink border-b border-border pb-2">
              <LocalizedText source={"কনসাইনমেন্ট স্টক QC রিসিপ্ট (QC Proof Mandatory)"} area="admin" />{" "}</h2>
            <form onSubmit={handleReceiveQcStock} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-ink mb-1">
                  <LocalizedText source={"ভ্যারিয়েন্ট নির্বাচন করুন *"} area="admin" />{" "}</label>
                <select
                  value={qcVariantId}
                  onChange={(e) => setQcVariantId(e.target.value)}
                  className="w-full h-9 px-2 rounded-[var(--radius-md)] border border-border bg-bg text-ink"
                >
                  {product360.map((v) => (
                    <option key={v.variantId} value={v.variantId}>
                      {localizedField(v, "productNameBn", locale)} — {localizedField(v, "variantTitleBn", locale)} {" "}<LocalizedText source={"(Stock:"} area="admin" />{' '}
                      {v.stockOnHand})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  label="গৃহীত QC Pass সংখ্যা *"
                  type="number"
                  value={qcReceivedQty}
                  onChange={(e) => setQcReceivedQty(e.target.value)}
                  required
                />
                <Input
                  label="QC বাতিল সংখ্যা"
                  type="number"
                  value={qcRejectedQty}
                  onChange={(e) => setQcRejectedQty(e.target.value)}
                />
              </div>
              <Input
                label="QC ছবির / ভিডিওর প্রমাণ লিংক (Proof URL) *"
                value={qcProofUrl}
                onChange={(e) => setQcProofUrl(e.target.value)}
                required
              />
              <Input
                label="QC নোট *"
                value={qcNoteBn}
                onChange={(e) => setQcNoteBn(e.target.value)}
                required
              />
              <Button
                type="submit"
                variant="primary"
                size="md"
                disabled={submittingQc}
                className="w-full"
              >
                {submittingQc
                  ? 'স্টক আপডেট হচ্ছে...'
                  : 'QC যাচাই করে স্টকে যুক্ত করুন'}
              </Button>
            </form>
          </Card>
        )}
      </div>
    </section>
  );
}

// ============================================================================
// 2. MESSAGING, BLACKLIST, AUTOMATION ENGINE & GOOGLE SHEETS ONE-WAY MIRROR
// ============================================================================

export interface MessagingAutomationAndSheetsPanelProps {
  locale: SupportedLocale;
  isSuperAdmin: boolean;
  availableOrderNos: string[];
  blacklistedPhones: Record<
    string,
    string | { reasonBn: string; blacklistedAt?: string }
  >;
  messageTemplates: MessageTemplateRecord[];
  messageLogs: MessageDispatchLogRecord[];
  automationKillSwitchActive: boolean;
  automationRules: AutomationRuleRecord[];
  automationLogs: AutomationExecutionLogRecord[];
  sheetsSyncHistory: SheetsSyncJobRecord[];
  onRefreshWorkspace: () => Promise<void>;
}

export function MessagingAutomationAndSheetsPanel({
  locale = 'en',
  availableOrderNos,
  blacklistedPhones,
  messageTemplates,
  messageLogs,
  automationKillSwitchActive,
  automationRules,
  automationLogs,
  sheetsSyncHistory,
  onRefreshWorkspace,
}: MessagingAutomationAndSheetsPanelProps) {
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Message Preview State
  const [selectedEventKey, setSelectedEventKey] =
    React.useState<MessageEventKey>('ORDER_CONFIRMED');
  const [previewOrderNo, setPreviewOrderNo] = React.useState<string>(
    availableOrderNos[0] ?? 'ORD-261106-0001'
  );
  const [previewResult, setPreviewResult] = React.useState<{
    renderedBn: string;
    waMeDeepLink: string;
    smsDeepLink: string;
    paidWhatsappWarningBn: string | null;
  } | null>(null);

  // Blacklist Form State
  const [blPhone, setBlPhone] = React.useState<string>('01999888777');
  const [blReasonBn, setBlReasonBn] = React.useState<string>(
    'পরপর ৩ বার ভুয়া অর্ডার ও পার্সেল রিসিভ না করার রেকর্ড'
  );

  // Sheets Copy State
  const [copiedCodeGs, setCopiedCodeGs] = React.useState(false);
  const [syncingSheets, setSyncingSheets] = React.useState(false);

  const handleGenerateMessagePreview = async () => {
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'preview_order_message',
          orderNo: previewOrderNo,
          eventKey: selectedEventKey,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
        renderedText?: string;
        waMeUrl?: string;
        smsUrl?: string;
      };
      if (res.ok && data.success && data.renderedText) {
        setPreviewResult({
          renderedBn: data.renderedText,
          waMeDeepLink: data.waMeUrl ?? '',
          smsDeepLink: data.smsUrl ?? '',
          paidWhatsappWarningBn: null,
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          text: data.errorBn ?? 'মেসেজ প্রিভিউ তৈরি করা যায়নি।',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'নেটওয়ার্ক ত্রুটি।' });
    }
  };

  const handleUpsertBlacklist = async (action: 'add' | 'remove') => {
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'upsert_blacklist',
          phone: blPhone,
          action,
          reasonBn: blReasonBn,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
      };
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text:
            action === 'add'
              ? `${blPhone} নম্বরটি ব্ল্যাকলিস্টে যুক্ত হয়েছে।`
              : `${blPhone} নম্বরটি ব্ল্যাকলিস্ট থেকে সরানো হয়েছে।`,
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          text: data.errorBn ?? 'ব্ল্যাকলিস্ট আপডেট ব্যর্থ হয়েছে।',
        });
      }
    } catch {
      setFeedback({ type: 'error', text: 'নেটওয়ার্ক ত্রুটি।' });
    }
  };

  const handleToggleAutomation = async (payload: {
    globalKillSwitchActive?: boolean;
    ruleId?: string;
    isEnabled?: boolean;
    dryRunOnly?: boolean;
  }) => {
    setFeedback(null);
    const res = await fetch('/api/admin/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'toggle_automation_rule',
        ...payload,
      }),
    });
    const data = (await res.json()) as { success: boolean; errorBn?: string };
    if (res.ok && data.success) {
      setFeedback({
        type: 'success',
        text: 'অটোমেশন কনফিগারেশন আপডেট হয়েছে।',
      });
      await onRefreshWorkspace();
    } else {
      setFeedback({
        type: 'error',
        text: data.errorBn ?? 'অটোমেশন আপডেট ব্যর্থ।',
      });
    }
  };

  const handleSimulateAutomation = async (ruleId: string) => {
    setFeedback(null);
    const res = await fetch('/api/admin/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'simulate_automation_rule',
        ruleId,
        sampleOrderNo: previewOrderNo,
      }),
    });
    const data = (await res.json()) as {
      success: boolean;
      errorBn?: string;
      log?: AutomationExecutionLogRecord;
    };
    if (res.ok && data.success && data.log) {
      setFeedback({
        type: 'success',
        text: `${data.log.outcomeSummaryBn}`,
      });
      await onRefreshWorkspace();
    } else {
      setFeedback({
        type: 'error',
        text: data.errorBn ?? 'অটোমেশন রান ব্যর্থ হয়েছে।',
      });
    }
  };

  const handleTriggerSheetsSync = async (
    mode: 'incremental' | 'full_resync'
  ) => {
    setSyncingSheets(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'trigger_sheets_sync',
          mode,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
        job?: SheetsSyncJobRecord;
      };
      if (res.ok && data.success && data.job) {
        setFeedback({
          type: 'success',
          text: data.job.summaryBn,
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          text: data.errorBn ?? 'গুগল শিট সিঙ্ক ব্যর্থ।',
        });
      }
    } finally {
      setSyncingSheets(false);
    }
  };

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="text-xl font-bold text-ink">
            {locale === 'bn'
              ? 'মেসেজিং, ফ্রড ব্ল্যাকলিস্ট, অটোমেশন ও গুগল শিট সিঙ্ক (Module H, I, J, K)'
              : 'Messaging, Fraud Blacklist, Automation & Google Sheets Sync (Module H, I, J, K)'}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {locale === 'bn'
              ? 'ফ্রি wa.me / sms: ডিপ-লিংক, অটোমেশন কিল-সুইচ ও ড্রাই-রান এবং ৮-ট্যাব গুগল শিট ওয়ান-ওয়ে মিরর'
              : 'Free wa.me / sms: deep-links, automation kill-switch, dry-runs, and 8-tab Google Sheets one-way mirror'}
          </p>
        </div>
        <Badge status={automationKillSwitchActive ? 'danger' : 'success'}>
          {automationKillSwitchActive
            ? 'Automation Kill-Switch ACTIVE'
            : 'Automation Engine Ready'}
        </Badge>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3 border rounded-[var(--radius-md)] bg-surface flex items-center justify-between gap-2 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-success text-success'
              : 'border-danger text-danger'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline cursor-pointer text-ink"
          >
            <LocalizedText source={"বন্ধ করুন"} area="admin" />{" "}</button>
        </div>
      )}

      {/* ROW 1: MESSAGE TEMPLATES + 1-CLICK WA.ME/SMS DEEP LINK & CUSTOMER BLACKLIST */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card
          surface="surface"
          padding="md"
          className="lg:col-span-7 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <MessageSquare className="w-4 h-4" aria-hidden="true" />
              <span><LocalizedText source={"বাইলিঙ্গুয়াল মেসেজ টেমপ্লেট ও ১-ক্লিক ডিপ-লিংক জেনারেটর"} area="admin" /></span>
            </h2>
            <Badge status="success"><LocalizedText source={"wa.me + sms: Free Active"} area="admin" /></Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
            <div>
              <label className="block font-medium text-ink mb-1">
                <LocalizedText source={"ইভেন্ট ট্রিগার"} area="admin" />{" "}</label>
              <select
                value={selectedEventKey}
                onChange={(e) =>
                  setSelectedEventKey(e.target.value as MessageEventKey)
                }
                className="w-full h-9 px-2 rounded-[var(--radius-md)] border border-border bg-bg text-ink"
              >
                {messageTemplates.map((t) => (
                  <option key={t.eventKey} value={t.eventKey}>
                    {localizedField(t, "eventLabelBn", locale)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium text-ink mb-1">
                <LocalizedText source={"অর্ডার নম্বর"} area="admin" />{" "}</label>
              <select
                value={previewOrderNo}
                onChange={(e) => setPreviewOrderNo(e.target.value)}
                className="w-full h-9 px-2 rounded-[var(--radius-md)] border border-border bg-bg text-ink font-mono"
              >
                {availableOrderNos.map((no) => (
                  <option key={no} value={no}>
                    {no}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={handleGenerateMessagePreview}
                className="w-full"
              >
                <LocalizedText source={"মেসেজ ও লিংক তৈরি করুন"} area="admin" />{" "}</Button>
            </div>
          </div>

          {previewResult && (
            <div className="p-3 border border-border rounded-[var(--radius-md)] bg-bg space-y-2.5 text-xs">
              <p className="font-bold text-ink"><LocalizedText source={"জেনারেটেড বাংলা মেসেজ:"} area="admin" /></p>
              <p className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink">
                {localizedField(previewResult, "renderedBn", locale)}
              </p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={previewResult.waMeDeepLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] border border-ink bg-ink text-bg font-bold"
                >
                  <ExternalLink className="w-3.5 h-3.5" aria-hidden="true" />
                  <span><LocalizedText source={"Open Free WhatsApp (wa.me)"} area="admin" /></span>
                </a>
                <a
                  href={previewResult.smsDeepLink}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--radius-md)] border border-border bg-surface text-ink font-bold"
                >
                  <span><LocalizedText source={"Open Phone SMS (sms:)"} area="admin" /></span>
                </a>
                <Badge status="warning">
                  <LocalizedText source={"Paid WhatsApp Cloud API: OFF (Per-Message Meta Cost Warning)"} area="admin" />{" "}</Badge>
              </div>
            </div>
          )}

          <div className="space-y-1.5 text-xs">
            <p className="font-bold text-ink">
              <LocalizedText source={"সাম্প্রতিক মেসেজ ডিসপ্যাচ লগ ("} area="admin" />{messageLogs.length})
            </p>
            <div className="max-h-36 overflow-y-auto divide-y divide-border border border-border rounded-[var(--radius-md)]">
              {messageLogs.slice(0, 6).map((m) => (
                <div
                  key={m.id}
                  className="p-2 bg-bg flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-mono font-bold text-ink">
                      {m.orderNo}
                    </span>{' '}
                    · <span>{m.eventKey}</span> ({m.channel})
                  </div>
                  <Badge status="info">{m.status}</Badge>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Customer Blacklist & Fraud Registry */}
        <Card
          surface="surface"
          padding="md"
          className="lg:col-span-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <ShieldAlert className="w-4 h-4" aria-hidden="true" />
              <span>
                {locale === 'bn'
                  ? 'গ্রাহক ব্ল্যাকলিস্ট ও ফ্রড রেজিস্ট্রি (Module H)'
                  : 'Customer Blacklist & Fraud Registry (Module H)'}
              </span>
            </h2>
            <Badge status="danger">
              {Object.keys(blacklistedPhones).length}{' '}
              {locale === 'bn' ? 'ব্লকড' : 'Blocked'}
            </Badge>
          </div>
          <div className="space-y-3 text-xs">
            <Input
              label="১১ ডিজিটের বাংলাদেশী মোবাইল নম্বর *"
              value={blPhone}
              onChange={(e) => setBlPhone(e.target.value)}
              placeholder="01999888777"
            />
            <Input
              label="ব্ল্যাকলিস্ট করার কারণ *"
              value={blReasonBn}
              onChange={(e) => setBlReasonBn(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="danger"
                size="sm"
                onClick={() => void handleUpsertBlacklist('add')}
              >
                <LocalizedText source={"ব্ল্যাকলিস্টে যুক্ত করুন"} area="admin" />{" "}</Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void handleUpsertBlacklist('remove')}
              >
                <LocalizedText source={"ব্ল্যাকলিস্ট থেকে সরান"} area="admin" />{" "}</Button>
            </div>

            <div className="pt-2 border-t border-border space-y-1.5">
              <p className="font-bold text-ink"><LocalizedText source={"বর্তমানে ব্ল্যাকলিস্টেড নম্বরসমূহ:"} area="admin" /></p>
              <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] max-h-40 overflow-y-auto">
                {Object.entries(blacklistedPhones).map(([phone, info]) => (
                  <div
                    key={phone}
                    className="p-2.5 bg-bg flex items-center justify-between gap-2"
                  >
                    <div>
                      <p className="font-mono font-bold text-danger">{phone}</p>
                      <p className="text-muted">
                        {typeof info === 'string' ? info : info.reasonBn}
                      </p>
                    </div>
                    <Badge status="danger"><LocalizedText source={"BLOCKED"} area="admin" /></Badge>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ROW 2: AUTOMATION ENGINE ("IF X THEN Z") & GOOGLE SHEETS ONE-WAY MIRROR */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <Card
          surface="surface"
          padding="md"
          className="lg:col-span-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Zap className="w-4 h-4" aria-hidden="true" />
              <span>
                {locale === 'bn'
                  ? 'অটোমেশন রুলস ইঞ্জিন ("যদি X হয়, তাহলে Z করো")'
                  : 'Automation Rules Engine ("If X then Z")'}
              </span>
            </h2>
            <Button
              type="button"
              variant={automationKillSwitchActive ? 'primary' : 'danger'}
              size="sm"
              onClick={() =>
                void handleToggleAutomation({
                  globalKillSwitchActive: !automationKillSwitchActive,
                })
              }
            >
              {automationKillSwitchActive
                ? 'Kill-Switch বন্ধ করুন (Resume)'
                : 'Global Kill-Switch চালু করুন'}
            </Button>
          </div>

          <div className="space-y-2.5 text-xs">
            {automationRules.map((rule) => (
              <div
                key={rule.ruleId}
                className="p-3 border border-border rounded-[var(--radius-md)] bg-bg space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-bold text-ink">{localizedField(rule, "nameBn", locale)}</p>
                  <div className="flex items-center gap-1.5">
                    <Badge status={rule.isEnabled ? 'success' : 'neutral'}>
                      {rule.isEnabled ? 'Enabled' : 'Disabled (Default)'}
                    </Badge>
                    <Badge status={rule.dryRunOnly ? 'info' : 'warning'}>
                      {rule.dryRunOnly ? 'DRY-RUN ONLY' : 'LIVE MODE'}
                    </Badge>
                  </div>
                </div>
                <p className="text-muted">
                  <strong><LocalizedText source={"শর্ত:"} area="admin" /></strong> {localizedField(rule, "conditionSummaryBn", locale)} →{' '}
                  <strong><LocalizedText source={"অ্যাকশন:"} area="admin" /></strong> {localizedField(rule, "actionSummaryBn", locale)}
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void handleToggleAutomation({
                        ruleId: rule.ruleId,
                        isEnabled: !rule.isEnabled,
                      })
                    }
                  >
                    {rule.isEnabled ? 'নিষ্ক্রিয় করুন' : 'সক্রিয় করুন'}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      void handleToggleAutomation({
                        ruleId: rule.ruleId,
                        dryRunOnly: !rule.dryRunOnly,
                      })
                    }
                  >
                    {rule.dryRunOnly ? 'Switch to LIVE' : 'Switch to DRY-RUN'}
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => void handleSimulateAutomation(rule.ruleId)}
                    leftIcon={<Play className="w-3.5 h-3.5" aria-hidden="true" />}
                  >
                    <LocalizedText source={"টেস্ট সিমুলেশন চালান"} area="admin" />{" "}</Button>
                </div>
              </div>
            ))}
          </div>

          {automationLogs.length > 0 && (
            <div className="pt-2 border-t border-border space-y-1.5 text-xs">
              <p className="font-bold text-ink">
                <LocalizedText source={"অটোমেশন এক্সিকিউশন লগ ("} area="admin" />{automationLogs.length})
              </p>
              <div className="max-h-36 overflow-y-auto divide-y divide-border border border-border rounded-[var(--radius-md)]">
                {automationLogs.slice(0, 5).map((log) => (
                  <div key={log.id} className="p-2 bg-bg">
                    <span className="font-mono font-bold text-ink">
                      [{log.mode}]
                    </span>{' '}
                    <span>{localizedField(log, "outcomeSummaryBn", locale)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>

        {/* Google Sheets One-Way Mirror Sync + Complete Code.gs */}
        <Card
          surface="surface"
          padding="md"
          className="lg:col-span-6 space-y-4"
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4" aria-hidden="true" />
              <span>
                {locale === 'bn'
                  ? 'গুগল শিট ৮-ট্যাব ওয়ান-ওয়ে মিরর সিঙ্ক (Module J)'
                  : 'Google Sheets 8-Tab One-Way Mirror Sync (Module J)'}
              </span>
            </h2>
            <Badge status="warning"><LocalizedText source={"One-Way Mirror Only"} area="admin" /></Badge>
          </div>

          <div className="p-3 border border-border rounded-[var(--radius-md)] bg-bg text-xs space-y-1.5">
            <p className="font-bold text-ink">
              <LocalizedText source={"গুরুত্বপূর্ণ সতর্কতা (One-Way Mirror Policy):"} area="admin" />{" "}</p>
            <p className="text-muted">
              <LocalizedText source={"এই গুগল শিট ইন্টিগ্রেশনটি শুধুমাত্র"} area="admin" />{" "}<strong><LocalizedText source={"One-Way Mirror"} area="admin" /></strong> {" "}<LocalizedText source={"(Orders, Order Items, Inventory, Vendor Ledger, Payouts, Expenses, Ad Spend, Customers)। গুগল শিটে কোনো সংখ্যা বা স্ট্যাটাস এডিট করলে তা কখনোই মূল ইআরপি ডাটাবেসে ফেরত যাবে না।"} area="admin" />{" "}</p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={syncingSheets}
              onClick={() => void handleTriggerSheetsSync('incremental')}
            >
              {syncingSheets ? 'সিঙ্ক হচ্ছে...' : 'Incremental Sync (নতুন রো)'}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={syncingSheets}
              onClick={() => void handleTriggerSheetsSync('full_resync')}
            >
              <LocalizedText source={"Full Resync (সম্পূর্ণ ৮-ট্যাব রিবিল্ড)"} area="admin" />{" "}</Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(
                  CLIENT_GOOGLE_APPS_SCRIPT_CODE_GS
                );
                setCopiedCodeGs(true);
                setTimeout(() => setCopiedCodeGs(false), 2000);
              }}
              leftIcon={
                copiedCodeGs ? (
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                ) : (
                  <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                )
              }
            >
              {copiedCodeGs ? 'Code.gs কপি হয়েছে!' : 'Apps Script (Code.gs) কপি করুন'}
            </Button>
          </div>

          <pre className="p-3 border border-border rounded-[var(--radius-md)] bg-bg text-[11px] font-mono overflow-x-auto max-h-44">
            {CLIENT_GOOGLE_APPS_SCRIPT_CODE_GS}
          </pre>

          <div className="space-y-1.5 text-xs">
            <p className="font-bold text-ink">
              <LocalizedText source={"সাম্প্রতিক শিট সিঙ্ক জব ("} area="admin" />{sheetsSyncHistory.length})
            </p>
            {sheetsSyncHistory.slice(0, 3).map((job) => (
              <div
                key={job.id}
                className="p-2.5 border border-border rounded-[var(--radius-md)] bg-bg flex items-center justify-between gap-2"
              >
                <div>
                  <p className="font-bold text-ink">{job.summaryBn}</p>
                  <p className="text-muted font-mono">
                    <LocalizedText source={"Mode:"} area="admin" />{" "}{job.mode} {" "}<LocalizedText source={"· Rows:"} area="admin" />{" "}{job.rowsExportedCount}
                  </p>
                </div>
                <Badge status={job.webhookConnected ? 'success' : 'warning'}>
                  {job.webhookConnected
                    ? 'Webhook Pushed'
                    : 'Local Snapshot Ready'}
                </Badge>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}

// ============================================================================
// 3. SUPER ADMIN CONTROL CENTER, MASKED CREDENTIALS VAULT & CRON JOBS PANEL
// ============================================================================

export interface SuperAdminControlCenterPanelProps {
  siteSettings: SiteSettingsRecord;
  maskedCredentials: MaskedCredentialStatusDTO[];
  scheduledJobs: ScheduledJobRecord[];
  onRefreshWorkspace: () => Promise<void>;
  locale?: SupportedLocale;
  inquiries?: CustomerInquiryRecord[];
}

export function SuperAdminControlCenterPanel({
  siteSettings,
  maskedCredentials,
  scheduledJobs,
  onRefreshWorkspace,
  locale = 'en',
  inquiries = [],
}: SuperAdminControlCenterPanelProps) {
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Contact Page Content Editor State
  const aboutContact = siteSettings.aboutContactPage;
  const [aboutTitleBn, setAboutTitleBn] = React.useState(aboutContact?.titleBn ?? 'যোগাযোগ ও আমাদের পরিচিতি');
  const [aboutTitleEn, setAboutTitleEn] = React.useState(aboutContact?.titleEn ?? 'Contact & About Us');
  const [aboutSubtitleBn, setAboutSubtitleBn] = React.useState(aboutContact?.subtitleBn ?? 'বাংলাদেশের তৃণমূল কারিগর ও গ্রাহকদের মাঝে নির্ভরযোগ্য, কিউসি-যাচাইকৃত কনসাইনমেন্ট প্ল্যাটফর্ম।');
  const [aboutSubtitleEn, setAboutSubtitleEn] = React.useState(aboutContact?.subtitleEn ?? 'Reliable, QC-verified consignment platform bridging authentic artisans and valued customers.');
  const [storyTitleBn, setStoryTitleBn] = React.useState(aboutContact?.storyTitleBn ?? 'পঞ্চগড় (PANCHAGARH) কীভাবে কাজ করে?');
  const [storyTitleEn, setStoryTitleEn] = React.useState(aboutContact?.storyTitleEn ?? 'How PANCHAGARH Works');
  const [storyP1Bn, setStoryP1Bn] = React.useState(aboutContact?.storyParagraph1Bn ?? 'পঞ্চগড় একটি আধুনিক মাল্টি-ভেন্ডর কনসাইনমেন্ট কমার্স প্ল্যাটফর্ম। আমরা বাংলাদেশের স্থানীয় তাঁতি, চাষী ও কারিগরদের সাথে সরাসরি কাজ করি। প্রতিটি পণ্য আমাদের নিজস্ব সেন্ট্রাল ওয়্যারহাউসে রিসিভ করে অভিজ্ঞ টিম দ্বারা গুণগত মান (QC) নিশ্চিত করার পর প্যাকেজিং ও ডেলিভারি করা হয়।');
  const [storyP1En, setStoryP1En] = React.useState(aboutContact?.storyParagraph1En ?? 'PANCHAGARH is a transparent consignment commerce platform connecting verified regional artisans with consumers nationwide.');
  const [storyP2Bn, setStoryP2Bn] = React.useState(aboutContact?.storyParagraph2Bn ?? 'আমাদের প্রধান লক্ষ্য হলো—ক্রেতা যেন ঘরে বসেই শতভাগ খাঁটি পণ্য পান, এবং প্রান্তিক উৎপাদক যেন তাদের পণ্যের সঠিক ন্যায্যমূল্য ও সঠিক সময়ে পেমেন্ট পান।');
  const [storyP2En, setStoryP2En] = React.useState(aboutContact?.storyParagraph2En ?? 'Our mission is simple: ensure authentic provenance and fair trade for suppliers, while guaranteeing pristine product quality and peace of mind for every customer.');
  const [warehouseAddressBn, setWarehouseAddressBn] = React.useState(aboutContact?.warehouseAddressBn ?? 'প্লট ১২, রোড ৪/এ, ধানমন্ডি আ/এ, ঢাকা-১২০৯');
  const [warehouseAddressEn, setWarehouseAddressEn] = React.useState(aboutContact?.warehouseAddressEn ?? 'Plot 12, Road 4/A, Dhanmondi R/A, Dhaka-1209');
  const [helplineHoursBn, setHelplineHoursBn] = React.useState(aboutContact?.helplineHoursBn ?? 'সকাল ৯টা – রাত ১০টা (প্রতিদিন)');
  const [helplineHoursEn, setHelplineHoursEn] = React.useState(aboutContact?.helplineHoursEn ?? '9 AM – 10 PM Everyday');
  const [savingAboutPage, setSavingAboutPage] = React.useState(false);

  // Customer Inquiries Inbox State
  const [inquiryFilter, setInquiryFilter] = React.useState<'ALL' | 'unread' | 'replied' | 'resolved'>('ALL');
  const [updatingInquiryId, setUpdatingInquiryId] = React.useState<string | null>(null);

  // Branding & Thresholds State
  const [bkashManualNumber, setBkashManualNumber] = React.useState(
    siteSettings.bkashManualNumber
  );
  const [freeDeliveryTaka, setFreeDeliveryTaka] = React.useState(
    String(Math.round(siteSettings.freeDeliveryThresholdPoisha / 100))
  );
  const [escrowHoldDays, setEscrowHoldDays] = React.useState(
    String(siteSettings.globalEscrowHoldDays)
  );
  const [maintenanceMode, setMaintenanceMode] = React.useState(
    siteSettings.maintenanceMode
  );
  const [savingSettings, setSavingSettings] = React.useState(false);

  // Masked Credentials Input State
  const [selectedCredKey, setSelectedCredKey] =
    React.useState<IntegrationCredentialKey>('STEADFAST_API_KEY');
  const [rawSecretInput, setRawSecretInput] = React.useState('');
  const [savingCred, setSavingCred] = React.useState(false);

  const handleSaveAboutPage = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAboutPage(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'update_about_contact_settings',
          patch: {
            titleBn: aboutTitleBn,
            titleEn: aboutTitleEn,
            subtitleBn: aboutSubtitleBn,
            subtitleEn: aboutSubtitleEn,
            storyTitleBn,
            storyTitleEn,
            storyParagraph1Bn: storyP1Bn,
            storyParagraph1En: storyP1En,
            storyParagraph2Bn: storyP2Bn,
            storyParagraph2En: storyP2En,
            warehouseAddressBn,
            warehouseAddressEn,
            helplineHoursBn,
            helplineHoursEn,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          text: 'কন্টাক্ট ও আমাদের পরিচিতি পেজের তথ্য সফলভাবে সংরক্ষিত হয়েছে।',
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          text: data.errorBn || 'সংরক্ষণ করতে সমস্যা হয়েছে।',
        });
      }
    } finally {
      setSavingAboutPage(false);
    }
  };

  const handleUpdateInquiryStatus = async (
    inquiryId: string,
    newStatus: 'unread' | 'replied' | 'resolved'
  ) => {
    setUpdatingInquiryId(inquiryId);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'update_inquiry_status',
          inquiryId,
          status: newStatus,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setFeedback({
          type: 'success',
          text: 'ইনকোয়ারি বার্তার স্ট্যাটাস পরিবর্তন করা হয়েছে।',
        });
        await onRefreshWorkspace();
      }
    } finally {
      setUpdatingInquiryId(null);
    }
  };

  const handleSaveBranding = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'update_branding_thresholds',
          patch: {
            bkashManualNumber,
            freeDeliveryThresholdPoisha: takaToPoisha(
              Number(freeDeliveryTaka) || 0
            ),
            globalEscrowHoldDays: Math.max(1, Number(escrowHoldDays) || 7),
            maintenanceMode,
          },
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
      };
      if (res.ok && data.success) {
        setFeedback({
          type: 'success',
          text: 'ব্র্যান্ডিং, থ্রেশহোল্ড এবং মেইনটেন্যান্স সেটিংস আপডেট হয়েছে।',
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          text: data.errorBn ?? 'সেটিংস সংরক্ষণ ব্যর্থ।',
        });
      }
    } finally {
      setSavingSettings(false);
    }
  };

  const handleSaveOrRevokeCredential = async (action: 'save' | 'revoke') => {
    setSavingCred(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'save_or_revoke_credential',
          keyName: selectedCredKey,
          action,
          rawSecretValue: rawSecretInput,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        errorBn?: string;
      };
      if (res.ok && data.success) {
        setRawSecretInput('');
        setFeedback({
          type: 'success',
          text:
            action === 'save'
              ? `${selectedCredKey} এনক্রিপ্টেড ভল্টে সংরক্ষিত হয়েছে (ব্রাউজারে কখনোই মূল মান ফেরত আসবে না)।`
              : `${selectedCredKey} প্রত্যাহার (Revoke) করা হয়েছে।`,
        });
        await onRefreshWorkspace();
      } else {
        setFeedback({
          type: 'error',
          text: data.errorBn ?? 'ক্রেডেনশিয়াল আপডেট ব্যর্থ।',
        });
      }
    } finally {
      setSavingCred(false);
    }
  };

  const handleRunCronJobNow = async (
    jobKey: ScheduledJobRecord['jobKey']
  ) => {
    setFeedback(null);
    const res = await fetch('/api/admin/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'run_scheduled_job_now',
        jobKey,
      }),
    });
    const data = (await res.json()) as {
      success: boolean;
      errorBn?: string;
      job?: ScheduledJobRecord;
    };
    if (res.ok && data.success && data.job) {
      setFeedback({
        type: 'success',
        text: `${data.job.nameBn}: ${data.job.lastOutputBn}`,
      });
      await onRefreshWorkspace();
    } else {
      setFeedback({
        type: 'error',
        text: data.errorBn ?? 'শিডিউলড জব রান ব্যর্থ।',
      });
    }
  };

  const handleDownloadBackupJson = () => {
    const payload = {
      exportedAt: new Date().toISOString(),
      brandNameBn: siteSettings.brandNameBn,
      siteSettings,
      maskedCredentials,
      scheduledJobs,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `bongoconsign-erp-backup-${new Date()
      .toISOString()
      .slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section className="space-y-6">
      <StorefrontContentPanel siteSettings={siteSettings} onRefresh={onRefreshWorkspace} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="text-xl font-bold text-ink">
            {locale === 'bn'
              ? 'সুপার অ্যাডমিন কন্ট্রোল সেন্টার, ক্রেডেনশিয়াল ভল্ট ও শিডিউলড জবস (Module L & R)'
              : 'Super Admin Control Center, Credential Vault & Scheduled Jobs (Module L & R)'}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {locale === 'bn'
              ? 'ডায়নামিক ব্র্যান্ডিং, মেইনটেন্যান্স মোড, মাস্কড এপিআই ক্রেডেনশিয়াল ভল্ট এবং ব্যাকগ্রাউন্ড ক্রন জবস'
              : 'Dynamic branding, maintenance mode, masked API credentials vault and background cron jobs'}
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDownloadBackupJson}
          leftIcon={<Download className="w-3.5 h-3.5" aria-hidden="true" />}
        >
          {locale === 'bn' ? 'সম্পূর্ণ JSON ব্যাকআপ এক্সপোর্ট' : 'Export Full JSON Backup'}
        </Button>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3 border rounded-[var(--radius-md)] bg-surface flex items-center justify-between gap-2 text-xs font-medium ${
            feedback.type === 'success'
              ? 'border-success text-success'
              : 'border-danger text-danger'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline cursor-pointer text-ink"
          >
            <LocalizedText source={"বন্ধ করুন"} area="admin" />{" "}</button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Dynamic Branding, Financial Thresholds & Maintenance Mode */}
        <Card
          surface="surface"
          padding="md"
          className="lg:col-span-5 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <Settings className="w-4 h-4" aria-hidden="true" />
              <span><LocalizedText source={"ডায়নামিক ব্র্যান্ডিং ও থ্রেশহোল্ড কনফিগারেশন"} area="admin" /></span>
            </h2>
            <Badge status={maintenanceMode ? 'danger' : 'success'}>
              {maintenanceMode ? 'Maintenance ON' : 'Storefront Live'}
            </Badge>
          </div>
          <form onSubmit={handleSaveBranding} className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="বিকাশ মার্চেন্ট নম্বর *"
                value={bkashManualNumber}
                onChange={(e) => setBkashManualNumber(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                label="ফ্রি ডেলিভারি থ্রেশহোল্ড (BDT)"
                type="number"
                value={freeDeliveryTaka}
                onChange={(e) => setFreeDeliveryTaka(e.target.value)}
              />
              <Input
                label="এসক্রো হোল্ড পিরিয়ড (দিন)"
                type="number"
                value={escrowHoldDays}
                onChange={(e) => setEscrowHoldDays(e.target.value)}
              />
            </div>
            <label className="flex items-center gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={maintenanceMode}
                onChange={(e) => setMaintenanceMode(e.target.checked)}
              />
              <span className="font-bold text-ink">
                <LocalizedText source={"মেইনটেন্যান্স মোড সক্রিয় করুন (Storefront Maintenance Banner)"} area="admin" />{" "}</span>
            </label>
            <Button
              type="submit"
              variant="primary"
              size="sm"
              disabled={savingSettings}
              className="w-full"
            >
              {savingSettings
                ? 'সংরক্ষণ হচ্ছে...'
                : 'ব্র্যান্ডিং ও থ্রেশহোল্ড সেভ করুন'}
            </Button>
          </form>
        </Card>

        {/* Masked Credentials Vault (Never Returns Raw Secret to Browser) */}
        <Card
          surface="surface"
          padding="md"
          className="lg:col-span-7 space-y-4"
        >
          <div className="flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <KeyRound className="w-4 h-4" aria-hidden="true" />
              <span><LocalizedText source={"মাস্কড ইন্টিগ্রেশন ক্রেডেনশিয়াল ভল্ট (Server-Side Masked)"} area="admin" /></span>
            </h2>
            <Badge status="info"><LocalizedText source={"Zero Raw Key Exposure"} area="admin" /></Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-xs items-end">
            <div className="sm:col-span-5">
              <label className="block font-medium text-ink mb-1">
                <LocalizedText source={"ইন্টিগ্রেশন কী নির্বাচন করুন"} area="admin" />{" "}</label>
              <select
                value={selectedCredKey}
                onChange={(e) =>
                  setSelectedCredKey(
                    e.target.value as IntegrationCredentialKey
                  )
                }
                className="w-full h-9 px-2 rounded-[var(--radius-md)] border border-border bg-bg text-ink font-mono"
              >
                {maskedCredentials.map((c) => (
                  <option key={c.keyName} value={c.keyName}>
                    {c.keyName}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-4">
              <Input
                label="নতুন সিক্রেট টোকেন / API Key"
                type="password"
                value={rawSecretInput}
                onChange={(e) => setRawSecretInput(e.target.value)}
                placeholder="sk_live_..."
              />
            </div>
            <div className="sm:col-span-3 flex gap-1.5">
              <Button
                type="button"
                variant="primary"
                size="sm"
                disabled={savingCred}
                onClick={() => void handleSaveOrRevokeCredential('save')}
              >
                <LocalizedText source={"Save"} area="admin" />{" "}</Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={savingCred}
                onClick={() => void handleSaveOrRevokeCredential('revoke')}
              >
                <LocalizedText source={"Revoke"} area="admin" />{" "}</Button>
            </div>
          </div>

          <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] max-h-64 overflow-y-auto text-xs">
            {maskedCredentials.map((cred) => (
              <div
                key={cred.keyName}
                className="p-2.5 bg-bg flex flex-wrap items-center justify-between gap-2"
              >
                <div className="space-y-0.5">
                  <p className="font-bold text-ink flex items-center gap-1.5">
                    <Lock className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{localizedField(cred, "labelBn", locale)}</span>
                    <span className="font-mono text-muted">
                      ({cred.keyName})
                    </span>
                  </p>
                  <p className="text-muted">{localizedField(cred, "setupGuideBn", locale)}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-ink bg-surface px-2 py-0.5 border border-border rounded-[var(--radius-sm)]">
                    {cred.maskedPreview}
                  </span>
                  <Badge status={cred.isConfigured ? 'success' : 'warning'}>
                    {localizedField(cred, "statusBadgeBn", locale)}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Scheduled Cron Jobs Dashboard */}
      <Card surface="surface" padding="md" className="space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-2">
          <h2 className="text-sm font-bold text-ink">
            <LocalizedText source={"শিডিউলড ব্যাকগ্রাউন্ড জবস ড্যাশবোর্ড (Scheduled Jobs & Manual Run Now)"} area="admin" />{" "}</h2>
          <Badge status="success">{scheduledJobs.length} {" "}<LocalizedText source={"ক্রন জবস"} area="admin" /></Badge>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
          {scheduledJobs.map((job) => (
            <div
              key={job.jobKey}
              className="p-3 border border-border rounded-[var(--radius-md)] bg-bg flex flex-col justify-between gap-3"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <p className="font-bold text-ink">{localizedField(job, "nameBn", locale)}</p>
                  <Badge
                    status={job.lastStatus === 'success' ? 'success' : 'info'}
                  >
                    {job.scheduleCron}
                  </Badge>
                </div>
                <p className="text-muted">{localizedField(job, "lastOutputBn", locale)}</p>
              </div>
              <div className="flex items-center justify-between pt-2 border-t border-border">
                <span className="font-mono text-[11px] text-muted">
                  {job.lastRunAt
                    ? `Last: ${new Date(job.lastRunAt).toLocaleTimeString('bn-BD')}`
                    : 'Not run yet'}
                </span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void handleRunCronJobNow(job.jobKey)}
                  leftIcon={
                    <Play className="w-3.5 h-3.5" aria-hidden="true" />
                  }
                >
                  <LocalizedText source={"Run Now"} area="admin" />{" "}</Button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* Customer Contact Inquiries Inbox */}
      <Card surface="surface" padding="md" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
          <div>
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-600" aria-hidden="true" />
              <span><LocalizedText source={"গ্রাহক ইনকোয়ারি ও ইনবক্স (Customer Inquiry Messages Inbox)"} area="admin" /></span>
            </h2>
            <p className="text-xs text-muted mt-0.5">
              <LocalizedText source={"স্টোরফ্রন্ট কন্টাক্ট ফর্ম থেকে কাস্টমারদের পাঠানো সকল বার্তা ও মেসেজ"} area="admin" />{" "}</p>
          </div>
          <div className="flex items-center gap-1.5">
            <Badge status="info">
              {inquiries.filter((i) => i.status === 'unread').length} {" "}<LocalizedText source={"টি অপঠিত বার্তা"} area="admin" />{" "}</Badge>
            <div className="flex border border-border rounded-[var(--radius-md)] overflow-hidden text-xs">
              {(['ALL', 'unread', 'replied', 'resolved'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setInquiryFilter(f)}
                  className={`px-2.5 py-1 text-[11px] font-semibold transition-colors cursor-pointer ${
                    inquiryFilter === f
                      ? 'bg-ink text-bg font-bold'
                      : 'bg-surface text-ink hover:bg-bg'
                  }`}
                >
                  {f === 'ALL'
                    ? 'সকল'
                    : f === 'unread'
                    ? 'অপঠিত'
                    : f === 'replied'
                    ? 'উত্তর দেওয়া'
                    : 'সমাধানকৃত'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {inquiries.length === 0 ? (
          <div className="p-6 text-center text-xs text-muted border border-dashed border-border rounded-[var(--radius-md)] bg-bg">
            <LocalizedText source={"এখনো কোনো কাস্টমার ইনকোয়ারি মেসেজ আসেনি।"} area="admin" />{" "}</div>
        ) : (
          <div className="space-y-3">
            {inquiries
              .filter((inq) => inquiryFilter === 'ALL' || inq.status === inquiryFilter)
              .map((inq) => {
                const cleanPhone = inq.phone.replace(/\D/g, '');
                const waUrl = `https://wa.me/88${cleanPhone.length === 11 ? cleanPhone : '0' + cleanPhone}`;

                return (
                  <div
                    key={inq.id}
                    className={`p-4 border rounded-[var(--radius-md)] transition-all ${
                      inq.status === 'unread'
                        ? 'border-emerald-500/50 bg-emerald-50/20 shadow-2xs'
                        : 'border-border bg-bg'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-ink">{inq.name}</span>
                        <a
                          href={`tel:${inq.phone}`}
                          className="font-mono text-xs font-semibold text-emerald-700 dark:text-emerald-400 hover:underline"
                        >
                          {inq.phone}
                        </a>
                        <span className="text-[11px] text-muted font-mono">
                          · {new Date(inq.createdAt).toLocaleString('bn-BD')}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <Badge
                          status={
                            inq.status === 'unread'
                              ? 'warning'
                              : inq.status === 'replied'
                              ? 'info'
                              : 'success'
                          }
                        >
                          {inq.status === 'unread'
                            ? 'অপঠিত (Unread)'
                            : inq.status === 'replied'
                            ? 'রিপ্লাইড (Replied)'
                            : 'সমাধানকৃত (Resolved)'}
                        </Badge>

                        <a
                          href={waUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-emerald-700 text-white font-semibold text-[11px] hover:bg-emerald-800 transition-colors inline-flex items-center gap-1"
                        >
                          <span><LocalizedText source={"WhatsApp"} area="admin" /></span>
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                    </div>

                    <div className="pt-2.5 space-y-1.5 text-xs">
                      <p className="font-bold text-ink"><LocalizedText source={"বিষয়:"} area="admin" />{" "}{inq.subject}</p>
                      <p className="p-3 border border-border rounded-[var(--radius-sm)] bg-surface text-ink leading-relaxed whitespace-pre-wrap">
                        {inq.message}
                      </p>

                      <div className="flex items-center justify-between gap-2 pt-1">
                        <span className="text-[11px] text-muted">
                          <LocalizedText source={"স্ট্যাটাস পরিবর্তন করুন:"} area="admin" />{" "}</span>
                        <div className="flex items-center gap-1.5">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={updatingInquiryId === inq.id}
                            onClick={() => void handleUpdateInquiryStatus(inq.id, 'unread')}
                          >
                            <LocalizedText source={"অপঠিত"} area="admin" />{" "}</Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            disabled={updatingInquiryId === inq.id}
                            onClick={() => void handleUpdateInquiryStatus(inq.id, 'replied')}
                          >
                            <LocalizedText source={"রিপ্লাই দেওয়া হয়েছে"} area="admin" />{" "}</Button>
                          <Button
                            type="button"
                            variant="primary"
                            size="sm"
                            disabled={updatingInquiryId === inq.id}
                            onClick={() => void handleUpdateInquiryStatus(inq.id, 'resolved')}
                          >
                            <LocalizedText source={"সমাধান"} area="admin" />{" "}</Button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        )}
      </Card>

      {/* Contact Page & About Us Content Editor */}
      <Card surface="surface" padding="md" className="space-y-4">
        <div className="border-b border-border pb-2">
          <h2 className="text-sm font-bold text-ink flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-600" aria-hidden="true" />
            <span><LocalizedText source={"কন্টাক্ট ও আমাদের পরিচিতি পেজ কনটেন্ট এডিটর (Page Content Editor)"} area="admin" /></span>
          </h2>
          <p className="text-xs text-muted mt-0.5">
            <LocalizedText source={"স্টোরফ্রন্টের \"যোগাযোগ ও পরিচিতি\" পেজের সকল টেক্সট, হেডলাইন, ঠিকানা ও হেল্পলাইন আওয়ার্স সরাসরি সম্পাদনা করুন"} area="admin" />{" "}</p>
        </div>

        <form onSubmit={handleSaveAboutPage} className="space-y-4 text-xs">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="পেজ টাইটেল (বাংলা) *"
              value={aboutTitleBn}
              onChange={(e) => setAboutTitleBn(e.target.value)}
              required
            />
            <Input
              label="Page Title (English) *"
              value={aboutTitleEn}
              onChange={(e) => setAboutTitleEn(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="পেজ সাবটাইটেল (বাংলা) *"
              value={aboutSubtitleBn}
              onChange={(e) => setAboutSubtitleBn(e.target.value)}
              required
            />
            <Input
              label="Page Subtitle (English) *"
              value={aboutSubtitleEn}
              onChange={(e) => setAboutSubtitleEn(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="গল্প ও দর্শন শিরোনাম (বাংলা) *"
              value={storyTitleBn}
              onChange={(e) => setStoryTitleBn(e.target.value)}
              required
            />
            <Input
              label="Story Title (English) *"
              value={storyTitleEn}
              onChange={(e) => setStoryTitleEn(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-ink mb-1">
                <LocalizedText source={"আমাদের গল্প প্যারাগ্রাফ ১ (বাংলা) *"} area="admin" />{" "}</label>
              <textarea
                rows={3}
                value={storyP1Bn}
                onChange={(e) => setStoryP1Bn(e.target.value)}
                required
                className="w-full p-2.5 rounded-[var(--radius-md)] border border-border bg-bg text-ink text-xs focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="block font-medium text-ink mb-1">
                <LocalizedText source={"Our Story Paragraph 1 (English) *"} area="admin" />{" "}</label>
              <textarea
                rows={3}
                value={storyP1En}
                onChange={(e) => setStoryP1En(e.target.value)}
                required
                className="w-full p-2.5 rounded-[var(--radius-md)] border border-border bg-bg text-ink text-xs focus:outline-none focus:border-ink"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium text-ink mb-1">
                <LocalizedText source={"আমাদের গল্প প্যারাগ্রাফ ২ (বাংলা) *"} area="admin" />{" "}</label>
              <textarea
                rows={3}
                value={storyP2Bn}
                onChange={(e) => setStoryP2Bn(e.target.value)}
                required
                className="w-full p-2.5 rounded-[var(--radius-md)] border border-border bg-bg text-ink text-xs focus:outline-none focus:border-ink"
              />
            </div>
            <div>
              <label className="block font-medium text-ink mb-1">
                <LocalizedText source={"Our Story Paragraph 2 (English) *"} area="admin" />{" "}</label>
              <textarea
                rows={3}
                value={storyP2En}
                onChange={(e) => setStoryP2En(e.target.value)}
                required
                className="w-full p-2.5 rounded-[var(--radius-md)] border border-border bg-bg text-ink text-xs focus:outline-none focus:border-ink"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="সেন্ট্রাল ওয়্যারহাউস ঠিকানা (বাংলা) *"
              value={warehouseAddressBn}
              onChange={(e) => setWarehouseAddressBn(e.target.value)}
              required
            />
            <Input
              label="Central Warehouse Address (English) *"
              value={warehouseAddressEn}
              onChange={(e) => setWarehouseAddressEn(e.target.value)}
              required
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input
              label="হেল্পলাইন কর্মঘণ্টা (বাংলা) *"
              value={helplineHoursBn}
              onChange={(e) => setHelplineHoursBn(e.target.value)}
              required
            />
            <Input
              label="Helpline Hours (English) *"
              value={helplineHoursEn}
              onChange={(e) => setHelplineHoursEn(e.target.value)}
              required
            />
          </div>

          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={savingAboutPage}
            className="w-full md:w-auto"
          >
            {savingAboutPage ? 'সংরক্ষণ হচ্ছে...' : 'কন্টাক্ট পেজ কনটেন্ট সেভ করুন'}
          </Button>
        </form>
      </Card>
    </section>
  );
}
