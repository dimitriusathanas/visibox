import { describe, expect, it } from 'vitest';

import { addItems, consume, type ActionContext } from '../shared/transitions.ts';
import type { Item } from '../shared/types.ts';
import { changedItemCount, replyItems, suggestionAt } from './assistantPresentation';
import { lifeRemaining, stackItems, zoneFor } from './fridgeLayout';

let n = 0;
const ctx: ActionContext = { householdId: 'test', now: '2026-10-20T12:00:00Z', timeZone: 'UTC', newId: () => `test-${n++}` };
const make = (patch: Partial<Item> = {}) => ({
  ...addItems([{ name: { en: 'Strawberries', bg: 'Ягоди' }, bucket: 'fruits', location: 'fridge', qty: 1, unit: 'pack', source: 'manual', estimate: { fridge: [4, 7] } }], ctx).upserts[0],
  ...patch,
});

describe('physical fridge', () => {
  it('keeps raw meat away from cooked meals and separates crispers and door storage', () => {
    expect(zoneFor(make({ bucket: 'meats', name: { en: 'Chicken', bg: '' } }))).toBe('raw');
    expect(zoneFor(make({ bucket: 'meats', state: 'cooked' }))).toBe('top');
    expect(zoneFor(make({ bucket: 'precooked' }))).toBe('top');
    expect(zoneFor(make({ bucket: 'fruits' }))).toBe('fruit');
    expect(zoneFor(make({ bucket: 'veggies' }))).toBe('veg');
    expect(zoneFor(make({ bucket: 'dairy', name: { en: 'Milk', bg: '' } }))).toBe('door');
    expect(zoneFor(make({ bucket: 'dairy', name: { en: 'Eggs (M)', bg: '' } }))).toBe('door');
    expect(zoneFor(make({ bucket: 'other' }))).toBe('door');
    expect(zoneFor(make({ bucket: 'dairy', name: { en: 'Cheese', bg: '' } }))).toBe('everyday');
  });

  it('stacks duplicates using the earliest batch without mutating or merging them', () => {
    const later = make({ eatBy: '2026-10-28', qty: 1 });
    const sooner = make({ eatBy: '2026-10-23', qty: 2 });
    const result = stackItems([later, sooner]);
    expect(result).toHaveLength(1);
    expect(result[0].next.id).toBe(sooner.id);
    expect(result[0].quantity).toBe(3);
    expect(result[0].items.map((i) => i.id)).toEqual([sooner.id, later.id]);
    expect(later.qty).toBe(1);
    expect(sooner.qty).toBe(2);
  });

  it('keeps opened batches, different units, and different storage separate', () => {
    expect(stackItems([make(), make({ state: 'opened' }), make({ unit: 'g' }), make({ location: 'freezer' })])).toHaveLength(4);
  });

  it('clamps the life ring and uses the current consume-by clock', () => {
    const item = make({ eatBy: '2026-10-24' });
    expect(lifeRemaining(item, '2026-10-20')).toBe(1);
    expect(lifeRemaining(item, '2026-10-22')).toBe(0.5);
    expect(lifeRemaining(item, '2026-10-25')).toBe(0);
    expect(lifeRemaining(item, '2026-10-19')).toBe(1);
  });
});

describe('assistant presentation', () => {
  it('suggests dinner at 6 pm and adapts across the day', () => {
    expect(suggestionAt(8)).toBe('suggest_morning');
    expect(suggestionAt(12)).toBe('suggest_lunch');
    expect(suggestionAt(18)).toBe('suggest_evening');
    expect(suggestionAt(23)).toBe('suggest_late');
  });

  it('retains removed item chips and counts changed items once', () => {
    const item = make();
    const change = consume(item, 'all', 'eaten', ctx);
    expect(replyItems('Done.', [item], change).map((i) => i.id)).toEqual([item.id]);
    expect(changedItemCount(change)).toBe(1);
    expect(changedItemCount({ ...change, events: [...change.events, ...change.events] })).toBe(1);
    expect(changedItemCount()).toBe(0);
  });

  it('uses whole food names to attach relevant reply chips', () => {
    const berry = make();
    expect(replyItems('Use the strawberries first.', [berry])).toHaveLength(1);
    expect(replyItems('Nothing is urgent.', [berry])).toHaveLength(0);
  });
});
