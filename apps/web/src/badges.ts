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
    | { kind: 'testamentComplete'; testament: 'old' | 'new' | 'all' }
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

export interface CanonProgress {
  have: number;
  need: number;
  percent: number;
}

const books = BOOKS_DATA;
const bookById = new Map(books.map((book) => [book.id, book]));
const BOOK_ICON = 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 0-3 3V4Zm3 4h8M8 12h8';
const SCROLL_ICON = 'M6 4h9a3 3 0 0 1 3 3v13H8a2 2 0 0 0-2 2V4Zm3 4h7M9 12h7M9 16h5';

function percent(have: number, need: number): number {
  if (!need || !have) return 0;
  return Math.round((have / need) * 1000) / 10;
}

function booksFor(testament: 'old' | 'new' | 'all') {
  return testament === 'all' ? books : books.filter((book) => book.testament === testament);
}

function chaptersIn(events: LedgerEvent[], testament: 'old' | 'new' | 'all'): { have: number; need: number } {
  const set = booksFor(testament);
  const ids = new Set(set.map((book) => book.id));
  const need = set.reduce((sum, book) => sum + book.chapters, 0);
  const have = uniqueChapters(events).filter((row) => ids.has(row.bookId)).length;
  return { have, need };
}

export function bibleProgress(events: LedgerEvent[]): { all: CanonProgress; old: CanonProgress; new: CanonProgress } {
  const all = chaptersIn(events, 'all');
  const old = chaptersIn(events, 'old');
  const nt = chaptersIn(events, 'new');
  return {
    all: { ...all, percent: percent(all.have, all.need) },
    old: { ...old, percent: percent(old.have, old.need) },
    new: { ...nt, percent: percent(nt.have, nt.need) },
  };
}

function bookBadges(): BadgeDefinition[] {
  return books.map((book) => ({
    id: `book-${book.id}`,
    tier: book.chapters >= 40 ? 'gold' : book.chapters >= 10 ? 'silver' : 'bronze',
    title: { en: book.name },
    description: {
      en: `Read every chapter of ${book.name}.`,
      es: `Lee todos los capítulos de ${book.name}.`,
      fr: `Lire tous les chapitres de ${book.name}.`,
      zh: `读完《${book.name}》的每一章。`,
      vi: `Đọc hết mọi đoạn của ${book.name}.`,
    },
    icon: BOOK_ICON,
    criteria: { kind: 'bookComplete' as const, bookId: book.id },
  }));
}

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
    icon: BOOK_ICON,
    criteria: { kind: 'bookComplete', bookId: 'any' },
  },
  {
    id: 'old-testament',
    tier: 'gold',
    title: { en: 'The Old Testament', es: 'El Antiguo Testamento', fr: 'L’Ancien Testament', zh: '旧约', vi: 'Cựu Ước' },
    description: {
      en: 'Read every chapter of the Old Testament.',
      es: 'Lee todos los capítulos del Antiguo Testamento.',
      fr: 'Lire tous les chapitres de l’Ancien Testament.',
      zh: '读完旧约的每一章。',
      vi: 'Đọc hết mọi đoạn của Cựu Ước.',
    },
    icon: SCROLL_ICON,
    criteria: { kind: 'testamentComplete', testament: 'old' },
  },
  {
    id: 'new-testament',
    tier: 'gold',
    title: { en: 'The New Testament', es: 'El Nuevo Testamento', fr: 'Le Nouveau Testament', zh: '新约', vi: 'Tân Ước' },
    description: {
      en: 'Read every chapter of the New Testament.',
      es: 'Lee todos los capítulos del Nuevo Testamento.',
      fr: 'Lire tous les chapitres du Nouveau Testament.',
      zh: '读完新约的每一章。',
      vi: 'Đọc hết mọi đoạn của Tân Ước.',
    },
    icon: 'M12 3c4 3 7 4 8 4v10c-2-1-5 0-8 2-3-2-6-3-8-2V7c1 0 4-1 8-4Z',
    criteria: { kind: 'testamentComplete', testament: 'new' },
  },
  {
    id: 'whole-bible',
    tier: 'gold',
    title: { en: 'The whole Bible', es: 'Toda la Biblia', fr: 'Toute la Bible', zh: '整本圣经', vi: 'Cả Kinh Thánh' },
    description: {
      en: 'Read every chapter of Scripture.',
      es: 'Lee todos los capítulos de las Escrituras.',
      fr: 'Lire tous les chapitres des Écritures.',
      zh: '读完圣经的每一章。',
      vi: 'Đọc hết mọi đoạn Kinh Thánh.',
    },
    icon: 'M4 5h7c2 0 3 1 3 3v13H7a3 3 0 0 0-3 3V5Zm9 0h7v18a3 3 0 0 0-3-3h-4V5Z',
    criteria: { kind: 'testamentComplete', testament: 'all' },
  },
  {
    id: 'fun-casanova',
    tier: 'bronze',
    title: { en: 'Casanova', es: 'Don Juan', fr: 'Casanova', zh: '情圣', vi: 'Casanova' },
    description: {
      en: 'You finished Song of Solomon. Try not to blush in Group Study.',
      es: 'Terminaste el Cantar de los Cantares. Intenta no sonrojarte en el grupo.',
      fr: 'Vous avez fini le Cantique des cantiques. Évitez de rougir en groupe.',
      zh: '你读完了雅歌。小组学习时尽量别脸红。',
      vi: 'Bạn đã đọc xong Nhã Ca. Đừng đỏ mặt khi học nhóm.',
    },
    icon: 'M12 21s-7-4.4-7-10a4 4 0 0 1 7-2 4 4 0 0 1 7 2c0 5.6-7 10-7 10Z',
    criteria: { kind: 'bookComplete', bookId: 22 },
  },
  {
    id: 'fun-whale',
    tier: 'bronze',
    title: { en: 'Whale watcher', es: 'Avistador de ballenas', fr: 'Observation de baleine', zh: '观鲸人', vi: 'Ngắm cá voi' },
    description: {
      en: 'Jonah, all four chapters. No one stays in a fish forever.',
      es: 'Jonás, los cuatro capítulos. Nadie se queda en un pez para siempre.',
      fr: 'Jonas, les quatre chapitres. On ne reste pas dans un poisson pour toujours.',
      zh: '约拿全书四章。没有人会永远待在鱼肚子里。',
      vi: 'Giô-na, cả bốn đoạn. Không ai ở trong cá mãi.',
    },
    icon: 'M3 14c2-6 8-8 14-6 2 .6 4 2 5 4H3Zm14-2h.01M8 18c3 3 8 3 12 0',
    criteria: { kind: 'bookComplete', bookId: 32 },
  },
  {
    id: 'fun-fine-print',
    tier: 'silver',
    title: { en: 'Fine print', es: 'Letra pequeña', fr: 'Les petites lignes', zh: '细则读者', vi: 'Chữ nhỏ' },
    description: {
      en: 'You read all of Leviticus. The footnotes never stood a chance.',
      es: 'Leíste todo Levítico. Las notas al pie no tenían oportunidad.',
      fr: 'Vous avez lu tout le Lévitique. Les notes de bas de page n’avaient aucune chance.',
      zh: '你读完了利未记。脚注毫无胜算。',
      vi: 'Bạn đã đọc hết Lê-vi. Chú thích dưới trang không có cửa.',
    },
    icon: 'M6 4h12v16H6V4Zm3 4h6M9 12h6M9 16h4',
    criteria: { kind: 'bookComplete', bookId: 3 },
  },
  {
    id: 'fun-census',
    tier: 'silver',
    title: { en: 'Census taker', es: 'Censista', fr: 'Recenseur', zh: '人口普查员', vi: 'Người kiểm kê' },
    description: {
      en: 'Numbers, all thirty-six chapters. Yes, the lists count.',
      es: 'Números, los treinta y seis capítulos. Sí, las listas cuentan.',
      fr: 'Nombres, les trente-six chapitres. Oui, les listes comptent.',
      zh: '民数记全部三十六章。是的，那些名单也算。',
      vi: 'Dân Số, cả ba mươi sáu đoạn. Đúng, các danh sách cũng tính.',
    },
    icon: 'M5 19V8l7-4 7 4v11M9 19v-6h6v6',
    criteria: { kind: 'bookComplete', bookId: 4 },
  },
  {
    id: 'fun-vapor',
    tier: 'bronze',
    title: { en: 'Vanity project', es: 'Vanidad de vanidades', fr: 'Vanité des vanités', zh: '虚空工程', vi: 'Hư không' },
    description: {
      en: 'Ecclesiastes, cover to cover. Everything is vapor — except this badge.',
      es: 'Eclesiastés de cabo a rabo. Todo es vapor — salvo esta insignia.',
      fr: 'L’Ecclésiaste d’un bout à l’autre. Tout est vapeur — sauf ce badge.',
      zh: '你读完了传道书。凡事都是虚空——除了这枚徽章。',
      vi: 'Truyền Đạo, hết sách. Mọi sự đều hư không — trừ huy hiệu này.',
    },
    icon: 'M4 16c2-6 5-9 8-9s6 3 8 9M8 10c.5-2 2-3 4-3s3.5 1 4 3',
    criteria: { kind: 'bookComplete', bookId: 21 },
  },
  {
    id: 'fun-blink',
    tier: 'bronze',
    title: { en: 'Blink and you’ll miss it', es: 'Si parpadeas, te lo pierdes', fr: 'Un coup d’œil', zh: '一眨眼', vi: 'Nháy mắt là hết' },
    description: {
      en: 'Obadiah is one chapter. You still had to finish it.',
      es: 'Abdías es un capítulo. Aun así había que terminarlo.',
      fr: 'Abdias n’a qu’un chapitre. Il fallait quand même le finir.',
      zh: '俄巴底亚只有一章。你还是得读完。',
      vi: 'Áp-đia chỉ một đoạn. Vẫn phải đọc xong.',
    },
    icon: 'M2 12s4-6 10-6 10 6 10 6-4 6-10 6S2 12 2 12Zm10-2a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z',
    criteria: { kind: 'bookComplete', bookId: 31 },
  },
  {
    id: 'fun-plot-twist',
    tier: 'gold',
    title: { en: 'Plot twist', es: 'Giro final', fr: 'Coup de théâtre', zh: '剧情反转', vi: 'Bất ngờ cuối sách' },
    description: {
      en: 'Revelation, all twenty-two chapters. No skipping to the last page.',
      es: 'Apocalipsis, los veintidós capítulos. Sin saltar a la última página.',
      fr: 'L’Apocalypse, les vingt-deux chapitres. Pas de saut à la dernière page.',
      zh: '启示录全部二十二章。不许翻到最后一页。',
      vi: 'Khải Huyền, cả hai mươi hai đoạn. Không được nhảy tới trang cuối.',
    },
    icon: 'M5 5h14v4H5V5Zm0 6h14v8H5v-8Zm4 3h6',
    criteria: { kind: 'bookComplete', bookId: 66 },
  },
  {
    id: 'fun-road-trip',
    tier: 'silver',
    title: { en: 'Road trip', es: 'Viaje por carretera', fr: 'Road trip', zh: '公路旅行', vi: 'Đi đường dài' },
    description: {
      en: 'Acts, twenty-eight chapters. Someone had to sit shotgun with Paul.',
      es: 'Hechos, veintiocho capítulos. Alguien tenía que ir de copiloto con Pablo.',
      fr: 'Actes, vingt-huit chapitres. Il fallait bien un copilote pour Paul.',
      zh: '使徒行传二十八章。总得有人给保罗当副驾。',
      vi: 'Công Vụ, hai mươi tám đoạn. Phải có người ngồi ghế phụ với Phao-lô.',
    },
    icon: 'M4 16l3-8h10l3 8H4Zm3 0v3M17 16v3M8 12h8',
    criteria: { kind: 'bookComplete', bookId: 44 },
  },
  ...bookBadges(),
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
  if (criteria.kind === 'testamentComplete') {
    const { have, need } = chaptersIn(events, criteria.testament);
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
