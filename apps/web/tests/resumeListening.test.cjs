const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const file = path.join(__dirname, '../../../packages/core/src/resumeListening.ts');
const exported = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText,
  { exports: exported },
);
const { spotToRemember, verseToResume } = exported;
const here = { bookId: 43, chapter: 3, verse: 8 };

function same(spot, expected) {
  assert.equal(spot && spot.bookId, expected.bookId);
  assert.equal(spot && spot.chapter, expected.chapter);
  assert.equal(spot && spot.verse, expected.verse);
}

test('an explicit stop mid-chapter remembers that verse', () => {
  same(spotToRemember(null, { remember: true, state: 'speaking', verse: 8, bookId: 43, chapter: 3 }), here);
  same(spotToRemember(null, { remember: true, state: 'paused', verse: 8, bookId: 43, chapter: 3 }), here);
});

test('stopping on the first verse clears a saved spot in that chapter only', () => {
  assert.equal(spotToRemember(here, { remember: true, state: 'speaking', verse: 1, bookId: 43, chapter: 3 }), null);
  assert.deepEqual(spotToRemember(here, { remember: true, state: 'speaking', verse: 1, bookId: 43, chapter: 4 }), here);
});

test('group sync and other silent stops do not move the spot', () => {
  assert.equal(spotToRemember(here, { remember: false, state: 'speaking', verse: 12, bookId: 43, chapter: 3 }), here);
  assert.equal(spotToRemember(here, { remember: true, state: 'idle', verse: null, bookId: 43, chapter: 3 }), here);
  assert.equal(spotToRemember(null, { remember: true, state: 'speaking', verse: null, bookId: 43, chapter: 3 }), null);
});

test('listen resumes only when this chapter still contains the verse', () => {
  assert.equal(verseToResume(here, 43, 3, [1, 2, 3, 8, 9]), 8);
  assert.equal(verseToResume(here, 43, 4, [1, 2, 3, 8, 9]), null);
  assert.equal(verseToResume(here, 43, 3, [1, 2, 3]), null);
  assert.equal(verseToResume(null, 43, 3, [1, 2, 8]), null);
});
