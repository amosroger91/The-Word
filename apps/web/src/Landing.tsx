import { useCallback, useMemo, useState } from 'react';
import { localBible } from '@the-word/bible';
import {
  DAILY_VERSE_API,
  backgroundForSeed,
  overlayFor,
  useDailyVerse,
  useLocalVerse,
  verseImageFilename,
  verseImageFontRange,
  type Language,
  type WordApp,
} from '@the-word/core';
import { BookBibleIcon } from './icons';
import { SearchableSelect } from './SearchableSelect';
import { downloadVerseImage } from './verseImageExport';

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
  const [exporting, setExporting] = useState(false);

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
  const searching = Boolean(app.query.trim() || app.selectedTopic);
  const activeTopic = app.topics.find((topic) => topic.id === app.selectedTopic);

  const enter = useCallback((speak: 'from' | 'chapter' | 'none') => {
    if (!parsed) return;
    if (speak !== 'none') app.unlockSpeech();
    if (speak === 'from') app.speakFromVerse(parsed.bookId, parsed.chapter, parsed.verse);
    else if (speak === 'chapter') app.speakChapterAt(parsed.bookId, parsed.chapter, parsed.verse);
    else app.goToVerse(parsed.bookId, parsed.chapter, parsed.verse);
    onEnterReader();
  }, [app, onEnterReader, parsed]);

  // The day's verse exports straight to a PNG of the card on screen — same
  // background, same overlay — instead of opening the image editor.
  const saveImage = useCallback(async () => {
    if (!displayText || exporting) return;
    setExporting(true);
    try {
      await downloadVerseImage(
        {
          reference: displayReference,
          text: displayText,
          translation: translationName || 'KJV',
          background: '#111111',
          textColor: '#ffffff',
          accent: '#947849',
          fontStack: app.font.stack,
          fontSize: verseImageFontRange.defaultSize,
          overlayOpacity: artOverlay,
        },
        artUrl,
        verseImageFilename(bookName || 'verse', parsed?.chapter ?? 1),
      );
    } finally {
      setExporting(false);
    }
  }, [app.font.stack, artOverlay, artUrl, bookName, displayReference, displayText, exporting, parsed, translationName]);

  return (
    <div className="landing">
      <header className="landing-bar">
        <div className="landing-logo">
          <span className="landing-mark" role="img" aria-hidden="true"><BookBibleIcon /></span>
          <span className="landing-wordmark">The Word</span>
        </div>
        <div className="landing-bar-actions">
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
        </div>
      </header>

      <main className="landing-main">
        <section className="landing-hero" aria-live="polite">
          {daily.status === 'loading' && (
            <div className="verse-card verse-card-fallback"><p className="muted">{label.loadingVerse}</p></div>
          )}
          {daily.status === 'error' && (
            <div className="verse-card verse-card-fallback">
              <p className="muted">{label.dailyVerseUnavailable}</p>
              <button className="landing-secondary" onClick={daily.reload}>{label.tryAgain}</button>
            </div>
          )}
          {daily.status === 'ready' && daily.verse && (
            <article className="verse-card">
              <div className="verse-art" style={{ backgroundImage: `url(${artUrl})` }}>
                {artOverlay > 0 ? <div className="verse-art-overlay" style={{ opacity: artOverlay }} /> : null}
                <div className="verse-art-scrim" />
                <div className="verse-copy">
                  <span className="verse-eyebrow">{label.verseOfTheDayFor(daily.verse.date)}</span>
                  <blockquote>{displayText}</blockquote>
                  <cite>
                    {displayReference}
                    {translationName ? <span className="verse-translation">{translationName}</span> : null}
                  </cite>
                </div>
              </div>

              {parsed && (
                <div className="verse-tools">
                  <div className="verse-tools-primary">
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
                  </div>
                  <div className="verse-tools-secondary">
                    <button onClick={() => enter('none')}>{label.openThisVerse}</button>
                    <button disabled={!displayText} onClick={() => { void app.copyPassage(spokenReference, displayText); }}>{label.copy}</button>
                    <button disabled={!displayText || exporting} onClick={() => { void saveImage(); }}>{exporting ? label.exporting : label.image}</button>
                    <button className={bookmarked ? 'active' : ''} onClick={() => app.toggleBookmarkAt(parsed.bookId, parsed.chapter, parsed.verse)}>{label.bookmark}</button>
                  </div>
                </div>
              )}

              <p className="landing-credit">
                <a href={daily.verse.url} target="_blank" rel="noreferrer">{label.dailyVerseCredit}</a>
              </p>
            </article>
          )}
        </section>

        <aside className="landing-rail">
          <div className="landing-cta">
            <button className="landing-read" onClick={onEnterReader}>
              {app.hasProgress ? label.continueReading : label.readTheBible}
            </button>
            {app.hasProgress && <p className="landing-resume">{app.bookName} {app.chapterNumber}</p>}
            {onGroupStudy && (
              <button className="landing-group" onClick={onGroupStudy}>{label.readParty}</button>
            )}
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
            {!searching && (
              <div className="landing-topics">
                <span className="section-label">{label.browseByTopic}</span>
                <div className="landing-topic-list">
                  {app.topics.map((topic) => (
                    <button
                      className="landing-topic"
                      key={topic.id}
                      title={topic.description}
                      onClick={() => { app.setSelectedTopic(topic.id); app.setQuery(''); }}
                    >{topic.name}</button>
                  ))}
                </div>
              </div>
            )}
            {searching && (
              <div className="landing-results">
                {activeTopic && (
                  <div className="topic-chip">
                    <strong>{activeTopic.name}</strong>
                    <button type="button" onClick={() => app.setSelectedTopic('')} aria-label={label.clearTopic}>×</button>
                  </div>
                )}
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

          <p className="landing-tagline">{label.footerFree}</p>
        </aside>
      </main>
    </div>
  );
}
