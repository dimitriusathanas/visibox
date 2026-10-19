// Packs the exported web build (dist/) into one self-contained page body for
// a hosted preview: title, theme-aware background, the root element and the
// app bundle inlined. The host page supplies <html>, <head> and <body>.
//
// Usage: npm run build:preview && node scripts/package-preview.mjs out.html
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2];
if (!out) throw new Error('Usage: node scripts/package-preview.mjs <out.html>');

const dir = 'dist/_expo/static/js/web';
const bundles = readdirSync(dir).filter((f) => f.endsWith('.js'));
if (bundles.length !== 1) throw new Error(`Expected one web bundle, found ${bundles.length}`);
let js = readFileSync(join(dir, bundles[0]), 'utf8');

// Keep the HTML parser from reading anything in the bundle as markup.
if (/<\/script/i.test(js)) throw new Error('Bundle contains a closing script tag');
js = js.replaceAll('/<!--/', '/<\\!--/');
if (js.includes('<!--')) throw new Error('Bundle contains an HTML comment opener outside the known regex');

const page = `<title>Virtual Fridge</title>
<style>
  /* One-screen app: the bundle draws everything; this only sets the ground under it. */
  :root { --ground: #EEF3F6; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --ground: #0C1318; color-scheme: dark; } }
  :root[data-theme="dark"] { --ground: #0C1318; color-scheme: dark; }
  html { box-sizing: border-box; height: 100%; }
  body { height: 100%; margin: 0; overflow: hidden; background: var(--ground); }
  #root { display: flex; height: 100%; flex: 1; }
</style>
<noscript>Virtual Fridge needs JavaScript to run.</noscript>
<div id="root"></div>
<script>${js}</script>
`;

writeFileSync(out, page);
console.log(`Wrote ${out} (${(page.length / 1024 / 1024).toFixed(2)} MB)`);
