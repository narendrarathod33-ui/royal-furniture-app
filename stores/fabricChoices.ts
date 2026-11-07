import { create } from 'zustand';
import type { FabricSelection } from '../app/data/fabrics';
import { loadJSON, removeSaved, saveJSON } from './appStorage';

const STORAGE_KEY = 'rf-fabric-choices-v1';
type Choices = Record<string, FabricSelection>;
type State = {
  choices: Choices;
  choose: (productId: string, fabric: FabricSelection) => void;
  resetUserData: () => void;
};

/** Last chosen fabric per base product; cart lines keep their own snapshots. */
export const useFabricChoiceStore = create<State>()((set) => ({
  choices: loadJSON<Choices>(STORAGE_KEY) || {},
  choose: (productId, fabric) => set((state) => ({ choices: { ...state.choices, [productId]: { ...fabric } } })),
  resetUserData: () => {
    removeSaved(STORAGE_KEY);
    set({ choices: {} });
  },
}));

useFabricChoiceStore.subscribe((state) => saveJSON(STORAGE_KEY, state.choices));
