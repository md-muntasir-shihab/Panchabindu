'use client';

// src/store/use-locale-store.ts
// Hydration-Safe Bilingual Toggle Store using React 18/19 useSyncExternalStore

import * as React from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DICTIONARIES, type Dictionary, type Locale } from '../lib/i18n/dictionaries';

interface LocaleState {
  locale: Locale;
  adminLocale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  setAdminLocale: (locale: Locale) => void;
  toggleAdminLocale: () => void;
  t: () => Dictionary;
}

export const useLocaleStoreBase = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: 'bn',
      adminLocale: 'en',
      setLocale: (locale) => set({ locale }),
      toggleLocale: () => set((state) => ({ locale: state.locale === 'bn' ? 'en' : 'bn' })),
      setAdminLocale: (adminLocale) => set({ adminLocale }),
      toggleAdminLocale: () =>
        set((state) => ({ adminLocale: state.adminLocale === 'bn' ? 'en' : 'bn' })),
      t: () => DICTIONARIES[get().locale],
    }),
    {
      name: 'bongoconsign-locale-v2',
    }
  )
);

const serverLocaleState: LocaleState = {
  locale: 'bn',
  adminLocale: 'en',
  setLocale: (loc) => useLocaleStoreBase.getState().setLocale(loc),
  toggleLocale: () => useLocaleStoreBase.getState().toggleLocale(),
  setAdminLocale: (loc) => useLocaleStoreBase.getState().setAdminLocale(loc),
  toggleAdminLocale: () => useLocaleStoreBase.getState().toggleAdminLocale(),
  t: () => DICTIONARIES['bn'],
};

export function useLocaleStore<T>(selector: (state: LocaleState) => T): T {
  return React.useSyncExternalStore(
    useLocaleStoreBase.subscribe,
    () => selector(useLocaleStoreBase.getState()),
    () => selector(serverLocaleState)
  );
}
