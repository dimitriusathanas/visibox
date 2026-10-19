import { createContext, useContext } from 'react';
import type { SharedValue } from 'react-native-reanimated';

import type { Item } from '../shared/types.ts';

/** Long-press drag between the fridge list and the freezer drawer. */
export interface DragApi {
  x: SharedValue<number>;
  y: SharedValue<number>;
  active: SharedValue<number>;
  begin(item: Item): void;
  end(item: Item, absoluteY: number): void;
}

export const DragContext = createContext<DragApi | null>(null);

export function useDrag(): DragApi | null {
  return useContext(DragContext);
}
