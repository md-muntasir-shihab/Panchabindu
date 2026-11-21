import * as Sentry from '@sentry/node';
import type { Express } from 'express';

/**
 * Server-side error reporting for the Express/Vercel API.
 *
 * Everything here is inert without SENTRY_DSN: the panel is optional infrastructure, so a
 * deployment that has not configured it must behave exactly as before. Initialisation is also
 * guarded, because a broken DSN must never stop the API from booting.
 *
 * Set in Vercel (production + preview):
 *   SENTRY_DSN                 ingest URL from the Sentry project settings
 *   SENTRY_TRACES_SAMPLE_RATE  optional, default 0 (errors only; set e.g. 0.1 to trace requests)
 */

let initialized = false;
let enabled = false;

function sampleRate(): number {
  const raw = Number(process.env.SENTRY_TRACES_SAMPLE_RATE);
  // Default is errors-only: performance spans in a serverless bundle need the extra
  // @sentry/server-runtime-injection package, so tracing stays opt-in.
  if (!Number.isFinite(raw) || raw < 0) return 0;
  return Math.min(1, raw);
}

export function initServerObservability(): void {
  if (initialized) return;
  initialized = true;
  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) return;
  try {
    Sentry.init({
      dsn,
      environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? 'development',
      release: process.env.VERCEL_GIT_COMMIT_SHA ?? undefined,
      tracesSampleRate: sampleRate(),
      // Customer phone numbers, addresses and payment references must never leave the database.
      beforeSend(event) {
        if (event.request?.cookies) delete event.request.cookies;
        if (event.request?.headers) {
          delete event.request.headers.authorization;
          delete event.request.headers.cookie;
        }
        return event;
      },
    });
    enabled = true;
    console.log(JSON.stringify({ level: 'info', msg: 'sentry initialised', environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null }));
  } catch (error) {
    enabled = false;
    console.error(JSON.stringify({ level: 'error', msg: 'sentry init failed', error: error instanceof Error ? error.message : String(error) }));
  }
}

export function isObservabilityEnabled(): boolean {
  return enabled;
}

/** Report a handled failure that would otherwise only appear in a log line. */
export function captureServerException(error: unknown, context?: Record<string, unknown>): void {
  if (!enabled) return;
  try {
    Sentry.withScope((scope) => {
      if (context) scope.setContext('request', context);
      Sentry.captureException(error);
    });
  } catch {
    // Observability must never break the request it is reporting on.
  }
}

/** Attach Express/Vercel error reporting; call once, after every route is registered. */
export function attachServerErrorReporting(app: Express): void {
  if (!enabled) return;
  try {
    Sentry.setupExpressErrorHandler(app);
  } catch {
    // Older/newer SDK shapes must not break boot.
  }
}
