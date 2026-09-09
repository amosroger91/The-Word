// "Break this down" end to end: from a verse in the reader and from the daily
// verse card, into one drawer, with every section sourced.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const outDir = new URL('../e2e-breakdown/', import.meta.url);
const APP_URL = (process.env.APP_URL || 'http://localhost:5173/').split('#')[0].replace(/\/?$/, '/');
const errors = [];

const browser = await chromium.launch({ headless: false });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

await page.goto(`${APP_URL}#read`, { waitUntil: 'networkidle' });
await page.waitForSelector('.verse');
const skip = page.locator('.welcome-card button', { hasText: 'Skip for now' });
if (await skip.count()) { await skip.click(); await page.waitForSelector('.welcome-backdrop', { state: 'detached' }); }

// From the reader: select a verse, break it down.
await page.locator('.verse .verse-select').nth(15).click();
await page.waitForSelector('.workspace-selection');
await page.locator('.workspace-selection button', { hasText: 'Break this down' }).click();
await page.waitForSelector('.breakdown', { timeout: 20000 });

const headings = await page.locator('.breakdown-section h3').allInnerTexts();
console.log(JSON.stringify({ sections: headings }));
// The stylesheet uppercases these, so compare on the words not the casing.
const seen = headings.map((h) => h.toLowerCase());
for (const needed of ['verse', 'in context', 'what the text shows', 'source notes']) {
  if (!seen.includes(needed)) throw new Error(`FAIL: missing section "${needed}" (saw ${seen.join(', ')})`);
}

const quoted = await page.locator('.breakdown blockquote').innerText();
const reference = await page.locator('.breakdown-ref').innerText();
console.log(JSON.stringify({ reference, quoted: quoted.slice(0, 60) }));
if (!/\(KJV\)/.test(reference)) throw new Error('FAIL: reference does not name the translation');

// Every claim carries a source line — that is the whole point.
const claims = await page.locator('.breakdown-claims li').count();
const sourced = await page.locator('.breakdown-claims li .breakdown-source').count();
console.log(JSON.stringify({ claims, sourced }));
if (!claims) throw new Error('FAIL: no observations rendered');
if (sourced !== claims) throw new Error(`FAIL: ${claims - sourced} observations have no source line`);

// The context window shows the verse in place, highlighted.
if (!(await page.locator('.breakdown-window .current').count())) throw new Error('FAIL: context does not mark the current verse');

mkdirSync(outDir, { recursive: true });
await page.screenshot({ path: fileURLToPath(new URL('breakdown-reader.png', outDir)) });

// Cross references jump, and the drawer follows to the new verse.
const refButton = page.locator('.breakdown-refs button').first();
if (await refButton.count()) {
  const target = (await refButton.innerText()).trim();
  await refButton.click();
  await page.waitForTimeout(1200);
  const nowShowing = await page.locator('.breakdown-ref').innerText();
  console.log(JSON.stringify({ jumpedTo: target, drawerNowOn: nowShowing }));
  if (!nowShowing.includes(target.split(':')[0].replace(/\s+\d+$/, '').trim().split(' ')[0])) {
    throw new Error(`FAIL: drawer did not follow the cross reference (${target} → ${nowShowing})`);
  }
  console.log('cross reference navigates and the drawer follows');
}

// From the daily verse card on the landing page.
await page.goto(APP_URL, { waitUntil: 'networkidle' });
await page.waitForSelector('.verse-card, .landing', { timeout: 20000 });
const dailyButton = page.locator('.verse-tools-secondary button', { hasText: 'Break this down' });
await dailyButton.waitFor({ timeout: 20000 });
await dailyButton.click();
await page.waitForSelector('.breakdown', { timeout: 20000 });
const dailyRef = await page.locator('.breakdown-ref').innerText();
console.log(JSON.stringify({ fromDailyVerse: dailyRef }));
await page.screenshot({ path: fileURLToPath(new URL('breakdown-daily.png', outDir)) });

const unexpected = errors.filter((e) => !/discoverybiblestudy|daily-api|Failed to load resource/.test(e));
console.log(unexpected.length ? 'ERRORS ' + JSON.stringify(unexpected) : 'PASS');
await browser.close();
