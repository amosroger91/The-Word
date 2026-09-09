import { useCallback, useEffect, useRef, useState } from 'react';
import { currentStreak, dayKey, storageKeys } from '@the-word/core';
import { loadAccount } from './nostrAccount';
import {
  alreadyReadToday,
  appendEvent,
  eventsForActor,
  loadEvents,
  mergeLedgers,
  readDayKeys,
  saveEvents,
  uniqueChapters,
  type LedgerEvent,
} from './ledger';
import { BADGES, evaluate, hashLedger, type EarnedBadge } from './badges';

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

  const chapters = uniqueChapters(events).length;
  const streak = currentStreak(readDayKeys(events), dayKey());

  return {
    ready,
    events,
    earned,
    justEarned,
    clearJustEarned: () => setJustEarned([]),
    recordChapterRead,
    chapters,
    streak,
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
