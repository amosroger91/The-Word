import { useCallback, useMemo, useState } from 'react';
import { localBible, parseReference } from '@the-word/bible';
import {
  DAILY_VERSE_API,
  formatVerseDate,
  overlayFor,
  randomBackground,
  useDailyVerse,
  useLocalVerse,
  verseImageFilename,
  verseImageFontRange,
  type WordApp,
} from '@the-word/core';
import { BookBibleIcon } from './icons';
import { useSavedDailyVerse } from './savedDailyVerse';
import { downloadVerseImage } from './verseImageExport';

// Shown only when the feed fails and nothing was ever saved. The text comes
// from the bundled translation, so the card still works with no network.
const OFFLINE_REF = parseReference('John 3:16');

export function Landing({
  app,
  onEnterReader,
  onGroupStudy,
  onBookmarks,
  onPreferences,
  partyMembers,
}: {
  app: WordApp;
  onEnterReader: () => void;
  onGroupStudy?: () => void;
  onBookmarks?: () => void;
  onPreferences?: () => void;
  // Live Group Study roster, so the landing shows who is connected.
  partyMembers?: number;
}) {
  const { label, language } = app;
  const urls = useMemo(() => {
    const snapshot = `${import.meta.env.BASE_URL}daily.json`;
    return import.meta.env.DEV
      ? ['/daily-api', DAILY_VERSE_API, snapshot]
      : [snapshot, DAILY_VERSE_API];
  }, []);
  const daily = useDailyVerse(urls);
  const saved = useSavedDailyVerse(daily.verse);

  const failed = daily.status === 'error';
  const verse = daily.verse ?? (failed ? saved : null);
  const parsed = verse?.parsed ?? (failed && !verse ? OFFLINE_REF : null);
  const local = useLocalVerse(app.translationId, parsed);
  const [exporting, setExporting] = useState(false);

  const bookName = parsed ? (localBible.getBook(parsed.bookId, app.translationId)?.name ?? verse?.ref ?? '') : '';
  const translationName = app.translations.find((item) => item.id === app.translationId)?.shortName ?? '';
  const displayText = local.text ?? verse?.text ?? '';
  const displayReference = parsed
    ? `${bookName} ${parsed.chapter}:${parsed.verse}`
    : verse?.ref ?? '';
  const spokenReference = parsed ? label.verseReference(bookName, parsed.chapter, [parsed.verse]) : displayReference;
  const canRead = Boolean(parsed && local.ready && local.text);
  const bookmarked = parsed ? app.isBookmarked(parsed.bookId, parsed.chapter, parsed.verse) : false;
  // A fresh photograph each visit, held steady for the session so the card
  // and the image it exports always agree.
  const [art] = useState(randomBackground);
  const artUrl = `${import.meta.env.BASE_URL}backgrounds/${art.file}`;
  const artOverlay = overlayFor(art.kind);
  const searching = Boolean(app.query.trim() || app.selectedTopic);
  const activeTopic = app.topics.find((topic) => topic.id === app.selectedTopic);

  const heading = verse?.date
    ? label.verseOfTheDayFor(formatVerseDate(verse.date, language))
    : label.verseOfTheDay;
  const status = daily.status === 'loading'
    ? label.loadingVerse
    : failed
      ? label.dailyVerseUnavailable
      : `${heading}. ${displayReference}`;

  const enter = useCallback((speak: 'from' | 'chapter' | 'none') => {
    if (!parsed) return;
    if (speak !== 'none') app.unlockSpeech();
    if (speak === 'from') app.speakFromVerse(parsed.bookId, parsed.chapter, parsed.verse);
    // No focus verse: the chapter is read from verse 1, so the page should sit
    // at the top rather than jumping to the day's verse and back.
    else if (speak === 'chapter') app.speakChapterAt(parsed.bookId, parsed.chapter);
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
          <h1 className="landing-wordmark">The Word</h1>
        </div>
        <div className="landing-bar-actions">
          <input
            className="landing-bar-search"
            type="search"
            placeholder={label.searchPlaceholder}
            value={app.query}
            onChange={(event) => {
              app.setQuery(event.target.value);
              if (event.target.value.trim()) app.setSelectedTopic('');
            }}
            aria-label={label.search}
          />
          {onPreferences && (
            <button className="icon-button" onClick={onPreferences} aria-label={label.preferences} title={label.preferences}>⚙</button>
          )}
          <button className="icon-button" onClick={app.toggleTheme} aria-label={label.toggleTheme} title={label.toggleTheme}>◐</button>
        </div>
      </header>

      <main className="landing-main">
        {/* Only the outcome is announced — the card itself is ordinary content,
            so the action buttons do not re-announce it as they change. */}
        <p className="visually-hidden" role="status">{status}</p>

        <section className="landing-hero">
          <article className="verse-card">
            <div className="verse-art" style={{ backgroundImage: `url(${artUrl})` }}>
              {artOverlay > 0 ? <div className="verse-art-overlay" style={{ opacity: artOverlay }} /> : null}
              <div className="verse-art-scrim" />
              <div className="verse-copy">
                <h2 className="verse-eyebrow">{heading}</h2>
                {displayText
                  ? <blockquote>{displayText}</blockquote>
                  : <p className="verse-waiting">{failed ? label.dailyVerseUnavailable : label.loadingVerse}</p>}
                {displayText && displayReference && (
                  <div className="verse-foot">
                    <cite>
                      {displayReference}
                      {translationName ? <span className="verse-translation">{translationName}</span> : null}
                    </cite>
                    {/* Preview only — the exported PNG carries its own footer. */}
                    {verse?.url && (
                      <a className="verse-credit" href={verse.url} target="_blank" rel="noreferrer">{label.dailyVerseCredit}</a>
                    )}
                  </div>
                )}
              </div>
            </div>

            {failed && (
              <p className="verse-notice">
                {displayText ? <span>{label.dailyVerseUnavailable}</span> : null}
                <button type="button" onClick={daily.reload}>{label.tryAgain}</button>
              </p>
            )}

            {parsed && displayText && (
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
          </article>
        </section>

        <aside className="landing-rail">
          <div className="landing-cta">
            <button className="landing-read" onClick={onEnterReader}>
              {app.hasProgress ? label.continueAt(`${app.bookName} ${app.chapterNumber}`) : label.readTheBible}
            </button>
            {onGroupStudy && (
              <button className="landing-group" onClick={onGroupStudy}>
                {label.readParty}
                {partyMembers ? <span className="landing-count">{partyMembers}</span> : null}
              </button>
            )}
            {onBookmarks && (
              <button className="landing-group" onClick={onBookmarks}>
                {label.bookmarks}
                {app.bookmarkList.length ? <span className="landing-count">{app.bookmarkList.length}</span> : null}
              </button>
            )}
          </div>

          <div className="landing-search">
            {!searching && (
              <div className="landing-topics">
                <h2 className="section-label">{label.browseByTopic}</h2>
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
