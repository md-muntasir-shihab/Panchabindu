import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { VendorLedgerSupplyPanel } from './vendor-ledger-supply-panel';

/**
 * Render-level checks for the vendor money & supply view that now lives in the Vendors Hub.
 * The important promises: money and received/not-received stock are both visible, a request is
 * never shown as paid, and a single-vendor view never leaks another vendor's numbers.
 */

const vendors = [
  {
    profile: { vendorId: 'v1', vendorCode: 'VND-001', businessNameBn: 'জামদানি হাউস', businessNameEn: 'Jamdani House', status: 'active' },
    balance: { pendingPoisha: 40_000, lockedPoisha: 60_000, availablePoisha: 50_000, payoutHoldPoisha: 0 },
  },
  {
    profile: { vendorId: 'v2', vendorCode: 'VND-002', businessNameBn: 'তাঁতঘর', businessNameEn: 'Tantghor', status: 'active' },
    balance: { pendingPoisha: 0, lockedPoisha: 10_000, availablePoisha: 0, payoutHoldPoisha: 0 },
  },
];

const ledgerEntries = [
  { id: 'l1', vendorId: 'v1', entryType: 'EARNING_LOCKED', escrowBucket: 'locked', amountPoisha: 60_000, createdAt: '2026-11-02T10:00:00.000Z' },
  { id: 'l2', vendorId: 'v1', entryType: 'EARNING_PENDING', escrowBucket: 'pending', amountPoisha: 40_000, createdAt: '2026-10-05T10:00:00.000Z' },
  { id: 'l3', vendorId: 'v2', entryType: 'EARNING_LOCKED', escrowBucket: 'locked', amountPoisha: 10_000, createdAt: '2026-11-20T10:00:00.000Z' },
];

const payoutRequests = [
  { payoutId: 'p1', vendorId: 'v1', status: 'paid', requestedAmountPoisha: 50_000, resolvedAt: '2026-11-15T10:00:00.000Z' },
  { payoutId: 'p2', vendorId: 'v1', status: 'requested', requestedAmountPoisha: 30_000, requestedAt: '2026-11-20T10:00:00.000Z' },
];

const lots = [
  {
    lotId: 'lot1', lotCode: 'LOT-261110-101', vendorId: 'v1', vendorNameBn: 'জামদানি হাউস',
    productNameBn: 'জামদানি শাড়ি', variantTitleBn: 'মেরুন', publicSku: 'SKU-1', challanRef: 'CH-9',
    dispatchedQty: 10, qcAcceptedQty: 8, qcRejectedQty: 2, unitSupplierCostPoisha: 50_000,
    status: 'approved_stocked', dispatchedAt: '2026-11-10T10:00:00.000Z', receivedAt: '2026-11-12T10:00:00.000Z',
  },
  {
    lotId: 'lot2', lotCode: 'LOT-261111-102', vendorId: 'v2', vendorNameBn: 'তাঁতঘর',
    productNameBn: 'তসর শাড়ি', variantTitleBn: 'নীল', publicSku: 'SKU-2', challanRef: 'CH-10',
    dispatchedQty: 6, qcAcceptedQty: null, qcRejectedQty: null, unitSupplierCostPoisha: 20_000,
    status: 'pending_qc', dispatchedAt: '2026-11-11T10:00:00.000Z',
  },
];

function render(overrides: {
  locale?: 'bn' | 'en';
  variant?: 'hub' | 'vendor';
  vendorId?: string;
  vendors?: typeof vendors;
  lots?: typeof lots;
  /** Emptying these also empties the vendor table: the ledger alone can name a vendor. */
  ledgerEntries?: typeof ledgerEntries;
  payoutRequests?: typeof payoutRequests;
} = {}) {
  return renderToString(
    createElement(VendorLedgerSupplyPanel, {
      locale: overrides.locale ?? 'bn',
      vendors: overrides.vendors ?? vendors,
      ledgerEntries: overrides.ledgerEntries ?? ledgerEntries,
      payoutRequests: overrides.payoutRequests ?? payoutRequests,
      lots: overrides.lots ?? lots,
      variant: overrides.variant ?? 'hub',
      vendorId: overrides.vendorId,
      onOpenVendor: () => undefined,
      onViewPayouts: () => undefined,
    }),
  );
}

test('hub view shows money over time and the received / not-received stock table', () => {
  const html = render();
  for (const section of [
    'ভেন্ডর মোট আয় (ক্রেডিট)',
    'পরিশোধিত পেআউট',
    'এখন ভেন্ডর পাওনা',
    'মাল বাকি আছে',
    'কবে কত টাকা এলো',
    'ভেন্ডরভিত্তিক হিসাব',
    'কোন প্রোডাক্ট পেয়েছি, কোনটা পাইনি',
    'পাইনি',
    'পেয়েছি',
  ]) {
    assert.ok(html.includes(section), `missing section: ${section}`);
  }
  // Real data, not placeholders: challan, product and vendor names appear.
  assert.ok(html.includes('LOT-261111-102'), 'lot code must be listed');
  assert.ok(html.includes('তসর শাড়ি'), 'product name must be listed');
  assert.ok(html.includes('CH-10'), 'challan reference must be listed');
  assert.ok(html.includes('জামদানি হাউস'), 'vendor name must be listed');
});

test('money is shown in taka and a requested payout is not counted as paid', () => {
  const html = render();
  // v1 credited ১,০০,০০০ poisha → ৳১,০০০; paid ৫০,০০০ → ৳৫০০; owed ১,৫০,০০০ → ৳১,৫০০.
  assert.ok(html.includes('১,০০০'), 'credited total must render in BDT');
  assert.ok(html.includes('৫০০'), 'paid payouts must render in BDT');
  assert.ok(html.includes('১,৬০০'), 'total owed across vendors must add up (১,৫০০ + ১০০)');
  // The pending request is called out separately instead of inflating paid totals.
  assert.ok(html.includes('চাওয়া'), 'requested payouts must be shown as requested');
  assert.ok(html.includes('অনুরোধ করা'), 'payout request states must be listed');
});

test('pending stock shows pieces, taka value and how long it has been waiting', () => {
  const html = render();
  // Pending lot: 6 pcs × ৳২০০ = ৳১,২০০; the row must expose both pieces and value.
  assert.ok(html.includes('১,২০০'), 'pending stock value must be shown');
  assert.ok(html.includes('দিন'), 'waiting days must be shown');
  assert.ok(html.includes('গৃহীতের অনুপাত'), 'receive-rate column must exist');
});

test('vendor view hides the vendor table and other vendors entirely', () => {
  const html = render({ variant: 'vendor', vendorId: 'v2', vendors: [vendors[1]] });
  assert.ok(!html.includes('জামদানি হাউস'), 'another vendor must never appear in a single-vendor view');
  assert.ok(!html.includes('LOT-261110-101'), 'another vendor’s lot must never appear');
  assert.ok(!html.includes('ভেন্ডরভিত্তিক হিসাব'), 'single vendor view has no vendor table');
  assert.ok(html.includes('তসর শাড়ি'), 'the selected vendor’s own lot must still show');
});

test('empty data degrades to honest empty states in both languages', () => {
  for (const locale of ['bn', 'en'] as const) {
    const html = render({ locale, vendors: [], lots: [], ledgerEntries: [], payoutRequests: [] });
    assert.ok(html.length > 1_000, `${locale} panel should still render its shell`);
    assert.ok(
      html.includes(locale === 'bn' ? 'কোনো চালান নেই' : 'No consignment lots'),
      `${locale} must show an empty supply state`,
    );
    assert.ok(
      html.includes(locale === 'bn' ? 'কোনো ভেন্ডর নেই' : 'No vendors yet'),
      `${locale} must show an empty vendor state`,
    );
  }
});
