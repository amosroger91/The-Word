import { parseGroupHash } from '../../../web/src/groupLink';
import { encodeVerseRef, parseVerseHash } from '../../../web/src/verseLink';
import type { ParsedReference } from '@the-word/bible';

export const SHARE_ORIGIN = 'https://amosroger91.github.io/The-Word/';

export function versePageUrl(bookId: number, chapter: number, verse: number): string {
  return `${SHARE_ORIGIN}#${encodeVerseRef(bookId, chapter, verse)}`;
}

export function groupPageUrl(code: string): string {
  return `${SHARE_ORIGIN}#group=${code.trim().toLowerCase()}`;
}

export function linkTarget(url: string): { verse?: ParsedReference; group?: string } | null {
  const hashAt = url.indexOf('#');
  const hash = hashAt >= 0 ? url.slice(hashAt) : '';
  if (hash) {
    const group = parseGroupHash(hash);
    if (group) return { group };
    const verse = parseVerseHash(hash);
    if (verse) return { verse };
  }
  const groupPath = url.match(/group[=/]([a-z0-9-]{1,40})/i);
  if (groupPath) return { group: groupPath[1].toLowerCase() };
  const versePath = url.match(/(?:verse|ref)[=/]([^&#]+)/i);
  if (versePath) {
    const verse = parseVerseHash(`#${decodeURIComponent(versePath[1])}`);
    if (verse) return { verse };
  }
  return null;
}
