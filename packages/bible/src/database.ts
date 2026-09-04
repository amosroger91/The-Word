/**
 * SQLite database implementation for Bible data
 */

import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { SCHEMA_SQL, BOOKS_DATA, TRANSLATIONS_DATA } from './schema';
import type {
  BibleDatabase,
  Translation,
  BibleBook,
  Verse,
  Chapter,
  SearchResult,
} from './types';

const DB_PATH = process.env.BIBLE_DB_PATH || path.join(process.cwd(), 'data', 'bible.db');

export class SqliteBibleDatabase implements BibleDatabase {
  private db: Database.Database;

  constructor(dbPath: string = DB_PATH) {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initialize();
  }

  private initialize(): void {
    this.db.exec(SCHEMA_SQL);
    this.seedTranslations();
    this.seedBooks();
  }

  private seedTranslations(): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO translations (id, name, short_name, description, copyright, language, is_public_domain, api_endpoint)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (const t of TRANSLATIONS_DATA) {
      stmt.run(t.id, t.name, t.shortName, t.description, t.copyright, t.language, t.isPublicDomain, t.apiEndpoint);
    }
  }

  private seedBooks(): void {
    const stmt = this.db.prepare(`
      INSERT OR IGNORE INTO books (id, name, short_name, testament, chapters, translation_id, book_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const translation of TRANSLATIONS_DATA) {
      for (const book of BOOKS_DATA) {
        stmt.run(
          book.id,
          book.name,
          book.shortName,
          book.testament,
          book.chapters,
          translation.id,
          book.order
        );
      }
    }
  }

  getTranslations(): Promise<Translation[]> {
    const stmt = this.db.prepare('SELECT * FROM translations ORDER BY id');
    const rows = stmt.all() as Array<{
      id: string;
      name: string;
      short_name: string;
      description: string | null;
      copyright: string;
      language: string;
      is_public_domain: number;
      api_endpoint: string | null;
    }>;

    return Promise.resolve(rows.map(row => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      description: row.description || '',
      copyright: row.copyright,
      language: row.language,
      isPublicDomain: Boolean(row.is_public_domain),
      apiEndpoint: row.api_endpoint || undefined,
    })));
  }

  getTranslation(id: string): Promise<Translation | null> {
    const stmt = this.db.prepare('SELECT * FROM translations WHERE id = ?');
    const row = stmt.get(id) as {
      id: string;
      name: string;
      short_name: string;
      description: string | null;
      copyright: string;
      language: string;
      is_public_domain: number;
      api_endpoint: string | null;
    } | undefined;

    if (!row) return Promise.resolve(null);

    return Promise.resolve({
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      description: row.description || '',
      copyright: row.copyright,
      language: row.language,
      isPublicDomain: Boolean(row.is_public_domain),
      apiEndpoint: row.api_endpoint || undefined,
    });
  }

  getBooks(translationId: string): Promise<BibleBook[]> {
    const stmt = this.db.prepare(`
      SELECT id, name, short_name, testament, chapters
      FROM books
      WHERE translation_id = ?
      ORDER BY book_order
    `);
    const rows = stmt.all(translationId) as Array<{
      id: number;
      name: string;
      short_name: string;
      testament: 'old' | 'new';
      chapters: number;
    }>;

    return Promise.resolve(rows.map(row => ({
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      testament: row.testament,
      chapters: row.chapters,
    })));
  }

  getBook(translationId: string, bookId: number): Promise<BibleBook | null> {
    const stmt = this.db.prepare(`
      SELECT id, name, short_name, testament, chapters
      FROM books
      WHERE translation_id = ? AND id = ?
    `);
    const row = stmt.get(translationId, bookId) as {
      id: number;
      name: string;
      short_name: string;
      testament: 'old' | 'new';
      chapters: number;
    } | undefined;

    if (!row) return Promise.resolve(null);

    return Promise.resolve({
      id: row.id,
      name: row.name,
      shortName: row.short_name,
      testament: row.testament,
      chapters: row.chapters,
    });
  }

  getChapter(translationId: string, bookId: number, chapter: number): Promise<Chapter | null> {
    // Verify book exists
    const book = this.getBook(translationId, bookId);
    if (!book) return Promise.resolve(null);

    const stmt = this.db.prepare(`
      SELECT book_id, chapter, verse, text
      FROM verses
      WHERE translation_id = ? AND book_id = ? AND chapter = ?
      ORDER BY verse
    `);
    const rows = stmt.all(translationId, bookId, chapter) as Array<{
      book_id: number;
      chapter: number;
      verse: number;
      text: string;
    }>;

    if (rows.length === 0) return Promise.resolve(null);

    const verses: Verse[] = rows.map(row => ({
      ref: {
        bookId: row.book_id,
        chapter: row.chapter,
        verse: row.verse,
      },
      text: row.text,
    }));

    return Promise.resolve({
      bookId,
      chapter,
      verses,
    });
  }

  getVerse(translationId: string, bookId: number, chapter: number, verse: number): Promise<Verse | null> {
    const stmt = this.db.prepare(`
      SELECT book_id, chapter, verse, text
      FROM verses
      WHERE translation_id = ? AND book_id = ? AND chapter = ? AND verse = ?
    `);
    const row = stmt.get(translationId, bookId, chapter, verse) as {
      book_id: number;
      chapter: number;
      verse: number;
      text: string;
    } | undefined;

    if (!row) return Promise.resolve(null);

    return Promise.resolve({
      ref: {
        bookId: row.book_id,
        chapter: row.chapter,
        verse: row.verse,
      },
      text: row.text,
    });
  }

  getVerses(
    translationId: string,
    bookId: number,
    chapter: number,
    startVerse: number,
    endVerse: number
  ): Promise<Verse[]> {
    const stmt = this.db.prepare(`
      SELECT book_id, chapter, verse, text
      FROM verses
      WHERE translation_id = ? AND book_id = ? AND chapter = ? AND verse BETWEEN ? AND ?
      ORDER BY verse
    `);
    const rows = stmt.all(translationId, bookId, chapter, startVerse, endVerse) as Array<{
      book_id: number;
      chapter: number;
      verse: number;
      text: string;
    }>;

    return Promise.resolve(rows.map(row => ({
      ref: {
        bookId: row.book_id,
        chapter: row.chapter,
        verse: row.verse,
      },
      text: row.text,
    })));
  }

  searchVerses(translationId: string, query: string, limit: number = 50): Promise<SearchResult[]> {
    // Sanitize query for FTS5
    const sanitizedQuery = query
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => `${w}*`)
      .join(' ');

    const stmt = this.db.prepare(`
      SELECT v.book_id, v.chapter, v.verse, v.text, bm.rank
      FROM verses_fts v
      JOIN (
        SELECT rowid, rank
        FROM verses_fts
        WHERE verses_fts MATCH ? AND translation_id = ?
        ORDER BY rank
        LIMIT ?
      ) bm ON v.rowid = bm.rowid
      ORDER BY bm.rank
    `);

    const rows = stmt.all(sanitizedQuery, translationId, limit) as Array<{
      book_id: number;
      chapter: number;
      verse: number;
      text: string;
      rank: number;
    }>;

    return Promise.resolve(rows.map(row => ({
      verse: {
        ref: {
          bookId: row.book_id,
          chapter: row.chapter,
          verse: row.verse,
        },
        text: row.text,
      },
      translationId,
      score: row.rank,
    })));
  }

  searchVersesGlobal(query: string, limit: number = 50): Promise<SearchResult[]> {
    const sanitizedQuery = query
      .replace(/[^\w\s]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 0)
      .map(w => `${w}*`)
      .join(' ');

    const stmt = this.db.prepare(`
      SELECT v.translation_id, v.book_id, v.chapter, v.verse, v.text, bm.rank
      FROM verses_fts v
      JOIN (
        SELECT rowid, rank
        FROM verses_fts
        WHERE verses_fts MATCH ?
        ORDER BY rank
        LIMIT ?
      ) bm ON v.rowid = bm.rowid
      ORDER BY bm.rank
    `);

    const rows = stmt.all(sanitizedQuery, limit) as Array<{
      translation_id: string;
      book_id: number;
      chapter: number;
      verse: number;
      text: string;
      rank: number;
    }>;

    return Promise.resolve(rows.map(row => ({
      verse: {
        ref: {
          bookId: row.book_id,
          chapter: row.chapter,
          verse: row.verse,
        },
        text: row.text,
      },
      translationId: row.translation_id,
      score: row.rank,
    })));
  }

  getVerseContext(
    translationId: string,
    bookId: number,
    chapter: number,
    verse: number,
    radius: number = 2
  ): Promise<Verse[]> {
    const startVerse = Math.max(1, verse - radius);
    // We need to know the max verse in this chapter
    const maxVerseStmt = this.db.prepare(`
      SELECT MAX(verse) as max_verse FROM verses
      WHERE translation_id = ? AND book_id = ? AND chapter = ?
    `);
    const maxResult = maxVerseStmt.get(translationId, bookId, chapter) as { max_verse: number | null } | undefined;
    const endVerse = maxResult?.max_verse ? Math.min(maxResult.max_verse, verse + radius) : verse + radius;

    return this.getVerses(translationId, bookId, chapter, startVerse, endVerse);
  }

  close(): void {
    this.db.close();
  }

  // Internal method for importers
  getDb(): Database.Database {
    return this.db;
  }
}

// Singleton instance
let instance: SqliteBibleDatabase | null = null;

export function getBibleDatabase(dbPath?: string): BibleDatabase {
  if (!instance) {
    instance = new SqliteBibleDatabase(dbPath);
  }
  return instance;
}

export function resetBibleDatabase(): void {
  if (instance) {
    instance.close();
    instance = null;
  }
}