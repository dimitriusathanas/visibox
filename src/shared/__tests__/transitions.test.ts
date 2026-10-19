import { describe, expect, it } from 'vitest';

import {
  applyChange,
  consume,
  convertAmount,
  cook,
  cookRecipe,
  createItem,
  freeze,
  open,
  thaw,
  type ActionContext,
} from '../transitions.ts';
import type { Item, Recipe } from '../types.ts';

let n = 0;
const ctx = (now = '2026-10-19T09:00:00.000Z'): ActionContext => ({
  householdId: 'h1',
  now,
  timeZone: 'Europe/Sofia',
  newId: () => `id${++n}`,
  by: 'u1',
  byName: 'Alex',
});

const eggs = (): Item =>
  createItem(
    {
      name: { en: 'Eggs', bg: 'Яйца' },
      foodId: 'eggs-in-shell',
      location: 'fridge',
      qty: 10,
      unit: 'pcs',
      unitPrice: 0.3,
      currency: 'EUR',
      source: 'receipt',
    },
    ctx(),
  );

describe('consume', () => {
  it('eating part of a pack leaves the rest with the same id and dates', () => {
    const e = eggs();
    const change = consume(e, 3, 'eaten', ctx());
    expect(change.removes).toEqual([]);
    expect(change.upserts[0]).toMatchObject({ id: e.id, qty: 7, tossBy: e.tossBy });
    expect(change.events[0]).toMatchObject({ type: 'eaten', qty: 3, value: 0.9, byName: 'Alex' });
  });

  it('eating the rest removes the entry', () => {
    const e = eggs();
    const change = consume(e, 'all', 'tossed', ctx());
    expect(change.removes).toEqual([e.id]);
    expect(change.events[0]).toMatchObject({ type: 'tossed', qty: 10, value: 3 });
  });
});

describe('cook', () => {
  it('cooking 2 of 10 eggs splits off a cooked entry with leftover dates', () => {
    const e = eggs();
    const change = cook(e, 2, ctx('2026-10-20T08:00:00.000Z'));
    const [rest, cooked] = change.upserts;
    expect(rest).toMatchObject({ id: e.id, qty: 8, state: 'bought', bucket: 'dairy' });
    expect(cooked).toMatchObject({ qty: 2, state: 'cooked', bucket: 'cooked', cookedKind: 'egg' });
    expect(cooked.id).not.toBe(e.id);
    expect([cooked.eatBy, cooked.tossBy]).toEqual(['2026-10-23', '2026-10-24']);
  });
});

describe('freezer', () => {
  it('freeze then thaw resets the clock to the thaw date', () => {
    const chicken = createItem(
      {
        name: { en: 'Chicken breast', bg: 'Пилешко филе' },
        foodId: 'chicken-parts-breast-halves-boneless',
        location: 'fridge',
        qty: 500,
        unit: 'g',
        source: 'manual',
      },
      ctx(),
    );
    const frozen = freeze(chicken, 'all', ctx()).upserts[0];
    expect(frozen.location).toBe('freezer');
    const thawed = thaw(frozen, 'all', ctx('2027-01-10T08:00:00.000Z')).upserts[0];
    expect(thawed).toMatchObject({ location: 'fridge', eatBy: '2027-01-11', tossBy: '2027-01-12' });
  });

  it('freezing half of a measured item splits it', () => {
    const chicken = createItem(
      { name: { en: 'Minced meat', bg: 'Кайма' }, foodId: 'beef-ground', location: 'fridge', qty: 1000, unit: 'g', source: 'manual' },
      ctx(),
    );
    const change = freeze(chicken, 500, ctx());
    expect(change.upserts.map((i) => [i.location, i.qty])).toEqual([
      ['fridge', 500],
      ['freezer', 500],
    ]);
  });
});

describe('open', () => {
  it('a pantry jar moves to the fridge when opened', () => {
    const pickles = createItem(
      { name: { en: 'Pickles', bg: 'Туршия' }, foodId: 'pickles', location: 'pantry', qty: 1, unit: 'pcs', source: 'manual' },
      ctx(),
    );
    const opened = open(pickles, ctx()).upserts[0];
    expect(opened).toMatchObject({ location: 'fridge', state: 'opened', eatBy: '2026-11-18', tossBy: '2027-01-17' });
  });

  it('opening an apple does nothing', () => {
    const apples = createItem(
      { name: { en: 'Apples', bg: 'Ябълки' }, foodId: 'apples', location: 'fridge', qty: 6, unit: 'pcs', source: 'manual' },
      ctx(),
    );
    expect(open(apples, ctx()).upserts).toEqual([]);
  });
});

describe('cookRecipe', () => {
  it('uses ingredients by amount and stores leftovers', () => {
    const e = eggs();
    const spinach = createItem(
      { name: { en: 'Spinach', bg: 'Спанак' }, foodId: 'lettuce-leaf-spinach', location: 'fridge', qty: 1, unit: 'kg', source: 'manual' },
      ctx(),
    );
    const recipe: Recipe = {
      id: 'r1',
      title: 'Spinach omelette',
      minutes: 10,
      servings: 2,
      uses: [
        { itemId: e.id, amount: 3, unit: 'pcs', label: '3 eggs' },
        { itemId: spinach.id, amount: 200, unit: 'g', label: '200 g spinach' },
      ],
      staples: ['olive oil', 'salt'],
      steps: ['Whisk', 'Cook'],
      dish: { name_en: 'Spinach omelette', name_bg: 'Омлет със спанак', emoji: '🍳', kind: 'egg' },
      lang: 'en',
    };
    const change = cookRecipe(recipe, [e, spinach], { leftovers: 1 }, ctx());
    const after = applyChange([e, spinach], change);
    expect(after.find((i) => i.id === e.id)?.qty).toBe(7);
    expect(after.find((i) => i.id === spinach.id)?.qty).toBe(0.8);
    const dish = after.find((i) => i.source === 'recipe');
    expect(dish).toMatchObject({ bucket: 'cooked', state: 'cooked', qty: 1, name: { bg: 'Омлет със спанак' } });
  });
});

describe('convertAmount', () => {
  it('converts metric units and refuses mismatches', () => {
    expect(convertAmount(250, 'g', 'kg')).toBe(0.25);
    expect(convertAmount(1.5, 'l', 'ml')).toBe(1500);
    expect(convertAmount(2, 'pcs', 'g')).toBeNull();
  });
});
