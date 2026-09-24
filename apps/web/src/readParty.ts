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
  /** Natural completion lets listeners finish their queue; Stop clears it. */
  finished?: boolean;
  /** Distinguishes replaying the same verse from an ordinary heartbeat. */
  playbackId?: number;
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

export function joinParty({ code, identity, handlers = {}, create = true }: {
  code: string;
  identity: PartyIdentity;
  handlers?: PartyHandlers;
  create?: boolean;
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
  let joined = false;
  let isHubEstablished = false;
  let reelectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let sweepTimer: ReturnType<typeof setInterval> | null = null;
  let pingTimer: ReturnType<typeof setInterval> | null = null;
  let reconnectAttempt = 0;
  let sweeping = false;
  const dropping = new Set<string>();
  const seenAt = new Map<string, number>();
  const retired = new Map<DataConnection, ReturnType<typeof setTimeout>>();
  let me = identity;
  const mediaConns = new Map<string, MediaConnection>();
  const mediaOwners = new Map<string, string>();
  const mediaRetries = new Map<string, { failures: number; after: number }>();
  let reconcileTimer: ReturnType<typeof setTimeout> | null = null;
  let connectionTimer: ReturnType<typeof setTimeout> | null = null;

  const status = (s: string) => {
    if (s === 'hosting' || s === 'connected') h.onError?.('');
    h.onStatus?.(s);
  };
  function watchConnection() {
    if (connectionTimer) clearTimeout(connectionTimer);
    connectionTimer = setTimeout(() => {
      if (leaving) return;
      if (joined) reelect();
      else { status('disconnected'); h.onError?.('connection-timeout'); }
    }, 20000);
  }
  function connectionReady() {
    if (connectionTimer) clearTimeout(connectionTimer);
    connectionTimer = null;
  }
  const myPeerId = () => (peer && peer.id) || '';
  const capped = () => members.length > MESH_CAP;

  function noteSeen(peerId: string) {
    if (peerId) seenAt.set(peerId, Date.now());
  }
  // PeerJS keeps a data connection "open" after the other tab is gone until ICE
  // gives up. A failed or long-disconnected channel is a ghost seat: it still
  // receives roster and verse broadcasts, which is what lags the host.
  function connectionDead(c: DataConnection): boolean {
    const state = c.peerConnection?.connectionState;
    if (state === 'failed' || state === 'closed') return true;
    if (state === 'disconnected') return Date.now() - (seenAt.get(c.peer) ?? Date.now()) > 20000;
    return false;
  }
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
    if (!sweeping) sweep();
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
    deliverAnswerList();
    h.onSharedAnswers?.(null);
  }

  function closeQuestionAtHub() {
    question = null;
    answers.clear();
    sharedAnswers = null;
    broadcast({ t: 'ask', d: null });
    broadcast({ t: 'answers', d: null });
    h.onQuestion?.(null);
    h.onSharedAnswers?.(null);
    deliverAnswerList();
  }

  function deliverAnswerList() {
    const list = [...answers.values()];
    h.onAnswerList?.(presenterId === me.id ? list : []);
    const host = members.find(m => m.id === presenterId);
    const connection = host ? clientConns.get(host.peerId) : null;
    if (connection?.open) connection.send({ t: 'answer-list', d: list });
  }

  function recordAnswer(answer: PartyAnswer) {
    // Ignore replies to a question that has already been replaced.
    if (!question || answer.questionId !== question.id) return;
    if (!answers.has(answer.memberId) && answers.size >= 200) return;
    answers.set(answer.memberId, answer);
    deliverAnswerList();
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
    if (state.bookId < 1 || state.bookId > 66 || state.chapter < 1 || state.chapter > 150
      || (state.verse !== null && (!Number.isInteger(state.verse) || state.verse < 1 || state.verse > 176))) return;
    readingState = { ...state, highlights: (Array.isArray(state.highlights) ? state.highlights : []).filter(v => Number.isInteger(v) && v > 0).slice(0,200), revision: ++revision, ts: Date.now() };
    broadcast({ t: 'reading', d: readingState });
    h.onReading?.(readingState);
  }
  function transfer(memberId: string) {
    if (!members.some(m => m.id === memberId)) return;
    presenterId = memberId;
    if (readingState) publishReading({ ...readingState, action: 'live', finished: false });
    emitRoster(); broadcast({ t: 'roster', d: members.slice() });
    deliverAnswerList();
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
      const id = String(m.id || '').slice(0, 120);
      // A refresh opens a new peer but keeps this tab's member id. Replacing the
      // old channel here is what stops the same person appearing once per reload.
      if (!id || !fromPeerId || id === me.id) return;
      noteSeen(fromPeerId);
      const previous = members.find((x) => x.id === id);
      const replacedPeer = previous && previous.peerId !== fromPeerId ? previous.peerId : '';
      upsert({ id, name: m.name || 'Reader', color: m.color || '#888', avatar: m.avatar || null, peerId: fromPeerId, av: Boolean(m.av), mic: Boolean(m.mic), cam: Boolean(m.cam), screen: Boolean(m.screen) });
      const conn = clientConns.get(fromPeerId);
      if (conn) {
        try { conn.send({ t: 'welcome', d: { roster: members.slice(), chat: chatLog.slice(-CHAT_HISTORY), reading: readingState, question, answers: sharedAnswers } }); } catch { /* dropped */ }
      }
      if (!previous) {
        const sm = systemMessage(`${m.name || 'Someone'} joined the party`, 'joined', m.name || 'Someone');
        recordChat(sm); broadcast({ t: 'chat', d: sm });
      }
      if (replacedPeer) retirePeer(replacedPeer, id);
      emitRoster(); broadcast({ t: 'roster', d: members.slice() });
    } else if (env.t === 'ping') {
      if (fromPeerId) noteSeen(fromPeerId);
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
      connectionReady();
      joined = true;
      const d = (env.d || {}) as { roster?: PartyMember[]; chat?: PartyChatMessage[]; reading?: ReadingState | null;
        question?: PartyQuestion | null; answers?: SharedAnswers | null };
      members = (d.roster || []).slice();
      readingState = d.reading || null;
      chatLog.length = 0;
      (d.chat || []).slice(-CHAT_HISTORY).forEach(recordChat);
      if (readingState) h.onReading?.(readingState);
      // Someone joining mid-question still gets the prompt and any shared board.
      question = d.question || null;
      sharedAnswers = d.answers || null;
      h.onQuestion?.(question);
      h.onSharedAnswers?.(sharedAnswers);
      emitRoster();
    } else if (env.t === 'roster') {
      members = ((env.d || []) as PartyMember[]).slice();
      emitRoster();
      pruneStaleMedia();
      if (presenterId !== me.id) h.onAnswerList?.([]);
    } else if (env.t === 'chat') {
      recordChat(env.d as PartyChatMessage);
    } else if (env.t === 'answer-list') {
      if (presenterId === me.id && Array.isArray(env.d)) h.onAnswerList?.(env.d as PartyAnswer[]);
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
  function endRemote(peerId: string) {
    const memberId = mediaOwners.get(peerId) || resolveMemberId(peerId);
    mediaOwners.delete(peerId);
    h.onRemoteEnd?.(memberId);
  }
  function trackCall(call: MediaConnection) {
    const pid = call.peer;
    const previous = mediaConns.get(pid);
    mediaConns.set(pid, call);
    previous?.close();
    call.on('stream', (s) => {
      if (mediaConns.get(pid) === call) { mediaRetries.delete(pid); const id = resolveMemberId(pid); mediaOwners.set(pid, id); h.onRemoteStream?.(id, s); }
    });
    const ended = () => {
      if (mediaConns.get(pid) !== call) return;
      mediaConns.delete(pid); endRemote(pid);
      const failures = (mediaRetries.get(pid)?.failures ?? 0) + 1;
      mediaRetries.set(pid, { failures, after: Date.now() + Math.min(30000, 1000 * 2 ** Math.min(failures - 1, 5)) });
      call.close(); scheduleReconcile();
    };
    call.on('close', ended);
    call.on('error', ended);
    call.peerConnection?.addEventListener('connectionstatechange', () => {
      if (call.peerConnection.connectionState === 'failed') ended();
    });
  }
  function scheduleReconcile(delay = 350) {
    if (leaving) return;
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(reconcileMesh, delay);
  }
  function reconcileMesh() {
    if (leaving || capped() || !hasMedia() || !peer) return;
    const stream = getLocalStream();
    if (!stream) return;
    let retryIn = Infinity;
    for (const m of members) {
      if (m.id === me.id || !m.peerId) continue;
      if (mediaConns.has(m.peerId)) continue;
      // Lower peer-id dials when both are in the call. If the other person
      // has not unmuted yet, we still dial so they can hear us.
      if (m.av && myPeerId() > m.peerId) continue;
      const wait = (mediaRetries.get(m.peerId)?.after ?? 0) - Date.now();
      if (wait > 0) { retryIn = Math.min(retryIn, wait); continue; }
      try { trackCall(peer.call(m.peerId, stream)); } catch {
        const failures = (mediaRetries.get(m.peerId)?.failures ?? 0) + 1;
        const delay = Math.min(30000, 1000 * 2 ** Math.min(failures - 1, 5));
        mediaRetries.set(m.peerId, { failures, after: Date.now() + delay });
        retryIn = Math.min(retryIn, delay);
      }
    }
    if (Number.isFinite(retryIn)) scheduleReconcile(Math.max(350, retryIn));
  }
  function pruneStaleMedia() {
    const live = new Set(members.map((m) => m.peerId));
    for (const pid of mediaRetries.keys()) if (!live.has(pid)) mediaRetries.delete(pid);
    for (const [pid, call] of mediaConns) {
      if (!live.has(pid)) {
        mediaConns.delete(pid);
        try { call.close(); } catch { /* ignore */ }
        endRemote(pid);
      }
    }
  }
  function closeAllMedia() {
    const calls = [...mediaConns];
    mediaConns.clear();
    mediaRetries.clear();
    for (const [pid, call] of calls) {
      try { call.close(); } catch { /* ignore */ }
      endRemote(pid);
    }
    mediaConns.clear();
  }
  function answerCalls() {
    const owner = peer;
    peer!.on('call', (call) => {
      if (leaving || peer !== owner || capped()) { call.close(); return; }
      // When both sides refresh together, keep the lower peer's outgoing call.
      if (mediaConns.has(call.peer) && myPeerId() < call.peer) { call.close(); return; }
      trackCall(call);
      call.answer(getLocalStream() || undefined);
    });
  }

  function retirePeer(peerId: string, memberId: string) {
    const conn = clientConns.get(peerId);
    clientConns.delete(peerId);
    seenAt.delete(peerId);
    mediaRetries.delete(peerId);
    // A still-live old tab must stop reconnecting, not compete for the same seat.
    // Allow the reliable control message to drain before forcing the old link closed.
    if (conn) {
      try { conn.send({ t: 'replaced' }); } catch { /* already gone */ }
      retired.set(conn, setTimeout(() => {
        retired.delete(conn);
        try { conn.close(); } catch { /* already gone */ }
      }, 1000));
    }
    // The member record already points at the replacement peer. Closing the old
    // channel must not announce a leave or delete that seat.
    const call = mediaConns.get(peerId);
    if (call) {
      mediaConns.delete(peerId);
      try { call.close(); } catch { /* already gone */ }
    }
    // The tile is keyed by member, not by the peer that just went away.
    mediaOwners.delete(peerId);
    h.onRemoteEnd?.(memberId);
  }

  function dropClient(c: DataConnection) {
    if (leaving || !isHub || clientConns.get(c.peer) !== c || dropping.has(c.peer)) return;
    const member = members.find((x) => x.peerId === c.peer);
    if (!clientConns.has(c.peer) && !member) return;
    dropping.add(c.peer);
    try {
      clientConns.delete(c.peer);
      seenAt.delete(c.peer);
      if (member) members = members.filter((x) => x.id !== member.id);
      if (member) {
        const sm = systemMessage(`${member.name} left the party`, 'left', member.name);
        recordChat(sm); broadcast({ t: 'chat', d: sm });
      }
      if (member?.id === presenterId) transfer(me.id);
      try { c.close(); } catch { /* already closed */ }
      pruneStaleMedia();
      emitRoster(); broadcast({ t: 'roster', d: members.slice() });
    } finally {
      dropping.delete(c.peer);
    }
  }

  function sweep() {
    if (sweeping || !isHub || leaving) return;
    const dead = [...clientConns.values()].filter(connectionDead);
    if (!dead.length) return;
    sweeping = true;
    try { for (const conn of dead) dropClient(conn); }
    finally { sweeping = false; }
  }

  function watchConnectionHealth(c: DataConnection) {
    const pc = c.peerConnection;
    if (!pc?.addEventListener) return;
    pc.addEventListener('connectionstatechange', () => {
      if (!leaving && isHub && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) dropClient(c);
    });
  }

  /* ---------------- connection lifecycle ---------------- */
  function wireClientConn(c: DataConnection) {
    hubConn = c;
    c.on('open', () => {
      if (leaving || hubConn !== c) { c.close(); return; }
      status('connected');
      try { c.send({ t: 'hello', d: { id: me.id, name: me.name, color: me.color, avatar: me.avatar || null, av: hasMedia(), mic: getState().audio, cam: getState().video, screen: getState().screen } }); } catch { /* dropped */ }
    });
    c.on('data', raw => {
      if (leaving || hubConn !== c) return;
      if ((raw as Envelope)?.t === 'replaced') {
        leaveRoom();
        h.onReading?.(null);
        h.onSelf?.({ host: false });
        status('disconnected');
        h.onError?.('session-replaced');
        return;
      }
      handleFromHub(raw);
    });
    const lost = () => {
      if (leaving || hubConn !== c || c.open) return;
      if (joined) reelect(); else { status('disconnected'); h.onError?.('room-unavailable'); }
    };
    c.on('close', lost);
    // negotiation-failed and not-open-yet are not a dead room. Reelecting here
    // is what made a guest race the host id and kick the group.
    c.on('error', () => { if (!c.open) lost(); });
  }

  function startAsHub() {
    connectionReady();
    isHub = true;
    isHubEstablished = true;
    joined = true;
    presenterId = me.id;
    revision = readingState?.revision || 0;
    if (readingState) readingState = { ...readingState, action: 'live', finished: false, revision: ++revision };
    members = [selfMember()];
    status('hosting');
    h.onSelf?.({ host: true });
    if (readingState) h.onReading?.(readingState);
    emitRoster();
    // A re-elected hub keeps everyone in sync by re-announcing the reading state.
    if (readingState) broadcast({ t: 'reading', d: readingState });
    const owner = peer;
    peer!.on('connection', (c) => {
      c.on('open', () => {
        if (leaving || peer !== owner || !isHub) { c.close(); return; }
        const previous = clientConns.get(c.peer);
        clientConns.set(c.peer, c);
        if (previous && previous !== c) previous.close();
        noteSeen(c.peer); watchConnectionHealth(c);
      });
      c.on('data', (env) => {
        if (leaving || peer !== owner || clientConns.get(c.peer) !== c) return;
        noteSeen(c.peer); handleAtHub(env as Envelope, c.peer);
      });
      c.on('close', () => dropClient(c));
      c.on('error', () => { /* close follows when the channel is actually gone */ });
    });
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = setInterval(sweep, 5000);
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
    clearRetired();
    seenAt.clear();
    closeAllMedia();
    if (reelectTimer) clearTimeout(reelectTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (sweepTimer) clearInterval(sweepTimer);
    if (pingTimer) clearInterval(pingTimer);
    reconnectTimer = null;
    sweepTimer = null;
    pingTimer = null;
    const oldPeer = peer;
    peer = null; hubConn = null;
    isHub = false;
    isHubEstablished = false;
    clientConns.clear();
    try { oldPeer?.destroy(); } catch { /* ignore */ }
    status('reconnecting');
    // Jitter so clients don't stampede the hub id at once.
    reelectTimer = setTimeout(connect, 300 + Math.random() * 900);
  }

  function isSignalingBlip(type: string) {
    return type === 'network' || type === 'socket-error' || type === 'socket-closed'
      || type === 'disconnected' || type === 'server-error' || type === 'webrtc';
  }

  // unavailable-id during Peer.reconnect means the broker still remembers our
  // hub id. Destroying here closes every guest and is the kick/rejoin storm.
  function tolerateHubSignaling(attempt: Peer) {
    if (reconnectTimer || leaving || peer !== attempt) return;
    reconnectAttempt += 1;
    if (reconnectAttempt >= 3) status('reconnecting');
    const delay = Math.min(8000, 400 * 2 ** (reconnectAttempt - 1));
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      if (leaving || peer !== attempt || attempt.destroyed) return;
      try { attempt.reconnect(); } catch { /* not disconnected, or this peer has no broker session */ }
    }, delay);
  }

  function connect() {
    if (leaving) return;
    status('connecting');
    watchConnection();
    if (!create && !joined) { connectAsClient(); return; }
    peer = new Peer(HUB_ID);
    const attempt = peer;
    peer.once('open', () => { if (!leaving && peer === attempt) startAsHub(); });
    keepSignalingAlive(attempt);
    peer.on('error', (e: { type?: string }) => {
      if (leaving || peer !== attempt) return;
      const type = e?.type || String(e);
      if (type === 'unavailable-id') {
        if (isHubEstablished) { tolerateHubSignaling(attempt); return; }
        // Someone already hosts this party → join as a client.
        try { peer?.destroy(); } catch { /* ignore */ }
        if (peer === attempt) peer = null;
        connectAsClient();
      } else if (isSignalingBlip(type)) {
        if (isHubEstablished && type !== 'webrtc') tolerateHubSignaling(attempt);
        else if (!joined && type !== 'webrtc') h.onError?.(type);
      } else if (!leaving) {
        h.onError?.(type);
      }
    });
  }

  function connectAsClient() {
    peer = new Peer();
    const attempt = peer;
    peer.once('open', () => { if (!leaving && peer === attempt) startAsClient(); });
    keepSignalingAlive(attempt);
    peer.on('error', (error: { type?: string }) => {
      if (leaving || peer !== attempt) return;
      const type = error.type || 'connection-error';
      if (type === 'peer-unavailable' && joined) { if (!hubConn?.open) reelect(); }
      else if (type === 'unavailable-id' && joined) tolerateHubSignaling(attempt);
      else if (isSignalingBlip(type)) {
        // The disconnected handler reconnects this same peer. A broker blip is
        // not a failed join, and it must not surface as "you were kicked".
        if (!joined) h.onError?.(type);
      } else { status('disconnected'); h.onError?.(type === 'peer-unavailable' ? 'room-unavailable' : type); }
    });
    if (pingTimer) clearInterval(pingTimer);
    pingTimer = setInterval(() => {
      if (leaving || peer !== attempt) return;
      toHub({ t: 'ping' });
    }, 8000);
  }

  function keepSignalingAlive(candidate: Peer) {
    candidate.on('open', () => {
      if (leaving || peer !== candidate) return;
      reconnectAttempt = 0;
      if (isHub) status('hosting');
    });
    candidate.on('disconnected', () => {
      if (leaving || peer !== candidate || candidate.destroyed) return;
      // Existing WebRTC streams stay up across a broker blip. Reconnect with the
      // same id; do not destroy the peer or every guest is kicked.
      try { candidate.reconnect(); } catch { tolerateHubSignaling(candidate); }
    });
  }

  function clearRetired() {
    for (const [c, timer] of retired) { clearTimeout(timer); try { c.close(); } catch { /* gone */ } }
    retired.clear();
  }

  function leaveRoom() {
    leaving = true;
    clearRetired();
    seenAt.clear();
    connectionReady();
    closeAllMedia();
    if (reelectTimer) clearTimeout(reelectTimer);
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (sweepTimer) clearInterval(sweepTimer);
    if (pingTimer) clearInterval(pingTimer);
    if (reconcileTimer) clearTimeout(reconcileTimer);
    try { for (const c of clientConns.values()) c.close(); } catch { /* ignore */ }
    clientConns.clear();
    try { hubConn?.close(); } catch { /* ignore */ }
    try { peer?.destroy(); } catch { /* ignore */ }
    peer = null;
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
    leave: leaveRoom,
  };
}
