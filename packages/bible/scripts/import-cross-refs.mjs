import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const source = join(root, 'data', 'cross-references-src', 'cross_references.txt');
const outDir = join(root, 'src', 'data', 'cross-refs');
const TOP = 12;

const OPEN_BIBLE_BOOKS = {
  Gen: 1, Exod: 2, Lev: 3, Num: 4, Deut: 5, Josh: 6, Judg: 7, Ruth: 8,
  '1Sam': 9, '2Sam': 10, '1Kgs': 11, '2Kgs': 12, '1Chr': 13, '2Chr': 14,
  Ezra: 15, Neh: 16, Esth: 17, Job: 18, Ps: 19, Prov: 20, Eccl: 21, Song: 22,
  Isa: 23, Jer: 24, Lam: 25, Ezek: 26, Dan: 27, Hos: 28, Joel: 29, Amos: 30,
  Obad: 31, Jonah: 32, Mic: 33, Nah: 34, Hab: 35, Zeph: 36, Hag: 37, Zech: 38, Mal: 39,
  Matt: 40, Mark: 41, Luke: 42, John: 43, Acts: 44, Rom: 45,
  '1Cor': 46, '2Cor': 47, Gal: 48, Eph: 49, Phil: 50, Col: 51,
  '1Thess': 52, '2Thess': 53, '1Tim': 54, '2Tim': 55, Titus: 56, Phlm: 57,
  Heb: 58, Jas: 59, '1Pet': 60, '2Pet': 61, '1John': 62, '2John': 63, '3John': 64,
  Jude: 65, Rev: 66,
};

function parseOne(token) {
  const match = token.match(/^([A-Za-z0-9]+)\.(\d+)\.(\d+)$/);
  if (!match) return null;
  const bookId = OPEN_BIBLE_BOOKS[match[1]];
  if (!bookId) return null;
  return { bookId, chapter: Number(match[2]), verse: Number(match[3]) };
}

function parseRef(token) {
  const parts = token.split('-');
  const start = parseOne(parts[0]);
  if (!start) return null;
  if (parts.length === 1) return { ...start, endVerse: start.verse };
  if (/^\d+$/.test(parts[1])) return { ...start, endVerse: Number(parts[1]) };
  const end = parseOne(parts[1]);
  if (!end || end.bookId !== start.bookId || end.chapter !== start.chapter) {
    return { ...start, endVerse: start.verse };
  }
  return { ...start, endVerse: Math.max(start.verse, end.verse) };
}

const text = readFileSync(source, 'utf8');
const books = new Map();
let kept = 0;
let skipped = 0;

for (const line of text.split(/\r?\n/)) {
  if (!line || line.startsWith('From Verse')) continue;
  const [fromText, toText, votesText] = line.split('\t');
  const from = fromText ? parseRef(fromText) : null;
  const to = toText ? parseRef(toText) : null;
  const votes = Number(votesText);
  if (!from || !to || from.bookId === to.bookId && from.chapter === to.chapter && from.verse === to.verse) {
    skipped += 1;
    continue;
  }
  const book = books.get(from.bookId) ?? new Map();
  books.set(from.bookId, book);
  const chapter = book.get(from.chapter) ?? new Map();
  book.set(from.chapter, chapter);
  const list = chapter.get(from.verse) ?? [];
  chapter.set(from.verse, list);
  list.push({ to, votes: Number.isFinite(votes) ? votes : 0 });
  kept += 1;
}

mkdirSync(outDir, { recursive: true });
let verses = 0;
for (const [bookId, chapters] of books) {
  const json = {};
  for (const [chapter, verseMap] of chapters) {
    const chapterJson = {};
    for (const [verse, list] of verseMap) {
      list.sort((a, b) => b.votes - a.votes || a.to.bookId - b.to.bookId);
      const unique = [];
      const seen = new Set();
      for (const item of list) {
        const key = `${item.to.bookId}:${item.to.chapter}:${item.to.verse}:${item.to.endVerse}`;
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push([item.to.bookId, item.to.chapter, item.to.verse, item.to.endVerse]);
        if (unique.length === TOP) break;
      }
      chapterJson[String(verse)] = unique;
      verses += 1;
    }
    json[String(chapter)] = chapterJson;
  }
  writeFileSync(join(outDir, `${bookId}.json`), `${JSON.stringify(json)}\n`);
}

const loader = [
  `import type { BookCrossRefFile } from './crossRefs';`,
  ``,
  `export const crossRefLoaders: Record<number, () => Promise<{ default: BookCrossRefFile }>> = {`,
  ...Array.from({ length: 66 }, (_, index) => `  ${index + 1}: () => import('./data/cross-refs/${index + 1}.json'),`),
  `};`,
  ``,
].join('\n');
writeFileSync(join(root, 'src', 'crossRefLoaders.ts'), loader);

console.log(`Wrote ${books.size} books, ${verses} verses with refs (${kept} edges kept, ${skipped} skipped) to ${outDir}`);
