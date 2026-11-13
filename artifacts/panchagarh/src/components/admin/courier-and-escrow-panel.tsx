'use client';
import { localizedField } from '@/lib/i18n/ui-text';
import { uiText } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/admin/courier-and-escrow-panel.tsx
// Phase 4B UI Panels:
//   1. Courier360AndRatesPanel (Modules C, D & M): Courier 360 Aging Buckets, Pickup Batch & Handover Manifest,
//      COD Remittance Settlement + Short-Payment Detector, Courier Claims, & 64-District Delivery Rate Table
//   2. VendorEscrowAndReturnPanel (Module E): Real-Time Escrow Balances (Pending -> Locked -> Available),
//      Append-Only Ledger, 4-Way Return Engine, Payout Request/Hold/Approval Flow, Printable Statement,
//      15-Question Onboarding Form, & Contract Closure Audit Guard

import * as React from 'react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import {
  Truck,
  PackageCheck,
  AlertTriangle,
  Printer,
  Wallet,
  RotateCcw,
  FileSpreadsheet,
  UserPlus,
  ShieldAlert,
  CheckCircle2,
  Search,
  ExternalLink,
  FileCheck,
  CalendarClock,
  DollarSign,
  CreditCard,
  FileText,
  Filter,
  PlusCircle,
  Eye,
  ArrowUpRight,
  Tag,
  Box,
  User,
  Calendar,
  Percent,
} from 'lucide-react';
import { ResponsiveSheet } from '../ui/responsive-sheet';
import type { Product360VariantDTO } from '@/lib/admin/phase4c-service';
import type {
  CourierProvider,
  ReturnFaultType,
} from '@/types/database.types';
import type { OrderGridRowDTO, VendorEscrowBalance } from '@/types/domain';
import type {
  Courier360ProviderSummary,
  CourierClaimRecord,
  CourierRemittanceLedgerRecord,
  DistrictRateOverrideRecord,
  ImmutableVendorLedgerRecord,
  PickupBatchRecord,
  ReturnResolutionRecord,
  VendorPayoutRequestRecord,
  VendorProfileRecord,
} from '@/lib/admin/phase4b-service';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { getLiveCourierTrackingUrl } from '@/lib/courier/tracking-urls';
import { Badge, Button, Card, Input } from '../ui/primitives';
import { Code128BarcodeSvg } from './print-engine-panel';

/**
 * Predicts next courier remittance payout date & time based on Bangladeshi courier schedules.
 */
export function predictNextRemittanceSchedule(
  provider: CourierProvider,
  dispatchDateIso?: string
): { dateLabelBn: string; timeLabelBn: string; daysRemaining: number } {
  const baseDate = dispatchDateIso ? new Date(dispatchDateIso) : new Date();
  const target = new Date(baseDate.getTime());

  let targetDay = 0;
  let timeStr = 'সকাল ১১:০০ টা';
  const currentDay = baseDate.getDay();

  if (provider === 'steadfast') {
    targetDay = currentDay < 3 ? 3 : 0; // Wed or Sun
    timeStr = 'সকাল ১১:০০ টা';
  } else if (provider === 'pathao') {
    targetDay = currentDay < 4 ? 4 : 1; // Thu or Mon
    timeStr = 'দুপুর ২:০০ টা';
  } else if (provider === 'redx') {
    targetDay = currentDay < 5 ? 5 : 2; // Fri or Tue
    timeStr = 'বিকাল ৪:০০ টা';
  } else {
    targetDay = 0; // Sun
    timeStr = 'সকাল ১০:০০ টা';
  }

  let daysDiff = (targetDay - currentDay + 7) % 7;
  if (daysDiff === 0) daysDiff = 3;

  target.setDate(target.getDate() + daysDiff);

  const dayNames = [
    'রবিবার',
    'সোমবার',
    'মঙ্গলবার',
    'বুধবার',
    'বৃহস্পতিবার',
    'শুক্রবার',
    'শনিবার',
  ];
  const monthNames = [
    'জানুয়ারি',
    'ফেব্রুয়ারি',
    'মার্চ',
    'এপ্রিল',
    'মে',
    'জুন',
    'জুলাই',
    'আগস্ট',
    'সেপ্টেম্বর',
    'অক্টোবর',
    'নভেম্বর',
    'ডিসেম্বর',
  ];

  const formattedDate = `${dayNames[target.getDay()]}, ${target.getDate()}ই ${monthNames[target.getMonth()]}`;

  return {
    dateLabelBn: formattedDate,
    timeLabelBn: timeStr,
    daysRemaining: daysDiff,
  };
}

const VENDOR_ONBOARDING_15_QUESTIONS: Array<{
  key: string;
  questionBn: string;
  placeholderBn: string;
}> = [
  {
    key: 'q1_business_name',
    questionBn: '১. প্রতিষ্ঠানের নাম ও ট্রেড লাইসেন্স/এনআইডি নম্বর কী?',
    placeholderBn: 'যেমন: রূপগঞ্জ উইভার্স, NID: 19922690001',
  },
  {
    key: 'q2_product_category',
    questionBn: '২. আপনার মূল পণ্যের ক্যাটাগরি ও নিজস্ব উৎপাদন কি না?',
    placeholderBn: 'হাতে বোনা জামদানি ও তাঁত শাড়ি (নিজস্ব কারখানা)',
  },
  {
    key: 'q3_consignment_agreement',
    questionBn: '৩. ১৮-দফা কনসাইনমেন্ট নীতিমালা (অগ্রিম ছাড়া পণ্য জমা ও বিক্রির পর পেমেন্ট)-এ সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্পূর্ণ সম্মত',
  },
  {
    key: 'q4_ownership_clause',
    questionBn: '৪. পণ্য বিক্রি না হওয়া পর্যন্ত মালিকানা সাপ্লায়ারের থাকবে—এই শর্তে সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্মত',
  },
  {
    key: 'q5_three_tier_pricing',
    questionBn: '৫. ৩-স্তরের মূল্য নির্ধারণ (কেনা দাম + আপনার লাভ = আপনার প্রদেয়)-এ সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্মত',
  },
  {
    key: 'q6_escrow_hold_days',
    questionBn: '৬. ডেলিভারির পর রিটার্ন যাচাইয়ের জন্য নির্ধারিত এসক্রো হোল্ড পিরিয়ড (যেমন ৭ দিন)-এ সম্মত কি?',
    placeholderBn: 'হ্যাঁ, ৭ দিন হোল্ড পিরিয়ডে সম্মত',
  },
  {
    key: 'q7_defect_liability',
    questionBn: '৭. উৎপাদনগত ত্রুটি বা নিম্নমানের কারণে রিটার্ন হলে সাপ্লায়ার লেজার থেকে সমন্বয়ে সম্মত কি?',
    placeholderBn: 'হ্যাঁ, ছবি/ভিডিও প্রমাণ সাপেক্ষে সম্মত',
  },
  {
    key: 'q8_qc_inspection',
    questionBn: '৮. গুদামে পণ্য পাঠানোর সময় ১০০% কিউসি (QC) ও ভিডিও রেকর্ডিং প্রক্রিয়ায় সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্মত',
  },
  {
    key: 'q9_lead_time_days',
    questionBn: '৯. স্টক শেষের সতর্কতা পাওয়ার পর কত দিনের মধ্যে নতুন স্টক পাঠাতে পারবেন (Lead Time)?',
    placeholderBn: '৩ কার্যদিবসের মধ্যে',
  },
  {
    key: 'q10_packaging_standard',
    questionBn: '১০. প্রতিটি পণ্যে আপনার ইন্টারনাল ভেন্ডর SKU ট্যাগ সংযুক্ত করে পাঠাতে পারবেন কি?',
    placeholderBn: 'হ্যাঁ, প্রতিটি পিসে SKU স্টিকার থাকবে',
  },
  {
    key: 'q11_no_direct_customer_contact',
    questionBn: '১১. গ্রাহকের সাথে সরাসরি যোগাযোগ বা নিজস্ব ব্র্যান্ড লিফলেট পার্সেলে না দেওয়ার শর্তে সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্পূর্ণ সম্মত (হোয়াইট-লেবেল কনসাইনমেন্ট)',
  },
  {
    key: 'q12_payout_schedule',
    questionBn: '১২. হোল্ড পিরিয়ড শেষে মিনিমাম ৫০০ টাকা Available হলে পেআউট রিকোয়েস্ট প্রসেসে সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্মত',
  },
  {
    key: 'q13_post_payout_clawback',
    questionBn: '১৩. পেআউটের পর লুকানো উৎপাদন ত্রুটি প্রমাণিত হলে পরবর্তী বিল থেকে সমন্বয়ে (Clawback) সম্মত কি?',
    placeholderBn: 'হ্যাঁ, সম্মত',
  },
  {
    key: 'q14_unsold_stock_withdrawal',
    questionBn: '১৪. অবিক্রিত পণ্য ফেরত নিতে হলে ৭ দিন আগে নোটিশ দেওয়ার নিয়মে সম্মত কি?',
    placeholderBn: 'হ্যাঁ, ৭ দিন আগে লিখিত নোটিশ দেবো',
  },
  {
    key: 'q15_contract_closure_audit',
    questionBn: '১৫. চুক্তি সমাপ্তির আগে সব পেন্ডিং অর্ডার ও স্টক শূন্য হওয়ার চূড়ান্ত অডিটে সম্মত কি?',
    placeholderBn: 'হ্যাঁ, চূড়ান্ত অডিট সাপেক্ষে চুক্তি সমাপ্তিতে সম্মত',
  },
];

// ============================================================================
// 1. COURIER 360, PICKUP BATCH MANIFEST, REMITTANCE & DELIVERY RATES PANEL
// ============================================================================

export interface Courier360AndRatesPanelProps {
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  isVendor: boolean;
  brandNameBn: string;
  courier360: Courier360ProviderSummary[];
  pickupBatches: PickupBatchRecord[];
  remittanceLedger: CourierRemittanceLedgerRecord[];
  courierClaims: CourierClaimRecord[];
  districtRates: DistrictRateOverrideRecord[];
  availableOrderNos: string[];
  orders?: Array<Partial<OrderGridRowDTO>>;
  onRefreshWorkspace: () => Promise<void>;
}

export type Courier360SubTab =
  | 'overview'
  | 'parcels'
  | 'remittance_form'
  | 'remittance_ledger'
  | 'manifests_and_claims'
  | 'district_rates';

export function Courier360AndRatesPanel({
  locale,
  isSuperAdmin,
  isVendor,
  brandNameBn,
  courier360,
  pickupBatches,
  remittanceLedger,
  courierClaims,
  districtRates,
  availableOrderNos,
  orders = [],
  onRefreshWorkspace,
}: Courier360AndRatesPanelProps) {
  const [subTab, setSubTab] = React.useState<Courier360SubTab>('overview');
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Search & Filter State for Parcel List
  const [parcelSearchQuery, setParcelSearchQuery] = React.useState('');
  const [parcelCourierFilter, setParcelCourierFilter] =
    React.useState<string>('all');
  const [parcelStatusFilter, setParcelStatusFilter] =
    React.useState<string>('all');

  // Pickup Batch Form State
  const [batchCourier, setBatchCourier] =
    React.useState<CourierProvider>('steadfast');
  const [riderName, setRiderName] = React.useState('মোঃ সাইফুল ইসলাম');
  const [riderPhone, setRiderPhone] = React.useState('01755667788');

  // Remittance Settlement Form State (Enhanced)
  const [remRef, setRemRef] = React.useState(
    `STF-REM-${new Date().toISOString().slice(2, 10).replace(/-/g, '')}`
  );
  const [remCourier, setRemCourier] =
    React.useState<CourierProvider>('steadfast');
  const [remOrderNo, setRemOrderNo] = React.useState(
    availableOrderNos[0] ?? 'ORD-261106-0001'
  );
  const [remExpectedCodTaka, setRemExpectedCodTaka] = React.useState('2450');
  const [remCourierFeeTaka, setRemCourierFeeTaka] = React.useState('60');
  const [remReceivedTaka, setRemReceivedTaka] = React.useState('2390');
  const [remPaymentMethod, setRemPaymentMethod] =
    React.useState<string>('Bank Transfer (ব্যাংক ট্রান্সফার)');
  const [remTrxId, setRemTrxId] = React.useState('TRX-STF-998811');
  const [remProofUrl, setRemProofUrl] = React.useState(
    'https://picsum.photos/seed/bankproof/600/400'
  );
  const [remNotes, setRemNotes] = React.useState('');

  // Proof Modal Viewer State
  const [viewingProofUrl, setViewingProofUrl] = React.useState<string | null>(
    null
  );
  React.useEffect(() => {
    if (!viewingProofUrl) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setViewingProofUrl(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [viewingProofUrl]);

  // Claim Form State
  const [claimOrderNo, setClaimOrderNo] = React.useState(
    availableOrderNos[0] ?? 'ORD-261106-0001'
  );
  const [claimCourier, setClaimCourier] =
    React.useState<CourierProvider>('steadfast');
  const [claimAmountTaka, setClaimAmountTaka] = React.useState('1250');
  const [claimReasonBn, setClaimReasonBn] = React.useState(
    'কুরিয়ার ট্রানজিটে পণ্য ক্ষতিগ্রস্ত হয়েছে।'
  );
  const [claimProofUrl, setClaimProofUrl] = React.useState(
    'https://picsum.photos/seed/claimproof/500/400'
  );

  // District Rate Override State
  const [selectedDistrictId, setSelectedDistrictId] =
    React.useState<number>(47);
  const selectedDistRecord =
    districtRates.find((d) => d.districtId === selectedDistrictId) ??
    districtRates[0];
  const [rateBase1KgTaka, setRateBase1KgTaka] = React.useState(
    String((selectedDistRecord?.base1KgPoisha ?? 6000) / 100)
  );
  const [rateExtraKgTaka, setRateExtraKgTaka] = React.useState(
    String((selectedDistRecord?.extraPerKgPoisha ?? 2000) / 100)
  );
  const [rateBdPostKgTaka, setRateBdPostKgTaka] = React.useState(
    String((selectedDistRecord?.bdPostPerKgPoisha ?? 1000) / 100)
  );
  const [rateFreeDist, setRateFreeDist] = React.useState(
    Boolean(selectedDistRecord?.isFreeDeliveryDistrict)
  );

  const handleDistrictSelectionChange = (dId: number) => {
    setSelectedDistrictId(dId);
    const found = districtRates.find((d) => d.districtId === dId);
    if (found) {
      setRateBase1KgTaka(String(found.base1KgPoisha / 100));
      setRateExtraKgTaka(String(found.extraPerKgPoisha / 100));
      setRateBdPostKgTaka(String(found.bdPostPerKgPoisha / 100));
      setRateFreeDist(found.isFreeDeliveryDistrict);
    }
  };

  // Pre-fill Remittance Form for a specific order
  const handleTriggerOrderRemittance = (ord: Partial<OrderGridRowDTO>) => {
    setRemOrderNo(ord.orderNo ?? 'ORD-261106-0001');
    setRemCourier(ord.courierProvider ?? 'steadfast');
    const expectedCod = (ord.codCollectablePoisha ?? 0) / 100;
    const estFee = 60;
    setRemExpectedCodTaka(String(expectedCod));
    setRemCourierFeeTaka(String(estFee));
    setRemReceivedTaka(String(Math.max(0, expectedCod - estFee)));
    setSubTab('remittance_form');
  };

  // Pre-fill Claim Form for a specific order
  const handleTriggerOrderClaim = (ord: Partial<OrderGridRowDTO>) => {
    setClaimOrderNo(ord.orderNo ?? 'ORD-261106-0001');
    setClaimCourier(ord.courierProvider ?? 'steadfast');
    setClaimAmountTaka(String((ord.codCollectablePoisha ?? 0) / 100));
    setSubTab('manifests_and_claims');
  };

  // Filtered Parcel Orders List
  const filteredParcels = orders.filter((o) => {
    const matchesSearch =
      !parcelSearchQuery ||
      (o.orderNo ?? '').toLowerCase().includes(parcelSearchQuery.toLowerCase()) ||
      (o.customerName ?? '').toLowerCase().includes(parcelSearchQuery.toLowerCase()) ||
      (o.customerPhone ?? '').includes(parcelSearchQuery) ||
      (o.trackingCode ?? '').includes(parcelSearchQuery);

    const matchesCourier =
      parcelCourierFilter === 'all' || o.courierProvider === parcelCourierFilter;

    const matchesStatus =
      parcelStatusFilter === 'all' ||
      (parcelStatusFilter === 'in_transit' &&
        (o.status === 'packed' ||
          o.status === 'shipped' ||
          o.status === 'out_for_delivery')) ||
      (parcelStatusFilter === 'delivered_unsettled' &&
        o.status === 'delivered' &&
        o.paymentStatus !== 'remitted') ||
      (parcelStatusFilter === 'remitted' && o.paymentStatus === 'remitted') ||
      (parcelStatusFilter === 'returned' &&
        (o.status === 'returned' || o.status === 'return_initiated'));

    return matchesSearch && matchesCourier && matchesStatus;
  });

  // Calculate Aggregated Metrics across all couriers
  const totalInTransitCodPoisha = courier360.reduce(
    (sum, c) => sum + c.inTransitCodPoisha,
    0
  );
  const totalDeliveredUnsettledCodPoisha = courier360.reduce(
    (sum, c) => sum + c.deliveredUnsettledCodPoisha,
    0
  );
  const totalSettledRemittedPoisha = courier360.reduce(
    (sum, c) => sum + c.settledRemittedPoisha,
    0
  );
  const totalShortPaymentPoisha = courier360.reduce(
    (sum, c) => sum + c.shortPaymentTotalPoisha,
    0
  );

  return (
    <section className="space-y-6">
      {/* Page Header Strip */}
      <div className="border-b border-border pb-3 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink flex items-center gap-2">
            <Truck className="w-5 h-5 text-ink" aria-hidden="true" />
            <span>
              {locale === 'bn'
                ? 'কুরিয়ার ৩৬০, ফাইনান্সিয়াল পাওনা ও লজিস্টিক্স হাব'
                : 'Courier 360 Financial & Logistics Hub'}
            </span>
          </h1>
          <p className="text-xs text-muted">
            {locale === 'bn'
              ? 'কুরিয়ারভিত্তিক বকেয়া পাওনা, পার্সেল ও প্রোডাক্ট ট্র্যাকিং, রেমিট্যান্স জমা ও পেমেন্ট প্রুফ ভল্ট, শর্ট-পেমেন্ট ক্লেইম এবং ৬৪ জেলার রেট।'
              : 'Courier receivables, parcel tracking, remittance proof vault, short-payment claims and 64-district delivery rates.'}
          </p>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={onRefreshWorkspace}
          leftIcon={<RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />}
        >
          {locale === 'bn' ? 'ডাটা রিফ্রেশ করুন' : 'Refresh Data'}
        </Button>
      </div>

      {feedback && (
        <div
          className={`p-3 border rounded-[var(--radius-md)] bg-surface text-xs font-semibold flex items-center justify-between ${
            feedback.type === 'success'
              ? 'border-success text-success'
              : 'border-danger text-danger'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline cursor-pointer text-ink"
          >
            <LocalizedText source={"বন্ধ করুন"} area="admin" />{" "}</button>
        </div>
      )}

      {/* Top Aggregated Financial Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-1">
          <p className="text-xs text-muted font-medium">
            {locale === 'bn' ? 'ইন-ট্রানজিট মোট COD' : 'Total In-Transit COD'}
          </p>
          <p className="font-mono font-bold text-base text-ink">
            {formatPoishaToBdt(totalInTransitCodPoisha, locale)}
          </p>
          <p className="text-[10px] text-muted">
            {locale === 'bn' ? 'কুরিয়ারের পথে আছে' : 'On the road with courier'}
          </p>
        </div>

        <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-1">
          <p className="text-xs text-muted font-medium">
            {locale === 'bn' ? 'ডেলিভারড (পাওনা সিওডি)' : 'Delivered (Pending COD)'}
          </p>
          <p className="font-mono font-bold text-base text-warning">
            {formatPoishaToBdt(totalDeliveredUnsettledCodPoisha, locale)}
          </p>
          <p className="text-[10px] text-muted">
            {locale === 'bn' ? 'টাকা ব্যাংক/MFS-এ জমা বাকি' : 'Pending bank/MFS settlement'}
          </p>
        </div>

        <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-1">
          <p className="text-xs text-muted font-medium">
            {locale === 'bn' ? 'মোট প্রাপ্ত রেমিট্যান্স' : 'Total Settled Remittance'}
          </p>
          <p className="font-mono font-bold text-base text-success">
            {formatPoishaToBdt(totalSettledRemittedPoisha, locale)}
          </p>
          <p className="text-[10px] text-muted">
            {locale === 'bn' ? 'হিসাবে সেটেলড সম্পন্ন' : 'Settled to company accounts'}
          </p>
        </div>

        <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-1">
          <p className="text-xs text-muted font-medium">
            {locale === 'bn' ? 'শর্ট-পেমেন্ট ও ক্লেইম' : 'Short-Payment & Claims'}
          </p>
          <p className="font-mono font-bold text-base text-danger">
            {formatPoishaToBdt(totalShortPaymentPoisha, locale)}
          </p>
          <p className="text-[10px] text-muted">
            {locale === 'bn' ? 'ঘাটতি/বিরোধ ফ্ল্যাগযুক্ত' : 'Disputes & deficit flagged'}
          </p>
        </div>
      </div>

      {/* Modular Sub-Navigation Tabs */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-border pb-1 text-xs font-semibold">
        <button
          type="button"
          onClick={() => setSubTab('overview')}
          className={`px-3 py-2 rounded-[var(--radius-md)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            subTab === 'overview'
              ? 'bg-ink text-surface shadow-sm'
              : 'text-muted hover:text-ink hover:bg-surface'
          }`}
        >
          <Truck className="w-4 h-4" />
          <span>{locale === 'bn' ? '১. কুরিয়ার ওভারভিউ ও পূর্বাভাস' : '1. Overview & Schedule'}</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('parcels')}
          className={`px-3 py-2 rounded-[var(--radius-md)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            subTab === 'parcels'
              ? 'bg-ink text-surface shadow-sm'
              : 'text-muted hover:text-ink hover:bg-surface'
          }`}
        >
          <PackageCheck className="w-4 h-4" />
          <span>
            {locale === 'bn'
              ? `২. পার্সেল ও প্রোডাক্ট পাওনা তালিকা (${orders.length})`
              : `2. Parcel Receivables List (${orders.length})`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('remittance_form')}
          className={`px-3 py-2 rounded-[var(--radius-md)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            subTab === 'remittance_form'
              ? 'bg-ink text-surface shadow-sm'
              : 'text-muted hover:text-ink hover:bg-surface'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>{locale === 'bn' ? '৩. রেমিট্যান্স এন্ট্রি ও প্রুফ' : '3. Remittance Entry & Proof'}</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('remittance_ledger')}
          className={`px-3 py-2 rounded-[var(--radius-md)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            subTab === 'remittance_ledger'
              ? 'bg-ink text-surface shadow-sm'
              : 'text-muted hover:text-ink hover:bg-surface'
          }`}
        >
          <FileCheck className="w-4 h-4" />
          <span>{locale === 'bn' ? '৪. রেমিট্যান্স ইতিহাস ও প্রুফ ভল্ট' : '4. Remittance Vault & History'}</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('manifests_and_claims')}
          className={`px-3 py-2 rounded-[var(--radius-md)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            subTab === 'manifests_and_claims'
              ? 'bg-ink text-surface shadow-sm'
              : 'text-muted hover:text-ink hover:bg-surface'
          }`}
        >
          <Printer className="w-4 h-4" />
          <span>{locale === 'bn' ? '৫. পিকআপ ম্যানিফেস্ট ও ক্লেইম' : '5. Pickup Manifest & Claims'}</span>
        </button>

        <button
          type="button"
          onClick={() => setSubTab('district_rates')}
          className={`px-3 py-2 rounded-[var(--radius-md)] flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-colors ${
            subTab === 'district_rates'
              ? 'bg-ink text-surface shadow-sm'
              : 'text-muted hover:text-ink hover:bg-surface'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>{locale === 'bn' ? '৬. ৬৪ জেলার ডেলিভারি চার্জ' : '6. 64-District Delivery Rates'}</span>
        </button>
      </div>

      {/* ====================================================================
          SUB-TAB 1: COURIER 360 OVERVIEW & PREDICTED REMITTANCE SCHEDULE
         ==================================================================== */}
      {subTab === 'overview' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {courier360.map((c) => {
              const schedule = predictNextRemittanceSchedule(c.provider);
              return (
                <Card
                  key={c.provider}
                  surface="bg"
                  padding="md"
                  className="space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                    <div className="flex items-center gap-2">
                      <Truck className="w-4 h-4 text-ink" aria-hidden="true" />
                      <h2 className="text-sm font-bold text-ink">
                        {localizedField(c, "providerLabelBn", locale)}
                      </h2>
                    </div>
                    <Badge status={c.apiConnected ? 'success' : 'warning'}>
                      {localizedField(c, "connectionStatusBadgeBn", locale)}
                    </Badge>
                  </div>

                  {/* Predicted Next Payout Date & Time */}
                  <div className="p-2.5 rounded-[var(--radius-sm)] bg-surface border border-border flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <CalendarClock className="w-4 h-4 text-ink" />
                      <div>
                        <p className="text-[10px] text-muted">
                          <LocalizedText source={"পরবর্তী আনুমানিক পেআউট শিডিউল:"} area="admin" />{" "}</p>
                        <p className="font-bold text-ink">
                          {localizedField(schedule, "dateLabelBn", locale)} ({localizedField(schedule, "timeLabelBn", locale)})
                        </p>
                      </div>
                    </div>
                    <Badge status="info">
                      <LocalizedText source={"আর"} area="admin" />{" "}{schedule.daysRemaining} {" "}<LocalizedText source={"দিন বাকি"} area="admin" />{" "}</Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-surface">
                      <p className="text-muted text-[11px]"><LocalizedText source={"ইন-ট্রানজিট COD"} area="admin" /></p>
                      <p className="font-mono font-bold text-ink">
                        {formatPoishaToBdt(c.inTransitCodPoisha, locale)}
                      </p>
                      <p className="text-[10px] text-muted">
                        {formatLocaleNumber(c.inTransitCount, locale)} {" "}<LocalizedText source={"টি পার্সেল"} area="admin" />{" "}</p>
                    </div>

                    <div className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-surface">
                      <p className="text-muted text-[11px]">
                        <LocalizedText source={"ডেলিভারড (অনিষ্পন্ন)"} area="admin" />{" "}</p>
                      <p className="font-mono font-bold text-warning">
                        {formatPoishaToBdt(
                          c.deliveredUnsettledCodPoisha,
                          locale
                        )}
                      </p>
                      <p className="text-[10px] text-muted">
                        {formatLocaleNumber(c.deliveredUnsettledCount, locale)}{' '}
                        <LocalizedText source={"টি বাকি"} area="admin" />{" "}</p>
                    </div>

                    <div className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-surface">
                      <p className="text-muted text-[11px]"><LocalizedText source={"প্রাপ্ত রেমিট্যান্স"} area="admin" /></p>
                      <p className="font-mono font-bold text-success">
                        {formatPoishaToBdt(c.settledRemittedPoisha, locale)}
                      </p>
                      <p className="text-[10px] text-muted">
                        {formatLocaleNumber(c.settledCount, locale)} {" "}<LocalizedText source={"টি সেটেলড"} area="admin" />{" "}</p>
                    </div>

                    <div className="p-2.5 border border-border rounded-[var(--radius-sm)] bg-surface">
                      <p className="text-muted text-[11px]">
                        <LocalizedText source={"শর্ট-পেমেন্ট ও ক্লেইম"} area="admin" />{" "}</p>
                      <p className="font-mono font-bold text-danger">
                        {formatPoishaToBdt(
                          c.shortPaymentTotalPoisha + c.openClaimsPoisha,
                          locale
                        )}
                      </p>
                      <p className="text-[10px] text-muted">
                        <LocalizedText source={"ক্লেইম:"} area="admin" />{" "}{formatLocaleNumber(c.openClaimsCount, locale)}{' '}
                        <LocalizedText source={"টি"} area="admin" />{" "}</p>
                    </div>
                  </div>

                  {/* Aging Buckets (0-3 / 4-7 / 8-14 / 15+ Days) */}
                  <div className="pt-2 border-t border-border text-[11px] space-y-1">
                    <div className="flex items-center justify-between text-muted">
                      <span><LocalizedText source={"অনিষ্পন্ন বকেয়া বয়স (Aging Buckets):"} area="admin" /></span>
                      {c.oldestUnsettledOrderNo && (
                        <span className="font-mono text-ink">
                          <LocalizedText source={"সবচেয়ে পুরনো:"} area="admin" />{" "}{c.oldestUnsettledOrderNo} (
                          {formatLocaleNumber(c.oldestUnsettledDays, locale)}{' '}
                          <LocalizedText source={"দিন)"} area="admin" />{" "}</span>
                      )}
                    </div>
                    <div className="grid grid-cols-4 gap-1.5 font-mono text-center">
                      <div className="p-1.5 border border-border rounded-[var(--radius-sm)] bg-bg">
                        <div className="text-muted text-[10px]"><LocalizedText source={"০-৩ দিন"} area="admin" /></div>
                        <div className="font-bold text-ink">
                          {formatPoishaToBdt(
                            c.agingBuckets.days0to3Poisha,
                            locale
                          )}
                        </div>
                      </div>
                      <div className="p-1.5 border border-border rounded-[var(--radius-sm)] bg-bg">
                        <div className="text-muted text-[10px]"><LocalizedText source={"৪-৭ দিন"} area="admin" /></div>
                        <div className="font-bold text-ink">
                          {formatPoishaToBdt(
                            c.agingBuckets.days4to7Poisha,
                            locale
                          )}
                        </div>
                      </div>
                      <div className="p-1.5 border border-border rounded-[var(--radius-sm)] bg-bg">
                        <div className="text-muted text-[10px]"><LocalizedText source={"৮-১৪ দিন"} area="admin" /></div>
                        <div className="font-bold text-warning">
                          {formatPoishaToBdt(
                            c.agingBuckets.days8to14Poisha,
                            locale
                          )}
                        </div>
                      </div>
                      <div className="p-1.5 border border-border rounded-[var(--radius-sm)] bg-bg">
                        <div className="text-muted text-[10px]"><LocalizedText source={"১৫+ দিন"} area="admin" /></div>
                        <div className="font-bold text-danger">
                          {formatPoishaToBdt(
                            c.agingBuckets.days15PlusPoisha,
                            locale
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 2: PER-PARCEL & PRODUCT RECEIVABLES DETAILED LIST
         ==================================================================== */}
      {subTab === 'parcels' && (
        <Card surface="bg" padding="md" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <PackageCheck className="w-4 h-4 text-ink" />
                <span><LocalizedText source={"কুরিয়ারওয়ারি বিস্তারিত পার্সেল ও পাওনা তালিকা"} area="admin" /></span>
              </h2>
              <p className="text-xs text-muted">
                <LocalizedText source={"প্রতিটি কুরিয়ারে থাকা পার্সেল, গ্রাহকের ঠিকানা, ট্র্যাকিং কোড এবং প্রত্যাশিত সিওডি ও পেআউটের দিন দেখুন।"} area="admin" />{" "}</p>
            </div>
            <div className="font-mono text-xs text-muted">
              <LocalizedText source={"দেখাচ্ছে:"} area="admin" />{" "}<strong>{filteredParcels.length}</strong> / {orders.length} {" "}<LocalizedText source={"টি"} area="admin" />{" "}</div>
          </div>

          {/* Search & Filter Controls Bar */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted" />
              <input
                type="text"
                value={parcelSearchQuery}
                onChange={(e) => setParcelSearchQuery(e.target.value)}
                placeholder={uiText("অর্ডার নং, ফোন বা গ্রাহকের নাম দিয়ে খুঁজুন...", locale)}
                className="w-full pl-8 pr-3 py-1.5 bg-bg border border-border rounded-[var(--radius-md)] text-xs text-ink placeholder:text-muted"
              />
            </div>

            <div>
              <select
                aria-label={uiText("Filter by courier", locale)}
                value={parcelCourierFilter}
                onChange={(e) => setParcelCourierFilter(e.target.value)}
                className="w-full px-3 py-1.5 bg-bg text-ink border border-border rounded-[var(--radius-md)] text-xs"
              >
                <option value="all"><LocalizedText source={"সকল কুরিয়ার (Steadfast, Pathao, RedX...)"} area="admin" /></option>
                <option value="steadfast"><LocalizedText source={"Steadfast Courier"} area="admin" /></option>
                <option value="pathao"><LocalizedText source={"Pathao Courier"} area="admin" /></option>

                <option value="bd_post"><LocalizedText source={"BD Post (ডাক বিভাগ)"} area="admin" /></option>
              </select>
            </div>

            <div>
              <select
                aria-label={uiText("Filter by parcel status", locale)}
                value={parcelStatusFilter}
                onChange={(e) => setParcelStatusFilter(e.target.value)}
                className="w-full px-3 py-1.5 bg-bg text-ink border border-border rounded-[var(--radius-md)] text-xs font-medium"
              >
                <option value="all"><LocalizedText source={"সকল অবস্থা (All Statuses)"} area="admin" /></option>
                <option value="in_transit"><LocalizedText source={"ইন-ট্রানজিট (Packed/Shipped)"} area="admin" /></option>
                <option value="delivered_unsettled">
                  <LocalizedText source={"ডেলিভারড (অনিষ্পন্ন সিওডি)"} area="admin" />{" "}</option>
                <option value="remitted"><LocalizedText source={"রেমিট্যান্স প্রাপ্ত (Settled)"} area="admin" /></option>
                <option value="returned"><LocalizedText source={"রিটার্ন প্রক্রিয়ায়"} area="admin" /></option>
              </select>
            </div>
          </div>

          {/* Parcels List Table */}
          {filteredParcels.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-border rounded-[var(--radius-md)] text-muted text-xs">
              <LocalizedText source={"কোনো পার্সেল পাওয়া যায়নি। ফিল্টার পরিবর্তন করে চেষ্টা করুন।"} area="admin" />{" "}</div>
          ) : (
            <div className="space-y-3">
              {filteredParcels.map((ord) => {
                const schedule = predictNextRemittanceSchedule(
                  ord.courierProvider ?? 'steadfast',
                  ord.createdAt
                );
                const trackingUrl = getLiveCourierTrackingUrl(
                  ord.courierProvider ?? 'steadfast',
                  ord.trackingCode,
                  ord.consignmentId,
                  ord.orderNo
                );

                return (
                  <div
                    key={ord.id}
                    className="p-3.5 border border-border rounded-[var(--radius-md)] bg-bg space-y-3"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm text-ink">
                          {ord.orderNo}
                        </span>
                        <Badge status="info">
                          {(ord.courierProvider ?? 'steadfast').toUpperCase()}
                        </Badge>
                        <Badge
                          status={
                            ord.status === 'delivered'
                              ? 'success'
                              : ord.status === 'shipped' ||
                                ord.status === 'out_for_delivery'
                              ? 'warning'
                              : 'neutral'
                          }
                        >
                          {ord.status}
                        </Badge>
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <a
                          href={trackingUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="px-2.5 py-1 rounded-[var(--radius-sm)] border border-border bg-surface hover:bg-bg text-ink inline-flex items-center gap-1 font-medium transition-colors"
                        >
                          <ExternalLink className="w-3 h-3 text-ink" />
                          <span><LocalizedText source={"কুরিয়ার ট্র্যাকিং"} area="admin" /></span>
                        </a>

                        <button
                          type="button"
                          onClick={() => handleTriggerOrderRemittance(ord)}
                          className="px-2.5 py-1 rounded-[var(--radius-sm)] bg-emerald-600 hover:bg-emerald-700 text-white font-bold inline-flex items-center gap-1 transition-colors cursor-pointer"
                        >
                          <CreditCard className="w-3 h-3" />
                          <span><LocalizedText source={"রেমিট্যান্স এন্ট্রি"} area="admin" /></span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleTriggerOrderClaim(ord)}
                          className="px-2.5 py-1 rounded-[var(--radius-sm)] border border-rose-300 dark:border-rose-800 bg-rose-500/10 text-rose-700 dark:text-rose-400 font-medium hover:bg-rose-500/20 inline-flex items-center gap-1 cursor-pointer"
                        >
                          <AlertTriangle className="w-3 h-3" />
                          <span><LocalizedText source={"ক্লেইম দাখিল"} area="admin" /></span>
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div>
                        <p className="font-bold text-ink">{ord.customerName}</p>
                        <p className="font-mono text-muted text-[11px]">
                          {ord.customerPhone}
                        </p>
                        <p className="text-muted text-[11px]">
                          {localizedField(ord, "districtNameBn", locale)}, {ord.streetAddress}
                        </p>
                      </div>

                      <div className="space-y-1">
                        <p className="text-muted text-[11px]">
                          <LocalizedText source={"কুরিয়ার ট্র্যাকিং কোড:"} area="admin" />{' '}
                          <strong className="font-mono text-ink">
                            {ord.trackingCode ||
                              ord.consignmentId ||
                              'অপেক্ষমাণ'}
                          </strong>
                        </p>
                        <div className="flex items-center gap-1 text-[11px] text-muted">
                          <CalendarClock className="w-3.5 h-3.5 text-ink" />
                          <span>
                            <LocalizedText source={"পেআউট শিডিউল:"} area="admin" />{" "}<strong>{localizedField(schedule, "dateLabelBn", locale)}</strong>
                          </span>
                        </div>
                      </div>

                      <div className="p-2 rounded bg-surface border border-border text-right space-y-0.5">
                        <div className="flex justify-between text-muted text-[11px]">
                          <span><LocalizedText source={"প্রস্থানীয় COD:"} area="admin" /></span>
                          <span className="font-mono font-bold text-ink">
                            {formatPoishaToBdt(ord.codCollectablePoisha ?? 0, locale)}
                          </span>
                        </div>
                        <div className="flex justify-between text-muted text-[11px]">
                          <span><LocalizedText source={"অগ্রিম জমা:"} area="admin" /></span>
                          <span className="font-mono text-emerald-700 dark:text-emerald-400">
                            {formatPoishaToBdt(ord.advancePaidPoisha ?? 0, locale)}
                          </span>
                        </div>
                        <div className="flex justify-between font-bold text-xs pt-1 border-t border-border">
                          <span><LocalizedText source={"প্রাপ্য নিট:"} area="admin" /></span>
                          <span className="font-mono text-success">
                            {formatPoishaToBdt(
                              Math.max(0, (ord.codCollectablePoisha ?? 0) - 6000),
                              locale
                            )}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ====================================================================
          SUB-TAB 3: COD REMITTANCE SETTLEMENT & PAYMENT PROOF UPLOAD
         ==================================================================== */}
      {subTab === 'remittance_form' && (
        <Card surface="bg" padding="md" className="space-y-4 max-w-3xl mx-auto">
          <div className="border-b border-border pb-2">
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <CreditCard className="w-4 h-4" />
              <span><LocalizedText source={"কুরিয়ার সিওডি রেমিট্যান্স এন্ট্রি ও পেমেন্ট প্রুফ ফর্ম"} area="admin" /></span>
            </h2>
            <p className="text-xs text-muted">
              <LocalizedText source={"কুরিয়ার কোম্পানি থেকে ব্যাংকে বা বিকাশ/নগদে টাকা আসার পর এখানে এন্ট্রি দিন। সিস্টেম স্বয়ংক্রিয়ভাবে শর্ট-পেমেন্ট বা ঘাটতি চেক করবে।"} area="admin" />{" "}</p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const feePoisha = Math.round(
                (Number(remCourierFeeTaka) || 0) * 100
              );
              const remittedPoisha = Math.round(
                (Number(remReceivedTaka) || 0) * 100
              );

              const res = await fetch('/api/admin/workspace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  operation: 'settle_courier_remittance',
                  settlementRef: remRef,
                  courierProvider: remCourier,
                  items: [
                    {
                      orderNo: remOrderNo,
                      courierFeeDeductedPoisha: feePoisha,
                      remittedAmountPoisha: remittedPoisha,
                    },
                  ],
                }),
              });
              const data = (await res.json()) as {
                success: boolean;
                errorBn?: string;
                settledCount?: number;
                shortPaymentCount?: number;
              };
              if (data.success) {
                setFeedback({
                  type: 'success',
                  text: `রেমিট্যান্স সেটেল সম্পন্ন (${data.settledCount}টি অর্ডার, শর্ট-পেমেন্ট শনাক্ত: ${data.shortPaymentCount}টি)। ভেন্ডর লেজার ও প্রুফ ভল্ট আপডেট হয়েছে!`,
                });
                await onRefreshWorkspace();
                setSubTab('remittance_ledger');
              } else {
                setFeedback({
                  type: 'error',
                  text: data.errorBn ?? 'রেমিট্যান্স সেটেল করা যায়নি।',
                });
              }
            }}
            className="space-y-4 text-xs"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input
                label="সেটেলমেন্ট ইনভয়েস / রেফারেন্স *"
                value={remRef}
                onChange={(e) => setRemRef(e.target.value)}
                placeholder="STF-REM-261106"
                required
              />
              <div className="space-y-1.5">
                <label className="block font-medium text-ink">
                  <LocalizedText source={"কুরিয়ার কোম্পানি নির্বাচন *"} area="admin" />{" "}</label>
                <select
                  aria-label={uiText("Remittance courier", locale)}
                  value={remCourier}
                  onChange={(e) =>
                    setRemCourier(e.target.value as CourierProvider)
                  }
                  className="w-full min-h-[42px] px-3 py-1.5 bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                >
                  <option value="steadfast"><LocalizedText source={"Steadfast Courier"} area="admin" /></option>
                  <option value="pathao"><LocalizedText source={"Pathao Courier"} area="admin" /></option>

                  <option value="bd_post"><LocalizedText source={"BD Post (বাংলাদেশ ডাক বিভাগ)"} area="admin" /></option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <label className="block font-medium text-ink">
                  <LocalizedText source={"অর্ডার নম্বর নির্বাচন *"} area="admin" />{" "}</label>
                <select
                  aria-label={uiText("Order for remittance", locale)}
                  value={remOrderNo}
                  onChange={(e) => {
                    const selectedNo = e.target.value;
                    setRemOrderNo(selectedNo);
                    const found = orders.find((o) => o.orderNo === selectedNo);
                    if (found) {
                      const cod = (found.codCollectablePoisha ?? 0) / 100;
                      setRemExpectedCodTaka(String(cod));
                      setRemReceivedTaka(String(Math.max(0, cod - 60)));
                    }
                  }}
                  className="w-full min-h-[42px] px-3 py-1.5 bg-bg text-ink border border-border rounded-[var(--radius-md)] font-mono"
                >
                  {availableOrderNos.map((no) => (
                    <option key={no} value={no}>
                      {no}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="প্রত্যাশিত COD পরিমাণ (৳)"
                type="number"
                value={remExpectedCodTaka}
                onChange={(e) => setRemExpectedCodTaka(e.target.value)}
                required
              />

              <Input
                label="কুরিয়ার ফি কর্তন (৳)"
                type="number"
                value={remCourierFeeTaka}
                onChange={(e) => setRemCourierFeeTaka(e.target.value)}
                required
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="প্রাপ্ত নিট টাকা (৳) *"
                type="number"
                value={remReceivedTaka}
                onChange={(e) => setRemReceivedTaka(e.target.value)}
                required
              />

              <div className="space-y-1.5">
                <label className="block font-medium text-ink">
                  <LocalizedText source={"পেমেন্ট গ্রহণ মাধ্যম"} area="admin" />{" "}</label>
                <select
                  value={remPaymentMethod}
                  onChange={(e) => setRemPaymentMethod(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-1.5 bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                >
                  <option value="Bank Transfer (ব্যাংক ট্রান্সফার)">
                    <LocalizedText source={"ব্যাংক ট্রান্সফার (City/EBL/Dutch Bangla)"} area="admin" />{" "}</option>
                  <option value="bKash Merchant (বিকাশ)">
                    <LocalizedText source={"বিকাশ মার্চেন্ট (bKash)"} area="admin" />{" "}</option>
                  <option value="Nagad Merchant (নগদ)">
                    <LocalizedText source={"নগদ মার্চেন্ট (Nagad)"} area="admin" />{" "}</option>
                  <option value="Cheque / Cash (চেক/ক্যাশ)">
                    <LocalizedText source={"চেক বা নগদ ক্যাশ"} area="admin" />{" "}</option>
                </select>
              </div>

              <Input
                label="ব্যাংক / MFS Transaction ID (TrxID)"
                value={remTrxId}
                onChange={(e) => setRemTrxId(e.target.value)}
                placeholder="TRX99882211"
              />
            </div>

            <div className="space-y-1.5">
              <Input
                label="পেমেন্ট প্রুফ বা স্টেটমেন্টের লিংক (Bank Statement / Receipt Image URL)"
                value={remProofUrl}
                onChange={(e) => setRemProofUrl(e.target.value)}
                placeholder="https://... image or pdf link"
              />
              <p className="text-[10px] text-muted">
                <LocalizedText source={"কুরিয়ার থেকে প্রাপ্ত ব্যাংক স্টেটমেন্ট বা মেসেজের স্ক্রিনশট লিংক দিন যা ভল্টে সংরক্ষিত থাকবে।"} area="admin" />{" "}</p>
            </div>

            <Input
              label="অতিরিক্ত দ্রষ্টব্য / স্টাফ নোট"
              value={remNotes}
              onChange={(e) => setRemNotes(e.target.value)}
              placeholder={uiText("যেমন: স্টেটমেন্ট ট্রানজেকশন আইডিসহ ভেরিফাইড", locale)}
            />

            {/* Live Short-Payment Auto-Detector Banner */}
            {(() => {
              const expected = Number(remExpectedCodTaka) || 0;
              const fee = Number(remCourierFeeTaka) || 0;
              const received = Number(remReceivedTaka) || 0;
              const expectedNet = expected - fee;
              const diff = expectedNet - received;

              if (diff > 0) {
                return (
                  <div className="p-3 border border-rose-300 dark:border-rose-800 rounded-[var(--radius-md)] bg-rose-500/10 text-rose-700 dark:text-rose-400 font-semibold space-y-1">
                    <div className="flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4" />
                      <span>
                        <LocalizedText source={"⚠️ টাকা কম পাওয়া গেছে! (ঘাটতি: ৳"} area="admin" />{diff.toFixed(2)})
                      </span>
                    </div>
                    <p className="text-[11px] font-normal">
                      <LocalizedText source={"কুরিয়ারের দেওয়ার কথা ছিল ৳"} area="admin" />{expectedNet} {" "}<LocalizedText source={"(COD ৳"} area="admin" />{expected} {" "}<LocalizedText source={"- ফি ৳"} area="admin" />{fee}<LocalizedText source={"), কিন্তু পাওয়া গেছে ৳"} area="admin" />{received}<LocalizedText source={"। সিস্টেম এটি শর্ট-পেমেন্ট হিসেবে ফ্ল্যাগ করবে।"} area="admin" />{" "}</p>
                  </div>
                );
              }

              return (
                <div className="p-3 border border-emerald-300 dark:border-emerald-800 rounded-[var(--radius-md)] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span><LocalizedText source={"✓ রেমিট্যান্সের পরিমাণ হুবহু মিলেছে!"} area="admin" /></span>
                </div>
              );
            })()}

            <Button
              type="submit"
              variant="primary"
              size="md"
              className="w-full"
            >
              <LocalizedText source={"রেমিট্যান্স রিসিভড মার্ক, পেমেন্ট প্রুফ সেভ ও লেজার আপডেট করুন"} area="admin" />{" "}</Button>
          </form>
        </Card>
      )}

      {/* ====================================================================
          SUB-TAB 4: REMITTANCE LEDGER & PAYMENT PROOF VAULT
         ==================================================================== */}
      {subTab === 'remittance_ledger' && (
        <Card surface="bg" padding="md" className="space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-2">
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <FileCheck className="w-4 h-4" />
                <span><LocalizedText source={"কুরিয়ার রেমিট্যান্স ইতিহাস ও প্রমাণপত্র ভল্ট"} area="admin" /></span>
              </h2>
              <p className="text-xs text-muted">
                <LocalizedText source={"অপরিবর্তনীয় (Immutable Append-Only) রেমিট্যান্স রেজিস্টার ও ব্যাংক স্টেটমেন্ট ফাইল।"} area="admin" />{" "}</p>
            </div>
            <Badge status="info"><LocalizedText source={"IMMUTABLE LEDGER"} area="admin" /></Badge>
          </div>

          <div className="border border-border rounded-[var(--radius-md)] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-muted">
                  <th className="p-2.5"><LocalizedText source={"রেফারেন্স ও অর্ডার"} area="admin" /></th>
                  <th className="p-2.5"><LocalizedText source={"পেমেন্ট মাধ্যম & TrxID"} area="admin" /></th>
                  <th className="p-2.5 text-right"><LocalizedText source={"প্রত্যাশিত COD"} area="admin" /></th>
                  <th className="p-2.5 text-right"><LocalizedText source={"কুরিয়ার ফি"} area="admin" /></th>
                  <th className="p-2.5 text-right"><LocalizedText source={"প্রাপ্ত নিট টাকা"} area="admin" /></th>
                  <th className="p-2.5 text-right"><LocalizedText source={"শর্ট-পেমেন্ট"} area="admin" /></th>
                  <th className="p-2.5 text-center"><LocalizedText source={"পেমেন্ট প্রুফ"} area="admin" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border font-mono">
                {remittanceLedger.map((r) => (
                  <tr key={r.id}>
                    <td className="p-2.5">
                      <div className="font-bold text-ink">{r.orderNo}</div>
                      <div className="text-[11px] text-muted">
                        {r.settlementRef} ({r.courierProvider})
                      </div>
                    </td>
                    <td className="p-2.5">
                      <div className="font-semibold text-ink">
                        <LocalizedText source={"Bank / bKash"} area="admin" />{" "}</div>
                      <div className="text-[11px] text-muted">
                        <LocalizedText source={"Trx: TRX-STF-998811"} area="admin" />{" "}</div>
                    </td>
                    <td className="p-2.5 text-right">
                      {formatPoishaToBdt(r.expectedCodPoisha, locale)}
                    </td>
                    <td className="p-2.5 text-right">
                      {formatPoishaToBdt(r.courierFeeDeductedPoisha, locale)}
                    </td>
                    <td className="p-2.5 text-right font-bold text-success">
                      {formatPoishaToBdt(r.remittedAmountPoisha, locale)}
                    </td>
                    <td className="p-2.5 text-right">
                      {r.isShortPaymentFlagged ? (
                        <Badge status="danger">
                          <LocalizedText source={"ঘাটতি:"} area="admin" />{" "}{formatPoishaToBdt(r.shortPaymentPoisha, locale)}
                        </Badge>
                      ) : (
                        <Badge status="success"><LocalizedText source={"সঠিক"} area="admin" /></Badge>
                      )}
                    </td>
                    <td className="p-2.5 text-center">
                      <button
                        type="button"
                        onClick={() =>
                          setViewingProofUrl(
                            'https://picsum.photos/seed/bankproof/600/400'
                          )
                        }
                        className="px-2 py-1 rounded-[var(--radius-sm)] border border-border bg-bg hover:bg-surface text-ink inline-flex items-center gap-1 text-[11px] cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        <span><LocalizedText source={"প্রমাণপত্র দেখুন"} area="admin" /></span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ====================================================================
          SUB-TAB 5: PICKUP BATCH MANIFESTS & COURIER DAMAGE CLAIMS
         ==================================================================== */}
      {subTab === 'manifests_and_claims' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            <Card surface="bg" padding="md" className="lg:col-span-5 space-y-4">
              <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-border pb-2">
                <PackageCheck className="w-4 h-4" aria-hidden="true" />
                <span><LocalizedText source={"পিকআপ ব্যাচ ও হ্যান্ডওভার ম্যানিফেস্ট জেনারেটর"} area="admin" /></span>
              </h2>
              <p className="text-xs text-muted">
                <LocalizedText source={"প্যাকড অর্ডারগুলোকে কুরিয়ার অনুযায়ী একত্রিত করে বারকোডসহ ম্যানিফেস্ট তৈরি করুন এবং রাইডারের স্বাক্ষর নিয়ে এক ক্লিকে সব অর্ডার"} area="admin" />{" "}<strong><LocalizedText source={"Shipped"} area="admin" /></strong> {" "}<LocalizedText source={"মার্ক করুন।"} area="admin" />{" "}</p>
              <div className="space-y-3 text-xs">
                <div className="space-y-1.5">
                  <label className="block font-medium text-ink">
                    <LocalizedText source={"কুরিয়ার নির্বাচন করুন"} area="admin" />{" "}</label>
                  <select
                    aria-label={uiText("Select courier for pickup batch", locale)}
                    value={batchCourier}
                    onChange={(e) =>
                      setBatchCourier(e.target.value as CourierProvider)
                    }
                    className="w-full min-h-[40px] px-3 py-1.5 bg-bg text-ink border border-border rounded-[var(--radius-md)]"
                  >
                    <option value="steadfast"><LocalizedText source={"Steadfast Courier"} area="admin" /></option>
                    <option value="pathao"><LocalizedText source={"Pathao Courier"} area="admin" /></option>

                    <option value="bd_post">
                      <LocalizedText source={"বাংলাদেশ ডাক বিভাগ (BD Post)"} area="admin" />{" "}</option>
                  </select>
                </div>

                <Button
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={async () => {
                    const res = await fetch('/api/admin/workspace', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        operation: 'create_pickup_batch',
                        courierProvider: batchCourier,
                        orderNos: availableOrderNos,
                      }),
                    });
                    const data = (await res.json()) as {
                      success: boolean;
                      errorBn?: string;
                      batch?: PickupBatchRecord;
                    };
                    if (data.success && data.batch) {
                      setFeedback({
                        type: 'success',
                        text: `পিকআপ ব্যাচ ${data.batch.batchCode} (${data.batch.totalParcels} টি পার্সেল) তৈরি হয়েছে!`,
                      });
                      await onRefreshWorkspace();
                    } else {
                      setFeedback({
                        type: 'error',
                        text: data.errorBn ?? 'পিকআপ ব্যাচ তৈরি করা যায়নি।',
                      });
                    }
                  }}
                >
                  <LocalizedText source={"পিকআপ ব্যাচ ও হ্যান্ডওভার ম্যানিফেস্ট জেনারেট করুন"} area="admin" />{" "}</Button>
              </div>
            </Card>

            {/* Printable Handover Manifest List */}
            <Card
              surface="surface"
              padding="md"
              className="lg:col-span-7 space-y-4"
            >
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h2 className="text-base font-bold text-ink">
                  <LocalizedText source={"হ্যান্ডওভার ম্যানিফেস্ট শীট ("} area="admin" />{pickupBatches.length})
                </h2>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  leftIcon={
                    <Printer className="w-3.5 h-3.5" aria-hidden="true" />
                  }
                >
                  <LocalizedText source={"ম্যানিফেস্ট প্রিন্ট"} area="admin" />{" "}</Button>
              </div>

              {pickupBatches.length === 0 ? (
                <p className="text-xs text-muted py-4">
                  <LocalizedText source={"এখনো কোনো পিকআপ ব্যাচ তৈরি করা হয়নি। বাম পাশের বাটনে ক্লিক করে ব্যাচ তৈরি করুন।"} area="admin" />{" "}</p>
              ) : (
                <div className="space-y-3 text-xs">
                  {pickupBatches.map((batch) => (
                    <div
                      key={batch.batchId}
                      className="p-3.5 border border-border rounded-[var(--radius-md)] bg-bg space-y-3"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                        <div>
                          <p className="font-mono font-bold text-sm text-ink">
                            {batch.batchCode} · {batch.courierProvider.toUpperCase()}
                          </p>
                          <p className="text-muted">
                            <LocalizedText source={"মোট পার্সেল:"} area="admin" />{' '}
                            <strong>
                              {formatLocaleNumber(batch.totalParcels, locale)}
                            </strong>{' '}
                            <LocalizedText source={"টি · মোট সিওডি:"} area="admin" />{' '}
                            <strong className="font-mono">
                              {formatPoishaToBdt(batch.totalCodPoisha, locale)}
                            </strong>
                          </p>
                        </div>
                        <Code128BarcodeSvg
                          value={batch.batchCode}
                          height={32}
                        />
                      </div>

                      <div className="font-mono text-[11px] text-muted">
                        <LocalizedText source={"অর্ডারসমূহ:"} area="admin" />{" "}{batch.orderNos.join(', ')}
                      </div>

                      {batch.status === 'ready_for_handover' ? (
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-2 border-t border-border items-end">
                          <Input
                            label="রাইডারের নাম"
                            value={riderName}
                            onChange={(e) => setRiderName(e.target.value)}
                          />
                          <Input
                            label="রাইডারের ফোন"
                            value={riderPhone}
                            onChange={(e) => setRiderPhone(e.target.value)}
                          />
                          <Button
                            variant="primary"
                            size="sm"
                            onClick={async () => {
                              const res = await fetch('/api/admin/workspace', {
                                method: 'POST',
                                headers: {
                                  'Content-Type': 'application/json',
                                },
                                body: JSON.stringify({
                                  operation: 'confirm_batch_handover',
                                  batchId: batch.batchId,
                                  riderName,
                                  riderPhone,
                                }),
                              });
                              if (res.ok) {
                                setFeedback({
                                  type: 'success',
                                  text: `ব্যাচ ${batch.batchCode} হ্যান্ডওভার সম্পন্ন এবং সব অর্ডার Shipped মার্ক হয়েছে!`,
                                });
                                await onRefreshWorkspace();
                              }
                            }}
                          >
                            <LocalizedText source={"সই নিশ্চিত ও সব Shipped মার্ক করুন"} area="admin" />{" "}</Button>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between pt-2 border-t border-border text-[11px]">
                          <Badge status="success">
                            <LocalizedText source={"হস্তান্তরিত (Shipped) — রাইডার:"} area="admin" />{" "}{batch.riderName} (
                            {batch.riderPhone})
                          </Badge>
                          <span className="text-muted">
                            {brandNameBn} {" "}<LocalizedText source={"ওয়্যারহাউস স্বাক্ষরিত"} area="admin" />{" "}</span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          {/* Courier Claim Tracker */}
          <Card surface="bg" padding="md" className="space-y-4">
            <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-border pb-2">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span><LocalizedText source={"কুরিয়ার ড্যামেজ ও লস্ট পার্সেল ক্লেইম ম্যানেজার"} area="admin" /></span>
            </h2>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                setFeedback({
                  type: 'success',
                  text: `অর্ডার ${claimOrderNo}-এর জন্য ৳${claimAmountTaka} টাকার কুরিয়ার ক্লেইম রেজিস্টার্ড হয়েছে!`,
                });
              }}
              className="grid grid-cols-1 sm:grid-cols-4 gap-3 text-xs items-end"
            >
              <div className="space-y-1.5">
                <label className="block font-medium text-ink"><LocalizedText source={"অর্ডার নম্বর"} area="admin" /></label>
                <select
                  value={claimOrderNo}
                  onChange={(e) => setClaimOrderNo(e.target.value)}
                  className="w-full min-h-[42px] px-3 py-1.5 bg-bg text-ink border border-border rounded-[var(--radius-md)] font-mono"
                >
                  {availableOrderNos.map((no) => (
                    <option key={no} value={no}>
                      {no}
                    </option>
                  ))}
                </select>
              </div>

              <Input
                label="ক্লেইম টাকার পরিমাণ (৳)"
                type="number"
                value={claimAmountTaka}
                onChange={(e) => setClaimAmountTaka(e.target.value)}
                required
              />

              <Input
                label="ক্ষতির বিবরণ / কারণ"
                value={claimReasonBn}
                onChange={(e) => setClaimReasonBn(e.target.value)}
                required
              />

              <Button type="submit" variant="primary" size="md">
                <LocalizedText source={"ক্লেইম ফাইল করুন"} area="admin" />{" "}</Button>
            </form>

            <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] text-xs">
              {courierClaims.map((clm) => (
                <div
                  key={clm.claimId}
                  className="p-3 bg-surface flex flex-wrap items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-mono font-bold text-ink">
                      {clm.claimId} ({clm.orderNo})
                    </span>{' '}
                    — <span>{clm.reasonBn}</span>
                  </div>
                  <div className="flex items-center gap-2 font-mono">
                    <span className="font-bold text-danger">
                      <LocalizedText source={"দাবি:"} area="admin" />{" "}{formatPoishaToBdt(clm.claimAmountPoisha, locale)}
                    </span>
                    <Badge status="warning">{clm.status}</Badge>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 6: 64-DISTRICT DELIVERY RATE TABLE EDITOR
         ==================================================================== */}
      {subTab === 'district_rates' && isSuperAdmin && (
        <Card surface="bg" padding="md" className="space-y-4">
          <div className="border-b border-border pb-2">
            <h2 className="text-base font-bold text-ink">
              <LocalizedText source={"৬৪ জেলার ডেলিভারি রেট টেবিল ও ফ্রি ডেলিভারি ওভাররাইড (Module C)"} area="admin" />{" "}</h2>
            <p className="text-xs text-muted">
              <LocalizedText source={"যেকোনো জেলার কুরিয়ার হোম ডেলিভারি (প্রথম ১ কেজি ও অতিরিক্ত প্রতি কেজি) এবং বাংলাদেশ ডাক বিভাগের (BD Post per-kg) রেট পরিবর্তন করুন।"} area="admin" />{" "}</p>
          </div>

          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await fetch('/api/admin/workspace', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  operation: 'upsert_district_rate',
                  districtId: selectedDistrictId,
                  base1KgPoisha: Math.round((Number(rateBase1KgTaka) || 0) * 100),
                  extraPerKgPoisha: Math.round(
                    (Number(rateExtraKgTaka) || 0) * 100
                  ),
                  bdPostPerKgPoisha: Math.round(
                    (Number(rateBdPostKgTaka) || 0) * 100
                  ),
                  isFreeDeliveryDistrict: rateFreeDist,
                }),
              });
              if (res.ok) {
                setFeedback({
                  type: 'success',
                  text: 'নির্বাচিত জেলার ডেলিভারি চার্জ সফলভাবে আপডেট হয়েছে।',
                });
                await onRefreshWorkspace();
              }
            }}
            className="grid grid-cols-1 sm:grid-cols-5 gap-3 items-end text-xs"
          >
            <div className="space-y-1.5">
              <label className="block font-medium text-ink"><LocalizedText source={"জেলা নির্বাচন"} area="admin" /></label>
              <select
                aria-label={uiText("Select district to edit rate", locale)}
                value={selectedDistrictId}
                onChange={(e) =>
                  handleDistrictSelectionChange(Number(e.target.value))
                }
                className="w-full min-h-[42px] px-3 py-1.5 bg-bg text-ink border border-border rounded-[var(--radius-md)]"
              >
                {districtRates.map((d) => (
                  <option key={d.districtId} value={d.districtId}>
                    {localizedField(d, "districtNameBn", locale)} ({d.districtNameEn})
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="কুরিয়ার ১ কেজি রেট (৳)"
              type="number"
              value={rateBase1KgTaka}
              onChange={(e) => setRateBase1KgTaka(e.target.value)}
              required
            />

            <Input
              label="অতিরিক্ত প্রতি কেজি (৳)"
              type="number"
              value={rateExtraKgTaka}
              onChange={(e) => setRateExtraKgTaka(e.target.value)}
              required
            />

            <Input
              label="ডাক বিভাগ প্রতি কেজি (৳)"
              type="number"
              value={rateBdPostKgTaka}
              onChange={(e) => setRateBdPostKgTaka(e.target.value)}
              required
            />

            <div className="flex flex-col gap-2">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rateFreeDist}
                  onChange={(e) => setRateFreeDist(e.target.checked)}
                  className="accent-ink"
                />
                <span><LocalizedText source={"এই জেলায় ফ্রি ডেলিভারি"} area="admin" /></span>
              </label>
              <Button type="submit" variant="primary" size="sm">
                <LocalizedText source={"রেট সংরক্ষণ করুন"} area="admin" />{" "}</Button>
            </div>
          </form>
        </Card>
      )}

      {/* Payment Proof Viewer Modal */}
      {viewingProofUrl && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface border border-border rounded-[var(--radius-lg)] p-4 max-w-xl w-full max-h-[calc(100dvh-2rem)] overflow-y-auto space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-bold text-ink text-sm flex items-center gap-2">
                <FileCheck className="w-4 h-4" />
                <span><LocalizedText source={"পেমেন্ট প্রুফ ও ব্যাংক স্টেটমেন্ট ফাইল"} area="admin" /></span>
              </h3>
              <button
                type="button"
                onClick={() => setViewingProofUrl(null)}
                className="text-muted hover:text-ink font-bold text-xs cursor-pointer"
              >
                <LocalizedText source={"✕ বন্ধ করুন"} area="admin" />{" "}</button>
            </div>
            <div className="aspect-video bg-bg rounded-[var(--radius-md)] overflow-hidden border border-border flex items-center justify-center">
              {/* eslint-disable-next-html-element-for-img */}
              <img
                src={viewingProofUrl}
                alt="Payment Proof"
                className="w-full h-full object-cover"
              />
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-muted font-mono">
                {viewingProofUrl}
              </span>
              <a
                href={viewingProofUrl}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 bg-ink text-surface font-semibold rounded-[var(--radius-sm)] flex items-center gap-1"
              >
                <ExternalLink className="w-3 h-3" />
                <span><LocalizedText source={"ফুল ভিউতে খুলুন"} area="admin" /></span>
              </a>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================================
// 2. VENDOR ESCROW LEDGER, 4-WAY RETURN, PAYOUTS & 15Q ONBOARDING PANEL
// ============================================================================

function getCourierBadgeStyle(provider?: CourierProvider | null): { bg: string; label: string } {
  switch (provider) {
    case 'steadfast':
      return { bg: 'bg-slate-900 text-white', label: 'Steadfast' };
    case 'pathao':
      return { bg: 'bg-rose-600 text-white', label: 'Pathao' };
    case 'redx':
      return { bg: 'bg-red-600 text-white', label: 'RedX' };
    case 'bd_post':
      return { bg: 'bg-emerald-700 text-white', label: 'ডাক বিভাগ' };
    default:
      return { bg: 'bg-slate-700 text-white', label: 'ম্যানুয়াল' };
  }
}

export interface VendorEscrowAndReturnPanelProps {
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  isVendor: boolean;
  brandNameBn: string;
  minPayoutPoisha: number;
  vendors: Array<{
    profile: VendorProfileRecord;
    balance: VendorEscrowBalance;
  }>;
  ledgerEntries: ImmutableVendorLedgerRecord[];
  payoutRequests: VendorPayoutRequestRecord[];
  returnResolutions: ReturnResolutionRecord[];
  availableOrderNos: string[];
  products?: Product360VariantDTO[];
  orders?: OrderGridRowDTO[];
  onRefreshWorkspace: () => Promise<void>;
}

export function VendorEscrowAndReturnPanel({
  locale,
  isSuperAdmin,
  isVendor,
  brandNameBn,
  minPayoutPoisha,
  vendors,
  ledgerEntries,
  payoutRequests,
  returnResolutions,
  availableOrderNos,
  products,
  orders,
  onRefreshWorkspace,
}: VendorEscrowAndReturnPanelProps) {
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [activeSubTab, setActiveSubTab] = React.useState<
    'overview' | 'ledger' | 'returns' | 'payouts'
  >('overview');

  // Profile Type / Status Filter for Vendor Directory
  const [vendorProfileTypeFilter, setVendorProfileTypeFilter] = React.useState<
    'all' | 'active' | 'pending_onboarding' | 'suspended_or_closing'
  >('all');

  const [selectedVendorId, setSelectedVendorId] = React.useState<string>(
    vendors[0]?.profile.vendorId ?? '00000000-0000-4000-8000-000000000901'
  );
  const activeVendorSummary =
    vendors.find((v) => v.profile.vendorId === selectedVendorId) ?? vendors[0];

  // Vendor Dossier Inspection State
  const [inspectingVendorId, setInspectingVendorId] = React.useState<string | null>(null);
  const [dossierTab, setDossierTab] = React.useState<
    'overview' | 'products' | 'margins' | 'dispatches' | 'payout_fees'
  >('overview');
  const [dossierSearch, setDossierSearch] = React.useState('');

  // Ledger Filter & Search
  const [ledgerTypeFilter, setLedgerTypeFilter] = React.useState<string>('all');
  const [ledgerSearch, setLedgerSearch] = React.useState('');

  // 4-Way Return Form State
  const [retOrderNo, setRetOrderNo] = React.useState(
    availableOrderNos[0] ?? 'ORD-261106-0001'
  );
  const [retFaultType, setRetFaultType] = React.useState<ReturnFaultType>(
    'CUSTOMER_INTACT_RETURN'
  );
  const [retProofUrl, setRetProofUrl] = React.useState(
    'https://picsum.photos/seed/returnproof/400/300'
  );
  const [retNoteBn, setRetNoteBn] = React.useState(
    'পণ্য অক্ষত অবস্থায় গুদামে ফেরত এসেছে, কিউসি সম্পন্ন।'
  );
  const [retAlreadyPaidOut, setRetAlreadyPaidOut] = React.useState(false);

  // Payout Request Form & Sheet State
  const [payoutAmountTaka, setPayoutAmountTaka] = React.useState('1000');
  const [adminPaidTrxId, setAdminPaidTrxId] = React.useState('BKASH-TRX-998811');
  const [adminRejectReason, setAdminRejectReason] = React.useState('');
  const [showInitiateModal, setShowInitiateModal] = React.useState(false);
  const [initiateStep, setInitiateStep] = React.useState<1 | 2>(1);
  const [initiateError, setInitiateError] = React.useState<string | null>(null);

  // Interactive Cash-out / Send-Money Fee Calculator Channel inside Dossier
  const [selectedFeeChannel, setSelectedFeeChannel] = React.useState<
    'bkash_merchant_185bp' | 'personal_send_money' | 'bank_beftn_free'
  >('bkash_merchant_185bp');

  // 15-Question Onboarding Drawer Toggle & State
  const [showOnboarding15Q, setShowOnboarding15Q] = React.useState(false);
  const [onbBusinessNameBn, setOnbBusinessNameBn] = React.useState('');
  const [onbOwnerNameBn, setOnbOwnerNameBn] = React.useState('');
  const [onbPhone, setOnbPhone] = React.useState('');
  const [onbCommBp, setOnbCommBp] = React.useState('1500');
  const [onbHoldDays, setOnbHoldDays] = React.useState('7');
  const [onbPayoutMethod, setOnbPayoutMethod] = React.useState('বিকাশ মার্চেন্ট');
  const [onbPayoutAcc, setOnbPayoutAcc] = React.useState('');
  const [onbAnswers15, setOnbAnswers15] = React.useState<Record<string, string>>(
    () =>
      Object.fromEntries(
        VENDOR_ONBOARDING_15_QUESTIONS.map((q) => [q.key, q.placeholderBn])
      )
  );

  // Filtered vendors by profile type/status
  const filteredVendorsByType = React.useMemo(() => {
    if (vendorProfileTypeFilter === 'all') return vendors;
    if (vendorProfileTypeFilter === 'active') {
      return vendors.filter((v) => v.profile.status === 'active');
    }
    if (vendorProfileTypeFilter === 'pending_onboarding') {
      return vendors.filter((v) => v.profile.status === 'pending_onboarding');
    }
    return vendors.filter(
      (v) =>
        v.profile.status === 'suspended' ||
        v.profile.status === 'closing_audit' ||
        v.profile.status === 'closed'
    );
  }, [vendors, vendorProfileTypeFilter]);

  const filteredLedger = React.useMemo(() => {
    let list = ledgerEntries.filter(
      (e) => e.vendorId === activeVendorSummary?.profile.vendorId
    );

    if (ledgerTypeFilter !== 'all') {
      if (ledgerTypeFilter === 'pending') {
        list = list.filter((e) => e.escrowBucket === 'pending');
      } else if (ledgerTypeFilter === 'locked') {
        list = list.filter((e) => e.escrowBucket === 'locked');
      } else if (ledgerTypeFilter === 'available') {
        list = list.filter((e) => e.escrowBucket === 'available');
      } else if (ledgerTypeFilter === 'payout') {
        list = list.filter((e) => e.entryType.includes('PAYOUT'));
      } else if (ledgerTypeFilter === 'return') {
        list = list.filter((e) => e.entryType.includes('RETURN'));
      }
    }

    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase();
      list = list.filter(
        (e) =>
          e.id.toLowerCase().includes(q) ||
          (e.orderNo && e.orderNo.toLowerCase().includes(q)) ||
          e.descriptionBn.toLowerCase().includes(q)
      );
    }

    return list;
  }, [ledgerEntries, activeVendorSummary, ledgerTypeFilter, ledgerSearch]);

  const totalEscrowPoisha = activeVendorSummary
    ? activeVendorSummary.balance.pendingPoisha +
      activeVendorSummary.balance.lockedPoisha +
      activeVendorSummary.balance.withdrawablePoisha
    : 0;

  const inspectedVendor =
    vendors.find((v) => v.profile.vendorId === inspectingVendorId) ?? null;

  const inspectedProducts = React.useMemo(() => {
    if (!inspectingVendorId || !products) return [];
    return products.filter((p) => p.vendorId === inspectingVendorId);
  }, [products, inspectingVendorId]);

  const filteredInspectedProducts = React.useMemo(() => {
    if (!dossierSearch.trim()) return inspectedProducts;
    const q = dossierSearch.toLowerCase();
    return inspectedProducts.filter(
      (p) =>
        p.productNameBn.toLowerCase().includes(q) ||
        p.publicSku.toLowerCase().includes(q)
    );
  }, [inspectedProducts, dossierSearch]);

  const inspectedLedger = React.useMemo(() => {
    if (!inspectingVendorId) return [];
    return ledgerEntries.filter((e) => e.vendorId === inspectingVendorId);
  }, [ledgerEntries, inspectingVendorId]);

  const inspectedPayouts = React.useMemo(() => {
    if (!inspectingVendorId) return [];
    return payoutRequests.filter((p) => p.vendorId === inspectingVendorId);
  }, [payoutRequests, inspectingVendorId]);

  const inspectedOrders = React.useMemo(() => {
    if (!inspectingVendorId || !orders) return [];
    const vendorSkus = new Set(inspectedProducts.map((p) => p.publicSku));
    const vendorProductIds = new Set(inspectedProducts.map((p) => p.productId));
    return orders.filter((o) => {
      const row = o as unknown as {
        items?: Array<{ productId: string; publicSku: string }>;
      };
      return row.items?.some(
        (i) => vendorSkus.has(i.publicSku) || vendorProductIds.has(i.productId)
      );
    });
  }, [orders, inspectingVendorId, inspectedProducts]);

  // Exact integer Poisha fee calculation helper
  const computeFeeBreakdownPoisha = (
    grossPoisha: number,
    channel:
      | 'bkash_merchant_185bp'
      | 'personal_send_money'
      | 'bank_beftn_free'
  ): {
    feePoisha: number;
    netPoisha: number;
    ruleLabelBn: string;
  } => {
    if (grossPoisha <= 0) {
      return { feePoisha: 0, netPoisha: 0, ruleLabelBn: '৳০' };
    }
    if (channel === 'bkash_merchant_185bp') {
      // 185 basis points = 1.85%
      const feePoisha = Math.round((grossPoisha * 185) / 10000);
      return {
        feePoisha,
        netPoisha: Math.max(0, grossPoisha - feePoisha),
        ruleLabelBn: 'বিকাশ মার্চেন্ট ক্যাশ-আউট (১.৮৫% / 185 bp)',
      };
    }
    if (channel === 'personal_send_money') {
      // Personal Send Money: flat ৳10 (1000 poisha) + 1.85% agent cash-out reference
      const sendMoneyFeePoisha = 1000;
      const cashOutRefPoisha = Math.round((grossPoisha * 185) / 10000);
      const totalFee = sendMoneyFeePoisha + cashOutRefPoisha;
      return {
        feePoisha: totalFee,
        netPoisha: Math.max(0, grossPoisha - totalFee),
        ruleLabelBn: 'পার্সোনাল সেন্ড মানি (৳১০) + ক্যাশ-আউট চার্জ (১.৮৫%)',
      };
    }
    // bank_beftn_free
    return {
      feePoisha: 0,
      netPoisha: grossPoisha,
      ruleLabelBn: 'ব্যাংক BEFTN ট্রান্সফার (৳০ প্রসেসিং চার্জ)',
    };
  };

  return (
    <section className="space-y-6">
      {/* 1. Header & Actions Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Wallet className="w-5 h-5 text-ink" aria-hidden="true" />
            <h1 className="text-xl font-bold text-ink">
              {locale === 'bn'
                ? 'কনসাইনমেন্ট ভেন্ডর ডিরেক্টরি, এসক্রো লেজার ও পেআউট ইঞ্জিন'
                : 'Vendor Directory, Escrow Ledger & Payout Engine'}
            </h1>
          </div>
          <p className="text-xs text-muted mt-1">
            <LocalizedText source={"১৮-দফা কনসাইনমেন্ট নীতিমালা: প্রোফাইল টাইপ অনুযায়ী ভেন্ডর প্রোফাইল, প্রোডাক্ট ও মার্জিন ডসিয়ার, কুরিয়ার ডিসপ্যাচ লগ এবং ক্যাশ-আউট/সেন্ড মানি চার্জ বিবরণী।"} area="admin" />{" "}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowOnboarding15Q((v) => !v)}
              leftIcon={<UserPlus className="w-4 h-4" aria-hidden="true" />}
            >
              {showOnboarding15Q
                ? 'অনবোর্ডিং বন্ধ করুন'
                : '১৫-প্রশ্নের নতুন ভেন্ডর অনবোর্ডিং'}
            </Button>
          )}
          {isSuperAdmin && activeVendorSummary && (
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                const res = await fetch('/api/admin/workspace', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    operation: 'audit_vendor_closure',
                    vendorId: activeVendorSummary.profile.vendorId,
                  }),
                });
                const data = (await res.json()) as {
                  canClose: boolean;
                  reasonBn: string;
                };
                setFeedback({
                  type: data.canClose ? 'success' : 'error',
                  text: data.reasonBn,
                });
                await onRefreshWorkspace();
              }}
              leftIcon={<ShieldAlert className="w-3.5 h-3.5" aria-hidden="true" />}
            >
              <LocalizedText source={"চুক্তি সমাপ্তি অডিট"} area="admin" />{" "}</Button>
          )}
          <Button
            variant="secondary"
            size="sm"
            onClick={() => window.print()}
            leftIcon={<Printer className="w-4 h-4" aria-hidden="true" />}
          >
            <LocalizedText source={"স্টেটমেন্ট প্রিন্ট (PDF)"} area="admin" />{" "}</Button>
        </div>
      </div>

      {feedback && (
        <div
          role="status"
          className={`p-3.5 border rounded-[var(--radius-md)] bg-surface text-xs font-semibold flex items-center justify-between gap-3 ${
            feedback.type === 'success'
              ? 'border-success text-success'
              : 'border-danger text-danger'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
            <span>{feedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="underline cursor-pointer text-ink hover:opacity-80"
          >
            <LocalizedText source={"বন্ধ করুন"} area="admin" />{" "}</button>
        </div>
      )}

      {/* 2. VENDOR DIRECTORY ORGANIZED BY PROFILE TYPE / STATUS */}
      <Card surface="surface" padding="md" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h2 className="text-sm font-bold text-ink flex items-center gap-2">
              <User className="w-4 h-4 text-ink" aria-hidden="true" />
              <span><LocalizedText source={"প্রোফাইল টাইপ অনুযায়ী ভেন্ডর ডিরেক্টরি (Vendor Profiles by Type)"} area="admin" /></span>
            </h2>
            <p className="text-[11px] text-muted mt-0.5">
              <LocalizedText source={"যেকোনো ভেন্ডর কার্ডে ক্লিক করলে তাদের সম্পূর্ণ প্রোডাক্ট গ্যালারি, তারিখের মার্জিন, কুরিয়ার ডিসপ্যাচ এবং ক্যাশ-আউট/সেন্ড মানি চার্জের ডিটেইলস দেখতে পাবেন।"} area="admin" />{" "}</p>
          </div>

          {/* Profile Type Filter Tabs */}
          {!isVendor && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              {(
                [
                  {
                    key: 'all',
                    labelBn: `সব প্রোফাইল (${vendors.length})`,
                  },
                  {
                    key: 'active',
                    labelBn: `সক্রিয় ভেন্ডর (${
                      vendors.filter((v) => v.profile.status === 'active').length
                    })`,
                  },
                  {
                    key: 'pending_onboarding',
                    labelBn: `অনবোর্ডিং পেন্ডিং (${
                      vendors.filter((v) => v.profile.status === 'pending_onboarding')
                        .length
                    })`,
                  },
                  {
                    key: 'suspended_or_closing',
                    labelBn: `অডিট / স্থগিত (${
                      vendors.filter(
                        (v) =>
                          v.profile.status !== 'active' &&
                          v.profile.status !== 'pending_onboarding'
                      ).length
                    })`,
                  },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setVendorProfileTypeFilter(tab.key)}
                  className={`px-3 py-1.5 rounded-[var(--radius-sm)] border font-semibold cursor-pointer transition-colors ${
                    vendorProfileTypeFilter === tab.key
                      ? 'bg-ink text-bg border-ink'
                      : 'bg-bg text-ink border-border hover:border-ink'
                  }`}
                >
                  {localizedField(tab, "labelBn", locale)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Vendor Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filteredVendorsByType.map((v) => {
            const isSelected =
              activeVendorSummary?.profile.vendorId === v.profile.vendorId;
            const vendorProducts = (products ?? []).filter(
              (p) => p.vendorId === v.profile.vendorId
            );
            const totalUnitsAvailable = vendorProducts.reduce(
              (acc, p) => acc + p.stockAvailable,
              0
            );
            const estCashoutFee = Math.round(
              (v.balance.withdrawablePoisha * 185) / 10000
            );

            return (
              <div
                key={v.profile.vendorId}
                className={`p-4 rounded-[var(--radius-md)] border transition-colors flex flex-col justify-between gap-3 ${
                  isSelected
                    ? 'border-ink bg-bg'
                    : 'border-border bg-bg/60 hover:border-ink/60'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[11px] font-bold px-2 py-0.5 border border-border rounded-[var(--radius-sm)] bg-surface text-ink">
                          {v.profile.vendorCode}
                        </span>
                        <Badge
                          status={
                            v.profile.status === 'active'
                              ? 'success'
                              : v.profile.status === 'pending_onboarding'
                              ? 'warning'
                              : 'danger'
                          }
                        >
                          {v.profile.status === 'active'
                            ? 'সক্রিয় (Active)'
                            : v.profile.status === 'pending_onboarding'
                            ? 'অনবোর্ডিং পেন্ডিং'
                            : v.profile.status}
                        </Badge>
                      </div>
                      <h3 className="text-sm font-bold text-ink mt-1.5">
                        {localizedField(v.profile, "businessNameBn", locale)}
                      </h3>
                      <p className="text-[11px] text-muted">
                        <LocalizedText source={"মালিক:"} area="admin" />{" "}<strong className="text-ink">{localizedField(v.profile, "ownerNameBn", locale)}</strong> ·{' '}
                        <span className="font-mono">{v.profile.contactPhone}</span>
                      </p>
                    </div>

                    <div className="text-right font-mono">
                      <span className="text-[10px] text-muted block"><LocalizedText source={"কমিশন রেট"} area="admin" /></span>
                      <span className="text-xs font-bold text-ink">
                        {((v.profile.defaultCommissionBp ?? 1500) / 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>

                  {/* Quick Metrics Strip */}
                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-border text-[11px] font-mono">
                    <div className="p-2 rounded-[var(--radius-sm)] bg-surface border border-border">
                      <span className="text-[10px] text-muted block font-sans"><LocalizedText source={"প্রোডাক্ট"} area="admin" /></span>
                      <strong className="text-ink">
                        {formatLocaleNumber(vendorProducts.length, locale)} {" "}<LocalizedText source={"টি ("} area="admin" />{totalUnitsAvailable})
                      </strong>
                    </div>
                    <div className="p-2 rounded-[var(--radius-sm)] bg-surface border border-border">
                      <span className="text-[10px] text-muted block font-sans"><LocalizedText source={"উত্তোলনযোগ্য"} area="admin" /></span>
                      <strong className="text-success">
                        {formatPoishaToBdt(v.balance.withdrawablePoisha, locale)}
                      </strong>
                    </div>
                    <div className="p-2 rounded-[var(--radius-sm)] bg-surface border border-border">
                      <span className="text-[10px] text-muted block font-sans"><LocalizedText source={"ক্যাশ-আউট ফি"} area="admin" /></span>
                      <strong className="text-danger">
                        {formatPoishaToBdt(estCashoutFee, locale)}
                      </strong>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-muted pt-1">
                    <span>
                      <LocalizedText source={"মেথড:"} area="admin" />{" "}<strong className="text-ink">{localizedField(v.profile, "payoutMethodBn", locale)}</strong> ({v.profile.payoutAccountNo})
                    </span>
                    <span className="font-mono">
                      <LocalizedText source={"হোল্ড:"} area="admin" />{" "}{v.profile.escrowHoldDaysOverride ?? 7} {" "}<LocalizedText source={"দিন"} area="admin" />{" "}</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant={isSelected ? 'primary' : 'outline'}
                    size="sm"
                    className="flex-1"
                    onClick={() => {
                      setSelectedVendorId(v.profile.vendorId);
                      setInspectingVendorId(v.profile.vendorId);
                      setDossierTab('products');
                    }}
                    leftIcon={<Eye className="w-3.5 h-3.5" aria-hidden="true" />}
                  >
                    <LocalizedText source={"প্রোফাইল ও প্রোডাক্ট দেখুন"} area="admin" />{" "}</Button>
                  {!isSelected && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setSelectedVendorId(v.profile.vendorId)}
                    >
                      <LocalizedText source={"লেজার নির্বাচন"} area="admin" />{" "}</Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* 3. Executive 5-Bucket Escrow Summary Cards (4-Solid Token Lock) */}
      {activeVendorSummary && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* 1. Pending Escrow */}
          <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-2">
            <div className="flex items-center justify-between text-xs text-ink font-semibold">
              <span><LocalizedText source={"১. পেন্ডিং এসক্রো"} area="admin" /></span>
              <Badge status="warning"><LocalizedText source={"ইন-ট্রানজিট"} area="admin" /></Badge>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums text-ink">
              {formatPoishaToBdt(activeVendorSummary.balance.pendingPoisha, locale)}
            </p>
            <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-warning h-full transition-all duration-300"
                style={{
                  width:
                    totalEscrowPoisha > 0
                      ? `${Math.min(
                          100,
                          Math.round(
                            (activeVendorSummary.balance.pendingPoisha /
                              totalEscrowPoisha) *
                              100
                          )
                        )}%`
                      : '0%',
                }}
              />
            </div>
            <p className="text-[11px] text-muted"><LocalizedText source={"Confirmed/Packed/Shipped অর্ডার"} area="admin" /></p>
          </div>

          {/* 2. Locked Escrow */}
          <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-2">
            <div className="flex items-center justify-between text-xs text-ink font-semibold">
              <span><LocalizedText source={"২. লকড (হোল্ড পিরিয়ড)"} area="admin" /></span>
              <Badge status="info"><LocalizedText source={"কাউন্টডাউন"} area="admin" /></Badge>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums text-ink">
              {formatPoishaToBdt(activeVendorSummary.balance.lockedPoisha, locale)}
            </p>
            <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-info h-full transition-all duration-300"
                style={{
                  width:
                    totalEscrowPoisha > 0
                      ? `${Math.min(
                          100,
                          Math.round(
                            (activeVendorSummary.balance.lockedPoisha /
                              totalEscrowPoisha) *
                              100
                          )
                        )}%`
                      : '0%',
                }}
              />
            </div>
            <p className="text-[11px] text-muted">
              <LocalizedText source={"ডেলিভারড —"} area="admin" />{" "}{activeVendorSummary.profile.escrowHoldDaysOverride ?? 7} {" "}<LocalizedText source={"দিনের ম্যাচুরিটি চলছে"} area="admin" />{" "}</p>
          </div>

          {/* 3. Withdrawable / Available Escrow */}
          <div className="p-4 border-2 border-ink bg-bg rounded-[var(--radius-md)] space-y-2">
            <div className="flex items-center justify-between text-xs text-ink font-bold">
              <span><LocalizedText source={"৩. উত্তোলনযোগ্য (Available)"} area="admin" /></span>
              <Badge status="success"><LocalizedText source={"পেআউট যোগ্য"} area="admin" /></Badge>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums text-success">
              {formatPoishaToBdt(
                activeVendorSummary.balance.withdrawablePoisha,
                locale
              )}
            </p>
            <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-success h-full transition-all duration-300"
                style={{
                  width:
                    totalEscrowPoisha > 0
                      ? `${Math.min(
                          100,
                          Math.round(
                            (activeVendorSummary.balance.withdrawablePoisha /
                              totalEscrowPoisha) *
                              100
                          )
                        )}%`
                      : '0%',
                }}
              />
            </div>
            <p className="text-[11px] text-ink font-medium">
              <LocalizedText source={"হোল্ড পিরিয়ড শেষ — রিকোয়েস্ট পাঠান"} area="admin" />{" "}</p>
          </div>

          {/* 4. Payout Hold */}
          <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-2">
            <div className="flex items-center justify-between text-xs text-ink font-semibold">
              <span><LocalizedText source={"৪. পেআউট হোল্ড"} area="admin" /></span>
              <Badge status="neutral"><LocalizedText source={"রিকোয়েস্টেড"} area="admin" /></Badge>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums text-ink">
              {formatPoishaToBdt(
                activeVendorSummary.balance.payoutHoldPoisha,
                locale
              )}
            </p>
            <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-ink h-full transition-all duration-300"
                style={{
                  width:
                    activeVendorSummary.balance.payoutHoldPoisha > 0
                      ? '100%'
                      : '0%',
                }}
              />
            </div>
            <p className="text-[11px] text-muted"><LocalizedText source={"ডাবল-রিকোয়েস্ট সেফটি হোল্ড"} area="admin" /></p>
          </div>

          {/* 5. Clawback Debt */}
          <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-2">
            <div className="flex items-center justify-between text-xs text-ink font-semibold">
              <span><LocalizedText source={"৫. নেগেটিভ ক্লব্যাক"} area="admin" /></span>
              <Badge status="danger"><LocalizedText source={"দায়"} area="admin" /></Badge>
            </div>
            <p className="text-xl font-bold font-mono tabular-nums text-danger">
              {formatPoishaToBdt(
                activeVendorSummary.balance.clawbackDebtPoisha,
                locale
              )}
            </p>
            <div className="w-full bg-border h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-danger h-full transition-all duration-300"
                style={{
                  width:
                    activeVendorSummary.balance.clawbackDebtPoisha > 0
                      ? '100%'
                      : '0%',
                }}
              />
            </div>
            <p className="text-[11px] text-muted"><LocalizedText source={"পরবর্তী পেআউট থেকে সমন্বয় হবে"} area="admin" /></p>
          </div>
        </div>
      )}

      {/* 4. Sub-Navigation Tabs */}
      <div className="border-b border-border flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'overview'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>{locale === 'bn' ? 'এসক্রো ওভারভিউ ও অনবোর্ডিং' : 'Escrow Overview & Onboarding'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('ledger')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'ledger'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>
            {locale === 'bn'
              ? `এসক্রো লেজার হিস্ট্রি (${filteredLedger.length})`
              : `Escrow Ledger History (${filteredLedger.length})`}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('returns')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'returns'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <RotateCcw className="w-4 h-4" />
          <span>{locale === 'bn' ? '৪-মুখী রিটার্ন ইঞ্জিন' : '4-Way Return Engine'}</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveSubTab('payouts')}
          className={`px-4 py-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-2 ${
            activeSubTab === 'payouts'
              ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>
            {locale === 'bn'
              ? `পেআউট রিকোয়েস্ট ও চার্জ সমূহ (${payoutRequests.length})`
              : `Payout Requests & Fees (${payoutRequests.length})`}
          </span>
        </button>
      </div>

      {/* 5. Sub-Tab 1: Escrow Overview & Onboarding */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6">
          {/* Min Payout Status Banner */}
          {activeVendorSummary && (
            <div className="p-4 border border-border rounded-[var(--radius-md)] bg-surface flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-[var(--radius-sm)] border border-border bg-bg text-ink">
                  <FileCheck className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="font-bold text-ink">
                    <LocalizedText source={"সর্বনিম্ন পেআউট থ্রেশহোল্ড (Min Payout Limit):"} area="admin" />{' '}
                    {formatPoishaToBdt(minPayoutPoisha, locale)}
                  </h4>
                  <p className="text-muted text-[11px] mt-0.5">
                    {activeVendorSummary.balance.withdrawablePoisha >=
                    minPayoutPoisha
                      ? 'আপনার বর্তমান উত্তোলনযোগ্য ব্যালেন্স পেআউট রিকোয়েস্ট করার জন্য প্রস্তুত।'
                      : 'পেআউট রিকোয়েস্ট পাঠানোর জন্য উত্তোলনযোগ্য ব্যালেন্স অন্তত ৳১,০০০ হতে হবে।'}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setInspectingVendorId(activeVendorSummary.profile.vendorId);
                    setDossierTab('payout_fees');
                  }}
                  leftIcon={<Percent className="w-3.5 h-3.5" />}
                >
                  <LocalizedText source={"ক্যাশ-আউট ও সেন্ড মানি চার্জ দেখুন"} area="admin" />{" "}</Button>
                {activeVendorSummary.balance.withdrawablePoisha >=
                  minPayoutPoisha && (
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      setInitiateStep(1);
                      setInitiateError(null);
                      setShowInitiateModal(true);
                    }}
                    leftIcon={<Wallet className="w-3.5 h-3.5" />}
                  >
                    <LocalizedText source={"এখনই পেআউট রিকোয়েস্ট দিন"} area="admin" />{" "}</Button>
                )}
              </div>
            </div>
          )}

          {/* 15-Question Onboarding Form (When Open) */}
          {showOnboarding15Q && isSuperAdmin && (
            <Card surface="surface" padding="md" className="space-y-4">
              <h2 className="text-base font-bold text-ink border-b border-border pb-2">
                <LocalizedText source={"১৫-প্রশ্নের কনসাইনমেন্ট সাপ্লায়ার অনবোর্ডিং ফর্ম (Module E — ১৮-দফা চুক্তি)"} area="admin" />{" "}</h2>
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await fetch('/api/admin/workspace', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      operation: 'submit_vendor_onboarding_15q',
                      businessNameBn: onbBusinessNameBn,
                      ownerNameBn: onbOwnerNameBn,
                      contactPhone: onbPhone,
                      defaultCommissionBp: Number(onbCommBp) || 1500,
                      escrowHoldDaysOverride: Number(onbHoldDays) || 7,
                      payoutMethodBn: onbPayoutMethod,
                      payoutAccountNo: onbPayoutAcc,
                      answers15: onbAnswers15,
                    }),
                  });
                  const data = (await res.json()) as {
                    success: boolean;
                    errorBn?: string;
                    vendor?: VendorProfileRecord;
                  };
                  if (data.success && data.vendor) {
                    setFeedback({
                      type: 'success',
                      text: `নতুন ভেন্ডর ${data.vendor.businessNameBn} (${data.vendor.vendorCode}) সফলভাবে অনবোর্ড হয়েছে!`,
                    });
                    setShowOnboarding15Q(false);
                    await onRefreshWorkspace();
                  } else {
                    setFeedback({
                      type: 'error',
                      text: data.errorBn ?? 'ভেন্ডর অনবোর্ডিং ব্যর্থ হয়েছে।',
                    });
                  }
                }}
                className="space-y-4 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Input
                    label="প্রতিষ্ঠানের বাংলা নাম *"
                    value={onbBusinessNameBn}
                    onChange={(e) => setOnbBusinessNameBn(e.target.value)}
                    placeholder="সোনারগাঁও জামদানি হাউস"
                    required
                  />
                  <Input
                    label="মালিকের নাম *"
                    value={onbOwnerNameBn}
                    onChange={(e) => setOnbOwnerNameBn(e.target.value)}
                    placeholder="মোঃ রফিকুল ইসলাম"
                    required
                  />
                  <Input
                    label="মোবাইল নম্বর *"
                    value={onbPhone}
                    onChange={(e) => setOnbPhone(e.target.value)}
                    placeholder="01711334455"
                    required
                  />
                  <Input
                    label="ডিফল্ট কমিশন (Basis Points, 1500 = 15%)"
                    type="number"
                    value={onbCommBp}
                    onChange={(e) => setOnbCommBp(e.target.value)}
                    required
                  />
                  <Input
                    label="এসক্রো হোল্ড পিরিয়ড (দিন)"
                    type="number"
                    value={onbHoldDays}
                    onChange={(e) => setOnbHoldDays(e.target.value)}
                    required
                  />
                  <Input
                    label="বিকাশ / ব্যাংক অ্যাকাউন্ট নম্বর *"
                    value={onbPayoutAcc}
                    onChange={(e) => setOnbPayoutAcc(e.target.value)}
                    placeholder="01711334455"
                    required
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border">
                  {VENDOR_ONBOARDING_15_QUESTIONS.map((q) => (
                    <Input
                      key={q.key}
                      label={q.questionBn}
                      value={onbAnswers15[q.key] ?? ''}
                      onChange={(e) =>
                        setOnbAnswers15((prev) => ({
                          ...prev,
                          [q.key]: e.target.value,
                        }))
                      }
                      required
                    />
                  ))}
                </div>

                <div className="flex justify-end">
                  <Button type="submit" variant="primary" size="md">
                    <LocalizedText source={"১৫টি প্রশ্ন যাচাই ও ভেন্ডর অ্যাকাউন্ট চালু করুন"} area="admin" />{" "}</Button>
                </div>
              </form>
            </Card>
          )}

          {/* 3-Bucket Flow Explanation Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 border border-border rounded-[var(--radius-md)] bg-surface space-y-2">
              <div className="flex items-center gap-2 font-bold text-ink">
                <CalendarClock className="w-4 h-4 text-warning" />
                <span><LocalizedText source={"ধাপ ১: পেন্ডিং এসক্রো"} area="admin" /></span>
              </div>
              <p className="text-muted leading-relaxed">
                <LocalizedText source={"অর্ডার নিশ্চিত বা প্যাকিং হওয়ামাত্র আনুমানিক ভেন্ডর পেঅ্যাবল অর্থ পেন্ডিং বাকেটে জমা হয়। কুরিয়ারে ডেলিভারি না হওয়া পর্যন্ত এই টাকা লকড বাকেটে স্থানান্তরিত হয় না।"} area="admin" />{" "}</p>
            </div>

            <div className="p-4 border border-border rounded-[var(--radius-md)] bg-surface space-y-2">
              <div className="flex items-center gap-2 font-bold text-ink">
                <AlertTriangle className="w-4 h-4 text-info" />
                <span><LocalizedText source={"ধাপ ২: লকড (হোল্ড পিরিয়ড)"} area="admin" /></span>
              </div>
              <p className="text-muted leading-relaxed">
                <LocalizedText source={"পণ্য সফলভাবে কাস্টমারের কাছে কুরিয়ার কর্তৃক ডেলিভারড হলে অর্থ লকড বাকেটে যায়। নির্দিষ্ট ৭ দিনের হোল্ড পিরিয়ড পার হলে এটি অটোমেটিক ম্যাচিউরড হয়।"} area="admin" />{" "}</p>
            </div>

            <div className="p-4 border border-border rounded-[var(--radius-md)] bg-surface space-y-2">
              <div className="flex items-center gap-2 font-bold text-ink">
                <CheckCircle2 className="w-4 h-4 text-success" />
                <span><LocalizedText source={"ধাপ ৩: উত্তোলনযোগ্য (Available)"} area="admin" /></span>
              </div>
              <p className="text-muted leading-relaxed">
                <LocalizedText source={"হোল্ড পিরিয়ড শেষে টাকা সরাসরি উত্তোলনযোগ্য বাকেটে স্থানান্তরিত হয়। ন্যূনতম ৳১,০০০ বা তার বেশি হলে ভেন্ডর যেকোনো সময় পেআউট রিকোয়েস্ট পাঠাতে পারেন।"} area="admin" />{" "}</p>
            </div>
          </div>
        </div>
      )}

      {/* 6. Sub-Tab 2: Append-Only Escrow Ledger */}
      {activeSubTab === 'ledger' && (
        <Card surface="bg" padding="md" className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="w-4 h-4 text-ink" aria-hidden="true" />
              <h2 className="text-base font-bold text-ink">
                {brandNameBn} {" "}<LocalizedText source={"— অফিশিয়াল ভেন্ডর লেজার স্টেটমেন্ট ("} area="admin" />{" "}{localizedField(activeVendorSummary?.profile, "businessNameBn", locale)})
              </h2>
            </div>
            <div className="flex items-center gap-2">
              <Badge status="info"><LocalizedText source={"APPEND-ONLY · IMMUTABLE"} area="admin" /></Badge>
              <span className="inline-flex items-center gap-1 text-xs font-medium text-success">
                <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span><LocalizedText source={"Real-Time Maturity Active"} area="admin" /></span>
              </span>
            </div>
          </div>

          {/* Ledger Filter & Search Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-surface p-3 border border-border rounded-[var(--radius-md)] text-xs">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-muted"><LocalizedText source={"ফিল্টার:"} area="admin" /></span>
              <select
                value={ledgerTypeFilter}
                onChange={(e) => setLedgerTypeFilter(e.target.value)}
                className="p-1.5 border border-border rounded-[var(--radius-sm)] bg-bg text-ink font-medium focus:outline-none focus:ring-1 focus:ring-ink cursor-pointer"
              >
                <option value="all"><LocalizedText source={"সব এন্ট্রি ("} area="admin" />{ledgerEntries.length})</option>
                <option value="pending"><LocalizedText source={"পেন্ডিং বাকেট (Pending)"} area="admin" /></option>
                <option value="locked"><LocalizedText source={"লকড বাকেট (Hold Period)"} area="admin" /></option>
                <option value="available"><LocalizedText source={"উত্তোলনযোগ্য বাকেট (Available)"} area="admin" /></option>
                <option value="payout"><LocalizedText source={"পেআউট ট্রানজেকশন"} area="admin" /></option>
                <option value="return"><LocalizedText source={"রিটার্ন ও এডজাস্টমেন্ট"} area="admin" /></option>
              </select>
            </div>

            <div className="relative w-full sm:w-auto sm:min-w-[240px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted" />
              <input
                type="text"
                placeholder={uiText("অর্ডার নম্বর বা এন্ট্রি খুঁজুন...", locale)}
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-border rounded-[var(--radius-sm)] bg-bg text-ink text-xs focus:outline-none focus:ring-1 focus:ring-ink"
              />
            </div>
          </div>

          {/* Ledger Table */}
          <div className="border border-border rounded-[var(--radius-md)] overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-muted">
                  <th className="p-3"><LocalizedText source={"তারিখ ও এন্ট্রি আইডি"} area="admin" /></th>
                  <th className="p-3"><LocalizedText source={"অর্ডার নম্বর"} area="admin" /></th>
                  <th className="p-3"><LocalizedText source={"এন্ট্রি টাইপ (Immutable)"} area="admin" /></th>
                  <th className="p-3"><LocalizedText source={"এসক্রো বাকেট ও ম্যাচুরিটি"} area="admin" /></th>
                  <th className="p-3"><LocalizedText source={"বিবরণ"} area="admin" /></th>
                  <th className="p-3 text-right"><LocalizedText source={"পরিমাণ (Poisha Exact)"} area="admin" /></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-muted text-xs">
                      <LocalizedText source={"কোনো লেজার এন্ট্রি পাওয়া যায়নি।"} area="admin" />{" "}</td>
                  </tr>
                ) : (
                  filteredLedger.map((entry) => (
                    <tr key={entry.id} className="hover:bg-surface/60 transition-colors">
                      <td className="p-3 font-mono text-[11px]">
                        <div className="font-bold text-ink">{entry.id}</div>
                        <div className="text-muted">
                          {new Date(entry.createdAt).toLocaleDateString('bn-BD')}
                        </div>
                      </td>
                      <td className="p-3 font-mono font-semibold text-ink">
                        {entry.orderNo ?? '—'}
                      </td>
                      <td className="p-3 font-mono">
                        <Badge
                          status={
                            entry.amountPoisha < 0
                              ? 'danger'
                              : entry.escrowBucket === 'available'
                              ? 'success'
                              : entry.escrowBucket === 'locked'
                              ? 'warning'
                              : 'info'
                          }
                        >
                          {entry.entryType}
                        </Badge>
                      </td>
                      <td className="p-3 font-mono text-[11px]">
                        <div className="uppercase font-bold text-ink">
                          {entry.escrowBucket}
                        </div>
                        {entry.maturesAt && (
                          <div className="text-muted">
                            <LocalizedText source={"ম্যাচুরিটি:"} area="admin" />{' '}
                            {new Date(entry.maturesAt).toLocaleDateString('bn-BD')}
                          </div>
                        )}
                      </td>
                      <td className="p-3 text-ink max-w-md leading-relaxed">
                        {localizedField(entry, "descriptionBn", locale)}
                      </td>
                      <td
                        className={`p-3 text-right font-mono font-bold tabular-nums text-sm ${
                          entry.amountPoisha < 0 ? 'text-danger' : 'text-success'
                        }`}
                      >
                        {formatPoishaToBdt(entry.amountPoisha, locale)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 7. Sub-Tab 3: 4-Way Return Engine */}
      {activeSubTab === 'returns' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <Card surface="bg" padding="md" className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-bold text-ink flex items-center gap-2 border-b border-border pb-2">
              <RotateCcw className="w-4 h-4" aria-hidden="true" />
              <span><LocalizedText source={"চার-মুখী ড্যামেজ ও রিটার্ন ইঞ্জিন (Four-Way Return Engine)"} area="admin" /></span>
            </h2>

            {!isVendor ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const res = await fetch('/api/admin/workspace', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      operation: 'process_four_way_return',
                      orderNo: retOrderNo,
                      faultType: retFaultType,
                      proofUrl: retProofUrl,
                      noteBn: retNoteBn,
                      wasAlreadyPaidOut: retAlreadyPaidOut,
                    }),
                  });
                  const data = (await res.json()) as {
                    success: boolean;
                    errorBn?: string;
                  };
                  if (data.success) {
                    setFeedback({
                      type: 'success',
                      text: `অর্ডার ${retOrderNo}-এর ৪-মুখী রিটার্ন (${retFaultType}) সফলভাবে লেজার ও স্টকে সমন্বয় হয়েছে!`,
                    });
                    await onRefreshWorkspace();
                  } else {
                    setFeedback({
                      type: 'error',
                      text: data.errorBn ?? 'রিটার্ন প্রসেস করা যায়নি।',
                    });
                  }
                }}
                className="space-y-4 text-xs"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="block font-medium text-ink"><LocalizedText source={"অর্ডার নম্বর *"} area="admin" /></label>
                    <select
                      aria-label="Order for 4-way return"
                      value={retOrderNo}
                      onChange={(e) => setRetOrderNo(e.target.value)}
                      className="w-full min-h-[42px] px-3 py-1.5 bg-bg text-ink border border-border rounded-[var(--radius-md)] font-mono focus:outline-none focus:ring-1 focus:ring-ink"
                    >
                      {availableOrderNos.map((no) => (
                        <option key={no} value={no}>
                          {no}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="block font-medium text-ink">
                      <LocalizedText source={"রিটার্ন / ক্ষতির দায় (Fault Classification) *"} area="admin" />{" "}</label>
                    <select
                      aria-label="Return fault classification"
                      value={retFaultType}
                      onChange={(e) =>
                        setRetFaultType(e.target.value as ReturnFaultType)
                      }
                      className="w-full min-h-[42px] px-3 py-1.5 bg-bg text-ink border border-border rounded-[var(--radius-md)] focus:outline-none focus:ring-1 focus:ring-ink"
                    >
                      <option value="WAREHOUSE_PACKAGING_FAULT">
                        <LocalizedText source={"১. গুদাম/প্যাকেজিং ভুল (ভেন্ডর পূর্ণ পাওনা পাবে, ক্ষতি প্ল্যাটফর্মের)"} area="admin" />{" "}</option>
                      <option value="SUPPLIER_DEFECT">
                        <LocalizedText source={"২. সাপ্লায়ারের উৎপাদন ত্রুটি (প্রমাণসহ ভেন্ডর লেজার থেকে কর্তন/ক্লব্যাক)"} area="admin" />{" "}</option>
                      <option value="CUSTOMER_INTACT_RETURN">
                        <LocalizedText source={"৩. গ্রাহক অক্ষত রিটার্ন (কিউসি শেষে মূল স্টকে যোগ ও আর্নিং রিভার্সাল)"} area="admin" />{" "}</option>
                      <option value="COURIER_NEGLIGENCE">
                        <LocalizedText source={"৪. কুরিয়ারের অবহেলা (ভেন্ডর দায়ী নয়, কুরিয়ার ক্লেইম ট্র্যাকারে যুক্ত)"} area="admin" />{" "}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="ছবি / আনবক্সিং ভিডিও প্রমাণ লিংক (Proof URL) *"
                    value={retProofUrl}
                    onChange={(e) => setRetProofUrl(e.target.value)}
                    required={retFaultType === 'SUPPLIER_DEFECT'}
                  />
                  <Input
                    label="কিউসি ও রিটার্ন নোট *"
                    value={retNoteBn}
                    onChange={(e) => setRetNoteBn(e.target.value)}
                    required
                  />
                </div>

                <label className="p-3 border border-border rounded-[var(--radius-sm)] bg-surface flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={retAlreadyPaidOut}
                    onChange={(e) => setRetAlreadyPaidOut(e.target.checked)}
                    className="accent-ink"
                  />
                  <span className="font-semibold text-ink">
                    <LocalizedText source={"ভেন্ডরকে ইতিমধ্যে পেআউট দেওয়া হয়ে গেছে (Post-Payout Negative Clawback তৈরি হবে)"} area="admin" />{" "}</span>
                </label>

                <Button type="submit" variant="primary" size="md" className="w-full">
                  <LocalizedText source={"৪-মুখী রিটার্ন ও লেজার সমন্বয় নিশ্চিত করুন"} area="admin" />{" "}</Button>
              </form>
            ) : (
              <p className="text-xs text-muted">
                <LocalizedText source={"ভেন্ডর অ্যাকাউন্ট থেকে চার-মুখী রিটার্ন এনট্রি পরিবর্তনের অনুমতি নেই। কোনো অসঙ্গতি দেখলে অ্যাডমিনের সাথে যোগাযোগ করুন।"} area="admin" />{" "}</p>
            )}
          </Card>

          {/* Right: Return Resolution History Log */}
          <Card surface="bg" padding="md" className="lg:col-span-5 space-y-4">
            <h3 className="text-sm font-bold text-ink border-b border-border pb-2">
              <LocalizedText source={"সাম্প্রতিক রিটার্ন রেজোলিউশন লগ ("} area="admin" />{returnResolutions.length})
            </h3>

            {returnResolutions.length === 0 ? (
              <p className="text-xs text-muted py-6 text-center border border-dashed border-border rounded-[var(--radius-md)]">
                <LocalizedText source={"কোনো রিটার্ন রেকর্ড নেই।"} area="admin" />{" "}</p>
            ) : (
              <div className="space-y-2.5 max-h-[500px] overflow-y-auto pr-1">
                {returnResolutions.map((r) => (
                  <div
                    key={r.returnId}
                    className="p-3 border border-border rounded-[var(--radius-md)] bg-surface space-y-1.5 text-xs"
                  >
                    <div className="flex items-center justify-between font-mono font-bold">
                      <span className="text-ink">{r.orderNo}</span>
                      <span className="px-2 py-0.5 rounded-[var(--radius-sm)] bg-bg text-[10px] text-ink border border-border">
                        {r.faultType}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px] font-mono text-muted">
                      <span>
                        <LocalizedText source={"ভেন্ডর ডেবিট:"} area="admin" />{' '}
                        <strong className="text-danger">
                          {formatPoishaToBdt(r.vendorDebitPoisha, locale)}
                        </strong>
                      </span>
                      <span>
                        <LocalizedText source={"রিস্টক:"} area="admin" />{" "}<strong className="text-ink">{r.restockQuantity} {" "}<LocalizedText source={"টি"} area="admin" /></strong>
                      </span>
                    </div>

                    {r.proofUrl && (
                      <a
                        href={r.proofUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-[10px] text-info hover:underline font-mono"
                      >
                        <ExternalLink className="w-3 h-3" />
                        <span><LocalizedText source={"প্রমাণ লিঙ্ক (Proof)"} area="admin" /></span>
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 8. Sub-Tab 4: Payout Request & Settlement */}
      {activeSubTab === 'payouts' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Request Payout Form */}
          <Card surface="bg" padding="md" className="lg:col-span-5 space-y-4">
            <h2 className="text-base font-bold text-ink flex items-center justify-between border-b border-border pb-2">
              <span className="flex items-center gap-2">
                <Wallet className="w-4 h-4" aria-hidden="true" />
                <span><LocalizedText source={"পেআউট রিকোয়েস্ট পাঠান"} area="admin" /></span>
              </span>
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  setInitiateStep(1);
                  setInitiateError(null);
                  setShowInitiateModal(true);
                }}
                leftIcon={<PlusCircle className="w-3.5 h-3.5" />}
              >
                <LocalizedText source={"Initiate Payout"} area="admin" />{" "}</Button>
            </h2>

            {activeVendorSummary ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  setInitiateStep(1);
                  setInitiateError(null);
                  setShowInitiateModal(true);
                }}
                className="space-y-4 text-xs"
              >
                <div className="p-3.5 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
                  <span className="text-[11px] font-bold text-muted">
                    <LocalizedText source={"সর্বোচ্চ উত্তোলনযোগ্য ব্যালেন্স (Withdrawable):"} area="admin" />{" "}</span>
                  <p className="text-xl font-bold font-mono text-success">
                    {formatPoishaToBdt(
                      activeVendorSummary.balance.withdrawablePoisha,
                      locale
                    )}
                  </p>
                </div>

                <Input
                  label="উত্তোলনের পরিমাণ (৳) *"
                  type="number"
                  value={payoutAmountTaka}
                  onChange={(e) => setPayoutAmountTaka(e.target.value)}
                  placeholder="1000"
                  required
                />

                <Button
                  type="button"
                  variant="primary"
                  size="md"
                  className="w-full"
                  onClick={() => {
                    setInitiateStep(1);
                    setInitiateError(null);
                    setShowInitiateModal(true);
                  }}
                  leftIcon={<Wallet className="w-4 h-4" aria-hidden="true" />}
                >
                  <LocalizedText source={"Initiate Payout (উইজার্ড ওপেন করুন)"} area="admin" />{" "}</Button>
              </form>
            ) : (
              <p className="text-xs text-muted"><LocalizedText source={"কোনো ভেন্ডর নির্বাচন করা হয়নি।"} area="admin" /></p>
            )}
          </Card>

          {/* Right: Payout Requests Management List */}
          <Card surface="bg" padding="md" className="lg:col-span-7 space-y-4">
            <h2 className="text-base font-bold text-ink flex items-center justify-between border-b border-border pb-2">
              <span><LocalizedText source={"পেআউট রিকোয়েস্ট ও অনুমোদন কিউ"} area="admin" /></span>
              <span className="text-xs font-mono text-muted font-normal">
                <LocalizedText source={"মোট:"} area="admin" />{" "}{payoutRequests.length} {" "}<LocalizedText source={"টি"} area="admin" />{" "}</span>
            </h2>

            <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] text-xs">
              {payoutRequests.length === 0 ? (
                <p className="p-8 text-center text-muted">
                  <LocalizedText source={"কোনো পেআউট রিকোয়েস্ট নেই।"} area="admin" />{" "}</p>
              ) : (
                payoutRequests.map((p) => {
                  const estCharge = Math.round((p.requestedAmountPoisha * 185) / 10000);
                  const estNet = Math.max(0, p.requestedAmountPoisha - estCharge);

                  return (
                    <div
                      key={p.payoutId}
                      className="p-4 bg-surface space-y-3 hover:bg-bg/40 transition-colors"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <span className="font-mono font-bold text-ink text-sm">
                            {p.payoutId}
                          </span>
                          <span className="text-muted font-medium ml-2">
                            · <strong>{localizedField(p, "vendorNameBn", locale)}</strong> ({p.vendorCode})
                          </span>
                        </div>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="font-bold text-ink text-base">
                            {formatPoishaToBdt(p.requestedAmountPoisha, locale)}
                          </span>
                          <Badge
                            status={
                              p.status === 'paid'
                                ? 'success'
                                : p.status === 'rejected'
                                ? 'danger'
                                : 'warning'
                            }
                          >
                            {p.status}
                          </Badge>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted bg-bg p-2.5 rounded-[var(--radius-sm)] border border-border">
                        <span>
                          <LocalizedText source={"মাধ্যম:"} area="admin" />{" "}<strong className="text-ink">{localizedField(p, "payoutMethodBn", locale)}</strong> (
                          {p.payoutAccountNo})
                          {p.paymentTrxId ? ` · TrxID: ${p.paymentTrxId}` : ''}
                          {p.rejectionReasonBn
                            ? ` · বাতিলের কারণ: ${p.rejectionReasonBn}`
                            : ''}
                        </span>
                        <span className="font-mono">
                          <LocalizedText source={"ক্যাশ-আউট চার্জ (১.৮৫%):"} area="admin" />{' '}
                          <strong className="text-danger">
                            -{formatPoishaToBdt(estCharge, locale)}
                          </strong>{' '}
                          <LocalizedText source={"· নিট প্রদেয়:"} area="admin" />{' '}
                          <strong className="text-success">
                            {formatPoishaToBdt(estNet, locale)}
                          </strong>
                        </span>
                      </div>

                      {isSuperAdmin &&
                        p.status !== 'paid' &&
                        p.status !== 'rejected' && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-3 border-t border-border">
                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={adminPaidTrxId}
                                onChange={(e) => setAdminPaidTrxId(e.target.value)}
                                placeholder={uiText("বিকাশ/ব্যাংক TrxID...", locale)}
                                className="flex-1 min-h-[36px] px-3 py-1 text-xs border border-border rounded-[var(--radius-sm)] bg-bg font-mono focus:outline-none focus:ring-1 focus:ring-ink"
                              />
                              <Button
                                variant="primary"
                                size="sm"
                                onClick={async () => {
                                  const res = await fetch('/api/admin/workspace', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      operation: 'resolve_vendor_payout',
                                      payoutId: p.payoutId,
                                      decision: 'mark_paid',
                                      paymentTrxId: adminPaidTrxId,
                                    }),
                                  });
                                  if (res.ok) {
                                    setFeedback({
                                      type: 'success',
                                      text: `পেআউট ${p.payoutId} পরিশোধিত (Paid) মার্ক করা হয়েছে।`,
                                    });
                                    await onRefreshWorkspace();
                                  }
                                }}
                              >
                                <LocalizedText source={"Paid মার্ক"} area="admin" />{" "}</Button>
                            </div>

                            <div className="flex items-center gap-1.5">
                              <input
                                type="text"
                                value={adminRejectReason}
                                onChange={(e) =>
                                  setAdminRejectReason(e.target.value)
                                }
                                placeholder={uiText("বাতিলের কারণ...", locale)}
                                className="flex-1 min-h-[36px] px-3 py-1 text-xs border border-border rounded-[var(--radius-sm)] bg-bg focus:outline-none focus:ring-1 focus:ring-ink"
                              />
                              <Button
                                variant="danger"
                                size="sm"
                                onClick={async () => {
                                  const res = await fetch('/api/admin/workspace', {
                                    method: 'POST',
                                    headers: {
                                      'Content-Type': 'application/json',
                                    },
                                    body: JSON.stringify({
                                      operation: 'resolve_vendor_payout',
                                      payoutId: p.payoutId,
                                      decision: 'reject',
                                      rejectionReasonBn:
                                        adminRejectReason ||
                                        'তথ্য যাচাই অসম্পূর্ণ',
                                    }),
                                  });
                                  if (res.ok) {
                                    setFeedback({
                                      type: 'success',
                                      text: `পেআউট ${p.payoutId} বাতিল এবং হোল্ডকৃত টাকা Available ব্যালেন্সে ফেরত দেওয়া হয়েছে।`,
                                    });
                                    await onRefreshWorkspace();
                                  }
                                }}
                              >
                                <LocalizedText source={"Reject"} area="admin" />{" "}</Button>
                            </div>
                          </div>
                        )}
                    </div>
                  );
                })
              )}
            </div>
          </Card>
        </div>
      )}

      {/* Initiate Payout Confirmation ResponsiveSheet */}
      {activeVendorSummary && (
        <ResponsiveSheet
          open={showInitiateModal}
          onOpenChange={(open) => {
            setShowInitiateModal(open);
            if (!open) {
              setInitiateError(null);
              setInitiateStep(1);
            }
          }}
          title={
            initiateStep === 1
              ? locale === 'bn'
                ? 'পেআউট রিকোয়েস্ট এনট্রি (Step 1 of 2)'
                : 'Initiate Payout Request (Step 1 of 2)'
              : locale === 'bn'
              ? 'নেট এসক্রো ব্যালেন্স ও চার্জ নিশ্চিতকরণ (Step 2 of 2)'
              : 'Confirm Payout & Net Escrow Summary (Step 2 of 2)'
          }
        >
          <div className="space-y-4 text-xs">
            {initiateError && (
              <div className="p-3 border border-danger bg-surface text-danger text-xs font-semibold rounded-[var(--radius-md)] flex items-center justify-between">
                <span>{initiateError}</span>
                <button
                  type="button"
                  onClick={() => setInitiateError(null)}
                  className="underline cursor-pointer"
                >
                  <LocalizedText source={"বন্ধ করুন"} area="admin" />{" "}</button>
              </div>
            )}

            {/* STEP 1: Enter Amount & Review Account Info */}
            {initiateStep === 1 && (
              <div className="space-y-4">
                <div className="p-3.5 bg-surface border border-border rounded-[var(--radius-md)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-ink text-sm">
                      {localizedField(activeVendorSummary.profile, "businessNameBn", locale)} (
                      {activeVendorSummary.profile.vendorCode})
                    </span>
                    <Badge status="info">
                      <LocalizedText source={"হোল্ড:"} area="admin" />{" "}{activeVendorSummary.profile.escrowHoldDaysOverride ?? 7} {" "}<LocalizedText source={"দিন"} area="admin" />{" "}</Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-muted text-[11px]">
                    <div>
                      <LocalizedText source={"মালিক:"} area="admin" />{' '}
                      <strong className="text-ink">
                        {localizedField(activeVendorSummary.profile, "ownerNameBn", locale)}
                      </strong>
                    </div>
                    <div>
                      <LocalizedText source={"মোবাইল:"} area="admin" />{' '}
                      <strong className="font-mono text-ink">
                        {activeVendorSummary.profile.contactPhone}
                      </strong>
                    </div>
                    <div className="col-span-2">
                      <LocalizedText source={"পেআউট মেথড:"} area="admin" />{' '}
                      <strong className="text-ink">
                        {localizedField(activeVendorSummary.profile, "payoutMethodBn", locale)} (
                        {activeVendorSummary.profile.payoutAccountNo})
                      </strong>
                    </div>
                  </div>
                </div>

                <div className="p-3.5 border border-border bg-bg rounded-[var(--radius-md)] space-y-1">
                  <span className="text-[11px] font-bold text-muted">
                    <LocalizedText source={"সর্বোচ্চ উত্তোলনযোগ্য (Withdrawable Available):"} area="admin" />{" "}</span>
                  <p className="text-2xl font-bold font-mono text-success">
                    {formatPoishaToBdt(
                      activeVendorSummary.balance.withdrawablePoisha,
                      locale
                    )}
                  </p>
                  <p className="text-[11px] text-muted">
                    <LocalizedText source={"সর্বনিম্ন পেআউট সীমা:"} area="admin" />{" "}{formatPoishaToBdt(minPayoutPoisha, locale)}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <label className="block font-semibold text-ink">
                    <LocalizedText source={"উত্তোলনের পরিমাণ (৳ Taka) *"} area="admin" />{" "}</label>
                  <input
                    type="number"
                    value={payoutAmountTaka}
                    onChange={(e) => {
                      setPayoutAmountTaka(e.target.value);
                      setInitiateError(null);
                    }}
                    placeholder="1000"
                    className="w-full min-h-[42px] px-3 py-2 border border-border rounded-[var(--radius-md)] bg-bg text-ink text-base font-bold font-mono focus:outline-none focus:ring-1 focus:ring-ink"
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setShowInitiateModal(false)}
                  >
                    <LocalizedText source={"বাতিল"} area="admin" />{" "}</Button>
                  <Button
                    type="button"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      const amountTaka = Number(payoutAmountTaka) || 0;
                      const reqPoisha = Math.round(amountTaka * 100);
                      if (reqPoisha < minPayoutPoisha) {
                        setInitiateError(
                          `সর্বনিম্ন পেআউট পরিমাণ ${formatPoishaToBdt(
                            minPayoutPoisha,
                            locale
                          )}।`
                        );
                        return;
                      }
                      if (
                        reqPoisha >
                        activeVendorSummary.balance.withdrawablePoisha
                      ) {
                        setInitiateError(
                          `উত্তোলনের পরিমাণ উপলব্ধ ব্যালেন্সের চেয়ে বেশি হতে পারবে না।`
                        );
                        return;
                      }
                      setInitiateError(null);
                      setInitiateStep(2);
                    }}
                    rightIcon={<ArrowUpRight className="w-4 h-4" />}
                  >
                    <LocalizedText source={"পরবর্তী: ব্যালেন্স সামারি দেখুন"} area="admin" />{" "}</Button>
                </div>
              </div>
            )}

            {/* STEP 2: Net Escrow Balance Breakdown & Confirmation */}
            {initiateStep === 2 &&
              (() => {
                const reqPoisha = Math.round(
                  (Number(payoutAmountTaka) || 0) * 100
                );
                const remainingAvailable =
                  activeVendorSummary.balance.withdrawablePoisha - reqPoisha;
                const netTotalEscrowAfterPayout =
                  remainingAvailable +
                  activeVendorSummary.balance.lockedPoisha +
                  activeVendorSummary.balance.pendingPoisha -
                  activeVendorSummary.balance.clawbackDebtPoisha;
                const estCashoutFeePoisha = Math.round((reqPoisha * 185) / 10000);
                const estNetReceivePoisha = Math.max(
                  0,
                  reqPoisha - estCashoutFeePoisha
                );

                return (
                  <div className="space-y-4">
                    <div className="p-4 border border-border bg-surface rounded-[var(--radius-md)] space-y-2.5">
                      <h4 className="font-bold text-ink text-xs border-b border-border pb-2 flex items-center justify-between">
                        <span><LocalizedText source={"নেট এসক্রো ব্যালেন্স ও চার্জ সামারি"} area="admin" /></span>
                        <span className="text-[11px] font-mono text-muted">
                          {activeVendorSummary.profile.vendorCode}
                        </span>
                      </h4>

                      <div className="space-y-2 font-mono text-[11px]">
                        <div className="flex justify-between items-center text-success">
                          <span><LocalizedText source={"বর্তমান উত্তোলনযোগ্য (Available Balance):"} area="admin" /></span>
                          <span className="font-bold">
                            {formatPoishaToBdt(
                              activeVendorSummary.balance.withdrawablePoisha,
                              locale
                            )}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-danger font-bold border-b border-border pb-1.5">
                          <span><LocalizedText source={"(-) প্রস্তাবিত পেআউট অ্যামাউন্ট (Requested):"} area="admin" /></span>
                          <span>- {formatPoishaToBdt(reqPoisha, locale)}</span>
                        </div>

                        <div className="flex justify-between items-center text-muted">
                          <span><LocalizedText source={"আনুমানিক ক্যাশ-আউট চার্জ (১.৮৫%):"} area="admin" /></span>
                          <span>
                            - {formatPoishaToBdt(estCashoutFeePoisha, locale)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-success font-bold border-b border-border pb-1.5">
                          <span><LocalizedText source={"ভেন্ডরের একাউন্টে নিট প্রাপ্তি:"} area="admin" /></span>
                          <span>
                            {formatPoishaToBdt(estNetReceivePoisha, locale)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-ink font-bold">
                          <span><LocalizedText source={"(=) পেআউট পরবর্তী অবশিষ্ট উপলব্ধ:"} area="admin" /></span>
                          <span>
                            {formatPoishaToBdt(remainingAvailable, locale)}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-info">
                          <span><LocalizedText source={"(+) লকড বাকেট (Hold Period Escrow):"} area="admin" /></span>
                          <span>
                            +{' '}
                            {formatPoishaToBdt(
                              activeVendorSummary.balance.lockedPoisha,
                              locale
                            )}
                          </span>
                        </div>

                        <div className="flex justify-between items-center text-warning">
                          <span><LocalizedText source={"(+) পেন্ডিং বাকেট (In-Transit Escrow):"} area="admin" /></span>
                          <span>
                            +{' '}
                            {formatPoishaToBdt(
                              activeVendorSummary.balance.pendingPoisha,
                              locale
                            )}
                          </span>
                        </div>

                        {activeVendorSummary.balance.clawbackDebtPoisha > 0 && (
                          <div className="flex justify-between items-center text-danger">
                            <span><LocalizedText source={"(-) নেগেটিভ ক্লব্যাক দায় (Clawback Debt):"} area="admin" /></span>
                            <span>
                              -{' '}
                              {formatPoishaToBdt(
                                activeVendorSummary.balance.clawbackDebtPoisha,
                                locale
                              )}
                            </span>
                          </div>
                        )}

                        <div className="p-2.5 border-t border-ink bg-bg rounded-[var(--radius-sm)] flex justify-between items-center font-sans text-xs mt-2">
                          <span className="font-bold text-ink">
                            <LocalizedText source={"পেআউট পরবর্তী মোট নেট এসক্রো:"} area="admin" />{" "}</span>
                          <span className="font-mono font-bold text-sm text-ink">
                            {formatPoishaToBdt(
                              netTotalEscrowAfterPayout,
                              locale
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    <p className="text-[11px] text-muted leading-relaxed bg-surface p-2.5 border border-border rounded-[var(--radius-sm)]">
                      <strong><LocalizedText source={"ডাবল-রিকোয়েস্ট সেফটি:"} area="admin" /></strong> {" "}<LocalizedText source={"নিশ্চিত করার সাথে সাথে সমপরিমাণ টাকা"} area="admin" />{' '}
                      <strong><LocalizedText source={"PAYOUT_HOLD"} area="admin" /></strong> {" "}<LocalizedText source={"বাকেটে যুক্ত হবে এবং অ্যাডমিন অনুমোদন কিউতে চলে যাবে।"} area="admin" />{" "}</p>

                    <div className="flex items-center justify-between pt-2 border-t border-border">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setInitiateStep(1)}
                      >
                        <LocalizedText source={"← ব্যাকে যান"} area="admin" />{" "}</Button>

                      <Button
                        type="button"
                        variant="primary"
                        size="sm"
                        leftIcon={<CheckCircle2 className="w-4 h-4" />}
                        onClick={async () => {
                          const res = await fetch('/api/admin/workspace', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              operation: 'request_vendor_payout',
                              vendorId:
                                activeVendorSummary.profile.vendorId,
                              requestedAmountPoisha: reqPoisha,
                            }),
                          });
                          const data = (await res.json()) as {
                            success: boolean;
                            errorBn?: string;
                          };
                          if (data.success) {
                            setFeedback({
                              type: 'success',
                              text: `ভেন্ডর ${
                                activeVendorSummary.profile.businessNameBn
                              }-এর জন্য ${formatPoishaToBdt(
                                reqPoisha,
                                locale
                              )} পেআউট রিকোয়েস্ট সফলভাবে জমা হয়েছে!`,
                            });
                            setShowInitiateModal(false);
                            setInitiateStep(1);
                            await onRefreshWorkspace();
                          } else {
                            setInitiateError(
                              data.errorBn ?? 'পেআউট রিকোয়েস্ট জমা করা যায়নি।'
                            );
                          }
                        }}
                      >
                        <LocalizedText source={"অনুমোদনের জন্য কনফার্ম করুন"} area="admin" />{" "}</Button>
                    </div>
                  </div>
                );
              })()}
          </div>
        </ResponsiveSheet>
      )}

      {/* 9. Vendor Profile Dossier Responsive Sheet (5 Comprehensive Tabs) */}
      {inspectedVendor && (
        <ResponsiveSheet
          open={Boolean(inspectingVendorId)}
          onOpenChange={(open) => {
            if (!open) {
              setInspectingVendorId(null);
              setDossierSearch('');
            }
          }}
          title={`ভেন্ডর প্রোফাইল ডসিয়ার: ${inspectedVendor.profile.businessNameBn} (${inspectedVendor.profile.vendorCode})`}
        >
          <div className="space-y-4">
            {/* Top Quick Profile Info */}
            <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-ink">
                    {localizedField(inspectedVendor.profile, "businessNameBn", locale)}
                  </h3>
                  <p className="text-[11px] text-muted">
                    <LocalizedText source={"মালিক:"} area="admin" />{" "}<strong className="text-ink">{localizedField(inspectedVendor.profile, "ownerNameBn", locale)}</strong> {" "}<LocalizedText source={"· ফোন:"} area="admin" />{' '}
                    <span className="font-mono text-ink">{inspectedVendor.profile.contactPhone}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <Badge
                    status={
                      inspectedVendor.profile.status === 'active'
                        ? 'success'
                        : inspectedVendor.profile.status === 'pending_onboarding'
                        ? 'warning'
                        : 'danger'
                    }
                  >
                    {inspectedVendor.profile.status}
                  </Badge>
                  <span className="text-[11px] font-mono text-muted">
                    <LocalizedText source={"হোল্ড:"} area="admin" />{" "}{inspectedVendor.profile.escrowHoldDaysOverride ?? 7} {" "}<LocalizedText source={"দিন"} area="admin" />{" "}</span>
                </div>
              </div>
            </div>

            {/* Dossier Tabs */}
            <div className="border-b border-border flex flex-wrap items-center gap-1.5 text-xs">
              <button
                type="button"
                onClick={() => setDossierTab('overview')}
                className={`px-3 py-2 font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  dossierTab === 'overview'
                    ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <User className="w-3.5 h-3.5" />
                <span><LocalizedText source={"ওভারভিউ"} area="admin" /></span>
              </button>

              <button
                type="button"
                onClick={() => setDossierTab('products')}
                className={`px-3 py-2 font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  dossierTab === 'products'
                    ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                <span><LocalizedText source={"প্রোডাক্ট ও স্টক ("} area="admin" />{inspectedProducts.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setDossierTab('margins')}
                className={`px-3 py-2 font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  dossierTab === 'margins'
                    ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Percent className="w-3.5 h-3.5" />
                <span><LocalizedText source={"কবে কত টাকা মার্জিন ("} area="admin" />{inspectedLedger.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setDossierTab('dispatches')}
                className={`px-3 py-2 font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  dossierTab === 'dispatches'
                    ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Truck className="w-3.5 h-3.5" />
                <span><LocalizedText source={"কুরিয়ার ডিসপ্যাচ লগ ("} area="admin" />{inspectedOrders.length})</span>
              </button>

              <button
                type="button"
                onClick={() => setDossierTab('payout_fees')}
                className={`px-3 py-2 font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                  dossierTab === 'payout_fees'
                    ? 'border-ink text-ink bg-surface rounded-t-[var(--radius-sm)]'
                    : 'border-transparent text-muted hover:text-ink'
                }`}
              >
                <Wallet className="w-3.5 h-3.5" />
                <span><LocalizedText source={"ক্যাশ-আউট ও সেন্ড মানি চার্জ ("} area="admin" />{inspectedPayouts.length})</span>
              </button>
            </div>

            {/* TAB 1: OVERVIEW */}
            {dossierTab === 'overview' && (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  <div className="p-3 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
                    <span className="text-muted text-[11px]"><LocalizedText source={"পেন্ডিং (In-Transit):"} area="admin" /></span>
                    <p className="text-base font-bold font-mono text-warning">
                      {formatPoishaToBdt(
                        inspectedVendor.balance.pendingPoisha,
                        locale
                      )}
                    </p>
                  </div>

                  <div className="p-3 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
                    <span className="text-muted text-[11px]"><LocalizedText source={"লকড (Hold Period):"} area="admin" /></span>
                    <p className="text-base font-bold font-mono text-info">
                      {formatPoishaToBdt(
                        inspectedVendor.balance.lockedPoisha,
                        locale
                      )}
                    </p>
                  </div>

                  <div className="p-3 border-2 border-ink bg-bg rounded-[var(--radius-md)] space-y-1">
                    <span className="text-ink text-[11px] font-bold">
                      <LocalizedText source={"উত্তোলনযোগ্য (Available):"} area="admin" />{" "}</span>
                    <p className="text-lg font-bold font-mono text-success">
                      {formatPoishaToBdt(
                        inspectedVendor.balance.withdrawablePoisha,
                        locale
                      )}
                    </p>
                  </div>

                  <div className="p-3 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
                    <span className="text-muted text-[11px]"><LocalizedText source={"পেআউট হোল্ড:"} area="admin" /></span>
                    <p className="text-base font-bold font-mono text-ink">
                      {formatPoishaToBdt(
                        inspectedVendor.balance.payoutHoldPoisha,
                        locale
                      )}
                    </p>
                  </div>

                  <div className="p-3 border border-border bg-surface rounded-[var(--radius-md)] space-y-1">
                    <span className="text-muted text-[11px]"><LocalizedText source={"নেগেটিভ ক্লব্যাক:"} area="admin" /></span>
                    <p className="text-base font-bold font-mono text-danger">
                      {formatPoishaToBdt(
                        inspectedVendor.balance.clawbackDebtPoisha,
                        locale
                      )}
                    </p>
                  </div>
                </div>

                {/* Account Details Box */}
                <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-2">
                  <h4 className="font-bold text-ink border-b border-border pb-1.5">
                    <LocalizedText source={"অফিশিয়াল অ্যাকাউন্ট ও পেআউট বিবরণ"} area="admin" />{" "}</h4>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-muted text-[11px]">
                    <div>
                      <LocalizedText source={"পেআউট মেথড:"} area="admin" />{' '}
                      <strong className="text-ink">
                        {localizedField(inspectedVendor.profile, "payoutMethodBn", locale)}
                      </strong>
                    </div>
                    <div>
                      <LocalizedText source={"অ্যাকাউন্ট নম্বর:"} area="admin" />{' '}
                      <strong className="font-mono text-ink">
                        {inspectedVendor.profile.payoutAccountNo}
                      </strong>
                    </div>
                    <div>
                      <LocalizedText source={"নিবন্ধন তারিখ:"} area="admin" />{' '}
                      <strong className="font-mono text-ink">
                        {new Date(
                          inspectedVendor.profile.createdAt
                        ).toLocaleDateString('bn-BD')}
                      </strong>
                    </div>
                    <div>
                      <LocalizedText source={"ডিফল্ট কমিশন:"} area="admin" />{' '}
                      <strong className="font-mono text-ink">
                        {(
                          (inspectedVendor.profile.defaultCommissionBp ?? 1500) /
                          100
                        ).toFixed(1)}
                        %
                      </strong>
                    </div>
                  </div>
                </div>

                {/* 15-Question Onboarding Responses */}
                {inspectedVendor.profile.onboardingAnswers15 &&
                  Object.keys(inspectedVendor.profile.onboardingAnswers15)
                    .length > 0 && (
                    <div className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-2">
                      <h4 className="font-bold text-ink border-b border-border pb-1.5">
                        <LocalizedText source={"অনবোর্ডিং চুক্তি অডিট উত্তরসমূহ (15-Question Answers)"} area="admin" />{" "}</h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                        {Object.entries(
                          inspectedVendor.profile.onboardingAnswers15
                        ).map(([qKey, ans]) => (
                          <div
                            key={qKey}
                            className="p-2 bg-bg border border-border rounded-[var(--radius-sm)]"
                          >
                            <span className="font-semibold text-muted block text-[10px]">
                              {qKey}:
                            </span>
                            <span className="text-ink font-medium leading-tight">
                              {ans}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
            )}

            {/* TAB 2: PRODUCTS GALLERY WITH PHOTOS, STOCK & 3-TIER MARGIN BREAKDOWN */}
            {dossierTab === 'products' && (
              <div className="space-y-3 text-xs">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-muted" />
                  <input
                    type="text"
                    placeholder={uiText("প্রোডাক্টের নাম বা SKU খুঁজুন...", locale)}
                    value={dossierSearch}
                    onChange={(e) => setDossierSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 border border-border rounded-[var(--radius-sm)] bg-bg text-ink text-xs focus:outline-none focus:ring-1 focus:ring-ink"
                  />
                </div>

                {filteredInspectedProducts.length === 0 ? (
                  <div className="py-12 text-center text-muted border border-dashed border-border rounded-[var(--radius-md)]">
                    <Box className="w-8 h-8 mx-auto mb-2 text-muted/40" />
                    <p><LocalizedText source={"কোনো প্রোডাক্ট পাওয়া যায়নি।"} area="admin" /></p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[55vh] overflow-y-auto pr-1">
                    {filteredInspectedProducts.map((p) => {
                      const supplierProfitPoisha = Math.max(
                        0,
                        (p.supplierPayablePoisha ?? 0) -
                          (p.supplierCostPoisha ?? 0)
                      );
                      return (
                        <div
                          key={p.variantId}
                          className="p-3 border border-border rounded-[var(--radius-md)] bg-surface space-y-2.5 hover:border-ink transition-colors"
                        >
                          <div className="flex gap-3 items-start">
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={`https://picsum.photos/seed/${p.variantId}/300/200`}
                              alt={p.productNameBn}
                              referrerPolicy="no-referrer"
                              className="w-16 h-16 object-cover rounded-[var(--radius-sm)] border border-border shrink-0"
                            />
                            <div className="space-y-1 min-w-0 flex-1">
                              <h4 className="font-bold text-ink truncate text-xs">
                                {localizedField(p, "productNameBn", locale)} ({localizedField(p, "variantTitleBn", locale)})
                              </h4>
                              <div className="flex items-center gap-2 font-mono text-[10px] text-muted flex-wrap">
                                <span>
                                  <LocalizedText source={"SKU:"} area="admin" />{' '}
                                  <strong className="text-ink">
                                    {p.publicSku}
                                  </strong>
                                </span>
                                <Badge
                                  status={
                                    p.stockAvailable <=
                                    (p.lowStockThreshold ?? 5)
                                      ? 'warning'
                                      : 'success'
                                  }
                                >
                                  <LocalizedText source={"উপলব্ধ:"} area="admin" />{" "}{p.stockAvailable} {" "}<LocalizedText source={"টি"} area="admin" />{" "}</Badge>
                              </div>
                              <p className="text-[10px] font-mono text-muted">
                                <LocalizedText source={"গুদামে:"} area="admin" />{" "}{p.stockOnHand} {" "}<LocalizedText source={"· রিজার্ভড:"} area="admin" />{" "}{p.stockReserved} {" "}<LocalizedText source={"· কুরিয়ারে:"} area="admin" />{" "}{p.stockInTransit}
                              </p>
                            </div>
                          </div>

                          {/* 3-Tier Consignment Pricing & Margin Breakdown */}
                          <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-border text-[11px] font-mono bg-bg p-2 rounded-[var(--radius-sm)]">
                            <div>
                              <LocalizedText source={"কেনা দাম (Cost):"} area="admin" />{' '}
                              <strong className="text-ink">
                                {formatPoishaToBdt(
                                  p.supplierCostPoisha ?? 0,
                                  locale
                                )}
                              </strong>
                            </div>
                            <div>
                              <LocalizedText source={"সাপ্লায়ার লাভ:"} area="admin" />{' '}
                              <strong className="text-ink">
                                {formatPoishaToBdt(
                                  supplierProfitPoisha,
                                  locale
                                )}
                              </strong>
                            </div>
                            <div>
                              <LocalizedText source={"ভেন্ডর মোট পাওনা:"} area="admin" />{' '}
                              <strong className="text-success">
                                {formatPoishaToBdt(
                                  p.supplierPayablePoisha ?? 0,
                                  locale
                                )}
                              </strong>
                            </div>
                            <div>
                              <LocalizedText source={"প্ল্যাটফর্ম মার্জিন:"} area="admin" />{' '}
                              <strong className="text-info">
                                {formatPoishaToBdt(
                                  p.platformMarginPoisha ?? 0,
                                  locale
                                )}
                              </strong>
                            </div>
                            <div className="col-span-2 pt-1 border-t border-border flex items-center justify-between">
                              <span><LocalizedText source={"গ্রাহক বিক্রয় মূল্য (Sale Price):"} area="admin" /></span>
                              <strong className="text-ink text-xs">
                                {formatPoishaToBdt(p.salePricePoisha, locale)}
                              </strong>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: FINANCIAL MARGINS BY DATE & ORDER */}
            {dossierTab === 'margins' && (
              <div className="space-y-3 text-xs">
                {/* Summary KPI Strip */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 font-mono">
                  <div className="p-3 border border-border rounded-[var(--radius-sm)] bg-surface">
                    <span className="text-[10px] text-muted block font-sans">
                      <LocalizedText source={"মোট অর্জিত ভেন্ডর পেঅ্যাবল"} area="admin" />{" "}</span>
                    <strong className="text-sm text-success">
                      {formatPoishaToBdt(
                        inspectedLedger
                          .filter((e) => e.amountPoisha > 0)
                          .reduce((sum, e) => sum + e.amountPoisha, 0),
                        locale
                      )}
                    </strong>
                  </div>
                  <div className="p-3 border border-border rounded-[var(--radius-sm)] bg-surface">
                    <span className="text-[10px] text-muted block font-sans">
                      <LocalizedText source={"মোট পরিশোধিত পেআউট"} area="admin" />{" "}</span>
                    <strong className="text-sm text-ink">
                      {formatPoishaToBdt(
                        inspectedPayouts
                          .filter((p) => p.status === 'paid')
                          .reduce((sum, p) => sum + p.requestedAmountPoisha, 0),
                        locale
                      )}
                    </strong>
                  </div>
                  <div className="p-3 border border-border rounded-[var(--radius-sm)] bg-surface">
                    <span className="text-[10px] text-muted block font-sans">
                      <LocalizedText source={"গড় প্রোডাক্ট প্ল্যাটফর্ম মার্জিন"} area="admin" />{" "}</span>
                    <strong className="text-sm text-info">
                      {formatPoishaToBdt(
                        inspectedProducts.length > 0
                          ? Math.round(
                              inspectedProducts.reduce(
                                (acc, p) => acc + (p.platformMarginPoisha ?? 0),
                                0
                              ) / inspectedProducts.length
                            )
                          : 0,
                        locale
                      )}
                    </strong>
                  </div>
                </div>

                <div className="border border-border rounded-[var(--radius-md)] overflow-x-auto max-h-[45vh]">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="sticky top-0 bg-surface border-b border-border text-muted">
                      <tr>
                        <th className="p-2.5"><LocalizedText source={"তারিখ ও সময়"} area="admin" /></th>
                        <th className="p-2.5"><LocalizedText source={"অর্ডার নম্বর"} area="admin" /></th>
                        <th className="p-2.5"><LocalizedText source={"লেজার টাইপ ও বাকেট"} area="admin" /></th>
                        <th className="p-2.5"><LocalizedText source={"মার্জিন ও পাওনা বিবরণ"} area="admin" /></th>
                        <th className="p-2.5 text-right"><LocalizedText source={"পরিমাণ (BDT)"} area="admin" /></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {inspectedLedger.length === 0 ? (
                        <tr>
                          <td
                            colSpan={5}
                            className="p-8 text-center text-muted"
                          >
                            <LocalizedText source={"কোনো মার্জিন লেজার রেকর্ড নেই।"} area="admin" />{" "}</td>
                        </tr>
                      ) : (
                        inspectedLedger.map((e) => (
                          <tr key={e.id} className="hover:bg-surface/60">
                            <td className="p-2.5 font-mono text-[11px] text-muted">
                              <div>
                                {new Date(e.createdAt).toLocaleDateString(
                                  'bn-BD'
                                )}
                              </div>
                              <div className="text-[10px]">{e.id}</div>
                            </td>
                            <td className="p-2.5 font-mono font-bold text-ink">
                              {e.orderNo ?? '—'}
                            </td>
                            <td className="p-2.5 font-mono">
                              <Badge
                                status={
                                  e.amountPoisha < 0 ? 'danger' : 'info'
                                }
                              >
                                {e.entryType}
                              </Badge>
                            </td>
                            <td className="p-2.5 text-ink leading-relaxed max-w-xs text-[11px]">
                              {localizedField(e, "descriptionBn", locale)}
                            </td>
                            <td
                              className={`p-2.5 text-right font-mono font-bold ${
                                e.amountPoisha < 0
                                  ? 'text-danger'
                                  : 'text-success'
                              }`}
                            >
                              {formatPoishaToBdt(e.amountPoisha, locale)}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TAB 4: COURIER DISPATCHES TIMELINE */}
            {dossierTab === 'dispatches' && (
              <div className="space-y-3 text-xs max-h-[52vh] overflow-y-auto pr-1">
                {inspectedOrders.length === 0 ? (
                  <div className="py-12 text-center text-muted border border-dashed border-border rounded-[var(--radius-md)]">
                    <Truck className="w-8 h-8 mx-auto mb-2 text-muted/40" />
                    <p><LocalizedText source={"কোনো কুরিয়ার ডিসপ্যাচ রেকর্ড পাওয়া যায়নি।"} area="admin" /></p>
                  </div>
                ) : (
                  inspectedOrders.map((o) => {
                    const badgeStyle = getCourierBadgeStyle(o.courierProvider);
                    const rowItems =
                      (
                        o as unknown as {
                          items?: Array<{
                            productNameBn: string;
                            variantTitleBn: string;
                            publicSku: string;
                            quantity: number;
                          }>;
                        }
                      ).items ?? [];

                    return (
                      <div
                        key={o.id}
                        className="p-3.5 border border-border rounded-[var(--radius-md)] bg-surface space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                          <div className="flex items-center gap-2 font-mono">
                            <span className="font-bold text-ink text-xs">
                              {o.orderNo}
                            </span>
                            <span className="text-muted text-[11px]">
                              <LocalizedText source={"· ডিসপ্যাচ তারিখ:"} area="admin" />{' '}
                              {new Date(
                                o.createdAt ?? '2026-11-06T00:00:00.000Z'
                              ).toLocaleDateString('bn-BD')}
                            </span>
                          </div>

                          <div className="flex items-center gap-2 font-mono">
                            <span
                              className={`px-2 py-0.5 rounded-[var(--radius-sm)] text-[10px] font-bold ${badgeStyle.bg}`}
                            >
                              {badgeStyle.label}
                            </span>
                            <Badge
                              status={
                                o.status === 'delivered'
                                  ? 'success'
                                  : o.status === 'shipped'
                                  ? 'info'
                                  : 'warning'
                              }
                            >
                              {o.status}
                            </Badge>
                          </div>
                        </div>

                        {rowItems.length > 0 && (
                          <div className="text-[11px] bg-bg p-2 rounded-[var(--radius-sm)] border border-border">
                            {rowItems.map((it, idx) => (
                              <div
                                key={`${it.publicSku}-${idx}`}
                                className="flex items-center justify-between"
                              >
                                <span className="font-medium text-ink">
                                  {localizedField(it, "productNameBn", locale)} ({localizedField(it, "variantTitleBn", locale)})
                                </span>
                                <span className="font-mono text-muted">
                                  <LocalizedText source={"SKU:"} area="admin" />{" "}{it.publicSku} × {it.quantity} {" "}<LocalizedText source={"টি"} area="admin" />{" "}</span>
                              </div>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
                          <div>
                            <LocalizedText source={"গন্তব্য জেলা:"} area="admin" />{' '}
                            <strong className="text-ink">
                              {localizedField(o, "districtNameBn", locale)}
                            </strong>{' '}
                            ({o.streetAddress})
                          </div>
                          <div>
                            <LocalizedText source={"ট্র্যাকিং কোড:"} area="admin" />{' '}
                            <strong className="font-mono text-ink">
                              {o.trackingCode ?? '—'}
                            </strong>
                          </div>
                          <div>
                            <LocalizedText source={"কনসাইনমেন্ট আইডি:"} area="admin" />{' '}
                            <strong className="font-mono text-ink">
                              {o.consignmentId ?? '—'}
                            </strong>
                          </div>
                          <div>
                            <LocalizedText source={"ক্যাশ অন ডেলিভারি (COD):"} area="admin" />{' '}
                            <strong className="font-mono text-success">
                              {formatPoishaToBdt(
                                o.codCollectablePoisha,
                                locale
                              )}
                            </strong>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* TAB 5: PAYOUT CHARGES, CASH-OUT & SEND MONEY DETAILS */}
            {dossierTab === 'payout_fees' &&
              (() => {
                const withdrawablePoisha =
                  inspectedVendor.balance.withdrawablePoisha;
                const liveCalc = computeFeeBreakdownPoisha(
                  withdrawablePoisha,
                  selectedFeeChannel
                );

                return (
                  <div className="space-y-4 text-xs">
                    {/* Interactive Cash-Out & Send Money Fee Calculator for Current Balance */}
                    <div className="p-3.5 border border-border bg-surface rounded-[var(--radius-md)] space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-2">
                        <h4 className="font-bold text-ink flex items-center gap-1.5 text-xs">
                          <Wallet className="w-4 h-4 text-ink" />
                          <span>
                            <LocalizedText source={"ক্যাশ-আউট চার্জ ও সেন্ড মানি ফি ক্যালকুলেটর (Exact Poisha)"} area="admin" />{" "}</span>
                        </h4>
                        <span className="font-mono text-[11px] text-muted">
                          <LocalizedText source={"উত্তোলনযোগ্য:"} area="admin" />{' '}
                          <strong className="text-success">
                            {formatPoishaToBdt(withdrawablePoisha, locale)}
                          </strong>
                        </span>
                      </div>

                      {/* Channel Selector Buttons */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {(
                          [
                            {
                              id: 'bkash_merchant_185bp',
                              label: 'বিকাশ মার্চেন্ট ক্যাশ-আউট (১.৮৫% / ৳১৮.৫০ প্রতি হাজারে)',
                            },
                            {
                              id: 'personal_send_money',
                              label: 'পার্সোনাল সেন্ড মানি (৳১০ ফি + ১.৮৫% এজেন্ট ক্যাশ-আউট)',
                            },
                            {
                              id: 'bank_beftn_free',
                              label: 'ব্যাংক ট্রান্সফার BEFTN (৳০ চার্জ — ১-২ কার্যদিবস)',
                            },
                          ] as const
                        ).map((ch) => (
                          <button
                            key={ch.id}
                            type="button"
                            onClick={() => setSelectedFeeChannel(ch.id)}
                            className={`p-2.5 text-left rounded-[var(--radius-sm)] border text-[11px] font-semibold cursor-pointer transition-colors ${
                              selectedFeeChannel === ch.id
                                ? 'bg-ink text-bg border-ink'
                                : 'bg-bg text-ink border-border hover:border-ink'
                            }`}
                          >
                            {ch.label}
                          </button>
                        ))}
                      </div>

                      {/* Live Fee Breakdown Box */}
                      <div className="p-3 bg-bg border border-border rounded-[var(--radius-sm)] grid grid-cols-1 sm:grid-cols-3 gap-2 font-mono text-[11px]">
                        <div>
                          <span className="text-muted block font-sans text-[10px]">
                            <LocalizedText source={"মোট উত্তোলনযোগ্য ব্যালেন্স"} area="admin" />{" "}</span>
                          <strong className="text-ink text-sm">
                            {formatPoishaToBdt(withdrawablePoisha, locale)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-muted block font-sans text-[10px]">
                            <LocalizedText source={"প্রযোজ্য চার্জ ("} area="admin" />{localizedField(liveCalc, "ruleLabelBn", locale)})
                          </span>
                          <strong className="text-danger text-sm">
                            - {formatPoishaToBdt(liveCalc.feePoisha, locale)}
                          </strong>
                        </div>
                        <div>
                          <span className="text-muted block font-sans text-[10px]">
                            <LocalizedText source={"ভেন্ডর হাতে পাবেন (Net Disbursed)"} area="admin" />{" "}</span>
                          <strong className="text-success text-sm">
                            {formatPoishaToBdt(liveCalc.netPoisha, locale)}
                          </strong>
                        </div>
                      </div>
                    </div>

                    {/* Payout History List with Charge Breakdown */}
                    <div className="divide-y divide-border border border-border rounded-[var(--radius-md)] max-h-[38vh] overflow-y-auto">
                      {inspectedPayouts.length === 0 ? (
                        <p className="p-8 text-center text-muted">
                          <LocalizedText source={"কোনো পেআউট লেনদেন পাওয়া যায়নি।"} area="admin" />{" "}</p>
                      ) : (
                        inspectedPayouts.map((p) => {
                          const estCashoutChargePoisha = Math.round(
                            (p.requestedAmountPoisha * 185) / 10000
                          );
                          const netDisbursedPoisha = Math.max(
                            0,
                            p.requestedAmountPoisha - estCashoutChargePoisha
                          );

                          return (
                            <div
                              key={p.payoutId}
                              className="p-3.5 bg-surface space-y-2"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <span className="font-mono font-bold text-ink">
                                  {p.payoutId}
                                </span>
                                <div className="flex items-center gap-2 font-mono">
                                  <span className="font-bold text-ink">
                                    {formatPoishaToBdt(
                                      p.requestedAmountPoisha,
                                      locale
                                    )}
                                  </span>
                                  <Badge
                                    status={
                                      p.status === 'paid'
                                        ? 'success'
                                        : p.status === 'rejected'
                                        ? 'danger'
                                        : 'warning'
                                    }
                                  >
                                    {p.status}
                                  </Badge>
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-2 text-[11px] font-mono text-muted bg-bg p-2.5 rounded-[var(--radius-sm)] border border-border">
                                <div>
                                  <LocalizedText source={"মেথড:"} area="admin" />{' '}
                                  <strong className="text-ink">
                                    {localizedField(p, "payoutMethodBn", locale)}
                                  </strong>{' '}
                                  ({p.payoutAccountNo})
                                </div>
                                <div>
                                  <LocalizedText source={"TrxID:"} area="admin" />{' '}
                                  <strong className="text-ink">
                                    {p.paymentTrxId ?? '—'}
                                  </strong>
                                </div>
                                <div>
                                  <LocalizedText source={"ক্যাশ-আউট / সেন্ড মানি চার্জ (১.৮৫%):"} area="admin" />{' '}
                                  <strong className="text-danger">
                                    -{' '}
                                    {formatPoishaToBdt(
                                      estCashoutChargePoisha,
                                      locale
                                    )}
                                  </strong>
                                </div>
                                <div>
                                  <LocalizedText source={"ভেন্ডর নিট প্রাপ্তি:"} area="admin" />{' '}
                                  <strong className="text-success">
                                    {formatPoishaToBdt(
                                      netDisbursedPoisha,
                                      locale
                                    )}
                                  </strong>
                                </div>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}
          </div>
        </ResponsiveSheet>
      )}
    </section>
  );
}

