// src/store/store.test.ts
// Unit tests for Cart Free-Delivery Threshold Progress (in Poisha) & Bilingual Formatters
// Run with: npx --yes tsx --test src/store/store.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateCartFreeDeliveryProgress,
  type CartItem,
} from './use-cart-store';
import { formatLocaleNumber, toBanglaDigits } from '../lib/i18n/dictionaries';

const sampleItem: CartItem = {
  productId: 'prod-1',
  variantId: 'var-1',
  slug: 'jamdani-saree',
  nameBn: 'ঢাকাই জামদানি শাড়ি',
  nameEn: 'Dhakai Jamdani Saree',
  variantTitleBn: 'লাল / স্ট্যান্ডার্ড',
  variantTitleEn: 'Red / Standard',
  publicSku: 'BG-JAM-01',
  imageUrl: null,
  unitSalePricePoisha: 95000, // 950 BDT
  compareAtPricePoisha: 110000,
  weightGrams: 450,
  maxStockAvailable: 10,
  isFreeDeliveryProduct: false,
  quantity: 1,
};

test('Cart Case 1: Free Delivery Progress Bar Calculation in Exact Poisha', () => {
  // Threshold = 1500 BDT (150000 poisha), Current Cart = 950 BDT (95000 poisha)
  const progress1 = calculateCartFreeDeliveryProgress([sampleItem], 150000, false);
  assert.equal(progress1.subtotalPoisha, 95000);
  assert.equal(progress1.remainingForFreeDeliveryPoisha, 55000); // Needs 550 BDT more
  assert.equal(progress1.isQualifiedForFreeDelivery, false);
  assert.equal(progress1.progressPercent, 63);

  // Quantity increased to 2 -> 1900 BDT (190000 poisha) >= 1500 BDT threshold
  const progress2 = calculateCartFreeDeliveryProgress(
    [{ ...sampleItem, quantity: 2 }],
    150000,
    false
  );
  assert.equal(progress2.subtotalPoisha, 190000);
  assert.equal(progress2.remainingForFreeDeliveryPoisha, 0);
  assert.equal(progress2.isQualifiedForFreeDelivery, true);
  assert.equal(progress2.progressPercent, 100);
});

test('Cart Case 2: Product-Level or Global Free Delivery Override', () => {
  const freeItem: CartItem = { ...sampleItem, isFreeDeliveryProduct: true };
  const progress = calculateCartFreeDeliveryProgress([freeItem], 150000, false);
  assert.equal(progress.isQualifiedForFreeDelivery, true);
  assert.equal(progress.remainingForFreeDeliveryPoisha, 0);
  assert.equal(progress.progressPercent, 100);
});

test('i18n Case 3: Bangla Digit Conversion & Number Formatting', () => {
  assert.equal(toBanglaDigits(2026), '২০২৬');
  assert.equal(formatLocaleNumber(1250, 'en'), '1,250');
});
