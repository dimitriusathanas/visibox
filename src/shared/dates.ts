// Eat-by / toss-by dates for an item, from its USDA FoodKeeper window and
// where it is (fridge, freezer, pantry) and what has happened to it
// (opened, cooked, thawed). Eat by is the start of the range, toss by the end.

import { COOKED_FOOD_IDS, cookedKindFor, foodById } from './foods.ts';
import type { Bucket, Days, FoodProfile, FoodWindow, Item } from './types.ts';

export type DateSource = 'usda' | 'estimate' | 'fallback' | 'package' | 'none';
export type ClockStart = 'bought' | 'opened' | 'cooked' | 'frozen' | 'thawed';
export type DateNote =
  | 'package_date'
  | 'freeze_not_recommended'
  | 'fridge_not_recommended'
  | 'quality_only'
  | 'ripen_first'
  | 'keeps_indefinitely'
  | 'capped_by_unopened';

export interface DateBasis {
  source: DateSource;
  window: Days | null;
  from: ClockStart;
  start: string;
  foodId?: string;
  notes: DateNote[];
}

export interface ComputedDates {
  eatBy: string;
  tossBy: string;
  basis: DateBasis;
}

// --- Calendar days (yyyy-mm-dd) ----------------------------------------------

export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

/** The calendar day an instant falls on in a time zone. */
export function localDay(iso: string | Date, timeZone = deviceTimeZone()): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(d);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

function dayToUtc(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

export function addDays(day: string, n: number): string {
  return new Date(dayToUtc(day) + Math.round(n) * 86_400_000).toISOString().slice(0, 10);
}

/** Whole days from a to b (positive when b is later). */
export function daysBetween(a: string, b: string): number {
  return Math.round((dayToUtc(b) - dayToUtc(a)) / 86_400_000);
}

const minDay = (a: string, b: string) => (a < b ? a : b);
const maxDay = (a: string, b: string) => (a > b ? a : b);

// --- Windows -------------------------------------------------------------------

const INDEFINITE: Days = [3650, 3650];

/** Conservative guesses for when the USDA table defers to the package or has no fridge figure. */
function fallbackFridge(food: FoodProfile | undefined, bucket: Bucket): Days {
  switch (food?.cat) {
    case 'dairy-eggs':
      return [5, 7];
    case 'deli-prepared':
    case 'poultry-cooked':
      return [3, 4];
    case 'condiments-canned':
      return [30, 60];
    case 'beverages':
      return [7, 10];
    case 'bakery':
    case 'grains-pasta':
    case 'refrigerated-dough':
      return [5, 7];
    case 'fruits':
    case 'vegetables':
      return [3, 7];
    case undefined:
      break;
    default:
      if (food && /^(meat|poultry|seafood|shellfish)/.test(food.cat)) return [1, 2];
  }
  switch (bucket) {
    case 'meats':
      return [1, 2];
    case 'dairy':
      return [5, 7];
    case 'precooked':
    case 'cooked':
      return [3, 4];
    case 'fruits':
    case 'veggies':
      return [3, 7];
    case 'grains':
      return [5, 7];
    default:
      return [7, 14];
  }
}

/** USDA "The Big Thaw": thawed in the fridge, poultry, ground meat and seafood keep 1-2 days; other cuts 3-5. */
function thawWindow(food: FoodProfile | undefined, item: Item): { window: Days; source: DateSource } {
  if (food?.fridgeThawed?.d) return { window: food.fridgeThawed.d, source: 'usda' };
  if (item.state === 'cooked') return { window: [3, 4], source: 'usda' };
  const cat = food?.cat ?? '';
  const id = food?.id ?? '';
  if (/^(poultry|seafood|shellfish)/.test(cat) || /ground|stew|cubes|sausage|fish|shrimp|giblets/.test(id)) {
    return { window: [1, 2], source: 'usda' };
  }
  if (/^meat/.test(cat) || cat === 'deli-prepared') return { window: [3, 5], source: 'usda' };
  if (cat === 'fruits' || cat === 'vegetables') return { window: [1, 3], source: 'fallback' };
  if (cat === 'bakery' || cat === 'grains-pasta') return { window: [2, 5], source: 'fallback' };
  if (item.bucket === 'meats') return { window: [1, 2], source: 'usda' };
  return { window: [1, 3], source: 'fallback' };
}

interface Picked {
  window: Days | null;
  source: DateSource;
  from: ClockStart;
  startIso: string;
  notes: DateNote[];
  foodId?: string;
}

function fromWindow(
  w: FoodWindow | undefined,
  fallback: () => Days,
  notes: DateNote[],
): { window: Days; source: DateSource } {
  if (w?.d) return { window: w.d, source: 'usda' };
  if (w?.flag === 'indefinite') {
    notes.push('keeps_indefinitely');
    return { window: INDEFINITE, source: 'usda' };
  }
  if (w?.flag === 'package') notes.push('package_date');
  if (w?.flag === 'ripe') notes.push('ripen_first');
  return { window: fallback(), source: 'fallback' };
}

function pickWindow(item: Item, food: FoodProfile | undefined): Picked {
  const est = item.estimate;
  const notes: DateNote[] = [];
  const bought = item.purchasedAt;

  if (item.location === 'pantry' && item.pantryGroup === 'household') {
    return { window: null, source: 'none', from: 'bought', startIso: bought, notes };
  }

  if (item.location === 'freezer') {
    const cooked = item.state === 'cooked' ? foodById(COOKED_FOOD_IDS[item.cookedKind ?? cookedKindFor(food, item.name.en)]) : undefined;
    const profile = cooked ?? food;
    notes.push('quality_only');
    const startIso = item.frozenAt ?? bought;
    if (profile?.freezer?.d) {
      return { window: profile.freezer.d, source: 'usda', from: 'frozen', startIso, notes, foodId: profile.id };
    }
    if (est?.freezer) return { window: est.freezer, source: 'estimate', from: 'frozen', startIso, notes };
    if (profile?.freezer?.flag === 'not_recommended') notes.push('freeze_not_recommended');
    return { window: [30, 90], source: 'fallback', from: 'frozen', startIso, notes, foodId: profile?.id };
  }

  if (item.location === 'pantry') {
    if (item.state === 'opened' && item.openedAt) {
      if (food?.pantryOpened?.d) {
        return { window: food.pantryOpened.d, source: 'usda', from: 'opened', startIso: item.openedAt, notes, foodId: food.id };
      }
      if (est?.opened) return { window: est.opened, source: 'estimate', from: 'opened', startIso: item.openedAt, notes };
    }
    if (!food && est?.pantry) return { window: est.pantry, source: 'estimate', from: 'bought', startIso: bought, notes };
    const { window, source } = fromWindow(food?.pantry, () => (food?.fridge?.d ? food.fridge.d : [30, 180]), notes);
    return { window, source, from: 'bought', startIso: bought, notes, foodId: food?.id };
  }

  // Fridge
  if (item.thawedAt && (!item.cookedAt || item.thawedAt >= item.cookedAt)) {
    const { window, source } = thawWindow(food, item);
    return { window, source, from: 'thawed', startIso: item.thawedAt, notes, foodId: food?.id };
  }
  if (item.state === 'cooked') {
    const cooked = foodById(COOKED_FOOD_IDS[item.cookedKind ?? cookedKindFor(food, item.name.en)]);
    const startIso = item.cookedAt ?? bought;
    if (cooked?.fridge?.d) {
      return { window: cooked.fridge.d, source: 'usda', from: 'cooked', startIso, notes, foodId: cooked.id };
    }
    return { window: [3, 4], source: 'usda', from: 'cooked', startIso, notes };
  }
  if (item.state === 'opened' && item.openedAt) {
    if (food?.fridgeOpened?.d) {
      return { window: food.fridgeOpened.d, source: 'usda', from: 'opened', startIso: item.openedAt, notes, foodId: food.id };
    }
    if (est?.opened) return { window: est.opened, source: 'estimate', from: 'opened', startIso: item.openedAt, notes };
  }
  if (!food && est?.fridge) return { window: est.fridge, source: 'estimate', from: 'bought', startIso: bought, notes };
  if (food?.fridge?.flag === 'not_recommended') {
    notes.push('fridge_not_recommended');
    return { window: [1, 2], source: 'fallback', from: 'bought', startIso: bought, notes, foodId: food.id };
  }
  const w = food?.fridge ?? food?.fridgeOpened;
  const { window, source } = fromWindow(w, () => fallbackFridge(food, item.bucket), notes);
  return { window, source, from: 'bought', startIso: bought, notes, foodId: food?.id };
}

function datesFromWindow(start: string, [min, max]: Days): { eatBy: string; tossBy: string } {
  const eatDays = min < max ? Math.floor(min) : Math.max(Math.round(max * 0.75), max >= 1 ? 1 : 0);
  return { eatBy: addDays(start, eatDays), tossBy: addDays(start, Math.floor(max)) };
}

/** Eat-by and toss-by for an item in its current location and state. */
export function computeDates(item: Item, timeZone = deviceTimeZone()): ComputedDates {
  const food = foodById(item.foodId);
  const picked = pickWindow(item, food);
  const start = localDay(picked.startIso, timeZone);
  const basis: DateBasis = {
    source: picked.source,
    window: picked.window,
    from: picked.from,
    start,
    foodId: picked.foodId,
    notes: picked.notes,
  };
  if (!picked.window) return { eatBy: '', tossBy: '', basis };

  let { eatBy, tossBy } = datesFromWindow(start, picked.window);

  // Opening never makes food last longer than it would have unopened.
  if (picked.from === 'opened') {
    const unopened = pickWindow({ ...item, state: 'bought', openedAt: undefined }, food);
    if (unopened.window) {
      const cap = datesFromWindow(localDay(unopened.startIso, timeZone), unopened.window).tossBy;
      if (cap < tossBy) {
        tossBy = cap;
        basis.notes.push('capped_by_unopened');
      }
    }
  }

  // A printed date wins for unopened food, and caps opened food.
  if (item.packageDate && item.location !== 'freezer' && (picked.from === 'bought' || picked.from === 'opened')) {
    if (picked.from === 'bought') {
      tossBy = item.packageDate;
      eatBy = maxDay(start, minDay(eatBy, addDays(item.packageDate, -1)));
      basis.source = 'package';
    } else if (item.packageDate < tossBy) {
      tossBy = item.packageDate;
    }
  }

  eatBy = minDay(eatBy, tossBy);
  return { eatBy, tossBy, basis };
}

/** Returns the item with fresh eatBy/tossBy. */
export function withDates<T extends Item>(item: T, timeZone = deviceTimeZone()): T {
  const { eatBy, tossBy } = computeDates(item, timeZone);
  return { ...item, eatBy, tossBy };
}

export type Freshness = 'fresh' | 'soon' | 'eat' | 'toss';

/** fresh: more than 2 days to eat-by; soon: within 2 days; eat: past eat-by; toss: past toss-by. */
export function freshness(item: Pick<Item, 'eatBy' | 'tossBy'>, today: string): Freshness {
  if (!item.tossBy) return 'fresh';
  if (today > item.tossBy) return 'toss';
  if (today >= item.eatBy) return 'eat';
  if (daysBetween(today, item.eatBy) <= 2) return 'soon';
  return 'fresh';
}

/** Sort key: soonest eat-by first, undated items last. */
export function byUrgency(a: Pick<Item, 'eatBy' | 'tossBy'>, b: Pick<Item, 'eatBy' | 'tossBy'>): number {
  return (a.eatBy || '9999') < (b.eatBy || '9999') ? -1 : (a.eatBy || '9999') > (b.eatBy || '9999') ? 1 : 0;
}
