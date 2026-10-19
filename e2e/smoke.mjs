// Phone-sized smoke test of the exported web build with real touch input:
// swipe right (cooked), swipe left (ate it), long-press drag into the freezer.
//
// Usage: npm run build:web && node e2e/smoke.mjs [outDir]
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright-core';

import { serve } from './serve.mjs';

const out = process.argv[2] ?? 'e2e/screens';
mkdirSync(out, { recursive: true });
const server = await serve('dist');
const url = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
});
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
const cdp = await context.newCDPSession(page);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function touch(type, x, y) {
  await cdp.send('Input.dispatchTouchEvent', {
    type,
    touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1, radiusX: 4, radiusY: 4, force: 1 }],
  });
}
async function drag(from, to, { hold = 0, steps = 14, stepMs = 16 } = {}) {
  await touch('touchStart', from.x, from.y);
  if (hold) await sleep(hold);
  for (let i = 1; i <= steps; i++) {
    await touch('touchMove', from.x + ((to.x - from.x) * i) / steps, from.y + ((to.y - from.y) * i) / steps);
    await sleep(stepMs);
  }
  await sleep(60);
  await touch('touchEnd', to.x, to.y);
}
async function centerOf(locator) {
  // Keep the row clear of the freezer bar and tab bar at the bottom.
  await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await sleep(250);
  const b = await locator.boundingBox();
  if (!b) throw new Error('element not visible');
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, box: b };
}
const shot = (name) => page.screenshot({ path: join(out, `${name}.png`) });
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
};

await page.goto(url);
await page.waitForSelector('[data-testid="tab-fridge"]', { timeout: 30000 });
await sleep(600);
await shot('01-assistant');

await page.tap('[data-testid="tab-fridge"]');
await page.waitForSelector('[data-testid^="bucket-"]', { timeout: 10000 });
await sleep(500);
await shot('02-fridge');

const rowText = async (id) => (await page.locator(`[data-testid="item-${id}"]`).count()) > 0;
const rowIdByName = async (name) => {
  const rows = page.locator('[data-testid^="item-"]');
  const n = await rows.count();
  for (let i = 0; i < n; i++) {
    const r = rows.nth(i);
    if ((await r.innerText()).includes(name)) return (await r.getAttribute('data-testid')).slice(5);
  }
  return null;
};

// 1. Swipe right on chicken = cooked → moves to "Cooked at home".
const chickenId = await rowIdByName('Chicken breast');
check('chicken row present', Boolean(chickenId));
if (chickenId) {
  const c = await centerOf(page.locator(`[data-testid="item-${chickenId}"]`));
  await drag({ x: c.box.x + 40, y: c.y }, { x: c.box.x + c.box.width - 10, y: c.y }, { steps: 10 });
  await sleep(900);
  await shot('03-after-cook');
  const cookedBucket = await page.locator('[data-testid="bucket-cooked"]').innerText();
  check('swipe right cooks the chicken', cookedBucket.includes('Chicken breast'), cookedBucket.split('\n')[0]);
  const toast = await page.locator('[data-testid="toast"]').innerText().catch(() => '');
  check('toast after cooking', toast.includes('Cooked'), toast.replace(/\n/g, ' | '));
  await page.tap('[data-testid="toast-undo"]');
  await sleep(500);
  const meats = await page.locator('[data-testid="bucket-meats"]').innerText().catch(() => '');
  check('undo puts it back', meats.includes('Chicken breast'));
}

// 2. Swipe left on a single item (milk) = ate it → gone, with "Tossed it instead".
const milkId = await rowIdByName('Milk');
if (milkId) {
  const c = await centerOf(page.locator(`[data-testid="item-${milkId}"]`));
  await drag({ x: c.box.x + c.box.width - 40, y: c.y }, { x: c.box.x + 10, y: c.y }, { steps: 10 });
  await sleep(900);
  check('swipe left removes milk', !(await rowText(milkId)));
  const hasToss = (await page.locator('[data-testid="toast-toss"]').count()) > 0;
  check('offers "Tossed it instead"', hasToss);
  await shot('04-after-ate');
}

// 3. Swipe left on eggs (×8) asks how many.
const eggsId = await rowIdByName('Eggs');
if (eggsId) {
  const c = await centerOf(page.locator(`[data-testid="item-${eggsId}"]`));
  await drag({ x: c.box.x + c.box.width - 40, y: c.y }, { x: c.box.x + 10, y: c.y }, { steps: 10 });
  await sleep(700);
  const picker = (await page.locator('[data-testid="qty-2"]').count()) > 0;
  check('eggs swipe asks how many', picker);
  if (picker) {
    await page.tap('[data-testid="qty-2"]');
    await page.tap('[data-testid="qty-confirm"]');
    await sleep(600);
    const row = await page.locator(`[data-testid="item-${eggsId}"]`).innerText();
    check('2 eggs eaten leaves ×6', row.includes('×6'), row.replace(/\n/g, ' | '));
  }
}

// 4. Vertical scroll still works over rows.
const scrollTop = () =>
  page.evaluate(() => {
    const el = [...document.querySelectorAll('div')].find(
      (d) => d.scrollHeight > d.clientHeight + 50 && getComputedStyle(d).overflowY !== 'visible',
    );
    return el ? el.scrollTop : -1;
  });
await page.locator('[data-testid^="item-"]').first().evaluate((el) => el.scrollIntoView({ block: 'start' }));
await sleep(300);
const before = await scrollTop();
await drag({ x: 200, y: 600 }, { x: 200, y: 300 }, { steps: 12 });
await sleep(500);
const after = await scrollTop();
check('vertical swipe scrolls the list', after > before, `${before} → ${after}`);
await shot('05-scrolled');

// 5. Long-press drag a row onto the freezer bar = frozen.
const strawId = await rowIdByName('Strawberries');
if (strawId) {
  const loc = page.locator(`[data-testid="item-${strawId}"]`);
  await loc.scrollIntoViewIfNeeded();
  await sleep(300);
  const c = await centerOf(loc);
  const bar = await centerOf(page.locator('[data-testid="freezer-bar"]'));
  await touch('touchStart', c.x, c.y);
  await sleep(550);
  for (let i = 1; i <= 16; i++) {
    await touch('touchMove', c.x, c.y + ((bar.y - c.y) * i) / 16);
    await sleep(20);
    if (i === 12) await shot('06-dragging');
  }
  await sleep(80);
  await touch('touchEnd', bar.x, bar.y);
  await sleep(900);
  check('drag to freezer removes it from the fridge list', !(await rowText(strawId)));
  await page.tap('[data-testid="freezer-bar"]');
  await sleep(600);
  const panel = await page.locator('[data-testid="freezer-panel"]').innerText().catch(() => '');
  check('strawberries are in the freezer', panel.includes('Strawberries'), panel.split('\n').slice(0, 2).join(' | '));
  await shot('07-freezer');
}

check('no page errors', errors.length === 0, errors.slice(0, 5).join(' || '));
await browser.close();
server.close();
process.exit(results.every((r) => r.ok) ? 0 : 1);
