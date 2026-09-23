// Bridges the Read Party P2P engine (readParty.ts) to the reader (useWordApp).
//  - As HOST: mirror this device's passage + playback into the shared state.
//  - As PARTICIPANT: apply the host's shared state to this device — navigate to
//    the passage and drive the local TTS. Audio is never streamed; each device
//    reads with its own Scripture and Piper voice.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WordApp } from '@the-word/core';
import { FollowReadingQueue } from './followReadingQueue';
import { joinParty, type PartyAnswer, type PartyChatMessage, type PartyMember, type PartyQuestion, type PartyRoom, type ReadingState, type SharedAnswers } from './readParty';
import { compressAvatar, loadIdentity, saveIdentity } from './identity';
import { getCameraStream, getLocalStream, getScreenStream, getSystemAudioVolume, getVoiceFilter, setMedia, setSystemAudioVolume as applySystemAudioVolume, setVoiceFilter as applyVoiceFilter, startScreenShare, startSystemAudio, stopLocal, stopScreenShare, stopSystemAudio, unlockRemoteAudio, setDevices } from './media';

function randomCode(): string { return Math.random().toString(36).slice(2, 7); }

const MEMBER_KEY = 'word.partyMember';

// One seat per tab. A refresh reuses this id so the room replaces the old
// connection instead of adding another copy of the same person.
let memoryMemberId = '';

export function memberIdFor(accountId: string): string {
  const prefix = `${accountId}-`;
  const fresh = () => `${prefix}${Math.random().toString(36).slice(2, 10)}`;
  try {
    const existing = sessionStorage.getItem(MEMBER_KEY);
    if (existing && existing.startsWith(prefix) && existing.length <= 120) return existing;
    const created = fresh();
    sessionStorage.setItem(MEMBER_KEY, created);
    return created;
  } catch {
    // Sharing the bare account id across tabs makes those tabs kick each other.
    if (!memoryMemberId.startsWith(prefix)) memoryMemberId = fresh();
    return memoryMemberId;
  }
}

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
  const [question, setQuestion] = useState<PartyQuestion | null>(null);
  const [answerList, setAnswerList] = useState<PartyAnswer[]>([]);
  const [sharedAnswers, setSharedAnswers] = useState<SharedAnswers | null>(null);
  // Which question this device has already replied to, so the prompt closes
  // for you without waiting on a round trip.
  const [answeredId, setAnsweredId] = useState<string | null>(null);
  const [systemAudioOn, setSystemAudioOn] = useState(false);
  const [systemAudioVolume, setSystemAudioVolumeState] = useState(getSystemAudioVolume);
  const [voiceFilter, setVoiceFilterState] = useState(getVoiceFilter);
  const roomRef = useRef<PartyRoom | null>(null);
  const capturePending = useRef(false);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [screenOn, setScreenOn] = useState(false);
  const [screenStream, setScreenStreamState] = useState<MediaStream | null>(null);
  const [screenHasAudio, setScreenHasAudio] = useState(false);
  const [capped, setCapped] = useState(false);
  const [focusVerse, setFocusVerseState] = useState<number | null>(null);
  const [shared, setShared] = useState<ReadingState | null>(null);
  const [narrationMuted, setNarrationMuted] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const appRef = useRef(app); appRef.current = app;
  const sharedRef = useRef(shared); sharedRef.current = shared;
  const hadHost = useRef(false);
  const roleChanged = useRef(false);
  const [roleEpoch, setRoleEpoch] = useState(0);
  const [findable, setFindable] = useState(false);

  const identityRef = useRef(loadIdentity());
  const sessionIdRef = useRef(memberIdFor(identityRef.current.id));
  const [name, setNameValue] = useState(identityRef.current.name);
  const [avatar, setAvatarValue] = useState<string | null>(identityRef.current.avatar);
  // The last reading state the HOST broadcast, so we don't re-send identical updates.
  const lastSentRef = useRef<string>('');
  const followQueue = useRef(new FollowReadingQueue());

  const startParty = useCallback((joinCode: string, opts?: { armed?: boolean; findable?: boolean; create?: boolean }) => {
    if (roomRef.current) return;
    const clean = joinCode.trim().toLowerCase();
    if (!clean) return;
    appRef.current.stopSpeech(); setShared(null); setPresenting(false); setNarrationMuted(false);
    setError(''); setMessages([]); setMembers([]); setRemoteReading(null);
    setArmed(Boolean(opts?.armed)); setFollowing(true); lastSentRef.current = '';
    followQueue.current.reset();
    setRemoteStreams({}); setMediaError(''); setCapped(false); setFocusVerseState(null);
    setFindable(Boolean(opts?.findable));
    const r = joinParty({
      code: clean,
      create: Boolean(opts?.create),
      identity: { ...identityRef.current, id: sessionIdRef.current },
      handlers: {
        onStatus: setStatus,
        onSelf: ({ host }) => setIsHost(host),
        onRoster: (list, meta) => { setMembers(list); setIsHost(meta.host); setCapped(meta.capped); },
        onChat: (msg) => setMessages((prev) => prev.some(item => item.id === msg.id) ? prev : [...prev.slice(-199), msg]),
        onQuestion: (next) => {
          setQuestion(next);
          // A fresh question re-opens the prompt even for someone who answered the last one.
          if (!next) setAnsweredId(null);
          else setAnsweredId((prev) => (prev === next.id ? prev : null));
          if (!next) setAnswerList([]);
        },
        onAnswerList: (list) => setAnswerList(list),
        onSharedAnswers: (shared) => setSharedAnswers(shared),
        // Capture every message before React batches renders, including short
        // verses that arrive together while a slower device is still speaking.
        onReading: (state) => { followQueue.current.receive(state); setRemoteReading(state); setShared(state); },
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
    roomRef.current = r;
    setRoom(r);
  }, []);

  const createParty = useCallback((opts?: { findable?: boolean }) => startParty(randomCode(), { create: true, armed: true, findable: opts?.findable }), [startParty]);

  const leaveParty = useCallback(() => {
    appRef.current.stopSpeech();
    room?.leave();
    followQueue.current.reset();
    roomRef.current = null;
    capturePending.current = false;
    setMediaBusy(false);
    setShared(null); setPresenting(false);
    stopLocal();
    setLocalStream(null); setMicOn(false); setCamOn(false); setRemoteStreams({});
    setRoom(null); setIsHost(false); setMembers([]); setMessages([]);
    setStatus(''); setError(''); setCode(''); setRemoteReading(null); setArmed(false);
    setMediaError(''); setCapped(false); setFocusVerseState(null); setFindable(false);
    setScreenOn(false); setScreenStreamState(null); setScreenHasAudio(false);
    setQuestion(null); setAnswerList([]); setSharedAnswers(null); setAnsweredId(null);
    setSystemAudioOn(false);
    lastSentRef.current = '';
  }, [room]);

  const sendChat = useCallback((text: string) => {
    if (!room || (status !== 'connected' && status !== 'hosting')) { setError('connection-not-ready'); return false; }
    room.sendChat(text); return true;
  }, [room, status]);
  const arm = useCallback(() => {
    // Retry the interrupted verse and retain everything queued behind it.
    if (appRef.current.speechState === 'paused') appRef.current.resumeSpeech();
    setArmed(true);
  }, []);

  const applyMedia = useCallback(async (audio: boolean, video: boolean) => {
    if (!room || capturePending.current) return;
    capturePending.current = true;
    setMediaBusy(true);
    setMediaError('');
    try {
      await setMedia({ audio, video });
      if (roomRef.current !== room) return;
      setMicOn(audio);
      setCamOn(video);
      // The self tile shows your camera; peers receive the composite from media.ts.
      setLocalStream(getCameraStream());
      room.refreshMedia();
    } catch (error) {
      if (roomRef.current !== room || (error as Error).name === 'AbortError') return;
      // A refused camera must not tear down an already working microphone.
      setMediaError('denied');
    } finally {
      if (roomRef.current === room) { capturePending.current = false; setMediaBusy(false); }
    }
  }, [room]);

  // Joining follows Scripture immediately; capture starts only from the visible
  // microphone/camera controls, matching the join screen's promise.

  const setVoiceFiltering = useCallback((on: boolean) => {
    applyVoiceFilter(on);
    setVoiceFilterState(on);
    setLocalStream(getCameraStream());
    // The published stream changed, so peers need the new one.
    room?.refreshMedia();
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

  const askQuestion = useCallback((text: string) => {
    if (!room || !isHost) return;
    room.askQuestion(text);
  }, [room, isHost]);

  const closeQuestion = useCallback(() => {
    if (!room || !isHost) return;
    room.closeQuestion();
  }, [room, isHost]);

  const shareAnswers = useCallback((on: boolean) => {
    if (!room || !isHost) return;
    room.shareAnswers(on);
  }, [room, isHost]);

  const sendAnswer = useCallback((text: string) => {
    if (!room || !question) return;
    if (status !== 'connected' && status !== 'hosting') { setError('connection-not-ready'); return; }
    const clean = text.trim();
    if (!clean) return;
    room.sendAnswer(question.id, clean);
    setAnsweredId(question.id);
  }, [room, question, status]);

  /** Dismiss the prompt without replying. Nothing is sent. */
  const skipQuestion = useCallback(() => {
    if (question) setAnsweredId(question.id);
  }, [question]);

  const stopSysAudio = useCallback(() => {
    stopSystemAudio();
    setSystemAudioOn(false);
    room?.refreshMedia();
  }, [room]);

  const startSysAudio = useCallback(async () => {
    if (!room || !isHost) return;
    setMediaError('');
    try {
      await startSystemAudio({
        // The browser's own "stop sharing" bar, rather than our button.
        onEnded: () => { stopSystemAudio(); setSystemAudioOn(false); room.refreshMedia(); },
      });
      if (roomRef.current !== room) return;
      setSystemAudioOn(true);
      room.refreshMedia();
    } catch (error) {
      if (roomRef.current !== room || (error as Error).name === 'AbortError') return;
      const name = (error as { name?: string; message?: string });
      if (name.name === 'NotAllowedError') return;   // picker dismissed
      setMediaError(name.message === 'system-audio-none' ? 'system-audio-none' : 'system-audio');
    }
  }, [room, isHost]);

  const toggleSystemAudio = useCallback(() => {
    if (systemAudioOn) stopSysAudio(); else void startSysAudio();
  }, [systemAudioOn, startSysAudio, stopSysAudio]);

  const setSystemVolume = useCallback((next: number) => {
    setSystemAudioVolumeState(applySystemAudioVolume(next));
  }, []);

  const stopScreen = useCallback(() => {
    stopScreenShare();
    setScreenOn(false);
    setScreenStreamState(null);
    setScreenHasAudio(false);
    room?.refreshMedia();
  }, [room]);

  const startScreen = useCallback(async (withAudio = true) => {
    if (!room || !isHost) return;
    setMediaError('');
    try {
      const { gotAudio } = await startScreenShare({
        withAudio,
        // Fires when the host stops sharing from the browser's own bar rather than our button.
        onEnded: () => {
          stopScreenShare();
          setScreenOn(false); setScreenStreamState(null); setScreenHasAudio(false);
          room.refreshMedia();
        },
      });
      if (roomRef.current !== room) return;
      setScreenOn(true);
      setScreenStreamState(getScreenStream());
      setScreenHasAudio(gotAudio);
      // Desktop audio is Chromium-only, and even there the picker has a checkbox
      // the host can leave off — say so instead of pretending music is going out.
      if (withAudio && !gotAudio) setMediaError('screen-audio');
      room.refreshMedia();
    } catch (error) {
      if (roomRef.current !== room || (error as Error).name === 'AbortError') return;
      // Dismissing the picker is not a failure.
      if ((error as { name?: string }).name === 'NotAllowedError') return;
      setMediaError('screen');
    }
  }, [room, isHost]);

  const toggleScreen = useCallback((withAudio = true) => {
    if (screenOn) stopScreen(); else void startScreen(withAudio);
  }, [screenOn, startScreen, stopScreen]);

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

  useEffect(() => () => {
    room?.leave();
    if (room && roomRef.current === room) { roomRef.current = null; stopLocal(); }
  }, [room]);

  const isHostRef = useRef(isHost);
  isHostRef.current = isHost;

  // A broker blip can flip the host flag for a moment. Stopping immediately is
  // what cut read-aloud off and left only "Read from here". A real handoff that
  // sticks still stops the previous reader's narration.
  useEffect(() => {
    if (hadHost.current === isHost) return;
    const next = isHost;
    const timer = setTimeout(() => {
      if (isHostRef.current !== next || hadHost.current === next) return;
      hadHost.current = next;
      roleChanged.current = true;
      setRoleEpoch((value) => value + 1);
      appRef.current.stopSpeech(); followQueue.current.reset(); lastSentRef.current = '';
      setPresenting(false);
    }, next ? 0 : 1200);
    return () => clearTimeout(timer);
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
      playbackId: app.speechSession, finished: false,
      highlights: old?.bookId === app.bookId && old.chapter === app.chapterNumber ? old.highlights : [], ts: Date.now(),
    } : old ? { ...old, action: 'live', finished: app.speechFinished, ts: Date.now() } : {
      bookId: app.bookId, chapter: app.chapterNumber, translationId: app.translationId,
      verse: null, highlights: [], action: 'live', ts: Date.now(),
    };
    const key = JSON.stringify([state.bookId,state.chapter,state.verse,state.action,state.highlights,state.translationId,state.finished,state.playbackId]);
    if (key === lastSentRef.current) return;
    lastSentRef.current = key;
    setShared(state); room.setReadingState(state);
  }, [room,isHost,app.bookId,app.chapterNumber,app.translationId,app.speechState,app.speakingVerse,app.speechFinished,app.speechSession]);

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
    followQueue.current.reset();
  }, [isHost]);
  const returnToHost = useCallback(() => {
    const current = sharedRef.current;
    if (!current) return;
    appRef.current.stopSpeech();
    setFollowing(true); followQueue.current.reset();
    appRef.current.goToVerse(current.bookId,current.chapter,current.verse || 1);
  }, []);
  const toggleNarration = useCallback(() => {
    setNarrationMuted(value => !value);
    appRef.current.stopSpeech(); followQueue.current.reset();
  }, []);
  const transferHost = useCallback((id: string) => {
    appRef.current.stopSpeech();
    room?.transferHost(id);
  }, [room]);

  // A new playback error exposes the fallback button once. Re-arming must be
  // allowed to start a fresh verse before the previous error has been cleared.
  useEffect(() => {
    if (!isHost && (app.autoplayBlocked || app.speechError) && armed) {
      setArmed(false);
    }
  }, [app.autoplayBlocked, app.speechError, isHost]);

  // A live mic never silences Scripture. Read-aloud is not streamed — each device
  // speaks the verse with its own Piper voice — and the host's own playback is
  // cancelled out of their microphone by echo cancellation, so suppressing it on
  // a live floor left the room watching a highlight in silence. When the host
  // presses Listen, everyone reads along aloud, mics open or not.

  // PARTICIPANT: synchronize at verse boundaries. Never cancel a slightly
  // slower listener just because the host started the next verse or chapter.
  useEffect(() => {
    const queue = followQueue.current;
    // hadHost stays true until a demotion has stuck, so a one-frame host flicker
    // does not take this device through the follower path and stop its reading.
    if (!room || isHost || hadHost.current || !following) { queue.reset(); return; }
    if (status !== 'connected' && status !== 'hosting') {
      if (app.speechState !== 'idle') appRef.current.stopSpeech();
      queue.reset(); return;
    }
    const rs = remoteReading;
    if (!rs) {
      queue.reset();
      if (app.speechState !== 'idle') app.stopSpeech();
      return;
    }
    // Explicit Stop/Discuss, mute and leaving follow mode remain immediate.
    if (narrationMuted || rs.action === 'idle' || (rs.action === 'live' && !rs.finished)) {
      queue.reset();
      if (app.speechState !== 'idle') app.stopSpeech();
      if (app.bookId !== rs.bookId || app.chapterNumber !== rs.chapter) app.goTo(rs.bookId, rs.chapter);
      return;
    }
    // A Stop followed by Play can arrive in a single render. Honor the Stop
    // before starting the new queue even though the latest action is playing.
    if (queue.interrupted) {
      queue.interrupted = false;
      if (app.speechState !== 'idle') { app.stopSpeech(); return; }
    }
    queue.receive(rs); // Also seeds the latest position after unmute/return.
    if (rs.action === 'paused') {
      if (app.speechState === 'speaking') app.pauseSpeech();
      return;
    }
    if (!armed) return;
    if (queue.active) {
      if (app.speechState === 'paused') {
        if (!app.speechError && !app.autoplayBlocked) app.resumeSpeech();
        return;
      }
      if (app.speechState === 'speaking') return;
      queue.active = null; // The local adapter finished the entire verse.
    }
    const next = queue.pending[0];
    const target = next ?? rs;
    // Chapter navigation waits too: changing passages can stop local audio.
    if (app.bookId !== target.bookId || app.chapterNumber !== target.chapter) {
      app.goTo(target.bookId, target.chapter);
      return;
    }
    if (!next || app.chapterLoading || !app.chapter) return;
    const loaded = app.chapter.verses[0]?.ref;
    if (!loaded || loaded.bookId !== next.bookId || loaded.chapter !== next.chapter) return;
    queue.active = queue.pending.shift()!;
    app.speakVerse(next.verse!);
  }, [room, isHost, roleEpoch, following, armed, narrationMuted, status, remoteReading, app.bookId, app.chapterNumber, app.chapterLoading, app.chapter, app.speechState, app.speechError, app.autoplayBlocked]);

  // A participant who is following and hasn't armed audio, while the host is playing.
  const needsArm = Boolean(room) && !isHost && following && !narrationMuted && !armed &&
    (remoteReading?.action === 'playing' || Boolean(remoteReading?.finished && (followQueue.current.active || followQueue.current.pending.length)));
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
    identity: { ...identityRef.current, id: sessionIdRef.current },
    mediaBusy,
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
    question,
    answerList,
    sharedAnswers,
    // True while this device still owes the open question a reply.
    questionOpen: Boolean(question) && answeredId !== question?.id,
    askQuestion,
    closeQuestion,
    sendAnswer,
    skipQuestion,
    shareAnswers,
    sharingAnswers: Boolean(sharedAnswers),
    voiceFilter,
    setVoiceFiltering,
    systemAudioOn,
    systemAudioVolume,
    toggleSystemAudio,
    setSystemVolume,
    screenOn,
    screenStream,
    screenHasAudio,
    toggleScreen,
    stopScreen,
    // Whoever is presenting a screen right now, so viewers can render it large.
    screenMemberId: members.find((m) => m.screen)?.id ?? null,
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
