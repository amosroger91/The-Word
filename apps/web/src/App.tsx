import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localBible } from '@the-word/bible';
import { paintVerseImage, readingFonts, useWordApp, verseImageFilename, verseImageSize, verseRuns, type Language } from '@the-word/core';
import { SearchableSelect } from './SearchableSelect';
import { BookBibleIcon, VolumeHighIcon, VolumeLowIcon } from './icons';
import { createWebSpeech, webClipboard, webStorage } from './platform';
import { useReadParty } from './useReadParty';
import './styles.css';

function App() {
  const speech = useMemo(() => createWebSpeech(), []);
  const platform = useMemo(() => ({ storage: webStorage, speech, clipboard: webClipboard }), [speech]);
  const app = useWordApp(platform, window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const {
    label, language, chapter, chapterLoading, book, bookName, chapterNumber, selectedVerses, selectedText, selectedReference,
    speechState, speakingVerse, speechError, speechRate, speechRateRange, speechVolume, speechVolumeRange, voiceOptions, speechVoice, setSpeechVoice,
  } = app;

  const party = useReadParty(app);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyCode, setPartyCode] = useState('');
  const [partyChat, setPartyChat] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const verseRefs = useRef<Record<number, HTMLButtonElement | null>>({});

  useEffect(() => { document.documentElement.dataset.theme = app.theme; }, [app.theme]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => { document.documentElement.style.setProperty('--app-font', app.font.stack); }, [app.font]);

  useEffect(() => {
    if (speakingVerse === null) return;
    verseRefs.current[speakingVerse]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [speakingVerse, app.bookId, chapterNumber]);

  useEffect(() => {
    const element = controlsRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setControlsVisible(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!settingsOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!settingsRef.current?.contains(target) && !target.closest?.('.settings-toggle')) setSettingsOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [settingsOpen]);

  const exportToImage = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !selectedText) return;
    setExporting(true);

    const palette = app.theme === 'dark'
      ? { background: '#191816', text: '#eee9df' }
      : { background: '#f7f4ee', text: '#292720' };
    canvas.width = verseImageSize.width;
    canvas.height = verseImageSize.height;

    const ctx = canvas.getContext('2d');
    if (!ctx) { setExporting(false); return; }

    paintVerseImage(ctx, {
      reference: selectedReference,
      text: selectedText,
      translation: app.translations.find((item) => item.id === app.translationId)?.shortName ?? 'KJV',
      background: palette.background,
      textColor: palette.text,
      accent: '#947849',
      fontStack: app.font.stack,
    });

    const link = document.createElement('a');
    link.download = verseImageFilename(bookName, chapterNumber);
    link.href = canvas.toDataURL('image/png');
    link.click();

    setExporting(false);
    app.clearSelection();
  }, [app, selectedText, selectedReference, bookName, chapterNumber]);

  const readingBarOpen = speechState !== 'idle' && !controlsVisible && selectedVerses.size === 0;

  const speedControl = (
    <div className="speed-control">
      <button onClick={() => app.changeSpeechRate(-speechRateRange.step)} disabled={speechRate <= speechRateRange.min} aria-label={label.decreaseSpeed} title={label.decreaseSpeed}>−</button>
      <span aria-live="polite">{speechRate.toFixed(1)}×</span>
      <button onClick={() => app.changeSpeechRate(speechRateRange.step)} disabled={speechRate >= speechRateRange.max} aria-label={label.increaseSpeed} title={label.increaseSpeed}>+</button>
    </div>
  );

  const volumeControl = (
    <div className="speed-control volume-control" title={label.volume}>
      <button onClick={() => app.changeSpeechVolume(-speechVolumeRange.step)} disabled={speechVolume <= speechVolumeRange.min} aria-label={label.decreaseVolume} title={label.decreaseVolume}><VolumeLowIcon /></button>
      <span aria-live="polite">{Math.round(speechVolume * 100)}%</span>
      <button onClick={() => app.changeSpeechVolume(speechVolumeRange.step)} disabled={speechVolume >= speechVolumeRange.max} aria-label={label.increaseVolume} title={label.increaseVolume}><VolumeHighIcon /></button>
    </div>
  );

  const speechControls = (
    <>
      {speechState === 'idle' && <button onClick={app.speakChapter} disabled={!chapter} aria-label={label.readAloud}>{label.readAloud}</button>}
      {speechState === 'speaking' && <button onClick={app.pauseSpeech} aria-label={label.pause}>{label.pause}</button>}
      {speechState === 'paused' && <button onClick={app.resumeSpeech} aria-label={label.resume}>{label.resume}</button>}
      {speechState !== 'idle' && <button onClick={app.stopSpeech} aria-label={label.stop}>{label.stop}</button>}
    </>
  );

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-identity">
          <span className="brand-mark" role="img" aria-label="The Word"><BookBibleIcon /></span>
          <h1 className="topbar-reference">{bookName} <span>{chapterNumber}</span></h1>
        </div>
        <div className="topbar-controls" ref={controlsRef}>
          <div className="control-row">
            <div className={settingsOpen ? 'control-settings open' : 'control-settings'} ref={settingsRef}>
              <SearchableSelect compact className="font-select" value={app.fontId} onChange={app.setFontId} label={label.font} filterPlaceholder={label.filterPlaceholder} options={readingFonts.map((font) => ({ value: font.id, label: font.name }))} />
              <button className="icon-button" onClick={() => app.setFontSize(app.fontSize - 1)} aria-label={label.decreaseText} title={label.decreaseText}>A−</button>
              <button className="icon-button" onClick={() => app.setFontSize(app.fontSize + 1)} aria-label={label.increaseText} title={label.increaseText}>A+</button>
              <SearchableSelect compact className="language-select" value={language} onChange={(value) => app.changeLanguage(value as Language)} label={label.interfaceLanguage} filterPlaceholder={label.filterPlaceholder} options={app.languageOptions} />
              <SearchableSelect compact className="voice-select" value={speechVoice} onChange={setSpeechVoice} label={label.voice} filterPlaceholder={label.filterPlaceholder} options={voiceOptions.map((voice) => ({ value: voice.id, label: voice.name }))} />
              {speedControl}
              {volumeControl}
            </div>
            {speechControls}
            <button className={`icon-button settings-toggle ${settingsOpen ? 'active' : ''}`} onClick={() => setSettingsOpen((open) => !open)} aria-label={label.settings} title={label.settings} aria-expanded={settingsOpen}>⚙</button>
            <button className="icon-button" onClick={() => setSearchOpen((open) => !open)} aria-label={label.search} title={label.search}>⌕</button>
            <button className={`icon-button ${bookmarksOpen ? 'active' : ''}`} onClick={() => setBookmarksOpen((open) => !open)} aria-label={label.bookmarks} title={label.bookmarks}>◈</button>
            <button className={`icon-button party-toggle ${party.active ? 'active' : ''}`} onClick={() => setPartyOpen((open) => !open)} aria-label="Read Party" title="Read Party">☍{party.active && <span className="party-count">{party.members.length}</span>}</button>
            <button className="icon-button" onClick={app.toggleTheme} aria-label={label.toggleTheme} title={label.toggleTheme}>◐</button>
          </div>
        </div>
      </header>
      <main className="layout">
        <aside className="sidebar">
          <div className="control-group">
            <span className="section-label">{label.translation}</span>
            <SearchableSelect value={app.translationId} onChange={app.changeTranslation} label={label.translation} filterPlaceholder={label.filterPlaceholder} options={app.translationOptions} />
          </div>
          <div className="control-group">
            <span className="section-label">{label.book}</span>
            <SearchableSelect value={String(app.bookId)} onChange={(value) => app.changeBook(Number(value))} label={label.book} filterPlaceholder={label.filterPlaceholder} options={app.bookOptions} />
          </div>
          <div className="control-group">
            <span className="section-label">{label.chapter}</span>
            <SearchableSelect value={String(chapterNumber)} onChange={(value) => app.changeChapter(Number(value))} label={label.chapter} filterPlaceholder={label.filterPlaceholder} options={app.chapterOptions} />
          </div>
          <div className="sidebar-footer"><span>{label.footerFree}</span><span>{label.footerLocal}</span></div>
        </aside>
        <section className="reader-column">
          <div className="chapter-nav">
            <button onClick={() => app.moveChapter(-1)} disabled={chapterNumber === 1}>← {label.previous}</button>
            <span>{bookName} {chapterNumber}</span>
            <button onClick={() => app.moveChapter(1)} disabled={!book || chapterNumber === book.chapters}>{label.next} →</button>
          </div>
          {chapterLoading ? <div className="empty-state"><p>{label.loading}</p></div> : chapter ? (
            <article className="reader" style={{ fontSize: `${app.fontSize}px` }}>
              {chapter.verses.map((verse) => {
                const selected = selectedVerses.has(verse.ref.verse);
                const speaking = speakingVerse === verse.ref.verse;
                return (
                  <button
                    key={verse.ref.verse}
                    ref={(el) => { verseRefs.current[verse.ref.verse] = el; }}
                    className={speaking ? 'verse speaking' : selected ? 'verse selected' : 'verse'}
                    onClick={() => app.toggleVerse(verse.ref.verse)}
                  >
                    <sup>{verse.ref.verse}</sup>
                    <span>{verseRuns(verse.text, verse.redLetters).map((run, index) => (run.red ? <span className="words-of-jesus" key={index}>{run.text}</span> : <span key={index}>{run.text}</span>))}</span>
                    {app.bookmarks.has(app.bookmarkKey(verse.ref.verse)) && <span className="bookmark" aria-label={label.bookmarks}>◆</span>}
                  </button>
                );
              })}
            </article>
          ) : <div className="empty-state"><h2>{label.chapterMissingTitle}</h2><p>{label.chapterMissingBody}</p></div>}
          {selectedVerses.size > 0 && (
            <div className="selection-bar">
              <div><strong>{selectedReference}</strong><span>{selectedText}</span></div>
              <button onClick={() => app.selectedVerseNumbers.forEach(app.toggleBookmark)}>{label.bookmark}</button>
              <button onClick={app.copySelection}>{label.copy}</button>
              <button onClick={app.speakSelection}>{label.readSelection}</button>
              <button onClick={exportToImage} disabled={exporting}>{exporting ? label.exporting : label.image}</button>
              <button onClick={app.clearSelection}>{label.clearSelection}</button>
            </div>
          )}
        </section>
      </main>
      {readingBarOpen && (
        <div className="reading-bar">
          <div className="reading-bar-status">
            <strong>{bookName} {chapterNumber}{speakingVerse === null ? '' : `:${speakingVerse}`}</strong>
            <span>{speechState === 'paused' ? label.paused : label.readingAloud}</span>
          </div>
          {speedControl}
          {volumeControl}
          {speechControls}
        </div>
      )}
      <canvas ref={canvasRef} className="export-canvas" aria-hidden="true" />
      {speechError && <div className="speech-error" role="alert">{/valid JSON|Could not fetch/.test(speechError) ? `${label.noVoice} (${speechVoice})` : speechError}</div>}
      {searchOpen && (
        <div className="search-panel">
          <div className="search-header"><h2>{label.searchTitle} · {app.translations.find((item) => item.id === app.translationId)?.shortName}</h2><button onClick={() => setSearchOpen(false)} aria-label={label.search}>×</button></div>
          <input autoFocus placeholder={label.searchPlaceholder} value={app.query} onChange={(event) => { app.setQuery(event.target.value); app.setSelectedTopic(''); }} />
          <div className="search-options">
            <div className="search-mode">
              <button className={app.searchMode === 'all' ? 'active' : ''} onClick={() => app.setSearchMode('all')}>{label.allWords}</button>
              <button className={app.searchMode === 'exact' ? 'active' : ''} onClick={() => app.setSearchMode('exact')}>{label.exactPhrase}</button>
            </div>
            <select aria-label={label.allTestaments} value={app.searchTestament} onChange={(event) => app.setSearchTestament(event.target.value as 'all' | 'old' | 'new')}>
              <option value="all">{label.allTestaments}</option>
              <option value="old">{label.oldTestament}</option>
              <option value="new">{label.newTestament}</option>
            </select>
            <select aria-label={label.allBooks} value={app.searchBookId} onChange={(event) => app.setSearchBookId(event.target.value)}>
              <option value="all">{label.allBooks}</option>
              {app.books.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </div>
          <div className="topic-section">
            <span className="section-label">{label.browseByTopic}</span>
            <div className="topic-grid">{app.topics.map((topic) => <button className={app.selectedTopic === topic.id ? 'topic active' : 'topic'} key={topic.id} onClick={() => { app.setSelectedTopic(topic.id); app.setQuery(''); }}><strong>{topic.name}</strong><small>{topic.description}</small></button>)}</div>
          </div>
          {(app.query || app.selectedTopic) && (
            <div className="results">
              <div className="result-count">{app.searchLoading ? label.searching : label.results(app.searchResults.length)}</div>
              {app.searchResults.length ? app.searchResults.map((result) => (
                <button className="result" key={`${result.translationId}:${result.verse.ref.bookId}:${result.verse.ref.chapter}:${result.verse.ref.verse}`} onClick={() => { app.goTo(result.verse.ref.bookId, result.verse.ref.chapter); setSearchOpen(false); app.setQuery(''); }}>
                  <strong>{localBible.getBook(result.verse.ref.bookId, app.translationId)?.name} {result.verse.ref.chapter}:{result.verse.ref.verse}</strong>
                  <span>{result.verse.text}</span>
                </button>
              )) : !app.searchLoading && <p className="muted">{label.noMatches}</p>}
            </div>
          )}
        </div>
      )}
      {bookmarksOpen && (
        <div className="bookmarks-panel">
          <div className="panel-header"><h2>{label.bookmarks}</h2><button onClick={() => setBookmarksOpen(false)} aria-label={label.closeBookmarks}>×</button></div>
          {app.bookmarkList.length ? app.bookmarkList.map((entry) => (
            <button className="bookmark-item" key={`${entry.bookId}:${entry.chapter}:${entry.verse}`} onClick={() => { app.goTo(entry.bookId, entry.chapter); setBookmarksOpen(false); }}>
              <span className="bookmark-reference">{app.books.find((item) => item.id === entry.bookId)?.name} {entry.chapter}:{entry.verse}</span>
              <span className="bookmark-verse-text">{entry.bookId === app.bookId && entry.chapter === chapterNumber ? chapter?.verses.find((verse) => verse.ref.verse === entry.verse)?.text ?? '' : ''}</span>
            </button>
          )) : <p className="muted">{label.noBookmarks}</p>}
        </div>
      )}
      {partyOpen && (
        <div className="party-panel">
          <div className="panel-header"><h2>Read Party</h2><button onClick={() => setPartyOpen(false)} aria-label="Close">×</button></div>
          {!party.active ? (
            <div className="party-setup">
              <p className="muted">Read Scripture together in real time. Everyone follows the host to the same passage and reads it aloud on their own device.</p>
              <button className="party-primary" onClick={party.createParty}>Start a party</button>
              <div className="party-or"><span>or join one</span></div>
              <form className="party-join" onSubmit={(event) => { event.preventDefault(); party.joinParty(partyCode); }}>
                <input placeholder="Party code" value={partyCode} onChange={(event) => setPartyCode(event.target.value)} />
                <button type="submit" disabled={!partyCode.trim()}>Join</button>
              </form>
              {party.error && <p className="party-error">Could not connect ({party.error}). Try again.</p>}
            </div>
          ) : (
            <div className="party-live">
              <div className="party-status">
                <div><span className="party-code-label">Party code</span><strong className="party-code">{party.code}</strong></div>
                <span className={`party-role ${party.isHost ? 'host' : ''}`}>{party.isHost ? 'You are the host' : 'Following the host'}</span>
              </div>
              {party.status && <p className="muted party-conn">{party.status}</p>}
              {party.isHost
                ? <p className="muted">When you navigate and press Read aloud, everyone follows on their own device.</p>
                : (
                  <div className="party-follow">
                    <label><input type="checkbox" checked={party.following} onChange={(event) => party.setFollowing(event.target.checked)} /> Follow the host</label>
                    {party.needsArm && <button className="party-arm" onClick={party.arm}>🔊 Tap to read along</button>}
                  </div>
                )}
              <div className="party-members">
                <span className="section-label">In the room ({party.members.length})</span>
                {party.members.map((member) => (
                  <div className="party-member" key={member.id}>
                    <span className="party-dot" style={{ background: member.color }} />
                    <span>{member.name}{member.id === party.identity.id ? ' (you)' : ''}</span>
                    {member.host && <span className="party-host-tag">Host</span>}
                  </div>
                ))}
              </div>
              <div className="party-chat">
                <span className="section-label">Party chat</span>
                <div className="party-messages">
                  {party.messages.map((msg) => (
                    msg.kind === 'system'
                      ? <div className="party-msg system" key={msg.id}>{msg.text}</div>
                      : <div className="party-msg" key={msg.id}><strong style={{ color: msg.color }}>{msg.name}</strong> {msg.text}</div>
                  ))}
                </div>
                <form onSubmit={(event) => { event.preventDefault(); if (partyChat.trim()) { party.sendChat(partyChat); setPartyChat(''); } }}>
                  <input placeholder="Say something…" value={partyChat} onChange={(event) => setPartyChat(event.target.value)} />
                  <button type="submit" disabled={!partyChat.trim()}>Send</button>
                </form>
              </div>
              <button className="party-leave" onClick={party.leaveParty}>Leave party</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
