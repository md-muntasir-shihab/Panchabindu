import type { CourierProvider } from '@/types/database.types';

/**
 * Client-safe Live Courier Tracking URL Generator.
 * Rule A2 #4: Valid official tracking URLs only for Bangladeshi couriers.
 */
export function getLiveCourierTrackingUrl(
  provider: CourierProvider,
  trackingCode?: string | null,
  consignmentId?: string | null,
  orderNo?: string
): string {
  const code = (trackingCode ?? '').trim();
  const cns = (consignmentId ?? '').trim();
  if (provider === 'steadfast' && code) {
    return `https://steadfast.com.bd/t/${encodeURIComponent(code)}`;
  }
  if (provider === 'pathao' && (cns || code)) {
    return `https://pathao.com/courier/tracking/?consignment_id=${encodeURIComponent(cns || code)}`;
  }
  if (provider === 'redx' && code) {
    return `https://redx.com.bd/track?trackingId=${encodeURIComponent(code)}`;
  }
  if (provider === 'bd_post' && code) {
    return `https://bdpost.gov.bd/tracking/${encodeURIComponent(code)}`;
  }
  return orderNo
    ? `https://bongoconsign.bd/order-tracking/${encodeURIComponent(orderNo)}`
    : 'https://bongoconsign.bd/order-tracking';
}
