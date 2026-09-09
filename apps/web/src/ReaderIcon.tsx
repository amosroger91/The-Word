type IconName = 'search' | 'bookmark' | 'settings' | 'moon' | 'sun' | 'people' | 'book' | 'headphones' | 'award';
const paths: Record<IconName, string> = {
  search: 'M21 21l-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  settings: 'M4 7h16M4 17h16M9 4v6M15 14v6',
  moon: 'M21 13A9 9 0 0 1 11 3a9 9 0 1 0 10 10Z',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1',
  people: 'M9 3a3 3 0 1 0 0 6 3 3 0 0 0 0-6M3 21v-3a6 6 0 0 1 12 0v3M16 3a3 3 0 0 1 0 6M18 13a5 5 0 0 1 3 5v3',
  book: 'M12 5v16M12 5C8 2 4 3 2 4v16c4-2 7-1 10 1 3-2 6-3 10-1V4c-2-1-6-2-10 1Z',
  headphones: 'M3 14v-2a9 9 0 0 1 18 0v2M3 13h4v8H5a2 2 0 0 1-2-2v-6ZM21 13h-4v8h2a2 2 0 0 0 2-2v-6Z',
  award: 'M8 4h8l2 5-6 3-6-3 2-5ZM12 12v8M8 20h8',
};
export function ReaderIcon({ name }: { name: IconName }) {
  return <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[name]} /></svg>;
}
