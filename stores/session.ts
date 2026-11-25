import { create } from 'zustand';
import type { OrderRecord, Product, Tab } from '../components/catalog/kit';
import { loadJSON, removeSaved, saveJSON } from './appStorage';
import { forgetRecentlyViewed, useRecentlyViewedStore } from './recentlyViewed';
import { clearScrollMemory } from '../utils/scrollMemory';

type SessionState = {
  tab: Tab;
  /** Stack of previously visited tabs for back navigation. */
  tabHistory: Tab[];
  /** The product overlay (PDP); null = closed. */
  selected: Product | null;
  /** Stack of previously opened products (e.g. related picks inside PDP). */
  productStack: Product[];
  orders: OrderRecord[];
  setTab: (tab: Tab) => void;
  openProduct: (product: Product) => void;
  closeProduct: () => void;
  /** Steps back one level (PDP stack -> list, or sub-tab -> previous tab). Returns true if handled. */
  goBack: () => boolean;
  addOrder: (order: OrderRecord) => void;
  /** Merges seller-side updates (status/delivery date from the Orders sheet) into a saved order. */
  updateOrderRemote: (id: string, patch: { status?: string; deliveryDate?: string }) => void;
  /** Clears everything user-owned (privacy delete); tab/overlay reset too. */
  resetUserData: () => void;
};

const initial = {
  tab: 'home' as Tab,
  tabHistory: [] as Tab[],
  selected: null as Product | null,
  productStack: [] as Product[],
  orders: [] as OrderRecord[],
};

// Only order history is user data worth surviving a reload; tab/overlay are
// ephemeral navigation and intentionally start fresh every visit.
const SESSION_STORAGE_KEY = 'rf-session-v1';

export const useSessionStore = create<SessionState>()((set, get) => ({
      ...initial,
      setTab: (tab) => set((state) => {
        if (tab === 'home') return { tab: 'home', tabHistory: [] };
        if (tab === state.tab) return state;
        return { tab, tabHistory: [...state.tabHistory.slice(-11), state.tab] };
      }),
      openProduct: (product) => {
        // Every open path (cards, quick view, rails) funnels through here, so
        // the view history is recorded at this single choke point. Size-variant
        // synthetic ids collapse to their base catalog entry.
        useRecentlyViewedStore.getState().record(product.id.split(/::(?:size|color)=/)[0]);
        set((state) => {
          if (state.selected && state.selected.id !== product.id) {
            return { selected: product, productStack: [...state.productStack.slice(-11), state.selected] };
          }
          return { selected: product };
        });
      },
      closeProduct: () => set({ selected: null, productStack: [] }),
      goBack: () => {
        const state = get();
        if (state.selected) {
          if (state.productStack.length > 0) {
            const next = state.productStack[state.productStack.length - 1];
            set({ selected: next, productStack: state.productStack.slice(0, -1) });
          } else {
            set({ selected: null });
          }
          return true;
        }
        if (state.tabHistory.length > 0) {
          const prevTab = state.tabHistory[state.tabHistory.length - 1];
          set({ tab: prevTab, tabHistory: state.tabHistory.slice(0, -1) });
          return true;
        }
        if (state.tab !== 'home') {
          set({ tab: 'home' });
          return true;
        }
        return false;
      },
      addOrder: (order) => set((state) => ({ orders: [order, ...state.orders] })),
      updateOrderRemote: (id, patch) => set((state) => {
        let changed = false;
        const orders = state.orders.map((order) => {
          if (order.id !== id) return order;
          const status = patch.status?.trim() ? patch.status : order.status;
          const deliveryDate = patch.deliveryDate?.trim() ? patch.deliveryDate : order.deliveryDate;
          if (status === order.status && deliveryDate === order.deliveryDate) return order;
          changed = true;
          return { ...order, status, deliveryDate };
        });
        return changed ? { orders } : state;
      }),
      resetUserData: () => {
        forgetRecentlyViewed();
        clearScrollMemory();
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
