// Bridges the Read Party P2P engine (readParty.ts) to the reader (useWordApp).
//  - As HOST: mirror this device's passage + playback into the shared state.
//  - As PARTICIPANT: apply the host's shared state to this device — navigate to
//    the passage and drive the local TTS. Audio is never streamed; each device
//    reads with its own Scripture and Piper voice.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WordApp } from '@the-word/core';
import { joinParty, type PartyChatMessage, type PartyMember, type PartyRoom, type ReadingState } from './readParty';
import { compressAvatar, loadIdentity, saveIdentity } from './identity';
import { getLocalStream, setMedia, stopLocal } from './media';

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
        onReading: (state) => setRemoteReading(state),
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

  const createParty = useCallback((opts?: { findable?: boolean }) => startParty(randomCode(), { findable: opts?.findable }), [startParty]);

  const leaveParty = useCallback(() => {
    room?.leave();
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
    void applyMedia(!micOn, camOn);
  }, [applyMedia, capped, micOn, camOn]);

  const toggleCam = useCallback(() => {
    if (capped && !camOn) return;
    void applyMedia(micOn, !camOn);
  }, [applyMedia, capped, micOn, camOn]);

  const setFocusVerse = useCallback((verse: number) => {
    setFocusVerseState(verse);
  }, []);

  const liveFloor = micOn || camOn || Object.keys(remoteStreams).length > 0;

  useEffect(() => () => { room?.leave(); }, [room]);

  // HOST: reflect this device's passage + playback + current verse into the
  // shared reading state, so participants follow along verse by verse.
  useEffect(() => {
    if (!room || !isHost) return;
    const spoken = actionFor(app.speechState);
    const action: ReadingState['action'] = spoken !== 'idle' ? spoken : (focusVerse != null || liveFloor ? 'live' : 'idle');
    const verse = app.speakingVerse ?? (action === 'idle' ? null : focusVerse);
    const state: ReadingState = { bookId: app.bookId, chapter: app.chapterNumber, verse, action, ts: Date.now() };
    const key = `${state.bookId}:${state.chapter}:${state.verse}:${state.action}`;
    if (key === lastSentRef.current) return;
    lastSentRef.current = key;
    room.setReadingState(state);
  }, [room, isHost, app.bookId, app.chapterNumber, app.speechState, app.speakingVerse, focusVerse, liveFloor]);

  // HOST heartbeat: while reading (Piper or live), re-broadcast the current
  // position every few seconds so anyone who joined mid-verse stays in sync.
  useEffect(() => {
    if (!room || !isHost) return;
    if (app.speechState === 'idle' && focusVerse == null && !liveFloor) return;
    const timer = setInterval(() => {
      const spoken = actionFor(app.speechState);
      const action: ReadingState['action'] = spoken !== 'idle' ? spoken : (focusVerse != null || liveFloor ? 'live' : 'idle');
      room.setReadingState({
        bookId: app.bookId,
        chapter: app.chapterNumber,
        verse: app.speakingVerse ?? focusVerse,
        action,
        ts: Date.now(),
      });
    }, 3000);
    return () => clearInterval(timer);
  }, [room, isHost, app.bookId, app.chapterNumber, app.speechState, app.speakingVerse, focusVerse, liveFloor]);

  // If join-click unlock wasn't enough, drop armed so the fallback button appears.
  useEffect(() => {
    if (!isHost && app.autoplayBlocked && armed) {
      spokenVerseRef.current = null;
      setArmed(false);
    }
  }, [app.autoplayBlocked, isHost, armed]);

  // Live mics take the floor: don't let Piper talk over people.
  useEffect(() => {
    if (liveFloor && app.speechState !== 'idle') app.stopSpeech();
  }, [liveFloor, app.speechState, app.stopSpeech]);

  // PARTICIPANT: apply the host's shared reading state to this device — follow the
  // host's passage AND current verse, reading each verse with the local TTS
  // unless someone is on a live mic (then we only highlight).
  useEffect(() => {
    if (!room || isHost || !remoteReading || !following) return;
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
    if (rs.action === 'live' || liveFloor) {
      if (app.speechState !== 'idle') app.stopSpeech();
      spokenVerseRef.current = null;
      return;
    }
    if (rs.action === 'paused') {
      if (app.speechState === 'speaking') app.pauseSpeech();
      return;
    }
    // 3. action === 'playing': speak the host's current verse (audio needs arming).
    if (!armed || app.chapterLoading || !app.chapter || rs.verse == null) return;
    if (rs.verse !== spokenVerseRef.current) {
      // Host moved to a new verse — jump our local reading to it.
      spokenVerseRef.current = rs.verse;
      app.speakVerse(rs.verse);
    } else if (app.speechState === 'paused') {
      app.resumeSpeech();
    }
  }, [room, isHost, following, armed, remoteReading, liveFloor, app.bookId, app.chapterNumber, app.chapterLoading, app.chapter, app.speechState]);

  // A participant who is following and hasn't armed audio, while the host is playing.
  const needsArm = Boolean(room) && !isHost && following && !armed && remoteReading?.action === 'playing';
  // The verse the host is currently on, for visual "here's where the host is"
  // highlighting even before (or without) local audio.
  const hostVerse = (Boolean(room) && !isHost && following && remoteReading && remoteReading.action !== 'idle') ? (remoteReading.verse ?? null) : null;
  const stageVerse = isHost ? (app.speakingVerse ?? focusVerse) : hostVerse;

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
