'use client';
import { localizedField } from '@/lib/i18n/ui-text';
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
  Package,
  MapPin,
  FileText,
  SlidersHorizontal,
} from 'lucide-react';
import type {
  OrderPrintSlipBundle,
  PrintTemplateConfig,
} from '@/lib/admin/phase4b-service';
import { formatPoishaToBdt } from '@/lib/money';
import type { PublicSafeSiteSettingsDTO } from '@/lib/db/repository';
import { safeStoreUrl } from '@/lib/storefront/storefront-config';
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

function resolveSafeQrUrl(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return null;
  for (let i = 0; i < trimmed.length; i += 1) {
    const code = trimmed.charCodeAt(i);
    if (code <= 0x1f || code === 0x7f) return null;
  }
  try {
    const base =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://panchabindu.local';
    const parsed = new URL(trimmed, base);
    if (
      (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') ||
      parsed.username ||
      parsed.password
    ) {
      return null;
    }
    return parsed.href;
  } catch {
    return null;
  }
}

function PrintBrandMark({ name, logoUrl, compact = false }: { name: string; logoUrl?: string; compact?: boolean }) {
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => setFailed(false), [logoUrl]);
  const usableUrl = logoUrl && safeStoreUrl(logoUrl) && !logoUrl.startsWith('#') ? logoUrl : '';
  return <span role="img" className={`print-brand-mark${compact ? ' print-brand-mark-compact' : ''}`} aria-label={name}>
    <span className="print-brand-fallback" aria-hidden="true">{Array.from(name.trim())[0] || 'P'}</span>
    {usableUrl && !failed && <img className="print-brand-logo" src={usableUrl} alt="" onError={() => setFailed(true)} referrerPolicy="no-referrer" />}
  </span>;
}

function sanitizePrintableClone(root: HTMLElement): void {
  root
    .querySelectorAll('script, iframe, object, embed, form, meta, base')
    .forEach((node) => node.remove());
  const allNodes = [root, ...Array.from(root.querySelectorAll<HTMLElement>('*'))];
  for (const el of allNodes) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      const val = attr.value.trim().toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
        continue;
      }
      if (
        (name === 'href' || name === 'src' || name === 'xlink:href') &&
        (val.startsWith('javascript:') ||
          val.startsWith('vbscript:') ||
          val.startsWith('data:text/html'))
      ) {
        el.removeAttribute(attr.name);
      }
    }
  }
}

export async function executeNativeSlipPrint({
  printableEl,
  layoutMode,
  locale,
}: {
  printableEl: HTMLElement;
  layoutMode: 'a4_3part' | 'thermal_4x6';
  locale: 'bn' | 'en';
}): Promise<void> {
  let frame: HTMLIFrameElement | null = null;
  let cleanupTimer: ReturnType<typeof setTimeout> | null = null;
  const cleanup = () => {
    if (cleanupTimer !== null) {
      clearTimeout(cleanupTimer);
      cleanupTimer = null;
    }
    frame?.remove();
    frame = null;
  };
  try {
    frame = document.createElement('iframe');
    frame.setAttribute('title', 'Print preview');
    Object.assign(frame.style, {
      position: 'fixed',
      width: layoutMode === 'thermal_4x6' ? '101.6mm' : '210mm',
      height: '297mm',
      left: '-10000px',
      top: '0',
      opacity: '0',
      border: '0',
    });
    document.body.appendChild(frame);
    const doc = frame.contentDocument;
    const win = frame.contentWindow;
    if (!doc || !win) {
      cleanup();
      throw new Error(
        locale === 'bn'
          ? 'প্রিন্ট উইন্ডো তৈরি করা যায়নি।'
          : 'Could not open print window.'
      );
    }
    const safeBaseHref = resolveSafeQrUrl(document.baseURI);
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8">${
        safeBaseHref
          ? `<base href="${safeBaseHref.replace(/"/g, '&quot;')}">`
          : ''
      }</head><body></body></html>`
    );
    doc.close();
    const styles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'));
    const waits = styles.map((node) => {
      const clone = node.cloneNode(true) as HTMLElement;
      doc.head.appendChild(clone);
      if (clone.tagName !== 'LINK') return Promise.resolve();
      return new Promise<void>((resolve) => {
        clone.addEventListener('load', () => resolve(), { once: true });
        clone.addEventListener('error', () => resolve(), { once: true });
        setTimeout(resolve, 2500);
      });
    });
    const pageStyle = doc.createElement('style');
    const paperWidthMm = layoutMode === 'thermal_4x6' ? 101.6 : 210;
    const paperHeightMm = layoutMode === 'thermal_4x6' ? 152.4 : 297;
    // Apply the same physical layout in the hidden frame and at print time so
    // measurement is meaningful. Each order is a separate page; never clip data.
    pageStyle.textContent = `@page { size: ${layoutMode === 'thermal_4x6' ? '101.6mm 152.4mm' : 'A4 portrait'}; margin: 0; }
      html, body { margin: 0 !important; padding: 0 !important; background: white !important; }
      .print-slips { margin: 0 !important; padding: 0 !important; }
      .print-a4-sheet, .print-thermal-sheet { box-sizing: border-box; width: calc(${paperWidthMm}mm / var(--print-scale, 1)) !important; zoom: var(--print-scale, 1); max-width: none !important; height: auto !important; min-height: 0 !important; margin: 0 !important; padding: 4mm !important; display: block !important; break-after: page; page-break-after: always; overflow: visible !important; }
      .print-a4-sheet:last-child, .print-thermal-sheet:last-child { break-after: auto; page-break-after: auto; }
      .print-slip-part { box-sizing: border-box; min-height: 0 !important; break-inside: avoid; }
      .print-slips .overflow-x-auto { overflow: visible !important; }
      .print-slips table { width: 100% !important; table-layout: fixed; overflow-wrap: anywhere; }
      .print-slips td, .print-slips th { overflow-wrap: anywhere; word-break: break-word; }
      .print-slips img { max-width: 100%; }
      @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }`;
    doc.head.appendChild(pageStyle);
    const printContent = printableEl.cloneNode(true) as HTMLElement;
    sanitizePrintableClone(printContent);
    // Remove deselected parts from the printable document, not just visually hide them.
    printContent.querySelectorAll<HTMLElement>('.print-slip-part').forEach((part) => {
      if (part.style.display === 'none') part.remove();
    });
    doc.body.appendChild(printContent);
    for (const image of Array.from(doc.images)) image.loading = 'eager';
    await Promise.all(waits);
    if (doc.fonts) await doc.fonts.ready;
    await Promise.all(
      Array.from(doc.images).map((image) =>
        image.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              image.onload = image.onerror = () => resolve();
              setTimeout(resolve, 2000);
            })
      )
    );
    for (const image of Array.from(doc.querySelectorAll<HTMLImageElement>('.print-brand-logo'))) {
      if (!image.complete || image.naturalWidth === 0) image.remove();
    }
    if (!CSS.supports('zoom', '1')) {
      throw new Error(
        locale === 'bn'
          ? 'এই ব্রাউজারে এক পৃষ্ঠায় ফিট করা সমর্থিত নয়। Chrome বা Edge ব্যবহার করুন।'
          : 'This browser cannot fit the slip on one page. Use Chrome or Edge.'
      );
    }
    const maxHeightPx = ((paperHeightMm - 2) * 96) / 25.4;
    const maxWidthPx = (paperWidthMm * 96) / 25.4;
    const sheets = Array.from(
      doc.querySelectorAll<HTMLElement>('.print-a4-sheet, .print-thermal-sheet')
    );
    for (const sheet of sheets) {
      let scale = 1;
      for (let attempt = 0; attempt < 6; attempt++) {
        sheet.style.setProperty('--print-scale', String(scale));
        const bounds = sheet.getBoundingClientRect();
        if (bounds.height <= maxHeightPx && bounds.width <= maxWidthPx + 1) break;
        scale *= Math.min(maxHeightPx / bounds.height, maxWidthPx / bounds.width) * 0.99;
      }
      const bounds = sheet.getBoundingClientRect();
      const protrudes = Array.from(sheet.querySelectorAll<HTMLElement>('*')).some((element) => {
        const rect = element.getBoundingClientRect();
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          (rect.right > bounds.right + 2 ||
            rect.left < bounds.left - 2 ||
            rect.bottom > bounds.bottom + 2)
        );
      });
      if (
        scale < 0.65 ||
        bounds.height > maxHeightPx ||
        bounds.width > maxWidthPx + 1 ||
        protrudes
      ) {
        throw new Error(
          locale === 'bn'
            ? 'এক পৃষ্ঠায় স্পষ্টভাবে দেখানোর জন্য তথ্য বেশি। A4-এ কম অংশ বেছে নিন বা আলাদা কপি প্রিন্ট করুন; কোনো তথ্য কাটা হয়নি।'
            : 'Too much content to fit legibly on one page. Select fewer A4 parts or print separate copies; no information was clipped.'
        );
      }
    }
    win.onafterprint = cleanup;
    win.focus();
    win.print();
    cleanupTimer = setTimeout(cleanup, 120000);
  } catch (error) {
    cleanup();
    throw error;
  }
}

export interface PrintableSlipsDocumentProps {
  slips: OrderPrintSlipBundle[];
  layoutMode: 'a4_3part' | 'thermal_4x6';
  visibleParts: boolean[];
  printConfig: PrintTemplateConfig;
  siteSettings: PublicSafeSiteSettingsDTO;
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  isVendor: boolean;
  containerRef: React.RefObject<HTMLDivElement | null>;
}

export function PrintableSlipsDocument({
  slips,
  layoutMode,
  visibleParts,
  printConfig,
  siteSettings,
  locale,
  isSuperAdmin,
  isVendor,
  containerRef,
}: PrintableSlipsDocumentProps) {
  const brandName =
    (locale === 'bn' ? siteSettings.brandNameBn : siteSettings.brandNameEn) ||
    siteSettings.brandNameBn ||
    siteSettings.brandNameEn;
  const logoUrl = siteSettings.storefront?.logoUrl;
  const safePart1H = Number.isFinite(printConfig.part1HeightMm) && printConfig.part1HeightMm >= 60 ? printConfig.part1HeightMm : 95;
  const safePart2H = Number.isFinite(printConfig.part2HeightMm) && printConfig.part2HeightMm >= 60 ? printConfig.part2HeightMm : 95;
  const safePart3H = Number.isFinite(printConfig.part3HeightMm) && printConfig.part3HeightMm >= 60 ? printConfig.part3HeightMm : 95;
  const heightScale = Math.min(1, 275 / Math.max(180, safePart1H + safePart2H + safePart3H));

  return (
    <div ref={containerRef} className="print-slips space-y-6 print:space-y-0">
      {slips.map((slip) => {
        const p12 = slip.customerAndCourierPart;
        const p3 = isSuperAdmin ? slip.internalPart3 : null;
        const canShowPart3 = Boolean(isSuperAdmin && p3 && visibleParts[2]);

        if (layoutMode === 'thermal_4x6') {
          return (
            <div
              key={slip.orderNo}
              className="print-thermal-sheet max-w-[101.6mm] mx-auto border-2 border-ink bg-bg text-ink p-4 space-y-3 print:break-after-page"
            >
              <div className="flex items-center justify-between border-b border-border pb-2">
                <div className="flex items-center gap-2">
                  <PrintBrandMark name={brandName} logoUrl={logoUrl} />
                  <div>
                    <p className="text-[10px] font-mono uppercase text-muted">
                      <LocalizedText source={"4x6 THERMAL COURIER STICKER"} area="admin" />{" "}
                    </p>
                    <p className="text-xs font-bold text-ink">
                      <LocalizedText source={"প্রেরক:"} area="admin" />{" "}{brandName} ({siteSettings.supportPhone})
                    </p>
                  </div>
                </div>
                <Badge status="info">{p12.courierProvider.toUpperCase()}</Badge>
              </div>

              <div className="flex items-center justify-between gap-2 py-1">
                <div>
                  <Code128BarcodeSvg value={p12.trackingCode || p12.orderNo} height={40} />
                  {!p12.trackingCode && <p className="text-[9px]">অর্ডার বারকোড / Order barcode</p>}
                </div>
                {(() => {
                  const safeQrUrl = resolveSafeQrUrl(p12.trackingUrl);
                  return safeQrUrl ? (
                    <QRCodeSVG
                      value={safeQrUrl}
                      size={56}
                      title={`Tracking QR ${p12.orderNo}`}
                    />
                  ) : null;
                })()}
              </div>

              <div className="p-2 border border-border rounded-[var(--radius-sm)] space-y-1 text-xs">
                <p className="font-bold text-sm text-ink">
                  <LocalizedText source={"প্রাপক:"} area="admin" />{" "}{p12.customerName}
                </p>
                <p className="font-mono font-bold text-ink">
                  <LocalizedText source={"মোবাইল:"} area="admin" />{" "}{p12.customerPhone}
                </p>
                <p className="text-ink">
                  {localizedField(p12, "upazilaNameBn", locale)}, {localizedField(p12, "districtNameBn", locale)}
                  {p12.postCode ? ` (${p12.postCode})` : ''} — {p12.streetAddress}
                </p>
                {(p12.recipientCity || p12.recipientZone) && (
                  <p className="font-mono text-[10.5px] text-ink">
                    Pathao: {p12.recipientCity || '—'} → {p12.recipientZone || '—'}
                    {p12.recipientArea ? ` → ${p12.recipientArea}` : ''}
                    {p12.totalWeightGrams ? ` · ${(p12.totalWeightGrams / 1000).toFixed(2)}kg` : ''}
                  </p>
                )}
                {p12.landmark && (
                  <p className="text-muted text-[11px]">
                    <LocalizedText source={"ল্যান্ডমার্ক:"} area="admin" />{" "}{p12.landmark}
                  </p>
                )}
              </div>

              {/* Large COD Box */}
              <div className="p-2.5 border-2 border-ink bg-surface text-center">
                <p className="text-[10px] font-bold uppercase text-muted">
                  <LocalizedText source={"ডেলিভারির সময় প্রদেয় (COD COLLECTABLE)"} area="admin" />{" "}
                </p>
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
            {/* PART 1: CUSTOMER INVOICE (গ্রাহক ইনভয়েস — ZERO COST LEAK) */}
            <div
              className="print-slip-part print-customer-part border border-ink/80 rounded-[var(--radius-sm)] p-2.5 space-y-1.5 bg-bg"
              style={{
                minHeight: `${printConfig.part1HeightMm * heightScale}mm`,
                display: visibleParts[0] ? undefined : 'none',
              }}
            >
              <div className="flex items-start justify-between border-b border-border pb-1.5 gap-2">
                <div className="flex items-center gap-2">
                  <PrintBrandMark name={brandName} logoUrl={logoUrl} />
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 bg-surface border border-border rounded text-ink">
                        <LocalizedText source={"PART 1 ·"} area="admin" />{" "}{localizedField(printConfig, "part1TitleBn", locale)}
                      </span>
                      <span className="text-[9px] font-mono text-muted">
                        <LocalizedText source={"A4 Official Copy"} area="admin" />{" "}
                      </span>
                    </div>
                    <h2 className="text-xs sm:text-sm font-bold text-ink leading-tight mt-0.5">
                      {brandName}
                    </h2>
                    <p className="text-[9.5px] text-muted leading-tight">
                      <LocalizedText source={"হেল্পলাইন:"} area="admin" />{" "}{siteSettings.supportPhone}{" "}
                      <LocalizedText source={"· ইস্যু তারিখ:"} area="admin" />{' '}
                      {new Date(p12.createdAt).toLocaleDateString(locale === 'bn' ? 'bn-BD' : 'en-GB')}
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
                    <LocalizedText source={"গ্রাহকের বিবরণ (BILL & SHIP TO)"} area="admin" />{" "}
                  </p>
                  <p className="font-bold text-ink text-[11px]">{p12.customerName}</p>
                  <p className="font-mono font-bold text-ink text-[10.5px]">
                    <LocalizedText source={"মোবাইল:"} area="admin" />{" "}{p12.customerPhone}
                  </p>
                  <p className="text-ink text-[10px] leading-snug">
                    {localizedField(p12, "upazilaNameBn", locale)}, {localizedField(p12, "districtNameBn", locale)}
                    {p12.postCode ? ` (পোস্টকোড: ${p12.postCode})` : ''} — {p12.streetAddress}
                  </p>
                  {(p12.recipientCity || p12.recipientZone) && (
                    <p className="font-mono text-[9px] text-muted">
                      Zone: {p12.recipientCity} → {p12.recipientZone}
                      {p12.totalWeightGrams ? ` · ${(p12.totalWeightGrams / 1000).toFixed(2)}kg` : ''}
                    </p>
                  )}
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
                          <td className="py-1 px-1.5 font-mono text-muted">{idx + 1}</td>
                          <td className="py-1 px-1.5">
                            <div className="flex items-center gap-1.5">
                              {item.imageUrl && safeStoreUrl(item.imageUrl) && !item.imageUrl.startsWith('#') && (
                                <div className="relative w-5 h-5 border border-border rounded overflow-hidden shrink-0">
                                  <img
                                    src={item.imageUrl}
                                    alt={item.productNameBn}
                                    referrerPolicy="no-referrer"
                                    className="object-cover"
                                    loading="lazy"
                                    decoding="async"
                                    style={{ position: 'absolute', height: '100%', width: '100%', inset: 0, color: 'transparent' }}
                                  />
                                </div>
                              )}
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
                            {formatPoishaToBdt(item.unitSalePricePoisha, locale)}
                          </td>
                          <td className="py-1 px-1.5 text-right font-mono font-bold text-ink">
                            {formatPoishaToBdt(item.lineSubtotalPoisha, locale)}
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
                        <strong>{formatPoishaToBdt(p12.subtotalPoisha, locale)}</strong>
                      </span>
                      {p12.discountPoisha > 0 && (
                        <span>
                          <LocalizedText source={"ছাড়: -"} area="admin" />{" "}{formatPoishaToBdt(p12.discountPoisha, locale)}
                        </span>
                      )}
                      <span>
                        <LocalizedText source={"ডেলিভারি:"} area="admin" />{' '}
                        {formatPoishaToBdt(p12.deliveryChargePoisha, locale)}
                      </span>
                      <span>
                        {locale === 'bn' ? 'সর্বমোট:' : 'Total:'}{' '}
                        <strong>{formatPoishaToBdt(p12.totalPayablePoisha, locale)}</strong>
                      </span>
                      {p12.advancePaidPoisha > 0 && (
                        <span>
                          <LocalizedText source={"অগ্রিম: -"} area="admin" />{" "}{formatPoishaToBdt(p12.advancePaidPoisha, locale)}
                        </span>
                      )}
                      <span className="font-bold text-ink border-l border-border pl-2">
                        <LocalizedText source={"ডেলিভারিতে প্রদেয় (COD):"} area="admin" />{' '}
                        {formatPoishaToBdt(p12.codCollectablePoisha, locale)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* CUT LINE 1 */}
            <div
              style={{
                display: visibleParts[0] && (visibleParts[1] || canShowPart3) ? undefined : 'none',
              }}
              className="flex items-center gap-2 text-[8.5px] font-mono text-muted py-0"
            >
              <Scissors className="w-3 h-3 shrink-0" aria-hidden="true" />
              <div className="flex-1 border-t border-dashed border-ink" />
              <span><LocalizedText source={"✂ CUT HERE (PART 1 CUSTOMER COPY / PART 2 COURIER BOX LABEL)"} area="admin" /></span>
              <div className="flex-1 border-t border-dashed border-ink" />
            </div>

            {/* PART 2: COURIER BOX STICKER (কুরিয়ার বক্স স্টিকার) */}
            <div
              className="print-slip-part print-courier-part border border-ink/80 rounded-[var(--radius-sm)] p-2.5 space-y-1.5 bg-bg"
              style={{
                minHeight: `${safePart2H * heightScale}mm`,
                display: visibleParts[1] ? undefined : 'none',
              }}
            >
              <div className="flex items-center justify-between border-b border-border pb-1">
                <div className="flex flex-wrap items-center gap-2">
                  <PrintBrandMark name={brandName} logoUrl={logoUrl} compact />
                  <span className="text-[9px] font-mono font-bold uppercase px-1.5 py-0.2 bg-surface border border-border rounded text-ink">
                    <LocalizedText source={"PART 2 ·"} area="admin" />{" "}{localizedField(printConfig, "part2TitleBn", locale)}
                  </span>
                  <span className="text-[10px] font-bold text-ink">
                    <LocalizedText source={"প্রেরক:"} area="admin" />{" "}{brandName}{" "}
                    <LocalizedText source={"(হেল্পলাইন:"} area="admin" />{' '}{siteSettings.supportPhone})
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
                    <LocalizedText source={"ডেলিভারি ঠিকানা (DELIVER TO)"} area="admin" />{" "}
                  </p>
                  <p className="font-bold text-ink text-xs">
                    <LocalizedText source={"প্রাপক:"} area="admin" />{" "}{p12.customerName}
                  </p>
                  <p className="font-mono font-bold text-ink text-[11px]">
                    <LocalizedText source={"ফোন:"} area="admin" />{" "}{p12.customerPhone}
                  </p>
                  <p className="text-ink text-[10px] leading-snug font-medium">
                    {localizedField(p12, "upazilaNameBn", locale)}, {localizedField(p12, "districtNameBn", locale)}
                    {p12.postCode ? ` [${p12.postCode}]` : ''} — {p12.streetAddress}
                  </p>
                  {(p12.recipientCity || p12.recipientZone) && (
                    <p className="font-mono text-[9px] text-ink">
                      Pathao: {p12.recipientCity} → {p12.recipientZone}
                      {p12.totalWeightGrams ? ` · ${(p12.totalWeightGrams / 1000).toFixed(2)}kg` : ''}
                    </p>
                  )}
                  {p12.senderAddressBn && (
                    <p className="text-muted text-[8.5px]">
                      প্রেরক ঠিকানা: {p12.senderAddressBn} {p12.senderPostCode ? `(${p12.senderPostCode})` : ''}
                    </p>
                  )}
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
                  {(() => {
                    const safeQrUrl = resolveSafeQrUrl(p12.trackingUrl);
                    return safeQrUrl ? (
                      <QRCodeSVG
                        value={safeQrUrl}
                        size={46}
                        title={`Tracking QR ${p12.orderNo}`}
                      />
                    ) : null;
                  })()}
                </div>

                <div className="sm:col-span-3 border-2 border-ink bg-surface p-1.5 text-center rounded-[var(--radius-sm)]">
                  <p className="text-[8.5px] font-bold uppercase text-muted">
                    <LocalizedText source={"ডেলিভারির সময় প্রদেয় (COD)"} area="admin" />{" "}
                  </p>
                  <p className="text-base sm:text-lg font-bold font-mono tabular-nums text-ink leading-tight">
                    {formatPoishaToBdt(p12.codCollectablePoisha, locale)}
                  </p>
                  <p className="text-[8.5px] font-mono text-muted">
                    <LocalizedText source={"Order:"} area="admin" />{" "}{p12.orderNo}{" "}
                    <LocalizedText source={"· পিস:"} area="admin" />{' '}
                    {p12.items.reduce((acc, i) => acc + i.quantity, 0)}
                    <LocalizedText source={"টি"} area="admin" />{" "}
                  </p>
                </div>
              </div>
            </div>

            {/* CUT LINE 2 & PART 3: STRICTLY SUPER ADMIN ONLY */}
            {isSuperAdmin && p3 && (
              <>
            <div
              style={{ display: visibleParts[1] && visibleParts[2] ? undefined : 'none' }}
              className="flex items-center gap-2 text-[8.5px] font-mono text-muted py-0"
            >
              <Scissors className="w-3 h-3 shrink-0" aria-hidden="true" />
              <div className="flex-1 border-t border-dashed border-ink" />
              <span>
                <LocalizedText source={"✂ CUT HERE — PART 3 ADMIN, ACCOUNTS & WAREHOUSE MASTER RECORD (অ্যাডমিন ও হিসাব সংরক্ষণ কপি)"} area="admin" />{" "}
              </span>
              <div className="flex-1 border-t border-dashed border-ink" />
            </div>

            {/* PART 3: ADMIN, ACCOUNTS & WAREHOUSE MASTER COPY */}
            <div
              className="print-slip-part print-internal-part border-2 border-ink rounded-[var(--radius-sm)] p-2.5 bg-surface/60 space-y-2"
              style={{
                minHeight: `${safePart3H * heightScale}mm`,
                display: visibleParts[2] ? undefined : 'none',
              }}
            >
              {/* Part 3 Header & Operational Telemetry Strip */}
              <div className="flex flex-wrap items-center justify-between gap-1.5 border-b border-border pb-1.5">
                <div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <PrintBrandMark name={brandName} logoUrl={logoUrl} compact />
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
                    {(p3.orderSource ?? 'storefront').toUpperCase()}{" "}
                    <LocalizedText source={"· কল স্ট্যাটাস:"} area="admin" />{' '}
                    {p3.callStatus ?? '—'}{" "}
                    <LocalizedText source={"(চেষ্টা:"} area="admin" />{' '}
                    {p3.callAttempts == null ? '—' : formatLocaleNumber(p3.callAttempts, locale)}
                    <LocalizedText source={") · ঝুঁকি:"} area="admin" />{' '}
                    {p3.fraudRiskTierBn ?? '—'}{" "}
                    <LocalizedText source={"(স্কোর:"} area="admin" />{' '}
                    {p3.addressQualityScore == null ? '—' : formatLocaleNumber(p3.addressQualityScore, locale)}%)
                    {p3.postCode ? ` · পোস্টকোড: ${p3.postCode}` : ''}
                    {p3.recipientCity ? ` · ${p3.recipientCity}→${p3.recipientZone}` : ''}
                    {p3.totalWeightGrams ? ` · ${(p3.totalWeightGrams / 1000).toFixed(2)}kg` : ''}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 font-mono text-[9px]">
                  <span className="px-1.5 py-0.5 rounded border border-border bg-bg text-ink font-bold">
                    <LocalizedText source={"প্রিন্ট:"} area="admin" />{" "}{formatLocaleNumber(p3.printCount, locale)}{" "}
                    <LocalizedText source={"বার"} area="admin" />{" "}
                  </span>
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
                        <LocalizedText source={"পণ্য, ভ্যারিয়েন্ট, Public ও Internal SKU (Bin)"} area="admin" />{" "}
                      </th>
                      <th className="py-1 px-1 text-center"><LocalizedText source={"পরিমাণ"} area="admin" /></th>
                      {(isSuperAdmin || isVendor) && (
                        <>
                          <th className="py-1 px-1 text-right"><LocalizedText source={"একক কেনা (Cost)"} area="admin" />{" "}</th>
                          <th className="py-1 px-1 text-right"><LocalizedText source={"সাপ্লায়ার লাভ (Profit)"} area="admin" />{" "}</th>
                          <th className="py-1 px-1 text-right"><LocalizedText source={"সাপ্লায়ার প্রদেয় (Payable)"} area="admin" />{" "}</th>
                        </>
                      )}
                      {isSuperAdmin && (
                        <>
                          <th className="py-1 px-1 text-right"><LocalizedText source={"কমিশন ও গ্রস মার্জিন"} area="admin" />{" "}</th>
                          <th className="py-1 px-1 text-right"><LocalizedText source={"প্রোমো ছাড় ও নিট মার্জিন"} area="admin" />{" "}</th>
                        </>
                      )}
                      <th className="py-1 px-1 text-right"><LocalizedText source={"খুচরা বিক্রয় (Sale)"} area="admin" /></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-bg/70">
                    {p3.lines.map((line, idx) => (
                      <tr key={idx}>
                        <td className="py-1 px-1 font-mono text-muted">{line.lineNo ?? idx + 1}</td>
                        <td className="py-1 px-1">
                          <div className="font-bold text-ink">
                            {line.vendorBusinessName} ({line.vendorCode})
                          </div>
                          <div className="font-mono text-[8px] text-muted">
                            {line.consignmentLotRef || '—'}
                            {line.vendorContactPhone ? ` · ${line.vendorContactPhone}` : ''}
                            {line.vendorPayoutMethodBn ? ` · ${line.vendorPayoutMethodBn}` : ''}
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
                            <LocalizedText source={"Public:"} area="admin" />{" "}
                            <strong className="text-ink">{line.publicSku}</strong>{" "}
                            <LocalizedText source={"· Vendor SKU:"} area="admin" />{' '}
                            <strong className="text-ink">{line.internalVendorSku}</strong> ·{' '}
                            {line.warehouseBinCode || '—'} · {line.weightGrams ?? '—'}
                            <LocalizedText source={"g"} area="admin" />{" "}
                          </div>
                        </td>
                        <td className="py-1 px-1 text-center font-mono font-bold text-ink">
                          {formatLocaleNumber(line.quantity, locale)}<LocalizedText source={"টি"} area="admin" />{" "}
                        </td>
                        {(isSuperAdmin || isVendor) && (
                          <>
                            <td className="py-1 px-1 text-right font-mono">
                              <div>{formatPoishaToBdt(line.snapSupplierCostPoisha ?? 0, locale)}</div>
                              <div className="text-[7.5px] text-muted">
                                <LocalizedText source={"মোট:"} area="admin" />{' '}
                                {formatPoishaToBdt(
                                  line.lineSupplierCostTotalPoisha ??
                                    (line.snapSupplierCostPoisha ?? 0) * line.quantity,
                                  locale
                                )}
                              </div>
                            </td>
                            <td className="py-1 px-1 text-right font-mono">
                              <div>+{formatPoishaToBdt(line.snapSupplierProfitPoisha ?? 0, locale)}</div>
                              <div className="text-[7.5px] text-muted">
                                <LocalizedText source={"মোট:"} area="admin" />{' '}
                                {formatPoishaToBdt(line.lineSupplierProfitTotalPoisha ?? 0, locale)}
                              </div>
                            </td>
                            <td className="py-1 px-1 text-right font-mono font-bold text-ink">
                              <div>
                                {formatPoishaToBdt(
                                  line.lineSupplierPayableTotalPoisha ??
                                    (line.snapSupplierPayablePoisha ?? 0) * line.quantity,
                                  locale
                                )}
                              </div>
                              <div className="text-[7.5px] font-normal text-muted">
                                <LocalizedText source={"একক:"} area="admin" />{' '}
                                {formatPoishaToBdt(line.snapSupplierPayablePoisha ?? 0, locale)}
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
                                    (line.snapPlatformMarginPoisha ?? 0) * line.quantity,
                                  locale
                                )}
                              </div>
                              <div className="text-[7.5px] text-muted">
                                {((line.commissionBp ?? 0) / 100).toFixed(1)}
                                <LocalizedText source={"% (একক:"} area="admin" />{' '}
                                {formatPoishaToBdt(line.snapPlatformMarginPoisha ?? 0, locale)})
                              </div>
                            </td>
                            <td className="py-1 px-1 text-right font-mono">
                              <div className="font-bold text-success">
                                {formatPoishaToBdt(
                                  line.lineNetPlatformMarginPoisha ??
                                    (line.snapPlatformMarginPoisha ?? 0) * line.quantity,
                                  locale
                                )}
                              </div>
                              <div className="text-[7.5px] text-muted">
                                <LocalizedText source={"ছাড়: -"} area="admin" />{" "}
                                {formatPoishaToBdt(line.allocatedPromoDiscountPoisha ?? 0, locale)}
                              </div>
                            </td>
                          </>
                        )}
                        <td className="py-1 px-1 text-right font-mono font-bold text-ink">
                          <div>{formatPoishaToBdt(line.lineSaleSubtotalPoisha ?? 0, locale)}</div>
                          <div className="text-[7.5px] font-normal text-muted">
                            <LocalizedText source={"একক:"} area="admin" />{' '}
                            {formatPoishaToBdt(line.unitSalePricePoisha ?? 0, locale)}
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
                      <LocalizedText source={"সাপ্লায়ার-ভিত্তিক প্রদেয় ও পেআউট বিভাজন (SUPPLIER ESCROW SPLIT)"} area="admin" />{" "}
                    </p>
                    {p3.accountingSummary.vendorSplitBreakdown.map((vs) => (
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
                            {vs.totalUnits}{" "}<LocalizedText source={"পিস"} area="admin" />{" "}
                          </div>
                        </div>
                        <div className="text-right leading-tight">
                          <span className="font-bold text-ink">
                            <LocalizedText source={"প্রদেয়:"} area="admin" />{' '}
                            {formatPoishaToBdt(vs.supplierPayablePoisha, locale)}
                          </span>
                          <div className="text-[7.5px] text-muted">
                            <LocalizedText source={"কেনা:"} area="admin" />{' '}
                            {formatPoishaToBdt(vs.supplierCostPoisha, locale)}{' '}
                            <LocalizedText source={"| লাভ:"} area="admin" />{' '}
                            {formatPoishaToBdt(vs.supplierProfitPoisha, locale)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Right: Order-Level P&L, Delivery, bKash & Net Profit Ledger */}
                  <div className="sm:col-span-7 border border-border rounded-[var(--radius-sm)] p-1.5 bg-bg">
                    <p className="font-bold text-ink uppercase text-[8px] border-b border-border pb-0.5 mb-1">
                      <LocalizedText source={"পূর্ণাঙ্গ অর্ডার হিসাব-নিকাশ ও নিট প্ল্যাটফর্ম লাভ (ORDER P&L & LEDGER SUMMARY)"} area="admin" />{" "}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-0.5 leading-snug">
                      <div className="flex justify-between">
                        <span className="text-muted"><LocalizedText source={"পণ্যের মোট বিক্রয়:"} area="admin" /></span>
                        <span className="font-bold text-ink">
                          {formatPoishaToBdt(p3.accountingSummary.grossMerchandiseSubtotalPoisha, locale)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">
                          <LocalizedText source={"প্রোমো ছাড় ("} area="admin" />{p3.accountingSummary.promoCode ?? 'N/A'}):
                        </span>
                        <span className="text-danger">
                          -{formatPoishaToBdt(p3.accountingSummary.promoDiscountPoisha, locale)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted"><LocalizedText source={"ডেলিভারি (গ্রাহক/আনুমানিক):"} area="admin" /></span>
                        <span>
                          {formatPoishaToBdt(p3.accountingSummary.customerDeliveryChargePoisha, locale)} /{' '}
                          {formatPoishaToBdt(p3.accountingSummary.estimatedActualCourierCostPoisha, locale)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted"><LocalizedText source={"মোট সাপ্লায়ার কেনা দাম:"} area="admin" /></span>
                        <span>{formatPoishaToBdt(p3.accountingSummary.totalSupplierCostPoisha, locale)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted"><LocalizedText source={"মোট সাপ্লায়ার লাভ:"} area="admin" /></span>
                        <span>+{formatPoishaToBdt(p3.accountingSummary.totalSupplierProfitPoisha, locale)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-ink">
                        <span><LocalizedText source={"সাপ্লায়ার প্রদেয় (Escrow):"} area="admin" /></span>
                        <span>{formatPoishaToBdt(p3.accountingSummary.totalSupplierPayableEscrowPoisha, locale)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted">
                          <LocalizedText source={"অগ্রিম ("} area="admin" />{p3.manualPaymentTrxId ?? 'COD'}):
                        </span>
                        <span>{formatPoishaToBdt(p3.accountingSummary.advancePaidPoisha, locale)}</span>
                      </div>
                      <div className="flex justify-between font-bold text-ink">
                        <span><LocalizedText source={"কুরিয়ার সিওডি প্রাপ্য:"} area="admin" /></span>
                        <span>{formatPoishaToBdt(p3.accountingSummary.codCollectablePoisha, locale)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted"><LocalizedText source={"প্যাকিং ও ভ্যাট (৫%):"} area="admin" /></span>
                        <span>
                          -{formatPoishaToBdt(
                            p3.accountingSummary.packagingMaterialCostPoisha +
                              p3.accountingSummary.estimatedVatOnMarginPoisha,
                            locale
                          )}
                        </span>
                      </div>
                    </div>
                    <div className="mt-1 pt-1 border-t border-border flex flex-wrap items-center justify-between gap-2">
                      <span className="text-[8px] text-muted">
                        <LocalizedText source={"হিসাব সূত্র: গ্রস মার্জিন ("} area="admin" />{" "}
                        {formatPoishaToBdt(p3.accountingSummary.grossPlatformMarginPoisha, locale)}
                        <LocalizedText source={") - ছাড় - ডেলিভারি ভর্তুকি - প্যাকিং - ৫% ভ্যাট"} area="admin" />{" "}
                      </span>
                      <span className="text-[9.5px] font-bold text-success bg-surface px-2 py-0.5 rounded border border-border">
                        <LocalizedText source={"আনুমানিক নিট প্ল্যাটফর্ম লাভ (Estimated Net Profit):"} area="admin" />{' '}
                        {formatPoishaToBdt(p3.accountingSummary.netPlatformRetainedProfitPoisha, locale)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Warehouse QC Checklist, Staff Notes & 3-Role Signature Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 pt-1 border-t border-border text-[8.5px] items-end">
                <div className="sm:col-span-7 space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5">
                    {printConfig.checklistItemsBn.filter((chk) => chk.trim()).map((chk, idx) => (
                      <span key={idx} className="inline-flex items-center gap-1 text-ink font-medium">
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
                    <LocalizedText source={"প্যাকিং অফিসার"} area="admin" />{" "}
                  </div>
                  <div className="border-t border-ink pt-0.5 text-muted">
                    <LocalizedText source={"কিউসি যাচাইকারী"} area="admin" />{" "}
                  </div>
                  <div className="border-t border-ink pt-0.5 text-muted">
                    <LocalizedText source={"অ্যাডমিন / হিসাব রক্ষণ"} area="admin" />{" "}
                  </div>
                </div>
              </div>
            </div>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}

export interface PrintEnginePanelProps {
  locale: 'bn' | 'en';
  isSuperAdmin: boolean;
  isVendor: boolean;
  availableOrderNos: string[];
  initialPrintConfig: PrintTemplateConfig;
  siteSettings: PublicSafeSiteSettingsDTO;
  onRefreshWorkspace: () => Promise<void>;
}

type PrintSubTab = 'queue' | 'templates' | 'history';
type PrintSortOption = 'newest' | 'oldest' | 'cod_desc' | 'district' | 'order_no';

function getSlipPrintCount(slip: OrderPrintSlipBundle): number {
  return slip.printCount ?? slip.internalPart3?.printCount ?? 0;
}

function getSlipReprintWarning(slip: OrderPrintSlipBundle): boolean {
  return slip.isReprintWarning ?? slip.internalPart3?.isReprintWarning ?? false;
}

function formatAuditTimestamp(iso: string | null | undefined, locale: 'bn' | 'en'): string {
  if (!iso) return locale === 'bn' ? 'সময় অজানা' : 'Time not recorded';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleString(locale === 'bn' ? 'bn-BD' : 'en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatPrintEventLabel(actionCode: string, locale: 'bn' | 'en'): string {
  const bn = locale === 'bn';
  switch (actionCode) {
    case 'ORDER_SLIP_REPRINTED':
      return bn ? 'পুনরায় প্রিন্ট অনুরোধ' : 'Reprint requested';
    case 'ORDER_SLIP_PRINTED':
      return bn ? 'প্রিন্ট অনুরোধ' : 'Print requested';
    case 'PRINT_CUSTOMER':
      return bn ? 'গ্রাহক কপি' : 'Customer copy';
    case 'PRINT_PACKAGING':
      return bn ? 'প্যাকিং কপি' : 'Packaging copy';
    case 'PRINT_FINANCE':
      return bn ? 'আর্থিক কপি' : 'Finance copy';
    default:
      return actionCode;
  }
}

export function PrintEnginePanel({
  locale,
  isSuperAdmin,
  isVendor,
  availableOrderNos,
  initialPrintConfig,
  siteSettings,
  onRefreshWorkspace,
}: PrintEnginePanelProps) {
  const bn = locale === 'bn';
  const idPrefix = React.useId();

  // Navigation & Sub-Tabs
  const [activeSubTab, setActiveSubTab] = React.useState<PrintSubTab>('queue');

  // Print Queue Controls
  const [selectedOrderNos, setSelectedOrderNos] =
    React.useState<string[]>(availableOrderNos);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [visibleParts, setVisibleParts] = React.useState<boolean[]>([
    true,
    true,
    isSuperAdmin,
  ]);
  const [courierFilter, setCourierFilter] = React.useState<string>('ALL');
  const [sortOption, setSortOption] = React.useState<PrintSortOption>('newest');
  const [layoutMode, setLayoutMode] = React.useState<'a4_3part' | 'thermal_4x6'>(
    initialPrintConfig.defaultMode
  );

  // Print Slips & Config State
  const [printConfig, setPrintConfig] =
    React.useState<PrintTemplateConfig>(initialPrintConfig);
  const [savingConfig, setSavingConfig] = React.useState(false);
  const [slips, setSlips] = React.useState<OrderPrintSlipBundle[]>([]);
  const [loadingSlips, setLoadingSlips] = React.useState(false);
  const [feedback, setFeedback] = React.useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const printableRef = React.useRef<HTMLDivElement>(null);
  const requestId = React.useRef(0);
  const orderKey = JSON.stringify(availableOrderNos);

  React.useEffect(() => {
    setPrintConfig(initialPrintConfig);
  }, [initialPrintConfig]);

  React.useEffect(() => {
    if (!isSuperAdmin) {
      setVisibleParts((parts) => (parts[2] ? [parts[0], parts[1], false] : parts));
      setActiveSubTab((tab) => (tab === 'templates' ? 'queue' : tab));
    }
  }, [isSuperAdmin]);

  React.useEffect(() => {
    const orders = JSON.parse(orderKey) as string[];
    setSelectedOrderNos((previous) => {
      const available = new Set(orders);
      const kept = previous.filter((order) => available.has(order));
      return kept.length > 0 ? kept : orders;
    });
    if (!orders.length) {
      setSlips([]);
      return;
    }
    const id = ++requestId.current;
    setLoadingSlips(true);
    fetch('/api/admin/workspace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operation: 'generate_print_slips', orderNos: orders }),
    })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(
            data.errorBn ||
              (bn ? 'প্রিভিউ লোড করা যায়নি।' : 'Could not load preview.')
          );
        }
        if (id === requestId.current) setSlips(data.slips || []);
      })
      .catch((error) => {
        if (id === requestId.current) {
          setFeedback({
            type: 'error',
            message:
              error instanceof Error
                ? error.message
                : bn
                ? 'প্রিভিউ লোড করা যায়নি।'
                : 'Could not load preview.',
          });
        }
      })
      .finally(() => {
        if (id === requestId.current) setLoadingSlips(false);
      });
    return () => {
      requestId.current++;
    };
  }, [orderKey, bn]);

  const loadSlips = async () => {
    const orders = JSON.parse(orderKey) as string[];
    if (!orders.length) return;
    const id = ++requestId.current;
    setLoadingSlips(true);
    setFeedback(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'generate_print_slips', orderNos: orders }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.errorBn ||
            (bn ? 'প্রিভিউ লোড করা যায়নি।' : 'Could not load preview.')
        );
      }
      if (id === requestId.current) setSlips(data.slips || []);
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : bn
            ? 'সংযোগ ব্যর্থ হয়েছে।'
            : 'Connection failed.',
      });
    } finally {
      if (id === requestId.current) setLoadingSlips(false);
    }
  };

  // Save Print Template Settings (Super Admin only)
  const handleSaveTemplateConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || savingConfig) return;
    setFeedback(null);
    const cleanedChecklist = printConfig.checklistItemsBn
      .map((line) => line.trim())
      .filter((line) => line.length > 0);
    const sanitizedPatch: PrintTemplateConfig = {
      ...printConfig,
      part1TitleBn: printConfig.part1TitleBn.trim(),
      part1TitleEn: printConfig.part1TitleEn.trim(),
      part2TitleBn: printConfig.part2TitleBn.trim(),
      part2TitleEn: printConfig.part2TitleEn.trim(),
      part3TitleBn: printConfig.part3TitleBn.trim(),
      part3TitleEn: printConfig.part3TitleEn.trim(),
      part1HeightMm: Math.min(120, Math.max(60, Math.round(Number(printConfig.part1HeightMm) || 95))),
      part2HeightMm: Math.min(120, Math.max(60, Math.round(Number(printConfig.part2HeightMm) || 95))),
      part3HeightMm: Math.min(120, Math.max(60, Math.round(Number(printConfig.part3HeightMm) || 95))),
      footerNoteBn: printConfig.footerNoteBn.trim(),
      checklistItemsBn: cleanedChecklist,
    };

    setSavingConfig(true);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ operation: 'update_print_config', patch: sanitizedPatch }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.errorBn || (bn ? 'সেভ করা সম্ভব হয়নি।' : 'Could not save settings.')
        );
      }
      setPrintConfig(data.printConfig);
      setLayoutMode(data.printConfig.defaultMode);
      setFeedback({
        type: 'success',
        message: bn ? 'প্রিন্ট সেটিংস সেভ হয়েছে।' : 'Print settings saved.',
      });
      await onRefreshWorkspace();
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : bn
            ? 'সংযোগ ব্যর্থ হয়েছে।'
            : 'Connection failed.',
      });
    } finally {
      setSavingConfig(false);
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

  const toggleOrderSelection = (orderNo: string) => {
    setSelectedOrderNos((prev) =>
      prev.includes(orderNo) ? prev.filter((x) => x !== orderNo) : [...prev, orderNo]
    );
  };

  const activeSlipsToPrint = React.useMemo(() => {
    return filteredAndSortedSlips.filter((s) =>
      selectedOrderNos.includes(s.orderNo)
    );
  }, [filteredAndSortedSlips, selectedOrderNos]);

  const printedHistorySlips = React.useMemo(() => {
    return slips
      .filter((s) => getSlipPrintCount(s) > 0 || (s.printEvents?.length ?? 0) > 0)
      .sort((a, b) => {
        const tA = a.lastPrintedAt ? new Date(a.lastPrintedAt).getTime() : 0;
        const tB = b.lastPrintedAt ? new Date(b.lastPrintedAt).getTime() : 0;
        if (tB !== tA) return tB - tA;
        return getSlipPrintCount(b) - getSlipPrintCount(a);
      });
  }, [slips]);

  const effectiveVisibleParts = React.useMemo(
    () => [visibleParts[0], visibleParts[1], isSuperAdmin ? visibleParts[2] : false],
    [visibleParts, isSuperAdmin]
  );

  const handlePrint = async () => {
    if (!activeSlipsToPrint.length || !printableRef.current) return;
    if (layoutMode === 'a4_3part' && !effectiveVisibleParts.some(Boolean)) {
      setFeedback({
        type: 'error',
        message: bn
          ? 'প্রিন্ট করার জন্য অন্তত একটি A4 অংশ নির্বাচন করুন।'
          : 'Select at least one A4 section to print.',
      });
      return;
    }
    setLoadingSlips(true);
    setFeedback(null);
    try {
      // Record a print request, not a claim that the printer actually succeeded.
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'generate_print_slips',
          orderNos: activeSlipsToPrint.map((s) => s.orderNo),
          recordPrint: true,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          data.errorBn || (bn ? 'প্রিন্ট অনুরোধ ব্যর্থ।' : 'Print request failed.')
        );
      }
      const updates = new Map<string, OrderPrintSlipBundle>(
        data.slips.map((slip: OrderPrintSlipBundle) => [slip.orderNo, slip])
      );
      flushSync(() =>
        setSlips((previous) => previous.map((slip) => updates.get(slip.orderNo) || slip))
      );
      if (!printableRef.current) {
        throw new Error(
          bn ? 'প্রিন্ট উইন্ডো তৈরি করা যায়নি।' : 'Could not open print window.'
        );
      }
      await executeNativeSlipPrint({
        printableEl: printableRef.current,
        layoutMode,
        locale,
      });
      // Browsers do not report whether the dialog was cancelled or paper was printed.
      setFeedback({
        type: 'success',
        message: bn
          ? 'প্রিন্ট অনুরোধ নথিভুক্ত হয়েছে। প্রিন্ট ডায়ালগে কাগজের আকার ও স্কেল যাচাই করুন; বাতিল করলেও অনুরোধের সংখ্যা থাকবে।'
          : 'Print request recorded. Check paper size and scale in the print dialog; cancelled requests are also counted.',
      });
    } catch (error) {
      setFeedback({
        type: 'error',
        message:
          error instanceof Error
            ? error.message
            : bn
            ? 'প্রিন্ট ব্যর্থ হয়েছে।'
            : 'Print failed.',
      });
    } finally {
      setLoadingSlips(false);
    }
  };

  const partOptions: Array<{ index: number; label: string }> = [
    { index: 0, label: bn ? 'গ্রাহক ইনভয়েস' : 'Customer' },
    { index: 1, label: bn ? 'কুরিয়ার লেবেল' : 'Courier' },
    ...(isSuperAdmin
      ? [{ index: 2, label: bn ? 'অভ্যন্তরীণ কপি' : 'Internal' }]
      : []),
  ];

  return (
    <section className="space-y-5">
      {/* Top Header & Sub-Tab Navigation Bar (Hidden during native print) */}
      <div className="print:hidden space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-ink flex items-center gap-2">
              <Printer className="w-5 h-5 text-ink shrink-0" aria-hidden="true" />
              <span>
                {bn
                  ? 'প্রিন্ট ইঞ্জিন ও ইনভয়েস স্টুডিও'
                  : 'Print Engine & Invoice Studio'}
              </span>
            </h1>
            <p className="text-xs text-muted">
              {bn
                ? 'অনুমতি অনুযায়ী প্রতিটি কপির জন্য A4 ইনভয়েস বা ৪×৬ কুরিয়ার লেবেল প্রিন্ট করুন।'
                : 'Print A4 documents or 4×6 courier labels with permission checks for each copy.'}
            </p>
          </div>

          {/* Sub-Tab Navigation Switcher */}
          <div
            role="tablist"
            aria-label={bn ? 'প্রিন্ট স্টুডিও সেকশন' : 'Print Studio sections'}
            className="flex flex-wrap max-w-full items-center gap-1 p-1 bg-surface border border-border rounded-[var(--radius-md)] self-start sm:self-auto"
          >
            <button
              type="button"
              role="tab"
              id={`${idPrefix}-tab-queue`}
              aria-selected={activeSubTab === 'queue'}
              aria-controls={`${idPrefix}-panel-queue`}
              onClick={() => setActiveSubTab('queue')}
              className={`min-h-[44px] sm:min-h-[38px] max-w-full px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubTab === 'queue'
                  ? 'bg-ink text-surface shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <Package className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                {bn ? 'প্রিন্ট কিউ' : 'Print queue'} ({formatLocaleNumber(availableOrderNos.length, locale)})
              </span>
            </button>

            {isSuperAdmin && !isVendor && (
              <button
                type="button"
                role="tab"
                id={`${idPrefix}-tab-templates`}
                aria-selected={activeSubTab === 'templates'}
                aria-controls={`${idPrefix}-panel-templates`}
                onClick={() => setActiveSubTab('templates')}
                className={`min-h-[44px] sm:min-h-[38px] max-w-full px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                  activeSubTab === 'templates'
                    ? 'bg-ink text-surface shadow-sm'
                    : 'text-muted hover:text-ink'
                }`}
              >
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                <span>{bn ? 'টেম্পলেট সেটিংস' : 'Template settings'}</span>
              </button>
            )}

            <button
              type="button"
              role="tab"
              id={`${idPrefix}-tab-history`}
              aria-selected={activeSubTab === 'history'}
              aria-controls={`${idPrefix}-panel-history`}
              onClick={() => setActiveSubTab('history')}
              className={`min-h-[44px] sm:min-h-[38px] max-w-full px-3 py-1.5 rounded-[var(--radius-sm)] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeSubTab === 'history'
                  ? 'bg-ink text-surface shadow-sm'
                  : 'text-muted hover:text-ink'
              }`}
            >
              <History className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
              <span>
                {bn ? 'প্রিন্ট ইতিহাস' : 'Print history'}
                {printedHistorySlips.length > 0
                  ? ` (${formatLocaleNumber(printedHistorySlips.length, locale)})`
                  : ''}
              </span>
            </button>
          </div>
        </div>

        {feedback && (
          <div
            role={feedback.type === 'error' ? 'alert' : 'status'}
            aria-live={feedback.type === 'error' ? 'assertive' : 'polite'}
            className={`p-3 border text-xs font-semibold rounded-[var(--radius-md)] flex items-center justify-between gap-2 ${
              feedback.type === 'error'
                ? 'border-red-500/40 bg-red-500/10 text-red-800 dark:text-red-300'
                : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-900 dark:text-emerald-300'
            }`}
          >
            <span>{feedback.message}</span>
            <button
              type="button"
              onClick={() => setFeedback(null)}
              aria-label={bn ? 'বার্তা বন্ধ করুন' : 'Dismiss message'}
              className="min-h-[44px] min-w-[44px] sm:min-h-[28px] sm:min-w-[28px] inline-flex items-center justify-center rounded text-ink/70 hover:text-ink text-xs font-bold cursor-pointer"
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
        <div
          role="tabpanel"
          id={`${idPrefix}-panel-queue`}
          aria-labelledby={`${idPrefix}-tab-queue`}
          className="space-y-4"
        >
          <div className="print:hidden rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 text-slate-900">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold">
                  {bn ? 'কোন কপিতে কী থাকবে' : 'What goes on each copy'}
                </h2>
                <p className="mt-1 text-xs text-slate-700">
                  {bn
                    ? 'প্রতি অর্ডারে একটি A4 পাতায় নির্বাচিত অংশগুলো থাকে; কেটে আলাদা করুন।'
                    : 'Each order uses one A4 page with the selected sections; cut them apart.'}
                </p>
              </div>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-900">
                {bn ? 'স্টোরের ব্র্যান্ডিং সিঙ্ক' : 'Store branding synced'}
              </span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs leading-relaxed">
              <div className="rounded-lg border border-emerald-200 bg-white p-3">
                <strong>{bn ? '১ · গ্রাহক ইনভয়েস' : '1 · Customer invoice'}</strong>
                <p className="mt-1 text-slate-700">
                  {bn
                    ? 'ব্র্যান্ড, গ্রাহক ও ঠিকানা, পণ্য, বিক্রয়মূল্য, ছাড়, ডেলিভারি, পরিশোধ ও বকেয়া। অভ্যন্তরীণ খরচ বা ভেন্ডরের তথ্য নয়।'
                    : 'Brand, customer and address, items, sale prices, discounts, delivery, payment and balance. No internal costs or vendor details.'}
                </p>
              </div>
              <div className="rounded-lg border border-sky-200 bg-white p-3">
                <strong>{bn ? '২ · কুরিয়ার লেবেল' : '2 · Courier label'}</strong>
                <p className="mt-1 text-slate-700">
                  {bn
                    ? 'প্রেরক, প্রাপক, ফোন ও ঠিকানা, কুরিয়ার, অর্ডার/বারকোড এবং সংগ্রহযোগ্য টাকা।'
                    : 'Sender, recipient, phone and address, courier, order/barcode and amount to collect.'}
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 bg-white p-3">
                <strong>{bn ? '৩ · অভ্যন্তরীণ কপি' : '3 · Internal copy'}</strong>
                <p className="mt-1 text-slate-700">
                  {isSuperAdmin
                    ? bn
                      ? 'প্যাকিং ও যাচাই, স্টাফ নোট এবং সুপার অ্যাডমিনের জন্য ভেন্ডর ও হিসাবের তথ্য। গ্রাহক বা কুরিয়ারকে দেবেন না।'
                      : 'Packing and checks, staff notes, and Super Admin vendor and accounting details. Do not give this to customers or couriers.'
                    : bn
                    ? 'অভ্যন্তরীণ ভেন্ডর ও হিসাব কপি শুধু সুপার অ্যাডমিনের জন্য সীমাবদ্ধ; আপনার রোল গ্রাহক ও কুরিয়ার কপি প্রিন্ট করতে পারবে।'
                    : 'Internal vendor and accounting copy is restricted to Super Admin; your role prints Customer and Courier copies only.'}
                </p>
              </div>
            </div>
            <p className="mt-3 text-xs text-slate-700">
              {bn
                ? '৪×৬ থার্মাল: শুধু কুরিয়ার লেবেল। লোগো ও নাম স্টোর ডিজাইন সেটিংস থেকে আসে; পরিবর্তন সেভ করে রিলোড করুন। লোগো লোড না হলে নামের প্রথম অক্ষর দেখাবে। রঙ প্রিন্টার ও প্রিন্ট ডায়ালগের ওপর নির্ভর করে—থার্মাল সাধারণত সাদা-কালো।'
                : '4×6 thermal: courier label only. Logo and name come from store design settings; save changes and reload. If the logo cannot load, the first letter is used. Colors depend on your printer and print dialog; thermal is usually monochrome.'}
            </p>
          </div>

          {/* Controls Bar: Search, Sort, Filter, Mode & Action Buttons */}
          <div className="print:hidden space-y-3">
            <Card surface="bg" padding="md" className="space-y-3">
              {/* Row 1: Search, Sort, Courier Filter & Mode Switcher */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-2.5">
                {/* Search */}
                <div className="relative lg:col-span-4">
                  <label htmlFor={`${idPrefix}-queue-search`} className="sr-only">
                    {bn
                      ? 'অর্ডার, নাম, ফোন বা ট্র্যাকিং কোড খুঁজুন'
                      : 'Search orders by number, customer, phone, or tracking code'}
                  </label>
                  <Search
                    className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id={`${idPrefix}-queue-search`}
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={
                      bn
                        ? 'অর্ডার, নাম, ফোন বা ট্র্যাকিং কোড...'
                        : 'Order, name, phone or tracking...'
                    }
                    className="w-full min-h-[44px] sm:min-h-[36px] pl-8 pr-2.5 py-1.5 text-base lg:text-xs bg-surface border border-border rounded-[var(--radius-sm)] text-ink placeholder:text-muted"
                  />
                </div>

                {/* Sort Option */}
                <div className="flex items-center gap-1.5 bg-surface border border-border rounded-[var(--radius-sm)] px-2 min-h-[44px] sm:min-h-[36px] lg:col-span-3">
                  <label htmlFor={`${idPrefix}-queue-sort`} className="sr-only">
                    {bn ? 'সর্ট অর্ডার' : 'Sort print queue'}
                  </label>
                  <ArrowUpDown className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
                  <select
                    id={`${idPrefix}-queue-sort`}
                    value={sortOption}
                    onChange={(e) => setSortOption(e.target.value as PrintSortOption)}
                    className="w-full py-1.5 text-base lg:text-xs bg-transparent text-ink border-0 focus:ring-0 cursor-pointer font-medium"
                  >
                    <option value="newest">
                      {bn ? 'নতুন অর্ডার আগে' : 'Newest orders first'}
                    </option>
                    <option value="oldest">
                      {bn ? 'পুরাতন অর্ডার আগে' : 'Oldest orders first'}
                    </option>
                    <option value="cod_desc">
                      {bn ? 'সর্বোচ্চ সিওডি বিল আগে' : 'Highest COD first'}
                    </option>
                    <option value="district">
                      {bn ? 'জেলা অনুযায়ী (A–Z)' : 'By district (A–Z)'}
                    </option>
                    <option value="order_no">
                      {bn ? 'অর্ডার নম্বর অনুযায়ী' : 'By order number'}
                    </option>
                  </select>
                </div>

                {/* Courier Filter */}
                <div className="flex items-center gap-1.5 bg-surface border border-border rounded-[var(--radius-sm)] px-2 min-h-[44px] sm:min-h-[36px] lg:col-span-2">
                  <label htmlFor={`${idPrefix}-queue-courier`} className="sr-only">
                    {bn ? 'কুরিয়ার ফিল্টার' : 'Filter by courier'}
                  </label>
                  <ListFilter className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
                  <select
                    id={`${idPrefix}-queue-courier`}
                    value={courierFilter}
                    onChange={(e) => setCourierFilter(e.target.value)}
                    className="w-full py-1.5 text-base lg:text-xs bg-transparent text-ink border-0 focus:ring-0 cursor-pointer font-medium"
                  >
                    <option value="ALL">{bn ? 'সব কুরিয়ার' : 'All couriers'}</option>
                    <option value="steadfast">Steadfast</option>
                    <option value="pathao">Pathao</option>
                    <option value="bd_post">{bn ? 'ডাক বিভাগ (BD Post)' : 'BD Post'}</option>
                    <option value="manual">{bn ? 'কাস্টম কুরিয়ার' : 'Custom Courier'}</option>
                  </select>
                </div>

                {/* Layout Mode Toggle */}
                <div className="flex items-center gap-1.5 bg-surface border border-border rounded-[var(--radius-sm)] px-2 min-h-[44px] sm:min-h-[36px] lg:col-span-3">
                  <label htmlFor={`${idPrefix}-queue-layout`} className="sr-only">
                    {bn ? 'কাগজের ধরন' : 'Paper layout mode'}
                  </label>
                  <FileText className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
                  <select
                    id={`${idPrefix}-queue-layout`}
                    value={layoutMode}
                    onChange={(e) =>
                      setLayoutMode(e.target.value as 'a4_3part' | 'thermal_4x6')
                    }
                    className="w-full py-1.5 text-base lg:text-xs bg-transparent text-ink font-bold border-0 focus:ring-0 cursor-pointer"
                  >
                    <option value="a4_3part">
                      {bn ? 'A4 ইনভয়েস ও লেবেল' : 'A4 invoice and labels'}
                    </option>
                    <option value="thermal_4x6">
                      {bn ? '৪×৬ থার্মাল কুরিয়ার স্টিকার' : '4×6 thermal courier label'}
                    </option>
                  </select>
                </div>
              </div>

              {layoutMode === 'a4_3part' && (
                <fieldset className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs border-t border-border pt-2">
                  <legend className="text-xs font-semibold text-ink mb-1">
                    {bn ? 'প্রিন্টের অংশ' : 'Parts to print'}
                  </legend>
                  {partOptions.map(({ index, label }) => (
                    <label
                      key={index}
                      className="inline-flex items-center gap-1.5 min-h-[44px] sm:min-h-0 cursor-pointer select-none"
                    >
                      <input
                        type="checkbox"
                        checked={effectiveVisibleParts[index]}
                        onChange={(e) =>
                          setVisibleParts((parts) =>
                            parts.map((value, i) =>
                              i === index ? e.target.checked : value
                            )
                          )
                        }
                        className="accent-ink"
                      />
                      <span>{label}</span>
                    </label>
                  ))}
                  {!isSuperAdmin && (
                    <span className="text-[11px] text-muted">
                      {bn
                        ? '(অভ্যন্তরীণ কপি শুধু সুপার অ্যাডমিনের জন্য)'
                        : '(Internal copy restricted to Super Admin)'}
                    </span>
                  )}
                </fieldset>
              )}

              <p className="text-xs text-muted">
                {bn
                  ? 'প্রতি অর্ডার এক পৃষ্ঠায় ফিট করা হবে। অতি বেশি তথ্য থাকলে লেখা না কেটে পৃথক অংশ প্রিন্ট করতে বলা হবে। ডায়ালগে সঠিক কাগজের আকার ও ১০০% স্কেল বেছে নিন।'
                  : 'Each order is fitted to one page. If it cannot fit legibly, select fewer parts instead of clipping data. Choose the correct paper size and 100% scale in the print dialog.'}
              </p>

              {/* Row 2: Selection Counters & Direct Print Trigger Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded bg-surface border border-border text-ink hover:bg-bg font-semibold cursor-pointer"
                  >
                    {bn
                      ? `সব সিলেক্ট (${formatLocaleNumber(filteredAndSortedSlips.length, locale)})`
                      : `Select all (${filteredAndSortedSlips.length})`}
                  </button>
                  <button
                    type="button"
                    onClick={handleDeselectAll}
                    className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded bg-surface border border-border text-muted hover:text-ink font-semibold cursor-pointer"
                  >
                    {bn ? 'আনসেলেক্ট' : 'Deselect'}
                  </button>
                  <span className="font-mono text-ink font-bold bg-surface px-2.5 py-1 rounded border border-border">
                    {bn
                      ? `${formatLocaleNumber(selectedOrderNos.length, locale)}টি সিলেক্টেড`
                      : `${selectedOrderNos.length} selected`}
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-h-[44px] sm:min-h-[36px]"
                    onClick={() => void Promise.all([loadSlips(), onRefreshWorkspace()])}
                    disabled={loadingSlips}
                    leftIcon={<RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
                  >
                    {loadingSlips
                      ? bn
                        ? 'লোড হচ্ছে…'
                        : 'Loading…'
                      : bn
                      ? 'রিলোড'
                      : 'Reload'}
                  </Button>

                  <Button
                    variant="primary"
                    size="md"
                    className="min-h-[44px] sm:min-h-[38px]"
                    onClick={() => void handlePrint()}
                    disabled={
                      activeSlipsToPrint.length === 0 ||
                      loadingSlips ||
                      (layoutMode === 'a4_3part' && !effectiveVisibleParts.some(Boolean))
                    }
                    leftIcon={<Printer className="w-4 h-4" aria-hidden="true" />}
                  >
                    {layoutMode === 'a4_3part'
                      ? bn
                        ? `A4 ইনভয়েস প্রিন্ট (${formatLocaleNumber(activeSlipsToPrint.length, locale)})`
                        : `Print A4 Slips (${activeSlipsToPrint.length})`
                      : bn
                      ? `৪×৬ থার্মাল প্রিন্ট (${formatLocaleNumber(activeSlipsToPrint.length, locale)})`
                      : `Print 4×6 Thermal (${activeSlipsToPrint.length})`}
                  </Button>
                </div>
              </div>
            </Card>

            {/* Quick Overview Grid of Queued Orders */}
            {filteredAndSortedSlips.length === 0 ? (
              <Card surface="bg" padding="md" className="text-center py-8 space-y-2">
                <p className="text-sm font-semibold text-ink">
                  {bn
                    ? 'কোনো অর্ডার পাওয়া যায়নি'
                    : 'No matching orders in the print queue'}
                </p>
                <p className="text-xs text-muted">
                  {bn
                    ? 'সার্চ বা কুরিয়ার ফিল্টার পরিবর্তন করে আবার চেষ্টা করুন।'
                    : 'Adjust your search query or courier filter to view queued orders.'}
                </p>
                {(searchQuery || courierFilter !== 'ALL') && (
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setSearchQuery('');
                        setCourierFilter('ALL');
                      }}
                      className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded border border-border bg-surface text-xs font-semibold text-ink hover:border-ink cursor-pointer"
                    >
                      {bn ? 'ফিল্টার রিসেট করুন' : 'Clear filters'}
                    </button>
                  </div>
                )}
              </Card>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {filteredAndSortedSlips.map((slip) => {
                  const p12 = slip.customerAndCourierPart;
                  const isSelected = selectedOrderNos.includes(slip.orderNo);
                  const checkboxId = `${idPrefix}-order-${slip.orderNo}`;

                  return (
                    <label
                      key={slip.orderNo}
                      htmlFor={checkboxId}
                      className={`block p-3 rounded-[var(--radius-md)] border cursor-pointer transition-colors space-y-2 ${
                        isSelected
                          ? 'bg-surface border-ink shadow-sm'
                          : 'bg-bg border-border hover:border-border/80 opacity-80'
                      }`}
                    >
                      <span className="sr-only">
                        {bn
                          ? `প্রিন্টের জন্য অর্ডার ${p12.orderNo}`
                          : `Select order ${p12.orderNo} for printing`}
                      </span>
                      <div className="flex items-center justify-between text-xs border-b border-border pb-1.5">
                        <div className="flex items-center gap-2 min-h-[28px]">
                          <input
                            id={checkboxId}
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleOrderSelection(slip.orderNo)}
                            aria-label={
                              bn
                                ? `প্রিন্টের জন্য অর্ডার ${p12.orderNo} নির্বাচন করুন`
                                : `Select order ${p12.orderNo} for printing`
                            }
                            className="accent-ink w-4 h-4 cursor-pointer"
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
                          <MapPin className="w-3 h-3 inline mr-1" aria-hidden="true" />
                          {localizedField(p12, 'districtNameBn', locale)} —{' '}
                          {localizedField(p12, 'upazilaNameBn', locale)}
                        </p>
                        <div className="flex items-center justify-between pt-1 font-mono text-[11px]">
                          <span className="text-muted">
                            {bn ? 'পণ্য:' : 'Items:'}{' '}
                            {formatLocaleNumber(p12.items.length, locale)}
                            {bn ? 'টি' : ''}
                          </span>
                          <span className="font-bold text-ink">
                            COD: {formatPoishaToBdt(p12.codCollectablePoisha, locale)}
                          </span>
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* ====================================================================
              PRINTABLE SLIPS CONTAINER (RENDERED NATIVELY ON BROWSER PRINT)
             ==================================================================== */}
          <PrintableSlipsDocument
            slips={activeSlipsToPrint}
            layoutMode={layoutMode}
            visibleParts={effectiveVisibleParts}
            printConfig={printConfig}
            siteSettings={siteSettings}
            locale={locale}
            isSuperAdmin={isSuperAdmin}
            isVendor={isVendor}
            containerRef={printableRef}
          />
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 2: TEMPLATE SETTINGS (টেম্পলেট সেটিংস — SUPER ADMIN ONLY)
         ==================================================================== */}
      {activeSubTab === 'templates' && isSuperAdmin && !isVendor && (
        <div
          role="tabpanel"
          id={`${idPrefix}-panel-templates`}
          aria-labelledby={`${idPrefix}-tab-templates`}
        >
          <Card surface="bg" padding="md" className="space-y-4 print:hidden">
            <div className="border-b border-border pb-2">
              <h2 className="text-base font-bold text-ink flex items-center gap-2">
                <Sliders className="w-4 h-4 text-ink shrink-0" aria-hidden="true" />
                <span>
                  {bn
                    ? 'প্রিন্ট টেমপ্লেট ও লেবেল কনফিগারেশন'
                    : 'Print template & label configuration'}
                </span>
              </h2>
              <p className="text-xs text-muted">
                {bn
                  ? 'ইনভয়েসের প্রতিটি অংশের শিরোনাম, পেপার সাইজ এবং গ্রাহক ফুটনোট নিয়ন্ত্রণ করুন।'
                  : 'Configure copy headings, default paper size, height targets, and customer footnotes.'}
              </p>
            </div>

            <form onSubmit={handleSaveTemplateConfig} className="space-y-4">
              <label
                htmlFor={`${idPrefix}-tpl-default-mode`}
                className="block text-sm font-medium text-ink"
              >
                {bn ? 'ডিফল্ট কাগজ' : 'Default paper'}
                <select
                  id={`${idPrefix}-tpl-default-mode`}
                  className="block w-full mt-1 min-h-[44px] sm:min-h-[38px] text-base lg:text-sm border border-border rounded-[var(--radius-sm)] p-2 bg-bg text-ink"
                  value={printConfig.defaultMode}
                  onChange={(e) =>
                    setPrintConfig((p) => ({
                      ...p,
                      defaultMode: e.target.value as PrintTemplateConfig['defaultMode'],
                    }))
                  }
                >
                  <option value="a4_3part">
                    {bn ? 'A4 — ৩ অংশ' : 'A4 — 3 parts'}
                  </option>
                  <option value="thermal_4x6">
                    {bn ? '৪ × ৬ ইঞ্চি — থার্মাল' : '4 × 6 inch — Thermal'}
                  </option>
                </select>
              </label>

              <p className="text-xs text-muted">
                {bn
                  ? 'অংশের উচ্চতা লক্ষ্য হিসেবে ব্যবহৃত হয় (৬০–১২০ মিমি)। তথ্য স্পষ্টভাবে এক পাতায় না ধরলে প্রিন্ট বন্ধ হবে—কম অংশ বেছে আলাদা কপি প্রিন্ট করুন।'
                  : 'Part heights are targets (60–120 mm). If the content cannot fit legibly on one page, printing stops; select fewer parts and print separate copies.'}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Input
                  label={
                    bn ? 'Part 1 শিরোনাম (গ্রাহক কপি — বাংলা)' : 'Part 1 Bangla title (Customer)'
                  }
                  required
                  minLength={2}
                  maxLength={100}
                  value={printConfig.part1TitleBn}
                  onChange={(e) =>
                    setPrintConfig((p) => ({
                      ...p,
                      part1TitleBn: e.target.value,
                    }))
                  }
                />
                <Input
                  label={
                    bn ? 'Part 2 শিরোনাম (কুরিয়ার স্টিকার — বাংলা)' : 'Part 2 Bangla title (Courier)'
                  }
                  required
                  minLength={2}
                  maxLength={100}
                  value={printConfig.part2TitleBn}
                  onChange={(e) =>
                    setPrintConfig((p) => ({
                      ...p,
                      part2TitleBn: e.target.value,
                    }))
                  }
                />
                <Input
                  label={
                    bn ? 'Part 3 শিরোনাম (ইন্টারনাল কপি — বাংলা)' : 'Part 3 Bangla title (Internal)'
                  }
                  required
                  minLength={2}
                  maxLength={100}
                  value={printConfig.part3TitleBn}
                  onChange={(e) =>
                    setPrintConfig((p) => ({
                      ...p,
                      part3TitleBn: e.target.value,
                    }))
                  }
                />

                {([1, 2, 3] as const).map((part) => {
                  const key = `part${part}TitleEn` as
                    | 'part1TitleEn'
                    | 'part2TitleEn'
                    | 'part3TitleEn';
                  return (
                    <Input
                      key={key}
                      label={
                        bn
                          ? `Part ${part} ইংরেজি শিরোনাম`
                          : `Part ${part} English title`
                      }
                      required
                      minLength={2}
                      maxLength={100}
                      value={printConfig[key]}
                      onChange={(e) =>
                        setPrintConfig((p) => ({ ...p, [key]: e.target.value }))
                      }
                    />
                  );
                })}

                <Input
                  label={bn ? 'Part 1 উচ্চতা (mm)' : 'Part 1 height (mm)'}
                  type="number"
                  min={60}
                  max={120}
                  required
                  value={String(printConfig.part1HeightMm)}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    setPrintConfig((p) => ({
                      ...p,
                      part1HeightMm: Number.isFinite(parsed) ? parsed : 95,
                    }));
                  }}
                />
                <Input
                  label={bn ? 'Part 2 উচ্চতা (mm)' : 'Part 2 height (mm)'}
                  type="number"
                  min={60}
                  max={120}
                  required
                  value={String(printConfig.part2HeightMm)}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    setPrintConfig((p) => ({
                      ...p,
                      part2HeightMm: Number.isFinite(parsed) ? parsed : 95,
                    }));
                  }}
                />
                <Input
                  label={bn ? 'Part 3 উচ্চতা (mm)' : 'Part 3 height (mm)'}
                  type="number"
                  min={60}
                  max={120}
                  required
                  value={String(printConfig.part3HeightMm)}
                  onChange={(e) => {
                    const parsed = Number.parseInt(e.target.value, 10);
                    setPrintConfig((p) => ({
                      ...p,
                      part3HeightMm: Number.isFinite(parsed) ? parsed : 95,
                    }));
                  }}
                />

                <div className="sm:col-span-3">
                  <Input
                    label={
                      bn ? 'গ্রাহক ফুটার টার্মস / নোট' : 'Customer invoice footer terms / note'
                    }
                    maxLength={300}
                    value={printConfig.footerNoteBn}
                    onChange={(e) =>
                      setPrintConfig((p) => ({
                        ...p,
                        footerNoteBn: e.target.value,
                      }))
                    }
                  />
                </div>
              </div>

              <label
                htmlFor={`${idPrefix}-tpl-checklist`}
                className="block text-sm font-medium text-ink"
              >
                {bn
                  ? 'প্যাকিং চেকলিস্ট (প্রতি লাইনে একটি, সর্বোচ্চ ২০টি)'
                  : 'Packing checklist (one item per line, max 20)'}
                <textarea
                  id={`${idPrefix}-tpl-checklist`}
                  className="block w-full mt-1 text-base lg:text-sm border border-border rounded-[var(--radius-sm)] p-2 bg-bg text-ink"
                  rows={5}
                  value={printConfig.checklistItemsBn.join('\n')}
                  onChange={(e) =>
                    setPrintConfig((p) => ({
                      ...p,
                      checklistItemsBn: e.target.value.split('\n'),
                    }))
                  }
                />
              </label>

              <div className="flex justify-end pt-2 border-t border-border">
                <Button
                  type="submit"
                  variant="primary"
                  size="md"
                  disabled={savingConfig}
                  className="min-h-[44px] sm:min-h-[38px]"
                >
                  {savingConfig
                    ? bn
                      ? 'সেভ হচ্ছে…'
                      : 'Saving…'
                    : bn
                    ? 'সেটিংস সেভ করুন'
                    : 'Save settings'}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* ====================================================================
          SUB-TAB 3: PRINT HISTORY & AUDIT LOGS (প্রিন্ট ইতিহাস)
         ==================================================================== */}
      {activeSubTab === 'history' && (
        <div
          role="tabpanel"
          id={`${idPrefix}-panel-history`}
          aria-labelledby={`${idPrefix}-tab-history`}
        >
          <Card surface="bg" padding="md" className="space-y-4 print:hidden">
            <div className="border-b border-border pb-2 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-bold text-ink flex items-center gap-2">
                  <History className="w-4 h-4 text-ink shrink-0" aria-hidden="true" />
                  <span>
                    {bn
                      ? 'প্রিন্ট ইতিহাস ও অডিট লগ'
                      : 'Print history and audit log'}
                  </span>
                </h2>
                <p className="text-xs text-muted">
                  {bn
                    ? 'বর্তমান কিউর অর্ডারগুলোর প্রিন্ট অনুরোধ, সময় ও অপারেটর তথ্য; ডায়ালগ বাতিল করলেও অনুরোধ গণনা হয়।'
                    : 'Print requests, timestamps, and operators for orders in the current queue, including cancelled dialogs.'}
                </p>
              </div>
              <Badge status="neutral">
                {bn ? 'মোট রেকর্ড:' : 'Total records:'}{' '}
                {formatLocaleNumber(printedHistorySlips.length, locale)}
              </Badge>
            </div>

            {printedHistorySlips.length === 0 ? (
              <div className="py-10 px-4 text-center rounded-[var(--radius-md)] border border-dashed border-border bg-surface/40 space-y-2">
                <History className="w-6 h-6 text-muted mx-auto" aria-hidden="true" />
                <p className="text-sm font-semibold text-ink">
                  {bn
                    ? 'এখনো কোনো প্রিন্ট রেকর্ড নেই'
                    : 'No print requests recorded yet'}
                </p>
                <p className="text-xs text-muted max-w-md mx-auto">
                  {bn
                    ? 'প্রিন্ট কিউ থেকে যেকোনো অর্ডার প্রিন্ট করলে এখানে প্রিন্ট কাউন্ট, সময় এবং অপারেটরের নাম স্বয়ংক্রিয়ভাবে যুক্ত হবে।'
                    : 'Once an operator prints an order from the Print queue, the print count, timestamp, and operator audit trail will appear here.'}
                </p>
                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => setActiveSubTab('queue')}
                    className="min-h-[44px] sm:min-h-[36px] px-3.5 py-1.5 rounded-[var(--radius-sm)] bg-ink text-bg text-xs font-semibold hover:opacity-90 cursor-pointer"
                  >
                    {bn ? 'প্রিন্ট কিউতে যান' : 'Go to Print queue'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {printedHistorySlips.map((slip) => {
                  const p12 = slip.customerAndCourierPart;
                  const count = getSlipPrintCount(slip);
                  const isReprint = getSlipReprintWarning(slip);

                  return (
                    <div
                      key={slip.orderNo}
                      className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                    >
                      <div className="space-y-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 font-mono font-bold text-ink">
                          <span>{p12.orderNo}</span>
                          <Badge status={isReprint ? 'warning' : 'neutral'}>
                            {formatLocaleNumber(count, locale)}{' '}
                            {bn ? 'টি প্রিন্ট অনুরোধ' : count === 1 ? 'print request' : 'print requests'}
                          </Badge>
                        </div>
                        <p className="text-muted">
                          {bn ? 'গ্রাহক:' : 'Customer:'} {p12.customerName} ({p12.customerPhone}) —{' '}
                          {localizedField(p12, 'districtNameBn', locale)}
                        </p>
                        {(slip.lastPrintedAt || slip.lastPrintedBy) && (
                          <p className="font-mono text-[11px] text-muted">
                            {bn ? 'সর্বশেষ প্রিন্ট:' : 'Last printed:'}{' '}
                            {formatAuditTimestamp(slip.lastPrintedAt, locale)}
                            {slip.lastPrintedBy
                              ? ` · @${slip.lastPrintedBy}${
                                  slip.lastPrintedRole ? ` (${slip.lastPrintedRole})` : ''
                                }`
                              : ''}
                          </p>
                        )}
                        {slip.printEvents && slip.printEvents.length > 0 && (
                          <div className="flex flex-wrap gap-1.5 pt-0.5">
                            {slip.printEvents.slice(0, 3).map((evt, idx) => (
                              <span
                                key={`${slip.orderNo}-evt-${idx}`}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-border bg-surface font-mono text-[10px] text-muted"
                              >
                                <span className="text-ink font-semibold">
                                  {formatPrintEventLabel(evt.actionCode, locale)}
                                </span>
                                <span>· @{evt.actorUsername}</span>
                                <span>· {formatAuditTimestamp(evt.createdAt, locale)}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] self-start sm:self-auto shrink-0">
                        <span>
                          {bn ? 'কুরিয়ার:' : 'Courier:'} {p12.courierProvider.toUpperCase()}
                          {p12.trackingCode ? ` (${p12.trackingCode})` : ''}
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
                          className="min-h-[44px] sm:min-h-[34px] px-3 py-1 rounded bg-surface border border-border text-ink hover:border-ink font-semibold cursor-pointer"
                        >
                          {bn ? 'পুনরায় প্রিন্ট করুন' : 'Reprint'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      )}
    </section>
  );
}
