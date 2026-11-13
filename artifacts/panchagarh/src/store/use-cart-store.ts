'use client';

// src/store/use-cart-store.ts
// Zustand Persisted Cart Store with Exact Integer Poisha Math, Undo Buffer,
// and Free-Delivery Threshold Progress Calculator.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { assertIntegerPoisha } from '../lib/money';
import type { Poisha } from '../types/domain';

export interface CartItem {
  productId: string;
  variantId: string;
  slug: string;
  nameBn: string;
  nameEn: string;
  variantTitleBn: string;
  variantTitleEn: string;
  publicSku: string;
  imageUrl: string | null;
  unitSalePricePoisha: Poisha;
  compareAtPricePoisha: Poisha | null;
  weightGrams: number;
  maxStockAvailable: number;
  isFreeDeliveryProduct: boolean;
  requiresAdvanceCourierCharge?: boolean;
  customAdvanceDepositPoisha?: Poisha;
  quantity: number;
}

export interface FreeDeliveryProgress {
  subtotalPoisha: Poisha;
  thresholdPoisha: Poisha;
  remainingForFreeDeliveryPoisha: Poisha;
  progressPercent: number;
  isQualifiedForFreeDelivery: boolean;
}

/**
 * Pure helper function for calculating cart subtotal & free delivery progress in exact integer Poisha.
 */
export function calculateCartFreeDeliveryProgress(
  items: readonly CartItem[],
  freeDeliveryThresholdPoisha: Poisha,
  globalFreeDelivery = false
): FreeDeliveryProgress {
  assertIntegerPoisha(freeDeliveryThresholdPoisha, 'freeDeliveryThresholdPoisha');

  const subtotalPoisha = items.reduce((sum, item) => {
    assertIntegerPoisha(item.unitSalePricePoisha, 'item.unitSalePricePoisha');
    return sum + item.unitSalePricePoisha * item.quantity;
  }, 0);

  const allItemsHaveProductFreeDelivery =
    items.length > 0 && items.every((i) => i.isFreeDeliveryProduct);

  if (globalFreeDelivery || allItemsHaveProductFreeDelivery || freeDeliveryThresholdPoisha === 0) {
    return {
      subtotalPoisha,
      thresholdPoisha: freeDeliveryThresholdPoisha,
      remainingForFreeDeliveryPoisha: 0,
      progressPercent: 100,
      isQualifiedForFreeDelivery: items.length > 0,
    };
  }

  const remaining = Math.max(0, freeDeliveryThresholdPoisha - subtotalPoisha);
  const rawPct = Math.floor((subtotalPoisha * 100) / freeDeliveryThresholdPoisha);
  const progressPercent = Math.max(0, Math.min(100, rawPct));

  return {
    subtotalPoisha,
    thresholdPoisha: freeDeliveryThresholdPoisha,
    remainingForFreeDeliveryPoisha: remaining,
    progressPercent,
    isQualifiedForFreeDelivery: subtotalPoisha >= freeDeliveryThresholdPoisha && items.length > 0,
  };
}

interface CartState {
  items: CartItem[];
  isDrawerOpen: boolean;
  lastRemovedItem: CartItem | null;
  setDrawerOpen: (open: boolean) => void;
  addItem: (item: Omit<CartItem, 'quantity'>, quantity?: number) => void;
  updateQuantity: (variantId: string, quantity: number) => void;
  removeItem: (variantId: string) => void;
  undoRemoveLastItem: () => void;
  clearCart: () => void;
  getTotalCount: () => number;
  getSubtotalPoisha: () => Poisha;
  getTotalWeightGrams: () => number;
}

export const useCartStoreBase = create<CartState>()(
  persist(
    (set, get) => ({
      items: [],
      isDrawerOpen: false,
      lastRemovedItem: null,

      setDrawerOpen: (open) => set({ isDrawerOpen: open }),

      addItem: (newItem, qty = 1) => {
        assertIntegerPoisha(newItem.unitSalePricePoisha, 'unitSalePricePoisha');
        const safeQty = Math.max(1, Math.floor(qty));

        set((state) => {
          const existingIndex = state.items.findIndex(
            (i) => i.variantId === newItem.variantId
          );

          if (existingIndex > -1) {
            const updated = [...state.items];
            const current = updated[existingIndex];
            const nextQty = Math.min(
              current.maxStockAvailable,
              current.quantity + safeQty
            );
            updated[existingIndex] = { ...current, quantity: nextQty };
            return { items: updated, isDrawerOpen: true };
          }

          const boundedQty = Math.min(newItem.maxStockAvailable, safeQty);
          if (boundedQty <= 0) return state;

          return {
            items: [...state.items, { ...newItem, quantity: boundedQty }],
            isDrawerOpen: true,
          };
        });
      },

      updateQuantity: (variantId, quantity) => {
        set((state) => {
          if (quantity <= 0) {
            const target = state.items.find((i) => i.variantId === variantId) ?? null;
            return {
              items: state.items.filter((i) => i.variantId !== variantId),
              lastRemovedItem: target,
            };
          }

          return {
            items: state.items.map((item) =>
              item.variantId === variantId
                ? {
                    ...item,
                    quantity: Math.min(item.maxStockAvailable, Math.floor(quantity)),
                  }
                : item
            ),
          };
        });
      },

      removeItem: (variantId) => {
        set((state) => {
          const target = state.items.find((i) => i.variantId === variantId) ?? null;
          return {
            items: state.items.filter((i) => i.variantId !== variantId),
            lastRemovedItem: target,
          };
        });
      },

      undoRemoveLastItem: () => {
        set((state) => {
          if (!state.lastRemovedItem) return state;
          const restored = state.lastRemovedItem;
          const exists = state.items.some((i) => i.variantId === restored.variantId);
          if (exists) {
            return { lastRemovedItem: null };
          }
          return {
            items: [...state.items, restored],
            lastRemovedItem: null,
          };
        });
      },

      clearCart: () => set({ items: [], lastRemovedItem: null }),

      getTotalCount: () =>
        get().items.reduce((sum, item) => sum + item.quantity, 0),

      getSubtotalPoisha: () =>
        get().items.reduce(
          (sum, item) => sum + item.unitSalePricePoisha * item.quantity,
          0
        ),

      getTotalWeightGrams: () =>
        get().items.reduce(
          (sum, item) => sum + item.weightGrams * item.quantity,
          0
        ),
    }),
    {
      name: 'bongoconsign-cart-v1',
      partialize: (state) => ({ items: state.items }),
    }
  )
);

import * as React from 'react';

const serverCartState: CartState = {
  items: [],
  isDrawerOpen: false,
  lastRemovedItem: null,
  setDrawerOpen: (open) => useCartStoreBase.getState().setDrawerOpen(open),
  addItem: (item, qty) => useCartStoreBase.getState().addItem(item, qty),
  updateQuantity: (vId, q) => useCartStoreBase.getState().updateQuantity(vId, q),
  removeItem: (vId) => useCartStoreBase.getState().removeItem(vId),
  undoRemoveLastItem: () => useCartStoreBase.getState().undoRemoveLastItem(),
  clearCart: () => useCartStoreBase.getState().clearCart(),
  getTotalCount: () => 0,
  getSubtotalPoisha: () => 0,
  getTotalWeightGrams: () => 0,
};

export function useCartStore<T>(selector: (state: CartState) => T): T {
  return React.useSyncExternalStore(
    useCartStoreBase.subscribe,
    () => selector(useCartStoreBase.getState()),
    () => selector(serverCartState)
  );
}
