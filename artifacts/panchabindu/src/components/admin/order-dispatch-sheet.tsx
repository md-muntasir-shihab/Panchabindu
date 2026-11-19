'use client';

import * as React from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Link2,
  RefreshCw,
  Truck,
} from 'lucide-react';
import { ResponsiveSheet } from '@/components/ui/responsive-sheet';
import { formatPoishaToBdt } from '@/lib/money';
import type { OrderGridRowDTO } from '@/types/domain';
import {
  CUSTOM_COURIER_PRESETS,
  computeOrderPaymentSummary,
  getSuggestedTrackingUrl,
  isSafeHttpUrl,
  validateDispatchInput,
  type ActiveCourierProvider,
} from '@/lib/admin/order-management';

export type DispatchSheetMode = 'ship' | 'out_for_delivery' | 'edit';

export interface DispatchSubmitPayload {
  orderNo: string;
  courierProvider: ActiveCourierProvider;
  customCourierName: string | null;
  trackingCode: string;
  consignmentId: string | null;
  customTrackingUrl: string | null;
  advanceToStatus?: 'shipped' | 'out_for_delivery';
}

export interface OrderDispatchSheetProps {
  order: Partial<OrderGridRowDTO> | null;
  mode: DispatchSheetMode;
  locale: 'bn' | 'en';
  isSubmitting: boolean;
  onClose: () => void;
  onSubmit: (payload: DispatchSubmitPayload) => Promise<boolean>;
}

const COURIER_OPTIONS: ReadonlyArray<{
  key: ActiveCourierProvider;
  labelBn: string;
  labelEn: string;
}> = [
  { key: 'steadfast', labelBn: 'Steadfast', labelEn: 'Steadfast' },
  { key: 'pathao', labelBn: 'Pathao', labelEn: 'Pathao' },
  { key: 'bd_post', labelBn: 'ডাক বিভাগ', labelEn: 'BD Post' },
  { key: 'manual', labelBn: 'কাস্টম কুরিয়ার', labelEn: 'Custom Courier' },
];

export function OrderDispatchSheet({
  order,
  mode,
  locale,
  isSubmitting,
  onClose,
  onSubmit,
}: OrderDispatchSheetProps) {
  const bn = locale === 'bn';

  const [provider, setProvider] = React.useState<ActiveCourierProvider>('steadfast');
  const [customCourierName, setCustomCourierName] = React.useState('');
  const [trackingCode, setTrackingCode] = React.useState('');
  const [consignmentId, setConsignmentId] = React.useState('');
  const [trackingUrl, setTrackingUrl] = React.useState('');
  const [urlManuallyEdited, setUrlManuallyEdited] = React.useState(false);
  const [validationError, setValidationError] = React.useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = React.useState(false);

  React.useEffect(() => {
    if (!order) return;
    const rawProvider = order.courierProvider;
    const nextProvider: ActiveCourierProvider =
      rawProvider === 'pathao' ||
      rawProvider === 'steadfast' ||
      rawProvider === 'bd_post' ||
      rawProvider === 'manual'
        ? rawProvider
        : 'steadfast';
    const nextCode = (order.trackingCode ?? '').trim();
    const nextConsignment = (order.consignmentId ?? '').trim();
    const savedCustomUrl = (order.customTrackingUrl ?? '').trim();

    setProvider(nextProvider);
    setCustomCourierName((order.customCourierName ?? '').trim());
    setTrackingCode(nextCode);
    setConsignmentId(nextConsignment);

    if (savedCustomUrl) {
      setTrackingUrl(savedCustomUrl);
      setUrlManuallyEdited(true);
    } else {
      const suggested = getSuggestedTrackingUrl(
        nextProvider,
        nextCode,
        nextConsignment
      );
      setTrackingUrl(suggested ?? '');
      setUrlManuallyEdited(false);
    }
    setValidationError(null);
    setCopiedUrl(false);
  }, [order, mode]);

  // Keep auto-suggested URL in sync for official couriers unless operator manually edited it.
  React.useEffect(() => {
    if (urlManuallyEdited) return;
    if (provider === 'manual') {
      setTrackingUrl('');
      return;
    }
    const suggested = getSuggestedTrackingUrl(provider, trackingCode, consignmentId);
    setTrackingUrl(suggested ?? '');
  }, [provider, trackingCode, consignmentId, urlManuallyEdited]);

  const payment = React.useMemo(
    () => (order ? computeOrderPaymentSummary(order) : null),
    [order]
  );

  const suggestedOfficialUrl =
    provider !== 'manual'
      ? getSuggestedTrackingUrl(provider, trackingCode, consignmentId)
      : null;

  const trimmedUrl = trackingUrl.trim();
  const isCustomUrlOverride =
    Boolean(trimmedUrl) &&
    (provider === 'manual' || trimmedUrl !== (suggestedOfficialUrl ?? ''));
  const resolvedPreviewUrl = isSafeHttpUrl(trimmedUrl)
    ? trimmedUrl
    : suggestedOfficialUrl;

  const title = React.useMemo(() => {
    if (mode === 'out_for_delivery') {
      return bn
        ? 'আউট ফর ডেলিভারি — কুরিয়ার ও ট্র্যাকিং যাচাই'
        : 'Out for Delivery — Review Courier & Tracking';
    }
    if (mode === 'ship') {
      return bn
        ? 'কুরিয়ার নির্বাচন ও শিপমেন্ট'
        : 'Select Courier & Ship Order';
    }
    return bn
      ? 'কুরিয়ার ও ট্র্যাকিং লিংক সম্পাদনা'
      : 'Edit Courier & Tracking Link';
  }, [mode, bn]);

  const handleCopyUrl = async () => {
    if (!resolvedPreviewUrl) return;
    try {
      await navigator.clipboard.writeText(resolvedPreviewUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2000);
    } catch {
      // Clipboard may be restricted in non-HTTPS contexts; ignore silently.
    }
  };

  const handleConfirm = async (advanceStatus: boolean) => {
    if (!order?.orderNo) return;
    setValidationError(null);

    const customUrlToPersist = isCustomUrlOverride ? trimmedUrl : '';
    const check = validateDispatchInput({
      courierProvider: provider,
      customCourierName,
      trackingCode,
      consignmentId,
      customTrackingUrl: customUrlToPersist,
      requireTracking: true,
    });

    if (!check.valid || !check.normalized) {
      setValidationError(bn ? (check.errorBn ?? 'তথ্য সঠিক নয়।') : (check.errorEn ?? 'Invalid input.'));
      return;
    }

    const advanceToStatus: 'shipped' | 'out_for_delivery' | undefined =
      advanceStatus && mode === 'ship'
        ? 'shipped'
        : advanceStatus && mode === 'out_for_delivery'
        ? 'out_for_delivery'
        : undefined;

    const ok = await onSubmit({
      orderNo: order.orderNo,
      courierProvider: check.normalized.courierProvider,
      customCourierName: check.normalized.customCourierName,
      trackingCode: check.normalized.trackingCode,
      consignmentId: check.normalized.consignmentId,
      customTrackingUrl: check.normalized.customTrackingUrl,
      advanceToStatus,
    });

    if (ok) {
      onClose();
    }
  };

  const primaryButtonLabel =
    mode === 'out_for_delivery'
      ? bn
        ? 'আউট ফর ডেলিভারি নিশ্চিত করুন'
        : 'Confirm Out for Delivery'
      : mode === 'ship'
      ? bn
        ? 'সংরক্ষণ ও শিপ করুন'
        : 'Save & Mark Shipped'
      : bn
      ? 'সংরক্ষণ করুন'
      : 'Save Changes';

  return (
    <ResponsiveSheet
      open={Boolean(order)}
      onOpenChange={(open) => {
        if (!open && !isSubmitting) onClose();
      }}
      title={title}
    >
      {order && payment && (
        <div className="space-y-5 text-xs">
          {/* Minimalist Order & Payment Summary Strip */}
          <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="min-w-0">
                <p className="font-mono font-bold text-ink text-sm">
                  {order.orderNo}
                </p>
                <p className="text-muted truncate">
                  {order.customerName} ·{' '}
                  <span className="font-mono text-ink">{order.customerPhone}</span>
                </p>
              </div>
              <div className="text-right tabular-nums">
                <span className="text-[11px] text-muted block">
                  {bn ? 'কুরিয়ার আদায় (COD)' : 'Collectable COD'}
                </span>
                <span className="font-bold text-ink text-sm">
                  {payment.isFullyPaid
                    ? bn
                      ? 'পরিশোধিত (৳০)'
                      : 'Paid (৳0)'
                    : formatPoishaToBdt(payment.duePoisha, locale)}
                </span>
              </div>
            </div>
            <div className="pt-2 border-t border-border/70 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted tabular-nums">
              <span>
                {bn ? 'মোট' : 'Total'}:{' '}
                <strong className="text-ink">
                  {formatPoishaToBdt(payment.totalPoisha, locale)}
                </strong>
              </span>
              <span>
                {bn ? 'পরিশোধিত' : 'Paid'}:{' '}
                <strong className="text-ink">
                  {formatPoishaToBdt(payment.verifiedPaidPoisha, locale)}
                </strong>
              </span>
              <span className="truncate max-w-[200px]">
                {order.districtNameBn}
                {order.upazilaNameBn ? `, ${order.upazilaNameBn}` : ''}
              </span>
            </div>
          </div>

          {mode === 'out_for_delivery' && (
            <p className="text-xs text-muted leading-relaxed">
              {bn
                ? 'আউট ফর ডেলিভারি করার আগে কুরিয়ারের নাম, ট্র্যাকিং কোড ও ট্র্যাকিং লিংক মিলিয়ে নিন। প্রয়োজনে কাস্টম কুরিয়ার বা নতুন লিংক এডিট করে নিশ্চিত করুন।'
                : 'Review or update the courier, tracking code, and tracking link before marking this order Out for Delivery.'}
            </p>
          )}

          {/* Courier Provider Selector */}
          <div className="space-y-2">
            <label className="block text-xs font-semibold text-ink">
              {bn ? 'কুরিয়ার নির্বাচন করুন' : 'Select Courier'}
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {COURIER_OPTIONS.map((opt) => {
                const active = provider === opt.key;
                return (
                  <button
                    key={opt.key}
                    type="button"
                    onClick={() => {
                      setProvider(opt.key);
                      setUrlManuallyEdited(false);
                      setValidationError(null);
                    }}
                    className={`min-h-[38px] px-2.5 py-2 rounded-[var(--radius-sm)] border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-ink text-bg border-ink'
                        : 'bg-bg text-ink border-border hover:border-ink'
                    }`}
                  >
                    {bn ? opt.labelBn : opt.labelEn}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Courier Name Input (shown when Custom Courier selected) */}
          {provider === 'manual' && (
            <div className="space-y-2">
              <label
                htmlFor="dispatch-custom-courier-name"
                className="block text-xs font-semibold text-ink"
              >
                {bn ? 'কাস্টম কুরিয়ারের নাম *' : 'Custom Courier Name *'}
              </label>
              <input
                id="dispatch-custom-courier-name"
                type="text"
                value={customCourierName}
                onChange={(e) => {
                  setCustomCourierName(e.target.value);
                  setValidationError(null);
                }}
                placeholder={
                  bn
                    ? 'যেমন: সুন্দরবন কুরিয়ার, এস.এ পরিবহন বা লোকাল রাইডার'
                    : 'e.g., Sundarban Courier, SA Paribahan, Local Rider'
                }
                className="w-full min-h-[38px] px-3 py-2 border border-border rounded-[var(--radius-sm)] bg-bg text-ink text-xs focus:outline-none focus:border-ink"
              />
              <div className="flex flex-wrap items-center gap-1.5">
                {CUSTOM_COURIER_PRESETS.map((preset) => {
                  const label = bn ? preset.bn : preset.en;
                  const selected = customCourierName.trim() === label;
                  return (
                    <button
                      key={preset.en}
                      type="button"
                      onClick={() => {
                        setCustomCourierName(label);
                        setValidationError(null);
                      }}
                      className={`px-2 py-1 rounded-[var(--radius-sm)] border text-[11px] transition-colors cursor-pointer ${
                        selected
                          ? 'bg-ink text-bg border-ink font-semibold'
                          : 'bg-surface text-muted border-border hover:text-ink hover:border-ink'
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tracking Code & Optional Consignment ID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label
                htmlFor="dispatch-tracking-code"
                className="block text-xs font-semibold text-ink"
              >
                {bn ? 'ট্র্যাকিং কোড / রসিদ নম্বর *' : 'Tracking Code *'}
              </label>
              <input
                id="dispatch-tracking-code"
                type="text"
                value={trackingCode}
                onChange={(e) => {
                  setTrackingCode(e.target.value.toUpperCase());
                  setValidationError(null);
                }}
                placeholder={
                  provider === 'steadfast'
                    ? 'SF-123456'
                    : provider === 'pathao'
                    ? 'PT-987654'
                    : bn
                    ? 'যেমন: SB-2026-001'
                    : 'e.g., SB-2026-001'
                }
                className="w-full min-h-[38px] px-3 py-2 border border-border rounded-[var(--radius-sm)] bg-bg text-ink font-mono text-xs focus:outline-none focus:border-ink"
              />
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="dispatch-consignment-id"
                className="block text-xs font-semibold text-ink"
              >
                {bn ? 'কনসাইনমেন্ট আইডি (ঐচ্ছিক)' : 'Consignment ID (Optional)'}
              </label>
              <input
                id="dispatch-consignment-id"
                type="text"
                value={consignmentId}
                onChange={(e) => setConsignmentId(e.target.value)}
                placeholder={bn ? 'কুরিয়ার কনসাইনমেন্ট আইডি' : 'Courier consignment ID'}
                className="w-full min-h-[38px] px-3 py-2 border border-border rounded-[var(--radius-sm)] bg-bg text-ink font-mono text-xs focus:outline-none focus:border-ink"
              />
            </div>
          </div>

          {/* Editable Tracking Link */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="dispatch-tracking-url"
                className="text-xs font-semibold text-ink inline-flex items-center gap-1.5"
              >
                <Link2 className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                <span>
                  {bn ? 'ট্র্যাকিং লিংক (এডিটযোগ্য)' : 'Tracking Link (Editable)'}
                </span>
              </label>
              {suggestedOfficialUrl && trackingUrl !== suggestedOfficialUrl && (
                <button
                  type="button"
                  onClick={() => {
                    setTrackingUrl(suggestedOfficialUrl);
                    setUrlManuallyEdited(false);
                    setValidationError(null);
                  }}
                  className="text-[11px] text-ink underline hover:opacity-80 cursor-pointer"
                >
                  {bn ? 'অটো লিংক বসান' : 'Use auto link'}
                </button>
              )}
            </div>
            <input
              id="dispatch-tracking-url"
              type="url"
              value={trackingUrl}
              onChange={(e) => {
                setTrackingUrl(e.target.value);
                setUrlManuallyEdited(true);
                setValidationError(null);
              }}
              placeholder={
                provider === 'manual'
                  ? 'https://courier-site.com/track/...'
                  : suggestedOfficialUrl ?? 'https://...'
              }
              className="w-full min-h-[38px] px-3 py-2 border border-border rounded-[var(--radius-sm)] bg-bg text-ink font-mono text-xs focus:outline-none focus:border-ink"
            />
            {resolvedPreviewUrl ? (
              <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-muted">
                <a
                  href={resolvedPreviewUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-ink hover:underline truncate max-w-[78%]"
                >
                  <ExternalLink className="w-3 h-3 shrink-0" aria-hidden="true" />
                  <span className="truncate font-mono">{resolvedPreviewUrl}</span>
                </a>
                <button
                  type="button"
                  onClick={() => void handleCopyUrl()}
                  className="inline-flex items-center gap-1 text-ink hover:underline whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="w-3 h-3" aria-hidden="true" />
                      <span>{bn ? 'কপি হয়েছে' : 'Copied'}</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" aria-hidden="true" />
                      <span>{bn ? 'কপি' : 'Copy'}</span>
                    </>
                  )}
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-muted">
                {provider === 'manual'
                  ? bn
                    ? 'কাস্টম কুরিয়ারের ওয়েবসাইট বা ট্র্যাকিং পেজের লিংক থাকলে এখানে দিন (ঐচ্ছিক)।'
                    : 'Optionally paste a live tracking URL for this custom courier.'
                  : bn
                  ? 'ট্র্যাকিং কোড লিখলে অফিসিয়াল ট্র্যাকিং লিংক স্বয়ংক্রিয়ভাবে তৈরি হবে, চাইলে পরিবর্তনও করতে পারবেন।'
                  : 'An official tracking link will be generated automatically once a tracking code is entered.'}
              </p>
            )}
          </div>

          {validationError && (
            <p role="alert" className="text-xs font-medium text-danger">
              {validationError}
            </p>
          )}

          {/* Action Footer */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-border">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={onClose}
              className="min-h-[36px] px-3 py-1.5 rounded-[var(--radius-sm)] border border-border bg-bg text-ink hover:bg-surface font-medium text-xs cursor-pointer disabled:opacity-50"
            >
              {bn ? 'বাতিল' : 'Cancel'}
            </button>

            <div className="flex flex-wrap items-center gap-2">
              {mode !== 'edit' && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => void handleConfirm(false)}
                  className="min-h-[36px] px-3 py-1.5 rounded-[var(--radius-sm)] border border-border bg-surface text-ink hover:border-ink font-semibold text-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
                >
                  {bn ? 'শুধু তথ্য সেভ' : 'Save Only'}
                </button>
              )}

              <button
                type="button"
                disabled={isSubmitting}
                onClick={() => void handleConfirm(mode !== 'edit')}
                className="min-h-[36px] px-4 py-1.5 rounded-[var(--radius-sm)] bg-ink text-bg hover:opacity-90 font-semibold text-xs cursor-pointer disabled:opacity-50 inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                {isSubmitting ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Truck className="w-3.5 h-3.5" aria-hidden="true" />
                )}
                <span>{primaryButtonLabel}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </ResponsiveSheet>
  );
}
