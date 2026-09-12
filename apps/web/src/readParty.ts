// ============================================================
//  readParty.ts — a serverless "Read Party" room over PeerJS.
//
//  Adapted from the star-topology room model in OpenWhisper
//  (github.com/amosroger91/OpenWhisper, js/room.js). GitHub Pages
//  serves only static files, so there is no backend: PeerJS gives
//  us WebRTC DataConnections through a free public broker.
//
//  Topology: a STAR. The first person to claim the party's
//  well-known peer-id ("tw-party-<slug>") becomes the HUB, who is
//  also the HOST. Everyone else joins as a CLIENT. The hub relays
//  chat + roster and holds the canonical reading state, and hands a
//  new joiner the current roster + reading state so they catch up.
//  If the hub leaves, clients race to reclaim the id; the winner
//  becomes the new hub/host.
//
//  Unlike OpenWhisper, reading state is HOST-AUTHORITATIVE: only the
//  host broadcasts passage/playback changes. Clients apply them
//  locally and never echo them, so there is no feedback loop.
//
//  Scripture TTS stays local (Piper). Live voice/video is a FULL MESH
//  on top: members in the call dial each other directly (lower peer-id
//  initiates). Past MESH_CAP people we keep text + verse sync but stop
//  forming media connections.
// ============================================================
import { Peer, type DataConnection, type MediaConnection } from 'peerjs';
import { getLocalStream, hasMedia, getState } from './media';

export interface PartyIdentity { id: string; name: string; color: string; avatar?: string | null; }
export interface PartyMember { id: string; name: string; color: string; peerId: string; host?: boolean; av?: boolean; mic?: boolean; cam?: boolean; screen?: boolean; avatar?: string | null; }
/** A question the host puts to the room. One at a time; asking again replaces it. */
export interface PartyQuestion { id: string; text: string; ts: number; }
/** One person's reply. Keyed by member, so answering again overwrites. */
export interface PartyAnswer { questionId: string; memberId: string; name: string; color: string; text: string; ts: number; }
/** The set the host has chosen to put on everyone's screen. Null = not sharing. */
export interface SharedAnswers { questionId: string; question: string; items: PartyAnswer[]; }

export interface PartyChatMessage {
  id: string;
  kind: 'chat' | 'system';
  from?: string;
  name?: string;
  color?: string;
  text: string;
  ts: number;
  // Present on system join/leave so each client can translate the line.
  event?: 'joined' | 'left';
}
// The shared reading session the host controls: passage, command, and the
// host's current verse so participants can follow along verse by verse.
export interface ReadingState {
  bookId: number;
  chapter: number;
  verse: number | null;
  action: 'idle' | 'playing' | 'paused' | 'live';
  ts: number;
  highlights?: number[];
  revision?: number;
  translationId?: string;
}

export interface PartyHandlers {
  onStatus?(status: string): void;
  onSelf?(info: { host: boolean }): void;
  onRoster?(members: PartyMember[], meta: { host: boolean; capped: boolean }): void;
  onChat?(message: PartyChatMessage): void;
  onReading?(state: ReadingState | null): void;
  onError?(code: string): void;
  onQuestion?(question: PartyQuestion | null): void;
  /** Host only: the answers collected so far. */
  onAnswerList?(answers: PartyAnswer[]): void;
  onSharedAnswers?(shared: SharedAnswers | null): void;
  onRemoteStream?(memberId: string, stream: MediaStream): void;
  onRemoteEnd?(memberId: string): void;
}

const CHAT_HISTORY = 100; // chat messages handed to a new joiner
const MESH_CAP = 8;       // max members before the A/V mesh is suspended

export function partyPeerId(code: string): string {
  const slug = String(code).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return 'tw-party-' + (slug || 'x');
}

function newId(): string { return 'x' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36); }

interface Envelope { t: string; d?: unknown }

export interface PartyRoom {
  readonly isHost: boolean;
  readonly size: number;
  readonly capped: boolean;
  sendChat(text: string): void;
  /** Host only: publish the shared reading state to everyone. No-op for clients. */
  setReadingState(state: ReadingState): void;
  /** Host only: put a question to the room. Replaces any question already open. */
  askQuestion(text: string): void;
  /** Host only: take the question off everyone's screen. */
  closeQuestion(): void;
  /** Answer the open question. Answering again replaces your previous answer. */
  sendAnswer(questionId: string, text: string): void;
  /** Host only: show or hide the collected answers on everyone's screen. */
  shareAnswers(on: boolean): void;
  transferHost(memberId: string): void;
  updateIdentity(next: Partial<PartyIdentity>): void;
  /** Call after setMedia(): refresh streams across the mesh and announce A/V. */
  refreshMedia(): void;
  leave(): void;
}

export function joinParty({ code, identity, handlers = {} }: {
  code: string;
  identity: PartyIdentity;
  handlers?: PartyHandlers;
}): PartyRoom {
  const HUB_ID = partyPeerId(code);
  const h = handlers;

  let peer: Peer | null = null;
  let isHub = false;
  let presenterId = '';
  let revision = 0;
  let hubConn: DataConnection | null = null;         // client: the single connection to the hub
  const clientConns = new Map<string, DataConnection>(); // hub: remotePeerId -> connection
  let members: PartyMember[] = [];
  let readingState: ReadingState | null = null;      // last known shared reading state (survives re-election)
  let question: PartyQuestion | null = null;
  const answers = new Map<string, PartyAnswer>();   // memberId -> their latest answer (hub only)
  let sharedAnswers: SharedAnswers | null = null;
  const chatLog: PartyChatMessage[] = [];
  let leaving = false;
  let reelectTimer: ReturnType<typeof setTimeout> | null = null;
  let me = identity;
  const mediaConns = new Map<string, MediaConnection>();
  let reconcileTimer: ReturnType<typeof setTimeout> | null = null;

  const status = (s: string) => h.onStatus?.(s);
  const myPeerId = () => (peer && peer.id) || '';
  const capped = () => members.length > MESH_CAP;

  function selfMember(): PartyMember {
    return { id: me.id, name: me.name, color: me.color, avatar: me.avatar || null, peerId: myPeerId(), host: me.id === presenterId, av: hasMedia(), mic: getState().audio, cam: getState().video, screen: getState().screen };
  }
  function upsert(m: PartyMember) {
    const i = members.findIndex((x) => x.id === m.id);
    if (i >= 0) members[i] = { ...members[i], ...m };
    else members.push(m);
  }
  function emitRoster() {
    if (isHub) members = members.map(m => ({ ...m, host: m.id === presenterId }));
    else presenterId = members.find(m => m.host)?.id || '';
    h.onRoster?.(members.slice(), { host: presenterId === me.id, capped: capped() });
    scheduleReconcile();
  }

  function broadcast(env: Envelope, exceptPeerId?: string) {
    for (const [pid, c] of clientConns) {
      if (pid === exceptPeerId) continue;
      try { if (c.open) c.send(env); } catch { /* dropped connection */ }
    }
  }
  function toHub(env: Envelope) {
    if (isHub) handleAtHub(env, null);
    else { try { if (hubConn && hubConn.open) hubConn.send(env); } catch { /* dropped */ } }
  }

  function recordChat(msg: PartyChatMessage) {
    chatLog.push(msg);
    if (chatLog.length > CHAT_HISTORY) chatLog.splice(0, chatLog.length - CHAT_HISTORY);
    h.onChat?.(msg);
  }
  function systemMessage(text: string, event?: 'joined' | 'left', name?: string): PartyChatMessage {
    return { id: newId(), kind: 'system', text, ts: Date.now(), event, name };
  }

  function publishQuestion(text: string) {
    const clean = String(text ?? '').trim().slice(0, 300);
    if (!clean) return;
    question = { id: newId(), text: clean, ts: Date.now() };
    answers.clear();
    sharedAnswers = null;   // a new question retires the previous answer board
    broadcast({ t: 'ask', d: question });
    broadcast({ t: 'answers', d: null });
    h.onQuestion?.(question);
    h.onAnswerList?.([]);
    h.onSharedAnswers?.(null);
  }

  function closeQuestionAtHub() {
    question = null;
    broadcast({ t: 'ask', d: null });
    h.onQuestion?.(null);
  }

  function recordAnswer(answer: PartyAnswer) {
    // Ignore replies to a question that has already been replaced.
    if (!question || answer.questionId !== question.id) return;
    if (!answers.has(answer.memberId) && answers.size >= 200) return;
    answers.set(answer.memberId, answer);
    h.onAnswerList?.([...answers.values()]);
    // While the board is up, a late answer should appear on it rather than
    // waiting for the host to toggle sharing off and on again.
    if (sharedAnswers && sharedAnswers.questionId === question.id) {
      sharedAnswers = { ...sharedAnswers, items: [...answers.values()] };
      broadcast({ t: 'answers', d: sharedAnswers });
      h.onSharedAnswers?.(sharedAnswers);
    }
  }

  function publishSharedAnswers(on: boolean) {
    if (on) {
      if (!question) return;
      sharedAnswers = { questionId: question.id, question: question.text, items: [...answers.values()] };
    } else {
      sharedAnswers = null;
    }
    broadcast({ t: 'answers', d: sharedAnswers });
    h.onSharedAnswers?.(sharedAnswers);
  }

  function publishReading(state: ReadingState) {
    if (!state || !Number.isInteger(state.bookId) || !Number.isInteger(state.chapter)
      || !['idle','playing','paused','live'].includes(state.action)) return;
    readingState = { ...state, highlights: (state.highlights || []).filter(v => Number.isInteger(v) && v > 0).slice(0,200), revision: ++revision, ts: Date.now() };
    broadcast({ t: 'reading', d: readingState });
    h.onReading?.(readingState);
  }
  function transfer(memberId: string) {
    if (!members.some(m => m.id === memberId)) return;
    presenterId = memberId;
    if (readingState) publishReading({ ...readingState, action: 'live' });
    emitRoster(); broadcast({ t: 'roster', d: members.slice() });
  }

  /* ---------------- hub: handle an incoming envelope ---------------- */
  function handleAtHub(env: Envelope, fromPeerId: string | null) {
    if (!env || !env.t) return;
    if (env.t === 'reading' || env.t === 'transfer') {
      const sender = fromPeerId ? members.find(m => m.peerId === fromPeerId)?.id : me.id;
      if (sender !== presenterId) return;
      if (env.t === 'reading') publishReading(env.d as ReadingState);
      else transfer(String(env.d));
    } else if (env.t === 'ask' || env.t === 'share-answers') {
      // Only whoever holds the floor may drive the question board.
      const sender = fromPeerId ? members.find(m => m.peerId === fromPeerId)?.id : me.id;
      if (sender !== presenterId) return;
      if (env.t === 'ask') {
        const d = (env.d || null) as { text?: string } | null;
        if (d && d.text) publishQuestion(d.text); else closeQuestionAtHub();
      } else {
        publishSharedAnswers(Boolean((env.d as { on?: boolean } | null)?.on));
      }
    } else if (env.t === 'answer') {
      const member = fromPeerId
        ? members.find(m => m.peerId === fromPeerId)
        : members.find(m => m.id === me.id);
      if (!member) return;
      const d = (env.d || {}) as { questionId?: string; text?: string };
      recordAnswer({
        questionId: String(d.questionId ?? ''),
        memberId: member.id,
        name: member.name || 'Reader',
        color: member.color || '#888',
        text: String(d.text ?? '').trim().slice(0, 2000),
        ts: Date.now(),
      });
    } else if (env.t === 'hello') {
      const m = (env.d || {}) as Partial<PartyMember>;
      upsert({ id: m.id!, name: m.name || 'Reader', color: m.color || '#888', avatar: m.avatar || null, peerId: fromPeerId || '', av: Boolean(m.av), mic: Boolean(m.mic), cam: Boolean(m.cam), screen: Boolean(m.screen) });
      const conn = fromPeerId ? clientConns.get(fromPeerId) : null;
      if (conn) {
        try { conn.send({ t: 'welcome', d: { roster: members.slice(), chat: chatLog.slice(-CHAT_HISTORY), reading: readingState, question, answers: sharedAnswers } }); } catch { /* dropped */ }
      }
      const sm = systemMessage(`${m.name || 'Someone'} joined the party`, 'joined', m.name || 'Someone');
      recordChat(sm); broadcast({ t: 'chat', d: sm });
      emitRoster(); broadcast({ t: 'roster', d: members.slice() });
    } else if (env.t === 'chat') {
      const member = members.find((x) => x.peerId === fromPeerId);
      const payload = (env.d || {}) as { text?: string };
      const msg: PartyChatMessage = {
        id: newId(), kind: 'chat',
        from: member?.id, name: member?.name || 'Reader', color: member?.color || '#888',
        text: String(payload.text ?? '').slice(0, 2000), ts: Date.now(),
      };
      recordChat(msg); broadcast({ t: 'chat', d: msg });
    } else if (env.t === 'meta') {
      const i = members.findIndex((x) => x.peerId === fromPeerId);
      if (i >= 0) {
        const d = (env.d || {}) as Partial<PartyMember>;
        if (d.name != null) members[i].name = d.name;
        if (d.color != null) members[i].color = d.color;
        if ('avatar' in d) members[i].avatar = d.avatar || null;
        if (d.av != null) members[i].av = Boolean(d.av);
        if (d.mic != null) members[i].mic = Boolean(d.mic);
        if (d.cam != null) members[i].cam = Boolean(d.cam);
        if (d.screen != null) members[i].screen = Boolean(d.screen);
        emitRoster(); broadcast({ t: 'roster', d: members.slice() });
      }
    }
  }

  /* ---------------- client: handle a message from the hub ---------------- */
  function handleFromHub(raw: unknown) {
    const env = raw as Envelope;
    if (!env || !env.t) return;
    if (env.t === 'welcome') {
      const d = (env.d || {}) as { roster?: PartyMember[]; chat?: PartyChatMessage[]; reading?: ReadingState | null;
        question?: PartyQuestion | null; answers?: SharedAnswers | null };
      members = (d.roster || []).slice();
      readingState = d.reading || null;
      (d.chat || []).forEach((m) => h.onChat?.(m));
      if (readingState) h.onReading?.(readingState);
      // Someone joining mid-question still gets the prompt and any shared board.
      question = d.question || null;
      sharedAnswers = d.answers || null;
      if (question) h.onQuestion?.(question);
      if (sharedAnswers) h.onSharedAnswers?.(sharedAnswers);
      emitRoster();
    } else if (env.t === 'roster') {
      members = ((env.d || []) as PartyMember[]).slice();
      emitRoster();
    } else if (env.t === 'chat') {
      h.onChat?.(env.d as PartyChatMessage);
    } else if (env.t === 'ask') {
      question = (env.d || null) as PartyQuestion | null;
      h.onQuestion?.(question);
    } else if (env.t === 'answers') {
      sharedAnswers = (env.d || null) as SharedAnswers | null;
      h.onSharedAnswers?.(sharedAnswers);
    } else if (env.t === 'reading') {
      const incoming = (env.d || null) as ReadingState | null;
      if (incoming && incoming.revision != null && readingState?.revision != null && incoming.revision <= readingState.revision) return;
      readingState = incoming;
      h.onReading?.(readingState);
    }
  }

  /* ---------------- A/V mesh ---------------- */
  function resolveMemberId(peerId: string) {
    return members.find((x) => x.peerId === peerId)?.id || peerId;
  }
  function trackCall(call: MediaConnection) {
    const pid = call.peer;
    mediaConns.set(pid, call);
    call.on('stream', (s) => h.onRemoteStream?.(resolveMemberId(pid), s));
    call.on('close', () => { mediaConns.delete(pid); h.onRemoteEnd?.(resolveMemberId(pid)); scheduleReconcile(); });
    call.on('error', () => { mediaConns.delete(pid); h.onRemoteEnd?.(resolveMemberId(pid)); scheduleReconcile(); });
  }
  function scheduleReconcile() {
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(reconcileMesh, 350);
  }
  function reconcileMesh() {
    if (capped() || !hasMedia() || !peer) return;
    const stream = getLocalStream();
    if (!stream) return;
    for (const m of members) {
      if (m.id === me.id || !m.peerId) continue;
      if (mediaConns.has(m.peerId)) continue;
      // Lower peer-id dials when both are in the call. If the other person
      // has not unmuted yet, we still dial so they can hear us.
      if (m.av && myPeerId() > m.peerId) continue;
      try { trackCall(peer.call(m.peerId, stream)); } catch { /* dial failed */ }
    }
  }
  function pruneStaleMedia() {
    const live = new Set(members.map((m) => m.peerId));
    for (const [pid, call] of mediaConns) {
      if (!live.has(pid)) {
        try { call.close(); } catch { /* ignore */ }
        mediaConns.delete(pid);
        h.onRemoteEnd?.(resolveMemberId(pid));
      }
    }
  }
  function closeAllMedia() {
    for (const [pid, call] of mediaConns) {
      try { call.close(); } catch { /* ignore */ }
      h.onRemoteEnd?.(resolveMemberId(pid));
    }
    mediaConns.clear();
  }
  function answerCalls() {
    peer!.on('call', (call) => {
      call.answer(getLocalStream() || undefined);
      trackCall(call);
    });
  }

  /* ---------------- connection lifecycle ---------------- */
  function wireClientConn(c: DataConnection) {
    hubConn = c;
    c.on('open', () => {
      status('connected');
      try { c.send({ t: 'hello', d: { id: me.id, name: me.name, color: me.color, avatar: me.avatar || null, av: hasMedia(), mic: getState().audio, cam: getState().video, screen: getState().screen } }); } catch { /* dropped */ }
    });
    c.on('data', handleFromHub);
    c.on('close', () => { if (!leaving) reelect(); });
    c.on('error', () => { if (!leaving) reelect(); });
  }

  function startAsHub() {
    isHub = true;
    presenterId = me.id;
    revision = readingState?.revision || 0;
    if (readingState) readingState = { ...readingState, action: 'live', revision: ++revision };
    members = [selfMember()];
    status('hosting');
    h.onSelf?.({ host: true });
    if (readingState) h.onReading?.(readingState);
    emitRoster();
    // A re-elected hub keeps everyone in sync by re-announcing the reading state.
    if (readingState) broadcast({ t: 'reading', d: readingState });
    peer!.on('connection', (c) => {
      c.on('open', () => { clientConns.set(c.peer, c); });
      c.on('data', (env) => handleAtHub(env as Envelope, c.peer));
      c.on('close', () => {
        clientConns.delete(c.peer);
        const m = members.find((x) => x.peerId === c.peer);
        members = members.filter((x) => x.peerId !== c.peer);
        if (m) { const sm = systemMessage(`${m.name} left the party`, 'left', m.name); recordChat(sm); broadcast({ t: 'chat', d: sm }); }
        if (m?.id === presenterId) transfer(me.id);
        pruneStaleMedia();
        emitRoster(); broadcast({ t: 'roster', d: members.slice() });
      });
      c.on('error', () => { /* ignore */ });
    });
    answerCalls();
  }

  function startAsClient() {
    isHub = false;
    status('joining');
    h.onSelf?.({ host: false });
    wireClientConn(peer!.connect(HUB_ID, { reliable: true }));
    answerCalls();
  }

  function reelect() {
    if (leaving) return;
    closeAllMedia();
    if (reelectTimer) clearTimeout(reelectTimer);
    try { peer?.destroy(); } catch { /* ignore */ }
    peer = null; hubConn = null;
    status('reconnecting');
    // Jitter so clients don't stampede the hub id at once.
    reelectTimer = setTimeout(connect, 300 + Math.random() * 900);
  }

  function connect() {
    if (leaving) return;
    status('connecting');
    peer = new Peer(HUB_ID);
    peer.on('open', () => startAsHub());
    peer.on('error', (e: { type?: string }) => {
      const type = e?.type || String(e);
      if (type === 'unavailable-id') {
        // Someone already hosts this party → join as a client.
        try { peer?.destroy(); } catch { /* ignore */ }
        peer = new Peer();
        peer.on('open', () => startAsClient());
        peer.on('error', (e2: { type?: string }) => {
          const t2 = e2?.type || String(e2);
          if (t2 === 'peer-unavailable' && !leaving) reelect(); // hub vanished mid-join
          else if (!leaving) h.onError?.(t2);
        });
      } else if (!leaving) {
        h.onError?.(type);
      }
    });
  }

  connect();

  return {
    get isHost() { return presenterId === me.id; },
    get size() { return members.length; },
    get capped() { return capped(); },
    sendChat(text: string) {
      const clean = String(text || '').trim();
      if (!clean) return;
      if (isHub) {
        const msg: PartyChatMessage = { id: newId(), kind: 'chat', from: me.id, name: me.name, color: me.color, text: clean.slice(0, 2000), ts: Date.now() };
        recordChat(msg); broadcast({ t: 'chat', d: msg });
      } else {
        toHub({ t: 'chat', d: { text: clean } });
      }
    },
    setReadingState(state: ReadingState) {
      if (presenterId !== me.id) return;
      toHub({ t: 'reading', d: state });
    },
    askQuestion(text: string) { toHub({ t: 'ask', d: { text } }); },
    closeQuestion() { toHub({ t: 'ask', d: null }); },
    sendAnswer(questionId: string, text: string) { toHub({ t: 'answer', d: { questionId, text } }); },
    shareAnswers(on: boolean) { toHub({ t: 'share-answers', d: { on } }); },
    transferHost(memberId: string) {
      if (presenterId !== me.id) return;
      toHub({ t: 'transfer', d: memberId });
    },
    updateIdentity(next: Partial<PartyIdentity>) {
      me = { ...me, ...next };
      const i = members.findIndex((x) => x.id === me.id);
      if (i >= 0) { members[i].name = me.name; members[i].color = me.color; members[i].avatar = me.avatar || null; }
      if (isHub) { emitRoster(); broadcast({ t: 'roster', d: members.slice() }); }
      else toHub({ t: 'meta', d: { name: me.name, color: me.color, avatar: me.avatar || null, av: hasMedia(), mic: getState().audio, cam: getState().video, screen: getState().screen } });
    },
    refreshMedia() {
      closeAllMedia();
      const i = members.findIndex((x) => x.id === me.id);
      if (i >= 0) { members[i].av = hasMedia(); members[i].mic = getState().audio; members[i].cam = getState().video; members[i].screen = getState().screen; }
      if (isHub) { emitRoster(); broadcast({ t: 'roster', d: members.slice() }); }
      else { toHub({ t: 'meta', d: { av: hasMedia(), mic: getState().audio, cam: getState().video, screen: getState().screen } }); scheduleReconcile(); }
    },
    leave() {
      leaving = true;
      closeAllMedia();
      if (reelectTimer) clearTimeout(reelectTimer);
      if (reconcileTimer) clearTimeout(reconcileTimer);
      try { for (const c of clientConns.values()) c.close(); } catch { /* ignore */ }
      clientConns.clear();
      try { hubConn?.close(); } catch { /* ignore */ }
      try { peer?.destroy(); } catch { /* ignore */ }
      peer = null;
    },
  };
}
