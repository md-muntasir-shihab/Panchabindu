/**
 * Analytics ingestion endpoint — POST /api/analytics/ingest
 * Single receiving gate for all first-party events. Never throws, never touches auth state,
 * never slows the shop: returns 204 fast regardless of internal result.
 *
 * [ASSUMED] — written without a shell. Verify: pnpm --filter @workspace/api-server run typecheck,
 * node --test against a local fixture, per docs/lean/RUNBOOK.md.
 */
import type { NextRequest } from 'next/server';

interface AnalyticEvent {
  type: string;
  ts: number;
  event_uuid: string;
  path?: string;
  product_id?: string;
  active_dwell_ms?: number;
  scroll_pct?: number;
  device?: string;
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  message?: string;
  stack_top?: string;
  new_visitor?: boolean;
}

interface IngestBody {
  v: 1;
  vid: string;
  sid: string;
  events: AnalyticEvent[];
}

/** Kill switch — if false, ingestion accepts nothing (still 204). */
function analyticsEnabledServer(): boolean {
  return process.env.ANALYTICS_ENABLED_SERVER !== 'false';
}

// --- Lightweight in-memory rate limit (10 batches/min/IP) ---
const rateBuckets = new Map<string, { count: number; windowStart: number }>();

function rateLimitExceeded(ip: string): boolean {
  const now = Date.now();
  const entry = rateBuckets.get(ip);
  if (!entry || now - entry.windowStart > 60_000) {
    rateBuckets.set(ip, { count: 1, windowStart: now });
    if (rateBuckets.size > 500) rateBuckets.clear(); // serverless-safe memory bound
    return false;
  }
  entry.count += 1;
  return entry.count > 10;
}

// --- Minimal write queue to the runtime analytics_events document (append with size guard) ---

interface Runtime {
  appendAnalyticsEvents?: (events: unknown[]) => Promise<void>;
}

declare const globalThis: typeof global & { __pbRuntime?: Runtime };

function cap(s: unknown, max: number): string {
  if (typeof s !== 'string') return '';
  return s.slice(0, max);
}

function sanitizeEvent(raw: unknown): AnalyticEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const type = cap(e.type, 40);
  if (!type || !/^[a-z0-9_]+$/.test(type)) return null;
  const ts = Number(e.ts);
  if (!Number.isFinite(ts) || Math.abs(ts - Date.now()) > 10 * 60_000) return null; // future/past > 10min rejected
  const event_uuid = cap(e.event_uuid, 60);
  if (!/^[0-9a-f-]{8,60}$/i.test(event_uuid)) return null;
  return {
    type,
    ts: Math.round(ts),
 event_uuid,
    path: cap(e.path, 120) || undefined,
    product_id: cap(e.product_id, 60) || undefined,
    active_dwell_ms: Number.isFinite(Number(e.active_dwell_ms)) ? Math.min(Math.round(Number(e.active_dwell_ms)), 3_600_000) : undefined,
    scroll_pct: Number.isFinite(Number(e.scroll_pct)) ? Math.min(Math.max(Math.round(Number(e.scroll_pct)), 0), 100) : undefined,
    device: cap(e.device, 20) || undefined,
    ref: cap(e.ref, 60) || undefined,
    utm_source: cap(e.utm_source, 60) || undefined,
    utm_medium: cap(e.utm_medium, 40) || undefined,
    utm_campaign: cap(e.utm_campaign, 60) || undefined,
    message: cap(e.message, 200) || undefined,
    stack_top: cap(e.stack_top, 200) || undefined,
    new_visitor: typeof e.new_visitor === 'boolean' ? e.new_visitor : undefined,
  };
}

export async function POST(request: NextRequest): Promise<Response> {
  try {
    // Fast-path 204 regardless of outcome: analytics must never block or fail the shop.
    void handle(request).catch(() => undefined);
    return new Response(null, { status: 204 });
  } catch {
    return new Response(null, { status: 204 });
  }
}

async function handle(request: NextRequest): Promise<void> {
  if (!analyticsEnabledServer()) return;
  // Staff routes are excluded client-side; server double-checks the referer as defense in depth.
  const referer = request.headers.get('referer') ?? '';
  if (referer.includes('/admin') || referer.includes('/vendor')) return;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'local';
  if (rateLimitExceeded(ip)) return;
  const contentLength = Number(request.headers.get('content-length') ?? 0);
  if (contentLength > 32_768) return;
  let body: IngestBody;
  try {
    body = (await request.json()) as IngestBody;
  } catch {
    return;
  }
  if (!body || body.v !== 1 || !Array.isArray(body.events) || body.events.length === 0 || body.events.length > 20) return;
  if (!/^[0-9a-f-]{8,60}$/i.test(cap(body.vid, 60)) || !/^[0-9a-f-]{8,60}$/i.test(cap(body.sid, 60))) return;
  const seen = new Set<string>();
  const sanitized: AnalyticEvent[] = [];
  for (const raw of body.events) {
    const ev = sanitizeEvent(raw);
    if (!ev) continue;
    if (seen.has(ev.event_uuid)) continue; // duplicate within batch
    seen.add(ev.event_uuid);
    sanitized.push(ev);
  }
  if (sanitized.length === 0) return;
  // Delegate persistence to the existing runtime adapter hook. If the adapter does not
  // implement appendAnalyticsEvents yet, events are dropped silently (204 already sent).
  await globalThis.__pbRuntime?.appendAnalyticsEvents?.(sanitized);
}
