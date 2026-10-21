import { byUrgency, computeDates, daysBetween } from '../shared/dates.ts';
import { foodById, normalizeText } from '../shared/foods.ts';
import type { Item } from '../shared/types.ts';

export type FridgeZone = 'top' | 'everyday' | 'raw' | 'fruit' | 'veg' | 'door';
export interface FoodStack { key: string; items: Item[]; next: Item; quantity: number }

export function zoneFor(item: Item): FridgeZone {
  if (item.state === 'cooked' || item.bucket === 'cooked' || item.bucket === 'precooked') return 'top';
  if (item.bucket === 'fruits') return 'fruit';
  if (item.bucket === 'veggies') return 'veg';
  if (item.bucket === 'meats') {
    const cat = foodById(item.foodId)?.cat ?? '';
    return /processed|shelf-stable|cooked|smoked|deli-prepared/.test(cat) ? 'top' : 'raw';
  }
  if (item.bucket === 'other' || /milk|eggs?\b/.test(item.name.en.toLowerCase())) return 'door';
  return 'everyday';
}

/** Stack matching food and units, but keep opened/cooked batches separate. Never merge stored items. */
export function stackItems(items: Item[]): FoodStack[] {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const key = JSON.stringify([item.foodId || normalizeText(item.name.en || item.name.bg), item.bucket, item.state, item.unit, item.location]);
    const group = groups.get(key) ?? [];
    group.push(item);
    groups.set(key, group);
  }
  return [...groups].map(([key, rows]) => {
    const sorted = [...rows].sort(byUrgency);
    return { key, items: sorted, next: sorted[0], quantity: Math.round(rows.reduce((n, i) => n + i.qty, 0) * 1000) / 1000 };
  }).sort((a, b) => byUrgency(a.next, b.next));
}

/** Fraction of the current consume-by window remaining, including opened/thawed/cooked clocks. */
export function lifeRemaining(item: Item, today: string): number {
  if (!item.eatBy) return 1;
  const start = computeDates(item).basis.start;
  const total = Math.max(1, daysBetween(start, item.eatBy));
  return Math.max(0, Math.min(1, daysBetween(today, item.eatBy) / total));
}
