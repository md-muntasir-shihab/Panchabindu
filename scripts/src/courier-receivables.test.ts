import test from 'node:test';
import assert from 'node:assert/strict';
import { courierStage, summarizeCourierOrders, validPoisha } from '../../artifacts/panchabindu/src/components/admin/courier-receivables';

test('only recorded delivered and shipped COD is included, without claiming remittance or deducting fees', () => {
  const rows = [
    { orderNo: 'A', status: 'delivered' as const, paymentStatus: 'remitted' as const, codCollectablePoisha: 10001 },
    { orderNo: 'B', status: 'shipped' as const, codCollectablePoisha: 200 },
    { orderNo: 'C', status: 'out_for_delivery' as const, codCollectablePoisha: 300 },
    { orderNo: 'D', status: 'packed' as const, codCollectablePoisha: 999999 },
    { orderNo: 'E', status: 'returned' as const, codCollectablePoisha: 999999 },
  ];
  const before = structuredClone(rows);
  assert.deepEqual(summarizeCourierOrders(rows), { delivered: 10001, transit: 500, deliveredCount: 1, transitCount: 2 });
  assert.deepEqual(rows, before);
  assert.equal(courierStage('return_initiated'), 'excluded');
});

test('missing, invalid, overflow and duplicate data fail closed instead of inventing totals', () => {
  for (const value of [undefined, -1, NaN, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(validPoisha(value), false);
    assert.equal(summarizeCourierOrders([{ orderNo: 'A', status: 'delivered', codCollectablePoisha: value }]).delivered, null);
  }
  assert.equal(summarizeCourierOrders([{ status: 'shipped', codCollectablePoisha: 100 }]).transit, null);
  const duplicate = [{ orderNo: 'A', status: 'delivered', codCollectablePoisha: 1 }, { orderNo: 'a', status: 'delivered', codCollectablePoisha: 1 }];
  assert.equal(summarizeCourierOrders(duplicate.slice(0, 1), duplicate).delivered, null);
  assert.equal(summarizeCourierOrders([{ orderNo: 'A', status: 'delivered', codCollectablePoisha: Number.MAX_SAFE_INTEGER }, { orderNo: 'B', status: 'delivered', codCollectablePoisha: 1 }]).delivered, null);
  assert.deepEqual(summarizeCourierOrders([]), { delivered: 0, transit: 0, deliveredCount: 0, transitCount: 0 });
});
