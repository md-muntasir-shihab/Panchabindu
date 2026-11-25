/**
 * Customer 360 — Activity + Privacy tab components for the profile view.
 * Privacy-by-default: the full phone is fetched ONLY on explicit Reveal, which
 * the server audit-logs (CUSTOMER_PII_REVEALED) before returning it.
 * Activity events are consent-gated; without a linked+consented visitor id the
 * tab shows the order-based timeline only (already existing).
 *
 * [ASSUMED] — not run yet. Verify: typecheck + browser checks in RUNBOOK §1.
 */
import * as React from 'react';
import { Eye, Download, ShieldCheck } from 'lucide-react';
import { Button, EmptyState } from '../ui/primitives';
import { formatLocaleDateTime } from '@/lib/i18n/dictionaries';

export interface CustomerActivityEvent {
  ts: number;
  type: string;
  path?: string;
  productId?: string;
  dwellSeconds?: number;
}

export interface CustomerConsentRecord {
  choice: 'accept' | 'decline' | 'choose';
  version: number;
  recordedAt: string;
}

const ACTIVITY_TYPE_LABELS: Record<string, { bn: string; en: string }> = {
  page_view: { bn: 'পেজ ভিউ', en: 'Page view' },
  product_view: { bn: 'পণ্য দেখেছে', en: 'Viewed product' },
  product_dwell: { bn: 'পণ্যে সময়', en: 'Product dwell' },
  add_to_cart: { bn: 'কার্টে যোগ', en: 'Add to cart' },
  checkout_step: { bn: 'চেকআউট ধাপ', en: 'Checkout step' },
  search: { bn: 'সার্চ', en: 'Search' },
};

const CONSENT_LABELS: Record<string, { bn: string; en: string }> = {
  accept: { bn: 'গৃহীত', en: 'Accepted' },
  decline: { bn: 'প্রত্যাখ্যাত', en: 'Declined' },
  choose: { bn: 'নির্বাচিত', en: 'Chosen' },
};

function t(bn: string, en: string, locale: 'bn' | 'en'): string {
  return locale === 'bn' ? bn : en;
}

/**
 * Privacy section: consent record + masked-by-default reveal + DSR export button.
 * All mutations go through POST /api/admin/customer-privacy which audit-logs server-side.
 */
export function CustomerPrivacySection({
  phoneKey,
  displayPhone,
  locale,
  consent,
  busyKey,
  onReveal,
  onExport,
}: {
  phoneKey: string;
  displayPhone: string;
  locale: 'bn' | 'en';
  consent: CustomerConsentRecord | null;
  busyKey: string | null;
  onReveal: () => Promise<string | null>;
  onExport: () => Promise<void>;
}) {
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const bn = locale === 'bn';
  return (
    <div className="space-y-4">
      {/* Consent record */}
      <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5 space-y-2">
        <p className="text-xs font-semibold flex items-center gap-1.5">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          {t('অ্যানালিটিক্স সম্মতি', 'Analytics consent', locale)}
        </p>
        {consent ? (
          <p className="text-xs text-muted">
            {CONSENT_LABELS[consent.choice]?.[locale] ?? consent.choice} · v{consent.version} ·{' '}
            {formatLocaleDateTime(consent.recordedAt, locale)}
          </p>
        ) : (
          <p className="text-xs text-muted">
            {t(
              'কোনো সম্মতি রেকর্ড নেই — আচরণ-ট্র্যাকিং লিংক নিষ্ক্রিয়।',
              'No consent record — behavior tracking link is inactive.',
              locale,
            )}
          </p>
        )}
      </div>

      {/* Masked-by-default reveal */}
      <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5 space-y-2">
        <p className="text-xs font-semibold">{t('ফোন নম্বর', 'Phone number', locale)}</p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm tabular-nums">{revealed ?? displayPhone}</span>
          {!revealed && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="min-h-[44px]"
              disabled={busy || busyKey === `c360-reveal:${phoneKey}`}
              onClick={() => {
                setBusy(true);
                setError(null);
                void onReveal()
                  .then((full) => {
                    if (full) setRevealed(full);
                    else setError(t('রিভিল ব্যর্থ হয়েছে।', 'Reveal failed.', locale));
                  })
                  .finally(() => setBusy(false));
              }}
            >
              <Eye className="w-4 h-4" aria-hidden="true" />
              {t('দেখুন (লগ হবে)', 'Reveal (logged)', locale)}
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted">
          {t(
            'প্রতিটি রিভিল অ্যাপেন্ড-অনলি অডিট লগে সংরক্ষিত হয়।',
            'Every reveal is written to the append-only audit log.',
            locale,
          )}
        </p>
      </div>

      {/* DSR export */}
      <div className="border border-border rounded-[var(--radius-md)] bg-surface p-5 space-y-2">
        <p className="text-xs font-semibold">
          {t('নিজের তথ্য এক্সপোর্ট (DSR)', 'Export my data (DSR)', locale)}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-[44px]"
          disabled={busy || busyKey === `c360-export:${phoneKey}`}
          onClick={() => {
            setBusy(true);
            void onExport().finally(() => setBusy(false));
          }}
        >
          <Download className="w-4 h-4" aria-hidden="true" />
          {t('JSON ডাউনলোড', 'Download JSON', locale)}
        </Button>
      </div>

      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Activity section: consent-gated browsing timeline (products viewed with dwell,
 * searches, cart adds), newest first, last 90 days. Events arrive pre-filtered
 * server-side; without consent this list is empty by design.
 */
export function CustomerActivitySection({
  events,
  locale,
}: {
  events: CustomerActivityEvent[];
  locale: 'bn' | 'en';
}) {
  const bn = locale === 'bn';
  if (events.length === 0) {
    return (
      <EmptyState
        title={t('আচরণ-অ্যাক্টিভিটি নেই', 'No behavior activity', locale)}
        description={t(
          'গ্রাহক সম্মতি না দিলে বা লিংক না হলে এই তালিকা ইচ্ছাকৃতভাবে খালি থাকে। অর্ডার-ভিত্তিক ইতিহাস "সম্পূর্ণ টাইমলাইন" ট্যাবে আছে।',
          'Without customer consent or a linked visitor, this list stays empty by design. Order-based history is in the Timeline tab.',
          locale,
        )}
      />
    );
  }
  return (
    <ol className="relative border-l border-border ml-2 pl-6 space-y-4">
      {events.map((e, i) => (
        <li key={`${e.ts}-${i}`} className="relative space-y-0.5">
          <span
            aria-hidden="true"
            className="absolute -left-[29px] top-1.5 w-2 h-2 rounded-full bg-border border border-surface"
          />
          <p className="text-xs font-semibold">
            {ACTIVITY_TYPE_LABELS[e.type]?.[locale] ?? e.type}
            {e.productId ? <span className="font-mono text-muted"> · {e.productId}</span> : null}
            {e.dwellSeconds !== undefined ? (
              <span className="text-muted"> · {e.dwellSeconds}s</span>
            ) : null}
          </p>
          <time className="text-[11px] text-muted tabular-nums">
            {formatLocaleDateTime(new Date(e.ts).toISOString(), locale)}
          </time>
        </li>
      ))}
    </ol>
  );
}
