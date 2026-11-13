'use client';
import { localizedField } from '@/src/lib/i18n/ui-text';

import { LocalizedText } from '@/src/components/ui/localized-text';


import React, { useState } from 'react';
import { adminFetch as fetch } from '@/src/lib/admin/admin-fetch';
import {
  ArrowRight,
  Calculator,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  GitFork,
  Layers,
  PackagePlus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  Tag,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  ConsignmentDispatchLotRecord,
  CustomerRefundExecutionRecord,
  EscrowMaturityBatchRecord,
  ExecutiveAccountingSummaryDTO,
  FlashSaleCampaignRecord,
  LedgerReversalRequestRecord,
  Phase7WorkspaceOverviewDTO,
  SupplierProductOfferRecord,
  VendorFulfillmentGroupRecord,
  VendorPriceProposalRecord,
} from '@/src/lib/admin/phase7-service';
import { formatPoishaToBdt } from '@/src/lib/money';
import { useLocaleStore } from '@/src/store/use-locale-store';

interface ProductVariantOption {
  productId: string;
  productNameBn: string;
  variantId: string;
  variantTitleBn: string;
  publicSku: string;
  salePricePoisha: number;
  supplierCostPoisha?: number;
  platformMarginPoisha?: number;
  stockAvailable: number;
}

interface Phase7PortalPanelProps {
  overview: Phase7WorkspaceOverviewDTO | null;
  productVariants: ProductVariantOption[];
  roleSlug: string;
  onRefreshWorkspace: () => Promise<void>;
  onNotify: (msg: string, tone?: 'success' | 'error') => void;
  locale?: 'bn' | 'en';
}

export function Phase7PortalPanel({
  overview,
  productVariants,
  roleSlug,
  onRefreshWorkspace,
  onNotify,
  locale: propLocale,
}: Phase7PortalPanelProps) {
  const storeLocale = useLocaleStore((s) => s.adminLocale);
  const locale = propLocale ?? storeLocale ?? 'en';
  const isBn = locale === 'bn';
  const [activeSubTab, setActiveSubTab] = useState<
    | 'consignment_lots'
    | 'price_proposals'
    | 'flash_and_maturity'
    | 'executive_accounting'
    | 'multi_supplier_and_split'
    | 'maker_checker_reversals'
  >('consignment_lots');
  const [busyAction, setBusyAction] = useState<string | null>(null);

  // 1. Consignment Dispatch Lot Form State
  const [selectedLotVariantId, setSelectedLotVariantId] = useState<string>(
    productVariants[0]?.variantId ?? '00000000-0000-4000-8000-000000000201'
  );
  const [dispatchedQty, setDispatchedQty] = useState<string>('12');
  const [challanRef, setChallanRef] = useState<string>('CH-2026-110');
  const [lotNoteBn, setLotNoteBn] = useState<string>(
    'নতুন কনসাইনমেন্ট স্টক চালান ওয়্যারহাউসে প্রেরিত।'
  );
  const [qcRejectInputByLot, setQcRejectInputByLot] = useState<
    Record<string, string>
  >({});

  // 2. Price Proposal Form State
  const [selectedPropVariantId, setSelectedPropVariantId] = useState<string>(
    productVariants[0]?.variantId ?? '00000000-0000-4000-8000-000000000201'
  );
  const [proposedCostBdt, setProposedCostBdt] = useState<string>('1900');
  const [proposedSaleBdt, setProposedSaleBdt] = useState<string>('2550');
  const [proposalReasonBn, setProposalReasonBn] = useState<string>(
    'কাঁচামাল ও বুনন খরচ বৃদ্ধির কারণে সাপ্লায়ার কস্ট ও খুচরা মূল্য সমন্বয়।'
  );

  // 5. Multi-Supplier Offer & Order Split State
  const [offerVariantId, setOfferVariantId] = useState<string>(
    productVariants[0]?.variantId ?? '00000000-0000-4000-8000-000000000201'
  );
  const [offerVendorId, setOfferVendorId] = useState<string>(
    '00000000-0000-4000-8000-000000000901'
  );
  const [offerInternalSku, setOfferInternalSku] =
    useState<string>('VND001-JAM-OFFER');
  const [offerCostBdt, setOfferCostBdt] = useState<string>('1550');
  const [offerProfitBdt, setOfferProfitBdt] = useState<string>('250');
  const [offerPriorityRank, setOfferPriorityRank] = useState<string>('1');
  const [offerStockAvailable, setOfferStockAvailable] = useState<string>('20');
  const [splitOrderNo, setSplitOrderNo] = useState<string>('ORD-261106-0001');
  const [splitStrategy, setSplitStrategy] = useState<
    'priority_rank' | 'lowest_payable_highest_margin' | 'highest_stock'
  >('priority_rank');

  // 6. Maker-Checker Reversal & Refund State
  const [revOriginalEntryId, setRevOriginalEntryId] =
    useState<string>('vled-seed-2');
  const [revAmountBdt, setRevAmountBdt] = useState<string>('1850');
  const [revReasonBn, setRevReasonBn] = useState<string>(
    'ভুল পোস্টিং সংশোধনের জন্য মেকার-চেকার রিভার্সাল ও কারেকশন জার্নাল।'
  );
  const [emergencyTotpInput, setEmergencyTotpInput] =
    useState<string>('123456');
  const [refundOrderNo, setRefundOrderNo] = useState<string>('ORD-261106-0002');
  const [refundAmountBdt, setRefundAmountBdt] = useState<string>('300');
  const [refundChannel, setRefundChannel] = useState<
    'bkash_manual' | 'bank_transfer'
  >('bkash_manual');
  const [refundTrxRef, setRefundTrxRef] = useState<string>('BK-REF-991042');
  const [refundReasonBn, setRefundReasonBn] = useState<string>(
    'অর্ডার বাতিল হওয়ায় ম্যানুয়াল বিকাশ অগ্রিম অর্থ গ্রাহককে ফেরত।'
  );

  const lots: ConsignmentDispatchLotRecord[] = overview?.consignmentLots ?? [];
  const proposals: VendorPriceProposalRecord[] = overview?.priceProposals ?? [];
  const flashCampaigns: FlashSaleCampaignRecord[] =
    overview?.flashCampaigns ?? [];
  const maturityBatches: EscrowMaturityBatchRecord[] =
    overview?.maturityBatches ?? [];
  const accounting: ExecutiveAccountingSummaryDTO | null =
    overview?.executiveAccounting ?? null;
  const supplierOffers: SupplierProductOfferRecord[] =
    overview?.supplierProductOffers ?? [];
  const fulfillmentGroups: VendorFulfillmentGroupRecord[] =
    overview?.fulfillmentGroups ?? [];
  const ledgerReversals: LedgerReversalRequestRecord[] =
    overview?.ledgerReversals ?? [];
  const customerRefunds: CustomerRefundExecutionRecord[] =
    overview?.customerRefunds ?? [];

  const isVendor = roleSlug === 'vendor';
  const isSuperAdmin = roleSlug === 'super_admin';

  const pendingQcLotsCount = lots.filter(
    (l) => l.status === 'pending_qc'
  ).length;
  const pendingProposalsCount = proposals.filter(
    (p) => p.status === 'pending_review'
  ).length;
  const pendingReversalsCount = ledgerReversals.filter(
    (r) => r.status === 'pending_checker_approval'
  ).length;

  async function handleSubmitConsignmentLot(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('submit-lot');
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'submit_consignment_lot',
          variantId: selectedLotVariantId,
          dispatchedQty: Math.max(1, Number(dispatchedQty) || 1),
          challanRef,
          noteBn: lotNoteBn,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify(data.errorBn ?? 'চালান জমা দেওয়া যায়নি।', 'error');
      } else {
        onNotify(
          `কনসাইনমেন্ট লট (${data.lot?.lotCode}) সফলভাবে কিউসি কিউতে যোগ হয়েছে!`,
          'success'
        );
        await onRefreshWorkspace();
      }
    } catch {
      onNotify('নেটওয়ার্ক ত্রুটি ঘটেছে।', 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReviewLot(
    lotId: string,
    decision: 'approve' | 'reject'
  ) {
    setBusyAction(`qc-${lotId}-${decision}`);
    try {
      const rejectedQty = Number(qcRejectInputByLot[lotId] ?? '0') || 0;
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'review_consignment_lot',
          lotId,
          decision,
          qcRejectedQty: rejectedQty,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify(data.errorBn ?? 'কিউসি আপডেট ব্যর্থ হয়েছে।', 'error');
      } else {
        onNotify(
          `লট ${data.lot?.lotCode} কিউসি সম্পন্ন হয়েছে (গৃহীত: ${data.lot?.qcAcceptedQty} পিস)।`,
          'success'
        );
        await onRefreshWorkspace();
      }
    } catch {
      onNotify('নেটওয়ার্ক ত্রুটি ঘটেছে।', 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSubmitPriceProposal(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('submit-proposal');
    try {
      const costPoisha = Math.round((Number(proposedCostBdt) || 0) * 100);
      const salePoisha = Math.round((Number(proposedSaleBdt) || 0) * 100);
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'submit_price_proposal',
          variantId: selectedPropVariantId,
          proposedSupplierCostPoisha: costPoisha,
          proposedSalePricePoisha: salePoisha,
          reasonBn: proposalReasonBn,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify(data.errorBn ?? 'মূল্য প্রস্তাব জমা দেওয়া যায়নি।', 'error');
      } else {
        onNotify('মূল্য পরিবর্তনের প্রস্তাব সফলভাবে জমা হয়েছে!', 'success');
        await onRefreshWorkspace();
      }
    } catch {
      onNotify('নেটওয়ার্ক ত্রুটি ঘটেছে।', 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResolvePriceProposal(
    proposalId: string,
    decision: 'approved' | 'rejected'
  ) {
    setBusyAction(`prop-${proposalId}-${decision}`);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'resolve_price_proposal',
          proposalId,
          decision,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify(data.errorBn ?? 'প্রস্তাব নিষ্পত্তি ব্যর্থ হয়েছে।', 'error');
      } else {
        onNotify(
          `মূল্য প্রস্তাব "${decision === 'approved' ? 'অনুমোদিত' : 'প্রত্যাখ্যাত'}" হিসেবে আপডেট হয়েছে!`,
          'success'
        );
        await onRefreshWorkspace();
      }
    } catch {
      onNotify('নেটওয়ার্ক ত্রুটি ঘটেছে।', 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handlePromoteMaturedEscrow(forceAll: boolean) {
    setBusyAction(forceAll ? 'promote-force' : 'promote-due');
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'promote_matured_escrow',
          forcePromoteAllLocked: forceAll,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify(
          data.errorBn ?? 'এসক্রো ম্যাচুরিটি প্রমোশন ব্যর্থ হয়েছে।',
          'error'
        );
      } else {
        onNotify(data.batch?.summaryBn ?? 'প্রমোশন সম্পন্ন হয়েছে।', 'success');
        await onRefreshWorkspace();
      }
    } catch {
      onNotify('নেটওয়ার্ক ত্রুটি ঘটেছে।', 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleUpsertSupplierOffer(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('upsert-offer');
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'upsert_supplier_offer',
          variantId: offerVariantId,
          vendorId: offerVendorId,
          internalVendorSku: offerInternalSku,
          supplierCostPoisha: Math.round((Number(offerCostBdt) || 0) * 100),
          supplierProfitPoisha: Math.round((Number(offerProfitBdt) || 0) * 100),
          priorityRank: Math.max(1, Number(offerPriorityRank) || 1),
          stockAvailable: Math.max(0, Number(offerStockAvailable) || 0),
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify(data.errorBn ?? 'সাপ্লায়ার অফার সংরক্ষণ ব্যর্থ হয়েছে।', 'error');
      } else {
        onNotify(
          `সাপ্লায়ার অফার (${data.offer?.vendorCode}) সফলভাবে সংরক্ষিত হয়েছে!`,
          'success'
        );
        await onRefreshWorkspace();
      }
    } catch {
      onNotify('নেটওয়ার্ক ত্রুটি ঘটেছে।', 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleSplitOrderFulfillment(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('split-order');
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'split_order_fulfillment_groups',
          orderNo: splitOrderNo,
          allocationPolicy: splitStrategy,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify(data.errorBn ?? 'ফুলফিলমেন্ট স্প্লিট ব্যর্থ হয়েছে।', 'error');
      } else {
        onNotify(
          `অর্ডার ${splitOrderNo} সফলভাবে ${data.groups?.length ?? 1}টি ভেন্ডর ফুলফিলমেন্ট গ্রুপে বিভক্ত হয়েছে!`,
          'success'
        );
        await onRefreshWorkspace();
      }
    } catch {
      onNotify('নেটওয়ার্ক ত্রুটি ঘটেছে।', 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleCreateLedgerReversal(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('create-reversal');
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'create_ledger_reversal',
          originalLedgerEntryId: revOriginalEntryId,
          correctedCreditPoisha: Math.round((Number(revAmountBdt) || 0) * 100),
          reasonBn: revReasonBn,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify(data.errorBn ?? 'রিভার্সাল অনুরোধ তৈরি ব্যর্থ হয়েছে।', 'error');
      } else {
        onNotify(
          `মেকার-চেকার রিভার্সাল অনুরোধ (${data.reversal?.reversalCode}) তৈরি হয়েছে!`,
          'success'
        );
        await onRefreshWorkspace();
      }
    } catch {
      onNotify('নেটওয়ার্ক ত্রুটি ঘটেছে।', 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleResolveLedgerReversal(
    reversalId: string,
    decision: 'approve' | 'reject'
  ) {
    setBusyAction(`rev-${reversalId}-${decision}`);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'resolve_ledger_reversal',
          reversalId,
          decision,
          emergencySelfApprovalOverride: Boolean(emergencyTotpInput),
          emergencyOverrideReasonBn:
            'সুপার অ্যাডমিন ২এফএ ইমার্জেন্সি ওভাররাইড অনুমোদন।',
          totpCode: emergencyTotpInput || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify(data.errorBn ?? 'রিভার্সাল অনুমোদন ব্যর্থ হয়েছে।', 'error');
      } else {
        onNotify(
          `লেজার রিভার্সাল (${data.reversal?.reversalCode}) সফলভাবে নিষ্পত্তি হয়েছে!`,
          'success'
        );
        await onRefreshWorkspace();
      }
    } catch {
      onNotify('নেটওয়ার্ক ত্রুটি ঘটেছে।', 'error');
    } finally {
      setBusyAction(null);
    }
  }

  async function handleExecuteCustomerRefund(e: React.FormEvent) {
    e.preventDefault();
    setBusyAction('execute-refund');
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'execute_customer_refund',
          orderNo: refundOrderNo,
          refundAmountPoisha: Math.round((Number(refundAmountBdt) || 0) * 100),
          refundChannel,
          refundTrxId: refundTrxRef,
          reasonBn: refundReasonBn,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        onNotify(data.errorBn ?? 'রিফান্ড সম্পন্ন করা যায়নি।', 'error');
      } else {
        onNotify(
          `গ্রাহক রিফান্ড (${data.refund?.refundCode}) ও ব্যালেন্সড লেজার এন্ট্রি সম্পন্ন হয়েছে!`,
          'success'
        );
        await onRefreshWorkspace();
      }
    } catch {
      onNotify('নেটওয়ার্ক ত্রুটি ঘটেছে।', 'error');
    } finally {
      setBusyAction(null);
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Executive Header */}
      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="flex items-center gap-2 text-lg font-bold text-[var(--color-ink)]">
              <Layers className="h-5 w-5 text-[var(--color-ink)]" />
              {isBn
                ? 'সেলফ-সার্ভিস ভেন্ডর পোর্টাল, প্রোমো ক্যাম্পেইন ও এক্সিকিউটিভ একাউন্টিং (Phase 7 — Module T)'
                : 'Self-Service Vendor Portal, Promo Campaigns & Executive Accounting (Phase 7 — Module T)'}
            </h2>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              {isBn
                ? 'কনসাইনমেন্ট স্টক চালান ও কিউসি অনুমোদন, ভেন্ডর মূল্য প্রস্তাব, মার্জিন-সেফ প্রোমো ক্যাম্পেইন, ৭-দিন এসক্রো ম্যাচুরিটি প্রমোটার এবং ডাবল-এন্ট্রি বিডিটি একাউন্টিং ও ভ্যাট লেজার।'
                : 'Consignment stock dispatch & QC review, supplier price proposals, margin-safe flash campaigns, 7-day escrow maturity and double-entry VAT accounting.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => onRefreshWorkspace()}
            className="inline-flex h-10 items-center gap-1.5 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3.5 text-xs font-semibold text-[var(--color-ink)] hover:bg-[var(--color-border)]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {isBn ? 'ডেটা রিফ্রেশ করুন' : 'Refresh Workspace'}
          </button>
        </div>

        {/* 4 Summary KPI Cards */}
        <div className="mt-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-ink)]">
                {isBn ? 'কনসাইনমেন্ট স্টক চালান (Lots)' : 'Consignment Lots'}
              </span>
              <span className="rounded border border-[var(--color-warning)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-warning)]">
                {pendingQcLotsCount} {isBn ? 'কিউসি অপেক্ষমাণ' : 'Pending QC'}
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[var(--color-ink)]">
              {lots.length} {isBn ? 'টি চালান' : 'Lots'}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              {isBn ? 'গৃহীত চালান স্বয়ংক্রিয়ভাবে ইনভেন্টরি স্টকে যোগ হয়' : 'Approved lots auto-increment active warehouse inventory'}
            </p>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-ink)]">
                {isBn ? 'ভেন্ডর মূল্য পরিবর্তন প্রস্তাব' : 'Price Change Proposals'}
              </span>
              <span className="rounded border border-[var(--color-info)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-info)]">
                {pendingProposalsCount} {isBn ? 'রিভিউ বাকি' : 'Pending Review'}
              </span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[var(--color-ink)]">
              {proposals.length} {isBn ? 'টি প্রস্তাব' : 'Proposals'}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              {isBn ? '৩-স্তরের পয়সা স্প্লিট ও কমিশন অটো-ক্যালকুলেশন' : '3-tier Poisha split and commission auto-calculation'}
            </p>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-ink)]">
                {isBn ? 'মার্জিন-সেফ প্রোমো ক্যাম্পেইন' : 'Margin-Safe Promo Deals'}
              </span>
              <span className="rounded border border-[var(--color-success)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-success)]">
                <LocalizedText source={"Golden Rule Guard"} area="admin" />{" "}</span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[var(--color-ink)]">
              {flashCampaigns.length} {isBn ? 'টি ডিল' : 'Deals'}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              {isBn ? 'ভেন্ডর প্রদেয় ১০০% অক্ষুণ্ণ রেখে প্ল্যাটফর্ম মার্জিন ছাড়' : 'Platform discounts funded exclusively from net margin'}
            </p>
          </div>

          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-[var(--color-ink)]">
                {isBn ? 'নিট প্ল্যাটফর্ম রিটেইনড প্রফিট' : 'Net Retained Platform Profit'}
              </span>
              <span className="rounded border border-[var(--color-ink)] px-2 py-0.5 text-[11px] font-bold text-[var(--color-ink)]">
                <LocalizedText source={"VAT 5% Deducted"} area="admin" />{" "}</span>
            </div>
            <p className="mt-2 font-mono text-2xl font-bold tabular-nums text-[var(--color-ink)]">
              {accounting
                ? formatPoishaToBdt(accounting.netRetainedPlatformProfitPoisha, locale)
                : (isBn ? 'সংরক্ষিত' : 'Reserved')}
            </p>
            <p className="mt-1 text-[11px] text-[var(--color-muted)]">
              {isBn ? 'কমিশন মার্জিন - প্রোমো ভর্তুকি - ৫% ভ্যাট - অপারেটিং খরচ' : 'Commission margin - promo subsidy - 5% VAT - operating costs'}
            </p>
          </div>
        </div>

        {/* Sub-Tab Navigation */}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--color-border)] pt-4">
          <button
            type="button"
            onClick={() => setActiveSubTab('consignment_lots')}
            className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-xs font-bold transition-colors ${
              activeSubTab === 'consignment_lots'
                ? 'border-b-2 border-[var(--color-ink)] bg-[var(--color-surface)] text-[var(--color-ink)]'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]'
            }`}
          >
            <PackagePlus className="h-4 w-4" />
            {isBn
              ? `১. কনসাইনমেন্ট স্টক চালান ও কিউসি কিউ (${lots.length})`
              : `1. Consignment Lots & QC Queue (${lots.length})`}
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('price_proposals')}
            className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-xs font-bold transition-colors ${
              activeSubTab === 'price_proposals'
                ? 'border-b-2 border-[var(--color-ink)] bg-[var(--color-surface)] text-[var(--color-ink)]'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]'
            }`}
          >
            <Tag className="h-4 w-4" />
            {isBn
              ? `২. ভেন্ডর মূল্য পরিবর্তন প্রস্তাব (${proposals.length})`
              : `2. Vendor Price Proposals (${proposals.length})`}
          </button>

          {!isVendor && (
            <button
              type="button"
              onClick={() => setActiveSubTab('flash_and_maturity')}
              className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-xs font-bold transition-colors ${
                activeSubTab === 'flash_and_maturity'
                  ? 'border-b-2 border-[var(--color-ink)] bg-[var(--color-surface)] text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]'
              }`}
            >
              <Zap className="h-4 w-4" />
              {isBn
                ? '৩. মার্জিন-সেফ প্রোমো ক্যাম্পেইন ও এসক্রো ম্যাচুরিটি'
                : '3. Margin-Safe Promos & Escrow Maturity'}
            </button>
          )}

          {!isVendor && accounting && (
            <button
              type="button"
              onClick={() => setActiveSubTab('executive_accounting')}
              className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-xs font-bold transition-colors ${
                activeSubTab === 'executive_accounting'
                  ? 'border-b-2 border-[var(--color-ink)] bg-[var(--color-surface)] text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]'
              }`}
            >
              <Calculator className="h-4 w-4" />
              {isBn
                ? '৪. এক্সিকিউটিভ একাউন্টিং ও ভ্যাট লেজার'
                : '4. Executive Accounting & VAT Ledger'}
            </button>
          )}

          <button
            type="button"
            onClick={() => setActiveSubTab('multi_supplier_and_split')}
            className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-xs font-bold transition-colors ${
              activeSubTab === 'multi_supplier_and_split'
                ? 'border-b-2 border-[var(--color-ink)] bg-[var(--color-surface)] text-[var(--color-ink)]'
                : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]'
            }`}
          >
            <GitFork className="h-4 w-4" />
            {isBn
              ? `৫. মাল্টি-সাপ্লায়ার অফার ও ফুলফিলমেন্ট স্প্লিট (${supplierOffers.length}/${fulfillmentGroups.length})`
              : `5. Multi-Supplier Offers & Split (${supplierOffers.length}/${fulfillmentGroups.length})`}
          </button>

          {!isVendor && (
            <button
              type="button"
              onClick={() => setActiveSubTab('maker_checker_reversals')}
              className={`inline-flex h-10 items-center gap-2 rounded-md px-4 text-xs font-bold transition-colors ${
                activeSubTab === 'maker_checker_reversals'
                  ? 'border-b-2 border-[var(--color-ink)] bg-[var(--color-surface)] text-[var(--color-ink)]'
                  : 'text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-ink)]'
              }`}
            >
              <RotateCcw className="h-4 w-4" />
              {isBn
                ? `৬. মেকার-চেকার লেজার রিভার্সাল ও রিফান্ড (${pendingReversalsCount} অপেক্ষমাণ)`
                : `6. Maker-Checker Reversals & Refunds (${pendingReversalsCount} Pending)`}
            </button>
          )}
        </div>
      </div>

      {/* TAB 1: CONSIGNMENT STOCK DISPATCH LOTS & WAREHOUSE QC QUEUE */}
      {activeSubTab === 'consignment_lots' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Submit New Consignment Dispatch Lot */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5 lg:col-span-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
              <PackagePlus className="h-4 w-4" />
              <LocalizedText source={"নতুন কনসাইনমেন্ট স্টক চালান (Dispatch Lot) জমা দিন"} area="admin" />{" "}</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"ভেন্ডর বা স্টাফ নতুন পণ্যের চালান পাঠালে এখানে এন্ট্রি দিন। ওয়্যারহাউস কিউসি অনুমোদনের সাথে সাথে `stockAvailable` স্বয়ংক্রিয়ভাবে বৃদ্ধি পাবে।"} area="admin" />{" "}</p>

            <form
              onSubmit={handleSubmitConsignmentLot}
              className="mt-4 space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-[var(--color-ink)]">
                  <LocalizedText source={"প্রোডাক্ট ভ্যারিয়েন্ট ও পাবলিক SKU নির্বাচন করুন"} area="admin" />{" "}</label>
                <select
                  value={selectedLotVariantId}
                  onChange={(e) => setSelectedLotVariantId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-[var(--color-ink)]"
                >
                  {productVariants.map((v) => (
                    <option key={v.variantId} value={v.variantId}>
                      {v.publicSku} — {localizedField(v, "productNameBn", locale)} ({localizedField(v, "variantTitleBn", locale)}<LocalizedText source={") [স্টক:"} area="admin" />{" "}{v.stockAvailable}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"পাঠানো পণ্যের সংখ্যা (পিস)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min={1}
                    value={dispatchedQty}
                    onChange={(e) => setDispatchedQty(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"চালান বা কুরিয়ার রেফারেন্স নম্বর"} area="admin" />{" "}</label>
                  <input
                    type="text"
                    value={challanRef}
                    onChange={(e) => setChallanRef(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-ink)]">
                  <LocalizedText source={"চালান নোট / বিবরণ"} area="admin" />{" "}</label>
                <input
                  type="text"
                  value={lotNoteBn}
                  onChange={(e) => setLotNoteBn(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-[var(--color-ink)]"
                />
              </div>

              <button
                type="submit"
                disabled={busyAction === 'submit-lot'}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-ink)] px-4 text-xs font-bold text-[var(--color-bg)] hover:opacity-90 disabled:opacity-50"
              >
                <PackagePlus className="h-4 w-4" />
                {busyAction === 'submit-lot'
                  ? 'চালান জমা হচ্ছে...'
                  : 'কনসাইনমেন্ট লট কিউতে জমা দিন'}
              </button>
            </form>
          </div>

          {/* Right: Consignment Lot QC Queue */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5 lg:col-span-7">
            <h3 className="text-sm font-bold text-[var(--color-ink)]">
              <LocalizedText source={"ওয়্যারহাউস কনসাইনমেন্ট চালান ও কিউসি পরিদর্শন তালিকা ("} area="admin" />{lots.length})
            </h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"কিউসি অনুমোদন করলে ত্রুটিমুক্ত পিসগুলো সরাসরি মূল প্রোডাক্ট ইনভেন্টরিতে যোগ হবে।"} area="admin" />{" "}</p>

            <div className="mt-4 space-y-3">
              {lots.map((lot) => (
                <div
                  key={lot.lotId}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--color-ink)]">
                        {lot.lotCode}
                      </span>
                      <span className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[11px] text-[var(--color-ink)]">
                        {lot.publicSku}
                      </span>
                      <span
                        className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
                          lot.status === 'approved_stocked'
                            ? 'border-[var(--color-success)] text-[var(--color-success)]'
                            : lot.status === 'rejected'
                            ? 'border-[var(--color-danger)] text-[var(--color-danger)]'
                            : 'border-[var(--color-warning)] text-[var(--color-warning)]'
                        }`}
                      >
                        {lot.status === 'approved_stocked'
                          ? `স্টকে যুক্ত (${lot.qcAcceptedQty} পিস)`
                          : lot.status === 'rejected'
                          ? 'কিউসি রিজেক্টেড'
                          : 'কিউসি অপেক্ষমাণ (Pending QC)'}
                      </span>
                    </div>
                    <span className="font-mono text-xs font-bold tabular-nums text-[var(--color-ink)]">
                      <LocalizedText source={"চালান:"} area="admin" />{" "}{lot.dispatchedQty} {" "}<LocalizedText source={"পিস · কস্ট:"} area="admin" />{' '}
                      {formatPoishaToBdt(lot.unitSupplierCostPoisha)}<LocalizedText source={"/পিস"} area="admin" />{" "}</span>
                  </div>

                  <p className="mt-1.5 text-xs font-semibold text-[var(--color-ink)]">
                    {localizedField(lot, "productNameBn", locale)} ({localizedField(lot, "variantTitleBn", locale)})
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                    <LocalizedText source={"ভেন্ডর:"} area="admin" />{" "}{localizedField(lot, "vendorNameBn", locale)} ({lot.vendorCode}<LocalizedText source={") · চালান রেফ:"} area="admin" />{' '}
                    {lot.challanRef} {" "}<LocalizedText source={"· নোট:"} area="admin" />{" "}{localizedField(lot, "noteBn", locale)}
                  </p>

                  {lot.status === 'pending_qc' && !isVendor && (
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3">
                      <div className="flex items-center gap-2">
                        <label className="text-[11px] font-semibold text-[var(--color-ink)]">
                          <LocalizedText source={"কিউসি রিজেক্ট সংখ্যা:"} area="admin" />{" "}</label>
                        <input
                          type="number"
                          min={0}
                          max={lot.dispatchedQty}
                          value={qcRejectInputByLot[lot.lotId] ?? '0'}
                          onChange={(e) =>
                            setQcRejectInputByLot((prev) => ({
                              ...prev,
                              [lot.lotId]: e.target.value,
                            }))
                          }
                          className="h-8 w-20 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono text-xs text-[var(--color-ink)]"
                        />
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => handleReviewLot(lot.lotId, 'approve')}
                          className="inline-flex h-8 items-center gap-1.5 rounded bg-[var(--color-ink)] px-3 text-xs font-bold text-[var(--color-bg)] hover:opacity-90"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          <LocalizedText source={"কিউসি পাস ও স্টকে যোগ করুন"} area="admin" />{" "}</button>
                        <button
                          type="button"
                          disabled={busyAction !== null}
                          onClick={() => handleReviewLot(lot.lotId, 'reject')}
                          className="inline-flex h-8 items-center gap-1.5 rounded border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 text-xs font-bold text-[var(--color-danger)]"
                        >
                          <XCircle className="h-3.5 w-3.5" />
                          <LocalizedText source={"চালান রিজেক্ট"} area="admin" />{" "}</button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: VENDOR COST & RETAIL PRICE PROPOSALS */}
      {activeSubTab === 'price_proposals' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Submit Price Proposal */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5 lg:col-span-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
              <Tag className="h-4 w-4" />
              <LocalizedText source={"ভেন্ডর কস্ট ও খুচরা বিক্রয়মূল্য পরিবর্তনের প্রস্তাব"} area="admin" />{" "}</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"নতুন সাপ্লায়ার কস্ট ও খুচরা মূল্য প্রস্তাব করলে সিস্টেম স্বয়ংক্রিয়ভাবে ৩-স্তরের পয়সা স্প্লিট এবং কমিশন রেট (`bp`) হিসাব করবে।"} area="admin" />{" "}</p>

            <form
              onSubmit={handleSubmitPriceProposal}
              className="mt-4 space-y-3.5"
            >
              <div>
                <label className="block text-xs font-semibold text-[var(--color-ink)]">
                  <LocalizedText source={"প্রোডাক্ট ভ্যারিয়েন্ট নির্বাচন করুন"} area="admin" />{" "}</label>
                <select
                  value={selectedPropVariantId}
                  onChange={(e) => setSelectedPropVariantId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-[var(--color-ink)]"
                >
                  {productVariants.map((v) => (
                    <option key={v.variantId} value={v.variantId}>
                      {v.publicSku} — {localizedField(v, "productNameBn", locale)} {" "}<LocalizedText source={"[বর্তমান বিক্রয়মূল্য:"} area="admin" />{' '}
                      {formatPoishaToBdt(v.salePricePoisha)}]
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"প্রস্তাবিত সাপ্লায়ার কস্ট (টাকা)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min={10}
                    value={proposedCostBdt}
                    onChange={(e) => setProposedCostBdt(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"প্রস্তাবিত খুচরা মূল্য (টাকা)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min={20}
                    value={proposedSaleBdt}
                    onChange={(e) => setProposedSaleBdt(e.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[var(--color-ink)]">
                  <LocalizedText source={"মূল্য পরিবর্তনের কারণ"} area="admin" />{" "}</label>
                <input
                  type="text"
                  value={proposalReasonBn}
                  onChange={(e) => setProposalReasonBn(e.target.value)}
                  className="mt-1 h-10 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-bg)] px-3 text-xs text-[var(--color-ink)]"
                />
              </div>

              <button
                type="submit"
                disabled={busyAction === 'submit-proposal'}
                className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--color-ink)] px-4 text-xs font-bold text-[var(--color-bg)] hover:opacity-90"
              >
                <ArrowRight className="h-4 w-4" />
                <LocalizedText source={"মূল্য প্রস্তাব জমা দিন"} area="admin" />{" "}</button>
            </form>
          </div>

          {/* Right: Price Proposal Queue */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5 lg:col-span-7">
            <h3 className="text-sm font-bold text-[var(--color-ink)]">
              <LocalizedText source={"ভেন্ডর মূল্য পরিবর্তন প্রস্তাব কিউ ("} area="admin" />{proposals.length})
            </h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"সুপার অ্যাডমিন অনুমোদন করলে প্রোডাক্টের কস্ট, খুচরা মূল্য ও প্ল্যাটফর্ম মার্জিন সাথে সাথে আপডেট হবে।"} area="admin" />{" "}</p>

            <div className="mt-4 space-y-3">
              {proposals.map((prop) => (
                <div
                  key={prop.proposalId}
                  className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-bold text-[var(--color-ink)]">
                        {prop.publicSku}
                      </span>
                      <span className="text-xs font-bold text-[var(--color-ink)]">
                        {localizedField(prop, "productNameBn", locale)}
                      </span>
                    </div>
                    <span
                      className={`rounded border px-2 py-0.5 text-[11px] font-bold ${
                        prop.status === 'approved'
                          ? 'border-[var(--color-success)] text-[var(--color-success)]'
                          : prop.status === 'rejected'
                          ? 'border-[var(--color-danger)] text-[var(--color-danger)]'
                          : 'border-[var(--color-warning)] text-[var(--color-warning)]'
                      }`}
                    >
                      {prop.status.toUpperCase()}
                    </span>
                  </div>

                  <div className="mt-2.5 grid grid-cols-3 gap-2 rounded border border-[var(--color-border)] bg-[var(--color-bg)] p-2.5 text-xs">
                    <div>
                      <span className="text-[11px] text-[var(--color-muted)]">
                        <LocalizedText source={"সাপ্লায়ার কস্ট (আগে → প্রস্তাবিত)"} area="admin" />{" "}</span>
                      <p className="font-mono font-bold tabular-nums text-[var(--color-ink)]">
                        {formatPoishaToBdt(prop.currentSupplierCostPoisha)} →{' '}
                        {formatPoishaToBdt(prop.proposedSupplierCostPoisha)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--color-muted)]">
                        <LocalizedText source={"খুচরা মূল্য (আগে → প্রস্তাবিত)"} area="admin" />{" "}</span>
                      <p className="font-mono font-bold tabular-nums text-[var(--color-ink)]">
                        {formatPoishaToBdt(prop.currentSalePricePoisha)} →{' '}
                        {formatPoishaToBdt(prop.proposedSalePricePoisha)}
                      </p>
                    </div>
                    <div>
                      <span className="text-[11px] text-[var(--color-muted)]">
                        <LocalizedText source={"প্রস্তাবিত প্ল্যাটফর্ম মার্জিন"} area="admin" />{" "}</span>
                      <p className="font-mono font-bold tabular-nums text-[var(--color-success)]">
                        {formatPoishaToBdt(prop.projectedPlatformMarginPoisha)}{' '}
                        ({(prop.proposedCommissionBp / 100).toFixed(2)}%)
                      </p>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] text-[var(--color-muted)]">
                      <LocalizedText source={"ভেন্ডর:"} area="admin" />{" "}{localizedField(prop, "vendorNameBn", locale)} {" "}<LocalizedText source={"· কারণ:"} area="admin" />{" "}{prop.reasonBn}
                    </span>

                    {prop.status === 'pending_review' && isSuperAdmin && (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            handleResolvePriceProposal(
                              prop.proposalId,
                              'approved'
                            )
                          }
                          className="inline-flex h-8 items-center gap-1 rounded bg-[var(--color-ink)] px-3 text-xs font-bold text-[var(--color-bg)]"
                        >
                          <LocalizedText source={"অনুমোদন (Approve)"} area="admin" />{" "}</button>
                        <button
                          type="button"
                          onClick={() =>
                            handleResolvePriceProposal(
                              prop.proposalId,
                              'rejected'
                            )
                          }
                          className="inline-flex h-8 items-center gap-1 rounded border border-[var(--color-danger)] bg-[var(--color-bg)] px-3 text-xs font-bold text-[var(--color-danger)]"
                        >
                          <LocalizedText source={"প্রত্যাখ্যান (Reject)"} area="admin" />{" "}</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: MARGIN-SAFE PROMO GUARD & ESCROW MATURITY PROMOTER */}
      {activeSubTab === 'flash_and_maturity' && !isVendor && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Golden Rule Margin-Safe Promo Guard & Negative Scope Freeze */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5 lg:col-span-6">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
              <ShieldCheck className="h-4 w-4" />
              <LocalizedText source={"গোল্ডেন রুল প্রোমো গার্ড ও নেগেটিভ স্কোপ ফ্রিজ (Section 2.1 & 6.2)"} area="admin" />{" "}</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"প্ল্যাটফর্মের যেকোনো প্রোমো ডিসকাউন্ট শুধুমাত্র নিজস্ব কমিশন মার্জিন (`platformMarginPoisha`) থেকে কাটা হবে—ভেন্ডরের প্রাপ্য (`supplierPayablePoisha`) ১ পয়সাও কমবে না।"} area="admin" />{" "}</p>

            <div className="mt-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-xs">
              <p className="font-bold text-[var(--color-ink)]">
                <LocalizedText source={"Negative Scope Freeze (সক্রিয় নীতিমালা):"} area="admin" />{" "}</p>
              <ul className="mt-2 list-disc space-y-1.5 pl-4 text-[11px] text-[var(--color-muted)]">
                <li>
                  <LocalizedText source={"ফ্ল্যাশ-সেল (Flash Sale), কাউন্টডাউন টাইমার (Countdown Timer), এবং বান্ডেল/কম্বো (Bundle/Combo) অফার সম্পূর্ণ নিষিদ্ধ।"} area="admin" />{" "}</li>
                <li>
                  <LocalizedText source={"অনুমোদিত প্রোমো কোড (`EID10`, `WELCOME50`) চেকআউটের সময় লাইন-ভিত্তিক আনুপাতিক হারে শুধুমাত্র `platformMarginPoisha` থেকে কর্তন করা হয়।"} area="admin" />{" "}</li>
                <li>
                  <LocalizedText source={"কোনো পণ্যের প্ল্যাটফর্ম মার্জিনের চেয়ে বেশি ডিসকাউন্ট স্বয়ংক্রিয়ভাবে ক্যাপ (`Math.min(discount, platformMarginPoisha)`) করা হয় যাতে ভেন্ডর প্রদেয় ১০০% অক্ষুণ্ণ থাকে।"} area="admin" />{" "}</li>
              </ul>
            </div>

            <div className="mt-5 space-y-2.5 border-t border-[var(--color-border)] pt-4">
              <h4 className="text-xs font-bold text-[var(--color-ink)]">
                <LocalizedText source={"মার্জিন-সেফ প্রোমো অডিট রেকর্ড ("} area="admin" />{flashCampaigns.length})
              </h4>
              {flashCampaigns.map((fc) => (
                <div
                  key={fc.campaignId}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[var(--color-ink)]">
                      {fc.campaignCode} · {fc.publicSku}
                    </span>
                    <span className="rounded border border-[var(--color-success)] px-2 py-0.5 text-[10px] font-bold text-[var(--color-success)]">
                      <LocalizedText source={"ভেন্ডর প্রদেয় অক্ষুণ্ণ:"} area="admin" />{' '}
                      {formatPoishaToBdt(fc.supplierPayablePoisha)}
                    </span>
                  </div>
                  <p className="mt-1 font-semibold text-[var(--color-ink)]">
                    {localizedField(fc, "titleBn", locale)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--color-muted)]">
                    <LocalizedText source={"নিয়মিত মূল্য:"} area="admin" />{" "}{formatPoishaToBdt(fc.regularSalePricePoisha)}{' '}
                    <LocalizedText source={"| প্রোমো মূল্য:"} area="admin" />{" "}{formatPoishaToBdt(fc.flashSalePricePoisha)}{' '}
                    <LocalizedText source={"| অবশিষ্ট মার্জিন:"} area="admin" />{' '}
                    {formatPoishaToBdt(fc.remainingPlatformMarginPoisha)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* Right: Automated Escrow Maturity Promoter */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5 lg:col-span-6">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
              <Clock className="h-4 w-4" />
              <LocalizedText source={"অটোমেটেড ৭-দিন এসক্রো ম্যাচুরিটি প্রমোটার (Locked → Available)"} area="admin" />{" "}</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"ডেলিভারি ও রেমিট্যান্সের পর ৭-দিন হোল্ড পিরিয়ড পূর্ণ হওয়া লকড এসক্রো এন্ট্রিগুলো ১-ক্লিকে উত্তোলনযোগ্য (`Available`) বাকেটে প্রমোট করুন।"} area="admin" />{" "}</p>

            <div className="mt-4 flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={busyAction !== null}
                onClick={() => handlePromoteMaturedEscrow(false)}
                className="inline-flex h-10 items-center gap-2 rounded-md bg-[var(--color-ink)] px-4 text-xs font-bold text-[var(--color-bg)]"
              >
                <ShieldCheck className="h-4 w-4" />
                <LocalizedText source={"মেয়াদোত্তীর্ণ লকড এসক্রো প্রমোট করুন"} area="admin" />{" "}</button>

              {isSuperAdmin && (
                <button
                  type="button"
                  disabled={busyAction !== null}
                  onClick={() => handlePromoteMaturedEscrow(true)}
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 text-xs font-bold text-[var(--color-ink)] hover:bg-[var(--color-border)]"
                >
                  <LocalizedText source={"সকল লকড এন্ট্রি ফোর্স-ম্যাচিউর করুন (Admin Override)"} area="admin" />{" "}</button>
              )}
            </div>

            <div className="mt-5 space-y-2.5 border-t border-[var(--color-border)] pt-4">
              <h4 className="text-xs font-bold text-[var(--color-ink)]">
                <LocalizedText source={"এসক্রো ম্যাচুরিটি প্রমোশন ব্যাচ হিস্ট্রি ("} area="admin" />{maturityBatches.length})
              </h4>
              {maturityBatches.map((mb) => (
                <div
                  key={mb.batchId}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-[var(--color-ink)]">
                      {mb.batchId}
                    </span>
                    <span className="font-mono font-bold text-[var(--color-success)]">
                      +{formatPoishaToBdt(mb.totalPromotedPoisha)} ({mb.promotedEntriesCount} {" "}<LocalizedText source={"এন্ট্রি)"} area="admin" />{" "}</span>
                  </div>
                  <p className="mt-1 text-[11px] text-[var(--color-ink)]">
                    {mb.summaryBn}
                  </p>
                  <p className="mt-0.5 text-[10px] text-[var(--color-muted)]">
                    <LocalizedText source={"রানিং ইউজার: @"} area="admin" />{mb.executedByUsername} {" "}<LocalizedText source={"· সময়:"} area="admin" />{' '}
                    {new Date(mb.executedAt).toLocaleString('bn-BD')}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: EXECUTIVE BDT ACCOUNTING & VAT/TAX LEDGER */}
      {activeSubTab === 'executive_accounting' && accounting && (
        <div className="space-y-6">
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
              <FileSpreadsheet className="h-4 w-4" />
              <LocalizedText source={"এক্সিকিউটিভ ডাবল-এন্ট্রি বিডিটি একাউন্টিং, এসক্রো লায়াবিলিটি ও ভ্যাট লেজার"} area="admin" />{" "}</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"সকল হিসাব পূর্ণসংখ্যা পয়সায় (`1 BDT = 100 Poisha`) সংরক্ষিত। ভ্যাট (`5% / 500 bp`) শুধুমাত্র প্ল্যাটফর্মের নিট কমিশন মার্জিনের ওপর প্রযোজ্য—ভেন্ডর প্রিন্সিপালের ওপর নয়।"} area="admin" />{" "}</p>

            <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
                <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                  <LocalizedText source={"ডেলিভারিকৃত মোট গ্রস রেভিনিউ"} area="admin" />{" "}</span>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--color-ink)]">
                  {formatPoishaToBdt(
                    accounting.totalDeliveredGrossRevenuePoisha
                  )}
                </p>
              </div>

              <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
                <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                  <LocalizedText source={"নগদ প্রাপ্তি (Remitted COD + Advance)"} area="admin" />{" "}</span>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--color-success)]">
                  {formatPoishaToBdt(
                    accounting.totalCashRemittedAndAdvancePoisha
                  )}
                </p>
              </div>

              <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
                <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                  <LocalizedText source={"কুরিয়ারের কাছে বকেয়া রিসিভেবল"} area="admin" />{" "}</span>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--color-warning)]">
                  {formatPoishaToBdt(
                    accounting.totalCourierUnsettledReceivablePoisha
                  )}
                </p>
              </div>

              <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
                <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                  <LocalizedText source={"ভেন্ডর পেআউট বাবদ পরিশোধিত"} area="admin" />{" "}</span>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--color-ink)]">
                  {formatPoishaToBdt(accounting.totalVendorPaidDisbursedPoisha)}
                </p>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
                <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                  <LocalizedText source={"প্ল্যাটফর্ম গ্রস কমিশন মার্জিন"} area="admin" />{" "}</span>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--color-ink)]">
                  {formatPoishaToBdt(
                    accounting.grossPlatformCommissionEarnedPoisha
                  )}
                </p>
              </div>

              <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
                <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                  <LocalizedText source={"প্রোমো ও ফ্ল্যাশ ডিসকাউন্ট ভর্তুকি"} area="admin" />{" "}</span>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--color-danger)]">
                  -{formatPoishaToBdt(accounting.totalPromoAndFlashSubsidyPoisha)}
                </p>
              </div>

              <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
                <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                  <LocalizedText source={"কমিশন মার্জিনের ওপর ৫% ভ্যাট প্রভিশন"} area="admin" />{" "}</span>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--color-warning)]">
                  -{formatPoishaToBdt(accounting.estimatedVatOnMarginPoisha)}
                </p>
              </div>

              <div className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5">
                <span className="text-[11px] font-semibold text-[var(--color-muted)]">
                  <LocalizedText source={"নিট প্ল্যাটফর্ম রিটেইনড আর্নিংস"} area="admin" />{" "}</span>
                <p className="mt-1 font-mono text-lg font-bold tabular-nums text-[var(--color-success)]">
                  {formatPoishaToBdt(
                    accounting.netRetainedPlatformProfitPoisha
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* Payout Cashout / Send Money Fee Schedule */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5">
            <h4 className="text-sm font-bold text-[var(--color-ink)]">
              <LocalizedText source={"ভেন্ডর পেআউট ক্যাশআউট ও সেন্ড-মানি চার্জ শিডিউল (৳১০,০০০ পেআউট উদাহরণ)"} area="admin" />{" "}</h4>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)] text-[11px] font-bold text-[var(--color-ink)]">
                    <th className="p-2.5"><LocalizedText source={"পেআউট মাধ্যম (Payout Channel)"} area="admin" /></th>
                    <th className="p-2.5"><LocalizedText source={"চার্জ হার (Basis Points)"} area="admin" /></th>
                    <th className="p-2.5"><LocalizedText source={"অনুরোধকৃত পেআউট"} area="admin" /></th>
                    <th className="p-2.5"><LocalizedText source={"ক্যাশআউট / ট্রান্সফার চার্জ"} area="admin" /></th>
                    <th className="p-2.5"><LocalizedText source={"ভেন্ডর নিট প্রাপ্তি"} area="admin" /></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {accounting.payoutFeeSchedule.map((row) => (
                    <tr key={row.methodNameBn}>
                      <td className="p-2.5 font-semibold text-[var(--color-ink)]">
                        {localizedField(row, "methodNameBn", locale)}
                      </td>
                      <td className="p-2.5 font-mono text-[var(--color-ink)]">
                        {(row.feeRateBp / 100).toFixed(2)}% ({row.feeRateBp} {" "}<LocalizedText source={"bp)"} area="admin" />{" "}</td>
                      <td className="p-2.5 font-mono tabular-nums text-[var(--color-ink)]">
                        {formatPoishaToBdt(row.sample10kPayoutGrossPoisha)}
                      </td>
                      <td className="p-2.5 font-mono tabular-nums text-[var(--color-danger)]">
                        -{formatPoishaToBdt(row.sample10kFeeDeductedPoisha)}
                      </td>
                      <td className="p-2.5 font-mono font-bold tabular-nums text-[var(--color-success)]">
                        {formatPoishaToBdt(row.sample10kNetReceivedPoisha)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: MULTI-SUPPLIER PRODUCT OFFERS & MULTI-VENDOR FULFILLMENT SPLIT */}
      {activeSubTab === 'multi_supplier_and_split' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Multi-Supplier Consignment Offers */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5 lg:col-span-6">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
              <GitFork className="h-4 w-4" />
              <LocalizedText source={"মাল্টি-সাপ্লায়ার প্রোডাক্ট অফার ও অ্যালোকেশন র‍্যাংক (`supplier_product_offers`)"} area="admin" />{" "}</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"একই ভ্যারিয়েন্টে একাধিক ভেন্ডরের কনসাইনমেন্ট অফার, ৩-স্তরের পয়সা স্প্লিট (`কস্ট + লাভ = প্রদেয়`) ও স্টক অগ্রাধিকার।"} area="admin" />{" "}</p>

            <form
              onSubmit={handleUpsertSupplierOffer}
              className="mt-4 space-y-3 border-b border-[var(--color-border)] pb-4"
            >
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"প্রোডাক্ট ভ্যারিয়েন্ট"} area="admin" />{" "}</label>
                  <select
                    value={offerVariantId}
                    onChange={(e) => setOfferVariantId(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-xs text-[var(--color-ink)]"
                  >
                    {productVariants.map((v) => (
                      <option key={v.variantId} value={v.variantId}>
                        {v.publicSku} — {localizedField(v, "productNameBn", locale)} ({formatPoishaToBdt(v.salePricePoisha)})
                      </option>
                    ))}
                  </select>
                </div>

                {!isVendor && (
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-ink)]">
                      <LocalizedText source={"ভেন্ডর নির্বাচন করুন"} area="admin" />{" "}</label>
                    <select
                      value={offerVendorId}
                      onChange={(e) => setOfferVendorId(e.target.value)}
                      className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-xs text-[var(--color-ink)]"
                    >
                      <option value="00000000-0000-4000-8000-000000000901">
                        <LocalizedText source={"VND-001 — রূপগঞ্জ উইভার্স"} area="admin" />{" "}</option>
                      <option value="00000000-0000-4000-8000-000000000902">
                        <LocalizedText source={"VND-002 — হাজারীবাগ লেদার ক্রাফট"} area="admin" />{" "}</option>
                      <option value="00000000-0000-4000-8000-000000000903">
                        <LocalizedText source={"VND-003 — সুন্দরবন অর্গানিকস"} area="admin" />{" "}</option>
                    </select>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"ইন্টারনাল SKU"} area="admin" />{" "}</label>
                  <input
                    type="text"
                    value={offerInternalSku}
                    onChange={(e) => setOfferInternalSku(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"সাপ্লায়ার কস্ট (৳)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min={10}
                    value={offerCostBdt}
                    onChange={(e) => setOfferCostBdt(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"সাপ্লায়ার প্রফিট (৳)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min={0}
                    value={offerProfitBdt}
                    onChange={(e) => setOfferProfitBdt(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"র‍্যাংক (1=প্রথম)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={offerPriorityRank}
                    onChange={(e) => setOfferPriorityRank(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"অফার স্টক (পিস)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min={0}
                    value={offerStockAvailable}
                    onChange={(e) => setOfferStockAvailable(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busyAction === 'upsert-offer'}
                className="inline-flex h-9 w-full items-center justify-center gap-2 rounded bg-[var(--color-ink)] px-3 text-xs font-bold text-[var(--color-bg)]"
              >
                <LocalizedText source={"সাপ্লায়ার কনসাইনমেন্ট অফার সংরক্ষণ করুন"} area="admin" />{" "}</button>
            </form>

            <div className="mt-4 space-y-2.5">
              {supplierOffers.map((offer) => (
                <div
                  key={offer.offerId}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[var(--color-ink)]">
                      <LocalizedText source={"Rank #"} area="admin" />{offer.priorityRank} · {offer.publicSku} ·{' '}
                      {offer.vendorCode}
                    </span>
                    <span className="rounded border border-[var(--color-success)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--color-success)]">
                      <LocalizedText source={"স্টক:"} area="admin" />{" "}{offer.stockAvailable} {" "}<LocalizedText source={"পিস · প্রদেয়:"} area="admin" />{' '}
                      {formatPoishaToBdt(offer.supplierPayablePoisha)}
                    </span>
                  </div>
                  <p className="mt-1 font-semibold text-[var(--color-ink)]">
                    {localizedField(offer, "productNameBn", locale)} ({localizedField(offer, "variantTitleBn", locale)}) —{' '}
                    {localizedField(offer, "vendorNameBn", locale)}
                  </p>
                  {!isVendor && (
                    <p className="mt-1 font-mono text-[11px] text-[var(--color-muted)]">
                      <LocalizedText source={"কস্ট:"} area="admin" />{" "}{formatPoishaToBdt(offer.supplierCostPoisha)} {" "}<LocalizedText source={"+ লাভ:"} area="admin" />{' '}
                      {formatPoishaToBdt(offer.supplierProfitPoisha)} {" "}<LocalizedText source={"= প্রদেয়:"} area="admin" />{' '}
                      {formatPoishaToBdt(offer.supplierPayablePoisha)} {" "}<LocalizedText source={"| মার্জিন:"} area="admin" />{' '}
                      {formatPoishaToBdt(offer.platformMarginPoisha)} {" "}<LocalizedText source={"| বিক্রয়:"} area="admin" />{' '}
                      {formatPoishaToBdt(offer.salePricePoisha)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Multi-Vendor Order Fulfillment Group Split Engine */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5 lg:col-span-6">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
              <Layers className="h-4 w-4" />
              <LocalizedText source={"মাল্টি-ভেন্ডর ফুলফিলমেন্ট গ্রুপ স্প্লিট ইঞ্জিন (`VFG-...`)"} area="admin" />{" "}</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"একটি অর্ডারে একাধিক ভেন্ডরের পণ্য থাকলে সাপ্লায়ার অফার অনুযায়ী স্বয়ংক্রিয়ভাবে ভেন্ডর-ভিত্তিক ফুলফিলমেন্ট সাব-অর্ডারে বিভক্ত করুন।"} area="admin" />{" "}</p>

            {!isVendor && (
              <form
                onSubmit={handleSplitOrderFulfillment}
                className="mt-4 grid grid-cols-1 gap-2.5 border-b border-[var(--color-border)] pb-4 sm:grid-cols-3"
              >
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"অর্ডার নম্বর"} area="admin" />{" "}</label>
                  <input
                    type="text"
                    value={splitOrderNo}
                    onChange={(e) => setSplitOrderNo(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"অ্যালোকেশন পলিসি"} area="admin" />{" "}</label>
                  <select
                    value={splitStrategy}
                    onChange={(e) =>
                      setSplitStrategy(
                        e.target.value as
                          | 'priority_rank'
                          | 'lowest_payable_highest_margin'
                          | 'highest_stock'
                      )
                    }
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs text-[var(--color-ink)]"
                  >
                    <option value="priority_rank"><LocalizedText source={"Priority Rank #1"} area="admin" /></option>
                    <option value="lowest_payable_highest_margin">
                      <LocalizedText source={"সর্বোচ্চ প্ল্যাটফর্ম মার্জিন"} area="admin" />{" "}</option>
                    <option value="highest_stock"><LocalizedText source={"সর্বোচ্চ স্টক ভেন্ডর"} area="admin" /></option>
                  </select>
                </div>
                <div className="flex items-end">
                  <button
                    type="submit"
                    disabled={busyAction === 'split-order'}
                    className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded bg-[var(--color-ink)] px-3 text-xs font-bold text-[var(--color-bg)]"
                  >
                    <LocalizedText source={"অর্ডার স্প্লিট করুন"} area="admin" />{" "}</button>
                </div>
              </form>
            )}

            <div className="mt-4 space-y-2.5">
              {fulfillmentGroups.map((fg) => (
                <div
                  key={fg.groupId}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[var(--color-ink)]">
                      {fg.groupCode} {" "}<LocalizedText source={"· অর্ডার:"} area="admin" />{" "}{fg.orderNo}
                    </span>
                    <span className="rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 py-0.5 font-mono text-[10px] font-bold text-[var(--color-ink)]">
                      {fg.vendorCode} · {fg.fulfillmentStatus.toUpperCase()} · {fg.totalUnits} {" "}<LocalizedText source={"পিস"} area="admin" />{" "}</span>
                  </div>
                  <p className="mt-1 font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"ভেন্ডর:"} area="admin" />{" "}{localizedField(fg, "vendorNameBn", locale)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-[var(--color-muted)]">
                    <LocalizedText source={"ভেন্ডর প্রদেয়:"} area="admin" />{' '}
                    {formatPoishaToBdt(fg.groupSupplierPayablePoisha)} {" "}<LocalizedText source={"| সাবটোটাল:"} area="admin" />{' '}
                    {formatPoishaToBdt(fg.groupSaleSubtotalPoisha)}
                    {!isVendor && (
                      <>
                        {' '}
                        <LocalizedText source={"| প্ল্যাটফর্ম মার্জিন:"} area="admin" />{' '}
                        {formatPoishaToBdt(fg.groupPlatformMarginPoisha)}
                      </>
                    )}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: MAKER-CHECKER LEDGER REVERSALS & CUSTOMER REFUNDS */}
      {activeSubTab === 'maker_checker_reversals' && !isVendor && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left: Maker-Checker Ledger Reversal Request & Approval */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5 lg:col-span-6">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
              <RotateCcw className="h-4 w-4" />
              <LocalizedText source={"মেকার-চেকার ডাবল-এন্ট্রি লেজার রিভার্সাল ও জরুরি ওভাররাইড (`REV-...`)"} area="admin" />{" "}</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"পোস্টকৃত লেজার এন্ট্রি কখনো সরাসরি ডিলিট বা এডিট হয় না; বিপরীত ডেবিট-ক্রেডিট রিভার্সাল (`Maker !== Checker`) পোস্ট করতে হয়।"} area="admin" />{" "}</p>

            <form
              onSubmit={handleCreateLedgerReversal}
              className="mt-4 space-y-2.5 border-b border-[var(--color-border)] pb-4"
            >
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"মূল লেজার এন্ট্রি আইডি (`originalLedgerEntryId`)"} area="admin" />{" "}</label>
                  <input
                    type="text"
                    value={revOriginalEntryId}
                    onChange={(e) => setRevOriginalEntryId(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"সংশোধিত ক্রেডিট অংক (টাকা)"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    min={0}
                    value={revAmountBdt}
                    onChange={(e) => setRevAmountBdt(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 font-mono text-xs text-[var(--color-ink)]"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                  <LocalizedText source={"রিভার্সালের কারণ (Audit Reason)"} area="admin" />{" "}</label>
                <input
                  type="text"
                  value={revReasonBn}
                  onChange={(e) => setRevReasonBn(e.target.value)}
                  className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-xs text-[var(--color-ink)]"
                />
              </div>
              <button
                type="submit"
                disabled={busyAction === 'create-reversal'}
                className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded bg-[var(--color-ink)] px-3 text-xs font-bold text-[var(--color-bg)]"
              >
                <LocalizedText source={"মেকার হিসেবে রিভার্সাল অনুরোধ জমা দিন"} area="admin" />{" "}</button>
            </form>

            {isSuperAdmin && (
              <div className="mt-3 flex items-center justify-between gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-xs">
                <span className="font-semibold text-[var(--color-ink)]">
                  <LocalizedText source={"সুপার অ্যাডমিন ২এফএ ইমার্জেন্সি ওভাররাইড কোড (Self-Approval Guard):"} area="admin" />{" "}</span>
                <input
                  type="text"
                  maxLength={6}
                  value={emergencyTotpInput}
                  onChange={(e) => setEmergencyTotpInput(e.target.value)}
                  className="h-7 w-24 rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-center font-mono text-xs font-bold text-[var(--color-ink)]"
                />
              </div>
            )}

            <div className="mt-3 space-y-2.5">
              {ledgerReversals.map((rev) => (
                <div
                  key={rev.reversalId}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[var(--color-ink)]">
                      {rev.reversalCode} {" "}<LocalizedText source={"· অর্ডার:"} area="admin" />{" "}{rev.orderNo ?? 'N/A'} {" "}<LocalizedText source={"(মূল:"} area="admin" />{' '}
                      {rev.originalLedgerEntryId})
                    </span>
                    <span className="font-mono font-bold text-[var(--color-danger)]">
                      {formatPoishaToBdt(rev.originalAmountPoisha)} →{' '}
                      {formatPoishaToBdt(rev.correctedCreditPoisha)} [
                      {rev.status.toUpperCase()}]
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-[var(--color-muted)]">
                    <LocalizedText source={"DR:"} area="admin" />{" "}{formatPoishaToBdt(rev.reversalDebitPoisha)} {" "}<LocalizedText source={"/ CR:"} area="admin" />{' '}
                    {formatPoishaToBdt(rev.reversalCreditPoisha)} {" "}<LocalizedText source={"· Maker: @"} area="admin" />{" "}{rev.createdByUsername}
                    {rev.approvedByUsername
                      ? ` · Checker: @${rev.approvedByUsername}`
                      : ''}
                  </p>
                  <p className="mt-1 text-[11px] text-[var(--color-ink)]">
                    <LocalizedText source={"কারণ:"} area="admin" />{" "}{rev.reasonBn}
                  </p>
                  {rev.status === 'pending_checker_approval' && isSuperAdmin && (
                    <div className="mt-2.5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleResolveLedgerReversal(rev.reversalId, 'approve')
                        }
                        className="inline-flex h-8 items-center gap-1 rounded bg-[var(--color-ink)] px-3 text-xs font-bold text-[var(--color-bg)]"
                      >
                        <LocalizedText source={"চেকার অনুমোদন ও রিভার্সাল পোস্ট করুন"} area="admin" />{" "}</button>
                      <button
                        type="button"
                        onClick={() =>
                          handleResolveLedgerReversal(rev.reversalId, 'reject')
                        }
                        className="inline-flex h-8 items-center gap-1 rounded border border-[var(--color-danger)] px-3 text-xs font-bold text-[var(--color-danger)]"
                      >
                        <LocalizedText source={"বাতিল"} area="admin" />{" "}</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Right: Customer Refund Execution Workflow */}
          <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-5 lg:col-span-6">
            <h3 className="flex items-center gap-2 text-sm font-bold text-[var(--color-ink)]">
              <ShieldCheck className="h-4 w-4" />
              <LocalizedText source={"গ্রাহক রিফান্ড এক্সিকিউশন ও ডাবল-এন্ট্রি ভাউচার (`REF-...`)"} area="admin" />{" "}</h3>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              <LocalizedText source={"অর্ডার বাতিল বা রিটার্নের পর ম্যানুয়াল বিকাশ বা ব্যাংক ট্রান্সফারে গ্রাহককে অর্থ ফেরত দিলে ব্যালেন্সড রিফান্ড ভাউচার ও পেমেন্ট স্ট্যাটাস আপডেট হবে।"} area="admin" />{" "}</p>

            {isSuperAdmin && (
              <form
                onSubmit={handleExecuteCustomerRefund}
                className="mt-4 space-y-2.5 border-b border-[var(--color-border)] pb-4"
              >
                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                      <LocalizedText source={"অর্ডার নম্বর"} area="admin" />{" "}</label>
                    <input
                      type="text"
                      value={refundOrderNo}
                      onChange={(e) => setRefundOrderNo(e.target.value)}
                      className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 font-mono text-xs text-[var(--color-ink)]"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                      <LocalizedText source={"রিফান্ড পরিমাণ (টাকা)"} area="admin" />{" "}</label>
                    <input
                      type="number"
                      min={10}
                      value={refundAmountBdt}
                      onChange={(e) => setRefundAmountBdt(e.target.value)}
                      className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 font-mono text-xs text-[var(--color-ink)]"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                      <LocalizedText source={"রিফান্ড মাধ্যম"} area="admin" />{" "}</label>
                    <select
                      value={refundChannel}
                      onChange={(e) =>
                        setRefundChannel(
                          e.target.value as 'bkash_manual' | 'bank_transfer'
                        )
                      }
                      className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2 text-xs text-[var(--color-ink)]"
                    >
                      <option value="bkash_manual">
                        <LocalizedText source={"ম্যানুয়াল বিকাশ রিফান্ড (bKash Manual)"} area="admin" />{" "}</option>
                      <option value="bank_transfer"><LocalizedText source={"ব্যাংক ট্রান্সফার"} area="admin" /></option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                      <LocalizedText source={"রিফান্ড TrxID / ভাউচার রেফ"} area="admin" />{" "}</label>
                    <input
                      type="text"
                      value={refundTrxRef}
                      onChange={(e) => setRefundTrxRef(e.target.value)}
                      className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 font-mono text-xs text-[var(--color-ink)]"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-[var(--color-ink)]">
                    <LocalizedText source={"রিফান্ড কারণ"} area="admin" />{" "}</label>
                  <input
                    type="text"
                    value={refundReasonBn}
                    onChange={(e) => setRefundReasonBn(e.target.value)}
                    className="mt-1 h-9 w-full rounded border border-[var(--color-border)] bg-[var(--color-bg)] px-2.5 text-xs text-[var(--color-ink)]"
                  />
                </div>

                <button
                  type="submit"
                  disabled={busyAction === 'execute-refund'}
                  className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded bg-[var(--color-ink)] px-3 text-xs font-bold text-[var(--color-bg)]"
                >
                  <LocalizedText source={"গ্রাহক রিফান্ড কার্যকর ও লেজার পোস্ট করুন"} area="admin" />{" "}</button>
              </form>
            )}

            <div className="mt-3 space-y-2.5">
              {customerRefunds.map((rf) => (
                <div
                  key={rf.refundId}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] p-3 text-xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-mono font-bold text-[var(--color-ink)]">
                      {rf.refundCode} {" "}<LocalizedText source={"· অর্ডার:"} area="admin" />{" "}{rf.orderNo} ({rf.customerName})
                    </span>
                    <span className="font-mono font-bold text-[var(--color-success)]">
                      {formatPoishaToBdt(rf.refundAmountPoisha)} [
                      {rf.status.toUpperCase()}]
                    </span>
                  </div>
                  <p className="mt-1 font-mono text-[11px] text-[var(--color-muted)]">
                    <LocalizedText source={"চ্যানেল:"} area="admin" />{" "}{rf.refundChannel} {" "}<LocalizedText source={"· TrxID:"} area="admin" />{" "}{rf.refundTrxId} {" "}<LocalizedText source={"· নির্বাহী: @"} area="admin" />{rf.approvedByUsername ?? rf.requestedByUsername}
                  </p>
                  <p className="mt-0.5 text-[11px] text-[var(--color-ink)]">
                    <LocalizedText source={"কারণ:"} area="admin" />{" "}{rf.reasonBn}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
