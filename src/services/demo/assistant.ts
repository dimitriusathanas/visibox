// The preview's stand-in for the voice agent: understands a few everyday
// questions and commands in English and Bulgarian, without any AI service.

import { formatQty, formatRange, itemName, makeT, relativeDay } from '../../i18n';
import { byUrgency, freshness, localDay } from '../../shared/dates.ts';
import { findCommonFood, foodLabel, normalizeText, searchFoods } from '../../shared/foods.ts';
import { consume, freeze, type ActionContext, type Change } from '../../shared/transitions.ts';
import type { Item, Lang } from '../../shared/types.ts';
import type { AssistantReply } from '../ai';

const CYRILLIC = /[Ѐ-ӿ]/;

export function detectLang(text: string, fallback: Lang): Lang {
  if (CYRILLIC.test(text)) return 'bg';
  if (/[a-z]{3,}/i.test(text)) return 'en';
  return fallback;
}

/** Items whose name matches a word in the sentence (handles Bulgarian article endings like "млякото"). */
function findItems(items: Item[], phrase: string): Item[] {
  const words = normalizeText(phrase).split(' ').filter((w) => w.length >= 3);
  const scored = items
    .map((item) => {
      const nameWords = normalizeText(`${item.name.en} ${item.name.bg}`).split(' ').filter((w) => w.length >= 3);
      const hit = words.some((w) => nameWords.some((n) => w.startsWith(n) || (w.length >= 4 && n.startsWith(w))));
      return { item, hit };
    })
    .filter((x) => x.hit)
    .map((x) => x.item);
  return scored.sort(byUrgency);
}

const reply = (lang: Lang, text: string, actions: string[] = [], change?: Change): Omit<AssistantReply, 'transcript'> => ({
  reply: text,
  lang,
  actions,
  change,
});

export function demoAssistant(text: string, items: Item[], uiLang: Lang, ctx: ActionContext): Omit<AssistantReply, 'transcript'> {
  const lang = detectLang(text, uiLang);
  const t = makeT(lang);
  const today = localDay(new Date());
  const q = text.toLowerCase();
  const inFridge = items.filter((i) => i.location !== 'pantry' || i.pantryGroup !== 'household');
  const name = (i: Item) => itemName(i.name, lang);
  const list = (xs: string[]) =>
    xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} ${lang === 'bg' ? 'и' : 'and'} ${xs[xs.length - 1]}`;

  // "We finished the milk" / "Свършихме млякото"
  const finished = q.match(/(?:finished|ate|used up|drank|threw out|tossed)\s+(?:the\s+|all\s+the\s+|our\s+)?(.+)/) ??
    q.match(/(?:свършихме|изядохме|изпихме|изхвърлихме|свърши)\s+(.+)/);
  if (finished) {
    const tossed = /threw out|tossed|изхвърлихме/.test(q);
    const match = findItems(inFridge, finished[1])[0];
    if (!match) return reply(lang, lang === 'bg' ? `Не намирам „${finished[1]}“ в хладилника.` : `I can't find "${finished[1]}" in the fridge.`);
    const change = consume(match, 'all', tossed ? 'tossed' : 'eaten', ctx);
    const label = t(tossed ? 'toast_tossed' : 'toast_ate', { name: name(match) });
    return reply(
      lang,
      lang === 'bg' ? `Добре, отписах ${name(match).toLowerCase()} от хладилника.` : `Got it, I took the ${name(match).toLowerCase()} off the list.`,
      [label],
      change,
    );
  }

  // "Freeze the chicken" / "Замрази пилешкото"
  const freezeMatch = q.match(/freeze\s+(?:the\s+)?(.+)|(?:put|move)\s+(?:the\s+)?(.+?)\s+in(?:to)?\s+the\s+freezer/) ?? q.match(/замрази\s+(.+)|сложи\s+(.+?)\s+във\s+фризера/);
  if (freezeMatch) {
    const what = freezeMatch[1] ?? freezeMatch[2] ?? '';
    const match = findItems(inFridge.filter((i) => i.location === 'fridge'), what)[0];
    if (!match) return reply(lang, lang === 'bg' ? `Не намирам „${what}“ в хладилника.` : `I can't find "${what}" in the fridge.`);
    return reply(
      lang,
      lang === 'bg' ? `Готово, ${name(match).toLowerCase()} е във фризера.` : `Done, the ${name(match).toLowerCase()} is in the freezer.`,
      [t('toast_frozen', { name: name(match) })],
      freeze(match, 'all', ctx),
    );
  }

  // "How long does cooked rice last?" / "Колко издържа сиренето?"
  const howLong = q.match(/how long (?:does|do|will|can)\s+(.+?)\s+(?:last|keep|stay good)/) ?? q.match(/колко (?:време )?(?:издържа|трае|се пази)\s+(.+?)[?.]?$/);
  if (howLong) {
    const what = howLong[1];
    const own = findItems(inFridge, what)[0];
    if (own) {
      return reply(
        lang,
        lang === 'bg'
          ? `${name(own)}: изяж до ${relativeDay(own.eatBy, today, 'bg')}, изхвърли след ${relativeDay(own.tossBy, today, 'bg')}.`
          : `Your ${name(own).toLowerCase()}: eat by ${relativeDay(own.eatBy, today, 'en')}, toss after ${relativeDay(own.tossBy, today, 'en')}.`,
      );
    }
    const common = findCommonFood(what);
    const food = searchFoods(common?.en ?? what, 'en', 3).find((s) => s.food || s.common?.foodId);
    const profile = food?.food;
    if (profile?.fridge?.d) {
      return reply(
        lang,
        lang === 'bg'
          ? `Според USDA: ${foodLabel(profile)} издържа ${formatRange(profile.fridge.d, 'bg')} в хладилник.`
          : `The USDA says ${foodLabel(profile).toLowerCase()} keeps ${formatRange(profile.fridge.d, 'en')} in the fridge.`,
      );
    }
  }

  // "Do we have eggs?" / "Имаме ли яйца?"
  const have = q.match(/(?:do we have|have we got|is there|are there|any)\s+(?:any\s+)?(.+?)[?.]?$/) ?? q.match(/(?:имаме ли|има ли)\s+(.+?)[?.]?$/);
  if (have) {
    const found = findItems(items, have[1]);
    if (!found.length) return reply(lang, lang === 'bg' ? `Не, нямаме ${have[1]}.` : `No, I don't see any ${have[1]}.`);
    const where = (i: Item) => t(`loc_${i.location}`).toLowerCase();
    return reply(
      lang,
      lang === 'bg'
        ? `Да: ${list(found.slice(0, 3).map((i) => `${name(i)} (${formatQty(i.qty, i.unit, 'bg')}, ${where(i)})`))}.`
        : `Yes: ${list(found.slice(0, 3).map((i) => `${name(i)} (${formatQty(i.qty, i.unit, 'en')}, ${where(i)})`))}.`,
    );
  }

  // "What should I cook?" / "Какво да сготвя?"
  if (/what (?:can|should) (?:i|we) (?:cook|make)|recipe|dinner|lunch|какво да сготв|рецепт|вечеря|обяд/.test(q)) {
    const urgent = inFridge.filter((i) => i.location === 'fridge' && ['eat', 'soon'].includes(freshness(i, today))).sort(byUrgency);
    return reply(
      lang,
      urgent.length
        ? lang === 'bg'
          ? `Използвай първо ${list(urgent.slice(0, 3).map(name))}. В раздел „Рецепти“ има лесни идеи с тях.`
          : `Use up the ${list(urgent.slice(0, 3).map((i) => name(i).toLowerCase()))} first. The Recipes tab has easy ideas with them.`
        : lang === 'bg'
          ? 'Нищо не бърза. Виж раздел „Рецепти“ за идеи.'
          : 'Nothing is urgent. Have a look at the Recipes tab for ideas.',
    );
  }

  // "What should I eat first?" / "Какво изтича?" (also the default for "what's in the fridge")
  if (/expir|first|going bad|use up|soon|what'?s in|изтича|първо|развал|скоро|какво има/.test(q)) {
    const fridgeItems = inFridge.filter((i) => i.location === 'fridge').sort(byUrgency);
    const now = fridgeItems.filter((i) => ['eat', 'toss'].includes(freshness(i, today)));
    const next = fridgeItems.filter((i) => freshness(i, today) === 'soon');
    if (!now.length && !next.length) return reply(lang, t('all_fresh'));
    const names = (xs: Item[]) => list([...new Set(xs.slice(0, 4).map((i) => name(i).toLowerCase()))]);
    const later = next.slice(0, 3).map((i) => `${name(i).toLowerCase()} (${relativeDay(i.eatBy, today, lang)})`);
    const parts =
      lang === 'bg'
        ? [now.length ? `Използвай днес: ${names(now)}.` : '', later.length ? `После: ${list(later)}.` : '']
        : [now.length ? `Use these today: ${names(now)}.` : '', later.length ? `Next up: ${list(later)}.` : ''];
    return reply(lang, parts.filter(Boolean).join(' '));
  }

  return reply(
    lang,
    lang === 'bg'
      ? 'В този преглед разбирам прости неща: „Какво да изядем първо?“, „Имаме ли яйца?“, „Свършихме млякото“, „Замрази пилешкото“. Истинският асистент ще отговаря на всичко.'
      : 'In this preview I understand simple things like "What should I eat first?", "Do we have eggs?", "We finished the milk" or "Freeze the chicken". The real assistant will handle anything.',
  );
}
