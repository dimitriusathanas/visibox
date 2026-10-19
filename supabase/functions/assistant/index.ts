// POST multipart { audio, payload } or JSON payload
//   payload: { householdId, timeZone, lang, history, text? }
// → { transcript, reply, lang, audio?, change, saved, actions }
//
// Hold-to-talk: speech to text (OpenAI), Claude answers from the family's
// fridge and edits it with tools (web search when needed), the change is saved
// as the caller, and the reply comes back as speech (ElevenLabs or OpenAI).

import type Anthropic from 'npm:@anthropic-ai/sdk@0.131.0';

import { actionLabels, detectLang, fridgeList, fridgeTools, parsePayload, type Payload } from '../_lib/assistantCore.ts';
import { caller } from '../_lib/auth.ts';
import { anthropic, fallbackFor, MODEL } from '../_lib/claude.ts';
import { handler, HttpError, json } from '../_lib/http.ts';
import { synthesize, transcribe } from '../_lib/speech.ts';
import { loadItems, saveChange } from '../_lib/store.ts';
import { localDay } from '../_shared/dates.ts';
import type { ActionContext } from '../_shared/transitions.ts';
import { BUCKETS, UNITS } from '../_shared/types.ts';

const SYSTEM = `You are the voice assistant in a family's shared fridge app. People hold a button, speak, and hear your answer read aloud.

- Reply in the language the person spoke (Bulgarian or English).
- Keep it spoken and short: one to three sentences, no lists, no markdown, no emoji. Say dates the way people do ("tomorrow", "on Thursday").
- You can see everything in the fridge, freezer and pantry, with eat-by dates (best quality) and toss-by dates (likely spoiled).
- When someone says they ate, finished, threw out, cooked, froze, took out, opened or bought something, update the list with the tools, then confirm in a few words what you changed. If several entries match, use the one that expires first. If it's unclear which item or how much, ask one short question instead of guessing.
- Food safety: be conservative and follow USDA guidance; when in doubt, say to throw it out.
- Use web search only when the list and general cooking knowledge can't answer (a specific product, a store, a substitution you're unsure of).
- For meal ideas, suggest one or two very simple dishes built on what expires soonest.`;

const TOOLS: Anthropic.Beta.BetaToolUnion[] = [
  {
    name: 'update_items',
    description:
      'Record what happened to food already on the list: eaten, thrown away, cooked, frozen, taken out of the freezer (thaw), opened, a corrected quantity, or deleted because it was added by mistake. Use item ids from the list.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        changes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              item_id: { type: 'string' },
              action: { type: 'string', enum: ['eat', 'toss', 'cook', 'freeze', 'thaw', 'open', 'set_quantity', 'delete'] },
              amount: {
                type: ['number', 'null'],
                description: "How much, in the item's unit; null means all of it. For set_quantity, the new quantity.",
              },
            },
            required: ['item_id', 'action', 'amount'],
            additionalProperties: false,
          },
        },
      },
      required: ['changes'],
      additionalProperties: false,
    },
  },
  {
    name: 'add_items',
    description: 'Add food that was just bought or cooked to the fridge, freezer or pantry.',
    strict: true,
    input_schema: {
      type: 'object',
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name_en: { type: 'string' },
              name_bg: { type: 'string' },
              emoji: { type: 'string' },
              bucket: { type: 'string', enum: [...BUCKETS] },
              location: { type: 'string', enum: ['fridge', 'freezer', 'pantry'] },
              qty: { type: 'number' },
              unit: { type: 'string', enum: [...UNITS] },
              cooked: { type: 'boolean', description: 'True for home-cooked dishes and leftovers.' },
            },
            required: ['name_en', 'name_bg', 'emoji', 'bucket', 'location', 'qty', 'unit', 'cooked'],
            additionalProperties: false,
          },
        },
      },
      required: ['items'],
      additionalProperties: false,
    },
  },
  { type: 'web_search_20260209', name: 'web_search', max_uses: 2 },
];

Deno.serve(
  handler(async (req) => {
    const { db, user } = await caller(req);

    let payload: Payload;
    let audio: File | null = null;
    if ((req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await req.formData();
      payload = parsePayload(JSON.parse(String(form.get('payload') ?? '{}')));
      const file = form.get('audio');
      if (file instanceof File) audio = file;
    } else {
      payload = parsePayload(await req.json().catch(() => null));
    }
    if (audio && audio.size > 20_000_000) throw new HttpError(413, 'Recording is too long');

    const { data: member } = await db
      .from('household_members')
      .select('display_name')
      .eq('household_id', payload.householdId)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!member) throw new HttpError(403, 'Not a member of this fridge');

    const items = await loadItems(db, payload.householdId);
    const now = new Date();
    const today = localDay(now, payload.timeZone);

    const transcript = audio
      ? await transcribe(
          audio,
          [...new Set(items.flatMap((i) => [i.name.en, i.name.bg]))].filter(Boolean),
        )
      : (payload.text ?? '');
    if (!transcript) {
      return json({ transcript: '', reply: '', lang: payload.lang, change: null, saved: false, actions: [] });
    }

    const ctx: ActionContext = {
      householdId: payload.householdId,
      now: now.toISOString(),
      timeZone: payload.timeZone,
      newId: () => crypto.randomUUID(),
      by: user.id,
      byName: (member as { display_name?: string }).display_name || undefined,
    };
    const tools = fridgeTools(items, ctx);

    const messages: Anthropic.Beta.BetaMessageParam[] = [
      ...payload.history.map((h) => ({ role: h.role, content: h.text })),
      {
        role: 'user',
        content: `Today is ${today} (${payload.timeZone}). Family member speaking: ${ctx.byName ?? 'unknown'}.

<fridge>
${fridgeList(items, today)}
</fridge>

They said: ${transcript}`,
      },
    ];
    // History must start with a user turn.
    while (messages.length && messages[0].role !== 'user') messages.shift();

    let reply = '';
    for (let turn = 0; turn < 5; turn++) {
      const message = await anthropic.beta.messages.create({
        model: MODEL.assistant,
        max_tokens: 4000,
        ...fallbackFor(MODEL.assistant),
        system: [{ type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } }],
        tools: TOOLS,
        messages,
        output_config: { effort: 'low' },
      });
      if (message.stop_reason === 'refusal') {
        reply = payload.lang === 'bg' ? 'Не мога да помогна с това.' : "I can't help with that one.";
        break;
      }
      const text = message.content
        .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === 'text')
        .map((b) => b.text)
        .join(' ')
        .trim();
      if (message.stop_reason === 'pause_turn') {
        messages.push({ role: 'assistant', content: message.content });
        continue;
      }
      const calls = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use');
      if (message.stop_reason !== 'tool_use' || !calls.length) {
        reply = text;
        break;
      }
      messages.push({ role: 'assistant', content: message.content });
      messages.push({
        role: 'user',
        content: calls.map((call) => {
          try {
            return { type: 'tool_result' as const, tool_use_id: call.id, content: tools.runTool(call.name, call.input) };
          } catch (e) {
            return { type: 'tool_result' as const, tool_use_id: call.id, is_error: true, content: String(e) };
          }
        }),
      });
    }

    const change = tools.change;
    if (change.upserts.length || change.removes.length || change.events.length) await saveChange(db, change);
    const lang = detectLang(reply || transcript, payload.lang);
    const speech = reply ? await synthesize(reply, lang) : undefined;
    return json({
      transcript,
      reply,
      lang,
      audio: speech,
      change,
      saved: true,
      actions: actionLabels(change, lang),
    });
  }),
);
