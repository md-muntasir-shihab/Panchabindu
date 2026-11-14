'use client';
import { localizedField } from '@/lib/i18n/ui-text';
import { uiText } from '@/lib/i18n/ui-text';

import { LocalizedText } from '@/components/ui/localized-text';


// src/components/admin/print-engine-panel.tsx
// Module B & O: Streamlined Responsive A4 3-Part & 4x6 Thermal Print Engine
// Features:
//   1. Clean 3-Tab Layout: Print Queue (প্রিন্ট কিউ), Template Settings (টেম্পলেট সেটিংস), Print History (প্রিন্ট হিস্ট্রি)
//   2. Advanced Sorting: Order Date (Newest/Oldest), Highest COD, District, Courier
//   3. Direct Browser Native Print for A4 3-Part Slips & 4x6 Thermal Stickers
//   4. Responsive Mobile Cards & Desktop Grid Layouts
//   5. Strict Zero-Leak Security Rule A2 (Customer parts never leak vendor/cost details)

import * as React from 'react';
import { flushSync } from 'react-dom';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
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
} from '@/lib/admin/phase4b-service';
import { formatPoishaToBdt } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { Badge, Button, Card, Input } from '../ui/primitives';

// Code 128 set B: start, data, modulo-103 checksum, stop and quiet zones.
const CODE128_PATTERNS = [
  '212222','222122','222221','121223','121322','131222','122213','122312','132212','221213',
  '221312','231212','112232','122132','122231','113222','123122','123221','223211','221132',
  '221231','213212','223112','312131','311222','321122','321221','312212','322112','322211',
  '212123','212321','232121','111323','131123','131321','112313','132113','132311','211313',
  '231113','231311','112133','112331','132131','113123','113321','133121','313121','211331',
  '231131','213113','213311','213131','311123','311321','331121','312113','312311','332111',
  '314111','221411','431111','111224','111422','121124','121421','141122','141221','112214',
  '112412','122114','122411','142112','142211','241211','221114','413111','241112','134111',
  '111242','121142','121241','114212','124112','124211','411212','421112','421211','212141',
  '214121','412121','111143','111341','131141','114113','114311','411113','411311','113141',
  '114131','311141','411131','211412','211214','211232','2331112',
];

export function Code128BarcodeSvg({ value, height = 42 }: { value: string; height?: number }) {
  // Code 128 B represents ASCII 32–126. Never render a fake barcode for unsupported input.
  if (!value || !/^[\x20-\x7e]+$/.test(value)) return <span className="text-xs">{value || '—'}</span>;
  const codes = Array.from(value, char => char.charCodeAt(0) - 32);
  const checksum = (104 + codes.reduce((sum, code, index) => sum + code * (index + 1), 0)) % 103;
  const patterns = [104, ...codes, checksum, 106].map(code => CODE128_PATTERNS[code]!);
  const bars: Array<{ x: number; w: number }> = [];
  let cursor = 10;
  for (const pattern of patterns) {
    Array.from(pattern, Number).forEach((width, index) => {
      if (index % 2 === 0) bars.push({ x: cursor, w: width });
      cursor += width;
    });
  }
  cursor += 10;
  return <div className="inline-flex flex-col items-center">
    <svg viewBox={`0 0 ${cursor} ${height}`} className="w-full max-w-[220px] h-9 text-ink" role="img" aria-label={`Barcode ${value}`}>
      <rect width={cursor} height={height} fill="white" />
      {bars.map((bar, index) => <rect key={index} x={bar.x} y={0} width={bar.w} height={height} fill="black" />)}
    </svg>
    <span className="font-mono text-[10px] font-bold tracking-widest text-ink mt-0.5">{value}</span>
  </div>;
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
  const [visibleParts, setVisibleParts] = React.useState([true, true, true]);
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

  const printableRef = React.useRef<HTMLDivElement>(null);
  const requestId = React.useRef(0);
  const orderKey = JSON.stringify(availableOrderNos);

  React.useEffect(() => {
    const orders = JSON.parse(orderKey) as string[];
    setSelectedOrderNos(previous => {
      const available = new Set(orders);
      return previous.filter(order => available.has(order));
    });
    if (!orders.length) { setSlips([]); return; }
    const id = ++requestId.current;
    setLoadingSlips(true);
    fetch('/api/admin/workspace', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'generate_print_slips', orderNos: orders }),
    }).then(async res => {
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.errorBn || 'প্রিভিউ লোড করা যায়নি। / Could not load preview.');
      if (id === requestId.current) setSlips(data.slips || []);
    }).catch(error => { if (id === requestId.current) setFeedback(error.message); })
      .finally(() => { if (id === requestId.current) setLoadingSlips(false); });
    return () => { requestId.current++; };
  }, [orderKey]);

  const loadSlips = async () => {
    const orders = JSON.parse(orderKey) as string[];
    if (!orders.length) return;
    const id = ++requestId.current;
    setLoadingSlips(true);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'generate_print_slips', orderNos: orders }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.errorBn || 'প্রিভিউ লোড করা যায়নি। / Could not load preview.');
      if (id === requestId.current) setSlips(data.slips || []);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'সংযোগ ব্যর্থ। / Connection failed.');
    } finally { if (id === requestId.current) setLoadingSlips(false); }
  };

  // Save Print Template Settings
  const handleSaveTemplateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'update_print_config', patch: printConfig }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.errorBn || 'সেভ করা সম্ভব হয়নি। / Could not save settings.');
      setPrintConfig(data.printConfig);
      setLayoutMode(data.printConfig.defaultMode);
      setFeedback(locale === 'bn' ? 'প্রিন্ট সেটিংস সেভ হয়েছে।' : 'Print settings saved.');
      await onRefreshWorkspace();
    } catch (error) { setFeedback(error instanceof Error ? error.message : 'সংযোগ ব্যর্থ। / Connection failed.'); }
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

  const heightScale = Math.min(1, 275 / (printConfig.part1HeightMm + printConfig.part2HeightMm + printConfig.part3HeightMm));

  const handlePrint = async () => {
    if (!activeSlipsToPrint.length || !printableRef.current) return;
    setLoadingSlips(true);
    setFeedback(null);
    try {
      // Record a print request, not a claim that the printer actually succeeded.
      const res = await fetch('/api/admin/workspace', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'generate_print_slips', orderNos: activeSlipsToPrint.map(s => s.orderNo), recordPrint: true }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.errorBn || 'প্রিন্ট অনুরোধ ব্যর্থ। / Print request failed.');
      const updates = new Map<string, OrderPrintSlipBundle>(data.slips.map((slip: OrderPrintSlipBundle) => [slip.orderNo, slip]));
      flushSync(() => setSlips(previous => previous.map(slip => updates.get(slip.orderNo) || slip)));
      const frame = document.createElement('iframe');
      frame.setAttribute('title', 'Print preview');
      Object.assign(frame.style, { position: 'fixed', width: layoutMode === 'thermal_4x6' ? '101.6mm' : '210mm', height: '297mm', left: '-10000px', top: '0', opacity: '0', border: '0' });
      document.body.appendChild(frame);
      const doc = frame.contentDocument;
      const win = frame.contentWindow;
      if (!doc || !win || !printableRef.current) { frame.remove(); throw new Error('প্রিন্ট উইন্ডো তৈরি করা যায়নি। / Could not open print window.'); }
      doc.open();
      doc.write('<!doctype html><html><head><meta charset="utf-8"><base href="' + document.baseURI.replace(/"/g, '&quot;') + '"></head><body></body></html>');
      doc.close();
      const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
      const waits = styles.map(node => {
        const clone = node.cloneNode(true) as HTMLElement;
        doc.head.appendChild(clone);
        if (clone.tagName !== 'LINK') return Promise.resolve();
        return new Promise<void>(resolve => {
          clone.addEventListener('load', () => resolve(), { once: true });
          clone.addEventListener('error', () => resolve(), { once: true });
          setTimeout(resolve, 2500);
        });
      });
      const pageStyle = doc.createElement('style');
      pageStyle.textContent = `@page { size: ${layoutMode === 'thermal_4x6' ? '101.6mm 152.4mm' : 'A4 portrait'}; margin: 0; }
        @media print {
          html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
          .print-slips { margin: 0 !important; padding: 0 !important; }
          .print-a4-sheet, .print-thermal-sheet { box-sizing: border-box; width: ${layoutMode === 'thermal_4x6' ? '101.6mm' : '210mm'} !important; max-width: none !important; height: auto !important; min-height: 0 !important; margin: 0 !important; break-after: page; page-break-after: always; }
          .print-a4-sheet { display: block !important; padding: 4mm !important; }
          .print-thermal-sheet { padding: 4mm !important; }
          .print-a4-sheet:last-child, .print-thermal-sheet:last-child { break-after: auto; page-break-after: auto; }
          .print-slip-part { box-sizing: border-box; }
          img { max-width: 100%; }
        }`;
      doc.head.appendChild(pageStyle);
      doc.body.appendChild(printableRef.current.cloneNode(true));
      for (const image of Array.from(doc.images)) image.loading = 'eager';
      await Promise.all(waits);
      if (doc.fonts) await doc.fonts.ready;
      await Promise.all(Array.from(doc.images).map(image => image.complete ? Promise.resolve() : new Promise<void>(resolve => {
        image.onload = image.onerror = () => resolve(); setTimeout(resolve, 2000);
      })));
      win.onafterprint = () => frame.remove();
      win.focus();
      win.print();
      // Browsers do not report whether the dialog was cancelled or paper was printed.
      setFeedback(locale === 'bn' ? 'প্রিন্ট অনুরোধ নথিভুক্ত হয়েছে। প্রিন্ট ডায়ালগে কাগজের আকার ও স্কেল যাচাই করুন; বাতিল করলেও অনুরোধের সংখ্যা থাকবে।' : 'Print request recorded. Check paper size and scale in the print dialog; cancelled requests are also counted.');
      setTimeout(() => frame.remove(), 120000);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'প্রিন্ট ব্যর্থ। / Print failed.');
    } finally { setLoadingSlips(false); }
  };

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
              <LocalizedText source={"A4 ৩-ভাগ ইনভয়েস ও ৪x৬ থার্মাল কুরিয়ার স্টিকার এক ক্লিকে প্রিন্ট করুন।"} area="admin" />{" "}</p>
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
              <span><LocalizedText source={"প্রিন্ট কিউ ("} area="admin" />{availableOrderNos.length})</span>
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
                <span><LocalizedText source={"টেম্পলেট সেটিংস"} area="admin" /></span>
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
              <span><LocalizedText source={"প্রিন্ট ইতিহাস"} area="admin" /></span>
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
                    placeholder={uiText("অর্ডার, নাম, ফোন বা ট্র্যাকিং কোড...", locale)}
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
                    <option value="newest"><LocalizedText source={"নতুন অর্ডার আগে (Newest)"} area="admin" /></option>
                    <option value="oldest"><LocalizedText source={"পুরাতন অর্ডার আগে (Oldest)"} area="admin" /></option>
                    <option value="cod_desc"><LocalizedText source={"সর্বোচ্চ সিওডি বিল আগে (Highest COD)"} area="admin" /></option>
                    <option value="district"><LocalizedText source={"জেলা অনুযায়ী (District A-Z)"} area="admin" /></option>
                    <option value="order_no"><LocalizedText source={"অর্ডার নম্বর অনুযায়ী (Order No)"} area="admin" /></option>
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
                    <option value="ALL"><LocalizedText source={"সব কুরিয়ার (All Couriers)"} area="admin" /></option>
                    <option value="steadfast"><LocalizedText source={"Steadfast Courier"} area="admin" /></option>
                    <option value="pathao"><LocalizedText source={"Pathao Courier"} area="admin" /></option>

                    <option value="bd_post"><LocalizedText source={"BD Post (ডাক বিভাগ)"} area="admin" /></option>
                    <option value="manual"><LocalizedText source={"ম্যানুয়াল কুরিয়ার"} area="admin" /></option>
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
                    <option value="a4_3part"><LocalizedText source={"A4 ৩-ভাগ ইনভয়েস (Invoice + Sticker)"} area="admin" /></option>
                    <option value="thermal_4x6"><LocalizedText source={"৪x৬ থার্মাল কুরিয়ার স্টিকার (Thermal)"} area="admin" /></option>
                  </select>
                </div>
              </div>

              {layoutMode === 'a4_3part' && <fieldset className="flex flex-wrap gap-4 text-xs border-t border-border pt-2">
                <legend>{locale === 'bn' ? 'প্রিন্টের অংশ / Parts to print' : 'Parts to print / প্রিন্টের অংশ'}</legend>
                {['গ্রাহক / Customer', 'কুরিয়ার / Courier', 'অভ্যন্তরীণ / Internal'].map((label, index) => <label key={label} className="inline-flex items-center gap-1.5">
                  <input type="checkbox" checked={visibleParts[index]} onChange={e => setVisibleParts(parts => parts.map((value, i) => i === index ? e.target.checked : value))} /> {label}
                </label>)}
              </fieldset>}
              {/* Row 2: Selection Counters & Direct Print Trigger Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-2.5 py-1 rounded bg-surface border border-border text-ink hover:bg-bg font-semibold cursor-pointer"
                  >
                    <LocalizedText source={"সব সিলেক্ট ("} area="admin" />{filteredAndSortedSlips.length})
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="px-2.5 py-1 rounded bg-surface border border-border text-muted hover:text-ink font-semibold cursor-pointer"
                  >
                    <LocalizedText source={"আনসেলেক্ট"} area="admin" />{" "}</button>
                  <span className="font-mono text-ink font-bold bg-surface px-2 py-0.5 rounded border border-border">
                    {selectedOrderNos.length}<LocalizedText source={"টি সিলেক্টেড"} area="admin" />{" "}</span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void loadSlips()}
                    disabled={loadingSlips}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
                  >
                    {loadingSlips ? 'লোড হচ্ছে...' : 'রিলোড'}
                  </Button>

                  <Button
                    variant="primary"
                    size="md"
                    onClick={() => void handlePrint()}
                    disabled={activeSlipsToPrint.length === 0 || loadingSlips || (layoutMode === 'a4_3part' && !visibleParts.some(Boolean))}
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
                        {localizedField(p12, "districtNameBn", locale)} — {localizedField(p12, "upazilaNameBn", locale)}
                      </p>
                      <div className="flex items-center justify-between pt-1 font-mono text-[11px]">
                        <span className="text-muted">
                          <LocalizedText source={"পণ্য:"} area="admin" />{" "}{p12.items.length}<LocalizedText source={"টি"} area="admin" />{" "}</span>
                        <span className="font-bold text-ink">
                          <LocalizedText source={"COD:"} area="admin" />{" "}{formatPoishaToBdt(p12.codCollectablePoisha, locale)}
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
          <div ref={printableRef} className="print-slips space-y-6 print:space-y-0">
            {activeSlipsToPrint.map((slip) => {
              const p12 = slip.customerAndCourierPart;
              const p3 = slip.internalPart3;

              if (layoutMode === 'thermal_4x6') {
                return (
                  <div
                    key={slip.orderNo}
                    className="print-thermal-sheet max-w-[101.6mm] mx-auto border-2 border-ink bg-bg text-ink p-4 space-y-3 print:break-after-page"
                  >
                    <div className="flex items-center justify-between border-b border-border pb-2">
                      <div>
                        <p className="text-[10px] font-mono uppercase text-muted">
                          <LocalizedText source={"4x6 THERMAL COURIER STICKER"} area="admin" />{" "}</p>
                        <p className="text-xs font-bold text-ink">
                          <LocalizedText source={"প্রেরক:"} area="admin" />{" "}{localizedField(p12, "senderBrandNameBn", locale)} ({p12.senderSupportPhone})
                        </p>
                      </div>
                      <Badge status="info">{p12.courierProvider.toUpperCase()}</Badge>
                    </div>

                    <div className="flex items-center justify-between gap-2 py-1">
                      <div><Code128BarcodeSvg value={p12.trackingCode || p12.orderNo} height={40} />{!p12.trackingCode && <p className="text-[9px]">অর্ডার বারকোড / Order barcode</p>}</div>
                      {p12.trackingUrl && <QRCodeSVG value={new URL(p12.trackingUrl, window.location.origin).href} size={56} />}
                    </div>

                    <div className="p-2 border border-border rounded-[var(--radius-sm)] space-y-1 text-xs">
                      <p className="font-bold text-sm text-ink">
                        <LocalizedText source={"প্রাপক:"} area="admin" />{" "}{p12.customerName}
                      </p>
                      <p className="font-mono font-bold text-ink">
                        <LocalizedText source={"মোবাইল:"} area="admin" />{" "}{p12.customerPhone}
                      </p>
                      <p className="text-ink">
                        {localizedField(p12, "upazilaNameBn", locale)}, {localizedField(p12, "districtNameBn", locale)} — {p12.streetAddress}
                      </p>
                      {p12.landmark && (
                        <p className="text-muted text-[11px]">
                          <LocalizedText source={"ল্যান্ডমার্ক:"} area="admin" />{" "}{p12.landmark}
                        </p>
                      )}
                    </div>

                    {/* Large COD Box */}
                    <div className="p-2.5 border-2 border-ink bg-surface text-center">
                      <p className="text-[10px] font-bold uppercase text-muted">
                        <LocalizedText source={"ডেলিভারির সময় প্রদেয় (COD COLLECTABLE)"} area="admin" />{" "}</p>
                      <p className="text-2xl font-bold font-mono tabular-nums text-ink">
                        {formatPoishaToBdt(p12.codCollectablePoisha, locale)}
                      </p>
                    </div>

                    <div className="text-[10px] font-mono text-muted flex justify-between pt-1 border-t border-border">
                      <span><LocalizedText source={"Order:"} area="admin" />{" "}{p12.orderNo}</span>
                      <span><LocalizedText source={"CNS:"} area="admin" />{" "}{p12.consignmentId || '—'}</span>
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
                  <div className="print-slip-part border border-ink/80 rounded-[var(--radius-sm)] p-2.5 space-y-1.5 bg-bg" style={{ minHeight: `${printConfig.part1HeightMm * heightScale}mm`, display: visibleParts[0] ? undefined : 'none' }}>
                    <div className="flex items-start justify-between border-b border-border pb-1.5 gap-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-[var(--radius-sm)] border border-ink bg-ink text-bg flex items-center justify-center font-bold text-sm shrink-0">
                          <LocalizedText source={"প"} area="admin" />{" "}</div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 bg-surface border border-border rounded text-ink">
                              <LocalizedText source={"PART 1 ·"} area="admin" />{" "}{localizedField(printConfig, "part1TitleBn", locale)}
                            </span>
                            <span className="text-[9px] font-mono text-muted">
                              <LocalizedText source={"A4 Official Copy"} area="admin" />{" "}</span>
                          </div>
                          <h2 className="text-xs sm:text-sm font-bold text-ink leading-tight mt-0.5">
                            {localizedField(p12, "senderBrandNameBn", locale)} ({p12.senderBrandNameEn})
                          </h2>
                          <p className="text-[9.5px] text-muted leading-tight">
                            <LocalizedText source={"হেল্পলাইন:"} area="admin" />{" "}{p12.senderSupportPhone} {" "}<LocalizedText source={"· ইস্যু তারিখ:"} area="admin" />{' '}
                            {new Date(p12.createdAt).toLocaleDateString('bn-BD')}
                          </p>
                        </div>
                      </div>

                      <div className="text-right font-mono tabular-nums space-y-0.5">
                        <p className="text-xs font-bold text-ink bg-surface px-2 py-0.5 border border-border rounded">
                          <LocalizedText source={"ইনভয়েস:"} area="admin" />{" "}{p12.orderNo}
                        </p>
                        <p className="text-[9.5px] text-ink font-semibold">
                          <LocalizedText source={"পেমেন্ট:"} area="admin" />{" "}{p12.paymentMethod.toUpperCase()} ({p12.paymentStatus})
                        </p>
                        <p className="text-[9px] text-muted">
                          <LocalizedText source={"কুরিয়ার:"} area="admin" />{" "}{p12.courierProvider.toUpperCase()} · {p12.trackingCode}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 text-[10.5px]">
                      {/* Customer Address Box */}
                      <div className="sm:col-span-4 border border-border rounded-[var(--radius-sm)] p-2 bg-surface/50 space-y-0.5">
                        <p className="text-[9px] font-mono uppercase text-muted font-bold">
                          <LocalizedText source={"গ্রাহকের বিবরণ (BILL & SHIP TO)"} area="admin" />{" "}</p>
                        <p className="font-bold text-ink text-[11px]">
                          {p12.customerName}
                        </p>
                        <p className="font-mono font-bold text-ink text-[10.5px]">
                          <LocalizedText source={"মোবাইল:"} area="admin" />{" "}{p12.customerPhone}
                        </p>
                        <p className="text-ink text-[10px] leading-snug">
                          {localizedField(p12, "upazilaNameBn", locale)}, {localizedField(p12, "districtNameBn", locale)} —{' '}
                          {p12.streetAddress}
                        </p>
                        {p12.landmark && (
                          <p className="text-muted text-[9.5px]">
                            <LocalizedText source={"ল্যান্ডমার্ক:"} area="admin" />{" "}{p12.landmark}
                          </p>
                        )}
                      </div>

                      {/* Customer Itemized Table */}
                      <div className="sm:col-span-8 flex flex-col justify-between">
                        <table className="w-full text-left border-collapse text-[9.5px] tabular-nums">
                          <thead>
                            <tr className="border-b border-border bg-surface text-ink font-bold">
                              <th className="py-1 px-1.5">#</th>
                              <th className="py-1 px-1.5"><LocalizedText source={"পণ্যের বিবরণ ও ভ্যারিয়েন্ট (Public SKU)"} area="admin" /></th>
                              <th className="py-1 px-1.5 text-center"><LocalizedText source={"পরিমাণ"} area="admin" /></th>
                              <th className="py-1 px-1.5 text-right"><LocalizedText source={"একক মূল্য"} area="admin" /></th>
                              <th className="py-1 px-1.5 text-right"><LocalizedText source={"মোট মূল্য"} area="admin" /></th>
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
                                    {item.imageUrl && <div className="relative w-5 h-5 border border-border rounded overflow-hidden shrink-0">
                                      <img
                                        src={item.imageUrl}
                                        alt={item.productNameBn}
                                        referrerPolicy="no-referrer"
                                        className="object-cover" loading="lazy" decoding="async" style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }} />
                                    </div>}
                                    <div className="leading-tight">
                                      <span className="font-semibold text-ink">
                                        {localizedField(item, "productNameBn", locale)}
                                      </span>{' '}
                                      <span className="text-muted text-[9px]">
                                        ({localizedField(item, "variantTitleBn", locale)})
                                      </span>
                                      <div className="font-mono text-[8.5px] text-muted">
                                        <LocalizedText source={"SKU:"} area="admin" />{" "}{item.publicSku}
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
                            * {localizedField(printConfig, "footerNoteBn", locale)}
                          </span>
                          <div className="font-mono tabular-nums flex flex-wrap items-center gap-2 bg-surface px-2 py-1 rounded border border-border">
                            <span>
                              <LocalizedText source={"সাবটোটাল:"} area="admin" />{' '}
                              <strong>
                                {formatPoishaToBdt(p12.subtotalPoisha, locale)}
                              </strong>
                            </span>
                            {p12.discountPoisha > 0 && (
                              <span>
                                <LocalizedText source={"ছাড়: -"} area="admin" />{" "}{formatPoishaToBdt(p12.discountPoisha, locale)}
                              </span>
                            )}
                            <span>
                              <LocalizedText source={"ডেলিভারি:"} area="admin" />{' '}
                              {formatPoishaToBdt(
                                p12.deliveryChargePoisha,
                                locale
                              )}
                            </span>
                            {p12.advancePaidPoisha > 0 && (
                              <span>
                                <LocalizedText source={"অগ্রিম: -"} area="admin" />{" "}{formatPoishaToBdt(
                                  p12.advancePaidPoisha,
                                  locale
                                )}
                              </span>
                            )}
                            <span className="font-bold text-ink border-l border-border pl-2">
                              <LocalizedText source={"ডেলিভারিতে প্রদেয় (COD):"} area="admin" />{' '}
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
                  <div style={{ display: visibleParts[0] && (visibleParts[1] || visibleParts[2]) ? undefined : 'none' }} className="flex items-center gap-2 text-[8.5px] font-mono text-muted py-0">
                    <Scissors className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <div className="flex-1 border-t border-dashed border-ink" />
                    <span><LocalizedText source={"✂ CUT HERE (PART 1 CUSTOMER COPY / PART 2 COURIER BOX LABEL)"} area="admin" /></span>
                    <div className="flex-1 border-t border-dashed border-ink" />
                  </div>

                  {/* ==========================================================
                      PART 2: COURIER BOX STICKER (কুরিয়ার বক্স স্টিকার)
                     ========================================================== */}
                  <div className="print-slip-part border border-ink/80 rounded-[var(--radius-sm)] p-2.5 space-y-1.5 bg-bg" style={{ minHeight: `${printConfig.part2HeightMm * heightScale}mm`, display: visibleParts[1] ? undefined : 'none' }}>
                    <div className="flex items-center justify-between border-b border-border pb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 bg-surface border border-border rounded text-ink">
                          <LocalizedText source={"PART 2 ·"} area="admin" />{" "}{localizedField(printConfig, "part2TitleBn", locale)}
                        </span>
                        <span className="text-[10px] font-bold text-ink">
                          <LocalizedText source={"প্রেরক:"} area="admin" />{" "}{localizedField(p12, "senderBrandNameBn", locale)} {" "}<LocalizedText source={"(হেল্পলাইন:"} area="admin" />{' '}
                          {p12.senderSupportPhone})
                        </span>
                      </div>
                      <div className="text-right font-mono text-[10px] tabular-nums">
                        <span className="font-bold uppercase px-1.5 py-0.5 bg-ink text-bg rounded">
                          {p12.courierProvider}
                        </span>{' '}
                        · <span className="font-bold">{p12.consignmentId || '—'}</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                      <div className="sm:col-span-5 text-[10.5px] space-y-0.5 border-r border-border pr-2">
                        <p className="text-[8.5px] font-mono uppercase text-muted font-bold">
                          <LocalizedText source={"ডেলিভারি ঠিকানা (DELIVER TO)"} area="admin" />{" "}</p>
                        <p className="font-bold text-ink text-xs">
                          <LocalizedText source={"প্রাপক:"} area="admin" />{" "}{p12.customerName}
                        </p>
                        <p className="font-mono font-bold text-ink text-[11px]">
                          <LocalizedText source={"ফোন:"} area="admin" />{" "}{p12.customerPhone}
                        </p>
                        <p className="text-ink text-[10px] leading-snug font-medium">
                          {localizedField(p12, "upazilaNameBn", locale)}, {localizedField(p12, "districtNameBn", locale)} —{' '}
                          {p12.streetAddress}
                        </p>
                        {p12.landmark && (
                          <p className="text-muted text-[9.5px]">
                            <LocalizedText source={"ল্যান্ডমার্ক:"} area="admin" />{" "}{p12.landmark}
                          </p>
                        )}
                      </div>

                      <div className="sm:col-span-4 flex items-center justify-center gap-2.5 py-0.5">
                        <div className="text-center">
                          <Code128BarcodeSvg value={p12.trackingCode || p12.orderNo} height={34} />
                          {!p12.trackingCode && <p>অর্ডার বারকোড / Order barcode</p>}
                        </div>
                        {p12.trackingUrl && <QRCodeSVG value={new URL(p12.trackingUrl, window.location.origin).href} size={46} />}
                      </div>

                      <div className="sm:col-span-3 border-2 border-ink bg-surface p-1.5 text-center rounded-[var(--radius-sm)]">
                        <p className="text-[8.5px] font-bold uppercase text-muted">
                          <LocalizedText source={"ডেলিভারির সময় প্রদেয় (COD)"} area="admin" />{" "}</p>
                        <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-ink leading-tight">
                          {formatPoishaToBdt(p12.codCollectablePoisha, locale)}
                        </p>
                        <p className="text-[8.5px] font-mono text-muted">
                          <LocalizedText source={"Order:"} area="admin" />{" "}{p12.orderNo} {" "}<LocalizedText source={"· পিস:"} area="admin" />{' '}
                          {p12.items.reduce((acc, i) => acc + i.quantity, 0)}<LocalizedText source={"টি"} area="admin" />{" "}</p>
                      </div>
                    </div>
                  </div>

                  {/* CUT LINE 2 */}
                  <div style={{ display: visibleParts[1] && visibleParts[2] ? undefined : 'none' }} className="flex items-center gap-2 text-[8.5px] font-mono text-muted py-0">
                    <Scissors className="w-3 h-3 shrink-0" aria-hidden="true" />
                    <div className="flex-1 border-t border-dashed border-ink" />
                    <span>
                      <LocalizedText source={"✂ CUT HERE — PART 3 ADMIN, ACCOUNTS & WAREHOUSE MASTER RECORD (অ্যাডমিন ও হিসাব সংরক্ষণ কপি)"} area="admin" />{" "}</span>
                    <div className="flex-1 border-t border-dashed border-ink" />
                  </div>

                  {/* ==========================================================
                      PART 3: ADMIN, ACCOUNTS & WAREHOUSE MASTER COPY
                      (পূর্ণাঙ্গ প্রোডাক্ট, সাপ্লায়ার, কেনা দাম, লাভ, মার্জিন ও হিসাব ব্রেকডাউন)
                     ========================================================== */}
                  <div className="print-slip-part border-2 border-ink rounded-[var(--radius-sm)] p-2.5 bg-surface/60 space-y-2" style={{ minHeight: `${printConfig.part3HeightMm * heightScale}mm`, display: visibleParts[2] ? undefined : 'none' }}>
                    {/* Part 3 Header & Operational Telemetry Strip */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border pb-1.5">
                      <div>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 bg-ink text-bg rounded">
                            <LocalizedText source={"PART 3 ·"} area="admin" />{" "}{localizedField(printConfig, "part3TitleBn", locale)}
                          </span>
                          <span className="text-[9.5px] font-mono font-bold text-ink">
                            <LocalizedText source={"অর্ডার:"} area="admin" />{" "}{p3.orderNo}
                          </span>
                          <span className="text-[9px] font-mono text-muted">
                            <LocalizedText source={"· এসক্রো রুল:"} area="admin" />{" "}{localizedField(p3, "estimatedMaturityDaysLabelBn", locale)}
                          </span>
                        </div>
                        <p className="text-[9px] text-muted mt-0.5 font-mono">
                          <LocalizedText source={"গ্রাহক:"} area="admin" />{" "}{p3.customerName ?? p12.customerName} (
                          {p3.customerPhone ?? p12.customerPhone}<LocalizedText source={") · সোর্স:"} area="admin" />{' '}
                          {(p3.orderSource ?? 'storefront').toUpperCase()} {" "}<LocalizedText source={"· কল স্ট্যাটাস:"} area="admin" />{' '}
                          {p3.callStatus ?? 'confirmed_yes'} {" "}<LocalizedText source={"(চেষ্টা:"} area="admin" />{' '}
                          {formatLocaleNumber(p3.callAttempts ?? 1, locale)}<LocalizedText source={") · ঝুঁকি:"} area="admin" />{' '}
                          {p3.fraudRiskTierBn ?? 'নিরাপদ'} {" "}<LocalizedText source={"(স্কোর:"} area="admin" />{' '}
                          {formatLocaleNumber(p3.addressQualityScore ?? 85, locale)}%)
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 font-mono text-[9px]">
                        <span className="px-1.5 py-0.5 rounded border border-border bg-bg text-ink font-bold">
                          <LocalizedText source={"প্রিন্ট:"} area="admin" />{" "}{formatLocaleNumber(p3.printCount, locale)} {" "}<LocalizedText source={"বার"} area="admin" />{" "}</span>
                        {p3.isReprintWarning && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded border border-warning bg-bg text-warning font-bold">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            <span><LocalizedText source={"ডুপ্লিকেট প্রিন্ট সতর্কতা"} area="admin" /></span>
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
                            <th className="py-1 px-1"><LocalizedText source={"সাপ্লায়ার ও লট (Supplier & Lot)"} area="admin" /></th>
                            <th className="py-1 px-1">
                              <LocalizedText source={"পণ্য, ভ্যারিয়েন্ট, Public ও Internal SKU (Bin)"} area="admin" />{" "}</th>
                            <th className="py-1 px-1 text-center"><LocalizedText source={"পরিমাণ"} area="admin" /></th>
                            {(isSuperAdmin || isVendor) && (
                              <>
                                <th className="py-1 px-1 text-right">
                                  <LocalizedText source={"একক কেনা (Cost)"} area="admin" />{" "}</th>
                                <th className="py-1 px-1 text-right">
                                  <LocalizedText source={"সাপ্লায়ার লাভ (Profit)"} area="admin" />{" "}</th>
                                <th className="py-1 px-1 text-right">
                                  <LocalizedText source={"সাপ্লায়ার প্রদেয় (Payable)"} area="admin" />{" "}</th>
                              </>
                            )}
                            {isSuperAdmin && (
                              <>
                                <th className="py-1 px-1 text-right">
                                  <LocalizedText source={"কমিশন ও গ্রস মার্জিন"} area="admin" />{" "}</th>
                                <th className="py-1 px-1 text-right">
                                  <LocalizedText source={"প্রোমো ছাড় ও নিট মার্জিন"} area="admin" />{" "}</th>
                              </>
                            )}
                            <th className="py-1 px-1 text-right"><LocalizedText source={"খুচরা বিক্রয় (Sale)"} area="admin" /></th>
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
                                  {line.consignmentLotRef || '—'}
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
                                  {localizedField(line, "productNameBn", locale)}{' '}
                                  <span className="text-muted font-normal">
                                    ({localizedField(line, "variantTitleBn", locale)})
                                  </span>
                                </div>
                                <div className="font-mono text-[8px] text-muted">
                                  <LocalizedText source={"Public:"} area="admin" />{" "}<strong className="text-ink">{line.publicSku}</strong> {" "}<LocalizedText source={"· Vendor SKU:"} area="admin" />{' '}
                                  <strong className="text-ink">
                                    {line.internalVendorSku}
                                  </strong>{' '}
                                  · {line.warehouseBinCode || '—'} ·{' '}
                                  {line.weightGrams ?? '—'}<LocalizedText source={"g"} area="admin" />{" "}</div>
                              </td>
                              <td className="py-1 px-1 text-center font-mono font-bold text-ink">
                                {formatLocaleNumber(line.quantity, locale)}<LocalizedText source={"টি"} area="admin" />{" "}</td>
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
                                      <LocalizedText source={"মোট:"} area="admin" />{' '}
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
                                      <LocalizedText source={"মোট:"} area="admin" />{' '}
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
                                      <LocalizedText source={"একক:"} area="admin" />{' '}
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
                                      {((line.commissionBp ?? 0) / 100).toFixed(1)}<LocalizedText source={"% (একক:"} area="admin" />{' '}
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
                                      <LocalizedText source={"ছাড়: -"} area="admin" />{" "}{formatPoishaToBdt(
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
                                  <LocalizedText source={"একক:"} area="admin" />{' '}
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
                            <LocalizedText source={"সাপ্লায়ার-ভিত্তিক প্রদেয় ও পেআউট বিভাজন (SUPPLIER ESCROW SPLIT)"} area="admin" />{" "}</p>
                          {p3.accountingSummary.vendorSplitBreakdown.map(
                            (vs) => (
                              <div
                                key={vs.vendorCode}
                                className="flex items-center justify-between gap-1 border-b border-border/60 last:border-0 pb-0.5"
                              >
                                <div className="leading-tight">
                                  <span className="font-bold text-ink">
                                    {vs.vendorCode} · {localizedField(vs, "vendorNameBn", locale)}
                                  </span>
                                  <div className="text-[7.5px] text-muted">
                                    {localizedField(vs, "payoutMethodBn", locale)} ({vs.payoutAccountNo}) ·{' '}
                                    {vs.totalUnits} {" "}<LocalizedText source={"পিস"} area="admin" />{" "}</div>
                                </div>
                                <div className="text-right leading-tight">
                                  <span className="font-bold text-ink">
                                    <LocalizedText source={"প্রদেয়:"} area="admin" />{' '}
                                    {formatPoishaToBdt(
                                      vs.supplierPayablePoisha,
                                      locale
                                    )}
                                  </span>
                                  <div className="text-[7.5px] text-muted">
                                    <LocalizedText source={"কেনা:"} area="admin" />{' '}
                                    {formatPoishaToBdt(
                                      vs.supplierCostPoisha,
                                      locale
                                    )}{' '}
                                    <LocalizedText source={"| লাভ:"} area="admin" />{' '}
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
                            <LocalizedText source={"পূর্ণাঙ্গ অর্ডার হিসাব-নিকাশ ও নিট প্ল্যাটফর্ম লাভ (ORDER P&L & LEDGER SUMMARY)"} area="admin" />{" "}</p>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 leading-snug">
                            <div className="flex justify-between">
                              <span className="text-muted"><LocalizedText source={"পণ্যের মোট বিক্রয়:"} area="admin" /></span>
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
                                <LocalizedText source={"প্রোমো ছাড় ("} area="admin" />{p3.accountingSummary.promoCode ?? 'N/A'}):
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
                              <span className="text-muted"><LocalizedText source={"ডেলিভারি (গ্রাহক/আনুমানিক):"} area="admin" /></span>
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
                              <span className="text-muted"><LocalizedText source={"মোট সাপ্লায়ার কেনা দাম:"} area="admin" /></span>
                              <span>
                                {formatPoishaToBdt(
                                  p3.accountingSummary.totalSupplierCostPoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted"><LocalizedText source={"মোট সাপ্লায়ার লাভ:"} area="admin" /></span>
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
                              <span><LocalizedText source={"সাপ্লায়ার প্রদেয় (Escrow):"} area="admin" /></span>
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
                                <LocalizedText source={"অগ্রিম ("} area="admin" />{p3.manualPaymentTrxId ?? 'COD'}):
                              </span>
                              <span>
                                {formatPoishaToBdt(
                                  p3.accountingSummary.advancePaidPoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between font-bold text-ink">
                              <span><LocalizedText source={"কুরিয়ার সিওডি প্রাপ্য:"} area="admin" /></span>
                              <span>
                                {formatPoishaToBdt(
                                  p3.accountingSummary.codCollectablePoisha,
                                  locale
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-muted"><LocalizedText source={"প্যাকিং ও ভ্যাট (৫%):"} area="admin" /></span>
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
                              <LocalizedText source={"হিসাব সূত্র: গ্রস মার্জিন ("} area="admin" />{" "}{formatPoishaToBdt(
                                p3.accountingSummary.grossPlatformMarginPoisha,
                                locale
                              )}
                              <LocalizedText source={") - ছাড় - ডেলিভারি ভর্তুকি - প্যাকিং - ৫% ভ্যাট"} area="admin" />{" "}</span>
                            <span className="text-[9.5px] font-bold text-success bg-surface px-2 py-0.5 rounded border border-border">
                              <LocalizedText source={"আনুমানিক নিট প্ল্যাটফর্ম লাভ (Estimated Net Profit):"} area="admin" />{' '}
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
                          {printConfig.checklistItemsBn.filter(chk => chk.trim()).map((chk, idx) => (
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
                            <LocalizedText source={"স্টাফ নোট:"} area="admin" />{" "}{p3.internalStaffNote}
                          </p>
                        )}
                      </div>

                      <div className="sm:col-span-5 grid grid-cols-3 gap-1.5 text-center font-mono text-[8px] pt-2">
                        <div className="border-t border-ink pt-0.5 text-muted">
                          <LocalizedText source={"প্যাকিং অফিসার"} area="admin" />{" "}</div>
                        <div className="border-t border-ink pt-0.5 text-muted">
                          <LocalizedText source={"কিউসি যাচাইকারী"} area="admin" />{" "}</div>
                        <div className="border-t border-ink pt-0.5 text-muted">
                          <LocalizedText source={"অ্যাডমিন / হিসাব রক্ষণ"} area="admin" />{" "}</div>
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
              <span><LocalizedText source={"প্রিন্ট টেমপ্লেট ও লেবেল কনফিগারেশন (Module O)"} area="admin" /></span>
            </h2>
            <p className="text-xs text-muted">
              <LocalizedText source={"ইনভয়েসের প্রতিটি অংশের শিরোনাম, পেপার সাইজ এবং গ্রাহক ফুট নোট নিয়ন্ত্রণ করুন।"} area="admin" />{" "}</p>
          </div>

          <form onSubmit={handleSaveTemplateConfig} className="space-y-4">
            <label className="block text-sm font-medium">
              {locale === 'bn' ? 'ডিফল্ট কাগজ / Default paper' : 'Default paper / ডিফল্ট কাগজ'}
              <select className="block w-full mt-1 border border-border rounded p-2 bg-bg" value={printConfig.defaultMode}
                onChange={e => setPrintConfig(p => ({ ...p, defaultMode: e.target.value as PrintTemplateConfig['defaultMode'] }))}>
                <option value="a4_3part">A4 — ৩ অংশ / 3 parts</option>
                <option value="thermal_4x6">4 × 6 inch — থার্মাল / Thermal</option>
              </select>
            </label>
            <p className="text-xs text-muted">{locale === 'bn' ? 'অংশের উচ্চতা ন্যূনতম লক্ষ্য; A4-এ জায়গা কম হলে অনুপাতে কমবে এবং বেশি লেখা পরের পাতায় যাবে, কাটা হবে না।' : 'Part heights are minimum targets, proportionally reduced to fit A4. Overflow continues on another page rather than being clipped.'}</p>
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
              {[1, 2, 3].map((part) => {
                const key = `part${part}TitleEn` as 'part1TitleEn' | 'part2TitleEn' | 'part3TitleEn';
                return <Input key={key} label={`Part ${part} English title / ইংরেজি শিরোনাম`} required minLength={2} value={printConfig[key]} onChange={e => setPrintConfig(p => ({ ...p, [key]: e.target.value }))} />;
              })}
              <Input
                label="Part 1 উচ্চতা (mm)"
                type="number" min={60} max={120} required
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
                type="number" min={60} max={120} required
                value={String(printConfig.part2HeightMm)}
                onChange={(e) =>
                  setPrintConfig((p) => ({
                    ...p,
                    part2HeightMm: Number(e.target.value) || 95,
                  }))
                }
              />
              <Input label="Part 3 উচ্চতা / Height (mm)" type="number" min={60} max={120} required
                value={String(printConfig.part3HeightMm)}
                onChange={e => setPrintConfig(p => ({ ...p, part3HeightMm: Number(e.target.value) }))} />
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

            <label className="block text-sm font-medium">
              {locale === 'bn' ? 'প্যাকিং চেকলিস্ট (প্রতি লাইনে একটি) / Packing checklist' : 'Packing checklist (one item per line) / প্যাকিং চেকলিস্ট'}
              <textarea className="block w-full mt-1 border border-border rounded p-2 bg-bg" rows={5}
                value={printConfig.checklistItemsBn.join('\n')}
                onChange={e => setPrintConfig(p => ({ ...p, checklistItemsBn: e.target.value.split('\n') }))} />
            </label>
            <div className="flex justify-end pt-2 border-t border-border">
              <Button type="submit" variant="primary" size="md">
                <LocalizedText source={"সেটিংস সেভ করুন"} area="admin" />{" "}</Button>
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
                <span><LocalizedText source={"প্রিন্ট ইতিহাস ও সামারি (Print Audit Log)"} area="admin" /></span>
              </h2>
              <p className="text-xs text-muted">
                <LocalizedText source={"বর্তমান কিউর অর্ডারগুলোর প্রিন্ট অনুরোধ; বাতিল করলেও গণনা হয়। / Requests for orders in the current queue, including cancelled dialogs."} area="admin" />{" "}</p>
            </div>
            <Badge status="neutral"><LocalizedText source={"মোট রেকর্ড:"} area="admin" />{" "}{formatLocaleNumber(slips.filter(s => s.internalPart3.printCount > 0).length, locale)}</Badge>
          </div>

          <div className="divide-y divide-border">
            {slips.filter(s => s.internalPart3.printCount > 0).map((slip) => {
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
                        {formatLocaleNumber(p3.printCount, locale)} {" "}<LocalizedText source={"টি প্রিন্ট অনুরোধ / print requests"} area="admin" />{" "}</Badge>
                    </div>
                    <p className="text-muted">
                      <LocalizedText source={"গ্রাহক:"} area="admin" />{" "}{p12.customerName} ({p12.customerPhone}) —{' '}
                      {localizedField(p12, "districtNameBn", locale)}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 font-mono text-[11px] self-start sm:self-auto">
                    <span>
                      <LocalizedText source={"কুরিয়ার:"} area="admin" />{" "}{p12.courierProvider.toUpperCase()} ({p12.trackingCode})
                    </span>
                    <span className="font-bold text-ink">
                      <LocalizedText source={"COD:"} area="admin" />{" "}{formatPoishaToBdt(p12.codCollectablePoisha, locale)}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedOrderNos([slip.orderNo]);
                        setActiveSubTab('queue');
                      }}
                      className="px-2 py-1 rounded bg-surface border border-border text-ink hover:bg-bg font-semibold cursor-pointer"
                    >
                      <LocalizedText source={"পুনরায় প্রিন্ট করুন"} area="admin" />{" "}</button>
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
