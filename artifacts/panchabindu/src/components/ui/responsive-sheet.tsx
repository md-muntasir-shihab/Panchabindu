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
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export function ResponsiveSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
}: ResponsiveSheetProps) {
  const isMobile = useIsMobile();
  const descriptionId = React.useId();
  const locale = useLocaleStore((s) => s.locale);

  return (
    <Drawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction={isMobile ? 'bottom' : 'right'}
    >
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-ink/40" />
        <Drawer.Content
          aria-describedby={description ? descriptionId : undefined}
          className={
            isMobile
              ? 'fixed inset-x-0 bottom-0 z-50 mt-20 flex max-h-[calc(100dvh-max(1.25rem,var(--safe-top)))] flex-col rounded-t-[var(--radius-lg)] border-t border-border bg-bg text-ink focus:outline-none safe-bottom pl-[var(--safe-left)] pr-[var(--safe-right)]'
              : 'fixed inset-y-0 right-0 z-50 flex w-full max-w-[min(42rem,100vw)] min-w-0 flex-col border-l border-border bg-bg text-ink focus:outline-none pt-[var(--safe-top)] pb-[var(--safe-bottom)] pr-[var(--safe-right)]'
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
