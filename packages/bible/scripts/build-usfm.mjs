import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = fileURLToPath(new URL('..', import.meta.url));
const cache = join(packageRoot, '.usfm-cache');
const dataDir = join(packageRoot, 'src', 'data');

const sources = [
  { id: 'kjv', ebible: 'eng-kjv', writeText: false },
  { id: 'asv', ebible: 'eng-asv', writeText: false },
  { id: 'web', ebible: 'eng-web', writeText: true },
  { id: 'rv1909', ebible: 'spaRV1909', writeText: true },
  { id: 'rv1602p', ebible: 'spav1602p', writeText: true },
  { id: 'cuv', ebible: 'cmn-cu89s', writeText: true },
  { id: 'vie1934', ebible: 'vie1934', writeText: true },
  { id: 'lsg', ebible: 'fraLSG', writeText: true },
];

const bookIds = {
  GEN: 1, EXO: 2, LEV: 3, NUM: 4, DEU: 5, JOS: 6, JDG: 7, RUT: 8, '1SA': 9, '2SA': 10,
  '1KI': 11, '2KI': 12, '1CH': 13, '2CH': 14, EZR: 15, NEH: 16, EST: 17, JOB: 18, PSA: 19, PRO: 20,
  ECC: 21, SNG: 22, ISA: 23, JER: 24, LAM: 25, EZK: 26, DAN: 27, HOS: 28, JOL: 29, AMO: 30,
  OBA: 31, JON: 32, MIC: 33, NAM: 34, HAB: 35, ZEP: 36, HAG: 37, ZEC: 38, MAL: 39,
  MAT: 40, MRK: 41, LUK: 42, JHN: 43, ACT: 44, ROM: 45, '1CO': 46, '2CO': 47, GAL: 48, EPH: 49,
  PHP: 50, COL: 51, '1TH': 52, '2TH': 53, '1TI': 54, '2TI': 55, TIT: 56, PHM: 57, HEB: 58, JAS: 59,
  '1PE': 60, '2PE': 61, '1JN': 62, '2JN': 63, '3JN': 64, JUD: 65, REV: 66,
};

async function fetchSource(ebible) {
  const directory = join(cache, ebible);
  if (existsSync(directory)) return directory;
  const archive = join(cache, ebible + '.zip');
  mkdirSync(cache, { recursive: true });
  if (!existsSync(archive)) {
    const response = await fetch('https://ebible.org/Scriptures/' + ebible + '_usfm.zip');
    if (!response.ok) throw new Error(response.status + ' for ' + ebible);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(archive));
  }
  mkdirSync(directory, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync('powershell', ['-NoProfile', '-Command', 'Expand-Archive -Path "' + archive + '" -DestinationPath "' + directory + '" -Force']);
  } else {
    execFileSync('unzip', ['-oq', archive, '-d', directory]);
  }
  return directory;
}

// Reduces one verse of USFM to display text plus the character ranges marked \wj (words of Jesus).
function readVerse(usfm) {
  const cleaned = usfm
    .replace(/\\[fx]\s.*?\\[fx]\*/g, '')
    .replace(/\\\+?w\s([^\\|]*?)(\|[^\\]*?)?\\\+?w\*/g, '$1')
    .replace(/\\(?!wj)\+?[a-z]+\d*\*?/g, '')
    .replace(/\|[a-z-]+="[^"]*"/g, '')
    .replace(/¶/g, '');

  const pieces = [];
  let depth = 0;
  let index = 0;
  while (index < cleaned.length) {
    const next = cleaned.indexOf('\\wj', index);
    if (next === -1) {
      pieces.push({ text: cleaned.slice(index), red: depth > 0 });
      break;
    }
    pieces.push({ text: cleaned.slice(index, next), red: depth > 0 });
    const closing = cleaned[next + 3] === '*';
    depth += closing ? -1 : 1;
    index = next + (closing ? 4 : 3);
  }

  let text = '';
  const spans = [];
  for (const piece of pieces) {
    // U+3000 carries meaning in Chinese sources (the reverential space before 神), so it is not treated as whitespace.
    let addition = piece.text
      .replace(/[^\S　]+/g, ' ')
      .replace(/ (?=[　-〿一-鿿＀-￯])|(?<=[　-〿一-鿿＀-￯]) /g, '');
    if (/ $/.test(text) || cjk.test(text.slice(-1))) addition = addition.replace(/^ +/, '');
    if (cjk.test(addition.slice(0, 1))) text = text.replace(/ +$/, '');
    const start = text.length;
    text += addition;
    if (piece.red && text.length > start) spans.push([start, text.length]);
  }

  const shift = text.length - text.trimStart().length;
  const trimmed = text.trim();
  const bounded = [];
  for (const [start, end] of spans) {
    let from = Math.max(0, start - shift);
    let to = Math.min(trimmed.length, end - shift);
    while (from < to && trimmed[from] === ' ') from++;
    while (to > from && trimmed[to - 1] === ' ') to--;
    if (to > from) bounded.push([from, to]);
  }
  return { text: trimmed, spans: mergeSpans(bounded) };
}

const cjk = /[　-〿一-鿿＀-￯]/;

function mergeSpans(spans) {
  const merged = [];
  for (const span of spans.sort((a, b) => a[0] - b[0])) {
    const last = merged[merged.length - 1];
    if (last && span[0] <= last[1] + 1) last[1] = Math.max(last[1], span[1]);
    else merged.push([span[0], span[1]]);
  }
  return merged;
}

// \toc2 is the short running name, but some sources abbreviate it ("Gi" for "Giăng"), so prefer \toc1 when it expands it.
function bookName({ toc1, toc2, h }) {
  if (toc2 && toc1 && toc1.length > toc2.length && toc1.toLowerCase().startsWith(toc2.toLowerCase())) return toc1;
  return toc2 ?? h ?? toc1 ?? '';
}

function readBook(file) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const verses = [];
  const names = {};
  let code = '';
  let chapter = 0;
  let current = null;
  for (const line of lines) {
    const id = line.match(/^\\id\s+(\w+)/);
    if (id) { code = id[1].toUpperCase(); continue; }
    const heading = line.match(/^\\(toc2|toc1|h)\s+(.*\S)/);
    if (heading) { names[heading[1]] ??= heading[2].trim(); continue; }
    const shortName = line.match(/^\\toc3\s+(.*\S)/);
    if (shortName) { names.toc3 ??= shortName[1].trim(); continue; }
    const chapterMatch = line.match(/^\\c\s+(\d+)/);
    if (chapterMatch) { chapter = Number(chapterMatch[1]); current = null; continue; }
    const verseMatch = line.match(/^\\v\s+(\d+)\s?(.*)$/);
    if (verseMatch) {
      current = { chapter, verse: Number(verseMatch[1]), usfm: verseMatch[2] };
      verses.push(current);
      continue;
    }
    if (!current || /^\\(id|ide|rem|sts|toc|mt|ms|is|ip|iot|io|imt|s\d?|r|d|sp|cl|cp|b)\b/.test(line)) continue;
    current.usfm += ' ' + line.replace(/^\\[a-z]+\d*\s?/, '');
  }
  return { bookId: bookIds[code] ?? 0, names: { name: bookName(names), shortName: names.toc3 ?? '' }, verses };
}

// Normalized view of a string plus the original index of every kept character.
function indexMap(text) {
  const characters = [];
  const offsets = [];
  let space = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index].normalize('NFC').replace(/[‘’]/g, "'").replace(/[“”]/g, '"');
    if (/\s/.test(character)) {
      if (space || !characters.length) continue;
      space = true;
      characters.push(' ');
      offsets.push(index);
      continue;
    }
    space = false;
    characters.push(character);
    offsets.push(index);
  }
  return { normalized: characters.join(''), offsets };
}

// Maps spans found in the eBible source onto the text we ship, tolerating punctuation differences.
function alignSpans(sourceText, spans, targetText) {
  const source = indexMap(sourceText);
  const target = indexMap(targetText);
  const aligned = [];
  let cursor = 0;
  for (const [start, end] of spans) {
    const from = source.offsets.findIndex((offset) => offset >= start);
    const to = source.offsets.findIndex((offset) => offset >= end);
    const phrase = source.normalized.slice(from === -1 ? 0 : from, to === -1 ? source.normalized.length : to).trim();
    if (phrase.length < 4) continue;
    const found = target.normalized.indexOf(phrase, cursor);
    if (found === -1) return null;
    cursor = found + phrase.length;
    aligned.push([target.offsets[found], (target.offsets[found + phrase.length - 1] ?? targetText.length - 1) + 1]);
  }
  return mergeSpans(aligned);
}

function write(file, value) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(value));
}

const fullVerseSpeech = {};

for (const source of sources) {
  const directory = await fetchSource(source.ebible);
  const files = readdirSync(directory).filter((file) => file.endsWith('.usfm'));
  const text = {};
  const red = {};
  const books = {};
  let redVerses = 0;
  let unaligned = 0;

  const shipped = source.writeText ? null : JSON.parse(readFileSync(join(dataDir, 'translations', source.id + '.json'), 'utf8'));

  for (const file of files) {
    const book = readBook(join(directory, file));
    if (!book.bookId) continue;
    books[book.bookId] = book.names;
    for (const verse of book.verses) {
      const parsed = readVerse(verse.usfm);
      if (!parsed.text) continue;
      const bookKey = String(book.bookId);
      const chapterKey = String(verse.chapter);
      const verseKey = String(verse.verse);
      const target = shipped ? shipped[bookKey]?.[chapterKey]?.[verseKey] : parsed.text;
      if (!target) continue;
      if (source.writeText) {
        text[bookKey] ??= {};
        text[bookKey][chapterKey] ??= {};
        text[bookKey][chapterKey][verseKey] = parsed.text;
      }
      if (!parsed.spans.length) continue;
      const spans = shipped ? alignSpans(parsed.text, parsed.spans, target) : parsed.spans;
      if (!spans || !spans.length) { unaligned++; continue; }
      red[bookKey] ??= {};
      red[bookKey][chapterKey] ??= {};
      red[bookKey][chapterKey][verseKey] = spans;
      redVerses++;
      if (source.id === 'kjv' && spans.length === 1 && spans[0][0] === 0 && spans[0][1] === target.length) {
        fullVerseSpeech[bookKey] ??= {};
        fullVerseSpeech[bookKey][chapterKey] ??= {};
        fullVerseSpeech[bookKey][chapterKey][verseKey] = true;
      }
    }
  }

  if (source.writeText) write(join(dataDir, 'translations', source.id + '.json'), text);
  write(join(dataDir, 'book-names', source.id + '.json'), books);
  if (redVerses) write(join(dataDir, 'red-letters', source.id + '.json'), red);
  console.log(source.id.padEnd(8) + ' red verses ' + String(redVerses).padStart(5) + ' | unaligned ' + unaligned + (source.writeText ? ' | text rebuilt' : ''));
}

// Sources without \wj markers reuse the KJV verses that are entirely Jesus speech.
for (const source of sources) {
  const file = join(dataDir, 'red-letters', source.id + '.json');
  if (existsSync(file)) continue;
  const shipped = JSON.parse(readFileSync(join(dataDir, 'translations', source.id + '.json'), 'utf8'));
  const red = {};
  let count = 0;
  for (const [bookKey, chapters] of Object.entries(fullVerseSpeech)) {
    for (const [chapterKey, verses] of Object.entries(chapters)) {
      for (const verseKey of Object.keys(verses)) {
        const verse = shipped[bookKey]?.[chapterKey]?.[verseKey];
        if (!verse) continue;
        red[bookKey] ??= {};
        red[bookKey][chapterKey] ??= {};
        red[bookKey][chapterKey][verseKey] = [[0, verse.length]];
        count++;
      }
    }
  }
  write(file, red);
  console.log(source.id.padEnd(8) + ' red verses ' + String(count).padStart(5) + ' | whole-verse speech mapped from KJV');
}
