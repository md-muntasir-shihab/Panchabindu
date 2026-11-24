/**
 * Consent banner — Bangla + English. Rendered only when no consent choice exists.
 * position:fixed bottom; no layout shift; dismissible choice required (no dark pattern).
 *
 * [ASSUMED] — written without a shell; verify with typecheck + browser checks in RUNBOOK.
 */
import { useEffect, useState } from 'react';
import { getConsent, setConsent } from '@/lib/analytics/tracker';

export function ConsentBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setVisible(getConsent() === null);
  }, []);
  if (!visible) return null;
  return (
    <div
      role="region"
      aria-label="Analytics consent / অ্যানালিটিক্স সম্মতি"
      className="fixed inset-x-0 bottom-0 z-[60] border-t border-[var(--pb-border, #d4d4d8)] bg-[var(--pb-surface, #fafafa)] p-4 shadow-lg"
    >
      <div className="mx-auto max-w-4xl space-y-3">
        <p className="text-sm leading-relaxed text-[var(--pb-text, #18181b)]">
          আমরা কেবল ব্যক্তিগত পরিচয় ছাড়া পরিদর্শন-পরিসংখ্যান রাখি। সম্মতি দিলে কুকিজ/স্থানীয় স্টোরেজে সীমিত তথ্য জমা হয়।
          <span className="block text-[13px] text-[var(--pb-text-muted, #52525b)]">
            We store only anonymous visit statistics. With consent, limited data is kept in cookies/local storage.{' '}
            <a className="underline" href="/legal/privacy">আমার পছন্দ বদলান / Change my choice</a>
          </span>
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="min-h-11 rounded-md bg-[var(--pb-accent, #2563eb)] px-4 text-white"
            onClick={() => {
              setConsent('accept');
              setVisible(false);
            }}
          >
            গ্রহণ / Accept
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-[var(--pb-border, #d4d4d8)] px-4"
            onClick={() => {
              setConsent('decline');
              setVisible(false);
            }}
          >
            প্রত্যাখ্যান / Decline
          </button>
          <button
            type="button"
            className="min-h-11 rounded-md border border-[var(--pb-border, #d4d4d8)] px-4"
            onClick={() => {
              setConsent('choose', true);
              setVisible(false);
            }}
          >
            পছন্দ নির্বাচন / Choose
          </button>
        </button>
      </div>
    </div>
  );
}
