import { withRuntimePersistence } from '@/src/lib/db/runtime-persistence';
// app/categories/page.tsx
// Dedicated All Categories & Sub-Categories Directory Page
// Features:
//   - Full grid of categories and sub-categories
//   - Product counts and direct links
//   - Sorting & filter access

import type { Metadata } from 'next';
import Link from 'next/link';
import { getPublicStorefrontData } from '@/src/lib/db/repository';
import { StorefrontShell } from '@/src/components/storefront/storefront-shell';
import { formatLocaleNumber } from '@/src/lib/i18n/dictionaries';
import { ArrowRight, Grid, Package } from 'lucide-react';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'সকল ক্যাটাগরি (All Categories) | পঞ্চগড় PANCHAGARH',
  description:
    'পঞ্চগড় কনসাইনমেন্ট স্টোরের সকল পণ্য ক্যাটাগরি ও সাব-ক্যাটাগরি এক্সপ্লোর করুন।',
};

export default async function CategoriesPage() {
  const { siteSettings, categories, products } = await withRuntimePersistence(() => getPublicStorefrontData());

  return (
    <StorefrontShell siteSettings={siteSettings} categories={categories}>
      <div className="max-w-7xl mx-auto px-4 py-8 sm:py-12 space-y-10">
        <div className="border-b border-[#E4E2DC] pb-5">
          <p className="text-xs font-semibold text-[#1B4332] uppercase tracking-wider">
            ক্যাটাগরি ডিরেক্টরি
          </p>
          <h1 className="text-2xl sm:text-4xl font-bold text-[#162119] tracking-tight mt-1">
            পণ্য ক্যাটাগরি ও সাব-ক্যাটাগরি
          </h1>
          <p className="text-xs sm:text-sm text-[#5A655D] mt-1 max-w-xl">
            বাংলাদেশের ঐতিহ্যবাহী তাঁতশিল্প, মধু, লেদার ও হস্তশিল্প পণ্য সহজে খুঁজে পেতে নির্দিষ্ট ক্যাটাগরি ব্রাউজ করুন।
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {categories.map((cat) => {
            const count = products.filter((p) => p.categoryId === cat.id).length;
            return (
              <Link
                key={cat.id}
                href={`/category/${cat.slug}`}
                className="group p-6 rounded-2xl border border-[#E4E2DC] bg-[#F2EFE9] hover:border-[#1B4332] hover:bg-white transition-all flex flex-col justify-between"
              >
                <div className="space-y-3">
                  <div className="w-10 h-10 rounded-xl bg-[#E8F0EC] text-[#1B4332] flex items-center justify-center font-bold">
                    <Grid className="w-5 h-5" />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-[#162119] group-hover:text-[#1B4332] transition-colors">
                      {cat.nameBn}
                    </h2>
                    <p className="text-xs text-[#5A655D] mt-1 line-clamp-2 leading-relaxed">
                      {cat.descriptionBn}
                    </p>
                  </div>
                </div>

                <div className="pt-4 border-t border-[#E4E2DC]/70 flex items-center justify-between text-xs font-semibold text-[#162119]">
                  <span className="text-[#5A655D]">{formatLocaleNumber(count, 'bn')}টি পণ্য</span>
                  <span className="inline-flex items-center gap-1 text-[#1B4332] group-hover:translate-x-0.5 transition-transform">
                    <span>ব্রাউজ করুন</span>
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
