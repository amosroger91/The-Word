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
await page.waitForSelector('.verse-art blockquote', { timeout: 20000 });
const color = await page.locator('.verse-art blockquote').evaluate((el) => getComputedStyle(el).color);
const overlay = await page.locator('.verse-art-overlay').count();
const bg = await page.locator('.verse-art').evaluate((el) => getComputedStyle(el).backgroundImage);
await page.screenshot({ path: shot('votd-art.png'), fullPage: true });

// Verse of the day exports the artwork on screen directly — no editor.
const dailyDownload = page.waitForEvent('download', { timeout: 15000 });
await page.locator('.verse-tools button', { hasText: 'Image' }).click();
const dailyFile = await dailyDownload;
const editorOpened = await page.locator('.image-editor').count();

// The reader's selection bar still opens the full editor.
await page.locator('.landing-read').click();
await page.waitForSelector('.reader .verse', { timeout: 20000 });
await page.locator('.reader .verse').first().click();
await page.locator('.selection-bar button', { hasText: 'Image' }).click();
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

console.log(JSON.stringify({
  color,
  overlay,
  bg: bg.slice(0, 80),
  daily: dailyFile.suggestedFilename(),
  editorOpened,
  thumbs,
  file: file.suggestedFilename(),
  errors,
}));
await browser.close();
if (!bg.includes('backgrounds/')) throw new Error('missing background image');
if (editorOpened) throw new Error('verse of the day should export without opening the editor');
if (!/\.png$/.test(dailyFile.suggestedFilename())) throw new Error('verse of the day did not export a png');
if (thumbs < 8) throw new Error('missing background thumbs');
if (errors.length) throw new Error(errors.join('\n'));
console.log('ok');
