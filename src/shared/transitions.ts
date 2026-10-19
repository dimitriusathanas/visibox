// Every change to the fridge goes through these pure functions: they return the
// items to save, the ids to delete and the events to log. Partial actions
// (cook 2 of 6 eggs) split the entry so each part keeps its own dates.

import { withDates } from './dates.ts';
import { bucketForFood, cookedKindFor, emojiForBucket, foodById } from './foods.ts';
import type {
  Bucket,
  CookedKind,
  Estimate,
  EventType,
  Item,
  ItemEvent,
  ItemSource,
  LocalizedName,
  Location,
  PantryGroup,
  Recipe,
  Unit,
} from './types.ts';

export interface ActionContext {
  householdId: string;
  now: string;
  timeZone: string;
  newId: () => string;
  by?: string;
  byName?: string;
}

export interface Change {
  upserts: Item[];
  removes: string[];
  events: ItemEvent[];
}

const EMPTY: Change = { upserts: [], removes: [], events: [] };

const round = (n: number) => Math.round(n * 1000) / 1000;

export function isCountable(unit: Unit): boolean {
  return unit === 'pcs' || unit === 'pack';
}

const BASE: Partial<Record<Unit, { base: 'g' | 'ml'; factor: number }>> = {
  g: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 },
  ml: { base: 'ml', factor: 1 },
  l: { base: 'ml', factor: 1000 },
};

/** Converts between g/kg and ml/l; null when the units don't measure the same thing. */
export function convertAmount(amount: number, from: Unit, to: Unit): number | null {
  if (from === to) return amount;
  const a = BASE[from];
  const b = BASE[to];
  if (!a || !b || a.base !== b.base) return null;
  return round((amount * a.factor) / b.factor);
}

function event(item: Item, type: EventType, ctx: ActionContext, qty?: number): ItemEvent {
  return {
    id: ctx.newId(),
    householdId: item.householdId,
    itemId: item.id,
    itemName: item.name,
    emoji: item.emoji,
    type,
    ...(qty !== undefined && { qty: round(qty), unit: item.unit }),
    ...(qty !== undefined && item.unitPrice !== undefined && { value: round(item.unitPrice * qty), currency: item.currency }),
    at: ctx.now,
    by: ctx.by,
    byName: ctx.byName,
  };
}

function touch(item: Item, ctx: ActionContext): Item {
  return withDates({ ...item, updatedAt: ctx.now, updatedBy: ctx.by }, ctx.timeZone);
}

/** Splits off `amount` as its own entry; the original id stays with the remainder. */
function split(item: Item, amount: number, ctx: ActionContext): { rest: Item | null; part: Item } {
  if (amount >= item.qty - 1e-9) return { rest: null, part: item };
  const rest = touch({ ...item, qty: round(item.qty - amount) }, ctx);
  const part: Item = { ...item, id: ctx.newId(), qty: round(amount), source: 'split', createdAt: ctx.now };
  return { rest, part };
}

const clampAmount = (item: Item, amount: number | 'all') =>
  amount === 'all' ? item.qty : Math.max(0, Math.min(item.qty, amount));

export type ConsumeHow = 'eaten' | 'tossed';

/** Swipe left: ate it or tossed it. Removes the entry when nothing is left. */
export function consume(item: Item, amount: number | 'all', how: ConsumeHow, ctx: ActionContext): Change {
  const qty = clampAmount(item, amount);
  if (qty <= 0) return EMPTY;
  const ev = event(item, how, ctx, qty);
  if (qty >= item.qty - 1e-9) return { upserts: [], removes: [item.id], events: [ev] };
  return { upserts: [touch({ ...item, qty: round(item.qty - qty) }, ctx)], removes: [], events: [ev] };
}

/** Swipe right: cooked. The cooked part moves to the Cooked bucket with leftover dates. */
export function cook(item: Item, amount: number | 'all', ctx: ActionContext, kind?: CookedKind): Change {
  if (item.state === 'cooked') return EMPTY;
  const qty = clampAmount(item, amount);
  if (qty <= 0) return EMPTY;
  const { rest, part } = split(item, qty, ctx);
  const cookedKind = kind ?? cookedKindFor(foodById(item.foodId), item.name.en);
  const cooked = touch(
    {
      ...part,
      state: 'cooked',
      bucket: 'cooked',
      location: 'fridge',
      cookedAt: ctx.now,
      cookedKind,
      thawedAt: undefined,
      frozenAt: undefined,
    },
    ctx,
  );
  return { upserts: rest ? [rest, cooked] : [cooked], removes: [], events: [event(item, 'cooked', ctx, qty)] };
}

export function freeze(item: Item, amount: number | 'all', ctx: ActionContext): Change {
  if (item.location === 'freezer') return EMPTY;
  const qty = clampAmount(item, amount);
  if (qty <= 0) return EMPTY;
  const { rest, part } = split(item, qty, ctx);
  const frozen = touch({ ...part, location: 'freezer', frozenAt: ctx.now, thawedAt: undefined }, ctx);
  return { upserts: rest ? [rest, frozen] : [frozen], removes: [], events: [event(item, 'frozen', ctx, qty)] };
}

/** Out of the freezer into the fridge, starting the thawed clock. */
export function thaw(item: Item, amount: number | 'all', ctx: ActionContext): Change {
  if (item.location !== 'freezer') return EMPTY;
  const qty = clampAmount(item, amount);
  if (qty <= 0) return EMPTY;
  const { rest, part } = split(item, qty, ctx);
  const thawed = touch({ ...part, location: 'fridge', thawedAt: ctx.now }, ctx);
  return { upserts: rest ? [rest, thawed] : [thawed], removes: [], events: [event(item, 'thawed', ctx, qty)] };
}

/** Whether marking this item opened changes anything. */
export function canOpen(item: Item): boolean {
  if (item.state !== 'bought' || item.location === 'freezer' || item.pantryGroup === 'household') return false;
  const food = foodById(item.foodId);
  return Boolean(food?.fridgeOpened || food?.pantryOpened || item.estimate?.opened);
}

/** Opened: shorter clock. Jars that need the fridge once opened move there. */
export function open(item: Item, ctx: ActionContext): Change {
  if (!canOpen(item)) return EMPTY;
  const food = foodById(item.foodId);
  const moveToFridge = item.location === 'pantry' && Boolean(food?.fridgeOpened || item.estimate?.opened);
  const opened = touch(
    {
      ...item,
      state: 'opened',
      openedAt: ctx.now,
      ...(moveToFridge && { location: 'fridge' as Location, pantryGroup: undefined }),
    },
    ctx,
  );
  return { upserts: [opened], removes: [], events: [event(item, 'opened', ctx)] };
}

export function setQuantity(item: Item, qty: number, ctx: ActionContext): Change {
  if (qty <= 0) return { upserts: [], removes: [item.id], events: [event(item, 'removed', ctx, item.qty)] };
  return { upserts: [touch({ ...item, qty: round(qty) }, ctx)], removes: [], events: [event(item, 'edited', ctx)] };
}

export type ItemPatch = Partial<
  Pick<Item, 'name' | 'emoji' | 'bucket' | 'unit' | 'packageDate' | 'qty' | 'location' | 'pantryGroup' | 'foodId'>
>;

export function edit(item: Item, patch: ItemPatch, ctx: ActionContext): Change {
  const next = { ...item, ...patch };
  if (patch.location === 'freezer' && item.location !== 'freezer') next.frozenAt = ctx.now;
  if (patch.location === 'fridge' && item.location === 'freezer') next.thawedAt = ctx.now;
  if (patch.packageDate === '') next.packageDate = undefined;
  return { upserts: [touch(next, ctx)], removes: [], events: [event(item, 'edited', ctx)] };
}

/** Deleted by mistake, not eaten or tossed. */
export function remove(item: Item, ctx: ActionContext): Change {
  return { upserts: [], removes: [item.id], events: [event(item, 'removed', ctx, item.qty)] };
}

export interface NewItem {
  name: LocalizedName;
  emoji?: string;
  bucket?: Bucket;
  location: Location;
  pantryGroup?: PantryGroup;
  qty: number;
  unit: Unit;
  foodId?: string;
  estimate?: Estimate;
  state?: Item['state'];
  cookedKind?: CookedKind;
  purchasedAt?: string;
  unitPrice?: number;
  currency?: string;
  source: ItemSource;
  receiptId?: string;
}

export function createItem(input: NewItem, ctx: ActionContext): Item {
  const food = foodById(input.foodId);
  const bucket = input.bucket ?? bucketForFood(food);
  const purchasedAt = input.purchasedAt ?? ctx.now;
  const item: Item = {
    id: ctx.newId(),
    householdId: ctx.householdId,
    name: input.name,
    emoji: input.emoji || emojiForBucket(bucket),
    bucket,
    ...(input.location === 'pantry' && { pantryGroup: input.pantryGroup ?? 'food' }),
    location: input.location,
    state: input.state ?? 'bought',
    qty: round(input.qty > 0 ? input.qty : 1),
    unit: input.unit,
    ...(food && { foodId: food.id }),
    ...(input.estimate && { estimate: input.estimate }),
    ...(input.cookedKind && { cookedKind: input.cookedKind }),
    purchasedAt,
    ...(input.state === 'cooked' && { cookedAt: ctx.now }),
    ...(input.location === 'freezer' && { frozenAt: purchasedAt }),
    eatBy: '',
    tossBy: '',
    ...(input.unitPrice !== undefined && { unitPrice: input.unitPrice, currency: input.currency }),
    source: input.source,
    ...(input.receiptId && { receiptId: input.receiptId }),
    createdBy: ctx.by,
    updatedBy: ctx.by,
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  return withDates(item, ctx.timeZone);
}

export function addItems(inputs: NewItem[], ctx: ActionContext): Change {
  const items = inputs.map((i) => createItem(i, ctx));
  return { upserts: items, removes: [], events: items.map((i) => event(i, 'added', ctx, i.qty)) };
}

export interface CookRecipeOptions {
  /** Portions saved for later; 0 means it was all eaten. */
  leftovers: number;
}

/** Recipe swiped right: use up its ingredients and, if there are leftovers, store the dish. */
export function cookRecipe(recipe: Recipe, items: Item[], opts: CookRecipeOptions, ctx: ActionContext): Change {
  const byId = new Map(items.map((i) => [i.id, i]));
  const change: Change = { upserts: [], removes: [], events: [] };
  for (const use of recipe.uses) {
    const item = byId.get(use.itemId);
    if (!item) continue;
    // A unit we can't convert means the recipe uses the whole thing.
    const amount = convertAmount(use.amount, use.unit, item.unit) ?? item.qty;
    const qty = Math.max(0, Math.min(item.qty, amount));
    if (qty <= 0) continue;
    change.events.push(event(item, 'cooked', ctx, qty));
    if (qty >= item.qty - 1e-9) change.removes.push(item.id);
    else change.upserts.push(touch({ ...item, qty: round(item.qty - qty) }, ctx));
  }
  if (opts.leftovers > 0) {
    const dish = createItem(
      {
        name: { en: recipe.dish.name_en, bg: recipe.dish.name_bg },
        emoji: recipe.dish.emoji,
        bucket: 'cooked',
        location: 'fridge',
        qty: opts.leftovers,
        unit: 'pcs',
        state: 'cooked',
        cookedKind: recipe.dish.kind,
        source: 'recipe',
      },
      ctx,
    );
    change.upserts.push(dish);
    change.events.push(event(dish, 'added', ctx, dish.qty));
  }
  return change;
}

/** Applies a change to a list of items (used by stores and by the voice function). */
export function applyChange(items: Item[], change: Change): Item[] {
  const removed = new Set(change.removes);
  const upserted = new Map(change.upserts.map((i) => [i.id, i]));
  const next = items.filter((i) => !removed.has(i.id)).map((i) => upserted.get(i.id) ?? i);
  for (const u of change.upserts) if (!items.some((i) => i.id === u.id) && !removed.has(u.id)) next.push(u);
  return next;
}
