// Verse notes: write one, see it on the verse and in Saved, keep it across a
// reload, and — when shared — find it on the existing timeline rather than a
// second one.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const outDir = new URL('../e2e-notes/', import.meta.url);

const APP_URL = (process.env.APP_URL || 'http://localhost:5173/').split('#')[0].replace(/\/?$/, '/');
const errors = [];

const browser = await chromium.launch({ headless: false });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(`${APP_URL}#read`, { waitUntil: 'networkidle' });
await page.waitForSelector('.verse');

// First run shows the welcome card over everything; get past it.
const skip = page.locator('.welcome-card button', { hasText: 'Skip for now' });
if (await skip.count()) {
  await skip.click();
  await page.waitForSelector('.welcome-backdrop', { state: 'detached' });
}

// Select verse 2 and open the note composer.
await page.locator('.verse .verse-select').nth(1).click();
await page.waitForSelector('.workspace-selection');
await page.locator('.workspace-selection button', { hasText: /^Note$/ }).click();
await page.waitForSelector('.verse-note');
const heading = await page.locator('.verse-note-header strong').innerText();
console.log(JSON.stringify({ composerFor: heading }));

// Private note first.
await page.locator('.verse-note textarea').fill('Nicodemus came at night — ask why.');
mkdirSync(outDir, { recursive: true });
await page.screenshot({ path: fileURLToPath(new URL('note-composer.png', outDir)) });
await page.locator('.verse-note-actions button', { hasText: 'Save note' }).click();
await page.waitForSelector('.verse-note', { state: 'detached' });

const marked = await page.locator('.verse-note-mark').count();
if (!marked) throw new Error('FAIL: no ✎ marker on the noted verse');
console.log(JSON.stringify({ markers: marked }));

// It has to survive a reload — this is the ledger, not component state.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.verse');
if (!(await page.locator('.verse-note-mark').count())) throw new Error('FAIL: note marker gone after reload');

// Saved tab lists it.
await page.locator('nav[aria-label="Reader tools"] button', { hasText: 'Saved' }).click();
await page.waitForSelector('.bookmarks-panel');
await page.screenshot({ path: fileURLToPath(new URL('note-saved.png', outDir)) });
const savedText = await page.locator('.bookmarks-panel').innerText();
if (!savedText.includes('Nicodemus came at night')) throw new Error(`FAIL: note missing from Saved:\n${savedText.slice(0, 300)}`);
console.log('note listed in Saved');

// Now share it, and check it lands on the existing timeline.
await page.locator('.verse .verse-select').nth(1).click();
await page.locator('.workspace-selection button', { hasText: /^(Note|Edit note)$/ }).click();
await page.waitForSelector('.verse-note');
await page.locator('.verse-note textarea').fill('Nicodemus came at night — worth sharing.');
await page.locator('.verse-note-share input').check();
const hint = await page.locator('.verse-note .muted').innerText();
await page.locator('.verse-note-actions button', { hasText: 'Save note' }).click();
await page.waitForSelector('.verse-note', { state: 'detached' });
console.log(JSON.stringify({ sharedHint: hint }));

await page.locator('nav[aria-label="Reader tools"] button', { hasText: 'Study' }).click().catch(() => {});
await page.waitForTimeout(500);
const feedTab = page.locator('button', { hasText: /^Timeline$|^Feed$/ }).first();
if (await feedTab.count()) await feedTab.click();
await page.waitForTimeout(1200);
const hubText = await page.locator('body').innerText();
if (!hubText.includes('worth sharing')) throw new Error('FAIL: shared note did not reach the timeline');
console.log('shared note on the timeline');

const unexpected = errors.filter((e) => !/discoverybiblestudy|daily-api|Failed to load resource/.test(e));
console.log(unexpected.length ? 'ERRORS ' + JSON.stringify(unexpected) : 'PASS');
await browser.close();
