// src/lib/inventory/phase3-integrity.test.ts
// Phase 3 Automated Concurrency, Inventory, Multi-Vendor Order, State Machine & Return Workflow Tests

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ActorSecurityContext } from '../../types/permissions';
import { readPhase4BStore } from '../admin/phase4b-service';
import {
  createStorefrontOrder,
  readErpState,
  writeErpState,
} from '../db/repository';
import {
  adjustVariantStockWithReason,
  buildAndPersistOrderFulfillmentGroups,
  computeOrthogonalOrderState,
  evaluateAndExecuteOrderCancellation,
  executeConcurrentCheckoutBatch,
  executeOrderStateTransition,
  executeVendorFulfillmentGroupAction,
  inspectAndResolveOrderReturn,
  receiveConsignmentStockLotWithQc,
  reconcileInventoryStockState,
  registerOrderStockReservation,
  releaseExpiredStockReservations,
} from './phase3-inventory-order-engine';

const superAdminCtx: ActorSecurityContext = {
  userId: 'usr-super-admin',
  username: 'admin',
  roleSlug: 'super_admin',
  vendorId: null,
  mustChangePassword: false,
  totpEnrolled: true,
  require2fa: true,
  maxDiscountBp: 5000,
  maskCustomerPiiForVendor: false,
};

const packagingCtx: ActorSecurityContext = {
  userId: 'usr-packaging-01',
  username: 'packer_rafi',
  roleSlug: 'packaging_manager',
  vendorId: null,
  mustChangePassword: false,
  totpEnrolled: true,
  require2fa: true,
  maxDiscountBp: 0,
  maskCustomerPiiForVendor: false,
};

const vendor1Ctx: ActorSecurityContext = {
  userId: 'usr-vendor-001',
  username: 'vendor_rupganj',
  roleSlug: 'vendor',
  vendorId: '00000000-0000-4000-8000-000000000901',
  mustChangePassword: false,
  totpEnrolled: true,
  require2fa: true,
  maxDiscountBp: 0,
  maskCustomerPiiForVendor: true,
};

describe('Phase 3 — Inventory, Multi-Vendor Order, State Machine & Consignment Integrity', () => {
  it('6.1: receives consignment stock with QC inspection, enforces adjustment reason & negative stock prevention, and reconciles all variants', () => {
    const erpBefore = readErpState();
    const targetVar = erpBefore.products[0]!.variants[0]!;
    const initialOnHand = targetVar.stockOnHand;
    const initialAvailable = targetVar.stockAvailable;
    const initialDamaged = targetVar.stockDamaged;

    // 1. QC Stock Receiving: 10 dispatched -> 8 accepted (sellable), 2 rejected (quarantined damaged)
    const qcRes = receiveConsignmentStockLotWithQc(packagingCtx, {
      variantId: targetVar.variantId,
      warehouseCode: 'WH-DAC-CENTRAL',
      binLocationCode: 'BIN-JAMDANI-01',
      dispatchedQty: 10,
      qcAcceptedQty: 8,
      qcRejectedQty: 2,
      challanRef: 'CH-P3-QC-101',
      noteBn: '৮টি শাড়ি কিউসি পাস, ২টিতে সামান্য সুতার ত্রুটি থাকায় ড্যামেজ কোয়ারেন্টাইন।',
    });

    assert.equal(qcRes.success, true);
    assert.equal(qcRes.movements?.length, 2);
    assert.equal(qcRes.updatedStock?.stockOnHand, initialOnHand + 8);
    assert.equal(qcRes.updatedStock?.stockAvailable, initialAvailable + 8);
    assert.equal(qcRes.updatedStock?.stockDamaged, initialDamaged + 2);

    // 2. Stock Adjustment without reason fails
    const noReasonAdj = adjustVariantStockWithReason(superAdminCtx, {
      variantId: targetVar.variantId,
      eventType: 'MANUAL_AUDIT',
      onHandDelta: -1,
      reasonBn: 'না',
    });
    assert.equal(noReasonAdj.success, false);

    // 3. Unauthorized role (vendor) cannot directly adjust warehouse stock
    const vendorAdj = adjustVariantStockWithReason(vendor1Ctx, {
      variantId: targetVar.variantId,
      eventType: 'MANUAL_AUDIT',
      onHandDelta: 5,
      reasonBn: 'ভেন্ডর সরাসরি স্টক বাড়ানোর চেষ্টা',
    });
    assert.equal(vendorAdj.success, false);

    // 4. Negative stock / below-reserved stock adjustment is blocked
    const negativeAdj = adjustVariantStockWithReason(superAdminCtx, {
      variantId: targetVar.variantId,
      eventType: 'MANUAL_AUDIT',
      onHandDelta: -99999,
      reasonBn: 'অতিরিক্ত ঋণাত্মক স্টক টেস্ট',
    });
    assert.equal(negativeAdj.success, false);
    assert.ok(negativeAdj.errorBn?.includes('NEGATIVE_STOCK_BLOCKED'));

    // 5. Valid adjustment with reason succeeds and restores initial stockOnHand
    const restoreAdj = adjustVariantStockWithReason(superAdminCtx, {
      variantId: targetVar.variantId,
      eventType: 'MANUAL_AUDIT',
      onHandDelta: -8,
      damagedDelta: -2,
      reasonBn: 'ফেজ ৩ কিউসি টেস্ট শেষে প্রারম্ভিক স্টক পুনঃস্থাপন।',
    });
    assert.equal(restoreAdj.success, true);

    const recon = reconcileInventoryStockState();
    assert.equal(recon.allReconciled, true);
    assert.equal(recon.discrepancyCount, 0);
  });

  it('6.1: prevents overselling and negative stock during concurrent checkouts for the last 3 units of stock', async () => {
    const erp = readErpState();
    const targetVar = erp.products[0]!.variants[0]!;
    const savedOnHand = targetVar.stockOnHand;
    const savedReserved = targetVar.stockReserved;
    const savedAvailable = targetVar.stockAvailable;

    // Set available stock to exactly 3 units
    targetVar.stockOnHand = targetVar.stockReserved + 3;
    targetVar.stockAvailable = 3;
    writeErpState(erp);

    try {
      // 1. Duplicate variant lines in a single checkout exceeding 3 units must fail atomically
      const duplicateLineOverbuy = createStorefrontOrder({
        customerName: 'ডুপ্লিকেট লাইন ক্রেতা',
        customerPhone: '01711009988',
        districtId: 47,
        upazilaId: 365,
        streetAddress: 'বাড়ি ১২, রোড ৫, ধানমন্ডি আবাসিক এলাকা',
        landmark: 'সাত মসজিদ রোড',
        deliveryMethod: 'courier',
        paymentMethod: 'cod',
        advancePaidPoisha: 0,
        customerNote: '',
        internalStaffNote: '',
        source: 'storefront',
        idempotencyKey: `idem-dupline-${Date.now()}`,
        items: [
          {
            productId: erp.products[0]!.productId,
            variantId: targetVar.variantId,
            quantity: 2,
          },
          {
            productId: erp.products[0]!.productId,
            variantId: targetVar.variantId,
            quantity: 2,
          },
        ],
      });
      assert.equal(duplicateLineOverbuy.success, false);

      // 2. Fire 6 concurrent checkout requests (each for 1 unit) against 3 available units
      const batchRequests = Array.from({ length: 6 }, (_, idx) => ({
        customerName: `কনকারেন্ট ক্রেতা ${idx + 1}`,
        customerPhone: `0172233445${idx}`,
        districtId: 47,
        upazilaId: 365,
        streetAddress: `বাড়ি ${10 + idx}, রোড ৭/এ, ধানমন্ডি আবাসিক এলাকা`,
        landmark: 'ধানমন্ডি লেক',
        deliveryMethod: 'courier' as const,
        paymentMethod: 'cod' as const,
        advancePaidPoisha: 0,
        customerNote: '',
        internalStaffNote: '',
        source: 'storefront' as const,
        idempotencyKey: `idem-conc-${Date.now()}-${idx}`,
        items: [
          {
            productId: erp.products[0]!.productId,
            variantId: targetVar.variantId,
            quantity: 1,
          },
        ],
      }));

      const results = await executeConcurrentCheckoutBatch(batchRequests);
      const succeeded = results.filter((r) => r.success);
      const failed = results.filter((r) => !r.success);

      assert.equal(
        succeeded.length,
        3,
        `Expected exactly 3 concurrent checkouts to succeed for 3 available units, got ${succeeded.length}`
      );
      assert.equal(failed.length, 3);

      const erpAfter = readErpState();
      const varAfter = erpAfter.products[0]!.variants[0]!;
      assert.equal(varAfter.stockAvailable, 0);
      assert.ok(varAfter.stockAvailable >= 0);

      // 3. Test reservation expiry releasing the 3 reserved units back to available
      const nowMs = Date.now();
      for (const s of succeeded) {
        registerOrderStockReservation({
          orderNo: s.order!.orderNo,
          variantId: targetVar.variantId,
          publicSku: targetVar.publicSku,
          vendorId: erp.products[0]!.vendorId,
          reservedQty: 1,
          ttlHours: 1,
          nowMs: nowMs - 2 * 3600 * 1000, // Created 2 hours ago -> expired!
        });
      }

      const expResult = releaseExpiredStockReservations(nowMs);
      assert.equal(expResult.releasedReservationsCount, 3);
      assert.equal(expResult.releasedUnitsTotal, 3);

      const erpRestored = readErpState();
      const varRestored = erpRestored.products[0]!.variants[0]!;
      assert.equal(varRestored.stockAvailable, 3);
    } finally {
      const cleanup = readErpState();
      const vClean = cleanup.products[0]!.variants[0]!;
      vClean.stockOnHand = savedOnHand;
      vClean.stockReserved = savedReserved;
      vClean.stockAvailable = savedAvailable;
      writeErpState(cleanup);
    }
  });

  it('6.2: splits a Multi-Vendor Customer Order into per-vendor Fulfillment Groups (VFG) and handles Partial Packing, Partial Delivery, and Partial Cancellation', () => {
    const erp = readErpState();
    // Pick two products belonging to two distinct vendors
    const prodVnd1 = erp.products[0]!;
    const varVnd1 = prodVnd1.variants[0]!;
    const prodVnd2 = erp.products.find(
      (p) => p.vendorId !== prodVnd1.vendorId && p.variants.length > 0
    )!;
    const varVnd2 = prodVnd2.variants[0]!;

    const orderRes = createStorefrontOrder({
      customerName: 'মাল্টি-ভেন্ডর ক্রেতা',
      customerPhone: '01811223399',
      districtId: 47,
      upazilaId: 365,
      streetAddress: 'বাড়ি ৩২, রোড ১১, বনানী আবাসিক এলাকা',
      landmark: 'বনানী সুপার মার্কেটের পাশে',
      deliveryMethod: 'courier',
      paymentMethod: 'cod',
      promoCode: 'EID10',
      advancePaidPoisha: 0,
      customerNote: '',
      internalStaffNote: '',
      source: 'storefront',
      idempotencyKey: `idem-mv-${Date.now()}`,
      items: [
        {
          productId: prodVnd1.productId,
          variantId: varVnd1.variantId,
          quantity: 1,
        },
        {
          productId: prodVnd2.productId,
          variantId: varVnd2.variantId,
          quantity: 1,
        },
      ],
    });

    assert.equal(orderRes.success, true);
    const orderNo = orderRes.order!.orderNo;

    const groups = buildAndPersistOrderFulfillmentGroups(orderNo);
    assert.equal(groups.length, 2, 'Expected 2 distinct Vendor Fulfillment Groups');

    const grpVnd1 = groups.find((g) => g.vendorId === prodVnd1.vendorId)!;
    const grpVnd2 = groups.find((g) => g.vendorId === prodVnd2.vendorId)!;
    assert.ok(grpVnd1);
    assert.ok(grpVnd2);
    assert.notEqual(grpVnd1.groupCode, orderNo);
    assert.notEqual(grpVnd2.groupCode, orderNo);

    // Promo discount is deducted solely from platform margin; vendor payables remain 100% intact
    assert.equal(
      grpVnd1.groupSupplierPayablePoisha,
      varVnd1.supplierPayablePoisha
    );
    assert.equal(
      grpVnd2.groupSupplierPayablePoisha,
      varVnd2.supplierPayablePoisha
    );

    // Cross-vendor isolation: Vendor 1 cannot pack Vendor 2's fulfillment group
    const crossVendorAttempt = executeVendorFulfillmentGroupAction(vendor1Ctx, {
      orderNo,
      groupCode: grpVnd2.groupCode,
      action: 'pack_group',
    });
    assert.equal(crossVendorAttempt.success, false);
    assert.ok(crossVendorAttempt.errorBn?.includes('NOT_FOUND'));

    // Partial Pack & Ship: Pack and ship Vendor 1's group while Vendor 2 remains 'allocated'
    const pack1 = executeVendorFulfillmentGroupAction(packagingCtx, {
      orderNo,
      groupCode: grpVnd1.groupCode,
      action: 'pack_group',
    });
    assert.equal(pack1.success, true);
    assert.equal(pack1.orthogonalState?.fulfillmentStatus, 'partially_packed');

    const ship1 = executeVendorFulfillmentGroupAction(packagingCtx, {
      orderNo,
      groupCode: grpVnd1.groupCode,
      action: 'ship_group',
      courierProvider: 'steadfast',
      consignmentId: 'CN-VFG1-9001',
      trackingCode: 'SF-VFG1-9001',
    });
    assert.equal(ship1.success, true);
    assert.equal(ship1.orthogonalState?.fulfillmentStatus, 'partially_shipped');

    // Partial Delivery: Deliver Vendor 1's group while Vendor 2 is still unshipped
    const deliv1 = executeVendorFulfillmentGroupAction(packagingCtx, {
      orderNo,
      groupCode: grpVnd1.groupCode,
      action: 'deliver_group',
    });
    assert.equal(deliv1.success, true);
    assert.equal(
      deliv1.orthogonalState?.fulfillmentStatus,
      'partially_delivered'
    );
    assert.equal(deliv1.orthogonalState?.orderStatus, 'out_for_delivery');

    // Verify ONLY Vendor 1 received EARNING_LOCKED in vendorLedger for this order
    const p4b = readPhase4BStore();
    const orderLedgerRows = p4b.vendorLedger.filter(
      (e) => e.orderNo === orderNo
    );
    assert.equal(orderLedgerRows.length, 1);
    assert.equal(orderLedgerRows[0]?.vendorId, prodVnd1.vendorId);
    assert.equal(
      orderLedgerRows[0]?.amountPoisha,
      grpVnd1.groupSupplierPayablePoisha
    );

    // Partial Cancellation: Cancel Vendor 2's unshipped group
    const cancel2 = executeVendorFulfillmentGroupAction(superAdminCtx, {
      orderNo,
      groupCode: grpVnd2.groupCode,
      action: 'cancel_group',
      reasonBn: 'ভেন্ডর ২-এর আইটেম কাস্টমার আংশিক ক্যান্সেল করেছেন।',
    });
    assert.equal(cancel2.success, true);
    // Since Vendor 1 was already delivered and Vendor 2 is cancelled, all active groups are now delivered!
    assert.equal(cancel2.orthogonalState?.fulfillmentStatus, 'delivered');
    assert.equal(cancel2.orthogonalState?.orderStatus, 'delivered');
  });

  it('6.3 & 6.4: enforces 5-dimension Order State Machine rules, idempotency, cancellation policy, and 4-Way Return QC inspection', () => {
    const erp = readErpState();
    const prod = erp.products[0]!;
    const vr = prod.variants[0]!;

    const orderRes = createStorefrontOrder({
      customerName: 'স্টেট মেশিন টেস্ট ক্রেতা',
      customerPhone: '01911223344',
      districtId: 47,
      upazilaId: 365,
      streetAddress: 'বাড়ি ১৫, রোড ৩, ধানমন্ডি আবাসিক এলাকা',
      landmark: 'ল্যাবএইড হাসপাতালের পাশে',
      deliveryMethod: 'courier',
      paymentMethod: 'cod',
      advancePaidPoisha: 0,
      customerNote: '',
      internalStaffNote: '',
      source: 'storefront',
      idempotencyKey: `idem-sm-${Date.now()}`,
      items: [
        {
          productId: prod.productId,
          variantId: vr.variantId,
          quantity: 2,
        },
      ],
    });
    assert.equal(orderRes.success, true);
    const orderNo = orderRes.order!.orderNo;

    // 1. Invalid jump (pending_confirmation -> delivered) is blocked
    const invalidJump = executeOrderStateTransition({
      orderNo,
      toState: 'delivered',
      actorUsername: 'admin',
      actorRole: 'super_admin',
      idempotencyKey: `tr-inv-${orderNo}`,
      reasonBn: 'সরাসরি ডেলিভারড করার অবৈধ চেষ্টা',
    });
    assert.equal(invalidJump.success, false);
    assert.equal(invalidJump.errorCode, 'INVALID_STATE_TRANSITION');

    // 2. Confirm -> Pack -> Ship (requires tracking) -> Deliver
    const trConfirm = executeOrderStateTransition({
      orderNo,
      toState: 'confirmed',
      actorUsername: 'admin',
      actorRole: 'super_admin',
      idempotencyKey: `tr-conf-${orderNo}`,
      reasonBn: 'কল কনফার্মেশন সম্পন্ন',
    });
    assert.equal(trConfirm.success, true);

    // Replay same idempotencyKey returns idempotent success
    const trConfirmReplay = executeOrderStateTransition({
      orderNo,
      toState: 'confirmed',
      actorUsername: 'admin',
      actorRole: 'super_admin',
      idempotencyKey: `tr-conf-${orderNo}`,
      reasonBn: 'কল কনফার্মেশন সম্পন্ন',
    });
    assert.equal(trConfirmReplay.success, true);
    assert.equal(trConfirmReplay.idempotentReplay, true);

    const trPack = executeOrderStateTransition({
      orderNo,
      toState: 'packed',
      actorUsername: 'packer_rafi',
      actorRole: 'packaging_manager',
      idempotencyKey: `tr-pack-${orderNo}`,
      reasonBn: 'প্যাকিং সম্পন্ন',
    });
    assert.equal(trPack.success, true);

    // Customer cannot cancel once packed
    const custCancelPacked = executeOrderStateTransition({
      orderNo,
      toState: 'cancelled',
      actorUsername: '01911223344',
      actorRole: 'customer',
      idempotencyKey: `tr-cust-cancel-${orderNo}`,
      reasonBn: 'প্যাকিংয়ের পর কাস্টমার ক্যান্সেল চেষ্টা',
    });
    assert.equal(custCancelPacked.success, false);
    assert.equal(
      custCancelPacked.errorCode,
      'UNAUTHORIZED_ROLE_FOR_TRANSITION'
    );

    // Ship without tracking fails precondition
    const shipNoTrack = executeOrderStateTransition({
      orderNo,
      toState: 'shipped',
      actorUsername: 'packer_rafi',
      actorRole: 'packaging_manager',
      idempotencyKey: `tr-ship-notrk-${orderNo}`,
      reasonBn: 'ট্র্যাকিং ছাড়া শিপমেন্ট চেষ্টা',
    });
    assert.equal(shipNoTrack.success, false);
    assert.equal(
      shipNoTrack.errorCode,
      'PRECONDITION_FAILED_MISSING_TRACKING'
    );

    // Ship with tracking succeeds
    const trShip = executeOrderStateTransition({
      orderNo,
      toState: 'shipped',
      actorUsername: 'packer_rafi',
      actorRole: 'packaging_manager',
      idempotencyKey: `tr-ship-${orderNo}`,
      courierProvider: 'steadfast',
      consignmentId: `CN-${orderNo}`,
      trackingCode: `SF-${orderNo}`,
      reasonBn: 'কুরিয়ারে হ্যান্ডওভার সম্পন্ন',
    });
    assert.equal(trShip.success, true);

    // Direct cancellation after dispatch is blocked
    const cancelAfterShip = evaluateAndExecuteOrderCancellation({
      orderNo,
      actorUsername: 'admin',
      actorRole: 'super_admin',
      reasonBn: 'শিপমেন্টের পর ক্যান্সেল চেষ্টা',
      idempotencyKey: `tr-cancel-shipped-${orderNo}`,
    });
    assert.equal(cancelAfterShip.success, false);
    assert.ok(
      cancelAfterShip.errorBn?.includes('CANCELLATION_BLOCKED_AFTER_DISPATCH')
    );

    // Deliver order
    const trDeliver = executeOrderStateTransition({
      orderNo,
      toState: 'delivered',
      actorUsername: 'packer_rafi',
      actorRole: 'packaging_manager',
      idempotencyKey: `tr-deliv-${orderNo}`,
      reasonBn: 'ডেলিভারি সম্পন্ন',
    });
    assert.equal(trDeliver.success, true);

    // 3. Return Eligibility: Late return (> 7 days) without override reason is blocked
    const lateReturn = inspectAndResolveOrderReturn(packagingCtx, {
      orderNo,
      variantId: vr.variantId,
      returnQty: 1,
      faultType: 'CUSTOMER_INTACT_RETURN',
      inspectionDecision: 'RESTOCK_INTACT',
      deliveredAtIso: '2026-10-01T10:00:00.000Z',
      inspectedAtIso: '2026-10-15T10:00:00.000Z', // 14 days later
      wasInHoldPeriod: false,
      wasAlreadyPaidOut: true,
      inspectionNoteBn: 'বিলম্বিত রিটার্ন টেস্ট',
    });
    assert.equal(lateReturn.success, false);
    assert.ok(lateReturn.errorBn?.includes('RETURN_WINDOW_EXPIRED'));

    // 4. Partial Return #1 (1 unit Intact Restock within 7 days)
    const intactReturn = inspectAndResolveOrderReturn(packagingCtx, {
      orderNo,
      variantId: vr.variantId,
      returnQty: 1,
      faultType: 'CUSTOMER_INTACT_RETURN',
      inspectionDecision: 'RESTOCK_INTACT',
      deliveredAtIso: '2026-11-08T10:00:00.000Z',
      inspectedAtIso: '2026-11-09T10:00:00.000Z',
      wasInHoldPeriod: true,
      wasAlreadyPaidOut: false,
      inspectionNoteBn: '১টি শাড়ি সম্পূর্ণ অক্ষত অবস্থায় ফেরত এসেছে; রিস্টক করা হলো।',
    });
    assert.equal(intactReturn.success, true);
    assert.equal(intactReturn.inspectionRecord?.restockedQty, 1);
    assert.equal(intactReturn.inspectionRecord?.damagedQuarantinedQty, 0);

    // 5. Partial Return #2 (1 unit Supplier Defect -> Damaged Quarantine)
    const damagedReturn = inspectAndResolveOrderReturn(superAdminCtx, {
      orderNo,
      variantId: vr.variantId,
      returnQty: 1,
      faultType: 'SUPPLIER_DEFECT',
      inspectionDecision: 'QUARANTINE_DAMAGED',
      deliveredAtIso: '2026-11-08T10:00:00.000Z',
      inspectedAtIso: '2026-11-09T12:00:00.000Z',
      wasInHoldPeriod: false,
      wasAlreadyPaidOut: true,
      inspectionNoteBn: '১টি শাড়িতে বুনন ত্রুটি পাওয়া গেছে; ড্যামেজ কোয়ারেন্টাইনে রাখা হলো।',
    });
    assert.equal(damagedReturn.success, true);
    assert.equal(damagedReturn.inspectionRecord?.restockedQty, 0);
    assert.equal(damagedReturn.inspectionRecord?.damagedQuarantinedQty, 1);
    assert.ok((damagedReturn.inspectionRecord?.vendorDebitPoisha ?? 0) > 0);

    const orthoFinal = computeOrthogonalOrderState(orderNo);
    assert.equal(orthoFinal?.orderStatus, 'returned');
  });
});
