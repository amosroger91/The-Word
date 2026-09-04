import { BOOKS_DATA } from './schema';
import { crossRefLoaders } from './crossRefLoaders';

export type PackedCrossRef = number[];
export type BookCrossRefFile = Record<string, Record<string, PackedCrossRef[]>>;

export interface CrossReference {
  bookId: number;
  chapter: number;
  verse: number;
  endVerse: number;
}

const cache = new Map<number, BookCrossRefFile>();
const loading = new Map<number, Promise<BookCrossRefFile>>();

function unpack(packed: PackedCrossRef): CrossReference {
  const bookId = packed[0] ?? 0;
  const chapter = packed[1] ?? 1;
  const verse = packed[2] ?? 1;
  return { bookId, chapter, verse, endVerse: packed[3] ?? verse };
}

export async function loadBookCrossRefs(bookId: number): Promise<BookCrossRefFile> {
  const cached = cache.get(bookId);
  if (cached) return cached;
  const pending = loading.get(bookId) ?? (crossRefLoaders[bookId]?.().then((module) => {
    cache.set(bookId, module.default);
    loading.delete(bookId);
    return module.default;
  }) ?? Promise.resolve({}));
  loading.set(bookId, pending);
  return pending;
}

export function chapterCrossRefs(data: BookCrossRefFile | null, chapter: number): Record<number, CrossReference[]> {
  const source = data?.[String(chapter)];
  if (!source) return {};
  const map: Record<number, CrossReference[]> = {};
  for (const [verse, packed] of Object.entries(source)) {
    map[Number(verse)] = packed.map(unpack);
  }
  return map;
}

export function formatCrossRef(ref: CrossReference, bookName: string) {
  return ref.endVerse > ref.verse
    ? `${bookName} ${ref.chapter}:${ref.verse}–${ref.endVerse}`
    : `${bookName} ${ref.chapter}:${ref.verse}`;
}

export function bookNameFor(bookId: number, books: Array<{ id: number; name: string }>) {
  return books.find((book) => book.id === bookId)?.name ?? BOOKS_DATA.find((book) => book.id === bookId)?.name ?? '';
}
