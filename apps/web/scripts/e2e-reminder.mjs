import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const outDir = new URL('../e2e-reminder/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const shot = (name) => fileURLToPath(new URL(name, outDir));

// Defaults to the dev server; point APP_URL at the deployed site to check it live.
const APP_URL = (process.env.APP_URL || 'http://localhost:5173/').split('#')[0].replace(/\/?$/, '/');
const ORIGIN = new URL(APP_URL).origin;
const errors = [];
// Headed: headless Chromium reports Notification.permission as 'denied' whatever
// the context is granted, which would disable the control under test.
const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
await context.grantPermissions(['notifications'], { origin: ORIGIN });
const page = await context.newPage();
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push('console: ' + msg.text()); });

await page.goto(APP_URL, { waitUntil: 'networkidle' });

// The reminder lives in Preferences, reachable from the landing page.
await page.locator('.landing button[aria-label="Preferences"]').first().click();
await page.waitForSelector('.prefs');
const toggle = page.locator('.prefs-toggle input[type="checkbox"]');
await toggle.check();
await page.waitForSelector('.prefs-reminder input[type="time"]');

const defaultTime = await page.locator('.prefs-reminder input[type="time"]').inputValue();
const hint = await page.locator('.prefs-field:has(.prefs-toggle) .muted').first().innerText();
await page.locator('.prefs-field:has(.prefs-toggle)').scrollIntoViewIfNeeded();
await page.screenshot({ path: shot('reminder-on.png') });
console.log(JSON.stringify({ defaultTime, hint }));

// Which delivery path this browser takes, and that the worker really registered.
const worker = await page.evaluate(async () => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const reminder = registrations.find((registration) => registration.scope.endsWith('/reminder/'));
  return {
    scopes: registrations.map((registration) => registration.scope),
    active: !!reminder?.active,
    exact: typeof window.TimestampTrigger === 'function' && 'showTrigger' in Notification.prototype,
  };
});
console.log(JSON.stringify(worker));

// Move the reminder to a minute that has just passed: a browser without scheduled
// notifications should catch up immediately, one with them should queue alarms.
const behind = new Date(Date.now() - 60_000);
const chosen = `${String(behind.getHours()).padStart(2, '0')}:${String(behind.getMinutes()).padStart(2, '0')}`;
await page.locator('.prefs-reminder input[type="time"]').fill(chosen);
await page.waitForTimeout(1500);

const shown = await page.evaluate(async () => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const reminder = registrations.find((registration) => registration.scope.endsWith('/reminder/'));
  if (!reminder) return null;
  const queued = await reminder.getNotifications({ includeTriggered: true });
  const live = await reminder.getNotifications();
  return { queued: queued.map((n) => ({ tag: n.tag, title: n.title })), live: live.length };
});
console.log(JSON.stringify({ chosen, shown }));

// Asking again the same day must not produce a second reminder, and the test
// button must get through regardless of that guard.
const again = await page.evaluate(async () => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const reminder = registrations.find((registration) => registration.scope.endsWith('/reminder/'));
  reminder?.active?.postMessage({ type: 'check' });
  await new Promise((resolve) => setTimeout(resolve, 800));
  return (await reminder.getNotifications()).length;
});
await page.locator('.prefs-reminder button', { hasText: 'test' }).click();
await page.waitForTimeout(800);
const tags = await page.evaluate(async () => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const reminder = registrations.find((registration) => registration.scope.endsWith('/reminder/'));
  return (await reminder.getNotifications()).map((n) => n.tag);
});
console.log(JSON.stringify({ afterSecondCheck: again, tags }));

// Turning it off must leave nothing queued behind.
await toggle.uncheck();
await page.waitForTimeout(800);
const afterOff = await page.evaluate(async () => {
  const registrations = await navigator.serviceWorker.getRegistrations();
  const reminder = registrations.find((registration) => registration.scope.endsWith('/reminder/'));
  const queued = await reminder?.getNotifications({ includeTriggered: true });
  return { queued: queued?.length ?? 0, timeFieldGone: !document.querySelector('.prefs-reminder') };
});
const stored = await page.evaluate(() => localStorage.getItem('word.dailyReminder'));
console.log(JSON.stringify({ afterOff, stored }));

await page.screenshot({ path: shot('reminder-off.png') });

// The choice has to survive a reload.
await page.reload({ waitUntil: 'networkidle' });
const persisted = await page.evaluate(() => localStorage.getItem('word.dailyReminder'));
console.log(JSON.stringify({ persisted }));

// The daily verse API has no CORS headers, so its fetch always fails offline of
// the proxy; that noise predates the reminder and is not what this checks.
const unexpected = errors.filter((error) => !/discoverybiblestudy|daily-api|Failed to load resource/.test(error));
console.log(unexpected.length ? 'ERRORS ' + JSON.stringify(unexpected) : 'no unexpected page errors');
await browser.close();
