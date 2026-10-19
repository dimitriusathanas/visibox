// POST { image: base64 JPEG/PNG, mediaType, lang } → ReceiptParse
// Reads a grocery receipt photo with Claude: every purchased line, decoded
// (Bulgarian abbreviations included), sorted into fridge / freezer / pantry /
// household / skip, and matched to a USDA FoodKeeper entry for its dates.

import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.131.0/helpers/beta/zod';
import { z } from 'npm:zod@4.6.5';

import { caller } from '../_lib/auth.ts';
import { anthropic, assertAnswered, fallbackFor, MODEL } from '../_lib/claude.ts';
import { handler, HttpError, json } from '../_lib/http.ts';
import { FOOD_BY_ID } from '../_shared/foods.ts';
import { FOODKEEPER } from '../_shared/foodkeeper.data.ts';
import { BUCKETS, UNITS, type ReceiptParse } from '../_shared/types.ts';

const Days = z.array(z.number()).nullable();

const Line = z.object({
  raw: z.string().describe('The line as printed'),
  name_en: z.string(),
  name_bg: z.string(),
  emoji: z.string(),
  destination: z.enum(['fridge', 'freezer', 'pantry', 'household', 'skip']),
  bucket: z.enum(BUCKETS as [string, ...string[]]),
  qty: z.number(),
  unit: z.enum(UNITS as [string, ...string[]]),
  price: z.number().nullable(),
  food_id: z.string().nullable(),
  estimate_days: z.object({ fridge: Days, freezer: Days, opened: Days }).nullable(),
  confidence: z.enum(['high', 'low']),
  note: z.string().nullable(),
});

const Receipt = z.object({
  store: z.string().nullable(),
  date: z.string().nullable(),
  currency: z.string().nullable(),
  image_quality: z.enum(['good', 'poor']),
  lines: z.array(Line),
});

// The USDA list, grouped by category; ids are descriptive slugs.
const INDEX = (() => {
  const byCat = new Map<string, string[]>();
  for (const f of FOODKEEPER) byCat.set(f.cat, [...(byCat.get(f.cat) ?? []), f.id]);
  return [...byCat].map(([cat, ids]) => `## ${cat}\n${ids.join(', ')}`).join('\n');
})();

const INSTRUCTIONS = `You read photos of grocery receipts for a family's fridge app. The family is in Bulgaria and speaks Bulgarian and English; receipts are usually Bulgarian (Cyrillic, all caps, heavy abbreviations) but can be in any language.

Return every purchased line. Ignore totals, subtotals, VAT, payment, change, loyalty and header lines. Merge a line and its quantity line ("2 x 1.05") into one item.

For each item:
- raw: the item text as printed.
- name_en / name_bg: a natural, short name in English and in Bulgarian (sentence case, no all caps; drop brands unless they matter, e.g. "Кашкавал", "Yellow cheese"). Decode abbreviations: ПИЛ. = пилешко, ОХЛ. = охладено, ЗАМР. = замразено, БР = бройки, КР./КРАВЕ = краве, etc.
- emoji: one emoji that shows the food.
- destination:
  - fridge: perishable food normally kept cold: meat, fish, dairy, eggs, deli, fresh produce, bread and tortillas (this family keeps bread in the fridge), ready meals, opened-style sauces like lyutenitsa only if sold refrigerated.
  - freezer: anything sold frozen.
  - pantry: shelf-stable food: pasta, rice, flour, sugar, oil, canned and jarred goods, spices, snacks, coffee, tea, and every drink except milk and dairy drinks (milk, ayran, kefir go in the fridge). Potatoes, onions, garlic and whole melons go here too.
  - household: non-food: cleaning products, paper goods, toiletries, batteries.
  - skip: bags, bottle deposits, discounts, gift cards and anything that isn't a product.
- bucket (for fridge and freezer items): fruits; veggies; meats (meat, poultry, fish, seafood, deli meats, sausages); dairy (milk, yogurt, cheese, butter, cream, eggs); grains (bread, tortillas, fresh pasta, dough, pastries); precooked (store-bought ready meals, salads, rotisserie chicken, banitsa); other (sauces, spreads, jars, tofu). Never "cooked" (that is for home cooking). For pantry and household lines use your best guess.
- qty and unit: packaged goods are counted (pcs, or pack for bags, boxes and trays): "КИСЕЛО МЛЯКО 400Г x2" is 2 pcs, "СПАНАК 400Г" is 1 pack, "ЯЙЦА 10БР" is 10 pcs. Loose goods sold by weight use the printed weight in g (or kg when 1 kg or more): "ДОМАТИ 0.742КГ" is 742 g. Liquids by volume use ml or l.
- price: the final price paid for the line, as a number; null if unreadable.
- food_id: the best matching id from the USDA FoodKeeper list below, or null when nothing fits. Prefer the most specific entry (boneless chicken breast → chicken-parts-breast-halves-boneless). Bulgarian foods: сирене (white brined cheese) → cheese-soft-such-as-brie-bel-paese-goat; кашкавал → cheese-hard-such-as-cheddar-swiss-block-parmesan; кисело мляко → yogurt; айрян → kefir-fermented-milk; луканка, суджук → sausage-hard-dry-pepperoni-sliced; кренвирши → hot-dogs; кайма → beef-ground (or pork-ground).
- estimate_days: only when food_id is null and the item is food: [min, max] days it keeps in the fridge, in the freezer, and after opening; null for any you can't estimate.
- confidence: low when the text is hard to read or the abbreviation could mean different things; otherwise high.
- note: when confidence is low, one short sentence in the user's language saying what you assumed; otherwise null.

Also return: store (the shop's name), date (purchase date as YYYY-MM-DD, null if missing), currency (ISO code; Bulgaria has used EUR since 2026, older receipts may say BGN/лв.), and image_quality: poor when the photo is too blurry, dark or cut off to read most lines (then return what you can read).

USDA FoodKeeper ids, by category:
${INDEX}`;

Deno.serve(
  handler(async (req) => {
    await caller(req);
    const body = await req.json().catch(() => null);
    const image: string | undefined = body?.image;
    const mediaType = ['image/jpeg', 'image/png', 'image/webp'].includes(body?.mediaType) ? body.mediaType : 'image/jpeg';
    const lang = body?.lang === 'bg' ? 'bg' : 'en';
    if (!image || image.length < 100) throw new HttpError(400, 'Send the receipt photo as base64');
    if (image.length > 14_000_000) throw new HttpError(413, 'Photo is too large');

    const message = await anthropic.beta.messages.parse({
      model: MODEL.receipt,
      max_tokens: 16000,
      ...fallbackFor(MODEL.receipt),
      system: [{ type: 'text', text: INSTRUCTIONS, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: `Read this receipt. The user's language is ${lang === 'bg' ? 'Bulgarian' : 'English'}.` },
          ],
        },
      ],
      output_config: { effort: 'medium', format: betaZodOutputFormat(Receipt) },
    });
    assertAnswered(message);
    const parsed = message.parsed_output;
    if (!parsed) throw new HttpError(502, 'Could not read the receipt');

    // Keep only ids that exist in the table; the app falls back to estimates otherwise.
    const result = {
      ...parsed,
      lines: parsed.lines.map((l) => ({ ...l, food_id: l.food_id && FOOD_BY_ID.has(l.food_id) ? l.food_id : null })),
    } as ReceiptParse;
    return json(result);
  }),
);
