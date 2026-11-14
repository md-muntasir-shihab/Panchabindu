'use client';

// src/components/vendor/vendor-tabs.tsx
// The eight vendor-panel tabs. Every money value shown here is one the vendor
// is entitled to see: their own cost, their own payable, their own escrow.

import { useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRightLeft,
  BadgeCheck,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Coins,
  Info,
  Package,
  PackagePlus,
  Percent,
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
  VendorCapabilityFlags,
  VendorProductDTO,
  VendorWorkspaceDTO,
} from '@/lib/vendor/vendor-types';

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
function parseTaka(value: string): number | null {
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
  pending_qc: 'কিউসি অপেক্ষমাণ', approved_stocked: 'অনুমোদিত ও স্টকড', rejected: 'প্রত্যাখ্যাত',
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
    <div className="rounded-[var(--radius-md)] border border-border bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-muted">{label}</p>
        {icon ? <span className="text-muted">{icon}</span> : null}
      </div>
      <p className={cn('mt-1 text-lg font-bold tabular-nums', toneClass)}>{value}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-muted">{hint}</p> : null}
    </div>
  );
}

function LockedNotice({ label, t }: { label: string; t: Translate }) {
  return (
    <div role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-warning bg-bg p-3 text-xs">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
      <p className="text-ink">
        {t(
          `এই সুবিধাটি অ্যাডমিন বন্ধ রেখেছেন: ${label}। প্রয়োজনে অ্যাডমিনের সাথে যোগাযোগ করুন।`,
          `The admin has disabled this capability: ${label}. Contact the platform admin if you need it.`
        )}
      </p>
    </div>
  );
}

function SectionHead({ title, desc, right }: { title: string; desc?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h2 className="text-base font-bold text-ink">{title}</h2>
        {desc ? <p className="mt-0.5 text-xs text-muted">{desc}</p> : null}
      </div>
      {right}
    </div>
  );
}

// ===========================================================================
// 1. DASHBOARD
// ===========================================================================

export function DashboardTab({
  workspace,
  onNavigate,
  t,
  num,
  money,
}: TabProps & { onNavigate: (tab: 'products' | 'stock' | 'orders' | 'payouts' | 'proposals') => void }) {
  const { escrow, counters, scorecard, lots, profile } = workspace;

  const onboardingPct = Math.round(
    (profile.onboardingAnsweredCount / Math.max(1, profile.onboardingTotalQuestions)) * 100
  );

  return (
    <div className="space-y-5">
      <SectionHead
        title={t('আজকের সারসংক্ষেপ', 'Today at a glance')}
        desc={t('আপনার নিজস্ব কনসাইনমেন্ট ব্যবসার লাইভ অবস্থা', 'Live state of your own consignment business')}
      />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi
          label={t('উত্তোলনযোগ্য', 'Withdrawable')}
          value={money(escrow.withdrawablePoisha)}
          hint={t('Available এসক্রো ব্যালেন্স', 'Available escrow balance')}
          tone={escrow.withdrawablePoisha > 0 ? 'positive' : 'neutral'}
          icon={<Wallet className="h-4 w-4" aria-hidden="true" />}
        />
        <Kpi
          label={t('হোল্ডে আছে', 'On hold')}
          value={money(escrow.lockedPoisha)}
          hint={t('ডেলিভারির পর হোল্ড পিরিয়ড', 'Post-delivery hold period')}
          tone={escrow.lockedPoisha > 0 ? 'warning' : 'neutral'}
          icon={<Coins className="h-4 w-4" aria-hidden="true" />}
        />
        <Kpi
          label={t('সক্রিয় পণ্য', 'Live products')}
          value={num(counters.activeProducts)}
          hint={`${num(counters.draftProducts)} ${t('ড্রাফট আছে', 'in draft')}`}
          icon={<Package className="h-4 w-4" aria-hidden="true" />}
        />
        <Kpi
          label={t('চলতি অর্ডার', 'Open orders')}
          value={num(counters.openOrders)}
          hint={t('প্যাকিং/ডেলিভারি প্রক্রিয়ায়', 'In packing or delivery')}
          tone={counters.openOrders > 0 ? 'warning' : 'neutral'}
          icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
        />
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <Card surface="surface" padding="sm" className="space-y-3">
          <h3 className="text-sm font-bold">{t('আপনার পদক্ষেপ দরকার', 'Needs your action')}</h3>
          <ul className="space-y-2 text-xs">
            <ActionRow
              count={counters.pendingLots}
              label={t('কিউসি অনুমোদনের অপেক্ষায় চালান', 'Challans awaiting QC approval')}
              onClick={() => onNavigate('stock')}
              t={t}
            />
            <ActionRow
              count={counters.pendingProposals}
              label={t('মূল্য প্রস্তাব যাচাইয়ের অপেক্ষায়', 'Price proposals awaiting review')}
              onClick={() => onNavigate('proposals')}
              t={t}
            />
            <ActionRow
              count={counters.lowStockVariants}
              label={t('কম স্টকের ভ্যারিয়েন্ট', 'Variants running low on stock')}
              onClick={() => onNavigate('products')}
              t={t}
            />
            <ActionRow
              count={counters.draftProducts}
              label={t('ড্রাফট পণ্য এখনো লাইভ হয়নি', 'Draft products not published yet')}
              onClick={() => onNavigate('products')}
              t={t}
            />
            <ActionRow
              count={counters.pendingPayouts}
              label={t('পেআউট অনুরোধ প্রক্রিয়াধীন', 'Payout requests in progress')}
              onClick={() => onNavigate('payouts')}
              t={t}
            />
          </ul>
        </Card>

        <Card surface="surface" padding="sm" className="space-y-3">
          <h3 className="flex items-center gap-1.5 text-sm font-bold">
            <BadgeCheck className="h-4 w-4" aria-hidden="true" />
            {t('পারফরম্যান্স স্কোরকার্ড', 'Performance scorecard')}
          </h3>
          {scorecard ? (
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-muted">{t('SLA গ্রেড', 'SLA grade')}</span>
                <Badge status={scorecard.slaGrade === 'A+' || scorecard.slaGrade === 'A' ? 'success' : scorecard.slaGrade === 'B' ? 'warning' : 'danger'}>
                  {scorecard.slaGrade}
                </Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">{t('গড় রেটিং', 'Average rating')}</span>
                <span className="flex items-center gap-1 font-semibold tabular-nums">
                  <Star className="h-3.5 w-3.5" aria-hidden="true" />
                  {(scorecard.averageRatingBp / 100).toFixed(1)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">{t('মোট বিক্রিত ইউনিট', 'Units sold')}</span>
                <span className="font-semibold tabular-nums">{num(scorecard.totalUnitsSold)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted">{t('রিটার্ন হার', 'Return rate')}</span>
                <span className={cn('font-semibold tabular-nums', scorecard.returnRateBp > 500 ? 'text-danger' : 'text-ink')}>
                  {(scorecard.returnRateBp / 100).toFixed(2)}%
                </span>
              </div>
              <div className="flex items-center justify-between border-t border-border pt-2">
                <span className="text-muted">{t('নিট প্রদেয়', 'Net payable to you')}</span>
                <span className="font-semibold tabular-nums">{money(scorecard.netVendorPayablePoisha)}</span>
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted">{t('এখনো কোনো স্কোরকার্ড তৈরি হয়নি।', 'No scorecard yet.')}</p>
          )}
        </Card>
      </div>

      <Card surface="surface" padding="sm" className="space-y-2">
        <h3 className="flex items-center gap-1.5 text-sm font-bold">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          {t('অনবোর্ডিং প্রোফাইল', 'Onboarding profile')}
        </h3>
        <div className="h-2 w-full rounded-full border border-border bg-bg">
          <div className="h-full rounded-full bg-ink" style={{ width: `${onboardingPct}%` }} aria-hidden="true" />
        </div>
        <p className="text-xs text-muted">
          {t(
            `${profile.onboardingAnsweredCount} / ${profile.onboardingTotalQuestions} প্রশ্নের উত্তর সম্পন্ন`,
            `${profile.onboardingAnsweredCount} of ${profile.onboardingTotalQuestions} questions answered`
          )}
        </p>
      </Card>

      {lots.length > 0 && (
        <Card surface="bg" padding="sm" className="space-y-2">
          <h3 className="text-sm font-bold">{t('সাম্প্রতিক চালান', 'Recent challans')}</h3>
          <ul className="space-y-1.5 text-xs">
            {lots.slice(0, 3).map((lot) => (
              <li key={lot.lotId} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-1.5 last:border-0">
                <span className="font-mono text-muted">{lot.lotCode}</span>
                <span className="min-w-0 flex-1 truncate">{lot.productNameBn}</span>
                <span className="tabular-nums">{num(lot.dispatchedQty)}</span>
                <StatusBadge status={lot.status} t={t} />
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function ActionRow({
  count,
  label,
  onClick,
  t,
}: {
  count: number;
  label: string;
  onClick: () => void;
  t: Translate;
}) {
  if (count <= 0) {
    return (
      <li className="flex items-center gap-2 text-muted">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-success" aria-hidden="true" />
        <span>{label}</span>
        <span className="ml-auto text-[10px] uppercase">{t('ঠিক আছে', 'clear')}</span>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className="flex min-h-[36px] w-full items-center gap-2 rounded-[var(--radius-sm)] border border-border px-2 text-left hover:bg-bg"
      >
        <span className="inline-flex min-w-[22px] justify-center rounded-full border border-warning px-1 text-[10px] font-bold text-warning">
          {count}
        </span>
        <span className="flex-1">{label}</span>
        <span aria-hidden="true" className="text-muted">›</span>
      </button>
    </li>
  );
}

// ===========================================================================
// 2. PRODUCTS
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
  const { products, capabilities, categories } = workspace;
  const [editing, setEditing] = useState<VendorProductDTO | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <div className="space-y-4">
      <SectionHead
        title={t('পণ্য ও ভ্যারিয়েন্ট', 'Products & variants')}
        desc={t(
          'নতুন পণ্য ড্রাফট হিসেবে যোগ হবে। লাইভ করতে স্টক ও ছবি থাকা বাধ্যতামূলক।',
          'New products start as drafts. Publishing requires stock and at least one image.'
        )}
        right={
          <Button
            variant="primary"
            size="sm"
            leftIcon={<PackagePlus className="h-4 w-4" aria-hidden="true" />}
            onClick={() => {
              setCreating(true);
              setEditing(null);
            }}
            disabled={!capabilities.canCreateProduct}
          >
            {t('নতুন পণ্য', 'New product')}
          </Button>
        }
      />

      {!capabilities.canCreateProduct && <LockedNotice label={t('নতুন পণ্য তৈরি', 'create new products')} t={t} />}
      {capabilities.maxActiveProducts > 0 && (
        <p className="text-xs text-muted">
          {t(
            `অ্যাডমিন সর্বোচ্চ ${capabilities.maxActiveProducts}টি পণ্যের অনুমতি দিয়েছেন।`,
            `The admin allows a maximum of ${capabilities.maxActiveProducts} products.`
          )}
        </p>
      )}

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
            'প্রথম পণ্য যোগ করে কনসাইনমেন্ট শুরু করুন। মূল্য যাচাই প্ল্যাটফর্ম করবে।',
            'Add your first product to start consignment. The platform verifies every price.'
          )}
        />
      ) : (
        <div className="space-y-2">
          {products.map((product) => (
            <Card key={product.productId} surface="surface" padding="sm" className="space-y-2">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold">{bn ? product.nameBn : product.nameEn}</p>
                    <StatusBadge status={product.status} t={t} />
                    {product.lowStockThreshold > 0 &&
                      product.variants.some((variant) => variant.lowStock) && (
                        <Badge status="warning">{t('কম স্টক', 'Low stock')}</Badge>
                      )}
                  </div>
                  <p className="mt-0.5 text-[11px] text-muted">
                    {bn ? product.categoryNameBn : product.categoryNameEn} ·{' '}
                    {t('বিক্রিত', 'Sold')}: {num(product.totalSoldCount)} ·{' '}
                    {t('রেটিং', 'Rating')}: {(product.ratingAvgBp / 100).toFixed(1)}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing(product);
                      setCreating(false);
                    }}
                    disabled={!capabilities.canEditProduct}
                  >
                    {t('সম্পাদনা', 'Edit')}
                  </Button>
                  {product.status !== 'active' ? (
                    <Button
                      variant="secondary"
                      size="sm"
                      isLoading={busy}
                      disabled={!capabilities.canChangeProductStatus}
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
                      disabled={!capabilities.canChangeProductStatus}
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
                  )}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[520px] text-left text-[11px]">
                  <thead className="text-muted">
                    <tr className="border-b border-border">
                      <th className="py-1 pr-2 font-semibold">{t('ভ্যারিয়েন্ট', 'Variant')}</th>
                      <th className="py-1 pr-2 font-semibold">SKU</th>
                      <th className="py-1 pr-2 text-right font-semibold">{t('ক্রয়মূল্য', 'Cost')}</th>
                      <th className="py-1 pr-2 text-right font-semibold">{t('বিক্রয়মূল্য', 'Retail')}</th>
                      <th className="py-1 pr-2 text-right font-semibold">{t('স্টক', 'Stock')}</th>
                      <th className="py-1 text-right font-semibold">{t('রিজার্ভ', 'Reserved')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {product.variants.map((variant) => (
                      <tr key={variant.variantId} className="border-b border-border last:border-0">
                        <td className="py-1 pr-2">{bn ? variant.titleBn : variant.titleEn}</td>
                        <td className="py-1 pr-2 font-mono">{variant.publicSku}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{money(variant.supplierCostPoisha)}</td>
                        <td className="py-1 pr-2 text-right tabular-nums">{money(variant.salePricePoisha)}</td>
                        <td className={cn('py-1 pr-2 text-right tabular-nums', variant.lowStock && 'font-bold text-warning')}>
                          {num(variant.stockAvailable)}
                        </td>
                        <td className="py-1 text-right tabular-nums">{num(variant.stockReserved)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="text-[10px] text-muted">
                {t(
                  'ক্রয়মূল্য বা বিক্রয়মূল্য সরাসরি বদলানো যাবে না — "মূল্য প্রস্তাব" ট্যাব ব্যবহার করুন। পণ্য ডিলিট শুধু অ্যাডমিন করতে পারেন।',
                  'Cost and retail price cannot be edited here — use the Price Proposals tab. Only the admin can delete a product.'
                )}
              </p>
            </Card>
          ))}
        </div>
      )}
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
          <span className="text-[10px] font-normal text-muted">
            {t('লাইভ করার আগে কমপক্ষে একটি ছবি দরকার।', 'At least one image is required before publishing.')}
          </span>
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
              <input
                className={inputClass}
                placeholder="SKU"
                value={variant.publicSku}
                onChange={(e) => updateVariant(index, { publicSku: e.target.value })}
                required
              />
              <input
                className={inputClass}
                placeholder={t('নাম (বাংলা)', 'Title (Bangla)')}
                value={variant.titleBn}
                onChange={(e) => updateVariant(index, { titleBn: e.target.value })}
                required
              />
              <input
                className={inputClass}
                placeholder={t('নাম (ইংরেজি)', 'Title (English)')}
                value={variant.titleEn}
                onChange={(e) => updateVariant(index, { titleEn: e.target.value })}
              />
              <input
                className={inputClass}
                placeholder={t('ক্রয়মূল্য ৳', 'Cost ৳')}
                inputMode="decimal"
                value={variant.supplierCostPoisha}
                onChange={(e) => updateVariant(index, { supplierCostPoisha: e.target.value })}
                required
                disabled={Boolean(product)}
              />
              <input
                className={inputClass}
                placeholder={t('বিক্রয়মূল্য ৳', 'Retail ৳')}
                inputMode="decimal"
                value={variant.salePricePoisha}
                onChange={(e) => updateVariant(index, { salePricePoisha: e.target.value })}
                required
                disabled={Boolean(product)}
              />
              <div className="flex items-center gap-1">
                <input
                  className={inputClass}
                  placeholder={t('গ্রাম', 'grams')}
                  inputMode="numeric"
                  value={variant.weightGrams}
                  onChange={(e) => updateVariant(index, { weightGrams: e.target.value.replace(/\D/g, '') })}
                />
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
          {product && (
            <p className="text-[10px] text-muted">
              {t(
                'মূল্য পরিবর্তন করতে "মূল্য প্রস্তাব" ট্যাব ব্যবহার করুন।',
                'To change prices, use the Price Proposals tab.'
              )}
            </p>
          )}
        </div>

        {formError && (
          <p role="alert" className="text-xs font-medium text-danger">
            {formError}
          </p>
        )}

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
// 3. STOCK / CONSIGNMENT LOTS
// ===========================================================================

export function StockTab({ workspace, send, busy, t, num, money }: MutatingTabProps) {
  const { products, lots, capabilities } = workspace;
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
  const [variantId, setVariantId] = useState(variantOptions[0]?.value ?? '');
  const [qty, setQty] = useState('1');
  const [challanRef, setChallanRef] = useState('');
  const [noteBn, setNoteBn] = useState('');

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const parsedQty = Number(qty);
    if (!variantId || !Number.isInteger(parsedQty) || parsedQty < 1 || !challanRef.trim()) return;
    const ok = await send(
      '/api/vendor/stock',
      { action: 'dispatch_lot', variantId, dispatchedQty: parsedQty, challanRef, noteBn },
      {
        bn: 'চালান জমা হয়েছে। ওয়্যারহাউস কিউসি অনুমোদনের পর স্টক যোগ হবে।',
        en: 'Challan submitted. Stock is added after warehouse QC approval.',
      }
    );
    if (ok) {
      setChallanRef('');
      setNoteBn('');
      setQty('1');
    }
  }

  return (
    <div className="space-y-4">
      <SectionHead
        title={t('কনসাইনমেন্ট চালান', 'Consignment challans')}
        desc={t(
          'গুদামে পণ্য পাঠানোর তথ্য দিন। কিউসি পাস হলে স্টক স্বয়ংক্রিয়ভাবে যোগ হবে।',
          'Declare stock you are dispatching to the warehouse. Approved QC quantities become sellable stock.'
        )}
      />

      {!capabilities.canSubmitConsignmentLot ? (
        <LockedNotice label={t('কনসাইনমেন্ট চালান জমা', 'submit consignment challans')} t={t} />
      ) : (
        <Card surface="surface" padding="sm" className="space-y-2">
          <form onSubmit={submit} className="grid gap-2 sm:grid-cols-4">
            <label className="space-y-1 text-xs font-medium sm:col-span-2">
              <span>{t('ভ্যারিয়েন্ট', 'Variant')}</span>
              <select className={inputClass} value={variantId} onChange={(e) => setVariantId(e.target.value)} required>
                {variantOptions.length === 0 && <option value="">{t('আগে পণ্য যোগ করুন', 'Add a product first')}</option>}
                {variantOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('পরিমাণ (পিস)', 'Quantity')}</span>
              <input
                className={inputClass}
                inputMode="numeric"
                value={qty}
                onChange={(e) => setQty(e.target.value.replace(/\D/g, ''))}
                required
              />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('চালান নম্বর', 'Challan ref')}</span>
              <input className={inputClass} value={challanRef} onChange={(e) => setChallanRef(e.target.value)} required />
            </label>
            <label className="space-y-1 text-xs font-medium sm:col-span-4">
              <span>{t('নোট (ঐচ্ছিক)', 'Note (optional)')}</span>
              <textarea className={textareaClass} value={noteBn} onChange={(e) => setNoteBn(e.target.value)} />
            </label>
            <div className="sm:col-span-4">
              <Button
                type="submit"
                variant="primary"
                isLoading={busy}
                disabled={variantOptions.length === 0}
                leftIcon={<Truck className="h-4 w-4" aria-hidden="true" />}
              >
                {t('চালান জমা দিন', 'Submit challan')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {lots.length === 0 ? (
        <EmptyState
          icon={<Boxes className="h-6 w-6" aria-hidden="true" />}
          title={t('কোনো চালান নেই', 'No challans yet')}
          description={t('প্রথম চালান জমা দিলে এখানে কিউসি অবস্থা দেখা যাবে।', 'Submitted challans and their QC result appear here.')}
        />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="text-muted">
              <tr className="border-b border-border">
                <th className="py-1.5 pr-2 font-semibold">{t('লট', 'Lot')}</th>
                <th className="py-1.5 pr-2 font-semibold">{t('পণ্য', 'Product')}</th>
                <th className="py-1.5 pr-2 text-right font-semibold">{t('পাঠানো', 'Sent')}</th>
                <th className="py-1.5 pr-2 text-right font-semibold">{t('গৃহীত', 'Accepted')}</th>
                <th className="py-1.5 pr-2 text-right font-semibold">{t('রিজেক্ট', 'Rejected')}</th>
                <th className="py-1.5 pr-2 font-semibold">{t('ইউনিট ক্রয়মূল্য', 'Unit cost')}</th>
                <th className="py-1.5 font-semibold">{t('অবস্থা', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((lot) => (
                <tr key={lot.lotId} className="border-b border-border last:border-0">
                  <td className="py-1.5 pr-2 font-mono">{lot.lotCode}</td>
                  <td className="py-1.5 pr-2">
                    <p className="truncate font-medium">{lot.productNameBn}</p>
                    <p className="text-[10px] text-muted">{lot.publicSku} · {lot.challanRef}</p>
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{num(lot.dispatchedQty)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{lot.qcAcceptedQty === null ? '—' : num(lot.qcAcceptedQty)}</td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">{lot.qcRejectedQty === null ? '—' : num(lot.qcRejectedQty)}</td>
                  <td className="py-1.5 pr-2 tabular-nums">{money(lot.unitSupplierCostPoisha)}</td>
                  <td className="py-1.5"><StatusBadge status={lot.status} t={t} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// 4. ORDERS
// ===========================================================================

export function OrdersTab({ workspace, t, num, money }: TabProps) {
  const { orders, counters } = workspace;
  const [filter, setFilter] = useState<'all' | 'open' | 'done'>('all');

  const visible = orders.filter((order) => {
    if (filter === 'all') return true;
    const open = ['pending_confirmation', 'confirmed', 'packed', 'shipped', 'out_for_delivery'].includes(order.status);
    return filter === 'open' ? open : !open;
  });

  return (
    <div className="space-y-4">
      <SectionHead
        title={t('আপনার অর্ডার', 'Your orders')}
        desc={t(
          `মোট ${counters.openOrders}টি চলতি অর্ডার। গ্রাহকের ফোন ও ঠিকানা প্ল্যাটফর্ম সুরক্ষিত রাখে।`,
          `${counters.openOrders} open orders. Customer phone and address stay protected by the platform.`
        )}
        right={
          <div className="flex gap-1">
            {(['all', 'open', 'done'] as const).map((key) => (
              <Button
                key={key}
                size="sm"
                variant={filter === key ? 'primary' : 'outline'}
                onClick={() => setFilter(key)}
              >
                {key === 'all' ? t('সব', 'All') : key === 'open' ? t('চলতি', 'Open') : t('সম্পন্ন', 'Completed')}
              </Button>
            ))}
          </div>
        }
      />

      {visible.length === 0 ? (
        <EmptyState
          icon={<ClipboardList className="h-6 w-6" aria-hidden="true" />}
          title={t('কোনো অর্ডার নেই', 'No orders')}
          description={t('আপনার পণ্য বিক্রি হলে অর্ডার এখানে দেখা যাবে।', 'Orders appear here when your products sell.')}
        />
      ) : (
        <div className="space-y-2">
          {visible.map((order) => (
            <Card key={order.orderNo} surface="surface" padding="sm" className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs font-bold">{order.orderNo}</span>
                <StatusBadge status={order.status} t={t} />
                <span className="text-[11px] text-muted">
                  {order.districtNameBn} · {order.upazilaNameBn} · {new Date(order.createdAt).toLocaleDateString()}
                </span>
                <span className="ml-auto text-xs font-bold tabular-nums">{money(order.supplierPayablePoisha)}</span>
              </div>
              <ul className="space-y-0.5 text-[11px]">
                {order.lines.map((line, index) => (
                  <li key={index} className="flex justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {line.productNameBn} · {line.variantTitleBn}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      ×{num(line.quantity)} = {money(line.supplierPayablePoisha)}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

export function ReturnsTab({ workspace, t, num, money }: TabProps) {
  const faultLabels: Record<string, [string, string]> = {
    WAREHOUSE_PACKAGING_FAULT: ['প্যাকেজিং সংক্রান্ত', 'Packaging issue'],
    SUPPLIER_DEFECT: ['সরবরাহকারী ত্রুটি', 'Supplier defect'],
    COURIER_NEGLIGENCE: ['কুরিয়ার সংক্রান্ত', 'Courier issue'],
    CUSTOMER_INTACT_RETURN: ['গ্রাহকের সিদ্ধান্ত', 'Customer decision'],
  };
  return <div className="space-y-4">
    <SectionHead title={t('রিটার্ন নিষ্পত্তি', 'Return resolutions')} desc={t('শুধু আপনার পণ্যের নিষ্পত্তিকৃত রিটার্ন এখানে দেখা যায়। নতুন দাবি বা বিরোধ অনলাইনে জমা এখনো চালু নয়।', 'Only resolved returns for your products are shown. Online claims or disputes are not yet available.')} />
    {workspace.returns.length === 0 ? <EmptyState icon={<ArrowRightLeft className="h-6 w-6" />} title={t('কোনো নিষ্পত্তিকৃত রিটার্ন নেই', 'No resolved returns')} description={t('রিটার্ন নিষ্পত্তি হলে এখানে দেখা যাবে।', 'Resolved returns will appear here.')} /> : workspace.returns.map(item => <Card key={item.returnId} surface="surface" padding="sm" className="space-y-1 text-xs">
      <p className="font-bold">{t('অর্ডার', 'Order')}: {item.orderNo} · {new Date(item.createdAt).toLocaleDateString()}</p>
      <p>{t('ধরন', 'Type')}: {faultLabels[item.faultType] ? t(...faultLabels[item.faultType]) : t('অন্যান্য', 'Other')}</p>
      <p>{t('পরিমাণ', 'Quantity')}: {num(item.quantity)} · {t('পুনরায় স্টকে', 'Restocked')}: {num(item.restockQuantity)}</p>
      <p>{t('আপনার সমন্বয়', 'Your adjustment')}: {money(item.vendorDebitPoisha)}</p>
    </Card>)}
  </div>;
}

// ===========================================================================
// 5. EARNINGS & ESCROW
// ===========================================================================

type LedgerStatement = {
  from: string; to: string; generatedAt: string; ledgerEntryCount: number;
  buckets: Array<{ bucket: 'pending' | 'locked' | 'available'; openingPoisha: number; creditsPoisha: number; debitsPoisha: number; closingPoisha: number }>;
  payouts: Array<{ payoutId: string; amountPoisha: number; method: string; accountMasked: string; transactionId: string | null; requestedAt: string; recordedPaidAt: string }>;
};

export function EarningsTab({ workspace, t, num, money }: TabProps) {
  const { escrow, ledger, scorecard, profile } = workspace;
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
    <div className="space-y-4">
      <SectionHead
        title={t('আয় ও এসক্রো লেজার', 'Earnings & escrow ledger')}
        desc={t(
          'ডেলিভারির পর হোল্ড পিরিয়ড শেষ হলে টাকা Pending → Locked → Available বাকেটে যায়।',
          'After delivery, funds move Pending → Locked → Available once the hold period ends.'
        )}
      />

      <Card surface="surface" padding="sm" className="space-y-3">
        <h3 className="font-bold">{t('লেজার স্টেটমেন্ট ডাউনলোড', 'Download ledger statement')}</h3>
        <p className="text-xs text-muted">{t('তারিখ UTC অনুযায়ী। CSV-তে অর্থ পয়সায়; বাকেটের স্থানান্তরসহ পৃথক এন্ট্রি থাকে, এগুলোর যোগফল আয় নয়।', 'Dates use UTC. Amounts are in poisha; entries include bucket transfers, so their sum is not earnings.')}</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs">{t('শুরুর তারিখ', 'From')}<input className={inputClass} type="date" disabled={statementLoading || exporting} value={from} onChange={e => { setFrom(e.target.value); setStatement(null); setStatementError(false); }} /></label>
          <label className="text-xs">{t('শেষ তারিখ', 'To')}<input className={inputClass} type="date" disabled={statementLoading || exporting} value={to} onChange={e => { setTo(e.target.value); setStatement(null); setStatementError(false); }} /></label>
          <Button type="button" variant="secondary" disabled={!from || !to || from > to || statementLoading} onClick={loadStatement}>{statementLoading ? t('লোড হচ্ছে…', 'Loading…') : t('স্টেটমেন্ট দেখুন', 'View statement')}</Button>
          <Button type="button" variant="outline" disabled={!from || !to || from > to || exporting} onClick={exportStatement}>{exporting ? t('ডাউনলোড হচ্ছে…', 'Downloading…') : t('CSV ডাউনলোড', 'Download CSV')}</Button>
        </div>
        {statementError && <p role="alert" className="text-xs text-danger">{t('স্টেটমেন্ট তৈরি হয়নি। তথ্যের অসংগতি, সেশন বা এন্ট্রির সীমা পরীক্ষা করতে সহায়তায় যোগাযোগ করুন।', 'Statement unavailable. Contact support about the session, entry limit or inconsistent records.')}</p>}
        {statement && <div className="space-y-3">
          <h4 className="font-bold">{t('লেজার বাকেট স্টেটমেন্ট', 'Ledger bucket statement')} · {statement.from} — {statement.to} (UTC)</h4>
          <p className="text-xs text-muted">{t('সংরক্ষিত লেজার থেকে হিসাব; ব্যাংক বা পেমেন্ট সেবার সাথে মিলিয়ে দেখা নয়। শুরুর পূর্ববর্তী সব এন্ট্রির যোগফল শুরুর ব্যালেন্স। ঋণাত্মক ব্যালেন্স লুকানো হয় না।', 'Calculated from recorded ledger entries, not reconciled with a bank or payment provider. Opening is the sum of all earlier entries. Negative balances are not hidden.')}</p>
          <div className="overflow-x-auto"><table className="w-full min-w-[550px] text-left text-xs"><thead><tr><th className="p-2">{t('বাকেট', 'Bucket')}</th><th className="p-2">{t('শুরু', 'Opening')}</th><th className="p-2">{t('যোগ', 'Credits')}</th><th className="p-2">{t('বিয়োগ', 'Debits')}</th><th className="p-2">{t('শেষ', 'Closing')}</th></tr></thead><tbody>{statement.buckets.map(row => <tr key={row.bucket} className="border-t border-border"><th className="p-2">{row.bucket === 'pending' ? t('অপেক্ষমাণ', 'Pending') : row.bucket === 'locked' ? t('লকড', 'Locked') : t('উপলব্ধ', 'Available')}</th><td className="p-2">{money(row.openingPoisha)}</td><td className="p-2">{money(row.creditsPoisha)}</td><td className="p-2">{money(row.debitsPoisha)}</td><td className="p-2">{money(row.closingPoisha)}</td></tr>)}</tbody></table></div>
          <p className="text-xs">{t('এন্ট্রি', 'Entries')}: {num(statement.ledgerEntryCount)} · {t('তৈরির সময়', 'Generated')}: {new Date(statement.generatedAt).toLocaleString()}</p>
          <h4 className="font-bold">{t('এই সময়ে অ্যাডমিন কর্তৃক পরিশোধিত হিসেবে নথিভুক্ত পেআউট', 'Payouts recorded as paid by admin during this period')}</h4>
          <p className="text-xs text-muted">{t('নিচের তথ্য প্রশাসনিক রেকর্ড; এটি টাকা স্থানান্তরের স্বাধীন প্রমাণ নয়। অঙ্ক অনুরোধকৃত পরিমাণ, প্রাপ্ত নিট অর্থ বা ফি নয়।', 'These are administrative records, not independent proof of transfer. Amounts are requested, not net received or fees.')}</p>
          {statement.payouts.length === 0 ? <p className="text-xs">{t('এই সময়ে কোনো পরিশোধ রেকর্ড নেই।', 'No paid records in this period.')}</p> : <ul className="space-y-2">{statement.payouts.map(payout => <li key={payout.payoutId} className="rounded border border-border p-2 text-xs break-words"><p><strong>{payout.payoutId}</strong> · {money(payout.amountPoisha)}</p><p>{payout.method} · {payout.accountMasked}</p><p>{t('নথিভুক্ত পরিশোধ', 'Recorded paid')}: {new Date(payout.recordedPaidAt).toLocaleString()} · {t('লেনদেন রেফারেন্স', 'Transaction reference')}: {payout.transactionId || '—'}</p></li>)}</ul>}
        </div>}
        {exportError && <p role="alert" className="text-xs text-danger">{t('ডাউনলোড করা যায়নি। সেশন পরীক্ষা করুন অথবা ছোট তারিখসীমা বেছে নিন (সর্বোচ্চ ৫,০০০ এন্ট্রি)।', 'Download failed. Check your session or choose a shorter range (maximum 5,000 entries).')}</p>}
        <p className="text-xs text-muted">{t('নিচের তালিকায় সর্বোচ্চ ২০০টি এন্ট্রি; CSV নির্বাচিত সময়ের সব এন্ট্রি দেখায়।', 'The list below shows up to 200 entries; CSV includes all entries in the selected period.')}</p>
      </Card>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Kpi label={t('Pending', 'Pending')} value={money(escrow.pendingPoisha)} hint={t('ডেলিভারির অপেক্ষায়', 'Awaiting delivery')} />
        <Kpi label={t('Locked (হোল্ড)', 'Locked (hold)')} value={money(escrow.lockedPoisha)} hint={`${profile.escrowHoldDaysOverride ?? workspace.rules.globalEscrowHoldDays} ${t('দিনের হোল্ড', 'day hold')}`} tone="warning" />
        <Kpi label={t('Available', 'Available')} value={money(escrow.availablePoisha)} hint={t('উত্তোলনযোগ্য ব্যালেন্স', 'Withdrawable balance')} tone="positive" />
        <Kpi label={t('পেআউট হোল্ডে', 'Payout on hold')} value={money(escrow.payoutHoldPoisha)} hint={t('অনুরোধ প্রক্রিয়াধীন', 'Request in progress')} />
      </div>

      {escrow.clawbackDebtPoisha > 0 && (
        <div role="status" className="flex items-start gap-2 rounded-[var(--radius-md)] border border-danger bg-bg p-3 text-xs">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" aria-hidden="true" />
          <p>
            {t(
              `পেআউটের পর রিটার্নের কারণে ${money(escrow.clawbackDebtPoisha)} সমন্বয় (clawback) বাকি আছে; পরবর্তী আয় থেকে কেটে নেওয়া হবে।`,
              `A post-payout clawback of ${money(escrow.clawbackDebtPoisha)} is outstanding and will be deducted from future earnings.`
            )}
          </p>
        </div>
      )}

      {scorecard && (
        <Card surface="surface" padding="sm" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Kpi label={t('মোট বিক্রয় (গ্রস)', 'Gross sales')} value={money(scorecard.grossSalesPoisha)} />
          <Kpi label={t('নিট প্রদেয়', 'Net payable')} value={money(scorecard.netVendorPayablePoisha)} tone="positive" />
          <Kpi label={t('রিটার্ন হার', 'Return rate')} value={`${(scorecard.returnRateBp / 100).toFixed(2)}%`} tone={scorecard.returnRateBp > 500 ? 'danger' : 'neutral'} />
          <Kpi label={t('SLA গ্রেড', 'SLA grade')} value={scorecard.slaGrade} />
        </Card>
      )}

      <Card surface="bg" padding="none">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-xs">
            <thead className="bg-surface text-muted">
              <tr>
                <th className="p-2 font-semibold">{t('তারিখ', 'Date')}</th>
                <th className="p-2 font-semibold">{t('ধরন', 'Type')}</th>
                <th className="p-2 font-semibold">{t('বাকেট', 'Bucket')}</th>
                <th className="p-2 font-semibold">{t('অর্ডার', 'Order')}</th>
                <th className="p-2 font-semibold">{t('বিবরণ', 'Description')}</th>
                <th className="p-2 text-right font-semibold">{t('পরিমাণ', 'Amount')}</th>
              </tr>
            </thead>
            <tbody>
              {ledger.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-muted">
                    {t('এখনো কোনো লেজার এন্ট্রি নেই।', 'No ledger entries yet.')}
                  </td>
                </tr>
              )}
              {ledger.map((entry) => (
                <tr key={entry.id} className="border-t border-border">
                  <td className="p-2 whitespace-nowrap">{new Date(entry.createdAt).toLocaleDateString()}</td>
                  <td className="p-2 font-mono text-[10px]">{entry.entryType}</td>
                  <td className="p-2">{entry.escrowBucket}</td>
                  <td className="p-2 font-mono">{entry.orderNo ?? '—'}</td>
                  <td className="p-2">{entry.descriptionBn}</td>
                  <td className={cn('p-2 text-right tabular-nums', entry.amountPoisha < 0 ? 'text-danger' : 'text-ink')}>
                    {money(entry.amountPoisha)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ===========================================================================
// 6. PAYOUTS
// ===========================================================================

export function PayoutsTab({ workspace, send, busy, t, num, money }: MutatingTabProps) {
  const { escrow, payouts, capabilities, rules, profile } = workspace;
  const [amount, setAmount] = useState('');

  const poisha = parseTaka(amount);
  const belowMin = poisha !== null && poisha < rules.minPayoutRequestPoisha;
  const overBalance = poisha !== null && poisha > escrow.withdrawablePoisha;

  return (
    <div className="space-y-4">
      <SectionHead
        title={t('পেআউট', 'Payouts')}
        desc={t(
          'শুধুমাত্র Available ব্যালেন্স থেকে পেআউট চাওয়া যায়। অ্যাডমিন অনুমোদনের পর টাকা পাঠানো হয়।',
          'Only the Available balance can be withdrawn. An admin approves every payout before it is sent.'
        )}
      />

      <div className="grid gap-2 sm:grid-cols-3">
        <Kpi label={t('উত্তোলনযোগ্য', 'Withdrawable')} value={money(escrow.withdrawablePoisha)} tone="positive" />
        <Kpi label={t('সর্বনিম্ন অনুরোধ', 'Minimum request')} value={money(rules.minPayoutRequestPoisha)} />
        <Kpi label={t('পেআউট পদ্ধতি', 'Payout method')} value={profile.payoutMethodBn} hint={profile.payoutAccountMasked} />
      </div>

      {!capabilities.canRequestPayout ? (
        <LockedNotice label={t('পেআউট অনুরোধ', 'request payouts')} t={t} />
      ) : (
        <Card surface="surface" padding="sm">
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              if (poisha === null || belowMin || overBalance) return;
              const ok = await send('/api/vendor/payouts', { requestedAmountPoisha: poisha }, {
                bn: 'পেআউট অনুরোধ জমা হয়েছে; অ্যাডমিন অনুমোদনের অপেক্ষায়।',
                en: 'Payout request submitted and awaiting admin approval.',
              });
              if (ok) setAmount('');
            }}
          >
            <label className="min-w-[180px] flex-1 space-y-1 text-xs font-medium">
              <span>{t('পরিমাণ (৳)', 'Amount (৳)')}</span>
              <input
                className={inputClass}
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={String(rules.minPayoutRequestPoisha / 100)}
              />
            </label>
            <Button type="submit" variant="primary" isLoading={busy} disabled={poisha === null || belowMin || overBalance}>
              {t('পেআউট অনুরোধ', 'Request payout')}
            </Button>
          </form>
          {belowMin && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {t(`সর্বনিম্ন ${money(rules.minPayoutRequestPoisha)} অনুরোধ করা যাবে।`, `Minimum request is ${money(rules.minPayoutRequestPoisha)}.`)}
            </p>
          )}
          {overBalance && (
            <p role="alert" className="mt-2 text-xs text-danger">
              {t('উত্তোলনযোগ্য ব্যালেন্সের বেশি অনুরোধ করা যাবে না।', 'Cannot exceed the withdrawable balance.')}
            </p>
          )}
        </Card>
      )}

      {payouts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-6 w-6" aria-hidden="true" />}
          title={t('কোনো পেআউট অনুরোধ নেই', 'No payout requests yet')}
          description={t('Available ব্যালেন্স জমা হলে অনুরোধ করুন।', 'Request a payout once your available balance builds up.')}
        />
      ) : (
        <div className="space-y-2">
          {payouts.map((payout) => (
            <Card key={payout.payoutId} surface="surface" padding="sm" className="space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-[10px] text-muted">{payout.payoutId}</span>
                <StatusBadge status={payout.status} t={t} />
                <span className="ml-auto font-bold tabular-nums">{money(payout.requestedAmountPoisha)}</span>
              </div>
              <p className="text-[11px] text-muted">
                {payout.payoutMethodBn} · {payout.payoutAccountMasked} ·{' '}
                {t('অনুরোধ', 'Requested')} {new Date(payout.requestedAt).toLocaleDateString()}
                {payout.paymentTrxId ? ` · TrxID ${payout.paymentTrxId}` : ''}
              </p>
              {payout.rejectionReasonBn && (
                <p className="text-[11px] text-danger">
                  {t('প্রত্যাখ্যানের কারণ', 'Rejection reason')}: {payout.rejectionReasonBn}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// 7. PRICE PROPOSALS
// ===========================================================================

export function ProposalsTab({ workspace, send, busy, t, num, money }: MutatingTabProps) {
  const { products, proposals, capabilities } = workspace;
  const variantOptions = useMemo(
    () =>
      products.flatMap((product) =>
        product.variants.map((variant) => ({
          value: variant.variantId,
          label: `${product.nameBn} — ${variant.titleBn} (${variant.publicSku}) · ${money(variant.salePricePoisha)}`,
          current: variant,
        }))
      ),
    [products, money]
  );

  const [variantId, setVariantId] = useState(variantOptions[0]?.value ?? '');
  const selected = variantOptions.find((option) => option.value === variantId)?.current;
  const [cost, setCost] = useState(selected ? String(selected.supplierCostPoisha / 100) : '');
  const [price, setPrice] = useState(selected ? String(selected.salePricePoisha / 100) : '');
  const [reason, setReason] = useState('');

  return (
    <div className="space-y-4">
      <SectionHead
        title={t('মূল্য প্রস্তাব', 'Price proposals')}
        desc={t(
          'ক্রয়মূল্য বা বিক্রয়মূল্য বদলাতে প্রস্তাব দিন। সুপার অ্যাডমিন অনুমোদনের পরেই দাম বদলাবে।',
          'Propose a new cost or retail price. Nothing changes until a super admin approves it.'
        )}
      />

      {!capabilities.canSubmitPriceProposal ? (
        <LockedNotice label={t('মূল্য প্রস্তাব জমা', 'submit price proposals')} t={t} />
      ) : (
        <Card surface="surface" padding="sm" className="space-y-2">
          <form
            className="grid gap-2 sm:grid-cols-2"
            onSubmit={async (event) => {
              event.preventDefault();
              const costPoisha = parseTaka(cost);
              const salePoisha = parseTaka(price);
              if (costPoisha === null || salePoisha === null || !variantId || reason.trim().length < 2) return;
              const ok = await send(
                '/api/vendor/price-proposals',
                {
                  variantId,
                  proposedSupplierCostPoisha: costPoisha,
                  proposedSalePricePoisha: salePoisha,
                  reasonBn: reason,
                },
                {
                  bn: 'মূল্য প্রস্তাব জমা হয়েছে; অ্যাডমিন যাচাই করবে।',
                  en: 'Price proposal submitted for admin review.',
                }
              );
              if (ok) setReason('');
            }}
          >
            <label className="space-y-1 text-xs font-medium sm:col-span-2">
              <span>{t('ভ্যারিয়েন্ট', 'Variant')}</span>
              <select
                className={inputClass}
                value={variantId}
                onChange={(e) => {
                  setVariantId(e.target.value);
                  const next = variantOptions.find((option) => option.value === e.target.value)?.current;
                  if (next) {
                    setCost(String(next.supplierCostPoisha / 100));
                    setPrice(String(next.salePricePoisha / 100));
                  }
                }}
                required
              >
                {variantOptions.length === 0 && <option value="">{t('আগে পণ্য যোগ করুন', 'Add a product first')}</option>}
                {variantOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('নতুন ক্রয়মূল্য (৳)', 'New cost (৳)')}</span>
              <input className={inputClass} inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} required />
            </label>
            <label className="space-y-1 text-xs font-medium">
              <span>{t('নতুন বিক্রয়মূল্য (৳)', 'New retail price (৳)')}</span>
              <input className={inputClass} inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} required />
            </label>
            <label className="space-y-1 text-xs font-medium sm:col-span-2">
              <span>{t('কারণ', 'Reason')}</span>
              <textarea className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} required minLength={2} />
            </label>
            <div className="sm:col-span-2">
              <Button type="submit" variant="primary" isLoading={busy} disabled={variantOptions.length === 0}>
                {t('প্রস্তাব জমা দিন', 'Submit proposal')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {proposals.length === 0 ? (
        <EmptyState
          icon={<Percent className="h-6 w-6" aria-hidden="true" />}
          title={t('কোনো প্রস্তাব নেই', 'No proposals yet')}
          description={t('মূল্য পরিবর্তন দরকার হলে প্রস্তাব দিন।', 'Submit a proposal whenever your pricing needs to change.')}
        />
      ) : (
        <div className="space-y-2">
          {proposals.map((proposal) => (
            <Card key={proposal.proposalId} surface="surface" padding="sm" className="space-y-1 text-xs">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-muted">{proposal.proposalId}</span>
                <StatusBadge status={proposal.status} t={t} />
                <span className="font-medium">{proposal.productNameBn}</span>
                <span className="font-mono text-[10px]">{proposal.publicSku}</span>
              </div>
              <p className="text-[11px]">
                {t('ক্রয়মূল্য', 'Cost')}: {money(proposal.currentSupplierCostPoisha)} →{' '}
                <span className="font-semibold">{money(proposal.proposedSupplierCostPoisha)}</span>
                {' · '}
                {t('বিক্রয়মূল্য', 'Retail')}: {money(proposal.currentSalePricePoisha)} →{' '}
                <span className="font-semibold">{money(proposal.proposedSalePricePoisha)}</span>
              </p>
              <p className="text-[11px] text-muted">{proposal.reasonBn}</p>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

// ===========================================================================
// 8. PROFILE & ONBOARDING
// ===========================================================================

export function ProfileTab({
  workspace,
  send,
  busy,
  t,
  num,
  money,
  bn,
}: MutatingTabProps & { bn: boolean }) {
  const { profile, capabilities, rules, selfServiceRequests } = workspace;

  const [businessNameBn, setBusinessNameBn] = useState('');
  const [ownerNameBn, setOwnerNameBn] = useState('');
  const [phone, setPhone] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('');
  const [payoutAccount, setPayoutAccount] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const capabilityRows = Object.keys(CAP_LABEL_KEYS) as Array<keyof typeof CAP_LABEL_KEYS>;

  return (
    <div className="space-y-4">
      <SectionHead
        title={t('প্রোফাইল ও অনবোর্ডিং', 'Profile & onboarding')}
        desc={t(
          'তথ্য পরিবর্তনের অনুরোধ অ্যাডমিন অনুমোদন করলে কার্যকর হবে — নিরাপত্তার জন্য সরাসরি পরিবর্তন বন্ধ।',
          'Changes take effect only after admin approval — direct self-edits stay blocked for safety.'
        )}
      />

      <Card surface="surface" padding="sm" className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        <Kpi label={t('ভেন্ডর কোড', 'Vendor code')} value={profile.vendorCode} />
        <Kpi label={t('কমিশন', 'Commission')} value={profile.defaultCommissionBp === null ? t('গ্লোবাল', 'Global') : `${profile.defaultCommissionBp / 100}%`} />
        <Kpi label={t('এসক্রো হোল্ড', 'Escrow hold')} value={`${profile.escrowHoldDaysOverride ?? rules.globalEscrowHoldDays} ${t('দিন', 'days')}`} />
        <Kpi label={t('যোগদান', 'Joined')} value={new Date(profile.joinedAt).toLocaleDateString()} />
      </Card>

      <Card surface="bg" padding="sm" className="space-y-2">
        <h3 className="text-sm font-bold">{t('অ্যাডমিন যা অনুমোদন করেছেন', 'What the admin allows you')}</h3>
        <ul className="grid gap-1 text-xs sm:grid-cols-2">
          {capabilityRows.map((key) => {
            const allowed = capabilities[key] === true;
            return (
              <li key={key} className="flex items-center gap-2">
                {allowed ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden="true" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                )}
                <span className={allowed ? 'text-ink' : 'text-muted line-through'}>
                  {t(CAP_LABEL_KEYS[key][0], CAP_LABEL_KEYS[key][1])}
                </span>
              </li>
            );
          })}
          {capabilities.maxActiveProducts > 0 && (
            <li className="flex items-center gap-2 text-muted">
              <Info className="h-3.5 w-3.5" aria-hidden="true" />
              {t(`সর্বোচ্চ ${capabilities.maxActiveProducts}টি পণ্য`, `Max ${capabilities.maxActiveProducts} products`)}
            </li>
          )}
        </ul>
      </Card>

      <Card surface="surface" padding="sm" className="space-y-2">
        <h3 className="text-sm font-bold">{t('প্রোফাইল পরিবর্তনের অনুরোধ', 'Request a profile change')}</h3>
        {(!capabilities.canEditProfile && !capabilities.canEditPayoutProfile) && (
          <LockedNotice label={t('প্রোফাইল সম্পাদনা', 'edit profile')} t={t} />
        )}
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
          <label className="space-y-1 text-xs font-medium">
            <span>{t('ব্যবসার নাম (বাংলা)', 'Business name (Bangla)')}</span>
            <input className={inputClass} value={businessNameBn} onChange={(e) => setBusinessNameBn(e.target.value)} disabled={!capabilities.canEditProfile} placeholder={profile.businessNameBn} />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>{t('মালিকের নাম', 'Owner name')}</span>
            <input className={inputClass} value={ownerNameBn} onChange={(e) => setOwnerNameBn(e.target.value)} disabled={!capabilities.canEditProfile} placeholder={profile.ownerNameBn} />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>{t('যোগাযোগ নম্বর', 'Contact number')}</span>
            <input className={inputClass} inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} disabled={!capabilities.canEditProfile} placeholder={profile.contactPhone} />
          </label>
          <label className="space-y-1 text-xs font-medium">
            <span>{t('পেআউট পদ্ধতি', 'Payout method')}</span>
            <input className={inputClass} value={payoutMethod} onChange={(e) => setPayoutMethod(e.target.value)} disabled={!capabilities.canEditPayoutProfile} placeholder={profile.payoutMethodBn} />
          </label>
          <label className="space-y-1 text-xs font-medium sm:col-span-2">
            <span>{t('পেআউট অ্যাকাউন্ট নম্বর', 'Payout account number')}</span>
            <input className={inputClass} value={payoutAccount} onChange={(e) => setPayoutAccount(e.target.value)} disabled={!capabilities.canEditPayoutProfile} placeholder={profile.payoutAccountMasked} />
          </label>
          <div className="sm:col-span-2">
            <Button type="submit" variant="primary" isLoading={busy} disabled={!capabilities.canEditProfile && !capabilities.canEditPayoutProfile}>
              {t('অনুরোধ পাঠান', 'Send request')}
            </Button>
          </div>
        </form>
      </Card>

      <Card surface="surface" padding="sm" className="space-y-2">
        <h3 className="text-sm font-bold">
          {t('অনবোর্ডিং ১৫ প্রশ্ন', '15-question onboarding')}
        </h3>
        <p className="text-[11px] text-muted">
          {t(
            `${profile.onboardingAnsweredCount} / ${profile.onboardingTotalQuestions} উত্তর সম্পন্ন। সব উত্তর দিয়ে জমা দিলে অ্যাডমিন যাচাই করবে।`,
            `${profile.onboardingAnsweredCount} of ${profile.onboardingTotalQuestions} answered. Fill everything in and the admin will verify it.`
          )}
        </p>
        {!capabilities.canSubmitOnboardingAnswers ? (
          <LockedNotice label={t('অনবোর্ডিং উত্তর জমা', 'submit onboarding answers')} t={t} />
        ) : (
          <form
            className="space-y-2"
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

      <Card surface="bg" padding="sm" className="space-y-2">
        <h3 className="text-sm font-bold">{t('অনুরোধের ইতিহাস', 'Request history')}</h3>
        {selfServiceRequests.length === 0 ? (
          <p className="text-xs text-muted">{t('কোনো অনুরোধ নেই।', 'No requests yet.')}</p>
        ) : (
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
        )}
      </Card>
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
