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

transpile(path.join(root, 'packages/core/src/day.ts'), 'day.mjs');
transpile(path.join(root, 'packages/bible/src/schema.ts'), 'schema.mjs');
const ledgerUrl = transpile(path.join(here, '../src/ledger.ts'), 'ledger.mjs', (text) => text
  .replaceAll("'@the-word/core'", "'./day.mjs'")
  .replaceAll('"@the-word/core"', "'./day.mjs'"));
const badgesUrl = transpile(path.join(here, '../src/badges.ts'), 'badges.mjs', (text) => text
  .replaceAll("'@the-word/core'", "'./day.mjs'")
  .replaceAll('"@the-word/core"', "'./day.mjs'")
  .replaceAll("'@the-word/bible'", "'./schema.mjs'")
  .replaceAll('"@the-word/bible"', "'./schema.mjs'")
  .replaceAll("'./ledger'", "'./ledger.mjs'")
  .replaceAll('"./ledger"', "'./ledger.mjs'"));

const { appendEvent, mergeLedgers, uniqueChapters, alreadyReadToday, latestAnswers, eventId } = await import(ledgerUrl);
const { evaluate, BADGES, progressToward, hashLedger, bibleProgress } = await import(badgesUrl);
const { BOOKS_DATA } = await import(pathToFileURL(path.join(compiledDir, 'schema.mjs')).href);
const { dayKey } = await import(pathToFileURL(path.join(compiledDir, 'day.mjs')).href);

const ACTOR = 'gunpub';

function read(at, bookId, chapter, counter) {
  return { id: eventId(ACTOR, counter), kind: 'read', at, bookId, chapter };
}

test('merge is a set union by id and counters stay monotonic', () => {
  let events = [];
  ({ events } = appendEvent(events, ACTOR, { kind: 'read', at: '2026-09-01T10:00:00.000Z', bookId: 43, chapter: 1 }));
  const first = events[0];
  const other = [{ id: eventId('other', 1), kind: 'read', at: '2026-09-01T11:00:00.000Z', bookId: 19, chapter: 1 }];
  const merged = mergeLedgers(events, other);
  assert.equal(merged.length, 2);
  assert.equal(mergeLedgers(merged, [first]).length, 2);
  const next = appendEvent(merged, ACTOR, { kind: 'read', at: '2026-09-01T12:00:00.000Z', bookId: 43, chapter: 2 });
  assert.equal(next.event.id, eventId(ACTOR, 2));
});

test('the same chapter on the same local day is not counted twice', () => {
  const at = '2026-09-01T12:00:00.000Z';
  const today = dayKey(new Date(at));
  const events = [read(at, 43, 3, 1)];
  assert.equal(alreadyReadToday(events, 43, 3, today), true);
  assert.equal(alreadyReadToday(events, 43, 4, today), false);
  assert.equal(uniqueChapters([
    read('2026-09-01T08:00:00', 43, 3, 1),
    read('2026-09-02T08:00:00', 43, 3, 2),
    read('2026-09-02T09:00:00', 43, 4, 3),
  ]).length, 2);
});

test('a changed answer appends; the newest at wins; null is a tombstone', () => {
  const events = [
    { id: eventId(ACTOR, 1), kind: 'answer', at: '2026-09-01T10:00:00.000Z', planId: 'p', sessionId: 's', questionId: 'q', value: { type: 'free', text: 'first' }, share: 'private' },
    { id: eventId(ACTOR, 2), kind: 'answer', at: '2026-09-01T11:00:00.000Z', planId: 'p', sessionId: 's', questionId: 'q', value: { type: 'free', text: 'second' }, share: 'private' },
    { id: eventId(ACTOR, 3), kind: 'answer', at: '2026-09-01T12:00:00.000Z', planId: 'p', sessionId: 's', questionId: 'q', value: null, share: 'private' },
  ];
  const latest = latestAnswers(events).get('p:s:q');
  assert.equal(latest.value, null);
});

test('badges are derived: earnedAt is the event that crossed the threshold', () => {
  const events = [];
  for (let i = 1; i <= 7; i++) events.push(read(`2026-09-0${i}T12:00:00.000Z`, 43, i, i));
  const earned = evaluate(events, BADGES);
  const first = earned.find((badge) => badge.id === 'first-chapter');
  const seven = earned.find((badge) => badge.id === 'seven-chapters');
  const streak = earned.find((badge) => badge.id === 'streak-7');
  assert.equal(first.earnedAt, '2026-09-01T12:00:00.000Z');
  assert.equal(seven.earnedAt, '2026-09-07T12:00:00.000Z');
  assert.equal(streak.earnedAt, '2026-09-07T12:00:00.000Z');
  assert.equal(earned.some((badge) => badge.id === 'thirty-chapters'), false);
});

test('a skipped day breaks the streak; finishing John earns the gospel badge', () => {
  const broken = [
    read('2026-09-01T12:00:00.000Z', 1, 1, 1),
    read('2026-09-02T12:00:00.000Z', 1, 2, 2),
    read('2026-09-04T12:00:00.000Z', 1, 3, 3),
  ];
  assert.equal(progressToward(BADGES.find((badge) => badge.id === 'streak-3'), broken, '2026-09-04').have, 1);

  const john = [];
  for (let chapter = 1; chapter <= 21; chapter++) {
    john.push(read(`2026-01-${String(chapter).padStart(2, '0')}T12:00:00.000Z`, 43, chapter, chapter));
  }
  const earned = evaluate(john, BADGES);
  const gospel = earned.find((badge) => badge.id === 'book-43');
  const whole = earned.find((badge) => badge.id === 'any-book');
  assert.equal(gospel.earnedAt, '2026-01-21T12:00:00.000Z');
  assert.equal(whole.earnedAt, '2026-01-21T12:00:00.000Z');
});

test('bible, testament, and book badges follow unique chapters', () => {
  const philemon = [read('2026-02-01T12:00:00.000Z', 57, 1, 1)];
  const afterPhilemon = evaluate(philemon, BADGES);
  assert.ok(afterPhilemon.some((badge) => badge.id === 'book-57'));
  assert.equal(bibleProgress(philemon).all.have, 1);
  assert.equal(bibleProgress(philemon).all.need, BOOKS_DATA.reduce((sum, book) => sum + book.chapters, 0));

  const nt = [];
  let n = 0;
  for (const book of BOOKS_DATA.filter((item) => item.testament === 'new')) {
    for (let chapter = 1; chapter <= book.chapters; chapter++) {
      n += 1;
      nt.push(read('2026-03-01T12:00:00.000Z', book.id, chapter, n));
    }
  }
  assert.equal(progressToward(BADGES.find((badge) => badge.id === 'new-testament'), nt).done, true);
  assert.equal(progressToward(BADGES.find((badge) => badge.id === 'old-testament'), nt).done, false);
  assert.equal(progressToward(BADGES.find((badge) => badge.id === 'whole-bible'), nt).done, false);
  assert.equal(bibleProgress(nt).new.percent, 100);

  const all = [...nt];
  for (const book of BOOKS_DATA.filter((item) => item.testament === 'old')) {
    for (let chapter = 1; chapter <= book.chapters; chapter++) {
      n += 1;
      all.push(read('2026-04-01T12:00:00.000Z', book.id, chapter, n));
    }
  }
  assert.equal(progressToward(BADGES.find((badge) => badge.id === 'old-testament'), all).done, true);
  assert.equal(progressToward(BADGES.find((badge) => badge.id === 'whole-bible'), all).done, true);
  assert.equal(bibleProgress(all).all.percent, 100);
  assert.equal(BADGES.filter((badge) => badge.id.startsWith('book-')).length, 66);
});

test('ledger hash changes when an event is added', () => {
  const a = [read('2026-09-01T12:00:00.000Z', 43, 1, 1)];
  const b = [...a, read('2026-09-02T12:00:00.000Z', 43, 2, 2)];
  assert.notEqual(hashLedger(a), hashLedger(b));
  assert.equal(hashLedger(b), hashLedger([...b].reverse()));
});
