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
  // Browsers require a user gesture before audio can start, so a participant taps
  // once to "read along"; until then we sync the passage but do not auto-play.
  const [armed, setArmed] = useState(false);

  const identityRef = useRef({ id: 'me-' + randomCode(), name: randomName(), color: randomFrom(COLORS) });
  // The last reading state the HOST broadcast, so we don't re-send identical updates.
  const lastSentRef = useRef<string>('');

  const startParty = useCallback((joinCode: string) => {
    const clean = joinCode.trim().toLowerCase();
    if (!clean) return;
    setError(''); setMessages([]); setMembers([]); setRemoteReading(null);
    setArmed(false); setFollowing(true); lastSentRef.current = '';
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
  const arm = useCallback(() => setArmed(true), []);

  useEffect(() => () => { room?.leave(); }, [room]);

  // HOST: reflect this device's passage + playback into the shared reading state.
  useEffect(() => {
    if (!room || !isHost) return;
    const state: ReadingState = { bookId: app.bookId, chapter: app.chapterNumber, action: actionFor(app.speechState), ts: Date.now() };
    const key = `${state.bookId}:${state.chapter}:${state.action}`;
    if (key === lastSentRef.current) return;
    lastSentRef.current = key;
    room.setReadingState(state);
  }, [room, isHost, app.bookId, app.chapterNumber, app.speechState]);

  // PARTICIPANT: apply the host's shared reading state to this device.
  useEffect(() => {
    if (!room || isHost || !remoteReading || !following) return;
    // 1. Follow the host to the passage first; re-runs once the new chapter loads.
    if (app.bookId !== remoteReading.bookId || app.chapterNumber !== remoteReading.chapter) {
      app.goTo(remoteReading.bookId, remoteReading.chapter);
      return;
    }
    // 2. Match the host's playback, once verses are ready and audio is armed.
    if (remoteReading.action === 'playing') {
      if (!armed || app.chapterLoading || !app.chapter) return;
      if (app.speechState === 'idle') app.speakChapter();
    } else if (remoteReading.action === 'paused') {
      if (app.speechState === 'speaking') app.pauseSpeech();
    } else if (remoteReading.action === 'idle') {
      if (app.speechState !== 'idle') app.stopSpeech();
    }
  }, [room, isHost, following, armed, remoteReading, app.bookId, app.chapterNumber, app.chapterLoading, app.chapter, app.speechState]);

  // A participant who is following and hasn't armed audio, while the host is playing.
  const needsArm = Boolean(room) && !isHost && following && !armed && remoteReading?.action === 'playing';

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
    identity: identityRef.current,
    createParty,
    joinParty: startParty,
    leaveParty,
    sendChat,
  };
}

export type ReadParty = ReturnType<typeof useReadParty>;
