'use client';

import * as React from 'react';
import { flushSync } from 'react-dom';
import { ExternalLink, Printer, RefreshCw } from 'lucide-react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import { ResponsiveSheet } from '@/components/ui/responsive-sheet';
import {
  PrintableSlipsDocument,
  executeNativeSlipPrint,
} from './print-engine-panel';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import type {
  OrderPrintSlipBundle,
  PrintTemplateConfig,
} from '@/lib/admin/phase4b-service';
import type { PublicSafeSiteSettingsDTO } from '@/lib/db/repository';

export interface OrderPrintPreviewSheetProps {
  orderNo: string | null;
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  isVendor: boolean;
  printConfig: PrintTemplateConfig;
  siteSettings: PublicSafeSiteSettingsDTO;
  onClose: () => void;
  onOpenPrintEngineTab?: (orderNo: string) => void;
  onRefreshWorkspace?: () => Promise<void>;
}

export function OrderPrintPreviewSheet({
  orderNo,
  locale,
  isSuperAdmin,
  isVendor,
  printConfig,
  siteSettings,
  onClose,
  onOpenPrintEngineTab,
  onRefreshWorkspace,
}: OrderPrintPreviewSheetProps) {
  const bn = locale === 'bn';

  const [layoutMode, setLayoutMode] = React.useState<'a4_3part' | 'thermal_4x6'>(
    printConfig.defaultMode
  );
  const [visibleParts, setVisibleParts] = React.useState<boolean[]>([
    true,
    true,
    true,
  ]);
  const [slip, setSlip] = React.useState<OrderPrintSlipBundle | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [printing, setPrinting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const printableRef = React.useRef<HTMLDivElement>(null);
  const requestSeq = React.useRef(0);

  React.useEffect(() => {
    setLayoutMode(printConfig.defaultMode);
  }, [printConfig.defaultMode]);

  const fetchSlip = React.useCallback(
    async (targetOrderNo: string) => {
      const seq = ++requestSeq.current;
      setLoading(true);
      setError(null);
      setFeedback(null);
      try {
        const res = await fetch('/api/admin/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'generate_print_slips',
            orderNos: [targetOrderNo],
          }),
        });
        const data = await res.json();
        if (!res.ok || !data.success || !Array.isArray(data.slips) || !data.slips[0]) {
          throw new Error(
            data.errorBn ||
              (bn ? 'প্রিন্ট প্রিভিউ লোড করা যায়নি।' : 'Could not load print preview.')
          );
        }
        if (seq === requestSeq.current) {
          setSlip(data.slips[0] as OrderPrintSlipBundle);
        }
      } catch (err) {
        if (seq === requestSeq.current) {
          setError(
            err instanceof Error
              ? err.message
              : bn
              ? 'সার্ভারের সাথে সংযোগ ব্যর্থ হয়েছে।'
              : 'Failed to connect to server.'
          );
          setSlip(null);
        }
      } finally {
        if (seq === requestSeq.current) {
          setLoading(false);
        }
      }
    },
    [bn]
  );

  React.useEffect(() => {
    if (!orderNo) {
      setSlip(null);
      setError(null);
      setFeedback(null);
      return;
    }
    void fetchSlip(orderNo);
  }, [orderNo, fetchSlip]);

  const handlePrint = async () => {
    if (!orderNo || !slip || !printableRef.current) return;
    if (layoutMode === 'a4_3part' && !visibleParts.some(Boolean)) {
      setError(
        bn
          ? 'অন্তত একটি অংশ নির্বাচন করুন।'
          : 'Select at least one A4 section to print.'
      );
      return;
    }

    setPrinting(true);
    setError(null);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'generate_print_slips',
          orderNos: [orderNo],
          recordPrint: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success || !Array.isArray(data.slips) || !data.slips[0]) {
        throw new Error(
          data.errorBn || (bn ? 'প্রিন্ট অনুরোধ ব্যর্থ হয়েছে।' : 'Print request failed.')
        );
      }

      const freshSlip = data.slips[0] as OrderPrintSlipBundle;
      flushSync(() => setSlip(freshSlip));
      if (!printableRef.current) {
        throw new Error(
          bn ? 'প্রিন্ট উইন্ডো তৈরি করা যায়নি।' : 'Could not open print window.'
        );
      }

      // Uses the exact same iframe renderer, CSS, and auto-fit scale engine as PrintEnginePanel
      await executeNativeSlipPrint({
        printableEl: printableRef.current,
        layoutMode,
        locale,
      });

      setFeedback(
        bn
          ? 'প্রিন্ট অনুরোধ নথিভুক্ত হয়েছে। প্রিন্ট ডায়ালগে কাগজের আকার ও স্কেল যাচাই করুন; বাতিল করলেও অনুরোধের সংখ্যা থাকবে।'
          : 'Print request recorded. Check paper size and scale in the print dialog; cancelled requests are also counted.'
      );
      if (onRefreshWorkspace) {
        void onRefreshWorkspace();
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : bn
          ? 'প্রিন্ট ব্যর্থ হয়েছে।'
          : 'Print failed.'
      );
    } finally {
      setPrinting(false);
    }
  };

  const p12 = slip?.customerAndCourierPart;
  const p3 = slip?.internalPart3;

  return (
    <ResponsiveSheet
      open={Boolean(orderNo)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      size="wide"
      title={
        orderNo
          ? bn
            ? `স্লিপ প্রিন্ট প্রিভিউ — ${orderNo}`
            : `Print Preview — ${orderNo}`
          : bn
          ? 'প্রিন্ট প্রিভিউ'
          : 'Print Preview'
      }
      description={
        p12
          ? `${p12.customerName} · ${p12.customerPhone} · ${
              bn ? 'মোট প্রিন্ট' : 'Printed'
            }: ${formatLocaleNumber(p3?.printCount ?? 0, locale)}`
          : undefined
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div>
            {orderNo && onOpenPrintEngineTab && (
              <button
                type="button"
                onClick={() => {
                  const target = orderNo;
                  onClose();
                  onOpenPrintEngineTab(target);
                }}
                className="min-h-[36px] px-3 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:border-ink font-medium inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              >
                <ExternalLink className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                <span>{bn ? 'প্রিন্ট ইঞ্জিনে খুলুন' : 'Open Print Engine'}</span>
              </button>
            )}
          </div>
          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[36px] px-3 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:border-ink font-medium cursor-pointer"
            >
              {bn ? 'বন্ধ করুন' : 'Close'}
            </button>
            <button
              type="button"
              disabled={
                loading ||
                printing ||
                !slip ||
                (layoutMode === 'a4_3part' && !visibleParts.some(Boolean))
              }
              onClick={() => void handlePrint()}
              className="min-h-[36px] px-4 py-1.5 rounded-[var(--radius-sm)] bg-ink text-bg hover:opacity-90 font-semibold disabled:opacity-50 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              {printing ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <Printer className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>
                {printing
                  ? bn
                    ? 'প্রস্তুত হচ্ছে...'
                    : 'Preparing...'
                  : layoutMode === 'thermal_4x6'
                  ? bn
                    ? '৪×৬ থার্মাল প্রিন্ট করুন'
                    : 'Print 4×6 Thermal'
                  : bn
                  ? 'A4 স্লিপ প্রিন্ট করুন'
                  : 'Print A4 Slip'}
              </span>
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 text-xs">
        {/* Controls Toolbar — matches PrintEnginePanel options */}
        <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-[var(--radius-md)] border border-border bg-bg">
          <div className="inline-flex rounded-[var(--radius-sm)] border border-border bg-surface p-0.5">
            <button
              type="button"
              onClick={() => setLayoutMode('a4_3part')}
              className={`min-h-[32px] px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer transition-colors ${
                layoutMode === 'a4_3part'
                  ? 'bg-ink text-bg'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {bn ? 'A4 ৩-ভাগ ইনভয়েস' : 'A4 3-Part Invoice'}
            </button>
            <button
              type="button"
              onClick={() => setLayoutMode('thermal_4x6')}
              className={`min-h-[32px] px-3 py-1 rounded-[var(--radius-sm)] text-xs font-medium cursor-pointer transition-colors ${
                layoutMode === 'thermal_4x6'
                  ? 'bg-ink text-bg'
                  : 'text-muted hover:text-ink'
              }`}
            >
              {bn ? '৪×৬ থার্মাল স্টিকার' : '4×6 Thermal Sticker'}
            </button>
          </div>

          {layoutMode === 'a4_3part' && (
            <div className="flex flex-wrap items-center gap-3 text-xs text-ink">
              {[
                bn ? 'গ্রাহক' : 'Customer',
                bn ? 'কুরিয়ার' : 'Courier',
                bn ? 'অভ্যন্তরীণ' : 'Internal',
              ].map((label, idx) => (
                <label
                  key={label}
                  className="inline-flex items-center gap-1.5 cursor-pointer select-none"
                >
                  <input
                    type="checkbox"
                    checked={visibleParts[idx]}
                    onChange={(e) =>
                      setVisibleParts((prev) =>
                        prev.map((val, i) => (i === idx ? e.target.checked : val))
                      )
                    }
                    className="accent-ink"
                  />
                  <span>{label}</span>
                </label>
              ))}
            </div>
          )}

          {orderNo && (
            <button
              type="button"
              disabled={loading}
              onClick={() => void fetchSlip(orderNo)}
              className="min-h-[32px] px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-surface text-ink hover:border-ink inline-flex items-center gap-1 text-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw
                className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`}
                aria-hidden="true"
              />
              <span>{bn ? 'রিলোড' : 'Reload'}</span>
            </button>
          )}
        </div>

        {/* Status / Error Feedback */}
        {error && (
          <div className="p-3 rounded-[var(--radius-sm)] border border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300 flex items-center justify-between gap-2">
            <span>{error}</span>
            {orderNo && (
              <button
                type="button"
                onClick={() => void fetchSlip(orderNo)}
                className="px-2.5 py-1 rounded-[var(--radius-sm)] border border-red-500/40 font-semibold cursor-pointer"
              >
                {bn ? 'আবার চেষ্টা করুন' : 'Retry'}
              </button>
            )}
          </div>
        )}

        {feedback && (
          <div className="p-3 rounded-[var(--radius-sm)] border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300">
            {feedback}
          </div>
        )}

        {/* Loading State */}
        {loading && !slip && (
          <div className="py-16 text-center text-muted space-y-2 border border-border rounded-[var(--radius-md)] bg-bg">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto text-ink" />
            <p>{bn ? 'প্রিন্ট স্লিপ তৈরি হচ্ছে...' : 'Loading print slip...'}</p>
          </div>
        )}

        {/* Unified Live Preview & Printable Source — 100% identical to PrintEnginePanel */}
        {slip && (
          <div className="overflow-x-auto pb-1">
            <PrintableSlipsDocument
              slips={[slip]}
              layoutMode={layoutMode}
              visibleParts={visibleParts}
              printConfig={printConfig}
              siteSettings={siteSettings}
              locale={locale}
              isSuperAdmin={isSuperAdmin}
              isVendor={isVendor}
              containerRef={printableRef}
            />
          </div>
        )}
      </div>
    </ResponsiveSheet>
  );
}
