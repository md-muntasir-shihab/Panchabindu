'use client';

import { Link } from 'wouter';
import { ArrowRight, Grid } from 'lucide-react';
import { useLocaleStore } from '@/store/use-locale-store';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import type { CategoryRecord, PublicSafeSiteSettingsDTO } from '@/lib/db/repository';
import type { StorefrontProductDTO } from '@/types/domain';
import { getStorefrontConfig } from '@/lib/storefront/storefront-config';
import { StorefrontShell } from './storefront-shell';

export function CategoriesClient({ siteSettings, categories, products }: { siteSettings: PublicSafeSiteSettingsDTO; categories: CategoryRecord[]; products: StorefrontProductDTO[] }) {
  const locale = useLocaleStore(s => s.locale);
  const config = getStorefrontConfig(siteSettings);
  return (
    <StorefrontShell siteSettings={siteSettings} categories={categories}>
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12 space-y-10">
        <div className="border-b border-[#E4E2DC] pb-5">
          <p className="text-xs font-semibold text-[var(--store-accent)] uppercase tracking-wider">
            {locale === 'bn' ? 'ক্যাটাগরি ডিরেক্টরি' : 'Category directory'}
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold text-[#162119] tracking-tight mt-1">
            {locale === 'bn' ? 'আপনার পছন্দের ক্যাটাগরি' : 'Find your everyday favourites'}
          </h1>
          <p className="text-xs sm:text-sm text-[#5A655D] mt-1 max-w-xl">
            {locale === 'bn' ? config.collectionSubtitleBn : config.collectionSubtitleEn}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((cat) => {
            const count = products.filter((p) => p.categoryId === cat.id).length;
            return (
              <Link
                key={cat.id}
                href={`/category/${cat.slug}`}
                className="group p-6 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] hover:border-[var(--store-accent)] hover:bg-white transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#E8F0EC] text-[var(--store-accent)] flex items-center justify-center font-bold">
                    <Grid className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#162119] group-hover:text-[var(--store-accent)] transition-colors">
                      {locale === 'bn' ? cat.nameBn : cat.nameEn}
                    </h2>
                    <p className="text-xs text-[#5A655D] mt-1 line-clamp-2 leading-relaxed">
                      {locale === 'bn' ? cat.descriptionBn : cat.descriptionEn}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E4E2DC]/70 flex items-center justify-between text-xs font-semibold text-[#162119]">
                  <span className="text-[#5A655D]">{formatLocaleNumber(count, locale)}{locale === 'bn' ? 'টি পণ্য' : ' products'}</span>
                  <span className="inline-flex items-center gap-1 text-[var(--store-accent)] group-hover:translate-x-0.5 transition-transform">
                    <span>{locale === 'bn' ? 'ব্রাউজ করুন' : 'Explore'}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </StorefrontShell>
  );
}
