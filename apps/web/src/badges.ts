// Badges are derived from the ledger, never stored as truth. evaluate() is pure;
// earnedAt is the timestamp of the event that crossed the threshold.
import { BOOKS_DATA } from '@the-word/bible';
import { currentStreak, dayKey, type Language } from '@the-word/core';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import {
  chaptersOfBook,
  readDayKeys,
  uniqueChapters,
  type LedgerEvent,
} from './ledger';

export type Localized = { en: string } & Partial<Record<Language, string>>;

export interface BadgeDefinition {
  id: string;
  title: Localized;
  description: Localized;
  icon: string;
  tier?: 'bronze' | 'silver' | 'gold';
  criteria:
    | { kind: 'chaptersRead'; count: number }
    | { kind: 'streakDays'; days: number }
    | { kind: 'bookComplete'; bookId: number | 'any' }
    | { kind: 'sessionsComplete'; count: number }
    | { kind: 'planComplete'; planId: string | 'any'; count?: number }
    | { kind: 'questionsAnswered'; count: number }
    | { kind: 'circleSessions'; count: number };
}

export interface EarnedBadge {
  id: string;
  earnedAt: string;
  definition: BadgeDefinition;
}

export interface BadgeProgress {
  have: number;
  need: number;
  done: boolean;
}

const books = BOOKS_DATA;
const bookById = new Map(books.map((book) => [book.id, book]));

export const BADGES: BadgeDefinition[] = [
  {
    id: 'first-chapter',
    tier: 'bronze',
    title: { en: 'First chapter', es: 'Primer capítulo', fr: 'Premier chapitre', zh: '第一章', vi: 'Đoạn đầu tiên' },
    description: {
      en: 'Read a chapter through to the last verse.',
      es: 'Lee un capítulo hasta el último versículo.',
      fr: 'Lire un chapitre jusqu’au dernier verset.',
      zh: '把一章读到最后一节。',
      vi: 'Đọc một đoạn đến câu cuối.',
    },
    icon: 'M12 3l2.4 6.6L21 12l-6.6 2.4L12 21l-2.4-6.6L3 12l6.6-2.4Z',
    criteria: { kind: 'chaptersRead', count: 1 },
  },
  {
    id: 'seven-chapters',
    tier: 'bronze',
    title: { en: 'Seven chapters', es: 'Siete capítulos', fr: 'Sept chapitres', zh: '七章', vi: 'Bảy đoạn' },
    description: {
      en: 'Finish seven different chapters.',
      es: 'Termina siete capítulos distintos.',
      fr: 'Terminer sept chapitres différents.',
      zh: '读完七个不同的章。',
      vi: 'Đọc xong bảy đoạn khác nhau.',
    },
    icon: 'M4 7h16M4 12h16M4 17h10',
    criteria: { kind: 'chaptersRead', count: 7 },
  },
  {
    id: 'thirty-chapters',
    tier: 'silver',
    title: { en: 'Thirty chapters', es: 'Treinta capítulos', fr: 'Trente chapitres', zh: '三十章', vi: 'Ba mươi đoạn' },
    description: {
      en: 'Finish thirty different chapters.',
      es: 'Termina treinta capítulos distintos.',
      fr: 'Terminer trente chapitres différents.',
      zh: '读完三十个不同的章。',
      vi: 'Đọc xong ba mươi đoạn khác nhau.',
    },
    icon: 'M5 19V5h4l3 6 3-6h4v14h-4v-8l-3 6-3-6v8H5Z',
    criteria: { kind: 'chaptersRead', count: 30 },
  },
  {
    id: 'streak-3',
    tier: 'bronze',
    title: { en: 'Three days', es: 'Tres días', fr: 'Trois jours', zh: '三天', vi: 'Ba ngày' },
    description: {
      en: 'Read on three days in a row.',
      es: 'Lee tres días seguidos.',
      fr: 'Lire trois jours de suite.',
      zh: '连续三天阅读。',
      vi: 'Đọc ba ngày liên tiếp.',
    },
    icon: 'M7 3v2M17 3v2M4 8h16v12H4V8Zm4 5h2v2H8v-2Zm6 0h2v2h-2v-2Z',
    criteria: { kind: 'streakDays', days: 3 },
  },
  {
    id: 'streak-7',
    tier: 'silver',
    title: { en: 'Seven days', es: 'Siete días', fr: 'Sept jours', zh: '七天', vi: 'Bảy ngày' },
    description: {
      en: 'Read every day for a week.',
      es: 'Lee todos los días durante una semana.',
      fr: 'Lire chaque jour pendant une semaine.',
      zh: '连续一周每天阅读。',
      vi: 'Đọc mỗi ngày trong một tuần.',
    },
    icon: 'M7 3v2M17 3v2M4 8h16v12H4V8Zm3 4h2v2H7v-2Zm4 0h2v2h-2v-2Zm4 0h2v2h-2v-2Z',
    criteria: { kind: 'streakDays', days: 7 },
  },
  {
    id: 'any-book',
    tier: 'silver',
    title: { en: 'A whole book', es: 'Un libro entero', fr: 'Un livre entier', zh: '一整卷书', vi: 'Cả một sách' },
    description: {
      en: 'Finish every chapter of any book.',
      es: 'Termina todos los capítulos de cualquier libro.',
      fr: 'Terminer tous les chapitres d’un livre.',
      zh: '读完任何一卷书的每一章。',
      vi: 'Đọc xong mọi đoạn của một sách.',
    },
    icon: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Zm3 4h8M8 12h8',
    criteria: { kind: 'bookComplete', bookId: 'any' },
  },
  {
    id: 'gospel-john',
    tier: 'gold',
    title: { en: 'The Gospel of John', es: 'El Evangelio de Juan', fr: 'L’Évangile de Jean', zh: '约翰福音', vi: 'Tin Mừng Giăng' },
    description: {
      en: 'Read all twenty-one chapters of John.',
      es: 'Lee los veintiún capítulos de Juan.',
      fr: 'Lire les vingt-et-un chapitres de Jean.',
      zh: '读完约翰福音全部二十一章。',
      vi: 'Đọc cả hai mươi mốt đoạn của Giăng.',
    },
    icon: 'M12 3c4 3 7 4 8 4v10c-2-1-5 0-8 2-3-2-6-3-8-2V7c1 0 4-1 8-4Z',
    criteria: { kind: 'bookComplete', bookId: 43 },
  },
];

function sessionsComplete(events: LedgerEvent[]) {
  return new Set(
    events.filter((event): event is Extract<LedgerEvent, { kind: 'session' }> => event.kind === 'session')
      .map((event) => `${event.planId}:${event.sessionId}`),
  ).size;
}

function plansComplete(events: LedgerEvent[], planId: string | 'any') {
  const done = events.filter((event): event is Extract<LedgerEvent, { kind: 'plan' }> => (
    event.kind === 'plan' && (planId === 'any' || event.planId === planId)
  ));
  return new Set(done.map((event) => event.planId)).size;
}

function questionsAnswered(events: LedgerEvent[]) {
  const latest = new Map<string, { at: string; value: unknown }>();
  for (const event of events) {
    if (event.kind !== 'answer') continue;
    const key = `${event.planId}:${event.sessionId}:${event.questionId}`;
    const prev = latest.get(key);
    if (!prev || prev.at < event.at) latest.set(key, { at: event.at, value: event.value });
  }
  let count = 0;
  for (const row of latest.values()) if (row.value !== null) count += 1;
  return count;
}

function circleSessions(events: LedgerEvent[]) {
  return events.filter((event) => event.kind === 'session' && event.circleId).length;
}

export function progressToward(definition: BadgeDefinition, events: LedgerEvent[], today = dayKey()): BadgeProgress {
  const criteria = definition.criteria;
  if (criteria.kind === 'chaptersRead') {
    const have = uniqueChapters(events).length;
    return { have, need: criteria.count, done: have >= criteria.count };
  }
  if (criteria.kind === 'streakDays') {
    const have = currentStreak(readDayKeys(events), today);
    return { have, need: criteria.days, done: have >= criteria.days };
  }
  if (criteria.kind === 'bookComplete') {
    if (criteria.bookId === 'any') {
      const best = Math.max(0, ...books.map((book) => {
        const have = chaptersOfBook(events, book.id).size;
        return have / book.chapters;
      }));
      const closest = books.reduce((winner, book) => {
        const ratio = chaptersOfBook(events, book.id).size / book.chapters;
        return ratio > winner.ratio ? { book, ratio } : winner;
      }, { book: books[0], ratio: 0 });
      const have = chaptersOfBook(events, closest.book.id).size;
      return { have, need: closest.book.chapters, done: best >= 1 };
    }
    const have = chaptersOfBook(events, criteria.bookId).size;
    const need = bookById.get(criteria.bookId)?.chapters ?? 0;
    return { have, need, done: have >= need };
  }
  if (criteria.kind === 'sessionsComplete') {
    const have = sessionsComplete(events);
    return { have, need: criteria.count, done: have >= criteria.count };
  }
  if (criteria.kind === 'planComplete') {
    const have = plansComplete(events, criteria.planId);
    const need = criteria.count ?? 1;
    return { have, need, done: have >= need };
  }
  if (criteria.kind === 'questionsAnswered') {
    const have = questionsAnswered(events);
    return { have, need: criteria.count, done: have >= criteria.count };
  }
  const have = circleSessions(events);
  return { have, need: criteria.count, done: have >= criteria.count };
}

function qualifies(definition: BadgeDefinition, events: LedgerEvent[], asOf: string): boolean {
  return progressToward(definition, events, dayKey(new Date(asOf))).done;
}

export function evaluate(events: LedgerEvent[], definitions: BadgeDefinition[] = BADGES): EarnedBadge[] {
  const ordered = [...events].sort((a, b) => (a.at === b.at ? (a.id < b.id ? -1 : 1) : a.at < b.at ? -1 : 1));
  const earned = new Map<string, EarnedBadge>();
  const prefix: LedgerEvent[] = [];
  for (const event of ordered) {
    prefix.push(event);
    for (const definition of definitions) {
      if (earned.has(definition.id)) continue;
      if (qualifies(definition, prefix, event.at)) {
        earned.set(definition.id, { id: definition.id, earnedAt: event.at, definition });
      }
    }
  }
  return definitions.map((definition) => earned.get(definition.id)).filter((row): row is EarnedBadge => Boolean(row));
}

export function hashLedger(events: LedgerEvent[]): string {
  const ids = events.map((event) => event.id).sort().join('|');
  return bytesToHex(sha256(utf8ToBytes(ids)));
}

export function localized(copy: Localized, language: Language): string {
  return copy[language] || copy.en;
}
