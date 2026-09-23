export interface ResumeSpot {
  bookId: number;
  chapter: number;
  verse: number;
}

// Only an explicit Stop while a verse is actually playing should move the spot.
// Joining a group, discussing a passage, or a follower syncing must not.
export function spotToRemember(
  current: ResumeSpot | null,
  action: { remember: boolean; state: 'idle' | 'speaking' | 'paused'; verse: number | null; bookId: number; chapter: number },
): ResumeSpot | null {
  if (!action.remember || action.state === 'idle') return current;
  if (action.verse && action.verse > 1) return { bookId: action.bookId, chapter: action.chapter, verse: action.verse };
  if (current && current.bookId === action.bookId && current.chapter === action.chapter) return null;
  return current;
}

// Resume only when this chapter still contains that verse. A missing verse
// means Listen should start over instead of doing nothing.
export function verseToResume(spot: ResumeSpot | null, bookId: number, chapter: number, verses: number[]): number | null {
  if (!spot || spot.bookId !== bookId || spot.chapter !== chapter) return null;
  return verses.some((verse) => verse >= spot.verse) ? spot.verse : null;
}
