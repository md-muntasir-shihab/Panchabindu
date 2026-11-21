import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { AdminCommandDashboard } from './admin-command-dashboard';

/**
 * Render-level regression test for the admin landing dashboard.
 *
 * The workspace snapshot is the only data source, so the important cases are: a populated
 * role-filtered snapshot (all sections render), an empty snapshot (honest empty states, no
 * crash) and both admin locales.
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
  todayQueues: {
    callToConfirmCount: 3,
    fixAddressCount: 1,
    verifyBkashCount: 2,
    readyToPackCount: 4,
    readyToBookCourierCount: 2,
    awaitingCodRemittanceCount: 1,
    lowStockVariantsCount: 2,
  },
  moneyMapPnl: { totalCourierStuckCodPoisha: 265_000 },
  product360: [{ productId: 'p1', productNameBn: 'জামদানি', variantTitleBn: 'মেরুন', stockAvailable: 0, daysOfCover: 0 }],
  manualPaymentSubmissions: [{ status: 'pending_verification' }],
  inquiries: [{ status: 'unread' }],
  vendorSupportTickets: [{ status: 'open' }],
  pendingVendorRequests: [{}],
  pendingVendorKycDocs: [{}],
  vendorEscrow: { payoutRequests: [{ status: 'requested', amountPoisha: 1_000 }] },
  auditLogs: [{ id: 'a1', actorUsername: 'admin', summaryBn: 'অর্ডার কনফার্ম করা হয়েছে', actionCode: 'ORDER_CONFIRMED', createdAt: daysAgo(0) }],
  currentUser: { displayNameBn: 'মুনতাসির', displayNameEn: 'Muntasir', username: 'panchabindu_owner' },
  activeRole: { nameBn: 'সুপার অ্যাডমিন', nameEn: 'Super Admin' },
  emergencyStopActive: false,
} as unknown as Parameters<typeof AdminCommandDashboard>[0]['snapshot'];

function render(overrides: { locale?: 'bn' | 'en'; snapshot?: typeof populatedSnapshot; isSuperAdmin?: boolean; isVendor?: boolean }) {
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

test('renders every dashboard section from a populated snapshot', () => {
  const html = render({});
  for (const section of ['আজকের বিক্রি', 'বিক্রয়ের প্রবণতা', 'অর্ডার অবস্থা', 'আজকের করণীয়', 'সেরা পণ্য', 'সাম্প্রতিক অর্ডার', 'শীর্ষ জেলা', 'ইনভেন্টরি অ্যালার্ট', 'সাম্প্রতিক অ্যাক্টিভিটি', 'দ্রুত কাজ']) {
    assert.ok(html.includes(section), `missing section: ${section}`);
  }
  // Sorting controls exist for both the orders table and the product ranking.
  assert.ok(html.includes('aria-sort'), 'order table headers must expose sorting state');
  assert.ok(html.includes('ORD-261121-0001'), 'recent orders table must list real order numbers');
});

test('cross-checks totals instead of inventing numbers', () => {
  const html = render({});
  // Payable is stored in poisha: today's ২,৪৫,০০০ poisha order is ৳২,৪৫০.০০.
  assert.ok(html.includes('২,৪৫০'), 'today revenue must be shown in BDT');
  // ২,৪৫০ + ১,৪৩০ = ৳৩,৮৮০; the cancelled ৯০০ order must not be added on top (৳৪,৭৮০).
  assert.ok(!html.includes('৪,৭৮০'), 'cancelled orders must be excluded from revenue totals');
});

test('degrades to empty states for vendor and empty snapshots in both locales', () => {
  for (const locale of ['bn', 'en'] as const) {
    const html = render({ locale, snapshot: {} as typeof populatedSnapshot, isSuperAdmin: false, isVendor: true });
    assert.ok(html.length > 1_000, `${locale} dashboard should still render its shell`);
    assert.ok(!html.includes('vendor_payouts'), 'vendor dashboards must not link to payout approvals');
    assert.ok(html.includes(locale === 'bn' ? 'এখনো কোনো অর্ডার নেই' : 'No orders yet'));
  }
});

test('surfaces the emergency stop banner when the workspace is stopped', () => {
  const stopped = { ...populatedSnapshot, emergencyStopActive: true } as typeof populatedSnapshot;
  const html = render({ snapshot: stopped });
  assert.ok(html.includes('জরুরি স্টপ চালু আছে'));
});
