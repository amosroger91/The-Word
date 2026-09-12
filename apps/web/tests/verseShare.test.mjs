import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

const here = path.dirname(fileURLToPath(import.meta.url));
const compiledDir = path.join(here, '.compiled');
fs.mkdirSync(compiledDir, { recursive: true });

const src = fs.readFileSync(path.join(here, '../src/verseLink.ts'), 'utf8');
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: 'verseLink.ts',
});
// The two functions under test are pure; stub the bible package so the test
// doesn't have to load the bundled Scripture data.
const stubbed = outputText.replace(
  /^import\s*\{[^}]*\}\s*from\s*'@the-word\/bible';?$/m,
  'const BOOKS_DATA = []; const parseReference = () => null;',
);
// Distinct filename: ledger.test.mjs compiles verseLink.ts into this same directory
// with the real bible package wired in, and a shared name lets the two clobber
// each other depending on run order.
const compiled = path.join(compiledDir, 'verseLink.sharetest.mjs');
fs.writeFileSync(compiled, stubbed);
const { formatVerseReference, verseShareText } = await import(pathToFileURL(compiled).href);

test('formatVerseReference renders a compact, human reference', () => {
  assert.equal(formatVerseReference('John', 3, [16]), 'John 3:16');
  assert.equal(formatVerseReference('John', 3, [16, 17, 18]), 'John 3:16-18');
  assert.equal(formatVerseReference('John', 3, [16, 18]), 'John 3:16, 18');
  assert.equal(formatVerseReference('John', 3, [16, 17, 20]), 'John 3:16-17, 20');
});

test('formatVerseReference sorts and de-duplicates', () => {
  assert.equal(formatVerseReference('John', 3, [18, 16, 17, 16]), 'John 3:16-18');
});

test('formatVerseReference falls back to the chapter when nothing is selected', () => {
  assert.equal(formatVerseReference('John', 3, []), 'John 3');
});

test('verseShareText puts reference first and the deep link last', () => {
  const out = verseShareText({
    reference: 'John 3:16',
    text: 'For God so loved the world.',
    translation: 'KJV',
    url: 'https://amosroger91.github.io/The-Word/#John.3.16',
  });
  const lines = out.split('\n');
  assert.equal(lines[0], 'John 3:16 (KJV)');
  assert.equal(lines[1], '');
  assert.equal(lines[2], 'For God so loved the world.');
  assert.equal(lines[3], '');
  assert.equal(lines[4], 'https://amosroger91.github.io/The-Word/#John.3.16');
  assert.equal(lines.length, 5);
});

test('verseShareText omits the translation when unknown', () => {
  const out = verseShareText({ reference: 'John 3:16', text: 'x', url: 'https://e.com/#John.3.16' });
  assert.equal(out.split('\n')[0], 'John 3:16');
});
