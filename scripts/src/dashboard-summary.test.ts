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
