// A believable starting fridge for demos: a few things about to expire,
// a cooked leftover, a stocked freezer and pantry.

import { COMMON_FOODS } from '../shared/foods.ts';
import { addItems, type ActionContext, type Change, type NewItem } from '../shared/transitions.ts';
import type { Location } from '../shared/types.ts';

const daysAgo = (now: string, n: number) => new Date(new Date(now).getTime() - n * 86_400_000).toISOString();

type Spec = [en: string, ago: number, qty?: number, where?: Location, price?: number];

const SPECS: Spec[] = [
  ['Spinach', 4, 1, 'fridge', 2.2],
  ['Chicken breast', 1, 600, 'fridge', 0.011],
  ['Milk', 2, 1, 'fridge', 1.6],
  ['Eggs', 6, 8, 'fridge', 0.3],
  ['Yogurt', 3, 2, 'fridge', 0.9],
  ['White cheese', 5, 400, 'fridge', 0.012],
  ['Yellow cheese', 12, 300, 'fridge', 0.015],
  ['Tomatoes', 1, 5, 'fridge', 0.4],
  ['Cucumbers', 1, 2, 'fridge', 0.5],
  ['Peppers', 2, 3, 'fridge', 0.45],
  ['Strawberries', 2, 1, 'fridge', 3.5],
  ['Apples', 5, 5, 'fridge', 0.35],
  ['Lukanka', 10, 1, 'fridge', 6.5],
  ['Banitsa', 1, 1, 'fridge', 3.2],
  ['Lyutenitsa', 5, 1, 'fridge', 2.9],
  ['Butter', 15, 250, 'fridge', 0.016],
  ['Minced meat', 30, 500, 'freezer', 0.009],
  ['Frozen vegetables', 40, 400, 'freezer', 0.006],
  ['Ice cream', 20, 1, 'freezer', 4.5],
  ['Pasta', 20, 2, 'pantry'],
  ['Rice', 25, 1, 'pantry'],
  ['Olive oil', 30, 1, 'pantry'],
  ['Flour', 30, 1, 'pantry'],
  ['Canned tomatoes', 14, 3, 'pantry'],
  ['Coffee', 7, 1, 'pantry'],
  ['Paper towels', 7, 2, 'pantry'],
  ['Dish soap', 7, 1, 'pantry'],
];

export function sampleFridge(ctx: ActionContext): Change {
  const inputs: NewItem[] = [];
  for (const [en, ago, qty, where = 'fridge', price] of SPECS) {
    const c = COMMON_FOODS.find((f) => f.en === en);
    if (!c) continue;
    const location = where;
    inputs.push({
      name: { en: c.en, bg: c.bg },
      emoji: c.emoji,
      bucket: c.bucket,
      location,
      pantryGroup: location === 'pantry' ? c.pantryGroup ?? 'food' : undefined,
      qty: qty ?? c.qty,
      unit: c.unit,
      foodId: c.foodId,
      estimate: c.estimate,
      purchasedAt: daysAgo(ctx.now, ago),
      unitPrice: price,
      currency: price ? 'EUR' : undefined,
      source: 'sample',
    });
  }
  const change = addItems(inputs, ctx);
  // A pot of soup cooked two days ago.
  const soup = addItems(
    [
      {
        name: { en: 'Chicken soup', bg: 'Пилешка супа' },
        emoji: '🍲',
        bucket: 'cooked',
        location: 'fridge',
        qty: 3,
        unit: 'pcs',
        state: 'cooked',
        cookedKind: 'soup',
        purchasedAt: daysAgo(ctx.now, 2),
        source: 'sample',
      },
    ],
    { ...ctx, now: daysAgo(ctx.now, 2) },
  );
  return {
    upserts: [...change.upserts, ...soup.upserts],
    removes: [],
    events: [...change.events, ...soup.events],
  };
}
