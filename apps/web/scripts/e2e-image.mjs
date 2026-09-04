import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const outDir = new URL('../e2e-landing/', import.meta.url);
mkdirSync(outDir, { recursive: true });
const shot = (name) => fileURLToPath(new URL(name, outDir));

const errors = [];
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
page.on('pageerror', (e) => errors.push(e.message));

await page.goto('http://localhost:5173/', { waitUntil: 'networkidle' });
await page.waitForSelector('.landing-verse-art blockquote', { timeout: 20000 });
const color = await page.locator('.landing-verse-art blockquote').evaluate((el) => getComputedStyle(el).color);
const overlay = await page.locator('.landing-verse-overlay').count();
const bg = await page.locator('.landing-verse-art').evaluate((el) => getComputedStyle(el).backgroundImage);
await page.screenshot({ path: shot('votd-art.png'), fullPage: true });

await page.locator('.landing-actions button', { hasText: 'Image' }).click();
await page.waitForSelector('.image-editor');
await page.waitForTimeout(400);
const thumbs = await page.locator('.image-editor-thumbs .thumb').count();
await page.locator('.image-editor-thumbs .thumb').nth(2).click();
await page.waitForTimeout(300);
await page.locator('.image-editor-field input[type="range"]').first().fill('58');
await page.screenshot({ path: shot('image-editor.png') });

const download = page.waitForEvent('download', { timeout: 10000 });
await page.locator('.image-editor-save').click();
const file = await download;

console.log(JSON.stringify({ color, overlay, bg: bg.slice(0, 80), thumbs, file: file.suggestedFilename(), errors }));
await browser.close();
if (!bg.includes('backgrounds/')) throw new Error('missing background image');
if (thumbs < 8) throw new Error('missing background thumbs');
if (errors.length) throw new Error(errors.join('\n'));
console.log('ok');
