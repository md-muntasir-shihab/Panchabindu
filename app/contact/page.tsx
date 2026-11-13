import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/contact/page.tsx
// Dedicated Contact & About Section Page (আমাদের পরিচিতি ও যোগাযোগ)
// Features:
//   - Editorial Company Story & Consignment Provenance
//   - 100% QC Warehouse Verification & 64-District Courier Coverage
//   - Interactive Customer Inquiry / Feedback Form
//   - Direct Phone, WhatsApp & Office Details
//   - Fully bilingual (বাংলা / English) & mobile optimized

import type { Metadata } from 'next';
import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { ContactClient } from '@/src/components/storefront/contact-client';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'যোগাযোগ ও পরিচিতি (About & Contact) | পঞ্চগড় PANCHAGARH',
  description:
    'পঞ্চগড় (PANCHAGARH) মাল্টি-ভেন্ডর কনসাইনমেন্ট কমার্স প্ল্যাটফর্মের পরিচিতি, সেবা এবং সরাসরি কাস্টমার সাপোর্ট যোগাযোগ।',
};

export default async function ContactPage() {
  const { siteSettings, categories } = await withRuntimePersistence(() => getPublicStorefrontData());

  return (
    <ContactClient
      siteSettings={siteSettings}
      categories={categories}
    />
  );
}
