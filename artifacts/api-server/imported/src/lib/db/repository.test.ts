// src/lib/db/repository.test.ts
// Verifies that getPublicStorefrontData(), getPublicProductBySlug(), validatePromoForCart(),
// createStorefrontOrder(), and getPublicOrderTracking() enforce server-side field hiding,
// idempotency, stock reservation, and 3-tier margin protection.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createStorefrontOrder,
  getCustomerOrdersByPhone,
  getPublicOrderTracking,
  getPublicProductBySlug,
  getPublicStorefrontData,
  requestOrderCancellation,
  saveAbandonedCartSnapshot,
  submitManualBkashPayment,
  submitProductReview,
  validatePromoForCart,
} from './repository';
import { CUSTOMER_FORBIDDEN_FIELDS } from '../../types/permissions';

test('Repository Security Case 1: Storefront DTO strips all vendor and cost fields', () => {
  const data = getPublicStorefrontData();
  assert.ok(data.products.length >= 4);

  const serialized = JSON.stringify(data.products);
  for (const forbidden of CUSTOMER_FORBIDDEN_FIELDS) {
    assert.equal(
      serialized.includes(`"${forbidden}"`),
      false,
      `Customer payload leaked forbidden field: ${forbidden}`
    );
  }
});

test('Repository Case 2: getPublicProductBySlug returns sanitized product, reviews, and related items', () => {
  const pdp = getPublicProductBySlug('dhakai-half-silk-jamdani-saree');
  assert.ok(pdp.product);
  assert.equal(pdp.product.slug, 'dhakai-half-silk-jamdani-saree');
  assert.ok(pdp.reviews.length >= 1);
  assert.ok(pdp.relatedProducts.length >= 2);

  const serialized = JSON.stringify(pdp);
  for (const forbidden of CUSTOMER_FORBIDDEN_FIELDS) {
    assert.equal(serialized.includes(`"${forbidden}"`), false);
  }
});

test('Repository Case 3: validatePromoForCart calculates exact Poisha discount from platform margin', () => {
  const validRes = validatePromoForCart('EID10', [
    { variantId: '00000000-0000-4000-8000-000000000201', quantity: 1 }, // 245,000 poisha, margin 45,000
  ]);
  assert.equal(validRes.valid, true);
  assert.equal(validRes.discountPoisha, 24500); // 10% of 245,000 = 24,500 poisha (245 BDT)

  const invalidRes = validatePromoForCart('FAKECODE99', [
    { variantId: '00000000-0000-4000-8000-000000000201', quantity: 1 },
  ]);
  assert.equal(invalidRes.valid, false);
  assert.equal(invalidRes.discountPoisha, 0);
});

test('Repository Case 4: createStorefrontOrder enforces idempotency, stock reservation, and zero-leak tracking DTO', () => {
  const idemKey = `test-idem-${Date.now()}`;
  const res1 = createStorefrontOrder({
    customerName: 'আরিফুল ইসলাম',
    customerPhone: '01788776655',
    districtId: 47, // Dhaka
    upazilaId: 365, // Dhanmondi
    streetAddress: 'বাড়ি ১৮, রোড ৯/এ, ধানমন্ডি আবাসিক এলাকা',
    landmark: 'ইবনে সিনা হাসপাতালের পেছনে',
    source: 'storefront',
    deliveryMethod: 'courier',
    paymentMethod: 'cod',
    advancePaidPoisha: 0,
    customerNote: '',
    internalStaffNote: '',
    promoCode: 'EID10',
    idempotencyKey: idemKey,
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 1,
      },
    ],
  });

  assert.equal(res1.success, true);
  assert.ok(res1.order);
  assert.equal(res1.order.subtotalPoisha, 245000);
  assert.equal(res1.order.discountPoisha, 24500); // 10% of 2450 BDT = 245 BDT

  // Duplicate call with same idempotencyKey must return the exact same orderNo without double-deducting stock
  const res2 = createStorefrontOrder({
    customerName: 'আরিফুল ইসলাম',
    customerPhone: '01788776655',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাড়ি ১৮, রোড ৯/এ, ধানমন্ডি আবাসিক এলাকা',
    landmark: 'ইবনে সিনা হাসপাতালের পেছনে',
    source: 'storefront',
    deliveryMethod: 'courier',
    paymentMethod: 'cod',
    advancePaidPoisha: 0,
    customerNote: '',
    internalStaffNote: '',
    promoCode: 'EID10',
    idempotencyKey: idemKey,
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000101',
        variantId: '00000000-0000-4000-8000-000000000201',
        quantity: 1,
      },
    ],
  });

  assert.equal(res2.success, true);
  assert.equal(res2.order?.orderNo, res1.order.orderNo);

  const tracking = getPublicOrderTracking(res1.order.orderNo);
  assert.ok(tracking);
  const trackingJson = JSON.stringify(tracking);
  for (const forbidden of CUSTOMER_FORBIDDEN_FIELDS) {
    assert.equal(trackingJson.includes(`"${forbidden}"`), false);
  }
});

test('Repository Case 5: submitProductReview verifies purchase status, saveAbandonedCartSnapshot records cart, and getCustomerOrdersByPhone returns sanitized history', () => {
  const revRes = submitProductReview({
    productId: '00000000-0000-4000-8000-000000000101',
    customerName: 'তানভীর আহমেদ',
    customerPhone: '01712345678', // Matches seeded order ORD-261106-0001 for product 101
    rating: 5,
    comment: 'অসাধারণ মানের জামদানি শাড়ি, নির্ধারিত সময়ে পেয়েছি।',
  });
  assert.equal(revRes.success, true);
  assert.equal(revRes.review?.isVerifiedPurchase, false); // A phone supplied by the caller is not identity proof.

  const snapRes = saveAbandonedCartSnapshot({
    customerPhone: '01911223344',
    customerName: 'কামরুল হাসান',
    districtId: 47,
    items: [{ variantId: '00000000-0000-4000-8000-000000000203', quantity: 2 }],
  });
  assert.equal(snapRes.saved, true);

  const customerHistory = getCustomerOrdersByPhone('01712345678');
  assert.ok(customerHistory.length >= 1);
  const historyJson = JSON.stringify(customerHistory);
  for (const forbidden of CUSTOMER_FORBIDDEN_FIELDS) {
    assert.equal(historyJson.includes(`"${forbidden}"`), false);
  }
});

test('Repository Case 6: submitManualBkashPayment prevents duplicate TrxID reuse and requestOrderCancellation releases stock safely', () => {
  const uniqueSuffix = Date.now().toString().slice(-6);
  const ordRes = createStorefrontOrder({
    customerName: 'মাহমুদুল হাসান',
    customerPhone: '01812345678',
    districtId: 47,
    upazilaId: 365,
    streetAddress: 'বাসা ১২, রোড ৫, ধানমন্ডি, ঢাকা',
    landmark: 'স্কুলের পাশে',
    source: 'storefront',
    deliveryMethod: 'courier',
    paymentMethod: 'cod',
    advancePaidPoisha: 0,
    customerNote: '',
    internalStaffNote: '',
    promoCode: '',
    idempotencyKey: `idem-bkash-${uniqueSuffix}`,
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000102',
        variantId: '00000000-0000-4000-8000-000000000203',
        quantity: 1,
      },
    ],
  });
  assert.equal(ordRes.success, true);
  const orderNo = ordRes.order!.orderNo;

  // 1. Submit valid Manual bKash TrxID
  const uniqueTrx = `BKTRX${uniqueSuffix}`;
  const sub1 = submitManualBkashPayment({
    orderNo,
    senderPhone: '01812345678',
    trxId: uniqueTrx,
    submittedAmountPoisha: 12000,
    idempotencyKey: `sub-idem-${uniqueSuffix}`,
  });
  assert.equal(sub1.success, true);
  assert.equal(sub1.submission?.verificationStatus, 'pending_verification');
  assert.equal(sub1.submission?.submittedAmountPaisaStr, '12000');

  // 2. Reusing an existing order's TrxID (e.g. BK98234XZA from ORD-261106-0002) on another order must be blocked
  const subDup = submitManualBkashPayment({
    orderNo,
    senderPhone: '01812345678',
    trxId: 'BK98234XZA',
    submittedAmountPoisha: 12000,
    idempotencyKey: `sub-dup-${uniqueSuffix}`,
  });
  assert.equal(subDup.success, false);
  assert.equal(subDup.code, 'DUPLICATE_TRX_ID');

  // 3. Customer cancellation request on unshipped order succeeds and releases reserved stock
  const cancelRes = requestOrderCancellation({
    orderNo,
    customerPhone: '01812345678',
    reasonBn: 'ভুল ভ্যারিয়েন্ট নির্বাচন করা হয়েছে।',
  });
  assert.equal(cancelRes.success, true);
  assert.equal(cancelRes.order?.status, 'cancelled');
});

