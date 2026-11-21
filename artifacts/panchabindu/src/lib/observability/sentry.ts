/**
 * Browser error reporting for the storefront and admin panel.
 *
 * The Sentry SDK is loaded with a dynamic import so the storefront bundle stays unchanged for
 * deployments that have not configured `VITE_SENTRY_DSN`. Nothing here runs without a DSN, and a
 * failed load (offline, blocked request, ad-blocker) must never break the app.
 */
let started = false;

export async function initClientObservability(): Promise<void> {
  if (started || typeof window === 'undefined') return;
  started = true;
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim();
  if (!dsn) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.init({
      dsn,
      environment: (import.meta.env.VITE_SENTRY_ENVIRONMENT as string | undefined)?.trim() || import.meta.env.MODE,
      release: (import.meta.env.VITE_APP_COMMIT as string | undefined) || undefined,
      tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0.05),
      // Customers' names, phones and addresses live in the DOM; strip request metadata instead.
      beforeSend(event) {
        if (event.request) {
          delete event.request.cookies;
          delete event.request.headers;
        }
        return event;
      },
    });
  } catch (error) {
    started = false;
    console.warn('[observability] Sentry could not start', error);
  }
}

/** Report a handled failure (for example a failed order submission that shows a friendly message). */
export async function reportClientError(error: unknown, context?: Record<string, string | number | boolean | null>): Promise<void> {
  if (!started) return;
  try {
    const Sentry = await import('@sentry/react');
    Sentry.withScope((scope) => {
      if (context) scope.setContext('flow', context);
      Sentry.captureException(error);
    });
  } catch {
    // Reporting must never surface a new error to the shopper.
  }
}
