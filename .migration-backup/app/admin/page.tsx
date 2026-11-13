import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/admin/page.tsx
// Multi-Vendor Consignment Admin ERP Entry Page (Phase 4A)

import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { AdminErpClient } from '@/src/components/admin/admin-erp-client';

export const dynamic = 'force-dynamic';
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminErpPage() {
  const { siteSettings } = await withRuntimePersistence(() => getPublicStorefrontData());

  return <AdminErpClient siteSettings={siteSettings} />;
}
