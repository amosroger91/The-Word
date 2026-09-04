import { useEffect, useState } from 'react';
import { parseReference } from '@the-word/bible';
import type { DailyVerse } from '@the-word/core';

const KEY = 'word.lastDailyVerse';

function read(): DailyVerse | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<DailyVerse>;
    if (typeof data.text !== 'string' || typeof data.ref !== 'string') return null;
    return {
      text: data.text,
      ref: data.ref,
      date: typeof data.date === 'string' ? data.date : '',
      url: typeof data.url === 'string' ? data.url : '',
      verseUrl: typeof data.verseUrl === 'string' ? data.verseUrl : '',
      parsed: parseReference(data.ref),
    };
  } catch {
    return null;
  }
}

// The daily verse is the only part of the landing page that needs the network,
// so keep the last one that arrived: a failed fetch then still has a verse to
// show instead of an empty card.
export function useSavedDailyVerse(verse: DailyVerse | null) {
  const [saved] = useState(read);

  useEffect(() => {
    if (!verse) return;
    try {
      const { text, ref, date, url, verseUrl } = verse;
      localStorage.setItem(KEY, JSON.stringify({ text, ref, date, url, verseUrl }));
    } catch {
      // Storage can be full or blocked; showing the verse matters more.
    }
  }, [verse]);

  return saved;
}
