import test from 'node:test';
import assert from 'node:assert/strict';
import { DASHBOARD_STATUSES, summarizeDashboardOrders } from '../../artifacts/panchabindu/src/components/admin/dashboard-summary';

test('dashboard counts only supplied role-visible orders and does not change them', () => {
  const input = [
    { status: 'pending_confirmation', nextBestAction: 'CALL_TO_CONFIRM', createdAt: '2026-01-01' },
    { status: 'return_initiated', nextBestAction: 'PROCESS_PENDING_RETURN', createdAt: '2026-01-03' },
    { status: 'delivered', nextBestAction: 'COMPLETED', createdAt: '2026-01-02' },
    { status: 'returned', nextBestAction: 'COMPLETED', createdAt: '2026-01-04' },
  ];
  const original = structuredClone(input);
  const result = summarizeDashboardOrders(input);
  assert.equal(result.total, 4);
  assert.equal(result.statusCounts.pending_confirmation, 1);
  assert.equal(result.statusCounts.return_initiated, 1);
  assert.equal(result.statusCounts.packed, 0);
  assert.deepEqual(result.actionable.map(o => o.status), ['return_initiated', 'pending_confirmation']);
  assert.deepEqual(input, original);
  assert.equal(DASHBOARD_STATUSES.length, 9);
});

test('empty or incomplete snapshot is safe and never invents counts or actions', () => {
  const empty = summarizeDashboardOrders([]);
  assert.equal(empty.total, 0);
  assert.deepEqual(empty.actionable, []);
  assert.ok(Object.values(empty.statusCounts).every(value => value === 0));
  const unknown = summarizeDashboardOrders([{ status: 'unknown' }]);
  assert.equal(unknown.total, 1);
  assert.deepEqual(unknown.actionable, []);
});

/* ------------------------------------------------------------------ money summaries */

import {
  buildPnlBreakdown,
  poisha,
  summarizeExpenses,
  summarizeVendorEscrow,
} from '../../artifacts/panchabindu/src/components/admin/dashboard-summary';

test('poisha rejects garbage instead of producing NaN money', () => {
  assert.equal(poisha(245_000), 245_000);
  assert.equal(poisha('245000'), 245_000);
  assert.equal(poisha(24.6), 25);
  assert.equal(poisha(undefined), 0);
  assert.equal(poisha('abc'), 0);
});

test('profit and loss adds every cost line and keeps the server net figure', () => {
  const breakdown = buildPnlBreakdown({
    deliveredGrossSalesPoisha: 500_000,
    totalSupplierPayablePoisha: 300_000,
    totalPromoDiscountPoisha: 10_000,
    totalAdSpendPoisha: 40_000,
    totalPackagingCostPoisha: 20_000,
    totalUnrecoveredCourierCostPoisha: 5_000,
    totalDamageLossPoisha: 5_000,
    totalOtherExpensesPoisha: 5_000,
    autoNetProfitPoisha: 115_000,
    isNetLoss: false,
  });
  assert.equal(breakdown.gross, 500_000);
  assert.equal(breakdown.totalCost, 385_000);
  assert.equal(breakdown.net, 115_000);
  assert.equal(breakdown.costs.length, 7);
  assert.equal(Math.round(breakdown.marginPercent), 23);
  assert.equal(breakdown.isEmpty, false);
});

test('profit and loss falls back to gross minus cost and flags a loss', () => {
  const breakdown = buildPnlBreakdown({ deliveredGrossSalesPoisha: 100_000, totalSupplierPayablePoisha: 130_000 });
  assert.equal(breakdown.net, -30_000);
  assert.equal(breakdown.isNetLoss, true);
  assert.equal(buildPnlBreakdown(null).isEmpty, true);
});

test('expenses are grouped by category, month window and campaign without double counting', () => {
  const now = new Date('2026-11-21T12:00:00.000Z');
  const summary = summarizeExpenses(
    [
      { category: 'ad_spend', amountPoisha: 40_000, expenseDate: '2026-11-05T00:00:00.000Z', campaignName: 'Eid', sourceChannel: 'facebook' },
      { category: 'packaging', amountPoisha: 20_000, expenseDate: '2026-10-20T00:00:00.000Z', isRecurring: true },
      { category: 'ad_spend', amountPoisha: 5_000, expenseDate: '2026-11-15T00:00:00.000Z', campaignName: 'Eid' },
      { category: 'office_ops', amountPoisha: 1_000, expenseDate: '2025-01-01T00:00:00.000Z' },
    ],
    { monthCount: 3, now },
  );
  assert.equal(summary.total, 66_000);
  assert.equal(summary.recurring, 20_000);
  assert.deepEqual(summary.byCategory.map(row => [row.key, row.amount]), [['ad_spend', 45_000], ['packaging', 20_000], ['office_ops', 1_000]]);
  assert.deepEqual(summary.byMonth.map(row => row.key), ['2026-09', '2026-10', '2026-11']);
  assert.equal(summary.byMonth[2].amount, 45_000);
  assert.equal(summary.byMonth[1].amount, 20_000);
  // The 2025 expense is outside the window for the chart but still counted in the total.
  assert.equal(summary.byMonth[0].amount, 0);
  assert.deepEqual(summary.byCampaign.map(row => [row.key, row.amount]), [['Eid', 45_000]]);
  assert.equal(Math.round(summary.byCategory[0].share * 100), 68);
});

test('vendor escrow keeps buckets separate and never treats a request as paid', () => {
  const summary = summarizeVendorEscrow(
    [
      {
        profile: { vendorId: 'v1', businessNameBn: 'ক', businessNameEn: 'A' },
        balance: { pendingPoisha: 40_000, lockedPoisha: 60_000, availablePoisha: 50_000, payoutHoldPoisha: 10_000, withdrawablePoisha: 50_000, clawbackDebtPoisha: 2_000 },
      },
      {
        profile: { vendorId: 'v2', businessNameBn: 'খ', businessNameEn: 'B' },
        balance: { pendingPoisha: 1_000, lockedPoisha: 0, availablePoisha: 0, payoutHoldPoisha: 0, withdrawablePoisha: 0, clawbackDebtPoisha: 0 },
      },
    ],
    [
      { status: 'requested', requestedAmountPoisha: 30_000 },
      { status: 'approved', requestedAmountPoisha: 5_000 },
      { status: 'paid', requestedAmountPoisha: 20_000 },
    ],
  );
  assert.equal(summary.totals.pending, 41_000);
  assert.equal(summary.totals.locked, 60_000);
  assert.equal(summary.totals.available, 50_000);
  assert.equal(summary.totals.hold, 10_000);
  assert.equal(summary.totals.payableToVendors, 161_000);
  assert.equal(summary.totals.clawback, 2_000);
  assert.deepEqual(summary.rows.map(row => row.vendorId), ['v1', 'v2']);
  assert.equal(summary.payoutRequestedTotal, 35_000);
  assert.equal(summary.payoutPaidTotal, 20_000);
  assert.deepEqual(summary.payoutsByStatus.map(row => row.key), ['requested', 'approved', 'paid']);
});

test('vendor escrow summary is safe on an empty snapshot', () => {
  const summary = summarizeVendorEscrow(undefined, undefined);
  assert.deepEqual(summary.rows, []);
  assert.deepEqual(summary.payoutsByStatus, []);
  assert.equal(summary.totals.payableToVendors, 0);
});
