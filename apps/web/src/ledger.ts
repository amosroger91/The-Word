// Append-only reading ledger. Local IndexedDB is the source of truth; Gun will
// sync this later. Event ids are `${gunPub}:${counter}` so a merge is a set union.
import { dayKey } from '@the-word/core';

export type EventId = string;

export type AnswerValue =
  | { type: 'free'; text: string }
  | { type: 'choice'; optionIds: string[] }
  | { type: 'scale'; value: number }
  | { type: 'versePick'; bookId: number; chapter: number; verse: number }
  | { type: 'checklist'; itemIds: string[] }
  | null;

export type LedgerEvent =
  | { id: EventId; kind: 'read'; at: string; bookId: number; chapter: number; verses?: number[] }
  | { id: EventId; kind: 'answer'; at: string; planId: string; sessionId: string; questionId: string;
      value: AnswerValue; circleId?: string; share: 'private' | 'circle' }
  | { id: EventId; kind: 'session'; at: string; planId: string; sessionId: string; circleId?: string }
  | { id: EventId; kind: 'plan'; at: string; planId: string; sessionId?: string; circleId?: string };

export type ReadEvent = Extract<LedgerEvent, { kind: 'read' }>;
export type AnswerEvent = Extract<LedgerEvent, { kind: 'answer' }>;
export type SessionEvent = Extract<LedgerEvent, { kind: 'session' }>;
export type PlanEvent = Extract<LedgerEvent, { kind: 'plan' }>;
type DraftEvent = LedgerEvent extends infer Event ? Event extends LedgerEvent ? Omit<Event, 'id'> : never : never;

const DB_NAME = 'word-ledger';
const STORE = 'events';
const MEMORY_KEY = 'word.ledger';

export function eventId(gunPub: string, counter: number): EventId {
  return `${gunPub}:${counter}`;
}

export function parseEventId(id: EventId): { gunPub: string; counter: number } | null {
  const cut = id.lastIndexOf(':');
  if (cut <= 0) return null;
  const counter = Number(id.slice(cut + 1));
  if (!Number.isInteger(counter) || counter < 1) return null;
  return { gunPub: id.slice(0, cut), counter };
}

export function nextCounter(events: LedgerEvent[], gunPub: string): number {
  let max = 0;
  for (const event of events) {
    const parsed = parseEventId(event.id);
    if (parsed && parsed.gunPub === gunPub && parsed.counter > max) max = parsed.counter;
  }
  return max + 1;
}

export function mergeLedgers(left: LedgerEvent[], right: LedgerEvent[]): LedgerEvent[] {
  const byId = new Map<EventId, LedgerEvent>();
  for (const event of left) byId.set(event.id, event);
  for (const event of right) if (!byId.has(event.id)) byId.set(event.id, event);
  return [...byId.values()].sort(byTime);
}

function byTime(a: LedgerEvent, b: LedgerEvent) {
  if (a.at === b.at) return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  return a.at < b.at ? -1 : 1;
}

export function readsOf(events: LedgerEvent[]): ReadEvent[] {
  return events.filter((event): event is ReadEvent => event.kind === 'read');
}

export function uniqueChapters(events: LedgerEvent[]): { bookId: number; chapter: number; at: string }[] {
  const first = new Map<string, { bookId: number; chapter: number; at: string }>();
  for (const event of readsOf(events).sort(byTime)) {
    const key = `${event.bookId}:${event.chapter}`;
    if (!first.has(key)) first.set(key, { bookId: event.bookId, chapter: event.chapter, at: event.at });
  }
  return [...first.values()];
}

export function readDayKeys(events: LedgerEvent[]): string[] {
  const days = new Set<string>();
  for (const event of readsOf(events)) days.add(dayKey(new Date(event.at)));
  return [...days].sort();
}

export function alreadyReadToday(events: LedgerEvent[], bookId: number, chapter: number, today = dayKey()): boolean {
  return readsOf(events).some((event) => (
    event.bookId === bookId && event.chapter === chapter && dayKey(new Date(event.at)) === today
  ));
}

export function chaptersOfBook(events: LedgerEvent[], bookId: number): Set<number> {
  const set = new Set<number>();
  for (const event of readsOf(events)) if (event.bookId === bookId) set.add(event.chapter);
  return set;
}

export function latestAnswers(events: LedgerEvent[]): Map<string, AnswerEvent> {
  const latest = new Map<string, AnswerEvent>();
  for (const event of events) {
    if (event.kind !== 'answer') continue;
    const key = `${event.planId}:${event.sessionId}:${event.questionId}`;
    const prev = latest.get(key);
    if (!prev || prev.at < event.at || (prev.at === event.at && prev.id < event.id)) latest.set(key, event);
  }
  return latest;
}

export function appendEvent(events: LedgerEvent[], gunPub: string, draft: DraftEvent): { events: LedgerEvent[]; event: LedgerEvent } {
  const event = { ...draft, id: eventId(gunPub, nextCounter(events, gunPub)) } as LedgerEvent;
  return { events: mergeLedgers(events, [event]), event };
}

export function eventsForActor(events: LedgerEvent[], gunPub: string): LedgerEvent[] {
  return events.filter((event) => parseEventId(event.id)?.gunPub === gunPub);
}

function memoryLoad(): LedgerEvent[] {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LedgerEvent[];
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

function memorySave(events: LedgerEvent[]) {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(events)); } catch { /* storage blocked */ }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) {
        request.result.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadEvents(): Promise<LedgerEvent[]> {
  if (typeof indexedDB === 'undefined') return memoryLoad();
  try {
    const db = await openDb();
    const rows = await new Promise<LedgerEvent[]>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as LedgerEvent[]) || []);
      request.onerror = () => reject(request.error);
    });
    return rows.sort(byTime);
  } catch {
    return memoryLoad();
  }
}

export async function saveEvents(events: LedgerEvent[]): Promise<void> {
  memorySave(events);
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      store.clear();
      for (const event of events) store.put(event);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* private mode: memory/localStorage already held it */ }
}
