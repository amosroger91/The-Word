import { useCallback, useEffect, useRef, useState } from 'react';
import { currentStreak, dayKey, storageKeys } from '@the-word/core';
import { loadAccount } from './nostrAccount';
import { activeReader, loadReaders, saveReaders, type ReaderState } from './readers';
import {
  alreadyReadToday,
  appendEvent,
  eventsForActor,
  eventsForReader,
  loadEvents,
  mergeLedgers,
  noteFor,
  noteList,
  readDayKeys,
  saveEvents,
  uniqueChapters,
  type LedgerEvent,
  type NoteEvent,
  type GroupAction,
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
  const [readerState, setReaderState] = useState<ReaderState>(loadReaders);
  const readerId = useRef(readerState.activeId);
  readerId.current = readerState.activeId;
  const [allEvents, setAllEvents] = useState<LedgerEvent[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [earned, setEarned] = useState<EarnedBadge[]>([]);
  const [justEarned, setJustEarned] = useState<EarnedBadge[]>([]);
  const [ready, setReady] = useState(false);

  // The reader is a parameter, not just a ref read: switching reader has to
  // re-derive with the *new* id, and a ref set during render still holds the old
  // one at the moment the switch handler runs.
  const refresh = useCallback((next: LedgerEvent[], forReader = readerId.current) => {
    const device = eventsForActor(next, gunPub.current);
    setAllEvents(device);
    // Badges and progress are per person, so everything downstream sees only
    // that reader's slice.
    const mine = eventsForReader(device, forReader);
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
    const mine = eventsForReader(eventsForActor(all, gunPub.current), readerId.current);
    if (alreadyReadToday(mine, bookId, chapter)) return [];
    const before = evaluate(mine, BADGES);
    const { event } = appendEvent(mine, gunPub.current, {
      kind: 'read',
      at: new Date().toISOString(),
      readerId: readerId.current,
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
    // Counter still runs across the whole device: event ids must stay unique
    // per key, not per reader.
    const mine = eventsForActor(all, gunPub.current);
    const { event } = appendEvent(mine, gunPub.current, {
      kind: 'note',
      at: new Date().toISOString(),
      readerId: readerId.current,
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
    // 'saved' = exported to this device; 'shared' = handed to the OS share sheet.
    outcome: 'saved' | 'shared' = 'saved',
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
      outcome,
    });
    const merged = mergeLedgers(all, [event]);
    await saveEvents(merged);
    const after = refresh(merged);
    const known = new Set(before.map((badge) => badge.id));
    const fresh = after.filter((badge) => !known.has(badge.id));
    if (fresh.length) setJustEarned(fresh);
    return fresh;
  }, [refresh]);

  const recordGroup = useCallback(async (
    action: GroupAction,
    where?: { bookId?: number; chapter?: number },
  ) => {
    const all = await loadEvents();
    const mine = eventsForActor(all, gunPub.current);
    const before = evaluate(mine, BADGES);
    const { event } = appendEvent(mine, gunPub.current, {
      kind: 'group',
      at: new Date().toISOString(),
      action,
      ...(where?.bookId != null ? { bookId: where.bookId } : {}),
      ...(where?.chapter != null ? { chapter: where.chapter } : {}),
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
    readers: readerState.readers,
    activeReader: activeReader(readerState),
    switchReader: (id: string) => {
      const next = { ...readerState, activeId: id };
      readerId.current = id;
      setReaderState(next); saveReaders(next); refresh(allEvents, id);
    },
    updateReaders: (next: ReaderState) => {
      readerId.current = next.activeId;
      setReaderState(next); saveReaders(next); refresh(allEvents, next.activeId);
    },
    notes: noteList(events),
    noteAt: (bookId: number, chapter: number, verse: number) => noteFor(events, bookId, chapter, verse),
    saveNote,
    removeNote,
    recordShare,
    recordGroup,
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
