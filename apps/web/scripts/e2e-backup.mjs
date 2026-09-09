// The backup prompt: it must not appear at first launch, must appear once the
// account is worth keeping, and must record that it happened so it stops.
// docs/study-plans-framework.md §14a.
import { chromium } from 'playwright';

const APP_URL = (process.env.APP_URL || 'http://localhost:5173/').split('#')[0].replace(/\/?$/, '/');
const errors = [];

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 950 }, acceptDownloads: true });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${APP_URL}#read`, { waitUntil: 'networkidle' });
await page.waitForSelector('.verse');
const skip = page.locator('.welcome-card button', { hasText: 'Skip for now' });
if (await skip.count()) { await skip.click(); await page.waitForSelector('.welcome-backdrop', { state: 'detached' }); }

// Nothing invested yet, so nothing should be nagging.
await page.waitForTimeout(600);
const earlyPrompt = await page.locator('.welcome-card', { hasText: 'Save your account now' }).count();
if (earlyPrompt) throw new Error('FAIL: the backup prompt appeared at first launch');
console.log('quiet at first launch');

// Joining a circle makes the account worth keeping.
await page.locator('nav[aria-label="Reader tools"] button', { hasText: 'Plans & circles' }).click();
await page.waitForSelector('.study-hub, .circle-list, .plan-list', { timeout: 15000 });
const circlesTab = page.locator('button', { hasText: /^Circles$/ }).first();
if (await circlesTab.count()) await circlesTab.click();
await page.waitForSelector('.circle-list');
await page.locator('.circle-list input').first().fill('Family');
await page.locator('.prefs-account-actions button').first().click();

await page.waitForSelector('.welcome-card:has-text("Save your account now")', { timeout: 15000 });
const why = await page.locator('.welcome-card p').first().innerText();
console.log(JSON.stringify({ prompted: why.slice(0, 60) }));

// The passphrase-free route is a real option, so it has to work.
const download = page.waitForEvent('download', { timeout: 10000 });
await page.locator('.welcome-card button', { hasText: 'Save without a password' }).click();
const file = await download;
console.log(JSON.stringify({ downloaded: file.suggestedFilename() }));
if (!/^the-word-key-/.test(file.suggestedFilename())) throw new Error('FAIL: unexpected backup filename');

await page.waitForSelector('.welcome-card:has-text("Save your account now")', { state: 'detached' });
const recorded = await page.evaluate(() => localStorage.getItem('word.backedUpAt'));
if (!recorded) throw new Error('FAIL: backup was not recorded, so the prompt will nag again');
console.log(JSON.stringify({ backedUpAt: Boolean(recorded) }));

// And it stays quiet from now on.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.verse');
await page.waitForTimeout(800);
if (await page.locator('.welcome-card', { hasText: 'Save your account now' }).count()) {
  throw new Error('FAIL: the prompt came back after a completed backup');
}
console.log('quiet again once saved');

console.log(errors.length ? 'ERRORS ' + JSON.stringify(errors) : 'PASS');
await browser.close();
