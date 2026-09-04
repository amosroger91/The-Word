import { chromium } from 'playwright';

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.landing');
const search = await page.locator('.landing-search input').count();
const read = await page.locator('.landing-read').innerText();
const group = await page.locator('.landing-group').innerText();
const both = /Read the Bible/i.test(read) && /Continue reading/i.test(read);

await page.locator('.landing-search input').fill('everlasting');
await page.waitForSelector('.landing-results .result', { timeout: 15000 });
const results = await page.locator('.landing-results .result').count();

await page.locator('.landing-group').click();
await page.waitForSelector('.party-panel', { timeout: 10000 });
const partyTitle = await page.locator('.party-panel h2').innerText();

console.log(JSON.stringify({ search, read, group, both, results, partyTitle, errors }));
await browser.close();
if (!search) throw new Error('search bar missing');
if (both) throw new Error('showed both Read and Continue');
if (!/Read the Bible|Continue reading/.test(read)) throw new Error('missing read CTA');
if (group !== 'Group Study') throw new Error('group study label wrong');
if (results < 1) throw new Error('search did not return results');
if (partyTitle !== 'Group Study') throw new Error('party panel not renamed');
if (errors.length) throw new Error(errors.join('\n'));
console.log('ok');
