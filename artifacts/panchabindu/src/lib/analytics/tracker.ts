/**
 * Lean first-party analytics tracker — the SINGLE place for all behavior tracking.
 * Nothing fires before consent. Decline = no behavior tracking. Never throws into app code.
 *
 * [ASSUMED] — written without a shell; verify with: pnpm --filter @workspace/panchabindu run typecheck
 */

export interface AnalyticsEvent {
  type: string;
  ts: number; // epoch ms
  event_uuid: string;
  path?: string;
  [key: string]: unknown;
}

const CONSENT_KEY = 'pb_analytics_consent';
const VISITOR_KEY = 'pb_visitor_id';
const SESSION_KEY = 'pb_session_id';
const IDLE_TIMEOUT_MS = 60_000;
const HEARTBEAT_MS = 60_000;
const MAX_BATCH = 20;
const MAX_BUFFER = 200;
const FLUSH_INTERVAL_MS = 15_000;
const MAX_EVENT_BYTES = 300;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface ConsentRecord {
  v: 1;
  choice: 'accept' | 'decline' | 'choose';
  detailed?: boolean; // "choose"-mode personalization flag
  ts: string;
}

export function getConsent(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(CONSENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ConsentRecord;
    if (parsed.v !== 1 || !['accept', 'decline', 'choose'].includes(parsed.choice)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function setConsent(choice: ConsentRecord['choice'], detailed = false): void {
  try {
    localStorage.setItem(
      CONSENT_KEY,
      JSON.stringify({ v: 1, choice, detailed, ts: new Date().toISOString() } satisfies ConsentRecord),
    );
    // Changing consent changes live behavior immediately.
    if (choice === 'decline') hardReset();
    else startSessionIfIdle();
  } catch {
    /* storage unavailable: no tracking, consistent with privacy-by-default */
  }
}

export function analyticsEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  if (import.meta.env.VITE_ANALYTICS_OFF === '1') return false;
  const consent = getConsent();
  return consent !== null && consent.choice !== 'decline';
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    // Never fall back to a deterministic id for identity — no session if UUIDs unavailable.
    return '';
  }
}

function getVisitorId(): string {
  try {
    const existing = localStorage.getItem(VISITOR_KEY);
    if (existing && UUID_RE.test(existing)) return existing;
    const fresh = uuid();
    if (!fresh) return '';
    localStorage.setItem(VISITOR_KEY, fresh);
    return fresh;
  } catch {
    return '';
  }
}

function getSessionRecord(): { sid: string; lastSeen: number; seen: boolean } {
  try {
    const now = Date.now();
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { sid: string; lastSeen: number };
      if (UUID_RE.test(parsed.sid) && now - parsed.lastSeen < 30 * 60_000) {
        localStorage.setItem(SESSION_KEY, JSON.stringify({ sid: parsed.sid, lastSeen: now }));
        return { sid: parsed.sid, lastSeen: now, seen: true };
      }
    }
    const sid = uuid();
    if (!sid) return { sid: '', lastSeen: now, seen: false };
    localStorage.setItem(SESSION_KEY, JSON.stringify({ sid, lastSeen: now }));
    return { sid, lastSeen: now, seen: false };
  } catch {
    return { sid: '', lastSeen: Date.now(), seen: false };
  }
}

let buffer: AnalyticsEvent[] = [];
let lastPagePath = '';
let lastPageTs = 0;
let dwellTimer: ReturnType<typeof setInterval> | null = null;
let dwellActiveMs = 0;
let dwellStart: number | null = null;
let dwellProductId: string | null = null;
let dwellScrollPct = 0;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let flushTimer: ReturnType<typeof setInterval> | null = null;
let idleResetTimer: ReturnType<typeof setTimeout> | null = null;

function queue(event: AnalyticsEvent): void {
  if (!analyticsEnabled()) return;
  if (buffer.length >= MAX_BUFFER) buffer.shift(); // oldest dropped, newest kept
  if (typeof event === 'object' && JSON.stringify(event).length <= MAX_EVENT_BYTES) {
    buffer.push(event);
    if (buffer.length >= MAX_BATCH) void flush('batch-full');
  }
}

function envelope(): { v: 1; vid: string; sid: string; events: AnalyticsEvent[] } {
  const session = getSessionRecord();
  return { v: 1, vid: getVisitorId(), sid: session.sid, events: [] };
}

/** Fire-and-forget POST. Must never await on the critical path. */
function post(body: string, useBeacon: boolean): void {
  try {
    if (useBeacon && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/analytics/ingest', new Blob([body], { type: 'application/json' }));
      return;
    }
    void fetch('/api/analytics/ingest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body,
      keepalive: true,
      credentials: 'omit',
      mode: 'same-origin',
    }).catch(() => {
      /* analytics failure must never affect the shop */
    });
  } catch {
    /* ignore */
  }
}

export async function flush(reason: string): Promise<void> {
  if (!analyticsEnabled()) return;
  if (buffer.length === 0) return;
  const env = envelope();
  env.events = buffer;
  buffer = [];
  post(JSON.stringify(env), reason === 'pagehide' || reason === 'visibilitychange');
}

function markActivity(): void {
  try {
    sessionStorage.setItem('pb_last_activity', String(Date.now()));
  } catch {
    /* ignore */
  }
  if (idleResetTimer) clearTimeout(idleResetTimer);
  idleResetTimer = setTimeout(() => {
    idleResetTimer = null;
  }, IDLE_TIMEOUT_MS);
}

function isIdle(): boolean {
  try {
    if (idleResetTimer !== null) return false;
    return Date.now() - (Number(sessionStorage.getItem('pb_last_activity')) || 0) > IDLE_TIMEOUT_MS;
  } catch {
    return true;
  }
}

function isStaffPath(): boolean {
  try {
    const p = location.pathname;
    return p.startsWith('/admin') || p.startsWith('/vendor');
  } catch {
    return true;
  }
}

function deviceBucket(): string {
  const w = window.innerWidth || 0;
  if (w <= 430) return 'mobile';
  if (w <= 1024) return 'tablet';
  return 'desktop';
}

function startSessionIfIdle(): void {
  if (!analyticsEnabled() || isStaffPath()) return;
  const session = getSessionRecord();
  if (session.sid && !session.seen) {
    let newVisitor = false;
    try {
      newVisitor = !localStorage.getItem(VISITOR_KEY);
    } catch {
      newVisitor = false;
    }
    queue({
      type: 'session_start',
      ts: Date.now(),
      event_uuid: uuid(),
      new_visitor: newVisitor,
      device: deviceBucket(),
    });
  }
  if (!heartbeatTimer) {
    heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !isIdle()) queue({ type: 'heartbeat', ts: Date.now(), event_uuid: uuid() });
    }, HEARTBEAT_MS);
  }
}

function ensureFlushTimer(): void {
  if (!flushTimer) flushTimer = setInterval(() => void flush('interval'), FLUSH_INTERVAL_MS);
}

function startDwell(productId: string): void {
  if (!analyticsEnabled() || isStaffPath()) return;
  stopDwell();
  dwellProductId = productId;
  dwellActiveMs = 0;
  dwellScrollPct = 0;
  dwellStart = document.visibilityState === 'visible' && !isIdle() ? Date.now() : null;
  if (!dwellTimer) {
    dwellTimer = setInterval(() => {
      if (dwellProductId && dwellStart !== null && document.visibilityState === 'visible' && !isIdle()) {
        dwellActiveMs += 1_000;
        dwellStart = Date.now();
      }
    }, 1_000);
  }
}

function stopDwell(): void {
  if (dwellProductId && dwellActiveMs > 2_000) {
    queue({
      type: 'product_dwell',
      ts: Date.now(),
      event_uuid: uuid(),
      product_id: dwellProductId,
      active_dwell_ms: Math.round(dwellActiveMs),
      scroll_pct: Math.round(dwellScrollPct),
    });
  }
  dwellProductId = null;
  dwellActiveMs = 0;
  dwellStart = null;
  dwellScrollPct = 0;
}

export function trackPageView(path: string): void {
  try {
    if (!analyticsEnabled() || isStaffPath()) return;
    startSessionIfIdle();
    ensureFlushTimer();
    markActivity();
    // De-dup: identical path within 3 s (route remount / StrictMode double-invoke).
    if (path === lastPagePath && Date.now() - lastPageTs < 3_000) return;
    lastPagePath = path;
    lastPageTs = Date.now();
    const sp = new URLSearchParams(location.search);
    queue({
      type: 'page_view',
      ts: Date.now(),
      event_uuid: uuid(),
      path: path.slice(0, 120),
      ref: referrerHost(),
      utm_source: cap(sp.get('utm_source'), 60),
      utm_medium: cap(sp.get('utm_medium'), 40),
      utm_campaign: cap(sp.get('utm_campaign'), 60),
      device: deviceBucket(),
    });
  } catch {
    /* ignore */
  }
}

function referrerHost(): string {
  try {
    if (!document.referrer) return '';
    const url = new URL(document.referrer);
    return cap(url.hostname, 60);
  } catch {
    return '';
  }
}

function cap(value: string | null, max: number): string {
  return (value ?? '').slice(0, max);
}

export function trackProductView(productId: string, pricePoisha?: number): void {
  try {
    if (!analyticsEnabled() || isStaffPath()) return;
    queue({
      type: 'product_view',
      ts: Date.now(),
      event_uuid: uuid(),
      product_id: String(productId).slice(0, 60),
      price_poisha: typeof pricePoisha === 'number' && Number.isFinite(pricePoisha) ? Math.round(pricePoisha) : undefined,
    });
    startDwell(String(productId).slice(0, 60));
  } catch {
    /* ignore */
  }
}

export function trackEvent(type: string, props: Record<string, unknown> = {}): void {
  try {
    if (!analyticsEnabled() || isStaffPath()) return;
    queue({ type, ts: Date.now(), event_uuid: uuid(), ...props });
  } catch {
    /* ignore */
  }
}

export function trackError(message: string, stackTop: string, path: string): void {
  try {
    if (!analyticsEnabled() || isStaffPath()) return;
    queue({ type: 'js_error', ts: Date.now(), event_uuid: uuid(), message: cap(message, 200), stack_top: cap(stackTop, 200), path: cap(path, 120) });
  } catch {
    /* ignore */
  }
}

// --- Lifecycle wiring (one call from the app bootstrap) ---

export function installLifecycle(): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stopDwell();
      void flush('visibilitychange');
    } else {
      dwellStart = Date.now();
    }
  });
  window.addEventListener('pagehide', () => {
    stopDwell();
    void flush('pagehide');
  });
  ['pointerdown', 'keydown', 'wheel', 'touchstart'].forEach((evt) =>
    window.addEventListener(evt, () => markActivity(), { passive: true, capture: true }),
  );
  window.addEventListener(
    'scroll',
    () => {
      try {
        const doc = document.documentElement;
        const pct = Math.round((doc.scrollTop / Math.max(1, doc.scrollHeight - doc.clientHeight)) * 100);
        if (pct > dwellScrollPct) dwellScrollPct = pct;
      } catch {
        /* ignore */
      }
    },
    { passive: true },
  );
  window.addEventListener('error', (ev) => {
    trackError(String(ev.message ?? 'error'), String((ev.error?.stack ?? '').split('\n')[1] ?? ''), location.pathname);
  });
  window.addEventListener('unhandledrejection', (ev) => {
    trackError(`unhandledrejection:${String((ev.reason as Error)?.message ?? ev.reason).slice(0, 100)}`, '', location.pathname);
  });
}

export function hardReset(): void {
  buffer = [];
  lastPagePath = '';
  lastPageTs = 0;
  dwellProductId = null;
  dwellActiveMs = 0;
  dwellStart = null;
  dwellScrollPct = 0;
  if (dwellTimer) clearInterval(dwellTimer);
  dwellTimer = null;
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = null;
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
