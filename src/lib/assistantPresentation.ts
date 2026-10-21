import type { StringKey } from '../i18n/strings';
import { normalizeText } from '../shared/foods.ts';
import type { Change } from '../shared/transitions.ts';
import type { Item } from '../shared/types.ts';

export function suggestionAt(hour: number): StringKey {
  return hour < 11 ? 'suggest_morning' : hour < 17 ? 'suggest_lunch' : hour < 22 ? 'suggest_evening' : 'suggest_late';
}

export function replyItems(reply: string, before: Item[], change?: Change): Item[] {
  const ids = new Set([...change?.removes ?? [], ...change?.upserts.map((i) => i.id) ?? [], ...change?.events.map((e) => e.itemId) ?? []]);
  const text = ` ${normalizeText(reply)} `;
  const all = new Map([...before, ...change?.upserts ?? []].map((i) => [i.id, i]));
  return [...all.values()].filter((i) => ids.has(i.id) || [i.name.en, i.name.bg].some((name) => {
    const normalized = normalizeText(name);
    return normalized.length > 2 && text.includes(` ${normalized} `);
  }));
}

export function changedItemCount(change?: Change): number {
  if (!change) return 0;
  const ids = change.events.length ? change.events.map((e) => e.itemId) : [...change.removes, ...change.upserts.map((i) => i.id)];
  return new Set(ids).size;
}
