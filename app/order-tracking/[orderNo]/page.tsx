// app/order-tracking/[orderNo]/page.tsx
// Server Component for Live Order Confirmation & Tracking (Phase 1 Hardened)
// Enforces:
//   - Public lookup requires non-guessable secureTrackingToken (trk_...)
//   - Sequential ORD-... lookup is allowed ONLY if the requester has a verified Customer Session cookie for that order's phone

import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import {
  getAuthenticatedCustomerOrders,
  getPublicOrderTrackingByToken,
  getPublicStorefrontData,
  type PublicOrderTrackingDTO,
} from '@/src/lib/db/repository';
import {
  CUSTOMER_SESSION_COOKIE_NAME,
  verifyCustomerSessionToken,
} from '@/src/lib/security/crypto-session';
import { OrderTrackingClient } from '@/src/components/storefront/order-tracking-client';

export const dynamic = 'force-dynamic';

interface OrderTrackingPageProps {
  params: Promise<{ orderNo: string }>;
}

export function generateMetadata(): Metadata {
  return {
    title: 'অর্ডার ট্র্যাকিং | পঞ্চগড়',
    robots: { index: false, follow: false },
    description: 'আপনার অর্ডারের বর্তমান অবস্থান এবং ডেলিভারি স্ট্যাটাস দেখুন।',
  };
}

export default async function OrderTrackingPage({
  params,
}: OrderTrackingPageProps) {
  const { orderNo } = await params;
  const decodedRef = decodeURIComponent(orderNo).trim();
  const { siteSettings, categories } = getPublicStorefrontData();

  let order: PublicOrderTrackingDTO | null = null;
  let errorBn: string | null = null;

  const tokenResult = getPublicOrderTrackingByToken(decodedRef);
  if (tokenResult.allowed && tokenResult.order) {
    order = tokenResult.order;
  } else if (tokenResult.code === 'SEQUENTIAL_ORDER_NO_FORBIDDEN') {
    // Allow if the customer has a verified session cookie and owns this orderNo
    const cookieStore = await cookies();
    const sessionToken = cookieStore.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
    const customerSession = verifyCustomerSessionToken(sessionToken);
    if (customerSession) {
      const ownedOrders = getAuthenticatedCustomerOrders(sessionToken);
      const matched = ownedOrders.find(
        (o) => o.orderNo.toUpperCase() === decodedRef.toUpperCase()
      );
      if (matched) {
        order = matched;
      } else {
        errorBn = tokenResult.errorBn ?? null;
      }
    } else {
      errorBn = tokenResult.errorBn ?? null;
    }
  } else {
    errorBn = tokenResult.errorBn ?? null;
  }

  return (
    <OrderTrackingClient
      siteSettings={siteSettings}
      categories={categories}
      initialOrderNo={decodedRef}
      order={order}
      trackingErrorBn={errorBn}
    />
  );
}
