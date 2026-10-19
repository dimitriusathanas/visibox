// POST { items, staples, diet, lang, exclude } → { recipes }
// Very simple recipes built around the 2-3 fridge items that expire soonest.

import { betaZodOutputFormat } from 'npm:@anthropic-ai/sdk@0.131.0/helpers/beta/zod';
import { z } from 'npm:zod@4.6.5';

import { caller } from '../_lib/auth.ts';
import { anthropic, assertAnswered, fallbackFor, MODEL } from '../_lib/claude.ts';
import { handler, HttpError, json } from '../_lib/http.ts';
import { convertAmount } from '../_shared/transitions.ts';
import { UNITS, type Unit } from '../_shared/types.ts';

const Recipe = z.object({
  title: z.string(),
  minutes: z.number(),
  servings: z.number(),
  uses: z.array(
    z.object({
      itemId: z.string(),
      amount: z.number(),
      unit: z.enum(UNITS as [string, ...string[]]),
      label: z.string().describe('Ingredient as shown on the card, e.g. "Spinach"'),
    }),
  ),
  staples: z.array(z.string()),
  steps: z.array(z.string()),
  dish: z.object({
    name_en: z.string(),
    name_bg: z.string(),
    emoji: z.string(),
    kind: z.enum(['poultry', 'meat', 'fish', 'shellfish', 'egg', 'rice', 'pasta', 'soup', 'veg', 'pizza']),
  }),
});

const Output = z.object({ recipes: z.array(Recipe) });

const INSTRUCTIONS = `You suggest very simple home recipes that use up food before it expires, for a family in Bulgaria. Write in the language you are asked for (Bulgarian or English); Bulgarian home cooking is welcome.

Rules:
- Give 3 to 5 recipes. Each is built around 2 or 3 of the fridge items that expire soonest (earliest eat_by), and may use other fridge items too.
- Only use fridge items from the list (by their id) and the pantry staples the family says they always have. Nothing else.
- Amounts are in the item's own unit and never more than the family has. For counted items (pcs, pack) use whole or half units.
- At most 5 short steps, about 30 minutes or less, no special equipment.
- Respect the diet notes strictly.
- Don't repeat any title from the exclude list, and make the recipes different from each other.
- dish: the name of the cooked dish in English and Bulgarian, one emoji, and kind: what the leftovers mostly are (poultry, meat, fish, shellfish, egg, rice, pasta, soup, veg, pizza), which decides how long they keep.`;

interface InItem {
  id: string;
  name: string;
  qty: number;
  unit: Unit;
  eatBy: string;
  tossBy: string;
  bucket: string;
}

Deno.serve(
  handler(async (req) => {
    await caller(req);
    const body = await req.json().catch(() => null);
    const items: InItem[] = Array.isArray(body?.items) ? body.items.slice(0, 120) : [];
    if (!items.length) throw new HttpError(400, 'No fridge items');
    const lang = body?.lang === 'bg' ? 'bg' : 'en';
    const staples: string[] = Array.isArray(body?.staples) ? body.staples.slice(0, 30) : [];
    const exclude: string[] = Array.isArray(body?.exclude) ? body.exclude.slice(0, 40) : [];
    const diet = typeof body?.diet === 'string' ? body.diet.slice(0, 300) : '';

    const today = new Date().toISOString().slice(0, 10);
    const lines = [...items]
      .sort((a, b) => (a.eatBy || '9999') < (b.eatBy || '9999') ? -1 : 1)
      .map((i) => `${i.id} | ${i.name} | ${i.qty} ${i.unit} | ${i.bucket} | eat_by ${i.eatBy || '-'} | toss_by ${i.tossBy || '-'}`)
      .join('\n');

    const message = await anthropic.beta.messages.parse({
      model: MODEL.recipes,
      max_tokens: 8000,
      ...fallbackFor(MODEL.recipes),
      system: [{ type: 'text', text: INSTRUCTIONS, cache_control: { type: 'ephemeral' } }],
      messages: [
        {
          role: 'user',
          content: `Language: ${lang === 'bg' ? 'Bulgarian' : 'English'}
Today: ${today}
Fridge items (id | name | amount | shelf | dates), soonest first:
${lines}

Pantry staples: ${staples.join(', ') || 'salt, oil'}
Diet notes: ${diet || 'none'}
Exclude titles: ${exclude.join('; ') || 'none'}`,
        },
      ],
      output_config: { effort: 'low', format: betaZodOutputFormat(Output) },
    });
    assertAnswered(message);
    const parsed = message.parsed_output;
    if (!parsed) throw new HttpError(502, 'No recipes came back');

    // Keep only uses of real items, in their unit, within what's there.
    const byId = new Map(items.map((i) => [i.id, i]));
    const recipes = parsed.recipes
      .map((r) => ({
        ...r,
        steps: r.steps.slice(0, 6),
        uses: r.uses.flatMap((u) => {
          const item = byId.get(u.itemId);
          if (!item) return [];
          const amount = convertAmount(u.amount, u.unit as Unit, item.unit) ?? item.qty;
          return [{ ...u, unit: item.unit, amount: Math.max(0, Math.min(item.qty, amount)) }];
        }),
      }))
      .filter((r) => r.uses.length > 0);
    return json({ recipes });
  }),
);
