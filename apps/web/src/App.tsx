import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localBible } from '@the-word/bible';
import { readingFonts, useWordApp, verseImageFilename, verseRuns, type Language, type WordApp } from '@the-word/core';
import { SearchableSelect } from './SearchableSelect';
import { BookBibleIcon, VolumeHighIcon, VolumeLowIcon } from './icons';
import { CrossRefMenu } from './CrossRefMenu';
import { Landing } from './Landing';
import { VerseImageEditor, type VerseImageJob } from './VerseImageEditor';
import { createWebSpeech, webClipboard, webStorage } from './platform';
import { useReadParty } from './useReadParty';
import './styles.css';

function viewFromHash(): 'home' | 'reader' {
  return window.location.hash === '#read' ? 'reader' : 'home';
}

function partyStatusText(status: string, label: WordApp['label']) {
  switch (status) {
    case 'connecting': return label.partyConnecting;
    case 'hosting': return label.partyHosting;
    case 'joining': return label.partyJoining;
    case 'connected': return label.partyConnected;
    case 'reconnecting': return label.partyReconnecting;
    default: return status;
  }
}

function App() {
  const speech = useMemo(() => createWebSpeech(), []);
  const platform = useMemo(() => ({ storage: webStorage, speech, clipboard: webClipboard }), [speech]);
  const app = useWordApp(platform, window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const {
    label, language, chapter, chapterLoading, book, bookName, chapterNumber, selectedVerses, selectedText, selectedReference,
    speechState, speakingVerse, speechError, speechRate, speechRateRange, speechVolume, speechVolumeRange, voiceOptions, speechVoice, setSpeechVoice,
  } = app;

  const party = useReadParty(app);
  const activeTopic = app.topics.find((topic) => topic.id === app.selectedTopic);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [partyOpen, setPartyOpen] = useState(false);
  const [partyCode, setPartyCode] = useState('');
  const [partyChat, setPartyChat] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const [view, setView] = useState<'home' | 'reader'>(viewFromHash);
  const [xrefMenu, setXrefMenu] = useState<{ verse: number; x: number; y: number } | null>(null);
  const [imageJob, setImageJob] = useState<VerseImageJob | null>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const settingsRef = useRef<HTMLDivElement>(null);
  const verseRefs = useRef<Record<number, HTMLElement | null>>({});

  useEffect(() => { document.documentElement.dataset.theme = app.theme; }, [app.theme]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => { document.documentElement.style.setProperty('--app-font', app.font.stack); }, [app.font]);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const openReader = useCallback(() => {
    if (window.location.hash !== '#read') window.location.hash = 'read';
    else setView('reader');
  }, []);

  const openHome = useCallback(() => {
    if (window.location.hash === '#read') window.location.hash = '';
    else setView('home');
  }, []);

  // Preload the selected voice as soon as the page is ready (and whenever it
  // changes) so pressing Read aloud plays instantly instead of downloading first.
  useEffect(() => { speech.prewarm?.(speechVoice); }, [speech, speechVoice]);

  // Highlight/scroll to the verse being read locally, or — for a Read Party
  // participant — to the verse the host is currently on.
  const followVerse = party.hostVerse;
  useEffect(() => {
    const verse = speakingVerse ?? followVerse;
    if (verse == null) return;
    verseRefs.current[verse]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [speakingVerse, followVerse, app.bookId, chapterNumber]);

  useEffect(() => {
    if (chapterLoading || app.focusedVerse == null) return;
    const verse = app.focusedVerse;
    const id = window.setTimeout(() => {
      verseRefs.current[verse]?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 50);
    return () => window.clearTimeout(id);
  }, [chapterLoading, app.focusedVerse, app.bookId, chapterNumber]);

  useEffect(() => {
    const element = controlsRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setControlsVisible(entry.isIntersecting));
    observer.observe(element);
    return () => observer.disconnect();
  }, [view]);

  useEffect(() => {
    if (!settingsOpen) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!settingsRef.current?.contains(target) && !target.closest?.('.settings-toggle')) setSettingsOpen(false);
    }
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [settingsOpen]);

  const readingBarOpen = speechState !== 'idle' && !controlsVisible && selectedVerses.size === 0;

  if (view === 'home') {
    return (
      <Landing
        app={app}
        onEnterReader={() => { app.markProgress(); openReader(); }}
        onGroupStudy={() => { app.markProgress(); setPartyOpen(true); openReader(); }}
      />
    );
  }

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
          <button className="topbar-home" onClick={openHome} aria-label={label.home} title={label.home}>
            <span className="brand-mark" role="img" aria-hidden="true"><BookBibleIcon /></span>
            <h1 className="topbar-reference">{bookName} <span>{chapterNumber}</span></h1>
          </button>
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
            <button className={`icon-button party-toggle ${party.active ? 'active' : ''}`} onClick={() => setPartyOpen((open) => !open)} aria-label={label.readParty} title={label.readParty}>☍{party.active && <span className="party-count">{party.members.length}</span>}</button>
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
                const following = !speaking && followVerse === verse.ref.verse;
                const focused = !speaking && !selected && app.focusedVerse === verse.ref.verse;
                const refs = app.crossRefs[verse.ref.verse];
                return (
                  <span
                    key={verse.ref.verse}
                    role="button"
                    tabIndex={0}
                    ref={(el) => { verseRefs.current[verse.ref.verse] = el; }}
                    className={speaking ? 'verse speaking' : following ? 'verse following' : focused ? 'verse focused' : selected ? 'verse selected' : 'verse'}
                    onClick={() => app.toggleVerse(verse.ref.verse)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        app.toggleVerse(verse.ref.verse);
                      }
                    }}
                  >
                    <sup>{verse.ref.verse}</sup>
                    <span>{verseRuns(verse.text, verse.redLetters).map((run, index) => (run.red ? <span className="words-of-jesus" key={index}>{run.text}</span> : <span key={index}>{run.text}</span>))}</span>
                    {app.bookmarks.has(app.bookmarkKey(verse.ref.verse)) && <span className="bookmark" aria-label={label.bookmarks}>◆</span>}
                    {refs?.length ? (
                      <button
                        type="button"
                        className={xrefMenu?.verse === verse.ref.verse ? 'xref-mark open' : 'xref-mark'}
                        aria-label={label.crossReferences}
                        title={label.crossReferences}
                        onClick={(event) => {
                          event.stopPropagation();
                          const rect = event.currentTarget.getBoundingClientRect();
                          setXrefMenu({ verse: verse.ref.verse, x: rect.left, y: rect.bottom });
                        }}
                      >※</button>
                    ) : null}
                  </span>
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
              <button onClick={() => setImageJob({
                reference: selectedReference,
                text: selectedText,
                translation: app.translations.find((item) => item.id === app.translationId)?.shortName ?? 'KJV',
                filename: verseImageFilename(bookName, chapterNumber),
                seed: selectedReference,
              })}>{label.image}</button>
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
      {imageJob && (
        <VerseImageEditor
          job={imageJob}
          fontStack={app.font.stack}
          label={label}
          onClose={() => setImageJob(null)}
          onSaved={app.clearSelection}
        />
      )}
      {speechError && <div className="speech-error" role="alert">{/valid JSON|Could not fetch/.test(speechError) ? `${label.noVoice} (${speechVoice})` : speechError}</div>}
      {searchOpen && (
        <div className="search-panel">
          <div className="search-header"><h2>{label.searchTitle} · {app.translations.find((item) => item.id === app.translationId)?.shortName}</h2><button onClick={() => setSearchOpen(false)} aria-label={label.search}>×</button></div>
          <input autoFocus placeholder={label.searchPlaceholder} value={app.query} onChange={(event) => { app.setQuery(event.target.value); if (event.target.value.trim()) app.setSelectedTopic(''); }} />
          {activeTopic && (
            <div className="topic-chip">
              <strong>{activeTopic.name}</strong>
              <button type="button" onClick={() => app.setSelectedTopic('')} aria-label={label.clearTopic}>×</button>
            </div>
          )}
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
          {!app.query.trim() && !activeTopic && (
            <div className="topic-section">
              <span className="section-label">{label.browseByTopic}</span>
              <div className="topic-grid">{app.topics.map((topic) => <button className="topic" key={topic.id} onClick={() => { app.setSelectedTopic(topic.id); app.setQuery(''); }}><strong>{topic.name}</strong><small>{topic.description}</small></button>)}</div>
            </div>
          )}
          {(app.query || app.selectedTopic) && (
            <div className="results">
              <div className="result-count">{app.searchLoading ? label.searching : label.results(app.searchResults.length)}</div>
              {app.searchResults.length ? app.searchResults.map((result) => (
                <button className="result" key={`${result.translationId}:${result.verse.ref.bookId}:${result.verse.ref.chapter}:${result.verse.ref.verse}`} onClick={() => { app.goToVerse(result.verse.ref.bookId, result.verse.ref.chapter, result.verse.ref.verse); setSearchOpen(false); app.setQuery(''); }}>
                  <strong>{localBible.getBook(result.verse.ref.bookId, app.translationId)?.name} {result.verse.ref.chapter}:{result.verse.ref.verse}</strong>
                  <span>{result.verse.text}</span>
                </button>
              )) : !app.searchLoading && <p className="muted">{label.noMatches}</p>}
            </div>
          )}
        </div>
      )}
      {xrefMenu && (
        <CrossRefMenu
          app={app}
          verse={xrefMenu.verse}
          refs={app.crossRefs[xrefMenu.verse] ?? []}
          x={xrefMenu.x}
          y={xrefMenu.y}
          onClose={() => setXrefMenu(null)}
          onSelect={(ref) => {
            app.goToVerse(ref.bookId, ref.chapter, ref.verse);
            setXrefMenu(null);
          }}
        />
      )}
      {bookmarksOpen && (
        <div className="bookmarks-panel">
          <div className="panel-header"><h2>{label.bookmarks}</h2><button onClick={() => setBookmarksOpen(false)} aria-label={label.closeBookmarks}>×</button></div>
          {app.bookmarkList.length ? app.bookmarkList.map((entry) => (
            <button className="bookmark-item" key={`${entry.bookId}:${entry.chapter}:${entry.verse}`} onClick={() => { app.goToVerse(entry.bookId, entry.chapter, entry.verse); setBookmarksOpen(false); }}>
              <span className="bookmark-reference">{app.books.find((item) => item.id === entry.bookId)?.name} {entry.chapter}:{entry.verse}</span>
              <span className="bookmark-verse-text">{entry.bookId === app.bookId && entry.chapter === chapterNumber ? chapter?.verses.find((verse) => verse.ref.verse === entry.verse)?.text ?? '' : ''}</span>
            </button>
          )) : <p className="muted">{label.noBookmarks}</p>}
        </div>
      )}
      {partyOpen && (
        <div className="party-panel">
          <div className="panel-header"><h2>{label.readParty}</h2><button onClick={() => setPartyOpen(false)} aria-label={label.closeParty}>×</button></div>
          {!party.active ? (
            <div className="party-setup">
              <p className="muted">{label.partyIntro}</p>
              <button className="party-primary" onClick={() => { speech.unlock?.(); party.createParty(); }}>{label.startParty}</button>
              <div className="party-or"><span>{label.orJoinParty}</span></div>
              <form className="party-join" onSubmit={(event) => { event.preventDefault(); speech.unlock?.(); party.joinParty(partyCode); }}>
                <input placeholder={label.partyCodePlaceholder} value={partyCode} onChange={(event) => setPartyCode(event.target.value)} />
                <button type="submit" disabled={!partyCode.trim()}>{label.joinParty}</button>
              </form>
              {party.error && <p className="party-error">{label.partyConnectFailed(party.error)}</p>}
            </div>
          ) : (
            <div className="party-live">
              <div className="party-status">
                <div><span className="party-code-label">{label.partyCode}</span><strong className="party-code">{party.code}</strong></div>
                <span className={`party-role ${party.isHost ? 'host' : ''}`}>{party.isHost ? label.youAreHost : label.followingHost}</span>
              </div>
              {party.status && <p className="muted party-conn">{partyStatusText(party.status, label)}</p>}
              {party.isHost
                ? <p className="muted">{label.hostHint}</p>
                : (
                  <div className="party-follow">
                    <label><input type="checkbox" checked={party.following} onChange={(event) => party.setFollowing(event.target.checked)} /> {label.followHost}</label>
                    {party.needsArm && <button className="party-arm" onClick={() => { speech.unlock?.(); party.arm(); }}>🔊 {label.tapToReadAlong}</button>}
                  </div>
                )}
              <div className="party-members">
                <span className="section-label">{label.inTheRoom(party.members.length)}</span>
                {party.members.map((member) => (
                  <div className="party-member" key={member.id}>
                    <span className="party-dot" style={{ background: member.color }} />
                    <span>{member.name}{member.id === party.identity.id ? label.youSuffix : ''}</span>
                    {member.host && <span className="party-host-tag">{label.hostTag}</span>}
                  </div>
                ))}
              </div>
              <div className="party-chat">
                <span className="section-label">{label.partyChat}</span>
                <div className="party-messages">
                  {party.messages.map((msg) => (
                    msg.kind === 'system'
                      ? <div className="party-msg system" key={msg.id}>{msg.event === 'joined' ? label.partyJoined(msg.name || '') : msg.event === 'left' ? label.partyLeft(msg.name || '') : msg.text}</div>
                      : <div className="party-msg" key={msg.id}><strong style={{ color: msg.color }}>{msg.name}</strong> {msg.text}</div>
                  ))}
                </div>
                <form onSubmit={(event) => { event.preventDefault(); if (partyChat.trim()) { party.sendChat(partyChat); setPartyChat(''); } }}>
                  <input placeholder={label.partyChatPlaceholder} value={partyChat} onChange={(event) => setPartyChat(event.target.value)} />
                  <button type="submit" disabled={!partyChat.trim()}>{label.send}</button>
                </form>
              </div>
              <button className="party-leave" onClick={party.leaveParty}>{label.leaveParty}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default App;
