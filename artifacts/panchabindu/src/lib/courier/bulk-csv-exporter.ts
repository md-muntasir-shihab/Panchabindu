// src/lib/courier/bulk-csv-exporter.ts
// Multi-Courier Bulk CSV Export & Readiness Validation Engine
// Supports: Pathao (14-Column Official), Steadfast (6-Column), Bangladesh Post (18-Column Manifest)

import type {
  BdPostServiceType,
  CourierFormatKey,
  CourierMissingFieldDTO,
  CourierReadinessDTO,
  PathaoItemType,
} from '../../types/domain';
import type { CourierProvider, OrderStatus } from '../../types/database.types';
import { getDistrictById, getUpazilaById } from '../geo/bd-geocode';
import { isValidBdPostCode, resolveGeoCourierDefaults } from '../geo/bd-courier-geo';
import { normalizeBdPhone } from '../validators';

export const PATHAO_CSV_HEADERS = [
  'ItemType',
  'StoreName',
  'MerchantOrderId',
  'RecipientName(*)',
  'RecipientPhone(*)',
  'RecipientAddress(*)',
  'RecipientCity(*)',
  'RecipientZone(*)',
  'RecipientArea',
  'AmountToCollect(*)',
  'ItemQuantity',
  'ItemWeight',
  'ItemDesc',
  'SpecialInstruction',
] as const;

export const STEADFAST_CSV_HEADERS = [
  'Invoice',
  'Name',
  'Phone',
  'Address',
  'Amount',
  'Note',
] as const;

export const BD_POST_CSV_HEADERS = [
  'Order_No',
  'Service_Type',
  'Sender_Name',
  'Sender_Phone',
  'Sender_Address',
  'Sender_Post_Code',
  'Recipient_Name',
  'Recipient_Phone',
  'Recipient_Address',
  'Upazila_Thana',
  'District',
  'Post_Code',
  'Weight_KG',
  'Item_Count',
  'Item_Description',
  'COD_VPP_Amount_BDT',
  'Declared_Value_BDT',
  'Special_Note',
] as const;

export const PATHAO_BULK_CSV_HEADERS = PATHAO_CSV_HEADERS;
export const STEADFAST_BULK_CSV_HEADERS = STEADFAST_CSV_HEADERS;
export const BD_POST_BULK_CSV_HEADERS = BD_POST_CSV_HEADERS;

export interface ExporterOrderInput {
  id: string;
  orderNo: string;
  customerName: string;
  customerPhone: string;
  districtId: number;
  districtNameBn?: string;
  upazilaId: number;
  upazilaNameBn?: string;
  streetAddress: string;
  landmark?: string;
  postCode?: string;
  recipientCity?: string;
  recipientZone?: string;
  recipientArea?: string;
  pathaoItemType?: PathaoItemType;
  pathaoStoreName?: string;
  totalWeightGrams?: number;
  itemDescSummary?: string;
  specialInstruction?: string;
  customerNote?: string;
  bdPostServiceType?: BdPostServiceType;
  bdPostDeclaredValuePoisha?: number;
  status: OrderStatus;
  deliveryMethod?: string;
  courierProvider: CourierProvider;
  codCollectablePoisha: number;
  subtotalPoisha?: number;
  totalPayablePoisha?: number;
  createdAt: string;
  items?: Array<{
    productId: string;
    variantId: string;
    productNameBn?: string;
    variantTitleBn?: string;
    publicSku?: string;
    quantity: number;
  }>;
}

export interface ExporterOrderLineInput {
  orderId: string;
  productId: string;
  variantId: string;
  productNameBnSnapshot?: string;
  variantTitleBnSnapshot?: string;
  productNameBn?: string;
  variantTitleBn?: string;
  quantity: number;
}

export interface ExporterProductInput {
  productId: string;
  variants: Array<{ variantId: string; weightGrams?: number }>;
}

export type ExporterProductWeightLookup = ExporterProductInput;

export interface ExporterSiteSettingsInput {
  brandNameBn?: string;
  brandNameEn?: string;
  supportPhone?: string;
  pathaoDefaultStoreName?: string;
  pathaoDefaultItemType?: PathaoItemType;
  courierSenderNameBn?: string;
  courierSenderPhone?: string;
  courierSenderAddressBn?: string;
  courierSenderPostCode?: string;
  defaultBdPostServiceType?: BdPostServiceType;
}

export interface CourierPreviewRow {
  orderId: string;
  orderNo: string;
  status: OrderStatus;
  courierProvider: CourierProvider;
  createdAt: string;
  isReady: boolean;
  missingFields: CourierMissingFieldDTO[];
  missingCellKeys: string[];
  values: Record<string, string>;
  editSeed: {
    orderId: string;
    orderNo: string;
    customerName: string;
    customerPhone: string;
    districtId: number;
    upazilaId: number;
    streetAddress: string;
    landmark: string;
    postCode: string;
    recipientCity: string;
    recipientZone: string;
    recipientArea: string;
    pathaoItemType: PathaoItemType;
    pathaoStoreName: string;
    totalWeightGrams: number;
    specialInstruction: string;
    bdPostServiceType: BdPostServiceType;
  };
}

export interface CourierBulkExportBundle {
  format: CourierFormatKey;
  headers: string[];
  totalMatchedCount: number;
  readyCount: number;
  flaggedCount: number;
  exportedCount: number;
  previewRows: CourierPreviewRow[];
  csvContent: string;
  filename: string;
}

/**
 * Formula-injection safe RFC-4180 CSV cell escaping.
 * Neutralizes leading spreadsheet trigger characters (`=`, `+`, `-`, `@`, `\t`, `\r`)
 * without altering clean numeric strings, weights, or 01XXXXXXXXX BD phone numbers.
 */
export function escapeCsvCell(raw: string | number | null | undefined): string {
  const normalized = String(raw ?? '')
    .replace(/\r\n|\r|\n/g, ' ')
    .trim();
  let firstVisibleIndex = 0;
  while (
    firstVisibleIndex < normalized.length &&
    (normalized.charCodeAt(firstVisibleIndex) <= 0x20 ||
      normalized.charCodeAt(firstVisibleIndex) === 0x7f)
  ) {
    firstVisibleIndex += 1;
  }
  const firstVisibleChar = normalized.charAt(firstVisibleIndex);
  const safe =
    firstVisibleChar === '=' ||
    firstVisibleChar === '+' ||
    firstVisibleChar === '-' ||
    firstVisibleChar === '@' ||
    firstVisibleChar === '|'
      ? `'${normalized}`
      : normalized;
  if (/[",\n\r]/.test(safe) || safe.startsWith("'")) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function computeOrderWeightGrams(
  order: Pick<ExporterOrderInput, 'totalWeightGrams' | 'items'>,
  orderLines: ExporterOrderLineInput[],
  products: ExporterProductInput[]
): number {
  if (typeof order.totalWeightGrams === 'number' && order.totalWeightGrams > 0) {
    return Math.max(100, Math.round(order.totalWeightGrams));
  }
  const sourceLines =
    orderLines.length > 0
      ? orderLines
      : (order.items ?? []).map((it) => ({
          orderId: '',
          productId: it.productId,
          variantId: it.variantId,
          quantity: it.quantity,
        }));
  if (sourceLines.length === 0) return 500;
  let sumGrams = 0;
  for (const line of sourceLines) {
    const prod = products.find((p) => p.productId === line.productId);
    const variant =
      prod?.variants.find((v) => v.variantId === line.variantId) ?? prod?.variants[0];
    const unitWeight =
      typeof variant?.weightGrams === 'number' && variant.weightGrams > 0
        ? variant.weightGrams
        : 500;
    sumGrams += unitWeight * Math.max(1, line.quantity);
  }
  return Math.max(100, Math.round(sumGrams || 500));
}

export function gramsToKgString(grams: number): string {
  const safeGrams = Math.max(100, Math.round(grams || 500));
  const kg = Number((safeGrams / 1000).toFixed(2));
  return String(kg);
}

export function buildOrderItemSummary(
  order: Pick<ExporterOrderInput, 'itemDescSummary' | 'items'>,
  orderLines: ExporterOrderLineInput[]
): { quantity: number; desc: string } {
  const sourceLines: ExporterOrderLineInput[] =
    orderLines.length > 0
      ? orderLines
      : (order.items ?? []).map((it) => ({
          orderId: '',
          productId: it.productId,
          variantId: it.variantId,
          productNameBn: it.productNameBn,
          variantTitleBn: it.variantTitleBn,
          quantity: it.quantity,
        }));
  const totalQty =
    sourceLines.reduce((acc, l) => acc + Math.max(1, l.quantity), 0) || 1;
  if (order.itemDescSummary && order.itemDescSummary.trim().length > 0) {
    return { quantity: totalQty, desc: order.itemDescSummary.trim() };
  }
  if (sourceLines.length === 0) {
    return { quantity: 1, desc: 'Consignment Parcel' };
  }
  const summary = sourceLines
    .map((l) => {
      const pName = l.productNameBnSnapshot ?? l.productNameBn ?? 'পণ্য';
      const vTitle = l.variantTitleBnSnapshot ?? l.variantTitleBn ?? '';
      return vTitle
        ? `${pName} (${vTitle}) x${l.quantity}`
        : `${pName} x${l.quantity}`;
    })
    .join('; ')
    .slice(0, 220);
  return { quantity: totalQty, desc: summary };
}

export function buildFullAddressString(order: ExporterOrderInput): string {
  const district = getDistrictById(order.districtId);
  const upazila = getUpazilaById(order.upazilaId);
  const parts = [
    order.streetAddress.trim(),
    order.landmark?.trim() ? `(${order.landmark.trim()})` : '',
    upazila?.name_en ?? order.upazilaNameBn ?? '',
    district?.name_en ?? order.districtNameBn ?? '',
    isValidBdPostCode(order.postCode) ? order.postCode!.trim() : '',
  ].filter((p) => p.length > 0);
  return parts.join(', ');
}

function getEffectiveFormatForOrder(order: ExporterOrderInput, explicit?: CourierFormatKey): CourierFormatKey {
  if (explicit) return explicit;
  if (order.courierProvider === 'bd_post' || order.deliveryMethod === 'post_office') return 'bd_post';
  if (order.courierProvider === 'steadfast') return 'steadfast';
  return 'pathao';
}

export function evaluateOrderCourierReadiness(params: {
  order: ExporterOrderInput;
  orderLines: ExporterOrderLineInput[];
  products: ExporterProductInput[];
  siteSettings?: ExporterSiteSettingsInput;
  format?: CourierFormatKey;
  storeNameOverride?: string;
}): CourierReadinessDTO {
  const { order, orderLines, products, siteSettings, format, storeNameOverride } = params;
  const weightGrams = computeOrderWeightGrams(order, orderLines, products);
  const weightKg = gramsToKgString(weightGrams);
  const normalizedPhone = normalizeBdPhone(order.customerPhone);
  const district = getDistrictById(order.districtId);
  const upazila = getUpazilaById(order.upazilaId);

  const storeName = (
    storeNameOverride?.trim() ||
    order.pathaoStoreName?.trim() ||
    siteSettings?.pathaoDefaultStoreName?.trim() ||
    ''
  ).trim();
  const recipientCity = (order.recipientCity ?? '').trim();
  const recipientZone = (order.recipientZone ?? '').trim();
  const postCode = (order.postCode ?? '').trim();
  const street = (order.streetAddress ?? '').trim();
  const name = (order.customerName ?? '').trim();

  const pathaoMissing: CourierMissingFieldDTO[] = [];
  if (!storeName) {
    pathaoMissing.push({
      fieldKey: 'pathaoStoreName',
      columnName: 'StoreName',
      labelBn: 'পাঠাও StoreName নেই',
      labelEn: 'Missing StoreName',
    });
  }
  if (name.length < 2) {
    pathaoMissing.push({
      fieldKey: 'customerName',
      columnName: 'RecipientName(*)',
      labelBn: 'প্রাপকের নাম অসম্পূর্ণ',
      labelEn: 'Missing RecipientName',
    });
  }
  if (!normalizedPhone) {
    pathaoMissing.push({
      fieldKey: 'customerPhone',
      columnName: 'RecipientPhone(*)',
      labelBn: '১১ ডিজিট মোবাইল নম্বর ভুল',
      labelEn: 'Invalid 11-digit Phone',
    });
  }
  if (street.length < 6) {
    pathaoMissing.push({
      fieldKey: 'streetAddress',
      columnName: 'RecipientAddress(*)',
      labelBn: 'পূর্ণ ঠিকানা অসম্পূর্ণ',
      labelEn: 'Address too short',
    });
  }
  if (!recipientCity) {
    pathaoMissing.push({
      fieldKey: 'recipientCity',
      columnName: 'RecipientCity(*)',
      labelBn: 'RecipientCity নেই',
      labelEn: 'Missing RecipientCity',
    });
  }
  if (!recipientZone) {
    pathaoMissing.push({
      fieldKey: 'recipientZone',
      columnName: 'RecipientZone(*)',
      labelBn: 'RecipientZone নেই',
      labelEn: 'Missing RecipientZone',
    });
  }
  if (weightGrams <= 0) {
    pathaoMissing.push({
      fieldKey: 'totalWeightGrams',
      columnName: 'ItemWeight',
      labelBn: 'ওজন দেওয়া নেই',
      labelEn: 'Missing Weight',
    });
  }

  const steadfastMissing: CourierMissingFieldDTO[] = [];
  if (!order.orderNo?.trim()) {
    steadfastMissing.push({
      fieldKey: 'orderNo',
      columnName: 'Invoice',
      labelBn: 'ইনভয়েস নং নেই',
      labelEn: 'Missing Invoice',
    });
  }
  if (name.length < 2) {
    steadfastMissing.push({
      fieldKey: 'customerName',
      columnName: 'Name',
      labelBn: 'প্রাপকের নাম অসম্পূর্ণ',
      labelEn: 'Missing Name',
    });
  }
  if (!normalizedPhone) {
    steadfastMissing.push({
      fieldKey: 'customerPhone',
      columnName: 'Phone',
      labelBn: '১১ ডিজিট মোবাইল নম্বর ভুল',
      labelEn: 'Invalid 11-digit Phone',
    });
  }
  if (street.length < 6) {
    steadfastMissing.push({
      fieldKey: 'streetAddress',
      columnName: 'Address',
      labelBn: 'পূর্ণ ঠিকানা অসম্পূর্ণ',
      labelEn: 'Address too short',
    });
  }

  const senderName = (siteSettings?.courierSenderNameBn || siteSettings?.brandNameEn || 'Panchabindu').trim();
  const senderPhone = normalizeBdPhone(siteSettings?.courierSenderPhone || siteSettings?.supportPhone || '');
  const senderAddress = (siteSettings?.courierSenderAddressBn || '').trim();
  const senderPostCode = (siteSettings?.courierSenderPostCode || '').trim();

  const bdPostMissing: CourierMissingFieldDTO[] = [];
  if (!senderName) {
    bdPostMissing.push({
      fieldKey: 'courierSenderNameBn',
      columnName: 'Sender_Name',
      labelBn: 'প্রেরকের নাম সেটিংসে নেই',
      labelEn: 'Missing Sender_Name',
    });
  }
  if (!senderPhone) {
    bdPostMissing.push({
      fieldKey: 'courierSenderPhone',
      columnName: 'Sender_Phone',
      labelBn: 'প্রেরকের ফোন সেটিংসে নেই',
      labelEn: 'Missing Sender_Phone',
    });
  }
  if (senderAddress.length < 6) {
    bdPostMissing.push({
      fieldKey: 'courierSenderAddressBn',
      columnName: 'Sender_Address',
      labelBn: 'প্রেরকের ঠিকানা সেটিংসে নেই',
      labelEn: 'Missing Sender_Address',
    });
  }
  if (!isValidBdPostCode(senderPostCode)) {
    bdPostMissing.push({
      fieldKey: 'courierSenderPostCode',
      columnName: 'Sender_Post_Code',
      labelBn: 'প্রেরকের ৪ ডিজিট পোস্ট কোড নেই',
      labelEn: 'Missing Sender_Post_Code',
    });
  }
  if (name.length < 2) {
    bdPostMissing.push({
      fieldKey: 'customerName',
      columnName: 'Recipient_Name',
      labelBn: 'প্রাপকের নাম অসম্পূর্ণ',
      labelEn: 'Missing Recipient_Name',
    });
  }
  if (!normalizedPhone) {
    bdPostMissing.push({
      fieldKey: 'customerPhone',
      columnName: 'Recipient_Phone',
      labelBn: '১১ ডিজিট মোবাইল নম্বর ভুল',
      labelEn: 'Invalid Recipient_Phone',
    });
  }
  if (street.length < 6) {
    bdPostMissing.push({
      fieldKey: 'streetAddress',
      columnName: 'Recipient_Address',
      labelBn: 'প্রাপকের ঠিকানা অসম্পূর্ণ',
      labelEn: 'Address too short',
    });
  }
  if (!district) {
    bdPostMissing.push({
      fieldKey: 'districtId',
      columnName: 'District',
      labelBn: 'জেলা নেই',
      labelEn: 'Missing District',
    });
  }
  if (!upazila) {
    bdPostMissing.push({
      fieldKey: 'upazilaId',
      columnName: 'Upazila_Thana',
      labelBn: 'উপজেলা/থানা নেই',
      labelEn: 'Missing Upazila_Thana',
    });
  }
  if (!isValidBdPostCode(postCode)) {
    bdPostMissing.push({
      fieldKey: 'postCode',
      columnName: 'Post_Code',
      labelBn: '৪ ডিজিট Post Code নেই',
      labelEn: 'Missing 4-digit Post_Code',
    });
  }
  if (weightGrams <= 0 || weightGrams > 30000) {
    bdPostMissing.push({
      fieldKey: 'totalWeightGrams',
      columnName: 'Weight_KG',
      labelBn: 'বৈধ ওজন (০.১-৩০ কেজি) নেই',
      labelEn: 'Invalid Weight_KG',
    });
  }

  const pathaoReady = pathaoMissing.length === 0;
  const steadfastReady = steadfastMissing.length === 0;
  const bdPostReady = bdPostMissing.length === 0;

  const targetFormat = getEffectiveFormatForOrder(order, format);
  let activeMissing: CourierMissingFieldDTO[];
  if (targetFormat === 'pathao') {
    activeMissing = [...pathaoMissing];
    if (!format && !isValidBdPostCode(postCode)) {
      activeMissing.push({
        fieldKey: 'postCode',
        columnName: 'Post_Code',
        labelBn: 'Post Code নেই',
        labelEn: 'Missing PostCode',
      });
    }
  } else if (targetFormat === 'steadfast') {
    activeMissing = [...steadfastMissing];
    if (!format && !isValidBdPostCode(postCode)) {
      activeMissing.push({
        fieldKey: 'postCode',
        columnName: 'Post_Code',
        labelBn: 'Post Code নেই',
        labelEn: 'Missing PostCode',
      });
    }
  } else {
    activeMissing = [...bdPostMissing];
  }

  return {
    isReady: activeMissing.length === 0,
    pathaoReady,
    steadfastReady,
    bdPostReady,
    missingFields: activeMissing,
    missingCellKeys: activeMissing.map((m) => m.columnName),
    weightKg,
    summaryBn: activeMissing.map((m) => m.labelBn).join(', '),
  };
}

export function buildCourierBulkExportBundle(params: {
  orders: ExporterOrderInput[];
  orderLines: ExporterOrderLineInput[];
  products: ExporterProductInput[];
  siteSettings?: ExporterSiteSettingsInput;
  format: CourierFormatKey;
  fromDate?: string;
  toDate?: string;
  statuses?: OrderStatus[];
  courierProviderFilter?: CourierProvider | 'all';
  courierFilter?: CourierProvider | 'all';
  onlyFlagged?: boolean;
  storeNameOverride?: string;
  forceExportFlagged?: boolean;
  forceIncludeFlagged?: boolean;
  orderNosFilter?: string[];
}): CourierBulkExportBundle {
  const {
    orders,
    orderLines,
    products,
    siteSettings,
    format,
    fromDate,
    toDate,
    statuses,
    courierProviderFilter,
    courierFilter,
    onlyFlagged = false,
    storeNameOverride,
    forceExportFlagged,
    forceIncludeFlagged,
    orderNosFilter,
  } = params;

  const activeCourierFilter = courierProviderFilter ?? courierFilter ?? 'all';
  const effectiveForceExport = Boolean(forceExportFlagged ?? forceIncludeFlagged ?? false);
  const allowedOrderNos =
    orderNosFilter && orderNosFilter.length > 0
      ? new Set(orderNosFilter.map((n) => n.trim().toUpperCase()))
      : null;

  const allowedStatuses = statuses && statuses.length > 0 ? new Set<OrderStatus>(statuses) : null;
  const fromMs = fromDate ? new Date(`${fromDate}T00:00:00.000Z`).getTime() : null;
  const toMs = toDate ? new Date(`${toDate}T23:59:59.999Z`).getTime() : null;

  const filtered = orders.filter((o) => {
    if (allowedOrderNos && !allowedOrderNos.has(o.orderNo.toUpperCase())) return false;
    if (allowedStatuses && !allowedStatuses.has(o.status)) return false;
    if (activeCourierFilter !== 'all' && o.courierProvider !== activeCourierFilter) return false;
    const createdMs = new Date(o.createdAt).getTime();
    if (fromMs !== null && Number.isFinite(fromMs) && createdMs < fromMs) return false;
    if (toMs !== null && Number.isFinite(toMs) && createdMs > toMs) return false;
    return true;
  });

  const headers =
    format === 'pathao'
      ? [...PATHAO_CSV_HEADERS]
      : format === 'steadfast'
        ? [...STEADFAST_CSV_HEADERS]
        : [...BD_POST_CSV_HEADERS];

  const defaultStoreName = (
    storeNameOverride?.trim() ||
    siteSettings?.pathaoDefaultStoreName?.trim() ||
    ''
  ).trim();
  const defaultItemType: PathaoItemType = siteSettings?.pathaoDefaultItemType ?? 'parcel';
  const defaultBdPostType: BdPostServiceType = siteSettings?.defaultBdPostServiceType ?? 'vpp_cod';

  const allPreviewRows: CourierPreviewRow[] = filtered.map((order) => {
    const lines = orderLines.filter((l) => l.orderId === order.id);
    const readiness = evaluateOrderCourierReadiness({
      order,
      orderLines: lines,
      products,
      siteSettings,
      format,
      storeNameOverride,
    });
    const weightGrams = computeOrderWeightGrams(order, lines, products);
    const weightKg = gramsToKgString(weightGrams);
    const { quantity, desc } = buildOrderItemSummary(order, lines);
    const normalizedPhone = normalizeBdPhone(order.customerPhone) ?? order.customerPhone.trim();
    const codBdt = Math.max(0, Math.round((order.codCollectablePoisha ?? 0) / 100));
    const declaredBdt = Math.max(
      0,
      Math.round((order.bdPostDeclaredValuePoisha ?? order.totalPayablePoisha ?? order.subtotalPoisha ?? 0) / 100)
    );
    const fullAddress = buildFullAddressString(order);
    const note = (order.specialInstruction || order.customerNote || '').trim();
    const district = getDistrictById(order.districtId);
    const upazila = getUpazilaById(order.upazilaId);
    const effectiveStoreName = (
      storeNameOverride?.trim() ||
      order.pathaoStoreName?.trim() ||
      defaultStoreName
    ).trim();
    const effectiveItemType: PathaoItemType = order.pathaoItemType ?? defaultItemType;
    const effectiveBdPostType: BdPostServiceType = order.bdPostServiceType ?? defaultBdPostType;

    let values: Record<string, string>;
    if (format === 'pathao') {
      values = {
        ItemType: effectiveItemType,
        StoreName: effectiveStoreName,
        MerchantOrderId: order.orderNo,
        'RecipientName(*)': order.customerName.trim(),
        'RecipientPhone(*)': normalizedPhone,
        'RecipientAddress(*)': fullAddress,
        'RecipientCity(*)': (order.recipientCity ?? '').trim(),
        'RecipientZone(*)': (order.recipientZone ?? '').trim(),
        RecipientArea: (order.recipientArea ?? '').trim(),
        'AmountToCollect(*)': String(codBdt),
        ItemQuantity: String(quantity),
        ItemWeight: weightKg,
        ItemDesc: desc,
        SpecialInstruction: note,
      };
    } else if (format === 'steadfast') {
      values = {
        Invoice: order.orderNo,
        Name: order.customerName.trim(),
        Phone: normalizedPhone,
        Address: fullAddress,
        Amount: String(codBdt),
        Note: note,
      };
    } else {
      const senderPhone = normalizeBdPhone(siteSettings?.courierSenderPhone || siteSettings?.supportPhone || '') ?? '';
      values = {
        Order_No: order.orderNo,
        Service_Type: effectiveBdPostType,
        Sender_Name: (siteSettings?.courierSenderNameBn || siteSettings?.brandNameEn || 'Panchabindu').trim(),
        Sender_Phone: senderPhone,
        Sender_Address: (siteSettings?.courierSenderAddressBn || '').trim(),
        Sender_Post_Code: (siteSettings?.courierSenderPostCode || '').trim(),
        Recipient_Name: order.customerName.trim(),
        Recipient_Phone: normalizedPhone,
        Recipient_Address: fullAddress,
        Upazila_Thana: upazila?.name_en ?? order.upazilaNameBn ?? '',
        District: district?.name_en ?? order.districtNameBn ?? '',
        Post_Code: (order.postCode ?? '').trim(),
        Weight_KG: weightKg,
        Item_Count: String(quantity),
        Item_Description: desc,
        COD_VPP_Amount_BDT: String(codBdt),
        Declared_Value_BDT: String(declaredBdt),
        Special_Note: note,
      };
    }

    const geoDefaults = resolveGeoCourierDefaults({
      districtId: order.districtId,
      upazilaId: order.upazilaId,
      streetAddress: order.streetAddress,
      landmark: order.landmark,
      existingPostCode: order.postCode,
    });

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      status: order.status,
      courierProvider: order.courierProvider,
      createdAt: order.createdAt,
      isReady: readiness.isReady,
      missingFields: readiness.missingFields,
      missingCellKeys: readiness.missingCellKeys,
      values,
      editSeed: {
        orderId: order.id,
        orderNo: order.orderNo,
        customerName: order.customerName,
        customerPhone: order.customerPhone,
        districtId: order.districtId,
        upazilaId: order.upazilaId,
        streetAddress: order.streetAddress,
        landmark: order.landmark ?? '',
        postCode: order.postCode || geoDefaults.postCode,
        recipientCity: order.recipientCity || geoDefaults.recipientCity,
        recipientZone: order.recipientZone || geoDefaults.recipientZone,
        recipientArea: order.recipientArea || geoDefaults.recipientArea,
        pathaoItemType: effectiveItemType,
        pathaoStoreName: effectiveStoreName || 'Panchabindu',
        totalWeightGrams: weightGrams,
        specialInstruction: note,
        bdPostServiceType: effectiveBdPostType,
      },
    };
  });

  const readyCount = allPreviewRows.filter((r) => r.isReady).length;
  const flaggedCount = allPreviewRows.length - readyCount;
  const visibleRows = onlyFlagged ? allPreviewRows.filter((r) => !r.isReady) : allPreviewRows;

  const rowsForCsv = effectiveForceExport ? allPreviewRows : allPreviewRows.filter((r) => r.isReady);
  const csvLines = [
    headers.map((h) => escapeCsvCell(h)).join(','),
    ...rowsForCsv.map((row) => headers.map((h) => escapeCsvCell(row.values[h] ?? '')).join(',')),
  ];
  const csvContent = `\uFEFF${csvLines.join('\r\n')}`;
  const dateStamp = new Date().toISOString().slice(0, 10);
  const filename = `${format}-bulk-orders-${fromDate || 'all'}-to-${toDate || dateStamp}.csv`;

  return {
    format,
    headers,
    totalMatchedCount: allPreviewRows.length,
    readyCount,
    flaggedCount,
    exportedCount: rowsForCsv.length,
    previewRows: visibleRows,
    csvContent,
    filename,
  };
}
