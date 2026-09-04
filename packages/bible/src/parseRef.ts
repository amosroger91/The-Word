import { BOOKS_DATA } from './schema';

export interface ParsedReference {
  bookId: number;
  chapter: number;
  verse: number;
}

const ALIASES: Record<string, number> = {
  ps: 19,
  psalm: 19,
  psalms: 19,
  'song of songs': 22,
  'song of solomon': 22,
  canticles: 22,
  sos: 22,
  mt: 40,
  matt: 40,
  mk: 41,
  mrk: 41,
  lk: 42,
  luk: 42,
  jn: 43,
  jhn: 43,
  'acts of the apostles': 44,
  rom: 45,
  '1 cor': 46,
  '2 cor': 47,
  '1 thess': 52,
  '2 thess': 53,
  '1 tim': 54,
  '2 tim': 55,
  phlm: 57,
  '1 pet': 60,
  '2 pet': 61,
  '1 jn': 62,
  '2 jn': 63,
  '3 jn': 64,
  apocalypse: 66,
  'revelation of john': 66,
};

function normalizeBook(name: string) {
  return name
    .toLowerCase()
    .replace(/\./g, '')
    .replace(/\s+/g, ' ')
    .replace(/^first /, '1 ')
    .replace(/^second /, '2 ')
    .replace(/^third /, '3 ')
    .replace(/^iii /, '3 ')
    .replace(/^ii /, '2 ')
    .replace(/^i /, '1 ')
    .trim();
}

// Turns "John 5: 24" / "1 John 3:16" into a book/chapter/verse the reader can open.
export function parseReference(ref: string): ParsedReference | null {
  const match = ref.trim().match(/^(.+?)\s+(\d+)\s*:\s*(\d+)(?:\s*[-–]\s*\d+)?$/);
  if (!match) return null;
  const bookName = normalizeBook(match[1] ?? '');
  const chapter = Number(match[2]);
  const verse = Number(match[3]);
  if (!bookName || !chapter || !verse) return null;

  const aliasId = ALIASES[bookName];
  if (aliasId) return { bookId: aliasId, chapter, verse };

  for (const book of BOOKS_DATA) {
    if (normalizeBook(book.name) === bookName || normalizeBook(book.shortName) === bookName) {
      return { bookId: book.id, chapter, verse };
    }
  }
  return null;
}
