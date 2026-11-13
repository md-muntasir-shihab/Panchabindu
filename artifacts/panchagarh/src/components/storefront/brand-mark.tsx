'use client';

import { useLocaleStore } from '@/store/use-locale-store';
import { getStorefrontConfig } from '@/lib/storefront/storefront-config';
import type { PublicSafeSiteSettingsDTO } from '@/lib/db/repository';

export function BrandMark({ settings, compact = false }: { settings: PublicSafeSiteSettingsDTO; compact?: boolean }) {
  const locale = useLocaleStore(s => s.locale);
  const config = getStorefrontConfig(settings);
  const name = locale === 'bn' ? settings.brandNameBn : settings.brandNameEn;
  const tagline = locale === 'bn' ? settings.taglineBn : settings.taglineEn;
  return <span className="inline-flex items-center gap-3 min-w-0">{config.logoUrl ? <img  src={config.logoUrl} alt={name} width={config.logoWidth} height={48} className="max-h-12 max-w-[40px] sm:max-w-[160px] shrink-0 object-contain" style={{ width: config.logoWidth, height: 'auto' }} loading="lazy" decoding="async" /> : <span aria-hidden="true" className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-current text-xl font-semibold text-[var(--store-accent)]">{Array.from(name)[0]}</span>}{config.showBrandName && <span className="flex min-w-0 flex-col"><span className={`${compact ? 'text-lg' : 'text-lg sm:text-xl'} font-semibold leading-tight tracking-tight text-[#162119] max-w-[100px] sm:max-w-[200px] truncate`}>{name}</span>{config.showTagline && <span className="mt-1 max-w-48 text-[10px] leading-snug text-[#5A655D]">{tagline}</span>}</span>}</span>;
}
