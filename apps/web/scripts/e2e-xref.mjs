import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5173/#read', { waitUntil: 'networkidle' });
if (await page.locator('.landing').count()) {
  await page.locator('.landing-read').click();
}
await page.waitForSelector('.verse', { timeout: 20000 });
await page.waitForSelector('.xref-mark', { timeout: 15000 });
const marks = await page.locator('.xref-mark').count();
await page.locator('.xref-mark').first().click();
await page.waitForSelector('.xref-menu');
const title = await page.locator('.xref-menu-header strong').innerText();
const items = await page.locator('.xref-item').count();
const firstRef = await page.locator('.xref-item strong').first().innerText();
await page.locator('.xref-item').first().click();
await page.waitForSelector('.verse.focused, .verse.selected', { timeout: 15000 });
const after = await page.locator('.topbar-reference').innerText();
console.log(JSON.stringify({ marks, title, items, firstRef, after, errors }));
await browser.close();
if (marks < 1 || items < 1 || title !== 'Cross references') throw new Error('cross-ref menu failed');
if (errors.length) throw new Error(errors.join('\n'));
console.log('ok');
