// Bridges the Read Party P2P engine (readParty.ts) to the reader (useWordApp).
//  - As HOST: mirror this device's passage + playback into the shared state.
//  - As PARTICIPANT: apply the host's shared state to this device — navigate to
//    the passage and drive the local TTS. Audio is never streamed; each device
//    reads with its own Scripture and Piper voice.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WordApp } from '@the-word/core';
import { joinParty, type PartyChatMessage, type PartyMember, type PartyRoom, type ReadingState } from './readParty';
import { compressAvatar, loadIdentity, saveIdentity } from './identity';
import { getLocalStream, setMedia, stopLocal, unlockRemoteAudio, setDevices } from './media';

function randomCode(): string { return Math.random().toString(36).slice(2, 7); }

function actionFor(speechState: WordApp['speechState']): ReadingState['action'] {
  return speechState === 'speaking' ? 'playing' : speechState === 'paused' ? 'paused' : 'idle';
}

export function useReadParty(app: WordApp) {
  const [room, setRoom] = useState<PartyRoom | null>(null);
  const [code, setCode] = useState('');
  const [isHost, setIsHost] = useState(false);
  const [members, setMembers] = useState<PartyMember[]>([]);
  const [messages, setMessages] = useState<PartyChatMessage[]>([]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [remoteReading, setRemoteReading] = useState<ReadingState | null>(null);
  const [following, setFollowing] = useState(true);
  // Joining is itself a user gesture, so we arm on join and only fall back to a
  // tap-to-read-along button if the browser still blocks autoplay.
  const [armed, setArmed] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const [mediaError, setMediaError] = useState('');
  const [capped, setCapped] = useState(false);
  const [focusVerse, setFocusVerseState] = useState<number | null>(null);
  const [shared, setShared] = useState<ReadingState | null>(null);
  const [narrationMuted, setNarrationMuted] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const appRef = useRef(app); appRef.current = app;
  const sharedRef = useRef(shared); sharedRef.current = shared;
  const hadHost = useRef(false);
  const roleChanged = useRef(false);
  const [findable, setFindable] = useState(false);

  const identityRef = useRef(loadIdentity());
  const [name, setNameValue] = useState(identityRef.current.name);
  const [avatar, setAvatarValue] = useState<string | null>(identityRef.current.avatar);
  // The last reading state the HOST broadcast, so we don't re-send identical updates.
  const lastSentRef = useRef<string>('');
  // Last verse this device actually started speaking, so we don't re-trigger the
  // same verse on every heartbeat (which would stutter). Reset when position resets.
  const spokenVerseRef = useRef<number | null>(null);

  const startParty = useCallback((joinCode: string, opts?: { armed?: boolean; findable?: boolean }) => {
    const clean = joinCode.trim().toLowerCase();
    if (!clean) return;
    appRef.current.stopSpeech(); setShared(null); setPresenting(false); setNarrationMuted(false);
    setError(''); setMessages([]); setMembers([]); setRemoteReading(null);
    setArmed(Boolean(opts?.armed)); setFollowing(true); lastSentRef.current = '';
    spokenVerseRef.current = null;
    setRemoteStreams({}); setMediaError(''); setCapped(false); setFocusVerseState(null);
    setFindable(Boolean(opts?.findable));
    const r = joinParty({
      code: clean,
      identity: identityRef.current,
      handlers: {
        onStatus: setStatus,
        onSelf: ({ host }) => setIsHost(host),
        onRoster: (list, meta) => { setMembers(list); setIsHost(meta.host); setCapped(meta.capped); },
        onChat: (msg) => setMessages((prev) => [...prev.slice(-199), msg]),
        onReading: (state) => { setRemoteReading(state); setShared(state); },
        onError: (c) => setError(c),
        onRemoteStream: (id, stream) => setRemoteStreams((prev) => ({ ...prev, [id]: stream })),
        onRemoteEnd: (id) => setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        }),
      },
    });
    setCode(clean);
    setRoom(r);
  }, []);

  const createParty = useCallback((opts?: { findable?: boolean }) => startParty(randomCode(), { armed: true, findable: opts?.findable }), [startParty]);

  const leaveParty = useCallback(() => {
    appRef.current.stopSpeech();
    room?.leave();
    setShared(null); setPresenting(false);
    stopLocal();
    setLocalStream(null); setMicOn(false); setCamOn(false); setRemoteStreams({});
    setRoom(null); setIsHost(false); setMembers([]); setMessages([]);
    setStatus(''); setError(''); setCode(''); setRemoteReading(null); setArmed(false);
    setMediaError(''); setCapped(false); setFocusVerseState(null); setFindable(false);
    lastSentRef.current = '';
  }, [room]);

  const sendChat = useCallback((text: string) => { room?.sendChat(text); }, [room]);
  const arm = useCallback(() => {
    spokenVerseRef.current = null;
    setArmed(true);
  }, []);

  const applyMedia = useCallback(async (audio: boolean, video: boolean) => {
    if (!room) return;
    setMediaError('');
    try {
      await setMedia({ audio, video });
      setMicOn(audio);
      setCamOn(video);
      setLocalStream(getLocalStream());
      room.refreshMedia();
    } catch {
      setMicOn(false);
      setCamOn(false);
      setLocalStream(null);
      stopLocal();
      room.refreshMedia();
      setMediaError('denied');
    }
  }, [room]);

  const toggleMic = useCallback(() => {
    if (capped && !micOn) return;
    unlockRemoteAudio();
    void applyMedia(!micOn, camOn);
  }, [applyMedia, capped, micOn, camOn]);

  const toggleCam = useCallback(() => {
    if (capped && !camOn) return;
    unlockRemoteAudio();
    void applyMedia(micOn, !camOn);
  }, [applyMedia, capped, micOn, camOn]);

  const showGroup = useCallback((verses: number[]) => {
    if (!room || !isHost) return;
    const current = appRef.current;
    current.stopSpeech();
    setFocusVerseState(verses[0] ?? null);
    const state: ReadingState = { bookId: current.bookId, chapter: current.chapterNumber,
      translationId: current.translationId, verse: verses[0] ?? null,
      highlights: [...verses].sort((a,b)=>a-b), action: 'live', ts: Date.now() };
    setShared(state); room.setReadingState(state);
  }, [room, isHost]);
  const setFocusVerse = useCallback((verse: number) => showGroup([verse]), [showGroup]);
  const liveFloor = shared?.action === 'live';

  useEffect(() => () => { room?.leave(); }, [room]);

  // Leadership changes stop old narration before the new host deliberately starts.
  useEffect(() => {
    if (hadHost.current !== isHost) {
      roleChanged.current = true;
      appRef.current.stopSpeech(); spokenVerseRef.current = null; lastSentRef.current = '';
      setPresenting(false);
    }
    hadHost.current = isHost;
  }, [isHost]);

  // Idle navigation is private. Only explicit presentation or playback changes
  // the group's passage; selection and research cannot move other readers.
  useEffect(() => {
    if (!room || !isHost) return;
    if(roleChanged.current) { roleChanged.current=false; if(app.speechState !== 'idle') return; }
    const old = sharedRef.current;
    const playing = app.speechState !== 'idle';
    const state: ReadingState = playing ? {
      bookId: app.bookId, chapter: app.chapterNumber, translationId: app.translationId,
      verse: app.speakingVerse, action: actionFor(app.speechState),
      highlights: old?.bookId === app.bookId && old.chapter === app.chapterNumber ? old.highlights : [], ts: Date.now(),
    } : old ? { ...old, action: 'live', ts: Date.now() } : {
      bookId: app.bookId, chapter: app.chapterNumber, translationId: app.translationId,
      verse: null, highlights: [], action: 'live', ts: Date.now(),
    };
    const key = JSON.stringify([state.bookId,state.chapter,state.verse,state.action,state.highlights,state.translationId]);
    if (key === lastSentRef.current) return;
    lastSentRef.current = key;
    setShared(state); room.setReadingState(state);
  }, [room,isHost,app.bookId,app.chapterNumber,app.translationId,app.speechState,app.speakingVerse]);

  useEffect(() => {
    if (!room || !isHost) return;
    const timer = setInterval(() => {
      if (sharedRef.current) room.setReadingState({ ...sharedRef.current, ts: Date.now() });
    }, 3000);
    return () => clearInterval(timer);
  }, [room,isHost]);

  const browseIndependently = useCallback(() => {
    appRef.current.stopSpeech();
    if (!isHost) setFollowing(false);
    setPresenting(false);
    spokenVerseRef.current = null;
  }, [isHost]);
  const returnToHost = useCallback(() => {
    const current = sharedRef.current;
    if (!current) return;
    setFollowing(true); spokenVerseRef.current = null;
    appRef.current.goToVerse(current.bookId,current.chapter,current.verse || 1);
  }, []);
  const toggleNarration = useCallback(() => {
    setNarrationMuted(value => !value);
    appRef.current.stopSpeech(); spokenVerseRef.current = null;
  }, []);
  const transferHost = useCallback((id: string) => {
    appRef.current.stopSpeech();
    room?.transferHost(id);
  }, [room]);

  // If join-click unlock wasn't enough, drop armed so the fallback button appears.
  useEffect(() => {
    if (!isHost && app.autoplayBlocked && armed) {
      spokenVerseRef.current = null;
      setArmed(false);
    }
  }, [app.autoplayBlocked, isHost, armed]);

  // A live mic never silences Scripture. Read-aloud is not streamed — each device
  // speaks the verse with its own Piper voice — and the host's own playback is
  // cancelled out of their microphone by echo cancellation, so suppressing it on
  // a live floor left the room watching a highlight in silence. When the host
  // presses Listen, everyone reads along aloud, mics open or not.

  // PARTICIPANT: apply the host's shared reading state to this device — follow the
  // host's passage AND current verse, reading each verse with the local TTS.
  useEffect(() => {
    if (!room || isHost || !remoteReading || !following) return;
    if (status !== 'connected') { appRef.current.stopSpeech(); spokenVerseRef.current = null; return; }
    const rs = remoteReading;
    // 1. Follow the host to the passage first; re-runs once the new chapter loads.
    if (app.bookId !== rs.bookId || app.chapterNumber !== rs.chapter) {
      app.goTo(rs.bookId, rs.chapter);
      spokenVerseRef.current = null;
      return;
    }
    // 2. Match the host's playback command.
    if (rs.action === 'idle') {
      if (app.speechState !== 'idle') app.stopSpeech();
      spokenVerseRef.current = null;
      return;
    }
    // 'live' means the host is talking rather than reading: place everyone on the
    // verse, but do not put words in their ears.
    if (rs.action === 'live') {
      if (app.speechState !== 'idle') app.stopSpeech();
      spokenVerseRef.current = null;
      return;
    }
    if (rs.action === 'paused') {
      if (app.speechState === 'speaking') app.pauseSpeech();
      return;
    }
    // 3. action === 'playing': speak the host's current verse (audio needs arming).
    if (narrationMuted) { if (app.speechState !== 'idle') app.stopSpeech(); spokenVerseRef.current = null; return; }
    if (!armed || app.chapterLoading || !app.chapter || rs.verse == null) return;
    if (rs.verse !== spokenVerseRef.current) {
      // Host moved to a new verse — jump our local reading to it.
      spokenVerseRef.current = rs.verse;
      app.speakVerse(rs.verse);
    } else if (app.speechState === 'paused') {
      app.resumeSpeech();
    }
  }, [room, isHost, following, armed, narrationMuted, status, remoteReading, app.bookId, app.chapterNumber, app.chapterLoading, app.chapter, app.speechState]);

  // A participant who is following and hasn't armed audio, while the host is playing.
  const needsArm = Boolean(room) && !isHost && following && !narrationMuted && !armed && remoteReading?.action === 'playing';
  // The verse the host is currently on, for visual "here's where the host is"
  // highlighting even before (or without) local audio.
  const hostVerse = (Boolean(room) && !isHost && following && remoteReading && remoteReading.action !== 'idle') ? (remoteReading.verse ?? null) : null;
  const stageVisible = shared?.bookId === app.bookId && shared.chapter === app.chapterNumber;
  const stageVerse = stageVisible && (isHost || following) ? shared?.verse ?? null : null;
  const highlights = stageVisible ? shared?.highlights ?? [] : [];

  // Name and photo live in this browser only — renaming/uploading applies
  // live to the roster in an open room, and sticks for the next visit.
  const setName = useCallback((next: string) => {
    const clean = next.trim().slice(0, 40);
    if (!clean) return;
    identityRef.current.name = clean;
    setNameValue(clean);
    saveIdentity(identityRef.current);
    room?.updateIdentity({ name: clean });
  }, [room]);

  const setAvatar = useCallback(async (file: File | null) => {
    try {
      const dataUrl = file ? await compressAvatar(file) : null;
      identityRef.current.avatar = dataUrl;
      setAvatarValue(dataUrl);
      saveIdentity(identityRef.current);
      room?.updateIdentity({ avatar: dataUrl });
    } catch {
      setMediaError('photo');
    }
  }, [room]);

  return {
    chooseDevices: async (microphone:string,camera:string) => {setDevices({microphone,camera});if(micOn||camOn)await applyMedia(micOn,camOn);},
    shared, highlights, presenting, setPresenting, showGroup, browseIndependently, returnToHost,
    narrationMuted, toggleNarration, transferHost,
    active: Boolean(room),
    code,
    isHost,
    members,
    messages,
    status,
    error,
    following,
    setFollowing,
    armed,
    arm,
    needsArm,
    hostVerse,
    identity: identityRef.current,
    name,
    setName,
    avatar,
    setAvatar,
    createParty,
    joinParty: (code: string) => startParty(code, { armed: true }),
    leaveParty,
    sendChat,
    micOn,
    camOn,
    toggleMic,
    toggleCam,
    localStream,
    remoteStreams,
    mediaError,
    capped,
    liveFloor,
    setFocusVerse,
    stageVerse,
    findable,
  };
}

export type ReadParty = ReturnType<typeof useReadParty>;
