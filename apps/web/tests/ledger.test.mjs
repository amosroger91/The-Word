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
transpile(path.join(root, 'packages/bible/src/parseRef.ts'), 'parseRef.mjs', (text) => text
  .replaceAll("'./schema'", "'./schema.mjs'")
  .replaceAll('"./schema"', "'./schema.mjs'"));
fs.writeFileSync(path.join(compiledDir, 'bible.mjs'), "export * from './schema.mjs';\nexport * from './parseRef.mjs';\n");
const verseLinkUrl = transpile(path.join(here, '../src/verseLink.ts'), 'verseLink.mjs', (text) => text
  .replaceAll("'@the-word/bible'", "'./bible.mjs'")
  .replaceAll('"@the-word/bible"', "'./bible.mjs'"));
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

const { appendEvent, mergeLedgers, uniqueChapters, alreadyReadToday, latestAnswers, eventId, shareCount, distinctShareCount, imageShareStats, groupActionCount, groupActionsDone } = await import(ledgerUrl);
const { evaluate, BADGES, progressToward, hashLedger, bibleProgress } = await import(badgesUrl);
const { parseVerseHash, encodeVerseRef, readerViewFromHash } = await import(verseLinkUrl);
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

test('funny book badges fire with the matching finished book', () => {
  const song = [];
  for (let chapter = 1; chapter <= 8; chapter++) song.push(read('2026-05-01T12:00:00.000Z', 22, chapter, chapter));
  const afterSong = evaluate(song, BADGES);
  assert.ok(afterSong.some((badge) => badge.id === 'fun-casanova'));
  assert.ok(afterSong.some((badge) => badge.id === 'book-22'));

  const obadiah = [read('2026-05-02T12:00:00.000Z', 31, 1, 1)];
  assert.ok(evaluate(obadiah, BADGES).some((badge) => badge.id === 'fun-blink'));
});

test('verse hashes round-trip and deep links open the reader', () => {
  assert.equal(encodeVerseRef(43, 3, 16), 'John.3.16');
  assert.deepEqual(parseVerseHash('#John.3.16'), { bookId: 43, chapter: 3, verse: 16 });
  assert.deepEqual(parseVerseHash('#1Jn.4.8'), { bookId: 62, chapter: 4, verse: 8 });
  assert.deepEqual(parseVerseHash('#Gen-1-1'), { bookId: 1, chapter: 1, verse: 1 });
  assert.equal(parseVerseHash('#read'), null);
  assert.equal(parseVerseHash('#restore=ncryptsec1abc'), null);
  assert.equal(readerViewFromHash('#John.3.16'), 'reader');
  assert.equal(readerViewFromHash('#read'), 'reader');
  assert.equal(readerViewFromHash(''), 'home');
});

test('sharing a link or image earns the matching badges', () => {
  function share(via, n) {
    return { id: eventId(ACTOR, n), kind: 'share', at: '2026-06-01T12:00:00.000Z', bookId: 43, chapter: 3, verse: 16, via };
  }
  const one = [share('link', 1)];
  assert.ok(evaluate(one, BADGES).some((badge) => badge.id === 'share-link-1'));
  assert.equal(evaluate(one, BADGES).some((badge) => badge.id === 'share-image-1'), false);
  // Gallery counts distinct verses now: five exports of the SAME verse no longer earn it.
  const sameVerse = [1, 2, 3, 4, 5].map((n) => share('image', n));
  assert.equal(shareCount(sameVerse, 'image'), 5);
  assert.equal(evaluate(sameVerse, BADGES).some((badge) => badge.id === 'share-image-5'), false);
  const fiveVerses = [1, 2, 3, 4, 5].map((n) => ({ ...share('image', n), verse: 15 + n }));
  assert.ok(evaluate(fiveVerses, BADGES).some((badge) => badge.id === 'share-image-5'));
  const mixed = [share('link', 1), share('image', 2), share('feed', 3)];
  assert.ok(evaluate(mixed, BADGES).some((badge) => badge.id === 'share-any-3'));
});

test('ledger hash changes when an event is added', () => {
  const a = [read('2026-09-01T12:00:00.000Z', 43, 1, 1)];
  const b = [...a, read('2026-09-02T12:00:00.000Z', 43, 2, 2)];
  assert.notEqual(hashLedger(a), hashLedger(b));
  assert.equal(hashLedger(b), hashLedger([...b].reverse()));
});

// --- verse-image achievements -------------------------------------------------

function imageShare(n, { bookId = 43, chapter = 3, verse = 16, outcome } = {}) {
  return { id: eventId(ACTOR, n), kind: 'share', at: `2026-06-${String(n).padStart(2, '0')}T12:00:00.000Z`,
    bookId, chapter, verse, via: 'image', ...(outcome ? { outcome } : {}) };
}

test('distinctShareCount counts unique passages, not raw exports', () => {
  const sameVerse = [1, 2, 3].map((n) => imageShare(n));
  assert.equal(shareCount(sameVerse, 'image'), 3);
  assert.equal(distinctShareCount(sameVerse, 'image', 'verse'), 1);
  const threeVerses = [1, 2, 3].map((n) => imageShare(n, { verse: n }));
  assert.equal(distinctShareCount(threeVerses, 'image', 'verse'), 3);
});

test('distinctShareCount by book measures breadth', () => {
  const events = [imageShare(1, { bookId: 1 }), imageShare(2, { bookId: 1, verse: 2 }), imageShare(3, { bookId: 43 })];
  assert.equal(distinctShareCount(events, 'image', 'verse'), 3);
  assert.equal(distinctShareCount(events, 'image', 'book'), 2);
});

test('events written before outcome existed count as saved', () => {
  const events = [imageShare(1), imageShare(2, { verse: 2, outcome: 'shared' })];
  assert.equal(distinctShareCount(events, 'image', 'verse', 'saved'), 1);
  assert.equal(distinctShareCount(events, 'image', 'verse', 'shared'), 1);
});

test('Out the Door needs an image that actually left the device', () => {
  const saved = [imageShare(1)];
  assert.equal(evaluate(saved, BADGES).some((badge) => badge.id === 'share-image-sent-1'), false);
  const sent = [imageShare(1, { outcome: 'shared' })];
  assert.ok(evaluate(sent, BADGES).some((badge) => badge.id === 'share-image-sent-1'));
});

test('Touring Show needs seven different books', () => {
  const six = [1, 2, 3, 4, 5, 6].map((n) => imageShare(n, { bookId: n }));
  assert.equal(evaluate(six, BADGES).some((badge) => badge.id === 'share-image-books-7'), false);
  const seven = [...six, imageShare(7, { bookId: 7 })];
  assert.ok(evaluate(seven, BADGES).some((badge) => badge.id === 'share-image-books-7'));
});

test('imageShareStats summarises totals, breadth and the top book', () => {
  const events = [
    imageShare(1, { bookId: 43, verse: 16 }),
    imageShare(2, { bookId: 43, verse: 16 }),
    imageShare(3, { bookId: 43, verse: 17, outcome: 'shared' }),
    imageShare(4, { bookId: 19, verse: 1 }),
    { id: eventId(ACTOR, 9), kind: 'share', at: '2026-06-09T12:00:00.000Z', bookId: 1, chapter: 1, verse: 1, via: 'link' },
  ];
  const stats = imageShareStats(events);
  assert.equal(stats.total, 4);          // the link share is excluded
  assert.equal(stats.verses, 3);         // 43:3:16, 43:3:17, 19:1:1
  assert.equal(stats.books, 2);
  assert.equal(stats.sent, 1);
  assert.equal(stats.saved, 3);
  assert.deepEqual(stats.topBook, { bookId: 43, count: 3 });
  assert.equal(stats.recent[0].id, eventId(ACTOR, 4)); // newest first
});

// --- group-study achievements -------------------------------------------------

function groupEvent(n, action) {
  return { id: eventId(ACTOR, n), kind: 'group', at: `2026-07-${String(n).padStart(2, '0')}T12:00:00.000Z`, action };
}

test('groupActionCount filters by action', () => {
  const events = [groupEvent(1, 'join'), groupEvent(2, 'mic'), groupEvent(3, 'mic')];
  assert.equal(groupActionCount(events), 3);
  assert.equal(groupActionCount(events, 'mic'), 2);
  assert.equal(groupActionCount(events, 'cam'), 0);
  assert.deepEqual([...groupActionsDone(events)].sort(), ['join', 'mic']);
});

test('each group-study first earns exactly its own badge', () => {
  const pairs = [
    ['join', 'group-join-1'],
    ['chapter', 'group-chapter-1'],
    ['mic', 'group-mic-1'],
    ['cam', 'group-cam-1'],
    ['public', 'group-public-1'],
    ['private', 'group-private-1'],
    ['friendRequest', 'group-friend-1'],
  ];
  for (const [action, badgeId] of pairs) {
    const earned = evaluate([groupEvent(1, action)], BADGES).map((badge) => badge.id);
    assert.ok(earned.includes(badgeId), `${action} should earn ${badgeId}`);
    for (const [, other] of pairs) {
      if (other !== badgeId) assert.equal(earned.includes(other), false, `${action} must not earn ${other}`);
    }
  }
});

test('group badges are unaffected by reading or sharing events', () => {
  const events = [read('2026-07-01T12:00:00.000Z', 43, 1, 1)];
  const earned = evaluate(events, BADGES).map((badge) => badge.id);
  for (const id of ['group-join-1', 'group-mic-1', 'group-cam-1', 'group-friend-1']) {
    assert.equal(earned.includes(id), false);
  }
});

test('earnedAt is the group event that crossed the threshold', () => {
  const events = [groupEvent(1, 'join'), groupEvent(5, 'mic')];
  const mic = evaluate(events, BADGES).find((badge) => badge.id === 'group-mic-1');
  assert.equal(mic.earnedAt, '2026-07-05T12:00:00.000Z');
});
