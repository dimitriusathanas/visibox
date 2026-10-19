import { describe, expect, it } from 'vitest';

import { addDays, computeDates, daysBetween, freshness, localDay } from '../dates.ts';
import { createItem, type ActionContext, type NewItem } from '../transitions.ts';
import type { Item } from '../types.ts';

const TZ = 'Europe/Sofia';
let n = 0;
const ctx = (now = '2026-10-19T09:00:00.000Z'): ActionContext => ({
  householdId: 'h1',
  now,
  timeZone: TZ,
  newId: () => `id${++n}`,
});

const make = (input: Partial<NewItem> & Pick<NewItem, 'foodId'>, now?: string): Item =>
  createItem(
    {
      name: { en: 'x', bg: 'x' },
      location: 'fridge',
      qty: 1,
      unit: 'pcs',
      source: 'manual',
      ...input,
    },
    ctx(now),
  );

describe('calendar helpers', () => {
  it('uses the local day, not the UTC day', () => {
    // 22:30 UTC is already the next day in Sofia (UTC+3 in October).
    expect(localDay('2026-10-19T22:30:00.000Z', TZ)).toBe('2026-10-20');
    expect(localDay('2026-10-19T20:30:00.000Z', TZ)).toBe('2026-10-19');
  });

  it('adds and diffs days across month ends', () => {
    expect(addDays('2026-10-30', 3)).toBe('2026-11-02');
    expect(daysBetween('2026-10-30', '2026-11-02')).toBe(3);
  });
});

describe('computeDates', () => {
  it('raw chicken: eat by day 1, toss by day 2 (USDA 1-2 days)', () => {
    const chicken = make({ foodId: 'chicken-parts-breast-halves-boneless' });
    expect(chicken.eatBy).toBe('2026-10-20');
    expect(chicken.tossBy).toBe('2026-10-21');
    expect(computeDates(chicken, TZ).basis.source).toBe('usda');
  });

  it('frozen chicken keeps ~9 months for quality', () => {
    const chicken = make({ foodId: 'chicken-parts-breast-halves-boneless', location: 'freezer' });
    expect(chicken.tossBy).toBe(addDays('2026-10-19', 270));
    expect(computeDates(chicken, TZ).basis.notes).toContain('quality_only');
  });

  it('thawed chicken gets 1-2 days from the thaw', () => {
    const chicken = make({ foodId: 'chicken-parts-breast-halves-boneless', location: 'freezer' });
    const thawed = { ...chicken, location: 'fridge' as const, thawedAt: '2026-12-01T08:00:00.000Z' };
    const d = computeDates(thawed, TZ);
    expect(d.basis.from).toBe('thawed');
    expect([d.eatBy, d.tossBy]).toEqual(['2026-12-02', '2026-12-03']);
  });

  it('cooked chicken uses cooked poultry dishes (3-4 days)', () => {
    const chicken = make({ foodId: 'chicken-parts-breast-halves-boneless' });
    const cooked = { ...chicken, state: 'cooked' as const, cookedAt: '2026-10-20T17:00:00.000Z' };
    const d = computeDates(cooked, TZ);
    expect(d.basis.foodId).toBe('cooked-poultry-dishes');
    expect([d.eatBy, d.tossBy]).toEqual(['2026-10-23', '2026-10-24']);
  });

  it('milk defers to the package: conservative estimate until a date is entered', () => {
    const milk = make({ foodId: 'milk-plain-or-flavored', unit: 'l' });
    const d = computeDates(milk, TZ);
    expect(d.basis.source).toBe('fallback');
    expect(d.basis.notes).toContain('package_date');
    expect([milk.eatBy, milk.tossBy]).toEqual(['2026-10-24', '2026-10-26']);

    const printed = computeDates({ ...milk, packageDate: '2026-10-30' }, TZ);
    expect(printed.tossBy).toBe('2026-10-30');
    expect(printed.basis.source).toBe('package');
  });

  it('opened deli ham: 3-5 days, but never past the unopened date', () => {
    const ham = make({ foodId: 'ham-pre-packaged-luncheon-deli-meat' });
    expect(ham.tossBy).toBe('2026-11-02'); // 2 weeks unopened
    const openedEarly = computeDates({ ...ham, state: 'opened', openedAt: '2026-10-21T08:00:00.000Z' }, TZ);
    expect([openedEarly.eatBy, openedEarly.tossBy]).toEqual(['2026-10-24', '2026-10-26']);
    const openedLate = computeDates({ ...ham, state: 'opened', openedAt: '2026-10-31T08:00:00.000Z' }, TZ);
    expect(openedLate.tossBy).toBe('2026-11-02');
    expect(openedLate.basis.notes).toContain('capped_by_unopened');
  });

  it('equal min and max: eat by at about three quarters of the window', () => {
    const bacon = make({ foodId: 'bacon' }); // 1 week
    expect(daysBetween('2026-10-19', bacon.eatBy)).toBe(5);
    expect(daysBetween('2026-10-19', bacon.tossBy)).toBe(7);
  });

  it('uses estimates for foods USDA does not list', () => {
    const lyutenitsa = make({ foodId: undefined, estimate: { fridge: [7, 14] }, bucket: 'other' });
    expect([lyutenitsa.eatBy, lyutenitsa.tossBy]).toEqual(['2026-10-26', '2026-11-02']);
  });

  it('household goods have no dates', () => {
    const towels = make({ foodId: undefined, location: 'pantry', pantryGroup: 'household' });
    expect([towels.eatBy, towels.tossBy]).toEqual(['', '']);
  });

  it('receipt date, not scan date, starts the clock', () => {
    const spinach = make({ foodId: 'lettuce-leaf-spinach', purchasedAt: '2026-10-17T10:00:00.000Z' });
    expect([spinach.eatBy, spinach.tossBy]).toEqual(['2026-10-20', '2026-10-24']);
  });
});

describe('freshness', () => {
  const item = { eatBy: '2026-10-22', tossBy: '2026-10-25' };
  it.each([
    ['2026-10-18', 'fresh'],
    ['2026-10-20', 'soon'],
    ['2026-10-22', 'eat'],
    ['2026-10-25', 'eat'],
    ['2026-10-26', 'toss'],
  ])('%s is %s', (today, expected) => {
    expect(freshness(item, today)).toBe(expected);
  });
});
