// src/lib/storefront/phase6-storefront-engine.ts
// Phase 6 — Server-Side Storefront Completion Engine (Master Prompt Section 9):
//   - Re-exports pure client-safe facet/catalog/search functions from phase6-catalog-facets.ts
//   - Checkout Server-Side Price & Stock Revalidation + Multi-Vendor Fulfillment Summary
//   - Policy-Aware Customer Return Request Workflow (Ownership + Delivered-Only Guard)
//   - Verified Schema.org Product JSON-LD & Storefront Sitemap Generator

import {
  getPublicStorefrontData,
  readErpState,
  writeErpState,
} from '../db/repository';
import type { Poisha, StorefrontProductDTO } from '../../types/domain';
import { normalizeBdPhone } from '../validators';

export * from './phase6-catalog-facets';

export interface CheckoutFulfillmentGroupSummary {
  groupIndex: number;
  consignmentPartnerLabelBn: string;
  originRegionBn: string;
  qcDispatchHubBn: string;
  estimatedDispatchSlaBn: string;
  itemCount: number;
  totalUnits: number;
  totalWeightGrams: number;
  groupSubtotalPoisha: Poisha;
  items: Array<{
    variantId: string;
    productNameBn: string;
    variantTitleBn: string;
    publicSku: string;
    quantity: number;
    verifiedUnitSalePricePoisha: Poisha;
    lineSubtotalPoisha: Poisha;
  }>;
}

export interface CheckoutCartRevalidationResult {
  valid: boolean;
  priceChanged: boolean;
  stockInsufficient: boolean;
  errorBn?: string;
  verifiedSubtotalPoisha: Poisha;
  totalWeightGrams: number;
  fulfillmentGroups: CheckoutFulfillmentGroupSummary[];
  revalidatedItems: Array<{
    productId: string;
    variantId: string;
    productNameBn: string;
    variantTitleBn: string;
    publicSku: string;
    quantity: number;
    clientUnitPricePoisha?: Poisha;
    verifiedUnitSalePricePoisha: Poisha;
    availableStock: number;
    isStockSufficient: boolean;
    isPriceMatched: boolean;
  }>;
}

export type CustomerReturnReasonCode =
  | 'damaged_in_transit'
  | 'wrong_item_sent'
  | 'quality_defect'
  | 'size_or_variant_mismatch'
  | 'missing_parts';

export interface CustomerReturnRequestInput {
  orderNo: string;
  secureTrackingToken?: string;
  verifiedCustomerPhone?: string;
  reasonCode: CustomerReturnReasonCode;
  detailsBn: string;
  proofReferenceUrl?: string;
}

export interface CustomerReturnRequestResult {
  success: boolean;
  code?:
    | 'ORDER_NOT_FOUND'
    | 'UNAUTHORIZED_OWNERSHIP'
    | 'ORDER_NOT_DELIVERED'
    | 'ALREADY_RETURNED'
    | 'INVALID_REASON';
  errorBn?: string;
  orderNo?: string;
  newStatus?: string;
  returnPolicySummaryBn?: string;
}

/**
 * Server-side Checkout Cart Price & Stock Revalidation + Customer-Safe Multi-Vendor Fulfillment Summary.
 * Ensures client-submitted prices are never trusted and groups items by consignment origin without leaking vendor costs.
 */
export function revalidateCheckoutCartAndSummarizeFulfillment(
  items: Array<{
    variantId: string;
    quantity: number;
    clientUnitPricePoisha?: Poisha;
  }>
): CheckoutCartRevalidationResult {
  const state = readErpState();
  const revalidatedItems: CheckoutCartRevalidationResult['revalidatedItems'] =
    [];
  let priceChanged = false;
  let stockInsufficient = false;
  let verifiedSubtotalPoisha = 0;
  let totalWeightGrams = 0;

  const groupMap = new Map<
    string,
    {
      originRegionBn: string;
      items: CheckoutFulfillmentGroupSummary['items'];
      totalUnits: number;
      totalWeightGrams: number;
      groupSubtotalPoisha: Poisha;
    }
  >();

  for (const reqItem of items) {
    const qty = Math.max(1, Math.trunc(reqItem.quantity));
    let foundProd: (typeof state.products)[number] | undefined;
    let foundVar:
      | (typeof state.products)[number]['variants'][number]
      | undefined;

    for (const p of state.products) {
      if (p.status !== 'active') continue;
      const v = p.variants.find((vr) => vr.variantId === reqItem.variantId);
      if (v) {
        foundProd = p;
        foundVar = v;
        break;
      }
    }

    if (!foundProd || !foundVar) {
      stockInsufficient = true;
      revalidatedItems.push({
        productId: '',
        variantId: reqItem.variantId,
        productNameBn: 'অপ্রাপ্ত পণ্য',
        variantTitleBn: '',
        publicSku: 'UNKNOWN',
        quantity: qty,
        clientUnitPricePoisha: reqItem.clientUnitPricePoisha,
        verifiedUnitSalePricePoisha: 0,
        availableStock: 0,
        isStockSufficient: false,
        isPriceMatched: false,
      });
      continue;
    }

    const availableStock = Math.max(
      0,
      foundVar.stockOnHand - foundVar.stockReserved
    );
    const isStockSufficient = availableStock >= qty;
    if (!isStockSufficient) {
      stockInsufficient = true;
    }

    const verifiedUnitSalePricePoisha = foundVar.salePricePoisha;
    const isPriceMatched =
      reqItem.clientUnitPricePoisha === undefined ||
      reqItem.clientUnitPricePoisha === verifiedUnitSalePricePoisha;
    if (!isPriceMatched) {
      priceChanged = true;
    }

    const lineSubtotalPoisha = verifiedUnitSalePricePoisha * qty;
    verifiedSubtotalPoisha += lineSubtotalPoisha;
    totalWeightGrams += foundVar.weightGrams * qty;

    revalidatedItems.push({
      productId: foundProd.productId,
      variantId: foundVar.variantId,
      productNameBn: foundProd.nameBn,
      variantTitleBn: foundVar.titleBn,
      publicSku: foundVar.publicSku,
      quantity: qty,
      clientUnitPricePoisha: reqItem.clientUnitPricePoisha,
      verifiedUnitSalePricePoisha,
      availableStock,
      isStockSufficient,
      isPriceMatched,
    });

    // Group by vendorId internally, but expose ONLY customer-safe Consignment Origin & QC Hub metadata
    const originSpecVal =
      foundProd.specs.find(
        (s) =>
          s.labelEn.toLowerCase().includes('origin') ||
          s.labelBn.includes('উৎস') ||
          s.labelBn.includes('অঞ্চল')
      )?.valueBn || 'বাংলাদেশ আঞ্চলিক কারিগর কেন্দ্র';
    const existingGroup = groupMap.get(foundProd.vendorId) ?? {
      originRegionBn: originSpecVal,
      items: [],
      totalUnits: 0,
      totalWeightGrams: 0,
      groupSubtotalPoisha: 0,
    };

    existingGroup.items.push({
      variantId: foundVar.variantId,
      productNameBn: foundProd.nameBn,
      variantTitleBn: foundVar.titleBn,
      publicSku: foundVar.publicSku,
      quantity: qty,
      verifiedUnitSalePricePoisha,
      lineSubtotalPoisha,
    });
    existingGroup.totalUnits += qty;
    existingGroup.totalWeightGrams += foundVar.weightGrams * qty;
    existingGroup.groupSubtotalPoisha += lineSubtotalPoisha;
    groupMap.set(foundProd.vendorId, existingGroup);
  }

  const fulfillmentGroups: CheckoutFulfillmentGroupSummary[] = Array.from(
    groupMap.values()
  ).map((grp, idx) => ({
    groupIndex: idx + 1,
    consignmentPartnerLabelBn: `কনসাইনমেন্ট ফুলফিলমেন্ট লট #${idx + 1} (${grp.originRegionBn})`,
    originRegionBn: grp.originRegionBn,
    qcDispatchHubBn: 'পঞ্চগড় সেন্ট্রাল কিউসি ও ডিসপ্যাচ হাব, ঢাকা',
    estimatedDispatchSlaBn: 'কিউসি যাচাই শেষে ২৪–৪৮ ঘণ্টায় ডিসপ্যাচ',
    itemCount: grp.items.length,
    totalUnits: grp.totalUnits,
    totalWeightGrams: grp.totalWeightGrams,
    groupSubtotalPoisha: grp.groupSubtotalPoisha,
    items: grp.items,
  }));

  const valid =
    items.length > 0 && !stockInsufficient && revalidatedItems.length > 0;
  let errorBn: string | undefined;
  if (stockInsufficient) {
    errorBn =
      'কার্টের একটি বা একাধিক পণ্যের পর্যাপ্ত স্টক বর্তমানে নেই। অনুগ্রহ করে পরিমাণ সমন্বয় করুন।';
  } else if (priceChanged) {
    errorBn =
      'সার্ভার যাচাইয়ে পণ্যের সর্বশেষ হালনাগাদ মূল্য প্রয়োগ করা হয়েছে।';
  }

  return {
    valid,
    priceChanged,
    stockInsufficient,
    errorBn,
    verifiedSubtotalPoisha,
    totalWeightGrams,
    fulfillmentGroups,
    revalidatedItems,
  };
}

/**
 * Policy-Aware Customer Return Request Handler (Master Prompt Section 9.3 & 9.5):
 *   - Requires ownership proof (either matching `secureTrackingToken` OR OTP-verified `verifiedCustomerPhone`).
 *   - Enforces policy: Only `delivered` orders are eligible for a Return Request (`pending_confirmation` / `confirmed` use Cancellation instead).
 *   - Transitions order status to `return_initiated` so Admin 4-Way Return QC Engine can inspect and settle.
 */
export function submitCustomerReturnRequest(
  input: CustomerReturnRequestInput
): CustomerReturnRequestResult {
  const cleanOrderNo = input.orderNo.trim().toUpperCase();
  const cleanDetails = input.detailsBn.trim();

  if (!cleanDetails || cleanDetails.length < 5) {
    return {
      success: false,
      code: 'INVALID_REASON',
      errorBn:
        'রিটার্ন আবেদনের কারণ ও পণ্যের অবস্থার সংক্ষিপ্ত বিবরণ (কমপক্ষে ৫ অক্ষর) লিখুন।',
    };
  }

  const state = readErpState();
  const order = state.orders.find(
    (o) => o.orderNo.toUpperCase() === cleanOrderNo
  );

  if (!order) {
    return {
      success: false,
      code: 'ORDER_NOT_FOUND',
      errorBn: 'প্রদত্ত অর্ডার নম্বরটি খুঁজে পাওয়া যায়নি।',
    };
  }

  // Verify ownership via either secureTrackingToken OR verifiedCustomerPhone
  const tokenMatches =
    Boolean(input.secureTrackingToken) &&
    order.secureTrackingToken === input.secureTrackingToken?.trim();

  const normOrderPhone =
    normalizeBdPhone(order.customerPhone) ??
    order.customerPhone.replace(/\D/g, '').slice(-11);
  const normInputPhone = input.verifiedCustomerPhone
    ? (normalizeBdPhone(input.verifiedCustomerPhone) ??
      input.verifiedCustomerPhone.replace(/\D/g, '').slice(-11))
    : '';
  const phoneMatches =
    Boolean(normInputPhone) && normOrderPhone === normInputPhone;

  if (!tokenMatches && !phoneMatches) {
    return {
      success: false,
      code: 'UNAUTHORIZED_OWNERSHIP',
      errorBn:
        'অর্ডারটির মালিকানা যাচাই করা যায়নি। আপনার ভেরিফাইড অ্যাকাউন্ট অথবা ট্র্যাকিং টোকেন দিয়ে চেষ্টা করুন।',
    };
  }

  if (order.status === 'return_initiated' || order.status === 'returned') {
    return {
      success: false,
      code: 'ALREADY_RETURNED',
      errorBn:
        'এই অর্ডারের জন্য ইতিমধ্যে রিটার্ন রিকোয়েস্ট গ্রহণ করা হয়েছে।',
    };
  }

  if (order.status !== 'delivered') {
    return {
      success: false,
      code: 'ORDER_NOT_DELIVERED',
      errorBn:
        'রিটার্ন পলিসি অনুযায়ী শুধুমাত্র ডেলিভারি সম্পন্ন (Delivered) অর্ডারের জন্য রিটার্ন আবেদন করা যাবে। ডিসপ্যাচের আগের অর্ডার সরাসরি ক্যানসেল করা যায়।',
    };
  }

  order.status = 'return_initiated';
  order.nextBestAction = 'PROCESS_PENDING_RETURN';
  writeErpState(state);

  return {
    success: true,
    orderNo: order.orderNo,
    newStatus: 'return_initiated',
    returnPolicySummaryBn:
      'আপনার রিটার্ন আবেদন গৃহীত হয়েছে (স্ট্যাটাস: Return Initiated)। আমাদের ওয়্যারহাউস কিউসি টিম ৭ দিনের রিটার্ন পলিসি অনুযায়ী পণ্য যাচাই করে রিফান্ড/এক্সচেঞ্জ সম্পন্ন করবে।',
  };
}

/**
 * Generates verified Schema.org Product JSON-LD structured data for Product Detail Pages (Master Prompt Section 9.6).
 * Uses ONLY verified database fields; never fabricates ratings or leaks supplier cost/margin.
 */
export function buildVerifiedProductJsonLd(params: {
  product: StorefrontProductDTO;
  categoryNameEn?: string;
  brandNameEn: string;
  baseUrl?: string;
}): Record<string, unknown> {
  const {
    product,
    categoryNameEn,
    brandNameEn,
    baseUrl = 'https://panchagarh.com',
  } = params;
  const pricesBdt = product.variants.map((v) =>
    (v.salePricePoisha / 100).toFixed(2)
  );
  const minPriceBdt =
    product.variants.length > 0
      ? (
          Math.min(...product.variants.map((v) => v.salePricePoisha)) / 100
        ).toFixed(2)
      : '0.00';
  const maxPriceBdt =
    product.variants.length > 0
      ? (
          Math.max(...product.variants.map((v) => v.salePricePoisha)) / 100
        ).toFixed(2)
      : '0.00';
  const anyInStock = product.variants.some((v) => v.stockAvailable > 0);

  const jsonLd: Record<string, unknown> = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: product.nameBn,
    alternateName: product.nameEn,
    description: product.descriptionBn,
    sku: product.variants[0]?.publicSku ?? product.slug,
    image: product.images.length > 0 ? product.images : [],
    category: categoryNameEn ?? 'Consignment Goods',
    brand: {
      '@type': 'Brand',
      name: brandNameEn,
    },
    offers:
      product.variants.length > 1
        ? {
            '@type': 'AggregateOffer',
            priceCurrency: 'BDT',
            lowPrice: minPriceBdt,
            highPrice: maxPriceBdt,
            offerCount: pricesBdt.length,
            availability: anyInStock
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            url: `${baseUrl}/product/${product.slug}`,
          }
        : {
            '@type': 'Offer',
            priceCurrency: 'BDT',
            price: minPriceBdt,
            availability: anyInStock
              ? 'https://schema.org/InStock'
              : 'https://schema.org/OutOfStock',
            url: `${baseUrl}/product/${product.slug}`,
          },
  };

  if (product.reviewCount > 0 && product.ratingAvgBp > 0) {
    jsonLd.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: (product.ratingAvgBp / 100).toFixed(1),
      reviewCount: product.reviewCount,
      bestRating: '5',
      worstRating: '1',
    };
  }

  return jsonLd;
}

/**
 * Generates dynamic Storefront Sitemap entries from real active categories and products (Master Prompt Section 9.6).
 */
export function buildStorefrontSitemapEntries(baseUrl: string): Array<{
  url: string;
  lastModified: Date;
  changeFrequency: 'daily' | 'weekly' | 'monthly';
  priority: number;
}> {
  const { categories, products } = getPublicStorefrontData();
  const now = new Date();

  const staticRoutes = [
    { url: `${baseUrl}/`, changeFrequency: 'daily' as const, priority: 1.0 },
    {
      url: `${baseUrl}/shop`,
      changeFrequency: 'daily' as const,
      priority: 0.9,
    },
    {
      url: `${baseUrl}/categories`,
      changeFrequency: 'weekly' as const,
      priority: 0.85,
    },
    {
      url: `${baseUrl}/search`,
      changeFrequency: 'weekly' as const,
      priority: 0.75,
    },
    {
      url: `${baseUrl}/delivery-Time-calculator`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    },
    {
      url: `${baseUrl}/contact`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    },
  ].map((r) => ({ ...r, lastModified: now }));

  const categoryRoutes = categories
    .filter((c) => c.isActive)
    .map((c) => ({
      url: `${baseUrl}/category/${c.slug}`,
      lastModified: now,
      changeFrequency: 'weekly' as const,
      priority: 0.8,
    }));

  const productRoutes = products.map((p) => ({
    url: `${baseUrl}/product/${p.slug}`,
    lastModified: now,
    changeFrequency: 'daily' as const,
    priority: 0.85,
  }));

  return [...staticRoutes, ...categoryRoutes, ...productRoutes];
}
