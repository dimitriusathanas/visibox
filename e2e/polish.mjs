// New fridge and assistant interactions. Browser speech recognition is supplied
// deterministically; the waveform still reads Chromium's fake microphone device.
import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { serve } from './serve.mjs';

mkdirSync('e2e/screens', { recursive: true });
const server = await serve('dist');
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium',
  args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'],
});
const check = (name) => console.log(`PASS ${name}`);
try {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: 'en-US', timezoneId: 'America/New_York', permissions: ['microphone'] });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-10-20T18:00:00-04:00') });
  await page.addInitScript(() => {
    window.__phrase = 'Do we have eggs?';
    window.__cancelCount = 0;
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
      getVoices: () => [], cancel: () => { window.__cancelCount++; }, speak: () => {},
    } });
    window.SpeechRecognition = class {
      start() {
        this.timer = setTimeout(() => {
          const row = [{ transcript: window.__phrase }]; row.isFinal = false;
          this.onresult?.({ results: [row] });
        }, 180);
      }
      stop() { clearTimeout(this.timer); this.onend?.(); }
      abort() { clearTimeout(this.timer); this.onend?.(); }
    };
  });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  await page.waitForSelector('[data-testid="assistant-suggestion"]');
  assert.match(await page.getByTestId('assistant-suggestion').innerText(), /tonight/);
  check('6 pm suggestion fits dinner');

  await page.getByTestId('tab-fridge').tap();
  await page.waitForSelector('[data-testid="fridge-cabinet"]');
  assert.match(await page.getByTestId('zone-raw').innerText(), /Chicken breast/);
  assert.match(await page.getByTestId('zone-top').innerText(), /Chicken soup/);
  assert.match(await page.getByTestId('zone-door').innerText(), /Milk/);
  assert.match(await page.getByTestId('zone-door').innerText(), /Eggs/);
  assert.match(await page.getByTestId('zone-fruit').innerText(), /Strawberries/);
  assert.match(await page.getByTestId('zone-veg').innerText(), /Spinach/);
  await page.screenshot({ path: 'e2e/screens/20-fridge-cabinet.png' });
  check('food is placed in the correct physical zones');

  await page.getByTestId('fridge-search').fill('strawberries');
  assert.equal(await page.getByTestId('fridge-cabinet').count(), 0);
  assert.equal(await page.locator('[data-testid^="item-"]').count(), 1);
  await page.getByTestId('fridge-search').fill('');
  await page.getByTestId('fridge-cabinet').waitFor();
  check('search switches to the list and clearing restores shelves');

  await page.getByTestId('fridge-scan').tap();
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('scan-choose').tap();
  await (await chooser).setFiles('assets/icon.png');
  await page.getByTestId('scan-yes').waitFor({ timeout: 15000 });
  await page.getByTestId('scan-yes').tap();
  await page.getByTestId('fridge-cabinet').waitFor();
  const berry = page.getByTestId('zone-fruit').locator('[data-testid^="tile-"]').filter({ hasText: 'Strawberries' });
  await berry.scrollIntoViewIfNeeded();
  await berry.getByText('Strawberries', { exact: true }).waitFor();
  assert.equal(await berry.count(), 1);
  assert.match(await berry.innerText(), /2/);
  await berry.tap();
  await page.getByTestId('stack-sheet').waitFor();
  assert.equal(await page.getByTestId('stack-sheet').locator('[data-testid^="item-"]').count(), 2);
  await page.getByTestId('stack-sheet').locator('[data-testid^="item-"]').first().tap();
  await page.getByTestId('item-sheet').waitFor();
  await page.keyboard.press('Escape');
  check('receipt adds shelf tiles and duplicates open their separate batches');

  await page.getByTestId('freezer-shelf').tap();
  await page.getByTestId('freezer-panel').waitFor();
  await page.getByTestId('freezer-panel').getByRole('button', { name: 'Close', exact: true }).tap();
  check('freezer drawer opens under the cabinet');

  await page.getByTestId('tab-assistant').tap();
  await page.getByTestId('type-instead').tap();
  await page.getByTestId('assistant-input').fill('We finished the milk and yogurt');
  await page.getByTestId('assistant-send').tap();
  await page.getByTestId('assistant-change').waitFor();
  assert.match(await page.getByTestId('assistant-change').innerText(), /Changed 2 items/);
  assert.equal(await page.locator('[data-testid^="reply-item-"]').count(), 2);
  await page.getByTestId('assistant-undo').tap();
  assert.match(await page.getByTestId('assistant-change').innerText(), /Change undone/);
  await page.screenshot({ path: 'e2e/screens/22-assistant-change.png' });
  check('assistant reply shows item chips, counts two changes, and undoes them');

  await page.getByRole('button', { name: 'Hold to talk', exact: true }).tap();
  // Stop the previous spoken reply before starting another recording.
  if (await page.getByTestId('assistant-interrupt').count()) await page.getByTestId('assistant-interrupt').tap();
  const mic = page.getByTestId('mic');
  const box = await mic.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.getByTestId('voice-live').waitFor();
  await page.waitForFunction(() => document.querySelector('[data-testid="voice-transcript"]')?.textContent.includes('Do we have eggs?'));
  await page.waitForTimeout(600);
  const heights = await page.getByTestId('voice-waveform').locator(':scope > div').evaluateAll((els) => els.map((el) => el.getBoundingClientRect().height));
  assert(heights.some((height) => height > 3), 'waveform responds to microphone levels');
  await page.screenshot({ path: 'e2e/screens/21-assistant-listening.png' });
  await page.mouse.up();
  await page.getByTestId('assistant-interrupt').waitFor();
  const cancels = await page.evaluate(() => window.__cancelCount);
  await page.getByTestId('assistant-interrupt').tap();
  assert((await page.evaluate(() => window.__cancelCount)) > cancels);
  assert.equal(await page.getByTestId('voice-live').count(), 0);
  check('hold shows live transcript and real waveform; tap interrupts playback');

  await page.setViewportSize({ width: 320, height: 740 });
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' });
  await page.getByTestId('tab-fridge').tap();
  await page.getByTestId('fridge-cabinet').waitFor();
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await page.getByTestId('freezer-shelf').scrollIntoViewIfNeeded();
  await page.screenshot({ path: 'e2e/screens/23-small-phone-dark.png' });
  check('cabinet fits a small phone in dark mode with reduced motion');
  assert.deepEqual(errors, []);
  check('no browser page errors');
} finally {
  await browser.close();
  server.close();
}
