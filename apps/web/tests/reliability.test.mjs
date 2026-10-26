import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const compiledDir = path.join(here, '.compiled');
fs.mkdirSync(compiledDir, { recursive: true });
const root = path.join(here, '../../..');

function transpile(file, destName, rewrite = (text) => text) {
  const src = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  const dest = path.join(compiledDir, destName);
  fs.writeFileSync(dest, rewrite(outputText));
  return pathToFileURL(dest).href;
}

fs.writeFileSync(path.join(compiledDir, 'react-stub.mjs'), [
  'export function useEffect() {}',
  'export function useState(value) { return [value, () => {}]; }',
  '',
].join('\n'));
fs.writeFileSync(path.join(compiledDir, 'bible-stub.mjs'), [
  'export function parseReference() { return null; }',
  'export const localBible = { getChapter: async () => null, getTranslations: () => [] };',
  '',
].join('\n'));

const clockUrl = transpile(path.join(root, 'packages/core/src/clock.ts'), 'clock.mjs');
const dailyUrl = transpile(path.join(root, 'packages/core/src/dailyVerse.ts'), 'dailyVerse.mjs', (text) => text
  .replaceAll("from 'react'", "from './react-stub.mjs'")
  .replaceAll("from '@the-word/bible'", "from './bible-stub.mjs'"));

const { normalizeClockTime, validClockTime } = await import(clockUrl);
const { localDayKey, verseDayKey, verseIsCurrent, fetchDailyVerse } = await import(dailyUrl);

test('clock times reject impossible minutes and pad the hour', () => {
  assert.equal(normalizeClockTime('7:05'), '07:05');
  assert.equal(normalizeClockTime('00:00'), '00:00');
  assert.equal(normalizeClockTime('23:59'), '23:59');
  assert.equal(normalizeClockTime(' 7:05 '), '07:05');
  assert.equal(normalizeClockTime('07:99'), null);
  assert.equal(normalizeClockTime('24:00'), null);
  assert.equal(normalizeClockTime('7:5'), null);
  assert.equal(normalizeClockTime(''), null);
  assert.equal(validClockTime('7:05'), true);
  assert.equal(validClockTime('07:99'), false);
});

test('verse dates match the local day and a stale snapshot is skipped', async () => {
  const today = new Date(2026, 9, 26, 15, 0, 0);
  assert.equal(localDayKey(today), '2026-10-26');
  assert.equal(verseDayKey('26th Oct 2026'), '2026-10-26');
  assert.equal(verseDayKey('23rd Oct 2026'), '2026-10-23');
  assert.equal(verseDayKey('2026-10-26T00:00:00Z'), '2026-10-26');
  assert.equal(verseDayKey('not a date'), null);
  assert.equal(verseIsCurrent('26th Oct 2026', today), true);
  assert.equal(verseIsCurrent('23rd Oct 2026', today), false);

  const calls = [];
  const previous = globalThis.fetch;
  globalThis.fetch = async (url) => {
    calls.push(String(url));
    const stale = String(url).includes('stale');
    return {
      ok: true,
      json: async () => ({
        text: stale ? 'Hosanna' : 'In the beginning',
        ref: stale ? 'John 12:13' : 'John 1:1',
        date: stale ? '23rd Oct 2026' : '26th Oct 2026',
      }),
    };
  };
  try {
    const urls = ['https://example.test/stale', 'https://example.test/today'];
    const verse = await fetchDailyVerse(urls, true, today);
    assert.equal(verse.text, 'In the beginning');
    assert.equal(verse.date, '26th Oct 2026');
    assert.deepEqual(calls, urls);
    calls.length = 0;
    const again = await fetchDailyVerse(urls, false, today);
    assert.equal(again.text, 'In the beginning');
    assert.deepEqual(calls, []);
    await assert.rejects(
      () => fetchDailyVerse(['https://example.test/only-stale'], true, today),
      /stale daily verse/,
    );
  } finally {
    globalThis.fetch = previous;
  }
});
