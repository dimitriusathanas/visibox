import { create } from 'zustand';

import { config } from '../config';
import { sampleFridge } from '../data/sample';
import { newId } from '../lib/ids';
import { deviceTimeZone } from '../shared/dates.ts';
import { applyChange, type ActionContext, type Change } from '../shared/transitions.ts';
import type { Item, ItemEvent, Recipe } from '../shared/types.ts';
import { localRepo, type RemotePatch, type Repo } from './repo';
import { defaultSettings, loadSettings, saveSettings, type Settings } from './settings';

export interface Toast {
  id: number;
  message: string;
  canUndo: boolean;
  /** Set when "Tossed it instead" is offered; the message shown after tapping it. */
  tossMessage?: string;
}

interface UndoEntry {
  before: Item[];
  createdIds: string[];
  eventIds: string[];
  eatenEventId?: string;
}

export interface VoiceTurn {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: string[];
}

export interface RecipesState {
  list: Recipe[];
  key: string;
  status: 'idle' | 'loading' | 'ready' | 'error';
}

export interface FridgeState {
  ready: boolean;
  repoKind: Repo['kind'];
  householdId: string;
  householdName: string;
  userId?: string;
  items: Item[];
  events: ItemEvent[];
  settings: Settings;
  toast: Toast | null;
  undo: UndoEntry | null;
  /** Items that just arrived, flashed in the list. */
  highlight: string[];
  voice: VoiceTurn[];
  recipes: RecipesState;

  init(): Promise<void>;
  ctx(): ActionContext;
  /** Applies a change from shared/transitions, saves it, and offers undo. */
  run(change: Change, toast?: { message: string; tossMessage?: string }): void;
  /** Applies a change someone else already saved (the voice assistant in cloud mode). */
  applySaved(change: Change): void;
  undoLast(): void;
  tossInstead(): void;
  dismissToast(): void;
  clearHighlight(): void;
  setSettings(patch: Partial<Settings>): void;
  loadSample(): void;
  clearAll(): void;
  addVoiceTurn(turn: Omit<VoiceTurn, 'id'>): void;
  setRecipes(patch: Partial<RecipesState>): void;
  /** Switches to another fridge (the family's cloud fridge after sign-in). */
  attach(repo: Repo, household: { id: string; name: string }, userId?: string): Promise<void>;
}

const LOCAL_HOUSEHOLD = 'local';
const MAX_EVENTS = 500;

let repo: Repo = localRepo(LOCAL_HOUSEHOLD);
let unsubscribe: (() => void) | undefined;
let toastSeq = 0;

export const useFridge = create<FridgeState>((set, get) => {
  function commit(change: Change, extra: { deletedEventIds?: string[]; updatedEvents?: ItemEvent[] } = {}) {
    const s = get();
    void repo.commit({ change, ...extra, next: { items: s.items, events: s.events } }).catch(() => undefined);
  }

  function mergeRemote(patch: RemotePatch) {
    const s = get();
    // Ignore echoes that are older than what this device already has.
    const local = new Map(s.items.map((i) => [i.id, i]));
    const upserts = patch.upserts.filter((u) => !local.has(u.id) || local.get(u.id)!.updatedAt <= u.updatedAt);
    const items = applyChange(s.items, { upserts, removes: patch.removes, events: [] });
    const known = new Set(s.events.map((e) => e.id));
    const deleted = new Set(patch.deletedEventIds);
    const events = [...patch.events.filter((e) => !known.has(e.id)), ...s.events]
      .filter((e) => !deleted.has(e.id))
      .map((e) => patch.events.find((p) => p.id === e.id) ?? e)
      .sort((a, b) => (a.at < b.at ? 1 : -1))
      .slice(0, MAX_EVENTS);
    set({ items, events });
  }

  return {
    ready: false,
    repoKind: repo.kind,
    householdId: LOCAL_HOUSEHOLD,
    householdName: '',
    items: [],
    events: [],
    settings: defaultSettings(),
    toast: null,
    undo: null,
    highlight: [],
    voice: [],
    recipes: { list: [], key: '', status: 'idle' },

    async init() {
      const [settings, snapshot] = await Promise.all([loadSettings(), repo.load()]);
      set({ settings, items: snapshot.items, events: snapshot.events, ready: true });
      if (config.preview && snapshot.items.length === 0 && snapshot.events.length === 0) get().loadSample();
    },

    ctx() {
      const s = get();
      return {
        householdId: s.householdId,
        now: new Date().toISOString(),
        timeZone: deviceTimeZone(),
        newId,
        by: s.userId,
        byName: s.settings.userName || undefined,
      };
    },

    run(change, toast) {
      if (!change.upserts.length && !change.removes.length && !change.events.length) return;
      const s = get();
      const prev = new Map(s.items.map((i) => [i.id, i]));
      const before = [...change.upserts.map((u) => prev.get(u.id)), ...change.removes.map((id) => prev.get(id))].filter(
        (i): i is Item => Boolean(i),
      );
      const createdIds = change.upserts.filter((u) => !prev.has(u.id)).map((u) => u.id);
      const added = new Set(change.events.filter((e) => e.type === 'added').map((e) => e.itemId));
      set({
        items: applyChange(s.items, change),
        events: [...change.events, ...s.events].slice(0, MAX_EVENTS),
        undo: {
          before,
          createdIds,
          eventIds: change.events.map((e) => e.id),
          eatenEventId: change.events.find((e) => e.type === 'eaten')?.id,
        },
        toast: toast ? { id: ++toastSeq, message: toast.message, canUndo: true, tossMessage: toast.tossMessage } : s.toast,
        highlight: createdIds.filter((id) => added.has(id)),
      });
      commit(change);
    },

    applySaved(change) {
      mergeRemote({ upserts: change.upserts, removes: change.removes, events: change.events, deletedEventIds: [] });
    },

    undoLast() {
      const s = get();
      const u = s.undo;
      if (!u) return;
      const change: Change = { upserts: u.before, removes: u.createdIds, events: [] };
      const drop = new Set(u.eventIds);
      set({
        items: applyChange(s.items, change),
        events: s.events.filter((e) => !drop.has(e.id)),
        undo: null,
        toast: null,
      });
      commit(change, { deletedEventIds: u.eventIds });
    },

    tossInstead() {
      const s = get();
      const id = s.undo?.eatenEventId;
      const ev = id ? s.events.find((e) => e.id === id) : undefined;
      if (!ev || !s.toast?.tossMessage) return;
      const updated: ItemEvent = { ...ev, type: 'tossed' };
      set({
        events: s.events.map((e) => (e.id === id ? updated : e)),
        undo: s.undo ? { ...s.undo, eatenEventId: undefined } : null,
        toast: { id: ++toastSeq, message: s.toast.tossMessage, canUndo: true },
      });
      commit({ upserts: [], removes: [], events: [] }, { updatedEvents: [updated] });
    },

    dismissToast() {
      set({ toast: null });
    },

    clearHighlight() {
      if (get().highlight.length) set({ highlight: [] });
    },

    setSettings(patch) {
      const settings = { ...get().settings, ...patch };
      set({ settings });
      saveSettings(settings);
    },

    loadSample() {
      get().run(sampleFridge(get().ctx()));
      set({ undo: null, highlight: [] });
    },

    clearAll() {
      const s = get();
      const change: Change = { upserts: [], removes: s.items.map((i) => i.id), events: [] };
      set({ items: [], events: [], undo: null, toast: null, recipes: { list: [], key: '', status: 'idle' } });
      commit(change, { deletedEventIds: s.events.map((e) => e.id) });
    },

    addVoiceTurn(turn) {
      set({ voice: [...get().voice, { ...turn, id: newId() }].slice(-12) });
    },

    setRecipes(patch) {
      set({ recipes: { ...get().recipes, ...patch } });
    },

    async attach(next, household, userId) {
      unsubscribe?.();
      repo = next;
      const snapshot = await repo.load();
      set({
        repoKind: repo.kind,
        householdId: household.id,
        householdName: household.name,
        userId,
        items: snapshot.items,
        events: snapshot.events,
        undo: null,
        toast: null,
        recipes: { list: [], key: '', status: 'idle' },
      });
      unsubscribe = repo.subscribe?.(mergeRemote);
    },
  };
});
