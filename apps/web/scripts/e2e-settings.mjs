// One settings surface: the gear on the landing page and the gear in the reader
// must open the same panel, with the same fields, at any width.
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const outDir = new URL('../e2e-settings/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const shot = (name) => fileURLToPath(new URL(name, outDir));
const APP_URL = (process.env.APP_URL || 'http://localhost:5173/').split('#')[0].replace(/\/?$/, '/');

const errors = [];
const browser = await chromium.launch({ headless: false });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
page.on('pageerror', (e) => errors.push(e.message));

// The fields that make a panel "the settings", by their section labels.
async function fields(target) {
  return target.evaluate(() => [...document.querySelectorAll('.prefs .section-label')].map((el) => el.textContent.trim()));
}

await page.goto(APP_URL, { waitUntil: 'networkidle' });

// First run puts the welcome card over everything.
const skip = page.locator('.welcome-card button', { hasText: 'Skip for now' });
if (await skip.count()) {
  await skip.click();
  await page.waitForSelector('.welcome-backdrop', { state: 'detached' });
}

await page.locator('.landing button[aria-label="Preferences"]').first().click();
await page.waitForSelector('.prefs');
const fromLanding = await fields(page);
console.log(JSON.stringify({ fromLanding }));
await page.screenshot({ path: shot('settings-from-landing.png') });
await page.keyboard.press('Escape');
await page.waitForSelector('.prefs', { state: 'detached' });

// Same panel from the reader's gear.
await page.goto(`${APP_URL}#read`, { waitUntil: 'networkidle' });
await page.waitForSelector('.verse');
if (await page.locator('.control-settings').count()) throw new Error('FAIL: the reader still has its own settings row');
await page.locator('nav[aria-label="Reader tools"] button[aria-label="Settings"]').click();
await page.waitForSelector('.prefs');
const fromReader = await fields(page);
console.log(JSON.stringify({ fromReader }));
await page.screenshot({ path: shot('settings-from-reader.png') });

if (JSON.stringify(fromLanding) !== JSON.stringify(fromReader)) {
  throw new Error(`FAIL: the two gears open different panels\n  landing: ${fromLanding}\n  reader:  ${fromReader}`);
}
for (const needed of ['Daily reminder', 'Profile photo']) {
  if (!fromReader.some((f) => f.startsWith(needed))) throw new Error(`FAIL: "${needed}" missing from settings`);
}
console.log('both gears open the same panel');

// Typing a name re-renders the app on every keystroke. The dialog must not grab
// focus back when it does, or the field takes exactly one letter and stops.
const nameField = page.locator('.prefs input[type="text"]');
await nameField.click();
await page.keyboard.press('Control+A');
await page.keyboard.type('Roger H', { delay: 60 });
const typed = await page.evaluate(() => ({
  value: document.querySelector('.prefs input[type="text"]').value,
  stillFocused: document.activeElement?.tagName === 'INPUT',
  saved: JSON.parse(localStorage.getItem('word.partyIdentity') || '{}').name,
}));
console.log(JSON.stringify(typed));
if (typed.value !== 'Roger H') throw new Error(`FAIL: name field kept "${typed.value}" instead of "Roger H"`);
if (!typed.stillFocused) throw new Error('FAIL: the dialog stole focus from the name field while typing');
if (typed.saved !== 'Roger H') throw new Error(`FAIL: name saved as "${typed.saved}"`);
console.log('name field accepts a full name and saves it');

// The gear has to be reachable at phone width too, where it used to be the only
// way to reach a row of controls that no longer exists.
await page.keyboard.press('Escape');
await page.waitForSelector('.prefs', { state: 'detached' });
await page.setViewportSize({ width: 400, height: 840 });
await page.waitForTimeout(300);
if (!(await page.locator('nav[aria-label="Reader tools"] button[aria-label="Settings"]').isVisible())) throw new Error('FAIL: no settings button at phone width');
await page.locator('nav[aria-label="Reader tools"] button[aria-label="Settings"]').click();
await page.waitForSelector('.prefs');
console.log(JSON.stringify({ mobileFields: (await fields(page)).length }));
await page.screenshot({ path: shot('settings-mobile.png') });

console.log(errors.length ? 'ERRORS ' + JSON.stringify(errors) : 'PASS');
await browser.close();
