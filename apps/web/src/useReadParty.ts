// Bridges the Read Party P2P engine (readParty.ts) to the reader (useWordApp).
//  - As HOST: mirror this device's passage + playback into the shared state.
//  - As PARTICIPANT: apply the host's shared state to this device — navigate to
//    the passage and drive the local TTS. Audio is never streamed; each device
//    reads with its own Scripture and Piper voice.
import { useCallback, useEffect, useRef, useState } from 'react';
import type { WordApp } from '@the-word/core';
import { joinParty, type PartyChatMessage, type PartyMember, type PartyRoom, type ReadingState } from './readParty';

const ADJECTIVES = ['Gentle', 'Faithful', 'Bright', 'Humble', 'Steady', 'Kind', 'Quiet', 'Joyful', 'Patient', 'Bold'];
const NOUNS = ['Lamp', 'Cedar', 'River', 'Dove', 'Shepherd', 'Vine', 'Anchor', 'Harvest', 'Pilgrim', 'Beacon'];
const COLORS = ['#947849', '#5c7cfa', '#2f9e6f', '#c2571e', '#9b5cb4', '#3a86ca', '#c04b5a', '#6a8a2f'];

function randomFrom<T>(list: T[]): T { return list[Math.floor(Math.random() * list.length)]; }
function randomName(): string { return `${randomFrom(ADJECTIVES)} ${randomFrom(NOUNS)}`; }
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

  const identityRef = useRef({ id: 'me-' + randomCode(), name: randomName(), color: randomFrom(COLORS) });
  // The last reading state the HOST broadcast, so we don't re-send identical updates.
  const lastSentRef = useRef<string>('');
  // Last verse this device actually started speaking, so we don't re-trigger the
  // same verse on every heartbeat (which would stutter). Reset when position resets.
  const spokenVerseRef = useRef<number | null>(null);

  const startParty = useCallback((joinCode: string, opts?: { armed?: boolean }) => {
    const clean = joinCode.trim().toLowerCase();
    if (!clean) return;
    setError(''); setMessages([]); setMembers([]); setRemoteReading(null);
    setArmed(Boolean(opts?.armed)); setFollowing(true); lastSentRef.current = '';
    spokenVerseRef.current = null;
    const r = joinParty({
      code: clean,
      identity: identityRef.current,
      handlers: {
        onStatus: setStatus,
        onSelf: ({ host }) => setIsHost(host),
        onRoster: (list, meta) => { setMembers(list); setIsHost(meta.host); },
        onChat: (msg) => setMessages((prev) => [...prev.slice(-199), msg]),
        onReading: (state) => setRemoteReading(state),
        onError: (c) => setError(c),
      },
    });
    setCode(clean);
    setRoom(r);
  }, []);

  const createParty = useCallback(() => startParty(randomCode()), [startParty]);

  const leaveParty = useCallback(() => {
    room?.leave();
    setRoom(null); setIsHost(false); setMembers([]); setMessages([]);
    setStatus(''); setError(''); setCode(''); setRemoteReading(null); setArmed(false);
    lastSentRef.current = '';
  }, [room]);

  const sendChat = useCallback((text: string) => { room?.sendChat(text); }, [room]);
  const arm = useCallback(() => {
    spokenVerseRef.current = null;
    setArmed(true);
  }, []);

  useEffect(() => () => { room?.leave(); }, [room]);

  // HOST: reflect this device's passage + playback + current verse into the
  // shared reading state, so participants follow along verse by verse.
  useEffect(() => {
    if (!room || !isHost) return;
    const action = actionFor(app.speechState);
    const verse = action === 'idle' ? null : app.speakingVerse;
    const state: ReadingState = { bookId: app.bookId, chapter: app.chapterNumber, verse, action, ts: Date.now() };
    const key = `${state.bookId}:${state.chapter}:${state.verse}:${state.action}`;
    if (key === lastSentRef.current) return;
    lastSentRef.current = key;
    room.setReadingState(state);
  }, [room, isHost, app.bookId, app.chapterNumber, app.speechState, app.speakingVerse]);

  // HOST heartbeat: while reading, re-broadcast the current position every few
  // seconds so anyone who joined mid-verse (or briefly lagged) stays in sync.
  useEffect(() => {
    if (!room || !isHost || app.speechState === 'idle') return;
    const timer = setInterval(() => {
      room.setReadingState({ bookId: app.bookId, chapter: app.chapterNumber, verse: app.speakingVerse, action: actionFor(app.speechState), ts: Date.now() });
    }, 3000);
    return () => clearInterval(timer);
  }, [room, isHost, app.bookId, app.chapterNumber, app.speechState, app.speakingVerse]);

  // If join-click unlock wasn't enough, drop armed so the fallback button appears.
  useEffect(() => {
    if (!isHost && app.autoplayBlocked && armed) {
      spokenVerseRef.current = null;
      setArmed(false);
    }
  }, [app.autoplayBlocked, isHost, armed]);

  // PARTICIPANT: apply the host's shared reading state to this device — follow the
  // host's passage AND current verse, reading each verse with the local TTS.
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
  }, [room, isHost, following, armed, remoteReading, app.bookId, app.chapterNumber, app.chapterLoading, app.chapter, app.speechState]);

  // A participant who is following and hasn't armed audio, while the host is playing.
  const needsArm = Boolean(room) && !isHost && following && !armed && remoteReading?.action === 'playing';
  // The verse the host is currently on, for visual "here's where the host is"
  // highlighting even before (or without) local audio.
  const hostVerse = (Boolean(room) && !isHost && following && remoteReading?.action !== 'idle') ? (remoteReading?.verse ?? null) : null;

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
    createParty,
    joinParty: (code: string) => startParty(code, { armed: true }),
    leaveParty,
    sendChat,
  };
}

export type ReadParty = ReturnType<typeof useReadParty>;
