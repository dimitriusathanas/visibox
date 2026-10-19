// Offline recipe ideas for the preview: a handful of very simple dishes,
// filled in with whatever in the fridge is closest to expiring.

import { freshness, localDay } from '../../shared/dates.ts';
import { normalizeText } from '../../shared/foods.ts';
import { isCountable } from '../../shared/transitions.ts';
import type { CookedKind, Item, Lang, Recipe, RecipeUse } from '../../shared/types.ts';
import type { RecipeRequest } from '../ai';

interface Slot {
  /** FoodKeeper ids or name fragments (English or Bulgarian) that fill this slot. */
  any: string[];
  /** How much to use, by unit family. */
  pcs?: number;
  grams?: number;
  pack?: number;
  optional?: boolean;
}

interface Template {
  id: string;
  title: Record<Lang, string>;
  minutes: number;
  servings: number;
  slots: Slot[];
  staples: Record<Lang, string[]>;
  steps: Record<Lang, string[]>;
  dish: { en: string; bg: string; emoji: string; kind: CookedKind };
}

const EGGS = ['eggs-in-shell', 'eggs', 'яйц'];
const SPINACH = ['lettuce-leaf-spinach', 'spinach', 'спанак'];
const TOMATO = ['tomato', 'домат'];
const CUCUMBER = ['cucumber', 'краставиц'];
const WHITE_CHEESE = ['white cheese', 'сирене', 'feta'];
const YELLOW_CHEESE = ['yellow cheese', 'кашкавал', 'cheddar'];
const PEPPER = ['peppers', 'чушк'];
const YOGURT = ['yogurt', 'кисело мляко'];
const FRUIT = ['strawberr', 'ягод', 'banana', 'банан', 'blueberr', 'боровинк', 'raspberr', 'малин', 'peach', 'прасков'];
const CHICKEN = ['chicken-parts', 'chicken breast', 'chicken thigh', 'пилешк'];
const BREAD = ['bread', 'хляб'];
const ZUCCHINI = ['zucchini', 'тиквичк'];
const MUSHROOM = ['mushroom', 'гъби'];

const TEMPLATES: Template[] = [
  {
    id: 'shopska',
    title: { en: 'Shopska salad', bg: 'Шопска салата' },
    minutes: 10,
    servings: 2,
    slots: [
      { any: TOMATO, pcs: 2, grams: 300 },
      { any: CUCUMBER, pcs: 1, grams: 250 },
      { any: WHITE_CHEESE, grams: 120 },
      { any: PEPPER, pcs: 1, optional: true },
    ],
    staples: { en: ['olive oil', 'salt', 'onions'], bg: ['зехтин', 'сол', 'лук'] },
    steps: {
      en: ['Dice the tomatoes, cucumber and pepper.', 'Add a little chopped onion, salt and olive oil.', 'Grate the white cheese over the top.'],
      bg: ['Нарежи доматите, краставицата и чушката на кубчета.', 'Добави малко нарязан лук, сол и зехтин.', 'Настържи сиренето отгоре.'],
    },
    dish: { en: 'Shopska salad', bg: 'Шопска салата', emoji: '🥗', kind: 'veg' },
  },
  {
    id: 'omelette',
    title: { en: 'Spinach & cheese omelette', bg: 'Омлет със спанак и сирене' },
    minutes: 10,
    servings: 1,
    slots: [
      { any: EGGS, pcs: 3 },
      { any: [...SPINACH, ...PEPPER, ...MUSHROOM, ...ZUCCHINI], pack: 0.5, grams: 150, pcs: 1 },
      { any: [...WHITE_CHEESE, ...YELLOW_CHEESE], grams: 50, optional: true },
    ],
    staples: { en: ['oil', 'salt', 'black pepper'], bg: ['олио', 'сол', 'черен пипер'] },
    steps: {
      en: ['Wilt the greens or soften the veg in a hot pan with a little oil.', 'Pour in the beaten eggs with a pinch of salt.', 'Crumble cheese on top, fold and serve.'],
      bg: ['Задуши зеленчуците в тиган с малко олио.', 'Залей с разбитите яйца и щипка сол.', 'Натроши сиренето отгоре, сгъни и сервирай.'],
    },
    dish: { en: 'Omelette', bg: 'Омлет', emoji: '🍳', kind: 'egg' },
  },
  {
    id: 'chicken-skillet',
    title: { en: 'Chicken & veg skillet', bg: 'Пилешко със зеленчуци на тиган' },
    minutes: 20,
    servings: 2,
    slots: [
      { any: CHICKEN, grams: 400, pack: 1, pcs: 1 },
      { any: [...PEPPER, ...TOMATO, ...ZUCCHINI, ...MUSHROOM, ...SPINACH], pcs: 2, grams: 250, pack: 1 },
    ],
    staples: { en: ['oil', 'salt', 'paprika', 'garlic'], bg: ['олио', 'сол', 'червен пипер', 'чесън'] },
    steps: {
      en: ['Cut the chicken into strips and brown it in a hot pan, 6–7 minutes.', 'Add the sliced veg and garlic; cook 5 more minutes.', 'Season with salt and paprika.'],
      bg: ['Нарежи пилешкото на ленти и го запържи 6–7 минути.', 'Добави нарязаните зеленчуци и чесъна; готви още 5 минути.', 'Подправи със сол и червен пипер.'],
    },
    dish: { en: 'Chicken & veg skillet', bg: 'Пилешко със зеленчуци', emoji: '🍲', kind: 'poultry' },
  },
  {
    id: 'tarator',
    title: { en: 'Tarator (cold yogurt soup)', bg: 'Таратор' },
    minutes: 10,
    servings: 2,
    slots: [
      { any: YOGURT, pcs: 1, grams: 400 },
      { any: CUCUMBER, pcs: 1, grams: 250 },
    ],
    staples: { en: ['garlic', 'oil', 'salt'], bg: ['чесън', 'олио', 'сол'] },
    steps: {
      en: ['Grate or finely dice the cucumber.', 'Stir it into the yogurt with crushed garlic, salt and cold water.', 'Finish with a drizzle of oil; serve chilled.'],
      bg: ['Настържи или нарежи ситно краставицата.', 'Смеси я с киселото мляко, счукан чесън, сол и студена вода.', 'Полей с малко олио и сервирай изстудено.'],
    },
    dish: { en: 'Tarator', bg: 'Таратор', emoji: '🥣', kind: 'veg' },
  },
  {
    id: 'fruit-bowl',
    title: { en: 'Yogurt & fruit bowl', bg: 'Кисело мляко с плодове' },
    minutes: 5,
    servings: 1,
    slots: [
      { any: YOGURT, pcs: 1, grams: 200 },
      { any: FRUIT, pack: 0.5, pcs: 1, grams: 150 },
    ],
    staples: { en: ['honey'], bg: ['мед'] },
    steps: {
      en: ['Spoon the yogurt into a bowl.', 'Slice the fruit on top.', 'Drizzle with honey.'],
      bg: ['Сложи киселото мляко в купа.', 'Нарежи плодовете отгоре.', 'Полей с мед.'],
    },
    dish: { en: 'Yogurt bowl', bg: 'Кисело мляко с плодове', emoji: '🍓', kind: 'veg' },
  },
  {
    id: 'spinach-rice',
    title: { en: 'Spinach rice', bg: 'Спаначен ориз' },
    minutes: 25,
    servings: 3,
    slots: [{ any: SPINACH, pack: 1, grams: 400 }],
    staples: { en: ['rice', 'onions', 'oil', 'salt'], bg: ['ориз', 'лук', 'олио', 'сол'] },
    steps: {
      en: ['Soften a chopped onion in oil.', 'Add 1 cup rice and 2 cups water; simmer 15 minutes.', 'Stir in the chopped spinach for the last 3 minutes; season.'],
      bg: ['Задуши нарязан лук в олио.', 'Добави 1 чаша ориз и 2 чаши вода; вари 15 минути.', 'Добави нарязания спанак за последните 3 минути; подправи.'],
    },
    dish: { en: 'Spinach rice', bg: 'Спаначен ориз', emoji: '🍚', kind: 'rice' },
  },
  {
    id: 'french-toast',
    title: { en: 'Cheesy French toast', bg: 'Пържени филийки със сирене' },
    minutes: 10,
    servings: 2,
    slots: [
      { any: BREAD, pcs: 0.5 },
      { any: EGGS, pcs: 2 },
      { any: [...WHITE_CHEESE, ...YELLOW_CHEESE], grams: 60, optional: true },
    ],
    staples: { en: ['oil', 'salt'], bg: ['олио', 'сол'] },
    steps: {
      en: ['Beat the eggs with a pinch of salt.', 'Dip the bread slices and fry until golden on both sides.', 'Top with grated cheese while hot.'],
      bg: ['Разбий яйцата с щипка сол.', 'Потопи филийките и ги изпържи от двете страни до златисто.', 'Поръси с настъргано сирене, докато са топли.'],
    },
    dish: { en: 'French toast', bg: 'Пържени филийки', emoji: '🍞', kind: 'egg' },
  },
];

function matches(item: Item, any: string[]): boolean {
  const text = normalizeText(`${item.foodId ?? ''} ${item.name.en} ${item.name.bg}`).replace(/-/g, ' ');
  return any.some((frag) => text.includes(normalizeText(frag)));
}

function amountFor(item: Item, slot: Slot): number {
  let want: number;
  if (item.unit === 'pack') want = slot.pack ?? 1;
  else if (isCountable(item.unit)) want = slot.pcs ?? 1;
  else {
    const grams = slot.grams ?? 200;
    want = item.unit === 'kg' || item.unit === 'l' ? grams / 1000 : grams;
  }
  return Math.min(item.qty, want);
}

const URGENCY = { toss: 0, eat: 6, soon: 3, fresh: 1 } as const;

export function demoRecipes(req: RecipeRequest): Recipe[] {
  const today = localDay(new Date());
  const pool = req.items.filter(
    (i) =>
      i.location === 'fridge' &&
      i.state !== 'cooked' &&
      i.bucket !== 'other' &&
      i.bucket !== 'precooked' &&
      freshness(i, today) !== 'toss',
  );
  const ideas: { recipe: Recipe; score: number }[] = [];
  for (const tpl of TEMPLATES) {
    if (req.exclude.includes(tpl.title[req.lang])) continue;
    const used = new Set<string>();
    const uses: RecipeUse[] = [];
    let score = 0;
    let top = 0;
    let ok = true;
    for (const slot of tpl.slots) {
      const candidates = pool
        .filter((i) => !used.has(i.id) && matches(i, slot.any))
        .sort((a, b) => URGENCY[freshness(b, today)] - URGENCY[freshness(a, today)] || (a.eatBy < b.eatBy ? -1 : 1));
      const pick = candidates[0];
      if (!pick) {
        if (slot.optional) continue;
        ok = false;
        break;
      }
      used.add(pick.id);
      const amount = amountFor(pick, slot);
      uses.push({ itemId: pick.id, amount, unit: pick.unit, label: req.lang === 'bg' ? pick.name.bg : pick.name.en });
      score += URGENCY[freshness(pick, today)];
      top = Math.max(top, URGENCY[freshness(pick, today)]);
    }
    if (!ok || top < URGENCY.soon) continue;
    ideas.push({
      // The most urgent ingredient matters most; the rest breaks ties.
      score: top * 10 + score,
      recipe: {
        id: `demo-${tpl.id}`,
        title: tpl.title[req.lang],
        minutes: tpl.minutes,
        servings: tpl.servings,
        uses,
        staples: tpl.staples[req.lang],
        steps: tpl.steps[req.lang],
        dish: { name_en: tpl.dish.en, name_bg: tpl.dish.bg, emoji: tpl.dish.emoji, kind: tpl.dish.kind },
        lang: req.lang,
      },
    });
  }
  return ideas
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((i) => i.recipe);
}
