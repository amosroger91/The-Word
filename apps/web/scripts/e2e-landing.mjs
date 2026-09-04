import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const outDir = new URL('../e2e-landing/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const shot = (name) => fileURLToPath(new URL(name, outDir));

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, acceptDownloads: true });
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.verse-card blockquote', { timeout: 15000 });
await page.waitForFunction(() => {
  const button = [...document.querySelectorAll('.verse-tools button')].find((el) => el.textContent === 'Read from here');
  return button instanceof HTMLButtonElement && !button.disabled;
}, { timeout: 15000 });

const verseText = await page.locator('.verse-card blockquote').innerText();
const cite = await page.locator('.verse-card cite').innerText();
const actions = await page.locator('.verse-tools button').allInnerTexts();
await page.screenshot({ path: shot('landing-actions.png'), fullPage: true });
console.log(JSON.stringify({ cite, actions, verseText: verseText.slice(0, 90) }));

const bookmark = page.locator('.verse-tools button', { hasText: 'Bookmark' });
await bookmark.click();
const bookmarked = await bookmark.evaluate((el) => el.classList.contains('active'));
await page.locator('.verse-tools button', { hasText: 'Copy' }).click();
const download = page.waitForEvent('download', { timeout: 8000 });
await page.locator('.verse-tools button', { hasText: 'Image' }).click();
const file = await download;
console.log('download', file.suggestedFilename());

await page.locator('.verse-tools button', { hasText: 'Read from here' }).click();
await page.waitForSelector('.verse.focused, .verse.speaking', { timeout: 20000 });
const reference = await page.locator('.topbar-reference').innerText();
const focused = await page.locator('.verse.focused sup, .verse.speaking sup').first().innerText();
const hash = await page.evaluate(() => location.hash);
await page.screenshot({ path: shot('reader-from-here.png'), fullPage: true });
console.log(JSON.stringify({ hash, reference, focused, bookmarked }));

await browser.close();
if (!/everlasting life|eternal life/i.test(verseText)) throw new Error('expected local or Discovery John 5:24 text');
if (!actions.includes('Read from here') || !actions.includes('Read the chapter') || !actions.includes('Image')) {
  throw new Error('missing verse actions');
}
if (!bookmarked) throw new Error('bookmark did not toggle');
if (hash !== '#read' || !/John/.test(reference) || focused !== '24') throw new Error('read from here did not open John 5:24');
if (errors.length) console.log('errors', errors);
console.log('ok');
