// End-to-end flows on the exported web build (offline preview mode):
// receipt scan → confirm → items land in the fridge; recipes cooked and skipped;
// the assistant answers and edits the fridge; switching to Bulgarian.
//
// Usage: npm run build:preview && node e2e/flows.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { chromium } from 'playwright-core';

import { serve } from './serve.mjs';

const out = process.argv[2] ?? 'e2e/screens';
mkdirSync(out, { recursive: true });

// A plain white "receipt" PNG for the file picker.
function png(width, height) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buf) => {
    let c = 0xffffffff;
    for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const sum = Buffer.alloc(4);
    sum.writeUInt32BE(crc(body));
    return Buffer.concat([len, body, sum]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = Buffer.alloc((width * 3 + 1) * height, 0xff);
  for (let y = 0; y < height; y++) rows[y * (width * 3 + 1)] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(rows)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const receiptPath = join(out, 'receipt.png');
writeFileSync(receiptPath, png(300, 800));

const server = await serve('dist');
const url = `http://127.0.0.1:${server.address().port}/`;
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'en-US',
  timezoneId: 'Europe/Sofia',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => m.type() === 'error' && errors.push(`console: ${m.text()}`));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const results = [];
const check = (name, ok, detail = '') => {
  results.push(ok);
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};
const text = (sel) => page.locator(sel).first().innerText().catch(() => '');
const count = async () => Number((await text('[data-testid="tab-fridge"]')) && (await page.locator('text=/\\d+ items/').first().innerText()).match(/\d+/)?.[0]);

await page.goto(url);
await page.waitForSelector('[data-testid="mic"]', { timeout: 30000 });
await sleep(500);
await shot('10-assistant');
const today = await text('[data-testid="today-card"]');
check('assistant shows things to use today', /to use today|Use soon|fresh/.test(today), today.split('\n')[0]);

// Assistant (typed, offline): question, then a command that edits the fridge.
await page.tap('[data-testid="example_1"]');
await sleep(900);
let convo = await page.locator('body').innerText();
check('assistant answers "what first"', /Use these today|Next up/.test(convo), '');
await page.tap('[data-testid="type-instead"]');
await page.fill('[data-testid="assistant-input"]', 'We finished the yogurt');
await page.tap('[data-testid="assistant-send"]');
await sleep(900);
convo = await page.locator('body').innerText();
check('assistant removes yogurt', /took the yogurt off/i.test(convo));
await shot('11-assistant-convo');

// Receipt scan (offline preview reads a sample receipt).
await page.tap('[data-testid="tab-fridge"]');
await sleep(400);
const before = await count();
await page.tap('[data-testid="fridge-scan"]');
await page.waitForSelector('[data-testid="scan-choose"]');
await shot('12-scan-pick');
const chooser = page.waitForEvent('filechooser', { timeout: 10000 });
await page.tap('[data-testid="scan-choose"]');
await (await chooser).setFiles(receiptPath);
await page.waitForSelector('[data-testid="scan-question"]', { timeout: 20000 });
await sleep(300);
await shot('13-scan-review');
const q = await text('[data-testid="scan-question"]');
check('receipt asks Y/N with a count', /Add these \d+ items\?/.test(q), q);
await page.tap('[data-testid="scan-yes"]');
await sleep(900);
const after = await count();
check('confirming adds the fridge items', after > before, `${before} → ${after}`);
await shot('14-after-scan');
const pantryRows = await (async () => {
  await page.tap('[data-testid="tab-pantry"]');
  await sleep(400);
  return page.locator('body').innerText();
})();
check('pantry and household lines land in the pantry', /Spaghetti/.test(pantryRows) && /Paper towels/.test(pantryRows));
await shot('15-pantry');

// Recipes: cook the top idea without leftovers, then skip the next one by swiping.
await page.tap('[data-testid="tab-recipes"]');
await page.waitForSelector('[data-testid="recipe-card"]', { timeout: 10000 });
await sleep(300);
await shot('16-recipes');
const firstTitle = (await text('[data-testid="recipe-card"]')).split('\n')[1];
await page.tap('[data-testid="recipe-cooked"]');
await page.waitForSelector('[data-testid="leftovers-save"]');
await shot('17-leftovers');
await page.tap('[data-testid="leftovers-save"]');
await sleep(800);
const toast = await text('[data-testid="toast"]');
check('cooking a recipe stores leftovers', /Leftovers are in Cooked at home/.test(toast), toast.replace(/\n/g, ' | '));
const nextTitle = (await text('[data-testid="recipe-card"]')).split('\n')[1];
check('cooked recipe leaves the stack', nextTitle !== firstTitle, `${firstTitle} → ${nextTitle}`);
const cdp = await context.newCDPSession(page);
const touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
const card = await page.locator('[data-testid="recipe-card"]').boundingBox();
if (card) {
  const y = card.y + 120;
  await touch('touchStart', card.x + card.width - 40, y);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', card.x + card.width - 40 - (card.width - 40) * (i / 10), y);
    await sleep(16);
  }
  await touch('touchEnd', 0, 0);
  await sleep(700);
  const third = (await text('[data-testid="recipe-card"]')).split('\n')[1];
  check('swipe left skips a recipe', third !== nextTitle, `${nextTitle} → ${third}`);
}
await page.tap('[data-testid="tab-fridge"]');
await sleep(400);
await page.tap('[data-testid="fridge-view-list"]');
const cookedBucket = await text('[data-testid="bucket-cooked"]');
check('leftovers appear in Cooked at home', cookedBucket.split('\n').length > 2, cookedBucket.split('\n')[0]);

// Bulgarian.
await page.tap('[data-testid="tab-assistant"]');
await page.tap('[data-testid="open-settings"]');
await page.tap('[data-testid="lang-bg"]');
await sleep(300);
await page.keyboard.press('Escape');
await page.mouse.click(195, 40);
await sleep(400);
await page.tap('[data-testid="tab-fridge"]');
await sleep(400);
const bgTab = await text('[data-testid="tab-fridge"]');
check('Bulgarian UI', bgTab.includes('Хладилник'), bgTab);
await shot('18-fridge-bg');

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' || '));
await browser.close();
server.close();
process.exit(results.every(Boolean) ? 0 : 1);
