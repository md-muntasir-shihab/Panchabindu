'use client';

import { useLocaleStore } from '@/store/use-locale-store';
import { uiText } from '@/lib/i18n/ui-text';

export function LocalizedText({ source, area = 'storefront' }: { source: string; area?: 'admin' | 'storefront' }) {
  const locale = useLocaleStore(state => area === 'admin' ? state.adminLocale : state.locale);
  return uiText(source, locale);
}
