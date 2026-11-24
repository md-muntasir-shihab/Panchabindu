'use client';

import { useLocaleStore } from '@/store/use-locale-store';
import { getStorefrontConfig } from '@/lib/storefront/storefront-config';
import type { PublicSafeSiteSettingsDTO } from '@/lib/db/repository';

export function BrandMark({ settings, compact = false }: { settings: PublicSafeSiteSettingsDTO; compact?: boolean }) {
  const locale = useLocaleStore(s => s.locale);
  const config = getStorefrontConfig(settings);
  const name = locale === 'bn' ? settings.brandNameBn : settings.brandNameEn;
  const tagline = locale === 'bn' ? settings.taglineBn : settings.taglineEn;
  const emblemSize = compact ? 'h-9 w-9' : 'h-9 w-9 sm:h-10 sm:w-10';
  return (
    <span className="inline-flex items-center gap-2.5 sm:gap-3 min-w-0">
      {config.logoUrl ? (
        <img
          src={config.logoUrl}
          alt={name}
          width={config.logoWidth}
          height={48}
          className="max-h-12 max-w-[120px] sm:max-w-[200px] shrink-0 rounded-lg object-contain"
          style={{ width: config.logoWidth, height: 'auto' }}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <span
          aria-hidden="true"
          className={`inline-flex ${emblemSize} shrink-0 items-center justify-center rounded-xl bg-[var(--store-accent,#1B4332)] text-bg shadow-[0_2px_8px_rgba(27,67,50,0.14)]`}
        >
          <svg
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-6 h-6 sm:w-7 sm:h-7"
          >
            {/* Subtle botanical diamond connecting the 4 cardinal points */}
            <rect
              x="12.5"
              y="12.5"
              width="15"
              height="15"
              rx="1.5"
              transform="rotate(45 20 20)"
              stroke="currentColor"
              strokeOpacity="0.34"
              strokeWidth="1.2"
            />
            {/* Panchabindu — Five balanced points (4 cardinal + 1 center focal dot) */}
            <circle cx="20" cy="9.4" r="2.35" fill="currentColor" />
            <circle cx="30.6" cy="20" r="2.35" fill="currentColor" />
            <circle cx="20" cy="30.6" r="2.35" fill="currentColor" />
            <circle cx="9.4" cy="20" r="2.35" fill="currentColor" />
            <circle cx="20" cy="20" r="3.4" fill="#E8A98A" />
          </svg>
        </span>
      )}
      {config.showBrandName && (
        <span className="flex min-w-0 flex-col">
          <span
            className={`font-display ${
              compact ? 'text-2xl' : 'text-2xl sm:text-[1.9rem]'
            } font-bold leading-none tracking-tight text-ink whitespace-nowrap truncate`}
          >
            {name}
          </span>
          {config.showTagline && (
            <span className="mt-1 max-w-48 font-mono text-[10px] uppercase tracking-[0.08em] leading-snug text-ink/60">
              {tagline}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
