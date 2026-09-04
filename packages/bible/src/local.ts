import type { BibleBook, Chapter, SearchResult, Translation } from '@the-word/shared';
import { BOOKS_DATA, TRANSLATIONS_DATA } from './schema';
import { BIBLE_TOPICS } from './topics';
type TranslationDataset = Record<string, Record<string, Record<string, string>>>;
type RedLetterDataset = Record<string, Record<string, Record<string, Array<[number, number]>>>>;
type BookNameDataset = Record<string, { name: string; shortName: string }>;
type TranslationLoader = () => Promise<TranslationDataset>;

const translationLoaders: Record<string, TranslationLoader> = {
  kjv: () => import('./data/translations/kjv.json').then((module) => module.default as TranslationDataset),
  asv: () => import('./data/translations/asv.json').then((module) => module.default as TranslationDataset),
  web: () => import('./data/translations/web.json').then((module) => module.default as TranslationDataset),
  rv1909: () => import('./data/translations/rv1909.json').then((module) => module.default as TranslationDataset),
  rv1602p: () => import('./data/translations/rv1602p.json').then((module) => module.default as TranslationDataset),
  lsg: () => import('./data/translations/lsg.json').then((module) => module.default as TranslationDataset),
  cuv: () => import('./data/translations/cuv.json').then((module) => module.default as TranslationDataset),
  vie1934: () => import('./data/translations/vie1934.json').then((module) => module.default as TranslationDataset),
};

const redLetterLoaders: Record<string, () => Promise<RedLetterDataset>> = {
  kjv: () => import('./data/red-letters/kjv.json').then((module) => module.default as unknown as RedLetterDataset),
  asv: () => import('./data/red-letters/asv.json').then((module) => module.default as unknown as RedLetterDataset),
  web: () => import('./data/red-letters/web.json').then((module) => module.default as unknown as RedLetterDataset),
  rv1909: () => import('./data/red-letters/rv1909.json').then((module) => module.default as unknown as RedLetterDataset),
  rv1602p: () => import('./data/red-letters/rv1602p.json').then((module) => module.default as unknown as RedLetterDataset),
  lsg: () => import('./data/red-letters/lsg.json').then((module) => module.default as unknown as RedLetterDataset),
  cuv: () => import('./data/red-letters/cuv.json').then((module) => module.default as unknown as RedLetterDataset),
  vie1934: () => import('./data/red-letters/vie1934.json').then((module) => module.default as unknown as RedLetterDataset),
};

const bookNameLoaders: Record<string, () => Promise<BookNameDataset>> = {
  kjv: () => import('./data/book-names/kjv.json').then((module) => module.default as BookNameDataset),
  asv: () => import('./data/book-names/asv.json').then((module) => module.default as BookNameDataset),
  web: () => import('./data/book-names/web.json').then((module) => module.default as BookNameDataset),
  rv1909: () => import('./data/book-names/rv1909.json').then((module) => module.default as BookNameDataset),
  rv1602p: () => import('./data/book-names/rv1602p.json').then((module) => module.default as BookNameDataset),
  lsg: () => import('./data/book-names/lsg.json').then((module) => module.default as BookNameDataset),
  cuv: () => import('./data/book-names/cuv.json').then((module) => module.default as BookNameDataset),
  vie1934: () => import('./data/book-names/vie1934.json').then((module) => module.default as BookNameDataset),
};

const translations: Translation[] = TRANSLATIONS_DATA.map((translation) => ({
  id: translation.id,
  name: translation.name,
  shortName: translation.shortName,
  description: translation.description,
  copyright: translation.copyright,
  language: translation.language,
  isPublicDomain: Boolean(translation.isPublicDomain),
}));

const books: BibleBook[] = BOOKS_DATA.map((book) => ({
  id: book.id,
  name: book.name,
  shortName: book.shortName,
  testament: book.testament,
  chapters: book.chapters,
}));

export class LocalBibleRepository {
  private datasets = new Map<string, TranslationDataset>();
  private loading = new Map<string, Promise<TranslationDataset>>();
  private redLetters = new Map<string, RedLetterDataset>();
  private bookNames = new Map<string, BookNameDataset>();

  getTranslations(): Translation[] {
    return translations;
  }

  getBooks(translationId?: string): BibleBook[] {
    const names = translationId ? this.bookNames.get(translationId) : undefined;
    if (!names) return books;
    return books.map((book) => ({ ...book, name: names[book.id]?.name || book.name, shortName: names[book.id]?.shortName || book.shortName }));
  }

  async loadTranslation(translationId: string): Promise<void> {
    if (this.datasets.has(translationId)) return;
    const loader = translationLoaders[translationId];
    if (!loader) throw new Error(`Translation is not installed: ${translationId}`);
    const pending = this.loading.get(translationId) ?? loader();
    this.loading.set(translationId, pending);
    const [dataset, red, names] = await Promise.all([
      pending,
      redLetterLoaders[translationId]?.().catch(() => ({})) ?? Promise.resolve({}),
      bookNameLoaders[translationId]?.().catch(() => ({})) ?? Promise.resolve({}),
    ]);
    this.datasets.set(translationId, dataset);
    this.redLetters.set(translationId, red);
    this.bookNames.set(translationId, names);
    this.loading.delete(translationId);
  }

  isLoaded(translationId: string): boolean {
    return this.datasets.has(translationId);
  }

  async getChapter(translationId: string, bookId: number, chapter: number): Promise<Chapter | null> {
    await this.loadTranslation(translationId);
    const verses = this.datasets.get(translationId)?.[String(bookId)]?.[String(chapter)];
    if (!verses) return null;
    return {
      bookId,
      chapter,
      verses: Object.keys(verses).sort((a, b) => Number(a) - Number(b)).map((verse) => ({
        ref: { bookId, chapter, verse: Number(verse) },
        text: verses[verse] ?? '',
        redLetters: this.redLetters.get(translationId)?.[String(bookId)]?.[String(chapter)]?.[verse],
      })),
    };
  }

  async searchVerses(translationId: string, query: string, limit = 30, mode: 'all' | 'exact' = 'all', references?: Array<{ bookId: number; chapter: number; verse: number }>): Promise<SearchResult[]> {
    await this.loadTranslation(translationId);
    const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
    const referenceKeys = references ? new Set(references.map((reference) => `${reference.bookId}:${reference.chapter}:${reference.verse}`)) : null;
    const results: SearchResult[] = [];
    const source = this.datasets.get(translationId);
    if (!source) return results;
    for (const [bookIdText, chapters] of Object.entries(source)) {
      for (const [chapterText, verses] of Object.entries(chapters)) {
        for (const [verseText, text] of Object.entries(verses)) {
          const normalizedText = text.toLocaleLowerCase();
          const key = `${bookIdText}:${chapterText}:${verseText}`;
          const matches = referenceKeys?.has(key) || (terms.length > 0 && (mode === 'exact' ? normalizedText.includes(terms.join(' ')) : terms.every((word) => normalizedText.includes(word))));
          const index = terms.length > 0 ? normalizedText.indexOf(terms[0] ?? '') : 0;
          if (matches && index >= 0) {
            results.push({
              translationId,
              score: index,
              verse: { ref: { bookId: Number(bookIdText), chapter: Number(chapterText), verse: Number(verseText) }, text },
            });
            if (results.length >= limit) return results;
          }
        }
      }
    }
    return results;
  }

  getBook(bookId: number, translationId?: string): BibleBook | null {
    return this.getBooks(translationId).find((book) => book.id === bookId) ?? null;
  }
}

export const localBible = new LocalBibleRepository();
export type { BibleBook, Chapter, SearchResult, Translation, Verse } from '@the-word/shared';
