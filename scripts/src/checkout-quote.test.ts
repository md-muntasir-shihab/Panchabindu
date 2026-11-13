import assert from 'node:assert/strict';
import test from 'node:test';
import { getPublicCheckoutData, createStorefrontOrder, readErpState, writeErpState } from '../../artifacts/api-server/imported/src/lib/db/repository';
import { getUpazilasByDistrict } from '../../artifacts/api-server/imported/src/lib/geo/bd-geocode';
import { ApiRequest } from '../../artifacts/api-server/imported/src/lib/http';
import { pageData } from '../../artifacts/api-server/src/routes/page-data';

test('checkout quote equals order totals across districts, weights, discounts and free delivery', () => {
  const original = structuredClone(readErpState());
  try {
    for (const districtId of [47, 1]) {
      for (const method of ['courier', 'post_office'] as const) {
        for (const scenario of ['normal', 'weight', 'promo', 'threshold', 'global-free', 'product-free', 'advance'] as const) {
          const state = structuredClone(original);
          state.orders = [];
          state.orderLines = [];
          state.idempotencyKeys = {};
          state.siteSettings.globalFreeDelivery = scenario === 'global-free';
          state.siteSettings.freeDeliveryThresholdPoisha = scenario === 'threshold' ? 1 : 100_000_000;
          const product = state.products.find(p => p.status === 'active')!;
          product.isFreeDelivery = scenario === 'product-free';
          product.requiresAdvanceCourierCharge = scenario === 'advance';
          product.customAdvanceDepositPoisha = 1234;
          const variant = product.variants[0];
          variant.weightGrams = scenario === 'weight' ? 2501 : 550;
          variant.stockAvailable = variant.stockOnHand = 100;
          variant.stockReserved = 0;
          writeErpState(state);
          const items = [{ productId: product.productId, variantId: variant.variantId, quantity: 2 }];
          const promoCode = scenario === 'promo' ? 'EID10' : undefined;
          const before = structuredClone(readErpState());
          const result = getPublicCheckoutData({ districtId, items, promoCode });
          const quote = result.quote!;
          assert.deepEqual(readErpState(), before, 'quote must not reserve stock or write orders');
          const delivery = quote.deliveryQuotes.find(q => q.method === method)!;
          const order = createStorefrontOrder({
            idempotencyKey: `quote-${districtId}-${method}-${scenario}`,
            customerName: 'Quote Fixture', customerPhone: '01700000000',
            districtId, upazilaId: getUpazilasByDistrict(districtId)[0].id,
            streetAddress: 'House 12 Road 7 Area Test', landmark: 'Test school',
            source: 'storefront', deliveryMethod: method, paymentMethod: 'cod',
            advancePaidPoisha: 0, promoCode, customerNote: '', internalStaffNote: '', items,
          });
          assert.equal(order.success, true, order.errorBn);
          assert.equal(order.order!.deliveryChargePoisha, delivery.finalChargePoisha);
          assert.equal(order.order!.totalPayablePoisha, delivery.totalPayablePoisha);
          assert.equal(order.order!.subtotalPoisha, quote.subtotalPoisha);
          assert.equal(quote.hasItemRequiringAdvance, scenario === 'advance');
          assert.equal(delivery.requiredAdvancePoisha, scenario === 'advance' ? delivery.finalChargePoisha + 2468 : 0);
          assert.doesNotMatch(JSON.stringify(result), /supplierCost|supplierProfit|supplierPayable|platformMargin|vendorId|internalVendorSku/);
        }
      }
    }
  } finally { writeErpState(original); }
});

test('methods use public settings, not private configuration, and reject unavailable cart items', () => {
  const original = structuredClone(readErpState());
  try {
    const state = structuredClone(original);
    state.siteSettings.bkashManualNumber = '01700000000';
    state.siteSettings.bkashInstructionBn = 'পরীক্ষার নির্দেশনা';
    state.siteSettings.bkashInstructionEn = 'Fixture instructions';
    writeErpState(state);
    const { paymentMethods, quote } = getPublicCheckoutData();
    assert.equal(quote, null);
    assert.deepEqual(paymentMethods.map(m => m.code), ['cod', 'bkash_manual']);
    assert.equal(paymentMethods[1].accountNumber, state.siteSettings.bkashManualNumber);
    assert.equal(paymentMethods[1].instructionEn, state.siteSettings.bkashInstructionEn);
    assert.equal(paymentMethods[1].instructionBn, state.siteSettings.bkashInstructionBn);
    const product = state.products[0];
    const item = { productId: product.productId, variantId: product.variants[0].variantId, quantity: 100 };
    assert.throws(() => getPublicCheckoutData({ districtId: 999999, items: [item] }));
    assert.throws(() => getPublicCheckoutData({ districtId: 47, items: [item] }));
    assert.throws(() => getPublicCheckoutData({ districtId: 47, items: [{ ...item, productId: 'missing', quantity: 1 }] }));
    product.status = 'draft';
    writeErpState(state);
    assert.throws(() => getPublicCheckoutData({ districtId: 47, items: [{ ...item, quantity: 1 }] }));
  } finally { writeErpState(original); }
});

test('public page-data validates quote input and returns only safe checkout fields', async () => {
  for (const q of ['{', '{}', JSON.stringify({ districtId: 47, items: [] }), JSON.stringify({
    districtId: 47, items: [{ productId: 'bad', variantId: 'bad', quantity: -1 }],
  })]) {
    const response = await pageData(new ApiRequest(`http://localhost/api/page-data?${new URLSearchParams({ path: '/checkout', q })}`));
    assert.equal(response.status, 400);
    assert.equal((await response.json()).success, false);
    assert.match(response.headers.get('cache-control')!, /no-store/);
  }
  const product = readErpState().products.find(p => p.status === 'active')!;
  const q = JSON.stringify({ districtId: 47, items: [{
    productId: product.productId, variantId: product.variants[0].variantId, quantity: 1,
  }] });
  const response = await pageData(new ApiRequest(`http://localhost/api/page-data?${new URLSearchParams({ path: '/checkout', q })}`));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.data.page, 'checkout');
  assert.equal(body.data.props.checkout.paymentMethods.length, 2);
  assert.equal(body.data.props.checkout.quote.deliveryQuotes.length, 2);
  assert.doesNotMatch(JSON.stringify(body.data.props.checkout), /supplierCost|platformMargin|vendorId|internalVendorSku/);
});
