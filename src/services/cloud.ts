// The family's shared fridge on Supabase: sign-in by emailed code, households
// with invite codes, live sync of items and events, and the AI edge functions.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

import { cloudConfigured, config } from '../config';
import type { Item, ItemEvent, Household } from '../shared/types.ts';
import type { Commit, RemotePatch, Repo, Snapshot } from '../state/repo';
import type { AiService, AssistantReply } from './ai';

export const supabase: SupabaseClient | null = cloudConfigured
  ? createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: {
        storage: AsyncStorage,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    })
  : null;

function client(): SupabaseClient {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase;
}

// --- Sign-in ------------------------------------------------------------------

export async function sendSignInCode(email: string): Promise<void> {
  const redirect = Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined;
  const { error } = await client().auth.signInWithOtp({ email, options: { emailRedirectTo: redirect } });
  if (error) throw error;
}

export async function verifySignInCode(email: string, token: string): Promise<void> {
  const { error } = await client().auth.verifyOtp({ email, token, type: 'email' });
  if (error) throw error;
}

export async function signOut(): Promise<void> {
  await client().auth.signOut();
  await AsyncStorage.removeItem(HOUSEHOLD_KEY);
}

// --- Households ---------------------------------------------------------------------

const HOUSEHOLD_KEY = 'vf:household:v1';

interface HouseholdRow {
  id: string;
  name: string;
  join_code: string;
}

const toHousehold = (r: HouseholdRow): Household => ({ id: r.id, name: r.name, joinCode: r.join_code });

export async function myHouseholds(): Promise<Household[]> {
  const { data, error } = await client().from('households').select('id, name, join_code').order('created_at');
  if (error) throw error;
  return (data as HouseholdRow[]).map(toHousehold);
}

export async function createHousehold(name: string, displayName: string): Promise<Household> {
  const { data, error } = await client().rpc('create_household', { p_name: name, p_display_name: displayName });
  if (error) throw error;
  return toHousehold(data as HouseholdRow);
}

export async function joinHousehold(code: string, displayName: string): Promise<Household> {
  const { data, error } = await client().rpc('join_household', { p_code: code.trim().toUpperCase(), p_display_name: displayName });
  if (error) throw error;
  return toHousehold(data as HouseholdRow);
}

export async function rememberHousehold(id: string): Promise<void> {
  await AsyncStorage.setItem(HOUSEHOLD_KEY, id);
}

export async function rememberedHousehold(): Promise<string | null> {
  return AsyncStorage.getItem(HOUSEHOLD_KEY);
}

// --- Repo: items and events ------------------------------------------------------

const itemRow = (i: Item) => ({
  id: i.id,
  household_id: i.householdId,
  data: i,
  location: i.location,
  eat_by: i.eatBy || null,
  toss_by: i.tossBy || null,
  updated_at: i.updatedAt,
});

const eventRow = (e: ItemEvent) => ({
  id: e.id,
  household_id: e.householdId,
  item_id: e.itemId,
  type: e.type,
  data: e,
  at: e.at,
});

const PENDING_KEY = 'vf:pending:v1';

/** Writes that failed (offline); upserts and deletes are idempotent, so replaying them is safe. */
async function loadPending(): Promise<Commit['change'][]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) ?? '[]');
  } catch {
    return [];
  }
}

export function cloudRepo(householdId: string): Repo {
  const db = client();
  let pending: (Commit['change'] & { deletedEventIds?: string[]; updatedEvents?: ItemEvent[] })[] = [];
  let flushing = false;

  async function write(c: (typeof pending)[number]) {
    if (c.upserts.length) {
      const { error } = await db.from('items').upsert(c.upserts.map(itemRow));
      if (error) throw error;
    }
    if (c.removes.length) {
      const { error } = await db.from('items').delete().in('id', c.removes);
      if (error) throw error;
    }
    const events = [...c.events, ...(c.updatedEvents ?? [])];
    if (events.length) {
      const { error } = await db.from('item_events').upsert(events.map(eventRow));
      if (error) throw error;
    }
    if (c.deletedEventIds?.length) {
      const { error } = await db.from('item_events').delete().in('id', c.deletedEventIds);
      if (error) throw error;
    }
  }

  async function flush() {
    if (flushing) return;
    flushing = true;
    try {
      while (pending.length) {
        await write(pending[0]);
        pending.shift();
        await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      }
    } catch {
      // Still offline; try again later.
    } finally {
      flushing = false;
    }
  }

  const timer = setInterval(() => void flush(), 15_000);

  return {
    kind: 'cloud',
    async load(): Promise<Snapshot> {
      pending = (await loadPending()) as typeof pending;
      void flush();
      const [items, events] = await Promise.all([
        db.from('items').select('data').eq('household_id', householdId),
        db.from('item_events').select('data').eq('household_id', householdId).order('at', { ascending: false }).limit(500),
      ]);
      if (items.error) throw items.error;
      if (events.error) throw events.error;
      return {
        items: (items.data as { data: Item }[]).map((r) => r.data),
        events: (events.data as { data: ItemEvent }[]).map((r) => r.data),
      };
    },
    async commit({ change, deletedEventIds, updatedEvents }) {
      pending.push({ ...change, deletedEventIds, updatedEvents });
      await AsyncStorage.setItem(PENDING_KEY, JSON.stringify(pending));
      await flush();
    },
    subscribe(onPatch: (patch: RemotePatch) => void) {
      const empty = (): RemotePatch => ({ upserts: [], removes: [], events: [], deletedEventIds: [] });
      const channel = db
        .channel(`household:${householdId}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'items', filter: `household_id=eq.${householdId}` }, (p) =>
          onPatch({ ...empty(), upserts: [(p.new as { data: Item }).data] }),
        )
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'items', filter: `household_id=eq.${householdId}` }, (p) =>
          onPatch({ ...empty(), upserts: [(p.new as { data: Item }).data] }),
        )
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'items' }, (p) => {
          const id = (p.old as { id?: string }).id;
          if (id) onPatch({ ...empty(), removes: [id] });
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'item_events', filter: `household_id=eq.${householdId}` }, (p) =>
          onPatch({ ...empty(), events: [(p.new as { data: ItemEvent }).data] }),
        )
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'item_events', filter: `household_id=eq.${householdId}` }, (p) =>
          onPatch({ ...empty(), events: [(p.new as { data: ItemEvent }).data] }),
        )
        .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'item_events' }, (p) => {
          const id = (p.old as { id?: string }).id;
          if (id) onPatch({ ...empty(), deletedEventIds: [id] });
        })
        .subscribe();
      return () => {
        clearInterval(timer);
        void db.removeChannel(channel);
      };
    },
  };
}

// --- AI edge functions -----------------------------------------------------------

async function call<T>(name: string, body: Record<string, unknown> | FormData): Promise<T> {
  const { data, error } = await client().functions.invoke<T>(name, { body });
  if (error) throw error;
  return data as T;
}

export function cloudAi(householdId: string, timeZone: string): AiService {
  return {
    kind: 'cloud',
    readReceipt: (image, lang) => call('receipt', { image: image.base64, mediaType: image.mediaType, lang }),
    suggestRecipes: (req) =>
      call<{ recipes: AiRecipe[] }>('recipes', {
        lang: req.lang,
        staples: req.staples,
        diet: req.diet,
        exclude: req.exclude,
        items: req.items.map((i) => ({
          id: i.id,
          name: req.lang === 'bg' ? i.name.bg : i.name.en,
          qty: i.qty,
          unit: i.unit,
          eatBy: i.eatBy,
          tossBy: i.tossBy,
          bucket: i.bucket,
        })),
      }).then((r) => r.recipes.map((x, n) => ({ ...x, id: `cloud-${Date.now()}-${n}`, lang: req.lang }))),
    async ask(req) {
      const payload = { householdId, timeZone, lang: req.lang, history: req.history, text: req.text };
      if (!req.audio) return call<AssistantReply>('assistant', payload);
      const form = new FormData();
      form.append('payload', JSON.stringify(payload));
      if (Platform.OS === 'web') {
        const blob = await (await fetch(req.audio.uri)).blob();
        // Safari records mp4 even when webm is requested; trust the blob.
        form.append('audio', blob, `speech.${extension(blob.type || req.audio.mimeType)}`);
      } else {
        // React Native's FormData uploads a file from its uri.
        form.append('audio', { uri: req.audio.uri, name: `speech.${extension(req.audio.mimeType)}`, type: req.audio.mimeType } as never);
      }
      return call<AssistantReply>('assistant', form);
    },
  };
}

type AiRecipe = Omit<import('../shared/types.ts').Recipe, 'id' | 'lang'>;

function extension(mime: string): string {
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  if (mime.includes('mpeg')) return 'mp3';
  return 'm4a';
}
