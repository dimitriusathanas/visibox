// The assistant's logic that doesn't touch the network: request parsing, the
// fridge list Claude sees, and the tools that edit the fridge. Kept free of
// npm imports so it can be unit-tested (assistantCore.test.ts).

import { freshness } from '../_shared/dates.ts';
import { cookedKindFor, findCommonFood, FOOD_BY_ID, foodById } from '../_shared/foods.ts';
import { STRINGS } from '../_shared/strings.ts';
import {
  applyChange,
  consume,
  cook,
  createItem,
  freeze,
  open,
  remove,
  setQuantity,
  thaw,
  type ActionContext,
  type Change,
} from '../_shared/transitions.ts';
import type { Bucket, Item, Lang, Location, Unit } from '../_shared/types.ts';
import { HttpError } from './http.ts';

export interface Payload {
  householdId: string;
  timeZone: string;
  lang: Lang;
  history: { role: 'user' | 'assistant'; text: string }[];
  text?: string;
}

function validTimeZone(tz: unknown): string {
  if (typeof tz !== 'string') return 'UTC';
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

export function parsePayload(raw: unknown): Payload {
  const p = (raw ?? {}) as Record<string, unknown>;
  if (typeof p.householdId !== 'string' || !/^[0-9a-f-]{36}$/i.test(p.householdId)) throw new HttpError(400, 'householdId is required');
  const history = Array.isArray(p.history)
    ? p.history
        .filter((h): h is { role: 'user' | 'assistant'; text: string } => (h?.role === 'user' || h?.role === 'assistant') && typeof h?.text === 'string')
        .slice(-8)
        .map((h) => ({ role: h.role, text: h.text.slice(0, 600) }))
    : [];
  return {
    householdId: p.householdId,
    timeZone: validTimeZone(p.timeZone),
    lang: p.lang === 'bg' ? 'bg' : 'en',
    history,
    text: typeof p.text === 'string' ? p.text.slice(0, 600) : undefined,
  };
}

export const detectLang = (text: string, fallback: Lang): Lang => (/[\u0400-\u04FF]/.test(text) ? 'bg' : /[a-z]{3,}/i.test(text) ? 'en' : fallback);

export function fridgeList(items: Item[], today: string): string {
  const order: Location[] = ['fridge', 'freezer', 'pantry'];
  return order
    .map((loc) => {
      const rows = items
        .filter((i) => i.location === loc)
        .sort((a, b) => ((a.eatBy || '9999') < (b.eatBy || '9999') ? -1 : 1))
        .map((i) => {
          const state = [i.state !== 'bought' ? i.state : '', i.thawedAt && loc === 'fridge' ? 'thawed' : ''].filter(Boolean).join(', ');
          const dates = i.tossBy ? ` | eat by ${i.eatBy} | toss by ${i.tossBy} | ${freshness(i, today)}` : '';
          return `${i.id} | ${i.name.en} / ${i.name.bg} | ${i.qty} ${i.unit}${state ? ` | ${state}` : ''}${dates}`;
        });
      return `## ${loc} (${rows.length})\n${rows.join('\n') || '(empty)'}`;
    })
    .join('\n\n');
}

export function merge(a: Change, b: Change): Change {
  const removes = [...new Set([...a.removes, ...b.removes])];
  const upserts = new Map<string, Item>();
  for (const u of [...a.upserts, ...b.upserts]) upserts.set(u.id, u);
  for (const id of removes) upserts.delete(id);
  return { upserts: [...upserts.values()], removes, events: [...a.events, ...b.events] };
}

export function actionLabels(change: Change, lang: Lang): string[] {
  const s = STRINGS[lang];
  const verb: Partial<Record<string, string>> = {
    eaten: s.toast_ate,
    tossed: s.toast_tossed,
    cooked: s.toast_cooked,
    frozen: s.toast_frozen,
    thawed: s.toast_thawed,
    opened: s.toast_opened,
    removed: s.toast_deleted,
  };
  return change.events.flatMap((e) => {
    const name = lang === 'bg' ? e.itemName.bg || e.itemName.en : e.itemName.en || e.itemName.bg;
    if (e.type === 'added') return [`+ ${name}`];
    const template = verb[e.type];
    return template ? [template.replace('{name}', name)] : [];
  });
}

/** Runs the assistant's tools against a working copy of the fridge, collecting one Change. */
export function fridgeTools(initial: Item[], ctx: ActionContext) {
  let items = initial;
  let change: Change = { upserts: [], removes: [], events: [] };

  function runTool(name: string, input: unknown): string {
    const results: string[] = [];
    if (name === 'update_items') {
      for (const c of (input as { changes: { item_id: string; action: string; amount: number | null }[] }).changes ?? []) {
        const item = items.find((i) => i.id === c.item_id);
        if (!item) {
          results.push(`${c.item_id}: no such item`);
          continue;
        }
        const amount = c.amount == null ? 'all' : c.amount;
        const step: Change =
          c.action === 'eat'
            ? consume(item, amount, 'eaten', ctx)
            : c.action === 'toss'
              ? consume(item, amount, 'tossed', ctx)
              : c.action === 'cook'
                ? cook(item, amount, ctx)
                : c.action === 'freeze'
                  ? freeze(item, amount, ctx)
                  : c.action === 'thaw'
                    ? thaw(item, amount, ctx)
                    : c.action === 'open'
                      ? open(item, ctx)
                      : c.action === 'set_quantity'
                        ? setQuantity(item, typeof c.amount === 'number' ? c.amount : item.qty, ctx)
                        : c.action === 'delete'
                          ? remove(item, ctx)
                          : { upserts: [], removes: [], events: [] };
        if (!step.upserts.length && !step.removes.length) {
          results.push(`${item.name.en}: nothing to change (${c.action} doesn't apply)`);
          continue;
        }
        items = applyChange(items, step);
        change = merge(change, step);
        results.push(`${item.name.en}: ${c.action} ${amount === 'all' ? 'all' : `${amount} ${item.unit}`} done`);
      }
    } else if (name === 'add_items') {
      for (const a of (input as {
        items: { name_en: string; name_bg: string; emoji: string; bucket: Bucket; location: Location; qty: number; unit: Unit; cooked: boolean }[];
      }).items ?? []) {
        const common = findCommonFood(a.name_en) ?? findCommonFood(a.name_bg);
        const foodId = common?.foodId && FOOD_BY_ID.has(common.foodId) ? common.foodId : undefined;
        const created = createItem(
          {
            name: { en: a.name_en, bg: a.name_bg },
            emoji: a.emoji || common?.emoji,
            bucket: a.cooked ? 'cooked' : a.bucket,
            location: a.location,
            pantryGroup: a.location === 'pantry' ? 'food' : undefined,
            qty: a.qty,
            unit: a.unit,
            foodId,
            estimate: common?.estimate,
            state: a.cooked ? 'cooked' : 'bought',
            cookedKind: a.cooked ? cookedKindFor(foodById(foodId), a.name_en) : undefined,
            source: 'voice',
          },
          ctx,
        );
        const step: Change = {
          upserts: [created],
          removes: [],
          events: [
            {
              id: ctx.newId(),
              householdId: ctx.householdId,
              itemId: created.id,
              itemName: created.name,
              emoji: created.emoji,
              type: 'added',
              qty: created.qty,
              unit: created.unit,
              at: ctx.now,
              by: ctx.by,
              byName: ctx.byName,
            },
          ],
        };
        items = applyChange(items, step);
        change = merge(change, step);
        results.push(`${created.name.en}: added (${created.qty} ${created.unit}, eat by ${created.eatBy || '-'})`);
      }
    } else {
      return `Unknown tool ${name}`;
    }
    return results.join('\n') || 'Nothing changed';
  }

  return {
    runTool,
    get items() {
      return items;
    },
    get change() {
      return change;
    },
  };
}
