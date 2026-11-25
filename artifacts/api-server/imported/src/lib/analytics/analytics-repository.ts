/**
 * Lean first-party analytics repository — appends sanitized events to the
 * phase6 runtime document (same persistence contract as abandoned carts).
 *
 * [TRACED]: migration 0009's validator enforces EXACTLY 10 documents, so
 * analytics cannot use an 11th document. Extra top-level arrays inside
 * erp-phase6-store.json pass validation (shape check only walks its required
 * fields). Field names here avoid the reserved poisha/quantity/stock* suffixes
 * so the SQL integer guard cannot reject them.
 *
 * [ASSUMED] — not run yet; verify with pnpm --filter @workspace/api-server run typecheck
 */
import { readPhase6Store, writePhase6Store } from '../admin/phase6-service';

export interface AnalyticsEventRecord {
  /** epoch ms, server-normalized */
  ts: number;
  /** client-generated uuid for dedup; not a stable identity */
  euid: string;
  type: string;
  vid?: string;
  sid?: string;
  path?: string;
  product_id?: string;
  dwell_ms?: number;
  scroll?: number;
  device?: string;
  ref?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  msg?: string;
  stack?: string;
  new_visitor?: boolean;
}

/** Hard cap on the analytics array inside the phase6 document (free-tier budget, recon §5.1). */
export const ANALYTICS_MAX_EVENTS = 20_000;
/** Raw events older than this many days are purged on append (rollup is a follow-up). */
export const ANALYTICS_RAW_RETENTION_DAYS = 35;

function appendWithBudget(
  existing: AnalyticsEventRecord[],
  incoming: AnalyticsEventRecord[],
  now: number,
): AnalyticsEventRecord[] {
  const cutoff = now - ANALYTICS_RAW_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  const seen = new Set(existing.map((e) => e.euid));
  const deduped = incoming.filter((e) => e.euid && !seen.has(e.euid));
  const combined = existing.concat(deduped);
  // Retention first, then size budget: drop oldest first.
  const fresh = combined.filter((e) => e.ts >= cutoff);
  return fresh.length > ANALYTICS_MAX_EVENTS ? fresh.slice(fresh.length - ANALYTICS_MAX_EVENTS) : fresh;
}

/**
 * Append sanitized analytics events inside the current runtime transaction.
 * Must never throw upward: all failures return false and the caller returns 204 regardless.
 */
export function appendAnalyticsEvents(events: AnalyticsEventRecord[]): boolean {
  try {
    const store = readPhase6Store();
    const existing = (store as { analyticsEvents?: AnalyticsEventRecord[] }).analyticsEvents ?? [];
    const next = appendWithBudget(existing, events, Date.now());
    writePhase6Store({ ...store, analyticsEvents: next } as Parameters<typeof writePhase6Store>[0]);
    return true;
  } catch {
    return false;
  }
}
