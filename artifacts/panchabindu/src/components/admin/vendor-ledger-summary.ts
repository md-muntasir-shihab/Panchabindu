/**
 * Vendor money & supply arithmetic for the admin Vendors Hub.
 *
 * The hub already showed a vendor's current escrow balance, but not *when* money reached the
 * vendor nor *which product actually arrived*. Both answers live in data the workspace snapshot
 * already carries (`vendorEscrow.ledgerEntries`, `vendorEscrow.payoutRequests`,
 * `phase7Overview.consignmentLots`), so this module only aggregates — no new endpoint.
 *
 * Money is integer poisha throughout, and a payout request is never treated as money paid.
 */

import { poisha } from './dashboard-summary';

export interface VendorProfileLike {
  vendorId: string;
  vendorCode?: string;
  businessNameBn?: string;
  businessNameEn?: string;
  status?: string;
}

export interface VendorBalanceLike {
  pendingPoisha?: number;
  lockedPoisha?: number;
  availablePoisha?: number;
  payoutHoldPoisha?: number;
  withdrawablePoisha?: number;
  clawbackDebtPoisha?: number;
}

export interface LedgerEntryLike {
  id?: string;
  vendorId?: string;
  entryType?: string;
  escrowBucket?: string;
  amountPoisha?: number;
  orderNo?: string | null;
  descriptionBn?: string;
  deliveredAt?: string | null;
  maturesAt?: string | null;
  createdAt?: string;
  eventTimestamp?: string;
}

export interface PayoutLike {
  payoutId?: string;
  vendorId?: string;
  status?: string;
  requestedAmountPoisha?: number;
  netPaidPoisha?: number;
  requestedAt?: string;
  resolvedAt?: string | null;
}

export interface LotLike {
  lotId: string;
  lotCode?: string;
  vendorId?: string;
  vendorNameBn?: string;
  productId?: string;
  variantId?: string;
  productNameBn?: string;
  variantTitleBn?: string;
  publicSku?: string;
  dispatchedQty?: number;
  qcAcceptedQty?: number | null;
  qcRejectedQty?: number | null;
  unitSupplierCostPoisha?: number;
  challanRef?: string;
  status?: string;
  dispatchedAt?: string;
  receivedAt?: string | null;
  createdAt?: string;
}

export interface VendorEscrowLike {
  profile: VendorProfileLike;
  balance?: VendorBalanceLike;
}

/* ------------------------------------------------------------------ labels */

export const SUPPLY_STATE_LABELS: Record<string, { bn: string; en: string }> = {
  not_received: { bn: 'পাইনি', en: 'Not received' },
  partial: { bn: 'আংশিক', en: 'Partial' },
  received: { bn: 'পেয়েছি', en: 'Received' },
  rejected: { bn: 'রিজেক্ট', en: 'Rejected' },
};

export const LEDGER_ENTRY_LABELS: Record<string, { bn: string; en: string }> = {
  EARNING_PENDING: { bn: 'আয় (পেন্ডিং)', en: 'Earning (pending)' },
  EARNING_LOCKED: { bn: 'আয় (লকড)', en: 'Earning (locked)' },
  EARNING_MATURED: { bn: 'আয় (ছাড়যোগ্য)', en: 'Earning (available)' },
  HOLD_PERIOD_RETURN_REVERSAL: { bn: 'রিটার্ন রিভার্সাল', en: 'Return reversal' },
  POST_PAYOUT_CLAWBACK: { bn: 'পেআউট-পরবর্তী clawback', en: 'Post-payout clawback' },
  PAYOUT_HOLD: { bn: 'পেআউট হোল্ড', en: 'Payout hold' },
  PAYOUT_HOLD_RELEASE: { bn: 'হোল্ড রিলিজ', en: 'Hold release' },
  PAYOUT_DISBURSED: { bn: 'পেআউট পরিশোধ', en: 'Payout disbursed' },
  MANUAL_ADJUSTMENT: { bn: 'ম্যানুয়াল সমন্বয়', en: 'Manual adjustment' },
};

/* ------------------------------------------------------------------ helpers */

const DAY_MS = 86_400_000;

export function monthKeyOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/** Oldest → newest list of `YYYY-MM` keys ending with the current month. */
export function buildMonthWindow(monthCount: number, now: Date = new Date()): string[] {
  const keys: string[] = [];
  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    keys.push(monthKeyOf(new Date(now.getFullYear(), now.getMonth() - offset, 1)));
  }
  return keys;
}

/** Whole days a pending consignment has been waiting, floored at zero. */
export function daysWaiting(dispatchedAt: string | null | undefined, now: Date = new Date()): number {
  const start = parseDate(dispatchedAt);
  if (!start) return 0;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / DAY_MS));
}

/* ------------------------------------------------------------------ supply */

export interface SupplyLotRow {
  lotId: string;
  lotCode: string;
  vendorId: string;
  vendorName: string;
  productName: string;
  variantTitle: string;
  sku: string;
  challanRef: string;
  dispatchedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  /** Pieces still unaccounted for (sent but neither accepted nor rejected). */
  unresolvedQty: number;
  pendingQty: number;
  unitCostPoisha: number;
  valuePoisha: number;
  pendingValuePoisha: number;
  state: 'not_received' | 'partial' | 'received' | 'rejected';
  dispatchedAt: string | null;
  receivedAt: string | null;
  waitingDays: number;
}

export interface SupplySummary {
  lotCount: number;
  pendingLots: number;
  /** Lots with any piece still missing, whether fully pending or only partly accepted. */
  missingLots: number;
  receivedLots: number;
  rejectedLots: number;
  dispatchedQty: number;
  acceptedQty: number;
  rejectedQty: number;
  pendingQty: number;
  unresolvedQty: number;
  pendingValuePoisha: number;
  acceptedValuePoisha: number;
  rejectedValuePoisha: number;
  oldestPendingDays: number;
  lastReceivedAt: string | null;
  /** Accepted share of everything dispatched, 0…1. */
  receiveRate: number;
}

export function buildSupplyLotRow(lot: LotLike, now: Date = new Date()): SupplyLotRow {
  const dispatchedQty = Math.max(0, Math.round(Number(lot.dispatchedQty) || 0));
  const acceptedQty = Math.max(0, Math.round(Number(lot.qcAcceptedQty) || 0));
  const rejectedQty = Math.max(0, Math.round(Number(lot.qcRejectedQty) || 0));
  const unitCostPoisha = poisha(lot.unitSupplierCostPoisha);
  const status = lot.status ?? 'pending_qc';
  const isPending = status === 'pending_qc';

  // "Received" means nothing is missing any more: accepted + rejected already cover the challan.
  // Rejected pieces stay visible in their own column, so they cannot hide inside "received".
  let state: SupplyLotRow['state'];
  if (isPending) state = 'not_received';
  else if (acceptedQty > 0 && acceptedQty + rejectedQty >= dispatchedQty) state = 'received';
  else if (acceptedQty > 0) state = 'partial';
  else if (rejectedQty > 0) state = 'rejected';
  else state = 'received';

  const unresolvedQty = isPending
    ? dispatchedQty
    : Math.max(0, dispatchedQty - acceptedQty - rejectedQty);
  const dispatchedAt = lot.dispatchedAt ?? lot.createdAt ?? null;

  return {
    lotId: lot.lotId,
    lotCode: lot.lotCode ?? lot.lotId,
    vendorId: lot.vendorId ?? '',
    vendorName: lot.vendorNameBn ?? '',
    productName: lot.productNameBn ?? '',
    variantTitle: lot.variantTitleBn ?? '',
    sku: lot.publicSku ?? '',
    challanRef: lot.challanRef ?? '',
    dispatchedQty,
    acceptedQty,
    rejectedQty,
    unresolvedQty,
    pendingQty: isPending ? dispatchedQty : 0,
    unitCostPoisha,
    valuePoisha: dispatchedQty * unitCostPoisha,
    pendingValuePoisha: (isPending ? dispatchedQty : unresolvedQty) * unitCostPoisha,
    state,
    dispatchedAt,
    receivedAt: lot.receivedAt ?? null,
    waitingDays: isPending ? daysWaiting(dispatchedAt, now) : 0,
  };
}

export function summarizeSupply(lots: LotLike[], now: Date = new Date()): SupplySummary {
  const summary: SupplySummary = {
    lotCount: 0,
    pendingLots: 0,
    missingLots: 0,
    receivedLots: 0,
    rejectedLots: 0,
    dispatchedQty: 0,
    acceptedQty: 0,
    rejectedQty: 0,
    pendingQty: 0,
    unresolvedQty: 0,
    pendingValuePoisha: 0,
    acceptedValuePoisha: 0,
    rejectedValuePoisha: 0,
    oldestPendingDays: 0,
    lastReceivedAt: null,
    receiveRate: 0,
  };

  for (const lot of lots) {
    const row = buildSupplyLotRow(lot, now);
    summary.lotCount += 1;
    summary.dispatchedQty += row.dispatchedQty;
    summary.acceptedQty += row.acceptedQty;
    summary.rejectedQty += row.rejectedQty;
    summary.pendingQty += row.pendingQty;
    summary.unresolvedQty += row.unresolvedQty;
    summary.pendingValuePoisha += row.pendingValuePoisha;
    summary.acceptedValuePoisha += row.acceptedQty * row.unitCostPoisha;
    summary.rejectedValuePoisha += row.rejectedQty * row.unitCostPoisha;
    if (row.unresolvedQty > 0) summary.missingLots += 1;
    if (row.state === 'not_received') {
      summary.pendingLots += 1;
      summary.oldestPendingDays = Math.max(summary.oldestPendingDays, row.waitingDays);
    }
    if (row.state === 'rejected') summary.rejectedLots += 1;
    if (row.state === 'received' || row.state === 'partial') {
      summary.receivedLots += 1;
      const receivedAt = row.receivedAt ?? row.dispatchedAt;
      if (receivedAt && (!summary.lastReceivedAt || receivedAt > summary.lastReceivedAt)) {
        summary.lastReceivedAt = receivedAt;
      }
    }
  }

  summary.receiveRate = summary.dispatchedQty > 0 ? summary.acceptedQty / summary.dispatchedQty : 0;
  return summary;
}

/* ------------------------------------------------------------------ money */

export interface VendorMonthRow {
  key: string;
  creditedPoisha: number;
  debitedPoisha: number;
  paidPoisha: number;
  netPoisha: number;
}

export interface VendorMoneyRow {
  vendorId: string;
  vendorCode: string;
  nameBn: string;
  nameEn: string;
  status: string;
  creditedPoisha: number;
  debitedPoisha: number;
  netPoisha: number;
  paidPoisha: number;
  requestedPoisha: number;
  owedPoisha: number;
  pendingPoisha: number;
  lockedPoisha: number;
  availablePoisha: number;
  holdPoisha: number;
  lastCreditAt: string | null;
  lastPaidAt: string | null;
  months: VendorMonthRow[];
  supply: SupplySummary;
  ledgerEntryCount: number;
}

export interface VendorLedgerReport {
  months: VendorMonthRow[];
  vendors: VendorMoneyRow[];
  lots: SupplyLotRow[];
  totals: {
    creditedPoisha: number;
    paidPoisha: number;
    requestedPoisha: number;
    owedPoisha: number;
    pendingValuePoisha: number;
    pendingLots: number;
    pendingQty: number;
    /** Pieces still missing across every lot (fully pending plus partial challans). */
    unresolvedQty: number;
    /** Lots with anything still missing, pending or partial. */
    missingLots: number;
    vendorCount: number;
  };
}

export interface VendorLedgerInput {
  vendors: VendorEscrowLike[];
  ledger: LedgerEntryLike[];
  payouts: PayoutLike[];
  lots: LotLike[];
  monthCount?: number;
  now?: Date;
  /** Restrict every figure to one vendor (used by the 360° drawer). */
  vendorId?: string;
}

/**
 * Aggregates credits, debits and paid payouts per vendor per month.
 *
 * Note on the ledger: moving money between escrow buckets (maturity transfer, payout hold) writes a
 * negative entry and a positive one in the same instant. Both sides are reported separately, so the
 * *net* column — not the credit column alone — is what changes the vendor's balance.
 */
export function summarizeVendorLedger(input: VendorLedgerInput): VendorLedgerReport {
  const now = input.now ?? new Date();
  const monthCount = input.monthCount ?? 6;
  const windowKeys = buildMonthWindow(monthCount, now);
  const windowSet = new Set(windowKeys);
  const onlyVendor = input.vendorId;

  const vendors = (input.vendors ?? []).filter(
    (row) => row?.profile?.vendorId && (!onlyVendor || row.profile.vendorId === onlyVendor),
  );

  const rows = new Map<string, VendorMoneyRow>();
  for (const entry of vendors) {
    const profile = entry.profile;
    const balance = entry.balance ?? {};
    const pendingPoisha = poisha(balance.pendingPoisha);
    const lockedPoisha = poisha(balance.lockedPoisha);
    const availablePoisha = poisha(balance.availablePoisha);
    const holdPoisha = poisha(balance.payoutHoldPoisha);
    rows.set(profile.vendorId, {
      vendorId: profile.vendorId,
      vendorCode: profile.vendorCode ?? '',
      nameBn: profile.businessNameBn ?? '',
      nameEn: profile.businessNameEn ?? '',
      status: profile.status ?? '',
      creditedPoisha: 0,
      debitedPoisha: 0,
      netPoisha: 0,
      paidPoisha: 0,
      requestedPoisha: 0,
      owedPoisha: Math.max(0, pendingPoisha + lockedPoisha + availablePoisha),
      pendingPoisha,
      lockedPoisha,
      availablePoisha,
      holdPoisha,
      lastCreditAt: null,
      lastPaidAt: null,
      months: windowKeys.map((key) => ({
        key,
        creditedPoisha: 0,
        debitedPoisha: 0,
        paidPoisha: 0,
        netPoisha: 0,
      })),
      supply: summarizeSupply([], now),
      ledgerEntryCount: 0,
    });
  }

  // A ledger row can exist for a vendor the escrow list no longer carries; keep it visible rather
  // than silently dropping real money, using the entry's own vendor id as identity.
  const ensureRow = (vendorId: string): VendorMoneyRow | null => {
    if (!vendorId) return null;
    if (onlyVendor && vendorId !== onlyVendor) return null;
    const existing = rows.get(vendorId);
    if (existing) return existing;
    const created: VendorMoneyRow = {
      vendorId,
      vendorCode: '',
      nameBn: '',
      nameEn: '',
      status: '',
      creditedPoisha: 0,
      debitedPoisha: 0,
      netPoisha: 0,
      paidPoisha: 0,
      requestedPoisha: 0,
      owedPoisha: 0,
      pendingPoisha: 0,
      lockedPoisha: 0,
      availablePoisha: 0,
      holdPoisha: 0,
      lastCreditAt: null,
      lastPaidAt: null,
      months: windowKeys.map((key) => ({
        key,
        creditedPoisha: 0,
        debitedPoisha: 0,
        paidPoisha: 0,
        netPoisha: 0,
      })),
      supply: summarizeSupply([], now),
      ledgerEntryCount: 0,
    };
    rows.set(vendorId, created);
    return created;
  };

  for (const entry of input.ledger ?? []) {
    const row = ensureRow(entry.vendorId ?? '');
    if (!row) continue;
    const amount = poisha(entry.amountPoisha);
    row.ledgerEntryCount += 1;
    row.netPoisha += amount;
    const occurredAt = entry.eventTimestamp ?? entry.createdAt ?? entry.deliveredAt ?? null;
    if (amount >= 0) {
      row.creditedPoisha += amount;
      if (occurredAt && (!row.lastCreditAt || occurredAt > row.lastCreditAt)) {
        row.lastCreditAt = occurredAt;
      }
    } else {
      row.debitedPoisha += Math.abs(amount);
    }
    const date = parseDate(occurredAt);
    if (!date) continue;
    const bucketKey = monthKeyOf(date);
    if (!windowSet.has(bucketKey)) continue;
    const bucket = row.months.find((month) => month.key === bucketKey);
    if (!bucket) continue;
    if (amount >= 0) bucket.creditedPoisha += amount;
    else bucket.debitedPoisha += Math.abs(amount);
    bucket.netPoisha += amount;
  }

  for (const payout of input.payouts ?? []) {
    const row = ensureRow(payout.vendorId ?? '');
    if (!row) continue;
    const amount = poisha(payout.netPaidPoisha ?? payout.requestedAmountPoisha);
    if (payout.status === 'paid') {
      row.paidPoisha += amount;
      const paidAt = payout.resolvedAt ?? payout.requestedAt ?? null;
      if (paidAt && (!row.lastPaidAt || paidAt > row.lastPaidAt)) row.lastPaidAt = paidAt;
      const date = parseDate(paidAt);
      if (date && windowSet.has(monthKeyOf(date))) {
        const bucket = row.months.find((month) => month.key === monthKeyOf(date));
        if (bucket) bucket.paidPoisha += amount;
      }
    } else if (payout.status === 'requested' || payout.status === 'approved') {
      row.requestedPoisha += amount;
    }
  }

  const lotsByVendor = new Map<string, LotLike[]>();
  for (const lot of input.lots ?? []) {
    const vendorId = lot.vendorId ?? '';
    if (!vendorId) continue;
    if (onlyVendor && vendorId !== onlyVendor) continue;
    const list = lotsByVendor.get(vendorId) ?? [];
    list.push(lot);
    lotsByVendor.set(vendorId, list);
  }
  for (const [vendorId, lots] of lotsByVendor) {
    const row = ensureRow(vendorId);
    if (!row) continue;
    row.supply = summarizeSupply(lots, now);
  }

  const vendorRows = [...rows.values()].filter(
    (row) => !onlyVendor || row.vendorId === onlyVendor,
  );

  const months = windowKeys.map((key) => {
    const bucket: VendorMonthRow = {
      key,
      creditedPoisha: 0,
      debitedPoisha: 0,
      paidPoisha: 0,
      netPoisha: 0,
    };
    for (const row of vendorRows) {
      const month = row.months.find((entry) => entry.key === key);
      if (!month) continue;
      bucket.creditedPoisha += month.creditedPoisha;
      bucket.debitedPoisha += month.debitedPoisha;
      bucket.paidPoisha += month.paidPoisha;
      bucket.netPoisha += month.netPoisha;
    }
    return bucket;
  });

  const lots = (input.lots ?? [])
    .filter((lot) => !onlyVendor || lot.vendorId === onlyVendor)
    .map((lot) => buildSupplyLotRow(lot, now))
    .sort((a, b) => b.waitingDays - a.waitingDays);

  const totals = vendorRows.reduce(
    (acc, row) => ({
      creditedPoisha: acc.creditedPoisha + row.creditedPoisha,
      paidPoisha: acc.paidPoisha + row.paidPoisha,
      requestedPoisha: acc.requestedPoisha + row.requestedPoisha,
      owedPoisha: acc.owedPoisha + row.owedPoisha,
      pendingValuePoisha: acc.pendingValuePoisha + row.supply.pendingValuePoisha,
      pendingLots: acc.pendingLots + row.supply.pendingLots,
      pendingQty: acc.pendingQty + row.supply.pendingQty,
      unresolvedQty: acc.unresolvedQty + row.supply.unresolvedQty,
      missingLots: acc.missingLots + row.supply.missingLots,
      vendorCount: acc.vendorCount + 1,
    }),
    {
      creditedPoisha: 0,
      paidPoisha: 0,
      requestedPoisha: 0,
      owedPoisha: 0,
      pendingValuePoisha: 0,
      pendingLots: 0,
      pendingQty: 0,
      unresolvedQty: 0,
      missingLots: 0,
      vendorCount: 0,
    },
  );

  return { months, vendors: vendorRows, lots, totals };
}

export type VendorMoneySortKey = 'credited' | 'paid' | 'owed' | 'pendingSupply';

/** Pending supply is the loudest signal, so it can be sorted to the top. */
export function sortVendorMoneyRows(rows: VendorMoneyRow[], key: VendorMoneySortKey): VendorMoneyRow[] {
  const value = (row: VendorMoneyRow) => {
    switch (key) {
      case 'paid':
        return row.paidPoisha;
      case 'owed':
        return row.owedPoisha;
      case 'pendingSupply':
        return row.supply.pendingValuePoisha;
      default:
        return row.creditedPoisha;
    }
  };
  return [...rows].sort((a, b) => value(b) - value(a));
}
