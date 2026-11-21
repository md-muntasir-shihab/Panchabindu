import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AdminCommandDashboard } from './admin-command-dashboard';

/**
 * Render-level regression test for the admin landing dashboard.
 *
 * The dashboard is the money view: it must show profit, cash, vendor payable and expenses, and it
 * must *not* repeat the Today screen's action queues. The snapshot is the only data source, so the
 * important cases are a populated admin snapshot, an empty snapshot, and the vendor view.
 */

const now = new Date('2026-11-21T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000).toISOString();

const populatedSnapshot = {
  orders: [
    {
      orderNo: 'ORD-261121-0001',
      customerName: 'তানভীর আহমেদ',
      districtNameBn: 'ঢাকা',
      totalPayablePoisha: 245_000,
      status: 'delivered',
      createdAt: daysAgo(0),
      items: [{ productNameBn: 'জামদানি শাড়ি', quantity: 1, lineSubtotalPoisha: 245_000 }],
    },
    {
      orderNo: 'ORD-261120-0002',
      customerName: 'নুসরাত জাহান',
      districtNameBn: 'কুমিল্লা',
      totalPayablePoisha: 143_000,
      status: 'pending_confirmation',
      createdAt: daysAgo(1),
      items: [{ productNameBn: 'জামদানি শাড়ি', quantity: 2, lineSubtotalPoisha: 120_000 }],
    },
    {
      orderNo: 'ORD-261119-0003',
      customerName: 'রফিকুল ইসলাম',
      districtNameBn: 'খুলনা',
      totalPayablePoisha: 90_000,
      status: 'cancelled',
      createdAt: daysAgo(2),
      items: [],
    },
  ],
  // Still present on the snapshot; the dashboard must ignore it in favour of money figures.
  todayQueues: {
    callToConfirmCount: 3,
    fixAddressCount: 1,
    verifyBkashCount: 2,
    readyToPackCount: 4,
    readyToBookCourierCount: 2,
    awaitingCodRemittanceCount: 1,
    lowStockVariantsCount: 2,
  },
  moneyMapPnl: {
    courierInTransitCodPoisha: 80_000,
    courierDeliveredUnsettledCodPoisha: 185_000,
    totalCourierStuckCodPoisha: 265_000,
    vendorPendingPoisha: 40_000,
    vendorLockedPoisha: 60_000,
    vendorAvailablePoisha: 50_000,
    vendorPayoutHoldPoisha: 10_000,
    totalExpensesPoisha: 70_000,
    estimatedOwnLiquidCashPoisha: 120_000,
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
    channelRoas: [
      { source: 'facebook', ordersCount: 4, revenuePoisha: 300_000, adSpendPoisha: 40_000, cpoPoisha: 10_000, roasMultiple: '7.5' },
    ],
  },
  expenses: [
    { id: 'e1', category: 'ad_spend', amountPoisha: 40_000, expenseDate: daysAgo(5), campaignName: 'ঈদ ক্যাম্পেইন', sourceChannel: 'facebook', isRecurring: false },
    { id: 'e2', category: 'packaging', amountPoisha: 20_000, expenseDate: daysAgo(20), campaignName: '', isRecurring: true },
    { id: 'e3', category: 'office_ops', amountPoisha: 5_000, expenseDate: daysAgo(40), campaignName: '', isRecurring: true },
  ],
  vendorEscrow: {
    vendors: [
      {
        profile: { vendorId: 'v1', businessNameBn: 'জামদানি হাউস', businessNameEn: 'Jamdani House', status: 'active' },
        balance: { pendingPoisha: 40_000, lockedPoisha: 60_000, availablePoisha: 50_000, payoutHoldPoisha: 10_000, clawbackDebtPoisha: 0, withdrawablePoisha: 50_000 },
      },
    ],
    payoutRequests: [
      { status: 'requested', requestedAmountPoisha: 30_000 },
      { status: 'paid', requestedAmountPoisha: 20_000 },
    ],
  },
  remittanceLedger: [
    { id: 'r1', courierProvider: 'pathao', expectedCodPoisha: 100_000, courierFeeDeductedPoisha: 8_000, remittedAmountPoisha: 90_000, shortPaymentPoisha: 2_000, isShortPaymentFlagged: true },
  ],
  product360: [{ productId: 'p1', productNameBn: 'জামদানি', variantTitleBn: 'মেরুন', stockAvailable: 0, daysOfCover: 0 }],
  currentUser: { displayNameBn: 'মুনতাসির', displayNameEn: 'Muntasir', username: 'panchabindu_owner' },
  activeRole: { nameBn: 'সুপার অ্যাডমিন', nameEn: 'Super Admin' },
  emergencyStopActive: false,
} as unknown as Parameters<typeof AdminCommandDashboard>[0]['snapshot'];

function render(overrides: {
  locale?: 'bn' | 'en';
  snapshot?: typeof populatedSnapshot;
  isSuperAdmin?: boolean;
  isVendor?: boolean;
}) {
  return renderToString(
    createElement(AdminCommandDashboard, {
      locale: overrides.locale ?? 'bn',
      snapshot: overrides.snapshot ?? populatedSnapshot,
      loadedAt: now,
      isSuperAdmin: overrides.isSuperAdmin ?? true,
      isVendor: overrides.isVendor ?? false,
      onRefresh: () => undefined,
      onNavigate: () => undefined,
      onOpenOrderStatus: () => undefined,
      onOpenOrderQueue: () => undefined,
    }),
  );
}

test('renders the money sections from a populated snapshot', () => {
  const html = render({});
  for (const section of [
    'কোম্পানির টাকার হিসাব',
    'লাভ-ক্ষতির হিসাব',
    'টাকা এখন কোথায়',
    'কুরিয়ার মিলান',
    'ভেন্ডর পাওনা ও পেআউট',
    'খরচের বিভাজন',
    'ক্যাম্পেইন খরচ',
    'বিক্রয়ের গতি',
    'সেরা পণ্য',
    'শীর্ষ জেলা',
    'অর্ডার পরিণতি',
  ]) {
    assert.ok(html.includes(section), `missing section: ${section}`);
  }
});

test('dashboard does not repeat the Today screen queues', () => {
  const html = render({});
  for (const duplicated of ['কনফার্মেশন কল বাকি', 'কনফার্মেশন কল', 'আজকের করণীয়', 'কনফার্মেশন বাকি', 'Ready to pack', 'সিওডি রেমিট্যান্স বাকি']) {
    assert.ok(!html.includes(duplicated), `dashboard must not duplicate Today's queue: ${duplicated}`);
  }
  // It points at the Today screen instead of copying it.
  assert.ok(html.includes('আজকের কাজ খুলুন'), 'dashboard must link to the Today screen');
});

test('cross-checks totals instead of inventing numbers', () => {
  const html = render({});
  // Payable is stored in poisha: today's ২,৪৫,০০০ poisha order is ৳২,৪৫০.
  assert.ok(html.includes('২,৪৫০'), 'today revenue must be shown in BDT');
  // ২,৪৫০ + ১,৪৩০ = ৳৩,৮৮০; the cancelled ৯০০ order must not be added on top (৳৪,৭৮০).
  assert.ok(!html.includes('৪,৭৮০'), 'cancelled orders must be excluded from revenue totals');
  // Net profit comes straight from the server block: ১,১৫,০০০ poisha → ৳১,১৫০.
  assert.ok(html.includes('১,১৫০'), 'net profit must match the server profit block');
  // Vendor payable is pending + locked + available + hold = ১,৬০,০০০ poisha → ৳১,৬০০.
  assert.ok(html.includes('১,৬০০'), 'vendor payable must add every escrow bucket');
});

test('a loss is labelled as a loss, never as a profit', () => {
  const loss = {
    ...populatedSnapshot,
    moneyMapPnl: { ...(populatedSnapshot as { moneyMapPnl: Record<string, unknown> }).moneyMapPnl, autoNetProfitPoisha: -25_000, isNetLoss: true },
  } as typeof populatedSnapshot;
  const html = render({ snapshot: loss });
  assert.ok(html.includes('নিট লোকসান'), 'loss must be labelled নিট লোকসান');
  assert.ok(!html.includes('নিট লাভ'), 'a loss must never be labelled নিট লাভ');
});

test('without a profit block the dashboard shows honest totals rather than fake money', () => {
  const noMoney = { ...populatedSnapshot, moneyMapPnl: null, vendorEscrow: null } as typeof populatedSnapshot;
  const html = render({ snapshot: noMoney });
  assert.ok(!html.includes('লাভ-ক্ষতির হিসাব'), 'no profit block means no profit section');
  assert.ok(!html.includes('ভেন্ডর পাওনা ও পেআউট'), 'no escrow data means no vendor ledger');
  assert.ok(html.includes('বিক্রয়ের গতি'), 'sales analytics still render from orders');
});

test('degrades to empty states for vendor and empty snapshots in both locales', () => {
  for (const locale of ['bn', 'en'] as const) {
    const html = render({ locale, snapshot: {} as typeof populatedSnapshot, isSuperAdmin: false, isVendor: true });
    assert.ok(html.length > 1_000, `${locale} dashboard should still render its shell`);
    assert.ok(!html.includes('vendor_payouts'), 'vendor dashboards must not link to payout approvals');
    assert.ok(!html.includes('লাভ-ক্ষতির হিসাব'), 'vendor dashboards must not show company profit');
    assert.ok(html.includes(locale === 'bn' ? 'কোনো পণ্য বিক্রি হয়নি' : 'No product sales yet'));
    assert.ok(html.includes(locale === 'bn' ? 'কুরিয়ার মিলান' : 'Courier reconciliation'));
  }
});

test('surfaces the emergency stop banner when the workspace is stopped', () => {
  const stopped = { ...populatedSnapshot, emergencyStopActive: true } as typeof populatedSnapshot;
  const html = render({ snapshot: stopped });
  assert.ok(html.includes('জরুরি স্টপ চালু আছে'));
});
