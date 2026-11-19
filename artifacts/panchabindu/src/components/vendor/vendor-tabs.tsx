'use client';

// src/components/vendor/vendor-tabs.tsx
// Minimalist, read-only-by-default vendor workspace tabs.
// Every figure shown here is whitelisted: vendor cost, vendor payable,
// admin-received stock history, admin-approved reviews, and 7-day escrow ledger.

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Clock,
  Coins,
  Info,
  MessageSquare,
  Package,
  PackageCheck,
  PackagePlus,
  PlusCircle,
  ShieldCheck,
  Star,
  Truck,
  Wallet,
  XCircle,
} from 'lucide-react';
import { Badge, Button, Card, EmptyState } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';
import type {
  VendorProductDTO,
  VendorWorkspaceDTO,
} from '@/lib/vendor/vendor-types';
import type { VendorTabKey } from '@/components/vendor/vendor-client';

type Translate = (bn: string, en: string) => string;
type Formatter = (value: number) => string;

export interface TabProps {
  workspace: VendorWorkspaceDTO;
  t: Translate;
  num: Formatter;
  money: Formatter;
}

export interface MutatingTabProps extends TabProps {
  send: (
    path: string,
    body: Record<string, unknown>,
    success: { bn: string; en: string }
  ) => Promise<boolean>;
  busy: boolean;
}

const inputClass =
  'w-full min-h-[44px] px-3 py-2 text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)] focus:outline-2 focus:outline-offset-0 focus:outline-ink disabled:opacity-60';
const textareaClass =
  'w-full min-h-[80px] px-3 py-2 text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)] focus:outline-2 focus:outline-offset-0 focus:outline-ink';

/** Exact Taka → poisha, no floating point. Returns null for invalid input. */
export function parseTaka(value: string): number | null {
  const clean = value.replace(/[৳,\s]/g, '');
  if (!/^\d+(\.\d{0,2})?$/.test(clean)) return null;
  const [whole, fraction = ''] = clean.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function statusTone(status: string): 'success' | 'warning' | 'danger' | 'info' | 'neutral' {
  if (['active', 'approved', 'approved_stocked', 'paid', 'delivered', 'available'].includes(status)) return 'success';
  if (['pending_qc', 'pending_review', 'requested', 'pending', 'pending_confirmation'].includes(status)) return 'warning';
  if (['rejected', 'cancelled', 'returned', 'suspended', 'closed', 'closing_audit'].includes(status)) return 'danger';
  if (['confirmed', 'packed', 'shipped', 'out_for_delivery', 'locked', 'return_initiated'].includes(status)) return 'info';
  return 'neutral';
}

const STATUS_BN: Record<string, string> = {
  active: 'সক্রিয়', draft: 'ড্রাফট', archived: 'আর্কাইভড',
  pending_qc: 'কিউসি অপেক্ষমাণ', approved_stocked: 'গৃহীত ও স্টকড', rejected: 'প্রত্যাখ্যাত',
  pending_review: 'যাচাই অপেক্ষমাণ', approved: 'অনুমোদিত',
  requested: 'অনুরোধকৃত', paid: 'পরিশোধিত',
  pending_confirmation: 'নিশ্চিতকরণ অপেক্ষমাণ', confirmed: 'নিশ্চিত', packed: 'প্যাকড',
  shipped: 'শিপড', out_for_delivery: 'ডেলিভারির পথে', delivered: 'ডেলিভারড',
  return_initiated: 'রিটার্ন শুরু', returned: 'ফেরত', cancelled: 'বাতিল',
};

function StatusBadge({ status, t }: { status: string; t: Translate }) {
  return <Badge status={statusTone(status)}>{t(STATUS_BN[status] ?? status, status)}</Badge>;
}

function Kpi({
  label,
  value,
  hint,
  tone = 'neutral',
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'neutral' | 'positive' | 'warning' | 'danger';
  icon?: React.ReactNode;
}) {
  const toneClass =
    tone === 'positive'
      ? 'text-success'
      : tone === 'warning'
      ? 'text-warning'
      : tone === 'danger'
      ? 'text-danger'
      : 'text-ink';
  return (
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3.5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        {icon ? <span className="text-muted">{icon}</span> : null}
      </div>
      <p className={cn('mt-1.5 text-lg font-bold tabular-nums', toneClass)}>{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function SectionHead({ title, desc, right }: { title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {desc ? <p className="mt-0.5 text-xs text-muted">{desc}</p> : null}
      </div>
      {right}
    </div>
  );
}

function formatShortDate(iso: string | null | undefined, bn: boolean): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(bn ? 'bn-BD' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ===========================================================================
// 1. DASHBOARD
// ===========================================================================

export function DashboardTab({
  workspace,
  onNavigate,
  onOpenPayout,
  t,
  num,
  money,
  bn,
}: TabProps & {
  onNavigate: (tab: VendorTabKey) => void;
  onOpenPayout: () => void;
  bn: boolean;
}) {
  const { escrow, counters, lots, approvedReviews, profile, rules, capabilities } = workspace;
  const holdDays = profile.escrowHoldDaysOverride ?? rules.globalEscrowHoldDays;

  const avgRating =
    approvedReviews.length > 0
      ? (approvedReviews.reduce((sum, r) => sum + r.rating, 0) / approvedReviews.length).toFixed(1)
      : '0.0';

  return (
    <div className="space-y-5">
      <SectionHead
        title={t('ভেন্ডর ড্যাশবোর্ড', 'Vendor Dashboard')}
        desc={t(
          'আপনার বিক্রয়, পেআউট ব্যালেন্স, স্টক রিসিভ এবং অ্যাডমিন-অনুমোদিত ক্রেতা রিভিউয়ের সারসংক্ষেপ।',
          'Overview of your balances, orders, stock receipts, and admin-approved customer reviews.'
        )}
      />

      {/* Primary Financial KPIs */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi
          label={t('মোট পাওনা বাকি', 'Total Owed')}
          value={money(escrow.totalOwedPoisha ?? (escrow.pendingPoisha + escrow.lockedPoisha + escrow.withdrawablePoisha))}
          hint={t('পেন্ডিং + লকড + উত্তোলনযোগ্য', 'Pending + Locked + Withdrawable')}
          tone={(escrow.totalOwedPoisha ?? 0) > 0 ? 'positive' : 'neutral'}
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
        />
        <Kpi
          label={t('মোট পরিশোধিত', 'Total Paid')}
          value={money(escrow.totalPaidPoisha ?? 0)}
          hint={t('এ পর্যন্ত প্রাপ্ত পেআউট', 'Disbursed payouts so far')}
          tone={(escrow.totalPaidPoisha ?? 0) > 0 ? 'positive' : 'neutral'}
          icon={<BadgeCheck className="h-4 w-4" aria-hidden="true" />}
        />
        <Kpi
          label={t('উত্তোলনযোগ্য', 'Withdrawable')}
          value={money(escrow.withdrawablePoisha)}
          hint={t('এখনই পেআউট অনুরোধযোগ্য', 'Ready for payout request')}
          tone={escrow.withdrawablePoisha > 0 ? 'positive' : 'neutral'}
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
        />
        <Kpi
          label={t('এসক্রো হোল্ডে আছে', 'On Hold')}
          value={money(escrow.lockedPoisha)}
          hint={t(`ডেলিভারির পর ${num(holdDays)} দিনের হোল্ড`, `${num(holdDays)}-day post-delivery hold`)}
          tone={escrow.lockedPoisha > 0 ? 'warning' : 'neutral'}
          icon={<Clock className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      {/* Payout Action & Operational Shortcuts */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card surface="surface" padding="md" className="flex flex-col justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-ink">{t('পেআউট ও উত্তোলন', 'Payout & Withdrawal')}</h3>
              {counters.pendingPayouts > 0 && (
                <Badge status="warning">
                  {num(counters.pendingPayouts)} {t('প্রক্রিয়াধীন', 'in progress')}
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted">
              {t(
                `সর্বনিম্ন ${money(rules.minPayoutRequestPoisha)} থেকে উত্তোলন অনুরোধ পাঠানো যায়। পেমেন্ট পদ্ধতি: ${profile.payoutMethodBn} (${profile.payoutAccountMasked})।`,
                `Minimum request is ${money(rules.minPayoutRequestPoisha)} via ${profile.payoutMethodBn} (${profile.payoutAccountMasked}).`
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              leftIcon={<Wallet className="h-4 w-4" aria-hidden="true" />}
              disabled={!capabilities.canRequestPayout}
              onClick={onOpenPayout}
              className="min-h-[44px]"
            >
              {t('পেআউট অনুরোধ করুন', 'Request Payout')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigate('earnings')}
              className="min-h-[44px]"
            >
              {t('আয় ও এসক্রো দেখুন', 'View Earnings & Escrow')}
            </Button>
          </div>
        </Card>

        <Card surface="surface" padding="md" className="space-y-3">
          <h3 className="text-sm font-bold text-ink">{t('চলতি কার্যক্রম', 'Workspace Activity')}</h3>
          <div className="grid grid-cols-1 gap-2 text-xs">
            <button
              type="button"
              onClick={() => onNavigate('orders')}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-left hover:bg-surface cursor-pointer"
            >
              <span className="flex items-center gap-2 font-medium text-ink">
                <ClipboardList className="h-4 w-4 text-muted" aria-hidden="true" />
                {t('চলতি অর্ডার', 'Open Orders')}
              </span>
              <span className="font-bold tabular-nums text-ink">{num(counters.openOrders)} ›</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('products')}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-left hover:bg-surface cursor-pointer"
            >
              <span className="flex items-center gap-2 font-medium text-ink">
                <Package className="h-4 w-4 text-muted" aria-hidden="true" />
                {t('সক্রিয় পণ্য / কম স্টক', 'Active Products / Low Stock')}
              </span>
              <span className="font-bold tabular-nums text-ink">
                {num(counters.activeProducts)} / {num(counters.lowStockVariants)} ›
              </span>
            </button>
            <button
              type="button"
              onClick={() => onNavigate('support')}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-bg px-3 py-2 text-left hover:bg-surface cursor-pointer"
            >
              <span className="flex items-center gap-2 font-medium text-ink">
                <MessageSquare className="h-4 w-4 text-muted" aria-hidden="true" />
                {t('খোলা সাপোর্ট টিকিট', 'Open Support Tickets')}
              </span>
              <span className="font-bold tabular-nums text-ink">{num(counters.openSupportTickets)} ›</span>
            </button>
          </div>
        </Card>
      </div>

      {/* Approved Customer Reviews Summary & Recent Stock Receipts */}
      <div className="grid gap-3 md:grid-cols-2">
        <Card surface="surface" padding="md" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <Star className="h-4 w-4 text-warning" aria-hidden="true" />
              {t('অ্যাডমিন-অনুমোদিত ক্রেতা রিভিউ', 'Approved Customer Reviews')}
            </h3>
            <span className="text-xs font-bold tabular-nums text-ink">
              {avgRating} ★ · {num(approvedReviews.length)} {t('টি রিভিউ', 'reviews')}
            </span>
          </div>
          {approvedReviews.length === 0 ? (
            <p className="text-xs text-muted">
              {t(
                'এখনো কোনো অ্যাডমিন-অনুমোদিত রিভিউ নেই। ক্রেতাদের রিভিউ অ্যাডমিন অনুমোদন করলে এখানে দেখাবে।',
                'No admin-approved customer reviews yet. Approved buyer reviews appear here.'
              )}
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {approvedReviews.slice(0, 3).map((rev) => (
                <li key={rev.reviewId} className="rounded-[var(--radius-sm)] border border-border bg-bg p-2.5 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate font-semibold text-ink">{bn ? rev.productNameBn : rev.productNameEn}</span>
                    <span className="shrink-0 font-mono text-[11px] font-bold text-warning tabular-nums">
                      {'★'.repeat(Math.max(1, Math.min(5, Math.round(rev.rating))))} ({num(rev.rating)})
                    </span>
                  </div>
                  <p className="text-ink/90 line-clamp-2">{rev.comment}</p>
                  <p className="text-[11px] text-muted">
                    {rev.reviewerLabel} · {formatShortDate(rev.createdAt, bn)}
                  </p>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" size="sm" onClick={() => onNavigate('products')} className="min-h-[40px]">
            {t('সব পণ্য ও রিভিউ দেখুন', 'View Products & All Reviews')}
          </Button>
        </Card>

        <Card surface="surface" padding="md" className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
              <PackageCheck className="h-4 w-4 text-ink" aria-hidden="true" />
              {t('সাম্প্রতিক স্টক গ্রহণ ইতিহাস', 'Recent Stock Receipts')}
            </h3>
            <span className="text-xs text-muted tabular-nums">
              {num(lots.length)} {t('টি চালান', 'batches')}
            </span>
          </div>
          {lots.length === 0 ? (
            <p className="text-xs text-muted">
              {t(
                'অ্যাডমিন প্যানেল থেকে কোনো পণ্য গ্রহণ রেকর্ড করা হলে তার বিস্তারিত ইতিহাস এখানে দেখা যাবে।',
                'Stock batches received by Admin appear here with dates, quantities, and unit costs.'
              )}
            </p>
          ) : (
            <ul className="space-y-2 text-xs">
              {lots.slice(0, 4).map((lot) => (
                <li key={lot.lotId} className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-sm)] border border-border bg-bg p-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-ink">
                      {lot.productNameBn} · {lot.variantTitleBn}
                    </p>
                    <p className="text-[11px] text-muted tabular-nums">
                      <span className="font-mono">{lot.lotCode}</span> · {formatShortDate(lot.receivedAt ?? lot.dispatchedAt, bn)} · {money(lot.unitSupplierCostPoisha)}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="font-bold tabular-nums text-ink">
                      {num(lot.qcAcceptedQty ?? lot.dispatchedQty)} {t('পিস', 'pcs')}
                    </span>
                    <StatusBadge status={lot.status} t={t} />
                  </div>
                </li>
              ))}
            </ul>
          )}
          <Button variant="outline" size="sm" onClick={() => onNavigate('products')} className="min-h-[40px]">
            {t('পূর্ণ রিসিভ ইতিহাস দেখুন', 'View Full Stock History')}
          </Button>
        </Card>
      </div>
    </div>
  );
}

// ===========================================================================
// 2. PRODUCTS, STOCK RECEIVING HISTORY & APPROVED REVIEWS
// ===========================================================================

export function ProductsTab({
  workspace,
  send,
  busy,
  t,
  num,
  money,
  bn,
}: MutatingTabProps & { bn: boolean }) {
  const { products, capabilities, categories, lots, approvedReviews } = workspace;
  const [editing, setEditing] = useState<VendorProductDTO | null>(null);
  const [creating, setCreating] = useState(false);
  const [reviewProductFilter, setReviewProductFilter] = useState<string>('all');

  // Optional Admin-unlocked lot submission state (only shown if capabilities.canSubmitConsignmentLot === true)
  const variantOptions = useMemo(
    () =>
      products.flatMap((product) =>
        product.variants.map((variant) => ({
          value: variant.variantId,
          label: `${product.nameBn} — ${variant.titleBn} (${variant.publicSku})`,
        }))
      ),
    [products]
  );
  const [lotVariantId, setLotVariantId] = useState(variantOptions[0]?.value ?? '');
  const [lotQty, setLotQty] = useState('1');
  const [lotChallanRef, setLotChallanRef] = useState('');
  const [lotNoteBn, setLotNoteBn] = useState('');

  const filteredReviews = useMemo(() => {
    if (reviewProductFilter === 'all') return approvedReviews;
    return approvedReviews.filter((r) => r.productId === reviewProductFilter);
  }, [approvedReviews, reviewProductFilter]);

  return (
    <div className="space-y-6">
      {/* 1. Product Catalog & Live Stock (Read-Only by default) */}
      <section className="space-y-3">
        <SectionHead
          title={t('পণ্য ও লাইভ স্টক', 'Products & Live Stock')}
          desc={t(
            'পণ্যের দাম, তথ্য ও স্টক অ্যাডমিন প্যানেল থেকে নিয়ন্ত্রিত হয়। এখানে আপনার প্রতিটি পণ্যের বর্তমান স্টক ও ক্রয়মূল্য দেখুন।',
            'Catalog, pricing, and stock levels are managed by Admin. Inspect your live inventory and unit costs here.'
          )}
          right={
            capabilities.canCreateProduct ? (
              <Button
                variant="primary"
                size="sm"
                leftIcon={<PackagePlus className="h-4 w-4" aria-hidden="true" />}
                onClick={() => {
                  setCreating(true);
                  setEditing(null);
                }}
              >
                {t('নতুন পণ্য', 'New product')}
              </Button>
            ) : (
              <Badge status="neutral">{t('শুধু দেখার জন্য (অ্যাডমিন নিয়ন্ত্রিত)', 'Read-only · Admin Managed')}</Badge>
            )
          }
        />

        {(creating || editing) && (
          <ProductEditor
            key={editing?.productId ?? 'new'}
            product={editing}
            categories={categories}
            canEdit={editing ? capabilities.canEditProduct : capabilities.canCreateProduct}
            busy={busy}
            t={t}
            bn={bn}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSubmit={async (payload) => {
              const ok = await send('/api/vendor/products', { action: 'upsert', product: payload }, {
                bn: editing ? 'পণ্য আপডেট হয়েছে।' : 'পণ্য ড্রাফট হিসেবে তৈরি হয়েছে।',
                en: editing ? 'Product updated.' : 'Product created as draft.',
              });
              if (ok) {
                setCreating(false);
                setEditing(null);
              }
            }}
          />
        )}

        {products.length === 0 ? (
          <EmptyState
            icon={<Package className="h-6 w-6" aria-hidden="true" />}
            title={t('কোনো পণ্য নেই', 'No products yet')}
            description={t(
              'অ্যাডমিন আপনার নামে পণ্য যোগ করলে সেগুলো এখানে তালিকাভুক্ত হবে।',
              'Products assigned to your supplier account appear here.'
            )}
          />
        ) : (
          <div className="space-y-3">
            {products.map((product) => (
              <Card key={product.productId} surface="surface" padding="sm" className="space-y-2.5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-bold text-ink">{bn ? product.nameBn : product.nameEn}</p>
                      <StatusBadge status={product.status} t={t} />
                      {product.lowStockThreshold > 0 &&
                        product.variants.some((variant) => variant.lowStock) && (
                          <Badge status="warning">{t('কম স্টক', 'Low stock')}</Badge>
                        )}
                    </div>
                    <p className="mt-0.5 text-[11px] text-muted tabular-nums">
                      {bn ? product.categoryNameBn : product.categoryNameEn} ·{' '}
                      {t('বিক্রিত', 'Sold')}: {num(product.totalSoldCount)} ·{' '}
                      {t('অনুমোদিত রিভিউ', 'Approved rating')}:{' '}
                      {product.reviewCount > 0
                        ? `${(product.ratingAvgBp / 100).toFixed(1)} ★ (${num(product.reviewCount)})`
                        : t('রিভিউ নেই', 'No reviews')}
                    </p>
                  </div>
                  {(capabilities.canEditProduct || capabilities.canChangeProductStatus) && (
                    <div className="flex flex-wrap gap-1.5">
                      {capabilities.canEditProduct && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setEditing(product);
                            setCreating(false);
                          }}
                        >
                          {t('সম্পাদনা', 'Edit')}
                        </Button>
                      )}
                      {capabilities.canChangeProductStatus && (
                        product.status !== 'active' ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            isLoading={busy}
                            onClick={() =>
                              void send(
                                '/api/vendor/products',
                                { action: 'set_status', productId: product.productId, status: 'active' },
                                { bn: 'পণ্য লাইভ হয়েছে।', en: 'Product published.' }
                              )
                            }
                          >
                            {t('লাইভ করুন', 'Publish')}
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            isLoading={busy}
                            onClick={() =>
                              void send(
                                '/api/vendor/products',
                                { action: 'set_status', productId: product.productId, status: 'draft' },
                                { bn: 'পণ্য ড্রাফটে সরানো হয়েছে।', en: 'Product moved to draft.' }
                              )
                            }
                          >
                            {t('আনপাবলিশ', 'Unpublish')}
                          </Button>
                        )
                      )}
                    </div>
                  )}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[540px] text-left text-[11px]">
                    <thead className="text-muted">
                      <tr className="border-b border-border">
                        <th className="py-1.5 pr-2 font-semibold">{t('ভ্যারিয়েন্ট', 'Variant')}</th>
                        <th className="py-1.5 pr-2 font-semibold">SKU</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">{t('সাপ্লায়ার কস্ট', 'Supplier Cost')}</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">{t('বিক্রয়মূল্য', 'Retail Price')}</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">{t('উপলব্ধ স্টক', 'Available')}</th>
                        <th className="py-1.5 pr-2 text-right font-semibold">{t('রিজার্ভড', 'Reserved')}</th>
                        <th className="py-1.5 text-right font-semibold">{t('ট্রানজিট', 'In Transit')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {product.variants.map((variant) => (
                        <tr key={variant.variantId} className="border-b border-border last:border-0">
                          <td className="py-1.5 pr-2 font-medium text-ink">{bn ? variant.titleBn : variant.titleEn}</td>
                          <td className="py-1.5 pr-2 font-mono text-muted">{variant.publicSku}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-ink">{money(variant.supplierCostPoisha)}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-muted">{money(variant.salePricePoisha)}</td>
                          <td className={cn('py-1.5 pr-2 text-right font-semibold tabular-nums', variant.lowStock ? 'text-warning' : 'text-ink')}>
                            {num(variant.stockAvailable)}
                          </td>
                          <td className="py-1.5 pr-2 text-right tabular-nums text-muted">{num(variant.stockReserved)}</td>
                          <td className="py-1.5 text-right tabular-nums text-muted">{num(variant.stockInTransit)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* 2. Product Receiving & Dispatch History */}
      <section className="space-y-3 border-t border-border pt-5">
        <SectionHead
          title={t('পণ্য পাঠানো ও অ্যাডমিন রিসিভ ইতিহাস', 'Product Receiving & Dispatch History')}
          desc={t(
            'কবে কোন পণ্য কত পিস পাঠানো হয়েছে, অ্যাডমিন কবে গ্রহণ করেছে, ইউনিট মূল্য ও মোট মূল্যসহ পূর্ণ হিস্ট্রি।',
            'Complete chronological record of every batch sent to warehouse and received by Admin, with dates, quantities, and unit costs.'
          )}
        />

        {capabilities.canSubmitConsignmentLot && (
          <Card surface="surface" padding="sm" className="space-y-2">
            <p className="text-xs font-bold text-ink">{t('নতুন চালান জমা দিন', 'Submit Dispatch Challan')}</p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const parsedQty = Number(lotQty);
                if (!lotVariantId || !Number.isInteger(parsedQty) || parsedQty < 1 || !lotChallanRef.trim()) return;
                const ok = await send(
                  '/api/vendor/stock',
                  { action: 'dispatch_lot', variantId: lotVariantId, dispatchedQty: parsedQty, challanRef: lotChallanRef, noteBn: lotNoteBn },
                  {
                    bn: 'চালান জমা হয়েছে; অ্যাডমিন রিসিভ করলে স্টকে যুক্ত হবে।',
                    en: 'Dispatch submitted; stock updates once received by Admin.',
                  }
                );
                if (ok) {
                  setLotChallanRef('');
                  setLotNoteBn('');
                  setLotQty('1');
                }
              }}
              className="grid gap-2 sm:grid-cols-4"
            >
              <label className="space-y-1 text-xs font-medium sm:col-span-2">
                <span>{t('ভ্যারিয়েন্ট', 'Variant')}</span>
                <select className={inputClass} value={lotVariantId} onChange={(e) => setLotVariantId(e.target.value)} required>
                  {variantOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium">
                <span>{t('পরিমাণ', 'Qty')}</span>
                <input className={inputClass} inputMode="numeric" value={lotQty} onChange={(e) => setLotQty(e.target.value.replace(/\D/g, ''))} required />
              </label>
              <label className="space-y-1 text-xs font-medium">
                <span>{t('চালান রেফ', 'Challan ref')}</span>
                <input className={inputClass} value={lotChallanRef} onChange={(e) => setLotChallanRef(e.target.value)} required />
              </label>
              <label className="space-y-1 text-xs font-medium sm:col-span-3">
                <span>{t('নোট', 'Note')}</span>
                <input className={inputClass} value={lotNoteBn} onChange={(e) => setLotNoteBn(e.target.value)} />
              </label>
              <div className="flex items-end">
                <Button type="submit" variant="primary" isLoading={busy} disabled={variantOptions.length === 0} leftIcon={<Truck className="h-4 w-4" aria-hidden="true" />} className="w-full min-h-[44px]">
                  {t('চালান জমা', 'Submit')}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {lots.length === 0 ? (
          <EmptyState
            icon={<Boxes className="h-6 w-6" aria-hidden="true" />}
            title={t('এখনো কোনো স্টক রিসিভ রেকর্ড নেই', 'No receiving history yet')}
            description={t(
              'অ্যাডমিন প্যানেল থেকে চালান গ্রহণ রেকর্ড করা হলে এখানে তারিখ, দাম ও পরিমাণসহ দেখাবে।',
              'Once Admin records incoming shipments, full batch details appear here.'
            )}
          />
        ) : (
          <Card surface="bg" padding="none">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[780px] text-left text-xs">
                <thead className="bg-surface text-muted">
                  <tr className="border-b border-border">
                    <th className="p-2.5 font-semibold">{t('তারিখ (পাঠানো / রিসিভ)', 'Dates (Sent / Received)')}</th>
                    <th className="p-2.5 font-semibold">{t('লট ও চালান রেফ', 'Lot & Challan')}</th>
                    <th className="p-2.5 font-semibold">{t('পণ্য ও SKU', 'Product & SKU')}</th>
                    <th className="p-2.5 text-right font-semibold">{t('পাঠানো / গৃহীত / বাতিল', 'Sent / Accepted / Rej.')}</th>
                    <th className="p-2.5 text-right font-semibold">{t('ইউনিট ও মোট মূল্য', 'Unit & Batch Value')}</th>
                    <th className="p-2.5 font-semibold">{t('অবস্থা ও নোট', 'Status & Notes')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lots.map((lot) => (
                    <tr key={lot.lotId} className="border-t border-border">
                      <td className="p-2.5 whitespace-nowrap text-[11px] tabular-nums">
                        <p className="text-ink">{t('পাঠানো', 'Sent')}: {formatShortDate(lot.dispatchedAt, bn)}</p>
                        <p className="text-muted">
                          {t('রিসিভ', 'Recv')}: {lot.receivedAt ? formatShortDate(lot.receivedAt, bn) : t('অপেক্ষমাণ', 'Pending')}
                        </p>
                      </td>
                      <td className="p-2.5 font-mono text-[11px]">
                        <p className="font-bold text-ink">{lot.lotCode}</p>
                        <p className="text-muted">{lot.challanRef}</p>
                      </td>
                      <td className="p-2.5">
                        <p className="font-medium text-ink">{lot.productNameBn} · {lot.variantTitleBn}</p>
                        <p className="font-mono text-[11px] text-muted">{lot.publicSku}</p>
                      </td>
                      <td className="p-2.5 text-right tabular-nums">
                        <span className="font-semibold text-ink">{num(lot.dispatchedQty)}</span>
                        {' / '}
                        <span className="font-bold text-success">
                          {lot.qcAcceptedQty === null ? '—' : num(lot.qcAcceptedQty)}
                        </span>
                        {' / '}
                        <span className={cn(lot.qcRejectedQty && lot.qcRejectedQty > 0 ? 'font-bold text-danger' : 'text-muted')}>
                          {lot.qcRejectedQty === null ? '—' : num(lot.qcRejectedQty)}
                        </span>
                      </td>
                      <td className="p-2.5 text-right tabular-nums">
                        <p className="font-semibold text-ink">{money(lot.totalValuePoisha)}</p>
                        <p className="text-[11px] text-muted">@ {money(lot.unitSupplierCostPoisha)}</p>
                      </td>
                      <td className="p-2.5 space-y-1">
                        <StatusBadge status={lot.status} t={t} />
                        {lot.noteBn && <p className="text-[11px] text-muted">{lot.noteBn}</p>}
                        {lot.qcProofUrl && (
                          <a href={lot.qcProofUrl} target="_blank" rel="noreferrer" className="block text-[11px] underline text-ink">
                            {t('রিসিভ প্রমাণ দেখুন', 'View receipt proof')}
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}
      </section>

      {/* 3. Admin-Approved Customer Reviews */}
      <section className="space-y-3 border-t border-border pt-5">
        <SectionHead
          title={t('অ্যাডমিন-অনুমোদিত ক্রেতা রিভিউ ও রেটিং', 'Admin-Approved Customer Reviews & Ratings')}
          desc={t(
            'কেনাকাটার পর ক্রেতাদের দেওয়া যেসব রিভিউ অ্যাডমিন অনুমোদন করেছেন শুধু সেগুলোই এখানে প্রদর্শিত হচ্ছে।',
            'Only customer ratings and reviews approved by Admin are displayed here.'
          )}
          right={
            products.length > 0 && (
              <select
                aria-label={t('পণ্য অনুযায়ী রিভিউ ফিল্টার', 'Filter reviews by product')}
                value={reviewProductFilter}
                onChange={(e) => setReviewProductFilter(e.target.value)}
                className="min-h-[44px] rounded-[var(--radius-md)] border border-border bg-surface px-3 py-1.5 text-xs font-medium text-ink"
              >
                <option value="all">{t(`সব পণ্য (${num(approvedReviews.length)})`, `All products (${num(approvedReviews.length)})`)}</option>
                {products.map((p) => (
                  <option key={p.productId} value={p.productId}>
                    {bn ? p.nameBn : p.nameEn}
                  </option>
                ))}
              </select>
            )
          }
        />

        {filteredReviews.length === 0 ? (
          <EmptyState
            icon={<Star className="h-6 w-6" aria-hidden="true" />}
            title={t('কোনো অনুমোদিত রিভিউ নেই', 'No approved reviews yet')}
            description={t(
              'ক্রেতাদের রিভিউ অ্যাডমিন প্যানেল থেকে অনুমোদিত হলে এখানে দেখা যাবে।',
              'Customer feedback appears here once moderated and approved by Admin.'
            )}
          />
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {filteredReviews.map((rev) => (
              <Card key={rev.reviewId} surface="surface" padding="sm" className="space-y-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-ink">{bn ? rev.productNameBn : rev.productNameEn}</p>
                    <p className="text-[11px] text-muted">
                      {rev.reviewerLabel}
                      {rev.isVerifiedPurchase ? ` · ${t('যাচাইকৃত ক্রেতা', 'Verified purchase')}` : ''}
                      {' · '}
                      {formatShortDate(rev.createdAt, bn)}
                    </p>
                  </div>
                  <span className="shrink-0 font-mono text-xs font-bold text-warning tabular-nums">
                    {'★'.repeat(Math.max(1, Math.min(5, Math.round(rev.rating))))} {num(rev.rating)}.0
                  </span>
                </div>
                <p className="text-xs text-ink leading-relaxed">{rev.comment}</p>
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

interface VariantDraft {
  variantId?: string;
  publicSku: string;
  titleBn: string;
  titleEn: string;
  supplierCostPoisha: string;
  salePricePoisha: string;
  weightGrams: string;
}

function ProductEditor({
  product,
  categories,
  canEdit,
  busy,
  t,
  bn,
  onCancel,
  onSubmit,
}: {
  product: VendorProductDTO | null;
  categories: Array<{ id: string; nameBn: string; nameEn: string }>;
  canEdit: boolean;
  busy: boolean;
  t: Translate;
  bn: boolean;
  onCancel: () => void;
  onSubmit: (payload: Record<string, unknown>) => Promise<void>;
}) {
  const [nameBn, setNameBn] = useState(product?.nameBn ?? '');
  const [nameEn, setNameEn] = useState(product?.nameEn ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? categories[0]?.id ?? '');
  const [descriptionBn, setDescriptionBn] = useState(product?.descriptionBn ?? '');
  const [images, setImages] = useState((product?.images ?? []).join('\n'));
  const [freeDelivery, setFreeDelivery] = useState(product?.isFreeDelivery ?? false);
  const [lowStock, setLowStock] = useState(String(product?.lowStockThreshold ?? 5));
  const [leadTime, setLeadTime] = useState(String(product?.leadTimeDays ?? 3));
  const [variants, setVariants] = useState<VariantDraft[]>(
    product
      ? product.variants.map((variant) => ({
          variantId: variant.variantId,
          publicSku: variant.publicSku,
          titleBn: variant.titleBn,
          titleEn: variant.titleEn,
          supplierCostPoisha: String(variant.supplierCostPoisha / 100),
          salePricePoisha: String(variant.salePricePoisha / 100),
          weightGrams: String(variant.weightGrams),
        }))
      : [
          {
            publicSku: '',
            titleBn: 'স্ট্যান্ডার্ড',
            titleEn: 'Standard',
            supplierCostPoisha: '',
            salePricePoisha: '',
            weightGrams: '500',
          },
        ]
  );
  const [formError, setFormError] = useState('');

  const updateVariant = (index: number, patch: Partial<VariantDraft>) => {
    setVariants((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setFormError('');

    const parsedVariants = variants.map((variant) => ({
      variantId: variant.variantId,
      publicSku: variant.publicSku.trim().toUpperCase(),
      titleBn: variant.titleBn.trim(),
      titleEn: variant.titleEn.trim() || variant.titleBn.trim(),
      supplierCostPoisha: parseTaka(variant.supplierCostPoisha),
      salePricePoisha: parseTaka(variant.salePricePoisha),
      weightGrams: Number(variant.weightGrams) || 500,
    }));

    for (const variant of parsedVariants) {
      if (!variant.publicSku || !variant.titleBn) {
        setFormError(t('প্রতিটি ভ্যারিয়েন্টের SKU ও নাম দিন।', 'Every variant needs a SKU and a title.'));
        return;
      }
      if (variant.supplierCostPoisha === null || variant.salePricePoisha === null) {
        setFormError(t('ক্রয়মূল্য ও বিক্রয়মূল্য সঠিক সংখ্যায় দিন।', 'Enter valid cost and retail prices.'));
        return;
      }
      if (variant.salePricePoisha <= variant.supplierCostPoisha) {
        setFormError(t('বিক্রয়মূল্য ক্রয়মূল্যের চেয়ে বেশি হতে হবে।', 'Retail price must exceed your cost.'));
        return;
      }
    }

    const marginBp = parsedVariants.some((variant) => {
      const cost = variant.supplierCostPoisha as number;
      const sale = variant.salePricePoisha as number;
      return (sale - cost) * 10000 < sale * 500;
    });
    if (marginBp) {
      setFormError(
        t(
          'প্রতিটি ভ্যারিয়েন্টে কমপক্ষে ৫% প্ল্যাটফর্ম মার্জিন থাকতে হবে।',
          'Each variant needs at least a 5% platform margin.'
        )
      );
      return;
    }

    await onSubmit({
      productId: product?.productId,
      categoryId,
      nameBn: nameBn.trim(),
      nameEn: nameEn.trim() || nameBn.trim(),
      descriptionBn: descriptionBn.trim(),
      images: images
        .split('\n')
        .map((url) => url.trim())
        .filter(Boolean),
      isFreeDelivery: freeDelivery,
      lowStockThreshold: Number(lowStock) || 0,
      leadTimeDays: Number(leadTime) || 0,
      variants: parsedVariants,
    });
  }

  return (
    <Card surface="surface" padding="md" className="space-y-3">
      <h3 className="text-sm font-bold">
        {product ? t('পণ্য সম্পাদনা', 'Edit product') : t('নতুন পণ্য যোগ করুন', 'Add a new product')}
      </h3>
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-2 sm:grid-cols-2">
          <label className="space-y-1 text-xs font-medium">
            <span>{t('বাংলা নাম', 'Bangla name')}</span>
            <input className={inputClass} value={nameBn} onChange={(e) => setNameBn(e.target.value)} required />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>{t('ইংরেজি নাম', 'English name')}</span>
            <input className={inputClass} value={nameEn} onChange={(e) => setNameEn(e.target.value)} />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>{t('ক্যাটাগরি', 'Category')}</span>
            <select className={inputClass} value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {bn ? category.nameBn : category.nameEn}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>{t('কম স্টক সীমা', 'Low stock threshold')}</span>
            <input
              className={inputClass}
              inputMode="numeric"
              value={lowStock}
              onChange={(e) => setLowStock(e.target.value.replace(/\D/g, ''))}
            />
          </label>
        </div>

        <label className="block space-y-1 text-xs font-medium">
          <span>{t('বাংলা বিবরণ', 'Bangla description')}</span>
          <textarea
            className={textareaClass}
            value={descriptionBn}
            onChange={(e) => setDescriptionBn(e.target.value)}
            required
            minLength={5}
          />
        </label>

        <label className="block space-y-1 text-xs font-medium">
          <span>{t('ছবির লিংক (প্রতি লাইনে একটি)', 'Image URLs (one per line)')}</span>
          <textarea
            className={textareaClass}
            value={images}
            onChange={(e) => setImages(e.target.value)}
            placeholder="https://..."
          />
        </label>

        <div className="flex flex-wrap items-center gap-3 text-xs">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={freeDelivery}
              onChange={(e) => setFreeDelivery(e.target.checked)}
            />
            <span>{t('ফ্রি ডেলিভারি', 'Free delivery')}</span>
          </label>
          <label className="flex items-center gap-2">
            <span>{t('লিড টাইম (দিন)', 'Lead time (days)')}</span>
            <input
              className="w-16 rounded-[var(--radius-sm)] border border-border bg-bg px-2 py-1 text-xs"
              inputMode="numeric"
              value={leadTime}
              onChange={(e) => setLeadTime(e.target.value.replace(/\D/g, ''))}
            />
          </label>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold">{t('ভ্যারিয়েন্ট', 'Variants')}</p>
            <Button
              variant="outline"
              size="sm"
              leftIcon={<PlusCircle className="h-3.5 w-3.5" aria-hidden="true" />}
              onClick={() =>
                setVariants((current) => [
                  ...current,
                  {
                    publicSku: '',
                    titleBn: '',
                    titleEn: '',
                    supplierCostPoisha: '',
                    salePricePoisha: '',
                    weightGrams: '500',
                  },
                ])
              }
            >
              {t('ভ্যারিয়েন্ট যোগ', 'Add variant')}
            </Button>
          </div>
          {variants.map((variant, index) => (
            <div key={index} className="grid gap-2 rounded-[var(--radius-md)] border border-border p-2 sm:grid-cols-6">
              <input className={inputClass} placeholder="SKU" value={variant.publicSku} onChange={(e) => updateVariant(index, { publicSku: e.target.value })} required />
              <input className={inputClass} placeholder={t('নাম (বাংলা)', 'Title (Bangla)')} value={variant.titleBn} onChange={(e) => updateVariant(index, { titleBn: e.target.value })} required />
              <input className={inputClass} placeholder={t('নাম (ইংরেজি)', 'Title (English)')} value={variant.titleEn} onChange={(e) => updateVariant(index, { titleEn: e.target.value })} />
              <input className={inputClass} placeholder={t('ক্রয়মূল্য ৳', 'Cost ৳')} inputMode="decimal" value={variant.supplierCostPoisha} onChange={(e) => updateVariant(index, { supplierCostPoisha: e.target.value })} required disabled={Boolean(product)} />
              <input className={inputClass} placeholder={t('বিক্রয়মূল্য ৳', 'Retail ৳')} inputMode="decimal" value={variant.salePricePoisha} onChange={(e) => updateVariant(index, { salePricePoisha: e.target.value })} required disabled={Boolean(product)} />
              <div className="flex items-center gap-1">
                <input className={inputClass} placeholder={t('গ্রাম', 'grams')} inputMode="numeric" value={variant.weightGrams} onChange={(e) => updateVariant(index, { weightGrams: e.target.value.replace(/\D/g, '') })} />
                {variants.length > 1 && (
                  <button
                    type="button"
                    aria-label={t('ভ্যারিয়েন্ট মুছুন', 'Remove variant')}
                    className="min-h-[44px] min-w-[44px] rounded-[var(--radius-sm)] border border-danger text-danger"
                    onClick={() => setVariants((current) => current.filter((_, i) => i !== index))}
                  >
                    <XCircle className="mx-auto h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {formError && <p role="alert" className="text-xs font-medium text-danger">{formError}</p>}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="primary" isLoading={busy} disabled={!canEdit}>
            {product ? t('পরিবর্তন সংরক্ষণ', 'Save changes') : t('ড্রাফট তৈরি করুন', 'Create draft')}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            {t('বাতিল', 'Cancel')}
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ===========================================================================
// 3. ORDERS & RETURNS (MERGED)
// ===========================================================================

const FAULT_LABELS: Record<string, [string, string]> = {
  WAREHOUSE_PACKAGING_FAULT: ['প্যাকেজিং সংক্রান্ত', 'Packaging issue'],
  SUPPLIER_DEFECT: ['সরবরাহকারী ত্রুটি', 'Supplier defect'],
  COURIER_NEGLIGENCE: ['কুরিয়ার সংক্রান্ত', 'Courier issue'],
  CUSTOMER_INTACT_RETURN: ['গ্রাহকের সিদ্ধান্ত', 'Customer decision'],
};

export function OrdersTab({ workspace, t, num, money, bn }: TabProps & { bn: boolean }) {
  const { orders, returns, counters } = workspace;
  const [filter, setFilter] = useState<'all' | 'open' | 'delivered' | 'returns'>('all');

  const returnByOrderNo = useMemo(() => {
    const map = new Map<string, typeof returns>();
    for (const r of returns) {
      const existing = map.get(r.orderNo) ?? [];
      existing.push(r);
      map.set(r.orderNo, existing);
    }
    return map;
  }, [returns]);

  const visibleOrders = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'open') {
      return orders.filter((o) =>
        ['pending_confirmation', 'confirmed', 'packed', 'shipped', 'out_for_delivery'].includes(o.status)
      );
    }
    if (filter === 'delivered') {
      return orders.filter((o) => o.status === 'delivered');
    }
    return [];
  }, [orders, filter]);

  const openCount = counters.openOrders;
  const deliveredCount = orders.filter((o) => o.status === 'delivered').length;
  const returnsCount = returns.length;

  return (
    <div className="space-y-4">
      <SectionHead
        title={t('অর্ডার ও রিটার্ন ইতিহাস', 'Orders & Returns')}
        desc={t(
          'প্রতিটি অর্ডারের তারিখ, কুরিয়ার ডেলিভারি অবস্থা, প্রোডাক্ট ও আপনার প্রদেয় অর্থ। ক্রেতার ফোন ও বাসার ঠিকানা সুরক্ষিত থাকে।',
          'Order timestamps, courier progress, items, vendor payable, and return adjustments. Customer phone and street address remain protected.'
        )}
        right={
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ['all', t('সব', 'All'), orders.length],
                ['open', t('চলতি', 'Open'), openCount],
                ['delivered', t('ডেলিভারড', 'Delivered'), deliveredCount],
                ['returns', t('রিটার্ন', 'Returns'), returnsCount],
              ] as const
            ).map(([key, label, count]) => (
              <Button
                key={key}
                size="sm"
                variant={filter === key ? 'primary' : 'outline'}
                onClick={() => setFilter(key)}
                className="min-h-[40px] whitespace-nowrap"
              >
                {label} ({num(count)})
              </Button>
            ))}
          </div>
        }
      />

      {filter === 'returns' ? (
        returns.length === 0 ? (
          <EmptyState
            icon={<ArrowRightLeft className="h-6 w-6" aria-hidden="true" />}
            title={t('কোনো নিষ্পত্তিকৃত রিটার্ন নেই', 'No resolved returns')}
            description={t('আপনার পণ্যের কোনো রিটার্ন নিষ্পত্তি হলে এখানে দেখাবে।', 'Resolved returns for your items appear here.')}
          />
        ) : (
          <div className="space-y-2.5">
            {returns.map((item) => (
              <Card key={item.returnId} surface="surface" padding="sm" className="space-y-1.5 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-bold text-ink">{item.orderNo}</span>
                    <Badge status={item.vendorDebitPoisha > 0 ? 'danger' : 'info'}>
                      {FAULT_LABELS[item.faultType] ? t(...FAULT_LABELS[item.faultType]) : item.faultType}
                    </Badge>
                  </div>
                  <span className="text-[11px] text-muted tabular-nums">{formatShortDate(item.createdAt, bn)}</span>
                </div>
                <p className="text-muted tabular-nums">
                  {t('ফেরত পরিমাণ', 'Returned qty')}: <strong className="text-ink">{num(item.quantity)}</strong>
                  {' · '}
                  {t('পুনরায় স্টকে', 'Restocked')}: <strong className="text-ink">{num(item.restockQuantity)}</strong>
                  {' · '}
                  {t('ভেন্ডর ডেবিট/সমন্বয়', 'Vendor debit adjustment')}:{' '}
                  <strong className={item.vendorDebitPoisha > 0 ? 'text-danger' : 'text-ink'}>
                    {money(item.vendorDebitPoisha)}
                  </strong>
                </p>
              </Card>
            ))}
          </div>
        )
      ) : visibleOrders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
          title={t('কোনো অর্ডার নেই', 'No orders found')}
          description={t('আপনার পণ্য বিক্রি হলে অর্ডার এখানে দেখা যাবে।', 'Orders containing your products appear here.')}
        />
      ) : (
        <div className="space-y-2.5">
          {visibleOrders.map((order) => {
            const linkedReturns = returnByOrderNo.get(order.orderNo) ?? [];
            return (
              <Card key={order.orderNo} surface="surface" padding="sm" className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold text-ink">{order.orderNo}</span>
                  <StatusBadge status={order.status} t={t} />
                  <span className="text-[11px] text-muted">
                    {t('পেমেন্ট', 'Payment')}: {order.paymentStatus}
                  </span>
                  {order.courierProvider && (
                    <span className="text-[11px] font-medium text-ink">
                      · {order.courierProvider.toUpperCase()}
                    </span>
                  )}
                  <span className="text-[11px] text-muted tabular-nums">
                    · {order.districtNameBn} · {order.upazilaNameBn} · {formatShortDate(order.createdAt, bn)}
                  </span>
                  <span className="ml-auto text-xs font-bold tabular-nums text-ink">
                    {money(order.supplierPayablePoisha)}
                  </span>
                </div>

                {(order.trackingCode || order.consignmentId || order.dispatchedAt || order.deliveredAt) && (
                  <div className="flex flex-wrap gap-x-4 gap-y-0.5 rounded-[var(--radius-sm)] border border-border bg-bg px-2.5 py-1.5 font-mono text-[11px] text-muted">
                    {order.trackingCode && <span>{t('ট্র্যাকিং', 'Tracking')}: {order.trackingCode}</span>}
                    {order.consignmentId && <span>{t('কনসাইনমেন্ট', 'Consignment')}: {order.consignmentId}</span>}
                    {order.dispatchedAt && (
                      <span>{t('পাঠানো', 'Dispatched')}: {formatShortDate(order.dispatchedAt, bn)}</span>
                    )}
                    {order.deliveredAt && (
                      <span className="text-success">
                        {t('ডেলিভারি', 'Delivered')}: {formatShortDate(order.deliveredAt, bn)}
                      </span>
                    )}
                  </div>
                )}

                <ul className="space-y-1 border-t border-border pt-2 text-[11px]">
                  {order.lines.map((line, index) => (
                    <li key={index} className="flex items-center justify-between gap-2">
                      <span className="min-w-0 truncate text-ink">
                        {bn ? line.productNameBn : line.productNameEn} · {bn ? line.variantTitleBn : line.variantTitleEn}{' '}
                        <span className="font-mono text-muted">({line.publicSku})</span>
                      </span>
                      <span className="shrink-0 font-medium tabular-nums text-ink">
                        ×{num(line.quantity)} = {money(line.supplierPayablePoisha)}
                      </span>
                    </li>
                  ))}
                </ul>

                {linkedReturns.length > 0 && (
                  <div className="rounded-[var(--radius-sm)] border border-danger/40 bg-bg px-2.5 py-2 text-[11px] space-y-1">
                    {linkedReturns.map((ret) => (
                      <p key={ret.returnId} className="text-ink tabular-nums">
                        <strong className="text-danger">{t('রিটার্ন নিষ্পত্তি', 'Return resolved')}:</strong>{' '}
                        {FAULT_LABELS[ret.faultType] ? t(...FAULT_LABELS[ret.faultType]) : ret.faultType} ·{' '}
                        {t('ফেরত', 'Returned')}: {num(ret.quantity)} ·{' '}
                        {t('স্টকে ফেরত', 'Restocked')}: {num(ret.restockQuantity)} ·{' '}
                        {t('সমন্বয়', 'Debit')}: {money(ret.vendorDebitPoisha)}
                      </p>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// 4. EARNINGS, 7-DAY ESCROW & PAYOUT HISTORY
// ===========================================================================

type LedgerStatement = {
  from: string; to: string; generatedAt: string; ledgerEntryCount: number;
  buckets: Array<{ bucket: 'pending' | 'locked' | 'available'; openingPoisha: number; creditsPoisha: number; debitsPoisha: number; closingPoisha: number }>;
  payouts: Array<{ payoutId: string; amountPoisha: number; method: string; accountMasked: string; transactionId: string | null; requestedAt: string; recordedPaidAt: string }>;
};

export function EarningsTab({
  workspace,
  onOpenPayout,
  t,
  num,
  money,
}: TabProps & { onOpenPayout: () => void }) {
  const { escrow, ledger, payouts, profile, rules, capabilities } = workspace;
  const holdDays = profile.escrowHoldDaysOverride ?? rules.globalEscrowHoldDays;

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [exportError, setExportError] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [statement, setStatement] = useState<LedgerStatement | null>(null);
  const [statementError, setStatementError] = useState(false);
  const [statementLoading, setStatementLoading] = useState(false);

  async function loadStatement() {
    setStatementError(false); setStatement(null); setStatementLoading(true);
    try {
      const query = new URLSearchParams({ from, to, format: 'summary' });
      const response = await fetch(`/api/vendor/statement?${query}`, { credentials: 'same-origin', cache: 'no-store' });
      const body = await response.json() as { success?: boolean; statement?: LedgerStatement };
      if (!response.ok || !body.success || !body.statement) throw new Error('Statement failed');
      setStatement(body.statement);
    } catch { setStatementError(true); } finally { setStatementLoading(false); }
  }

  async function exportStatement() {
    setExportError(false); setExporting(true);
    try {
      const query = new URLSearchParams({ from, to });
      const response = await fetch(`/api/vendor/statement?${query}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('Export failed');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = url; link.download = 'vendor-ledger.csv';
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setExportError(true); } finally { setExporting(false); }
  }

  return (
    <div className="space-y-5">
      <SectionHead
        title={t('আয়, ৭ দিনের এসক্রো ও পেআউট ইতিহাস', 'Earnings, Escrow & Payout History')}
        desc={t(
          `ডেলিভারির পর ${num(holdDays)} দিন লকড বাকেটে থেকে টাকা Available বাকেটে আসে এবং তখন পেআউট করা যায়।`,
          `Funds wait ${num(holdDays)} days in Locked escrow after delivery before entering Withdrawable Available balance.`
        )}
        right={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<Wallet className="h-4 w-4" aria-hidden="true" />}
            disabled={!capabilities.canRequestPayout}
            onClick={onOpenPayout}
            className="min-h-[44px]"
          >
            {t('পেআউট অনুরোধ করুন', 'Request Payout')}
          </Button>
        }
      />

      {/* Escrow & Lifetime Summary */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label={t('মোট আয়', 'Total Earned')} value={money(escrow.totalEarnedPoisha ?? 0)} />
        <Kpi label={t('মোট পরিশোধিত', 'Total Paid')} value={money(escrow.totalPaidPoisha ?? 0)} tone="positive" />
        <Kpi label={t('মোট পাওনা বাকি', 'Total Owed')} value={money(escrow.totalOwedPoisha ?? 0)} tone="positive" />
        <Kpi label={t('পেন্ডিং (অপেক্ষমাণ)', 'Pending')} value={money(escrow.pendingPoisha)} hint={t('ডেলিভারি বাকি', 'Before delivery')} />
        <Kpi label={t(`লকড (${num(holdDays)} দিন)`, `Locked (${num(holdDays)}d)`)} value={money(escrow.lockedPoisha)} hint={t('হোল্ড পিরিয়ড', 'Maturity lock')} tone="warning" />
        <Kpi label={t('উত্তোলনযোগ্য', 'Withdrawable')} value={money(escrow.withdrawablePoisha)} hint={t(`হোল্ড: ${money(escrow.payoutHoldPoisha)}`, `In request: ${money(escrow.payoutHoldPoisha)}`)} tone="positive" />
      </div>

      {escrow.clawbackDebtPoisha > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-danger bg-surface p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <p>
            {t(
              `পেআউটের পর রিটার্নের কারণে ${money(escrow.clawbackDebtPoisha)} সমন্বয় (clawback) বাকি আছে; পরবর্তী আয় থেকে কেটে নেওয়া হবে।`,
              `A post-payout clawback of ${money(escrow.clawbackDebtPoisha)} is outstanding and will be deducted from future earnings.`
            )}
          </p>
        </div>
      )}

      {/* Payout Requests & Proof History */}
      <section className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">{t('পেআউট অনুরোধ ও পরিশোধ প্রমাণ', 'Payout Requests & Payment Proofs')}</h3>
          <span className="text-xs text-muted tabular-nums">
            {num(payouts.length)} {t('টি রেকর্ড', 'records')}
          </span>
        </div>

        {payouts.length === 0 ? (
          <Card surface="surface" padding="sm">
            <p className="text-xs text-muted">
              {t('এখনো কোনো পেআউট অনুরোধ বা পরিশোধ রেকর্ড নেই। Available ব্যালেন্স জমা হলে পেআউট অনুরোধ করুন।', 'No payout requests or disbursements yet.')}
            </p>
          </Card>
        ) : (
          <div className="space-y-2">
            {payouts.map((payout) => (
              <Card key={payout.payoutId} surface="surface" padding="sm" className="space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-mono text-[11px] font-bold text-ink">{payout.payoutId}</span>
                  <StatusBadge status={payout.status} t={t} />
                  {payout.entryType === 'direct_settlement' && (
                    <Badge status="info">{t('অ্যাডমিন সরাসরি পরিশোধ', 'Direct settlement')}</Badge>
                  )}
                  <span className="ml-auto font-bold tabular-nums text-ink">{money(payout.requestedAmountPoisha)}</span>
                </div>
                <p className="text-[11px] text-muted tabular-nums">
                  {payout.payoutMethodBn} · {payout.payoutAccountMasked} ·{' '}
                  {new Date(payout.resolvedAt ?? payout.requestedAt).toLocaleString()}
                  {payout.paymentTrxId ? ` · TrxID: ${payout.paymentTrxId}` : ''}
                  {payout.status === 'paid' && typeof payout.netPaidPoisha === 'number'
                    ? ` · ${t('চার্জ', 'Fee')}: ${money(payout.feePoisha ?? 0)} · ${t('নিট প্রাপ্তি', 'Net')}: ${money(payout.netPaidPoisha)}`
                    : ''}
                </p>
                {payout.noteBn && <p className="text-[11px] text-muted">{t('নোট', 'Note')}: {payout.noteBn}</p>}
                {payout.proofUrl && (
                  <p className="text-[11px]">
                    <a href={payout.proofUrl} target="_blank" rel="noreferrer" className="underline text-ink">
                      {t('পেমেন্ট প্রমাণ দেখুন', 'View payment proof')}
                    </a>
                  </p>
                )}
                {payout.rejectionReasonBn && (
                  <p className="text-[11px] text-danger">
                    {t('প্রত্যাখ্যানের কারণ', 'Rejection reason')}: {payout.rejectionReasonBn}
                  </p>
                )}
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Immutable Ledger Entries with 7-day maturity indicator */}
      <section className="space-y-2.5">
        <h3 className="text-sm font-bold text-ink">{t('এসক্রো লেজার বিবরণী', 'Escrow Ledger Entries')}</h3>
        <Card surface="bg" padding="none">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[740px] text-left text-xs">
              <thead className="bg-surface text-muted">
                <tr>
                  <th className="p-2.5 font-semibold">{t('তারিখ ও সময়', 'Date & Time')}</th>
                  <th className="p-2.5 font-semibold">{t('ধরন ও বাকেট', 'Type & Bucket')}</th>
                  <th className="p-2.5 font-semibold">{t('অর্ডার / রেফারেন্স', 'Order / Ref')}</th>
                  <th className="p-2.5 font-semibold">{t('বিবরণ, আনলক তারিখ ও প্রমাণ', 'Description, Maturity & Proof')}</th>
                  <th className="p-2.5 text-right font-semibold">{t('পরিমাণ', 'Amount')}</th>
                </tr>
              </thead>
              <tbody>
                {ledger.length === 0 && (
                  <tr>
                    <td colSpan={5} className="p-6 text-center text-muted">
                      {t('এখনো কোনো লেজার এন্ট্রি নেই।', 'No ledger entries yet.')}
                    </td>
                  </tr>
                )}
                {ledger.map((entry) => (
                  <tr key={entry.id} className="border-t border-border">
                    <td className="p-2.5 whitespace-nowrap font-mono text-[11px] tabular-nums">
                      {new Date(entry.createdAt).toLocaleString()}
                    </td>
                    <td className="p-2.5">
                      <span className="block font-mono text-[10px] text-ink">{entry.entryType}</span>
                      <span className="text-[11px] text-muted">{entry.escrowBucket}</span>
                    </td>
                    <td className="p-2.5 font-mono text-[11px]">
                      <span>{entry.orderNo ?? '—'}</span>
                      {entry.referenceNo && <span className="block text-muted">Ref: {entry.referenceNo}</span>}
                    </td>
                    <td className="p-2.5 space-y-0.5">
                      <span className="text-ink">{entry.descriptionBn}</span>
                      {entry.maturesAt && (
                        <span className="block text-[11px] text-warning tabular-nums">
                          {t('উত্তোলনযোগ্য হবে', 'Unlocks at')}: {new Date(entry.maturesAt).toLocaleString()}
                        </span>
                      )}
                      {entry.paymentMethodBn && (
                        <span className="block text-[11px] text-muted">{entry.paymentMethodBn}</span>
                      )}
                      {entry.noteBn && <span className="block text-[11px] text-muted">{entry.noteBn}</span>}
                      {entry.proofUrl && (
                        <a href={entry.proofUrl} target="_blank" rel="noreferrer" className="inline-block text-[11px] underline text-ink">
                          {t('প্রমাণ দেখুন', 'View proof')}
                        </a>
                      )}
                    </td>
                    <td className={cn('p-2.5 text-right font-semibold tabular-nums', entry.amountPoisha < 0 ? 'text-danger' : 'text-ink')}>
                      {money(entry.amountPoisha)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {/* Statement / CSV Export */}
      <Card surface="surface" padding="sm" className="space-y-3">
        <h3 className="text-sm font-bold">{t('লেজার স্টেটমেন্ট ডাউনলোড (UTC)', 'Download Ledger Statement (UTC)')}</h3>
        <p className="text-xs text-muted">{t('তারিখ UTC অনুযায়ী। CSV-তে অর্থ পয়সায় থাকে।', 'Dates use UTC; CSV values are in poisha.')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">
            {t('শুরুর তারিখ', 'From')}
            <input className={inputClass} type="date" disabled={statementLoading || exporting} value={from} onChange={(e) => { setFrom(e.target.value); setStatement(null); setStatementError(false); }} />
          </label>
          <label className="text-xs">
            {t('শেষ তারিখ', 'To')}
            <input className={inputClass} type="date" disabled={statementLoading || exporting} value={to} onChange={(e) => { setTo(e.target.value); setStatement(null); setStatementError(false); }} />
          </label>
          <Button type="button" variant="secondary" disabled={!from || !to || from > to || statementLoading} onClick={loadStatement} className="min-h-[44px]">
            {statementLoading ? t('লোড হচ্ছে…', 'Loading…') : t('স্টেটমেন্ট দেখুন', 'View statement')}
          </Button>
          <Button type="button" variant="outline" disabled={!from || !to || from > to || exporting} onClick={exportStatement} className="min-h-[44px]">
            {exporting ? t('ডাউনলোড হচ্ছে…', 'Downloading…') : t('CSV ডাউনলোড', 'Download CSV')}
          </Button>
        </div>
        {statementError && <p role="alert" className="text-xs text-danger">{t('স্টেটমেন্ট তৈরি করা যায়নি।', 'Statement unavailable.')}</p>}
        {statement && (
          <div className="space-y-3 pt-2">
            <h4 className="font-bold text-xs">{t('লেজার বাকেট স্টেটমেন্ট', 'Ledger bucket statement')} · {statement.from} — {statement.to} (UTC)</h4>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[550px] text-left text-xs">
                <thead>
                  <tr>
                    <th className="p-2">{t('বাকেট', 'Bucket')}</th>
                    <th className="p-2">{t('শুরু', 'Opening')}</th>
                    <th className="p-2">{t('যোগ', 'Credits')}</th>
                    <th className="p-2">{t('বিয়োগ', 'Debits')}</th>
                    <th className="p-2">{t('শেষ', 'Closing')}</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.buckets.map((row) => (
                    <tr key={row.bucket} className="border-t border-border">
                      <th className="p-2">{row.bucket === 'pending' ? t('অপেক্ষমাণ', 'Pending') : row.bucket === 'locked' ? t('লকড', 'Locked') : t('উপলব্ধ', 'Available')}</th>
                      <td className="p-2 tabular-nums">{money(row.openingPoisha)}</td>
                      <td className="p-2 tabular-nums">{money(row.creditsPoisha)}</td>
                      <td className="p-2 tabular-nums">{money(row.debitsPoisha)}</td>
                      <td className="p-2 tabular-nums">{money(row.closingPoisha)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
        {exportError && <p role="alert" className="text-xs text-danger">{t('ডাউনলোড করা যায়নি।', 'Download failed.')}</p>}
      </Card>
    </div>
  );
}

// ===========================================================================
// 5. PROFILE (READ-ONLY BY DEFAULT)
// ===========================================================================

export function ProfileTab({
  workspace,
  send,
  busy,
  t,
  num,
}: MutatingTabProps & { bn: boolean }) {
  const { profile, capabilities, rules, selfServiceRequests } = workspace;
  const holdDays = profile.escrowHoldDaysOverride ?? rules.globalEscrowHoldDays;

  const [businessNameBn, setBusinessNameBn] = useState('');
  const [ownerNameBn, setOwnerNameBn] = useState('');
  const [phone, setPhone] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('');
  const [payoutAccount, setPayoutAccount] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const capabilityRows = Object.keys(CAP_LABEL_KEYS) as Array<keyof typeof CAP_LABEL_KEYS>;

  const canRequestProfileEdit = capabilities.canEditProfile || capabilities.canEditPayoutProfile;

  return (
    <div className="space-y-5">
      <SectionHead
        title={t('ভেন্ডর প্রোফাইল ও চুক্তির তথ্য', 'Vendor Profile & Agreement Details')}
        desc={t(
          'আপনার ব্যবসার তথ্য, পেআউট অ্যাকাউন্ট ও কমিশন শর্তাবলি অ্যাডমিন প্যানেল থেকে নির্ধারিত ও সংরক্ষিত থাকে।',
          'Your business identity, payout account, and commercial terms are governed and maintained by Admin.'
        )}
        right={<Badge status="neutral">{t('শুধু দেখার জন্য', 'Read-only')}</Badge>}
      />

      {/* Identity & Commercial Terms Grid */}
      <Card surface="surface" padding="md" className="space-y-4">
        <div className="grid grid-cols-1 gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-[11px] text-muted">{t('ব্যবসার নাম (বাংলা)', 'Business Name (Bangla)')}</p>
            <p className="mt-0.5 font-bold text-ink">{profile.businessNameBn}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t('ব্যবসার নাম (ইংরেজি)', 'Business Name (English)')}</p>
            <p className="mt-0.5 font-bold text-ink">{profile.businessNameEn}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t('ভেন্ডর কোড', 'Vendor Code')}</p>
            <p className="mt-0.5 font-mono font-bold text-ink">{profile.vendorCode}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t('মালিকের নাম', 'Owner Name')}</p>
            <p className="mt-0.5 font-semibold text-ink">{profile.ownerNameBn}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t('যোগাযোগ নম্বর', 'Contact Phone')}</p>
            <p className="mt-0.5 font-mono font-semibold text-ink">{profile.contactPhone}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t('পেআউট অ্যাকাউন্ট', 'Payout Account')}</p>
            <p className="mt-0.5 font-semibold text-ink">
              {profile.payoutMethodBn} · <span className="font-mono">{profile.payoutAccountMasked}</span>
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t('কমিশন হার', 'Commission Rate')}</p>
            <p className="mt-0.5 font-semibold tabular-nums text-ink">
              {profile.defaultCommissionBp === null
                ? t(`গ্লোবাল (${rules.globalDefaultCommissionBp / 100}%)`, `Global (${rules.globalDefaultCommissionBp / 100}%)`)
                : `${profile.defaultCommissionBp / 100}%`}
            </p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t('এসক্রো হোল্ড পিরিয়ড', 'Escrow Hold Period')}</p>
            <p className="mt-0.5 font-semibold tabular-nums text-ink">{num(holdDays)} {t('দিন', 'days')}</p>
          </div>
          <div>
            <p className="text-[11px] text-muted">{t('যোগদানের তারিখ', 'Joined Date')}</p>
            <p className="mt-0.5 font-semibold tabular-nums text-ink">{new Date(profile.joinedAt).toLocaleDateString()}</p>
          </div>
        </div>
      </Card>

      {/* Admin Governance & Permissions */}
      <Card surface="bg" padding="sm" className="space-y-2.5">
        <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
          <ShieldCheck className="h-4 w-4 text-ink" aria-hidden="true" />
          {t('প্যানেল অনুমতি অবস্থা (অ্যাডমিন নিয়ন্ত্রিত)', 'Portal Capabilities (Admin Controlled)')}
        </h3>
        <ul className="grid gap-1.5 text-xs sm:grid-cols-2">
          {capabilityRows.map((key) => {
            const allowed = capabilities[key] === true;
            return (
              <li key={key} className="flex items-center gap-2">
                {allowed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden="true" />
                )}
                <span className={allowed ? 'text-ink font-medium' : 'text-muted'}>
                  {t(CAP_LABEL_KEYS[key][0], CAP_LABEL_KEYS[key][1])}
                  {!allowed ? ` — ${t('অ্যাডমিন পরিচালিত', 'Admin managed')}` : ''}
                </span>
              </li>
            );
          })}
          {capabilities.maxActiveProducts > 0 && (
            <li className="flex items-center gap-2 text-muted">
              <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t(`সর্বোচ্চ ${capabilities.maxActiveProducts}টি পণ্য`, `Max ${capabilities.maxActiveProducts} products`)}
            </li>
          )}
        </ul>
      </Card>

      {/* Optional Self-Service Edit Forms — Rendered ONLY if Admin explicitly grants permission */}
      {canRequestProfileEdit && (
        <Card surface="surface" padding="sm" className="space-y-2">
          <h3 className="text-sm font-bold">{t('প্রোফাইল পরিবর্তনের অনুরোধ', 'Request a profile change')}</h3>
          <form
            className="grid gap-2 sm:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const payload: Record<string, string> = {};
              if (businessNameBn.trim()) payload.businessNameBn = businessNameBn.trim();
              if (ownerNameBn.trim()) payload.ownerNameBn = ownerNameBn.trim();
              if (phone.trim()) payload.contactPhone = phone.trim();
              if (payoutMethod.trim()) payload.payoutMethodBn = payoutMethod.trim();
              if (payoutAccount.trim()) payload.payoutAccountNo = payoutAccount.trim();
              if (Object.keys(payload).length === 0) return;
              const ok = await send('/api/vendor/profile', payload, {
                bn: 'পরিবর্তনের অনুরোধ জমা হয়েছে; অ্যাডমিন অনুমোদন করলে কার্যকর হবে।',
                en: 'Change request submitted; it applies once the admin approves.',
              });
              if (ok) {
                setBusinessNameBn('');
                setOwnerNameBn('');
                setPhone('');
                setPayoutMethod('');
                setPayoutAccount('');
              }
            }}
          >
            {capabilities.canEditProfile && (
              <>
                <label className="space-y-1 text-xs font-medium">
                  <span>{t('ব্যবসার নাম (বাংলা)', 'Business name (Bangla)')}</span>
                  <input className={inputClass} value={businessNameBn} onChange={(e) => setBusinessNameBn(e.target.value)} placeholder={profile.businessNameBn} />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  <span>{t('মালিকের নাম', 'Owner name')}</span>
                  <input className={inputClass} value={ownerNameBn} onChange={(e) => setOwnerNameBn(e.target.value)} placeholder={profile.ownerNameBn} />
                </label>
                <label className="space-y-1 text-xs font-medium">
                  <span>{t('যোগাযোগ নম্বর', 'Contact number')}</span>
                  <input className={inputClass} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={profile.contactPhone} />
                </label>
              </>
            )}
            {capabilities.canEditPayoutProfile && (
              <>
                <label className="space-y-1 text-xs font-medium">
                  <span>{t('পেআউট পদ্ধতি', 'Payout method')}</span>
                  <input className={inputClass} value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)} placeholder={profile.payoutMethodBn} />
                </label>
                <label className="space-y-1 text-xs font-medium sm:col-span-2">
                  <span>{t('পেআউট অ্যাকাউন্ট নম্বর', 'Payout account number')}</span>
                  <input className={inputClass} value={payoutAccount} onChange={(e) => setPayoutAccount(e.target.value)} placeholder={profile.payoutAccountMasked} />
                </label>
              </>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" isLoading={busy}>
                {t('অনুরোধ পাঠান', 'Send request')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Read-Only Onboarding Answers Summary (plus form if Admin enables canSubmitOnboardingAnswers) */}
      <Card surface="surface" padding="sm" className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-ink">{t('অনবোর্ডিং তথ্য (১৫ প্রশ্ন)', 'Onboarding Information (15 Questions)')}</h3>
          <span className="text-xs text-muted tabular-nums">
            {num(profile.onboardingAnsweredCount)} / {num(profile.onboardingTotalQuestions)} {t('সম্পন্ন', 'completed')}
          </span>
        </div>

        {profile.onboardingAnswers && profile.onboardingAnswers.some((item) => item.answer) ? (
          <dl className="grid gap-2 text-xs sm:grid-cols-2">
            {profile.onboardingAnswers
              .filter((item) => item.answer)
              .map((item) => (
                <div key={item.key} className="rounded-[var(--radius-sm)] border border-border bg-bg p-2.5">
                  <dt className="text-[11px] font-medium text-muted">{item.questionBn}</dt>
                  <dd className="mt-0.5 font-semibold text-ink">{item.answer}</dd>
                </div>
              ))}
          </dl>
        ) : (
          <p className="text-xs text-muted">
            {t('অনবোর্ডিং তথ্য এখনো অ্যাডমিন কর্তৃক হালনাগাদ করা হয়নি।', 'Onboarding answers have not been recorded yet.')}
          </p>
        )}

        {capabilities.canSubmitOnboardingAnswers && (
          <form
            className="space-y-2 border-t border-border pt-3"
            onSubmit={async (event) => {
              event.preventDefault();
              const complete = rules.onboardingQuestions.every((question) => (answers[question.key] ?? '').trim().length >= 2);
              if (!complete) return;
              const ok = await send('/api/vendor/onboarding', { answers15: answers }, {
                bn: 'অনবোর্ডিং উত্তর জমা হয়েছে; অ্যাডমিন যাচাই করবে।',
                en: 'Onboarding answers submitted for admin verification.',
              });
              if (ok) setAnswers({});
            }}
          >
            {rules.onboardingQuestions.map((question, index) => (
              <label key={question.key} className="block space-y-1 text-xs font-medium">
                <span>
                  {num(index + 1)}. {question.questionBn}
                </span>
                <input
                  className={inputClass}
                  value={answers[question.key] ?? ''}
                  onChange={(e) => setAnswers((current) => ({ ...current, [question.key]: e.target.value }))}
                />
              </label>
            ))}
            <Button type="submit" variant="primary" isLoading={busy}>
              {t('উত্তর জমা দিন', 'Submit answers')}
            </Button>
          </form>
        )}
      </Card>

      {selfServiceRequests.length > 0 && (
        <Card surface="bg" padding="sm" className="space-y-2">
          <h3 className="text-sm font-bold">{t('পূর্বের অনুরোধ ইতিহাস', 'Request History')}</h3>
          <ul className="space-y-1.5 text-xs">
            {selfServiceRequests.map((request) => (
              <li key={request.requestId} className="flex flex-wrap items-center gap-2 border-b border-border pb-1.5 last:border-0">
                <StatusBadge status={request.status} t={t} />
                <span className="text-muted">
                  {request.kind === 'profile_update' ? t('প্রোফাইল পরিবর্তন', 'Profile change') : t('অনবোর্ডিং', 'Onboarding')}
                </span>
                <span className="text-[10px] text-muted">{new Date(request.requestedAt).toLocaleDateString()}</span>
                {request.reviewNoteBn && <span className="w-full text-[10px] text-muted">{request.reviewNoteBn}</span>}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

const CAP_LABEL_KEYS = {
  canCreateProduct: ['নতুন পণ্য তৈরি', 'Create products'],
  canEditProduct: ['পণ্য সম্পাদনা', 'Edit products'],
  canChangeProductStatus: ['পণ্য লাইভ/ড্রাফট', 'Publish products'],
  canSubmitConsignmentLot: ['চালান জমা', 'Submit challans'],
  canSubmitPriceProposal: ['মূল্য প্রস্তাব', 'Price proposals'],
  canRequestPayout: ['পেআউট অনুরোধ', 'Request payouts'],
  canEditProfile: ['প্রোফাইল সম্পাদনা', 'Edit profile'],
  canEditPayoutProfile: ['পেআউট অ্যাকাউন্ট', 'Payout account'],
  canSubmitOnboardingAnswers: ['অনবোর্ডিং উত্তর', 'Onboarding answers'],
} as const;
