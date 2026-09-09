// An imported plan is unverified content that teaches, so it stays local, is
// marked, and shows nothing until a person accepts it.
// docs/study-plans-framework.md §14d.
import { mkdtempSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';

const APP_URL = (process.env.APP_URL || 'http://localhost:5173/').split('#')[0].replace(/\/?$/, '/');
const errors = [];

const plan = {
  format: 'the-word.plan',
  id: 'imported-fixture',
  version: 1,
  title: { en: 'A Borrowed Plan' },
  summary: { en: 'A fixture used to prove the trust boundary.' },
  audience: ['solo'],
  tags: [],
  sessions: [{
    id: 's1',
    title: { en: 'First sitting' },
    passages: [{ bookId: 43, chapter: 3 }],
    blocks: [
      { kind: 'prose', id: 'b1', text: { en: 'SECRET-PLAN-BODY should not render before acceptance.' } },
      { kind: 'question', id: 'b2', question: { type: 'free', prompt: { en: 'What stands out?' } } },
    ],
  }],
};

const dir = mkdtempSync(path.join(os.tmpdir(), 'tw-plan-'));
const file = path.join(dir, 'borrowed-plan.json');
writeFileSync(file, JSON.stringify(plan, null, 2));

const browser = await chromium.launch({ headless: false });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 950 } })).newPage();
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(`${APP_URL}#read`, { waitUntil: 'networkidle' });
await page.waitForSelector('.verse');
const skip = page.locator('.welcome-card button', { hasText: 'Skip for now' });
if (await skip.count()) { await skip.click(); await page.waitForSelector('.welcome-backdrop', { state: 'detached' }); }

await page.locator('nav[aria-label="Reader tools"] button', { hasText: 'Plans & circles' }).click();
await page.waitForSelector('.plan-list, .plan-import', { timeout: 15000 });

await page.locator('.plan-import input[type="file"]').setInputFiles(file);
await page.waitForSelector('.plan-card:has-text("A Borrowed Plan")', { timeout: 10000 });
const marked = await page.locator('.plan-card:has-text("A Borrowed Plan") .plan-unverified').count();
if (!marked) throw new Error('FAIL: an imported plan is not marked unverified');
console.log('imported plan is listed and marked unverified');

// Opening it must show the gate, not the content.
await page.locator('.plan-card', { hasText: 'A Borrowed Plan' }).click();
await page.waitForSelector('.plan-accept');
const gated = await page.locator('body').innerText();
if (gated.includes('SECRET-PLAN-BODY')) throw new Error('FAIL: plan content rendered before acceptance');
console.log('content withheld until a person accepts');

// Declining leaves it unaccepted.
await page.locator('.plan-accept button', { hasText: 'Not now' }).click();
await page.waitForSelector('.plan-accept', { state: 'detached' });
const stillAccepted = await page.evaluate(() => JSON.parse(localStorage.getItem('word.acceptedPlans') || '[]'));
if (stillAccepted.includes('imported-fixture')) throw new Error('FAIL: declining still accepted the plan');
console.log('declining does not accept it');

// Accepting reveals it.
await page.locator('.plan-card', { hasText: 'A Borrowed Plan' }).click();
await page.waitForSelector('.plan-accept');
await page.locator('.plan-accept button', { hasText: 'Read this plan' }).click();
await page.waitForTimeout(600);
const shown = await page.locator('body').innerText();
if (!shown.includes('SECRET-PLAN-BODY')) throw new Error('FAIL: accepted plan still does not render');
console.log('accepted plan renders');

// It is local: never in the shared curated index.
const curated = await (await fetch(`${APP_URL}plans/index.json`)).json();
if (JSON.stringify(curated).includes('imported-fixture')) throw new Error('FAIL: an imported plan reached the shared list');
console.log('imported plan stayed off the shared list');

// And it survives a reload, still accepted.
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('.verse');
const persisted = await page.evaluate(() => JSON.parse(localStorage.getItem('word.importedPlans') || '[]').length);
console.log(JSON.stringify({ persistedImports: persisted }));
if (persisted !== 1) throw new Error('FAIL: imported plan did not persist');

console.log(errors.length ? 'ERRORS ' + JSON.stringify(errors) : 'PASS');
await browser.close();
