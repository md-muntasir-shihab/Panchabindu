import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeOrderPaymentSummary,
  filterOrdersMinimal,
  getAllowedNextStatuses,
  isSafeHttpUrl,
  normalizeBdPostServiceType,
  resolveOrderTrackingDisplay,
  summarizeOrderStages,
  validateDispatchInput,
} from './order-management';
import type { OrderGridRowDTO } from '@/types/domain';

describe('order-management pure helpers', () => {
  it('computes clean integer Poisha payment summaries across unpaid, partial, pending TrxID, and fully paid orders', () => {
    const unpaidCod = computeOrderPaymentSummary({
      totalPayablePoisha: 150000,
      advancePaidPoisha: 0,
      codCollectablePoisha: 150000,
      paymentStatus: 'unpaid',
      isAdvanceMandatory: false,
      estimatedNetProfitPoisha: 32000,
    });
    assert.equal(unpaidCod.totalPoisha, 150000);
    assert.equal(unpaidCod.verifiedPaidPoisha, 0);
    assert.equal(unpaidCod.duePoisha, 150000);
    assert.equal(unpaidCod.isFullyPaid, false);
    assert.equal(unpaidCod.hasPendingVerification, false);
    assert.equal(unpaidCod.netProfitPoisha, 32000);

    const pendingBkash = computeOrderPaymentSummary(
      {
        totalPayablePoisha: 200000,
        advancePaidPoisha: 0,
        codCollectablePoisha: 200000,
        paymentStatus: 'unpaid',
        manualPaymentTrxId: 'TRX9988',
        isAdvanceMandatory: true,
      },
      {
        orderNo: 'ORD-1',
        trxId: 'TRX9988',
        submittedAmountPoisha: 50000,
        status: 'submitted',
      }
    );
    assert.equal(pendingBkash.hasPendingVerification, true);
    assert.equal(pendingBkash.pendingClaimPoisha, 50000);
    assert.equal(pendingBkash.verifiedPaidPoisha, 0);
    assert.equal(pendingBkash.duePoisha, 200000);

    const paidFull = computeOrderPaymentSummary({
      totalPayablePoisha: 120000,
      advancePaidPoisha: 120000,
      codCollectablePoisha: 0,
      paymentStatus: 'paid_verified',
    });
    assert.equal(paidFull.isFullyPaid, true);
    assert.equal(paidFull.duePoisha, 0);
  });

  it('resolves official courier URLs and custom courier name + editable tracking URL overrides', () => {
    const steadfast = resolveOrderTrackingDisplay(
      {
        courierProvider: 'steadfast',
        trackingCode: 'SF-100200',
      },
      'bn'
    );
    assert.equal(steadfast.courierLabel, 'Steadfast');
    assert.equal(steadfast.isCustomCourier, false);
    assert.equal(steadfast.trackingUrl, 'https://steadfast.com.bd/t/SF-100200');
    assert.equal(steadfast.hasTracking, true);

    const customCourier = resolveOrderTrackingDisplay(
      {
        courierProvider: 'manual',
        customCourierName: 'সুন্দরবন কুরিয়ার',
        trackingCode: 'SB-778899',
        customTrackingUrl: 'https://sundarbancourier.example.com/track/SB-778899',
      },
      'bn'
    );
    assert.equal(customCourier.courierLabel, 'সুন্দরবন কুরিয়ার');
    assert.equal(customCourier.isCustomCourier, true);
    assert.equal(customCourier.isCustomTrackingUrl, true);
    assert.equal(
      customCourier.trackingUrl,
      'https://sundarbancourier.example.com/track/SB-778899'
    );

    const customOverrideOnOfficial = resolveOrderTrackingDisplay(
      {
        courierProvider: 'pathao',
        trackingCode: 'PT-555',
        customTrackingUrl: 'https://track.custom.bd/pt-555',
      },
      'en'
    );
    assert.equal(customOverrideOnOfficial.trackingUrl, 'https://track.custom.bd/pt-555');
    assert.equal(customOverrideOnOfficial.isCustomTrackingUrl, true);

    const unsafeUrlFallback = resolveOrderTrackingDisplay(
      {
        courierProvider: 'steadfast',
        trackingCode: 'SF-999',
        customTrackingUrl: 'javascript:alert(1)',
      },
      'en'
    );
    assert.equal(unsafeUrlFallback.isCustomTrackingUrl, false);
    assert.equal(unsafeUrlFallback.trackingUrl, 'https://steadfast.com.bd/t/SF-999');
  });

  it('validates dispatch input strictly for custom couriers, tracking code, and safe URLs', () => {
    assert.equal(isSafeHttpUrl('https://example.com/t/123'), true);
    assert.equal(isSafeHttpUrl('javascript:alert(1)'), false);
    assert.equal(isSafeHttpUrl('ftp://example.com'), false);

    const missingCustomName = validateDispatchInput({
      courierProvider: 'manual',
      customCourierName: ' ',
      trackingCode: 'SB-1001',
      customTrackingUrl: '',
    });
    assert.equal(missingCustomName.valid, false);

    const blockedRedx = validateDispatchInput({
      courierProvider: 'redx',
      customCourierName: '',
      trackingCode: 'RX-1001',
      customTrackingUrl: '',
    });
    assert.equal(blockedRedx.valid, false);

    const unsafeUrl = validateDispatchInput({
      courierProvider: 'manual',
      customCourierName: 'SA Paribahan',
      trackingCode: 'SA-1234',
      customTrackingUrl: 'javascript:void(0)',
    });
    assert.equal(unsafeUrl.valid, false);

    const validCustom = validateDispatchInput({
      courierProvider: 'manual',
      customCourierName: 'সুন্দরবন কুরিয়ার',
      trackingCode: 'SB-9021',
      consignmentId: 'CNS-90',
      customTrackingUrl: 'https://track.sundarban.bd/SB-9021',
    });
    assert.equal(validCustom.valid, true);
    assert.equal(validCustom.normalized?.courierProvider, 'manual');
    assert.equal(validCustom.normalized?.customCourierName, 'সুন্দরবন কুরিয়ার');
    assert.equal(
      validCustom.normalized?.customTrackingUrl,
      'https://track.sundarban.bd/SB-9021'
    );
  });

  it('summarizes streamlined stages and filters by stage, queue, and custom courier search', () => {
    const sample: Array<Partial<OrderGridRowDTO>> = [
      { orderNo: 'ORD-1', status: 'pending_confirmation', customerName: 'Rahim', nextBestAction: 'CALL_TO_CONFIRM' },
      { orderNo: 'ORD-2', status: 'packed', customerName: 'Karim', nextBestAction: 'READY_TO_BOOK_COURIER' },
      {
        orderNo: 'ORD-3',
        status: 'shipped',
        customerName: 'Salma',
        courierProvider: 'manual',
        customCourierName: 'সুন্দরবন কুরিয়ার',
        trackingCode: 'SB-444',
      },
      { orderNo: 'ORD-4', status: 'out_for_delivery', customerName: 'Nadia' },
      { orderNo: 'ORD-5', status: 'cancelled', customerName: 'Jamal' },
    ];

    const summary = summarizeOrderStages(sample);
    assert.equal(summary.all, 5);
    assert.equal(summary.pending_confirmation, 1);
    assert.equal(summary.packed, 1);
    assert.equal(summary.in_transit, 2);
    assert.equal(summary.closed, 1);

    const inTransit = filterOrdersMinimal(sample, {
      stage: 'in_transit',
      queueFilter: 'ALL',
      search: '',
    });
    assert.equal(inTransit.length, 2);

    const searchByCustomCourier = filterOrdersMinimal(sample, {
      stage: 'all',
      queueFilter: 'ALL',
      search: 'সুন্দরবন',
    });
    assert.equal(searchByCustomCourier.length, 1);
    assert.equal(searchByCustomCourier[0].orderNo, 'ORD-3');
  });

  it('normalizes legacy and canonical BD Post service types cleanly', () => {
    assert.equal(normalizeBdPostServiceType('vpp_cod'), 'VPP_PARCEL');
    assert.equal(normalizeBdPostServiceType('vpp_parcel'), 'VPP_PARCEL');
    assert.equal(normalizeBdPostServiceType('gep'), 'GEP');
    assert.equal(normalizeBdPostServiceType('ems'), 'EMS_DAK');
    assert.equal(normalizeBdPostServiceType('ems_dak'), 'EMS_DAK');
    assert.equal(normalizeBdPostServiceType('registered_parcel'), 'REGISTERED_PARCEL');
    assert.equal(normalizeBdPostServiceType('VPP_PARCEL'), 'VPP_PARCEL');
    assert.equal(normalizeBdPostServiceType(undefined), 'VPP_PARCEL');
  });

  it('returns valid lifecycle transitions for every order stage', () => {
    assert.deepEqual(getAllowedNextStatuses('pending_confirmation'), [
      'confirmed',
      'cancelled',
    ]);
    assert.deepEqual(getAllowedNextStatuses('confirmed'), ['packed', 'cancelled']);
    assert.deepEqual(getAllowedNextStatuses('packed'), ['shipped', 'cancelled']);
    assert.deepEqual(getAllowedNextStatuses('shipped'), [
      'out_for_delivery',
      'delivered',
      'return_initiated',
    ]);
    assert.deepEqual(getAllowedNextStatuses('delivered'), [
      'return_initiated',
      'returned',
    ]);
    assert.deepEqual(getAllowedNextStatuses('cancelled'), []);
  });
});
