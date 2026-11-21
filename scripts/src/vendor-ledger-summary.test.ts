import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildMonthWindow,
  buildSupplyLotRow,
  daysWaiting,
  sortVendorMoneyRows,
  summarizeSupply,
  summarizeVendorLedger,
} from '../../artifacts/panchabindu/src/components/admin/vendor-ledger-summary';

const now = new Date('2026-11-21T12:00:00.000Z');

const vendors = [
  {
    profile: { vendorId: 'v1', vendorCode: 'VND-001', businessNameBn: 'জামদানি হাউস', businessNameEn: 'Jamdani House', status: 'active' },
    balance: { pendingPoisha: 40_000, lockedPoisha: 60_000, availablePoisha: 50_000, payoutHoldPoisha: 0 },
  },
  {
    profile: { vendorId: 'v2', vendorCode: 'VND-002', businessNameBn: 'তাঁতঘর', businessNameEn: 'Tantghor', status: 'active' },
    balance: { pendingPoisha: 0, lockedPoisha: 10_000, availablePoisha: 0, payoutHoldPoisha: 5_000 },
  },
];

const ledger = [
  { id: 'l1', vendorId: 'v1', entryType: 'EARNING_LOCKED', escrowBucket: 'locked', amountPoisha: 60_000, createdAt: '2026-11-02T10:00:00.000Z', orderNo: 'ORD-1' },
  { id: 'l2', vendorId: 'v1', entryType: 'EARNING_PENDING', escrowBucket: 'pending', amountPoisha: 40_000, createdAt: '2026-10-05T10:00:00.000Z', orderNo: 'ORD-2' },
  // Bucket transfer: same amount on both sides, so only the net moves.
  { id: 'l3', vendorId: 'v1', entryType: 'MANUAL_ADJUSTMENT', escrowBucket: 'locked', amountPoisha: -60_000, createdAt: '2026-11-09T10:00:00.000Z' },
  { id: 'l4', vendorId: 'v1', entryType: 'EARNING_MATURED', escrowBucket: 'available', amountPoisha: 60_000, createdAt: '2026-11-09T10:00:00.000Z' },
  { id: 'l5', vendorId: 'v2', entryType: 'EARNING_LOCKED', escrowBucket: 'locked', amountPoisha: 10_000, createdAt: '2026-11-20T10:00:00.000Z' },
];

const payouts = [
  { payoutId: 'p1', vendorId: 'v1', status: 'paid', requestedAmountPoisha: 50_000, resolvedAt: '2026-11-15T10:00:00.000Z' },
  { payoutId: 'p2', vendorId: 'v1', status: 'requested', requestedAmountPoisha: 30_000, requestedAt: '2026-11-20T10:00:00.000Z' },
  { payoutId: 'p3', vendorId: 'v2', status: 'rejected', requestedAmountPoisha: 99_000, requestedAt: '2026-11-18T10:00:00.000Z' },
];

const lots = [
  {
    lotId: 'lot1',
    lotCode: 'LOT-1',
    vendorId: 'v1',
    productNameBn: 'জামদানি শাড়ি',
    variantTitleBn: 'মেরুন',
    publicSku: 'SKU-1',
    dispatchedQty: 10,
    qcAcceptedQty: 8,
    qcRejectedQty: 2,
    unitSupplierCostPoisha: 50_000,
    status: 'approved_stocked',
    dispatchedAt: '2026-11-10T10:00:00.000Z',
    receivedAt: '2026-11-12T10:00:00.000Z',
  },
  {
    lotId: 'lot2',
    lotCode: 'LOT-2',
    vendorId: 'v2',
    productNameBn: 'তসর শাড়ি',
    variantTitleBn: 'নীল',
    publicSku: 'SKU-2',
    dispatchedQty: 6,
    qcAcceptedQty: null,
    qcRejectedQty: null,
    unitSupplierCostPoisha: 20_000,
    status: 'pending_qc',
    dispatchedAt: '2026-11-11T10:00:00.000Z',
  },
  {
    lotId: 'lot3',
    lotCode: 'LOT-3',
    vendorId: 'v1',
    productNameBn: 'জামদানি ওড়না',
    variantTitleBn: 'সবুজ',
    publicSku: 'SKU-3',
    dispatchedQty: 5,
    qcAcceptedQty: 0,
    qcRejectedQty: 5,
    unitSupplierCostPoisha: 10_000,
    status: 'rejected',
    dispatchedAt: '2026-11-01T10:00:00.000Z',
  },
];

test('month window ends at the current month and is ordered oldest first', () => {
  assert.deepEqual(buildMonthWindow(3, now), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(buildMonthWindow(1, now), ['2026-11']);
});

test('vendor money separates credits, transfers, paid payouts and requests', () => {
  const report = summarizeVendorLedger({ vendors, ledger, payouts, lots, monthCount: 3, now });
  const v1 = report.vendors.find((row) => row.vendorId === 'v1');
  assert.ok(v1);
  // 60,000 + 40,000 + 60,000 credits; the -60,000 maturity offset is a debit.
  assert.equal(v1.creditedPoisha, 160_000);
  assert.equal(v1.debitedPoisha, 60_000);
  assert.equal(v1.netPoisha, 100_000);
  assert.equal(v1.paidPoisha, 50_000);
  assert.equal(v1.requestedPoisha, 30_000, 'a request is not a payment');
  assert.equal(v1.owedPoisha, 150_000, 'pending + locked + available from the balance');
  assert.equal(v1.lastPaidAt, '2026-11-15T10:00:00.000Z');
  assert.equal(v1.lastCreditAt, '2026-11-09T10:00:00.000Z');
  assert.equal(v1.months.find((m) => m.key === '2026-11')?.paidPoisha, 50_000);
  assert.equal(v1.months.find((m) => m.key === '2026-10')?.creditedPoisha, 40_000);
});

test('rejected payouts are neither paid nor pending', () => {
  const report = summarizeVendorLedger({ vendors, ledger, payouts, lots, monthCount: 3, now });
  const v2 = report.vendors.find((row) => row.vendorId === 'v2');
  assert.ok(v2);
  assert.equal(v2.paidPoisha, 0);
  assert.equal(v2.requestedPoisha, 0);
});

test('totals add every vendor and never lose a vendor with its own ledger', () => {
  const report = summarizeVendorLedger({ vendors, ledger, payouts, lots, monthCount: 3, now });
  assert.equal(report.totals.vendorCount, 2);
  assert.equal(report.totals.creditedPoisha, 170_000);
  assert.equal(report.totals.paidPoisha, 50_000);
  assert.equal(report.totals.requestedPoisha, 30_000);
  assert.equal(report.totals.owedPoisha, 160_000);

  const ghost = summarizeVendorLedger({
    vendors,
    ledger: [...ledger, { id: 'x', vendorId: 'v9', amountPoisha: 5_000, createdAt: '2026-11-01T10:00:00.000Z' }],
    payouts: [],
    lots: [],
    monthCount: 3,
    now,
  });
  const orphan = ghost.vendors.find((row) => row.vendorId === 'v9');
  assert.ok(orphan, 'a ledger row for an unknown vendor must stay visible');
  assert.equal(orphan.creditedPoisha, 5_000);
});

test('a single vendor filter hides every other vendor everywhere', () => {
  const report = summarizeVendorLedger({ vendors, ledger, payouts, lots, monthCount: 3, now, vendorId: 'v2' });
  assert.deepEqual(report.vendors.map((row) => row.vendorId), ['v2']);
  assert.deepEqual(report.lots.map((row) => row.lotId), ['lot2']);
  // v2 only: 10,000 credited and 10,000 (locked) owed; v1's 160,000 must not leak in.
  assert.equal(report.totals.creditedPoisha, 10_000);
  assert.equal(report.totals.owedPoisha, 10_000);
});

test('supply rows distinguish received, partial, missing and rejected', () => {
  const partial = buildSupplyLotRow({ ...lots[0], qcAcceptedQty: 8, qcRejectedQty: 0 }, now);
  assert.equal(partial.state, 'partial');
  assert.equal(partial.unresolvedQty, 2);
  assert.equal(partial.pendingValuePoisha, 2 * 50_000);

  const received = buildSupplyLotRow(lots[0], now);
  assert.equal(received.state, 'received');
  assert.equal(received.unresolvedQty, 0);
  assert.equal(received.valuePoisha, 500_000);

  const missing = buildSupplyLotRow(lots[1], now);
  assert.equal(missing.state, 'not_received');
  assert.equal(missing.pendingQty, 6);
  assert.equal(missing.pendingValuePoisha, 6 * 20_000);
  assert.equal(missing.waitingDays, Math.floor((now.getTime() - Date.parse('2026-11-11T10:00:00.000Z')) / 86_400_000));

  const rejected = buildSupplyLotRow(lots[2], now);
  assert.equal(rejected.state, 'rejected');
  assert.equal(rejected.rejectedQty, 5);
  assert.equal(rejected.pendingValuePoisha, 0);
});

test('supply summary counts pending lots, value and the longest wait', () => {
  const summary = summarizeSupply(lots, now);
  assert.equal(summary.lotCount, 3);
  assert.equal(summary.pendingLots, 1);
  assert.equal(summary.receivedLots, 1, 'only the fully accounted lot counts as received');
  assert.equal(summary.rejectedLots, 1);
  assert.equal(summary.dispatchedQty, 21);
  assert.equal(summary.acceptedQty, 8);
  assert.equal(summary.rejectedQty, 7);
  assert.equal(summary.pendingQty, 6);
  // lot3 was rejected outright (0 accepted, 5 rejected), so nothing is missing there.
  assert.equal(summary.unresolvedQty, 6);
  assert.equal(summary.missingLots, 1);
  assert.equal(summary.pendingValuePoisha, 120_000);

  // A partly accepted challan counts as missing too, even though QC already ran.
  const partialSummary = summarizeSupply([{ ...lots[0], qcAcceptedQty: 8, qcRejectedQty: 0 }], now);
  assert.equal(partialSummary.unresolvedQty, 2);
  assert.equal(partialSummary.missingLots, 1);
  assert.equal(partialSummary.pendingLots, 0);
  assert.equal(partialSummary.pendingValuePoisha, 100_000);
  assert.equal(summary.acceptedValuePoisha, 8 * 50_000);
  assert.equal(summary.oldestPendingDays, daysWaiting('2026-11-11T10:00:00.000Z', now));
  assert.equal(summary.lastReceivedAt, '2026-11-12T10:00:00.000Z');
  assert.equal(Math.round(summary.receiveRate * 100), 38);
});

test('waiting days never goes negative for a future dispatch date', () => {
  assert.equal(daysWaiting('2026-12-01T10:00:00.000Z', now), 0);
  assert.equal(daysWaiting(null, now), 0);
});

test('sorting vendors by pending supply surfaces the one that is still missing goods', () => {
  const report = summarizeVendorLedger({ vendors, ledger, payouts, lots, monthCount: 3, now });
  const byPending = sortVendorMoneyRows(report.vendors, 'pendingSupply');
  assert.equal(byPending[0].vendorId, 'v2');
  const byEarned = sortVendorMoneyRows(report.vendors, 'credited');
  assert.equal(byEarned[0].vendorId, 'v1');
  // Sorting must not mutate the report.
  assert.equal(report.vendors[0].vendorId, 'v1');
});

test('an empty snapshot produces zeros instead of throwing', () => {
  const report = summarizeVendorLedger({ vendors: [], ledger: [], payouts: [], lots: [], monthCount: 2, now });
  assert.deepEqual(report.vendors, []);
  assert.deepEqual(report.lots, []);
  assert.equal(report.months.length, 2);
  assert.equal(report.totals.creditedPoisha, 0);
  assert.equal(report.totals.pendingLots, 0);
});
