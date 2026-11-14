// src/lib/courier/phase5-courier-notification-engine.ts
// Phase 5 — Courier Adapter Architecture (Pathao, Steadfast, Bangladesh Post Manual),
//           Durable Webhook Queue with Retry & Dead-Letter Handling,
//           and Non-Blocking OTP vs. Transactional Notification Engine
//
// Governance Rules (Section 8):
//   - Provider-specific models and logic are strictly isolated per adapter (Pathao, Steadfast, Bangladesh Post Manual).
//   - Unverified external API capabilities are explicitly tagged `VERIFY_REQUIRED`.
//   - Live external courier booking is disabled by default (`allowLiveBooking: false`) unless explicitly authorized.
//   - Bangladesh Post (`bd_post`) uses a 100% honest Admin Manual Booking & Tracking workflow (zero fake API calls).
//   - OTP and Transactional Notifications are strictly separated; notification failures NEVER break Order/Payment transactions.

import crypto from 'node:crypto';
import path from 'node:path';
import { readLocalJsonStore, writeLocalJsonStore } from '../db/local-json-store';
import type { CourierProvider, OrderStatus } from '../../types/database.types';
import type { Poisha } from '../../types/domain';
import type { ActorSecurityContext } from '../../types/permissions';
import {
  appendImmutableAuditLog,
  readAdminStore,
  writeAdminStore,
} from '../admin/phase4a-service';
import {
  verifyCourierWebhookHmac,
} from '../admin/phase6-service';
import { readErpState, writeErpState } from '../db/repository';
import { assertIntegerPoisha, calculateDeliveryCharge } from '../money';
import { getLiveCourierTrackingUrl } from './tracking-urls';

// ============================================================================
// 1. COURIER CAPABILITIES MATRIX & ADAPTER CONTRACT (8.1 & 8.2)
// ============================================================================

export type CapabilityVerificationStatus =
  | 'VERIFIED_LOCAL_WORKFLOW'
  | 'SANDBOX_ADAPTER_READY'
  | 'MANUAL_ONLY'
  | 'VERIFY_REQUIRED';

export interface CourierCapabilityMatrix {
  provider: 'pathao' | 'steadfast' | 'bd_post';
  providerNameBn: string;
  providerNameEn: string;
  integrationMode: 'REST_ADAPTER_OR_SANDBOX' | 'MANUAL_WORKFLOW_ONLY';
  capabilities: {
    createShipment: CapabilityVerificationStatus;
    cancelShipment: CapabilityVerificationStatus;
    tracking: CapabilityVerificationStatus;
    statusWebhook: CapabilityVerificationStatus;
    codAmount: CapabilityVerificationStatus;
    deliveryCharge: CapabilityVerificationStatus;
    returnExchange: CapabilityVerificationStatus;
    coverage: CapabilityVerificationStatus;
    codRemittance: CapabilityVerificationStatus;
    errorCodes: CapabilityVerificationStatus;
    rateLimits: CapabilityVerificationStatus;
    sandbox: CapabilityVerificationStatus;
  };
  rateLimitPolicy: {
    maxRequestsPerMinute: number;
    burstLimit: number;
    verificationNote: string;
  };
  errorCodesCatalog: Record<string, string>;
}

export interface CanonicalShipmentBookingInput {
  orderNo: string;
  idempotencyKey: string;
  recipientName: string;
  recipientPhone: string;
  districtId: number;
  districtNameBn: string;
  upazilaId: number;
  upazilaNameBn: string;
  streetAddress: string;
  landmark: string;
  codCollectablePoisha: Poisha;
  totalWeightGrams: number;
  itemDescriptionBn: string;
  specialInstructionBn?: string;
  // Bangladesh Post manual fields
  manualPostOfficeReceiptNo?: string;
  manualPostOfficeBranchBn?: string;
  // Safety guard: never hit live external courier endpoints without explicit permission
  allowLiveExternalBooking?: boolean;
}

export interface CanonicalShipmentBookingResult {
  success: boolean;
  provider: 'pathao' | 'steadfast' | 'bd_post';
  mode: 'SANDBOX_SIMULATION' | 'MANUAL_BOOKING' | 'BLOCKED_LIVE_NOT_AUTHORIZED';
  idempotentReplay: boolean;
  orderNo: string;
  consignmentId: string | null;
  trackingCode: string | null;
  trackingUrl: string | null;
  estimatedDeliveryChargePoisha: Poisha;
  codCollectablePoisha: Poisha;
  providerRawEnvelope: Record<string, unknown>;
  errorCode?: string;
  errorBn?: string;
}

export type CanonicalShipmentLifecycleStatus =
  | 'BOOKED_PENDING_PICKUP'
  | 'IN_TRANSIT'
  | 'OUT_FOR_DELIVERY'
  | 'DELIVERED'
  | 'PARTIALLY_DELIVERED'
  | 'RETURN_IN_TRANSIT'
  | 'RETURNED_TO_WAREHOUSE'
  | 'ON_HOLD'
  | 'CANCELLED';

export interface CourierProviderAdapter {
  readonly providerKey: 'pathao' | 'steadfast' | 'bd_post';
  getCapabilities(): CourierCapabilityMatrix;
  estimateDeliveryChargePoisha(params: {
    districtId: number;
    totalWeightGrams: number;
    orderSubtotalPoisha: Poisha;
  }): Poisha;
  createShipment(
    input: CanonicalShipmentBookingInput
  ): CanonicalShipmentBookingResult;
  cancelShipment(params: {
    orderNo: string;
    consignmentId: string;
    reasonBn: string;
    actorUsername: string;
  }): {
    success: boolean;
    status: 'CANCELLED_IN_SANDBOX' | 'CANCELLED_MANUAL' | 'CANNOT_CANCEL_AFTER_DISPATCH' | 'VERIFY_REQUIRED';
    messageBn: string;
  };
  mapWebhookStatusToCanonical(rawProviderStatus: string): {
    canonicalStatus: CanonicalShipmentLifecycleStatus;
    mappedOrderStatus: OrderStatus | null;
  };
}

// ============================================================================
// 2. ISOLATED PROVIDER ADAPTERS: PATHAO, STEADFAST & BANGLADESH POST (8.1, 8.2, 8.4)
// ============================================================================

/**
 * 2.1 Pathao Courier Adapter (`pathao`)
 * Uses Pathao's isolated merchant data model (`store_id`, `recipient_city`, `recipient_zone`, `amount_to_collect`, `item_weight`).
 */
export class PathaoCourierAdapter implements CourierProviderAdapter {
  readonly providerKey = 'pathao' as const;

  getCapabilities(): CourierCapabilityMatrix {
    return {
      provider: 'pathao',
      providerNameBn: 'পাঠাও কুরিয়ার (Pathao Courier)',
      providerNameEn: 'Pathao Courier Aladdin API',
      integrationMode: 'REST_ADAPTER_OR_SANDBOX',
      capabilities: {
        createShipment: 'SANDBOX_ADAPTER_READY',
        cancelShipment: 'VERIFY_REQUIRED',
        tracking: 'VERIFIED_LOCAL_WORKFLOW',
        statusWebhook: 'SANDBOX_ADAPTER_READY',
        codAmount: 'VERIFIED_LOCAL_WORKFLOW',
        deliveryCharge: 'VERIFIED_LOCAL_WORKFLOW',
        returnExchange: 'VERIFY_REQUIRED',
        coverage: 'VERIFIED_LOCAL_WORKFLOW',
        codRemittance: 'VERIFIED_LOCAL_WORKFLOW',
        errorCodes: 'SANDBOX_ADAPTER_READY',
        rateLimits: 'VERIFY_REQUIRED',
        sandbox: 'SANDBOX_ADAPTER_READY',
      },
      rateLimitPolicy: {
        maxRequestsPerMinute: 60,
        burstLimit: 15,
        verificationNote:
          'VERIFY_REQUIRED: Official Pathao Aladdin production rate limits depend on merchant tier.',
      },
      errorCodesCatalog: {
        PATHAO_401_UNAUTHORIZED: 'Invalid or expired OAuth2 bearer token.',
        PATHAO_422_VALIDATION: 'Invalid recipient_phone, recipient_city, or item_weight.',
        PATHAO_429_RATE_LIMIT: 'Rate limit exceeded on Pathao merchant API.',
      },
    };
  }

  estimateDeliveryChargePoisha(params: {
    districtId: number;
    totalWeightGrams: number;
    orderSubtotalPoisha: Poisha;
  }): Poisha {
    const isDhaka = params.districtId === 47;
    const base1KgPoisha = isDhaka ? 7000 : 12000;
    const extraPerKgPoisha = 2000;
    const res = calculateDeliveryCharge({
      method: 'courier',
      totalWeightGrams: params.totalWeightGrams,
      orderSubtotalPoisha: params.orderSubtotalPoisha,
      freeDeliveryThresholdPoisha: 0,
      isGlobalFreeDelivery: false,
      isAllItemsFreeDelivery: false,
      courierBaseRate1KgPoisha: base1KgPoisha,
      courierExtraPerKgPoisha: extraPerKgPoisha,
      bdPostPerKgPoisha: 6000,
    });
    return res.actualCourierCostPoisha;
  }

  createShipment(
    input: CanonicalShipmentBookingInput
  ): CanonicalShipmentBookingResult {
    assertIntegerPoisha(input.codCollectablePoisha, 'codCollectablePoisha');

    if (input.allowLiveExternalBooking) {
      return {
        success: false,
        provider: 'pathao',
        mode: 'BLOCKED_LIVE_NOT_AUTHORIZED',
        idempotentReplay: false,
        orderNo: input.orderNo,
        consignmentId: null,
        trackingCode: null,
        trackingUrl: null,
        estimatedDeliveryChargePoisha: 0,
        codCollectablePoisha: input.codCollectablePoisha,
        providerRawEnvelope: {},
        errorCode: 'LIVE_COURIER_BOOKING_LOCKED',
        errorBn:
          'অনুমতি ছাড়া লাইভ পাঠাও কুরিয়ার বুকিং নিষিদ্ধ (Section 8 Gate)। স্যান্ডবক্স বা ম্যানুয়াল মোড ব্যবহার করুন।',
      };
    }

    const store = readPhase5Store();
    const existing = store.shipmentBookings.find(
      (b) =>
        b.provider === 'pathao' && b.idempotencyKey === input.idempotencyKey
    );
    if (existing) {
      return {
        ...existing,
        idempotentReplay: true,
      };
    }

    if (input.streetAddress.trim().length < 8) {
      return {
        success: false,
        provider: 'pathao',
        mode: 'SANDBOX_SIMULATION',
        idempotentReplay: false,
        orderNo: input.orderNo,
        consignmentId: null,
        trackingCode: null,
        trackingUrl: null,
        estimatedDeliveryChargePoisha: 0,
        codCollectablePoisha: input.codCollectablePoisha,
        providerRawEnvelope: { code: 'PATHAO_422_VALIDATION' },
        errorCode: 'PATHAO_422_VALIDATION',
        errorBn: 'পাঠাও বুকিংয়ের জন্য সম্পূর্ণ রাস্তার ঠিকানা (কমপক্ষে ৮ অক্ষর) আবশ্যক।',
      };
    }

    const estimatedCharge = this.estimateDeliveryChargePoisha({
      districtId: input.districtId,
      totalWeightGrams: input.totalWeightGrams,
      orderSubtotalPoisha: input.codCollectablePoisha,
    });

    const deterministicSuffix = crypto
      .createHash('sha256')
      .update(`pathao:${input.orderNo}:${input.idempotencyKey}`)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();

    const consignmentId = `PTH-CN-${deterministicSuffix}`;
    const trackingCode = `PTH-${deterministicSuffix}`;
    const trackingUrl = getLiveCourierTrackingUrl(
      'pathao',
      trackingCode,
      consignmentId,
      input.orderNo
    );

    // Isolated Pathao Aladdin payload schema (does not share Steadfast or BD Post fields)
    const pathaoEnvelope = {
      adapter: 'PathaoCourierAdapter',
      merchant_order_id: input.orderNo,
      recipient_name: input.recipientName,
      recipient_phone: input.recipientPhone,
      recipient_address: `${input.streetAddress}, ${input.upazilaNameBn}, ${input.districtNameBn}`,
      recipient_city: input.districtId,
      recipient_zone: input.upazilaId,
      delivery_type: 48, // Normal Delivery
      item_type: 2, // Parcel
      item_quantity: 1,
      item_weight: Number(Math.max(0.5, input.totalWeightGrams / 1000).toFixed(2)),
      amount_to_collect: Math.floor(input.codCollectablePoisha / 100),
      consignment_id: consignmentId,
      order_status: 'Pending',
    };

    const booking: CanonicalShipmentBookingResult = {
      success: true,
      provider: 'pathao',
      mode: 'SANDBOX_SIMULATION',
      idempotentReplay: false,
      orderNo: input.orderNo,
      consignmentId,
      trackingCode,
      trackingUrl,
      estimatedDeliveryChargePoisha: estimatedCharge,
      codCollectablePoisha: input.codCollectablePoisha,
      providerRawEnvelope: pathaoEnvelope,
    };

    store.shipmentBookings.unshift({
      ...booking,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString(),
    });
    writePhase5Store(store);

    return booking;
  }

  cancelShipment(params: {
    orderNo: string;
    consignmentId: string;
    reasonBn: string;
    actorUsername: string;
  }) {
    const erp = readErpState();
    const order = erp.orders.find((o) => o.orderNo === params.orderNo);
    if (
      order &&
      ['shipped', 'out_for_delivery', 'delivered'].includes(order.status)
    ) {
      return {
        success: false,
        status: 'CANNOT_CANCEL_AFTER_DISPATCH' as const,
        messageBn:
          'কুরিয়ারে হ্যান্ডওভার হওয়ার পর পাঠাও শিপমেন্ট সরাসরি ক্যান্সেল করা যাবে না।',
      };
    }
    return {
      success: true,
      status: 'CANCELLED_IN_SANDBOX' as const,
      messageBn: `পাঠাও স্যান্ডবক্স কনসাইনমেন্ট (${params.consignmentId}) বাতিল করা হয়েছে (VERIFY_REQUIRED for live API cancellation endpoint)।`,
    };
  }

  mapWebhookStatusToCanonical(rawProviderStatus: string): {
    canonicalStatus: CanonicalShipmentLifecycleStatus;
    mappedOrderStatus: OrderStatus | null;
  } {
    const normalized = rawProviderStatus.trim().toLowerCase();
    switch (normalized) {
      case 'pickup_requested':
      case 'assigned_for_pickup':
        return {
          canonicalStatus: 'BOOKED_PENDING_PICKUP',
          mappedOrderStatus: 'packed',
        };
      case 'picked':
      case 'in_transit':
      case 'at_the_sorting_hub':
        return {
          canonicalStatus: 'IN_TRANSIT',
          mappedOrderStatus: 'shipped',
        };
      case 'assigned_for_delivery':
      case 'out_for_delivery':
        return {
          canonicalStatus: 'OUT_FOR_DELIVERY',
          mappedOrderStatus: 'out_for_delivery',
        };
      case 'delivered':
        return {
          canonicalStatus: 'DELIVERED',
          mappedOrderStatus: 'delivered',
        };
      case 'partial_delivery':
      case 'partial_delivered':
        return {
          canonicalStatus: 'PARTIALLY_DELIVERED',
          mappedOrderStatus: 'out_for_delivery',
        };
      case 'return':
      case 'returned':
        return {
          canonicalStatus: 'RETURNED_TO_WAREHOUSE',
          mappedOrderStatus: 'returned',
        };
      case 'on_hold':
      case 'hold':
        return {
          canonicalStatus: 'ON_HOLD',
          mappedOrderStatus: null,
        };
      default:
        return {
          canonicalStatus: 'IN_TRANSIT',
          mappedOrderStatus: null,
        };
    }
  }
}

/**
 * 2.2 Steadfast Courier Adapter (`steadfast`)
 * Uses Steadfast's isolated Packzy data model (`invoice`, `recipient_name`, `recipient_phone`, `recipient_address`, `cod_amount`).
 */
export class SteadfastCourierAdapter implements CourierProviderAdapter {
  readonly providerKey = 'steadfast' as const;

  getCapabilities(): CourierCapabilityMatrix {
    return {
      provider: 'steadfast',
      providerNameBn: 'স্টেডফাস্ট কুরিয়ার (Steadfast Courier)',
      providerNameEn: 'Steadfast Packzy Courier API',
      integrationMode: 'REST_ADAPTER_OR_SANDBOX',
      capabilities: {
        createShipment: 'SANDBOX_ADAPTER_READY',
        cancelShipment: 'VERIFY_REQUIRED',
        tracking: 'VERIFIED_LOCAL_WORKFLOW',
        statusWebhook: 'SANDBOX_ADAPTER_READY',
        codAmount: 'VERIFIED_LOCAL_WORKFLOW',
        deliveryCharge: 'VERIFIED_LOCAL_WORKFLOW',
        returnExchange: 'VERIFY_REQUIRED',
        coverage: 'VERIFIED_LOCAL_WORKFLOW',
        codRemittance: 'VERIFIED_LOCAL_WORKFLOW',
        errorCodes: 'SANDBOX_ADAPTER_READY',
        rateLimits: 'VERIFY_REQUIRED',
        sandbox: 'SANDBOX_ADAPTER_READY',
      },
      rateLimitPolicy: {
        maxRequestsPerMinute: 60,
        burstLimit: 20,
        verificationNote:
          'VERIFY_REQUIRED: Steadfast Packzy bulk order creation and polling rate limits require live merchant API key verification.',
      },
      errorCodesCatalog: {
        STEADFAST_401_KEY_INVALID: 'Invalid Api-Key or Secret-Key header.',
        STEADFAST_422_INVALID_INVOICE: 'Missing or duplicate invoice / phone format.',
        STEADFAST_429_THROTTLED: 'Too many requests to Packzy API.',
      },
    };
  }

  estimateDeliveryChargePoisha(params: {
    districtId: number;
    totalWeightGrams: number;
    orderSubtotalPoisha: Poisha;
  }): Poisha {
    const isDhaka = params.districtId === 47;
    const base1KgPoisha = isDhaka ? 6500 : 11500;
    const extraPerKgPoisha = 2000;
    const res = calculateDeliveryCharge({
      method: 'courier',
      totalWeightGrams: params.totalWeightGrams,
      orderSubtotalPoisha: params.orderSubtotalPoisha,
      freeDeliveryThresholdPoisha: 0,
      isGlobalFreeDelivery: false,
      isAllItemsFreeDelivery: false,
      courierBaseRate1KgPoisha: base1KgPoisha,
      courierExtraPerKgPoisha: extraPerKgPoisha,
      bdPostPerKgPoisha: 6000,
    });
    return res.actualCourierCostPoisha;
  }

  createShipment(
    input: CanonicalShipmentBookingInput
  ): CanonicalShipmentBookingResult {
    assertIntegerPoisha(input.codCollectablePoisha, 'codCollectablePoisha');

    if (input.allowLiveExternalBooking) {
      return {
        success: false,
        provider: 'steadfast',
        mode: 'BLOCKED_LIVE_NOT_AUTHORIZED',
        idempotentReplay: false,
        orderNo: input.orderNo,
        consignmentId: null,
        trackingCode: null,
        trackingUrl: null,
        estimatedDeliveryChargePoisha: 0,
        codCollectablePoisha: input.codCollectablePoisha,
        providerRawEnvelope: {},
        errorCode: 'LIVE_COURIER_BOOKING_LOCKED',
        errorBn:
          'অনুমতি ছাড়া লাইভ স্টেডফাস্ট কুরিয়ার বুকিং নিষিদ্ধ (Section 8 Gate)। স্যান্ডবক্স বা ম্যানুয়াল মোড ব্যবহার করুন।',
      };
    }

    const store = readPhase5Store();
    const existing = store.shipmentBookings.find(
      (b) =>
        b.provider === 'steadfast' && b.idempotencyKey === input.idempotencyKey
    );
    if (existing) {
      return {
        ...existing,
        idempotentReplay: true,
      };
    }

    const estimatedCharge = this.estimateDeliveryChargePoisha({
      districtId: input.districtId,
      totalWeightGrams: input.totalWeightGrams,
      orderSubtotalPoisha: input.codCollectablePoisha,
    });

    const deterministicSuffix = crypto
      .createHash('sha256')
      .update(`steadfast:${input.orderNo}:${input.idempotencyKey}`)
      .digest('hex')
      .slice(0, 8)
      .toUpperCase();

    const consignmentId = `SF-CN-${deterministicSuffix}`;
    const trackingCode = `SF-${deterministicSuffix}`;
    const trackingUrl = getLiveCourierTrackingUrl(
      'steadfast',
      trackingCode,
      consignmentId,
      input.orderNo
    );

    // Isolated Steadfast Packzy payload schema
    const steadfastEnvelope = {
      adapter: 'SteadfastCourierAdapter',
      invoice: input.orderNo,
      recipient_name: input.recipientName,
      recipient_phone: input.recipientPhone,
      recipient_address: `${input.streetAddress}, ${input.landmark}, ${input.upazilaNameBn}, ${input.districtNameBn}`,
      cod_amount: Math.floor(input.codCollectablePoisha / 100),
      note: input.specialInstructionBn ?? input.itemDescriptionBn,
      consignment: {
        consignment_id: consignmentId,
        tracking_code: trackingCode,
        status: 'in_review',
      },
    };

    const booking: CanonicalShipmentBookingResult = {
      success: true,
      provider: 'steadfast',
      mode: 'SANDBOX_SIMULATION',
      idempotentReplay: false,
      orderNo: input.orderNo,
      consignmentId,
      trackingCode,
      trackingUrl,
      estimatedDeliveryChargePoisha: estimatedCharge,
      codCollectablePoisha: input.codCollectablePoisha,
      providerRawEnvelope: steadfastEnvelope,
    };

    store.shipmentBookings.unshift({
      ...booking,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString(),
    });
    writePhase5Store(store);

    return booking;
  }

  cancelShipment(params: {
    orderNo: string;
    consignmentId: string;
    reasonBn: string;
    actorUsername: string;
  }) {
    const erp = readErpState();
    const order = erp.orders.find((o) => o.orderNo === params.orderNo);
    if (
      order &&
      ['shipped', 'out_for_delivery', 'delivered'].includes(order.status)
    ) {
      return {
        success: false,
        status: 'CANNOT_CANCEL_AFTER_DISPATCH' as const,
        messageBn:
          'কুরিয়ারে হ্যান্ডওভার হওয়ার পর স্টেডফাস্ট শিপমেন্ট সরাসরি ক্যান্সেল করা যাবে না।',
      };
    }
    return {
      success: true,
      status: 'CANCELLED_IN_SANDBOX' as const,
      messageBn: `স্টেডফাস্ট স্যান্ডবক্স কনসাইনমেন্ট (${params.consignmentId}) বাতিল করা হয়েছে (VERIFY_REQUIRED for Packzy cancellation API)।`,
    };
  }

  mapWebhookStatusToCanonical(rawProviderStatus: string): {
    canonicalStatus: CanonicalShipmentLifecycleStatus;
    mappedOrderStatus: OrderStatus | null;
  } {
    const normalized = rawProviderStatus.trim().toLowerCase();
    switch (normalized) {
      case 'in_review':
      case 'pending':
        return {
          canonicalStatus: 'BOOKED_PENDING_PICKUP',
          mappedOrderStatus: 'packed',
        };
      case 'in_transit':
        return {
          canonicalStatus: 'IN_TRANSIT',
          mappedOrderStatus: 'shipped',
        };
      case 'delivered':
      case 'delivered_approval_pending':
        return {
          canonicalStatus: 'DELIVERED',
          mappedOrderStatus: 'delivered',
        };
      case 'partial_delivered':
      case 'partial_delivered_approval_pending':
        return {
          canonicalStatus: 'PARTIALLY_DELIVERED',
          mappedOrderStatus: 'out_for_delivery',
        };
      case 'cancelled':
      case ' returned':
      case 'returned':
        return {
          canonicalStatus: 'RETURNED_TO_WAREHOUSE',
          mappedOrderStatus: 'returned',
        };
      case 'hold':
        return {
          canonicalStatus: 'ON_HOLD',
          mappedOrderStatus: null,
        };
      default:
        return {
          canonicalStatus: 'IN_TRANSIT',
          mappedOrderStatus: null,
        };
    }
  }
}

/**
 * 2.3 Bangladesh Post Manual Adapter (`bd_post` — Section 8.4)
 * ZERO fake API calls! Strictly enforces an Admin Manual Booking, Counter Receipt / Consignment Number,
 * Post Office Branch, and Manual Status Update workflow.
 */
export class BangladeshPostManualAdapter implements CourierProviderAdapter {
  readonly providerKey = 'bd_post' as const;

  getCapabilities(): CourierCapabilityMatrix {
    return {
      provider: 'bd_post',
      providerNameBn: 'বাংলাদেশ ডাক বিভাগ — ম্যানুয়াল ওয়ার্কফ্লো (Bangladesh Post)',
      providerNameEn: 'Bangladesh Post Office (Strict Manual Workflow)',
      integrationMode: 'MANUAL_WORKFLOW_ONLY',
      capabilities: {
        createShipment: 'MANUAL_ONLY',
        cancelShipment: 'MANUAL_ONLY',
        tracking: 'MANUAL_ONLY',
        statusWebhook: 'MANUAL_ONLY',
        codAmount: 'MANUAL_ONLY',
        deliveryCharge: 'VERIFIED_LOCAL_WORKFLOW',
        returnExchange: 'MANUAL_ONLY',
        coverage: 'VERIFIED_LOCAL_WORKFLOW',
        codRemittance: 'MANUAL_ONLY',
        errorCodes: 'MANUAL_ONLY',
        rateLimits: 'MANUAL_ONLY',
        sandbox: 'MANUAL_ONLY',
      },
      rateLimitPolicy: {
        maxRequestsPerMinute: 0,
        burstLimit: 0,
        verificationNote:
          'MANUAL_ONLY: No unverified automated API is used for Bangladesh Post; all bookings and tracking updates are recorded manually by staff.',
      },
      errorCodesCatalog: {
        BDPOST_MANUAL_RECEIPT_REQUIRED:
          'Manual Post Office counter receipt / VPP consignment number is required.',
      },
    };
  }

  estimateDeliveryChargePoisha(params: {
    districtId: number;
    totalWeightGrams: number;
    orderSubtotalPoisha: Poisha;
  }): Poisha {
    const res = calculateDeliveryCharge({
      method: 'post_office',
      totalWeightGrams: params.totalWeightGrams,
      orderSubtotalPoisha: params.orderSubtotalPoisha,
      freeDeliveryThresholdPoisha: 0,
      isGlobalFreeDelivery: false,
      isAllItemsFreeDelivery: false,
      courierBaseRate1KgPoisha: 8000,
      courierExtraPerKgPoisha: 2000,
      bdPostPerKgPoisha: 6000,
    });
    return res.actualCourierCostPoisha;
  }

  createShipment(
    input: CanonicalShipmentBookingInput
  ): CanonicalShipmentBookingResult {
    assertIntegerPoisha(input.codCollectablePoisha, 'codCollectablePoisha');

    if (
      !input.manualPostOfficeReceiptNo ||
      input.manualPostOfficeReceiptNo.trim().length < 4
    ) {
      return {
        success: false,
        provider: 'bd_post',
        mode: 'MANUAL_BOOKING',
        idempotentReplay: false,
        orderNo: input.orderNo,
        consignmentId: null,
        trackingCode: null,
        trackingUrl: null,
        estimatedDeliveryChargePoisha: 0,
        codCollectablePoisha: input.codCollectablePoisha,
        providerRawEnvelope: {},
        errorCode: 'BDPOST_MANUAL_RECEIPT_REQUIRED',
        errorBn:
          'বাংলাদেশ ডাক বিভাগের ম্যানুয়াল বুকিংয়ের জন্য ডাকঘর কাউন্টার রিসিট / রেজিস্টার্ড ট্র্যাকিং নম্বর (কমপক্ষে ৪ অক্ষর) আবশ্যক।',
      };
    }

    const store = readPhase5Store();
    const existing = store.shipmentBookings.find(
      (b) =>
        b.provider === 'bd_post' && b.idempotencyKey === input.idempotencyKey
    );
    if (existing) {
      return {
        ...existing,
        idempotentReplay: true,
      };
    }

    const receiptNo = input.manualPostOfficeReceiptNo.trim().toUpperCase();
    const branchBn =
      input.manualPostOfficeBranchBn?.trim() || 'পঞ্চবিন্দু প্রধান ডাকঘর (৫০০০)';
    const estimatedCharge = this.estimateDeliveryChargePoisha({
      districtId: input.districtId,
      totalWeightGrams: input.totalWeightGrams,
      orderSubtotalPoisha: input.codCollectablePoisha,
    });

    const trackingUrl = getLiveCourierTrackingUrl(
      'bd_post',
      receiptNo,
      receiptNo,
      input.orderNo
    );

    const bdPostEnvelope = {
      adapter: 'BangladeshPostManualAdapter',
      workflowMode: 'STRICT_MANUAL_COUNTER_BOOKING',
      postOfficeBranchBn: branchBn,
      counterReceiptNo: receiptNo,
      orderNo: input.orderNo,
      weightGrams: input.totalWeightGrams,
      vppCodAmountPoisha: input.codCollectablePoisha,
    };

    const booking: CanonicalShipmentBookingResult = {
      success: true,
      provider: 'bd_post',
      mode: 'MANUAL_BOOKING',
      idempotentReplay: false,
      orderNo: input.orderNo,
      consignmentId: `BDP-${receiptNo}`,
      trackingCode: receiptNo,
      trackingUrl,
      estimatedDeliveryChargePoisha: estimatedCharge,
      codCollectablePoisha: input.codCollectablePoisha,
      providerRawEnvelope: bdPostEnvelope,
    };

    store.shipmentBookings.unshift({
      ...booking,
      idempotencyKey: input.idempotencyKey,
      createdAt: new Date().toISOString(),
    });
    writePhase5Store(store);

    return booking;
  }

  cancelShipment(params: {
    orderNo: string;
    consignmentId: string;
    reasonBn: string;
    actorUsername: string;
  }) {
    return {
      success: true,
      status: 'CANCELLED_MANUAL' as const,
      messageBn: `বাংলাদেশ ডাক বিভাগের ম্যানুয়াল বুকিং (${params.consignmentId}) অ্যাডমিন লেজারে বাতিল হিসেবে চিহ্নিত হয়েছে।`,
    };
  }

  mapWebhookStatusToCanonical(rawProviderStatus: string): {
    canonicalStatus: CanonicalShipmentLifecycleStatus;
    mappedOrderStatus: OrderStatus | null;
  } {
    const normalized = rawProviderStatus.trim().toLowerCase();
    if (normalized === 'delivered') {
      return {
        canonicalStatus: 'DELIVERED',
        mappedOrderStatus: 'delivered',
      };
    }
    if (normalized === 'returned') {
      return {
        canonicalStatus: 'RETURNED_TO_WAREHOUSE',
        mappedOrderStatus: 'returned',
      };
    }
    return {
      canonicalStatus: 'IN_TRANSIT',
      mappedOrderStatus: 'shipped',
    };
  }
}

const ADAPTER_REGISTRY: Record<
  'pathao' | 'steadfast' | 'bd_post',
  CourierProviderAdapter
> = {
  pathao: new PathaoCourierAdapter(),
  steadfast: new SteadfastCourierAdapter(),
  bd_post: new BangladeshPostManualAdapter(),
};

export function getCourierProviderAdapter(
  provider: 'pathao' | 'steadfast' | 'bd_post'
): CourierProviderAdapter {
  return ADAPTER_REGISTRY[provider];
}

export function getAllCourierCapabilityMatrices(): CourierCapabilityMatrix[] {
  return [
    ADAPTER_REGISTRY.pathao.getCapabilities(),
    ADAPTER_REGISTRY.steadfast.getCapabilities(),
    ADAPTER_REGISTRY.bd_post.getCapabilities(),
  ];
}

/**
 * Manual Tracking Status Update Workflow for Bangladesh Post (`bd_post` — Section 8.4).
 */
export function updateBangladeshPostManualStatus(
  ctx: ActorSecurityContext,
  input: {
    orderNo: string;
    receiptTrackingCode: string;
    postOfficeBranchBn: string;
    newStatus: 'shipped' | 'out_for_delivery' | 'delivered' | 'returned';
    noteBn: string;
  }
): {
  success: boolean;
  orderNo: string;
  updatedStatus?: OrderStatus;
  trackingCode?: string;
  errorBn?: string;
} {
  if (
    ctx.roleSlug !== 'super_admin' &&
    ctx.roleSlug !== 'packaging_manager'
  ) {
    return {
      success: false,
      orderNo: input.orderNo,
      errorBn:
        'শুধুমাত্র সুপার অ্যাডমিন বা প্যাকেজিং ম্যানেজার ডাক বিভাগের ম্যানুয়াল ট্র্যাকিং আপডেট করতে পারবেন।',
    };
  }

  if (!input.receiptTrackingCode || input.receiptTrackingCode.trim().length < 4) {
    return {
      success: false,
      orderNo: input.orderNo,
      errorBn: 'ডাকঘরের বৈধ রিসিট বা ট্র্যাকিং নম্বর আবশ্যক।',
    };
  }

  const erp = readErpState();
  const order = erp.orders.find((o) => o.orderNo === input.orderNo);
  if (!order) {
    return {
      success: false,
      orderNo: input.orderNo,
      errorBn: `অর্ডার (${input.orderNo}) খুঁজে পাওয়া যায়নি।`,
    };
  }

  order.courierProvider = 'bd_post';
  order.trackingCode = input.receiptTrackingCode.trim().toUpperCase();
  order.consignmentId = `BDP-${order.trackingCode}`;
  order.status = input.newStatus;
  writeErpState(erp);

  const adm = readAdminStore();
  appendImmutableAuditLog(adm, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'BD_POST_MANUAL_STATUS_UPDATED',
    targetType: 'order',
    targetId: order.orderNo,
    summaryBn: `বাংলাদেশ ডাক বিভাগ (${input.postOfficeBranchBn}) ম্যানুয়াল ট্র্যাকিং (${order.trackingCode}) স্ট্যাটাস "${input.newStatus}"-এ আপডেট করা হয়েছে: ${input.noteBn}`,
    metadata: {
      receiptTrackingCode: order.trackingCode,
      postOfficeBranchBn: input.postOfficeBranchBn,
      newStatus: input.newStatus,
    },
  });
  writeAdminStore(adm);

  return {
    success: true,
    orderNo: order.orderNo,
    updatedStatus: order.status,
    trackingCode: order.trackingCode,
  };
}

// ============================================================================
// 3. DURABLE WEBHOOK EVENT LOG, RETRY & DEAD-LETTER QUEUE (8.3)
// ============================================================================

export type DurableWebhookStatus =
  | 'PROCESSED'
  | 'RETRY_SCHEDULED'
  | 'DEAD_LETTER'
  | 'MANUALLY_RECONCILED'
  | 'REJECTED_SIGNATURE';

export interface CourierWebhookDurableEventRecord {
  webhookEventId: string;
  provider: CourierProvider;
  orderNo: string;
  consignmentId: string | null;
  rawStatus: string;
  canonicalStatus: CanonicalShipmentLifecycleStatus;
  collectedCodPoisha: Poisha;
  signatureVerified: boolean;
  status: DurableWebhookStatus;
  retryCount: number;
  maxRetries: number;
  lastErrorBn: string | null;
  reconciliationNoteBn: string | null;
  reconciledByUsername: string | null;
  receivedAt: string;
  processedAt: string | null;
}

export function ingestDurableCourierWebhook(params: {
  provider: 'pathao' | 'steadfast' | 'bd_post';
  rawPayload: string;
  signatureHeader: string;
  secret: string | undefined;
  timestampHeader?: string | null;
  parsedEvent: {
    eventId: string;
    orderNo: string;
    consignmentId?: string;
    rawStatus: string;
    collectedCodPoisha?: Poisha;
  };
  simulateTransientProcessingFailure?: boolean;
  maxRetries?: number;
}): {
  success: boolean;
  idempotentReplay: boolean;
  eventRecord: CourierWebhookDurableEventRecord;
  httpStatus: number;
} {
  const store = readPhase5Store();
  const maxRetries = params.maxRetries ?? 3;

  // 1. Fail-closed HMAC-SHA256 verification
  const hmac = verifyCourierWebhookHmac({
    rawPayload: params.rawPayload,
    signatureHeader: params.signatureHeader,
    secret: params.secret,
    timestampHeader: params.timestampHeader,
  });

  const adapter = getCourierProviderAdapter(params.provider);
  const mapped = adapter.mapWebhookStatusToCanonical(
    params.parsedEvent.rawStatus
  );

  if (!hmac.valid) {
    const rejectedRecord: CourierWebhookDurableEventRecord = {
      webhookEventId: params.parsedEvent.eventId,
      provider: params.provider,
      orderNo: params.parsedEvent.orderNo,
      consignmentId: params.parsedEvent.consignmentId ?? null,
      rawStatus: params.parsedEvent.rawStatus,
      canonicalStatus: mapped.canonicalStatus,
      collectedCodPoisha: params.parsedEvent.collectedCodPoisha ?? 0,
      signatureVerified: false,
      status: 'REJECTED_SIGNATURE',
      retryCount: 0,
      maxRetries,
      lastErrorBn: hmac.reasonBn ?? 'HMAC স্বাক্ষর যাচাই ব্যর্থ।',
      reconciliationNoteBn: null,
      reconciledByUsername: null,
      receivedAt: new Date().toISOString(),
      processedAt: null,
    };
    store.webhookEvents.unshift(rejectedRecord);
    writePhase5Store(store);

    return {
      success: false,
      idempotentReplay: false,
      eventRecord: rejectedRecord,
      httpStatus: hmac.code === 'MISSING_SECRET' ? 503 : 401,
    };
  }

  // 2. Idempotency / Replay Deduplication on verified eventId
  const existing = store.webhookEvents.find(
    (e) =>
      e.provider === params.provider &&
      e.webhookEventId === params.parsedEvent.eventId &&
      (e.status === 'PROCESSED' || e.status === 'MANUALLY_RECONCILED')
  );
  if (existing) {
    return {
      success: true,
      idempotentReplay: true,
      eventRecord: existing,
      httpStatus: 200,
    };
  }

  // 3. Locate or initialize durable event record for retry / DLQ tracking
  let record = store.webhookEvents.find(
    (e) =>
      e.provider === params.provider &&
      e.webhookEventId === params.parsedEvent.eventId
  );

  const nowIso = new Date().toISOString();
  if (!record) {
    record = {
      webhookEventId: params.parsedEvent.eventId,
      provider: params.provider,
      orderNo: params.parsedEvent.orderNo,
      consignmentId: params.parsedEvent.consignmentId ?? null,
      rawStatus: params.parsedEvent.rawStatus,
      canonicalStatus: mapped.canonicalStatus,
      collectedCodPoisha: params.parsedEvent.collectedCodPoisha ?? 0,
      signatureVerified: true,
      status: 'RETRY_SCHEDULED',
      retryCount: 0,
      maxRetries,
      lastErrorBn: null,
      reconciliationNoteBn: null,
      reconciledByUsername: null,
      receivedAt: nowIso,
      processedAt: null,
    };
    store.webhookEvents.unshift(record);
  }

  const erp = readErpState();
  const order = erp.orders.find(
    (o) => o.orderNo === params.parsedEvent.orderNo
  );

  if (params.simulateTransientProcessingFailure || !order) {
    record.retryCount += 1;
    record.lastErrorBn = !order
      ? `অর্ডার (${params.parsedEvent.orderNo}) পাওয়া যায়নি।`
      : 'অস্থায়ী ডাটাবেস/প্রসেসিং ত্রুটি (Simulated transient failure)।';

    if (record.retryCount >= record.maxRetries) {
      record.status = 'DEAD_LETTER';
    } else {
      record.status = 'RETRY_SCHEDULED';
    }
    writePhase5Store(store);

    return {
      success: false,
      idempotentReplay: false,
      eventRecord: record,
      httpStatus: record.status === 'DEAD_LETTER' ? 422 : 503,
    };
  }

  // 4. Process valid order state update (keeping COD Collection distinct from Bank Remittance)
  if (mapped.mappedOrderStatus) {
    order.status = mapped.mappedOrderStatus;
  }
  record.status = 'PROCESSED';
  record.lastErrorBn = null;
  record.processedAt = nowIso;

  writeErpState(erp);
  writePhase5Store(store);

  return {
    success: true,
    idempotentReplay: false,
    eventRecord: record,
    httpStatus: 200,
  };
}

/**
 * Manual Reconciliation of a Dead-Letter or Retry-Scheduled Webhook Event (Section 8.3).
 */
export function reconcileWebhookEventManually(
  ctx: ActorSecurityContext,
  input: {
    webhookEventId: string;
    targetOrderNo: string;
    noteBn: string;
  }
): {
  success: boolean;
  eventRecord?: CourierWebhookDurableEventRecord;
  errorBn?: string;
} {
  if (
    ctx.roleSlug !== 'super_admin' &&
    ctx.roleSlug !== 'packaging_manager'
  ) {
    return {
      success: false,
      errorBn: 'ওয়েবহুক ম্যানুয়াল রিকনসিলিয়েশনের অনুমতি নেই।',
    };
  }

  if (!input.noteBn || input.noteBn.trim().length < 5) {
    return {
      success: false,
      errorBn: 'ম্যানুয়াল রিকনসিলিয়েশন নোট (কমপক্ষে ৫ অক্ষর) আবশ্যক।',
    };
  }

  const store = readPhase5Store();
  const ev = store.webhookEvents.find(
    (e) => e.webhookEventId === input.webhookEventId
  );
  if (!ev) {
    return {
      success: false,
      errorBn: 'ওয়েবহুক ইভেন্ট খুঁজে পাওয়া যায়নি।',
    };
  }

  const erp = readErpState();
  const order = erp.orders.find((o) => o.orderNo === input.targetOrderNo);
  if (!order) {
    return {
      success: false,
      errorBn: `টার্গেট অর্ডার (${input.targetOrderNo}) পাওয়া যায়নি।`,
    };
  }

  ev.orderNo = order.orderNo;
  ev.status = 'MANUALLY_RECONCILED';
  ev.reconciliationNoteBn = input.noteBn.trim();
  ev.reconciledByUsername = ctx.username;
  ev.processedAt = new Date().toISOString();

  writePhase5Store(store);
  return {
    success: true,
    eventRecord: ev,
  };
}

// ============================================================================
// 4. NOTIFICATIONS ENGINE: OTP vs. TRANSACTIONAL SEPARATION & FAULT ISOLATION (8.5)
// ============================================================================

export type NotificationCategory = 'SECURITY_OTP' | 'TRANSACTIONAL_ORDER';
export type NotificationChannel =
  | 'IN_APP'
  | 'WA_ME_FREE_LINK'
  | 'SMS_URI_FREE_LINK'
  | 'HTTP_SMS_ADAPTER_PLACEHOLDER'
  | 'RESEND_EMAIL_ADAPTER_PLACEHOLDER';

export interface InAppNotificationRecord {
  notificationId: string;
  targetRoleOrUser: string;
  orderNo: string | null;
  titleBn: string;
  bodyBn: string;
  isRead: boolean;
  createdAt: string;
}

export interface NotificationDeliveryLogRecord {
  deliveryId: string;
  category: NotificationCategory;
  channel: NotificationChannel;
  recipientMasked: string;
  orderNo: string | null;
  sanitizedMessagePreview: string; // OTP codes and secrets are strictly redacted!
  deepLinkUrl: string | null;
  status:
    | 'DELIVERED_IN_APP'
    | 'READY_FREE_DEEP_LINK'
    | 'QUEUED_PROVIDER_PLACEHOLDER'
    | 'FAILED_NON_BLOCKING';
  attemptCount: number;
  errorSummary: string | null;
  secretRedacted: true;
  createdAt: string;
}

function maskPhoneNumberForLog(phone: string): string {
  const clean = phone.trim();
  if (clean.length < 7) return '***';
  return `${clean.slice(0, 4)}****${clean.slice(-3)}`;
}

function redactOtpAndSecretsFromPreview(text: string): string {
  return text
    .replace(/\b\d{4,8}\b/g, '[REDACTED_OTP]')
    .replace(/(Bearer\s+|api[_-]?key\s*[:=]\s*)[A-Za-z0-9._-]+/gi, '$1[REDACTED_SECRET]');
}

/**
 * Sends a dedicated Security OTP Notification (`SECURITY_OTP`), completely isolated from
 * marketing/transactional order notification queues and redacting the OTP code in delivery logs.
 */
export function dispatchSecurityOtpNotification(params: {
  recipientPhone: string;
  otpPlaintextCode: string;
  purpose: 'CUSTOMER_ACCOUNT_LOGIN' | 'ADMIN_SECURITY_VERIFICATION';
  simulateGatewayError?: boolean;
}): {
  dispatched: boolean;
  category: 'SECURITY_OTP';
  logRecord: NotificationDeliveryLogRecord;
} {
  const store = readPhase5Store();
  const rawMessage = `পঞ্চবিন্দু (Panchabindu) নিরাপত্তা ওটিপি কোড: ${params.otpPlaintextCode}। কোডটি কারো সাথে শেয়ার করবেন না।`;
  const sanitizedMessagePreview = redactOtpAndSecretsFromPreview(rawMessage);

  const logRecord: NotificationDeliveryLogRecord = {
    deliveryId: `ndel-otp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    category: 'SECURITY_OTP',
    channel: 'HTTP_SMS_ADAPTER_PLACEHOLDER',
    recipientMasked: maskPhoneNumberForLog(params.recipientPhone),
    orderNo: null,
    sanitizedMessagePreview,
    deepLinkUrl: null,
    status: params.simulateGatewayError
      ? 'FAILED_NON_BLOCKING'
      : 'QUEUED_PROVIDER_PLACEHOLDER',
    attemptCount: 1,
    errorSummary: params.simulateGatewayError
      ? 'SMS gateway adapter timeout (non-blocking)'
      : null,
    secretRedacted: true,
    createdAt: new Date().toISOString(),
  };

  store.notificationLogs.unshift(logRecord);
  writePhase5Store(store);

  return {
    // This placeholder never contacts a provider, even without a simulated error.
    dispatched: false,
    category: 'SECURITY_OTP',
    logRecord,
  };
}

/**
 * Non-Blocking Transactional Order Notification Dispatcher (`TRANSACTIONAL_ORDER` — Section 8.5).
 * Guarantee: Even if the external SMS/Email provider throws an exception or fails,
 * this function catches and logs the failure in `notificationLogs` and NEVER throws or aborts
 * the caller's Order / Payment transaction!
 */
export function dispatchTransactionalOrderNotificationSafe(params: {
  orderNo: string;
  recipientPhone: string;
  eventTitleBn: string;
  messageBn: string;
  channels?: NotificationChannel[];
  simulateProviderFailure?: boolean;
}): {
  orderTransactionIntact: true;
  inAppNotification: InAppNotificationRecord;
  deliveryLogs: NotificationDeliveryLogRecord[];
} {
  const store = readPhase5Store();
  const nowIso = new Date().toISOString();

  // 1. Always create In-App Notification first
  const inAppNotification: InAppNotificationRecord = {
    notificationId: `inapp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    targetRoleOrUser: params.recipientPhone,
    orderNo: params.orderNo,
    titleBn: params.eventTitleBn,
    bodyBn: params.messageBn,
    isRead: false,
    createdAt: nowIso,
  };
  store.inAppNotifications.unshift(inAppNotification);

  const channels: NotificationChannel[] = params.channels ?? [
    'IN_APP',
    'WA_ME_FREE_LINK',
    'SMS_URI_FREE_LINK',
  ];

  const deliveryLogs: NotificationDeliveryLogRecord[] = [];

  for (const ch of channels) {
    try {
      if (
        params.simulateProviderFailure &&
        (ch === 'HTTP_SMS_ADAPTER_PLACEHOLDER' ||
          ch === 'RESEND_EMAIL_ADAPTER_PLACEHOLDER')
      ) {
        throw new Error(`Simulated ${ch} provider connection refused`);
      }

      const cleanPhone = params.recipientPhone.replace(/\D/g, '');
      const bdPhone = cleanPhone.startsWith('88')
        ? cleanPhone
        : `88${cleanPhone}`;

      const deepLinkUrl =
        ch === 'WA_ME_FREE_LINK'
          ? `https://wa.me/${bdPhone}?text=${encodeURIComponent(params.messageBn)}`
          : ch === 'SMS_URI_FREE_LINK'
          ? `sms:+${bdPhone}?body=${encodeURIComponent(params.messageBn)}`
          : null;

      const status: NotificationDeliveryLogRecord['status'] =
        ch === 'IN_APP'
          ? 'DELIVERED_IN_APP'
          : ch === 'WA_ME_FREE_LINK' || ch === 'SMS_URI_FREE_LINK'
          ? 'READY_FREE_DEEP_LINK'
          : 'QUEUED_PROVIDER_PLACEHOLDER';

      const entry: NotificationDeliveryLogRecord = {
        deliveryId: `ndel-tx-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: 'TRANSACTIONAL_ORDER',
        channel: ch,
        recipientMasked: maskPhoneNumberForLog(params.recipientPhone),
        orderNo: params.orderNo,
        sanitizedMessagePreview: redactOtpAndSecretsFromPreview(
          params.messageBn
        ),
        deepLinkUrl,
        status,
        attemptCount: 1,
        errorSummary: null,
        secretRedacted: true,
        createdAt: nowIso,
      };
      store.notificationLogs.unshift(entry);
      deliveryLogs.push(entry);
    } catch (err) {
      // Fault Isolation: Catch and log provider failure so Order/Payment transaction never fails!
      const failedEntry: NotificationDeliveryLogRecord = {
        deliveryId: `ndel-err-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        category: 'TRANSACTIONAL_ORDER',
        channel: ch,
        recipientMasked: maskPhoneNumberForLog(params.recipientPhone),
        orderNo: params.orderNo,
        sanitizedMessagePreview: redactOtpAndSecretsFromPreview(
          params.messageBn
        ),
        deepLinkUrl: null,
        status: 'FAILED_NON_BLOCKING',
        attemptCount: 1,
        errorSummary:
          err instanceof Error
            ? err.message
            : 'Notification provider failure isolated',
        secretRedacted: true,
        createdAt: nowIso,
      };
      store.notificationLogs.unshift(failedEntry);
      deliveryLogs.push(failedEntry);
    }
  }

  writePhase5Store(store);

  return {
    orderTransactionIntact: true,
    inAppNotification,
    deliveryLogs,
  };
}

// ============================================================================
// 5. PERSISTENCE ENGINE (.data/erp-phase5-courier-notif-store.json)
// ============================================================================

interface StoredShipmentBooking extends CanonicalShipmentBookingResult {
  idempotencyKey: string;
  createdAt: string;
}

interface Phase5CourierNotifStore {
  shipmentBookings: StoredShipmentBooking[];
  webhookEvents: CourierWebhookDurableEventRecord[];
  inAppNotifications: InAppNotificationRecord[];
  notificationLogs: NotificationDeliveryLogRecord[];
}

const PHASE5_STORE_PATH = path.join(
  process.cwd(),
  '.data',
  'erp-phase5-courier-notif-store.json'
);

export function readPhase5Store(): Phase5CourierNotifStore {
  const parsed = readLocalJsonStore<Phase5CourierNotifStore>(PHASE5_STORE_PATH, {
    arrays: ['shipmentBookings', 'webhookEvents', 'inAppNotifications', 'notificationLogs'],
  });
  if (parsed) return parsed;
  const seed: Phase5CourierNotifStore = {
    shipmentBookings: [], webhookEvents: [], inAppNotifications: [], notificationLogs: [],
  };
  writePhase5Store(seed);
  return seed;
}

export function writePhase5Store(store: Phase5CourierNotifStore): void {
  writeLocalJsonStore(PHASE5_STORE_PATH, store);
}
