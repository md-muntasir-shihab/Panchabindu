'use client';

// src/components/ui/responsive-sheet.tsx
// Enforces Negative Rule #4: NO Desktop Modals on Mobile (< 768px).
// Uses Vaul Bottom Sheet on Mobile (< 768px) and a clean Right Slide-Over Drawer on Desktop (>= 768px).

import * as React from 'react';
import { Drawer } from 'vaul';
import { X } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Button } from './primitives';
import { useLocaleStore } from '@/store/use-locale-store';

export interface ResponsiveSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  size?: 'default' | 'wide';
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  size = 'default',
  children,
  footer,
}: ResponsiveSheetProps) {
  const isMobile = useIsMobile();
  const descriptionId = React.useId();
  const locale = useLocaleStore((s) => s.locale);
  const [bannerOffsetPx, setBannerOffsetPx] = React.useState(0);

  React.useEffect(() => {
    if (typeof window === 'undefined' || !open) return undefined;
    const measureBanner = () => {
      const banner = document.querySelector('body > [role="status"]') as HTMLElement | null;
      if (!banner) {
        setBannerOffsetPx(0);
        return;
      }
      const rect = banner.getBoundingClientRect();
      const visibleBottom = Math.max(0, Math.min(Math.ceil(rect.height), Math.ceil(rect.bottom)));
      setBannerOffsetPx(visibleBottom);
      document.documentElement.style.setProperty('--preview-banner-h', `${visibleBottom}px`);
    };
    measureBanner();
    window.addEventListener('resize', measureBanner);
    window.addEventListener('scroll', measureBanner, { passive: true });
    return () => {
      window.removeEventListener('resize', measureBanner);
      window.removeEventListener('scroll', measureBanner);
    };
  }, [open]);

  const desktopWidthClass =
    size === 'wide' ? 'max-w-[min(54rem,100vw)]' : 'max-w-[min(42rem,100vw)]';
  const sheetBannerStyle = {
    '--preview-banner-h': `${bannerOffsetPx}px`,
  } as React.CSSProperties;

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction={isMobile ? 'bottom' : 'right'}
    >
      <Drawer.Portal>
        <Drawer.Overlay
          style={sheetBannerStyle}
          className="fixed top-[var(--preview-banner-h,0px)] inset-x-0 bottom-0 z-[70] bg-ink/40"
        />
        <Drawer.Content
          style={sheetBannerStyle}
          aria-describedby={description ? descriptionId : undefined}
          className={
            isMobile
              ? 'fixed inset-x-0 bottom-0 z-[70] mt-4 flex max-h-[calc(100dvh-var(--preview-banner-h,0px)-max(1.25rem,var(--safe-top)))] flex-col rounded-t-[var(--radius-lg)] border-t border-border bg-bg text-ink focus:outline-none safe-bottom pl-[var(--safe-left)] pr-[var(--safe-right)]'
              : `fixed top-[var(--preview-banner-h,0px)] bottom-0 right-0 z-[70] flex w-full ${desktopWidthClass} min-w-0 flex-col border-l border-border bg-bg text-ink focus:outline-none pt-[var(--safe-top)] pb-[var(--safe-bottom)] pr-[var(--safe-right)]`
          }
        >
          {isMobile && (
            <div className="mx-auto mt-3 h-1.5 w-12 shrink-0 rounded-[var(--radius-sm)] bg-border" />
          )}

          <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3.5 sm:px-6">
            <div className="min-w-0">
              <Drawer.Title className="text-base font-semibold text-ink">
                {title}
              </Drawer.Title>
              {description && (
                <Drawer.Description id={descriptionId} className="text-xs text-muted mt-0.5">
                  {description}
                </Drawer.Description>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label={locale === 'bn' ? 'প্যানেল বন্ধ করুন' : 'Close panel'}
              className="touch-target shrink-0"
            >
              <X className="w-5 h-5" aria-hidden="true" />
            </Button>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">{children}</div>

          {footer && (
            <div className="border-t border-border bg-surface/50 p-4 sm:px-6">
              {footer}
            </div>
          )}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}
