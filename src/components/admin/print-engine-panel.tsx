'use client';

// src/components/admin/print-engine-panel.tsx
// Module B & O: Streamlined Responsive A4 3-Part & 4x6 Thermal Print Engine
// Features:
//   1. Clean 3-Tab Layout: Print Queue (প্রিন্ট কিউ), Template Settings (টেম্পলেট সেটিংস), Print History (প্রিন্ট হিস্ট্রি)
//   2. Advanced Sorting: Order Date (Newest/Oldest), Highest COD, District, Courier
//   3. Direct Browser Native Print for A4 3-Part Slips & 4x6 Thermal Stickers
//   4. Responsive Mobile Cards & Desktop Grid Layouts
//   5. Strict Zero-Leak Security Rule A2 (Customer parts never leak vendor/cost details)

import * as React from 'react';
import Image from 'next/image';
import { adminFetch as fetch } from '@/src/lib/admin/admin-fetch';
import { QRCodeSVG } from 'qrcode.react';
import {
  Printer,
  Scissors,
  Sliders,
  AlertTriangle,
  CheckSquare,
  RefreshCw,
  Search,
  ArrowUpDown,
  History,
  ListFilter,
  CheckCircle2,
  Package,
  Truck,
  MapPin,
  Check,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  OrderPrintSlipBundle,
  PrintTemplateConfig,
} from '@/src/lib/admin/phase4b-service';
import { formatPoishaToBdt } from '@/src/lib/money';
import { formatLocaleNumber } from '@/src/lib/i18n/dictionaries';
import { Badge, Button, Card, Input } from '../ui/primitives';

/**
 * Deterministic SVG Code128-style Linear Barcode Renderer.
 * Produces crisp vector bars for thermal (203/300 DPI) & A4 laser/inkjet printing.
 */
export function Code128BarcodeSvg({
  value,
  height = 42,
}: {
  value: string;
  height?: number;
}) {
  const clean = (value || 'ORD-0000').toUpperCase();
  const bars: Array<{ x: number; w: number }> = [];
  let cursor = 0;

  // Start quiet-zone + start guard pattern
  const startPattern = [2, 1, 1, 2, 3, 2];
  for (let i = 0; i < startPattern.length; i++) {
    const w = startPattern[i]!;
    if (i % 2 === 0) {
      bars.push({ x: cursor, w });
    }
    cursor += w;
  }

  for (let idx = 0; idx < clean.length; idx++) {
    const code = clean.charCodeAt(idx);
    const b1 = ((code >> 0) & 1) + 1;
    const s1 = ((code >> 1) & 1) + 1;
    const b2 = ((code >> 2) & 1) + 1;
    const s2 = ((code >> 3) & 1) + 1;
    const b3 = ((code >> 4) & 1) + 1;
    const s3 = ((code >> 5) & 1) + 1;
    const seq = [b1, s1, b2, s2, b3, s3];
    for (let j = 0; j < seq.length; j++) {
      const w = seq[j]!;
      if (j % 2 === 0) {
        bars.push({ x: cursor, w });
      }
      cursor += w;
    }
  }

  // Stop guard pattern
  const stopPattern = [2, 3, 3, 1, 1, 1, 2];
  for (let i = 0; i < stopPattern.length; i++) {
    const w = stopPattern[i]!;
    if (i % 2 === 0) {
      bars.push({ x: cursor, w });
    }
    cursor += w;
  }

  return (
    <div className="inline-flex flex-col items-center">
      <svg
        viewBox={`0 0 ${cursor} ${height}`}
        className="w-full max-w-[220px] h-9 text-ink"
        role="img"
        aria-label={`Barcode ${clean}`}
      >
        {bars.map((b, idx) => (
          <rect
            key={idx}
            x={b.x}
            y={0}
            width={b.w}
            height={height}
            fill="currentColor"
          />
        ))}
      </svg>
      <span className="font-mono text-[10px] font-bold tracking-widest text-ink mt-0.5">
        {clean}
      </span>
    </div>
  );
}

export interface PrintEnginePanelProps {
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  isVendor: boolean;
  availableOrderNos: string[];
  initialPrintConfig: PrintTemplateConfig;
  onRefreshWorkspace: () => Promise<void>;
}

type PrintSubTab = 'queue' | 'templates' | 'history';
type PrintSortOption = 'newest' | 'oldest' | 'cod_desc' | 'district' | 'order_no';

export function PrintEnginePanel({
  locale,
  isSuperAdmin,
  isVendor,
  availableOrderNos,
  initialPrintConfig,
  onRefreshWorkspace,
}: PrintEnginePanelProps) {
  // Navigation & Sub-Tabs
  const [activeSubTab, setActiveSubTab] = React.useState<PrintSubTab>('queue');

  // Print Queue Controls
  const [selectedOrderNos, setSelectedOrderNos] =
    React.useState<string[]>(availableOrderNos);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [courierFilter, setCourierFilter] = React.useState<string>('ALL');
  const [sortOption, setSortOption] = React.useState<PrintSortOption>('newest');
  const [layoutMode, setLayoutMode] = React.useState<'a4_3part' | 'thermal_4x6'>(
    initialPrintConfig.defaultMode
  );

  // Print Slips & Config State
  const [printConfig, setPrintConfig] =
    React.useState<PrintTemplateConfig>(initialPrintConfig);
  const [slips, setSlips] = React.useState<OrderPrintSlipBundle[]>([]);
  const [loadingSlips, setLoadingSlips] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const [prevAvailableOrderNos, setPrevAvailableOrderNos] =
    React.useState(availableOrderNos);

  if (prevAvailableOrderNos !== availableOrderNos) {
    setPrevAvailableOrderNos(availableOrderNos);
    setSelectedOrderNos(availableOrderNos);
  }

  // Load Slips from Server
  const loadSlips = React.useCallback(
    async (ordersToLoad: string[], sortKey: PrintSortOption) => {
      if (ordersToLoad.length === 0) {
        setSlips([]);
        return;
      }
      setLoadingSlips(true);
      try {
        const res = await fetch('/api/admin/workspace', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operation: 'generate_print_slips',
            orderNos: ordersToLoad,
            sortBy: sortKey === 'newest' || sortKey === 'oldest' ? 'order_no' : sortKey,
          }),
        });
        const data = (await res.json()) as {
          success: boolean;
          printConfig?: PrintTemplateConfig;
          slips?: OrderPrintSlipBundle[];
        };
        if (data.success && data.slips) {
          setSlips(data.slips);
          if (data.printConfig) {
            setPrintConfig(data.printConfig);
          }
        }
      } finally {
        setLoadingSlips(false);
      }
    },
    []
  );

  // Fetch initial slips
  React.useEffect(() => {
    let active = true;
    if (availableOrderNos.length === 0) return;
    fetch('/api/admin/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'generate_print_slips',
        orderNos: availableOrderNos,
        sortBy: 'order_no',
      }),
    })
      .then((res) =>
        res.json() as Promise<{
          success: boolean;
          printConfig?: PrintTemplateConfig;
          slips?: OrderPrintSlipBundle[];
        }>
      )
      .then((data) => {
        if (!active) return;
        if (data.success && data.slips) {
          setSlips(data.slips);
          if (data.printConfig) {
            setPrintConfig(data.printConfig);
          }
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [availableOrderNos]);

  // Save Print Template Settings
  const handleSaveTemplateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const res = await fetch('/api/admin/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        operation: 'update_print_config',
        patch: printConfig,
      }),
    });
    const data = (await res.json()) as {
      success: boolean;
      errorBn?: string;
    };
    if (data.success) {
      setFeedback('প্রিন্ট টেমপ্লেট ও লেবেল সফলভাবে সেভ হয়েছে।');
      await onRefreshWorkspace();
    } else {
      setFeedback(data.errorBn ?? 'সেভ করা সম্ভব হয়নি।');
    }
  };

  // Filtered & Sorted Slips for Display
  const filteredAndSortedSlips = React.useMemo(() => {
    let result = [...slips];

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      result = result.filter((s) => {
        const p = s.customerAndCourierPart;
        return (
          p.orderNo.toLowerCase().includes(q) ||
          p.customerName.toLowerCase().includes(q) ||
          p.customerPhone.includes(q) ||
          p.districtNameBn.toLowerCase().includes(q) ||
          p.trackingCode.toLowerCase().includes(q)
        );
      });
    }

    // Courier filter
    if (courierFilter !== 'ALL') {
      result = result.filter(
        (s) => s.customerAndCourierPart.courierProvider === courierFilter
      );
    }

    // Sort
    result.sort((a, b) => {
      const pA = a.customerAndCourierPart;
      const pB = b.customerAndCourierPart;
      if (sortOption === 'newest') {
        return new Date(pB.createdAt).getTime() - new Date(pA.createdAt).getTime();
      }
      if (sortOption === 'oldest') {
        return new Date(pA.createdAt).getTime() - new Date(pB.createdAt).getTime();
      }
      if (sortOption === 'cod_desc') {
        return pB.codCollectablePoisha - pA.codCollectablePoisha;
      }
      if (sortOption === 'district') {
        return pA.districtNameBn.localeCompare(pB.districtNameBn, 'bn');
      }
      return pA.orderNo.localeCompare(pB.orderNo);
    });

    return result;
  }, [slips, searchQuery, courierFilter, sortOption]);

  const handleSelectAll = () => {
    const allFilteredNos = filteredAndSortedSlips.map((s) => s.orderNo);
    setSelectedOrderNos(allFilteredNos);
  };

  const handleDeselectAll = () => {
    setSelectedOrderNos([]);
  };

  const activeSlipsToPrint = React.useMemo(() => {
    return filteredAndSortedSlips.filter((s) =>
      selectedOrderNos.includes(s.orderNo)
    );
  }, [filteredAndSortedSlips, selectedOrderNos]);

  return (
    <section className="space-y-5">
      {/* Top Header & Sub-Tab Navigation Bar (Hidden during native print) */}
      <div className="print:hidden space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-ink flex items-center gap-2">
              <Printer className="w-5 h-5 text-ink shrink-0" aria-hidden="true" />
              <span>
                {locale === 'bn'
                  ? 'প্রিন্ট ইঞ্জিন ও ইনভয়েস স্টুডিও'
                  : 'Print Engine & Invoice Studio'}
              </span>
            </h1>
            <p className="text-xs text-muted">
              A4 ৩-ভাগ ইনভয়েস ও ৪x৬ থার্মাল কুরিয়ার স্টিকার এক ক্লিকে প্রিন্ট করুন।
            </p>
          </div>

          {/* Sub-Tab Navigation Switcher */}
          <div className="inline-flex items-center p-1 bg-surface border border-border rounded-[var(--radius-md)] self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveSubTab('queue')}
              className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubTab === 'queue'
                  ? 'bg-ink text-surface shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>প্রিন্ট কিউ ({availableOrderNos.length})</span>
            </button>

            {!isVendor && (
              <button
                type="button"
                onClick={() => setActiveSubTab('templates')}
                className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeSubTab === 'templates'
                    ? 'bg-ink text-surface shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>টেম্পলেট সেটিংস</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setActiveSubTab('history')}
              className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubTab === 'history'
                  ? 'bg-ink text-surface shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              <span>প্রিন্ট ইতিহাস</span>
            </button>
          </div>
        </div>

        {feedback && (
          <div className="p-3 border border-emerald-500/30 bg-emerald-500/10 text-emerald-800 text-xs font-semibold rounded-[var(--radius-md)] flex items-center justify-between">
            <span>{feedback}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              className="text-muted hover:text-ink text-xs font-bold"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* ====================================================================
          SUB-TAB 1: PRINT QUEUE (প্রিন্ট কিউ)
         ==================================================================== */}
      {activeSubTab === 'queue' && (
        <div className="space-y-4">
          {/* Controls Bar: Search, Sort, Filter, Mode & Action Buttons */}
          <div className="print:hidden space-y-3">
            <Card surface="bg" padding="md" className="space-y-3">
              {/* Row 1: Search, Sort, Courier Filter & Mode Switcher */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                {/* Search */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-3 text-muted" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="অর্ডার, নাম, ফোন বা ট্র্যাকিং কোড..."
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-surface border border-border rounded-[var(--radius-sm)] text-ink placeholder:text-muted"
                  />
                </div>

                {/* Sort Option */}
                <div className="flex items-center gap-1.5 bg-surface border border-border rounded-[var(--radius-sm)] px-2">
                  <ArrowUpDown className="w-3.5 h-3.5 text-muted shrink-0" />
                  <select
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as PrintSortOption)}
                    className="w-full py-1.5 text-xs bg-transparent text-ink border-0 focus:ring-0 cursor-pointer font-medium"
                  >
                    <option value="newest">নতুন অর্ডার আগে (Newest)</option>
                    <option value="oldest">পুরাতন অর্ডার আগে (Oldest)</option>
                    <option value="cod_desc">সর্বোচ্চ সিওডি বিল আগে (Highest COD)</option>
                    <option value="district">জেলা অনুযায়ী (District A-Z)</option>
                    <option value="order_no">অর্ডার নম্বর অনুযায়ী (Order No)</option>
                  </select>
                </div>

                {/* Courier Filter */}
                <div className="flex items-center gap-1.5 bg-surface border border-border rounded-[var(--radius-sm)] px-2">
                  <ListFilter className="w-3.5 h-3.5 text-muted shrink-0" />
                  <select
                    value={courierFilter}
                    onChange={(e) => setCourierFilter(e.target.value)}
                    className="w-full py-1.5 text-xs bg-transparent text-ink border-0 focus:ring-0 cursor-pointer font-medium"
                  >
                    <option value="ALL">সব কুরিয়ার (All Couriers)</option>
                    <option value="steadfast">Steadfast Courier</option>
                    <option value="pathao">Pathao Courier</option>
                    <option value="redx">RedX Delivery</option>
                    <option value="bd_post">BD Post (ডাক বিভাগ)</option>
                    <option value="manual">ম্যানুয়াল কুরিয়ার</option>
                  </select>
                </div>

                {/* Layout Mode Toggle */}
                <div className="flex items-center gap-1.5 bg-surface border border-border rounded-[var(--radius-sm)] px-2">
                  <FileText className="w-3.5 h-3.5 text-muted shrink-0" />
                  <select
                    value={layoutMode}
                    onChange={(e) =>
                      setLayoutMode(e.target.value as 'a4_3part' | 'thermal_4x6')
                    }
                    className="w-full py-1.5 text-xs bg-transparent text-ink font-bold border-0 focus:ring-0 cursor-pointer"
                  >
                    <option value="a4_3part">A4 ৩-ভাগ ইনভয়েস (Invoice + Sticker)</option>
                    <option value="thermal_4x6">৪x৬ থার্মাল কুরিয়ার স্টিকার (Thermal)</option>
                  </select>
                </div>
              </div>

              {/* Row 2: Selection Counters & Direct Print Trigger Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-2.5 py-1 rounded bg-surface border border-border text-ink hover:bg-bg font-semibold cursor-pointer"
                  >
                    সব সিলেক্ট ({filteredAndSortedSlips.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-2.5 py-1 rounded bg-surface border border-border text-muted hover:text-ink font-semibold cursor-pointer"
                  >
                    আনসেলেক্ট
                  </button>
                  <span className="font-mono text-ink font-bold bg-surface px-2 py-0.5 rounded border border-border">
                    {selectedOrderNos.length}টি সিলেক্টেড
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadSlips(selectedOrderNos, sortOption)}
                    disabled={loadingSlips}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    {loadingSlips ? 'লোড হচ্ছে...' : 'রিলোড'}
                  </Button>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => window.print()}
                    disabled={activeSlipsToPrint.length === 0}
                    leftIcon={<Printer className="w-4 h-4" />}
                  >
                    {layoutMode === 'a4_3part'
                      ? `A4 ৩-ভাগ ইনভয়েস প্রিন্ট (${activeSlipsToPrint.length})`
                      : `৪x৬ থার্মাল স্টিকার প্রিন্ট (${activeSlipsToPrint.length})`}
                  </Button>
                </div>
              </div>
            </Card>

            {/* Quick Overview Grid of Queued Orders */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {filteredAndSortedSlips.map((slip) => {
                const p12 = slip.customerAndCourierPart;
                const isSelected = selectedOrderNos.includes(slip.orderNo);

                return (
                  <div
                    key={slip.orderNo}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedOrderNos(
                          selectedOrderNos.filter((x) => x !== slip.orderNo)
                        );
                      } else {
                        setSelectedOrderNos([...selectedOrderNos, slip.orderNo]);
                      }
                    }}
                    className={`p-3 rounded-[var(--radius-md)] border cursor-pointer transition-colors space-y-2 ${
                      isSelected
                        ? 'bg-surface border-ink shadow-sm'
                        : 'bg-bg border-border hover:border-border/80 opacity-75'
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs border-b border-border pb-1.5">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {}}
                          className="accent-ink"
                        />
                        <span className="font-mono font-bold text-ink">
                          {p12.orderNo}
                        </span>
                      </div>
                      <Badge status="info">{p12.courierProvider.toUpperCase()}</Badge>
                    </div>

                    <div className="space-y-1 text-xs">
                      <p className="font-bold text-ink truncate">
                        {p12.customerName} ({p12.customerPhone})
                      </p>
                      <p className="text-muted text-[11px] truncate">
                        <MapPin className="w-3 h-3 inline mr-1" />
                        {p12.districtNameBn} — {p12.upazilaNameBn}
                      </p>
                      <div className="flex items-center justify-between pt-1 font-mono text-[11px]">
                        <span className="text-muted">
                          পণ্য: {p12.items.length}টি
                        </span>
                        <span className="font-bold text-ink">
                          COD: {formatPoishaToBdt(p12.codCollectablePoisha, locale)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ====================================================================
              PRINTABLE SLIPS CONTAINER (RENDERED NATIVELY ON BROWSER PRINT)
             ==================================================================== */}
          <div className="space-y-6 print:space-y-0">
            {activeSlipsToPrint.map((slip) => {
              const p12 = slip.customerAndCourierPart;
              const p3 = slip.internalPart3;

              if (layoutMode === 'thermal_4x6') {
                return (
                  <div
                    key={slip.orderNo}
                    className="max-w-[101.6mm] mx-auto border-2 border-ink bg-bg text-ink p-4 space-y-3 print:break-after-page"
                  >
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <div>
                        <p className="text-[10px] font-mono uppercase text-muted">
                          4x6 THERMAL COURIER STICKER
                        </p>
                        <p className="text-xs font-bold text-ink">
                          প্রেরক: {p12.senderBrandNameBn} ({p12.senderSupportPhone})
                        </p>
                      </div>
                      <Badge status="info">{p12.courierProvider.toUpperCase()}</Badge>
                    </div>

                    <div className="flex items-center justify-between gap-2 py-1">
                      <Code128BarcodeSvg value={p12.trackingCode} height={40} />
                      <QRCodeSVG value={p12.trackingUrl} size={56} />
                    </div>

                    <div className="p-2 border border-border rounded-[var(--radius-sm)] space-y-1 text-xs">
                      <p className="font-bold text-sm text-ink">
                        প্রাপক: {p12.customerName}
                      </p>
                      <p className="font-mono font-bold text-ink">
                        মোবাইল: {p12.customerPhone}
                      </p>
                      <p className="text-ink">
                        {p12.upazilaNameBn}, {p12.districtNameBn} — {p12.streetAddress}
                      </p>
                      {p12.landmark && (
                        <p className="text-muted text-[11px]">
                          ল্যান্ডমার্ক: {p12.landmark}
                        </p>
                      )}
                    </div>

                    {/* Large COD Box */}
                    <div className="p-2.5 border-2 border-ink bg-surface text-center">
                      <p className="text-[10px] font-bold uppercase text-muted">
                        ডেলিভারির সময় প্রদেয় (COD COLLECTABLE)
                      </p>
                      <p className="text-2xl font-bold font-mono tabular-nums text-ink">
                        {formatPoishaToBdt(p12.codCollectablePoisha, locale)}
                      </p>
                    </div>

                    <div className="text-[10px] font-mono text-muted flex justify-between pt-1 border-t border-border">
                      <span>Order: {p12.orderNo}</span>
                      <span>CNS: {p12.consignmentId}</span>
                    </div>
                  </div>
                );
              }

              // Default: Professional A4 3-Part Portrait Layout (210mm x 297mm)
              return (
                <div
                  key={slip.orderNo}
                  className="print-a4-sheet w-full max-w-[210mm] min-h-[290mm] mx-auto border border-border bg-bg text-ink p-3 sm:p-4 space-y-2.5 print:border-0 print:p-[5mm] print:space-y-1.5 print:break-after-page"
                >
                  {/* ==========================================================
                      PART 1: CUSTOMER INVOICE (গ্রাহক ইনভয়েস — ZERO COST LEAK)
                     ========================================================== */}
                  <div className="border border-ink/80 rounded-[var(--radius-sm)] p-2.5 space-y-1.5 bg-bg">
                    <div className="flex items-start justify-between border-b border-border pb-1.5 gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-[var(--radius-sm)] border border-ink bg-ink text-bg flex items-center justify-center font-bold text-sm shrink-0">
                          প
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 bg-surface border border-border rounded text-ink">
                              PART 1 · {printConfig.part1TitleBn}
                            </span>
                            <span className="text-[9px] font-mono text-muted">
                              A4 Official Copy
                            </span>
                          </div>
                          <h2 className="text-xs sm:text-sm font-bold text-ink leading-tight mt-0.5">
                            {p12.senderBrandNameBn} ({p12.senderBrandNameEn})
                          </h2>
                          <p className="text-[9.5px] text-muted leading-tight">
                            হেল্পলাইন: {p12.senderSupportPhone} · ইস্যু তারিখ:{' '}
                            {new Date(p12.createdAt).toLocaleDateString('bn-BD')}
                          </p>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums space-y-0.5">
                        <p className="text-xs font-bold text-ink bg-surface px-2 py-0.5 border border-border rounded">
                          ইনভয়েস: {p12.orderNo}
                        </p>
                        <p className="text-[9.5px] text-ink font-semibold">
                          পেমেন্ট: {p12.paymentMethod.toUpperCase()} ({p12.paymentStatus})
                        </p>
                        <p className="text-[9px] text-muted">
                          কুরিয়ার: {p12.courierProvider.toUpperCase()} · {p12.trackingCode}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-[10.5px]">
                      {/* Customer Address Box */}
                      <div className="sm:col-span-4 border border-border rounded-[var(--radius-sm)] p-2 bg-surface/50 space-y-0.5">
                        <p className="text-[9px] font-mono uppercase text-muted font-bold">
                          গ্রাহকের বিবরণ (BILL & SHIP TO)
                        </p>
                        <p className="font-bold text-ink text-[11px]">
                          {p12.customerName}
                        </p>
                        <p className="font-mono font-bold text-ink text-[10.5px]">
                          মোবাইল: {p12.customerPhone}
                        </p>
                        <p className="text-ink text-[10px] leading-snug">
                          {p12.upazilaNameBn}, {p12.districtNameBn} —{' '}
                          {p12.streetAddress}
                        </p>
                        {p12.landmark && (
                          <p className="text-muted text-[9.5px]">
                            ল্যান্ডমার্ক: {p12.landmark}
                          </p>
                        )}
                      </div>

                      {/* Customer Itemized Table */}
                      <div className="sm:col-span-8 flex flex-col justify-between">
                        <table className="w-full text-left border-collapse text-[9.5px] tabular-nums">
                          <thead>
                            <tr className="border-b border-border bg-surface text-ink font-bold">
                              <th className="py-1 px-1.5">#</th>
                              <th className="py-1 px-1.5">পণ্যের বিবরণ ও ভ্যারিয়েন্ট (Public SKU)</th>
                              <th className="py-1 px-1.5 text-center">পরিমাণ</th>
                              <th className="py-1 px-1.5 text-right">একক মূল্য</th>
                              <th className="py-1 px-1.5 text-right">মোট মূল্য</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {p12.items.map((item, idx) => (
                              <tr key={idx}>
                                <td className="py-1 px-1.5 font-mono text-muted">
                                  {idx + 1}
                                </td>
                                <td className="py-1 px-1.5">
                                  <div className="flex items-center gap-1.5">
                                    <div className="relative w-5 h-5 border border-border rounded overflow-hidden shrink-0">
                                      <Image
                                        src={item.imageUrl}
                                        alt={item.productNameBn}
                                        fill
                                        sizes="20px"
                                        referrerPolicy="no-referrer"
                                        className="object-cover"
                                      />
                                    </div>
                                    <div className="leading-tight">
                                      <span className="font-semibold text-ink">
                                        {item.productNameBn}
                                      </span>{' '}
                                      <span className="text-muted text-[9px]">
                                        ({item.variantTitleBn})
                                      </span>
                                      <div className="font-mono text-[8.5px] text-muted">
                                        SKU: {item.publicSku}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-1 px-1.5 text-center font-mono font-bold">
                                  {formatLocaleNumber(item.quantity, locale)}
                                </td>
                                <td className="py-1 px-1.5 text-right font-mono">
                                  {formatPoishaToBdt(
                                    item.unitSalePricePoisha,
                                    locale
                                  )}
                                </td>
                                <td className="py-1 px-1.5 text-right font-mono font-bold text-ink">
                                  {formatPoishaToBdt(
                                    item.lineSubtotalPoisha,
                                    locale
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {/* Customer Bill Breakdown Strip */}
                        <div className="mt-1.5 pt-1 border-t border-border flex flex-wrap items-center justify-between gap-1 text-[9.5px]">
                          <span className="text-muted text-[9px] max-w-[52%] leading-tight">
                            * {printConfig.footerNoteBn}
                          </span>
                          <div className="font-mono tabular-nums flex flex-wrap items-center gap-2 bg-surface px-2 py-1 rounded border border-border">
                            <span>
                              সাবটোটাল:{' '}
                              <strong>
                                {formatPoishaToBdt(p12.subtotalPoisha, locale)}
                              </strong>
                            </span>
                            {p12.discountPoisha > 0 && (
                              <span>
                                ছাড়: -
                                {formatPoishaToBdt(p12.discountPoisha, locale)}
                              </span>
                            )}
                            <span>
                              ডেলিভারি:{' '}
                              {formatPoishaToBdt(
                                p12.deliveryChargePoisha,
                                locale
                              )}
                            </span>
                            {p12.advancePaidPoisha > 0 && (
                              <span>
                                অগ্রিম: -
                                {formatPoishaToBdt(
                                  p12.advancePaidPoisha,
                                  locale
                                )}
                              </span>
                            )}
                            <span className="font-bold text-ink border-l border-border pl-2">
                              ডেলিভারিতে প্রদেয় (COD):{' '}
                              {formatPoishaToBdt(
                                p12.codCollectablePoisha,
                                locale
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CUT LINE 1 */}
                  <div className="flex items-center gap-2 text-[8.5px] font-mono text-muted py-0">
                    <Scissors className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <div className="flex-1 border-t border-dashed border-ink" />
                    <span>✂ CUT HERE (PART 1 CUSTOMER COPY / PART 2 COURIER BOX LABEL)</span>
                    <div className="flex-1 border-t border-dashed border-ink" />
                  </div>

                  {/* ==========================================================
                      PART 2: COURIER BOX STICKER (কুরিয়ার বক্স স্টিকার)
                     ========================================================== */}
                  <div className="border border-ink/80 rounded-[var(--radius-sm)] p-2.5 space-y-1.5 bg-bg">
                    <div className="flex items-center justify-between border-b border-border pb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 bg-surface border border-border rounded text-ink">
                          PART 2 · {printConfig.part2TitleBn}
                        </span>
                        <span className="text-[10px] font-bold text-ink">
                          প্রেরক: {p12.senderBrandNameBn} (হেল্পলাইন:{' '}
                          {p12.senderSupportPhone})
                        </span>
                      </div>
                      <div className="text-right font-mono text-[10px] tabular-nums">
                        <span className="font-bold uppercase px-1.5 py-0.5 bg-ink text-bg rounded">
                          {p12.courierProvider}
                        </span>{' '}
                        · <span className="font-bold">{p12.consignmentId}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <div className="sm:col-span-5 text-[10.5px] space-y-0.5 border-r border-border pr-2">
                        <p className="text-[8.5px] font-mono uppercase text-muted font-bold">
                          ডেলিভারি ঠিকানা (DELIVER TO)
                        </p>
                        <p className="font-bold text-ink text-xs">
                          প্রাপক: {p12.customerName}
                        </p>
                        <p className="font-mono font-bold text-ink text-[11px]">
                          ফোন: {p12.customerPhone}
                        </p>
                        <p className="text-ink text-[10px] leading-snug font-medium">
                          {p12.upazilaNameBn}, {p12.districtNameBn} —{' '}
                          {p12.streetAddress}
                        </p>
                        {p12.landmark && (
                          <p className="text-muted text-[9.5px]">
                            ল্যান্ডমার্ক: {p12.landmark}
                          </p>
                        )}
                      </div>

                      <div className="sm:col-span-4 flex items-center justify-center gap-2.5 py-0.5">
                        <div className="text-center">
                          <Code128BarcodeSvg value={p12.trackingCode} height={34} />
                        </div>
                        <QRCodeSVG value={p12.trackingUrl} size={46} />
                      </div>

                      <div className="sm:col-span-3 border-2 border-ink bg-surface p-1.5 text-center rounded-[var(--radius-sm)]">
                        <p className="text-[8.5px] font-bold uppercase text-muted">
                          ডেলিভারির সময় প্রদেয় (COD)
                        </p>
                        <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-ink leading-tight">
                          {formatPoishaToBdt(p12.codCollectablePoisha, locale)}
                        </p>
                        <p className="text-[8.5px] font-mono text-muted">
                          Order: {p12.orderNo} · পিস:{' '}
                          {p12.items.reduce((acc, i) => acc + i.quantity, 0)}টি
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* CUT LINE 2 */}
                  <div className="flex items-center gap-2 text-[8.5px] font-mono text-muted py-0">
                    <Scissors className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <div className="flex-1 border-t border-dashed border-ink" />
                    <span>
                      ✂ CUT HERE — PART 3 ADMIN, ACCOUNTS & WAREHOUSE MASTER RECORD (অ্যাডমিন ও হিসাব সংরক্ষণ কপি)
                    </span>
                    <div className="flex-1 border-t border-dashed border-ink" />
                  </div>

                  {/* ==========================================================
                      PART 3: ADMIN, ACCOUNTS & WAREHOUSE MASTER COPY
                      (পূর্ণাঙ্গ প্রোডাক্ট, সাপ্লায়ার, কেনা দাম, লাভ, মার্জিন ও হিসাব ব্রেকডাউন)
                     ========================================================== */}
                  <div className="border-2 border-ink rounded-[var(--radius-sm)] p-2.5 bg-surface/60 space-y-2">
                    {/* Part 3 Header & Operational Telemetry Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border pb-1.5">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 bg-ink text-bg rounded">
                            PART 3 · {printConfig.part3TitleBn}
                          </span>
                          <span className="text-[9.5px] font-mono font-bold text-ink">
                            অর্ডার: {p3.orderNo}
                          </span>
                          <span className="text-[9px] font-mono text-muted">
                            · এসক্রো রুল: {p3.estimatedMaturityDaysLabelBn}
                          </span>
                        </div>
                        <p className="text-[9px] text-muted mt-0.5 font-mono">
                          গ্রাহক: {p3.customerName ?? p12.customerName} (
                          {p3.customerPhone ?? p12.customerPhone}) · সোর্স:{' '}
                          {(p3.orderSource ?? 'storefront').toUpperCase()} · কল স্ট্যাটাস:{' '}
                          {p3.callStatus ?? 'confirmed_yes'} (চেষ্টা:{' '}
                          {formatLocaleNumber(p3.callAttempts ?? 1, locale)}) · ঝুঁকি:{' '}
                          {p3.fraudRiskTierBn ?? 'নিরাপদ'} (স্কোর:{' '}
                          {formatLocaleNumber(p3.addressQualityScore ?? 85, locale)}%)
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 font-mono text-[9px]">
                        <span className="px-1.5 py-0.5 rounded border border-border bg-bg text-ink font-bold">
                          প্রিন্ট: {formatLocaleNumber(p3.printCount, locale)} বার
                        </span>
                        {p3.isReprintWarning && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-warning bg-bg text-warning font-bold">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span>ডুপ্লিকেট প্রিন্ট সতর্কতা</span>
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Exhaustive Line-Item Product, Supplier & Financial Breakdown Table */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-[8.5px] leading-tight tabular-nums">
                        <thead>
                          <tr className="border-b border-ink/40 bg-bg text-ink font-bold">
                            <th className="py-1 px-1">#</th>
                            <th className="py-1 px-1">সাপ্লায়ার ও লট (Supplier & Lot)</th>
                            <th className="py-1 px-1">
                              পণ্য, ভ্যারিয়েন্ট, Public ও Internal SKU (Bin)
                            </th>
                            <th className="py-1 px-1 text-center">পরিমাণ</th>
                            {(isSuperAdmin || isVendor) && (
                              <>
                                <th className="py-1 px-1 text-right">
                                  একক কেনা (Cost)
                                </th>
                                <th className="py-1 px-1 text-right">
                                  সাপ্লায়ার লাভ (Profit)
                                </th>
                                <th className="py-1 px-1 text-right">
                                  সাপ্লায়ার প্রদেয় (Payable)
                                </th>
                              </>
                            )}
                            {isSuperAdmin && (
                              <>
                                <th className="py-1 px-1 text-right">
                                  কমিশন ও গ্রস মার্জিন
                                </th>
                                <th className="py-1 px-1 text-right">
                                  প্রোমো ছাড় ও নিট মার্জিন
                                </th>
                              </>
                            )}
                            <th className="py-1 px-1 text-right">খুচরা বিক্রয় (Sale)</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border bg-bg/70">
                          {p3.lines.map((line, idx) => (
                            <tr key={idx}>
                              <td className="py-1 px-1 font-mono text-muted">
                                {line.lineNo ?? idx + 1}
                              </td>
                              <td className="py-1 px-1">
                                <div className="font-bold text-ink">
                                  {line.vendorBusinessName} ({line.vendorCode})
                                </div>
                                <div className="font-mono text-[8px] text-muted">
                                  {line.consignmentLotRef ?? 'LOT-ACTIVE'}
                                  {line.vendorContactPhone
                                    ? ` · ${line.vendorContactPhone}`
                                    : ''}
                                  {line.vendorPayoutMethodBn
                                    ? ` · ${line.vendorPayoutMethodBn}`
                                    : ''}
                                </div>
                              </td>
                              <td className="py-1 px-1">
                                <div className="font-semibold text-ink">
                                  {line.productNameBn}{' '}
                                  <span className="text-muted font-normal">
                                    ({line.variantTitleBn})
                                  </span>
                                </div>
                                <div className="font-mono text-[8px] text-muted">
                                  Public: <strong className="text-ink">{line.publicSku}</strong> ·
                                  Vendor SKU:{' '}
                                  <strong className="text-ink">
                                    {line.internalVendorSku}
                                  </strong>{' '}
                                  · {line.warehouseBinCode ?? 'BIN-A1'} ·{' '}
                                  {line.weightGrams ?? 450}g
                                </div>
                              </td>
                              <td className="py-1 px-1 text-center font-mono font-bold text-ink">
                                {formatLocaleNumber(line.quantity, locale)}টি
                              </td>
                              {(isSuperAdmin || isVendor) && (
                                <>
                                  <td className="py-1 px-1 text-right font-mono">
                                    <div>
                                      {formatPoishaToBdt(
                                        line.snapSupplierCostPoisha ?? 0,
                                        locale
                                      )}
                                    </div>
                                    <div className="text-[7.5px] text-muted">
                                      মোট:{' '}
                                      {formatPoishaToBdt(
                                        line.lineSupplierCostTotalPoisha ??
                                          (line.snapSupplierCostPoisha ?? 0) *
                                            line.quantity,
                                        locale
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-1 px-1 text-right font-mono">
                                    <div>
                                      +
                                      {formatPoishaToBdt(
                                        line.snapSupplierProfitPoisha ?? 0,
                                        locale
                                      )}
                                    </div>
                                    <div className="text-[7.5px] text-muted">
                                      মোট:{' '}
                                      {formatPoishaToBdt(
                                        line.lineSupplierProfitTotalPoisha ?? 0,
                                        locale
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-1 px-1 text-right font-mono font-bold text-ink">
                                    <div>
                                      {formatPoishaToBdt(
                                        line.lineSupplierPayableTotalPoisha ??
                                          (line.snapSupplierPayablePoisha ?? 0) *
                                            line.quantity,
                                        locale
                                      )}
                                    </div>
                                    <div className="text-[7.5px] font-normal text-muted">
                                      একক:{' '}
                                      {formatPoishaToBdt(
                                        line.snapSupplierPayablePoisha ?? 0,
                                        locale
                                      )}
                                    </div>
                                  </td>
                                </>
                              )}
                              {isSuperAdmin && (
                                <>
                                  <td className="py-1 px-1 text-right font-mono">
                                    <div className="font-semibold text-ink">
                                      {formatPoishaToBdt(
                                        line.linePlatformMarginTotalPoisha ??
                                          (line.snapPlatformMarginPoisha ?? 0) *
                                            line.quantity,
                                        locale
                                      )}
                                    </div>
                                    <div className="text-[7.5px] text-muted">
                                      {((line.commissionBp ?? 0) / 100).toFixed(1)}% (একক:{' '}
                                      {formatPoishaToBdt(
                                        line.snapPlatformMarginPoisha ?? 0,
                                        locale
                                      )}
                                      )
                                    </div>
                                  </td>
                                  <td className="py-1 px-1 text-right font-mono">
                                    <div className="font-bold text-success">
                                      {formatPoishaToBdt(
                                        line.lineNetPlatformMarginPoisha ??
                                          (line.snapPlatformMarginPoisha ?? 0) *
                                            line.quantity,
                                        locale
                                      )}
                                    </div>
                                    <div className="text-[7.5px] text-muted">
                                      ছাড়: -
                                      {formatPoishaToBdt(
                                        line.allocatedPromoDiscountPoisha ?? 0,
                                        locale
                                      )}
                                    </div>
                                  </td>
                                </>
                              )}
                              <td className="py-1 px-1 text-right font-mono font-bold text-ink">
                                <div>
                                  {formatPoishaToBdt(
                                    line.lineSaleSubtotalPoisha ?? 0,
                                    locale
                                  )}
                                </div>
                                <div className="text-[7.5px] font-normal text-muted">
                                  একক:{' '}
                                  {formatPoishaToBdt(
                                    line.unitSalePricePoisha ?? 0,
                                    locale
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Super Admin Complete Financial & Supplier Reconciliation Matrix */}
                    {isSuperAdmin && p3.accountingSummary && (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 text-[8.5px] font-mono tabular-nums">
                        {/* Left: Per-Vendor Escrow Payable Breakdown */}
                        <div className="sm:col-span-5 border border-border rounded-[var(--radius-sm)] p-1.5 bg-bg space-y-1">
                          <p className="font-bold text-ink uppercase text-[8px] border-b border-border pb-0.5">
                            সাপ্লায়ার-ভিত্তিক প্রদেয় ও পেআউট বিভাজন (SUPPLIER ESCROW SPLIT)
                          </p>
                          {p3.accountingSummary.vendorSplitBreakdown.map(
                            (vs) => (
                              <div
                                key={vs.vendorCode}
                                className="flex items-center justify-between gap-1 border-b border-border/60 last:border-0 pb-0.5"
                              >
                                <div className="leading-tight">
                                  <span className="font-bold text-ink">
                                    {vs.vendorCode} · {vs.vendorNameBn}
                                  </span>
                                  <div className="text-[7.5px] text-muted">
                                    {vs.payoutMethodBn} ({vs.payoutAccountNo}) ·{' '}
                                    {vs.totalUnits} পিস
                                  </div>
                                </div>
                                <div className="text-right leading-tight">
                                  <span className="font-bold text-ink">
                                    প্রদেয়:{' '}
                                    {formatPoishaToBdt(
                                      vs.supplierPayablePoisha,
                                      locale
                                    )}
                                  </span>
                                  <div className="text-[7.5px] text-muted">
                                    কেনা:{' '}
                                    {formatPoishaToBdt(
                                      vs.supplierCostPoisha,
                                      locale
                                    )}{' '}
                                    | লাভ:{' '}
                                    {formatPoishaToBdt(
                                      vs.supplierProfitPoisha,
                                      locale
                                    )}
                                  </div>
                                </div>
                              </div>
                            )
                          )}
                        </div>

                        {/* Right: Order-Level P&L, Delivery, bKash & Net Profit Ledger */}
                        <div className="sm:col-span-7 border border-border rounded-[var(--radius-sm)] p-1.5 bg-bg">
                          <p className="font-bold text-ink uppercase text-[8px] border-b border-border pb-0.5 mb-1">
                            পূর্ণাঙ্গ অর্ডার হিসাব-নিকাশ ও নিট প্ল্যাটফর্ম লাভ (ORDER P&L & LEDGER SUMMARY)
                          </p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 leading-snug">
                            <div className="flex justify-between">
                              <span className="text-muted">পণ্যের মোট বিক্রয়:</span>
                              <span className="font-bold text-ink">
                                {formatPoishaToBdt(
                                  p3.accountingSummary
                                    .grossMerchandiseSubtotalPoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">
                                প্রোমো ছাড় ({p3.accountingSummary.promoCode ?? 'N/A'}):
                              </span>
                              <span className="text-danger">
                                -
                                {formatPoishaToBdt(
                                  p3.accountingSummary.promoDiscountPoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">ডেলিভারি (গ্রাহক/প্রকৃত):</span>
                              <span>
                                {formatPoishaToBdt(
                                  p3.accountingSummary
                                    .customerDeliveryChargePoisha,
                                  locale
                                )}{' '}
                                /{' '}
                                {formatPoishaToBdt(
                                  p3.accountingSummary
                                    .estimatedActualCourierCostPoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">মোট সাপ্লায়ার কেনা দাম:</span>
                              <span>
                                {formatPoishaToBdt(
                                  p3.accountingSummary.totalSupplierCostPoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">মোট সাপ্লায়ার লাভ:</span>
                              <span>
                                +
                                {formatPoishaToBdt(
                                  p3.accountingSummary
                                    .totalSupplierProfitPoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between font-bold text-ink">
                              <span>সাপ্লায়ার প্রদেয় (Escrow):</span>
                              <span>
                                {formatPoishaToBdt(
                                  p3.accountingSummary
                                    .totalSupplierPayableEscrowPoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">
                                অগ্রিম ({p3.manualPaymentTrxId ?? 'COD'}):
                              </span>
                              <span>
                                {formatPoishaToBdt(
                                  p3.accountingSummary.advancePaidPoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between font-bold text-ink">
                              <span>কুরিয়ার সিওডি প্রাপ্য:</span>
                              <span>
                                {formatPoishaToBdt(
                                  p3.accountingSummary.codCollectablePoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted">প্যাকিং ও ভ্যাট (৫%):</span>
                              <span>
                                -
                                {formatPoishaToBdt(
                                  p3.accountingSummary
                                    .packagingMaterialCostPoisha +
                                    p3.accountingSummary
                                      .estimatedVatOnMarginPoisha,
                                  locale
                                )}
                              </span>
                            </div>
                          </div>
                          <div className="mt-1 pt-1 border-t border-border flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[8px] text-muted">
                              হিসাব সূত্র: গ্রস মার্জিন (
                              {formatPoishaToBdt(
                                p3.accountingSummary.grossPlatformMarginPoisha,
                                locale
                              )}
                              ) - ছাড় - ডেলিভারি ভর্তুকি - প্যাকিং - ৫% ভ্যাট
                            </span>
                            <span className="text-[9.5px] font-bold text-success bg-surface px-2 py-0.5 rounded border border-border">
                              নিট প্ল্যাটফর্ম লাভ (Net Profit):{' '}
                              {formatPoishaToBdt(
                                p3.accountingSummary
                                  .netPlatformRetainedProfitPoisha,
                                locale
                              )}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Warehouse QC Checklist, Staff Notes & 3-Role Signature Strip */}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 border-t border-border text-[8.5px] items-end">
                      <div className="sm:col-span-7 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                          {p3.checklistItemsBn.map((chk, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 text-ink font-medium"
                            >
                              <CheckSquare className="w-2.5 h-2.5 text-ink shrink-0" />
                              <span>{chk}</span>
                            </span>
                          ))}
                        </div>
                        {p3.internalStaffNote && (
                          <p className="font-mono text-[8px] text-ink bg-bg px-1.5 py-0.5 rounded border border-border">
                            স্টাফ নোট: {p3.internalStaffNote}
                          </p>
                        )}
                      </div>

                      <div className="sm:col-span-5 grid grid-cols-3 gap-1.5 text-center font-mono text-[8px] pt-2">
                        <div className="border-t border-ink pt-0.5 text-muted">
                          প্যাকিং অফিসার
                        </div>
                        <div className="border-t border-ink pt-0.5 text-muted">
                          কিউসি যাচাইকারী
                        </div>
                        <div className="border-t border-ink pt-0.5 text-muted">
                          অ্যাডমিন / হিসাব রক্ষণ
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 2: TEMPLATE SETTINGS (টেম্পলেট সেটিংস)
         ==================================================================== */}
      {activeSubTab === 'templates' && !isVendor && (
        <Card surface="bg" padding="md" className="space-y-4 print:hidden">
          <div className="border-b border-border pb-2">
            <h2 className="text-base font-bold text-ink flex items-center gap-2">
              <Sliders className="w-4 h-4 text-ink" />
              <span>প্রিন্ট টেমপ্লেট ও লেবেল কনফিগারেশন (Module O)</span>
            </h2>
            <p className="text-xs text-muted">
              ইনভয়েসের প্রতিটি অংশের শিরোনাম, পেপার সাইজ এবং গ্রাহক ফুট নোট নিয়ন্ত্রণ করুন।
            </p>
          </div>

          <form onSubmit={handleSaveTemplateConfig} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Input
                label="Part 1 শিরোনাম (গ্রাহক কপি)"
                value={printConfig.part1TitleBn}
                onChange={(e) =>
                  setPrintConfig((p) => ({
                    ...p,
                    part1TitleBn: e.target.value,
                  }))
                }
              />
              <Input
                label="Part 2 শিরোনাম (কুরিয়ার স্টিকার)"
                value={printConfig.part2TitleBn}
                onChange={(e) =>
                  setPrintConfig((p) => ({
                    ...p,
                    part2TitleBn: e.target.value,
                  }))
                }
              />
              <Input
                label="Part 3 শিরোনাম (ইন্টারনাল কপি)"
                value={printConfig.part3TitleBn}
                onChange={(e) =>
                  setPrintConfig((p) => ({
                    ...p,
                    part3TitleBn: e.target.value,
                  }))
                }
              />
              <Input
                label="Part 1 উচ্চতা (mm)"
                type="number"
                value={String(printConfig.part1HeightMm)}
                onChange={(e) =>
                  setPrintConfig((p) => ({
                    ...p,
                    part1HeightMm: Number(e.target.value) || 95,
                  }))
                }
              />
              <Input
                label="Part 2 উচ্চতা (mm)"
                type="number"
                value={String(printConfig.part2HeightMm)}
                onChange={(e) =>
                  setPrintConfig((p) => ({
                    ...p,
                    part2HeightMm: Number(e.target.value) || 95,
                  }))
                }
              />
              <Input
                label="গ্রাহক ফুটার টার্মস/নোট"
                value={printConfig.footerNoteBn}
                onChange={(e) =>
                  setPrintConfig((p) => ({
                    ...p,
                    footerNoteBn: e.target.value,
                  }))
                }
              />
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <Button type="submit" variant="primary" size="md">
                সেটিংস সেভ করুন
              </Button>
            </div>
          </form>
        </Card>
      )}

      {/* ====================================================================
          SUB-TAB 3: PRINT HISTORY & AUDIT LOGS (প্রিন্ট ইতিহাস)
         ==================================================================== */}
      {activeSubTab === 'history' && (
        <Card surface="bg" padding="md" className="space-y-4 print:hidden">
          <div className="border-b border-border pb-2 flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <History className="w-4 h-4 text-ink" />
                <span>প্রিন্ট ইতিহাস ও সামারি (Print Audit Log)</span>
              </h2>
              <p className="text-xs text-muted">
                সর্বশেষ কতটি ইনভয়েস ও কুরিয়ার স্টিকার প্রিন্ট করা হয়েছে তার তালিকা।
              </p>
            </div>
            <Badge status="neutral">মোট রেকর্ড: {slips.length}</Badge>
          </div>

          <div className="divide-y divide-border">
            {slips.map((slip) => {
              const p12 = slip.customerAndCourierPart;
              const p3 = slip.internalPart3;

              return (
                <div
                  key={slip.orderNo}
                  className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 font-mono font-bold text-ink">
                      <span>{p12.orderNo}</span>
                      <Badge status={p3.isReprintWarning ? 'warning' : 'neutral'}>
                        {p3.printCount} বার প্রিন্ট হয়েছে
                      </Badge>
                    </div>
                    <p className="text-muted">
                      গ্রাহক: {p12.customerName} ({p12.customerPhone}) —{' '}
                      {p12.districtNameBn}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[11px] self-start sm:self-auto">
                    <span>
                      কুরিয়ার: {p12.courierProvider.toUpperCase()} ({p12.trackingCode})
                    </span>
                    <span className="font-bold text-ink">
                      COD: {formatPoishaToBdt(p12.codCollectablePoisha, locale)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderNos([slip.orderNo]);
                        setActiveSubTab('queue');
                      }}
                      className="px-2 py-1 rounded bg-surface border border-border text-ink hover:bg-bg font-semibold cursor-pointer"
                    >
                      পুনরায় প্রিন্ট করুন
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      )}
    </section>
  );
}
