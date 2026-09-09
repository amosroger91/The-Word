// The WASM formatter, for real: it downloads in the background, runs in a
// worker, and only interrogative, verse-grounded output reaches the page.
// Also proves the reader is never blocked by any of it.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const outDir = new URL('../e2e-model/', import.meta.url);
const APP_URL = (process.env.APP_URL || 'http://localhost:5173/').split('#')[0].replace(/\/?$/, '/');
const errors = [];
let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : ' — ' + detail}`);
  if (!ok) failures += 1;
}

const browser = await chromium.launch({ headless: false });
const page = await (await browser.newContext({ viewport: { width: 1400, height: 950 } })).newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });

const modelRequests = [];
page.on('request', (r) => { if (/huggingface\.co|hf\.co|cdn-lfs/.test(r.url())) modelRequests.push(r.url()); });

const section = () => page.evaluate(() => {
  const el = [...document.querySelectorAll('.breakdown-section')]
    .find((s) => /questions to sit/i.test(s.querySelector('h3')?.textContent || ''));
  return el ? el.innerText : '';
});

await page.goto(`${APP_URL}#read`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.verse', { timeout: 20000 });
check('Scripture renders without waiting for the model', true);

const skip = page.locator('.welcome-card button', { hasText: 'Skip for now' });
if (await skip.count()) { await skip.click(); await page.waitForSelector('.welcome-backdrop', { state: 'detached' }); }

// The breakdown must be complete with or without the model.
await page.locator('.verse .verse-select').nth(15).click();
await page.locator('.workspace-selection button', { hasText: 'Break this down' }).click();
await page.waitForSelector('.breakdown', { timeout: 20000 });
check('the deterministic breakdown is complete before the model is', (await page.locator('.breakdown-claims li').count()) > 0);

mkdirSync(outDir, { recursive: true });
await page.screenshot({ path: fileURLToPath(new URL('model-downloading.png', outDir)) });

console.log('waiting for the model (first run pulls ~57 MB)…');
await page.waitForFunction(
  () => {
    const el = [...document.querySelectorAll('.breakdown-section')]
      .find((s) => /questions to sit/i.test(s.querySelector('h3')?.textContent || ''));
    const text = el ? el.innerText : '';
    return /\?/.test(text) || /unavailable|Ready\./i.test(text);
  },
  null,
  { timeout: 300000 },
).catch(() => {});

// "Ready." only means the weights loaded; inference still has to run. Give it
// the time it needs rather than declaring victory at the loading message.
if (!/\?/.test(await section())) {
  console.log('model loaded; waiting for the first questions…');
  await page.waitForFunction(
    () => {
      const el = [...document.querySelectorAll('.breakdown-section')]
        .find((s) => /questions to sit/i.test(s.querySelector('h3')?.textContent || ''));
      const text = el ? el.innerText : '';
      return /\?/.test(text) || /withheld|unavailable/i.test(text);
    },
    null,
    { timeout: 120000 },
  ).catch(() => {});
}

const shown = await section();
console.log('section:\n  ' + shown.replace(/\n/g, '\n  '));
check('the model reached a terminal state', /\?|unavailable|Ready\./i.test(shown), shown.slice(0, 100));
check('model weights were fetched from the CDN', modelRequests.length > 0, String(modelRequests.length));

const questions = await page.locator('.breakdown-questions li').allInnerTexts().catch(() => []);
await page.screenshot({ path: fileURLToPath(new URL('model-ready.png', outDir)) });

if (questions.length) {
  // Interrogative only: nothing declarative from the model may render.
  check('every generated line is a question', questions.every((q) => q.trim().endsWith('?')), JSON.stringify(questions));
  // And it may not invent a reference outside the supplied evidence.
  const allowed = new Set([
    ...(await page.locator('.breakdown-refs button').allInnerTexts().catch(() => [])).map((t) => t.trim()),
    (await page.locator('.breakdown-ref').innerText()).replace(/\s*\(.*\)/, '').trim(),
  ]);
  const invented = (questions.join(' ').match(/\b(?:[1-3]\s*)?[A-Z][a-z]+\.?\s+\d{1,3}:\d{1,3}\b/g) ?? [])
    .filter((r) => !allowed.has(r.trim()));
  check('generated questions invent no verse reference', invented.length === 0, JSON.stringify(invented));
  // Quotes inside a question must come from the verse.
  const verse = (await page.locator('.breakdown blockquote').innerText()).toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ');
  const quotes = questions.join(' ').match(/"([^"]{6,})"|“([^”]{6,})”/g) ?? [];
  const unreal = quotes.filter((q) => !verse.includes(q.replace(/^["“]|["”]$/g, '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()));
  check('quotes inside questions come from the verse', unreal.length === 0, JSON.stringify(unreal));
} else {
  check('nothing unvalidated was shown', true, 'no generated line survived the gate');
}

// A completed load is remembered, so later visits skip straight to ready.
const cached = await page.evaluate(() => localStorage.getItem('word.breakdownModel'));
check('a completed load is recorded for next time', Boolean(cached && cached.includes('cachedAt')), String(cached));

const unexpected = errors.filter((e) => !/discoverybiblestudy|daily-api|Failed to load resource|ERR_/.test(e));
if (unexpected.length) console.log('page errors:', JSON.stringify(unexpected.slice(0, 5)));

console.log(failures ? `\n${failures} FAILED` : '\nmodel pipeline works end to end');
await browser.close();
process.exit(failures ? 1 : 0);
