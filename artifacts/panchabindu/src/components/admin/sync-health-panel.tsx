'use client';

import * as React from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  Copy,
  Database,
  Download,
  FileSpreadsheet,
  RefreshCw,
  Server,
  ShieldAlert,
} from 'lucide-react';
import { adminFetch } from '@/lib/admin/admin-fetch';
import type { SheetsSyncJobRecord } from '@/lib/admin/phase4c-service';
import { formatLocaleDateTime, formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { Badge, Button, Card, EmptyState, Skeleton } from '../ui/primitives';

type HealthStatus = 'healthy' | 'warning' | 'degraded' | 'not_configured';

interface HealthCheckItem {
  key: string;
  labelBn: string;
  labelEn: string;
  category: 'infrastructure' | 'integrations' | 'automation';
  status: HealthStatus;
  detailBn: string;
  detailEn: string;
  latencyMs?: number | null;
  actionHintBn?: string;
  actionHintEn?: string;
}

interface SystemHealthPayload {
  success: boolean;
  checkedAt: string;
  runtime: {
    nodeEnv: string;
    isVercel: boolean;
    vercelEnv: string | null;
    vercelRegion: string | null;
    persistenceMode: 'postgres_supabase' | 'local_json_dev';
  };
  summary: {
    healthy: number;
    warning: number;
    degraded: number;
    notConfigured: number;
  };
  checks: HealthCheckItem[];
}

export interface SyncHealthPanelProps {
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  sheetsSyncHistory: SheetsSyncJobRecord[];
  onRefreshWorkspace: () => Promise<void>;
}

const APPS_SCRIPT_CODE_GS = `function doPost(e) {
  var payload = JSON.parse(e.postData.contents || '{}');
  var expectedSecret = PropertiesService.getScriptProperties().getProperty('PANCHABINDU_SHARED_SECRET');
  if (expectedSecret && payload.sharedSecret !== expectedSecret) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var tabs = payload.tabs || {};
  Object.keys(tabs).forEach(function (tabName) {
    var rows = tabs[tabName] || [];
    var sheet = ss.getSheetByName(tabName) || ss.insertSheet(tabName);
    sheet.clearContents();
    if (!rows.length) return;
    var headers = Object.keys(rows[0]);
    var values = [headers].concat(rows.map(function (r) {
      return headers.map(function (h) { return r[h] == null ? '' : r[h]; });
    }));
    sheet.getRange(1, 1, values.length, headers.length).setValues(values);
  });
  return ContentService.createTextOutput(JSON.stringify({ ok: true, syncedAt: new Date().toISOString() }))
    .setMimeType(ContentService.MimeType.JSON);
}`;

export function SyncHealthPanel({
  locale,
  isSuperAdmin,
  sheetsSyncHistory,
  onRefreshWorkspace,
}: SyncHealthPanelProps) {
  const bn = locale === 'bn';
  const t = React.useCallback((b: string, e: string) => (bn ? b : e), [bn]);

  const [subTab, setSubTab] = React.useState<'health' | 'sheets'>('health');
  const [health, setHealth] = React.useState<SystemHealthPayload | null>(null);
  const [healthLoading, setHealthLoading] = React.useState(true);
  const [healthError, setHealthError] = React.useState('');
  const [clientBridgeMs, setClientBridgeMs] = React.useState<number | null>(null);
  const [clientBridgeOk, setClientBridgeOk] = React.useState<boolean | null>(null);

  const [syncBusy, setSyncBusy] = React.useState(false);
  const [syncNotice, setSyncNotice] = React.useState<{
    tone: 'success' | 'error';
    text: string;
  } | null>(null);
  const [latestSnapshotPayload, setLatestSnapshotPayload] = React.useState<unknown>(null);
  const [copiedCodeGs, setCopiedCodeGs] = React.useState(false);

  const runHealthCheck = React.useCallback(async () => {
    setHealthLoading(true);
    setHealthError('');

    // 1. Measure Frontend <-> Backend /api/healthz bridge round-trip
    const bridgeStart = performance.now();
    try {
      const bridgeRes = await fetch('/api/healthz', { cache: 'no-store' });
      setClientBridgeMs(Math.round(performance.now() - bridgeStart));
      setClientBridgeOk(bridgeRes.ok);
    } catch {
      setClientBridgeMs(null);
      setClientBridgeOk(false);
    }

    // 2. Fetch live server diagnostics via adminFetch
    if (!isSuperAdmin) {
      setHealthLoading(false);
      return;
    }

    try {
      const res = await adminFetch('/api/admin/system-health', { cache: 'no-store' });
      const data = (await res.json()) as SystemHealthPayload & {
        errorBn?: string;
        errorEn?: string;
      };
      if (!res.ok || !data.success) {
        setHealthError(
          (bn ? data.errorBn : data.errorEn) ||
            t('সিস্টেম হেলথ তথ্য লোড করা যায়নি।', 'Could not load system health diagnostics.')
        );
        setHealth(null);
        return;
      }
      setHealth(data);
    } catch {
      setHealthError(
        t('সার্ভারের সাথে সংযোগ বিচ্ছিন্ন। পুনরায় চেষ্টা করুন।', 'Unable to reach backend API.')
      );
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  }, [bn, isSuperAdmin, t]);

  React.useEffect(() => {
    void runHealthCheck();
  }, [runHealthCheck]);

  const handleSheetsSync = async (mode: 'incremental' | 'full_resync') => {
    setSyncBusy(true);
    setSyncNotice(null);
    try {
      const res = await adminFetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'trigger_sheets_sync', mode }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        job?: SheetsSyncJobRecord;
        snapshotPayload?: unknown;
        errorBn?: string;
        errorEn?: string;
      };
      if (!res.ok || !data.success) {
        setSyncNotice({
          tone: 'error',
          text:
            (bn ? data.errorBn : data.errorEn || data.errorBn) ||
            t('সিঙ্ক ব্যর্থ হয়েছে।', 'Sync failed.'),
        });
        return;
      }
      if (data.snapshotPayload) {
        setLatestSnapshotPayload(data.snapshotPayload);
      }
      setSyncNotice({
        tone: 'success',
        text: data.job?.summaryBn || t('সিঙ্ক সম্পন্ন হয়েছে।', 'Sync completed.'),
      });
      await onRefreshWorkspace();
    } catch {
      setSyncNotice({
        tone: 'error',
        text: t('সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।', 'Server connection failed.'),
      });
    } finally {
      setSyncBusy(false);
    }
  };

  const handleDownloadMirrorJson = () => {
    if (!latestSnapshotPayload) return;
    const blob = new Blob([JSON.stringify(latestSnapshotPayload, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `panchabindu-sheets-mirror-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const sheetsHealthCheck = health?.checks.find((c) => c.key === 'google_sheets_sync');

  const statusBadge = (status: HealthStatus) => {
    switch (status) {
      case 'healthy':
        return <Badge status="success">{t('সচল', 'Healthy')}</Badge>;
      case 'warning':
        return <Badge status="warning">{t('সতর্কতা', 'Warning')}</Badge>;
      case 'degraded':
        return <Badge status="danger">{t('সমস্যা', 'Degraded')}</Badge>;
      default:
        return <Badge status="neutral">{t('কনফিগার করা নেই', 'Not configured')}</Badge>;
    }
  };

  return (
    <section className="space-y-5">
      {/* Header + Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3 border-b border-border pb-4">
        <div>
          <h1 className="text-lg font-bold text-ink tracking-tight">
            {t('সিঙ্ক ও লাইভ কানেকশন হেলথ', 'Sync & Live Health')}
          </h1>
          <p className="text-xs text-muted mt-0.5">
            {t(
              'Supabase, Vercel, কুরিয়ার, Cron এবং ফ্রন্টএন্ড-ব্যাকএন্ড সংযোগ পরীক্ষা ও Google Sheets মিরর সিঙ্ক।',
              'Live connectivity audit for Supabase, Vercel, couriers, cron, API bridge, and Google Sheets mirror.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'health'}
            onClick={() => setSubTab('health')}
            className={`min-h-[44px] px-3.5 rounded-[var(--radius-md)] text-xs font-medium border inline-flex items-center gap-1.5 transition-colors ${
              subTab === 'health'
                ? 'bg-ink text-bg border-ink'
                : 'bg-surface text-ink border-border hover:bg-bg'
            }`}
          >
            <Activity className="w-3.5 h-3.5" aria-hidden="true" />
            {t('লাইভ হেলথ', 'Live Health')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={subTab === 'sheets'}
            onClick={() => setSubTab('sheets')}
            className={`min-h-[44px] px-3.5 rounded-[var(--radius-md)] text-xs font-medium border inline-flex items-center gap-1.5 transition-colors ${
              subTab === 'sheets'
                ? 'bg-ink text-bg border-ink'
                : 'bg-surface text-ink border-border hover:bg-bg'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" aria-hidden="true" />
            {t('Google Sheets সিঙ্ক', 'Google Sheets Sync')}
          </button>
        </div>
      </div>

      {/* ====================================================================
          TAB 1: LIVE BACKEND-FRONTEND CONNECTIVITY HEALTH
         ==================================================================== */}
      {subTab === 'health' && (
        <div className="space-y-4">
          {/* Runtime Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{t('ফ্রন্টএন্ড ↔ ব্যাকএন্ড', 'Frontend ↔ API')}</span>
                <Server className="w-4 h-4" aria-hidden="true" />
              </div>
              <p className="text-base font-bold text-ink tabular-nums mt-1">
                {clientBridgeOk === null
                  ? '...'
                  : clientBridgeOk
                    ? `${t('সংযুক্ত', 'Connected')} · ${clientBridgeMs ?? 0}ms`
                    : t('বিচ্ছিন্ন', 'Unreachable')}
              </p>
            </div>

            <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{t('ডাটাবেজ মোড', 'Persistence')}</span>
                <Database className="w-4 h-4" aria-hidden="true" />
              </div>
              <p className="text-base font-bold text-ink mt-1">
                {health
                  ? health.runtime.persistenceMode === 'postgres_supabase'
                    ? 'Supabase Postgres'
                    : t('লোকাল JSON (Dev)', 'Local JSON (Dev)')
                  : '—'}
              </p>
            </div>

            <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3.5">
              <div className="flex items-center justify-between text-xs text-muted">
                <span>{t('হোস্টিং রানটাইম', 'Runtime')}</span>
                <Cloud className="w-4 h-4" aria-hidden="true" />
              </div>
              <p className="text-base font-bold text-ink mt-1">
                {health
                  ? health.runtime.isVercel
                    ? `Vercel (${health.runtime.vercelEnv ?? 'prod'})`
                    : `Node (${health.runtime.nodeEnv})`
                  : '—'}
              </p>
            </div>

            <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3.5 flex flex-col justify-between">
              <span className="text-xs text-muted">{t('সর্বশেষ যাচাই', 'Last Checked')}</span>
              <div className="flex items-center justify-between gap-2 mt-1">
                <span className="text-xs font-medium text-ink tabular-nums truncate">
                  {health ? formatLocaleDateTime(health.checkedAt, locale) : '—'}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={healthLoading}
                  onClick={() => void runHealthCheck()}
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`}
                    aria-hidden="true"
                  />
                </Button>
              </div>
            </div>
          </div>

          {healthError && (
            <div className="rounded-[var(--radius-md)] border border-danger/40 bg-danger/10 px-3.5 py-3 text-xs text-danger flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 shrink-0" aria-hidden="true" />
                {healthError}
              </span>
              <Button type="button" size="sm" variant="outline" onClick={() => void runHealthCheck()}>
                {t('পুনরায় যাচাই', 'Retry')}
              </Button>
            </div>
          )}

          {healthLoading && !health ? (
            <div className="space-y-2.5">
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
              <Skeleton className="h-16 w-full" />
            </div>
          ) : health ? (
            <div className="border border-border rounded-[var(--radius-md)] bg-surface divide-y divide-border">
              {health.checks.map((item) => (
                <div
                  key={item.key}
                  className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-ink">
                        {bn ? item.labelBn : item.labelEn}
                      </span>
                      {statusBadge(item.status)}
                      {typeof item.latencyMs === 'number' && item.latencyMs > 0 && (
                        <span className="text-[11px] font-mono text-muted tabular-nums">
                          {item.latencyMs}ms
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {bn ? item.detailBn : item.detailEn}
                    </p>
                    {(item.actionHintBn || item.actionHintEn) && (
                      <p className="text-xs text-ink flex items-center gap-1.5 pt-0.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-warning shrink-0" aria-hidden="true" />
                        <span>{bn ? item.actionHintBn : item.actionHintEn}</span>
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}

      {/* ====================================================================
          TAB 2: GOOGLE SHEETS ONE-WAY MIRROR SYNC
         ==================================================================== */}
      {subTab === 'sheets' && (
        <div className="space-y-4">
          {syncNotice && (
            <div
              role="status"
              className={`rounded-[var(--radius-md)] border px-3.5 py-2.5 text-xs font-medium ${
                syncNotice.tone === 'success'
                  ? 'border-success/40 bg-success/10 text-success'
                  : 'border-danger/40 bg-danger/10 text-danger'
              }`}
            >
              {syncNotice.text}
            </div>
          )}

          <Card surface="bg" padding="md" className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-ink">
                    {t('মাস্টার গুগল শিট ওয়ান-ওয়ে মিরর (৮ ট্যাব)', 'Master Google Sheet One-Way Mirror (8 Tabs)')}
                  </h2>
                  {sheetsHealthCheck && statusBadge(sheetsHealthCheck.status)}
                </div>
                <p className="text-xs text-muted mt-0.5">
                  {t(
                    'Orders · Order Items · Inventory · Vendor Ledger · Payouts · Expenses · Ad Spend · Customers',
                    'Orders · Order Items · Inventory · Vendor Ledger · Payouts · Expenses · Ad Spend · Customers'
                  )}
                </p>
              </div>
            </div>

            {sheetsHealthCheck && (
              <p className="text-xs text-muted">
                {bn ? sheetsHealthCheck.detailBn : sheetsHealthCheck.detailEn}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="primary"
                disabled={syncBusy || !isSuperAdmin}
                onClick={() => void handleSheetsSync('incremental')}
              >
                <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${syncBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
                {t('ইনক্রিমেন্টাল সিঙ্ক', 'Incremental Sync')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={syncBusy || !isSuperAdmin}
                onClick={() => void handleSheetsSync('full_resync')}
              >
                {t('ফুল রিসিঙ্ক (৮ ট্যাব)', 'Full Resync (8 Tabs)')}
              </Button>
              {latestSnapshotPayload !== null && (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={handleDownloadMirrorJson}
                >
                  <Download className="w-3.5 h-3.5 mr-1.5" aria-hidden="true" />
                  {t('৮-ট্যাব JSON ডাউনলোড', 'Download 8-Tab JSON')}
                </Button>
              )}
            </div>

            <details className="text-xs border-t border-border pt-3">
              <summary className="cursor-pointer font-medium text-ink">
                {t(
                  'Apps Script (Code.gs) সেটআপ গাইড দেখুন',
                  'View Google Apps Script (Code.gs) Setup Guide'
                )}
              </summary>
              <div className="mt-2.5 space-y-2">
                <p className="text-muted">
                  {t(
                    '১. Google Sheet খুলে Extensions → Apps Script-এ নিচের কোড পেস্ট করুন। ২. Deploy → Web App করে URL-টি Vercel Env-এ GOOGLE_SHEETS_APPS_SCRIPT_URL হিসেবে দিন।',
                    '1. In Google Sheets open Extensions → Apps Script and paste the script below. 2. Deploy as Web App and set GOOGLE_SHEETS_APPS_SCRIPT_URL in server env.'
                  )}
                </p>
                <div className="relative">
                  <pre className="p-3 rounded-[var(--radius-md)] border border-border bg-surface text-[11px] font-mono overflow-x-auto text-ink">
                    {APPS_SCRIPT_CODE_GS}
                  </pre>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="mt-2"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(APPS_SCRIPT_CODE_GS);
                        setCopiedCodeGs(true);
                        setTimeout(() => setCopiedCodeGs(false), 2500);
                      } catch {
                        // ignore clipboard failure
                      }
                    }}
                  >
                    {copiedCodeGs ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                        {t('কপি হয়েছে', 'Copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5 mr-1" aria-hidden="true" />
                        {t('Code.gs কপি করুন', 'Copy Code.gs')}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </details>
          </Card>

          {/* Sync Job History */}
          <Card surface="bg" padding="md" className="space-y-3">
            <h3 className="text-xs font-semibold text-ink uppercase tracking-wide">
              {t('সিঙ্ক হিস্ট্রি', 'Sync History')} (
              {formatLocaleNumber(sheetsSyncHistory.length, locale)})
            </h3>
            {sheetsSyncHistory.length === 0 ? (
              <EmptyState
                title={t('এখনো কোনো সিঙ্ক চালানো হয়নি', 'No sync jobs yet')}
                description={t(
                  'উপরের বাটন থেকে প্রথম মিরর সিঙ্ক বা লোকাল স্ন্যাপশট তৈরি করুন।',
                  'Run your first incremental or full mirror sync above.'
                )}
              />
            ) : (
              <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] bg-surface">
                {sheetsSyncHistory.slice(0, 15).map((job) => (
                  <div
                    key={job.id}
                    className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                  >
                    <div className="space-y-0.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge status={job.status === 'pushed_to_webhook' ? 'success' : 'neutral'}>
                          {job.status === 'pushed_to_webhook'
                            ? t('লাইভ ওয়েবহুকে পুশড', 'Pushed Live')
                            : t('লোকাল স্ন্যাপশট', 'Local Snapshot')}
                        </Badge>
                        <span className="font-mono text-muted">{job.mode}</span>
                        <span className="text-ink font-medium tabular-nums">
                          {formatLocaleNumber(job.rowsExportedCount, locale)} {t('রো', 'rows')}
                        </span>
                      </div>
                      <p className="text-muted">{job.summaryBn}</p>
                    </div>
                    <span className="text-[11px] font-mono text-muted tabular-nums shrink-0">
                      @{job.triggeredByUsername} · {formatLocaleDateTime(job.createdAt, locale)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
