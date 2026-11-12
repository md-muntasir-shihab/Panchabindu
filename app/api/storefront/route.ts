// app/api/storefront/route.ts
// Public Storefront Catalog, Config & Delivery Quote API (Section 21.1 & docs/api/api-contract.md)
// Enforces:
//   - Standard response envelope { success, data, request_id }
//   - Strict zero-leak StorefrontProductDTO (never exposes vendorId, supplierCostPoisha, supplierProfitPoisha, or platformMarginPoisha)
//   - Integer Poisha string (price_paisa) + numeric Poisha + currency: "BDT"

import { NextRequest, NextResponse } from 'next/server';
import {
  getPublicProductBySlug,
  getPublicStorefrontData,
  sanitizeSiteSettingsForPublic,
} from '@/src/lib/db/repository';
import {
  BD_DISTRICTS,
  getDistrictById,
  getDistrictDeliveryRates,
  getUpazilasByDistrict,
} from '@/src/lib/geo/bd-geocode';
import { calculateDeliveryCharge } from '@/src/lib/money';

function createRequestId(): string {
  return `req_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export async function GET(req: NextRequest) {
  const requestId = createRequestId();
  const { searchParams } = new URL(req.url);
  const slug = searchParams.get('slug');
  const categorySlug = searchParams.get('category');
  const quoteDistrictId = searchParams.get('districtId');
  const quoteWeightGrams = Number(searchParams.get('weightGrams') || '500');
  const quoteSubtotalPoisha = Number(searchParams.get('subtotalPoisha') || '0');
  const quoteMethod =
    searchParams.get('deliveryMethod') === 'post_office'
      ? 'post_office'
      : 'courier';

  // 1. Single Product Lookup by Slug
  if (slug) {
    const { siteSettings, categories, product, reviews, relatedProducts } =
      getPublicProductBySlug(slug);
    if (!product) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'PRODUCT_NOT_FOUND',
            message: 'পণ্যটি খুঁজে পাওয়া যায়নি।',
            field_errors: {},
          },
          request_id: requestId,
        },
        { status: 404 }
      );
    }

    const minVariantPrice = Math.min(
      ...product.variants.map((v) => v.salePricePoisha)
    );

    return NextResponse.json({
      success: true,
      data: {
        currency: 'BDT',
        product: {
          ...product,
          price_paisa: String(minVariantPrice),
          currency: 'BDT',
        },
        reviews,
        relatedProducts,
        categories,
        siteSettings: sanitizeSiteSettingsForPublic(siteSettings),
      },
      request_id: requestId,
    });
  }

  // 2. Delivery Quote Calculation (if districtId is queried)
  const { siteSettings, categories, products } = getPublicStorefrontData();

  if (quoteDistrictId) {
    const distIdNum = Number(quoteDistrictId);
    const district = getDistrictById(distIdNum);
    if (!district) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: 'INVALID_DISTRICT',
            message: 'নির্বাচিত জেলা সঠিক নয়।',
            field_errors: { districtId: 'Invalid district ID' },
          },
          request_id: requestId,
        },
        { status: 400 }
      );
    }

    const rates = getDistrictDeliveryRates(
      district.id,
      siteSettings.bdPostDefaultPerKgPoisha
    );
    const quote = calculateDeliveryCharge({
      method: quoteMethod,
      totalWeightGrams: Math.max(100, quoteWeightGrams),
      orderSubtotalPoisha: Math.max(0, quoteSubtotalPoisha),
      freeDeliveryThresholdPoisha: siteSettings.freeDeliveryThresholdPoisha,
      isGlobalFreeDelivery: siteSettings.globalFreeDelivery,
      isAllItemsFreeDelivery: false,
      courierBaseRate1KgPoisha: rates.base1KgPoisha,
      courierExtraPerKgPoisha: rates.extraPerKgPoisha,
      bdPostPerKgPoisha: rates.bdPostPerKgPoisha,
    });

    return NextResponse.json({
      success: true,
      data: {
        currency: 'BDT',
        district,
        upazilas: getUpazilasByDistrict(district.id),
        deliveryQuote: {
          ...quote,
          final_charge_paisa: String(quote.finalChargePoisha),
        },
      },
      request_id: requestId,
    });
  }

  // 3. Full Storefront Config, Categories & Zero-Leak Catalog
  let filteredProducts = products;
  if (categorySlug) {
    const targetCategory = categories.find(
      (c) => c.slug === categorySlug || c.id === categorySlug
    );
    if (targetCategory) {
      filteredProducts = products.filter(
        (p) => p.categoryId === targetCategory.id
      );
    }
  }

  const enrichedProducts = filteredProducts.map((p) => {
    const minPrice =
      p.variants.length > 0
        ? Math.min(...p.variants.map((v) => v.salePricePoisha))
        : 0;
    return {
      ...p,
      price_paisa: String(minPrice),
      currency: 'BDT',
    };
  });

  return NextResponse.json({
    success: true,
    data: {
      currency: 'BDT',
      siteSettings: sanitizeSiteSettingsForPublic(siteSettings),
      categories,
      products: enrichedProducts,
      districtsCount: BD_DISTRICTS.length,
    },
    request_id: requestId,
  });
}
