'use client';

import * as React from 'react';
import {
  Banknote,
  CheckCircle2,
  Clock,
  Edit3,
  ExternalLink,
  FileCheck2,
  MapPin,
  PackageCheck,
  PlusCircle,
  Search,
  Truck,
} from 'lucide-react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import type {
  CourierClaimRecord,
  CourierRemittanceLedgerRecord,
  DistrictRateOverrideRecord,
  ManualCourierAccountsSummary,
  ManualCourierParcelRecord,
  ManualParcelStatus,
  PickupBatchRecord,
} from '@/lib/admin/phase4b-service';
import type { CourierProvider } from '@/types/database.types';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { cn } from '@/lib/utils';
import { Badge, Button, Card, InfoTooltip } from '../ui/primitives';
import { courierStage, validPoisha, type CourierOrder } from './courier-receivables';

type ActiveCourierProvider = Exclude<CourierProvider, 'redx'>;

const ACTIVE_PROVIDERS: ActiveCourierProvider[] = ['steadfast', 'pathao', 'bd_post', 'manual'];

const PARCEL_STATUS_LABELS: Record<
  ManualParcelStatus,
  { bn: string; en: string; tone: 'info' | 'warning' | 'success' | 'danger' | 'neutral' }
> = {
  dispatched: { bn: 'ডিসপ্যাচড / পাঠানো হয়েছে', en: 'Dispatched', tone: 'info' },
  in_transit: { bn: 'পথে আছে (In-Transit)', en: 'In Transit', tone: 'warning' },
  delivered: { bn: 'ডেলিভারি সম্পন্ন', en: 'Delivered', tone: 'success' },
  returned: { bn: 'রিটার্ন হয়েছে', en: 'Returned', tone: 'danger' },
  settled: { bn: 'হিসাব নিষ্পন্ন (Settled)', en: 'Settled', tone: 'success' },
};

const inputCls =
  'w-full min-h-[44px] px-3 py-2 text-sm bg-bg text-ink border border-border rounded-[var(--radius-md)] focus:outline-2 focus:outline-offset-0 focus:outline-ink';

function providerLabel(provider: string, bn: boolean): string {
  if (provider === 'steadfast') return 'Steadfast';
  if (provider === 'pathao') return 'Pathao';
  if (provider === 'bd_post') return bn ? 'বাংলাদেশ ডাক বিভাগ' : 'Bangladesh Post';
  if (provider === 'redx') return bn ? 'RedX (পুরোনো রেকর্ড)' : 'RedX (Historical)';
  if (provider === 'manual' || provider === 'unassigned') {
    return bn ? 'ম্যানুয়াল / নিজস্ব রাইডার' : 'Manual / Own Rider';
  }
  return provider;
}

function safeDateTime(value: string | null | undefined, bn: boolean): string {
  if (!value) return '—';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '—';
  return date.toLocaleString(bn ? 'bn-BD' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDatetimeLocalValue(iso?: string | null): string {
  const date = iso && Number.isFinite(Date.parse(iso)) ? new Date(iso) : new Date();
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function parseTakaToPoisha(value: string): number {
  const num = Number(value);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

function isSafeProofUrl(url: string): boolean {
  const trimmed = url.trim();
  return !trimmed || trimmed.startsWith('https://') || trimmed.startsWith('http://') || trimmed.startsWith('/');
}

export interface CourierReceivablesPanelProps {
  locale: 'bn' | 'en';
  orders: CourierOrder[];
  ledger: CourierRemittanceLedgerRecord[];
  claims: CourierClaimRecord[];
  batches: PickupBatchRecord[];
  manualCourierParcels?: ManualCourierParcelRecord[];
  courierAccountsSummary?: ManualCourierAccountsSummary | null;
  districtRates?: DistrictRateOverrideRecord[];
  onRefreshWorkspace?: () => Promise<void>;
}

export function CourierReceivablesPanel({
  locale,
  orders,
  ledger,
  claims,
  batches,
  manualCourierParcels = [],
  courierAccountsSummary = null,
  districtRates = [],
  onRefreshWorkspace,
}: CourierReceivablesPanelProps) {
  const bn = locale === 'bn';
  const t = React.useCallback((bnText: string, enText: string) => (bn ? bnText : enText), [bn]);
  const money = (value: unknown) =>
    validPoisha(value) ? formatPoishaToBdt(value, locale) : t('তথ্য অসম্পূর্ণ', 'Incomplete');

  const [selectedProvider, setSelectedProvider] = React.useState<string>('all');
  const [stageFilter, setStageFilter] = React.useState<string>('all');
  const [search, setSearch] = React.useState('');
  const [entryMode, setEntryMode] = React.useState<'none' | 'parcel' | 'remittance'>('none');
  const [saving, setSaving] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Parcel Form State (Order-Linked or Standalone)
  const [editingParcelId, setEditingParcelId] = React.useState<string | undefined>(undefined);
  const [parcelStandalone, setParcelStandalone] = React.useState(false);
  const [parcelOrderNo, setParcelOrderNo] = React.useState<string>(orders[0]?.orderNo ?? '');
  const [parcelProvider, setParcelProvider] = React.useState<ActiveCourierProvider>('steadfast');
  const [parcelDeliveryMethod, setParcelDeliveryMethod] = React.useState('হোম ডেলিভারি (COD)');
  const [parcelConsignmentId, setParcelConsignmentId] = React.useState('');
  const [parcelTrackingCode, setParcelTrackingCode] = React.useState('');
  const [parcelDistrictId, setParcelDistrictId] = React.useState<number>(orders[0]?.districtId ?? 47);
  const [parcelUpazilaName, setParcelUpazilaName] = React.useState(orders[0]?.upazilaNameBn ?? '');
  const [parcelAddress, setParcelAddress] = React.useState(orders[0]?.streetAddress ?? '');
  const [parcelDispatchedAt, setParcelDispatchedAt] = React.useState(() => toDatetimeLocalValue());
  const [parcelDeliveredAt, setParcelDeliveredAt] = React.useState('');
  const [parcelStatus, setParcelStatus] = React.useState<ManualParcelStatus>('dispatched');
  const [parcelCodTaka, setParcelCodTaka] = React.useState(
    String(((orders[0]?.codCollectablePoisha ?? 0) / 100) || 0)
  );
  const [parcelChargeTaka, setParcelChargeTaka] = React.useState('60');
  const [parcelRiderName, setParcelRiderName] = React.useState('');
  const [parcelRiderPhone, setParcelRiderPhone] = React.useState('');
  const [parcelProofRef, setParcelProofRef] = React.useState('');
  const [parcelProofUrl, setParcelProofUrl] = React.useState('');
  const [parcelNote, setParcelNote] = React.useState('');

  // Remittance Form State (Parcel/Order-Linked or Standalone)
  const [remitStandalone, setRemitStandalone] = React.useState(false);
  const [remitProvider, setRemitProvider] = React.useState<ActiveCourierProvider>('steadfast');
  const [remitParcelId, setRemitParcelId] = React.useState('');
  const [remitOrderNo, setRemitOrderNo] = React.useState('');
  const [remitConsignmentId, setRemitConsignmentId] = React.useState('');
  const [remitRef, setRemitRef] = React.useState('');
  const [remitChannel, setRemitChannel] = React.useState('ব্যাংক ট্রান্সফার (Bank Transfer)');
  const [remitExpectedCodTaka, setRemitExpectedCodTaka] = React.useState('0');
  const [remitFeeTaka, setRemitFeeTaka] = React.useState('60');
  const [remitAdjTaka, setRemitAdjTaka] = React.useState('0');
  const [remitReceivedTaka, setRemitReceivedTaka] = React.useState('0');
  const [remitSettledAt, setRemitSettledAt] = React.useState(() => toDatetimeLocalValue());
  const [remitProofUrl, setRemitProofUrl] = React.useState('');
  const [remitNote, setRemitNote] = React.useState('');

  const applyOrderDefaultsToParcelForm = (orderNoVal: string) => {
    setParcelOrderNo(orderNoVal);
    const ord = orders.find((o) => o.orderNo === orderNoVal);
    if (!ord) return;
    const prov = ord.courierProvider;
    if (prov === 'steadfast' || prov === 'pathao' || prov === 'bd_post' || prov === 'manual') {
      setParcelProvider(prov);
    }
    setParcelConsignmentId(ord.consignmentId ?? '');
    setParcelTrackingCode(ord.trackingCode ?? '');
    if (ord.districtId) setParcelDistrictId(ord.districtId);
    setParcelUpazilaName(ord.upazilaNameBn ?? '');
    setParcelAddress(ord.streetAddress ?? '');
    setParcelCodTaka(String((ord.codCollectablePoisha ?? 0) / 100));
    if (ord.status === 'delivered') {
      const existingParcel = manualCourierParcels.find((p) => p.orderNo === ord.orderNo);
      setParcelStatus('delivered');
      setParcelDeliveredAt(toDatetimeLocalValue(existingParcel?.deliveredAt));
    } else if (ord.status === 'out_for_delivery') {
      setParcelStatus('in_transit');
    } else if (ord.status === 'returned') {
      setParcelStatus('returned');
    } else {
      setParcelStatus('dispatched');
    }
  };

  const openParcelEditor = (parcel?: ManualCourierParcelRecord, prefillOrderNo?: string) => {
    setFeedback(null);
    if (parcel) {
      setEditingParcelId(parcel.parcelId);
      setParcelStandalone(parcel.isStandalone);
      setParcelOrderNo(parcel.orderNo ?? '');
      setParcelProvider(
        parcel.courierProvider === 'redx' ? 'manual' : parcel.courierProvider
      );
      setParcelDeliveryMethod(parcel.deliveryMethodBn);
      setParcelConsignmentId(parcel.consignmentId);
      setParcelTrackingCode(parcel.trackingCode);
      setParcelDistrictId(parcel.districtId ?? 47);
      setParcelUpazilaName(parcel.upazilaNameBn);
      setParcelAddress(parcel.destinationAddressBn);
      setParcelDispatchedAt(toDatetimeLocalValue(parcel.dispatchedAt));
      setParcelDeliveredAt(parcel.deliveredAt ? toDatetimeLocalValue(parcel.deliveredAt) : '');
      setParcelStatus(parcel.status);
      setParcelCodTaka(String(parcel.collectableCodPoisha / 100));
      setParcelChargeTaka(String(parcel.courierChargePoisha / 100));
      setParcelRiderName(parcel.riderName ?? '');
      setParcelRiderPhone(parcel.riderPhone ?? '');
      setParcelProofRef(parcel.proofRef ?? '');
      setParcelProofUrl(parcel.proofUrl ?? '');
      setParcelNote(parcel.noteBn ?? '');
    } else {
      setEditingParcelId(undefined);
      setParcelStandalone(!prefillOrderNo && orders.length === 0);
      if (prefillOrderNo) {
        applyOrderDefaultsToParcelForm(prefillOrderNo);
      } else if (orders[0]?.orderNo) {
        applyOrderDefaultsToParcelForm(orders[0].orderNo);
      }
      setParcelDispatchedAt(toDatetimeLocalValue());
      setParcelDeliveredAt('');
      setParcelProofRef('');
      setParcelProofUrl('');
      setParcelNote('');
    }
    setEntryMode('parcel');
  };

  const openRemittanceForParcelOrOrder = (params: {
    parcelId?: string;
    orderNo?: string | null;
    courierProvider?: CourierProvider | null;
    consignmentId?: string | null;
    expectedCodPoisha?: number;
    feePoisha?: number;
  }) => {
    setFeedback(null);
    const prov =
      params.courierProvider && params.courierProvider !== 'redx'
        ? params.courierProvider
        : 'steadfast';
    const expected = params.expectedCodPoisha ?? 0;
    const fee = params.feePoisha ?? 6000;
    const net = Math.max(0, expected - fee);
    setRemitStandalone(!params.parcelId && !params.orderNo);
    setRemitProvider(prov);
    setRemitParcelId(params.parcelId ?? '');
    setRemitOrderNo(params.orderNo ?? '');
    setRemitConsignmentId(params.consignmentId ?? '');
    setRemitExpectedCodTaka(String(expected / 100));
    setRemitFeeTaka(String(fee / 100));
    setRemitAdjTaka('0');
    setRemitReceivedTaka(String(net / 100));
    setRemitSettledAt(toDatetimeLocalValue());
    setRemitRef('');
    setRemitProofUrl('');
    setRemitNote('');
    setEntryMode('remittance');
  };

  const handleSaveParcel = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!isSafeProofUrl(parcelProofUrl)) {
      setFeedback({
        type: 'error',
        text: t('প্রুফ লিংক অবশ্যই https://, http:// অথবা / দিয়ে শুরু হতে হবে।', 'Proof URL must start with https://, http://, or /.'),
      });
      return;
    }
    const dist = districtRates.find((d) => d.districtId === parcelDistrictId);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'upsert_manual_courier_parcel',
          parcelId: editingParcelId,
          isStandalone: parcelStandalone,
          orderNo: parcelStandalone ? null : parcelOrderNo || null,
          courierProvider: parcelProvider,
          deliveryMethodBn: parcelDeliveryMethod,
          consignmentId: parcelConsignmentId || undefined,
          trackingCode: parcelTrackingCode || undefined,
          districtId: parcelDistrictId || null,
          districtNameBn: dist?.districtNameBn,
          upazilaNameBn: parcelUpazilaName,
          destinationAddressBn: parcelAddress || dist?.districtNameBn || 'বাংলাদেশ',
          dispatchedAt: parcelDispatchedAt ? new Date(parcelDispatchedAt).toISOString() : undefined,
          deliveredAt: parcelDeliveredAt ? new Date(parcelDeliveredAt).toISOString() : null,
          collectableCodPoisha: parseTakaToPoisha(parcelCodTaka),
          courierChargePoisha: parseTakaToPoisha(parcelChargeTaka),
          riderName: parcelRiderName || null,
          riderPhone: parcelRiderPhone || null,
          status: parcelStatus,
          proofRef: parcelProofRef || null,
          proofUrl: parcelProofUrl || null,
          noteBn: parcelNote,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        errorBn?: string;
        parcel?: ManualCourierParcelRecord;
      };
      if (!res.ok || !data.success) {
        setFeedback({
          type: 'error',
          text: data.errorBn ?? t('পার্সেল তথ্য সংরক্ষণ করা যায়নি।', 'Could not save courier parcel.'),
        });
        return;
      }
      setFeedback({
        type: 'success',
        text: t(
          `পার্সেল ${data.parcel?.parcelId ?? ''} সফলভাবে সংরক্ষণ হয়েছে${!parcelStandalone && parcelOrderNo ? ` এবং অর্ডার ${parcelOrderNo} ও ভেন্ডর এসক্রো সিঙ্ক হয়েছে` : ''}।`,
          `Parcel ${data.parcel?.parcelId ?? ''} saved${!parcelStandalone && parcelOrderNo ? ` and synced with order ${parcelOrderNo} & vendor escrow` : ''}.`
        ),
      });
      setEntryMode('none');
      setEditingParcelId(undefined);
      await onRefreshWorkspace?.();
    } catch {
      setFeedback({ type: 'error', text: t('নেটওয়ার্ক ত্রুটি।', 'Network error.') });
    } finally {
      setSaving(false);
    }
  };

  const handleQuickParcelStatus = async (
    parcel: ManualCourierParcelRecord,
    nextStatus: ManualParcelStatus
  ) => {
    setFeedback(null);
    setSaving(true);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'upsert_manual_courier_parcel',
          parcelId: parcel.parcelId,
          isStandalone: parcel.isStandalone,
          orderNo: parcel.orderNo,
          courierProvider: parcel.courierProvider === 'redx' ? 'manual' : parcel.courierProvider,
          deliveryMethodBn: parcel.deliveryMethodBn,
          consignmentId: parcel.consignmentId,
          trackingCode: parcel.trackingCode,
          districtId: parcel.districtId,
          districtNameBn: parcel.districtNameBn,
          upazilaNameBn: parcel.upazilaNameBn,
          destinationAddressBn: parcel.destinationAddressBn,
          dispatchedAt: parcel.dispatchedAt,
          deliveredAt:
            nextStatus === 'delivered' || nextStatus === 'settled'
              ? parcel.deliveredAt ?? new Date().toISOString()
              : parcel.deliveredAt,
          collectableCodPoisha: parcel.collectableCodPoisha,
          courierChargePoisha: parcel.courierChargePoisha,
          riderName: parcel.riderName,
          riderPhone: parcel.riderPhone,
          status: nextStatus,
          proofRef: parcel.proofRef,
          proofUrl: parcel.proofUrl,
          noteBn: parcel.noteBn,
        }),
      });
      const data = (await res.json()) as { success?: boolean; errorBn?: string };
      if (!res.ok || !data.success) {
        setFeedback({ type: 'error', text: data.errorBn ?? t('স্ট্যাটাস আপডেট হয়নি।', 'Update failed.') });
        return;
      }
      setFeedback({
        type: 'success',
        text: t(
          `পার্সেল ${parcel.parcelId}-এর অবস্থা "${PARCEL_STATUS_LABELS[nextStatus].bn}" করা হয়েছে।`,
          `Parcel ${parcel.parcelId} updated to ${PARCEL_STATUS_LABELS[nextStatus].en}.`
        ),
      });
      await onRefreshWorkspace?.();
    } finally {
      setSaving(false);
    }
  };

  const handleSaveRemittance = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    if (!isSafeProofUrl(remitProofUrl)) {
      setFeedback({
        type: 'error',
        text: t('প্রুফ লিংক অবশ্যই https://, http:// অথবা / দিয়ে শুরু হতে হবে।', 'Proof URL must start with https://, http://, or /.'),
      });
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'record_manual_courier_remittance',
          isStandalone: remitStandalone,
          parcelId: remitStandalone ? null : remitParcelId || null,
          orderNo: remitStandalone ? null : remitOrderNo || null,
          courierProvider: remitProvider,
          consignmentId: remitConsignmentId || undefined,
          settlementRef: remitRef,
          paymentChannelBn: remitChannel,
          expectedCodPoisha: parseTakaToPoisha(remitExpectedCodTaka),
          courierFeeDeductedPoisha: parseTakaToPoisha(remitFeeTaka),
          adjustmentPoisha: parseTakaToPoisha(remitAdjTaka),
          remittedAmountPoisha: parseTakaToPoisha(remitReceivedTaka),
          settledAt: remitSettledAt ? new Date(remitSettledAt).toISOString() : undefined,
          proofUrl: remitProofUrl || null,
          noteBn: remitNote,
        }),
      });
      const data = (await res.json()) as { success?: boolean; errorBn?: string };
      if (!res.ok || !data.success) {
        setFeedback({
          type: 'error',
          text: data.errorBn ?? t('কুরিয়ার পেমেন্ট রেকর্ড করা যায়নি।', 'Could not save courier remittance.'),
        });
        return;
      }
      setFeedback({
        type: 'success',
        text: t(
          `কুরিয়ার পেমেন্ট গ্রহণ (Ref: ${remitRef}) সফলভাবে লেজারে সংরক্ষণ করা হয়েছে।`,
          `Courier remittance (Ref: ${remitRef}) recorded in ledger.`
        ),
      });
      setEntryMode('none');
      await onRefreshWorkspace?.();
    } catch {
      setFeedback({ type: 'error', text: t('নেটওয়ার্ক ত্রুটি।', 'Network error.') });
    } finally {
      setSaving(false);
    }
  };

  // Remittance live calculation
  const remitExpectedPoisha = parseTakaToPoisha(remitExpectedCodTaka);
  const remitFeePoisha = parseTakaToPoisha(remitFeeTaka);
  const remitAdjPoisha = parseTakaToPoisha(remitAdjTaka);
  const remitReceivedPoisha = parseTakaToPoisha(remitReceivedTaka);
  const remitNetExpectedPoisha = Math.max(0, remitExpectedPoisha - remitFeePoisha - remitAdjPoisha);
  const remitShortPoisha = remitExpectedPoisha > 0 ? Math.max(0, remitNetExpectedPoisha - remitReceivedPoisha) : 0;

  // Filtered manual parcels + unlinked orders
  const needle = search.trim().toLowerCase();
  const parcelOrderKeys = new Set(
    manualCourierParcels.filter((p) => p.orderNo).map((p) => p.orderNo!.trim().toUpperCase())
  );
  const filteredParcels = manualCourierParcels.filter((p) => {
    if (selectedProvider !== 'all' && p.courierProvider !== selectedProvider) return false;
    if (stageFilter !== 'all') {
      if (stageFilter === 'delivered' && p.status !== 'delivered' && p.status !== 'settled') return false;
      if (stageFilter === 'transit' && p.status !== 'dispatched' && p.status !== 'in_transit') return false;
      if (stageFilter === 'returned' && p.status !== 'returned') return false;
    }
    if (!needle) return true;
    return [
      p.parcelId,
      p.orderNo ?? '',
      p.consignmentId,
      p.trackingCode,
      p.districtNameBn,
      p.upazilaNameBn,
      p.destinationAddressBn,
      p.proofRef ?? '',
      p.noteBn,
    ]
      .join(' ')
      .toLowerCase()
      .includes(needle);
  });

  const unlinkedOrders = orders.filter((o) => {
    if (o.orderNo && parcelOrderKeys.has(o.orderNo.trim().toUpperCase())) return false;
    const prov = o.courierProvider?.trim() || 'unassigned';
    if (selectedProvider !== 'all' && prov !== selectedProvider) return false;
    if (stageFilter !== 'all') {
      const stage = courierStage(o.status);
      if (stageFilter === 'delivered' && stage !== 'delivered') return false;
      if (stageFilter === 'transit' && stage !== 'transit') return false;
      if (stageFilter === 'returned' && o.status !== 'returned') return false;
    }
    if (!needle) return true;
    return [o.orderNo, o.trackingCode, o.consignmentId, o.districtNameBn, o.streetAddress]
      .some((v) => v?.toLowerCase().includes(needle));
  });

  const filteredHistory = ledger.filter(
    (row) =>
      (selectedProvider === 'all' || (row.courierProvider || 'unassigned') === selectedProvider) &&
      (!needle ||
        [row.orderNo, row.settlementRef, row.consignmentId, row.noteBn, row.paymentChannelBn]
          .some((v) => v?.toLowerCase().includes(needle)))
  );

  const summaryProviders = courierAccountsSummary?.providers ?? [];
  const totals = courierAccountsSummary?.totals ?? {
    totalParcelsSent: manualCourierParcels.length,
    inTransitCodPoisha: 0,
    deliveredCollectableCodPoisha: 0,
    totalCourierFeesPoisha: 0,
    totalAdjustmentsPoisha: 0,
    totalReceivedPoisha: 0,
    netReceivablePoisha: 0,
  };

  return (
    <div className="space-y-5">
      {/* Action Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-0.5">
          <h2 className="text-base font-bold text-ink flex items-center gap-1.5">
            <Truck className="w-4 h-4" aria-hidden="true" />
            <span>{t('কুরিয়ার পার্সেল, প্রমাণ ও পাওনা সমন্বয় (Manual Tracker)', 'Courier Parcel, Proof & Receivable Reconciliation')}</span>
            <InfoTooltip
              titleBn="কুরিয়ার হিসাব ও পাওনা সমন্বয়"
              termEn="Courier Receivable Reconciliation"
              explanationBn="কবে, কোন সময়, কোন জেলা-ঠিকানায়, কোন কুরিয়ার বা রাইডারে কত টাকার পার্সেল পাঠানো হয়েছে, কুরিয়ার কত টাকা পেয়েছে এবং ফি/সমন্বয় বাদে এখনো কত টাকা পাওনা বাকি — সব প্রমাণসহ সংরক্ষণ।"
              explanationEn="Tracks exact dispatch timestamp, destination, delivery method, collectable COD, courier charges, receipts with TrxID/proof, and exact net receivable remaining."
              formula="Net Owed = Delivered COD − Fees − Adjustments − Receipts"
              locale={locale}
            />
          </h2>
          <p className="text-xs text-muted">
            {t(
              'অর্ডার-লিঙ্কড পার্সেল আপডেট করলে সংযুক্ত অর্ডার ও ভেন্ডরের এসক্রো ব্যালেন্স স্বয়ংক্রিয়ভাবে সিঙ্ক হয়। স্বতন্ত্র (Standalone) এন্ট্রিও সাপোর্টেড।',
              'Updating an order-linked parcel auto-syncs the order status and vendor escrow balance. Standalone manual entries are also supported.'
            )}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant={entryMode === 'parcel' ? 'primary' : 'outline'}
            size="sm"
            onClick={() =>
              entryMode === 'parcel' ? setEntryMode('none') : openParcelEditor(undefined, orders[0]?.orderNo)
            }
            leftIcon={<PlusCircle className="w-4 h-4" aria-hidden="true" />}
          >
            {t('নতুন পার্সেল / ডিসপ্যাচ এন্ট্রি', 'Add Parcel Dispatch')}
          </Button>
          <Button
            variant={entryMode === 'remittance' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() =>
              entryMode === 'remittance'
                ? setEntryMode('none')
                : openRemittanceForParcelOrOrder({})
            }
            leftIcon={<Banknote className="w-4 h-4" aria-hidden="true" />}
          >
            {t('কুরিয়ার পেমেন্ট / জমা গ্রহণ', 'Record Courier Remittance')}
          </Button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3.5 rounded-[var(--radius-md)] border text-xs font-semibold flex items-center justify-between gap-2 ${
            feedback.type === 'success'
              ? 'border-success bg-surface text-success'
              : 'border-danger bg-surface text-danger'
          }`}
        >
          <span>{feedback.text}</span>
          <button type="button" className="underline text-ink" onClick={() => setFeedback(null)}>
            {t('বন্ধ করুন', 'Dismiss')}
          </button>
        </div>
      )}

      {/* Headline 4 Totals */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card surface="bg" padding="sm" className="space-y-1">
          <p className="text-[11px] font-semibold text-muted flex items-center gap-1">
            <span>{t('ইন-ট্রানজিট COD', 'In-Transit COD')}</span>
            <InfoTooltip
              titleBn="পথে থাকা পার্সেলের COD"
              termEn="In-Transit Collectable COD"
              explanationBn="যেসব পার্সেল পাঠানো হয়েছে কিন্তু এখনো ডেলিভারি হয়নি সেগুলোর মোট সংগ্রহযোগ্য COD।"
              explanationEn="Collectable COD across dispatched and in-transit parcels awaiting delivery."
              locale={locale}
            />
          </p>
          <p className="font-mono tabular-nums text-lg font-bold text-ink">
            {formatPoishaToBdt(totals.inTransitCodPoisha, locale)}
          </p>
          <p className="text-[11px] text-muted">
            {t(`মোট পাঠানো ${formatLocaleNumber(totals.totalParcelsSent, locale)} টি পার্সেল`, `${formatLocaleNumber(totals.totalParcelsSent, locale)} total parcels sent`)}
          </p>
        </Card>

        <Card surface="bg" padding="sm" className="space-y-1">
          <p className="text-[11px] font-semibold text-muted">{t('ডেলিভারড COD (আদায়যোগ্য)', 'Delivered COD Collectable')}</p>
          <p className="font-mono tabular-nums text-lg font-bold text-ink">
            {formatPoishaToBdt(totals.deliveredCollectableCodPoisha, locale)}
          </p>
          <p className="text-[11px] text-muted">
            {t('চার্জ + সমন্বয়:', 'Fees + Adj:')}{' '}
            <span className="font-mono text-danger">
              -{formatPoishaToBdt(totals.totalCourierFeesPoisha + totals.totalAdjustmentsPoisha, locale)}
            </span>
          </p>
        </Card>

        <Card surface="bg" padding="sm" className="space-y-1">
          <p className="text-[11px] font-semibold text-muted">{t('কুরিয়ার থেকে পাওয়া গেছে', 'Total Received from Couriers')}</p>
          <p className="font-mono tabular-nums text-lg font-bold text-success">
            {formatPoishaToBdt(totals.totalReceivedPoisha, locale)}
          </p>
          <p className="text-[11px] text-muted">{t('প্রমাণসহ ব্যাংক/বিকাশ/ক্যাশ জমা', 'Verified receipts with proof')}</p>
        </Card>

        <Card surface="bg" padding="sm" className="space-y-1 border-ink">
          <p className="text-[11px] font-semibold text-ink flex items-center gap-1">
            <span>{t('কুরিয়ারের কাছে পাওনা বাকি', 'Net Courier Receivable Owed')}</span>
            <InfoTooltip termKey="cod_receivable" locale={locale} />
          </p>
          <p className="font-mono tabular-nums text-lg font-bold text-warning">
            {formatPoishaToBdt(totals.netReceivablePoisha, locale)}
          </p>
          <p className="text-[11px] text-muted">{t('ডেলিভারড COD − ফি − প্রাপ্ত টাকা', 'Delivered COD − fees − receipts')}</p>
        </Card>
      </div>

      {/* Per-Courier Cards */}
      <section aria-label={t('কুরিয়ার অনুযায়ী হিসাব', 'Courier account breakdown')} className="space-y-2.5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-ink">{t('কুরিয়ার-ভিত্তিক পাওনা ও প্রাপ্ত হিসাব', 'Courier-by-Courier Accounts')}</h3>
          {selectedProvider !== 'all' && (
            <button
              type="button"
              onClick={() => setSelectedProvider('all')}
              className="text-xs underline text-ink cursor-pointer"
            >
              {t('সব কুরিয়ার দেখান', 'Show all couriers')}
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          {summaryProviders.map((prov) => (
            <button
              key={prov.provider}
              type="button"
              onClick={() =>
                setSelectedProvider((cur) => (cur === prov.provider ? 'all' : prov.provider))
              }
              className={`text-left p-3.5 border rounded-[var(--radius-md)] bg-surface space-y-1.5 transition-colors cursor-pointer hover:border-ink ${
                selectedProvider === prov.provider ? 'border-2 border-ink bg-bg' : 'border-border'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm text-ink">{providerLabel(prov.provider, bn)}</span>
                <span className="font-mono text-[11px] text-muted">
                  {formatLocaleNumber(prov.totalParcelsSent, locale)} {t('পার্সেল', 'parcels')}
                </span>
              </div>
              <div className="space-y-1 text-xs font-mono tabular-nums">
                <div className="flex justify-between">
                  <span className="text-muted font-sans">{t('ইন-ট্রানজিট:', 'In-Transit:')}</span>
                  <span>{formatPoishaToBdt(prov.inTransitCodPoisha, locale)} ({prov.inTransitParcels})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted font-sans">{t('ডেলিভারড COD:', 'Delivered COD:')}</span>
                  <span>{formatPoishaToBdt(prov.deliveredCollectableCodPoisha, locale)} ({prov.deliveredParcels})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted font-sans">{t('চার্জ ও সমন্বয়:', 'Fees & Adj:')}</span>
                  <span className="text-danger">
                    -{formatPoishaToBdt(prov.totalCourierFeesPoisha + prov.totalAdjustmentsPoisha, locale)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted font-sans">{t('প্রাপ্ত টাকা:', 'Received:')}</span>
                  <span className="text-success">{formatPoishaToBdt(prov.totalReceivedPoisha, locale)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-bold">
                  <span className="text-ink font-sans">{t('পাওনা বাকি:', 'Net Owed:')}</span>
                  <span className={prov.netReceivablePoisha > 0 ? 'text-warning' : 'text-success'}>
                    {formatPoishaToBdt(prov.netReceivablePoisha, locale)}
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      {/* Interactive Entry Form A: Add / Update Parcel Dispatch */}
      {entryMode === 'parcel' && (
        <Card surface="surface" padding="md" className="space-y-4 border-2 border-ink">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <div>
              <h3 className="text-sm font-bold text-ink">
                {editingParcelId
                  ? t(`পার্সেল আপডেট (${editingParcelId})`, `Update Parcel (${editingParcelId})`)
                  : t('নতুন পার্সেল / ডিসপ্যাচ এন্ট্রি', 'New Courier Parcel Dispatch')}
              </h3>
              <p className="text-[11px] text-muted">
                {t(
                  'কবে, কোন সময়, কোথায়, কোন কুরিয়ারে কত টাকার পার্সেল পাঠানো হয়েছে তা প্রমাণসহ লিখুন। অর্ডার-লিঙ্কড হলে ভেন্ডর এসক্রো স্বয়ংক্রিয়ভাবে আপডেট হবে।',
                  'Record exact dispatch date/time, destination, courier, delivery method, COD, charge, and proof. Order-linked parcels auto-sync vendor escrow.'
                )}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={!parcelStandalone ? 'primary' : 'outline'}
                onClick={() => setParcelStandalone(false)}
              >
                {t('অর্ডার-লিঙ্কড', 'Order-Linked')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={parcelStandalone ? 'primary' : 'outline'}
                onClick={() => setParcelStandalone(true)}
              >
                {t('স্বতন্ত্র পার্সেল (Standalone)', 'Standalone Parcel')}
              </Button>
            </div>
          </div>

          <form onSubmit={handleSaveParcel} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {!parcelStandalone && (
                <label className="block space-y-1">
                  <span className="font-semibold text-ink">{t('লিঙ্কড অর্ডার নম্বর *', 'Linked Order No *')}</span>
                  <select
                    className={cn(inputCls, 'font-mono')}
                    value={parcelOrderNo}
                    onChange={(e) => applyOrderDefaultsToParcelForm(e.target.value)}
                    required={!parcelStandalone}
                  >
                    <option value="">{t('— অর্ডার বেছে নিন —', '— Select order —')}</option>
                    {orders.map((o) => (
                      <option key={o.orderNo} value={o.orderNo}>
                        {o.orderNo} ({formatPoishaToBdt(o.codCollectablePoisha ?? 0, locale)})
                      </option>
                    ))}
                  </select>
                </label>
              )}

              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('কুরিয়ার সার্ভিস *', 'Courier Provider *')}</span>
                <select
                  className={inputCls}
                  value={parcelProvider}
                  onChange={(e) => setParcelProvider(e.target.value as ActiveCourierProvider)}
                >
                  {ACTIVE_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {providerLabel(p, bn)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('কীভাবে পাঠানো হয়েছে (Delivery Method) *', 'How Sent (Method) *')}</span>
                <input
                  className={inputCls}
                  value={parcelDeliveryMethod}
                  onChange={(e) => setParcelDeliveryMethod(e.target.value)}
                  placeholder="হোম ডেলিভারি (COD) / হাব পিকআপ / নিজস্ব রাইডার"
                  required
                />
              </label>

              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('পার্সেল স্ট্যাটাস *', 'Parcel Status *')}</span>
                <select
                  className={inputCls}
                  value={parcelStatus}
                  onChange={(e) => setParcelStatus(e.target.value as ManualParcelStatus)}
                >
                  {(Object.keys(PARCEL_STATUS_LABELS) as ManualParcelStatus[]).map((st) => (
                    <option key={st} value={st}>
                      {bn ? PARCEL_STATUS_LABELS[st].bn : PARCEL_STATUS_LABELS[st].en}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('কনসাইনমেন্ট আইডি', 'Consignment ID')}</span>
                <input
                  className={cn(inputCls, 'font-mono')}
                  value={parcelConsignmentId}
                  onChange={(e) => setParcelConsignmentId(e.target.value)}
                  placeholder="SF-992011"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('ট্র্যাকিং কোড', 'Tracking Code')}</span>
                <input
                  className={cn(inputCls, 'font-mono')}
                  value={parcelTrackingCode}
                  onChange={(e) => setParcelTrackingCode(e.target.value)}
                  placeholder="TRK-992011"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('কবে ও কোন সময় পাঠানো হয়েছে *', 'Dispatched Date & Time *')}</span>
                <input
                  type="datetime-local"
                  className={cn(inputCls, 'font-mono')}
                  value={parcelDispatchedAt}
                  onChange={(e) => setParcelDispatchedAt(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('ডেলিভারি তারিখ ও সময় (যদি সম্পন্ন হয়)', 'Delivered Date & Time (optional)')}</span>
                <input
                  type="datetime-local"
                  className={cn(inputCls, 'font-mono')}
                  value={parcelDeliveredAt}
                  onChange={(e) => setParcelDeliveredAt(e.target.value)}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('জেলা (কোথায় পাঠানো হয়েছে)', 'Destination District')}</span>
                <select
                  className={inputCls}
                  value={parcelDistrictId}
                  onChange={(e) => setParcelDistrictId(Number(e.target.value))}
                >
                  {districtRates.map((d) => (
                    <option key={d.districtId} value={d.districtId}>
                      {bn ? d.districtNameBn : d.districtNameEn}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('উপজেলা / থানা', 'Upazila / Area')}</span>
                <input
                  className={inputCls}
                  value={parcelUpazilaName}
                  onChange={(e) => setParcelUpazilaName(e.target.value)}
                  placeholder={t('উপজেলা/থানা', 'Upazila / Area')}
                />
              </label>
              <label className="block space-y-1 sm:col-span-2">
                <span className="font-semibold text-ink">{t('গন্তব্যের ঠিকানা / হাব *', 'Destination Address / Hub *')}</span>
                <input
                  className={inputCls}
                  value={parcelAddress}
                  onChange={(e) => setParcelAddress(e.target.value)}
                  placeholder={t('বাড়ি, রোড, এলাকা বা কুরিয়ার হাবের ঠিকানা', 'Full delivery address or hub')}
                  required
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('সংগ্রহযোগ্য COD (৳) *', 'Collectable COD (৳) *')}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={cn(inputCls, 'font-mono')}
                  value={parcelCodTaka}
                  onChange={(e) => setParcelCodTaka(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('কুরিয়ার চার্জ / ফি (৳) *', 'Courier Fee (৳) *')}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={cn(inputCls, 'font-mono')}
                  value={parcelChargeTaka}
                  onChange={(e) => setParcelChargeTaka(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('রাইডার / পিকআপ কর্মীর নাম', 'Rider / Handler Name')}</span>
                <input
                  className={inputCls}
                  value={parcelRiderName}
                  onChange={(e) => setParcelRiderName(e.target.value)}
                  placeholder={t('ঐচ্ছিক', 'Optional')}
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('রাইডারের মোবাইল', 'Rider Phone')}</span>
                <input
                  className={cn(inputCls, 'font-mono')}
                  value={parcelRiderPhone}
                  onChange={(e) => setParcelRiderPhone(e.target.value)}
                  placeholder="017..."
                />
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('চালান / প্রুফ রেফারেন্স', 'Proof / Challan Ref')}</span>
                <input
                  className={cn(inputCls, 'font-mono')}
                  value={parcelProofRef}
                  onChange={(e) => setParcelProofRef(e.target.value)}
                  placeholder="MANIFEST-112"
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('রসিদ/স্ক্রিনশট লিংক (ঐচ্ছিক)', 'Receipt / Proof URL (optional)')}</span>
                <input
                  className={cn(inputCls, 'font-mono')}
                  value={parcelProofUrl}
                  onChange={(e) => setParcelProofUrl(e.target.value)}
                  placeholder="https://..."
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('বিস্তারিত নোট', 'Detailed Note')}</span>
                <input
                  className={inputCls}
                  value={parcelNote}
                  onChange={(e) => setParcelNote(e.target.value)}
                  placeholder={t('কোনো বিশেষ শর্ত বা মন্তব্য', 'Optional dispatch note')}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setEntryMode('none')}>
                {t('বাতিল', 'Cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={saving}>
                {t('পার্সেল ও প্রমাণ সংরক্ষণ করুন', 'Save Parcel & Proof')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Interactive Entry Form B: Record Courier Remittance / Payment Receipt */}
      {entryMode === 'remittance' && (
        <Card surface="surface" padding="md" className="space-y-4 border-2 border-ink">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
            <div>
              <h3 className="text-sm font-bold text-ink">
                {t('কুরিয়ার পেমেন্ট / রেমিট্যান্স গ্রহণ (প্রমাণসহ)', 'Record Courier Remittance Receipt (With Proof)')}
              </h3>
              <p className="text-[11px] text-muted">
                {t(
                  'কুরিয়ার থেকে ব্যাংক/বিকাশ/ক্যাশে কত টাকা পাওয়া গেল, কত ফি ও সমন্বয় কাটা হয়েছে — প্রমাণসহ লিপিবদ্ধ করুন।',
                  'Log money received from a courier via Bank, bKash, or Cash along with fees, adjustments, and TrxID/receipt proof.'
                )}
              </p>
            </div>
            <div className="flex gap-1.5">
              <Button
                type="button"
                size="sm"
                variant={!remitStandalone ? 'primary' : 'outline'}
                onClick={() => setRemitStandalone(false)}
              >
                {t('পার্সেল/অর্ডার-লিঙ্কড', 'Parcel / Order-Linked')}
              </Button>
              <Button
                type="button"
                size="sm"
                variant={remitStandalone ? 'primary' : 'outline'}
                onClick={() => setRemitStandalone(true)}
              >
                {t('স্বতন্ত্র / থোক জমা (Standalone)', 'Standalone Bulk Settlement')}
              </Button>
            </div>
          </div>

          <form onSubmit={handleSaveRemittance} className="space-y-3 text-xs">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('কুরিয়ার সার্ভিস *', 'Courier *')}</span>
                <select
                  className={inputCls}
                  value={remitProvider}
                  onChange={(e) => setRemitProvider(e.target.value as ActiveCourierProvider)}
                >
                  {ACTIVE_PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {providerLabel(p, bn)}
                    </option>
                  ))}
                </select>
              </label>

              {!remitStandalone && (
                <>
                  <label className="block space-y-1">
                    <span className="font-semibold text-ink">{t('পার্সেল নির্বাচন (ঐচ্ছিক)', 'Select Parcel (optional)')}</span>
                    <select
                      className={cn(inputCls, 'font-mono')}
                      value={remitParcelId}
                      onChange={(e) => {
                        const pid = e.target.value;
                        setRemitParcelId(pid);
                        const match = manualCourierParcels.find((p) => p.parcelId === pid);
                        if (match) {
                          setRemitOrderNo(match.orderNo ?? '');
                          setRemitConsignmentId(match.consignmentId);
                          if (match.courierProvider !== 'redx') setRemitProvider(match.courierProvider);
                          setRemitExpectedCodTaka(String(match.collectableCodPoisha / 100));
                          setRemitFeeTaka(String(match.courierChargePoisha / 100));
                          setRemitReceivedTaka(
                            String(Math.max(0, match.collectableCodPoisha - match.courierChargePoisha) / 100)
                          );
                        }
                      }}
                    >
                      <option value="">{t('— সরাসরি অর্ডার/ম্যানুয়াল —', '— Choose parcel —')}</option>
                      {manualCourierParcels.map((p) => (
                        <option key={p.parcelId} value={p.parcelId}>
                          {p.parcelId} · {p.orderNo ?? 'STANDALONE'} ({formatPoishaToBdt(p.collectableCodPoisha, locale)})
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="block space-y-1">
                    <span className="font-semibold text-ink">{t('অর্ডার নম্বর', 'Order No')}</span>
                    <input
                      className={cn(inputCls, 'font-mono')}
                      value={remitOrderNo}
                      onChange={(e) => setRemitOrderNo(e.target.value)}
                      placeholder="ORD-..."
                    />
                  </label>
                </>
              )}

              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('টাকা গ্রহণের মাধ্যম *', 'Payment Channel *')}</span>
                <select
                  className={inputCls}
                  value={remitChannel}
                  onChange={(e) => setRemitChannel(e.target.value)}
                >
                  <option value="ব্যাংক ট্রান্সফার (Bank Transfer)">{t('ব্যাংক ট্রান্সফার (Bank Transfer)', 'Bank Transfer')}</option>
                  <option value="বিকাশ (bKash)">{t('বিকাশ (bKash)', 'bKash')}</option>
                  <option value="নগদ ক্যাশ / অফিস কালেকশন (Cash)">{t('নগদ ক্যাশ / অফিস কালেকশন (Cash)', 'Cash / Office Settlement')}</option>
                </select>
              </label>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('প্রত্যাশিত COD (৳) *', 'Expected COD (৳) *')}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={cn(inputCls, 'font-mono')}
                  value={remitExpectedCodTaka}
                  onChange={(e) => setRemitExpectedCodTaka(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('কুরিয়ার ফি কর্তন (৳) *', 'Courier Fee Deducted (৳) *')}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={cn(inputCls, 'font-mono')}
                  value={remitFeeTaka}
                  onChange={(e) => setRemitFeeTaka(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('ক্ষতি / সমন্বয় (৳)', 'Adjustment / Damage (৳)')}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={cn(inputCls, 'font-mono')}
                  value={remitAdjTaka}
                  onChange={(e) => setRemitAdjTaka(e.target.value)}
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('বাস্তবে পাওয়া টাকা (৳) *', 'Actual Received Amount (৳) *')}</span>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className={cn(inputCls, 'font-mono font-bold')}
                  value={remitReceivedTaka}
                  onChange={(e) => setRemitReceivedTaka(e.target.value)}
                  required
                />
              </label>
            </div>

            {/* Live Short-Payment Preview */}
            <div className="p-2.5 rounded-[var(--radius-sm)] border border-border bg-bg flex flex-wrap items-center justify-between gap-2 font-mono text-[11px]">
              <span>
                {t('নিট প্রাপ্য:', 'Net Expected:')}{' '}
                <strong className="text-ink">{formatPoishaToBdt(remitNetExpectedPoisha, locale)}</strong>
              </span>
              <span>
                {t('প্রাপ্ত:', 'Received:')}{' '}
                <strong className="text-success">{formatPoishaToBdt(remitReceivedPoisha, locale)}</strong>
              </span>
              <span>
                {remitShortPoisha > 0 ? (
                  <strong className="text-danger">
                    {t('ঘাটতি (Short Payment):', 'Short Payment:')}{' '}
                    {formatPoishaToBdt(remitShortPoisha, locale)}
                  </strong>
                ) : (
                  <strong className="text-success">{t('✓ হিসাব সম্পূর্ণ মিল আছে', '✓ Balanced / Settled')}</strong>
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('TrxID / ব্যাংক রেফারেন্স *', 'TrxID / Settlement Ref *')}</span>
                <input
                  className={cn(inputCls, 'font-mono')}
                  value={remitRef}
                  onChange={(e) => setRemitRef(e.target.value)}
                  placeholder="STL-BANK-20261118"
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('জমার তারিখ ও সময় *', 'Settled Date & Time *')}</span>
                <input
                  type="datetime-local"
                  className={cn(inputCls, 'font-mono')}
                  value={remitSettledAt}
                  onChange={(e) => setRemitSettledAt(e.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('ব্যাংক/স্টেটমেন্ট প্রুফ লিংক', 'Proof / Statement URL')}</span>
                <input
                  className={cn(inputCls, 'font-mono')}
                  value={remitProofUrl}
                  onChange={(e) => setRemitProofUrl(e.target.value)}
                  placeholder="https://..."
                />
              </label>
              <label className="block space-y-1">
                <span className="font-semibold text-ink">{t('মন্তব্য / নোট', 'Note')}</span>
                <input
                  className={inputCls}
                  value={remitNote}
                  onChange={(e) => setRemitNote(e.target.value)}
                  placeholder={t('স্টেটমেন্ট নম্বর বা সমন্বয়ের বিবরণ', 'Optional reconciliation note')}
                />
              </label>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
              <Button type="button" variant="outline" size="sm" onClick={() => setEntryMode('none')}>
                {t('বাতিল', 'Cancel')}
              </Button>
              <Button type="submit" variant="primary" size="sm" isLoading={saving}>
                {t('পেমেন্ট গ্রহণ ও প্রমাণ সংরক্ষণ করুন', 'Save Remittance Receipt')}
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* Search & Filter Bar + Dispatched Parcels & Linked Orders */}
      <Card surface="bg" padding="md" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-bold text-base text-ink">
            {t('পাঠানো পার্সেল ও অর্ডার ট্র্যাকিং রেজিস্টার', 'Dispatched Parcels & Orders Register')}
          </h3>
          <span className="text-xs font-mono text-muted">
            {t(
              `নথিভুক্ত পার্সেল: ${formatLocaleNumber(filteredParcels.length, locale)} · আনলিঙ্কড অর্ডার: ${formatLocaleNumber(unlinkedOrders.length, locale)}`,
              `Logged Parcels: ${filteredParcels.length} · Unlinked Orders: ${unlinkedOrders.length}`
            )}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <label className="block">
            <span className="text-muted">{t('কুরিয়ার', 'Courier')}</span>
            <select
              aria-label={t('কুরিয়ার নির্বাচন', 'Select courier')}
              value={selectedProvider}
              onChange={(e) => setSelectedProvider(e.target.value)}
              className="block w-full min-h-[44px] border border-border bg-surface rounded-[var(--radius-md)] p-2 mt-1"
            >
              <option value="all">{t('সব কুরিয়ার', 'All couriers')}</option>
              {ACTIVE_PROVIDERS.map((p) => (
                <option key={p} value={p}>
                  {providerLabel(p, bn)}
                </option>
              ))}
              <option value="redx">{providerLabel('redx', bn)}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-muted">{t('অবস্থা', 'Stage')}</span>
            <select
              aria-label={t('পার্সেলের অবস্থা', 'Parcel stage')}
              value={stageFilter}
              onChange={(e) => setStageFilter(e.target.value)}
              className="block w-full min-h-[44px] border border-border bg-surface rounded-[var(--radius-md)] p-2 mt-1"
            >
              <option value="all">{t('সব অবস্থা', 'All stages')}</option>
              <option value="transit">{t('পাঠানো / ইন-ট্রানজিট', 'Dispatched / In-Transit')}</option>
              <option value="delivered">{t('ডেলিভারি / নিষ্পন্ন', 'Delivered / Settled')}</option>
              <option value="returned">{t('রিটার্ন', 'Returned')}</option>
            </select>
          </label>
          <label className="block">
            <span className="text-muted">{t('পার্সেল, অর্ডার, ট্র্যাকিং বা জেলা খুঁজুন', 'Search parcel, order, tracking or district')}</span>
            <div className="relative mt-1">
              <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t('খুঁজুন...', 'Search...')}
                className="block w-full min-h-[44px] border border-border bg-surface rounded-[var(--radius-md)] pl-9 pr-3 py-2"
              />
            </div>
          </label>
        </div>

        {/* Manual Courier Parcels List */}
        {filteredParcels.length === 0 && unlinkedOrders.length === 0 ? (
          <p className="text-sm text-muted py-4 text-center">
            {t('এই ফিল্টারে কোনো পার্সেল বা অর্ডার পাওয়া যায়নি।', 'No parcels or orders match this filter.')}
          </p>
        ) : (
          <div className="space-y-3">
            {filteredParcels.map((p) => {
              const stMeta = PARCEL_STATUS_LABELS[p.status];
              return (
                <div
                  key={p.parcelId}
                  className="border border-border bg-surface rounded-[var(--radius-md)] p-3.5 text-xs space-y-2.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <strong className="font-mono text-sm text-ink">{p.parcelId}</strong>
                      <Badge status={p.isStandalone ? 'neutral' : 'info'}>
                        {p.isStandalone
                          ? t('স্বতন্ত্র পার্সেল', 'Standalone')
                          : `${t('অর্ডার', 'Order')}: ${p.orderNo}`}
                      </Badge>
                      <span className="font-semibold text-ink">{providerLabel(p.courierProvider, bn)}</span>
                      <Badge status={stMeta.tone}>{bn ? stMeta.bn : stMeta.en}</Badge>
                    </div>
                    <div className="font-mono tabular-nums text-right">
                      <span className="text-muted">{t('COD:', 'COD:')}</span>{' '}
                      <strong className="text-ink text-sm">{money(p.collectableCodPoisha)}</strong>
                      {' · '}
                      <span className="text-muted">{t('ফি:', 'Fee:')}</span>{' '}
                      <strong className="text-danger">{money(p.courierChargePoisha)}</strong>
                    </div>
                  </div>

                  <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-[11px]">
                    <div>
                      <dt className="text-muted flex items-center gap-1">
                        <Clock className="w-3 h-3" aria-hidden="true" />
                        <span>{t('পাঠানোর সময় ও ডেলিভারি', 'Dispatched & Delivered Time')}</span>
                      </dt>
                      <dd className="font-mono text-ink mt-0.5">
                        {safeDateTime(p.dispatchedAt, bn)}
                        {p.deliveredAt && (
                          <span className="block text-success">
                            {t('ডেলিভারি:', 'Del:')} {safeDateTime(p.deliveredAt, bn)}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted flex items-center gap-1">
                        <MapPin className="w-3 h-3" aria-hidden="true" />
                        <span>{t('কোথায় পাঠানো হয়েছে', 'Destination')}</span>
                      </dt>
                      <dd className="text-ink mt-0.5">
                        <strong>{p.districtNameBn}</strong>
                        {p.upazilaNameBn ? `, ${p.upazilaNameBn}` : ''}
                        <span className="block text-muted truncate">{p.destinationAddressBn || '—'}</span>
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t('কীভাবে & ট্র্যাকিং / কনসাইনমেন্ট', 'Method & Tracking')}</dt>
                      <dd className="text-ink mt-0.5">
                        <span>{p.deliveryMethodBn}</span>
                        <span className="block font-mono text-muted break-all">
                          {p.trackingCode} / {p.consignmentId}
                        </span>
                        {p.riderName && (
                          <span className="block text-muted">
                            {t('রাইডার:', 'Rider:')} {p.riderName} {p.riderPhone ? `(${p.riderPhone})` : ''}
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-muted">{t('প্রমাণ ও নোট', 'Proof & Note')}</dt>
                      <dd className="text-ink mt-0.5 space-y-0.5">
                        <span className="font-mono block">{p.proofRef || '—'}</span>
                        {p.proofUrl && (
                          <a
                            href={p.proofUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 underline text-ink"
                          >
                            <ExternalLink className="w-3 h-3" aria-hidden="true" />
                            {t('রসিদ/প্রমাণ দেখুন', 'View proof')}
                          </a>
                        )}
                        {p.noteBn && <span className="block text-muted">{p.noteBn}</span>}
                      </dd>
                    </div>
                  </dl>

                  <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                    {p.status === 'dispatched' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void handleQuickParcelStatus(p, 'in_transit')}
                      >
                        {t('ইন-ট্রানজিট করুন', 'Mark In-Transit')}
                      </Button>
                    )}
                    {(p.status === 'dispatched' || p.status === 'in_transit') && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        disabled={saving}
                        onClick={() => void handleQuickParcelStatus(p, 'delivered')}
                        leftIcon={<CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />}
                      >
                        {t('ডেলিভারড (অর্ডার ও এসক্রো সিঙ্ক)', 'Mark Delivered (Sync Order & Escrow)')}
                      </Button>
                    )}
                    {p.status !== 'settled' && p.status !== 'returned' && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() =>
                          openRemittanceForParcelOrOrder({
                            parcelId: p.parcelId,
                            orderNo: p.orderNo,
                            courierProvider: p.courierProvider,
                            consignmentId: p.consignmentId,
                            expectedCodPoisha: p.collectableCodPoisha,
                            feePoisha: p.courierChargePoisha,
                          })
                        }
                        leftIcon={<Banknote className="w-3.5 h-3.5" aria-hidden="true" />}
                      >
                        {t('পেমেন্ট গ্রহণ রেকর্ড', 'Record Remittance')}
                      </Button>
                    )}
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openParcelEditor(p)}
                      leftIcon={<Edit3 className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      {t('সম্পাদনা', 'Edit')}
                    </Button>
                  </div>
                </div>
              );
            })}

            {/* Unlinked Orders that do not yet have a ManualCourierParcelRecord */}
            {unlinkedOrders.map((o, index) => (
              <div
                key={`${o.id ?? o.orderNo ?? 'ord'}-${index}`}
                className="border border-dashed border-border bg-surface/60 rounded-[var(--radius-md)] p-3 text-xs space-y-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-mono text-ink">{o.orderNo || '—'}</strong>
                    <Badge status="neutral">{t('অর্ডার রেকর্ড (পার্সেল লগ বাকি)', 'Order (Not logged as parcel yet)')}</Badge>
                    <span>{providerLabel(o.courierProvider || 'unassigned', bn)}</span>
                    <span className="text-muted">({o.status})</span>
                  </div>
                  <strong className="font-mono tabular-nums text-ink">{money(o.codCollectablePoisha)}</strong>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                  <span>
                    {o.districtNameBn || '—'} {o.upazilaNameBn ? `· ${o.upazilaNameBn}` : ''} · {safeDateTime(o.createdAt, bn)}
                  </span>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => openParcelEditor(undefined, o.orderNo)}
                      leftIcon={<PackageCheck className="w-3.5 h-3.5" aria-hidden="true" />}
                    >
                      {t('পার্সেল ডিসপ্যাচ লগ করুন', 'Log Parcel Dispatch')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        openRemittanceForParcelOrOrder({
                          orderNo: o.orderNo,
                          courierProvider: o.courierProvider,
                          consignmentId: o.consignmentId,
                          expectedCodPoisha: o.codCollectablePoisha,
                          feePoisha: 6000,
                        })
                      }
                    >
                      {t('রেমিট্যান্স রেকর্ড', 'Record Remittance')}
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Remittance & Proof Ledger Table */}
      <Card surface="surface" padding="md" className="space-y-3">
        <h3 className="font-bold text-base text-ink flex items-center gap-2">
          <FileCheck2 className="w-4 h-4" aria-hidden="true" />
          <span>{t('কুরিয়ার পেমেন্ট ও রেমিট্যান্স লেজার (প্রমাণসহ)', 'Courier Remittance & Proof Ledger')}</span>
        </h3>
        {filteredHistory.length === 0 ? (
          <p className="text-sm text-muted">{t('কোনো রেমিট্যান্স রেকর্ড পাওয়া যায়নি।', 'No remittance records found.')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs min-w-[780px]">
              <thead>
                <tr className="border-b border-border text-muted">
                  <th className="p-2">{t('তারিখ ও সময় / কুরিয়ার', 'Date & Time / Courier')}</th>
                  <th className="p-2">{t('পার্সেল / অর্ডার / রেফ', 'Parcel / Order / Ref')}</th>
                  <th className="p-2">{t('মাধ্যম ও প্রমাণ', 'Channel & Proof')}</th>
                  <th className="p-2 text-right">{t('প্রত্যাশিত COD', 'Expected COD')}</th>
                  <th className="p-2 text-right">{t('ফি ও সমন্বয়', 'Fee & Adj')}</th>
                  <th className="p-2 text-right">{t('প্রাপ্ত টাকা', 'Received')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono tabular-nums">
                {filteredHistory.map((r, i) => (
                  <tr key={`${r.id}-${i}`}>
                    <td className="p-2 font-sans">
                      <span className="block font-mono">{safeDateTime(r.settledAt ?? r.createdAt, bn)}</span>
                      <span className="text-muted">{providerLabel(r.courierProvider || 'unassigned', bn)}</span>
                    </td>
                    <td className="p-2">
                      <span className="block font-bold text-ink">{r.orderNo || 'STANDALONE'}</span>
                      {r.parcelId && <span className="block text-[11px] text-muted">{r.parcelId}</span>}
                      <span className="block text-[11px] text-muted">Ref: {r.settlementRef || '—'}</span>
                    </td>
                    <td className="p-2 font-sans">
                      <span className="block">{r.paymentChannelBn || '—'}</span>
                      {r.proofUrl && (
                        <a
                          href={r.proofUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1 underline text-ink text-[11px]"
                        >
                          <ExternalLink className="w-3 h-3" aria-hidden="true" />
                          {t('প্রমাণ দেখুন', 'View proof')}
                        </a>
                      )}
                      {r.noteBn && <span className="block text-[11px] text-muted">{r.noteBn}</span>}
                    </td>
                    <td className="p-2 text-right">{money(r.expectedCodPoisha)}</td>
                    <td className="p-2 text-right text-danger">
                      -{money((r.courierFeeDeductedPoisha || 0) + (r.adjustmentPoisha || 0))}
                    </td>
                    <td className="p-2 text-right">
                      <strong className="text-success">{money(r.remittedAmountPoisha)}</strong>
                      {r.shortPaymentPoisha > 0 && (
                        <span className="block text-[11px] text-danger">
                          {t('ঘাটতি:', 'Short:')} {money(r.shortPaymentPoisha)}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Collapsible Historical Claims & Batches */}
      <details className="border border-border rounded-[var(--radius-md)] p-4 text-sm space-y-3">
        <summary className="font-bold cursor-pointer">
          {t('পুরোনো ক্লেইম ও পিকআপ ব্যাচ (আর্কাইভ)', 'Historical Claims & Pickup Batches (Archive)')}
        </summary>
        <h4 className="font-semibold text-xs pt-2">{t('ক্লেইম', 'Claims')}</h4>
        {claims.filter((c) => selectedProvider === 'all' || c.courierProvider === selectedProvider).length === 0 ? (
          <p className="text-xs text-muted">{t('কোনো রেকর্ড নেই।', 'No records.')}</p>
        ) : (
          <ul className="space-y-2">
            {claims
              .filter((c) => selectedProvider === 'all' || c.courierProvider === selectedProvider)
              .map((c, i) => (
                <li key={`${c.claimId}-${i}`} className="border border-border p-2 rounded text-xs">
                  <span>
                    {providerLabel(c.courierProvider || 'unassigned', bn)} · {c.orderNo || '—'} · {c.claimId || '—'}
                  </span>
                  <p>
                    {t('দাবি', 'Claim')}: {money(c.claimAmountPoisha)} · {c.status} · {safeDateTime(c.createdAt, bn)}
                  </p>
                  <p className="break-words text-muted">{c.reasonBn || '—'}</p>
                </li>
              ))}
          </ul>
        )}
        <h4 className="font-semibold text-xs pt-2">{t('পিকআপ ব্যাচ', 'Pickup batches')}</h4>
        {batches.filter((b) => selectedProvider === 'all' || b.courierProvider === selectedProvider).length === 0 ? (
          <p className="text-xs text-muted">{t('কোনো রেকর্ড নেই।', 'No records.')}</p>
        ) : (
          <ul className="space-y-2">
            {batches
              .filter((b) => selectedProvider === 'all' || b.courierProvider === selectedProvider)
              .map((b, i) => (
                <li key={`${b.batchId}-${i}`} className="border border-border p-2 rounded text-xs">
                  <span>
                    {providerLabel(b.courierProvider || 'unassigned', bn)} · {b.batchCode || '—'} ·{' '}
                    {safeDateTime(b.createdAt, bn)}
                  </span>
                  <p>
                    {t('অবস্থা', 'Status')}: {b.status} · {t('অর্ডার', 'Orders')}: {(b.orderNos || []).join(', ') || '—'}
                  </p>
                </li>
              ))}
          </ul>
        )}
      </details>
    </div>
  );
}
