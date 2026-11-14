/** Dashboard calculations use only the role-filtered workspace snapshot. */
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
