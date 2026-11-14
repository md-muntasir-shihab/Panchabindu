// src/lib/inventory/phase3-inventory-order-engine.ts
// Phase 3 (Section 6.1 – 6.4): Inventory, Multi-Vendor Order, State Machine & Consignment Integrity Engine
//   - 6.1 Inventory: Warehouses, QC Stock Receiving, Append-Only Stock Movement Ledger,
//         Available/Reserved/InTransit/Damaged/Returned Stock, Adjustment with Reason,
//         Stock Reconciliation, Reservation Expiry, & Atomic Concurrency Lock (Zero Oversell)
//   - 6.2 Multi-Vendor Order: Parent Customer Order + Per-Vendor Fulfillment Groups (VFG),
//         Partial Packing/Shipment, Partial Delivery, Partial Cancellation, Partial Return & Refund
//   - 6.3 Order State Machine: 5 Orthogonal Status Dimensions (Order, Payment, Fulfillment,
//         Shipment, Settlement), Role Guards, Preconditions, Side Effects, Idempotency & Audit Trail
//   - 6.4 Cancellation, Return & Damage: Policy Check, 7-Day Eligibility, QC Inspection
//         (Restock / Damaged / Rejected), 4-Way Fault Vendor Liability, & Payment Reversal

import path from 'node:path';
import crypto from 'node:crypto';
import type {
  CourierProvider,
  DeliveryMethod,
  InventoryEventType,
  OrderSource,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  ReturnFaultType,
} from '../../types/database.types';
import type { Poisha } from '../../types/domain';
import type { ActorSecurityContext, SystemRoleSlug } from '../../types/permissions';
import {
  appendImmutableAuditLog,
  readAdminStore,
  writeAdminStore,
} from '../admin/phase4a-service';
import {
  readPhase4BStore,
  writePhase4BStore,
} from '../admin/phase4b-service';
import {
  readPhase7Store,
  writePhase7Store,
  type CustomerRefundExecutionRecord,
} from '../admin/phase7-service';
import {
  createStorefrontOrder,
  readErpState,
  writeErpState,
} from '../db/repository';
import {
  calculateMaturityTimestamp,
  evaluateFourWayReturn,
} from '../money';
import { readLocalJsonStore, writeLocalJsonStore } from '../db/local-json-store';

// ============================================================================
// 1. PHASE 3 DOMAIN INTERFACES & ORTHOGONAL STATUS DIMENSIONS
// ============================================================================

export type FulfillmentDimensionStatus =
  | 'unallocated'
  | 'allocated'
  | 'partially_packed'
  | 'packed'
  | 'partially_shipped'
  | 'shipped'
  | 'partially_delivered'
  | 'delivered'
  | 'partially_returned'
  | 'returned'
  | 'cancelled';

export type ShipmentDimensionStatus =
  | 'not_booked'
  | 'booked_manifested'
  | 'handed_over_in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'return_in_transit'
  | 'returned_to_warehouse';

export type SettlementDimensionStatus =
  | 'unsettled'
  | 'escrow_pending'
  | 'escrow_locked_hold'
  | 'escrow_matured_available'
  | 'settled_paid'
  | 'reversed_or_clawed_back';

export interface OrthogonalOrderStateSnapshot {
  orderNo: string;
  orderStatus: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentDimensionStatus;
  shipmentStatus: ShipmentDimensionStatus;
  settlementStatus: SettlementDimensionStatus;
  updatedAt: string;
}

export interface WarehouseLocationRecord {
  warehouseId: string;
  code: string;
  nameBn: string;
  nameEn: string;
  districtId: number;
  addressBn: string;
  isDefault: boolean;
  isActive: boolean;
}

export interface StockMovementLedgerEntry {
  movementId: string;
  variantId: string;
  publicSku: string;
  productId: string;
  vendorId: string;
  warehouseCode: string;
  binLocationCode: string;
  eventType: InventoryEventType;
  onHandDelta: number;
  reservedDelta: number;
  inTransitDelta: number;
  damagedDelta: number;
  balanceOnHandAfter: number;
  balanceReservedAfter: number;
  balanceInTransitAfter: number;
  balanceDamagedAfter: number;
  balanceAvailableAfter: number;
  referenceOrderNo: string | null;
  referenceLotOrReturnCode: string | null;
  reasonBn: string;
  actorUsername: string;
  createdAt: string;
}

export interface StockReservationRecord {
  reservationId: string;
  orderNo: string;
  variantId: string;
  publicSku: string;
  vendorId: string;
  reservedQty: number;
  status:
    | 'active'
    | 'committed_shipped'
    | 'released_expired'
    | 'released_cancelled';
  createdAt: string;
  expiresAt: string;
  releasedAt: string | null;
}

export interface VendorFulfillmentGroupLineItem {
  variantId: string;
  productId: string;
  publicSku: string;
  internalVendorSku: string;
  productNameBn: string;
  variantTitleBn: string;
  orderedQty: number;
  packedQty: number;
  shippedQty: number;
  deliveredQty: number;
  cancelledQty: number;
  returnedQty: number;
  damagedQty: number;
  unitSupplierCostPoisha: Poisha;
  unitSupplierProfitPoisha: Poisha;
  unitSupplierPayablePoisha: Poisha;
  unitPlatformMarginPoisha: Poisha;
  unitSalePricePoisha: Poisha;
  lineSupplierPayablePoisha: Poisha;
  linePlatformMarginPoisha: Poisha;
  lineSaleSubtotalPoisha: Poisha;
}

export interface VendorFulfillmentGroupDetailRecord {
  groupId: string;
  groupCode: string;
  orderNo: string;
  vendorId: string;
  vendorCode: string;
  vendorNameBn: string;
  fulfillmentStatus:
    | 'allocated'
    | 'packed'
    | 'shipped'
    | 'out_for_delivery'
    | 'delivered'
    | 'partially_returned'
    | 'returned'
    | 'cancelled';
  shipmentStatus: ShipmentDimensionStatus;
  settlementStatus: SettlementDimensionStatus;
  courierProvider: CourierProvider;
  consignmentId: string | null;
  trackingCode: string | null;
  totalUnits: number;
  activeUnits: number;
  groupSaleSubtotalPoisha: Poisha;
  groupSupplierCostPoisha: Poisha;
  groupSupplierProfitPoisha: Poisha;
  groupSupplierPayablePoisha: Poisha;
  groupPlatformMarginPoisha: Poisha;
  allocatedPromoDiscountPoisha: Poisha;
  netPlatformMarginPoisha: Poisha;
  lines: VendorFulfillmentGroupLineItem[];
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OrderStateTransitionAuditRecord {
  transitionId: string;
  idempotencyKey: string;
  orderNo: string;
  fromOrderStatus: OrderStatus;
  toOrderStatus: OrderStatus;
  actorUsername: string;
  actorRole: SystemRoleSlug | 'customer' | 'webhook_service';
  reasonBn: string;
  sideEffectsApplied: string[];
  orthogonalStateAfter: OrthogonalOrderStateSnapshot;
  createdAt: string;
}

export type ReturnInspectionDecision =
  | 'RESTOCK_INTACT'
  | 'QUARANTINE_DAMAGED'
  | 'REJECT_CLAIM';

export interface Phase3ReturnInspectionRecord {
  inspectionId: string;
  returnCaseCode: string;
  orderNo: string;
  groupCode: string | null;
  variantId: string;
  publicSku: string;
  vendorId: string;
  requestedQty: number;
  inspectedDecision: ReturnInspectionDecision;
  faultType: ReturnFaultType;
  restockedQty: number;
  damagedQuarantinedQty: number;
  rejectedQty: number;
  vendorDebitPoisha: Poisha;
  platformLossPoisha: Poisha;
  courierClaimPoisha: Poisha;
  customerRefundPoisha: Poisha;
  inspectorUsername: string;
  inspectionNoteBn: string;
  createdAt: string;
}

export interface Phase3PersistedStore {
  warehouses: WarehouseLocationRecord[];
  stockMovements: StockMovementLedgerEntry[];
  stockReservations: StockReservationRecord[];
  fulfillmentGroupsByOrder: Record<string, VendorFulfillmentGroupDetailRecord[]>;
  orthogonalOrderStates: Record<string, OrthogonalOrderStateSnapshot>;
  transitionHistory: OrderStateTransitionAuditRecord[];
  returnInspections: Phase3ReturnInspectionRecord[];
}

const PHASE3_STORE_PATH = path.join(
  process.cwd(),
  '.data',
  'erp-phase3-store.json'
);

function createInitialPhase3Store(): Phase3PersistedStore {
  return {
    warehouses: [
      {
        warehouseId: 'wh-dac-central',
        code: 'WH-DAC-CENTRAL',
        nameBn: 'ঢাকা সেন্ট্রাল কনসাইনমেন্ট ওয়্যারহাউস (ধানমন্ডি)',
        nameEn: 'Dhaka Central Consignment Warehouse',
        districtId: 47,
        addressBn: 'প্লট ১২, রোড ৪/এ, ধানমন্ডি আ/এ, ঢাকা-১২০৯',
        isDefault: true,
        isActive: true,
      },
      {
        warehouseId: 'wh-pnc-north',
        code: 'WH-PNC-NORTH',
        nameBn: 'পঞ্চবিন্দু নর্থ সোর্সিং ও কিউসি হাব',
        nameEn: 'Panchabindu North Sourcing & QC Hub',
        districtId: 53,
        addressBn: 'তেঁতুলিয়া রোড, পঞ্চবিন্দু সদর',
        isDefault: false,
        isActive: true,
      },
    ],
    stockMovements: [],
    stockReservations: [],
    fulfillmentGroupsByOrder: {},
    orthogonalOrderStates: {},
    transitionHistory: [],
    returnInspections: [],
  };
}

export function readPhase3Store(): Phase3PersistedStore {
  const parsed = readLocalJsonStore<Phase3PersistedStore>(PHASE3_STORE_PATH, {
    arrays: ['warehouses', 'stockMovements', 'stockReservations', 'transitionHistory', 'returnInspections'],
    objects: ['fulfillmentGroupsByOrder', 'orthogonalOrderStates'],
  });
  if (parsed) return parsed;
  const initial = createInitialPhase3Store();
  writePhase3Store(initial);
  return initial;
}

export function writePhase3Store(store: Phase3PersistedStore): void {
  writeLocalJsonStore(PHASE3_STORE_PATH, store);
}

// ============================================================================
// 2. SECTION 6.1: INVENTORY, QC RECEIVING, ADJUSTMENT, RECONCILIATION & ATOMIC LOCK
// ============================================================================

let atomicStockMutexQueue: Promise<unknown> = Promise.resolve();

/**
 * Serializes concurrent stock-mutating operations to prevent race conditions and double-selling.
 */
export function runWithAtomicStockLock<T>(operation: () => T | Promise<T>): Promise<T> {
  const next = atomicStockMutexQueue.then(() => operation());
  atomicStockMutexQueue = next.catch(() => undefined);
  return next;
}

/**
 * Receives a vendor consignment lot into a warehouse with QC inspection:
 * - qcAcceptedQty increments stockOnHand & stockAvailable
 * - qcRejectedQty increments stockDamaged (never sellable)
 * - Appends immutable StockMovementLedgerEntry records
 */
export function receiveConsignmentStockLotWithQc(
  ctx: ActorSecurityContext,
  input: {
    variantId: string;
    warehouseCode?: string;
    binLocationCode?: string;
    dispatchedQty: number;
    qcAcceptedQty: number;
    qcRejectedQty: number;
    challanRef: string;
    noteBn: string;
  }
): {
  success: boolean;
  errorBn?: string;
  movements?: StockMovementLedgerEntry[];
  updatedStock?: {
    stockOnHand: number;
    stockReserved: number;
    stockInTransit: number;
    stockDamaged: number;
    stockAvailable: number;
  };
} {
  if (
    ctx.roleSlug !== 'super_admin' &&
    ctx.roleSlug !== 'packaging_manager'
  ) {
    return {
      success: false,
      errorBn:
        'শুধুমাত্র সুপার অ্যাডমিন বা প্যাকেজিং ম্যানেজার ওয়্যারহাউস কিউসি স্টক রিসিভ করতে পারবেন।',
    };
  }

  if (
    !Number.isInteger(input.dispatchedQty) ||
    input.dispatchedQty <= 0 ||
    !Number.isInteger(input.qcAcceptedQty) ||
    input.qcAcceptedQty < 0 ||
    !Number.isInteger(input.qcRejectedQty) ||
    input.qcRejectedQty < 0 ||
    input.qcAcceptedQty + input.qcRejectedQty !== input.dispatchedQty
  ) {
    return {
      success: false,
      errorBn:
        'কিউসি গৃহীত সংখ্যা এবং বাতিল সংখ্যার যোগফল অবশ্যই প্রেরিত সংখ্যার সমান হতে হবে।',
    };
  }

  const erp = readErpState();
  const p3 = readPhase3Store();

  let matchedProduct = erp.products[0];
  let matchedVariant = matchedProduct?.variants[0];
  let found = false;

  for (const prod of erp.products) {
    const vr = prod.variants.find((v) => v.variantId === input.variantId);
    if (vr) {
      matchedProduct = prod;
      matchedVariant = vr;
      found = true;
      break;
    }
  }

  if (!found || !matchedProduct || !matchedVariant) {
    return {
      success: false,
      errorBn: 'প্রোডাক্ট ভ্যারিয়েন্ট খুঁজে পাওয়া যায়নি।',
    };
  }

  const warehouseCode = input.warehouseCode?.trim() || 'WH-DAC-CENTRAL';
  const binCode = input.binLocationCode?.trim() || 'BIN-A1';
  const nowIso = new Date().toISOString();
  const movements: StockMovementLedgerEntry[] = [];

  if (input.qcAcceptedQty > 0) {
    matchedVariant.stockOnHand += input.qcAcceptedQty;
    matchedVariant.stockAvailable = Math.max(
      0,
      matchedVariant.stockOnHand - matchedVariant.stockReserved
    );

    const acceptedEntry: StockMovementLedgerEntry = {
      movementId: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      variantId: matchedVariant.variantId,
      publicSku: matchedVariant.publicSku,
      productId: matchedProduct.productId,
      vendorId: matchedProduct.vendorId,
      warehouseCode,
      binLocationCode: binCode,
      eventType: 'CONSIGNMENT_IN',
      onHandDelta: input.qcAcceptedQty,
      reservedDelta: 0,
      inTransitDelta: 0,
      damagedDelta: 0,
      balanceOnHandAfter: matchedVariant.stockOnHand,
      balanceReservedAfter: matchedVariant.stockReserved,
      balanceInTransitAfter: matchedVariant.stockInTransit,
      balanceDamagedAfter: matchedVariant.stockDamaged,
      balanceAvailableAfter: matchedVariant.stockAvailable,
      referenceOrderNo: null,
      referenceLotOrReturnCode: input.challanRef.trim(),
      reasonBn: `কনসাইনমেন্ট কিউসি পাস (${input.challanRef}): ${input.noteBn.trim()}`,
      actorUsername: ctx.username,
      createdAt: nowIso,
    };
    p3.stockMovements.unshift(acceptedEntry);
    movements.push(acceptedEntry);
  }

  if (input.qcRejectedQty > 0) {
    matchedVariant.stockDamaged += input.qcRejectedQty;

    const damagedEntry: StockMovementLedgerEntry = {
      movementId: `mov-dmg-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      variantId: matchedVariant.variantId,
      publicSku: matchedVariant.publicSku,
      productId: matchedProduct.productId,
      vendorId: matchedProduct.vendorId,
      warehouseCode,
      binLocationCode: `${binCode}-QUARANTINE`,
      eventType: 'DAMAGE_WRITE_OFF',
      onHandDelta: 0,
      reservedDelta: 0,
      inTransitDelta: 0,
      damagedDelta: input.qcRejectedQty,
      balanceOnHandAfter: matchedVariant.stockOnHand,
      balanceReservedAfter: matchedVariant.stockReserved,
      balanceInTransitAfter: matchedVariant.stockInTransit,
      balanceDamagedAfter: matchedVariant.stockDamaged,
      balanceAvailableAfter: matchedVariant.stockAvailable,
      referenceOrderNo: null,
      referenceLotOrReturnCode: input.challanRef.trim(),
      reasonBn: `কিউসি রিজেক্টেড/ড্যামেজ কোয়ারেন্টাইন (${input.challanRef}): ${input.noteBn.trim()}`,
      actorUsername: ctx.username,
      createdAt: nowIso,
    };
    p3.stockMovements.unshift(damagedEntry);
    movements.push(damagedEntry);
  }

  writeErpState(erp);
  writePhase3Store(p3);

  return {
    success: true,
    movements,
    updatedStock: {
      stockOnHand: matchedVariant.stockOnHand,
      stockReserved: matchedVariant.stockReserved,
      stockInTransit: matchedVariant.stockInTransit,
      stockDamaged: matchedVariant.stockDamaged,
      stockAvailable: matchedVariant.stockAvailable,
    },
  };
}

/**
 * Adjusts variant stock with mandatory reason and negative-stock prevention.
 */
export function adjustVariantStockWithReason(
  ctx: ActorSecurityContext,
  input: {
    variantId: string;
    eventType: 'MANUAL_AUDIT' | 'DAMAGE_WRITE_OFF' | 'VENDOR_RETURN_OUT';
    onHandDelta: number;
    damagedDelta?: number;
    warehouseCode?: string;
    binLocationCode?: string;
    reasonBn: string;
  }
): {
  success: boolean;
  errorBn?: string;
  movement?: StockMovementLedgerEntry;
} {
  if (
    ctx.roleSlug !== 'super_admin' &&
    ctx.roleSlug !== 'packaging_manager'
  ) {
    return {
      success: false,
      errorBn:
        'শুধুমাত্র সুপার অ্যাডমিন বা প্যাকেজিং ম্যানেজার স্টক অ্যাডজাস্টমেন্ট করতে পারবেন।',
    };
  }

  const cleanReason = (input.reasonBn ?? '').trim();
  if (cleanReason.length < 5) {
    return {
      success: false,
      errorBn:
        'স্টক অ্যাডজাস্টমেন্টের জন্য কমপক্ষে ৫ অক্ষরের স্পষ্ট কারণ উল্লেখ করা বাধ্যতামূলক।',
    };
  }

  if (!Number.isInteger(input.onHandDelta)) {
    return {
      success: false,
      errorBn: 'স্টক পরিবর্তন অবশ্যই পূর্ণসংখ্যা হতে হবে।',
    };
  }

  const erp = readErpState();
  const p3 = readPhase3Store();
  const adminStore = readAdminStore();

  let matchedProduct = erp.products[0];
  let matchedVariant = matchedProduct?.variants[0];
  let found = false;

  for (const prod of erp.products) {
    const vr = prod.variants.find((v) => v.variantId === input.variantId);
    if (vr) {
      matchedProduct = prod;
      matchedVariant = vr;
      found = true;
      break;
    }
  }

  if (!found || !matchedProduct || !matchedVariant) {
    return {
      success: false,
      errorBn: 'প্রোডাক্ট ভ্যারিয়েন্ট খুঁজে পাওয়া যায়নি।',
    };
  }

  const projectedOnHand = matchedVariant.stockOnHand + input.onHandDelta;
  const damagedDelta = input.damagedDelta ?? 0;
  const projectedDamaged = matchedVariant.stockDamaged + damagedDelta;

  // Negative stock & reserved stock violation prevention
  if (projectedOnHand < 0) {
    return {
      success: false,
      errorBn: `NEGATIVE_STOCK_BLOCKED: স্টক অন-হ্যান্ড ঋণাত্মক (${projectedOnHand}) হতে পারে না।`,
    };
  }
  if (projectedOnHand < matchedVariant.stockReserved) {
    return {
      success: false,
      errorBn: `RESERVED_STOCK_CONFLICT: বর্তমান রিজার্ভড স্টকের (${matchedVariant.stockReserved}) নিচে অন-হ্যান্ড স্টক (${projectedOnHand}) নামানো যাবে না।`,
    };
  }
  if (projectedDamaged < 0) {
    return {
      success: false,
      errorBn: 'ড্যামেজড স্টক ঋণাত্মক হতে পারে না।',
    };
  }

  matchedVariant.stockOnHand = projectedOnHand;
  matchedVariant.stockDamaged = projectedDamaged;
  matchedVariant.stockAvailable = Math.max(
    0,
    matchedVariant.stockOnHand - matchedVariant.stockReserved
  );

  const movement: StockMovementLedgerEntry = {
    movementId: `mov-adj-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    variantId: matchedVariant.variantId,
    publicSku: matchedVariant.publicSku,
    productId: matchedProduct.productId,
    vendorId: matchedProduct.vendorId,
    warehouseCode: input.warehouseCode?.trim() || 'WH-DAC-CENTRAL',
    binLocationCode: input.binLocationCode?.trim() || 'BIN-A1',
    eventType: input.eventType,
    onHandDelta: input.onHandDelta,
    reservedDelta: 0,
    inTransitDelta: 0,
    damagedDelta,
    balanceOnHandAfter: matchedVariant.stockOnHand,
    balanceReservedAfter: matchedVariant.stockReserved,
    balanceInTransitAfter: matchedVariant.stockInTransit,
    balanceDamagedAfter: matchedVariant.stockDamaged,
    balanceAvailableAfter: matchedVariant.stockAvailable,
    referenceOrderNo: null,
    referenceLotOrReturnCode: null,
    reasonBn: cleanReason,
    actorUsername: ctx.username,
    createdAt: new Date().toISOString(),
  };

  p3.stockMovements.unshift(movement);
  appendImmutableAuditLog(adminStore, {
    actorUserId: ctx.userId,
    actorUsername: ctx.username,
    actorRole: ctx.roleSlug,
    actionCode: `STOCK_ADJUSTED_${input.eventType}`,
    targetType: 'product',
    targetId: matchedVariant.publicSku,
    summaryBn: `${ctx.username} ভ্যারিয়েন্ট ${matchedVariant.publicSku}-এ স্টক অ্যাডজাস্ট করেছেন (${input.onHandDelta >= 0 ? '+' : ''}${input.onHandDelta})। কারণ: ${cleanReason}`,
    metadata: {
      variantId: matchedVariant.variantId,
      onHandDelta: input.onHandDelta,
      damagedDelta,
      balanceAvailableAfter: matchedVariant.stockAvailable,
    },
  });

  writeErpState(erp);
  writePhase3Store(p3);
  writeAdminStore(adminStore);

  return {
    success: true,
    movement,
  };
}

export interface VariantStockReconciliationRow {
  variantId: string;
  publicSku: string;
  vendorId: string;
  vendorCode: string;
  stockOnHand: number;
  stockReserved: number;
  stockInTransit: number;
  stockDamaged: number;
  stockAvailable: number;
  expectedAvailable: number;
  nonNegativeHolds: boolean;
  availableIdentityHolds: boolean;
  reconciled: boolean;
}

/**
 * Audits all product variants to verify stock bucket invariants and zero negative stock.
 */
export function reconcileInventoryStockState(): {
  totalVariantsChecked: number;
  allReconciled: boolean;
  discrepancyCount: number;
  rows: VariantStockReconciliationRow[];
} {
  const erp = readErpState();
  const rows: VariantStockReconciliationRow[] = [];

  for (const prod of erp.products) {
    for (const vr of prod.variants) {
      const expectedAvailable = Math.max(0, vr.stockOnHand - vr.stockReserved);
      const nonNegativeHolds =
        vr.stockOnHand >= 0 &&
        vr.stockReserved >= 0 &&
        vr.stockInTransit >= 0 &&
        vr.stockDamaged >= 0 &&
        vr.stockOnHand >= vr.stockReserved;
      const availableIdentityHolds = vr.stockAvailable === expectedAvailable;
      rows.push({
        variantId: vr.variantId,
        publicSku: vr.publicSku,
        vendorId: prod.vendorId,
        vendorCode: prod.vendorCode,
        stockOnHand: vr.stockOnHand,
        stockReserved: vr.stockReserved,
        stockInTransit: vr.stockInTransit,
        stockDamaged: vr.stockDamaged,
        stockAvailable: vr.stockAvailable,
        expectedAvailable,
        nonNegativeHolds,
        availableIdentityHolds,
        reconciled: nonNegativeHolds && availableIdentityHolds,
      });
    }
  }

  const discrepancyCount = rows.filter((r) => !r.reconciled).length;
  return {
    totalVariantsChecked: rows.length,
    allReconciled: discrepancyCount === 0,
    discrepancyCount,
    rows,
  };
}

/**
 * Registers an order stock reservation with a TTL and releases expired unconfirmed reservations atomically.
 */
export function registerOrderStockReservation(params: {
  orderNo: string;
  variantId: string;
  publicSku: string;
  vendorId: string;
  reservedQty: number;
  ttlHours?: number;
  nowMs?: number;
}): StockReservationRecord {
  const p3 = readPhase3Store();
  const existing = p3.stockReservations.find(reservation => reservation.orderNo === params.orderNo && reservation.variantId === params.variantId);
  if (existing) {
    if (existing.status !== 'active' || existing.reservedQty !== params.reservedQty) throw new Error('RESERVATION_CONFLICT');
    return existing;
  }
  const nowMs = params.nowMs ?? Date.now();
  const ttlHours = params.ttlHours ?? 24;
  const record: StockReservationRecord = {
    reservationId: `resv-${params.orderNo}-${params.variantId}`,
    orderNo: params.orderNo,
    variantId: params.variantId,
    publicSku: params.publicSku,
    vendorId: params.vendorId,
    reservedQty: params.reservedQty,
    status: 'active',
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlHours * 3600 * 1000).toISOString(),
    releasedAt: null,
  };
  p3.stockReservations.unshift(record);
  writePhase3Store(p3);
  return record;
}

export function reconcileOrderReservationRecords(orderNo: string, actorUsername: string,
  before?: Array<{ variantId: string; quantity: number }>): void {
  const erp = readErpState();
  const order = erp.orders.find(order => order.orderNo === orderNo);
  if (!order) throw new Error('ORDER_NOT_FOUND');
  const store = readPhase3Store();
  const previousGroups = store.fulfillmentGroupsByOrder[orderNo] ?? [];
  if (before && previousGroups.some(group => group.fulfillmentStatus !== 'allocated')) throw new Error('FULFILLMENT_AMENDMENT_LOCKED');
  const lines = erp.orderLines.filter(line => line.orderId === order.id);
  const variants = new Set([...lines, ...(before ?? [])].map(line => line.variantId));
  for (const variantId of variants) {
    const product = erp.products.find(product => product.variants.some(variant => variant.variantId === variantId));
    const variant = product?.variants.find(variant => variant.variantId === variantId);
    if (!variant || !product) throw new Error('VARIANT_NOT_FOUND');
    const quantity = lines.filter(line => line.variantId === variantId).reduce((sum, line) => sum + line.quantity, 0);
    const reservation = store.stockReservations.find(reservation => reservation.orderNo === orderNo && reservation.variantId === variantId);
    const previousQuantity = before ? before.filter(line => line.variantId === variantId).reduce((sum, line) => sum + line.quantity, 0) : reservation?.reservedQty ?? 0;
    const delta = quantity - previousQuantity;
    const now = new Date().toISOString();
    if (reservation) {
      if (reservation.status !== 'active' && quantity > 0) throw new Error('RESERVATION_CONFLICT');
      reservation.reservedQty = quantity;
      if (!quantity) { reservation.status = 'released_cancelled'; reservation.releasedAt = now; }
    } else if (quantity) store.stockReservations.push({ reservationId: `resv-${orderNo}-${variantId}`, orderNo, variantId,
      publicSku: variant.publicSku, vendorId: product.vendorId, reservedQty: quantity, status: 'active',
      createdAt: now, expiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(), releasedAt: null,
    });
    if (delta) store.stockMovements.push({ movementId: crypto.randomUUID(), variantId, publicSku: variant.publicSku,
      productId: product.productId, vendorId: product.vendorId, warehouseCode: store.warehouses.find(warehouse => warehouse.isDefault)?.code ?? '', binLocationCode: '',
      eventType: delta > 0 ? 'ORDER_RESERVED' : 'ORDER_RESERVATION_RELEASED', onHandDelta: 0, reservedDelta: delta,
      inTransitDelta: 0, damagedDelta: 0, balanceOnHandAfter: variant.stockOnHand, balanceReservedAfter: variant.stockReserved,
      balanceInTransitAfter: variant.stockInTransit, balanceDamagedAfter: variant.stockDamaged, balanceAvailableAfter: variant.stockAvailable,
      referenceOrderNo: orderNo, referenceLotOrReturnCode: null, reasonBn: before ? 'অনুমোদিত অর্ডার সংশোধন' : 'চেকআউট স্টক সংরক্ষণ',
      actorUsername, createdAt: now,
    });
  }
  if (before) delete store.fulfillmentGroupsByOrder[orderNo];
  writePhase3Store(store);
  const groups = buildAndPersistOrderFulfillmentGroups(orderNo);
  if (before) {
    for (const group of groups) {
      const previous = previousGroups.find(previous => previous.vendorId === group.vendorId);
      if (previous) { group.groupId = previous.groupId; group.groupCode = previous.groupCode; }
    }
    const updated = readPhase3Store();
    updated.fulfillmentGroupsByOrder[orderNo] = groups;
    writePhase3Store(updated);
  }
}

export function releaseExpiredStockReservations(nowMs: number = Date.now()): {
  releasedReservationsCount: number;
  releasedUnitsTotal: number;
  releasedOrderNos: string[];
} {
  const erp = readErpState();
  const p3 = readPhase3Store();
  const nowIso = new Date(nowMs).toISOString();

  let releasedReservationsCount = 0;
  let releasedUnitsTotal = 0;
  const releasedOrderNos = new Set<string>();

  for (const resv of p3.stockReservations) {
    if (resv.status !== 'active') continue;
    if (Date.parse(resv.expiresAt) > nowMs) continue;

    const ord = erp.orders.find((o) => o.orderNo === resv.orderNo);
    // Only auto-expire if order is still unconfirmed (pending_confirmation)
    if (ord && ord.status !== 'pending_confirmation') {
      resv.status = 'committed_shipped';
      continue;
    }

    for (const prod of erp.products) {
      const vr = prod.variants.find((v) => v.variantId === resv.variantId);
      if (vr) {
        const releaseQty = Math.min(vr.stockReserved, resv.reservedQty);
        vr.stockReserved = Math.max(0, vr.stockReserved - releaseQty);
        vr.stockAvailable = Math.max(0, vr.stockOnHand - vr.stockReserved);
        releasedUnitsTotal += releaseQty;

        p3.stockMovements.unshift({
          movementId: `mov-exp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          variantId: vr.variantId,
          publicSku: vr.publicSku,
          productId: prod.productId,
          vendorId: prod.vendorId,
          warehouseCode: 'WH-DAC-CENTRAL',
          binLocationCode: 'BIN-A1',
          eventType: 'ORDER_RESERVATION_RELEASED',
          onHandDelta: 0,
          reservedDelta: -releaseQty,
          inTransitDelta: 0,
          damagedDelta: 0,
          balanceOnHandAfter: vr.stockOnHand,
          balanceReservedAfter: vr.stockReserved,
          balanceInTransitAfter: vr.stockInTransit,
          balanceDamagedAfter: vr.stockDamaged,
          balanceAvailableAfter: vr.stockAvailable,
          referenceOrderNo: resv.orderNo,
          referenceLotOrReturnCode: resv.reservationId,
          reasonBn: `রিজার্ভেশনের সময়সীমা (${resv.expiresAt}) শেষ হওয়ায় স্টক স্বয়ংক্রিয়ভাবে রিলিজ হয়েছে।`,
          actorUsername: 'system_reservation_reaper',
          createdAt: nowIso,
        });
        break;
      }
    }

    resv.status = 'released_expired';
    resv.releasedAt = nowIso;
    releasedReservationsCount += 1;
    releasedOrderNos.add(resv.orderNo);

    if (ord && ord.status === 'pending_confirmation') {
      ord.status = 'cancelled';
      ord.nextBestAction = 'COMPLETED';
    }
  }

  if (releasedReservationsCount > 0) {
    writeErpState(erp);
    writePhase3Store(p3);
  }

  return {
    releasedReservationsCount,
    releasedUnitsTotal,
    releasedOrderNos: [...releasedOrderNos],
  };
}

/**
 * Executes concurrent checkout requests serialized through the atomic stock mutex lock.
 * Guarantees that concurrent requests for the same variant can NEVER oversell or produce negative stock.
 */
export async function executeConcurrentCheckoutBatch(
  requests: Array<Parameters<typeof createStorefrontOrder>[0]>
): Promise<Array<ReturnType<typeof createStorefrontOrder>>> {
  return Promise.all(
    requests.map((req) =>
      runWithAtomicStockLock(() => createStorefrontOrder(req))
    )
  );
}

// ============================================================================
// 3. SECTION 6.2: MULTI-VENDOR ORDER & VENDOR FULFILLMENT GROUPS (VFG)
// ============================================================================

/**
 * Builds and persists Vendor Fulfillment Groups (VFG) for a parent Customer Order.
 * Automatically partitions order items by vendorId while keeping customer-facing orderNo
 * separate from internal vendor fulfillment groupCode (e.g., VFG-ORD-261106-0001-VND001).
 */
export function buildAndPersistOrderFulfillmentGroups(
  orderNo: string
): VendorFulfillmentGroupDetailRecord[] {
  const erp = readErpState();
  const p3 = readPhase3Store();
  const p4b = readPhase4BStore();

  const ord = erp.orders.find((o) => o.orderNo === orderNo);
  if (!ord) return [];

  const existing = p3.fulfillmentGroupsByOrder[orderNo];
  if (existing && existing.length > 0) {
    return existing;
  }

  const linesForOrder = erp.orderLines.filter((l) => l.orderId === ord.id);
  const byVendor = new Map<string, typeof linesForOrder>();

  for (const line of linesForOrder) {
    const bucket = byVendor.get(line.vendorId) ?? [];
    bucket.push(line);
    byVendor.set(line.vendorId, bucket);
  }

  const nowIso = new Date().toISOString();
  const totalGrossMarginAcrossOrder = linesForOrder.reduce(
    (sum, l) => sum + l.snapPlatformMarginPoisha * l.quantity,
    0
  );

  const groups: VendorFulfillmentGroupDetailRecord[] = [];
  let remainingPromoToAllocate = ord.discountPoisha;
  const vendorEntries = [...byVendor.entries()];

  vendorEntries.forEach(([vendorId, vendorLines], idx) => {
    const vendorProfile = p4b.vendors.find((v) => v.vendorId === vendorId);
    const vendorCode = vendorProfile?.vendorCode ?? `VND-${idx + 1}`;
    const vendorNameBn =
      vendorProfile?.businessNameBn ?? 'কনসাইনমেন্ট ভেন্ডর';
    const groupCode = `VFG-${orderNo}-${vendorCode.replace(/[^A-Z0-9]/gi, '')}`;

    const groupItems: VendorFulfillmentGroupLineItem[] = vendorLines.map(
      (vl) => {
        const lineSupplierPayable = vl.snapSupplierPayablePoisha * vl.quantity;
        const linePlatformMargin = vl.snapPlatformMarginPoisha * vl.quantity;
        const lineSaleSubtotal = vl.snapUnitSalePricePoisha * vl.quantity;
        return {
          variantId: vl.variantId,
          productId: vl.productId,
          publicSku: vl.publicSku,
          internalVendorSku: vl.internalVendorSku,
          productNameBn: vl.productNameBn,
          variantTitleBn: vl.variantTitleBn,
          orderedQty: vl.quantity,
          packedQty:
            ord.status === 'packed' ||
            ord.status === 'shipped' ||
            ord.status === 'out_for_delivery' ||
            ord.status === 'delivered'
              ? vl.quantity
              : 0,
          shippedQty:
            ord.status === 'shipped' ||
            ord.status === 'out_for_delivery' ||
            ord.status === 'delivered'
              ? vl.quantity
              : 0,
          deliveredQty: ord.status === 'delivered' ? vl.quantity : 0,
          cancelledQty: ord.status === 'cancelled' ? vl.quantity : 0,
          returnedQty: ord.status === 'returned' ? vl.quantity : 0,
          damagedQty: 0,
          unitSupplierCostPoisha: vl.snapSupplierCostPoisha,
          unitSupplierProfitPoisha: vl.snapSupplierProfitPoisha,
          unitSupplierPayablePoisha: vl.snapSupplierPayablePoisha,
          unitPlatformMarginPoisha: vl.snapPlatformMarginPoisha,
          unitSalePricePoisha: vl.snapUnitSalePricePoisha,
          lineSupplierPayablePoisha: lineSupplierPayable,
          linePlatformMarginPoisha: linePlatformMargin,
          lineSaleSubtotalPoisha: lineSaleSubtotal,
        };
      }
    );

    const totalUnits = groupItems.reduce((s, i) => s + i.orderedQty, 0);
    const groupSupplierCostPoisha = groupItems.reduce(
      (s, i) => s + i.unitSupplierCostPoisha * i.orderedQty,
      0
    );
    const groupSupplierProfitPoisha = groupItems.reduce(
      (s, i) => s + i.unitSupplierProfitPoisha * i.orderedQty,
      0
    );
    const groupSupplierPayablePoisha = groupItems.reduce(
      (s, i) => s + i.lineSupplierPayablePoisha,
      0
    );
    const groupPlatformMarginPoisha = groupItems.reduce(
      (s, i) => s + i.linePlatformMarginPoisha,
      0
    );
    const groupSaleSubtotalPoisha = groupItems.reduce(
      (s, i) => s + i.lineSaleSubtotalPoisha,
      0
    );

    // Allocate platform promo discount proportionally from platform margin ONLY (never touching supplier payable!)
    let allocatedPromo = 0;
    if (remainingPromoToAllocate > 0 && totalGrossMarginAcrossOrder > 0) {
      if (idx === vendorEntries.length - 1) {
        allocatedPromo = Math.min(
          groupPlatformMarginPoisha,
          remainingPromoToAllocate
        );
      } else {
        allocatedPromo = Math.min(
          groupPlatformMarginPoisha,
          Math.round(
            (ord.discountPoisha * groupPlatformMarginPoisha) /
              totalGrossMarginAcrossOrder
          )
        );
      }
      remainingPromoToAllocate = Math.max(
        0,
        remainingPromoToAllocate - allocatedPromo
      );
    }

    groups.push({
      groupId: `vfg-${orderNo}-${vendorCode}`.toLowerCase(),
      groupCode,
      orderNo,
      vendorId,
      vendorCode,
      vendorNameBn,
      fulfillmentStatus:
        ord.status === 'delivered'
          ? 'delivered'
          : ord.status === 'shipped'
            ? 'shipped'
            : ord.status === 'packed'
              ? 'packed'
              : ord.status === 'cancelled'
                ? 'cancelled'
                : 'allocated',
      shipmentStatus:
        ord.status === 'delivered'
          ? 'delivered'
          : ord.status === 'shipped'
            ? 'handed_over_in_transit'
            : 'not_booked',
      settlementStatus:
        ord.status === 'delivered'
          ? 'escrow_locked_hold'
          : ord.status === 'confirmed' ||
              ord.status === 'packed' ||
              ord.status === 'shipped'
            ? 'escrow_pending'
            : 'unsettled',
      courierProvider: ord.courierProvider,
      consignmentId: ord.consignmentId,
      trackingCode: ord.trackingCode,
      totalUnits,
      activeUnits: ord.status === 'cancelled' ? 0 : totalUnits,
      groupSaleSubtotalPoisha,
      groupSupplierCostPoisha,
      groupSupplierProfitPoisha,
      groupSupplierPayablePoisha,
      groupPlatformMarginPoisha,
      allocatedPromoDiscountPoisha: allocatedPromo,
      netPlatformMarginPoisha: Math.max(
        0,
        groupPlatformMarginPoisha - allocatedPromo
      ),
      lines: groupItems,
      packedAt: null,
      shippedAt: null,
      deliveredAt: null,
      cancelledAt: null,
      createdAt: ord.createdAt,
      updatedAt: nowIso,
    });
  });

  p3.fulfillmentGroupsByOrder[orderNo] = groups;
  writePhase3Store(p3);
  return groups;
}

/**
 * Derives the 5 Orthogonal Order Status Dimensions from the parent order and its Vendor Fulfillment Groups.
 */
export function computeOrthogonalOrderState(
  orderNo: string
): OrthogonalOrderStateSnapshot | null {
  const erp = readErpState();
  const p3 = readPhase3Store();
  const ord = erp.orders.find((o) => o.orderNo === orderNo);
  if (!ord) return null;

  const groups =
    p3.fulfillmentGroupsByOrder[orderNo] ??
    buildAndPersistOrderFulfillmentGroups(orderNo);

  const activeGroups = groups.filter((g) => g.fulfillmentStatus !== 'cancelled');

  let fulfillmentStatus: FulfillmentDimensionStatus = 'allocated';
  let shipmentStatus: ShipmentDimensionStatus = 'not_booked';
  let settlementStatus: SettlementDimensionStatus = 'unsettled';

  if (activeGroups.length === 0 || ord.status === 'cancelled') {
    fulfillmentStatus = 'cancelled';
    shipmentStatus = 'not_booked';
    settlementStatus = 'reversed_or_clawed_back';
  } else {
    const deliveredCount = activeGroups.filter(
      (g) => g.fulfillmentStatus === 'delivered'
    ).length;
    const shippedCount = activeGroups.filter(
      (g) =>
        g.fulfillmentStatus === 'shipped' ||
        g.fulfillmentStatus === 'out_for_delivery' ||
        g.fulfillmentStatus === 'delivered'
    ).length;
    const packedCount = activeGroups.filter(
      (g) =>
        g.fulfillmentStatus === 'packed' ||
        g.fulfillmentStatus === 'shipped' ||
        g.fulfillmentStatus === 'out_for_delivery' ||
        g.fulfillmentStatus === 'delivered'
    ).length;
    const returnedCount = activeGroups.filter(
      (g) =>
        g.fulfillmentStatus === 'returned' ||
        g.fulfillmentStatus === 'partially_returned'
    ).length;

    if (returnedCount === activeGroups.length) {
      fulfillmentStatus = 'returned';
      shipmentStatus = 'returned_to_warehouse';
      settlementStatus = 'reversed_or_clawed_back';
    } else if (returnedCount > 0) {
      fulfillmentStatus = 'partially_returned';
      shipmentStatus = 'delivered';
      settlementStatus = activeGroups.some((g) => g.settlementStatus === 'escrow_locked_hold')
        ? 'escrow_locked_hold' : 'unsettled';
    } else if (deliveredCount === activeGroups.length) {
      fulfillmentStatus = 'delivered';
      shipmentStatus = 'delivered';
      settlementStatus = activeGroups.some((g) => g.settlementStatus === 'escrow_locked_hold')
        ? 'escrow_locked_hold' : 'unsettled';
    } else if (deliveredCount > 0) {
      fulfillmentStatus = 'partially_delivered';
      shipmentStatus = 'out_for_delivery';
      settlementStatus = activeGroups.some((g) => g.settlementStatus === 'escrow_locked_hold')
        ? 'escrow_locked_hold' : 'unsettled';
    } else if (shippedCount === activeGroups.length) {
      fulfillmentStatus = 'shipped';
      shipmentStatus = 'handed_over_in_transit';
      settlementStatus = 'escrow_pending';
    } else if (shippedCount > 0) {
      fulfillmentStatus = 'partially_shipped';
      shipmentStatus = 'handed_over_in_transit';
      settlementStatus = 'escrow_pending';
    } else if (packedCount === activeGroups.length) {
      fulfillmentStatus = 'packed';
      shipmentStatus = ord.trackingCode ? 'booked_manifested' : 'not_booked';
      settlementStatus = 'escrow_pending';
    } else if (packedCount > 0) {
      fulfillmentStatus = 'partially_packed';
      shipmentStatus = 'not_booked';
      settlementStatus = 'escrow_pending';
    } else {
      fulfillmentStatus = 'allocated';
      shipmentStatus = 'not_booked';
      settlementStatus =
        ord.status === 'confirmed' ? 'escrow_pending' : 'unsettled';
    }
  }

  const snapshot: OrthogonalOrderStateSnapshot = {
    orderNo: ord.orderNo,
    orderStatus: ord.status,
    paymentStatus: ord.paymentStatus,
    fulfillmentStatus,
    shipmentStatus,
    settlementStatus,
    updatedAt: new Date().toISOString(),
  };

  p3.orthogonalOrderStates[orderNo] = snapshot;
  writePhase3Store(p3);
  return snapshot;
}

/**
 * Executes Partial Packing, Partial Shipment, Partial Delivery, or Partial Cancellation
 * on a specific Vendor Fulfillment Group (VFG) within a Multi-Vendor Customer Order.
 */
export function executeVendorFulfillmentGroupAction(
  ctx: ActorSecurityContext,
  input: {
    orderNo: string;
    groupCode: string;
    action: 'pack_group' | 'ship_group' | 'deliver_group' | 'cancel_group';
    courierProvider?: CourierProvider;
    consignmentId?: string;
    trackingCode?: string;
    reasonBn?: string;
  }
): {
  success: boolean;
  errorBn?: string;
  updatedGroup?: VendorFulfillmentGroupDetailRecord;
  orthogonalState?: OrthogonalOrderStateSnapshot;
} {
  if (
    ctx.roleSlug !== 'super_admin' &&
    ctx.roleSlug !== 'packaging_manager' &&
    ctx.roleSlug !== 'marketing_manager' &&
    ctx.roleSlug !== 'vendor'
  ) {
    return {
      success: false,
      errorBn: 'এই ফুলফিলমেন্ট গ্রুপ অ্যাকশনটির অনুমতি আপনার নেই।',
    };
  }

  const erp = readErpState();
  const p3 = readPhase3Store();
  const p4b = readPhase4BStore();

  const ord = erp.orders.find((o) => o.orderNo === input.orderNo);
  if (!ord) {
    return { success: false, errorBn: 'অর্ডারটি খুঁজে পাওয়া যায়নি।' };
  }

  const groups =
    p3.fulfillmentGroupsByOrder[input.orderNo] ??
    buildAndPersistOrderFulfillmentGroups(input.orderNo);

  const group = groups.find((g) => g.groupCode === input.groupCode);
  if (!group) {
    return {
      success: false,
      errorBn: `ভেন্ডর ফুলফিলমেন্ট গ্রুপ (${input.groupCode}) খুঁজে পাওয়া যায়নি।`,
    };
  }

  // Vendor tenant isolation check
  if (ctx.roleSlug === 'vendor' && ctx.vendorId !== group.vendorId) {
    return {
      success: false,
      errorBn: 'NOT_FOUND: অন্য ভেন্ডরের ফুলফিলমেন্ট গ্রুপে অ্যাক্সেস নিষিদ্ধ।',
    };
  }

  const nowIso = new Date().toISOString();

  if (input.action === 'pack_group') {
    if (group.fulfillmentStatus !== 'allocated') {
      return {
        success: false,
        errorBn: `গ্রুপটি বর্তমানে '${group.fulfillmentStatus}' অবস্থায় আছে; শুধুমাত্র 'allocated' গ্রুপ প্যাক করা যাবে।`,
      };
    }
    group.fulfillmentStatus = 'packed';
    group.packedAt = nowIso;
    group.updatedAt = nowIso;
    for (const line of group.lines) {
      line.packedQty = line.orderedQty - line.cancelledQty;
    }
  } else if (input.action === 'ship_group') {
    if (
      group.fulfillmentStatus !== 'packed' &&
      group.fulfillmentStatus !== 'allocated'
    ) {
      return {
        success: false,
        errorBn: `গ্রুপটি শিপিংয়ের জন্য প্রস্তুত নয় (বর্তমান স্ট্যাটাস: ${group.fulfillmentStatus})।`,
      };
    }
    const tracking = input.trackingCode?.trim() || group.trackingCode;
    const consignment = input.consignmentId?.trim() || group.consignmentId;
    if (!tracking && !consignment) {
      return {
        success: false,
        errorBn:
          'শিপমেন্ট কনফার্ম করার জন্য কুরিয়ার ট্র্যাকিং কোড বা কনসাইনমেন্ট আইডি আবশ্যক।',
      };
    }

    group.courierProvider = input.courierProvider ?? group.courierProvider;
    group.trackingCode = tracking ?? null;
    group.consignmentId = consignment ?? null;
    group.fulfillmentStatus = 'shipped';
    group.shipmentStatus = 'handed_over_in_transit';
    group.settlementStatus = 'escrow_pending';
    group.shippedAt = nowIso;
    group.updatedAt = nowIso;

    // Move stock from reserved -> inTransit for this group's lines
    for (const line of group.lines) {
      const shipUnits = line.orderedQty - line.cancelledQty;
      line.packedQty = shipUnits;
      line.shippedQty = shipUnits;
      for (const prod of erp.products) {
        const vr = prod.variants.find((v) => v.variantId === line.variantId);
        if (vr) {
          vr.stockReserved = Math.max(0, vr.stockReserved - shipUnits);
          vr.stockOnHand = Math.max(0, vr.stockOnHand - shipUnits);
          vr.stockInTransit += shipUnits;
          vr.stockAvailable = Math.max(0, vr.stockOnHand - vr.stockReserved);
          break;
        }
      }
    }
  } else if (input.action === 'deliver_group') {
    if (
      group.fulfillmentStatus !== 'shipped' &&
      group.fulfillmentStatus !== 'out_for_delivery'
    ) {
      return {
        success: false,
        errorBn:
          'শুধুমাত্র শিপড (shipped) বা আউট-ফর-ডেলিভারি গ্রুপ ডেলিভারড হিসেবে মার্ক করা যাবে।',
      };
    }
    group.fulfillmentStatus = 'delivered';
    group.shipmentStatus = 'delivered';
    group.settlementStatus = 'escrow_locked_hold';
    group.deliveredAt = nowIso;
    group.updatedAt = nowIso;

    for (const line of group.lines) {
      const delivUnits = line.shippedQty;
      line.deliveredQty = delivUnits;
      for (const prod of erp.products) {
        const vr = prod.variants.find((v) => v.variantId === line.variantId);
        if (vr) {
          vr.stockInTransit = Math.max(0, vr.stockInTransit - delivUnits);
          break;
        }
      }
    }

    // Credit ONLY this vendor's Locked Escrow bucket with hold-days maturity
    const vendorProfile = p4b.vendors.find((v) => v.vendorId === group.vendorId);
    const holdDays =
      vendorProfile?.escrowHoldDaysOverride ??
      erp.siteSettings.globalEscrowHoldDays ??
      7;
    const maturesAt = calculateMaturityTimestamp(nowIso, holdDays);

    p4b.vendorLedger.unshift({
      id: `vled-vfg-${group.groupCode}-${Date.now()}`,
      vendorId: group.vendorId,
      vendorCode: group.vendorCode,
      orderNo: ord.orderNo,
      orderItemId: group.groupCode,
      entryType: 'EARNING_LOCKED',
      escrowBucket: 'locked',
      amountPoisha: group.groupSupplierPayablePoisha,
      deliveredAt: nowIso,
      maturesAt,
      descriptionBn: `ভেন্ডর ফুলফিলমেন্ট গ্রুপ (${group.groupCode}) ডেলিভারি সম্পন্ন — ${holdDays} দিনের হোল্ড পিরিয়ডে লকড এসক্রো।`,
      recordedByUsername: ctx.username,
      createdAt: nowIso,
    });
  } else if (input.action === 'cancel_group') {
    if (
      group.fulfillmentStatus === 'shipped' ||
      group.fulfillmentStatus === 'out_for_delivery' ||
      group.fulfillmentStatus === 'delivered'
    ) {
      return {
        success: false,
        errorBn:
          'কুরিয়ারে শিপমেন্ট হ্যান্ডওভার হওয়ার পর গ্রুপ সরাসরি ক্যান্সেল করা যাবে না; রিটার্ন ওয়ার্কফ্লো ব্যবহার করুন।',
      };
    }
    if (group.fulfillmentStatus === 'cancelled') {
      return {
        success: false,
        errorBn: 'এই ফুলফিলমেন্ট গ্রুপটি ইতোমধ্যে ক্যান্সেল করা হয়েছে।',
      };
    }

    // Release ONLY this vendor group's reserved stock
    for (const line of group.lines) {
      const releaseUnits = line.orderedQty - line.cancelledQty;
      line.cancelledQty = line.orderedQty;
      line.packedQty = 0;

      for (const prod of erp.products) {
        const vr = prod.variants.find((v) => v.variantId === line.variantId);
        if (vr) {
          vr.stockReserved = Math.max(0, vr.stockReserved - releaseUnits);
          vr.stockAvailable = Math.max(0, vr.stockOnHand - vr.stockReserved);
          break;
        }
      }
    }

    group.fulfillmentStatus = 'cancelled';
    group.settlementStatus = 'reversed_or_clawed_back';
    group.activeUnits = 0;
    group.cancelledAt = nowIso;
    group.updatedAt = nowIso;

    // Recalculate parent order totals from remaining active groups
    const activeGroupsAfter = groups.filter(
      (g) => g.fulfillmentStatus !== 'cancelled'
    );
    if (activeGroupsAfter.length === 0) {
      ord.status = 'cancelled';
      ord.subtotalPoisha = 0;
      ord.discountPoisha = 0;
      ord.deliveryChargePoisha = 0;
      ord.totalPayablePoisha = 0;
      ord.codCollectablePoisha = 0;
      ord.snapTotalSupplierPayablePoisha = 0;
      ord.nextBestAction = 'COMPLETED';
    } else {
      ord.subtotalPoisha = activeGroupsAfter.reduce(
        (s, g) => s + g.groupSaleSubtotalPoisha,
        0
      );
      ord.discountPoisha = activeGroupsAfter.reduce(
        (s, g) => s + g.allocatedPromoDiscountPoisha,
        0
      );
      ord.snapTotalSupplierPayablePoisha = activeGroupsAfter.reduce(
        (s, g) => s + g.groupSupplierPayablePoisha,
        0
      );
      ord.totalPayablePoisha = Math.max(
        0,
        ord.subtotalPoisha - ord.discountPoisha + ord.deliveryChargePoisha
      );
      ord.codCollectablePoisha = Math.max(
        0,
        ord.totalPayablePoisha - ord.advancePaidPoisha
      );
    }
  }

  // Update parent order status based on active vendor fulfillment groups
  const activeGroups = groups.filter((g) => g.fulfillmentStatus !== 'cancelled');
  if (activeGroups.length > 0) {
    if (activeGroups.every((g) => g.fulfillmentStatus === 'delivered')) {
      ord.status = 'delivered';
      ord.nextBestAction = 'AWAITING_COD_REMITTANCE';
    } else if (
      activeGroups.some((g) => g.fulfillmentStatus === 'delivered') ||
      activeGroups.some((g) => g.fulfillmentStatus === 'out_for_delivery')
    ) {
      ord.status = 'out_for_delivery';
    } else if (activeGroups.every((g) => g.fulfillmentStatus === 'shipped')) {
      ord.status = 'shipped';
    } else if (activeGroups.every((g) => g.fulfillmentStatus === 'packed')) {
      ord.status = 'packed';
    }
  }

  p3.fulfillmentGroupsByOrder[input.orderNo] = groups;
  writeErpState(erp);
  writePhase4BStore(p4b);
  writePhase3Store(p3);

  const orthogonalState =
    computeOrthogonalOrderState(input.orderNo) ?? undefined;

  return {
    success: true,
    updatedGroup: group,
    orthogonalState,
  };
}

// ============================================================================
// 4. SECTION 6.3: STRICT ORDER STATE MACHINE
// ============================================================================

export interface OrderStateMachineRule {
  fromStates: OrderStatus[];
  toState: OrderStatus;
  allowedRoles: Array<SystemRoleSlug | 'customer' | 'webhook_service'>;
  requiresCourierTracking?: boolean;
  descriptionBn: string;
}

export const ORDER_STATE_MACHINE_RULES: OrderStateMachineRule[] = [
  {
    fromStates: ['pending_confirmation'],
    toState: 'confirmed',
    allowedRoles: ['super_admin', 'marketing_manager'],
    descriptionBn: 'কাস্টমার কল ভেরিফিকেশনের মাধ্যমে অর্ডার কনফার্মেশন',
  },
  {
    fromStates: ['confirmed'],
    toState: 'packed',
    allowedRoles: ['super_admin', 'packaging_manager'],
    descriptionBn: 'কিউসি চেক ও প্যাকিং সম্পন্ন',
  },
  {
    fromStates: ['packed'],
    toState: 'shipped',
    allowedRoles: ['super_admin', 'packaging_manager', 'webhook_service'],
    requiresCourierTracking: true,
    descriptionBn: 'কুরিয়ারে হ্যান্ডওভার ও শিপমেন্ট ডিসপ্যাচ',
  },
  {
    fromStates: ['shipped'],
    toState: 'out_for_delivery',
    allowedRoles: ['super_admin', 'packaging_manager', 'webhook_service'],
    descriptionBn: 'ডেলিভারি রাইডার কাস্টমারের পথে (Out for Delivery)',
  },
  {
    fromStates: ['shipped', 'out_for_delivery'],
    toState: 'delivered',
    allowedRoles: ['super_admin', 'packaging_manager', 'webhook_service'],
    descriptionBn: 'কাস্টমারের কাছে সফল ডেলিভারি ও ভেন্ডর লকড এসক্রো পোস্টিং',
  },
  {
    fromStates: ['shipped', 'out_for_delivery', 'delivered'],
    toState: 'return_initiated',
    allowedRoles: [
      'super_admin',
      'marketing_manager',
      'packaging_manager',
      'customer',
      'webhook_service',
    ],
    descriptionBn: 'রিটার্ন রিকোয়েস্ট বা কুরিয়ার রিটার্ন ইন-ট্রানজিট শুরু',
  },
  {
    fromStates: ['return_initiated', 'delivered'],
    toState: 'returned',
    allowedRoles: ['super_admin', 'packaging_manager'],
    descriptionBn: 'ওয়্যারহাউসে রিটার্ন রিসিভ ও ৪-মুখী ফল্ট রেজোলিউশন সম্পন্ন',
  },
  {
    fromStates: ['pending_confirmation', 'confirmed', 'packed'],
    toState: 'cancelled',
    allowedRoles: [
      'super_admin',
      'marketing_manager',
      'packaging_manager',
      'customer',
    ],
    descriptionBn: 'শিপমেন্টের পূর্বে অর্ডার বাতিল ও রিজার্ভড স্টক রিলিজ',
  },
];

/**
 * Executes a validated, idempotent Order State Machine transition with role checks,
 * precondition checks, stock/escrow side effects, and immutable transition audit logging.
 */
export function executeOrderStateTransition(params: {
  orderNo: string;
  toState: OrderStatus;
  actorUsername: string;
  actorRole: SystemRoleSlug | 'customer' | 'webhook_service';
  idempotencyKey: string;
  reasonBn: string;
  courierProvider?: CourierProvider;
  consignmentId?: string;
  trackingCode?: string;
}): {
  success: boolean;
  idempotentReplay?: boolean;
  errorCode?:
    | 'ORDER_NOT_FOUND'
    | 'INVALID_STATE_TRANSITION'
    | 'UNAUTHORIZED_ROLE_FOR_TRANSITION'
    | 'PRECONDITION_FAILED_MANDATORY_ADVANCE'
    | 'PRECONDITION_FAILED_MISSING_TRACKING';
  errorBn?: string;
  transitionRecord?: OrderStateTransitionAuditRecord;
} {
  const erp = readErpState();
  const p3 = readPhase3Store();

  // 1. Idempotency check
  const existingTransition = p3.transitionHistory.find(
    (t) => t.idempotencyKey === params.idempotencyKey
  );
  if (existingTransition) {
    return {
      success: true,
      idempotentReplay: true,
      transitionRecord: existingTransition,
    };
  }

  const ord = erp.orders.find((o) => o.orderNo === params.orderNo);
  if (!ord) {
    return {
      success: false,
      errorCode: 'ORDER_NOT_FOUND',
      errorBn: 'অর্ডারটি খুঁজে পাওয়া যায়নি।',
    };
  }

  const fromState = ord.status;

  // Idempotent no-op if already in target state
  if (fromState === params.toState) {
    const ortho = computeOrthogonalOrderState(ord.orderNo)!;
    const noOpRecord: OrderStateTransitionAuditRecord = {
      transitionId: `tr-${Date.now()}`,
      idempotencyKey: params.idempotencyKey,
      orderNo: ord.orderNo,
      fromOrderStatus: fromState,
      toOrderStatus: params.toState,
      actorUsername: params.actorUsername,
      actorRole: params.actorRole,
      reasonBn: params.reasonBn,
      sideEffectsApplied: ['IDEMPOTENT_ALREADY_IN_TARGET_STATE'],
      orthogonalStateAfter: ortho,
      createdAt: new Date().toISOString(),
    };
    p3.transitionHistory.unshift(noOpRecord);
    writePhase3Store(p3);
    return {
      success: true,
      idempotentReplay: true,
      transitionRecord: noOpRecord,
    };
  }

  // 2. Find matching state machine rule
  const rule = ORDER_STATE_MACHINE_RULES.find(
    (r) => r.toState === params.toState && r.fromStates.includes(fromState)
  );
  if (!rule) {
    return {
      success: false,
      errorCode: 'INVALID_STATE_TRANSITION',
      errorBn: `অবৈধ অর্ডার স্ট্যাটাস ট্রানজিশন: '${fromState}' থেকে সরাসরি '${params.toState}'-এ যাওয়া অনুমোদিত নয়।`,
    };
  }

  // 3. Role authorization check (Customers can only cancel before 'packed')
  if (
    !rule.allowedRoles.includes(params.actorRole) ||
    (params.actorRole === 'customer' &&
      params.toState === 'cancelled' &&
      fromState === 'packed')
  ) {
    return {
      success: false,
      errorCode: 'UNAUTHORIZED_ROLE_FOR_TRANSITION',
      errorBn: `'${params.actorRole}' রোলের জন্য '${fromState}' -> '${params.toState}' ট্রানজিশন অনুমোদিত নয়।`,
    };
  }

  // 4. Preconditions check
  if (
    params.toState === 'packed' &&
    ord.isAdvanceMandatory &&
    ord.paymentStatus === 'unpaid'
  ) {
    return {
      success: false,
      errorCode: 'PRECONDITION_FAILED_MANDATORY_ADVANCE',
      errorBn:
        'হাই-রিস্ক অর্ডারে ডেলিভারি চার্জ অগ্রিম ভেরিফাই না হওয়া পর্যন্ত প্যাকিং (packed) করা যাবে না।',
    };
  }

  const effectiveTracking =
    params.trackingCode?.trim() ||
    ord.trackingCode ||
    params.consignmentId?.trim() ||
    ord.consignmentId;
  if (rule.requiresCourierTracking && !effectiveTracking) {
    return {
      success: false,
      errorCode: 'PRECONDITION_FAILED_MISSING_TRACKING',
      errorBn:
        'অর্ডার শিপড (shipped) মার্ক করার পূর্বে কুরিয়ার ট্র্যাকিং কোড বা কনসাইনমেন্ট আইডি আবশ্যক।',
    };
  }

  // 5. Apply Side Effects
  const sideEffects: string[] = [];
  const nowIso = new Date().toISOString();

  if (params.courierProvider) ord.courierProvider = params.courierProvider;
  if (params.consignmentId) ord.consignmentId = params.consignmentId.trim();
  if (params.trackingCode) ord.trackingCode = params.trackingCode.trim();

  const orderLines = erp.orderLines.filter((l) => l.orderId === ord.id);

  if (params.toState === 'shipped') {
    for (const line of orderLines) {
      for (const prod of erp.products) {
        const vr = prod.variants.find((v) => v.variantId === line.variantId);
        if (vr) {
          const deduct = Math.min(vr.stockReserved, line.quantity);
          vr.stockReserved = Math.max(0, vr.stockReserved - deduct);
          vr.stockOnHand = Math.max(0, vr.stockOnHand - line.quantity);
          vr.stockInTransit += line.quantity;
          vr.stockAvailable = Math.max(0, vr.stockOnHand - vr.stockReserved);
          break;
        }
      }
    }
    sideEffects.push('STOCK_MOVED_RESERVED_TO_IN_TRANSIT');
  } else if (params.toState === 'delivered') {
    for (const line of orderLines) {
      for (const prod of erp.products) {
        const vr = prod.variants.find((v) => v.variantId === line.variantId);
        if (vr) {
          vr.stockInTransit = Math.max(0, vr.stockInTransit - line.quantity);
          break;
        }
      }
    }
    sideEffects.push('STOCK_IN_TRANSIT_CLEARED_ON_DELIVERY');
  } else if (params.toState === 'cancelled') {
    for (const line of orderLines) {
      for (const prod of erp.products) {
        const vr = prod.variants.find((v) => v.variantId === line.variantId);
        if (vr) {
          vr.stockReserved = Math.max(0, vr.stockReserved - line.quantity);
          vr.stockAvailable = Math.max(0, vr.stockOnHand - vr.stockReserved);
          break;
        }
      }
    }
    sideEffects.push('RESERVED_STOCK_RELEASED_TO_AVAILABLE');
  }

  ord.status = params.toState;
  writeErpState(erp);

  // Sync fulfillment groups if present
  const groups = p3.fulfillmentGroupsByOrder[ord.orderNo];
  if (groups) {
    for (const g of groups) {
      if (g.fulfillmentStatus === 'cancelled') continue;
      if (params.toState === 'packed') g.fulfillmentStatus = 'packed';
      if (params.toState === 'shipped') {
        g.fulfillmentStatus = 'shipped';
        g.shipmentStatus = 'handed_over_in_transit';
      }
      if (params.toState === 'out_for_delivery') {
        g.fulfillmentStatus = 'out_for_delivery';
        g.shipmentStatus = 'out_for_delivery';
      }
      if (params.toState === 'delivered') {
        g.fulfillmentStatus = 'delivered';
        g.shipmentStatus = 'delivered';
        // Delivery status alone does not prove a vendor settlement or remittance.
      }
      if (params.toState === 'cancelled') {
        g.fulfillmentStatus = 'cancelled';
        g.settlementStatus = 'reversed_or_clawed_back';
      }
    }
    writePhase3Store(p3);
  }

  const orthoAfter = computeOrthogonalOrderState(ord.orderNo)!;
  const latestP3 = readPhase3Store();
  const transitionRecord: OrderStateTransitionAuditRecord = {
    transitionId: `tr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    idempotencyKey: params.idempotencyKey,
    orderNo: ord.orderNo,
    fromOrderStatus: fromState,
    toOrderStatus: params.toState,
    actorUsername: params.actorUsername,
    actorRole: params.actorRole,
    reasonBn: params.reasonBn.trim(),
    sideEffectsApplied: sideEffects,
    orthogonalStateAfter: orthoAfter,
    createdAt: nowIso,
  };

  latestP3.transitionHistory.unshift(transitionRecord);
  writePhase3Store(latestP3);

  return {
    success: true,
    idempotentReplay: false,
    transitionRecord,
  };
}

// ============================================================================
// 5. SECTION 6.4: CANCELLATION POLICY, RETURN ELIGIBILITY, QC INSPECTION & REVERSAL
// ============================================================================

/**
 * Evaluates and executes Order Cancellation with policy check, stock release,
 * and automatic CustomerRefundExecutionRecord creation if advance payment was verified.
 */
export function evaluateAndExecuteOrderCancellation(params: {
  orderNo: string;
  actorUsername: string;
  actorRole: SystemRoleSlug | 'customer';
  reasonBn: string;
  idempotencyKey: string;
}): {
  success: boolean;
  errorBn?: string;
  stockReleasedUnits?: number;
  refundCreated?: CustomerRefundExecutionRecord | null;
} {
  const erp = readErpState();
  const ord = erp.orders.find((o) => o.orderNo === params.orderNo);
  if (!ord) {
    return { success: false, errorBn: 'অর্ডারটি খুঁজে পাওয়া যায়নি।' };
  }

  if (
    ord.status === 'shipped' ||
    ord.status === 'out_for_delivery' ||
    ord.status === 'delivered'
  ) {
    return {
      success: false,
      errorBn:
        'CANCELLATION_BLOCKED_AFTER_DISPATCH: পণ্য কুরিয়ারে হ্যান্ডওভার হওয়ার পর সরাসরি ক্যান্সেল করা সম্ভব নয়। ডেলিভারির পর রিটার্ন ওয়ার্কফ্লো ব্যবহার করুন।',
    };
  }

  const lines = erp.orderLines.filter((l) => l.orderId === ord.id);
  const totalUnits = lines.reduce((s, l) => s + l.quantity, 0);

  const trRes = executeOrderStateTransition({
    orderNo: params.orderNo,
    toState: 'cancelled',
    actorUsername: params.actorUsername,
    actorRole: params.actorRole,
    idempotencyKey: params.idempotencyKey,
    reasonBn: params.reasonBn,
  });

  if (!trRes.success) {
    return {
      success: false,
      errorBn: trRes.errorBn,
    };
  }

  let refundCreated: CustomerRefundExecutionRecord | null = null;
  if (ord.advancePaidPoisha > 0) {
    const p7 = readPhase7Store();
    p7.customerRefunds = p7.customerRefunds ?? [];
    refundCreated = {
      refundId: `ref-cancel-${ord.orderNo}`,
      refundCode: `RFD-${Date.now().toString().slice(-6)}`,
      orderNo: ord.orderNo,
      customerName: ord.customerName,
      customerPhone: ord.customerPhone,
      refundChannel: 'bkash_manual',
      refundAmountPoisha: ord.advancePaidPoisha,
      vendorClawbackPoisha: 0,
      platformSubsidyPoisha: ord.advancePaidPoisha,
      refundTrxId: null,
      reasonBn: `অর্ডার ক্যান্সেলেশন রিফান্ড (${ord.orderNo}): ${params.reasonBn}`,
      status: 'pending_approval',
      requestedByUsername: params.actorUsername,
      approvedByUsername: null,
      createdAt: new Date().toISOString(),
      resolvedAt: null,
    };
    p7.customerRefunds.unshift(refundCreated);
    writePhase7Store(p7);
  }

  return {
    success: true,
    stockReleasedUnits: totalUnits,
    refundCreated,
  };
}

/**
 * Processes a Return Request with 7-Day Eligibility Check, Warehouse QC Inspection
 * (RESTOCK_INTACT / QUARANTINE_DAMAGED / REJECT_CLAIM), 4-Way Fault Vendor Liability Adjustment,
 * Courier Claim creation, and Customer Payment Reversal.
 */
export function inspectAndResolveOrderReturn(
  ctx: ActorSecurityContext,
  input: {
    orderNo: string;
    variantId: string;
    returnQty: number;
    faultType: ReturnFaultType;
    inspectionDecision: ReturnInspectionDecision;
    deliveredAtIso: string;
    inspectedAtIso?: string;
    wasInHoldPeriod: boolean;
    wasAlreadyPaidOut: boolean;
    returnShippingCostPoisha?: Poisha;
    adminLateReturnOverrideReasonBn?: string;
    inspectionNoteBn: string;
  }
): {
  success: boolean;
  errorBn?: string;
  inspectionRecord?: Phase3ReturnInspectionRecord;
} {
  if (
    ctx.roleSlug !== 'super_admin' &&
    ctx.roleSlug !== 'packaging_manager'
  ) {
    return {
      success: false,
      errorBn:
        'শুধুমাত্র সুপার অ্যাডমিন বা প্যাকেজিং ম্যানেজার রিটার্ন কিউসি ইন্সপেকশন ও রেজোলিউশন সম্পন্ন করতে পারবেন।',
    };
  }

  const erp = readErpState();
  const p3 = readPhase3Store();
  const p4b = readPhase4BStore();
  const p7 = readPhase7Store();

  const ord = erp.orders.find((o) => o.orderNo === input.orderNo);
  if (!ord) {
    return { success: false, errorBn: 'অর্ডারটি খুঁজে পাওয়া যায়নি।' };
  }

  if (
    ord.status !== 'delivered' &&
    ord.status !== 'return_initiated' &&
    ord.status !== 'out_for_delivery'
  ) {
    return {
      success: false,
      errorBn: `RETURN_INELIGIBLE_STATUS: শুধুমাত্র ডেলিভারড বা রিটার্ন-ইনিশিয়েটেড অর্ডারে রিটার্ন ইন্সপেকশন করা যাবে (বর্তমান স্ট্যাটাস: ${ord.status})।`,
    };
  }

  // 7-Day Return Window Eligibility Check
  const deliveredMs = Date.parse(input.deliveredAtIso);
  const inspectedMs = input.inspectedAtIso
    ? Date.parse(input.inspectedAtIso)
    : Date.now();
  const daysSinceDelivery = (inspectedMs - deliveredMs) / (1000 * 60 * 60 * 24);
  if (
    daysSinceDelivery > 7 &&
    (!input.adminLateReturnOverrideReasonBn ||
      input.adminLateReturnOverrideReasonBn.trim().length < 5)
  ) {
    return {
      success: false,
      errorBn:
        'RETURN_WINDOW_EXPIRED: ডেলিভারির ৭ দিন পর রিটার্ন গ্রহণ করতে হলে অ্যাডমিনের স্পষ্ট ওভাররাইড কারণ আবশ্যক।',
    };
  }

  const orderLine = erp.orderLines.find(
    (l) => l.orderId === ord.id && l.variantId === input.variantId
  );
  if (!orderLine) {
    return {
      success: false,
      errorBn: 'অর্ডারে উক্ত প্রোডাক্ট ভ্যারিয়েন্টটি পাওয়া যায়নি।',
    };
  }

  const priorReturnedForVariant = p3.returnInspections
    .filter(
      (r) =>
        r.orderNo === input.orderNo &&
        r.variantId === input.variantId &&
        r.inspectedDecision !== 'REJECT_CLAIM'
    )
    .reduce((s, r) => s + r.requestedQty, 0);

  if (
    !Number.isInteger(input.returnQty) ||
    input.returnQty <= 0 ||
    input.returnQty > orderLine.quantity - priorReturnedForVariant
  ) {
    return {
      success: false,
      errorBn: `অবৈধ রিটার্ন সংখ্যা (${input.returnQty})। অর্ডারকৃত অবশিষ্ট সংখ্যা: ${orderLine.quantity - priorReturnedForVariant} টি।`,
    };
  }

  const nowIso = input.inspectedAtIso ?? new Date().toISOString();
  const returnCaseCode = `RET-${ord.orderNo.slice(-4)}-${Date.now().toString().slice(-4)}`;

  // If claim is rejected at QC inspection, zero stock/financial mutation occurs
  if (input.inspectionDecision === 'REJECT_CLAIM') {
    const rejectedRecord: Phase3ReturnInspectionRecord = {
      inspectionId: `insp-${Date.now()}`,
      returnCaseCode,
      orderNo: ord.orderNo,
      groupCode: null,
      variantId: input.variantId,
      publicSku: orderLine.publicSku,
      vendorId: orderLine.vendorId,
      requestedQty: input.returnQty,
      inspectedDecision: 'REJECT_CLAIM',
      faultType: input.faultType,
      restockedQty: 0,
      damagedQuarantinedQty: 0,
      rejectedQty: input.returnQty,
      vendorDebitPoisha: 0,
      platformLossPoisha: 0,
      courierClaimPoisha: 0,
      customerRefundPoisha: 0,
      inspectorUsername: ctx.username,
      inspectionNoteBn: input.inspectionNoteBn.trim(),
      createdAt: nowIso,
    };
    p3.returnInspections.unshift(rejectedRecord);
    writePhase3Store(p3);
    return {
      success: true,
      inspectionRecord: rejectedRecord,
    };
  }

  // Evaluate 4-Way Return & Damage Financial Resolution
  const lineSupplierPayablePoisha =
    orderLine.snapSupplierPayablePoisha * input.returnQty;
  const lineSaleTotalPoisha =
    orderLine.snapUnitSalePricePoisha * input.returnQty;
  const returnShippingPoisha = input.returnShippingCostPoisha ?? 7000;

  const fourWay = evaluateFourWayReturn({
    faultType: input.faultType,
    quantity: input.returnQty,
    unitSupplierPayablePoisha: orderLine.snapSupplierPayablePoisha,
    unitSalePricePoisha: orderLine.snapUnitSalePricePoisha,
    unrecoveredCourierChargePoisha: returnShippingPoisha,
    wasInHoldPeriod: input.wasInHoldPeriod,
    wasAlreadyPaidOut: input.wasAlreadyPaidOut,
  });

  // Update Variant Stock Buckets & Stock Movement Ledger according to QC Decision
  let restockedQty = 0;
  let damagedQuarantinedQty = 0;

  for (const prod of erp.products) {
    const vr = prod.variants.find((v) => v.variantId === input.variantId);
    if (vr) {
      prod.totalReturnedCount += input.returnQty;
      if (input.inspectionDecision === 'RESTOCK_INTACT') {
        restockedQty = input.returnQty;
        vr.stockOnHand += restockedQty;
        vr.stockAvailable = Math.max(0, vr.stockOnHand - vr.stockReserved);

        p3.stockMovements.unshift({
          movementId: `mov-ret-${Date.now()}`,
          variantId: vr.variantId,
          publicSku: vr.publicSku,
          productId: prod.productId,
          vendorId: prod.vendorId,
          warehouseCode: 'WH-DAC-CENTRAL',
          binLocationCode: 'BIN-RETURN-RESTOCK',
          eventType: 'RETURN_RESTOCKED',
          onHandDelta: restockedQty,
          reservedDelta: 0,
          inTransitDelta: 0,
          damagedDelta: 0,
          balanceOnHandAfter: vr.stockOnHand,
          balanceReservedAfter: vr.stockReserved,
          balanceInTransitAfter: vr.stockInTransit,
          balanceDamagedAfter: vr.stockDamaged,
          balanceAvailableAfter: vr.stockAvailable,
          referenceOrderNo: ord.orderNo,
          referenceLotOrReturnCode: returnCaseCode,
          reasonBn: `রিটার্ন কিউসি পাস — পুনরায় বিক্রয়যোগ্য স্টকে যুক্ত (${returnCaseCode})`,
          actorUsername: ctx.username,
          createdAt: nowIso,
        });
      } else {
        damagedQuarantinedQty = input.returnQty;
        vr.stockDamaged += damagedQuarantinedQty;

        p3.stockMovements.unshift({
          movementId: `mov-retdmg-${Date.now()}`,
          variantId: vr.variantId,
          publicSku: vr.publicSku,
          productId: prod.productId,
          vendorId: prod.vendorId,
          warehouseCode: 'WH-DAC-CENTRAL',
          binLocationCode: 'BIN-DAMAGE-QUARANTINE',
          eventType: 'DAMAGE_WRITE_OFF',
          onHandDelta: 0,
          reservedDelta: 0,
          inTransitDelta: 0,
          damagedDelta: damagedQuarantinedQty,
          balanceOnHandAfter: vr.stockOnHand,
          balanceReservedAfter: vr.stockReserved,
          balanceInTransitAfter: vr.stockInTransit,
          balanceDamagedAfter: vr.stockDamaged,
          balanceAvailableAfter: vr.stockAvailable,
          referenceOrderNo: ord.orderNo,
          referenceLotOrReturnCode: returnCaseCode,
          reasonBn: `রিটার্ন ড্যামেজড কোয়ারেন্টাইন (${input.faultType}) — বিক্রয়যোগ্য স্টকে যুক্ত হয়নি (${returnCaseCode})`,
          actorUsername: ctx.username,
          createdAt: nowIso,
        });
      }
      break;
    }
  }

  // Post Offsetting Immutable Vendor Ledger Entry if applicable
  if (fourWay.ledgerEntryToInsert) {
    const vendorProfile = p4b.vendors.find(
      (v) => v.vendorId === orderLine.vendorId
    );
    p4b.vendorLedger.unshift({
      id: `vled-ret-${returnCaseCode}`,
      vendorId: orderLine.vendorId,
      vendorCode: vendorProfile?.vendorCode ?? 'VND-001',
      orderNo: ord.orderNo,
      orderItemId: orderLine.variantId,
      entryType: fourWay.ledgerEntryToInsert.entryType,
      escrowBucket: fourWay.ledgerEntryToInsert.escrowBucket,
      amountPoisha: fourWay.ledgerEntryToInsert.amountPoisha,
      deliveredAt: input.deliveredAtIso,
      maturesAt: null,
      descriptionBn: `রিটার্ন ও ৪-মুখী ফল্ট রেজোলিউশন (${input.faultType}): ${input.inspectionNoteBn.trim()}`,
      recordedByUsername: ctx.username,
      createdAt: nowIso,
    });
  }

  // Open Courier Claim if COURIER_NEGLIGENCE
  if (fourWay.shouldCreateCourierClaim) {
    p4b.courierClaims.unshift({
      claimId: `clm-${returnCaseCode}`,
      orderNo: ord.orderNo,
      consignmentId: ord.consignmentId ?? ord.trackingCode ?? ord.orderNo,
      courierProvider: ord.courierProvider,
      claimAmountPoisha: fourWay.courierClaimPoisha,
      reasonBn: `কুরিয়ার অবহেলাজনিত ক্ষতি (${returnCaseCode}): ${input.inspectionNoteBn.trim()}`,
      proofUrl: `/evidence/${returnCaseCode}.jpg`,
      status: 'open',
      createdAt: nowIso,
    });
  }

  // Proportional Customer Payment Reversal if customer paid in advance
  let customerRefundPoisha = 0;
  if (ord.advancePaidPoisha > 0) {
    customerRefundPoisha = Math.min(ord.advancePaidPoisha, lineSaleTotalPoisha);
    p7.customerRefunds = p7.customerRefunds ?? [];
    p7.customerRefunds.unshift({
      refundId: `ref-${returnCaseCode}`,
      refundCode: `RFD-${returnCaseCode}`,
      orderNo: ord.orderNo,
      customerName: ord.customerName,
      customerPhone: ord.customerPhone,
      refundChannel: 'bkash_manual',
      refundAmountPoisha: customerRefundPoisha,
      vendorClawbackPoisha: Math.min(
        customerRefundPoisha,
        fourWay.vendorDebitPoisha
      ),
      platformSubsidyPoisha: Math.max(
        0,
        customerRefundPoisha -
          Math.min(customerRefundPoisha, fourWay.vendorDebitPoisha)
      ),
      refundTrxId: null,
      reasonBn: `রিটার্ন কিউসি অনুমোদিত পেমেন্ট রিভার্সাল (${returnCaseCode})`,
      status: 'pending_approval',
      requestedByUsername: ctx.username,
      approvedByUsername: null,
      createdAt: nowIso,
      resolvedAt: null,
    });
    writePhase7Store(p7);
  }

  // Update order status if all units returned
  const totalOrderedAcrossOrder = erp.orderLines
    .filter((l) => l.orderId === ord.id)
    .reduce((s, l) => s + l.quantity, 0);
  const totalReturnedAcrossOrder =
    p3.returnInspections
      .filter(
        (r) =>
          r.orderNo === ord.orderNo && r.inspectedDecision !== 'REJECT_CLAIM'
      )
      .reduce((s, r) => s + r.requestedQty, 0) + input.returnQty;

  if (totalReturnedAcrossOrder >= totalOrderedAcrossOrder) {
    ord.status = 'returned';
  } else {
    ord.status = 'return_initiated';
  }

  const inspectionRecord: Phase3ReturnInspectionRecord = {
    inspectionId: `insp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    returnCaseCode,
    orderNo: ord.orderNo,
    groupCode: null,
    variantId: input.variantId,
    publicSku: orderLine.publicSku,
    vendorId: orderLine.vendorId,
    requestedQty: input.returnQty,
    inspectedDecision: input.inspectionDecision,
    faultType: input.faultType,
    restockedQty,
    damagedQuarantinedQty,
    rejectedQty: 0,
    vendorDebitPoisha: fourWay.vendorDebitPoisha,
    platformLossPoisha: fourWay.platformLossPoisha,
    courierClaimPoisha: fourWay.courierClaimPoisha,
    customerRefundPoisha,
    inspectorUsername: ctx.username,
    inspectionNoteBn: input.inspectionNoteBn.trim(),
    createdAt: nowIso,
  };

  p3.returnInspections.unshift(inspectionRecord);
  writeErpState(erp);
  writePhase4BStore(p4b);
  writePhase3Store(p3);
  computeOrthogonalOrderState(ord.orderNo);

  return {
    success: true,
    inspectionRecord,
  };
}
