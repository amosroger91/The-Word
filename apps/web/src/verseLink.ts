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

/** Compact, human reference for sharing: "John 3:16", "John 3:16-18", "John 3:16, 20". */
export function formatVerseReference(bookName: string, chapter: number, verses: number[]): string {
  const sorted = [...new Set(verses)].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (!sorted.length) return `${bookName} ${chapter}`;
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i += 1) {
    const next = sorted[i];
    if (next === prev + 1) { prev = next; continue; }
    parts.push(start === prev ? `${start}` : `${start}-${prev}`);
    start = next;
    prev = next;
  }
  return `${bookName} ${chapter}:${parts.join(', ')}`;
}

/**
 * One block of text ready to paste anywhere (Facebook, Messages, email):
 * reference + translation, the full passage, then the deep link on its own line.
 */
export function verseShareText(input: { reference: string; text: string; translation?: string; url: string }): string {
  const heading = input.translation ? `${input.reference} (${input.translation})` : input.reference;
  return [heading, '', input.text.trim(), '', input.url].join('\n');
}
