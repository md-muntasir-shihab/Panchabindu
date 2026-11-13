'use client';

import { useLocaleStoreBase } from '@/src/store/use-locale-store';
import { localizeMessages } from './ui-text';

export async function localizedFetch(input: RequestInfo | URL, init?: RequestInit, area: 'admin' | 'storefront' = 'storefront'): Promise<Response> {
  const locale = area === 'admin' ? useLocaleStoreBase.getState().adminLocale : useLocaleStoreBase.getState().locale;
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  headers.set('Accept-Language', locale === 'bn' ? 'bn-BD' : 'en-BD');
  const response = await globalThis.fetch(input, { ...init, headers });
  const originalJson = response.json.bind(response);
  response.json = async () => localizeMessages(await originalJson(), locale);
  return response;
}
