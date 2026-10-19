// The edge functions run on Deno and can't import from the app's src/ folder
// when deployed, so the shared domain code is copied next to them.
// Run after editing anything in src/shared or src/i18n/strings.ts:
//   npm run sync:shared
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, 'supabase/functions/_shared');
mkdirSync(target, { recursive: true });

const files = [
  ['src/shared/types.ts', 'types.ts'],
  ['src/shared/foods.ts', 'foods.ts'],
  ['src/shared/foodkeeper.data.ts', 'foodkeeper.data.ts'],
  ['src/shared/dates.ts', 'dates.ts'],
  ['src/shared/transitions.ts', 'transitions.ts'],
  ['src/i18n/strings.ts', 'strings.ts'],
];

for (const [from, to] of files) {
  const src = readFileSync(join(root, from), 'utf8');
  writeFileSync(join(target, to), `// Copied from ${from} by scripts/sync-shared.mjs. Edit the original.\n${src}`);
}
console.log(`Synced ${files.length} files to supabase/functions/_shared`);
