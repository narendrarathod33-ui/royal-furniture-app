import { useCallback } from 'react';
import { create } from 'zustand';
import type { Product } from '../components/catalog/kit';
import { loadJSON, removeSaved, saveJSON } from './appStorage';
import { showToast } from '../components/catalog/Toast';

/** The server sandbox rejects carts above this; the cap is enforced here, in one place. */
export const MAX_QUANTITY = 10;

export type CartItem = { product: Product; quantity: number };

type CartState = {
  cart: CartItem[];
  saved: string[];
  addToCart: (product: Product) => void;
  increase: (productId: string) => void;
  decrease: (productId: string) => void;
  remove: (productId: string) => void;
  clearCart: () => void;
  toggleSaved: (productId: string) => void;
  /** Clears everything user-owned (privacy delete). */
  resetUserData: () => void;
};

const initial = { cart: [] as CartItem[], saved: [] as string[] };

export const useCartStore = create<CartState>()((set, get) => ({
      ...initial,
      addToCart: (product) =>
        set((state) => {
          const existing = state.cart.find((item) => item.product.id === product.id);
          if (existing) {
            return {
              cart: state.cart.map((item) =>
                item.product.id === product.id ? { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + 1) } : item
              ),
            };
          }
          return { cart: [...state.cart, { product, quantity: 1 }] };
        }),
      increase: (productId) =>
        set((state) => ({
          cart: state.cart.map((item) =>
            item.product.id === productId ? { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + 1) } : item
          ),
        })),
      decrease: (productId) =>
        set((state) => ({
          cart: state.cart.map((item) =>
            item.product.id === productId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item
          ),
        })),
      remove: (productId) => set((state) => ({ cart: state.cart.filter((item) => item.product.id !== productId) })),
      clearCart: () => set({ cart: [] }),
      toggleSaved: (productId) =>
        set((state) => ({
          saved: state.saved.includes(productId) ? state.saved.filter((id) => id !== productId) : [...state.saved, productId],
        })),
      resetUserData: () => {
        set(initial);
        removeSaved(CART_STORAGE_KEY);
      },
    }));

// Persistence, wired by hand (see appStorage.ts for why not zustand/persist):
// hydrate once at module load, then save the user-owned slices on every change.
const CART_STORAGE_KEY = 'rf-cart-v1';

const restoredCart = loadJSON<{ cart?: CartItem[]; saved?: string[] }>(CART_STORAGE_KEY);
if (restoredCart) {
  useCartStore.setState({ cart: restoredCart.cart ?? [], saved: restoredCart.saved ?? [] });
}
useCartStore.subscribe((state) => {
  saveJSON(CART_STORAGE_KEY, { cart: state.cart, saved: state.saved });
});

/** Stable saved-toggle that also announces the change (shared by the session
 * component and the cart's saved rail so the wording can never drift). */
export function useToggleSavedWithToast() {
  return useCallback((product: Product) => {
    const wasSaved = useCartStore.getState().saved.includes(product.id);
    useCartStore.getState().toggleSaved(product.id);
    showToast(wasSaved ? 'Removed from saved items' : 'Saved for later');
  }, []);
}
