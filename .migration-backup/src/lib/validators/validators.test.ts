// src/lib/validators/validators.test.ts
// Unit Tests for BD Phone Validator, Address Quality Scorer, Risk Score, and Order Zod Schemas
// Run with: npx --yes tsx --test src/lib/validators/validators.test.ts

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bdPhoneSchema,
  calculateOrderRiskScore,
  createOrderInputSchema,
  evaluateAddressQuality,
  normalizeBdPhone,
} from './index';
import { sanitizeRecordForRole, assertVendorOwnershipOr404 } from '../../types/permissions';

test('Validator Case 1: Bangladesh Phone Normalization (Bangla digits, +880, & invalid rejection)', () => {
  assert.equal(normalizeBdPhone('01712345678'), '01712345678');
  assert.equal(normalizeBdPhone('+880 1812-345678'), '01812345678');
  assert.equal(normalizeBdPhone('০১৯১২৩৪৫৬৭৮'), '01912345678');
  // Invalid operator 011 or wrong length
  assert.equal(normalizeBdPhone('01112345678'), null);
  assert.equal(normalizeBdPhone('017123456'), null);

  const parsed = bdPhoneSchema.safeParse('০১৭১২-৩৪৫৬৭৮');
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data, '01712345678');
  }
});

test('Validator Case 2: Address Quality Check & District-Upazila Cascade Validation', () => {
  // District 1 is Comilla, Upazila 1 is Debidwar (belongs to District 1)
  const goodAddr = evaluateAddressQuality({
    districtId: 1,
    upazilaId: 1,
    streetAddress: 'বাড়ি ১২, রোড ৪, নিউ মার্কেট এলাকা, দেবিদ্বার',
    landmark: 'দেবিদ্বার সরকারি কলেজের পাশে',
    customerPhone: '01712345678',
  });
  assert.equal(goodAddr.score, 100);
  assert.equal(goodAddr.isBookableWithoutOverride, true);
  assert.deepEqual(goodAddr.flags, []);

  // Mismatched District (47 = Dhaka) with Comilla Upazila (1 = Debidwar) + short address
  const badAddr = evaluateAddressQuality({
    districtId: 47,
    upazilaId: 1,
    streetAddress: 'ঢাকা',
    landmark: '',
    customerPhone: '01712345678',
  });
  assert.equal(badAddr.isBookableWithoutOverride, false);
  assert.ok(badAddr.flags.includes('DISTRICT_UPAZILA_MISMATCH'));
  assert.ok(badAddr.flags.includes('ADDRESS_TOO_SHORT'));
  assert.ok(badAddr.flags.includes('MISSING_LANDMARK'));
});

test('Validator Case 3: Order Risk Score & Mandatory Advance Rule', () => {
  const highRisk = calculateOrderRiskScore({
    customerTotalOrders: 4,
    customerReturnedOrders: 3, // 75% return rate!
    isCustomerBlacklisted: false,
    addressQualityScore: 50,
    districtSuccessRateBp: 8500,
    totalPayablePoisha: 550000, // 5,500 BDT
    source: 'facebook',
    mandatoryAdvanceThresholdScore: 70,
  });

  assert.equal(highRisk.riskBadge, 'HIGH');
  assert.equal(highRisk.isAdvanceMandatory, true);
  assert.ok(highRisk.riskScore >= 70);
});

test('Validator Case 4: Checkout Zod Schema Enforces Manual bKash Trx ID & Valid Geo', () => {
  const missingTrx = createOrderInputSchema.safeParse({
    idempotencyKey: 'idem-12345678',
    customerName: 'রহিম উদ্দিন',
    customerPhone: '01712345678',
    districtId: 1,
    upazilaId: 1,
    streetAddress: 'বাড়ি ১০, রোড ২, দেবিদ্বার সদর',
    paymentMethod: 'bkash_manual',
    items: [
      {
        productId: '00000000-0000-4000-8000-000000000010',
        variantId: '00000000-0000-4000-8000-000000000020',
        quantity: 1,
      },
    ],
  });
  assert.equal(missingTrx.success, false);
});

test('Validator Case 5: Server-Side Field Hiding & Cross-Vendor 404 Isolation', () => {
  const rawOrderItem = {
    id: 'oi-1',
    product_name_bn_snapshot: 'টাঙ্গাইল সিল্ক শাড়ি',
    vendor_id: 'vnd-secret-1',
    internal_vendor_sku: 'VND-SILK-01',
    snap_unit_supplier_cost_poisha: 80000,
    snap_unit_supplier_profit_poisha: 20000,
    snap_unit_supplier_payable_poisha: 100000,
    snap_unit_platform_margin_poisha: 25000,
    snap_unit_sale_price_poisha: 125000,
    estimated_net_profit_poisha: 18000,
    customer_phone: '01712345678',
    street_address: 'বাড়ি ১২, ধানমন্ডি, ঢাকা',
  };

  // 1. Public customer NEVER sees vendor_id, internal_vendor_sku, supplier_cost, or margin
  const customerView = sanitizeRecordForRole(rawOrderItem, 'public_customer');
  assert.equal(customerView.vendor_id, undefined);
  assert.equal(customerView.internal_vendor_sku, undefined);
  assert.equal(customerView.snap_unit_supplier_cost_poisha, undefined);
  assert.equal(customerView.snap_unit_platform_margin_poisha, undefined);
  assert.equal(customerView.snap_unit_sale_price_poisha, 125000);

  // 2. Marketing Manager NEVER sees supplier_cost or net profit
  const marketingView = sanitizeRecordForRole(rawOrderItem, 'marketing_manager');
  assert.equal(marketingView.snap_unit_supplier_cost_poisha, undefined);
  assert.equal(marketingView.estimated_net_profit_poisha, undefined);

  // 3. Vendor sees masked customer phone & masked address, and NEVER sees platform margin
  const vendorView = sanitizeRecordForRole(rawOrderItem, 'vendor', {
    maskVendorCustomerPii: true,
  });
  assert.equal(vendorView.customer_phone, '017****678');
  assert.equal(vendorView.snap_unit_platform_margin_poisha, undefined);
  assert.equal(vendorView.snap_unit_supplier_payable_poisha, 100000);

  // 4. Cross-vendor access throws 404 (not 403)
  assert.throws(
    () =>
      assertVendorOwnershipOr404(
        {
          userId: 'u-1',
          username: 'vendor1',
          roleSlug: 'vendor',
          vendorId: 'vnd-own-1',
          mustChangePassword: false,
          totpEnrolled: true,
          require2fa: true,
          maxDiscountBp: 0,
          maskCustomerPiiForVendor: true,
        },
        'vnd-other-2'
      ),
    (err: Error & { statusCode?: number }) => err.statusCode === 404
  );
});
