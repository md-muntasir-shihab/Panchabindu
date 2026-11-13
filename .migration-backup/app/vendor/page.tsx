import { VendorClient } from '@/src/components/vendor/vendor-client';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default function VendorPage() {
  return <VendorClient />;
}
