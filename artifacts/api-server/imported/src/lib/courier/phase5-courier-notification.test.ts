// src/lib/courier/phase5-courier-notification.test.ts
// Phase 5 — Courier Adapter Architecture (Pathao, Steadfast, Bangladesh Post Manual),
//           Durable Webhook Queue (HMAC, Replay, Retry/DLQ, Manual Reconciliation),
//           and Non-Blocking OTP vs. Transactional Notification Tests (Section 8)

import crypto from 'node:crypto';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import type { ActorSecurityContext } from '../../types/permissions';
import { createStorefrontOrder } from '../db/repository';
import {
  dispatchSecurityOtpNotification,
  dispatchTransactionalOrderNotificationSafe,
  getAllCourierCapabilityMatrices,
  getCourierProviderAdapter,
  ingestDurableCourierWebhook,
  reconcileWebhookEventManually,
  updateBangladeshPostManualStatus,
} from './phase5-courier-notification-engine';

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

describe('Phase 5 — Courier Adapter Architecture, Webhook DLQ & Non-Blocking Notifications (Section 8)', () => {
  it('8.1, 8.2 & 8.4: isolates Pathao, Steadfast, and Bangladesh Post Manual adapters, enforces VERIFY_REQUIRED capability flags, blocks unauthorized live bookings, and executes Bangladesh Post manual workflow', () => {
    const matrices = getAllCourierCapabilityMatrices();
    assert.equal(matrices.length, 3);

    const pathaoCap = matrices.find((m) => m.provider === 'pathao')!;
    const steadfastCap = matrices.find((m) => m.provider === 'steadfast')!;
    const bdPostCap = matrices.find((m) => m.provider === 'bd_post')!;

    assert.equal(pathaoCap.capabilities.rateLimits, 'VERIFY_REQUIRED');
    assert.equal(steadfastCap.capabilities.rateLimits, 'VERIFY_REQUIRED');
    assert.equal(bdPostCap.integrationMode, 'MANUAL_WORKFLOW_ONLY');
    assert.equal(bdPostCap.capabilities.createShipment, 'MANUAL_ONLY');

    const pathaoAdapter = getCourierProviderAdapter('pathao');
    const steadfastAdapter = getCourierProviderAdapter('steadfast');
    const bdPostAdapter = getCourierProviderAdapter('bd_post');

    // 1. Live external courier booking is blocked by default without explicit authorization
    const blockedLive = pathaoAdapter.createShipment({
      orderNo: 'ORD-261106-0001',
      idempotencyKey: `idem-live-blk-${Date.now()}`,
      recipientName: 'তানভীর আহমেদ',
      recipientPhone: '01711223344',
      districtId: 47,
      districtNameBn: 'ঢাকা',
      upazilaId: 365,
      upazilaNameBn: 'ধানমন্ডি',
      streetAddress: 'বাড়ি ১২, রোড ৫, ধানমন্ডি',
      landmark: 'সাত মসজিদ রোড',
      codCollectablePoisha: 245000,
      totalWeightGrams: 600,
      itemDescriptionBn: 'ঢাকাই জামদানি শাড়ি',
      allowLiveExternalBooking: true,
    });
    assert.equal(blockedLive.success, false);
    assert.equal(blockedLive.errorCode, 'LIVE_COURIER_BOOKING_LOCKED');

    // 2. Pathao Sandbox Booking uses isolated Pathao Aladdin schema + idempotency
    const pathaoKey = `idem-pth-${Date.now()}`;
    const pthBook1 = pathaoAdapter.createShipment({
      orderNo: 'ORD-261106-0001',
      idempotencyKey: pathaoKey,
      recipientName: 'তানভীর আহমেদ',
      recipientPhone: '01711223344',
      districtId: 47,
      districtNameBn: 'ঢাকা',
      upazilaId: 365,
      upazilaNameBn: 'ধানমন্ডি',
      streetAddress: 'বাড়ি ১২, রোড ৫, ধানমন্ডি',
      landmark: 'সাত মসজিদ রোড',
      codCollectablePoisha: 245000,
      totalWeightGrams: 600,
      itemDescriptionBn: 'ঢাকাই জামদানি শাড়ি',
    });
    assert.equal(pthBook1.success, true);
    assert.equal(pthBook1.mode, 'SANDBOX_SIMULATION');
    assert.equal(
      pthBook1.providerRawEnvelope.adapter,
      'PathaoCourierAdapter'
    );
    assert.ok('recipient_city' in pthBook1.providerRawEnvelope);
    assert.ok(!('invoice' in pthBook1.providerRawEnvelope));

    // Idempotent replay returns same consignmentId
    const pthBookReplay = pathaoAdapter.createShipment({
      orderNo: 'ORD-261106-0001',
      idempotencyKey: pathaoKey,
      recipientName: 'তানভীর আহমেদ',
      recipientPhone: '01711223344',
      districtId: 47,
      districtNameBn: 'ঢাকা',
      upazilaId: 365,
      upazilaNameBn: 'ধানমন্ডি',
      streetAddress: 'বাড়ি ১২, রোড ৫, ধানমন্ডি',
      landmark: 'সাত মসজিদ রোড',
      codCollectablePoisha: 245000,
      totalWeightGrams: 600,
      itemDescriptionBn: 'ঢাকাই জামদানি শাড়ি',
    });
    assert.equal(pthBookReplay.idempotentReplay, true);
    assert.equal(pthBookReplay.consignmentId, pthBook1.consignmentId);

    // 3. Steadfast Sandbox Booking uses isolated Packzy schema
    const sfBook = steadfastAdapter.createShipment({
      orderNo: 'ORD-261106-0001',
      idempotencyKey: `idem-sf-${Date.now()}`,
      recipientName: 'তানভীর আহমেদ',
      recipientPhone: '01711223344',
      districtId: 47,
      districtNameBn: 'ঢাকা',
      upazilaId: 365,
      upazilaNameBn: 'ধানমন্ডি',
      streetAddress: 'বাড়ি ১২, রোড ৫, ধানমন্ডি',
      landmark: 'সাত মসজিদ রোড',
      codCollectablePoisha: 245000,
      totalWeightGrams: 600,
      itemDescriptionBn: 'ঢাকাই জামদানি শাড়ি',
    });
    assert.equal(sfBook.success, true);
    assert.equal(
      sfBook.providerRawEnvelope.adapter,
      'SteadfastCourierAdapter'
    );
    assert.ok('invoice' in sfBook.providerRawEnvelope);
    assert.ok(!('recipient_city' in sfBook.providerRawEnvelope));

    // 4. Bangladesh Post Manual Adapter rejects missing counter receipt number (zero fake API)
    const bdPostMissingReceipt = bdPostAdapter.createShipment({
      orderNo: 'ORD-261106-0001',
      idempotencyKey: `idem-bdp-fail-${Date.now()}`,
      recipientName: 'তানভীর আহমেদ',
      recipientPhone: '01711223344',
      districtId: 1,
      districtNameBn: 'পঞ্চগড়',
      upazilaId: 1,
      upazilaNameBn: 'পঞ্চগড় সদর',
      streetAddress: 'তেঁতুলিয়া রোড, পঞ্চগড় সদর',
      landmark: 'পঞ্চগড় ডাকঘরের পাশে',
      codCollectablePoisha: 180000,
      totalWeightGrams: 1200,
      itemDescriptionBn: 'হাতে বোনা নকশিকাঁথা',
    });
    assert.equal(bdPostMissingReceipt.success, false);
    assert.equal(
      bdPostMissingReceipt.errorCode,
      'BDPOST_MANUAL_RECEIPT_REQUIRED'
    );

    // Valid Bangladesh Post Manual Counter Booking & Manual Status Update
    const bdPostOk = bdPostAdapter.createShipment({
      orderNo: 'ORD-261106-0001',
      idempotencyKey: `idem-bdp-ok-${Date.now()}`,
      recipientName: 'তানভীর আহমেদ',
      recipientPhone: '01711223344',
      districtId: 1,
      districtNameBn: 'পঞ্চগড়',
      upazilaId: 1,
      upazilaNameBn: 'পঞ্চগড় সদর',
      streetAddress: 'তেঁতুলিয়া রোড, পঞ্চগড় সদর',
      landmark: 'পঞ্চগড় ডাকঘরের পাশে',
      codCollectablePoisha: 180000,
      totalWeightGrams: 1200,
      itemDescriptionBn: 'হাতে বোনা নকশিকাঁথা',
      manualPostOfficeReceiptNo: 'VPP-PNC-778899',
      manualPostOfficeBranchBn: 'পঞ্চবিন্দু প্রধান ডাকঘর (৫০০০)',
    });
    assert.equal(bdPostOk.success, true);
    assert.equal(bdPostOk.mode, 'MANUAL_BOOKING');
    assert.equal(bdPostOk.trackingCode, 'VPP-PNC-778899');

    const manualUpdate = updateBangladeshPostManualStatus(packagingCtx, {
      orderNo: 'ORD-261106-0001',
      receiptTrackingCode: 'VPP-PNC-778899',
      postOfficeBranchBn: 'পঞ্চগড় প্রধান ডাকঘর (৫০০০)',
      newStatus: 'shipped',
      noteBn: 'ডাকঘর কাউন্টারে পার্সেল হস্তান্তর ও রিসিট এন্ট্রি সম্পন্ন।',
    });
    assert.equal(manualUpdate.success, true);
    assert.equal(manualUpdate.trackingCode, 'VPP-PNC-778899');
  });

  it('8.3: enforces HMAC signature verification, replay deduplication, retry -> dead-letter queue transitions, and manual reconciliation on webhooks', () => {
    const orderRes = createStorefrontOrder({
      customerName: 'ওয়েবহুক টেস্ট ক্রেতা',
      customerPhone: '01755667788',
      districtId: 47,
      upazilaId: 365,
      streetAddress: 'বাড়ি ২০, রোড ৯, ধানমন্ডি আবাসিক এলাকা',
      landmark: 'ধানমন্ডি ঈদগাহ মাঠের পাশে',
      deliveryMethod: 'courier',
      paymentMethod: 'cod',
      advancePaidPoisha: 0,
      customerNote: '',
      internalStaffNote: '',
      source: 'storefront',
      idempotencyKey: `idem-wh-ord-${Date.now()}`,
      items: [
        {
          productId: '00000000-0000-4000-8000-000000000101',
          variantId: '00000000-0000-4000-8000-000000000201',
          quantity: 1,
        },
      ],
    });
    assert.equal(orderRes.success, true);
    const orderNo = orderRes.order!.orderNo;

    const secret = 'test-steadfast-webhook-secret-2026';
    const rawPayload = JSON.stringify({
      eventId: `ev-ok-${Date.now()}`,
      orderNo,
      rawStatus: 'delivered',
      collectedCodPoisha: orderRes.order!.codCollectablePoisha,
    });
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(rawPayload)
      .digest('hex');

    // 1. Tampered signature is rejected fail-closed (401)
    const badSigRes = ingestDurableCourierWebhook({
      provider: 'steadfast',
      rawPayload,
      signatureHeader: 'deadbeef0000',
      secret,
      parsedEvent: {
        eventId: `ev-bad-${Date.now()}`,
        orderNo,
        rawStatus: 'delivered',
      },
    });
    assert.equal(badSigRes.success, false);
    assert.equal(badSigRes.httpStatus, 401);
    assert.equal(badSigRes.eventRecord.status, 'REJECTED_SIGNATURE');

    // 2. Valid signature processes event and Replay with same eventId returns idempotent 200
    const eventIdOk = `ev-ok-${Date.now()}`;
    const okRes = ingestDurableCourierWebhook({
      provider: 'steadfast',
      rawPayload,
      signatureHeader: validSignature,
      secret,
      parsedEvent: {
        eventId: eventIdOk,
        orderNo,
        rawStatus: 'delivered',
        collectedCodPoisha: orderRes.order!.codCollectablePoisha,
      },
    });
    assert.equal(okRes.success, true);
    assert.equal(okRes.idempotentReplay, false);
    assert.equal(okRes.eventRecord.status, 'PROCESSED');

    const replayRes = ingestDurableCourierWebhook({
      provider: 'steadfast',
      rawPayload,
      signatureHeader: validSignature,
      secret,
      parsedEvent: {
        eventId: eventIdOk,
        orderNo,
        rawStatus: 'delivered',
      },
    });
    assert.equal(replayRes.success, true);
    assert.equal(replayRes.idempotentReplay, true);

    // 3. Transient failure retries up to maxRetries=2 -> transitions to DEAD_LETTER -> manually reconciled
    const dlqEventId = `ev-dlq-${Date.now()}`;
    const attempt1 = ingestDurableCourierWebhook({
      provider: 'pathao',
      rawPayload,
      signatureHeader: validSignature,
      secret,
      maxRetries: 2,
      simulateTransientProcessingFailure: true,
      parsedEvent: {
        eventId: dlqEventId,
        orderNo,
        rawStatus: 'picked',
      },
    });
    assert.equal(attempt1.success, false);
    assert.equal(attempt1.eventRecord.status, 'RETRY_SCHEDULED');
    assert.equal(attempt1.eventRecord.retryCount, 1);

    const attempt2 = ingestDurableCourierWebhook({
      provider: 'pathao',
      rawPayload,
      signatureHeader: validSignature,
      secret,
      maxRetries: 2,
      simulateTransientProcessingFailure: true,
      parsedEvent: {
        eventId: dlqEventId,
        orderNo,
        rawStatus: 'picked',
      },
    });
    assert.equal(attempt2.success, false);
    assert.equal(attempt2.eventRecord.status, 'DEAD_LETTER');
    assert.equal(attempt2.eventRecord.retryCount, 2);

    // Manual reconciliation resolves the Dead-Letter event
    const manualRec = reconcileWebhookEventManually(packagingCtx, {
      webhookEventId: dlqEventId,
      targetOrderNo: orderNo,
      noteBn: 'পাঠাও পোর্টাল ট্র্যাকিংয়ের সাথে মিলিয়ে ম্যানুয়ালি রিকনসাইল করা হলো।',
    });
    assert.equal(manualRec.success, true);
    assert.equal(manualRec.eventRecord?.status, 'MANUALLY_RECONCILED');
  });

  it('8.5: separates SECURITY_OTP from TRANSACTIONAL_ORDER notifications, redacts OTP codes/secrets in logs, and isolates provider failures so Order/Payment transactions never fail', () => {
    // 1. Security OTP notification redacts plaintext 6-digit OTP from delivery logs
    const otpDispatch = dispatchSecurityOtpNotification({
      recipientPhone: '01711223344',
      otpPlaintextCode: '849201',
      purpose: 'CUSTOMER_ACCOUNT_LOGIN',
    });
    assert.equal(otpDispatch.category, 'SECURITY_OTP');
    assert.equal(otpDispatch.dispatched, false, 'placeholder must not claim SMS delivery');
    assert.ok(
      !otpDispatch.logRecord.sanitizedMessagePreview.includes('849201'),
      'Plaintext OTP must never appear in notification delivery logs'
    );
    assert.ok(
      otpDispatch.logRecord.sanitizedMessagePreview.includes('[REDACTED_OTP]')
    );
    assert.equal(otpDispatch.logRecord.recipientMasked, '0171****344');

    // 2. Transactional Order notification with simulated SMS/Email provider outage NEVER throws or aborts the order transaction
    const txDispatch = dispatchTransactionalOrderNotificationSafe({
      orderNo: 'ORD-261106-0001',
      recipientPhone: '01711223344',
      eventTitleBn: 'অর্ডার কনফার্মেশন বার্তা',
      messageBn:
        'আপনার অর্ডার #ORD-261106-0001 কনফার্ম হয়েছে। Bearer secret_token_12345',
      channels: [
        'IN_APP',
        'WA_ME_FREE_LINK',
        'HTTP_SMS_ADAPTER_PLACEHOLDER',
        'RESEND_EMAIL_ADAPTER_PLACEHOLDER',
      ],
      simulateProviderFailure: true,
    });

    assert.equal(txDispatch.orderTransactionIntact, true);
    assert.ok(txDispatch.inAppNotification.notificationId);
    assert.equal(txDispatch.deliveryLogs.length, 4);

    const inAppLog = txDispatch.deliveryLogs.find(
      (l) => l.channel === 'IN_APP'
    )!;
    const waMeLog = txDispatch.deliveryLogs.find(
      (l) => l.channel === 'WA_ME_FREE_LINK'
    )!;
    const failedSmsLog = txDispatch.deliveryLogs.find(
      (l) => l.channel === 'HTTP_SMS_ADAPTER_PLACEHOLDER'
    )!;

    assert.equal(inAppLog.status, 'DELIVERED_IN_APP');
    assert.equal(waMeLog.status, 'READY_FREE_DEEP_LINK');
    assert.ok(waMeLog.deepLinkUrl?.startsWith('https://wa.me/8801711223344'));
    assert.equal(failedSmsLog.status, 'FAILED_NON_BLOCKING');
    assert.ok(
      !failedSmsLog.sanitizedMessagePreview.includes('secret_token_12345'),
      'Bearer secrets must be redacted in notification logs'
    );
  });
});
