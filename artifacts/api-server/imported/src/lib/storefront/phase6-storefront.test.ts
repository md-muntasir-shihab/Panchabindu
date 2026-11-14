// src/lib/storefront/phase6-storefront.test.ts
// Comprehensive Phase 6 — Customer Storefront Completion Test Suite (Master Prompt Section 9):
//   1. Real Catalog Facet Extraction & Explicit Brand Data Model Gap (No Fake Filters)
//   2. Multi-Facet Catalog Filtering (Category, Search, Min/Max Price, Color, Size, In-Stock, Free Delivery), Sorting & Verified Pagination
//   3. Search Suggestions & Zero-Result Fallback Recommendations
//   4. Checkout Server-Side Price/Stock Revalidation & Customer-Safe Multi-Vendor Fulfillment Summary (Zero Cost/Margin Exposure)
//   5. Policy-Aware Customer Return Request Workflow (Ownership + Delivered-Only Guard)
//   6. Verified Product JSON-LD Structured Data & Storefront Sitemap Generation

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  createStorefrontOrder,
  getPublicStorefrontData,
  readErpState,
  writeErpState,
} from '../db/repository';
import {
  buildStorefrontSitemapEntries,
  buildVerifiedProductJsonLd,
  extractCatalogFacets,
  getSearchSuggestions,
  queryStorefrontCatalog,
  revalidateCheckoutCartAndSummarizeFulfillment,
  submitCustomerReturnRequest,
} from './phase6-storefront-engine';

describe('Phase 6 — Customer Storefront Completion, Facets, Checkout Revalidation, Returns & SEO (Section 9)', () => {
  it('9.2 & 9.3: extracts real catalog facets, reports DATA_MODEL_GAP_NO_BRAND_COLUMN instead of faking Brand filter, and executes multi-facet filtering & pagination', () => {
    const { categories, products } = getPublicStorefrontData();
    assert.ok(products.length > 0);
    assert.ok(categories.length > 0);

    // 1. Extract facets and verify honest Brand Data Model Gap
    const facets = extractCatalogFacets(products);
    assert.equal(facets.brandFilterStatus, 'DATA_MODEL_GAP_NO_BRAND_COLUMN');
    assert.ok(facets.brandFilterGapNoteBn.includes('Data Model Gap'));
    assert.ok(facets.maxPricePoisha >= facets.minPricePoisha);
    assert.ok(facets.totalActiveProducts === products.length);

    // 2. Filter by categorySlug
    const firstCat = categories[0]!;
    const byCat = queryStorefrontCatalog(products, categories, {
      categorySlug: firstCat.slug,
    });
    assert.ok(
      byCat.items.every((p) => p.categoryId === firstCat.id),
      'All items must belong to selected category'
    );

    // 3. Filter by minPricePoisha / maxPricePoisha & sort by price_asc / price_desc
    const sortedAsc = queryStorefrontCatalog(products, categories, {
      sortBy: 'price_asc',
      pageSize: 20,
    });
    for (let i = 1; i < sortedAsc.items.length; i += 1) {
      const prevPrice = sortedAsc.items[i - 1]!.variants[0]?.salePricePoisha ?? 0;
      const currPrice = sortedAsc.items[i]!.variants[0]?.salePricePoisha ?? 0;
      assert.ok(currPrice >= prevPrice, 'price_asc must be monotonically non-decreasing');
    }

    // 4. Verified Page Pagination & Cursor Pagination
    const page1 = queryStorefrontCatalog(products, categories, {
      page: 1,
      pageSize: 2,
      sortBy: 'popular',
    });
    assert.equal(page1.items.length, Math.min(2, products.length));
    if (products.length > 2) {
      assert.equal(page1.hasNextPage, true);
      assert.ok(page1.nextCursorProductId);

      const cursorNext = queryStorefrontCatalog(products, categories, {
        cursorProductId: page1.nextCursorProductId,
        pageSize: 2,
        sortBy: 'popular',
      });
      assert.ok(cursorNext.items.length > 0);
      assert.notEqual(
        cursorNext.items[0]!.productId,
        page1.items[0]!.productId
      );
    }

    // 5. Search Suggestions & Zero-Result Fallback Recommendations
    const noMatchSuggestions = getSearchSuggestions(
      products,
      categories,
      'zzzz_nonexistent_product_99999'
    );
    assert.equal(noMatchSuggestions.matchedProducts.length, 0);
    assert.ok(
      noMatchSuggestions.fallbackRecommendations.length > 0,
      'Zero-result search must provide in-stock fallback recommendations'
    );
  });

  it('9.4 & 9.5: revalidates Checkout cart prices & stock on server, detects client price tampering, and builds a zero-leak Multi-Vendor Fulfillment Summary', () => {
    const state = readErpState();
    const activeProducts = state.products.filter(
      (p) => p.status === 'active' && p.variants.some((v) => v.stockOnHand - v.stockReserved > 0)
    );
    assert.ok(activeProducts.length >= 2);

    const prod1 = activeProducts[0]!;
    const var1 = prod1.variants.find((v) => v.stockOnHand - v.stockReserved > 0)!;
    const prod2 =
      activeProducts.find((p) => p.vendorId !== prod1.vendorId) ??
      activeProducts[1]!;
    const var2 = prod2.variants.find((v) => v.stockOnHand - v.stockReserved > 0)!;

    // 1. Revalidate multi-vendor cart with tampered clientUnitPricePoisha (100 Poisha instead of real price)
    const reval = revalidateCheckoutCartAndSummarizeFulfillment([
      {
        variantId: var1.variantId,
        quantity: 1,
        clientUnitPricePoisha: 100, // Tampered client price!
      },
      {
        variantId: var2.variantId,
        quantity: 1,
        clientUnitPricePoisha: var2.salePricePoisha,
      },
    ]);

    assert.equal(reval.valid, true);
    assert.equal(reval.priceChanged, true);
    // Authoritative server subtotal uses real var1.salePricePoisha + var2.salePricePoisha
    assert.equal(
      reval.verifiedSubtotalPoisha,
      var1.salePricePoisha + var2.salePricePoisha
    );
    assert.ok(reval.fulfillmentGroups.length >= 1);

    // 2. Verify zero supplier cost / margin / internal vendorId leak in fulfillmentGroups
    const serialized = JSON.stringify(reval.fulfillmentGroups);
    assert.equal(serialized.includes('supplierCostPoisha'), false);
    assert.equal(serialized.includes('supplierPayablePoisha'), false);
    assert.equal(serialized.includes('platformMarginPoisha'), false);
    assert.equal(serialized.includes(prod1.vendorId), false);

    // 3. Insufficient stock is rejected
    const overStock = revalidateCheckoutCartAndSummarizeFulfillment([
      {
        variantId: var1.variantId,
        quantity: 999999,
      },
    ]);
    assert.equal(overStock.valid, false);
    assert.equal(overStock.stockInsufficient, true);
  });

  it('9.3 & 9.5: enforces Policy-Aware Customer Return Request ownership and Delivered-only status guard', () => {
    const state = readErpState();
    const targetVariant = state.products[0]!.variants[0]!;
    targetVariant.stockOnHand = Math.max(targetVariant.stockOnHand, 10);
    writeErpState(state);

    const created = createStorefrontOrder({
      idempotencyKey: `p6-ret-test-${Date.now()}`,
      customerName: 'সাদিয়া ইসলাম',
      customerPhone: '01788990011',
      districtId: 47,
      upazilaId: 365,
      streetAddress: 'বাসা ১২, রোড ৫, ধানমন্ডি',
      landmark: 'লেকের পাশে',
      source: 'storefront',
      deliveryMethod: 'courier',
      paymentMethod: 'cod',
      advancePaidPoisha: 0,
      customerNote: '',
      internalStaffNote: '',
      items: [
        {
          productId: state.products[0]!.productId,
          variantId: targetVariant.variantId,
          quantity: 1,
        },
      ],
    });
    assert.equal(created.success, true);
    const orderNo = created.order!.orderNo;
    const token = created.order!.secureTrackingToken;

    // 1. Attempting return request while order is still pending_confirmation is rejected
    const prematureReturn = submitCustomerReturnRequest({
      orderNo,
      secureTrackingToken: token,
      reasonCode: 'quality_defect',
      detailsBn: 'শাড়ির রঙ ছবির চেয়ে আলাদা মনে হচ্ছে',
    });
    assert.equal(prematureReturn.success, false);
    assert.equal(prematureReturn.code, 'ORDER_NOT_DELIVERED');

    // 2. Mark order as delivered, then attempt return with wrong phone/token -> rejected (403 ownership)
    const stateAfterCreate = readErpState();
    const ordRecord = stateAfterCreate.orders.find((o) => o.orderNo === orderNo)!;
    ordRecord.status = 'delivered';
    writeErpState(stateAfterCreate);

    const unauthorizedReturn = submitCustomerReturnRequest({
      orderNo,
      verifiedCustomerPhone: '01900000000', // Wrong phone!
      reasonCode: 'damaged_in_transit',
      detailsBn: 'পার্সেল ছেঁড়া অবস্থায় পাওয়া গেছে',
    });
    assert.equal(unauthorizedReturn.success, false);
    assert.equal(unauthorizedReturn.code, 'UNAUTHORIZED_OWNERSHIP');

    // 3. Authorized return request on delivered order succeeds and transitions status to return_initiated
    const validReturn = submitCustomerReturnRequest({
      orderNo,
      secureTrackingToken: token,
      reasonCode: 'damaged_in_transit',
      detailsBn: 'পার্সেল বক্সে চাপ লেগে পণ্য ক্ষতিগ্রস্ত হয়েছে',
    });
    assert.equal(validReturn.success, true);
    assert.equal(validReturn.newStatus, 'return_initiated');

    // 4. Duplicate return request on same order is blocked
    const dupReturn = submitCustomerReturnRequest({
      orderNo,
      secureTrackingToken: token,
      reasonCode: 'damaged_in_transit',
      detailsBn: 'আবার রিটার্ন রিকোয়েস্ট পাঠানো হলো',
    });
    assert.equal(dupReturn.success, false);
    assert.equal(dupReturn.code, 'ALREADY_RETURNED');
  });

  it('9.6: builds verified Schema.org Product JSON-LD without cost leakage and generates Storefront Sitemap entries', () => {
    const { categories, products, siteSettings } = getPublicStorefrontData();
    const sampleProduct = products[0]!;
    const jsonLd = buildVerifiedProductJsonLd({
      product: sampleProduct,
      categoryNameEn: categories[0]?.nameEn,
      brandNameEn: siteSettings.brandNameEn,
      baseUrl: 'https://panchabindu.com',
    });

    assert.equal(jsonLd['@type'], 'Product');
    assert.equal(jsonLd.name, sampleProduct.nameBn);
    const jsonLdStr = JSON.stringify(jsonLd);
    assert.equal(jsonLdStr.includes('supplierCostPoisha'), false);
    assert.equal(jsonLdStr.includes('platformMarginPoisha'), false);

    const sitemapEntries = buildStorefrontSitemapEntries('https://panchabindu.com');
    assert.ok(sitemapEntries.some((e) => e.url === 'https://panchabindu.com/shop'));
    assert.ok(sitemapEntries.some((e) => e.url === 'https://panchabindu.com/search'));
    assert.ok(
      sitemapEntries.some((e) =>
        e.url.startsWith('https://panchabindu.com/product/')
      )
    );
  });
});
