import { create } from 'zustand';
import type { OrderRecord, Product, Tab } from '../components/catalog/kit';
import { loadJSON, removeSaved, saveJSON } from './appStorage';
import { forgetRecentlyViewed, useRecentlyViewedStore } from './recentlyViewed';

type SessionState = {
  tab: Tab;
  /** The product overlay (PDP); null = closed. */
  selected: Product | null;
  orders: OrderRecord[];
  setTab: (tab: Tab) => void;
  openProduct: (product: Product) => void;
  closeProduct: () => void;
  addOrder: (order: OrderRecord) => void;
  /** Clears everything user-owned (privacy delete); tab/overlay reset too. */
  resetUserData: () => void;
};

const initial = { tab: 'home' as Tab, selected: null as Product | null, orders: [] as OrderRecord[] };

// Only order history is user data worth surviving a reload; tab/overlay are
// ephemeral navigation and intentionally start fresh every visit.
const SESSION_STORAGE_KEY = 'rf-session-v1';

export const useSessionStore = create<SessionState>()((set) => ({
      ...initial,
      setTab: (tab) => set({ tab }),
      openProduct: (product) => {
        // Every open path (cards, quick view, rails) funnels through here, so
        // the view history is recorded at this single choke point. Size-variant
        // synthetic ids collapse to their base catalog entry.
        useRecentlyViewedStore.getState().record(product.id.split('::size=')[0]);
        set({ selected: product });
      },
      closeProduct: () => set({ selected: null }),
      addOrder: (order) => set((state) => ({ orders: [order, ...state.orders] })),
      resetUserData: () => {
        forgetRecentlyViewed();
        set(initial);
        removeSaved(SESSION_STORAGE_KEY);
      },
    }));

// Hydrate orders once at module load, then persist them on every change
// (by hand — see appStorage.ts for why not zustand/persist).
const restoredSession = loadJSON<{ orders?: OrderRecord[] }>(SESSION_STORAGE_KEY);
if (restoredSession) {
  useSessionStore.setState({ orders: restoredSession.orders ?? [] });
}
useSessionStore.subscribe((state) => {
  saveJSON(SESSION_STORAGE_KEY, { orders: state.orders });
});
