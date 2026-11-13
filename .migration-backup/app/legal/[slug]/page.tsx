import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/legal/[slug]/page.tsx
// Dedicated Admin-Editable Legal & Policy Pages (About, Privacy, Return Policy, Terms)

import { notFound } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { StorefrontShell } from '@/src/components/storefront/storefront-shell';
import { Card } from '@/src/components/ui/primitives';

export const dynamic = 'force-dynamic';

interface LegalPageProps {
  params: Promise<{ slug: string }>;
}

export default async function LegalPage({ params }: LegalPageProps) {
  const { slug } = await params;
  const { siteSettings, categories } = await withRuntimePersistence(() => getPublicStorefrontData());
  const page = siteSettings.legalPages[slug];

  if (!page) {
    notFound();
  }

  return (
    <StorefrontShell siteSettings={siteSettings} categories={categories}>
      <div className="max-w-4xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="space-y-1">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs text-muted hover:text-ink"
            >
              <ArrowLeft className="w-3.5 h-3.5" aria-hidden="true" />
              <span>হোমপেজে ফিরে যান / Back to Home</span>
            </Link>
            <h1 className="text-xl sm:text-2xl font-bold text-ink">
              {page.titleBn} — {page.titleEn}
            </h1>
          </div>
          <ShieldCheck className="w-6 h-6 text-ink" aria-hidden="true" />
        </div>

        <Card surface="surface" padding="lg" className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-base font-bold text-ink">{page.titleBn}</h2>
            <p className="text-sm text-ink leading-relaxed whitespace-pre-line">
              {page.contentBn}
            </p>
          </div>

          <div className="border-t border-border pt-4 space-y-2">
            <h2 className="text-base font-bold text-ink">{page.titleEn}</h2>
            <p className="text-sm text-muted leading-relaxed whitespace-pre-line">
              {page.contentEn}
            </p>
          </div>
        </Card>
      </div>
    </StorefrontShell>
  );
}
