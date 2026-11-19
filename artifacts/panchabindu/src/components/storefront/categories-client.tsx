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
    <StorefrontShell siteSettings={siteSettings} categories={categories} products={products}>
      <div className="max-w-7xl mx-auto px-3.5 sm:px-4 py-5 sm:py-12 space-y-6 sm:space-y-10">
        <div className="border-b border-[#E4E2DC] pb-4 sm:pb-5">
          <p className="text-[11px] sm:text-xs font-semibold text-[var(--store-accent)] uppercase tracking-wider">
            {locale === 'bn' ? 'ক্যাটাগরি ডিরেক্টরি' : 'Category directory'}
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold text-[#162119] tracking-tight mt-1 [text-wrap:balance]">
            {locale === 'bn' ? 'আপনার পছন্দের ক্যাটাগরি' : 'Find your everyday favourites'}
          </h1>
          <p className="text-xs sm:text-sm text-[#5A655D] mt-1 max-w-xl">
            {locale === 'bn' ? config.collectionSubtitleBn : config.collectionSubtitleEn}
          </p>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
          {categories.map((cat) => {
            const count = products.filter((p) => p.categoryId === cat.id).length;
            return (
              <Link
                key={cat.id}
                href={`/category/${cat.slug}`}
                className="group p-3.5 sm:p-6 rounded-xl sm:rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] hover:border-[var(--store-accent)] hover:bg-white transition-all flex flex-col justify-between gap-3 min-w-0"
              >
                <div className="space-y-2.5 sm:space-y-3 min-w-0">
                  <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-[#E8F0EC] text-[var(--store-accent)] flex items-center justify-center font-bold">
                    <Grid className="w-4 h-4 sm:w-5 sm:h-5" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="text-sm sm:text-lg font-bold text-[#162119] group-hover:text-[var(--store-accent)] transition-colors leading-snug line-clamp-2">
                      {locale === 'bn' ? cat.nameBn : cat.nameEn}
                    </h2>
                    <p className="text-[11px] sm:text-xs text-[#5A655D] mt-1 line-clamp-2 leading-relaxed">
                      {locale === 'bn' ? cat.descriptionBn : cat.descriptionEn}
                    </p>
                  </div>
                </div>

                <div className="pt-3 sm:pt-4 border-t border-[#E4E2DC]/70 flex items-center justify-between gap-1 text-[11px] sm:text-xs font-semibold text-[#162119]">
                  <span className="text-[#5A655D] truncate">{formatLocaleNumber(count, locale)}{locale === 'bn' ? 'টি পণ্য' : ' items'}</span>
                  <span className="inline-flex items-center gap-0.5 sm:gap-1 text-[var(--store-accent)] group-hover:translate-x-0.5 transition-transform shrink-0">
                    <span className="hidden sm:inline">{locale === 'bn' ? 'ব্রাউজ করুন' : 'Explore'}</span>
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
