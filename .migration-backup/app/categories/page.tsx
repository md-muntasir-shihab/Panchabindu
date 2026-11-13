import { getStoreMetadata } from '@/src/lib/storefront/store-metadata';
import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { CategoriesClient } from '@/src/components/storefront/categories-client';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return getStoreMetadata('ক্যাটাগরি'); }
export default async function CategoriesPage() {
  const data = await withRuntimePersistence(() => getPublicStorefrontData());
  return <CategoriesClient {...data} />;
}
