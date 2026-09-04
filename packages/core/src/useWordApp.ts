import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BIBLE_TOPICS, chapterCrossRefs, loadBookCrossRefs, localBible, type BookCrossRefFile } from '@the-word/bible';
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
  const [focusedVerse, setFocusedVerse] = useState<number | null>(null);
  const [chapter, setChapter] = useState<Awaited<ReturnType<typeof localBible.getChapter>>>(null);
  const [chapterLoading, setChapterLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [searchMode, setSearchMode] = useState<'all' | 'exact'>('all');
  const [searchBookId, setSearchBookId] = useState('all');
  const [searchTestament, setSearchTestament] = useState<'all' | 'old' | 'new'>('all');
  const [selectedTopic, setSelectedTopic] = useState('');
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [bookCrossRefs, setBookCrossRefs] = useState<BookCrossRefFile | null>(null);
  const [hasProgress, setHasProgress] = useState(() => {
    if (storage.get(storageKeys.progress) === '1') return true;
    const storedBook = readNumber(storage.get(storageKeys.book), defaults.bookId);
    const storedChapter = readNumber(storage.get(storageKeys.chapter), defaults.chapter);
    return storedBook !== defaults.bookId || storedChapter !== defaults.chapter;
  });

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
  const [pendingSpeak, setPendingSpeak] = useState<{ kind: 'chapter' | 'from'; bookId: number; chapter: number; verse: number } | null>(null);

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
  useEffect(() => { if (hasProgress) storage.set(storageKeys.progress, '1'); }, [hasProgress]);

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
    void loadBookCrossRefs(bookId).then((loaded) => {
      if (active) setBookCrossRefs(loaded);
    });
    return () => { active = false; };
  }, [bookId]);

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
  const crossRefs = useMemo(() => chapterCrossRefs(bookCrossRefs, chapterNumber), [bookCrossRefs, chapterNumber]);
  const selectedText = chapter?.verses.filter((verse) => selectedVerses.has(verse.ref.verse)).map((verse) => verse.text).join(' ') ?? '';
  const selectedReference = selectedVerses.size ? label.verseReference(bookName, chapterNumber, selectedVerseNumbers) : '';
  const chapterReference = label.chapterReference(bookName, chapterNumber);

  const changeTranslation = useCallback((nextId: string) => {
    setTranslationId(nextId);
    const next = localBible.getTranslations().find((item) => item.id === nextId);
    if (next) setLanguage(resolveLanguage(next.language));
    setSelectedVerses(new Set());
    setFocusedVerse(null);
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
    setFocusedVerse(null);
  }, []);

  const changeChapter = useCallback((next: number) => {
    setChapterNumber(next);
    setSelectedVerses(new Set());
    setFocusedVerse(null);
  }, []);

  const moveChapter = useCallback((direction: -1 | 1) => {
    const next = chapterNumber + direction;
    if (next < 1 || !book || next > book.chapters) return;
    changeChapter(next);
  }, [book, chapterNumber, changeChapter]);

  const toggleVerse = useCallback((verseNumber: number) => {
    setFocusedVerse(null);
    setSelectedVerses((current) => {
      const next = new Set(current);
      next.has(verseNumber) ? next.delete(verseNumber) : next.add(verseNumber);
      return next;
    });
  }, []);

  const clearSelection = useCallback(() => setSelectedVerses(new Set()), []);

  const toggleBookmarkAt = useCallback((targetBook: number, targetChapter: number, verseNumber: number) => {
    const key = `${translationId}:${targetBook}:${targetChapter}:${verseNumber}`;
    setBookmarks((current) => {
      const next = new Map(current);
      next.has(key) ? next.delete(key) : next.set(key, { bookId: targetBook, chapter: targetChapter, verse: verseNumber });
      return next;
    });
  }, [translationId]);

  const toggleBookmark = useCallback((verseNumber: number) => {
    toggleBookmarkAt(bookId, chapterNumber, verseNumber);
  }, [toggleBookmarkAt, bookId, chapterNumber]);

  const isBookmarked = useCallback((targetBook: number, targetChapter: number, verseNumber: number) => (
    bookmarks.has(`${translationId}:${targetBook}:${targetChapter}:${verseNumber}`)
  ), [bookmarks, translationId]);

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
    setFocusedVerse(null);
  }, []);

  const goToVerse = useCallback((nextBookId: number, nextChapter: number, verse: number) => {
    setBookId(nextBookId);
    setChapterNumber(nextChapter);
    setSelectedVerses(new Set());
    setFocusedVerse(verse);
  }, []);

  const chapterIs = useCallback((targetBook: number, targetChapter: number) => (
    Boolean(chapter && !chapterLoading && chapter.verses[0]?.ref.bookId === targetBook && chapter.verses[0]?.ref.chapter === targetChapter)
  ), [chapter, chapterLoading]);

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

  const speakChapterAt = useCallback((targetBook: number, targetChapter: number, focusVerse?: number) => {
    autoAdvanceRef.current = true;
    setBookId(targetBook);
    setChapterNumber(targetChapter);
    setSelectedVerses(new Set());
    setFocusedVerse(focusVerse ?? null);
    if (chapterIs(targetBook, targetChapter) && chapter) {
      player.speak(chapter.verses.map((verse, index) => ({
        verse: verse.ref.verse,
        text: index === 0 ? `${label.chapterReference(bookName, targetChapter)}. ${verse.text}` : verse.text,
      })));
      return;
    }
    setPendingSpeak({ kind: 'chapter', bookId: targetBook, chapter: targetChapter, verse: focusVerse ?? 1 });
  }, [chapterIs, chapter, player, label, bookName]);

  // Continuous read-aloud from this verse to the end of the chapter, then onward.
  const speakFromVerse = useCallback((targetBook: number, targetChapter: number, verseNumber: number) => {
    autoAdvanceRef.current = true;
    setBookId(targetBook);
    setChapterNumber(targetChapter);
    setSelectedVerses(new Set());
    setFocusedVerse(verseNumber);
    if (chapterIs(targetBook, targetChapter) && chapter) {
      const remaining = chapter.verses.filter((verse) => verse.ref.verse >= verseNumber);
      if (!remaining.length) return;
      const announce = label.verseReference(bookName, targetChapter, [verseNumber]);
      player.speak(remaining.map((verse, index) => ({
        verse: verse.ref.verse,
        text: index === 0 ? `${announce}. ${verse.text}` : verse.text,
      })));
      return;
    }
    setPendingSpeak({ kind: 'from', bookId: targetBook, chapter: targetChapter, verse: verseNumber });
  }, [chapterIs, chapter, player, label, bookName]);

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

  // Speak a single verse (used by Read Party participants to follow the host's
  // current verse). Not continuous — it reads just that verse, no auto-advance.
  const speakVerse = useCallback((verseNumber: number) => {
    if (!chapter) return;
    autoAdvanceRef.current = false;
    const target = chapter.verses.find((verse) => verse.ref.verse === verseNumber);
    if (!target) return;
    player.speak([{ verse: target.ref.verse, text: target.text }]);
  }, [chapter, player]);

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

  useEffect(() => {
    if (!pendingSpeak || chapterLoading || !chapter) return;
    const first = chapter.verses[0]?.ref;
    if (!first || first.bookId !== pendingSpeak.bookId || first.chapter !== pendingSpeak.chapter) return;
    if (bookId !== pendingSpeak.bookId || chapterNumber !== pendingSpeak.chapter) return;
    const job = pendingSpeak;
    setPendingSpeak(null);
    if (job.kind === 'chapter') {
      player.speak(chapter.verses.map((verse, index) => ({
        verse: verse.ref.verse,
        text: index === 0 ? `${chapterReference}. ${verse.text}` : verse.text,
      })));
      return;
    }
    const remaining = chapter.verses.filter((verse) => verse.ref.verse >= job.verse);
    if (!remaining.length) return;
    const announce = label.verseReference(bookName, chapterNumber, [job.verse]);
    player.speak(remaining.map((verse, index) => ({
      verse: verse.ref.verse,
      text: index === 0 ? `${announce}. ${verse.text}` : verse.text,
    })));
  }, [pendingSpeak, chapterLoading, chapter, bookId, chapterNumber, player, chapterReference, label, bookName]);

  // Stopping read-aloud also leaves continuous mode.
  const stopSpeech = useCallback(() => {
    autoAdvanceRef.current = false;
    setPendingAutoSpeak(false);
    setPendingSpeak(null);
    player.stop();
  }, [player]);

  const changeSpeechRate = useCallback((delta: number) => {
    setSpeechRate((rate) => clampRate(rate + delta));
  }, []);

  const changeSpeechVolume = useCallback((delta: number) => {
    setSpeechVolume((volume) => clampVolume(volume + delta));
  }, []);

  const copyPassage = useCallback(async (reference: string, text: string) => {
    if (!text) return;
    await clipboard.write(`${reference} — ${text}`);
  }, [clipboard]);

  const copySelection = useCallback(async () => {
    if (!selectedText) return;
    await copyPassage(selectedReference, selectedText);
    clearSelection();
  }, [copyPassage, selectedText, selectedReference, clearSelection]);

  const unlockSpeech = useCallback(() => { speech.unlock?.(); }, [speech]);

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
    toggleBookmarkAt,
    isBookmarked,
    goTo,
    goToVerse,
    focusedVerse,
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
    crossRefs,
    speechState: player.state,
    speakingVerse: player.speakingVerse,
    speechError: player.error,
    autoplayBlocked: player.autoplayBlocked,
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
    speakChapterAt,
    speakFromVerse,
    speakSelection,
    speakVerse,
    pauseSpeech: player.pause,
    resumeSpeech: player.resume,
    stopSpeech,
    unlockSpeech,
    copySelection,
    copyPassage,
    hasProgress,
    markProgress: useCallback(() => setHasProgress(true), []),
  };
}

export type WordApp = ReturnType<typeof useWordApp>;
