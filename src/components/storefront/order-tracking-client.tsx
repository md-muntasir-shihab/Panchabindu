'use client';

// src/components/storefront/order-tracking-client.tsx
// Live Order Confirmation & 5-Step Tracking Stepper
// Enforces:
//   - Zero vendor identity or cost fields exposed to customer
//   - 5-step progress tracker (Pending -> Confirmed -> Packed -> Dispatched -> Delivered)
//   - Search bar to look up any Order No

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2,
  Clock,
  Package,
  Truck,
  ShieldCheck,
  Search,
  MapPin,
  FileText,
  ArrowLeft,
  AlertTriangle,
} from 'lucide-react';
import type {
  CategoryRecord,
  PublicOrderTrackingDTO,
  PublicSafeSiteSettingsDTO,
} from '@/src/lib/db/repository';
import type { OrderStatus } from '@/src/types/database.types';
import { formatPoishaToBdt } from '@/src/lib/money';
import {
  formatLocaleDateTime,
  formatLocaleNumber,
} from '@/src/lib/i18n/dictionaries';
import { useLocaleStore } from '@/src/store/use-locale-store';
import { Badge, Button, Card, EmptyState } from '../ui/primitives';
import { StorefrontShell } from './storefront-shell';

export interface OrderTrackingClientProps {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
  initialOrderNo: string;
  order: PublicOrderTrackingDTO | null;
  trackingErrorBn?: string | null;
}

const TRACKING_STEPS: Array<{
  key: string;
  labelBn: string;
  labelEn: string;
  icon: typeof Clock;
}> = [
  {
    key: 'pending_confirmation',
    labelBn: 'অর্ডার গৃহীত',
    labelEn: 'Order Placed',
    icon: Clock,
  },
  {
    key: 'confirmed',
    labelBn: 'কনফার্মড',
    labelEn: 'Confirmed',
    icon: CheckCircle2,
  },
  {
    key: 'packed',
    labelBn: 'প্যাকিং সম্পন্ন',
    labelEn: 'Packed at Warehouse',
    icon: Package,
  },
  {
    key: 'in_transit',
    labelBn: 'কুরিয়ারে পাঠানো হয়েছে',
    labelEn: 'Handed to Courier',
    icon: Truck,
  },
  {
    key: 'delivered',
    labelBn: 'ডেলিভারি সম্পন্ন',
    labelEn: 'Delivered',
    icon: ShieldCheck,
  },
];

function getStepIndexForStatus(status: OrderStatus): number {
  switch (status) {
    case 'pending_confirmation':
      return 0;
    case 'confirmed':
      return 1;
    case 'packed':
      return 2;
    case 'shipped':
    case 'out_for_delivery':
      return 3;
    case 'delivered':
      return 4;
    default:
      return -1; // cancelled / return_initiated / returned
  }
}

export function OrderTrackingClient({
  siteSettings,
  categories,
  initialOrderNo,
  order,
  trackingErrorBn,
}: OrderTrackingClientProps) {
  const router = useRouter();
  const locale = useLocaleStore((s) => s.locale);
  const dict = useLocaleStore((s) => s.t());

  const [lookupInput, setLookupInput] = React.useState(initialOrderNo);

  const handleLookupSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = lookupInput.trim();
    if (clean) {
      router.push(`/order-tracking/${encodeURIComponent(clean)}`);
    }
  };

  const activeStepIdx = order ? getStepIndexForStatus(order.status) : -1;
  const isCancelledOrReturned =
    order &&
    ['cancelled', 'return_initiated', 'returned'].includes(order.status);

  return (
    <StorefrontShell siteSettings={siteSettings} categories={categories}>
      <div className="max-w-4xl mx-auto px-4 py-6 sm:py-8 space-y-6">
        {/* Top Lookup Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink mb-1"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>{dict.common.continueShopping}</span>
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-ink">
              {locale === 'bn'
                ? 'অর্ডার কনফার্মেশন ও লাইভ ট্র্যাকিং'
                : 'Order Confirmation & Live Tracking'}
            </h1>
          </div>

          <form onSubmit={handleLookupSubmit} className="flex items-center gap-2">
            <input
              type="text"
              value={lookupInput}
              onChange={(e) => setLookupInput(e.target.value)}
              placeholder="trk_..."
              aria-label="Tracking Token"
              className="min-h-[40px] px-3 py-1.5 text-xs font-mono bg-surface text-ink border border-border rounded-[var(--radius-md)]"
            />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              leftIcon={<Search className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              {locale === 'bn' ? 'ট্র্যাক করুন' : 'Track'}
            </Button>
          </form>
        </div>

        {!order ? (
          <EmptyState
            icon={<FileText className="w-6 h-6" aria-hidden="true" />}
            title={
              locale === 'bn'
                ? `ট্র্যাকিং তথ্য "${initialOrderNo}" পাওয়া যায়নি`
                : `Tracking Reference "${initialOrderNo}" Unavailable`
            }
            description={
              trackingErrorBn ??
              (locale === 'bn'
                ? 'নিরাপত্তার স্বার্থে শুধুমাত্র সিকিউর ট্র্যাকিং টোকেন (trk_...) অথবা মাই অ্যাকাউন্টে ওটিপি ভেরিফাই করে অর্ডার ট্র্যাক করা যায়।'
                : 'For customer privacy, public tracking requires your secure tracking token (trk_...) or OTP verification in My Account.')
            }
            actionLabel={dict.common.continueShopping}
            onAction={() => router.push('/')}
          />
        ) : (
          <div className="space-y-6">
            {/* Order Header Banner */}
            <Card surface="surface" padding="md" className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted">
                      {locale === 'bn' ? 'অর্ডার নম্বর:' : 'Order No:'}
                    </span>
                    <span className="text-base font-mono font-bold text-ink">
                      {order.orderNo}
                    </span>
                    <Badge
                      status={
                        isCancelledOrReturned
                          ? 'danger'
                          : activeStepIdx >= 4
                          ? 'success'
                          : 'info'
                      }
                    >
                      {order.status.toUpperCase()}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted">
                    {locale === 'bn' ? 'অর্ডারের সময়:' : 'Placed on:'}{' '}
                    {formatLocaleDateTime(order.createdAt, locale)}
                  </p>
                </div>

                {order.trackingCode && (
                  <div className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-bg text-xs">
                    <span className="text-muted">
                      {locale === 'bn'
                        ? 'কুরিয়ার ট্র্যাকিং কোড:'
                        : 'Courier Tracking:'}
                    </span>{' '}
                    <span className="font-mono font-bold text-ink">
                      {order.trackingCode}
                    </span>
                  </div>
                )}
              </div>

              {/* 5-Step Progress Tracker */}
              {isCancelledOrReturned ? (
                <div className="p-4 border border-danger rounded-[var(--radius-md)] bg-bg flex items-center gap-3 text-danger text-sm font-medium">
                  <AlertTriangle className="w-5 h-5 shrink-0" aria-hidden="true" />
                  <span>
                    {locale === 'bn'
                      ? 'এই অর্ডারটি বাতিল অথবা রিটার্ন প্রক্রিয়ায় রয়েছে।'
                      : 'This order has been cancelled or returned.'}
                  </span>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5 pt-2">
                  {TRACKING_STEPS.map((step, idx) => {
                    const IconComp = step.icon;
                    const isCompleted = idx <= activeStepIdx;
                    const isCurrent = idx === activeStepIdx;
                    return (
                      <div
                        key={step.key}
                        className={`p-3 rounded-[var(--radius-md)] border flex sm:flex-col items-center sm:items-start gap-3 sm:gap-2 ${
                          isCurrent
                            ? 'border-ink bg-bg ring-1 ring-ink'
                            : isCompleted
                            ? 'border-ink bg-bg'
                            : 'border-border bg-surface opacity-60'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-[var(--radius-sm)] flex items-center justify-center border ${
                            isCompleted
                              ? 'bg-ink text-bg border-ink'
                              : 'bg-surface text-muted border-border'
                          }`}
                        >
                          <IconComp className="w-4 h-4" aria-hidden="true" />
                        </div>
                        <div>
                          <p className="text-xs font-bold text-ink">
                            {locale === 'bn' ? step.labelBn : step.labelEn}
                          </p>
                          <p className="text-[11px] text-muted">
                            {isCurrent
                              ? locale === 'bn'
                                ? 'বর্তমান ধাপ'
                                : 'Current Stage'
                              : isCompleted
                              ? locale === 'bn'
                                ? 'সম্পন্ন'
                                : 'Completed'
                              : locale === 'bn'
                              ? 'অপেক্ষমান'
                              : 'Pending'}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Customer Details & Financial Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card surface="bg" padding="md" className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border pb-2.5">
                  <MapPin className="w-4 h-4 text-ink" aria-hidden="true" />
                  <h2 className="text-sm font-bold text-ink">
                    {locale === 'bn'
                      ? 'ডেলিভারি ঠিকানা ও প্রাপক'
                      : 'Delivery Recipient & Address'}
                  </h2>
                </div>
                <div className="space-y-1.5 text-xs sm:text-sm">
                  <p className="font-bold text-ink">{order.customerName}</p>
                  <p className="text-muted font-mono tabular-nums">
                    {order.customerPhoneMasked}
                  </p>
                  <p className="text-muted font-medium">
                    {order.upazilaNameBn}, {order.districtNameBn}
                  </p>
                  <p className="text-[11px] text-muted pt-1">
                    {locale === 'bn'
                      ? 'গ্রাহকের গোপনীয়তা রক্ষায় সম্পূর্ণ বাসার ঠিকানা পাবলিক পেজে লুকানো রয়েছে।'
                      : 'Full street address is hidden on public tracking for privacy.'}
                  </p>
                </div>
              </Card>

              <Card surface="bg" padding="md" className="space-y-3">
                <div className="flex items-center gap-2 border-b border-border pb-2.5">
                  <FileText className="w-4 h-4 text-ink" aria-hidden="true" />
                  <h2 className="text-sm font-bold text-ink">
                    {locale === 'bn'
                      ? 'পেমেন্ট ও হিসাব বিবরণী'
                      : 'Payment & Bill Summary'}
                  </h2>
                </div>
                <div className="space-y-1.5 text-xs sm:text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted">{dict.common.subtotal}</span>
                    <span className="font-semibold text-ink tabular-nums">
                      {formatPoishaToBdt(order.subtotalPoisha, locale)}
                    </span>
                  </div>
                  {order.discountPoisha > 0 && (
                    <div className="flex justify-between text-success">
                      <span>{dict.common.discount}</span>
                      <span className="font-semibold tabular-nums">
                        -{formatPoishaToBdt(order.discountPoisha, locale)}
                      </span>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span className="text-muted">
                      {dict.common.deliveryCharge}
                    </span>
                    <span className="font-semibold text-ink tabular-nums">
                      {order.deliveryChargePoisha === 0
                        ? dict.common.freeDelivery
                        : formatPoishaToBdt(order.deliveryChargePoisha, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-2 font-bold text-ink">
                    <span>{dict.common.total}</span>
                    <span className="tabular-nums">
                      {formatPoishaToBdt(order.totalPayablePoisha, locale)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs pt-1">
                    <span className="text-muted">
                      {locale === 'bn'
                        ? 'ডেলিভারির সময় পরিশোধযোগ্য (COD):'
                        : 'Cash Collectable on Delivery:'}
                    </span>
                    <span className="font-bold text-ink tabular-nums">
                      {formatPoishaToBdt(order.codCollectablePoisha, locale)}
                    </span>
                  </div>
                </div>
              </Card>
            </div>

            {/* Ordered Items Table */}
            <Card surface="bg" padding="md" className="space-y-3">
              <h2 className="text-sm font-bold text-ink border-b border-border pb-2.5">
                {locale === 'bn' ? 'অর্ডারকৃত পণ্যসমূহ' : 'Ordered Items'}
              </h2>
              <div className="divide-y divide-border text-xs sm:text-sm">
                {order.items.map((item, idx) => (
                  <div
                    key={idx}
                    className="py-2.5 flex items-center justify-between gap-4"
                  >
                    <div>
                      <p className="font-semibold text-ink">
                        {item.productNameBn}
                      </p>
                      <p className="text-xs text-muted">
                        {item.variantTitleBn} · SKU: {item.publicSku} ·{' '}
                        {locale === 'bn' ? 'পরিমাণ:' : 'Qty:'}{' '}
                        {formatLocaleNumber(item.quantity, locale)}
                      </p>
                    </div>
                    <span className="font-bold text-ink tabular-nums">
                      {formatPoishaToBdt(item.lineSubtotalPoisha, locale)}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    </StorefrontShell>
  );
}
