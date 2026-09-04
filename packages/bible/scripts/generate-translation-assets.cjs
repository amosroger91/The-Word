const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const dataRoot = path.join(root, 'src', 'data');
const outputRoot = path.join(dataRoot, 'translations');
fs.mkdirSync(outputRoot, { recursive: true });

function writeJson(name, data) {
  const output = path.join(outputRoot, `${name}.json`);
  fs.writeFileSync(output, JSON.stringify(data));
  const size = fs.statSync(output).size;
  console.log(`${name}: ${size} bytes`);
}

function normalizeBookData(bookData) {
  const result = {};
  for (const chapter of bookData.chapters ?? []) {
    const verses = {};
    for (const verse of chapter.verses ?? []) verses[String(verse.verse)] = String(verse.text).trim();
    result[String(chapter.chapter)] = verses;
  }
  return result;
}

function generateKjv() {
  const input = JSON.parse(fs.readFileSync(path.join(dataRoot, 'kjv.json'), 'utf8'));
  return input;
}

function generateAsv() {
  const input = JSON.parse(fs.readFileSync(path.join(dataRoot, 'asv-source.json'), 'utf8'));
  const result = {};
  for (let index = 0; index < input.books.length; index += 1) result[String(index + 1)] = normalizeBookData(input.books[index]);
  return result;
}

const usfmBooks = [
  'GEN','EXO','LEV','NUM','DEU','JOS','JDG','RUT','1SA','2SA','1KI','2KI','1CH','2CH','EZR','NEH','EST','JOB','PSA','PRO','ECC','SNG','ISA','JER','LAM','EZK','DAN','HOS','JOL','AMO','OBA','JON','MIC','NAM','HAB','ZEP','HAG','ZEC','MAL','MAT','MRK','LUK','JHN','ACT','ROM','1CO','2CO','GAL','EPH','PHP','COL','1TH','2TH','1TI','2TI','TIT','PHM','HEB','JAS','1PE','2PE','1JN','2JN','3JN','JUD','REV'
];

function cleanUsfm(text) {
  return text
    .replace(/\\f .*?\\f\*/g, '')
    .replace(/\\x .*?\\x\*/g, '')
    .replace(/\\w ([^|]+)\|[^}]+\}/g, '$1')
    .replace(/\\add ([^|]+)\\add\*/g, '$1')
    .replace(/\\[a-z]+\*?/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function generateWeb() {
  const sourceRoot = path.join(dataRoot, 'web-source');
  const result = {};
  for (let index = 0; index < usfmBooks.length; index += 1) {
    const code = usfmBooks[index];
    const file = fs.readdirSync(sourceRoot).find((name) => name.includes(`-${code}engwebp.usfm`));
    if (!file) throw new Error(`Missing WEB source for ${code}`);
    const content = fs.readFileSync(path.join(sourceRoot, file), 'utf8');
    const chapters = {};
    let chapter = 0;
    for (const line of content.split(/\r?\n/)) {
      const chapterMatch = line.match(/^\\c\s+(\d+)/);
      if (chapterMatch) {
        chapter = Number(chapterMatch[1]);
        chapters[String(chapter)] ??= {};
        continue;
      }
      const verseMatch = line.match(/^\\v\s+(\d+)(?:\s+)?(.*)$/);
      if (verseMatch && chapter > 0) {
        const text = cleanUsfm(verseMatch[2]);
        if (text) chapters[String(chapter)][verseMatch[1]] = text;
      }
    }
    result[String(index + 1)] = chapters;
  }
  return result;
}

writeJson('kjv', generateKjv());
writeJson('asv', generateAsv());
writeJson('web', generateWeb());
