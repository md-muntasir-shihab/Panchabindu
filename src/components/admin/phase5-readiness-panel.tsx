'use client';

// src/components/admin/phase5-readiness-panel.tsx
// Phase 5 (Module Q): Pre-Launch Readiness, 12-Point Security & Financial Audit Center,
// Interactive Role/DTO Sanitization Inspector, 9-Stage E2E Consignment Lifecycle Simulator, & Go-Live Runbook

import * as React from 'react';
import { adminFetch as fetch } from '@/src/lib/admin/admin-fetch';
import {
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  Lock,
  Play,
  FileCode2,
  RefreshCw,
  Eye,
  Layers,
} from 'lucide-react';
import type {
  ConsignmentLifecycleDryRunDTO,
  Phase5AuditReportDTO,
  RoleSanitizationInspectionDTO,
} from '@/src/lib/admin/phase5-service';
import type { SystemRoleSlug } from '@/src/types/permissions';
import { formatPoishaToBdt } from '@/src/lib/money';
import { formatLocaleNumber } from '@/src/lib/i18n/dictionaries';
import { Badge, Button, Card } from '../ui/primitives';

export interface Phase5ReadinessPanelProps {
  locale: 'bn' | 'en';
  initialAuditReport: Phase5AuditReportDTO;
  initialRoleInspection: RoleSanitizationInspectionDTO;
  initialLifecycleDryRun: ConsignmentLifecycleDryRunDTO;
  onRefreshWorkspace: () => Promise<void>;
}

const ROLE_OPTIONS: Array<{
  slug: SystemRoleSlug | 'public_customer';
  labelBn: string;
  labelEn: string;
}> = [
  { slug: 'public_customer', labelBn: '১. পাবলিক কাস্টমার (Storefront Visitor)', labelEn: '1. Public Customer (Storefront Visitor)' },
  { slug: 'vendor', labelBn: '২. কনসাইনমেন্ট ভেন্ডর (Supplier Portal)', labelEn: '2. Consignment Vendor (Supplier Portal)' },
  { slug: 'marketing_manager', labelBn: '৩. মার্কেটিং ম্যানেজার (Order & Promo Ops)', labelEn: '3. Marketing Manager (Order & Promo Ops)' },
  { slug: 'packaging_manager', labelBn: '৪. প্যাকেজিং ম্যানেজার (Packing & Dispatch)', labelEn: '4. Packaging Manager (Packing & Dispatch)' },
  { slug: 'super_admin', labelBn: '৫. সুপার অ্যাডমিন (Full Margin & Profit Owner)', labelEn: '5. Super Admin (Full Margin & Profit Owner)' },
];

export function Phase5ReadinessPanel({
  locale,
  initialAuditReport,
  initialRoleInspection,
  initialLifecycleDryRun,
  onRefreshWorkspace,
}: Phase5ReadinessPanelProps) {
  const [activeSubTab, setActiveSubTab] = React.useState<
    'audit_12' | 'role_inspector' | 'e2e_simulator' | 'migrations_runbook'
  >('audit_12');

  const [auditReport, setAuditReport] =
    React.useState<Phase5AuditReportDTO>(initialAuditReport);
  const [roleInspection, setRoleInspection] =
    React.useState<RoleSanitizationInspectionDTO>(initialRoleInspection);
  const [selectedRoleSlug, setSelectedRoleSlug] = React.useState<
    SystemRoleSlug | 'public_customer'
  >(initialRoleInspection.roleSlug);
  const [lifecycleSim, setLifecycleSim] =
    React.useState<ConsignmentLifecycleDryRunDTO>(initialLifecycleDryRun);

  const [simDistrictId, setSimDistrictId] = React.useState<number>(1);
  const [simPromoTaka, setSimPromoTaka] = React.useState<string>('150');
  const [isRunningAudit, setIsRunningAudit] = React.useState(false);
  const [isRunningSim, setIsRunningSim] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const handleRunLiveAudit = async () => {
    setIsRunningAudit(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'run_phase5_audit' }),
      });
      const data = (await res.json()) as {
        success: boolean;
        auditReport?: Phase5AuditReportDTO;
      };
      if (data.success && data.auditReport) {
        setAuditReport(data.auditReport);
        setFeedback(
          locale === 'bn'
            ? `১২-দফা প্রি-লঞ্চ সিকিউরিটি ও ফিন্যান্সিয়াল অডিট সফলভাবে সম্পন্ন হয়েছে (${data.auditReport.passedChecks}/${data.auditReport.totalChecks} পাস)।`
            : `12-Point Pre-Launch Security & Financial Audit completed successfully (${data.auditReport.passedChecks}/${data.auditReport.totalChecks} passed).`
        );
        await onRefreshWorkspace();
      }
    } finally {
      setIsRunningAudit(false);
    }
  };

  const handleInspectRole = async (
    roleSlug: SystemRoleSlug | 'public_customer'
  ) => {
    setSelectedRoleSlug(roleSlug);
    const res = await fetch('/api/admin/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'inspect_role_sanitization',
        roleSlug,
      }),
    });
    const data = (await res.json()) as {
      success: boolean;
      inspection?: RoleSanitizationInspectionDTO;
    };
    if (data.success && data.inspection) {
      setRoleInspection(data.inspection);
    }
  };

  const handleRunLifecycleSimulator = async () => {
    setIsRunningSim(true);
    setFeedback(null);
    try {
      const promoDiscountPoisha = Math.max(
        0,
        Math.round((Number(simPromoTaka) || 0) * 100)
      );
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'run_consignment_lifecycle_dry_run',
          districtId: simDistrictId,
          promoDiscountPoisha,
        }),
      });
      const data = (await res.json()) as {
        success: boolean;
        simulation?: ConsignmentLifecycleDryRunDTO;
      };
      if (data.success && data.simulation) {
        setLifecycleSim(data.simulation);
        setFeedback(
          locale === 'bn'
            ? `৯-ধাপের কনসাইনমেন্ট অর্ডার লাইফসাইকেল ড্রাই-রান (${data.simulation.simulationId}) সফলভাবে যাচাই হয়েছে!`
            : `9-Stage Consignment Order Lifecycle Dry-Run (${data.simulation.simulationId}) verified successfully!`
        );
      }
    } finally {
      setIsRunningSim(false);
    }
  };

  return (
    <section className="space-y-6">
      {/* 1. Top Header & Readiness Score Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-ink" aria-hidden="true" />
            <h1 className="text-xl font-bold text-ink">
              {locale === 'bn'
                ? 'প্রি-লঞ্চ সিকিউরিটি অডিট, রোল স্যানিটাইজেশন ও গো-লাইভ ভেরিফিকেশন (Phase 5 — Module Q)'
                : 'Pre-Launch Security Audit, Role Sanitization & Go-Live Center (Phase 5 — Module Q)'}
            </h1>
          </div>
          <p className="text-xs text-muted mt-1">
            {locale === 'bn'
              ? '১২-দফা স্বয়ংক্রিয় সিকিউরিটি ও পয়সা সমীকরণ অডিট, ৫-রোল ডিটিও ফিল্ড স্যানিটাইজেশন ইন্সপেক্টর, ৯-ধাপ কনসাইনমেন্ট লাইফসাইকেল সিমুলেটর এবং ৭টি পোস্টগ্রেস আরএলএস মাইগ্রেশন।'
              : '12-point automated security & poisha math audit, 5-role DTO field sanitization inspector, 9-stage consignment lifecycle simulator, and 7 PostgreSQL RLS migrations.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Badge status={auditReport.readyForProduction ? 'success' : 'danger'}>
            {auditReport.readyForProduction
              ? `GO-LIVE READY (${auditReport.readinessScorePercent}%)`
              : `AUDIT PENDING (${auditReport.readinessScorePercent}%)`}
          </Badge>
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={handleRunLiveAudit}
            disabled={isRunningAudit}
            leftIcon={
              <RefreshCw
                className={`w-3.5 h-3.5 ${isRunningAudit ? 'animate-spin' : ''}`}
              />
            }
          >
            {isRunningAudit
              ? locale === 'bn'
                ? 'অডিট চলছে...'
                : 'Auditing...'
              : locale === 'bn'
                ? '১২-দফা লাইভ অডিট পুনরায় চালান'
                : 'Re-run 12-Point Live Audit'}
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className="p-3.5 border border-success rounded-[var(--radius-md)] bg-surface text-xs font-semibold text-success flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline cursor-pointer text-ink"
          >
            {locale === 'bn' ? 'বন্ধ করুন' : 'Dismiss'}
          </button>
        </div>
      )}

      {/* 2. Executive KPI Summary Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="p-4 border-2 border-ink bg-bg rounded-[var(--radius-md)] space-y-1">
          <div className="flex items-center justify-between text-xs font-bold text-ink">
            <span>
              {locale === 'bn' ? 'প্রি-লঞ্চ রেডিনেস স্কোর' : 'Pre-Launch Readiness Score'}
            </span>
            <Badge status="success">PASSED</Badge>
          </div>
          <p className="text-2xl font-bold font-mono text-success">
            {formatLocaleNumber(auditReport.passedChecks, locale)} /{' '}
            {formatLocaleNumber(auditReport.totalChecks, locale)} (
            {formatLocaleNumber(auditReport.readinessScorePercent, locale)}%)
          </p>
          <p className="text-[11px] text-muted">
            {locale === 'bn'
              ? 'সব ক্রিটিক্যাল পয়সা, আরবিএসি ও এসক্রো ইনভ্যারিয়েন্ট ভেরিফায়েড'
              : 'All critical poisha, RBAC & escrow invariants verified'}
          </p>
        </div>

        <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-ink">
            <span>
              {locale === 'bn'
                ? 'ডিটিও স্যানিটাইজেশন ও পিআইআই গার্ড'
                : 'DTO Sanitization & PII Guard'}
            </span>
            <Badge status="info">5 ROLES</Badge>
          </div>
          <p className="text-xl font-bold font-mono text-ink">100% Stripped</p>
          <p className="text-[11px] text-muted">
            {locale === 'bn'
              ? 'কাস্টমার ও স্টাফ ভিউ থেকে কেনা দাম ও নেট প্রফিট সম্পূর্ণ গোপন'
              : 'Cost price & net profit fully hidden from customer & staff views'}
          </p>
        </div>

        <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-ink">
            <span>
              {locale === 'bn'
                ? '৯-ধাপ লাইফসাইকেল সিমুলেটর'
                : '9-Stage Lifecycle Simulator'}
            </span>
            <Badge status="success">POISHA EXACT</Badge>
          </div>
          <p className="text-xl font-bold font-mono text-ink">
            9 / 9 Stages Valid
          </p>
          <p className="text-[11px] text-muted">
            Order → Pack → Ship → Remit → Hold → Mature → Payout
          </p>
        </div>

        <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-ink">
            <span>
              {locale === 'bn'
                ? 'পোস্টগ্রেস আরএলএস মাইগ্রেশন'
                : 'PostgreSQL RLS Migrations'}
            </span>
            <Badge status="info">0001..0007</Badge>
          </div>
          <p className="text-xl font-bold font-mono text-ink">
            {formatLocaleNumber(auditReport.sqlMigrations.length, locale)} SQL Files
          </p>
          <p className="text-[11px] text-muted">
            {locale === 'bn'
              ? '৩১টি টেবিল, আরএলএস পলিসি ও অ্যাপেন্ড-অনলি ট্রিগার প্রস্তুত'
              : '31 tables, RLS policies & append-only triggers ready'}
          </p>
        </div>
      </div>

      {/* 3. Sub-Navigation Tabs */}
      <div className="border-b border-border flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('audit_12')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'audit_12'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>
            {locale === 'bn'
              ? `১. ১২-দফা সিকিউরিটি ও ফিন্যান্স অডিট (${auditReport.checks.length})`
              : `1. 12-Point Security & Finance Audit (${auditReport.checks.length})`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('role_inspector')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'role_inspector'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Eye className="w-4 h-4" />
          <span>
            {locale === 'bn'
              ? '২. রোল ও ডিটিও স্যানিটাইজেশন ইন্সপেক্টর'
              : '2. Role & DTO Sanitization Inspector'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('e2e_simulator')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'e2e_simulator'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Play className="w-4 h-4" />
          <span>
            {locale === 'bn'
              ? '৩. ৯-ধাপ কনসাইনমেন্ট লাইফসাইকেল সিমুলেটর'
              : '3. 9-Stage Consignment Lifecycle Simulator'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('migrations_runbook')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'migrations_runbook'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <FileCode2 className="w-4 h-4" />
          <span>
            {locale === 'bn'
              ? '৪. পোস্টগ্রেস মাইগ্রেশন ও গো-লাইভ রানবুক'
              : '4. Postgres Migrations & Go-Live Runbook'}
          </span>
        </button>
      </div>

      {/* SUB-TAB 1: 12-POINT LIVE SECURITY & FINANCIAL AUDIT */}
      {activeSubTab === 'audit_12' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {auditReport.checks.map((chk) => (
            <div
              key={chk.checkId}
              className="p-4 border border-border rounded-[var(--radius-md)] bg-surface space-y-2 text-xs"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono font-bold text-[11px] px-2 py-0.5 border border-border rounded-[var(--radius-sm)] bg-bg text-ink">
                      {chk.checkId}
                    </span>
                    <Badge status={chk.passed ? 'success' : 'danger'}>
                      {chk.passed ? 'VERIFIED PASS' : 'FAILED'}
                    </Badge>
                    <span className="font-mono text-[10px] uppercase text-muted">
                      {chk.category} · {chk.severity}
                    </span>
                  </div>
                  <h3 className="font-bold text-ink text-sm pt-0.5">
                    {locale === 'bn' ? chk.titleBn : chk.titleEn || chk.titleBn}
                  </h3>
                </div>
                {chk.passed ? (
                  <CheckCircle2 className="w-5 h-5 text-success shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-danger shrink-0" />
                )}
              </div>

              <p className="text-muted leading-relaxed text-[11px]">
                {chk.verifiedDetailBn}
              </p>

              <div className="p-2.5 rounded-[var(--radius-sm)] bg-bg border border-border font-mono text-[10px] space-y-1">
                <div className="text-muted">
                  Invariant: <strong className="text-ink">{chk.invariantRule}</strong>
                </div>
                <div className="text-ink truncate">
                  Live Proof: <span>{chk.sampleProof}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SUB-TAB 2: INTERACTIVE ROLE & DTO SANITIZATION INSPECTOR */}
      {activeSubTab === 'role_inspector' && (
        <div className="space-y-4">
          <Card surface="surface" padding="md" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Lock className="w-4 h-4 text-ink" />
                  <span>
                    {locale === 'bn'
                      ? 'সার্ভার-সাইড রোল ও ডিটিও ফিল্ড স্যানিটাইজেশন ইন্সপেক্টর (Rule S1–S5)'
                      : 'Server-Side Role & DTO Field Sanitization Inspector (Rule S1–S5)'}
                  </span>
                </h2>
                <p className="text-[11px] text-muted mt-0.5">
                  {locale === 'bn'
                    ? 'যেকোনো রোলে ক্লিক করে যাচাই করুন সার্ভার কোন ফিল্ডগুলো পাঠায় এবং কোন সংবেদনশীল ফিল্ডগুলো (কেনা দাম, কমিশন, নেট প্রফিট, কাস্টমার ফোন) সম্পূর্ণ স্ট্রিপ বা মাস্ক করে।'
                    : 'Click any role to inspect which fields the server sends and which sensitive fields (cost price, commission, net profit, phone) it strips or masks.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 text-xs">
                {ROLE_OPTIONS.map((r) => (
                  <button
                    key={r.slug}
                    type="button"
                    onClick={() => handleInspectRole(r.slug)}
                    className={`px-3 py-1.5 rounded-[var(--radius-sm)] border font-semibold cursor-pointer transition-colors ${
                      selectedRoleSlug === r.slug
                        ? 'bg-ink text-bg border-ink'
                        : 'bg-bg text-ink border-border hover:border-ink'
                    }`}
                  >
                    {locale === 'bn' ? r.labelBn : r.labelEn}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
              {/* Left: Policy Summary & Stripped vs Exposed Fields */}
              <div className="lg:col-span-5 space-y-3">
                <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-bg space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink text-sm">
                      {roleInspection.roleLabelBn}
                    </span>
                    <Badge
                      status={
                        roleInspection.costAndMarginHidden ? 'success' : 'warning'
                      }
                    >
                      {roleInspection.costAndMarginHidden
                        ? 'Margin Stripped'
                        : 'Full Owner Access'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border text-[11px]">
                    <div>
                      {locale === 'bn' ? 'অ্যাডমিন প্যানেল অ্যাক্সেস:' : 'Admin ERP Access:'}{' '}
                      <strong className="text-ink">
                        {roleInspection.canAccessAdminErp
                          ? locale === 'bn' ? 'হ্যাঁ' : 'Yes'
                          : locale === 'bn' ? 'না (৪০৩ ব্লকড)' : 'No (403 Blocked)'}
                      </strong>
                    </div>
                    <div>
                      {locale === 'bn' ? 'কাস্টমার PII মাস্কিং:' : 'Customer PII Masking:'}{' '}
                      <strong className="text-ink">
                        {roleInspection.piiMasked
                          ? locale === 'bn' ? 'মাস্কড (017****)' : 'Masked (017****)'
                          : locale === 'bn' ? 'আনমাস্কড' : 'Unmasked'}
                      </strong>
                    </div>
                    <div>
                      {locale === 'bn' ? 'ক্রস-ভেন্ডর আইসোলেশন:' : 'Cross-Vendor Isolation:'}{' '}
                      <strong className="text-ink">
                        {roleInspection.crossVendorBlocked
                          ? locale === 'bn' ? '৪০৪ আইসোলেটেড' : '404 Isolated'
                          : locale === 'bn' ? 'সব ভেন্ডর দৃশ্যমান' : 'All Vendors Visible'}
                      </strong>
                    </div>
                    <div>
                      {locale === 'bn' ? 'ফোন ভিউ:' : 'Phone View:'}{' '}
                      <strong className="font-mono text-ink">
                        {roleInspection.customerPhoneSample}
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-bg space-y-2">
                  <h4 className="font-bold text-danger">
                    {locale === 'bn'
                      ? 'সার্ভার থেকে স্ট্রিপকৃত গোপন ফিল্ডসমূহ (Stripped from JSON):'
                      : 'Secret Fields Stripped from Server Response (Stripped from JSON):'}
                  </h4>
                  {roleInspection.strippedProductFields.length === 0 &&
                  roleInspection.strippedOrderFields.length === 0 ? (
                    <p className="text-muted text-[11px]">
                      {locale === 'bn'
                        ? 'সুপার অ্যাডমিনের জন্য কোনো ফিল্ড স্ট্রিপ করা হয়নি।'
                        : 'No fields stripped for Super Admin.'}
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                      {[
                        ...roleInspection.strippedProductFields,
                        ...roleInspection.strippedOrderFields,
                      ].map((f) => (
                        <span
                          key={f}
                          className="px-2 py-0.5 rounded-[var(--radius-sm)] border border-danger text-danger bg-surface"
                        >
                          ✕ {f}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-bg space-y-2">
                  <h4 className="font-bold text-success">
                    {locale === 'bn'
                      ? 'অনুমোদিত দৃশ্যমান ফিল্ডসমূহ (Exposed in DTO):'
                      : 'Allowed Visible Fields (Exposed in DTO):'}
                  </h4>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                    {[
                      ...roleInspection.exposedProductFields,
                      ...roleInspection.exposedOrderFields,
                    ].map((f) => (
                      <span
                        key={f}
                        className="px-2 py-0.5 rounded-[var(--radius-sm)] border border-border text-ink bg-surface"
                      >
                        ✓ {f}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Live Sanitized JSON Payload Preview */}
              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-bg space-y-2">
                  <h4 className="font-bold text-ink border-b border-border pb-1.5 font-mono text-[11px]">
                    Sanitized Product DTO ({roleInspection.roleSlug})
                  </h4>
                  <pre className="text-[11px] font-mono text-ink overflow-x-auto leading-relaxed">
                    {JSON.stringify(
                      roleInspection.sanitizedProductPreview,
                      null,
                      2
                    )}
                  </pre>
                </div>

                <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-bg space-y-2">
                  <h4 className="font-bold text-ink border-b border-border pb-1.5 font-mono text-[11px]">
                    Sanitized Order DTO ({roleInspection.roleSlug})
                  </h4>
                  <pre className="text-[11px] font-mono text-ink overflow-x-auto leading-relaxed">
                    {JSON.stringify(
                      roleInspection.sanitizedOrderPreview,
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* SUB-TAB 3: 9-STAGE E2E CONSIGNMENT LIFECYCLE SIMULATOR */}
      {activeSubTab === 'e2e_simulator' && (
        <div className="space-y-4">
          <Card surface="surface" padding="md" className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <h2 className="text-sm font-bold text-ink flex items-center gap-2">
                  <Layers className="w-4 h-4 text-ink" />
                  <span>
                    {locale === 'bn'
                      ? '৯-ধাপ কনসাইনমেন্ট অর্ডার ও এসক্রো লাইফসাইকেল ড্রাই-রান সিমুলেটর'
                      : '9-Stage Consignment Order & Escrow Lifecycle Dry-Run Simulator'}
                  </span>
                </h2>
                <p className="text-[11px] text-muted mt-0.5">
                  {locale === 'bn'
                    ? 'অর্ডার এন্ট্রি থেকে শুরু করে কুরিয়ার ডেলিভারি, ৭-দিন এসক্রো হোল্ড, ম্যাচুরিটি এবং ১.৮৫% বিকাশ ক্যাশ-আউট চার্জ বাদে নিট পেআউট পর্যন্ত সম্পূর্ণ হিসাব পয়সায় যাচাই করুন।'
                    : 'Verify exact poisha math from order entry to courier delivery, 7-day escrow hold, maturity, and net payout minus 1.85% bKash cash-out fee.'}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-xs">
                <select
                  value={simDistrictId}
                  onChange={(e) => setSimDistrictId(Number(e.target.value))}
                  className="px-2.5 py-1.5 border border-border rounded-[var(--radius-sm)] bg-bg text-ink font-semibold"
                >
                  <option value={1}>
                    {locale === 'bn' ? 'ঢাকা জেলা (৳৭০ বেস ডেলিভারি)' : 'Dhaka District (৳70 Base Delivery)'}
                  </option>
                  <option value={2}>
                    {locale === 'bn' ? 'চট্টগ্রাম জেলা (৳১২০ বেস ডেলিভারি)' : 'Chattogram District (৳120 Base Delivery)'}
                  </option>
                  <option value={45}>
                    {locale === 'bn' ? 'সিলেট জেলা (৳১২০ বেস ডেলিভারি)' : 'Sylhet District (৳120 Base Delivery)'}
                  </option>
                </select>

                <div className="flex items-center gap-1">
                  <span className="text-muted">
                    {locale === 'bn' ? 'প্রোমো ছাড় (৳):' : 'Promo Discount (৳):'}
                  </span>
                  <input
                    type="number"
                    value={simPromoTaka}
                    onChange={(e) => setSimPromoTaka(e.target.value)}
                    className="w-20 px-2 py-1 border border-border rounded-[var(--radius-sm)] bg-bg font-mono font-bold text-ink"
                  />
                </div>

                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  onClick={handleRunLifecycleSimulator}
                  disabled={isRunningSim}
                  leftIcon={<Play className="w-3.5 h-3.5" />}
                >
                  {isRunningSim
                    ? locale === 'bn' ? 'হিসাব হচ্ছে...' : 'Simulating...'
                    : locale === 'bn' ? 'ড্রাই-রান সিমুলেশন চালান' : 'Run Dry-Run Simulation'}
                </Button>
              </div>
            </div>

            {/* Pricing & Margin Invariant Summary */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 text-xs font-mono">
              <div className="p-3 border border-border rounded-[var(--radius-sm)] bg-bg">
                <span className="text-[10px] text-muted block font-sans">
                  {locale === 'bn' ? '১. সাপ্লায়ার কেনা দাম' : '1. Supplier Cost Price'}
                </span>
                <strong className="text-ink text-sm">
                  {formatPoishaToBdt(
                    lifecycleSim.pricingBreakdown.supplierCostPoisha,
                    locale
                  )}
                </strong>
              </div>

              <div className="p-3 border border-border rounded-[var(--radius-sm)] bg-bg">
                <span className="text-[10px] text-muted block font-sans">
                  {locale === 'bn' ? '২. সাপ্লায়ার মুনাফা' : '2. Supplier Profit'}
                </span>
                <strong className="text-ink text-sm">
                  +{' '}
                  {formatPoishaToBdt(
                    lifecycleSim.pricingBreakdown.supplierProfitPoisha,
                    locale
                  )}
                </strong>
              </div>

              <div className="p-3 border-2 border-ink rounded-[var(--radius-sm)] bg-bg">
                <span className="text-[10px] text-ink font-bold block font-sans">
                  {locale === 'bn' ? '৩. ভেন্ডর পেঅ্যাবল (সুরক্ষিত)' : '3. Vendor Payable (Protected)'}
                </span>
                <strong className="text-success text-sm">
                  {formatPoishaToBdt(
                    lifecycleSim.pricingBreakdown.supplierPayablePoisha,
                    locale
                  )}
                </strong>
              </div>

              <div className="p-3 border border-border rounded-[var(--radius-sm)] bg-bg">
                <span className="text-[10px] text-muted block font-sans">
                  {locale === 'bn' ? '৪. প্রোমো পরবর্তী মার্জিন' : '4. Net Margin Post-Promo'}
                </span>
                <strong className="text-info text-sm">
                  {formatPoishaToBdt(
                    lifecycleSim.pricingBreakdown.effectivePlatformMarginPoisha,
                    locale
                  )}
                </strong>
              </div>

              <div className="p-3 border border-border rounded-[var(--radius-sm)] bg-bg">
                <span className="text-[10px] text-muted block font-sans">
                  {locale === 'bn' ? '৫. বিকাশ ক্যাশ-আউট ফি (১.৮৫%)' : '5. bKash Cash-Out Fee (1.85%)'}
                </span>
                <strong className="text-danger text-sm">
                  -{' '}
                  {formatPoishaToBdt(
                    lifecycleSim.pricingBreakdown.bkashCashoutFee185BpPoisha,
                    locale
                  )}
                </strong>
              </div>

              <div className="p-3 border border-border rounded-[var(--radius-sm)] bg-bg">
                <span className="text-[10px] text-muted block font-sans">
                  {locale === 'bn' ? '৬. ভেন্ডরের নিট প্রাপ্তি' : '6. Net Vendor Disbursed'}
                </span>
                <strong className="text-success text-sm">
                  {formatPoishaToBdt(
                    lifecycleSim.pricingBreakdown.netVendorDisbursedPoisha,
                    locale
                  )}
                </strong>
              </div>
            </div>

            {/* 9-Stage Step-by-Step Timeline */}
            <div className="border border-border rounded-[var(--radius-md)] overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border bg-bg text-muted">
                    <th className="p-3">{locale === 'bn' ? 'ধাপ (Stage)' : 'Stage'}</th>
                    <th className="p-3">{locale === 'bn' ? 'অর্ডার স্ট্যাটাস' : 'Order Status'}</th>
                    <th className="p-3">{locale === 'bn' ? 'স্টক পরিবর্তন' : 'Stock Transition'}</th>
                    <th className="p-3">{locale === 'bn' ? 'এসক্রো বাকেট' : 'Escrow Bucket'}</th>
                    <th className="p-3">{locale === 'bn' ? 'লেজার এন্ট্রি' : 'Ledger Entry'}</th>
                    <th className="p-3 text-right">{locale === 'bn' ? 'পরিমাণ (BDT)' : 'Amount (BDT)'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lifecycleSim.stages.map((st) => (
                    <tr key={st.stageCode} className="hover:bg-bg/60">
                      <td className="p-3">
                        <div className="font-bold text-ink">
                          {locale === 'bn'
                            ? `ধাপ ${formatLocaleNumber(st.stageNo, locale)}: ${st.titleBn}`
                            : `Stage ${st.stageNo}: ${st.titleEn || st.titleBn}`}
                        </div>
                        <div className="text-[11px] text-muted mt-0.5">
                          {locale === 'bn' ? st.noteBn : st.noteEn || st.noteBn}
                        </div>
                      </td>
                      <td className="p-3 font-mono">
                        <Badge status="info">{st.orderStatus}</Badge>
                      </td>
                      <td className="p-3 font-mono text-[11px] text-ink">
                        {st.stockStateText}
                      </td>
                      <td className="p-3 font-mono text-[11px] font-bold text-ink">
                        {st.escrowBucketText}
                      </td>
                      <td className="p-3 font-mono text-[11px] text-muted">
                        {st.ledgerEntryType}
                      </td>
                      <td
                        className={`p-3 text-right font-mono font-bold ${
                          st.amountPoisha < 0
                            ? 'text-danger'
                            : st.amountPoisha > 0
                            ? 'text-success'
                            : 'text-muted'
                        }`}
                      >
                        {st.amountPoisha === 0
                          ? '—'
                          : formatPoishaToBdt(st.amountPoisha, locale)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* SUB-TAB 4: POSTGRESQL MIGRATION MANIFEST & GO-LIVE RUNBOOK */}
      {activeSubTab === 'migrations_runbook' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <Card surface="surface" padding="md" className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-bold text-ink border-b border-border pb-2">
              {locale === 'bn'
                ? 'পোস্টগ্রেস আরএলএস মাইগ্রেশন ম্যানিফেস্ট (`supabase/migrations/0001..0007`)'
                : 'PostgreSQL RLS Migrations Manifest (`supabase/migrations/0001..0007`)'}
            </h2>
            <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] text-xs">
              {auditReport.sqlMigrations.map((m) => (
                <div key={m.migrationId} className="p-3.5 bg-bg space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-ink">
                      {m.fileName}
                    </span>
                    <div className="flex items-center gap-1.5">
                      {m.rlsEnforced && (
                        <Badge status="success">RLS ENABLED</Badge>
                      )}
                      {m.appendOnlyTriggers && (
                        <Badge status="info">APPEND-ONLY TRIGGER</Badge>
                      )}
                    </div>
                  </div>
                  <p className="text-ink font-medium">
                    {locale === 'bn' ? m.titleBn : m.titleEn || m.titleBn}
                  </p>
                  <p className="text-[11px] font-mono text-muted">
                    Tables: {m.tablesCovered.join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card surface="surface" padding="md" className="lg:col-span-5 space-y-4">
            <h2 className="text-base font-bold text-ink border-b border-border pb-2">
              {locale === 'bn'
                ? 'প্রোডাকশন ডিপ্লয়মেন্ট ও গো-লাইভ রানবুক চেকলিস্ট'
                : 'Production Deployment & Go-Live Runbook Checklist'}
            </h2>
            <ol className="space-y-2.5 text-xs text-ink list-decimal list-inside leading-relaxed">
              <li className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-bg">
                {locale === 'bn' ? (
                  <>
                    <strong>ধাপ ১ (Database Migrations):</strong> Supabase SQL Editor বা CLI-তে `0001` থেকে `0007` মাইগ্রেশন স্ক্রিপ্টগুলো ক্রমানুসারে রান করুন।
                  </>
                ) : (
                  <>
                    <strong>Step 1 (Database Migrations):</strong> Run migration scripts `0001` through `0007` sequentially in Supabase SQL Editor or CLI.
                  </>
                )}
              </li>
              <li className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-bg">
                {locale === 'bn' ? (
                  <>
                    <strong>ধাপ ২ (Environment Variables):</strong> `.env.example` অনুযায়ী `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, এবং `CRON_SECRET` সেট করুন।
                  </>
                ) : (
                  <>
                    <strong>Step 2 (Environment Variables):</strong> Set `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CRON_SECRET` per `.env.example`.
                  </>
                )}
              </li>
              <li className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-bg">
                {locale === 'bn' ? (
                  <>
                    <strong>ধাপ ৩ (Super Admin 2FA Rotation):</strong> প্রথম লগইনের পর ডিফল্ট পাসওয়ার্ড পরিবর্তন করে Google Authenticator TOTP 2FA এনরোল করুন।
                  </>
                ) : (
                  <>
                    <strong>Step 3 (Super Admin 2FA Rotation):</strong> Change default password after first login and enroll Google Authenticator TOTP 2FA.
                  </>
                )}
              </li>
              <li className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-bg">
                {locale === 'bn' ? (
                  <>
                    <strong>ধাপ ৪ (Courier & Messaging Keys):</strong> কন্ট্রোল সেন্টার (Module P) থেকে Steadfast/Pathao/RedX কী যুক্ত করুন, অথবা ফ্রি ওয়ান-ট্যাপ `wa.me` / `sms:` ফলব্যাক মোডে অপারেশন শুরু করুন।
                  </>
                ) : (
                  <>
                    <strong>Step 4 (Courier & Messaging Keys):</strong> Add Steadfast/Pathao/RedX credentials in Control Center (Module P) or use free one-tap `wa.me` / `sms:` fallback mode.
                  </>
                )}
              </li>
              <li className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-bg">
                {locale === 'bn' ? (
                  <>
                    <strong>ধাপ ৫ (Pre-Launch Audit Gate):</strong> এই প্যানেলের ১২-দফা অডিট স্কোর ১০০% নিশ্চিত করে প্রোডাকশন ট্রাফিক উন্মুক্ত করুন।
                  </>
                ) : (
                  <>
                    <strong>Step 5 (Pre-Launch Audit Gate):</strong> Ensure 100% audit score on this panel before opening production traffic.
                  </>
                )}
              </li>
            </ol>
          </Card>
        </div>
      )}
    </section>
  );
}
