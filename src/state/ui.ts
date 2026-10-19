import { create } from 'zustand';

import type { Item, Location } from '../shared/types.ts';

export interface QuantityRequest {
  item: Item;
  title: string;
  kind?: 'primary' | 'danger' | 'freezer';
  onPick: (amount: number | 'all') => void;
}

export type Tab = 'assistant' | 'fridge' | 'recipes' | 'pantry';

interface UiState {
  tab: Tab;
  itemSheet: string | null;
  addSheet: { location: Location } | null;
  scanSheet: boolean;
  settingsSheet: boolean;
  picker: QuantityRequest | null;
  setTab(tab: Tab): void;
  openItem(id: string | null): void;
  openAdd(location: Location | null): void;
  openScan(open: boolean): void;
  openSettings(open: boolean): void;
  askQuantity(req: QuantityRequest | null): void;
}

export const useUi = create<UiState>((set) => ({
  tab: 'assistant',
  itemSheet: null,
  addSheet: null,
  scanSheet: false,
  settingsSheet: false,
  picker: null,
  setTab: (tab) => set({ tab }),
  openItem: (id) => set({ itemSheet: id }),
  openAdd: (location) => set({ addSheet: location ? { location } : null }),
  openScan: (open) => set({ scanSheet: open }),
  openSettings: (open) => set({ settingsSheet: open }),
  askQuantity: (picker) => set({ picker }),
}));
