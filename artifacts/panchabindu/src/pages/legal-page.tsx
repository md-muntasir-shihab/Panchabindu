import { Link } from 'wouter';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import type { CategoryRecord, PublicSafeSiteSettingsDTO } from '@/lib/db/repository';
import { StorefrontShell } from '@/components/storefront/storefront-shell';
import { Card } from '@/components/ui/primitives';

interface LegalPageProps {
  siteSettings: PublicSafeSiteSettingsDTO;
  categories: CategoryRecord[];
  page: { titleBn: string; titleEn: string; contentBn: string; contentEn: string };
}

export default function LegalPage({ siteSettings, categories, page }: LegalPageProps) {
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
