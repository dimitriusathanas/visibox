// Loads a packaged preview page inside a skeleton like the host's, with a
// strict content security policy, and checks the app boots.
import { readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { chromium } from 'playwright-core';

const body = readFileSync(process.argv[2], 'utf8');
const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'unsafe-inline' https://fonts.googleapis.com; img-src data: blob:; font-src https://fonts.gstatic.com; connect-src 'none'; media-src data: blob:">
<style>:root{color-scheme:light;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui}img{max-width:100%}[hidden]{display:none!important}</style></head><body>${body}</body></html>`;
const server = createServer((_, res) => res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html));
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? '/opt/pw-browsers/chromium' });
const page = await (await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })).newPage();
const problems = [];
page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
page.on('console', (m) => (m.type() === 'error' || /Content Security Policy/.test(m.text())) && problems.push(`console: ${m.text().slice(0, 200)}`));
await page.goto(`http://127.0.0.1:${server.address().port}/`);
await page.waitForSelector('[data-testid="mic"]', { timeout: 20000 });
await page.tap('[data-testid="tab-fridge"]');
await page.waitForSelector('[data-testid^="bucket-"]');
await page.screenshot({ path: process.argv[3] });
console.log(problems.length ? problems.join('\n') : 'booted with no errors');
await browser.close();
server.close();
