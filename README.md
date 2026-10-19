# Virtual Fridge

A shared family fridge on your phone. Scan a grocery receipt and the food lands in the fridge with eat-by and toss-by dates from the USDA FoodKeeper data. Swipe items as you use them, drag them into the freezer, get very simple recipes for what's about to expire, and ask the voice assistant about any of it, in English or Bulgarian.

## What's in the app

- **Assistant** (home): hold the mic and ask "What should we eat first?", "Do we have eggs?", or say "We finished the milk" and it updates the fridge. Shows what to use today and what the family did recently.
- **Fridge**: shelves for fruits, veggies, meat & fish, dairy & eggs, bread & grains, ready meals, cooked at home, and sauces & other. Search, a "Use soon" row, `+` to add by hand (English or Bulgarian names), and the camera to scan a receipt.
  - Swipe right: cooked. It moves to "Cooked at home" with leftover dates.
  - Swipe left: ate it. The undo bar also offers "Tossed it instead", which feeds the "tossed this month" total.
  - Hold and drag onto the freezer bar: frozen. In the freezer, hold and drag up to take it out; it gets thawed dates.
  - Counted items (eggs ×10) ask how many; partial actions split the entry so each part keeps its own dates.
  - Tap an item for its dates and where they come from, the package date, quantity, opened, and history.
- **Recipes**: a card stack of 3 to 5 easy dishes built on what expires soonest. Swipe right (or "I cooked it") uses up the ingredients and asks about leftovers; swipe left skips.
- **Pantry**: receipt lines that don't go in the fridge, split into food and household goods.

## Run it

```bash
npm install
npm run web          # in the browser at phone size
npx expo start       # on a phone with Expo Go (scan the QR code)
```

Without a Supabase project the app keeps the fridge on the device and the AI features run as offline stand-ins: a sample receipt, template recipes, and an assistant that understands a few simple sentences. `npm run build:preview` builds that version with a sample fridge preloaded.

## Connect the family fridge (Supabase)

This turns on sign-in, the shared fridge with live sync between phones, and the real AI: Claude reads receipts, writes recipes and runs the assistant; OpenAI transcribes speech; ElevenLabs (or OpenAI) speaks the replies.

1. Create a project at supabase.com and install the [Supabase CLI](https://supabase.com/docs/guides/cli).
2. Link it and create the tables:
   ```bash
   supabase link --project-ref YOUR_PROJECT_REF
   supabase db push
   ```
3. Sign-in by emailed code: in Authentication → Emails → "Magic link", add `{{ .Token }}` to the template so the email contains the 6-digit code (the link also works on the web). Set the Site URL to wherever the web app is hosted.
4. Add the AI keys as function secrets (they never go in the app):
   ```bash
   supabase secrets set ANTHROPIC_API_KEY=... OPENAI_API_KEY=...
   # Optional, for the most natural Bulgarian voice:
   supabase secrets set ELEVENLABS_API_KEY=... ELEVENLABS_VOICE_ID=...
   ```
5. Deploy the functions:
   ```bash
   npm run sync:shared
   supabase functions deploy receipt recipes assistant
   ```
6. Copy `.env.example` to `.env.local`, fill in the project URL and anon (publishable) key, and rebuild the app.
7. In the app: Settings → sign in → "Start a new fridge", then share the invite code so the family can join.

### Models and settings

| Job | Default | Secret to change it |
| --- | --- | --- |
| Reading receipts | Claude Opus 5.5, medium effort, structured output | `RECEIPT_MODEL` |
| Recipes | Claude Opus 5.5, low effort | `RECIPES_MODEL` |
| Assistant | Claude Opus 5.5, low effort, with Claude's web search | `ASSISTANT_MODEL` (e.g. `claude-haiku-5-5` for faster replies) |
| Speech to text | OpenAI `gpt-transcribe` with Bulgarian and English hints | `TRANSCRIBE_MODEL` |
| Voice | ElevenLabs `eleven_flash_v2_5`, else OpenAI `gpt-4o-mini-tts` | `ELEVENLABS_MODEL`, `ELEVENLABS_VOICE_ID`, `OPENAI_VOICE` |

Requests to Opus use Anthropic's server-side fallback, so a request a safety classifier declines is retried on the recommended model instead of failing.

## How dates work

Each item is matched to one of 661 USDA FoodKeeper entries. Eat by is the start of the USDA range and toss by the end (chicken breast: 1 to 2 days in the fridge, about 9 months frozen, 1 to 2 days after thawing, 3 to 4 days once cooked). Opening an item starts the shorter after-opening clock, never past the unopened date; a date entered from the package wins. Foods the USDA doesn't list get an estimate. The receipt date, not the scan date, starts the clock. All of this is in `src/shared/dates.ts`, with tests.

The FoodKeeper data in `data/` is a 2019 copy of the USDA FSIS dataset (public domain). To refresh it from the official JSON at fsis.usda.gov, convert it to the same CSV columns and run `npm run data:foodkeeper`.

## Project layout

```
App.tsx                 root providers
src/shell/              tab bar and app shell
src/screens/            Assistant, Fridge, Recipes, Pantry
src/components/         item row (swipes and drag), freezer drawer, sheets
src/shared/             domain core shared with the edge functions
src/state/              stores, local and cloud storage, sign-in
src/services/           cloud calls, offline stand-ins, speech
src/i18n/               English and Bulgarian strings
supabase/migrations/    tables and row-level security
supabase/functions/     receipt, recipes, assistant
e2e/                    phone-sized touch tests (Playwright)
```

## Checks

```bash
npm test                                 # unit tests: dates, actions, assistant tools
npm run typecheck
npm run build:preview && npm run e2e     # set CHROMIUM_PATH if Chromium isn't at /opt/pw-browsers/chromium
```

The hosted preview is one self-contained page: `npm run build:preview && npm run package:preview` writes `dist/preview.html` and boots it under a strict content security policy as a check.

## Not done yet

- Native receipt scanning with auto-capture (VisionKit on iOS, ML Kit on Android) needs a development build; the app currently uses the camera or photo picker.
- Voice replies arrive in one piece (a few seconds); streaming would start speaking sooner.
- Daily "use this today" push notifications.
- Recipe ideas and settings (staples, diet) are per phone, not shared with the family yet.
- Changes made offline are queued and replayed; when two people edit the same item, the last edit wins.
