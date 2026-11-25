/**
 * Admin Analytics panel — 5 lean views, bilingual, calm layout.
 * Uses the existing admin fetch pattern (credentials: include + CSRF headers
 * are applied globally by the admin client; this panel adds no new deps).
 *
 * [ASSUMED] — not run yet. Verify: typecheck + browser checks in RUNBOOK §1.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type Locale = 'bn' | 'en';

interface AnalyticsOverviewDTO {
  success: boolean;
  generatedAt: string;
  rangeDays: number;
  views: number;
  uniqueVisitors: number;
  sessions: number;
  newVisitors: number;
  returningVisitors: number;
  liveNow: number;
  addToCarts: number;
  jsErrors: number;
  eventsStored: number;
  retentionDays: number;
  series: Array<{ day: string; views: number; sessions: number; addToCarts: number }>;
  topProducts: Array<{ productId: string; views: number; dwellMs: number; dwellCount: number }>;
  topSources: Array<{ source: string; sessions: number }>;
  devices: Array<{ device: string; sessions: number }>;
  hourly: Array<{ hour: number; views: number }>;
  funnel: Array<{ step: string; count: number }>;
}

const RANGE_OPTIONS = [
  { days: 1, bn: 'আজ', en: 'Today' },
  { days: 7, bn: '৭ দিন', en: '7 days' },
  { days: 30, bn: '৩০ দিন', en: '30 days' },
];

const T = {
  title: { bn: 'অ্যানালিটিক্স (পরিদর্শন)', en: 'Analytics (Visitors)' },
  liveNow: { bn: 'এখন সক্রিয়', en: 'Live now' },
  views: { bn: 'পেজ ভিউ', en: 'Page views' },
  visitors: { bn: 'অনন্য ভিজিটর', en: 'Unique visitors' },
  sessions: { bn: 'সেশন', en: 'Sessions' },
  newVisitors: { bn: 'নতুন', en: 'New' },
  returning: { bn: 'পুরনো', en: 'Returning' },
  atc: { bn: 'কার্টে যোগ', en: 'Add to cart' },
  errors: { bn: 'জেএস/এপিআই ত্রুটি', en: 'JS/API errors' },
  eventsStored: { bn: 'সংরক্ষিত ইভেন্ট', en: 'Events stored' },
  retention: { bn: 'দিন রিটেনশন', en: 'day retention' },
  products: { bn: 'পণ্য', en: 'Products' },
  sources: { bn: 'সোর্স', en: 'Sources' },
  devices: { bn: 'ডিভাইস', en: 'Devices' },
  funnel: { bn: 'ফানেল', en: 'Funnel' },
  hoursHeatmap: { bn: 'ঘণ্টা-ভিত্তিক ভিউ', en: 'Views by hour' },
  csv: { bn: 'CSV ডাউনলোড', en: 'Download CSV' },
  empty: { bn: 'এখনো কোনো ডেটা নেই (কনসেন্ট না দিলে ট্র্যাকিং হয় না)।', en: 'No data yet (no tracking without consent).' },
  loading: { bn: 'লোড হচ্ছে…', en: 'Loading…' },
  failed: { bn: 'লোড ব্যর্থ', en: 'Failed to load' },
  retry: { bn: 'আবার চেষ্টা', en: 'Retry' },
} as const;

function t(key: keyof typeof T, locale: Locale): string {
  return T[key][locale];
}

function csvEscape(value: unknown): string {
  // Formula-injection neutralization for CSV exports.
  const s = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(s)) return `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<unknown>>): void {
  const csv = rows.map((r) => r.map(csvEscape).join(',')).join('\n');
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <Card surface="bg" padding="md" className="space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </Card>
  );
}

export function AnalyticsPanel({ locale, isSuperAdmin }: { locale: Locale; isSuperAdmin: boolean }) {
  const [rangeDays, setRangeDays] = useState(7);
  const [data, setData] = useState<AnalyticsOverviewDTO | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');

  const load = useCallback(async () => {
    setState('loading');
    try {
      const res = await fetch(`/api/admin/analytics?days=${rangeDays}`, {
        credentials: 'include',
        headers: { Accept: 'application/json' },
      });
      if (!res.ok) throw new Error('LOAD_FAILED');
      const body = (await res.json()) as AnalyticsOverviewDTO;
      setData(body);
      setState('ready');
    } catch {
      setState('error');
    }
  }, [rangeDays]);

  useEffect(() => {
    void load();
  }, [load]);

  const funnelMax = useMemo(
    () => Math.max(1, ...(data?.funnel.map((f) => f.count) ?? [0])),
    [data],
  );

  if (!isSuperAdmin) {
    return (
      <Card surface="bg" padding="md">
        <p className="text-sm text-muted-foreground">{t('failed', locale)}</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 p-4">
      {/* Header: title + range + CSV */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('title', locale)}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {RANGE_OPTIONS.map((opt) => (
            <Button
              key={opt.days}
              variant={rangeDays === opt.days ? 'default' : 'outline'}
              size="sm"
              onClick={() => setRangeDays(opt.days)}
            >
              {opt[locale]}
            </Button>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() =>
              data &&
              downloadCsv(`analytics-${rangeDays}d.csv`, [
                ['day', 'views', 'sessions', 'addToCarts'],
                ...data.series.map((s) => [s.day, s.views, s.sessions, s.addToCarts]),
              ])
            }
            disabled={!data}
          >
            {t('csv', locale)}
          </Button>
        </div>
      </div>

      {state === 'loading' && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6" aria-busy="true">
          {Array.from({ length: 6 }, (_, i) => (
            <Card key={i} surface="bg" padding="md" className="h-16 animate-pulse" />
          ))}
        </div>
      )}
      {state === 'error' && (
        <Card surface="bg" padding="md" className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{t('failed', locale)}</p>
          <Button size="sm" variant="outline" onClick={() => void load()}>
            {t('retry', locale)}
          </Button>
        </Card>
      )}
      {state === 'ready' && data && (
        <>
          {data.views === 0 && data.sessions === 0 ? (
            <Card surface="bg" padding="md">
              <p className="text-sm text-muted-foreground">{t('empty', locale)}</p>
            </Card>
          ) : null}

          {/* Overview stats */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label={`${t('liveNow', locale)} · ${t('sessions', locale)}`} value={data.liveNow} />
            <Stat label={t('views', locale)} value={data.views} />
            <Stat label={t('visitors', locale)} value={data.uniqueVisitors} />
            <Stat label={t('sessions', locale)} value={data.sessions} />
            <Stat
              label={`${t('newVisitors', locale)} / ${t('returning', locale)}`}
              value={`${data.newVisitors} / ${data.returningVisitors}`}
            />
            <Stat label={t('atc', locale)} value={data.addToCarts} />
          </div>

          {/* Trend bars (pure CSS, no chart lib — minimalism rule) */}
          <Card surface="bg" padding="md" className="space-y-3">
            <div className="flex items-baseline justify-between">
              <p className="text-sm font-medium">{t('title', locale)}</p>
              <p className="text-xs text-muted-foreground">
                {t('eventsStored', locale)}: {data.eventsStored} · {data.retentionDays}
                {t('retention', locale)}
              </p>
            </div>
            <div className="flex h-28 items-end gap-1">
              {data.series.map((s) => {
                const max = Math.max(1, ...data.series.map((x) => x.views));
                return (
                  <div key={s.day} className="flex-1" title={`${s.day}: ${s.views}`}>
                    <div
                      className="w-full rounded-sm bg-primary/70"
                      style={{ height: `${Math.round((s.views / max) * 100)}%`, minHeight: '2px' }}
                    />
                  </div>
                );
              })}
            </div>
          </Card>

          {/* Funnel */}
          <Card surface="bg" padding="md" className="space-y-2">
            <p className="text-sm font-medium">{t('funnel', locale)}</p>
            {data.funnel.map((f) => (
              <div key={f.step} className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{f.step}</span>
                  <span className="tabular-nums">{f.count}</span>
                </div>
                <div className="h-2 rounded bg-muted">
                  <div className="h-2 rounded bg-primary" style={{ width: `${(f.count / funnelMax) * 100}%` }} />
                </div>
              </div>
            ))}
          </Card>

          {/* Products / Sources / Devices / Hourly heatmap */}
          <div className="grid gap-3 lg:grid-cols-2">
            <Card surface="bg" padding="md" className="space-y-2">
              <p className="text-sm font-medium">{t('products', locale)}</p>
              {data.topProducts.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('empty', locale)}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.topProducts.slice(0, 8).map((p) => (
                    <li key={p.productId} className="flex justify-between">
                      <span className="truncate">{p.productId}</span>
                      <span className="tabular-nums text-muted-foreground">
                        {p.views} · {Math.round(p.dwellMs / 1000)}s
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card surface="bg" padding="md" className="space-y-2">
              <p className="text-sm font-medium">{t('sources', locale)}</p>
              {data.topSources.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('empty', locale)}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.topSources.slice(0, 8).map((s) => (
                    <li key={s.source} className="flex justify-between">
                      <span className="truncate">{s.source}</span>
                      <span className="tabular-nums text-muted-foreground">{s.sessions}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card surface="bg" padding="md" className="space-y-2">
              <p className="text-sm font-medium">{t('devices', locale)}</p>
              {data.devices.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('empty', locale)}</p>
              ) : (
                <ul className="space-y-1 text-sm">
                  {data.devices.map((d) => (
                    <li key={d.device} className="flex justify-between">
                      <span>{d.device}</span>
                      <span className="tabular-nums text-muted-foreground">{d.sessions}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card surface="bg" padding="md" className="space-y-2">
              <p className="text-sm font-medium">{t('hoursHeatmap', locale)}</p>
              <div className="grid grid-cols-12 gap-1">
                {Array.from({ length: 24 }, (_, h) => {
                  const count = data.hourly.find((x) => x.hour === h)?.views ?? 0;
                  const max = Math.max(1, ...data.hourly.map((x) => x.views));
                  const opacity = 0.15 + (count / max) * 0.85;
                  return (
                    <div
                      key={h}
                      title={`${h}:00 — ${count}`}
                      className="aspect-square rounded-sm bg-primary"
                      style={{ opacity }}
                    />
                  );
                })}
              </div>
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
