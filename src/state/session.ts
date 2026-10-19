import { useMemo } from 'react';
import { create } from 'zustand';

import { demoAi } from '../services/demo';
import type { AiService } from '../services/ai';
import {
  cloudAi,
  cloudRepo,
  createHousehold,
  joinHousehold,
  myHouseholds,
  rememberedHousehold,
  rememberHousehold,
  signOut as cloudSignOut,
  supabase,
} from '../services/cloud';
import { deviceTimeZone } from '../shared/dates.ts';
import type { Household } from '../shared/types.ts';
import { localRepo } from './repo';
import { useFridge } from './store';

interface SessionState {
  /** off: no Supabase project configured (preview); the fridge stays on this device. */
  status: 'off' | 'loading' | 'signed-out' | 'signed-in';
  email?: string;
  userId?: string;
  households: Household[];
  household?: Household;
  error?: string;
  boot(): Promise<void>;
  refresh(): Promise<void>;
  choose(h: Household): Promise<void>;
  create(name: string): Promise<void>;
  join(code: string): Promise<void>;
  signOut(): Promise<void>;
}

export const useSession = create<SessionState>((set, get) => ({
  status: supabase ? 'loading' : 'off',
  households: [],

  async boot() {
    if (!supabase) return;
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN' && get().status !== 'signed-in') void get().refresh();
      if (event === 'SIGNED_OUT') set({ status: 'signed-out', households: [], household: undefined });
    });
    await get().refresh();
  },

  async refresh() {
    if (!supabase) return;
    const { data } = await supabase.auth.getSession();
    const user = data.session?.user;
    if (!user) {
      set({ status: 'signed-out' });
      return;
    }
    set({ status: 'signed-in', email: user.email ?? undefined, userId: user.id });
    try {
      const households = await myHouseholds();
      set({ households, error: undefined });
      const remembered = await rememberedHousehold();
      const pick = households.find((h) => h.id === remembered) ?? (households.length === 1 ? households[0] : undefined);
      if (pick && pick.id !== get().household?.id) await get().choose(pick);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  async choose(h) {
    await rememberHousehold(h.id);
    set({ household: h });
    await useFridge.getState().attach(cloudRepo(h.id), { id: h.id, name: h.name }, get().userId);
  },

  async create(name) {
    const h = await createHousehold(name, useFridge.getState().settings.userName);
    set({ households: [...get().households, h] });
    await get().choose(h);
  },

  async join(code) {
    const h = await joinHousehold(code, useFridge.getState().settings.userName);
    set({ households: [...get().households.filter((x) => x.id !== h.id), h] });
    await get().choose(h);
  },

  async signOut() {
    await cloudSignOut();
    set({ status: 'signed-out', households: [], household: undefined, email: undefined, userId: undefined });
    await useFridge.getState().attach(localRepo('local'), { id: 'local', name: '' });
  },
}));

/** Claude through the edge functions once the family fridge is connected; offline stand-ins before that. */
export function useAi(): AiService {
  const kind = useFridge((s) => s.repoKind);
  const householdId = useFridge((s) => s.householdId);
  const ctx = useFridge((s) => s.ctx);
  return useMemo(
    () => (kind === 'cloud' ? cloudAi(householdId, deviceTimeZone()) : demoAi(ctx)),
    [kind, householdId, ctx],
  );
}
