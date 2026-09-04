/**
 * Bible text importer for public domain translations
 */

import fs from 'fs';
import path from 'path';
import { SqliteBibleDatabase, getBibleDatabase } from './database';
import type { ParsedVerse, ImportResult } from './types';

const DATA_DIR = path.join(process.cwd(), 'data', 'translations');

// USFX/OSIS verse format parser
export function parseUsfx(content: string): ParsedVerse[] {
  const verses: ParsedVerse[] = [];
  const lines = content.split('\n');

  let currentBook = 0;
  let currentChapter = 0;

  // Regex patterns for USFX markers
  const bookRegex = /\\id\s+(\w+)/;
  const chapterRegex = /\\c\s+(\d+)/;
  const verseRegex = /\\v\s+(\d+)\s+(.*)/;

  // Book ID mapping (USFX 3-letter codes to our numeric IDs)
  const bookIdMap: Record<string, number> = {
    'GEN': 1, 'EXO': 2, 'LEV': 3, 'NUM': 4, 'DEU': 5,
    'JOS': 6, 'JDG': 7, 'RUT': 8, '1SA': 9, '2SA': 10,
    '1KI': 11, '2KI': 12, '1CH': 13, '2CH': 14, 'EZR': 15,
    'NEH': 16, 'EST': 17, 'JOB': 18, 'PSA': 19, 'PRO': 20,
    'ECC': 21, 'SNG': 22, 'ISA': 23, 'JER': 24, 'LAM': 25,
    'EZK': 26, 'DAN': 27, 'HOS': 28, 'JOL': 29, 'AMO': 30,
    'OBA': 31, 'JON': 32, 'MIC': 33, 'NAM': 34, 'HAB': 35,
    'ZEP': 36, 'HAG': 37, 'ZEC': 38, 'MAL': 39,
    'MAT': 40, 'MRK': 41, 'LUK': 42, 'JHN': 43, 'ACT': 44,
    'ROM': 45, '1CO': 46, '2CO': 47, 'GAL': 48, 'EPH': 49,
    'PHP': 50, 'COL': 51, '1TH': 52, '2TH': 53, '1TI': 54,
    '2TI': 55, 'TIT': 56, 'PHM': 57, 'HEB': 58, 'JAS': 59,
    '1PE': 60, '2PE': 61, '1JN': 62, '2JN': 63, '3JN': 64,
    'JUD': 65, 'REV': 66,
  };

  for (const line of lines) {
    const bookMatch = line.match(bookRegex);
    if (bookMatch) {
      const code = (bookMatch[1] ?? '').toUpperCase();
      currentBook = bookIdMap[code] || 0;
      currentChapter = 0;
      continue;
    }

    const chapterMatch = line.match(chapterRegex);
    if (chapterMatch) {
      currentChapter = parseInt(chapterMatch[1] ?? '', 10);
      continue;
    }

    const verseMatch = line.match(verseRegex);
    if (verseMatch && currentBook > 0 && currentChapter > 0) {
      const verseNum = parseInt(verseMatch[1] ?? '', 10);
      const text = (verseMatch[2] ?? '').trim();
      if (text) {
        verses.push({
          bookId: currentBook,
          chapter: currentChapter,
          verse: verseNum,
          text,
        });
      }
    }
  }

  return verses;
}

// Simple text format parser (one verse per line: Book Chapter:Verse Text)
export function parseSimpleText(content: string): ParsedVerse[] {
  const verses: ParsedVerse[] = [];
  const lines = content.split('\n');

  // Book name to ID mapping
  const bookNameMap: Record<string, number> = {
    'Genesis': 1, 'Exodus': 2, 'Leviticus': 3, 'Numbers': 4, 'Deuteronomy': 5,
    'Joshua': 6, 'Judges': 7, 'Ruth': 8, '1 Samuel': 9, '2 Samuel': 10,
    '1 Kings': 11, '2 Kings': 12, '1 Chronicles': 13, '2 Chronicles': 14, 'Ezra': 15,
    'Nehemiah': 16, 'Esther': 17, 'Job': 18, 'Psalms': 19, 'Proverbs': 20,
    'Ecclesiastes': 21, 'Song of Solomon': 22, 'Isaiah': 23, 'Jeremiah': 24, 'Lamentations': 25,
    'Ezekiel': 26, 'Daniel': 27, 'Hosea': 28, 'Joel': 29, 'Amos': 30,
    'Obadiah': 31, 'Jonah': 32, 'Micah': 33, 'Nahum': 34, 'Habakkuk': 35,
    'Zephaniah': 36, 'Haggai': 37, 'Zechariah': 38, 'Malachi': 39,
    'Matthew': 40, 'Mark': 41, 'Luke': 42, 'John': 43, 'Acts': 44,
    'Romans': 45, '1 Corinthians': 46, '2 Corinthians': 47, 'Galatians': 48, 'Ephesians': 49,
    'Philippians': 50, 'Colossians': 51, '1 Thessalonians': 52, '2 Thessalonians': 53, '1 Timothy': 54,
    '2 Timothy': 55, 'Titus': 56, 'Philemon': 57, 'Hebrews': 58, 'James': 59,
    '1 Peter': 60, '2 Peter': 61, '1 John': 62, '2 John': 63, '3 John': 64,
    'Jude': 65, 'Revelation': 66,
  };

  const verseRegex = /^(.+?)\s+(\d+):(\d+)\s+(.+)$/;

  for (const line of lines) {
    const match = line.trim().match(verseRegex);
    if (match) {
      const bookName = (match[1] ?? '').trim();
      const chapter = parseInt(match[2] ?? '', 10);
      const verse = parseInt(match[3] ?? '', 10);
      const text = (match[4] ?? '').trim();

      const bookId = bookNameMap[bookName];
      if (bookId) {
        verses.push({ bookId, chapter, verse, text });
      }
    }
  }

  return verses;
}

// Generic parser that tries multiple formats
export function parseBibleText(content: string, format: 'usfx' | 'simple' | 'auto' = 'auto'): ParsedVerse[] {
  if (format === 'usfx' || (format === 'auto' && content.includes('\\id '))) {
    return parseUsfx(content);
  }
  if (format === 'simple' || (format === 'auto' && content.match(/^\w+\s+\d+:\d+/m))) {
    return parseSimpleText(content);
  }
  // Default to simple
  return parseSimpleText(content);
}

export async function importTranslation(
  translationId: string,
  filePath: string,
  format: 'usfx' | 'simple' | 'auto' = 'auto'
): Promise<ImportResult> {
  const db = getBibleDatabase() as SqliteBibleDatabase;
  const sqliteDb = db.getDb();

  const content = fs.readFileSync(filePath, 'utf-8');
  const verses = parseBibleText(content, format);

  const insertStmt = sqliteDb.prepare(`
    INSERT OR REPLACE INTO verses (translation_id, book_id, chapter, verse, text)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertMany = sqliteDb.transaction((verses: ParsedVerse[]) => {
    for (const v of verses) {
      insertStmt.run(translationId, v.bookId, v.chapter, v.verse, v.text);
    }
  });

  const errors: string[] = [];
  let imported = 0;

  try {
    insertMany(verses);
    imported = verses.length;
  } catch (error) {
    errors.push(error instanceof Error ? error.message : 'Unknown error');
  }

  // Verify import
  const countStmt = sqliteDb.prepare('SELECT COUNT(*) as count FROM verses WHERE translation_id = ?');
  const result = countStmt.get(translationId) as { count: number } | undefined;

  return {
    versesImported: result?.count || imported,
    errors,
  };
}

// Download helper for public domain translations
export async function downloadTranslation(
  translationId: string,
  url: string,
  outputPath: string
): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download ${translationId}: ${response.statusText}`);
  }
  const buffer = await response.arrayBuffer();
  fs.writeFileSync(outputPath, Buffer.from(buffer));
}