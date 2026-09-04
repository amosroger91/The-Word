import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BIBLE_TOPICS, localBible } from '@the-word/bible';
import type { SearchResult } from '@the-word/shared';
import { clampFontSize, clampRate, clampVolume, defaults, fontFor, speechRateRange, speechVolumeRange, storageKeys, voicesFor } from './catalogue';
import { languages, resolveLanguage, strings, type Language } from './i18n';
import type { Platform } from './platform';
import { useSpeech } from './useSpeech';

export interface BookmarkEntry {
  bookId: number;
  chapter: number;
  verse: number;
}

export type Theme = 'light' | 'dark';

function parseBookmarkKey(key: string): BookmarkEntry | null {
  const parts = key.split(':');
  if (parts.length !== 4) return null;
  const bookId = Number(parts[1]);
  const chapter = Number(parts[2]);
  const verse = Number(parts[3]);
  if (!bookId || !chapter || !verse) return null;
  return { bookId, chapter, verse };
}

function readBookmarks(raw: string | null) {
  const map = new Map<string, BookmarkEntry>();
  if (!raw) return map;
  try {
    for (const key of JSON.parse(raw) as string[]) {
      const entry = parseBookmarkKey(key);
      if (entry) map.set(key, entry);
    }
  } catch {
    return map;
  }
  return map;
}

function readNumber(raw: string | null, fallback: number) {
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

// The next reading position for continuous read-aloud: the next chapter in the
// same book, rolling into chapter 1 of the following book, or null at the very end.
function nextReadingPosition(
  bookId: number,
  chapterNumber: number,
  books: ReturnType<typeof localBible.getBooks>,
): { bookId: number; chapter: number } | null {
  const index = books.findIndex((item) => item.id === bookId);
  const current = books[index];
  if (!current) return null;
  if (chapterNumber < current.chapters) return { bookId, chapter: chapterNumber + 1 };
  const nextBook = books[index + 1];
  return nextBook ? { bookId: nextBook.id, chapter: 1 } : null;
}

// Every piece of reader behaviour lives here so the web and native views only render.
export function useWordApp({ storage, speech, clipboard, voices }: Platform, initialTheme: Theme = 'light') {
  const [translationId, setTranslationId] = useState(() => storage.get(storageKeys.translation) ?? defaults.translationId);
  const [language, setLanguage] = useState<Language>(() => resolveLanguage(storage.get(storageKeys.language)));
  const [theme, setTheme] = useState<Theme>(() => {
    const stored = storage.get(storageKeys.theme);
    return stored === 'dark' || stored === 'light' ? stored : initialTheme;
  });
  const [bookId, setBookId] = useState(() => readNumber(storage.get(storageKeys.book), defaults.bookId));
  const [chapterNumber, setChapterNumber] = useState(() => readNumber(storage.get(storageKeys.chapter), defaults.chapter));
  const [fontSize, setFontSizeValue] = useState(() => clampFontSize(readNumber(storage.get(storageKeys.fontSize), defaults.fontSize)));
  const [fontId, setFontId] = useState(() => fontFor(storage.get(storageKeys.font) ?? defaults.fontId).id);
  const [speechVoice, setSpeechVoice] = useState(() => storage.get(storageKeys.voice) ?? voicesFor(resolveLanguage(storage.get(storageKeys.language)))[0].id);
  const [speechRate, setSpeechRate] = useState(() => clampRate(readNumber(storage.get(storageKeys.rate), defaults.rate)));
  const [speechVolume, setSpeechVolume] = useState(() => {
    const raw = storage.get(storageKeys.volume);
    if (raw === null) return defaults.volume;
    const value = Number(raw);
    return Number.isFinite(value) ? clampVolume(value) : defaults.volume;
  });
  const [bookmarks, setBookmarks] = useState(() => readBookmarks(storage.get(storageKeys.bookmarks)));
  const [selectedVerses, setSelectedVerses] = useState<Set<number>>(new Set());
  const [chapter, setChapter] = useState<Awaited<ReturnType<typeof localBible.getChapter>>>(null);
  const [chapterLoading, setChapterLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'all' | 'exact'>('all');
  const [searchBookId, setSearchBookId] = useState('all');
  const [searchTestament, setSearchTestament] = useState<'all' | 'old' | 'new'>('all');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);

  const label = strings[language];
  const translations = localBible.getTranslations();
  const books = localBible.getBooks(translationId);
  const book = books.find((item) => item.id === bookId) ?? null;
  const bookName = book?.name ?? '';
  const voiceOptions = useMemo(() => voices?.(language) ?? voicesFor(language), [voices, language]);
  const font = fontFor(fontId);

  const speechOptions = useMemo(
    () => ({ voice: speechVoice, rate: speechRate, volume: speechVolume, language }),
    [speechVoice, speechRate, speechVolume, language],
  );

  // Continuous read-aloud: true once "read chapter" starts, cleared by stop or by
  // reading a selection. pendingAutoSpeak marks that we advanced and are waiting for
  // the new chapter's verses to load before speaking them.
  const autoAdvanceRef = useRef(false);
  const [pendingAutoSpeak, setPendingAutoSpeak] = useState(false);

  const handleSpeechComplete = useCallback(() => {
    if (!autoAdvanceRef.current) return;
    const next = nextReadingPosition(bookId, chapterNumber, books);
    if (!next) { autoAdvanceRef.current = false; return; }
    setBookId(next.bookId);
    setChapterNumber(next.chapter);
    setSelectedVerses(new Set());
    setPendingAutoSpeak(true);
  }, [bookId, chapterNumber, books]);

  const player = useSpeech(speech, speechOptions, handleSpeechComplete);

  useEffect(() => { storage.set(storageKeys.translation, translationId); }, [translationId]);
  useEffect(() => { storage.set(storageKeys.language, language); }, [language]);
  useEffect(() => { storage.set(storageKeys.theme, theme); }, [theme]);
  useEffect(() => { storage.set(storageKeys.book, String(bookId)); }, [bookId]);
  useEffect(() => { storage.set(storageKeys.chapter, String(chapterNumber)); }, [chapterNumber]);
  useEffect(() => { storage.set(storageKeys.fontSize, String(fontSize)); }, [fontSize]);
  useEffect(() => { storage.set(storageKeys.font, fontId); }, [fontId]);
  useEffect(() => { storage.set(storageKeys.voice, speechVoice); }, [speechVoice]);
  useEffect(() => { storage.set(storageKeys.rate, String(speechRate)); }, [speechRate]);
  useEffect(() => { storage.set(storageKeys.volume, String(speechVolume)); }, [speechVolume]);
  useEffect(() => { storage.set(storageKeys.bookmarks, JSON.stringify([...bookmarks.keys()])); }, [bookmarks]);

  useEffect(() => {
    if (voiceOptions.length && !voiceOptions.some((voice) => voice.id === speechVoice)) setSpeechVoice(voiceOptions[0].id);
  }, [voiceOptions]);

  useEffect(() => {
    let active = true;
    setChapterLoading(true);
    void localBible.getChapter(translationId, bookId, chapterNumber).then((loaded) => {
      if (!active) return;
      setChapter(loaded);
      setChapterLoading(false);
    });
    return () => { active = false; };
  }, [translationId, bookId, chapterNumber]);

  useEffect(() => {
    let active = true;
    const topic = selectedTopic ? BIBLE_TOPICS.find((item) => item.id === selectedTopic) : undefined;
    const activeQuery = topic ? topic.name : query;
    if (!activeQuery.trim() && !topic) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    void localBible.searchVerses(translationId, activeQuery, 500, searchMode, topic?.references).then((loaded) => {
      if (!active) return;
      setSearchResults(loaded.filter((result) => {
        const matchesBook = searchBookId === 'all' || result.verse.ref.bookId === Number(searchBookId);
        const matchesTestament = searchTestament === 'all' || localBible.getBook(result.verse.ref.bookId)?.testament === searchTestament;
        return matchesBook && matchesTestament;
      }));
      setSearchLoading(false);
    });
    return () => { active = false; };
  }, [translationId, query, searchMode, searchBookId, searchTestament, selectedTopic]);

  const selectedVerseNumbers = useMemo(() => [...selectedVerses].sort((a, b) => a - b), [selectedVerses]);
  const selectedText = chapter?.verses.filter((verse) => selectedVerses.has(verse.ref.verse)).map((verse) => verse.text).join(' ') ?? '';
  const selectedReference = selectedVerses.size ? label.verseReference(bookName, chapterNumber, selectedVerseNumbers) : '';
  const chapterReference = label.chapterReference(bookName, chapterNumber);

  const changeTranslation = useCallback((nextId: string) => {
    setTranslationId(nextId);
    const next = localBible.getTranslations().find((item) => item.id === nextId);
    if (next) setLanguage(resolveLanguage(next.language));
    setSelectedVerses(new Set());
  }, []);

  const changeLanguage = useCallback((nextLanguage: Language) => {
    setLanguage(nextLanguage);
    setTranslationId((current) => {
      const list = localBible.getTranslations();
      if (list.find((item) => item.id === current)?.language === nextLanguage) return current;
      const replacement = list.find((item) => item.language === nextLanguage);
      if (!replacement) return current;
      setSelectedVerses(new Set());
      return replacement.id;
    });
  }, []);

  const changeBook = useCallback((nextBookId: number) => {
    setBookId(nextBookId);
    setChapterNumber(1);
    setSelectedVerses(new Set());
  }, []);

  const changeChapter = useCallback((next: number) => {
    setChapterNumber(next);
    setSelectedVerses(new Set());
  }, []);

  const moveChapter = useCallback((direction: -1 | 1) => {
    const next = chapterNumber + direction;
    if (next < 1 || !book || next > book.chapters) return;
    changeChapter(next);
  }, [book, chapterNumber, changeChapter]);

  const toggleVerse = useCallback((verseNumber: number) => {
    setSelectedVerses((current) => {
      const next = new Set(current);
      next.has(verseNumber) ? next.delete(verseNumber) : next.add(verseNumber);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedVerses(new Set()), []);

  const toggleBookmark = useCallback((verseNumber: number) => {
    const key = `${translationId}:${bookId}:${chapterNumber}:${verseNumber}`;
    setBookmarks((current) => {
      const next = new Map(current);
      next.has(key) ? next.delete(key) : next.set(key, { bookId, chapter: chapterNumber, verse: verseNumber });
      return next;
    });
  }, [translationId, bookId, chapterNumber]);

  const bookmarkKey = useCallback((verseNumber: number) => `${translationId}:${bookId}:${chapterNumber}:${verseNumber}`, [translationId, bookId, chapterNumber]);

  const bookmarkList = useMemo(() => [...bookmarks.values()].sort((a, b) => {
    if (a.bookId !== b.bookId) return a.bookId - b.bookId;
    if (a.chapter !== b.chapter) return a.chapter - b.chapter;
    return a.verse - b.verse;
  }), [bookmarks]);

  const goTo = useCallback((nextBookId: number, nextChapter: number) => {
    setBookId(nextBookId);
    setChapterNumber(nextChapter);
    setSelectedVerses(new Set());
  }, []);

  const speakChapter = useCallback(() => {
    if (!chapter) return;
    // Reading a whole chapter turns on continuous mode so it rolls into the next one.
    autoAdvanceRef.current = true;
    player.speak(chapter.verses.map((verse, index) => ({
      verse: verse.ref.verse,
      // The reference is announced once, ahead of the first verse.
      text: index === 0 ? `${chapterReference}. ${verse.text}` : verse.text,
    })));
  }, [chapter, chapterReference, player]);

  const speakSelection = useCallback(() => {
    if (!chapter) return;
    // A selection is a one-off; do not roll into the next chapter.
    autoAdvanceRef.current = false;
    const chosen = chapter.verses.filter((verse) => selectedVerses.has(verse.ref.verse));
    player.speak(chosen.map((verse, index) => ({
      verse: verse.ref.verse,
      text: index === 0 ? `${selectedReference}. ${verse.text}` : verse.text,
    })));
  }, [chapter, selectedVerses, selectedReference, player]);

  // Once continuous mode has advanced to the next chapter and its verses have loaded,
  // start reading them. Gated on the loaded chapter matching the advanced position so
  // it never re-reads the chapter that just finished.
  useEffect(() => {
    if (!pendingAutoSpeak || chapterLoading) return;
    const first = chapter?.verses[0]?.ref;
    if (!first || first.bookId !== bookId || first.chapter !== chapterNumber) return;
    setPendingAutoSpeak(false);
    speakChapter();
  }, [pendingAutoSpeak, chapterLoading, chapter, bookId, chapterNumber, speakChapter]);

  // Stopping read-aloud also leaves continuous mode.
  const stopSpeech = useCallback(() => {
    autoAdvanceRef.current = false;
    setPendingAutoSpeak(false);
    player.stop();
  }, [player]);

  const changeSpeechRate = useCallback((delta: number) => {
    setSpeechRate((rate) => clampRate(rate + delta));
  }, []);

  const changeSpeechVolume = useCallback((delta: number) => {
    setSpeechVolume((volume) => clampVolume(volume + delta));
  }, []);

  const copySelection = useCallback(async () => {
    if (!selectedText) return;
    await clipboard.write(`${selectedReference} — ${selectedText}`);
    clearSelection();
  }, [clipboard, selectedText, selectedReference, clearSelection]);

  const translationOptions = useMemo(() => [...translations]
    .sort((a, b) => languages.indexOf(resolveLanguage(a.language)) - languages.indexOf(resolveLanguage(b.language)))
    .map((translation) => ({
      value: translation.id,
      label: `${translation.shortName} · ${translation.name}`,
      group: strings[resolveLanguage(translation.language)].languageName,
    })), [translations]);

  const bookOptions = useMemo(() => books.map((item) => ({ value: String(item.id), label: item.name, hint: String(item.id) })), [books]);

  const chapterOptions = useMemo(
    () => Array.from({ length: book?.chapters ?? 1 }, (_, index) => ({ value: String(index + 1), label: `${label.chapter} ${index + 1}`, hint: String(index + 1) })),
    [book, label],
  );

  const languageOptions = useMemo(() => languages.map((item) => ({ value: item, label: strings[item].languageName })), []);

  return {
    label,
    language,
    languageOptions,
    theme,
    setTheme,
    toggleTheme: useCallback(() => setTheme((current) => (current === 'dark' ? 'light' : 'dark')), []),
    translations,
    translationId,
    translationOptions,
    changeTranslation,
    changeLanguage,
    books,
    book,
    bookName,
    bookOptions,
    bookId,
    changeBook,
    chapterNumber,
    chapterOptions,
    changeChapter,
    moveChapter,
    chapter,
    chapterLoading,
    chapterReference,
    fontId,
    setFontId,
    font,
    fontSize,
    setFontSize: useCallback((size: number) => setFontSizeValue(clampFontSize(size)), []),
    selectedVerses,
    selectedVerseNumbers,
    selectedText,
    selectedReference,
    toggleVerse,
    clearSelection,
    bookmarks,
    bookmarkKey,
    bookmarkList,
    toggleBookmark,
    goTo,
    query,
    setQuery,
    searchMode,
    setSearchMode,
    searchBookId,
    setSearchBookId,
    searchTestament,
    setSearchTestament,
    selectedTopic,
    setSelectedTopic,
    searchLoading,
    searchResults,
    topics: BIBLE_TOPICS,
    speechState: player.state,
    speakingVerse: player.speakingVerse,
    speechError: player.error,
    speechVoice,
    setSpeechVoice,
    voiceOptions,
    speechRate,
    speechRateRange,
    changeSpeechRate,
    speechVolume,
    speechVolumeRange,
    changeSpeechVolume,
    speakChapter,
    speakSelection,
    pauseSpeech: player.pause,
    resumeSpeech: player.resume,
    stopSpeech,
    copySelection,
  };
}

export type WordApp = ReturnType<typeof useWordApp>;
