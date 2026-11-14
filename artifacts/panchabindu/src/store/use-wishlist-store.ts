'use client';

// src/store/use-wishlist-store.ts
// Hydration-Safe Persisted Wishlist Store using React 18/19 useSyncExternalStore

import * as React from 'react';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface WishlistState {
  productIds: string[];
  toggleWishlist: (productId: string) => boolean;
  isWishlisted: (productId: string) => boolean;
  clearWishlist: () => void;
}

export const useWishlistStoreBase = create<WishlistState>()(
  persist(
    (set, get) => ({
      productIds: [],

      toggleWishlist: (productId) => {
        const current = get().productIds;
        const exists = current.includes(productId);
        if (exists) {
          set({ productIds: current.filter((id) => id !== productId) });
          return false;
        } else {
          set({ productIds: [...current, productId] });
          return true;
        }
      },

      isWishlisted: (productId) => get().productIds.includes(productId),

      clearWishlist: () => set({ productIds: [] }),
    }),
    {
      name: 'bongoconsign-wishlist-v1',
    }
  )
);

const serverWishlistState: WishlistState = {
  productIds: [],
  toggleWishlist: (id) => useWishlistStoreBase.getState().toggleWishlist(id),
  isWishlisted: () => false,
  clearWishlist: () => useWishlistStoreBase.getState().clearWishlist(),
};

export function useWishlistStore<T>(selector: (state: WishlistState) => T): T {
  return React.useSyncExternalStore(
    useWishlistStoreBase.subscribe,
    () => selector(useWishlistStoreBase.getState()),
    () => selector(serverWishlistState)
  );
}
