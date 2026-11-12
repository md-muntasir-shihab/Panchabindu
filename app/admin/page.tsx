// app/admin/page.tsx
// Multi-Vendor Consignment Admin ERP Entry Page (Phase 4A)

import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { AdminErpClient } from '@/src/components/admin/admin-erp-client';

export const dynamic = 'force-dynamic';

export default function AdminErpPage() {
  const { siteSettings } = getPublicStorefrontData();

  return <AdminErpClient siteSettings={siteSettings} />;
}
