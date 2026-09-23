import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { localBible, loadBookCrossRefs, chapterCrossRefs } from '@the-word/bible';
import { useWordApp, verseImageFilename, verseRuns, type WordApp } from '@the-word/core';
import { SearchableSelect } from './SearchableSelect';
import { BookBibleIcon, CamIcon, MicIcon, ScreenIcon, SpeakerIcon, VolumeHighIcon, VolumeLowIcon } from './icons';
import { ScreenStage } from './ScreenStage';
import { groupInviteUrl, parseGroupHash } from './groupLink';
import { AnswerBoard, HostQuestionPanel, QuestionPrompt } from './GroupQuestion';
import { ToolDock, useTools, toolNames, pageTools, type ToolId } from './ToolDock';
import { PassageTools, snapshot, type PassageSnapshot } from './PassageTools';
import { Welcome, useWelcome, ReminderBanner } from './Welcome';
import { DeviceSettings } from './DeviceSettings';
import { ReaderIcon } from './ReaderIcon';
import { FaceRail } from './FaceRail';
import { Landing } from './Landing';
import { Preferences } from './Preferences';
import { VerseImageEditor, type VerseImageJob } from './VerseImageEditor';
import { VerseNote } from './VerseNote';
import { Breakdown } from './Breakdown';
import { prepareModel } from './breakdown/client';
import { BackupPrompt } from './BackupPrompt';
import { needsBackup, type BackupTrigger } from './backupState';
import { unlockRemoteAudio, setRemoteVolume } from './media';
import { createWebSpeech, webClipboard, webStorage } from './platform';
import { useDailyReminder } from './dailyReminder';
import { useReadParty } from './useReadParty';
import { useStudyBoard } from './useStudyBoard';
import { takeRestoreToken } from './nostrAccount';
import { formatVerseReference, parseVerseHash, readerViewFromHash, verseHash, verseShareText, verseShareUrl } from './verseLink';
import type { GroupAction } from './ledger';
import { useChapterRead, useLedger } from './useLedger';
import { ProgressPanel } from './ProgressPanel';
import { localized } from './badges';
import { useStudy } from './useStudy';
import { StudyHub } from './StudyHub';
import './styles.css';
import './landing.css';
import './workspace.css';
import './reader-layout.css';
import { readerCopy } from './readerCopy';

function viewFromHash(): 'home' | 'reader' {
  return readerViewFromHash();
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
    speechState, speakingVerse, speechError, speechRate, speechRateRange, speechVolume, speechVolumeRange, speechVoice,
  } = app;

  const ui = readerCopy[language];
  const party = useReadParty(app);
  const ledger = useLedger();
  const study = useStudy(ledger.earned);
  // Lives at the top of the app, not inside Preferences: the schedule has to be
  // kept armed on every visit, whether or not the reader opens that panel.
  const reminder = useDailyReminder({ title: label.reminderTitle, body: label.reminderBody });
  const activeTopic = app.topics.find((topic) => topic.id === app.selectedTopic);
  const tools = useTools();
  const studyRequest = useRef(0);
  const toolsRef = useRef(tools);
  useEffect(()=>{studyRequest.current++;},[tools.focused,app.translationId]);
  toolsRef.current = tools;
  const restorePrefill = useMemo(() => takeRestoreToken() ?? '', []);
  const welcome = useWelcome();
  const [library, setLibrary] = useState<'books'|'search'|'bookmarks'|null>(null);
  const [partyCode, setPartyCode] = useState(() => parseGroupHash(window.location.hash) ?? '');
  const [partyChat, setPartyChat] = useState('');
  const [createFindable, setCreateFindable] = useState(false);
  const [view, setView] = useState<'home'|'reader'>(viewFromHash);
  const [mobileView,setMobileView] = useState<'reader'|'library'|'tools'>('reader');
  const [peopleVolume,setPeopleVolume] = useState(1);
  const [passage,setPassage] = useState<PassageSnapshot|null>(null);
  const [guidePassage,setGuidePassage] = useState<PassageSnapshot|null>(null);
  const [followTool,setFollowTool] = useState(false);
  const [followGuide,setFollowGuide] = useState(false);
  const [imageJob,setImageJob] = useState<VerseImageJob|null>(null);
  const [voiceState,setVoiceState] = useState('preparing');
  const [notice,setNotice] = useState('');
  const [noteVerse,setNoteVerse] = useState<number|null>(null);
  const [breakdownRef,setBreakdownRef] = useState<{bookId:number;chapter:number;verse:number}|null>(null);
  // Ask for a backup the first time the account is worth keeping, not at first
  // launch when there is nothing invested. docs/study-plans-framework.md §14a.
  const [backupAsk,setBackupAsk] = useState<BackupTrigger>('none');
  const partyOpen = tools.focused==='group';
  const { list: liveGroups, advertise: advertiseGroup, retract: retractGroup } = useStudyBoard(partyOpen || (party.active && party.findable && party.isHost));
  const searchInput = useRef<HTMLInputElement>(null);
  const libraryBack = useRef<HTMLButtonElement>(null);
  useEffect(()=>{if(library) (library==='search'?searchInput.current:libraryBack.current)?.focus();},[library]);
  const verseRefs = useRef<Record<number, HTMLElement | null>>({});
  const [lastInView, setLastInView] = useState(false);
  const lastVerse = chapter?.verses.length ? chapter.verses[chapter.verses.length - 1].ref.verse : null;

  useEffect(() => { if (restorePrefill) { tools.open('settings'); setLibrary(null); setMobileView('tools'); } }, [restorePrefill]);
  // A live room owns the supporting column. Keeping Group Study mounted and
  // focused means the reader never has to switch into a separate meeting view
  // or hunt for the room controls while following a host.
  useEffect(() => {
    if (party.active && view === 'reader') {
      tools.open('group');
      setLibrary(null);
      setMobileView('tools');
    }
  }, [party.active, view, tools.focused]);
  // The optional breakdown formatter fetches itself once the page is quiet.
  // Scripture is already on screen by then and never waits for it.
  useEffect(() => { prepareModel(); }, []);
  useEffect(() => { document.documentElement.dataset.theme = app.theme; }, [app.theme]);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => { document.documentElement.style.setProperty('--app-font', app.font.stack); }, [app.font]);

  useEffect(() => {
    const onHash = () => {
      const next = viewFromHash();
      setView(next);
      const deep = parseVerseHash(window.location.hash);
      if (deep) { app.goToVerse(deep.bookId, deep.chapter, deep.verse); toolsRef.current.dismiss(); setLibrary(null); setMobileView('reader'); }
    };
    window.addEventListener('hashchange', onHash);
    const deep = parseVerseHash(window.location.hash);
    if (deep) app.goToVerse(deep.bookId, deep.chapter, deep.verse);
    return () => window.removeEventListener('hashchange', onHash);
  }, [app.goToVerse]);

  const openReader = useCallback(() => {
    if (parseVerseHash(window.location.hash)) { setView('reader'); return; }
    if (window.location.hash !== '#read') window.location.hash = 'read';
    else setView('reader');
  }, []);

  useEffect(() => {
    const openInvite = () => {
      const code = parseGroupHash(window.location.hash);
      if (!code) return;
      setPartyCode(code);
      setView('reader');
      setLibrary(null);
      setMobileView('tools');
      toolsRef.current.open('group');
    };
    openInvite();
    window.addEventListener('hashchange', openInvite);
    return () => window.removeEventListener('hashchange', openInvite);
  }, []);

  const copyInvite = async () => {
    const url = groupInviteUrl(party.code, window.location.href);
    try {
      await navigator.clipboard.writeText(url);
      setNotice('Invite link copied. Send it to your study group.');
    } catch {
      setNotice(`Copy this invite link: ${url}`);
    }
  };

  const openHome = useCallback(() => {
    if (window.location.hash && window.location.hash !== '') window.location.hash = '';
    else setView('home');
  }, []);

  useEffect(()=>{
    const onVoice=(event:Event)=>{const data=(event as CustomEvent).detail;if(data.voice===speechVoice)setVoiceState(data.state);};
    window.addEventListener('word-voice-state',onVoice);
    return ()=>window.removeEventListener('word-voice-state',onVoice);
  },[speechVoice]);

  // Preload the selected voice as soon as the page is ready (and whenever it
  // changes) so pressing Read aloud plays instantly instead of downloading first.
  useEffect(() => { speech.prewarm?.(speechVoice); }, [speech, speechVoice]);

  useEffect(() => {
    setLastInView(false);
    const el = lastVerse ? verseRefs.current[lastVerse] : null;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setLastInView(entry.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [chapter, lastVerse, chapterLoading, view]);

  // Group-study milestones. Recorded once per action per party session, so a mic
  // toggled ten times appends one event, not ten.
  const groupLogged = useRef<Set<string>>(new Set());
  const logGroupOnce = useCallback((key: string, action: GroupAction, where?: { bookId?: number; chapter?: number }) => {
    if (groupLogged.current.has(key)) return;
    groupLogged.current.add(key);
    void ledger.recordGroup(action, where);
  }, [ledger.recordGroup]);

  useEffect(() => {
    if (!party.active) { groupLogged.current.clear(); return; }
    logGroupOnce('join', 'join');
    // Only the host chooses whether the room is listed, so only the host earns these.
    if (party.isHost) {
      const listing: GroupAction = party.findable ? 'public' : 'private';
      logGroupOnce(listing, listing);
    }
  }, [party.active, party.isHost, party.findable, logGroupOnce]);

  useEffect(() => { if (party.active && party.micOn) logGroupOnce('mic', 'mic'); }, [party.active, party.micOn, logGroupOnce]);
  useEffect(() => { if (party.active && party.camOn) logGroupOnce('cam', 'cam'); }, [party.active, party.camOn, logGroupOnce]);

  const recordChapterReadInGroup = useCallback(async (bookId: number, chapter: number, verses?: number[]) => {
    const result = await ledger.recordChapterRead(bookId, chapter, verses);
    if (party.active) logGroupOnce(`chapter:${bookId}:${chapter}`, 'chapter', { bookId, chapter });
    return result;
  }, [ledger.recordChapterRead, party.active, logGroupOnce]);

  useChapterRead(recordChapterReadInGroup, {
    bookId: app.bookId,
    chapter: chapterNumber,
    lastVerse,
    speakingVerse,
    lastInView,
  });

  useEffect(() => {
    if (!ledger.justEarned.length) return;
    setNotice(label.badgeEarned(localized(ledger.justEarned[0].definition.title, language)));
    ledger.clearJustEarned();
  }, [ledger.justEarned]);

  // Highlight/scroll to the verse being read locally, or — for a Read Party
  // participant — to the verse the host is currently on.
  const followVerse = party.stageVerse;
  useEffect(() => {
    const verse = party.active && !party.isHost && !party.following ? null : speakingVerse ?? followVerse;
    if (verse == null) return;
    // The first verse means the chapter is being read from the start, so show
    // the chapter heading rather than centring verse 1 halfway down.
    if (verse === chapter?.verses[0]?.ref.verse) {
      document.querySelector('.reader-column')?.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const target=verseRefs.current[verse], reader=document.querySelector<HTMLElement>('.reader-column');
    if(target&&reader) reader.scrollTo({top:reader.scrollTop+target.getBoundingClientRect().top-reader.getBoundingClientRect().top-reader.clientHeight/3,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  }, [speakingVerse, followVerse, app.bookId, chapterNumber, chapter]);

  useEffect(() => {
    if (chapterLoading || app.focusedVerse == null) return;
    const verse = app.focusedVerse;
    const id = window.setTimeout(() => {
      const target=verseRefs.current[verse], reader=document.querySelector<HTMLElement>('.reader-column');
    if(target&&reader) reader.scrollTo({top:reader.scrollTop+target.getBoundingClientRect().top-reader.getBoundingClientRect().top-reader.clientHeight/3,behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
    }, 50);
    return () => window.clearTimeout(id);
  }, [chapterLoading, app.focusedVerse, app.bookId, chapterNumber]);

  const advertisedCode = useRef('');

  useEffect(() => {
    if (!party.active || !party.isHost || !party.findable || !party.code) return;
    const send = () => advertiseGroup({
      code: party.code,
      hostName: party.name,
      members: party.members.length,
      bookId: app.bookId,
      chapter: app.chapterNumber,
      verse: party.stageVerse,
      ts: Date.now(),
    });
    send();
    const timer = window.setInterval(send, 5000);
    return () => window.clearInterval(timer);
  }, [advertiseGroup, party.active, party.isHost, party.findable, party.code, party.name, party.members.length, party.stageVerse, app.bookId, app.chapterNumber]);

  useEffect(() => {
    if (party.active && party.isHost && party.findable && party.code) {
      advertisedCode.current = party.code;
      return;
    }
    if (advertisedCode.current) {
      retractGroup(advertisedCode.current);
      advertisedCode.current = '';
    }
  }, [retractGroup, party.active, party.isHost, party.findable, party.code]);

  useEffect(()=>{ if(ledger.justEarned.length&&needsBackup()) setBackupAsk('badge'); },[ledger.justEarned]);
  useEffect(()=>{ if(study.circles.length&&needsBackup()) setBackupAsk((prev)=>prev==='none'?'circle':prev); },[study.circles.length]);

  const openTool = (id:ToolId) => {
    if (party.active && id !== 'group') return;
    tools.open(id); setLibrary(null); setMobileView('tools'); if(id==='group')welcome.show();
  };
  const returnToReading = () => {
    if (party.active && view === 'reader') {
      tools.open('group'); setLibrary(null); setMobileView('tools');
      return;
    }
    tools.dismiss(); setLibrary(null); setMobileView('reader'); requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('[data-read-nav]')?.focus());
  };
  const openLibrary = (next:'books'|'search'|'bookmarks') => {
    if (party.active && view === 'reader') {
      tools.open('group'); setLibrary(next); setMobileView('library');
      return;
    }
    tools.dismiss(); setLibrary(next); setMobileView('library');
  };
  const navigate = (bookId:number, nextChapter:number, verse=1) => {
    party.browseIndependently(); app.goToVerse(bookId,nextChapter,verse); returnToReading();
    const next = verseHash(bookId, nextChapter, verse);
    if (window.location.hash !== next) window.location.hash = next;
  };
  const currentVerse = app.selectedVerseNumbers[0] ?? party.stageVerse ?? app.focusedVerse ?? chapter?.verses[0]?.ref.verse ?? 1;
  const inspect = (verse:number, id:'references'|'guide') => { const target=snapshot(app,verse); setFollowGuide(false); setFollowTool(false); setGuidePassage(target); setPassage(target); setBreakdownRef({bookId:app.bookId,chapter:chapterNumber,verse}); openTool(id); };
  useEffect(()=>{
    if (!chapterLoading && chapter) {
      if(followTool)setPassage(snapshot(app,party.stageVerse ?? speakingVerse ?? 1));
      if(followGuide)setGuidePassage(snapshot(app,party.stageVerse ?? speakingVerse ?? 1));
    }
  },[followTool,followGuide,party.stageVerse,speakingVerse,app.bookId,chapterNumber,app.translationId,chapterLoading,chapter]);
  useEffect(()=>{setRemoteVolume(peopleVolume);},[peopleVolume]);
  useEffect(()=>{if(!tools.focused && mobileView==='tools')setMobileView('reader');},[tools.focused,mobileView]);
  useEffect(()=>{if(!library && mobileView==='library')setMobileView('reader');},[library,mobileView]);
  const stage = party.shared;
  const stageName = stage ? localBible.getBook(stage.bookId,app.translationId)?.name ?? 'Scripture' : bookName;
  const stageReference = stage ? `${stageName} ${stage.chapter}${stage.verse?`:${stage.verse}`:''}` : `${bookName} ${chapterNumber}`;
  const samePassage = !stage || (stage.bookId===app.bookId && stage.chapter===chapterNumber);
  const hostName = party.members.find(m=>m.host)?.name ?? 'the host';
  const participant = party.active && !party.isHost;
  const speechControls = <>
    {speechState==='idle' && <button className="primary" onClick={()=>selectedVerses.size ? app.speakFromVerse(app.bookId,chapterNumber,currentVerse) : app.listen()} disabled={!chapter}>{selectedVerses.size?label.readFromHere:party.isHost?'Read to group':label.readAloud}</button>}
    {speechState==='speaking' && <button className="primary" onClick={app.pauseSpeech}>{party.isHost?'Pause group reading':label.pause}</button>}
    {speechState==='paused' && <button className="primary" onClick={app.resumeSpeech}>{party.isHost?'Resume group reading':label.resume}</button>}
    {speechState==='paused' && <button onClick={app.listenFromBeginning} disabled={!chapter}>{label.listenFromBeginning}</button>}
    {speechState!=='idle' && <button onClick={app.stopSpeech}>{label.stop}</button>}
  </>;
  const sound = <div className="sound-settings"><span className="workspace-eyebrow">Only on your device</span><h2>Find your balance.</h2><p role="status">{voiceState==='ready'?'Narration voice is ready on this device.':voiceState==='preparing'?'Preparing your narration voice in the background…':'Voice preparation failed. Check your connection or choose another voice in Settings.'}</p>
    <label>People’s voices · {Math.round(peopleVolume*100)}%<input aria-label="People volume" type="range" min="0" max="1" step="0.05" value={peopleVolume} onChange={e=>setPeopleVolume(+e.target.value)} /></label>
    <label>Bible narration · {Math.round(speechVolume*100)}%<input aria-label="Bible narration volume" type="range" min="0" max="1" step="0.05" value={speechVolume} onChange={e=>app.changeSpeechVolume(+e.target.value-speechVolume)} /></label>
    <label>Reading speed · {speechRate.toFixed(1)}×<input aria-label="Reading speed" type="range" min={speechRateRange.min} max={speechRateRange.max} step={speechRateRange.step} value={speechRate} disabled={participant && party.following} onChange={e=>app.changeSpeechRate(+e.target.value-speechRate)} /></label>
    <p>Group following tracks the host’s verse. Narration is generated on each device; voices may finish at different times.</p>
    <button onClick={()=>{app.unlockSpeech();unlockRemoteAudio();party.arm();}}>Enable sound on this device</button>
    <label>{label.voice}<SearchableSelect value={speechVoice} onChange={app.setSpeechVoice} label={label.voice} filterPlaceholder={label.filterPlaceholder} options={app.voiceOptions.map(voice=>({value:voice.id,label:voice.isDefault?label.defaultVoice:voice.name}))}/></label>
    {selectedVerses.size>0&&(!participant||!party.following)&&<button onClick={app.speakSelection}>{label.readSelection}</button>}<DeviceSettings party={party}/>
  </div>;
  const preferences = <Preferences embedded={view==='reader'} app={app} name={party.name} color={party.identity.color} avatar={party.avatar} reminder={reminder} readers={{readers:ledger.readers,activeId:ledger.activeReader.id}} activeReader={ledger.activeReader} onReadersChange={ledger.updateReaders} restorePrefill={restorePrefill} onNameChange={party.setName} onAvatarChange={file=>{void party.setAvatar(file);}} onClose={()=>{tools.close('settings');if(view==='reader')returnToReading();}} />;
  const shareActions = <div className="share-actions"><h2>{selectedReference}</h2><blockquote>{selectedText}</blockquote>      <button onClick={app.copySelection}>{label.copy}</button><button onClick={()=>{void (async()=>{
      const verse=currentVerse;
      const url=verseShareUrl(app.bookId,chapterNumber,verse);
      const reference=formatVerseReference(bookName,chapterNumber,app.selectedVerseNumbers);
      const body=verseShareText({reference,text:selectedText,translation:app.translations.find(t=>t.id===app.translationId)?.shortName,url});
      try {
        // The block already ends with the link, so pass it as `text` rather than splitting
        // text/url — targets that only read `url` would otherwise drop the passage itself.
        if (navigator.share) await navigator.share({ title: reference, text: body });
        else { await navigator.clipboard.writeText(body); setNotice(label.verseCopied); }
        void ledger.recordShare('link', app.bookId, chapterNumber, verse);
      } catch (error) {
        if ((error as {name?:string}).name==='AbortError') return;
        try { await navigator.clipboard.writeText(body); setNotice(label.verseCopied); void ledger.recordShare('link', app.bookId, chapterNumber, verse); }
        catch { setNotice(body); }
      }
    })();}}>{label.sharePassage}</button><button onClick={()=>{setImageJob({reference:selectedReference,text:selectedText,translation:app.translations.find(t=>t.id===app.translationId)?.shortName??'KJV',filename:verseImageFilename(bookName,chapterNumber),seed:selectedReference});openTool('image');}}>{ui.image}</button></div>;
  async function chooseStudyView(id:'guide'|'references'|'breakdown') {
    const request = ++studyRequest.current;
    let target = tools.focused==='guide' ? guidePassage : passage;
    if (tools.focused==='breakdown' && breakdownRef) {
      try {
        const [text, refs] = await Promise.all([
          localBible.getChapter(app.translationId,breakdownRef.bookId,breakdownRef.chapter),
          loadBookCrossRefs(breakdownRef.bookId),
        ]);
        if(request!==studyRequest.current) return;
        target = { ...breakdownRef, translationId:app.translationId,
          reference:`${localBible.getBook(breakdownRef.bookId,app.translationId)?.name ?? ''} ${breakdownRef.chapter}:${breakdownRef.verse}`,
          text:text?.verses.find(v=>v.ref.verse===breakdownRef.verse)?.text??'',
          refs:chapterCrossRefs(refs,breakdownRef.chapter)[breakdownRef.verse]??[] };
      } catch { if(request===studyRequest.current)setNotice(label.chapterMissingBody); return; }
    }
    if(target){
      setPassage(target); setGuidePassage(target); setFollowTool(false); setFollowGuide(false);
      setBreakdownRef({bookId:target.bookId,chapter:target.chapter,verse:target.verse});
    }
    openTool(id);
  }
  const studySections = <nav className="study-sections" aria-label={ui.more}>{(['guide','references','breakdown'] as const).map(id=><button key={id} aria-pressed={tools.focused===id} onClick={()=>{void chooseStudyView(id);}}>{id==='guide'?ui.context:id==='references'?ui.related:ui.explanation}</button>)}</nav>;
  const group = <div className="group-content">
    {!party.active ? <><span className="workspace-eyebrow">Read. Reflect. Together.</span><h2>A seat at the table.</h2><p>Share a passage, talk face to face, and follow the host’s reading.</p>
      <div className="join-profile">{party.avatar && <img src={party.avatar} alt="Your profile"/>}<div><strong>{party.name}</strong><small>Your microphone and camera start off.</small></div><button onClick={()=>openTool('settings')}>Edit profile</button></div>
      <p className="muted">Voice and video work best with up to 8 people. Larger groups keep chat and passage sharing.</p>
      <label className="check-label"><input type="checkbox" checked={createFindable} onChange={e=>setCreateFindable(e.target.checked)}/>List this group publicly</label>
      <p className="muted">{createFindable?'Your name, passage, and room code will be listed for other readers.':'Unlisted: share the code with the people you want to invite.'}</p>
      <button className="primary" onClick={()=>{speech.unlock?.();unlockRemoteAudio();party.createParty({findable:createFindable});}}>Start a group</button>
      <form className="join-form" onSubmit={e=>{e.preventDefault();speech.unlock?.();unlockRemoteAudio();party.joinParty(partyCode);}}><label>Have a room code?<input aria-label="Room code" value={partyCode} onChange={e=>setPartyCode(e.target.value)} placeholder="Enter code"/></label><button disabled={!partyCode.trim()}>Join group</button></form>
      <h3>Open study groups</h3>{liveGroups.length?liveGroups.map(item=><button className="party-live-item" key={item.code} onClick={()=>{speech.unlock?.();unlockRemoteAudio();party.joinParty(item.code);}}><strong>{item.hostName}</strong><span>{item.members} people · Join group</span></button>):<p className="muted">No public groups are live right now.</p>}
    </> : <><div className="group-summary"><span className="workspace-eyebrow">{party.isHost?'You are hosting':`Hosted by ${hostName}`}</span><h2>{stageReference}</h2><p>{partyStatusText(party.status,label)} · {party.members.length} people</p><button onClick={copyInvite}>Copy invite link</button><p>Room code: <strong>{party.code}</strong></p>{parseGroupHash(window.location.hash) && parseGroupHash(window.location.hash)!==party.code && <p role="status">This invitation is for room {partyCode}. Leave your current room before joining it.</p>}</div>
      <section className="people-list"><h3>People ({party.members.length})</h3>{party.members.map(member=><div className="member-row" key={member.id}><span className="member-avatar" style={{background:member.color}}>{member.avatar?<img src={member.avatar} alt=""/>:member.name.slice(0,1)}</span><span>{member.name}{member.id===party.identity.id?' (you)':''}<small>{member.host?'Host':member.mic?'Microphone on':'Microphone off'}</small></span>{party.isHost && member.id!==party.identity.id && <button onClick={()=>party.transferHost(member.id)}>Make host</button>}</div>)}<p className="muted">Passing the host role pauses group narration. The new host chooses when to resume.</p></section>
      {party.isHost&&<HostQuestionPanel question={party.question} answers={party.answerList} sharing={party.sharingAnswers} onAsk={party.askQuestion} onClose={party.closeQuestion} onShare={party.shareAnswers}/>}
      <div className="party-chat"><h3>Conversation</h3><div className="party-messages" role="log" aria-label="Group messages" aria-live="polite">{party.messages.map(msg=>msg.kind==='system'?<div className="party-msg system" key={msg.id}>{msg.event==='joined'?label.partyJoined(msg.name||''):msg.event==='left'?label.partyLeft(msg.name||''):msg.text}</div>:<div className="party-msg" key={msg.id}><strong>{msg.name}</strong><span>{msg.text}</span></div>)}</div><form onSubmit={e=>{e.preventDefault();if(partyChat.trim()){party.sendChat(partyChat);setPartyChat('');}}}><input aria-label="Message the group" placeholder="Share a thought…" maxLength={2000} value={partyChat} onChange={e=>setPartyChat(e.target.value)}/><button disabled={!partyChat.trim()}>Send</button></form></div>
    </>}
    {party.active&&party.isHost&&selectedVerses.size>0&&<button onClick={()=>party.showGroup(app.selectedVerseNumbers)}>Show group · {selectedReference}</button>}
    {party.error && <p role="alert">Could not connect: {party.error}. Leave the room and try joining again.</p>}
  </div>;
  const dock = <footer className="session-dock" aria-label={party.active?'Meeting and reading controls':'Reading controls'}>
    {party.active && <div className="device-controls"><button aria-label="Microphone" aria-pressed={party.micOn} disabled={party.capped&&!party.micOn} onClick={party.toggleMic}><MicIcon/><span>{party.micOn?'Mic on':'Mic off'}</span></button><button aria-label="Camera" aria-pressed={party.camOn} disabled={party.capped&&!party.camOn} onClick={party.toggleCam}><CamIcon/><span>{party.camOn?'Camera on':'Camera off'}</span></button>{party.isHost&&<button aria-label="Share screen" aria-pressed={party.screenOn} disabled={party.capped&&!party.screenOn} onClick={()=>party.toggleScreen(true)}><ScreenIcon/><span>{party.screenOn?'Sharing screen':'Share screen'}</span></button>}{party.isHost&&<button aria-label="Share system audio" aria-pressed={party.systemAudioOn} disabled={party.capped&&!party.systemAudioOn} onClick={party.toggleSystemAudio}><SpeakerIcon/><span>{party.systemAudioOn?'Sharing audio':'Share audio'}</span></button>}{party.isHost&&party.systemAudioOn&&<label className="system-audio-level"><span className="sr-only">System audio level</span><VolumeLowIcon/><input type="range" min={0} max={100} value={Math.round(party.systemAudioVolume*100)} onChange={e=>party.setSystemVolume(Number(e.target.value)/100)} aria-label="System audio level"/></label>}</div>}
    <div className="transport"><div className="transport-status"><span className="workspace-eyebrow">{participant?(party.following?`Following ${hostName}`:'Browsing independently'):party.active?'You control group reading':'Your quiet place'}</span><strong>{party.active?stageReference:`${bookName} ${chapterNumber}${speakingVerse?`:${speakingVerse}`:''}`}</strong></div>
      {participant && party.following ? <><button onClick={party.toggleNarration} aria-pressed={party.narrationMuted}>{party.narrationMuted?'Unmute narration':'Mute narration'}</button>{(!party.following||!samePassage)&&<button className="primary" onClick={()=>{party.returnToHost();setMobileView('reader');}}>Return to host</button>}{party.needsArm&&<button onClick={()=>{speech.unlock?.();party.arm();}}>Enable narration</button>}</> : <>{speechControls}{participant&&<button onClick={party.returnToHost}>Return to host</button>}</>}
    </div>
    <div className="room-controls"><button aria-label={ui.audio} onClick={()=>{if(view==='home')openReader();openTool('sound');}}><VolumeHighIcon/><span>{ui.audio}</span></button>{party.active&&<><button aria-label={ui.group} onClick={()=>{if(view==='home')openReader();openTool('group');}}><ReaderIcon name="people"/><span>Group · {party.members.length}</span></button><button className="leave-button" onClick={party.leaveParty}>Leave</button></>}</div>
  </footer>;
  return <><div hidden={view!=='home'} className={party.active?'home-in-session':''}>
    <Landing app={app} onEnterReader={()=>{app.markProgress();returnToReading();openReader();}} onGroupStudy={()=>{openReader();openTool('group');}} onBookmarks={()=>{openReader();openLibrary('bookmarks');}} onPreferences={()=>tools.open('settings')} onBreakdown={(b,c,v)=>{app.goToVerse(b,c,v);setBreakdownRef({bookId:b,chapter:c,verse:v});openReader();openTool('breakdown');}} onProgress={()=>{openReader();openTool('progress');}} onStudy={()=>{openReader();openTool('study');}} onShareImage={(b,c,v)=>{void ledger.recordShare('image',b,c,v);}} progress={{chapters:ledger.chapters,streak:ledger.streak,percent:ledger.canon.all.percent,have:ledger.canon.all.have,need:ledger.canon.all.need}} partyMembers={party.active?party.members.length:0} banner={<ReminderBanner reminder={reminder}/>} />
    {view==='home'&&tools.focused==='settings'&&preferences}
    {party.active&&<div className="home-session"><button onClick={openReader}>Return to study · {stageReference}</button>{dock}</div>}
  </div>
  <div hidden={view!=='reader'} className={`study-workspace ${tools.focused?'has-tools':''} ${party.active?'group-reading':''} ${library?'has-library':''} ${tools.focused&&pageTools.includes(tools.focused)?'page-tool':''}`} data-mobile-view={mobileView}>
    <header className="workspace-header"><button className="workspace-brand" onClick={openHome} aria-label={label.home}><BookBibleIcon/><span>The Word</span></button>
      <div className="passage-picker"><button onClick={()=>openLibrary('books')}>{bookName} {chapterNumber} <span>⌄</span></button><span>{app.translations.find(t=>t.id===app.translationId)?.shortName}</span></div>
      <nav aria-label="Reader tools">
        <button data-read-nav aria-pressed={!library&&!tools.focused} onClick={returnToReading}><ReaderIcon name="book"/><span>{ui.read}</span></button>
        <button aria-pressed={library==='search'} onClick={()=>openLibrary('search')}><ReaderIcon name="search"/><span>{label.search}</span></button>
        <button aria-pressed={library==='bookmarks'} onClick={()=>openLibrary('bookmarks')}><ReaderIcon name="bookmark"/><span>{ui.saved}</span></button>
        <button aria-pressed={tools.focused==='study'} onClick={()=>openTool('study')}><ReaderIcon name="people"/><span>{ui.study}</span></button>
        <button aria-label={label.settings} aria-pressed={tools.focused==='settings'} onClick={()=>openTool('settings')}><ReaderIcon name="settings"/><span>{label.settings}</span></button>
      </nav>
    </header>
    {party.active&&<section className="session-strip compact" aria-label="Study participants"><div className="session-heading"><span><i className="live-dot"/>{ui.group} <small>· {party.isHost?'You are hosting':`${hostName} is hosting`} · {partyStatusText(party.status,label)}</small></span><button onClick={()=>openTool('group')}>{ui.group}</button></div>
      {party.active&&(party.screenOn||party.screenMemberId)&&<ScreenStage
        stream={party.screenOn?party.screenStream:(party.screenMemberId?party.remoteStreams[party.screenMemberId]??null:null)}
        isSelf={party.screenOn}
        presenterName={party.members.find(m=>m.id===party.screenMemberId)?.name??''}
        hasAudio={party.screenHasAudio}
        onStop={party.stopScreen}
      />}
      <FaceRail members={party.members} selfId={party.identity.id} selfAvatar={party.avatar} localStream={party.localStream} remoteStreams={party.remoteStreams} micOn={party.micOn} youSuffix={label.youSuffix} mutedLabel={label.muted} onPickPhoto={file=>{void party.setAvatar(file);}}/>
    </section>}

    <main className="workspace-body">
      <aside className="library-pane" aria-label="Scripture library" hidden={!library} onKeyDown={event=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();returnToReading();}}}><button ref={libraryBack} className="back-to-reading pane-close" aria-label={ui.back} title={ui.back} onClick={returnToReading}><span aria-hidden="true">×</span></button><nav className="library-tabs" aria-label="Library sections"><button aria-pressed={library==='books'} onClick={()=>setLibrary('books')}>Books</button><button aria-pressed={library==='search'} onClick={()=>setLibrary('search')}>Search</button><button aria-pressed={library==='bookmarks'} onClick={()=>setLibrary('bookmarks')}>Saved</button></nav>
        <div hidden={library!=='books'} className="book-navigation"><span className="workspace-eyebrow">Find your passage</span><h2>The Scriptures</h2><label>{label.translation}<SearchableSelect value={app.translationId} onChange={value=>{party.browseIndependently();app.changeTranslation(value);}} label={label.translation} filterPlaceholder={label.filterPlaceholder} options={app.translationOptions}/></label><label>{label.book}<SearchableSelect value={String(app.bookId)} onChange={value=>navigate(+value,1)} label={label.book} filterPlaceholder={label.filterPlaceholder} options={app.bookOptions}/></label><label>{label.chapter}<SearchableSelect searchable={false} value={String(chapterNumber)} onChange={value=>navigate(app.bookId,+value)} label={label.chapter} filterPlaceholder={label.filterPlaceholder} options={app.chapterOptions}/></label><p className="muted">{label.footerFree}<br/>{label.footerLocal}</p></div>
        <div hidden={library!=='search'}><div className="search-panel">
          <div className="search-header"><h2>{label.searchTitle} · {app.translations.find((item) => item.id === app.translationId)?.shortName}</h2><button onClick={returnToReading} aria-label={label.search}>×</button></div>
          <input ref={searchInput} aria-label={label.search} placeholder={label.searchPlaceholder} value={app.query} onChange={(event) => { app.setQuery(event.target.value); if (event.target.value.trim()) app.setSelectedTopic(''); }} />
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
                <button className="result" key={`${result.translationId}:${result.verse.ref.bookId}:${result.verse.ref.chapter}:${result.verse.ref.verse}`} onClick={() => { navigate(result.verse.ref.bookId, result.verse.ref.chapter, result.verse.ref.verse); }}>
                  <strong>{localBible.getBook(result.verse.ref.bookId, app.translationId)?.name} {result.verse.ref.chapter}:{result.verse.ref.verse}</strong>
                  <span>{result.verse.text}</span>
                </button>
              )) : !app.searchLoading && <p className="muted">{label.noMatches}</p>}
            </div>
          )}
        </div></div><div hidden={library!=='bookmarks'}><div className="bookmarks-panel">
          <div className="panel-header"><h2>{label.bookmarks}</h2><button onClick={returnToReading} aria-label={label.closeBookmarks}>×</button></div>
          {app.bookmarkList.length ? app.bookmarkList.map((entry) => (
            <button className="bookmark-item" key={`${entry.bookId}:${entry.chapter}:${entry.verse}`} onClick={() => { navigate(entry.bookId, entry.chapter, entry.verse); }}>
              <span className="bookmark-reference">{app.books.find((item) => item.id === entry.bookId)?.name} {entry.chapter}:{entry.verse}</span>
              <span className="bookmark-verse-text">{entry.bookId === app.bookId && entry.chapter === chapterNumber ? chapter?.verses.find((verse) => verse.ref.verse === entry.verse)?.text ?? '' : ''}</span>
              {ledger.noteAt(entry.bookId, entry.chapter, entry.verse) ? <span className="bookmark-note">{ledger.noteAt(entry.bookId, entry.chapter, entry.verse)!.text}</span> : null}
            </button>
          )) : <p className="muted">{label.noBookmarks}</p>}
          <h3 className="section-label">{label.yourNotes}</h3>
          {ledger.notes.length ? ledger.notes.map((note) => (
            <button className="bookmark-item" key={note.id} onClick={() => { navigate(note.bookId, note.chapter, note.verse); }}>
              <span className="bookmark-reference">{app.books.find((item) => item.id === note.bookId)?.name} {note.chapter}:{note.verse}{note.share === 'friends' ? ' · ' + label.shareWithFriends : ''}</span>
              <span className="bookmark-note">{note.text}</span>
            </button>
          )) : <p className="muted">{label.noNotes}</p>}
        </div></div>
      </aside>
      <section className="reader-column" aria-label="Scripture passage">
        <div className="reader-heading"><span className="workspace-eyebrow">{app.translations.find(t=>t.id===app.translationId)?.name??'Holy Bible'}</span><h1>{bookName} <span>{chapterNumber}</span></h1><div className="chapter-nav"><button onClick={()=>navigate(app.bookId,chapterNumber-1)} disabled={chapterNumber===1}>← {label.previous}</button><span>Chapter {chapterNumber}{book?` of ${book.chapters}`:''}</span><button onClick={()=>navigate(app.bookId,chapterNumber+1)} disabled={!book||chapterNumber===book.chapters}>{label.next} →</button></div></div>
        {party.active&&<div className="presentation-status">{party.isHost?<><button aria-pressed={party.presenting} onClick={()=>party.setPresenting(!party.presenting)}>{party.presenting?'Present mode on':'Present mode off'}</button><span>{party.presenting?'Your verse clicks are shared.':'Your selections are private.'}</span><button onClick={()=>{app.stopSpeech();party.showGroup(app.selectedVerseNumbers.length?app.selectedVerseNumbers:[currentVerse]);}}>Discuss this passage</button></>:<><span>{party.following?`Following ${hostName}`:'Browsing independently'}</span><button onClick={()=>{party.following?party.browseIndependently():party.returnToHost();}}>{party.following?'Browse independently':'Return to host'}</button></>}</div>}
        {chapterLoading?<div className="empty-state" role="status">{label.loading}</div>:chapter?<article className="reader" style={{fontSize:`${app.fontSize}px`}}>{chapter.verses.map(verse=>{
          const number=verse.ref.verse, selected=selectedVerses.has(number), speaking=speakingVerse===number, shared=party.highlights.includes(number), following=followVerse===number;
          return <span key={number} ref={el=>{verseRefs.current[number]=el;}} className={['verse',selected?'selected':'',speaking?'speaking':'',shared?'shared-highlight':'',following?'following':'',app.focusedVerse===number?'focused':''].filter(Boolean).join(' ')}>
            <span role="button" tabIndex={0} className="verse-select" onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();app.toggleVerse(number);if(party.active&&party.isHost&&party.presenting)party.setFocusVerse(number);}}} aria-label={`Select ${bookName} ${chapterNumber}:${number}`} aria-pressed={selected} onClick={()=>{app.toggleVerse(number);if(party.active&&party.isHost&&party.presenting)party.setFocusVerse(number);}}><sup>{number}</sup><span>{verseRuns(verse.text,verse.redLetters).map((run,i)=><span key={i} className={run.red?'words-of-jesus':undefined}>{run.text}</span>)}</span>{app.bookmarks.has(app.bookmarkKey(number))&&<span className="bookmark" aria-label={label.bookmarks}>◆</span>}{ledger.noteAt(app.bookId,chapterNumber,number)&&<span className="verse-note-mark" aria-label={label.noteFor}>✎</span>}</span>
            <button className="xref-mark" aria-label={`Explore ${bookName} ${chapterNumber}:${number}`} title="Explore this verse" onClick={()=>inspect(number,'references')}>※</button>{speaking&&<span className="sr-only">Currently reading</span>}{shared&&<span className="sr-only">Shared highlight</span>}
          </span>;
        })}</article>:<div className="empty-state"><h2>{label.chapterMissingTitle}</h2><p>{label.chapterMissingBody}</p></div>}
        <div className="reader-end"><span>Continue in the Word</span><button onClick={()=>navigate(app.bookId,chapterNumber+1)} disabled={!book||chapterNumber===book.chapters}>{label.next} →</button></div>
      </section>
      <ToolDock tools={tools} backLabel={ui.back} onBack={returnToReading} names={{...toolNames,settings:label.settings,study:ui.study,progress:label.progress,sound:ui.audio,share:ui.share,group:ui.group,guide:ui.context,references:ui.related,breakdown:ui.explanation,image:ui.image}}>{ {group,share:shareActions,settings:view==='reader'?preferences:null,sound,study:<><div className="study-destinations"><button onClick={()=>openTool('group')}>{ui.group}</button><button onClick={()=>openTool('progress')}>{label.progress}</button></div><StudyHub app={app} study={study} onOpenPassage={(b,c,v)=>navigate(b,c,v)} onReadTogether={()=>{openTool('group');}} onSharedVerse={(b,c,v)=>{void ledger.recordShare('feed',b,c,v);}} onFriendRequest={()=>{if(party.active)logGroupOnce('friendRequest','friendRequest');}}/></>,breakdown:<>{studySections}<Breakdown app={app} target={breakdownRef} onNavigate={(b,c,v)=>{navigate(b,c,v);setBreakdownRef({bookId:b,chapter:c,verse:v});}}/></>,progress:<ProgressPanel label={label} language={language} chapters={ledger.chapters} streak={ledger.streak} events={ledger.events} earned={ledger.earned}/>,references:<>{studySections}<PassageTools passage={passage} app={app} onNavigate={navigate} onRefresh={()=>setPassage(snapshot(app,currentVerse))} follow={followTool} onFollow={setFollowTool}/></>,guide:<>{studySections}<PassageTools guide passage={guidePassage} app={app} onNavigate={navigate} onRefresh={()=>setGuidePassage(snapshot(app,currentVerse))} follow={followGuide} onFollow={setFollowGuide}/></>,image:imageJob?<VerseImageEditor key={imageJob.reference+imageJob.text} embedded job={imageJob} fontStack={app.font.stack} label={label} onClose={returnToReading} onSaved={()=>{void ledger.recordShare('image',app.bookId,chapterNumber,currentVerse,'saved');}} onShared={()=>{void ledger.recordShare('image',app.bookId,chapterNumber,currentVerse,'shared');}}/>:<p>Select a verse to create an image.</p>} }</ToolDock>
    </main>
    {(notice||speechError||party.mediaError||party.capped)&&<div className="workspace-notice" role="status"><span>{notice||speechError||(party.mediaError==='photo'?'That photo could not be loaded.':party.mediaError==='system-audio-none'?'No audio came through. In the picker, choose a tab or your whole screen and tick "Share audio" — a single window cannot carry sound.':party.mediaError==='system-audio'?'That audio could not be shared.':party.mediaError==='screen-audio'?'Screen is sharing, but without sound. Desktop audio needs Chrome or Edge, and the "Share audio" box ticked in the picker.':party.mediaError==='screen'?'That screen could not be shared.':party.mediaError?'Microphone or camera unavailable. Check your browser permissions.':'This room is above the 8-person voice/video threshold. Chat and passage sharing remain available.')}</span>{notice&&<button onClick={()=>setNotice('')} aria-label="Dismiss message">×</button>}</div>}
    {noteVerse!==null&&<VerseNote
      reference={`${bookName} ${chapterNumber}:${noteVerse}`}
      existing={ledger.noteAt(app.bookId,chapterNumber,noteVerse)}
      label={label}
      onSave={(text,share)=>{void (async()=>{
        await ledger.saveNote(app.bookId,chapterNumber,noteVerse,text,share);
        // Sharing puts it on the timeline through the same feed the badge and
        // verse cards already use, so there is one timeline, not two.
        if(share){ await study.shareVerse(app.bookId,chapterNumber,noteVerse,text); void ledger.recordShare('feed',app.bookId,chapterNumber,noteVerse); }
        setNoteVerse(null);
      })();}}
      onDelete={()=>{void ledger.removeNote(app.bookId,chapterNumber,noteVerse);setNoteVerse(null);}}
      onClose={()=>setNoteVerse(null)}
    />}
    {selectedVerses.size>0&&!tools.focused&&!library&&<div className="workspace-selection" aria-label="Selected verse actions"><strong>{selectedReference}</strong><div>
      <button onClick={()=>app.selectedVerseNumbers.forEach(app.toggleBookmark)}>{label.bookmark}</button>
      <button onClick={()=>setNoteVerse(currentVerse)}>{ledger.noteAt(app.bookId,chapterNumber,currentVerse)?label.editNote:label.addNote}</button>
      <button onClick={()=>openTool('share')}>{label.sharePassage}</button>
      <button onClick={()=>inspect(currentVerse,'guide')}>{ui.study}</button>
      <button onClick={app.clearSelection} aria-label="Clear selection">×</button>
    </div></div>}
    {dock}
  </div>
  {party.active&&party.sharedAnswers&&<AnswerBoard shared={party.sharedAnswers} isHost={party.isHost} onStop={()=>party.shareAnswers(false)}/>}
  {party.active&&party.questionOpen&&party.question&&<QuestionPrompt question={party.question} onAnswer={party.sendAnswer} onSkip={party.skipQuestion}/>}
  {welcome.open&&<Welcome party={party} onClose={welcome.close}/>}
  {backupAsk!=='none'&&!welcome.open&&<BackupPrompt trigger={backupAsk} label={label} onDone={()=>{setBackupAsk('none');setNotice(label.backupDone);}} onLater={()=>setBackupAsk('none')}/>}</>;
}
export default App;
