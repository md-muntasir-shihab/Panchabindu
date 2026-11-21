import test from 'node:test';
import assert from 'node:assert/strict';

const BASE = process.env.TEST_BASE_URL || 'http://127.0.0.1:3000';

async function getAdminContext() {
  const res = await fetch(`${BASE}/api/admin/workspace`, {
    headers: { Origin: BASE },
  });
  assert.equal(res.status, 200, `Expected 200 from GET /api/admin/workspace, got ${res.status}`);
  const data = await res.json();
  assert.equal(data.authorized, true, 'Admin workspace must be authorized in preview');
  assert.ok(Array.isArray(data.products) && data.products.length > 0, 'Expected at least 1 product');
  assert.ok(Array.isArray(data.categories) && data.categories.length > 0, 'Expected at least 1 category');
  assert.ok(Array.isArray(data.vendors) && data.vendors.length > 0, 'Expected at least 1 vendor');
  const setCookie = res.headers.get('set-cookie') || '';
  const cookiePair = setCookie.split(';')[0] || '';
  return {
    csrfToken: data.csrfToken || '',
    cookie: cookiePair,
    products: data.products,
    categories: data.categories,
    vendors: data.vendors,
    reviews: data.moderatedReviews || [],
  };
}

function buildHeaders(ctx, contentType = 'application/json') {
  const headers = { Origin: BASE };
  if (contentType) headers['Content-Type'] = contentType;
  if (ctx.csrfToken) headers['x-csrf-token'] = ctx.csrfToken;
  if (ctx.cookie) headers['Cookie'] = ctx.cookie;
  return headers;
}

async function postWorkspace(ctx, body) {
  const res = await fetch(`${BASE}/api/admin/workspace`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify(body),
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, headers: res.headers, data };
}

function buildProductPayloadFromExisting(prod, overrides = {}) {
  return {
    productId: prod.productId,
    vendorId: prod.vendorId,
    categoryId: prod.categoryId,
    nameBn: prod.nameBn,
    nameEn: prod.nameEn,
    descriptionBn: prod.descriptionBn,
    descriptionEn: prod.descriptionEn || prod.descriptionBn,
    isFeatured: prod.isFeatured,
    isFreeDelivery: prod.isFreeDelivery,
    requiresAdvanceCourierCharge: Boolean(prod.requiresAdvanceCourierCharge),
    customAdvanceDepositPoisha: prod.customAdvanceDepositPoisha ?? 0,
    lowStockThreshold: prod.lowStockThreshold,
    leadTimeDays: prod.leadTimeDays,
    status: prod.status,
    images: [...(prod.images || [])],
    specs: [...(prod.specs || [])],
    variants: prod.variants.map((v) => ({
      variantId: v.variantId,
      internalVendorSku: v.internalVendorSku,
      publicSku: v.publicSku,
      titleBn: v.titleBn,
      titleEn: v.titleEn,
      attributes: v.attributes || {},
      imageUrl: v.imageUrl || null,
      supplierCostPoisha: v.supplierCostPoisha,
      supplierProfitPoisha: v.supplierProfitPoisha,
      supplierPayablePoisha: v.supplierPayablePoisha,
      platformMarginPoisha: v.platformMarginPoisha,
      salePricePoisha: v.salePricePoisha,
      mrpPricePoisha: v.compareAtPricePoisha ?? v.salePricePoisha,
      stockOnHand: v.stockOnHand,
      weightGrams: v.weightGrams,
      isActive: v.isActive !== false,
    })),
    ...overrides,
  };
}

test('Product Studio API: security headers and CORS non-reflection', async () => {
  const res = await fetch(`${BASE}/api/admin/workspace`, {
    headers: { Origin: 'https://evil-catalog-attacker.example' },
  });
  assert.equal(res.status, 200);
  const acao = res.headers.get('access-control-allow-origin');
  assert.notEqual(acao, '*');
  assert.notEqual(acao, 'https://evil-catalog-attacker.example');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});

test('Product Studio API: upsert_product rejects tampered 3-tier pricing, unsafe image URLs, overlong fields, and direct stock edit on existing variant', async () => {
  const ctx = await getAdminContext();
  const sample = ctx.products[0];

  // 1. Tampered 3-tier math (salePricePoisha does not equal cost + profit + margin)
  const badMath = buildProductPayloadFromExisting(sample);
  badMath.variants[0] = {
    ...badMath.variants[0],
    salePricePoisha: badMath.variants[0].supplierCostPoisha - 100,
  };
  const rMath = await postWorkspace(ctx, { operation: 'upsert_product', product: badMath });
  assert.ok(rMath.status >= 400 && rMath.status < 500, `Expected 4xx for invalid 3-tier math, got ${rMath.status}`);

  // 2. Unsafe javascript: image URL
  const badImg = buildProductPayloadFromExisting(sample, {
    images: ['javascript:alert(1)'],
  });
  const rImg = await postWorkspace(ctx, { operation: 'upsert_product', product: badImg });
  assert.ok(rImg.status >= 400 && rImg.status < 500, `Expected 4xx for javascript: URL, got ${rImg.status}`);

  // 3. Overlong product name (> 160 chars)
  const overlong = buildProductPayloadFromExisting(sample, {
    nameEn: 'A'.repeat(165),
  });
  const rLen = await postWorkspace(ctx, { operation: 'upsert_product', product: overlong });
  assert.equal(rLen.status, 400, `Expected 400 for overlong nameEn, got ${rLen.status}`);

  // 4. Direct stockOnHand tampering on an existing variant
  const stockTamper = buildProductPayloadFromExisting(sample);
  stockTamper.variants[0] = {
    ...stockTamper.variants[0],
    stockOnHand: stockTamper.variants[0].stockOnHand + 50,
  };
  const rStock = await postWorkspace(ctx, { operation: 'upsert_product', product: stockTamper });
  assert.ok(
    rStock.status >= 400 && rStock.status < 500,
    `Expected 4xx when directly editing stockOnHand on existing variant, got ${rStock.status}`
  );
});

test('Product Studio API: delete_product ALWAYS soft-archives (never hard-deletes) and preserves product history cleanly', async () => {
  const ctx = await getAdminContext();
  const target = ctx.products[ctx.products.length - 1];
  const originalStatus = target.status;
  const originalFeatured = target.isFeatured;
  const originalCount = ctx.products.length;

  try {
    const archiveRes = await postWorkspace(ctx, {
      operation: 'delete_product',
      productId: target.productId,
    });
    assert.equal(archiveRes.status, 200, `Expected 200 on archive, got ${archiveRes.status}`);
    assert.equal(archiveRes.data.success, true);
    assert.equal(archiveRes.data.archived, true, 'Response must explicitly confirm archived=true');

    // Verify product STILL exists in workspace with status='archived' and isFeatured=false
    const afterCtx = await getAdminContext();
    assert.equal(
      afterCtx.products.length,
      originalCount,
      'Soft-archive must NEVER hard-delete or shrink catalog product count'
    );
    const archivedProd = afterCtx.products.find((p) => p.productId === target.productId);
    assert.ok(archivedProd, 'Archived product must still exist in catalog');
    assert.equal(archivedProd.status, 'archived');
    assert.equal(archivedProd.isFeatured, false);
  } finally {
    // Always restore original status & featured flag so storefront stays pristine
    const restorePayload = buildProductPayloadFromExisting(target, {
      status: originalStatus,
      isFeatured: originalFeatured,
    });
    const restoreRes = await postWorkspace(ctx, {
      operation: 'upsert_product',
      product: restorePayload,
    });
    assert.equal(restoreRes.status, 200, 'Failed to restore product status after soft-archive test');
  }
});

test('Product Studio API: upsert_category enforces unique slug, safe iconName, sortOrder bounds, and restores cleanly', async () => {
  const ctx = await getAdminContext();
  const existing = ctx.categories[0];

  // Duplicate slug collision on create (no id, same English name as existing category)
  const dupRes = await postWorkspace(ctx, {
    operation: 'upsert_category',
    category: {
      nameBn: 'ডুপ্লিকেট টেস্ট ক্যাটাগরি',
      nameEn: existing.nameEn,
      descriptionBn: 'টেস্ট বিবরণ',
      descriptionEn: 'Test description',
      iconName: 'Package',
      sortOrder: 99,
      isActive: true,
    },
  });
  assert.ok(
    dupRes.status >= 400 && dupRes.status < 500,
    `Expected 4xx on duplicate category slug, got ${dupRes.status}`
  );

  // Invalid iconName with HTML/script characters
  const badIcon = await postWorkspace(ctx, {
    operation: 'upsert_category',
    category: {
      id: existing.id,
      nameBn: existing.nameBn,
      nameEn: existing.nameEn,
      descriptionBn: existing.descriptionBn,
      descriptionEn: existing.descriptionEn,
      iconName: '<script>x</script>',
      sortOrder: existing.sortOrder,
      isActive: existing.isActive,
    },
  });
  assert.equal(badIcon.status, 400, `Expected 400 on invalid iconName, got ${badIcon.status}`);

  // Out-of-range sortOrder
  const badSort = await postWorkspace(ctx, {
    operation: 'upsert_category',
    category: {
      id: existing.id,
      nameBn: existing.nameBn,
      nameEn: existing.nameEn,
      descriptionBn: existing.descriptionBn,
      descriptionEn: existing.descriptionEn,
      iconName: existing.iconName,
      sortOrder: 99999,
      isActive: existing.isActive,
    },
  });
  assert.equal(badSort.status, 400, `Expected 400 on out-of-range sortOrder, got ${badSort.status}`);

  // Valid update round-trip & restore
  const saveRes = await postWorkspace(ctx, {
    operation: 'upsert_category',
    category: {
      id: existing.id,
      nameBn: existing.nameBn,
      nameEn: existing.nameEn,
      descriptionBn: existing.descriptionBn,
      descriptionEn: existing.descriptionEn || existing.descriptionBn,
      iconName: existing.iconName || 'Package',
      sortOrder: existing.sortOrder,
      isActive: existing.isActive,
    },
  });
  assert.equal(saveRes.status, 200);
  assert.equal(saveRes.data.success, true);
});

test('Product Studio API: /api/catalog/import validates CSV rows, rejects bad previewHash on commit, and previews without mutating DB', async () => {
  const ctx = await getAdminContext();
  const vendor = ctx.vendors[0];
  const category = ctx.categories[0];
  const initialCount = ctx.products.length;

  const validCsv = [
    'vendor_id,category_id,name_bn,name_en,public_sku,variant_bn,variant_en,supplier_cost_bdt,supplier_profit_bdt,sale_price_bdt,weight_grams',
    `${vendor.vendorId},${category.id},টেস্ট ড্রাফট পণ্য,Test Draft Preview Product,BG-PREVIEW-9991,স্ট্যান্ডার্ড,Standard,500,100,850,400`,
  ].join('\n');

  const previewRes = await fetch(`${BASE}/api/catalog/import`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({ mode: 'preview', csv: validCsv }),
  });
  assert.equal(previewRes.status, 200, `Expected 200 for valid CSV preview, got ${previewRes.status}`);
  const previewData = await previewRes.json();
  assert.equal(previewData.success, true);
  assert.equal(previewData.errors.length, 0);
  assert.equal(previewData.items.length, 1);
  assert.ok(previewData.previewHash, 'Preview must return previewHash');

  // Preview must not have mutated product catalog
  const afterPreview = await getAdminContext();
  assert.equal(afterPreview.products.length, initialCount);

  // Commit with forged/mismatched previewHash must fail
  const forgedCommit = await fetch(`${BASE}/api/catalog/import`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({
      mode: 'commit',
      csv: validCsv,
      previewHash: '0'.repeat(64),
    }),
  });
  assert.ok(
    forgedCommit.status >= 400 && forgedCommit.status < 500,
    `Expected 4xx on mismatched previewHash commit, got ${forgedCommit.status}`
  );

  // Unknown vendor/category + duplicate SKU should report row errors cleanly
  const existingSku = ctx.products[0].variants[0].publicSku;
  const badCsv = [
    'vendor_id,category_id,name_bn,name_en,public_sku,variant_bn,variant_en,supplier_cost_bdt,supplier_profit_bdt,sale_price_bdt,weight_grams',
    `unknown-vendor,unknown-cat,খারাপ পণ্য,Bad Row,${existingSku},ভ্যারিয়েন্ট,Variant,500,100,850,400`,
  ].join('\n');
  const badPreview = await fetch(`${BASE}/api/catalog/import`, {
    method: 'POST',
    headers: buildHeaders(ctx),
    body: JSON.stringify({ mode: 'preview', csv: badCsv }),
  });
  assert.equal(badPreview.status, 200);
  const badData = await badPreview.json();
  assert.ok(badData.errors.length > 0, 'Invalid CSV row must report validation errors');
});

test('Product Studio API: /api/media rejects non-image upload safely without leaking internals', async () => {
  const ctx = await getAdminContext();
  const form = new FormData();
  form.set('productId', ctx.products[0].productId);
  form.set('file', new Blob(['<svg onload=alert(1)></svg>'], { type: 'image/svg+xml' }), 'evil.svg');

  const res = await fetch(`${BASE}/api/media`, {
    method: 'POST',
    headers: buildHeaders(ctx, null),
    body: form,
  });
  assert.ok(
    [400, 415, 422, 503].includes(res.status),
    `Expected 400/415/422/503 for SVG upload rejection or unconfigured storage, got ${res.status}`
  );
  const text = await res.text();
  assert.equal(text.includes('stack'), false, 'Error response must not leak stack trace');
});

test('Product Studio API: moderate_product_review validates decision enum and round-trips cleanly', async () => {
  const ctx = await getAdminContext();
  if (ctx.reviews.length === 0) return;

  const target = ctx.reviews[0];
  const badDecision = await postWorkspace(ctx, {
    operation: 'moderate_product_review',
    reviewId: target.reviewId,
    decision: 'deleted_hack',
  });
  assert.equal(badDecision.status, 400);

  const original = target.moderationStatus;
  const nextStatus = original === 'approved' ? 'rejected' : 'approved';
  try {
    const toggleRes = await postWorkspace(ctx, {
      operation: 'moderate_product_review',
      reviewId: target.reviewId,
      decision: nextStatus,
    });
    assert.equal(toggleRes.status, 200);
    assert.equal(toggleRes.data.success, true);
  } finally {
    if (original === 'approved' || original === 'rejected') {
      await postWorkspace(ctx, {
        operation: 'moderate_product_review',
        reviewId: target.reviewId,
        decision: original,
      });
    }
  }
});
