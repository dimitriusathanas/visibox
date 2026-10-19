import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.117.2';

import type { Change } from '../_shared/transitions.ts';
import type { Item, ItemEvent } from '../_shared/types.ts';
import { HttpError } from './http.ts';

export async function loadItems(db: SupabaseClient, householdId: string): Promise<Item[]> {
  const { data, error } = await db.from('items').select('data').eq('household_id', householdId);
  if (error) throw new HttpError(403, error.message);
  return (data as { data: Item }[]).map((r) => r.data);
}

export async function displayName(db: SupabaseClient, householdId: string, userId: string): Promise<string | undefined> {
  const { data } = await db
    .from('household_members')
    .select('display_name')
    .eq('household_id', householdId)
    .eq('user_id', userId)
    .maybeSingle();
  return (data as { display_name?: string } | null)?.display_name || undefined;
}

/** Same row shapes as the app's cloud repo (src/services/cloud.ts). */
export async function saveChange(db: SupabaseClient, change: Change): Promise<void> {
  if (change.upserts.length) {
    const { error } = await db.from('items').upsert(
      change.upserts.map((i: Item) => ({
        id: i.id,
        household_id: i.householdId,
        data: i,
        location: i.location,
        eat_by: i.eatBy || null,
        toss_by: i.tossBy || null,
        updated_at: i.updatedAt,
      })),
    );
    if (error) throw new HttpError(500, error.message);
  }
  if (change.removes.length) {
    const { error } = await db.from('items').delete().in('id', change.removes);
    if (error) throw new HttpError(500, error.message);
  }
  if (change.events.length) {
    const { error } = await db.from('item_events').upsert(
      change.events.map((e: ItemEvent) => ({
        id: e.id,
        household_id: e.householdId,
        item_id: e.itemId,
        type: e.type,
        data: e,
        at: e.at,
      })),
    );
    if (error) throw new HttpError(500, error.message);
  }
}
