/**
 * Bible package types
 */

import type {
  BibleBook,
  VerseRef,
  Verse,
  Chapter,
  Translation,
  SearchResult,
  ReadingPlan,
  ReadingPlanDay,
  ReadingPlanPassage,
} from '@the-word/shared';

export interface BibleDatabase {
  getTranslations(): Promise<Translation[]>;
  getTranslation(id: string): Promise<Translation | null>;
  getBooks(translationId: string): Promise<BibleBook[]>;
  getBook(translationId: string, bookId: number): Promise<BibleBook | null>;
  getChapter(translationId: string, bookId: number, chapter: number): Promise<Chapter | null>;
  getVerse(translationId: string, bookId: number, chapter: number, verse: number): Promise<Verse | null>;
  getVerses(translationId: string, bookId: number, chapter: number, startVerse: number, endVerse: number): Promise<Verse[]>;
  searchVerses(translationId: string, query: string, limit?: number): Promise<SearchResult[]>;
  searchVersesGlobal(query: string, limit?: number): Promise<SearchResult[]>;
  getVerseContext(translationId: string, bookId: number, chapter: number, verse: number, radius?: number): Promise<Verse[]>;
  close(): void;
}

export interface BibleImporter {
  importTranslation(translationId: string, dataPath: string): Promise<void>;
}

export interface ParsedVerse {
  bookId: number;
  chapter: number;
  verse: number;
  text: string;
}

export interface ImportResult {
  versesImported: number;
  errors: string[];
}