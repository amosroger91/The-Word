// Readers on one device: each person's reading and notes stay their own, and a
// PIN keeps someone else out. docs/study-plans-framework.md §14b.
import { chromium } from 'playwright';

const APP_URL = (process.env.APP_URL || 'http://localhost:5173/').split('#')[0].replace(/\/?$/, '/');
const errors = [];

const browser = await chromium.launch({ headless: false });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 950 } })).newPage();
page.on('pageerror', (e) => errors.push(e.message));

async function dismissWelcome() {
  const skip = page.locator('.welcome-card button', { hasText: 'Skip for now' });
  if (await skip.count()) { await skip.click(); await page.waitForSelector('.welcome-backdrop', { state: 'detached' }); }
}

async function openSettings() {
  await page.locator('nav[aria-label="Reader tools"] button[aria-label="Settings"]').click();
  await page.waitForSelector('.prefs');
}

// In the reader the panel is a dock pane, so it closes from the pane actions
// rather than with Escape.
async function closeSettings() {
  const close = page.locator('.pane-actions button[aria-label^="Close"]').first();
  if (await close.count()) await close.click();
  await page.waitForSelector('.prefs', { state: 'detached' });
}

async function noteOnVerse(index, text) {
  await page.locator('.verse .verse-select').nth(index).click();
  await page.locator('.workspace-selection button', { hasText: /^(Note|Edit note)$/ }).click();
  await page.waitForSelector('.verse-note');
  await page.locator('.verse-note textarea').fill(text);
  await page.locator('.verse-note-actions button', { hasText: 'Save note' }).click();
  await page.waitForSelector('.verse-note', { state: 'detached' });
}

await page.goto(`${APP_URL}#read`, { waitUntil: 'networkidle' });
await page.waitForSelector('.verse');
await dismissWelcome();

// Household reader exists by default — nobody is forced to set profiles up.
await openSettings();
const chips = await page.locator('.reader-chip').allInnerTexts();
console.log(JSON.stringify({ defaultReaders: chips }));
if (chips.length !== 1) throw new Error('FAIL: expected exactly one reader to start');

// Add a second reader; adding switches to them.
await page.locator('.reader-add input').first().fill('Ada');
await page.locator('.reader-add button', { hasText: 'Add reader' }).click();
await page.waitForTimeout(300);
const afterAdd = await page.locator('.reader-chip.active').innerText();
console.log(JSON.stringify({ activeAfterAdd: afterAdd.trim() }));
if (!afterAdd.includes('Ada')) throw new Error('FAIL: adding a reader did not switch to them');

// Ada writes a note.
await closeSettings();
await noteOnVerse(0, 'Ada reads verse one.');

// Switch back to the household reader: Ada's note must not be theirs.
await openSettings();
await page.locator('.reader-chip', { hasText: 'This device' }).click();
await page.waitForTimeout(400);
await closeSettings();
await page.locator('nav[aria-label="Reader tools"] button', { hasText: 'Saved' }).click();
await page.waitForSelector('.bookmarks-panel');
const householdSaved = await page.locator('.bookmarks-panel').innerText();
if (householdSaved.includes('Ada reads verse one')) throw new Error("FAIL: Ada's note leaked into the household reader");
console.log('notes stay with the reader who wrote them');

// And Ada still has it.
await openSettings();
await page.locator('.reader-chip', { hasText: 'Ada' }).click();
await page.waitForTimeout(400);
await closeSettings();
await page.locator('nav[aria-label="Reader tools"] button', { hasText: 'Saved' }).click();
const adaSaved = await page.locator('.bookmarks-panel').innerText();
if (!adaSaved.includes('Ada reads verse one')) throw new Error("FAIL: Ada's own note is missing after switching back");
console.log('switching back restores the reader’s own notes');

// A PIN gates the switch.
await openSettings();
await page.locator('.reader-add input[type="password"]').fill('2468');
await page.locator('.reader-add button', { hasText: /Set PIN|Clear PIN/ }).click();
await page.waitForTimeout(300);
await page.locator('.reader-chip', { hasText: 'This device' }).click();
await page.waitForTimeout(300);
await page.locator('.reader-chip', { hasText: 'Ada' }).click();
await page.waitForSelector('.reader-unlock');
await page.locator('.reader-unlock input').fill('1111');
await page.locator('.reader-unlock button', { hasText: 'Unlock' }).click();
const stillLocked = await page.locator('.reader-unlock').count();
if (!stillLocked) throw new Error('FAIL: a wrong PIN unlocked the reader');
await page.locator('.reader-unlock input').fill('2468');
await page.locator('.reader-unlock button', { hasText: 'Unlock' }).click();
await page.waitForTimeout(300);
const nowActive = await page.locator('.reader-chip.active').innerText();
if (!nowActive.includes('Ada')) throw new Error('FAIL: the right PIN did not unlock the reader');
console.log('PIN refuses the wrong code and accepts the right one');

// Readers survive a reload.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.verse');
await dismissWelcome();
await openSettings();
const persisted = await page.locator('.reader-chip').allInnerTexts();
console.log(JSON.stringify({ persisted: persisted.map((t) => t.trim().split('\n')[0]) }));
if (persisted.length !== 2) throw new Error('FAIL: readers did not survive a reload');

console.log(errors.length ? 'ERRORS ' + JSON.stringify(errors) : 'PASS');
await browser.close();
