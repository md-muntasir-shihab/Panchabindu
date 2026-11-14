import type { OrderGridRowDTO } from '@/types/domain';

export type CourierOrder = Partial<OrderGridRowDTO> & {
  items?: Array<{ productNameBn?: string; productNameEn?: string; variantTitleBn?: string; variantTitleEn?: string; quantity?: number; publicSku?: string }>;
};
export type CourierStage = 'delivered' | 'transit' | 'excluded';
export function courierStage(status?: string): CourierStage {
  if (status === 'delivered') return 'delivered';
  if (status === 'shipped' || status === 'out_for_delivery') return 'transit';
  return 'excluded';
}
export function validPoisha(amount: unknown): amount is number {
  return typeof amount === 'number' && Number.isSafeInteger(amount) && amount >= 0;
}
/** A gross order COD projection, never a verified courier balance. Refuse unsafe totals. */
export function summarizeCourierOrders(orders: CourierOrder[], allOrders: CourierOrder[] = orders) {
  const duplicateNos = new Set<string>();
  const seen = new Set<string>();
  for (const order of allOrders) {
    const id = order.orderNo?.trim().toUpperCase();
    if (id && seen.has(id)) duplicateNos.add(id);
    if (id) seen.add(id);
  }
  const sum = (stage: CourierStage): number | null => {
    let result = 0;
    for (const order of orders.filter(o => courierStage(o.status) === stage)) {
      if (!order.orderNo?.trim() || duplicateNos.has(order.orderNo.trim().toUpperCase()) || !validPoisha(order.codCollectablePoisha)) return null;
      result += order.codCollectablePoisha;
      if (!Number.isSafeInteger(result)) return null;
    }
    return result;
  };
  return { delivered: sum('delivered'), transit: sum('transit'), deliveredCount: orders.filter(o => courierStage(o.status) === 'delivered').length, transitCount: orders.filter(o => courierStage(o.status) === 'transit').length };
}
