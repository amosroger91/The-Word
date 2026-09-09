import { useCallback, useEffect, useRef, useState } from 'react';
import { currentStreak, dayKey, storageKeys } from '@the-word/core';
import { loadAccount } from './nostrAccount';
import {
  alreadyReadToday,
  appendEvent,
  eventsForActor,
  loadEvents,
  mergeLedgers,
  noteFor,
  noteList,
  readDayKeys,
  saveEvents,
  uniqueChapters,
  type LedgerEvent,
  type NoteEvent,
} from './ledger';
import { BADGES, bibleProgress, evaluate, hashLedger, type EarnedBadge } from './badges';

const DWELL_MS = 12_000;

function readCache(hash: string): EarnedBadge[] | null {
  try {
    const raw = localStorage.getItem(storageKeys.badges);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { hash?: string; earned?: EarnedBadge[] };
    if (parsed.hash !== hash || !Array.isArray(parsed.earned)) return null;
    return parsed.earned;
  } catch { return null; }
}

function writeCache(hash: string, earned: EarnedBadge[]) {
  try { localStorage.setItem(storageKeys.badges, JSON.stringify({ hash, earned })); } catch { /* storage blocked */ }
}

export function useLedger() {
  const gunPub = useRef(loadAccount().gun.pub);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [justEarned, setJustEarned] = useState<EarnedBadge[]>([]);
  const [ready, setReady] = useState(false);

  const refresh = useCallback((next: LedgerEvent[]) => {
    const mine = eventsForActor(next, gunPub.current);
    setEvents(mine);
    const hash = hashLedger(mine);
    const cached = readCache(hash);
    const nextEarned = cached ?? evaluate(mine, BADGES);
    if (!cached) writeCache(hash, nextEarned);
    setEarned(nextEarned);
    return nextEarned;
  }, []);

  useEffect(() => {
    let cancelled = false;
    void loadEvents().then((all) => {
      if (cancelled) return;
      refresh(all);
      setReady(true);
    });
    return () => { cancelled = true; };
  }, [refresh]);

  const recordChapterRead = useCallback(async (bookId: number, chapter: number, verses?: number[]) => {
    const all = await loadEvents();
    const mine = eventsForActor(all, gunPub.current);
    if (alreadyReadToday(mine, bookId, chapter)) return [];
    const before = evaluate(mine, BADGES);
    const { event } = appendEvent(mine, gunPub.current, {
      kind: 'read',
      at: new Date().toISOString(),
      bookId,
      chapter,
      verses,
    });
    const merged = mergeLedgers(all, [event]);
    await saveEvents(merged);
    const after = refresh(merged);
    const known = new Set(before.map((badge) => badge.id));
    const fresh = after.filter((badge) => !known.has(badge.id));
    if (fresh.length) setJustEarned(fresh);
    return fresh;
  }, [refresh]);

  // Writing a note never earns a badge, so this stays simpler than the read path:
  // append, persist, refresh. Returns the event so the caller can decide whether
  // it also belongs on the timeline.
  const saveNote = useCallback(async (
    bookId: number,
    chapter: number,
    verse: number,
    text: string,
    share: 'private' | 'friends',
  ): Promise<NoteEvent> => {
    const all = await loadEvents();
    const mine = eventsForActor(all, gunPub.current);
    const { event } = appendEvent(mine, gunPub.current, {
      kind: 'note',
      at: new Date().toISOString(),
      bookId,
      chapter,
      verse,
      text: text.trim(),
      share,
    });
    const merged = mergeLedgers(all, [event]);
    await saveEvents(merged);
    refresh(merged);
    return event as NoteEvent;
  }, [refresh]);

  /** Clearing a note is an empty one — the tombstone from ledger.ts. */
  const removeNote = useCallback((bookId: number, chapter: number, verse: number) => (
    saveNote(bookId, chapter, verse, '', 'private')
  ), [saveNote]);

  const recordShare = useCallback(async (
    via: 'link' | 'image' | 'feed',
    bookId: number,
    chapter: number,
    verse: number,
  ) => {
    const all = await loadEvents();
    const mine = eventsForActor(all, gunPub.current);
    const before = evaluate(mine, BADGES);
    const { event } = appendEvent(mine, gunPub.current, {
      kind: 'share',
      at: new Date().toISOString(),
      bookId,
      chapter,
      verse,
      via,
    });
    const merged = mergeLedgers(all, [event]);
    await saveEvents(merged);
    const after = refresh(merged);
    const known = new Set(before.map((badge) => badge.id));
    const fresh = after.filter((badge) => !known.has(badge.id));
    if (fresh.length) setJustEarned(fresh);
    return fresh;
  }, [refresh]);

  const chapters = uniqueChapters(events).length;
  const streak = currentStreak(readDayKeys(events), dayKey());
  const canon = bibleProgress(events);

  return {
    ready,
    events,
    earned,
    justEarned,
    clearJustEarned: () => setJustEarned([]),
    recordChapterRead,
    chapters,
    streak,
    canon,
    notes: noteList(events),
    noteAt: (bookId: number, chapter: number, verse: number) => noteFor(events, bookId, chapter, verse),
    saveNote,
    removeNote,
    recordShare,
  };
}

export function useChapterRead(
  recordChapterRead: (bookId: number, chapter: number, verses?: number[]) => Promise<unknown>,
  opts: {
    bookId: number;
    chapter: number;
    lastVerse: number | null;
    speakingVerse: number | null;
    lastInView: boolean;
  },
) {
  const { bookId, chapter, lastVerse, speakingVerse, lastInView } = opts;
  useEffect(() => {
    if (lastVerse && speakingVerse === lastVerse) {
      void recordChapterRead(bookId, chapter, [lastVerse]);
    }
  }, [recordChapterRead, bookId, chapter, lastVerse, speakingVerse]);

  useEffect(() => {
    if (!lastInView || !lastVerse) return;
    const timer = window.setTimeout(() => {
      void recordChapterRead(bookId, chapter, [lastVerse]);
    }, DWELL_MS);
    return () => window.clearTimeout(timer);
  }, [recordChapterRead, bookId, chapter, lastVerse, lastInView]);
}
