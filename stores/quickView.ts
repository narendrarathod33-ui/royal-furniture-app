import { create } from 'zustand';
import type { ListedProduct } from '../components/catalog/kit';

/**
 * Ephemeral Quick View state: the listed product (as the card shows it, with
 * sizeCount/baseName) that the bottom sheet presents. The listed variant is
 * stored directly — not re-fetched by id from the raw catalog — so the sheet
 * sees the same option count and family price the card advertises. Never
 * persisted: closing the sheet or leaving the app forgets it, exactly like the
 * category explorer and sort menu.
 */
type QuickViewState = {
  product: ListedProduct | null;
  open: (product: ListedProduct) => void;
  close: () => void;
};

export const useQuickViewStore = create<QuickViewState>()((set) => ({
  product: null,
  open: (product) => set({ product }),
  close: () => set({ product: null }),
}));
