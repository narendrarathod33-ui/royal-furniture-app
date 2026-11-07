import { useCallback } from 'react';
import { create } from 'zustand';
import type { Product } from '../components/catalog/kit';
import { fabricCartLineId, type FabricSelection } from '../app/data/fabrics';
import { loadJSON, removeSaved, saveJSON } from './appStorage';
import { showToast } from '../components/catalog/Toast';
import { t } from '../app/i18n';

/** The server sandbox rejects carts above this; the cap is enforced here, in one place. */
export const MAX_QUANTITY = 10;

export type CartItem = { product: Product; quantity: number; /** Missing only on pre-fabric persisted carts. */ lineId?: string };
type SavedFabrics = Record<string, FabricSelection>;

type CartState = {
  cart: CartItem[];
  saved: string[];
  /** Wishlist product id -> chosen fabric snapshot (kept separate for v1 compatibility). */
  savedFabrics: SavedFabrics;
  addToCart: (product: Product) => void;
  increase: (lineId: string) => void;
  decrease: (lineId: string) => void;
  remove: (lineId: string) => void;
  clearCart: () => void;
  toggleSaved: (productId: string, fabric?: FabricSelection) => void;
  /** Clears everything user-owned (privacy delete). */
  resetUserData: () => void;
};

const initial = { cart: [] as CartItem[], saved: [] as string[], savedFabrics: {} as SavedFabrics };
export const cartLineId = (item: Pick<CartItem, 'product' | 'lineId'>) => item.lineId || fabricCartLineId(item.product);

export const useCartStore = create<CartState>()((set, get) => ({
      ...initial,
      addToCart: (product) =>
        set((state) => {
          const lineId = fabricCartLineId(product);
          const existing = state.cart.find((item) => cartLineId(item) === lineId);
          if (existing) {
            return {
              cart: state.cart.map((item) =>
                cartLineId(item) === lineId ? { ...item, lineId, quantity: Math.min(MAX_QUANTITY, item.quantity + 1) } : item
              ),
            };
          }
          return { cart: [...state.cart, { product, quantity: 1, lineId }] };
        }),
      increase: (lineId) =>
        set((state) => ({
          cart: state.cart.map((item) =>
            cartLineId(item) === lineId ? { ...item, quantity: Math.min(MAX_QUANTITY, item.quantity + 1) } : item
          ),
        })),
      decrease: (lineId) =>
        set((state) => ({
          cart: state.cart.map((item) =>
            cartLineId(item) === lineId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item
          ),
        })),
      remove: (lineId) => set((state) => ({ cart: state.cart.filter((item) => cartLineId(item) !== lineId) })),
      clearCart: () => set({ cart: [] }),
      toggleSaved: (productId, fabric) =>
        set((state) => {
          if (state.saved.includes(productId)) {
            const savedFabrics = { ...state.savedFabrics };
            delete savedFabrics[productId];
            return { saved: state.saved.filter((id) => id !== productId), savedFabrics };
          }
          return {
            saved: [...state.saved, productId],
            savedFabrics: fabric ? { ...state.savedFabrics, [productId]: { ...fabric } } : state.savedFabrics,
          };
        }),
      resetUserData: () => {
        set(initial);
        removeSaved(CART_STORAGE_KEY);
      },
    }));

// Persistence, wired by hand (see appStorage.ts for why not zustand/persist):
// hydrate once at module load, then save the user-owned slices on every change.
const CART_STORAGE_KEY = 'rf-cart-v1';

const restoredCart = loadJSON<{ cart?: CartItem[]; saved?: string[]; savedFabrics?: SavedFabrics }>(CART_STORAGE_KEY);
if (restoredCart) {
  useCartStore.setState({
    cart: (restoredCart.cart ?? []).map((item) => ({ ...item, lineId: cartLineId(item) })),
    saved: restoredCart.saved ?? [],
    savedFabrics: restoredCart.savedFabrics ?? {},
  });
}
useCartStore.subscribe((state) => {
  saveJSON(CART_STORAGE_KEY, { cart: state.cart, saved: state.saved, savedFabrics: state.savedFabrics });
});

/** Stable saved-toggle that also announces the change (shared by the session
 * component and the cart's saved rail so the wording can never drift). */
export function useToggleSavedWithToast() {
  return useCallback((product: Product, fabric?: FabricSelection) => {
    const wasSaved = useCartStore.getState().saved.includes(product.id);
    useCartStore.getState().toggleSaved(product.id, fabric || product.selectedFabric);
    showToast(wasSaved ? t('toast.unsaved') : t('toast.saved'));
  }, []);
}
