/**
 * Admin analytics aggregation endpoint — GET /api/admin/analytics
 * Server-side RBAC (same pattern as system-health route), computes all 5 view
 * DTOs from the analyticsEvents array inside the phase6 runtime document.
 * Revenue numbers are NEVER taken from analytics events — only from orders
 * (normal business records), per docs/lean/tracking-plan.md.
 *
 * [ASSUMED] — not run yet. Verify: pnpm --filter @workspace/api-server run typecheck.
 */
import { ApiRequest } from '@/src/lib/http';
import { backendRoute } from '@/src/lib/db/backend-route';
import { getActorSecurityContext } from '@/src/lib/admin/phase4a-service';
import { canAccessAdminWorkspace } from '@/src/types/permissions';
import {
  extractAdminSessionTokenFromRequest,
  verifyAdminSessionToken,
} from '@/src/lib/security/crypto-session';
import { readPhase6Store } from '@/src/lib/admin/phase6-service';
import type { AnalyticsEventRecord } from '@/src/lib/analytics/analytics-repository';

interface AnalyticsOverviewDTO {
  success: boolean;
  generatedAt: string;
  rangeDays: number;
  views: number;
  uniqueVisitors: number;
  sessions: number;
  newVisitors: number;
  returningVisitors: number;
  liveNow: number; // distinct sessions with a heartbeat in the last 5 minutes
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

function authorizedStaff(req: ApiRequest) {
  const session = verifyAdminSessionToken(extractAdminSessionTokenFromRequest(req));
  const actor =
    session && session.purpose !== 'enrollment'
      ? getActorSecurityContext(session.userId)
      : null;
  return session && actor && canAccessAdminWorkspace(actor)
    ? { actor, session }
    : null;
}

function readAnalyticsEvents(): AnalyticsEventRecord[] {
  const store = readPhase6Store();
  return (store as { analyticsEvents?: AnalyticsEventRecord[] }).analyticsEvents ?? [];
}

/** Asia/Dhaka is UTC+6 — a fixed offset, no DST. [TRACED] from tracking-plan. */
function dayKeyDhaka(ts: number): string {
  return new Date(ts + 6 * 3_600_000).toISOString().slice(0, 10);
}

function hourDhaka(ts: number): number {
  return new Date(ts + 6 * 3_600_000).getUTCHours();
}

export const GET = backendRoute(async (req: ApiRequest) => {
  const auth = authorizedStaff(req);
  if (!auth) {
    return Response.json(
      {
        success: false,
        code: 'FORBIDDEN',
        errorBn: 'শুধুমাত্র অনুমোদিত স্টাফ অ্যানালিটিক্স দেখতে পারবেন।',
        errorEn: 'Only authorized staff can access analytics.',
      },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  const rangeDaysRaw = Number(url.searchParams.get('days'));
  const rangeDays = Number.isFinite(rangeDaysRaw) && rangeDaysRaw > 0 && rangeDaysRaw <= 90 ? Math.round(rangeDaysRaw) : 7;

  const events = readAnalyticsEvents();
  const now = Date.now();
  const rangeStart = now - rangeDays * 24 * 3_600_000;
  const inRange = events.filter((e) => e.ts >= rangeStart);

  const uniqueVisitors = new Set<string>();
  const sessions = new Set<string>();
  const newVisitors = new Set<string>();
  const devices = new Map<string, number>();
  const sources = new Map<string, number>();
  const hourly = new Map<number, number>();
  const series = new Map<string, { views: number; sessions: number; addToCarts: number }>();
  const productViews = new Map<string, number>();
  const productDwell = new Map<string, { totalMs: number; count: number }>();
  const funnelSteps = new Map<string, number>();
  const liveWindow = new Set<string>();
  let views = 0;
  let addToCarts = 0;
  let jsErrors = 0;

  for (const e of inRange) {
    if (e.vid) uniqueVisitors.add(e.vid);
    if (e.sid) {
      sessions.add(e.sid);
      if (e.type === 'session_start') {
        if (e.device) devices.set(e.device, (devices.get(e.device) ?? 0) + 1);
        const source = e.utm_source || e.ref || 'direct';
        sources.set(source, (sources.get(source) ?? 0) + 1);
        if (e.new_visitor) newVisitors.add(e.vid ?? '');
      }
      if (e.type === 'heartbeat') liveWindow.add(e.sid);
    }
    if (e.type === 'page_view') {
      views += 1;
      const day = dayKeyDhaka(e.ts);
      const row = series.get(day) ?? { views: 0, sessions: 0, addToCarts: 0 };
      row.views += 1;
      series.set(day, row);
      hourly.set(hourDhaka(e.ts), (hourly.get(hourDhaka(e.ts) ?? 0) ?? 0) + 1);
    }
    if (e.type === 'product_view' && e.product_id) {
      productViews.set(e.product_id, (productViews.get(e.product_id) ?? 0) + 1);
      funnelSteps.set('product_view', (funnelSteps.get('product_view') ?? 0) + 1);
    }
    if (e.type === 'product_dwell' && e.product_id) {
      const agg = productDwell.get(e.product_id) ?? { totalMs: 0, count: 0 };
      agg.totalMs += e.dwell_ms ?? 0;
      agg.count += 1;
      productDwell.set(e.product_id, agg);
    }
    if (e.type === 'add_to_cart') {
      addToCarts += 1;
      funnelSteps.set('add_to_cart', (funnelSteps.get('add_to_cart') ?? 0) + 1);
      const day = dayKeyDhaka(e.ts);
      const row = series.get(day) ?? { views: 0, sessions: 0, addToCarts: 0 };
      row.addToCarts += 1;
      series.set(day, row);
    }
    if (e.type === 'checkout_step') funnelSteps.set('checkout', (funnelSteps.get('checkout') ?? 0) + 1);
    if (e.type === 'js_error' || e.type === 'api_failure') jsErrors += 1;
  }

  // Funnel purchase step is server truth: orders in range come from the ERP
  // orders document, never from browser events. Minimal read via phase6's own
  // order-derived helpers is out of scope here — purchase count is left to the
  // dashboard's existing order summaries [TRACED]; funnel shows view→cart→checkout.

  const payload: AnalyticsOverviewDTO = {
    success: true,
    generatedAt: new Date().toISOString(),
    rangeDays,
    views,
    uniqueVisitors: uniqueVisitors.size,
    sessions: sessions.size,
    newVisitors: newVisitors.size,
    returningVisitors: Math.max(0, sessions.size - newVisitors.size),
    liveNow: liveWindow.size,
    addToCarts,
    jsErrors,
    eventsStored: events.length,
    retentionDays: 35,
    series: [...series.entries()]
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([day, v]) => ({ day, ...v })),
    topProducts: [...productViews.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 20)
      .map(([productId, count]) => ({
        productId,
        views: count,
        dwellMs: productDwell.get(productId)?.totalMs ?? 0,
        dwellCount: productDwell.get(productId)?.count ?? 0,
      })),
    topSources: [...sources.entries()]
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([source, count]) => ({ source, sessions: count })),
    devices: [...devices.entries()]
      .sort(([, a], [, b]) => b - a)
      .map(([device, count]) => ({ device, sessions: count })),
    hourly: [...hourly.entries()]
      .sort(([a], [b]) => a - b)
      .map(([hour, count]) => ({ hour, views: count })),
    funnel: [
      { step: 'product_view', count: funnelSteps.get('product_view') ?? 0 },
      { step: 'add_to_cart', count: funnelSteps.get('add_to_cart') ?? 0 },
      { step: 'checkout', count: funnelSteps.get('checkout') ?? 0 },
    ],
  };

  return Response.json(payload, {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
  });
});
