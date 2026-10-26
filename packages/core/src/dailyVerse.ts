import { useEffect, useState } from 'react';
import { localBible, parseReference, type ParsedReference } from '@the-word/bible';

export const DAILY_VERSE_API = 'https://discoverybiblestudy.org/daily/api/';
export const DAILY_VERSE_SITE = 'https://discoverybiblestudy.org/daily/';

export interface DailyVerse {
  text: string;
  ref: string;
  date: string;
  url: string;
  verseUrl: string;
  parsed: ParsedReference | null;
}

export type DailyVerseStatus = 'loading' | 'ready' | 'error';

function decodeHtmlEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function asDailyVerse(data: unknown): DailyVerse {
  if (!data || typeof data !== 'object') throw new Error('Unexpected daily verse payload');
  const payload = data as Record<string, unknown>;
  if (typeof payload.text !== 'string' || typeof payload.ref !== 'string') throw new Error('Unexpected daily verse payload');
  const text = decodeHtmlEntities(payload.text).trim();
  const ref = decodeHtmlEntities(payload.ref).replace(/\s+/g, ' ').trim();
  return {
    text,
    ref,
    date: typeof payload.date === 'string' ? payload.date : '',
    url: typeof payload.url === 'string' ? payload.url : DAILY_VERSE_SITE,
    verseUrl: typeof payload.verseUrl === 'string' ? payload.verseUrl : typeof payload.url === 'string' ? payload.url : DAILY_VERSE_SITE,
    parsed: parseReference(ref),
  };
}

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];

export function localDayKey(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// Feed dates are English ordinals ("23rd Oct 2026"). Some responses also use ISO.
export function verseDayKey(raw: string): string | null {
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.trim());
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const match = /^(\d{1,2})[a-z]*\s+([a-z]+)\.?\s+(\d{4})$/i.exec(raw.trim());
  if (!match) return null;
  const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase());
  if (month < 0) return null;
  const day = Number(match[1]);
  if (day < 1 || day > 31) return null;
  return `${match[3]}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function verseIsCurrent(date: string, now = new Date()): boolean {
  const key = verseDayKey(date);
  return key !== null && key === localDayKey(now);
}

// The feed dates in English ("4th Sep 2026"). Reformat it in the reader's own
// language so a translated sentence does not carry an English ordinal.
export function formatVerseDate(raw: string, language: string) {
  const match = /^(\d{1,2})[a-z]*\s+([a-z]+)\.?\s+(\d{4})$/i.exec(raw.trim());
  if (!match) return raw;
  const month = MONTHS.indexOf(match[2].slice(0, 3).toLowerCase());
  if (month < 0) return raw;
  const date = new Date(Number(match[3]), month, Number(match[1]));
  if (Number.isNaN(date.getTime())) return raw;
  try {
    return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  } catch {
    return raw;
  }
}

let cache: { key: string; day: string; verse: DailyVerse } | null = null;

function cacheKey(urls: string[]) {
  return urls.join('\n');
}

function peekDailyVerse(urls: string[], now = new Date()) {
  const key = cacheKey(urls);
  const day = localDayKey(now);
  return cache?.key === key && cache.day === day ? cache.verse : null;
}

// Tries each URL until one returns today's verse. A bundled daily.json from
// another day is a miss, not a success: the card must not show it as today.
// Web needs a same-origin URL (Vite proxy or a current daily.json) because
// discoverybiblestudy.org sends neither CORS nor CORP.
export async function fetchDailyVerse(urls: string[], bypassCache = false, now = new Date()): Promise<DailyVerse> {
  const key = cacheKey(urls);
  const day = localDayKey(now);
  if (!bypassCache && cache?.key === key && cache.day === day) return cache.verse;
  let lastError: unknown;
  for (const url of urls) {
    try {
      const response = await fetch(url, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const verse = asDailyVerse(await response.json());
      if (!verseIsCurrent(verse.date, now)) {
        lastError = new Error('stale daily verse');
        continue;
      }
      cache = { key, day, verse };
      return verse;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Could not load the daily verse');
}

export function useDailyVerse(urls: string[]) {
  const list = cacheKey(urls);
  const [retry, setRetry] = useState(0);
  const cached = retry === 0 ? peekDailyVerse(urls) : null;
  const [status, setStatus] = useState<DailyVerseStatus>(cached ? 'ready' : 'loading');
  const [verse, setVerse] = useState<DailyVerse | null>(cached);

  useEffect(() => {
    let active = true;
    const sources = list.split('\n').filter(Boolean);
    if (retry > 0 || !peekDailyVerse(sources)) setStatus('loading');
    void fetchDailyVerse(sources, retry > 0)
      .then((loaded) => {
        if (!active) return;
        setVerse(loaded);
        setStatus('ready');
      })
      .catch(() => {
        if (!active) return;
        setVerse(null);
        setStatus('error');
      });
    return () => { active = false; };
  }, [list, retry]);

  useEffect(() => {
    const now = new Date();
    const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const timer = setTimeout(() => setRetry((count) => count + 1), Math.max(1000, next.getTime() - now.getTime()));
    return () => clearTimeout(timer);
  }, [retry]);

  return {
    status,
    verse,
    reload: () => setRetry((count) => count + 1),
  };
}

// Loads the day's verse in the user's selected translation so read-aloud,
// copy, and image export match the reader rather than the Discovery FBV text.
export function useLocalVerse(translationId: string, ref: ParsedReference | null) {
  const [text, setText] = useState<string | null>(null);
  const [ready, setReady] = useState(!ref);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ref) {
      setText(null);
      setReady(true);
      setFailed(false);
      return;
    }
    let active = true;
    setReady(false);
    setFailed(false);
    void localBible.getChapter(translationId, ref.bookId, ref.chapter).then((chapter) => {
      if (!active) return;
      setText(chapter?.verses.find((verse) => verse.ref.verse === ref.verse)?.text ?? null);
      setReady(true);
    }).catch(() => {
      if (!active) return;
      setText(null);
      setReady(true);
      setFailed(true);
    });
    return () => { active = false; };
  }, [translationId, ref?.bookId, ref?.chapter, ref?.verse, attempt]);

  return { text, ready, failed, reload: () => setAttempt((count) => count + 1) };
}
