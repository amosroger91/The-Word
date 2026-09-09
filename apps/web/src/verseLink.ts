import { BOOKS_DATA, parseReference, type ParsedReference } from '@the-word/bible';

export function encodeVerseRef(bookId: number, chapter: number, verse: number): string {
  const book = BOOKS_DATA.find((item) => item.id === bookId);
  const slug = (book?.shortName || String(bookId)).replace(/\s+/g, '');
  return `${slug}.${chapter}.${verse}`;
}

export function verseHash(bookId: number, chapter: number, verse: number): string {
  return `#${encodeVerseRef(bookId, chapter, verse)}`;
}

export function parseVerseHash(hash: string): ParsedReference | null {
  const raw = decodeURIComponent(String(hash || '').replace(/^#/, '')).trim();
  if (!raw || raw === 'read' || raw.toLowerCase().startsWith('restore=')) return null;
  const match = raw.match(/^(.+)[.-](\d+)[.-](\d+)$/);
  if (!match) return null;
  const book = match[1].replace(/(\d)([A-Za-z])/g, '$1 $2').replace(/-/g, ' ');
  return parseReference(`${book} ${match[2]}:${match[3]}`);
}

export function verseShareUrl(bookId: number, chapter: number, verse: number): string {
  const base = new URL(import.meta.env.BASE_URL, window.location.origin);
  base.hash = encodeVerseRef(bookId, chapter, verse);
  return base.toString();
}

export function readerViewFromHash(hash = typeof window === 'undefined' ? '' : window.location.hash): 'home' | 'reader' {
  if (!hash || hash === '#') return 'home';
  if (hash.toLowerCase().startsWith('#restore=')) return 'home';
  if (hash === '#read' || parseVerseHash(hash)) return 'reader';
  return 'home';
}
