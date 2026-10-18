import { create } from 'zustand';
import { loadJSON, removeSaved, saveJSON } from './appStorage';

/** Store cap: six most-recent pieces, matching the prototype's history. */
export const RECENT_LIMIT = 6;

/**
 * A view-history entry is just a catalog id. Anything else — objects, numbers,
 * oversized junk from an old or corrupt payload — is dropped, so bad saved
 * data can never blank or break the product page (same guard as the cart).
 */
export function sanitizeRecentIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item === 'string' && item.length > 0 && item.length <= 120) seen.add(item);
  }
  return [...seen].slice(0, RECENT_LIMIT);
}

type RecentlyViewedState = {
  ids: string[];
  record: (productId: string) => void;
  clear: () => void;
};

const RECENT_STORAGE_KEY = 'rf-recent-v1';

export const useRecentlyViewedStore = create<RecentlyViewedState>()((set) => ({
  ids: [],
  record: (productId) =>
    set((state) => {
      if (!productId || state.ids[0] === productId) return state;
      return { ids: [productId, ...state.ids.filter((id) => id !== productId)].slice(0, RECENT_LIMIT) };
    }),
  clear: () => set({ ids: [] }),
}));

// Same hand-wired persistence as cart and session (see appStorage.ts for why
// not zustand/persist): hydrate once at module load, save on every change.
const restoredRecent = loadJSON<unknown>(RECENT_STORAGE_KEY);
if (restoredRecent) {
  useRecentlyViewedStore.setState({ ids: sanitizeRecentIds(restoredRecent) });
}
useRecentlyViewedStore.subscribe((state) => {
  saveJSON(RECENT_STORAGE_KEY, state.ids);
});

/** Privacy delete takes the view history with it. */
export function forgetRecentlyViewed() {
  useRecentlyViewedStore.getState().clear();
  removeSaved(RECENT_STORAGE_KEY);
}
