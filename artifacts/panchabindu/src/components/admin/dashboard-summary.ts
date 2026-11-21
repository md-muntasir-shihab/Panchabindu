/**
 * Dashboard calculations use only the role-filtered workspace snapshot.
 *
 * The admin landing dashboard is the money view (profit, vendor payable, expenses, cash) while the
 * Today screen is the action view (what to call, pack, book, verify). Keeping the arithmetic here
 * means the numbers can be tested without rendering, and the two screens never disagree because
 * they never re-invent a total.
 */

export const DASHBOARD_STATUSES = [
  { key: 'pending_confirmation', bn: 'নিশ্চিতকরণ বাকি', en: 'Pending confirmation' },
  { key: 'confirmed', bn: 'নিশ্চিত', en: 'Confirmed' },
  { key: 'packed', bn: 'প্যাক করা', en: 'Packed' },
  { key: 'shipped', bn: 'পাঠানো', en: 'Shipped' },
  { key: 'out_for_delivery', bn: 'ডেলিভারি চলছে', en: 'Out for delivery' },
  { key: 'delivered', bn: 'ডেলিভারি সম্পন্ন', en: 'Delivered' },
  { key: 'return_initiated', bn: 'রিটার্ন প্রক্রিয়াধীন', en: 'Return initiated' },
  { key: 'returned', bn: 'ফেরত এসেছে', en: 'Returned' },
  { key: 'cancelled', bn: 'বাতিল', en: 'Cancelled' },
] as const;

export function summarizeDashboardOrders<T extends { status?: string; nextBestAction?: string; createdAt?: string }>(orders: T[]) {
  const statusCounts = Object.fromEntries(DASHBOARD_STATUSES.map(({ key }) => [key, orders.filter(order => order.status === key).length]));
  const actionable = orders.filter(order => order.nextBestAction && order.nextBestAction !== 'COMPLETED')
    .slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  return { statusCounts, actionable, total: orders.length };
}

/* ------------------------------------------------------------------ money helpers */

/** Money is always integer poisha; anything else is treated as zero rather than NaN. */
export function poisha(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : 0;
}

export const EXPENSE_CATEGORY_LABELS: Record<string, { bn: string; en: string }> = {
  ad_spend: { bn: 'বিজ্ঞাপন খরচ', en: 'Ad spend' },
  packaging: { bn: 'প্যাকেজিং', en: 'Packaging' },
  courier_return_loss: { bn: 'কুরিয়ার/রিটার্ন ক্ষতি', en: 'Courier & return loss' },
  damage_compensation: { bn: 'ড্যামেজ ক্ষতিপূরণ', en: 'Damage compensation' },
  office_ops: { bn: 'অফিস ও পরিচালনা', en: 'Office & operations' },
};

export const PAYOUT_STATUS_LABELS: Record<string, { bn: string; en: string }> = {
  requested: { bn: 'অনুরোধ করা', en: 'Requested' },
  approved: { bn: 'অনুমোদিত', en: 'Approved' },
  paid: { bn: 'পরিশোধিত', en: 'Paid' },
  rejected: { bn: 'বাতিল', en: 'Rejected' },
};

export interface ExpenseLike {
  category?: string;
  amountPoisha?: number;
  expenseDate?: string;
  campaignName?: string;
  sourceChannel?: string;
  isRecurring?: boolean;
}

export interface ExpenseSummary {
  total: number;
  recurring: number;
  byCategory: Array<{ key: string; amount: number; share: number }>;
  byMonth: Array<{ key: string; amount: number }>;
  byCampaign: Array<{ key: string; amount: number; channel?: string }>;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Groups the expense ledger by category, by calendar month and by campaign.
 * Months are emitted oldest → newest so a chart can plot them left to right.
 */
export function summarizeExpenses(
  expenses: ExpenseLike[] | undefined,
  options: { monthCount?: number; now?: Date } = {},
): ExpenseSummary {
  const rows = expenses ?? [];
  const monthCount = options.monthCount ?? 6;
  const now = options.now ?? new Date();

  const categoryTotals = new Map<string, number>();
  const campaignTotals = new Map<string, { amount: number; channel?: string }>();
  let total = 0;
  let recurring = 0;

  const monthTotals = new Map<string, number>();
  for (let offset = monthCount - 1; offset >= 0; offset -= 1) {
    const cursor = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    monthTotals.set(monthKey(cursor), 0);
  }

  for (const row of rows) {
    const amount = poisha(row.amountPoisha);
    total += amount;
    if (row.isRecurring) recurring += amount;
    const category = row.category?.trim() || 'other';
    categoryTotals.set(category, (categoryTotals.get(category) ?? 0) + amount);
    const campaign = row.campaignName?.trim();
    if (campaign) {
      const current = campaignTotals.get(campaign) ?? { amount: 0 };
      current.amount += amount;
      if (row.sourceChannel && row.sourceChannel !== 'general') current.channel = row.sourceChannel;
      campaignTotals.set(campaign, current);
    }
    if (row.expenseDate) {
      const parsed = new Date(row.expenseDate);
      if (!Number.isNaN(parsed.getTime())) {
        const key = monthKey(parsed);
        if (monthTotals.has(key)) monthTotals.set(key, (monthTotals.get(key) ?? 0) + amount);
      }
    }
  }

  return {
    total,
    recurring,
    byCategory: [...categoryTotals.entries()]
      .map(([key, amount]) => ({ key, amount, share: total > 0 ? amount / total : 0 }))
      .sort((a, b) => b.amount - a.amount),
    byMonth: [...monthTotals.entries()].map(([key, amount]) => ({ key, amount })),
    byCampaign: [...campaignTotals.entries()]
      .map(([key, value]) => ({ key, amount: value.amount, channel: value.channel }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 5),
  };
}

export interface VendorBalanceLike {
  pendingPoisha?: number;
  lockedPoisha?: number;
  availablePoisha?: number;
  payoutHoldPoisha?: number;
  clawbackDebtPoisha?: number;
  withdrawablePoisha?: number;
}

export interface VendorEscrowSummary {
  totals: {
    pending: number;
    locked: number;
    available: number;
    hold: number;
    withdrawable: number;
    clawback: number;
    payableToVendors: number;
  };
  rows: Array<{ vendorId: string; nameBn: string; nameEn: string; status?: string; balance: VendorBalanceLike }>;
  payoutsByStatus: Array<{ key: string; count: number; amount: number }>;
  payoutRequestedTotal: number;
  payoutPaidTotal: number;
}

/**
 * Vendor money is split by escrow bucket, because "vendor has ৳10,000" and "the shop owes the vendor
 * ৳10,000 right now" are different statements. Requested payouts are counted separately from paid
 * ones — a request is not a settled obligation.
 */
export function summarizeVendorEscrow(
  vendors: Array<{
    profile?: { vendorId?: string; businessNameBn?: string; businessNameEn?: string; status?: string };
    balance?: VendorBalanceLike;
  }> | undefined,
  payoutRequests: Array<{ status?: string; requestedAmountPoisha?: number }> | undefined,
): VendorEscrowSummary {
  const totals = { pending: 0, locked: 0, available: 0, hold: 0, withdrawable: 0, clawback: 0, payableToVendors: 0 };
  const rows: VendorEscrowSummary['rows'] = [];

  for (const entry of vendors ?? []) {
    const balance = entry.balance ?? {};
    const pending = poisha(balance.pendingPoisha);
    const locked = poisha(balance.lockedPoisha);
    const available = poisha(balance.availablePoisha);
    const hold = poisha(balance.payoutHoldPoisha);
    totals.pending += pending;
    totals.locked += locked;
    totals.available += available;
    totals.hold += hold;
    totals.withdrawable += poisha(balance.withdrawablePoisha);
    totals.clawback += poisha(balance.clawbackDebtPoisha);
    rows.push({
      vendorId: entry.profile?.vendorId ?? '',
      nameBn: entry.profile?.businessNameBn ?? '',
      nameEn: entry.profile?.businessNameEn ?? '',
      status: entry.profile?.status,
      balance,
    });
  }
  totals.payableToVendors = totals.pending + totals.locked + totals.available + totals.hold;

  const byStatus = new Map<string, { count: number; amount: number }>();
  for (const request of payoutRequests ?? []) {
    const key = request.status?.trim() || 'unknown';
    const current = byStatus.get(key) ?? { count: 0, amount: 0 };
    current.count += 1;
    current.amount += poisha(request.requestedAmountPoisha);
    byStatus.set(key, current);
  }
  const order = ['requested', 'approved', 'paid', 'rejected'];
  const payoutsByStatus = [...byStatus.entries()]
    .map(([key, value]) => ({ key, ...value }))
    .sort((a, b) => (order.indexOf(a.key) - order.indexOf(b.key)) || (b.amount - a.amount));

  rows.sort((a, b) => {
    const owedA = poisha(a.balance.pendingPoisha) + poisha(a.balance.lockedPoisha) + poisha(a.balance.availablePoisha);
    const owedB = poisha(b.balance.pendingPoisha) + poisha(b.balance.lockedPoisha) + poisha(b.balance.availablePoisha);
    return owedB - owedA;
  });

  return {
    totals,
    rows,
    payoutsByStatus,
    payoutRequestedTotal: (byStatus.get('requested')?.amount ?? 0) + (byStatus.get('approved')?.amount ?? 0),
    payoutPaidTotal: byStatus.get('paid')?.amount ?? 0,
  };
}

export interface PnlLike {
  deliveredGrossSalesPoisha?: number;
  totalSupplierPayablePoisha?: number;
  totalPromoDiscountPoisha?: number;
  totalAdSpendPoisha?: number;
  totalPackagingCostPoisha?: number;
  totalUnrecoveredCourierCostPoisha?: number;
  totalDamageLossPoisha?: number;
  totalOtherExpensesPoisha?: number;
  autoNetProfitPoisha?: number;
  isNetLoss?: boolean;
}

export interface PnlRow {
  key: string;
  amount: number;
  /** Share of gross delivered sales, clamped to 0…1 for the bar. */
  share: number;
}

export interface PnlBreakdown {
  gross: number;
  net: number;
  isNetLoss: boolean;
  costs: PnlRow[];
  totalCost: number;
  marginPercent: number;
  /** True when every cost line is zero and there were no delivered sales at all. */
  isEmpty: boolean;
}

/** The order the profit-and-loss lines are shown in: revenue first, then each deduction. */
const PNL_LINE_ORDER = [
  'supplier',
  'promo',
  'adSpend',
  'packaging',
  'courier',
  'damage',
  'other',
] as const;

/**
 * Turns the server's profit-and-loss block into display rows. The net figure always comes from the
 * server when present, so this screen cannot drift from the finance panel's own calculation.
 */
export function buildPnlBreakdown(pnl: PnlLike | null | undefined): PnlBreakdown {
  const gross = poisha(pnl?.deliveredGrossSalesPoisha);
  const amounts: Record<(typeof PNL_LINE_ORDER)[number], number> = {
    supplier: poisha(pnl?.totalSupplierPayablePoisha),
    promo: poisha(pnl?.totalPromoDiscountPoisha),
    adSpend: poisha(pnl?.totalAdSpendPoisha),
    packaging: poisha(pnl?.totalPackagingCostPoisha),
    courier: poisha(pnl?.totalUnrecoveredCourierCostPoisha),
    damage: poisha(pnl?.totalDamageLossPoisha),
    other: poisha(pnl?.totalOtherExpensesPoisha),
  };
  const totalCost = PNL_LINE_ORDER.reduce((sum, key) => sum + amounts[key], 0);
  const serverNet = pnl?.autoNetProfitPoisha;
  const net = typeof serverNet === 'number' && Number.isFinite(serverNet) ? Math.round(serverNet) : gross - totalCost;
  const denominator = Math.max(gross, totalCost, 1);
  const costs = PNL_LINE_ORDER.filter((key) => amounts[key] !== 0).map((key) => ({
    key,
    amount: amounts[key],
    share: Math.min(1, Math.max(0, amounts[key] / denominator)),
  }));
  return {
    gross,
    net,
    isNetLoss: pnl?.isNetLoss ?? net < 0,
    costs,
    totalCost,
    marginPercent: gross > 0 ? (net / gross) * 100 : 0,
    isEmpty: gross === 0 && totalCost === 0,
  };
}

export const PNL_LINE_LABELS: Record<string, { bn: string; en: string }> = {
  revenue: { bn: 'ডেলিভারি হওয়া বিক্রি', en: 'Delivered sales' },
  supplier: { bn: 'সাপ্লায়ার/ভেন্ডর পাওনা', en: 'Supplier payable' },
  promo: { bn: 'প্রমো ডিসকাউন্ট', en: 'Promo discount' },
  adSpend: { bn: 'বিজ্ঞাপন', en: 'Ad spend' },
  packaging: { bn: 'প্যাকেজিং', en: 'Packaging' },
  courier: { bn: 'কুরিয়ার ক্ষতি', en: 'Courier loss' },
  damage: { bn: 'ড্যামেজ', en: 'Damage' },
  other: { bn: 'অন্যান্য খরচ', en: 'Other expenses' },
  net: { bn: 'নিট লাভ', en: 'Net profit' },
  netLoss: { bn: 'নিট লোকসান', en: 'Net loss' },
};
