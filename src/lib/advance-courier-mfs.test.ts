// src/lib/advance-courier-mfs.test.ts
// Unit Tests for Manual MFS (bKash, Nagad, Rocket) and Advance Courier Charge Calculations

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createOrderInputSchema } from '@/src/lib/validators';
import { calculateDeliveryCharge } from '@/src/lib/money';

describe('Manual MFS Validation (bKash, Nagad, Rocket)', () => {
  it('accepts valid cod, bkash_manual, nagad_manual, and rocket_manual payment methods', () => {
    const baseInput = {
      idempotencyKey: 'idemp-test-01',
      customerName: 'তানভীর আহমেদ',
      customerPhone: '01711223344',
      districtId: 47,
      upazilaId: 365,
      streetAddress: 'বাড়ি ১২, রোড ৫, ধানমন্ডি',
      source: 'storefront' as const,
      deliveryMethod: 'courier' as const,
      items: [
        {
          productId: '00000000-0000-4000-8000-000000000101',
          variantId: '00000000-0000-4000-8000-000000000201',
          quantity: 1,
        },
      ],
    };

    // 1. COD
    const codRes = createOrderInputSchema.safeParse({
      ...baseInput,
      paymentMethod: 'cod',
    });
    assert.equal(codRes.success, true);

    // 2. bKash Manual
    const bkashRes = createOrderInputSchema.safeParse({
      ...baseInput,
      paymentMethod: 'bkash_manual',
      manualPaymentTrxId: 'BK12345678',
      advancePaidPoisha: 7000,
    });
    assert.equal(bkashRes.success, true);

    // 3. Nagad Manual
    const nagadRes = createOrderInputSchema.safeParse({
      ...baseInput,
      paymentMethod: 'nagad_manual',
      manualPaymentTrxId: 'NG98765432',
      advancePaidPoisha: 7000,
    });
    assert.equal(nagadRes.success, true); // Legacy schema parsing only; new use is denied at server boundary.

    // 4. Rocket Manual
    const rocketRes = createOrderInputSchema.safeParse({
      ...baseInput,
      paymentMethod: 'rocket_manual',
      manualPaymentTrxId: 'RK55443322',
      advancePaidPoisha: 7000,
    });
    assert.equal(rocketRes.success, true);

    // 5. Invalid Payment Method
    const invalidRes = createOrderInputSchema.safeParse({
      ...baseInput,
      paymentMethod: 'paypal' as any,
    });
    assert.equal(invalidRes.success, false);
  });

  it('calculates advance courier charge as full delivery charge plus custom advance deposit', () => {
    const deliveryCalc = calculateDeliveryCharge({
      method: 'courier',
      totalWeightGrams: 500,
      orderSubtotalPoisha: 245000,
      freeDeliveryThresholdPoisha: 300000,
      isGlobalFreeDelivery: false,
      isAllItemsFreeDelivery: false,
      courierBaseRate1KgPoisha: 7000, // ৳70 inside Dhaka
      courierExtraPerKgPoisha: 2000,
      bdPostPerKgPoisha: 1000,
    });

    assert.equal(deliveryCalc.finalChargePoisha, 7000); // ৳70

    // Jamdani Saree with customAdvanceDepositPoisha = 10000 (৳100)
    const customAdvanceDepositPoisha = 10000;
    const requiredAdvancePoisha = deliveryCalc.finalChargePoisha + customAdvanceDepositPoisha;
    assert.equal(requiredAdvancePoisha, 17000); // ৳170 total advance required

    // Order Total = ৳2,450 + ৳70 = ৳2,520 (252000 Poisha)
    const totalPayablePoisha = 245000 + deliveryCalc.finalChargePoisha;
    const remainingCodPoisha = totalPayablePoisha - requiredAdvancePoisha;
    assert.equal(remainingCodPoisha, 235000); // ৳2,350 to collect via COD
  });
});
