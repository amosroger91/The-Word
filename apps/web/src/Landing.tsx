import { useCallback, useMemo, useState } from 'react';
import { localBible } from '@the-word/bible';
import {
  DAILY_VERSE_API,
  backgroundForSeed,
  overlayFor,
  useDailyVerse,
  useLocalVerse,
  verseImageFilename,
  type Language,
  type WordApp,
} from '@the-word/core';
import { BookBibleIcon } from './icons';
import { SearchableSelect } from './SearchableSelect';
import { VerseImageEditor, type VerseImageJob } from './VerseImageEditor';

export function Landing({
  app,
  onEnterReader,
  onGroupStudy,
}: {
  app: WordApp;
  onEnterReader: () => void;
  onGroupStudy?: () => void;
}) {
  const { label, language } = app;
  const urls = useMemo(() => {
    const snapshot = `${import.meta.env.BASE_URL}daily.json`;
    return import.meta.env.DEV
      ? ['/daily-api', DAILY_VERSE_API, snapshot]
      : [snapshot, DAILY_VERSE_API];
  }, []);
  const daily = useDailyVerse(urls);
  const parsed = daily.verse?.parsed ?? null;
  const local = useLocalVerse(app.translationId, parsed);
  const [imageJob, setImageJob] = useState<VerseImageJob | null>(null);

  const bookName = parsed ? (localBible.getBook(parsed.bookId, app.translationId)?.name ?? daily.verse?.ref ?? '') : '';
  const translationName = app.translations.find((item) => item.id === app.translationId)?.shortName ?? '';
  const displayText = local.text ?? daily.verse?.text ?? '';
  const displayReference = parsed
    ? `${bookName} ${parsed.chapter}:${parsed.verse}`
    : daily.verse?.ref ?? '';
  const spokenReference = parsed ? label.verseReference(bookName, parsed.chapter, [parsed.verse]) : displayReference;
  const canRead = Boolean(parsed && local.ready && local.text);
  const bookmarked = parsed ? app.isBookmarked(parsed.bookId, parsed.chapter, parsed.verse) : false;
  const art = backgroundForSeed(daily.verse?.date || daily.verse?.ref || 'verse');
  const artUrl = `${import.meta.env.BASE_URL}backgrounds/${art.file}`;
  const artOverlay = overlayFor(art.kind);

  const enter = useCallback((speak: 'from' | 'chapter' | 'none') => {
    if (!parsed) return;
    if (speak !== 'none') app.unlockSpeech();
    if (speak === 'from') app.speakFromVerse(parsed.bookId, parsed.chapter, parsed.verse);
    else if (speak === 'chapter') app.speakChapterAt(parsed.bookId, parsed.chapter, parsed.verse);
    else app.goToVerse(parsed.bookId, parsed.chapter, parsed.verse);
    onEnterReader();
  }, [app, onEnterReader, parsed]);

  return (
    <div className="landing">
      <header className="landing-bar">
        <SearchableSelect
          compact
          className="language-select"
          value={language}
          onChange={(value) => app.changeLanguage(value as Language)}
          label={label.interfaceLanguage}
          filterPlaceholder={label.filterPlaceholder}
          options={app.languageOptions}
        />
        <button className="icon-button" onClick={app.toggleTheme} aria-label={label.toggleTheme} title={label.toggleTheme}>◐</button>
      </header>
      <main className="landing-main">
        <div className="landing-brand">
          <span className="landing-mark" role="img" aria-hidden="true"><BookBibleIcon /></span>
          <h1>The Word</h1>
          <p className="landing-tagline">{label.footerFree}</p>
        </div>
        <div className="landing-search">
          <input
            type="search"
            placeholder={label.searchPlaceholder}
            value={app.query}
            onChange={(event) => {
              app.setQuery(event.target.value);
              if (event.target.value.trim()) app.setSelectedTopic('');
            }}
            aria-label={label.search}
          />
          {(app.query.trim() || app.selectedTopic) && (
            <div className="landing-results">
              <div className="result-count">{app.searchLoading ? label.searching : label.results(app.searchResults.length)}</div>
              {app.searchResults.length ? app.searchResults.slice(0, 12).map((result) => (
                <button
                  className="result"
                  key={`${result.translationId}:${result.verse.ref.bookId}:${result.verse.ref.chapter}:${result.verse.ref.verse}`}
                  onClick={() => {
                    app.goToVerse(result.verse.ref.bookId, result.verse.ref.chapter, result.verse.ref.verse);
                    app.setQuery('');
                    onEnterReader();
                  }}
                >
                  <strong>{localBible.getBook(result.verse.ref.bookId, app.translationId)?.name} {result.verse.ref.chapter}:{result.verse.ref.verse}</strong>
                  <span>{result.verse.text}</span>
                </button>
              )) : !app.searchLoading && <p className="muted">{label.noMatches}</p>}
            </div>
          )}
        </div>
        <div className="landing-cta">
          <button className="landing-read" onClick={onEnterReader}>
            {app.hasProgress ? label.continueReading : label.readTheBible}
          </button>
          {app.hasProgress && <p className="landing-resume">{app.bookName} {app.chapterNumber}</p>}
          {onGroupStudy && (
            <button className="landing-group" onClick={onGroupStudy}>{label.readParty}</button>
          )}
        </div>
        <section className="landing-verse" aria-live="polite">
          {daily.status === 'loading' && <p className="muted">{label.loadingVerse}</p>}
          {daily.status === 'error' && (
            <>
              <p className="muted">{label.dailyVerseUnavailable}</p>
              <button className="landing-secondary" onClick={daily.reload}>{label.tryAgain}</button>
            </>
          )}
          {daily.status === 'ready' && daily.verse && (
            <>
              <div className="landing-verse-art" style={{ backgroundImage: `url(${artUrl})` }}>
                {artOverlay > 0 ? <div className="landing-verse-overlay" style={{ opacity: artOverlay }} /> : null}
                <div className="landing-verse-copy">
                  <span className="section-label">{label.verseOfTheDayFor(daily.verse.date)}</span>
                  <blockquote>{displayText}</blockquote>
                  <cite>{displayReference}{translationName ? ` · ${translationName}` : ''}</cite>
                </div>
              </div>
              {parsed && (
                <div className="landing-actions">
                  {app.speechState === 'idle' ? (
                    <>
                      <button className="primary" disabled={!canRead} onClick={() => enter('from')}>{label.readFromHere}</button>
                      <button className="primary" disabled={!canRead} onClick={() => enter('chapter')}>{label.readTheChapter}</button>
                    </>
                  ) : (
                    <>
                      {app.speechState === 'speaking' && <button className="primary" onClick={app.pauseSpeech}>{label.pause}</button>}
                      {app.speechState === 'paused' && <button className="primary" onClick={app.resumeSpeech}>{label.resume}</button>}
                      <button onClick={app.stopSpeech}>{label.stop}</button>
                    </>
                  )}
                  <button onClick={() => enter('none')}>{label.openThisVerse}</button>
                  <button disabled={!displayText} onClick={() => { void app.copyPassage(spokenReference, displayText); }}>{label.copy}</button>
                  <button
                    disabled={!displayText}
                    onClick={() => setImageJob({
                      reference: displayReference,
                      text: displayText,
                      translation: translationName || 'KJV',
                      filename: verseImageFilename(bookName || 'verse', parsed.chapter),
                      seed: daily.verse?.date || displayReference,
                    })}
                  >{label.image}</button>
                  <button className={bookmarked ? 'active' : ''} onClick={() => app.toggleBookmarkAt(parsed.bookId, parsed.chapter, parsed.verse)}>{label.bookmark}</button>
                </div>
              )}
              <p className="landing-credit">
                <a href={daily.verse.url} target="_blank" rel="noreferrer">{label.dailyVerseCredit}</a>
              </p>
            </>
          )}
        </section>
      </main>
      {imageJob && (
        <VerseImageEditor job={imageJob} fontStack={app.font.stack} label={label} onClose={() => setImageJob(null)} />
      )}
    </div>
  );
}
