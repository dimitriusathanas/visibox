import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Change } from '../shared/transitions.ts';
import type { Item, ItemEvent } from '../shared/types.ts';

export interface Snapshot {
  items: Item[];
  events: ItemEvent[];
}

export interface Commit {
  /** What changed, for repos that write deltas. */
  change: Change;
  /** Events deleted (undo) or rewritten (eaten → tossed). */
  deletedEventIds?: string[];
  updatedEvents?: ItemEvent[];
  /** The whole state after the change, for repos that write snapshots. */
  next: Snapshot;
}

export interface RemotePatch {
  upserts: Item[];
  removes: string[];
  events: ItemEvent[];
  deletedEventIds: string[];
}

/** Where the fridge lives: this device, or the family's shared cloud fridge. */
export interface Repo {
  kind: 'local' | 'cloud';
  load(): Promise<Snapshot>;
  commit(commit: Commit): Promise<void>;
  /** Changes made by other family members. */
  subscribe?(onPatch: (patch: RemotePatch) => void): () => void;
}

const KEY = 'vf:fridge:v1';

export function localRepo(householdId: string): Repo {
  const key = `${KEY}:${householdId}`;
  let writing = Promise.resolve();
  return {
    kind: 'local',
    async load() {
      try {
        const raw = await AsyncStorage.getItem(key);
        if (!raw) return { items: [], events: [] };
        const parsed = JSON.parse(raw) as Partial<Snapshot>;
        return { items: parsed.items ?? [], events: parsed.events ?? [] };
      } catch {
        return { items: [], events: [] };
      }
    },
    commit({ next }) {
      // Serialize writes so a slow write can't overwrite a newer one.
      writing = writing
        .then(() => AsyncStorage.setItem(key, JSON.stringify(next)))
        .catch(() => undefined);
      return writing;
    },
  };
}
