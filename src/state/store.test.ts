import { beforeEach, describe, expect, it, vi } from 'vitest';

import { addItems, consume, type ActionContext } from '../shared/transitions.ts';
import { useFridge } from './store';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {
  getItem: async () => null,
  setItem: async () => undefined,
} }));
vi.mock('expo-localization', () => ({ getLocales: () => [{ languageCode: 'en' }] }));

let id = 0;
const ctx: ActionContext = { householdId: 'local', now: '2026-10-20T12:00:00Z', timeZone: 'UTC', newId: () => `undo-${id++}` };
const addMilk = () => addItems([{ name: { en: 'Milk', bg: 'Мляко' }, qty: 1, unit: 'l', location: 'fridge', source: 'manual' }], ctx);

describe('assistant undo after a cloud realtime echo', () => {
  beforeEach(() => useFridge.setState({ items: [], events: [], voice: [], undo: null, toast: null, highlight: [] }));

  it('restores a consumed item from the pre-request snapshot and marks its card undone', () => {
    const before = addMilk().upserts;
    useFridge.setState({ items: before });
    const change = consume(before[0], 'all', 'eaten', ctx);
    useFridge.getState().applySaved(change);
    expect(useFridge.getState().items).toHaveLength(0);
    useFridge.getState().run(change, { message: 'Changed 1 item' }, { beforeItems: before });
    useFridge.getState().addVoiceTurn({ role: 'assistant', text: 'Done.', changeId: useFridge.getState().undo!.id, changedCount: 1 });
    useFridge.getState().undoLast();
    expect(useFridge.getState().items).toEqual(before);
    expect(useFridge.getState().voice[0].undone).toBe(true);
  });

  it('removes an assistant-created item that already arrived through realtime', () => {
    const before = addMilk().upserts;
    useFridge.setState({ items: before });
    const change = addMilk();
    useFridge.getState().applySaved(change);
    expect(useFridge.getState().items).toHaveLength(2);
    useFridge.getState().run(change, undefined, { beforeItems: before });
    useFridge.getState().undoLast();
    expect(useFridge.getState().items).toEqual(before);
  });
});
