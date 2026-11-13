'use client';

import { useLocaleStore } from '@/src/store/use-locale-store';
import { uiText } from '@/src/lib/i18n/ui-text';

export function LocalizedText({ source, area = 'storefront' }: { source: string; area?: 'admin' | 'storefront' }) {
  const locale = useLocaleStore(state => area === 'admin' ? state.adminLocale : state.locale);
  return uiText(source, locale);
}
