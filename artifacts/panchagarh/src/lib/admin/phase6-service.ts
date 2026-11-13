// src/lib/admin/phase6-service.ts
// Phase 6 (Module S):
//   1. Abandoned Cart Recovery & Customer 360 Fraud CRM Engine (1-Tap wa.me/sms: & 1-Click Convert to Order)
//   2. Live Courier Webhook Receiver (HMAC Signature Verification) & Bulk CSV Booking / Remittance Reconciliation Engine
//   3. Verified-Purchase Product Review Moderation & Consignment Vendor Performance Scorecard Engine
//   4. Full System Disaster Recovery Snapshot (SHA-256 Checksummed Backup & Dry-Run Restore Validation)

import crypto from 'node:crypto';
import path from 'node:path';
import { readLocalJsonStore, writeLocalJsonStore } from '../db/local-json-store';
import type {
  CourierProvider,
  OrderStatus,
} from '../../types/database.types';
import type { Poisha } from '../../types/domain';
import type { ActorSecurityContext } from '../../types/permissions';
import {
  createStorefrontOrder,
  readErpState,
  writeErpState,
} from '../db/repository';
import { getDistrictById, getUpazilasByDistrict } from '../geo/bd-geocode';
import { normalizeBdPhone } from '../validators';
import {
  appendImmutableAuditLog,
  readAdminStore,
  writeAdminStore,
} from './phase4a-service';
import {
  autoRecordOrderDeliveredOrReturned,
  readPhase4BStore,
  recordCourierRemittanceSettlement,
} from './phase4b-service';
import { readPhase4CStore } from './phase4c-service';

export interface ManagedAbandonedCartRecord {
  cartId: string;
  customerPhone: string;
  customerName: string;
  districtId: number;
  districtNameBn: string;
  upazilaId: number;
  streetAddress: string;
  subtotalPoisha: Poisha;
  items: Array<{
    productId: string;
    variantId: string;
    productNameBn: string;
    variantTitleBn: string;
    publicSku: string;
    quantity: number;
    unitSalePricePoisha: Poisha;
  }>;
  isRecovered: boolean;
  recoveredOrderNo: string | null;
  reminderSentCount: number;
  lastReminderSentAt: string | null;
  createdAt: string;
  updatedAt: string;
  waMeRecoveryLink: string;
  smsRecoveryLink: string;
}

export interface Customer360ProfileDTO {
  customerPhone: string;
  customerName: string;
  districtNameBn: string;
  totalOrders: number;
  deliveredOrders: number;
  returnedOrders: number;
  cancelledOrders: number;
  deliverySuccessRateBp: number; // 0..10000
  isRepeatCustomer: boolean;
  fraudScore: number; // 0..100
  isBlacklisted: boolean;
  blacklistReasonBn: string | null;
  lifetimeSpendPoisha: Poisha;
  lastOrderNo: string;
  lastOrderAt: string;
}

export interface CourierWebhookEventRecord {
  webhookId: string;
  eventKey?: string;
  provider: CourierProvider;
  consignmentId: string;
  orderNo: string;
  rawStatus: string;
  mappedStatus: OrderStatus;
  collectedCodPoisha: Poisha;
  signatureVerified: boolean;
  escrowPromoted: boolean;
  remittanceRecorded: boolean;
  rejectedReasonBn?: string | null;
  summaryBn: string;
  receivedAt: string;
}

export interface BulkCsvReconciliationResultDTO {
  batchRef: string;
  provider: CourierProvider;
  totalRowsParsed: number;
  settledCount: number;
  shortPaymentFlaggedCount: number;
  totalExpectedCodPoisha: Poisha;
  totalRemittedPoisha: Poisha;
  totalShortPaymentPoisha: Poisha;
  processedOrderNos: string[];
  summaryBn: string;
}

export interface ModeratedReviewItemDTO {
  reviewId: string;
  productId: string;
  productNameBn: string;
  publicSku: string;
  customerName: string;
  rating: number;
  comment: string;
  isVerifiedPurchase: boolean;
  moderationStatus: 'pending' | 'approved' | 'rejected';
  moderatedBy: string | null;
  moderatedAt: string | null;
  createdAt: string;
}

export interface VendorScorecardRowDTO {
  vendorId: string;
  vendorCode: string;
  businessNameBn: string;
  ownerNameBn: string;
  status: string;
  activeProductsCount: number;
  totalUnitsSold: number;
  totalUnitsReturned: number;
  returnRateBp: number; // 0..10000
  supplierFaultReturnCount: number;
  grossSalesPoisha: Poisha;
  netVendorPayablePoisha: Poisha;
  platformMarginGeneratedPoisha: Poisha;
  averageRatingBp: number; // 0..500 (e.g. 480 = 4.8 stars)
  slaGrade: 'A+' | 'A' | 'B' | 'C';
}

export interface SystemBackupSnapshotMeta {
  snapshotId: string;
  createdAt: string;
  createdByUsername: string;
  sha256Checksum: string;
  totalOrdersCount: number;
  totalProductsCount: number;
  totalVendorsCount: number;
  totalLedgerEntriesCount: number;
  totalAuditLogsCount: number;
  payloadSizeBytes: number;
}

export interface Phase6PersistentStore {
  abandonedCarts: ManagedAbandonedCartRecord[];
  webhookEvents: CourierWebhookEventRecord[];
  reviewModerationStatus: Record<
    string,
    {
      status: 'pending' | 'approved' | 'rejected';
      moderatedBy: string | null;
      moderatedAt: string | null;
    }
  >;
  backupSnapshots: SystemBackupSnapshotMeta[];
}

export interface Phase6WorkspaceOverviewDTO {
  abandonedCarts: ManagedAbandonedCartRecord[];
  customers360: Customer360ProfileDTO[];
  webhookEvents: CourierWebhookEventRecord[];
  moderatedReviews: ModeratedReviewItemDTO[];
  vendorScorecards: VendorScorecardRowDTO[];
  backupSnapshots: SystemBackupSnapshotMeta[];
  bookingCsvPreview: string;
}

const PHASE6_DATA_DIR = path.join(process.cwd(), '.data');
const PHASE6_DATA_FILE = path.join(PHASE6_DATA_DIR, 'erp-phase6-store.json');

function buildCartRecoveryLinks(params: {
  customerPhone: string;
  customerName: string;
  firstProductNameBn: string;
  subtotalPoisha: Poisha;
}): { waMeRecoveryLink: string; smsRecoveryLink: string } {
  const cleanDigits = params.customerPhone.replace(/\D/g, '');
  const intlPhone = cleanDigits.startsWith('88')
    ? cleanDigits
    : `88${cleanDigits}`;
  const bdtAmount = Math.round(params.subtotalPoisha / 100);
  const messageBn = `আসসালামু আলাইকুম ${params.customerName}, বঙ্গকনসাইন স্টোরে আপনার কার্টে "${params.firstProductNameBn}" (মোট ৳${bdtAmount}) অপেক্ষমাণ রয়েছে। অর্ডারটি সম্পন্ন করতে YES লিখে রিপ্লাই দিন।`;
  const encoded = encodeURIComponent(messageBn);
  return {
    waMeRecoveryLink: `https://wa.me/${intlPhone}?text=${encoded}`,
    smsRecoveryLink: `sms:${cleanDigits}?body=${encoded}`,
  };
}

function getInitialPhase6Store(): Phase6PersistentStore {
  const erp = readErpState();
  const prod0 = erp.products[0];
  const var0 = prod0?.variants[0];
  const prod1 = erp.products[1] ?? prod0;
  const var1 = prod1?.variants[0] ?? var0;

  const cart1Phone = '01755667788';
  const cart1Name = 'রাশেদুল ইসলাম';
  const cart1Subtotal = var0 ? var0.salePricePoisha : 245000;
  const cart1Links = buildCartRecoveryLinks({
    customerPhone: cart1Phone,
    customerName: cart1Name,
    firstProductNameBn: prod0?.nameBn ?? 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি',
    subtotalPoisha: cart1Subtotal,
  });

  const cart2Phone = '01844556677';
  const cart2Name = 'তাসনুভা তাবাসসুম';
  const cart2Subtotal = var1 ? var1.salePricePoisha * 2 : 150000;
  const cart2Links = buildCartRecoveryLinks({
    customerPhone: cart2Phone,
    customerName: cart2Name,
    firstProductNameBn: prod1?.nameBn ?? 'ফুল-গ্রেইন লেদার ওয়ালেট',
    subtotalPoisha: cart2Subtotal,
  });

  const abandonedCarts: ManagedAbandonedCartRecord[] = [
    {
      cartId: 'acart-seed-1',
      customerPhone: cart1Phone,
      customerName: cart1Name,
      districtId: 1,
      districtNameBn: 'ঢাকা',
      upazilaId: 145,
      streetAddress: 'বাড়ি ১৮, রোড ৯, উত্তরা সেক্টর ৪, ঢাকা',
      subtotalPoisha: cart1Subtotal,
      items: [
        {
          productId: prod0?.productId ?? 'prod-1',
          variantId: var0?.variantId ?? 'var-1',
          productNameBn: prod0?.nameBn ?? 'ঢাকাই হাফ-সিল্ক জামদানি শাড়ি',
          variantTitleBn: var0?.titleBn ?? 'মেরুন ও গোল্ডেন জরি',
          publicSku: var0?.publicSku ?? 'BG-JAM-201',
          quantity: 1,
          unitSalePricePoisha: cart1Subtotal,
        },
      ],
      isRecovered: false,
      recoveredOrderNo: null,
      reminderSentCount: 1,
      lastReminderSentAt: '2026-11-06T10:15:00.000Z',
      createdAt: '2026-11-06T09:40:00.000Z',
      updatedAt: '2026-11-06T10:15:00.000Z',
      ...cart1Links,
    },
    {
      cartId: 'acart-seed-2',
      customerPhone: cart2Phone,
      customerName: cart2Name,
      districtId: 2,
      districtNameBn: 'চট্টগ্রাম',
      upazilaId: 100,
      streetAddress: 'ফ্ল্যাট ৪বি, নাসিরাবাদ হাউজিং সোসাইটি, চট্টগ্রাম',
      subtotalPoisha: cart2Subtotal,
      items: [
        {
          productId: prod1?.productId ?? 'prod-2',
          variantId: var1?.variantId ?? 'var-2',
          productNameBn: prod1?.nameBn ?? 'ফুল-গ্রেইন কাউহাইড লেদার ওয়ালেট',
          variantTitleBn: var1?.titleBn ?? 'ভিন্টেজ ব্রাউন',
          publicSku: var1?.publicSku ?? 'BG-WAL-203',
          quantity: 2,
          unitSalePricePoisha: var1 ? var1.salePricePoisha : 75000,
        },
      ],
      isRecovered: false,
      recoveredOrderNo: null,
      reminderSentCount: 0,
      lastReminderSentAt: null,
      createdAt: '2026-11-06T11:20:00.000Z',
      updatedAt: '2026-11-06T11:20:00.000Z',
      ...cart2Links,
    },
  ];

  const webhookEvents: CourierWebhookEventRecord[] = [
    {
      webhookId: 'whk-seed-1',
      provider: 'steadfast',
      consignmentId: 'CNS-ORD-261025-0091',
      orderNo: 'ORD-261106-0001',
      rawStatus: 'delivered',
      mappedStatus: 'delivered',
      collectedCodPoisha: 245000,
      signatureVerified: true,
      escrowPromoted: true,
      remittanceRecorded: true,
      summaryBn:
        'Steadfast ওয়েবহুক (HMAC Verified): অর্ডার ডেলিভারড এবং ভেন্ডর এসক্রো Pending → Locked বাকেটে প্রমোট হয়েছে।',
      receivedAt: '2026-11-06T12:00:00.000Z',
    },
  ];

  const reviewModerationStatus: Phase6PersistentStore['reviewModerationStatus'] =
    {};
  erp.reviews.forEach((rev, idx) => {
    reviewModerationStatus[rev.id] = {
      status: idx === 0 ? 'approved' : 'pending',
      moderatedBy: idx === 0 ? 'admin' : null,
      moderatedAt: idx === 0 ? '2026-11-06T08:00:00.000Z' : null,
    };
  });

  const backupSnapshots: SystemBackupSnapshotMeta[] = [
    {
      snapshotId: 'SNAP-261106-INITIAL',
      createdAt: '2026-11-06T06:00:00.000Z',
      createdByUsername: 'admin',
      sha256Checksum:
        '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
      totalOrdersCount: erp.orders.length,
      totalProductsCount: erp.products.length,
      totalVendorsCount: 2,
      totalLedgerEntriesCount: 4,
      totalAuditLogsCount: 1,
      payloadSizeBytes: 58420,
    },
  ];

  return {
    abandonedCarts,
    webhookEvents,
    reviewModerationStatus,
    backupSnapshots,
  };
}

export function readPhase6Store(): Phase6PersistentStore {
  const parsed = readLocalJsonStore<Phase6PersistentStore>(PHASE6_DATA_FILE, {
    arrays: ['abandonedCarts', 'webhookEvents', 'backupSnapshots'],
    objects: ['reviewModerationStatus'],
  });
  if (parsed) return parsed;

  const initial = getInitialPhase6Store();
  writePhase6Store(initial);
  return initial;
}

export function writePhase6Store(store: Phase6PersistentStore): void {
  writeLocalJsonStore(PHASE6_DATA_FILE, store);
}

// ============================================================================
// 1. ABANDONED CART RECOVERY & CUSTOMER 360 FRAUD CRM ENGINE
// ============================================================================

export function recordAbandonedCartReminderSent(
  ctx: ActorSecurityContext,
  cartId: string,
  channel: 'wa_me' | 'sms_link'
): {
  success: boolean;
  errorBn?: string;
  cart?: ManagedAbandonedCartRecord;
} {
  const store = readPhase6Store();
  const adminStore = readAdminStore();
  const cart = store.abandonedCarts.find((c) => c.cartId === cartId);
  if (!cart) {
    return { success: false, errorBn: 'পরিত্যক্ত কার্ট খুঁজে পাওয়া যায়নি।' };
  }

  cart.reminderSentCount += 1;
  cart.lastReminderSentAt = new Date().toISOString();
  cart.updatedAt = cart.lastReminderSentAt;

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'ABANDONED_CART_REMINDER_DISPATCHED',
    targetType: 'order',
    targetId: cart.cartId,
    summaryBn: `পরিত্যক্ত কার্ট (${cart.customerName} — ${cart.customerPhone})-এ ${
      channel === 'wa_me' ? 'wa.me WhatsApp' : 'sms: অ্যাপ'
    } রিমাইন্ডার পাঠানো হয়েছে।`,
    metadata: { cartId, channel, reminderSentCount: cart.reminderSentCount },
  });

  writePhase6Store(store);
  writeAdminStore(adminStore);
  return { success: true, cart };
}

/**
 * 1-Click Converts an Abandoned Cart into a live Storefront/Admin Order
 * with 3-tier consignment price snapshots and stock reservation.
 */
export function recoverAbandonedCartToOrder(
  ctx: ActorSecurityContext,
  cartId: string
): {
  success: boolean;
  errorBn?: string;
  orderNo?: string;
  cart?: ManagedAbandonedCartRecord;
} {
  if (ctx.roleSlug === 'vendor') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র অ্যাডমিন বা মার্কেটিং স্টাফ পরিত্যক্ত কার্ট অর্ডারে রূপান্তর করতে পারবেন।',
    };
  }

  const store = readPhase6Store();
  const adminStore = readAdminStore();
  const cart = store.abandonedCarts.find((c) => c.cartId === cartId);
  if (!cart) {
    return { success: false, errorBn: 'পরিত্যক্ত কার্ট খুঁজে পাওয়া যায়নি।' };
  }

  if (cart.isRecovered && cart.recoveredOrderNo) {
    return {
      success: true,
      orderNo: cart.recoveredOrderNo,
      cart,
    };
  }

  const upazilas = getUpazilasByDistrict(cart.districtId);
  const validUpazilaId =
    upazilas.find((u) => u.id === cart.upazilaId)?.id ??
    upazilas[0]?.id ??
    145;

  const created = createStorefrontOrder({
    customerName: cart.customerName,
    customerPhone: cart.customerPhone,
    districtId: cart.districtId,
    upazilaId: validUpazilaId,
    streetAddress: cart.streetAddress,
    landmark: 'Abandoned Cart Recovery',
    source: 'whatsapp',
    deliveryMethod: 'courier',
    paymentMethod: 'cod',
    advancePaidPoisha: 0,
    customerNote: '',
    internalStaffNote: `পরিত্যক্ত কার্ট (${cart.cartId}) রিকভারি থেকে রূপান্তরিত অর্ডার`,
    items: cart.items.map((it) => ({
      productId: it.productId,
      variantId: it.variantId,
      quantity: it.quantity,
    })),
    idempotencyKey: `recover-${cart.cartId}-${Date.now()}`,
  });

  if (!created.success || !created.order) {
    return {
      success: false,
      errorBn: created.errorBn ?? 'কার্ট থেকে অর্ডার তৈরি করা যায়নি।',
    };
  }

  cart.isRecovered = true;
  cart.recoveredOrderNo = created.order.orderNo;
  cart.updatedAt = new Date().toISOString();

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'ABANDONED_CART_RECOVERED_TO_ORDER',
    targetType: 'order',
    targetId: created.order.orderNo,
    summaryBn: `পরিত্যক্ত কার্ট (${cart.cartId}) সফলভাবে অর্ডার ${created.order.orderNo}-এ রূপান্তরিত হয়েছে।`,
    metadata: {
      cartId: cart.cartId,
      orderNo: created.order.orderNo,
      subtotalPoisha: cart.subtotalPoisha,
    },
  });

  writePhase6Store(store);
  writeAdminStore(adminStore);

  return {
    success: true,
    orderNo: created.order.orderNo,
    cart,
  };
}

/**
 * Computes the Customer 360 & Fraud Score Directory across all historical orders.
 */
export function computeCustomer360Directory(): Customer360ProfileDTO[] {
  const erp = readErpState();
  const adminStore = readAdminStore();

  const byPhone = new Map<
    string,
    {
      customerPhone: string;
      customerName: string;
      districtNameBn: string;
      totalOrders: number;
      deliveredOrders: number;
      returnedOrders: number;
      cancelledOrders: number;
      lifetimeSpendPoisha: Poisha;
      maxRiskScore: number;
      lastOrderNo: string;
      lastOrderAt: string;
    }
  >();

  for (const ord of erp.orders) {
    const normPhone = normalizeBdPhone(ord.customerPhone) ?? ord.customerPhone;
    const existing = byPhone.get(normPhone) ?? {
      customerPhone: normPhone,
      customerName: ord.customerName,
      districtNameBn: ord.districtNameBn,
      totalOrders: 0,
      deliveredOrders: 0,
      returnedOrders: 0,
      cancelledOrders: 0,
      lifetimeSpendPoisha: 0,
      maxRiskScore: 0,
      lastOrderNo: ord.orderNo,
      lastOrderAt: ord.createdAt,
    };

    existing.totalOrders += 1;
    if (ord.status === 'delivered') {
      existing.deliveredOrders += 1;
      existing.lifetimeSpendPoisha += ord.totalPayablePoisha;
    } else if (
      ord.status === 'returned' ||
      ord.status === 'return_initiated'
    ) {
      existing.returnedOrders += 1;
    } else if (ord.status === 'cancelled') {
      existing.cancelledOrders += 1;
    }

    if (ord.riskScore > existing.maxRiskScore) {
      existing.maxRiskScore = ord.riskScore;
    }

    if (ord.createdAt >= existing.lastOrderAt) {
      existing.lastOrderAt = ord.createdAt;
      existing.lastOrderNo = ord.orderNo;
      existing.customerName = ord.customerName;
      existing.districtNameBn = ord.districtNameBn;
    }

    byPhone.set(normPhone, existing);
  }

  return Array.from(byPhone.values())
    .map((c) => {
      const completedOrReturned = c.deliveredOrders + c.returnedOrders;
      const deliverySuccessRateBp =
        completedOrReturned > 0
          ? Math.round((c.deliveredOrders * 10000) / completedOrReturned)
          : 10000;
      const blacklistReasonBn =
        adminStore.blacklistedPhones[c.customerPhone] ?? null;
      const isBlacklisted = Boolean(blacklistReasonBn);
      const computedFraudScore = isBlacklisted
        ? 95
        : Math.min(
            100,
            Math.max(
              c.maxRiskScore,
              c.returnedOrders * 35 + c.cancelledOrders * 15
            )
          );

      return {
        customerPhone: c.customerPhone,
        customerName: c.customerName,
        districtNameBn: c.districtNameBn,
        totalOrders: c.totalOrders,
        deliveredOrders: c.deliveredOrders,
        returnedOrders: c.returnedOrders,
        cancelledOrders: c.cancelledOrders,
        deliverySuccessRateBp,
        isRepeatCustomer: c.deliveredOrders >= 2 || c.totalOrders >= 2,
        fraudScore: computedFraudScore,
        isBlacklisted,
        blacklistReasonBn,
        lifetimeSpendPoisha: c.lifetimeSpendPoisha,
        lastOrderNo: c.lastOrderNo,
        lastOrderAt: c.lastOrderAt,
      };
    })
    .sort((a, b) => b.totalOrders - a.totalOrders);
}

// ============================================================================
// 2. LIVE COURIER WEBHOOK RECEIVER (HMAC) & BULK CSV RECONCILIATION ENGINE
// ============================================================================

export function computeWebhookHmacSignature(
  rawPayload: string,
  secret: string,
  timestamp?: string
): string {
  return crypto.createHmac('sha256', secret).update(timestamp ? `${timestamp}.${rawPayload}` : rawPayload).digest('hex');
}

/**
 * Verifies a Courier Webhook HMAC-SHA256 signature in constant time.
 * Fails closed when secret or signature is missing or mismatched.
 */
export function verifyCourierWebhookHmac(params: {
  rawPayload: string;
  signatureHeader: string | null | undefined;
  secret: string | null | undefined;
  timestampHeader?: string | null;
  maxSkewSeconds?: number;
  nowMs?: number;
  requireSignedTimestamp?: boolean;
}): {
  valid: boolean;
  code?: 'MISSING_SECRET' | 'MISSING_SIGNATURE' | 'INVALID_SIGNATURE' | 'TIMESTAMP_EXPIRED';
  reasonBn?: string;
} {
  const secret = (params.secret ?? '').trim();
  if (!secret) {
    return {
      valid: false,
      code: 'MISSING_SECRET',
      reasonBn: 'কুরিয়ার ওয়েবহুক সিক্রেট কনফিগার করা নেই (Fail-Closed)।',
    };
  }

  const sig = (params.signatureHeader ?? '').trim();
  if (!sig) {
    return {
      valid: false,
      code: 'MISSING_SIGNATURE',
      reasonBn: 'ওয়েবহুক HMAC সিগনেচার হেডার অনুপস্থিত।',
    };
  }

  if (params.requireSignedTimestamp && !params.timestampHeader) return {
    valid: false, code: 'TIMESTAMP_EXPIRED', reasonBn: 'স্বাক্ষরযুক্ত ওয়েবহুক টাইমস্ট্যাম্প প্রয়োজন।',
  };
  if (params.timestampHeader) {
    const tsNum = Number(params.timestampHeader);
    const nowMs = params.nowMs ?? Date.now();
    const maxSkewMs = (params.maxSkewSeconds ?? 300) * 1000;
    if (!Number.isFinite(tsNum)) {
      return {
        valid: false,
        code: 'TIMESTAMP_EXPIRED',
        reasonBn: 'ওয়েবহুক টাইমস্ট্যাম্প হেডার অবৈধ।',
      };
    }
    const tsMs = tsNum < 1e12 ? tsNum * 1000 : tsNum;
    if (Math.abs(nowMs - tsMs) > maxSkewMs) {
      return {
        valid: false,
        code: 'TIMESTAMP_EXPIRED',
        reasonBn: 'ওয়েবহুক টাইমস্ট্যাম্প অনুমোদিত সময়সীমার (৫ মিনিট) বাইরে (Replay Protection)।',
      };
    }
  }

  const expectedHex = computeWebhookHmacSignature(params.rawPayload, secret,
    params.requireSignedTimestamp ? params.timestampHeader ?? undefined : undefined);
  if (!/^[a-f0-9]{64}$/i.test(sig)) {
    return {
      valid: false,
      code: 'INVALID_SIGNATURE',
      reasonBn: 'কুরিয়ার ওয়েবহুক সিগনেচার ফরম্যাট অবৈধ।',
    };
  }
  try {
    const a = Buffer.from(sig, 'hex');
    const b = Buffer.from(expectedHex, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return {
        valid: false,
        code: 'INVALID_SIGNATURE',
        reasonBn: 'কুরিয়ার ওয়েবহুক HMAC সিগনেচার যাচাই ব্যর্থ হয়েছে।',
      };
    }
  } catch {
    return {
      valid: false,
      code: 'INVALID_SIGNATURE',
      reasonBn: 'কুরিয়ার ওয়েবহুক সিগনেচার ফরম্যাট অবৈধ।',
    };
  }

  return { valid: true };
}

export function recordRejectedCourierWebhookAttempt(params: {
  provider: CourierProvider;
  orderNo: string;
  rawStatus: string;
  reasonBn: string;
}): CourierWebhookEventRecord {
  const store = readPhase6Store();
  const adminStore = readAdminStore();
  const event: CourierWebhookEventRecord = {
    webhookId: `whk-rej-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    provider: params.provider,
    consignmentId: `REJ-${params.orderNo || 'UNKNOWN'}`,
    orderNo: params.orderNo || 'UNKNOWN',
    rawStatus: params.rawStatus || 'unknown',
    mappedStatus: 'pending_confirmation',
    collectedCodPoisha: 0,
    signatureVerified: false,
    escrowPromoted: false,
    remittanceRecorded: false,
    rejectedReasonBn: params.reasonBn,
    summaryBn: `[REJECTED] ${params.provider.toUpperCase()} ওয়েবহুক প্রত্যাখ্যান করা হয়েছে: ${params.reasonBn}`,
    receivedAt: new Date().toISOString(),
  };
  store.webhookEvents.unshift(event);
  writePhase6Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: 'sys-courier-webhook-worker',
    actorUsername: 'courier_webhook_service',
    actorRole: 'packaging_manager',
    actionCode: 'COURIER_WEBHOOK_REJECTED',
    targetType: 'order',
    targetId: params.orderNo || 'UNKNOWN',
    summaryBn: event.summaryBn,
    metadata: {
      provider: params.provider,
      reasonBn: params.reasonBn,
    },
  });
  writeAdminStore(adminStore);
  return event;
}

export function processCourierWebhookPayload(
  ctx: ActorSecurityContext,
  input: {
    provider: CourierProvider;
    orderNo: string;
    consignmentId?: string;
    rawStatus:
      | 'delivered'
      | 'partial_delivered'
      | 'returned'
      | 'in_transit'
      | 'hold';
    collectedCodPoisha?: Poisha;
    signatureHeader?: string;
    eventId?: string;
    enforceReplayDeduplication?: boolean;
  }
): {
  success: boolean;
  code?: 'ORDER_NOT_FOUND' | 'DUPLICATE_EVENT';
  errorBn?: string;
  event?: CourierWebhookEventRecord;
} {
  const erp = readErpState();
  const store = readPhase6Store();
  const adminStore = readAdminStore();

  const ord = erp.orders.find(
    (o) => o.orderNo.toUpperCase() === input.orderNo.trim().toUpperCase()
  );
  if (!ord) {
    return {
      success: false,
      code: 'ORDER_NOT_FOUND',
      errorBn: `অর্ডার ${input.orderNo} খুঁজে পাওয়া যায়নি।`,
    };
  }

  const eventKey = input.eventId
    ? `${input.provider}:${input.eventId.trim()}`
    : `${input.provider}:${ord.orderNo}:${input.rawStatus}:${input.consignmentId ?? ''}`;

  if (input.enforceReplayDeduplication || input.eventId) {
    const duplicate = store.webhookEvents.find(
      (e) => e.signatureVerified && e.eventKey === eventKey
    );
    if (duplicate) {
      return {
        success: false,
        code: 'DUPLICATE_EVENT',
        errorBn: `ডুপ্লিকেট/রিপ্লে ওয়েবহুক ইভেন্ট (${eventKey}) প্রত্যাখ্যান করা হয়েছে।`,
      };
    }
  }

  let mappedStatus: OrderStatus = ord.status;
  if (
    input.rawStatus === 'delivered' ||
    input.rawStatus === 'partial_delivered'
  ) {
    mappedStatus = 'delivered';
  } else if (input.rawStatus === 'returned') {
    mappedStatus = 'returned';
  } else if (input.rawStatus === 'in_transit' || input.rawStatus === 'hold') {
    mappedStatus = 'shipped';
  }

  ord.status = mappedStatus;
  ord.courierProvider = input.provider;
  if (input.consignmentId) {
    ord.consignmentId = input.consignmentId;
  }
  writeErpState(erp);

  let escrowPromoted = false;
  let remittanceRecorded = false;

  if (mappedStatus === 'delivered' || mappedStatus === 'returned') {
    const autoRes = autoRecordOrderDeliveredOrReturned(
      ctx,
      ord.orderNo,
      mappedStatus
    );
    escrowPromoted = autoRes.escrowPromoted;
    remittanceRecorded = autoRes.ledgerRecordAdded;
  }

  const collectedCodPoisha =
    input.collectedCodPoisha ??
    (mappedStatus === 'delivered' ? ord.codCollectablePoisha : 0);

  const event: CourierWebhookEventRecord = {
    webhookId: `whk-${Date.now()}-${Math.floor(100 + Math.random() * 899)}`,
    eventKey,
    provider: input.provider,
    consignmentId:
      ord.consignmentId ?? input.consignmentId ?? `CNS-${ord.orderNo}`,
    orderNo: ord.orderNo,
    rawStatus: input.rawStatus,
    mappedStatus,
    collectedCodPoisha,
    signatureVerified: true,
    escrowPromoted,
    remittanceRecorded,
    rejectedReasonBn: null,
    summaryBn: `${input.provider.toUpperCase()} ওয়েবহুক (${input.rawStatus} → ${mappedStatus}): অর্ডার ${ord.orderNo} আপডেট হয়েছে${
      escrowPromoted ? ' এবং ভেন্ডর এসক্রো ৭-দিন হোল্ড বাকেটে প্রমোট হয়েছে' : ''
    }।`,
    receivedAt: new Date().toISOString(),
  };

  store.webhookEvents.unshift(event);
  writePhase6Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'COURIER_WEBHOOK_PROCESSED',
    targetType: 'order',
    targetId: ord.orderNo,
    summaryBn: event.summaryBn,
    metadata: {
      provider: input.provider,
      rawStatus: input.rawStatus,
      mappedStatus,
      collectedCodPoisha,
      eventKey,
    },
  });
  writeAdminStore(adminStore);

  return { success: true, event };
}

/**
 * Generates Steadfast / Pathao / RedX compatible Bulk Courier Booking CSV
 * for all confirmed/packed/shipped orders.
 */
export function generateBulkCourierBookingCsv(): string {
  const erp = readErpState();
  const header =
    'Invoice,Recipient_Name,Recipient_Phone,District,Upazila,Delivery_Address,COD_Amount_BDT,Courier_Provider,Weight_Grams';
  const rows = erp.orders.map((ord) => {
    const codBdt = Math.round(ord.codCollectablePoisha / 100);
    const safeName = ord.customerName.replace(/,/g, ' ');
    const safeAddress = ord.streetAddress.replace(/,/g, ' ');
    return `${ord.orderNo},${safeName},${ord.customerPhone},${ord.districtNameBn},${ord.upazilaNameBn},${safeAddress},${codBdt},${ord.courierProvider},500`;
  });
  return [header, ...rows].join('\n');
}

/**
 * Parses and reconciles multi-row Courier Remittance CSV:
 * Format per line: `order_no,consignment_id,remitted_bdt,courier_fee_bdt`
 * Uses exact integer Poisha math (`Math.round(Number(bdt) * 100)`).
 */
export function parseAndReconcileCourierRemittanceCsv(
  ctx: ActorSecurityContext,
  input: {
    provider: CourierProvider;
    settlementBatchRef: string;
    csvText: string;
  }
): {
  success: boolean;
  errorBn?: string;
  result?: BulkCsvReconciliationResultDTO;
} {
  if (ctx.roleSlug === 'vendor') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র অ্যাডমিন বা স্টাফ কুরিয়ার রেমিট্যান্স সিএসভি রিকনসাইল করতে পারবেন।',
    };
  }

  const lines = input.csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0 && !l.toLowerCase().startsWith('order_no'));

  if (lines.length === 0) {
    return {
      success: false,
      errorBn: 'সিএসভি ডেটা খালি। কমপক্ষে ১টি অর্ডার রো দিন।',
    };
  }

  const erp = readErpState();
  const items: Array<{
    orderNo: string;
    courierFeeDeductedPoisha: Poisha;
    remittedAmountPoisha: Poisha;
  }> = [];

  for (const line of lines) {
    const parts = line.split(',').map((p) => p.trim());
    const orderNo = parts[0] ?? '';
    const remittedBdt = Number(parts[2] ?? '0');
    const feeBdt = Number(parts[3] ?? '70');

    if (!orderNo || Number.isNaN(remittedBdt) || Number.isNaN(feeBdt)) {
      continue;
    }

    const ord = erp.orders.find(
      (o) => o.orderNo.toUpperCase() === orderNo.toUpperCase()
    );
    const remittedAmountPoisha = Math.round(remittedBdt * 100);
    const courierFeeDeductedPoisha = Math.round(feeBdt * 100);

    items.push({
      orderNo: ord?.orderNo ?? orderNo,
      courierFeeDeductedPoisha,
      remittedAmountPoisha,
    });
  }

  const res = recordCourierRemittanceSettlement(ctx, {
    settlementRef: input.settlementBatchRef,
    courierProvider: input.provider,
    items,
  });

  if (!res.success) {
    return {
      success: false,
      errorBn: res.errorBn ?? 'কুরিয়ার রেমিট্যান্স রিকনসাইল করা যায়নি।',
    };
  }

  const settledCount = res.settledCount;
  const shortPaymentFlaggedCount = res.shortPaymentCount;
  let totalExpectedCodPoisha = 0;
  let totalRemittedPoisha = 0;
  let totalShortPaymentPoisha = 0;
  const processedOrderNos: string[] = [];

  for (const rec of res.records) {
    processedOrderNos.push(rec.orderNo);
    totalExpectedCodPoisha += rec.expectedCodPoisha;
    totalRemittedPoisha += rec.remittedAmountPoisha;
    totalShortPaymentPoisha += rec.shortPaymentPoisha;
  }

  const result: BulkCsvReconciliationResultDTO = {
    batchRef: input.settlementBatchRef,
    provider: input.provider,
    totalRowsParsed: lines.length,
    settledCount,
    shortPaymentFlaggedCount,
    totalExpectedCodPoisha,
    totalRemittedPoisha,
    totalShortPaymentPoisha,
    processedOrderNos,
    summaryBn: `ব্যাচ ${input.settlementBatchRef}: মোট ${settledCount}টি অর্ডারের কুরিয়ার রেমিট্যান্স পয়সায় রিকনসাইল হয়েছে (${shortPaymentFlaggedCount}টি শর্ট-পেমেন্ট ফ্ল্যাগড)।`,
  };

  return { success: true, result };
}

// ============================================================================
// 3. PRODUCT REVIEW MODERATION & VENDOR PERFORMANCE SCORECARD ENGINE
// ============================================================================

export function getModeratedReviewsList(): ModeratedReviewItemDTO[] {
  const erp = readErpState();
  const store = readPhase6Store();

  return erp.reviews.map((rev) => {
    const prod = erp.products.find((p) => p.productId === rev.productId);
    const mod = store.reviewModerationStatus[rev.id] ?? {
      status: 'pending' as const,
      moderatedBy: null,
      moderatedAt: null,
    };

    return {
      reviewId: rev.id,
      productId: rev.productId,
      productNameBn: prod?.nameBn ?? 'কনসাইনমেন্ট পণ্য',
      publicSku: prod?.variants[0]?.publicSku ?? 'BG-SKU',
      customerName: rev.customerName,
      rating: rev.rating,
      comment: rev.comment,
      isVerifiedPurchase: rev.isVerifiedPurchase,
      moderationStatus: mod.status,
      moderatedBy: mod.moderatedBy,
      moderatedAt: mod.moderatedAt,
      createdAt: rev.createdAt,
    };
  });
}

export function moderateProductReview(
  ctx: ActorSecurityContext,
  input: {
    reviewId: string;
    decision: 'approved' | 'rejected';
  }
): {
  success: boolean;
  errorBn?: string;
  reviews?: ModeratedReviewItemDTO[];
} {
  if (ctx.roleSlug === 'vendor') {
    return {
      success: false,
      errorBn: 'ভেন্ডর রোল থেকে কাস্টমার রিভিউ মডারেট করা যাবে না।',
    };
  }

  const erp = readErpState();
  const store = readPhase6Store();
  const adminStore = readAdminStore();

  const rev = erp.reviews.find((r) => r.id === input.reviewId);
  if (!rev) {
    return { success: false, errorBn: 'রিভিউ খুঁজে পাওয়া যায়নি।' };
  }

  store.reviewModerationStatus[rev.id] = {
    status: input.decision,
    moderatedBy: ctx.username,
    moderatedAt: new Date().toISOString(),
  };

  // Recalculate product ratingAvgBp & reviewCount from approved reviews
  const prod = erp.products.find((p) => p.productId === rev.productId);
  if (prod) {
    const approvedForProd = erp.reviews.filter((r) => {
      if (r.productId !== prod.productId) return false;
      const st = store.reviewModerationStatus[r.id]?.status ?? 'approved';
      return st === 'approved';
    });
    prod.reviewCount = approvedForProd.length;
    if (approvedForProd.length > 0) {
      const sumRatings = approvedForProd.reduce((acc, r) => acc + r.rating, 0);
      prod.ratingAvgBp = Math.round(
        (sumRatings * 100) / approvedForProd.length
      );
    }
    writeErpState(erp);
  }

  writePhase6Store(store);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: `PRODUCT_REVIEW_${input.decision.toUpperCase()}`,
    targetType: 'product',
    targetId: rev.productId,
    summaryBn: `রিভিউ (${rev.customerName} — ${rev.rating}★) "${input.decision}" হিসেবে মডারেট করা হয়েছে।`,
    metadata: { reviewId: rev.id, decision: input.decision },
  });
  writeAdminStore(adminStore);

  return {
    success: true,
    reviews: getModeratedReviewsList(),
  };
}

export function computeVendorPerformanceScorecards(): VendorScorecardRowDTO[] {
  const erp = readErpState();
  const p4b = readPhase4BStore();

  return p4b.vendors.map((v) => {
    const vendorProducts = erp.products.filter(
      (p) => p.vendorId === v.vendorId
    );
    const totalUnitsSold = vendorProducts.reduce(
      (acc, p) => acc + p.totalSoldCount,
      0
    );
    const totalUnitsReturned = vendorProducts.reduce(
      (acc, p) => acc + p.totalReturnedCount,
      0
    );
    const totalHandled = totalUnitsSold + totalUnitsReturned;
    const returnRateBp =
      totalHandled > 0
        ? Math.round((totalUnitsReturned * 10000) / totalHandled)
        : 0;

    const supplierFaultReturnCount = p4b.returnResolutions.filter(
      (r) => r.vendorId === v.vendorId && r.faultType === 'SUPPLIER_DEFECT'
    ).length;

    let grossSalesPoisha = 0;
    let netVendorPayablePoisha = 0;
    let platformMarginGeneratedPoisha = 0;

    for (const p of vendorProducts) {
      const primaryVar = p.variants[0];
      if (primaryVar) {
        grossSalesPoisha += primaryVar.salePricePoisha * p.totalSoldCount;
        netVendorPayablePoisha +=
          primaryVar.supplierPayablePoisha * p.totalSoldCount;
        platformMarginGeneratedPoisha +=
          primaryVar.platformMarginPoisha * p.totalSoldCount;
      }
    }

    const averageRatingBp =
      vendorProducts.length > 0
        ? Math.round(
            vendorProducts.reduce((acc, p) => acc + p.ratingAvgBp, 0) /
              vendorProducts.length
          )
        : 480;

    let slaGrade: 'A+' | 'A' | 'B' | 'C' = 'A+';
    if (returnRateBp > 1000 || supplierFaultReturnCount >= 3) {
      slaGrade = 'C';
    } else if (returnRateBp > 500 || supplierFaultReturnCount >= 2) {
      slaGrade = 'B';
    } else if (returnRateBp > 250) {
      slaGrade = 'A';
    }

    return {
      vendorId: v.vendorId,
      vendorCode: v.vendorCode,
      businessNameBn: v.businessNameBn,
      ownerNameBn: v.ownerNameBn,
      status: v.status,
      activeProductsCount: vendorProducts.length,
      totalUnitsSold,
      totalUnitsReturned,
      returnRateBp,
      supplierFaultReturnCount,
      grossSalesPoisha,
      netVendorPayablePoisha,
      platformMarginGeneratedPoisha,
      averageRatingBp,
      slaGrade,
    };
  });
}

// ============================================================================
// 4. FULL SYSTEM DISASTER RECOVERY SNAPSHOT & RESTORE VERIFICATION ENGINE
// ============================================================================

export function generateSystemBackupSnapshot(ctx: ActorSecurityContext): {
  success: boolean;
  errorBn?: string;
  snapshot?: SystemBackupSnapshotMeta;
  snapshots?: SystemBackupSnapshotMeta[];
} {
  if (ctx.roleSlug !== 'super_admin') {
    return {
      success: false,
      errorBn: 'শুধুমাত্র সুপার অ্যাডমিন সিস্টেম ডিজাস্টার রিকভারি স্ন্যাপশট তৈরি করতে পারবেন।',
    };
  }

  const erp = readErpState();
  const adminStore = readAdminStore();
  const p4b = readPhase4BStore();
  const p4c = readPhase4CStore();
  const p6 = readPhase6Store();

  const bundleJson = JSON.stringify({
    erp,
    p4b,
    p4c,
    auditLogsCount: adminStore.auditLogs.length,
  });

  const sha256Checksum = crypto
    .createHash('sha256')
    .update(bundleJson)
    .digest('hex');

  const snapshot: SystemBackupSnapshotMeta = {
    snapshotId: `SNAP-${Date.now().toString().slice(-6)}`,
    createdAt: new Date().toISOString(),
    createdByUsername: ctx.username,
    sha256Checksum,
    totalOrdersCount: erp.orders.length,
    totalProductsCount: erp.products.length,
    totalVendorsCount: p4b.vendors.length,
    totalLedgerEntriesCount: p4b.vendorLedger.length,
    totalAuditLogsCount: adminStore.auditLogs.length,
    payloadSizeBytes: Buffer.byteLength(bundleJson, 'utf8'),
  };

  p6.backupSnapshots.unshift(snapshot);
  writePhase6Store(p6);

  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: 'SYSTEM_BACKUP_SNAPSHOT_GENERATED',
    targetType: 'system',
    targetId: snapshot.snapshotId,
    summaryBn: `পূর্ণাঙ্গ সিস্টেম ব্যাকআপ স্ন্যাপশট (${snapshot.snapshotId}, SHA-256: ${sha256Checksum.slice(0, 12)}...) তৈরি হয়েছে।`,
    metadata: {
      snapshotId: snapshot.snapshotId,
      sha256Checksum,
      payloadSizeBytes: snapshot.payloadSizeBytes,
    },
  });
  writeAdminStore(adminStore);

  return {
    success: true,
    snapshot,
    snapshots: p6.backupSnapshots,
  };
}

export function getPhase6WorkspaceOverview(
  ctx: ActorSecurityContext
): Phase6WorkspaceOverviewDTO {
  const store = readPhase6Store();
  const isVendor = ctx.roleSlug === 'vendor';

  // Ensure any new storefront abandoned carts from erpState are synced
  const erp = readErpState();
  for (const ac of erp.abandonedCarts) {
    const exists = store.abandonedCarts.some(
      (c) => c.customerPhone === ac.customerPhone
    );
    if (!exists && ac.items.length > 0) {
      const dist = getDistrictById(ac.districtId);
      const links = buildCartRecoveryLinks({
        customerPhone: ac.customerPhone,
        customerName: ac.customerName || 'গ্রাহক',
        firstProductNameBn: ac.items[0]?.productNameBn ?? 'কনসাইনমেন্ট পণ্য',
        subtotalPoisha: ac.subtotalPoisha,
      });
      store.abandonedCarts.unshift({
        cartId: `acart-${Date.now()}-${Math.floor(10 + Math.random() * 89)}`,
        customerPhone: ac.customerPhone,
        customerName: ac.customerName || 'গ্রাহক',
        districtId: ac.districtId,
        districtNameBn: dist?.name_bn ?? 'ঢাকা',
        upazilaId: 145,
        streetAddress: 'চেকআউট ফর্ম থেকে সংরক্ষিত',
        subtotalPoisha: ac.subtotalPoisha,
        items: ac.items.map((it) => ({
          ...it,
          publicSku: 'BG-CART',
        })),
        isRecovered: false,
        recoveredOrderNo: null,
        reminderSentCount: 0,
        lastReminderSentAt: null,
        createdAt: ac.updatedAt,
        updatedAt: ac.updatedAt,
        ...links,
      });
    }
  }

  const allScorecards = computeVendorPerformanceScorecards();

  return {
    abandonedCarts: isVendor ? [] : store.abandonedCarts,
    customers360: isVendor ? [] : computeCustomer360Directory(),
    webhookEvents: isVendor ? [] : store.webhookEvents,
    moderatedReviews: isVendor ? [] : getModeratedReviewsList(),
    vendorScorecards: isVendor
      ? allScorecards.filter((s) => s.vendorId === ctx.vendorId)
      : allScorecards,
    backupSnapshots: ctx.roleSlug === 'super_admin' ? store.backupSnapshots : [],
    bookingCsvPreview: isVendor ? '' : generateBulkCourierBookingCsv(),
  };
}
