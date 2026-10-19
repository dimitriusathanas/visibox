import { describe, expect, it } from 'vitest';

import { createItem, type ActionContext } from '../_shared/transitions.ts';
import { actionLabels, detectLang, fridgeList, fridgeTools, parsePayload } from './assistantCore.ts';

const HH = '6f1c2a3b-0000-4000-8000-000000000001';
let n = 0;
const ctx: ActionContext = {
  householdId: HH,
  now: '2026-10-19T15:00:00.000Z',
  timeZone: 'Europe/Sofia',
  newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
  by: 'user-1',
  byName: 'Мария',
};

const fridge = () => [
  createItem(
    { name: { en: 'Eggs', bg: 'Яйца' }, foodId: 'eggs-in-shell', location: 'fridge', qty: 10, unit: 'pcs', source: 'receipt' },
    ctx,
  ),
  createItem(
    {
      name: { en: 'Chicken breast', bg: 'Пилешко филе' },
      foodId: 'chicken-parts-breast-halves-boneless',
      location: 'fridge',
      qty: 600,
      unit: 'g',
      source: 'receipt',
    },
    ctx,
  ),
];

describe('parsePayload', () => {
  it('requires a household id and cleans the rest', () => {
    expect(() => parsePayload({})).toThrow();
    const p = parsePayload({
      householdId: HH,
      timeZone: 'Not/AZone',
      lang: 'bg',
      history: [{ role: 'system', text: 'x' }, ...Array.from({ length: 12 }, (_, i) => ({ role: 'user', text: `q${i}` }))],
    });
    expect(p.timeZone).toBe('UTC');
    expect(p.lang).toBe('bg');
    expect(p.history).toHaveLength(8);
    expect(p.history.every((h) => h.role === 'user')).toBe(true);
  });
});

describe('fridgeTools', () => {
  it('eats part of an item and cooks another', () => {
    const items = fridge();
    const tools = fridgeTools(items, ctx);
    const out = tools.runTool('update_items', {
      changes: [
        { item_id: items[0].id, action: 'eat', amount: 2 },
        { item_id: items[1].id, action: 'cook', amount: null },
        { item_id: 'nope', action: 'eat', amount: null },
      ],
    });
    expect(out).toContain('no such item');
    const eggs = tools.items.find((i) => i.id === items[0].id);
    const chicken = tools.items.find((i) => i.id === items[1].id);
    expect(eggs?.qty).toBe(8);
    expect(chicken).toMatchObject({ state: 'cooked', bucket: 'cooked' });
    expect(tools.change.events.map((e) => e.type)).toEqual(['eaten', 'cooked']);
    expect(tools.change.events[0].byName).toBe('Мария');
  });

  it('adds food with USDA dates when it recognises the name', () => {
    const tools = fridgeTools([], ctx);
    tools.runTool('add_items', {
      items: [
        { name_en: 'Milk', name_bg: 'Прясно мляко', emoji: '🥛', bucket: 'dairy', location: 'fridge', qty: 1, unit: 'l', cooked: false },
        { name_en: 'Bean soup', name_bg: 'Боб чорба', emoji: '🍲', bucket: 'other', location: 'fridge', qty: 4, unit: 'pcs', cooked: true },
      ],
    });
    const [milk, soup] = tools.change.upserts;
    expect(milk).toMatchObject({ foodId: 'milk-plain-or-flavored', source: 'voice' });
    expect(milk.tossBy).not.toBe('');
    expect(soup).toMatchObject({ bucket: 'cooked', state: 'cooked' });
    expect(tools.change.events.map((e) => e.type)).toEqual(['added', 'added']);
  });

  it('removing an item drops any earlier upsert of it from the change', () => {
    const items = fridge();
    const tools = fridgeTools(items, ctx);
    tools.runTool('update_items', { changes: [{ item_id: items[0].id, action: 'eat', amount: 3 }] });
    tools.runTool('update_items', { changes: [{ item_id: items[0].id, action: 'toss', amount: null }] });
    expect(tools.change.removes).toEqual([items[0].id]);
    expect(tools.change.upserts.find((u) => u.id === items[0].id)).toBeUndefined();
  });
});

describe('labels and context', () => {
  it('describes changes in the reply language', () => {
    const items = fridge();
    const tools = fridgeTools(items, ctx);
    tools.runTool('update_items', { changes: [{ item_id: items[1].id, action: 'freeze', amount: null }] });
    expect(actionLabels(tools.change, 'bg')).toEqual(['Във фризера: Пилешко филе']);
    expect(actionLabels(tools.change, 'en')).toEqual(['Chicken breast is in the freezer']);
  });

  it('detects Bulgarian by its alphabet', () => {
    expect(detectLang('Имаме ли яйца?', 'en')).toBe('bg');
    expect(detectLang('Do we have eggs?', 'bg')).toBe('en');
  });

  it('lists every item with its id and dates', () => {
    const list = fridgeList(fridge(), '2026-10-19');
    expect(list).toContain('## fridge (2)');
    expect(list).toMatch(/Chicken breast \/ Пилешко филе \| 600 g \| eat by 2026-10-20 \| toss by 2026-10-21/);
    expect(list).toContain('## freezer (0)');
  });
});
