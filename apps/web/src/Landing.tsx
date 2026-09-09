import { useCallback, useMemo, useState, type ReactNode } from 'react';
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
import { ReaderIcon } from './ReaderIcon';
import { useSavedDailyVerse } from './savedDailyVerse';
import { downloadVerseImage } from './verseImageExport';

// Shown only when the feed fails and nothing was ever saved. The text comes
// from the bundled translation, so the card still works with no network.
const welcomeCopy = {
  en: { title: 'A moment in the Word.', intro: 'Slow down. Open Scripture. Find space for what matters.', reading: 'YOUR QUIET PLACE', resume: 'Pick up where you left off, or begin a new chapter.', together: 'Read, reflect, and grow together.', explore: 'Scripture for every season', exploreHint: 'A place to begin, wherever you are today.' },
  es: { title: 'Un momento en la Palabra.', intro: 'Haz una pausa. Abre las Escrituras. Da espacio a lo que importa.', reading: 'TU ESPACIO DE PAZ', resume: 'Continúa donde lo dejaste o comienza un nuevo capítulo.', together: 'Lean, reflexionen y crezcan juntos.', explore: 'Escrituras para cada etapa', exploreHint: 'Un lugar para comenzar, estés donde estés hoy.' },
  fr: { title: 'Un moment dans la Parole.', intro: 'Ralentissez. Ouvrez les Écritures. Faites place à l’essentiel.', reading: 'VOTRE ESPACE DE PAIX', resume: 'Reprenez votre lecture ou commencez un nouveau chapitre.', together: 'Lire, réfléchir et grandir ensemble.', explore: 'Les Écritures en toute saison', exploreHint: 'Un point de départ, où que vous soyez aujourd’hui.' },
  zh: { title: '与圣言共度片刻。', intro: '放慢脚步，打开圣经，为重要的事留出空间。', reading: '你的宁静时光', resume: '继续上次的阅读，或开始新的篇章。', together: '一起阅读、思考与成长。', explore: '人生每个阶段的经文', exploreHint: '无论今天身在何处，都能从这里开始。' },
  vi: { title: 'Một khoảnh khắc trong Lời.', intro: 'Chậm lại. Mở Kinh Thánh. Dành chỗ cho điều quan trọng.', reading: 'KHÔNG GIAN BÌNH YÊN', resume: 'Tiếp tục nơi bạn đã dừng hoặc bắt đầu một đoạn mới.', together: 'Cùng đọc, suy ngẫm và trưởng thành.', explore: 'Kinh Thánh cho mọi mùa', exploreHint: 'Một nơi để bắt đầu, dù hôm nay bạn đang ở đâu.' },
};
const OFFLINE_REF = parseReference('John 3:16');

export function Landing({
  app,
  onEnterReader,
  onGroupStudy,
  onBookmarks,
  onPreferences,
  onProgress,
  progress,
  partyMembers,
  banner,
}: {
  banner?: ReactNode;
  app: WordApp;
  onEnterReader: () => void;
  onGroupStudy?: () => void;
  onBookmarks?: () => void;
  onPreferences?: () => void;
  onProgress?: () => void;
  progress?: { chapters: number; streak: number };
  // Live Group Study roster, so the landing shows who is connected.
  partyMembers?: number;
}) {
  const { label, language } = app;
  const copy = welcomeCopy[language];
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
          <div className="landing-wordmark">The Word<span>{label.footerFree}</span></div>
        </div>
        <div className="landing-bar-actions">
          <button className="landing-nav-read" onClick={onEnterReader}><ReaderIcon name="book" />{label.readTheBible}</button>
          <div className="landing-search-field"><ReaderIcon name="search" />
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
          </div>
          {onPreferences && (
            <button className="icon-button" onClick={onPreferences} aria-label={label.preferences} title={label.preferences}><ReaderIcon name="settings" /></button>
          )}
          <button className="icon-button" onClick={app.toggleTheme} aria-label={label.toggleTheme} title={label.toggleTheme}><ReaderIcon name={app.theme === 'dark' ? 'sun' : 'moon'} /></button>
        </div>
      </header>
      {banner}

      <main className="landing-main">
        <div className="landing-welcome"><div><h1>{copy.title}</h1><p>{copy.intro}</p></div><span className="welcome-flourish" aria-hidden="true">✦</span></div>
        {/* Only the outcome is announced — the card itself is ordinary content,
            so the action buttons do not re-announce it as they change. */}
        <p className="visually-hidden" role="status">{status}</p>

        <section className="landing-hero">
          <article className="verse-card">
            <div className="verse-art" style={{ backgroundImage: `url(${artUrl})` }}>
              {artOverlay > 0 ? <div className="verse-art-overlay" style={{ opacity: artOverlay }} /> : null}
              <div className="verse-art-scrim" />
              <div className="verse-copy">
                <h2 className="verse-eyebrow"><span className="daily-dot" />{heading}</h2>
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
                      <button className="primary" disabled={!canRead} onClick={() => enter('from')}><ReaderIcon name="headphones" />{label.readFromHere}</button>
                      <button className="primary" disabled={!canRead} onClick={() => enter('chapter')}><ReaderIcon name="book" />{label.readTheChapter}</button>
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
                  <button aria-pressed={bookmarked} className={bookmarked ? 'active' : ''} onClick={() => app.toggleBookmarkAt(parsed.bookId, parsed.chapter, parsed.verse)}>{label.bookmark}</button>
                </div>
              </div>
            )}
          </article>
        </section>

        <aside className="landing-rail">
          <div className="landing-cta">
            <section className="continue-card">
              <div className="continue-eyebrow">{copy.reading}</div>
              <div className="continue-art" aria-hidden="true"><ReaderIcon name="book" /><span>✦</span></div>
              <h2>{app.hasProgress ? `${app.bookName} ${app.chapterNumber}` : label.readTheBible}</h2>
              <p>{copy.resume}</p>
            <button className="landing-read" onClick={onEnterReader}>
              {app.hasProgress ? label.continueAt(`${app.bookName} ${app.chapterNumber}`) : label.readTheBible}<span aria-hidden="true">→</span>
            </button>
            </section>
            {onGroupStudy && (
              <button className="landing-group" onClick={onGroupStudy}>
                <span className="action-icon"><ReaderIcon name="people" /></span><span className="action-copy"><strong>{label.readParty}</strong><small>{copy.together}</small></span><span aria-hidden="true">↗</span>
                {partyMembers ? <span className="landing-count">{partyMembers}</span> : null}
              </button>
            )}
            {onBookmarks && (
              <button className="landing-group" onClick={onBookmarks}>
                <span className="action-icon"><ReaderIcon name="bookmark" /></span><span className="action-copy"><strong>{label.bookmarks}</strong><small>{label.footerLocal}</small></span><span aria-hidden="true">↗</span>
                {app.bookmarkList.length ? <span className="landing-count">{app.bookmarkList.length}</span> : null}
              </button>
            )}
            {onProgress && (
              <button className="landing-group" onClick={onProgress}>
                <span className="action-icon"><ReaderIcon name="award" /></span>
                <span className="action-copy">
                  <strong>{label.progress}</strong>
                  <small>{progress?.chapters ? label.chaptersReadCount(progress.chapters) : label.noBadgesYet}</small>
                </span>
                {progress?.streak ? <span className="landing-count">{progress.streak}</span> : null}
                <span aria-hidden="true">↗</span>
              </button>
            )}
          </div>

          <p className="landing-tagline">{label.footerFree}</p>
        </aside>
          <div className={searching ? 'landing-search is-searching' : 'landing-search'}>
            {!searching && (
              <div className="landing-topics">
                <div className="explore-heading"><div><span className="section-label">{label.browseByTopic}</span><h2>{copy.explore}</h2></div><p>{copy.exploreHint}</p></div>
                <div className="landing-topic-list">
                  {app.topics.map((topic) => (
                    <button
                      className="landing-topic"
                      key={topic.id}
                      title={topic.description}
                      onClick={() => { app.setSelectedTopic(topic.id); app.setQuery(''); }}
                    ><span className="topic-number" aria-hidden="true">{String(app.topics.indexOf(topic) + 1).padStart(2, '0')}</span><strong>{topic.name}</strong><small>{topic.description}</small><span className="topic-arrow" aria-hidden="true">↗</span></button>
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

      </main>
      <footer className="landing-bottom"><span>The Word</span><span>{label.footerFree}</span><span>{label.footerLocal}</span></footer>
    </div>
  );
}
