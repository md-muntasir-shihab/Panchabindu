'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  Edit3,
  FileSpreadsheet,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  CourierBulkExportFormat,
  CourierProvider,
  OrderGridRowDTO,
  OrderStatus,
} from '@/types/domain';
import {
  buildCourierBulkExportBundle,
  PATHAO_BULK_CSV_HEADERS,
  STEADFAST_BULK_CSV_HEADERS,
  BD_POST_BULK_CSV_HEADERS,
  type CourierPreviewRow,
  type ExporterProductWeightLookup,
  type ExporterSiteSettingsInput,
} from '@/lib/courier/bulk-csv-exporter';
import {
  resolveCourierGeoForAddress,
  getPathaoZonesForDistrict,
} from '@/lib/geo/bd-courier-geo';
import {
  BD_DISTRICTS,
  getThanasByDistrict,
} from '@/lib/geo/bd-geocode';
import {
  Button,
  Card,
  InfoTooltip,
  Input,
} from '@/components/ui/primitives';
import { ResponsiveSheet } from '@/components/ui/responsive-sheet';

export interface CourierBulkCsvPanelProps {
  orders: Array<Partial<OrderGridRowDTO>>;
  products?: ExporterProductWeightLookup[];
  siteSettings?: ExporterSiteSettingsInput;
  onExecuteOperation: (payload: Record<string, unknown>) => Promise<void>;
  onOpenOrderEditor?: (orderNo: string) => void;
  compact?: boolean;
}

const ALL_STATUSES: Array<{ value: OrderStatus; labelBn: string }> = [
  { value: 'pending_confirmation', labelBn: 'কনফার্মেশনের অপেক্ষায় (Pending)' },
  { value: 'confirmed', labelBn: 'কনফার্মড (Confirmed)' },
  { value: 'packed', labelBn: 'প্যাকড (Packed)' },
  { value: 'shipped', labelBn: 'শিপড (Shipped)' },
  { value: 'delivered', labelBn: 'ডেলিভারড (Delivered)' },
];

export function CourierBulkCsvPanel({
  orders,
  products = [],
  siteSettings,
  onExecuteOperation,
  onOpenOrderEditor,
  compact = false,
}: CourierBulkCsvPanelProps) {
  const [format, setFormat] = useState<CourierBulkExportFormat>('pathao');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [selectedStatuses, setSelectedStatuses] = useState<OrderStatus[]>([
    'confirmed',
    'packed',
  ]);
  const [providerFilter, setProviderFilter] = useState<CourierProvider | 'all'>('all');
  const [storeNameOverride, setStoreNameOverride] = useState<string>(
    siteSettings?.pathaoDefaultStoreName || 'Panchabindu Store'
  );
  const [showOnlyFlagged, setShowOnlyFlagged] = useState<boolean>(false);
  const [forceIncludeFlagged, setForceIncludeFlagged] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [copiedNotice, setCopiedNotice] = useState<boolean>(false);
  const [busyOrderNo, setBusyOrderNo] = useState<string | null>(null);
  const [syncingAll, setSyncingAll] = useState<boolean>(false);

  // Inline Fix Row Drawer state
  const [editingOrder, setEditingOrder] = useState<Partial<OrderGridRowDTO> | null>(null);
  const [editDistrictId, setEditDistrictId] = useState<number>(47);
  const [editUpazilaId, setEditUpazilaId] = useState<number>(365);
  const [editPostCode, setEditPostCode] = useState<string>('');
  const [editRecipientCity, setEditRecipientCity] = useState<string>('');
  const [editRecipientZone, setEditRecipientZone] = useState<string>('');
  const [editRecipientArea, setEditRecipientArea] = useState<string>('');
  const [editStreetAddress, setEditStreetAddress] = useState<string>('');
  const [editCustomerPhone, setEditCustomerPhone] = useState<string>('');
  const [editStoreName, setEditStoreName] = useState<string>('');
  const [editItemType, setEditItemType] = useState<'parcel' | 'document' | 'fragile'>('parcel');
  const [editWeightGrams, setEditWeightGrams] = useState<number>(500);
  const [editSpecialInstruction, setEditSpecialInstruction] = useState<string>('');
  const [editBdPostServiceType, setEditBdPostServiceType] = useState<string>('vpp_cod');
  const [editCourierProvider, setEditCourierProvider] = useState<CourierProvider>('pathao');

  const normalizedOrders = useMemo(() => {
    return orders.filter((o): o is OrderGridRowDTO => Boolean(o && o.orderNo));
  }, [orders]);

  const preview = useMemo(() => {
    return buildCourierBulkExportBundle({
      format,
      orders: normalizedOrders,
      orderLines: [],
      products,
      siteSettings,
      fromDate: dateFrom || undefined,
      toDate: dateTo || undefined,
      statuses: selectedStatuses.length > 0 ? selectedStatuses : undefined,
      courierProviderFilter: providerFilter,
      storeNameOverride: storeNameOverride.trim() || undefined,
      forceExportFlagged: forceIncludeFlagged,
    });
  }, [
    format,
    normalizedOrders,
    products,
    siteSettings,
    dateFrom,
    dateTo,
    selectedStatuses,
    providerFilter,
    storeNameOverride,
    forceIncludeFlagged,
  ]);

  const displayedRows = useMemo(() => {
    return preview.previewRows.filter((r: CourierPreviewRow) => {
      if (showOnlyFlagged && r.isReady) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const hay = `${r.orderNo} ${r.editSeed.customerName} ${r.editSeed.customerPhone} ${r.editSeed.recipientCity} ${r.editSeed.recipientZone} ${r.editSeed.postCode}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [preview.previewRows, showOnlyFlagged, searchQuery]);

  const toggleStatus = (status: OrderStatus) => {
    setSelectedStatuses((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const openFixRowModal = (orderNo: string) => {
    const found = normalizedOrders.find((o) => o.orderNo === orderNo);
    if (!found) return;
    const geo = resolveCourierGeoForAddress({
      districtId: found.districtId,
      districtNameEn: found.districtNameEn,
      upazilaId: found.upazilaId,
      upazilaNameEn: found.upazilaNameEn,
      streetAddress: found.streetAddress,
      landmark: found.landmark,
      existingPostCode: found.postCode,
      existingCity: found.recipientCity,
      existingZone: found.recipientZone,
      existingArea: found.recipientArea,
    });
    setEditingOrder(found);
    setEditDistrictId(found.districtId ?? 47);
    setEditUpazilaId(found.upazilaId ?? 365);
    setEditPostCode(found.postCode || geo.postCode);
    setEditRecipientCity(found.recipientCity || geo.recipientCity);
    setEditRecipientZone(found.recipientZone || geo.recipientZone);
    setEditRecipientArea(found.recipientArea || geo.recipientArea);
    setEditStreetAddress(found.streetAddress || '');
    setEditCustomerPhone(found.customerPhone || '');
    setEditStoreName(
      found.pathaoStoreName ||
        storeNameOverride ||
        siteSettings?.pathaoDefaultStoreName ||
        'Panchabindu Store'
    );
    setEditItemType(found.pathaoItemType || 'parcel');
    setEditWeightGrams(found.totalWeightGrams || 500);
    setEditSpecialInstruction(
      found.specialInstruction || found.internalStaffNote || ''
    );
    setEditBdPostServiceType(found.bdPostServiceType || 'vpp_cod');
    setEditCourierProvider(found.courierProvider || 'pathao');
  };

  const handleDistrictChangeInFix = (newDistId: number) => {
    setEditDistrictId(newDistId);
    const upazilas = getThanasByDistrict(newDistId);
    const firstUpz = upazilas[0]?.id ?? 365;
    setEditUpazilaId(firstUpz);
    const synced = resolveCourierGeoForAddress({
      districtId: newDistId,
      upazilaId: firstUpz,
      streetAddress: editStreetAddress,
    });
    setEditPostCode(synced.postCode);
    setEditRecipientCity(synced.recipientCity);
    setEditRecipientZone(synced.recipientZone);
    setEditRecipientArea(synced.recipientArea);
  };

  const handleUpazilaChangeInFix = (newUpzId: number) => {
    setEditUpazilaId(newUpzId);
    const synced = resolveCourierGeoForAddress({
      districtId: editDistrictId,
      upazilaId: newUpzId,
      streetAddress: editStreetAddress,
    });
    setEditPostCode(synced.postCode);
    setEditRecipientCity(synced.recipientCity);
    setEditRecipientZone(synced.recipientZone);
    setEditRecipientArea(synced.recipientArea);
  };

  const handleAutoSyncSingleInModal = () => {
    const synced = resolveCourierGeoForAddress({
      districtId: editDistrictId,
      upazilaId: editUpazilaId,
      streetAddress: editStreetAddress,
    });
    setEditPostCode(synced.postCode);
    setEditRecipientCity(synced.recipientCity);
    setEditRecipientZone(synced.recipientZone);
    setEditRecipientArea(synced.recipientArea);
  };

  const handleSaveFixedRow = async () => {
    if (!editingOrder?.orderNo) return;
    setBusyOrderNo(editingOrder.orderNo);
    try {
      await onExecuteOperation({
        operation: 'update_order_courier_meta',
        orderNo: editingOrder.orderNo,
        districtId: editDistrictId,
        upazilaId: editUpazilaId,
        postCode: editPostCode,
        recipientCity: editRecipientCity,
        recipientZone: editRecipientZone,
        recipientArea: editRecipientArea,
        streetAddress: editStreetAddress,
        customerPhone: editCustomerPhone,
        pathaoStoreName: editStoreName,
        pathaoItemType: editItemType,
        totalWeightGrams: editWeightGrams,
        specialInstruction: editSpecialInstruction,
        bdPostServiceType: editBdPostServiceType,
        courierProvider: editCourierProvider,
        autoSyncGeo: false,
      });
      setEditingOrder(null);
    } finally {
      setBusyOrderNo(null);
    }
  };

  const handleAutoSyncAllOrders = async () => {
    setSyncingAll(true);
    try {
      const targetOrderNos = preview.previewRows.map((r: CourierPreviewRow) => r.orderNo);
      await onExecuteOperation({
        operation: 'auto_sync_orders_geo',
        orderNos: targetOrderNos.length > 0 ? targetOrderNos : undefined,
        overwriteExisting: true,
      });
    } finally {
      setSyncingAll(false);
    }
  };

  const handleCopyCsv = async () => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(preview.csvContent);
      setCopiedNotice(true);
      setTimeout(() => setCopiedNotice(false), 2500);
    }
  };

  const handleDownloadCsv = () => {
    if (typeof window === 'undefined') return;
    const blob = new Blob([preview.csvContent], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', preview.filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const activeHeaders =
    format === 'pathao'
      ? PATHAO_BULK_CSV_HEADERS
      : format === 'steadfast'
      ? STEADFAST_BULK_CSV_HEADERS
      : BD_POST_BULK_CSV_HEADERS;

  const isCellFlagged = (
    header: string,
    missingFields: string[],
    value: string
  ): boolean => {
    if (missingFields.includes(header)) return true;
    const v = (value || '').trim();
    if (
      (header === 'RecipientCity(*)' ||
        header === 'RecipientZone(*)' ||
        header === 'RecipientName(*)' ||
        header === 'RecipientPhone(*)' ||
        header === 'RecipientAddress(*)' ||
        header === 'StoreName' ||
        header === 'Post_Code' ||
        header === 'District' ||
        header === 'Upazila_Thana') &&
      !v
    ) {
      return true;
    }
    return false;
  };

  return (
    <div className="space-y-4">
      {/* Header & Format Selector */}
      <Card padding={compact ? 'sm' : 'md'} className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border pb-4">
          <div>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="h-5 w-5 text-ink" />
              <h3 className="text-base font-bold text-ink">
                কুরিয়ার বাল্ক CSV এক্সপোর্ট ও অটো-সিঙ্ক স্টুডিও (Date-Range Bulk Courier CSV)
              </h3>
            </div>
            <p className="mt-1 text-xs text-muted">
              নির্দিষ্ট তারিখের অর্ডারগুলো Pathao 14-Column Official CSV, Steadfast 6-Column বা Bangladesh Post 18-Column Manifest ফরম্যাটে সরাসরি ইমপোর্টের জন্য এক্সপোর্ট করুন। মিসিং তথ্য লাল রঙে চিহ্নিত হবে।
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => void handleAutoSyncAllOrders()}
              disabled={syncingAll}
            >
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />
              {syncingAll
                ? 'সিঙ্ক হচ্ছে...'
                : 'সব অর্ডারে জেলা/উপজেলা → পোস্টকোড ও Pathao Zone অটো-সিঙ্ক'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void handleCopyCsv()}>
              <Copy className="mr-1.5 h-3.5 w-3.5" />
              {copiedNotice ? 'CSV কপি হয়েছে ✓' : 'CSV টেক্সট কপি'}
            </Button>
            <Button size="sm" variant="primary" onClick={handleDownloadCsv}>
              <Download className="mr-1.5 h-3.5 w-3.5" />
              ডাউনলোড .CSV ({preview.filename})
            </Button>
          </div>
        </div>

        {/* Format Tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="inline-flex rounded-[var(--radius-sm)] border border-border bg-bg p-1">
            <button
              type="button"
              onClick={() => setFormat('pathao')}
              className={`px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                format === 'pathao'
                  ? 'bg-ink text-bg'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Pathao Courier (14-Column Official CSV)
            </button>
            <button
              type="button"
              onClick={() => setFormat('steadfast')}
              className={`px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                format === 'steadfast'
                  ? 'bg-ink text-bg'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Steadfast Courier (6-Column CSV)
            </button>
            <button
              type="button"
              onClick={() => setFormat('bd_post')}
              className={`px-3 py-1.5 text-xs font-semibold transition cursor-pointer ${
                format === 'bd_post'
                  ? 'bg-ink text-bg'
                  : 'text-muted hover:text-ink'
              }`}
            >
              Bangladesh Post / ডাক বিভাগ (18-Column Manifest)
            </button>
          </div>

          {/* KPI Summary Strip */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="border border-border bg-bg px-2.5 py-1 font-mono">
              মোট অর্ডার: <strong>{preview.totalMatchedCount}</strong>
            </span>
            <span className="border border-border bg-bg px-2.5 py-1 font-mono text-emerald-700 dark:text-emerald-400">
              রেডি (Ready): <strong>{preview.readyCount}</strong>
            </span>
            <span
              className={`border px-2.5 py-1 font-mono ${
                preview.flaggedCount > 0
                  ? 'border-danger bg-danger/10 font-bold text-danger'
                  : 'border-border bg-bg text-muted'
              }`}
            >
              লাল সতর্কতা (Missing Info): <strong>{preview.flaggedCount}</strong>
            </span>
          </div>
        </div>

        {/* Date-Range, StoreName & Filter Bar */}
        <div className="grid grid-cols-1 gap-3 border-t border-border pt-4 md:grid-cols-12">
          <div className="md:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold text-muted">
              শুরুর তারিখ (From Date)
            </label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold text-muted">
              শেষ তারিখ (To Date)
            </label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
            />
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 flex items-center gap-1 text-[11px] font-semibold text-muted">
              <span>Pathao StoreName (মার্চেন্ট প্যানেল নাম)</span>
              <InfoTooltip termKey="pathao_store_name" />
            </label>
            <Input
              value={storeNameOverride}
              onChange={(e) => setStoreNameOverride(e.target.value)}
              placeholder="e.g. Panchabindu Store"
            />
          </div>
          <div className="md:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold text-muted">
              কুরিয়ার ফিল্টার
            </label>
            <select
              value={providerFilter}
              onChange={(e) =>
                setProviderFilter(e.target.value as CourierProvider | 'all')
              }
              className="w-full min-h-[44px] px-3 py-2 text-xs border border-border rounded-[var(--radius-md)] bg-bg text-ink"
            >
              <option value="all">সব কুরিয়ার (All)</option>
              <option value="pathao">Pathao Courier</option>
              <option value="steadfast">Steadfast Courier</option>
              <option value="bd_post">Bangladesh Post</option>
              <option value="redx">RedX</option>
              <option value="sundarban">Sundarban</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="mb-1 block text-[11px] font-semibold text-muted">
              অর্ডার/ফোন/জেলা খুঁজুন
            </label>
            <div className="relative">
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Order #, নাম, ফোন, পোস্টকোড..."
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-3 text-xs text-muted hover:text-ink"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status Checkboxes & Red Flag Toggles */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-muted">স্ট্যাটাস ফিল্টার:</span>
            {ALL_STATUSES.map((st) => {
              const active = selectedStatuses.includes(st.value);
              return (
                <button
                  key={st.value}
                  type="button"
                  onClick={() => toggleStatus(st.value)}
                  className={`border px-2.5 py-1 text-xs font-medium transition cursor-pointer ${
                    active
                      ? 'border-ink bg-ink text-bg'
                      : 'border-border bg-bg text-muted hover:text-ink'
                  }`}
                >
                  {active ? '✓ ' : ''}
                  {st.labelBn}
                </button>
              );
            })}
            <button
              type="button"
              onClick={() =>
                setSelectedStatuses(ALL_STATUSES.map((s) => s.value))
              }
              className="text-[11px] underline text-muted hover:text-ink cursor-pointer"
            >
              সব সিলেক্ট
            </button>
            <button
              type="button"
              onClick={() => setSelectedStatuses(['confirmed', 'packed'])}
              className="text-[11px] underline text-muted hover:text-ink cursor-pointer"
            >
              ডিফল্ট (Confirmed + Packed)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={showOnlyFlagged}
                onChange={(e) => setShowOnlyFlagged(e.target.checked)}
                className="accent-danger"
              />
              <span className="font-semibold text-danger">
                শুধু লাল সতর্কতাযুক্ত রো দেখান ({preview.flaggedCount})
              </span>
            </label>

            <label className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="checkbox"
                checked={forceIncludeFlagged}
                onChange={(e) => setForceIncludeFlagged(e.target.checked)}
              />
              <span className="text-muted">
                লাল সতর্কতাযুক্ত রো সহ ফোর্স CSV এক্সপোর্ট (Force Export All)
              </span>
            </label>
          </div>
        </div>
      </Card>

      {/* Interactive Spreadsheet Preview Table (Matching Pathao Bulk Import UI) */}
      <Card padding="none" className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border bg-bg px-4 py-2.5">
          <div className="flex items-center gap-2 text-xs font-semibold text-ink">
            <span>
              লাইভ স্প্রেডশিট প্রিভিউ ({displayedRows.length} রো) —{' '}
              {format === 'pathao'
                ? 'Pathao 14-Column Bulk CSV'
                : format === 'steadfast'
                ? 'Steadfast 6-Column CSV'
                : 'Bangladesh Post 18-Column Manifest'}
            </span>
            <InfoTooltip termKey="pathao_city_zone" />
          </div>
          {preview.flaggedCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-danger">
              <AlertTriangle className="h-4 w-4" />
              <span>
                {preview.flaggedCount}টি অর্ডারে কুরিয়ার ফিল্ড অসম্পূর্ণ — লাল ঘরগুলোতে ক্লিক করে ঠিক করুন
              </span>
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-border bg-bg text-[11px] font-bold text-ink">
                <th className="border-r border-border px-2.5 py-2 text-center">
                  #
                </th>
                <th className="border-r border-border px-3 py-2">
                  স্ট্যাটাস / অ্যাকশন
                </th>
                {activeHeaders.map((header) => (
                  <th
                    key={header}
                    className="whitespace-nowrap border-r border-border px-3 py-2 font-mono"
                  >
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {displayedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={activeHeaders.length + 2}
                    className="px-4 py-8 text-center text-xs text-muted"
                  >
                    নির্বাচিত তারিখ বা স্ট্যাটাসে কোনো অর্ডার পাওয়া যায়নি।
                  </td>
                </tr>
              ) : (
                displayedRows.map((row: CourierPreviewRow, idx: number) => {
                  const activeRecord = row.values;
                  const missingForFormat = row.missingCellKeys;
                  const rowHasError = !row.isReady;

                  return (
                    <tr
                      key={row.orderNo}
                      className={
                        rowHasError
                          ? 'bg-danger/5 hover:bg-danger/10'
                          : 'hover:bg-bg/60'
                      }
                    >
                      <td className="border-r border-border px-2.5 py-2 text-center font-mono text-[11px] text-muted">
                        {idx + 1}
                      </td>
                      <td className="whitespace-nowrap border-r border-border px-3 py-2">
                        <div className="flex items-center gap-2">
                          {rowHasError ? (
                            <span
                              title={row.missingFields.map((m) => m.labelBn).join(', ')}
                              className="inline-flex items-center gap-1 border border-danger bg-danger px-1.5 py-0.5 text-[10px] font-bold text-white"
                            >
                              <AlertTriangle className="h-3 w-3" />
                              লাল সতর্কতা ({missingForFormat.length})
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 border border-emerald-600/40 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                              <CheckCircle2 className="h-3 w-3" />
                              রেডি
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => openFixRowModal(row.orderNo)}
                            className="inline-flex items-center gap-1 border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink hover:bg-ink hover:text-bg cursor-pointer"
                          >
                            <Edit3 className="h-3 w-3" />
                            ঠিক করুন
                          </button>
                          {onOpenOrderEditor && (
                            <button
                              type="button"
                              onClick={() => onOpenOrderEditor(row.orderNo)}
                              className="text-[11px] underline text-muted hover:text-ink cursor-pointer"
                            >
                              অর্ডার এডিট
                            </button>
                          )}
                        </div>
                      </td>

                      {activeHeaders.map((header: string) => {
                        const val = activeRecord[header] ?? '';
                        const cellRed = isCellFlagged(
                          header,
                          missingForFormat,
                          val
                        );
                        return (
                          <td
                            key={header}
                            onClick={() => openFixRowModal(row.orderNo)}
                            className={`cursor-pointer border-r border-border px-3 py-2 font-mono text-xs transition ${
                              cellRed
                                ? 'bg-danger/20 font-bold text-danger ring-1 ring-inset ring-danger'
                                : 'text-ink'
                            }`}
                            title={
                              cellRed
                                ? `${header} মিসিং বা অসম্পূর্ণ — ক্লিক করে ঠিক করুন`
                                : val
                            }
                          >
                            {cellRed ? (
                              <div className="flex items-center justify-between gap-2">
                                <span>{val || 'MISSING (*)'}</span>
                                <span className="text-[10px]">▼</span>
                              </div>
                            ) : (
                              <span className="line-clamp-1 max-w-[220px]">
                                {val}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Inline Fix Courier & Geo Sheet */}
      <ResponsiveSheet
        open={Boolean(editingOrder)}
        onOpenChange={(open) => {
          if (!open) setEditingOrder(null);
        }}
        title={
          editingOrder
            ? `কুরিয়ার ও এরিয়া তথ্য সংশোধন — অর্ডার #${editingOrder.orderNo}`
            : 'কুরিয়ার তথ্য সংশোধন'
        }
      >
        {editingOrder && (
          <div className="space-y-4 text-xs">
            {editingOrder.courierReadiness &&
              !editingOrder.courierReadiness.isReady && (
                <div className="border border-danger bg-danger/10 p-3 text-xs text-danger">
                  <div className="font-bold">
                    লাল সতর্কতা: {editingOrder.courierReadiness.summaryBn}
                  </div>
                  <div className="mt-1">
                    নিচের জেলা/উপজেলা নির্বাচন করলে পোস্টকোড, Pathao RecipientCity ও RecipientZone স্বয়ংক্রিয়ভাবে পূরণ হবে এবং কাস্টমারের ডিফল্ট প্রোফাইলেও সংরক্ষিত থাকবে।
                  </div>
                </div>
              )}

            <div className="flex items-center justify-between border-b border-border pb-2">
              <div className="text-xs font-semibold text-ink">
                গ্রাহক: {editingOrder.customerName} ({editingOrder.customerPhone})
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={handleAutoSyncSingleInModal}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" />
                জেলা/উপজেলা থেকে অটো-সিঙ্ক করুন
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-semibold">
                  জেলা (District - 64)
                </label>
                <select
                  value={editDistrictId}
                  onChange={(e) => handleDistrictChangeInFix(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 text-xs border border-border rounded-[var(--radius-md)] bg-bg text-ink"
                >
                  {BD_DISTRICTS.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name_bn} ({d.name_en})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">
                  উপজেলা / থানা (Upazila / Thana)
                </label>
                <select
                  value={editUpazilaId}
                  onChange={(e) => handleUpazilaChangeInFix(Number(e.target.value))}
                  className="w-full min-h-[44px] px-3 py-2 text-xs border border-border rounded-[var(--radius-md)] bg-bg text-ink"
                >
                  {getThanasByDistrict(editDistrictId).map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name_bn} ({u.name_en})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-semibold">
                  <span>৪-সংখ্যার পোস্টকোড (Post Code)</span>
                  <InfoTooltip termKey="post_code" />
                </label>
                <Input
                  value={editPostCode}
                  onChange={(e) => setEditPostCode(e.target.value)}
                  placeholder="যেমন: 1209"
                  maxLength={4}
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-semibold">
                  <span>Pathao RecipientCity(*)</span>
                  <InfoTooltip termKey="pathao_city_zone" />
                </label>
                <Input
                  value={editRecipientCity}
                  onChange={(e) => setEditRecipientCity(e.target.value)}
                  placeholder="e.g. Dhaka"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">
                  Pathao RecipientZone(*)
                </label>
                <Input
                  value={editRecipientZone}
                  onChange={(e) => setEditRecipientZone(e.target.value)}
                  placeholder="e.g. Dhanmondi / Savar"
                  list="pathao-zone-suggestions"
                />
                <datalist id="pathao-zone-suggestions">
                  {getPathaoZonesForDistrict(editDistrictId).map((z) => (
                    <option key={z} value={z} />
                  ))}
                </datalist>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">
                  Pathao RecipientArea (ঐচ্ছিক)
                </label>
                <Input
                  value={editRecipientArea}
                  onChange={(e) => setEditRecipientArea(e.target.value)}
                  placeholder="e.g. Road 27 / Sector 7"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold">
                  বিস্তারিত ঠিকানা — RecipientAddress(*) (কমপক্ষে ১০ অক্ষর)
                </label>
                <Input
                  value={editStreetAddress}
                  onChange={(e) => setEditStreetAddress(e.target.value)}
                  placeholder="বাসা/হোল্ডিং, রোড, গ্রাম/মহল্লা, ল্যান্ডমার্ক..."
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">
                  গ্রাহকের ফোন — RecipientPhone(*) (১১ ডিজিট)
                </label>
                <Input
                  value={editCustomerPhone}
                  onChange={(e) => setEditCustomerPhone(e.target.value)}
                  placeholder="017XXXXXXXX"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-semibold">
                  <span>Pathao StoreName</span>
                  <InfoTooltip termKey="pathao_store_name" />
                </label>
                <Input
                  value={editStoreName}
                  onChange={(e) => setEditStoreName(e.target.value)}
                  placeholder="Panchabindu Store"
                />
              </div>

              <div>
                <label className="mb-1 flex items-center gap-1 text-xs font-semibold">
                  <span>পার্সেল ওজন (গ্রাম — Weight in Grams)</span>
                  <InfoTooltip termKey="item_weight" />
                </label>
                <Input
                  type="number"
                  min={100}
                  step={50}
                  value={editWeightGrams}
                  onChange={(e) =>
                    setEditWeightGrams(Math.max(100, Number(e.target.value) || 500))
                  }
                />
                <span className="mt-0.5 block text-[10px] text-muted">
                  CSV-তে কেজি হিসেবে যাবে: {(Math.max(100, editWeightGrams) / 1000).toFixed(2)} kg
                </span>
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold">
                  কুরিয়ার সার্ভিস ও BD Post টাইপ
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={editCourierProvider}
                    onChange={(e) =>
                      setEditCourierProvider(e.target.value as CourierProvider)
                    }
                    className="w-full min-h-[44px] px-2.5 py-1.5 text-xs border border-border rounded-[var(--radius-md)] bg-bg text-ink"
                  >
                    <option value="pathao">Pathao</option>
                    <option value="steadfast">Steadfast</option>
                    <option value="bd_post">BD Post</option>
                    <option value="redx">RedX</option>
                    <option value="sundarban">Sundarban</option>
                  </select>
                  <select
                    value={editBdPostServiceType}
                    onChange={(e) =>
                      setEditBdPostServiceType(
                        e.target.value as
                          | 'gep'
                          | 'ems'
                          | 'vpp_cod'
                          | 'registered_parcel'
                      )
                    }
                    className="w-full min-h-[44px] px-2.5 py-1.5 text-xs border border-border rounded-[var(--radius-md)] bg-bg text-ink"
                  >
                    <option value="vpp_cod">VPP / COD</option>
                    <option value="gep">GEP</option>
                    <option value="ems">EMS</option>
                    <option value="registered_parcel">Registered</option>
                  </select>
                </div>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-xs font-semibold">
                  ডেলিভারি নোট / SpecialInstruction
                </label>
                <Input
                  value={editSpecialInstruction}
                  onChange={(e) => setEditSpecialInstruction(e.target.value)}
                  placeholder="ডেলিভারির আগে কল দিন / ভঙ্গুর পণ্য..."
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
              <Button
                variant="secondary"
                onClick={() => setEditingOrder(null)}
              >
                বাতিল
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleSaveFixedRow()}
                disabled={busyOrderNo === editingOrder.orderNo}
              >
                {busyOrderNo === editingOrder.orderNo
                  ? 'সংরক্ষণ হচ্ছে...'
                  : 'সংরক্ষণ ও সিঙ্ক করুন'}
              </Button>
            </div>
          </div>
        )}
      </ResponsiveSheet>
    </div>
  );
}
