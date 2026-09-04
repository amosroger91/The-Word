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
//  locally and never echo them, so there is no feedback loop. Audio
//  is never streamed — each device reads with its own local TTS.
// ============================================================
import { Peer, type DataConnection } from 'peerjs';

export interface PartyIdentity { id: string; name: string; color: string; }
export interface PartyMember { id: string; name: string; color: string; peerId: string; host?: boolean; }
export interface PartyChatMessage {
  id: string;
  kind: 'chat' | 'system';
  from?: string;
  name?: string;
  color?: string;
  text: string;
  ts: number;
}
// The shared reading session the host controls: passage, command, and the
// host's current verse so participants can follow along verse by verse.
export interface ReadingState {
  bookId: number;
  chapter: number;
  verse: number | null;
  action: 'idle' | 'playing' | 'paused';
  ts: number;
}

export interface PartyHandlers {
  onStatus?(status: string): void;
  onSelf?(info: { host: boolean }): void;
  onRoster?(members: PartyMember[], meta: { host: boolean }): void;
  onChat?(message: PartyChatMessage): void;
  onReading?(state: ReadingState | null): void;
  onError?(code: string): void;
}

const CHAT_HISTORY = 100; // chat messages handed to a new joiner

export function partyPeerId(code: string): string {
  const slug = String(code).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return 'tw-party-' + (slug || 'x');
}

function newId(): string { return 'x' + Math.random().toString(36).slice(2, 11) + Date.now().toString(36); }

interface Envelope { t: string; d?: unknown }

export interface PartyRoom {
  readonly isHost: boolean;
  readonly size: number;
  sendChat(text: string): void;
  /** Host only: publish the shared reading state to everyone. No-op for clients. */
  setReadingState(state: ReadingState): void;
  updateIdentity(next: Partial<PartyIdentity>): void;
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
  let hubConn: DataConnection | null = null;         // client: the single connection to the hub
  const clientConns = new Map<string, DataConnection>(); // hub: remotePeerId -> connection
  let members: PartyMember[] = [];
  let readingState: ReadingState | null = null;      // last known shared reading state (survives re-election)
  const chatLog: PartyChatMessage[] = [];
  let leaving = false;
  let reelectTimer: ReturnType<typeof setTimeout> | null = null;
  let me = identity;

  const status = (s: string) => h.onStatus?.(s);
  const myPeerId = () => (peer && peer.id) || '';

  function selfMember(): PartyMember {
    return { id: me.id, name: me.name, color: me.color, peerId: myPeerId(), host: isHub };
  }
  function upsert(m: PartyMember) {
    const i = members.findIndex((x) => x.id === m.id);
    if (i >= 0) members[i] = { ...members[i], ...m };
    else members.push(m);
  }
  function emitRoster() { h.onRoster?.(members.slice(), { host: isHub }); }

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
  function systemMessage(text: string): PartyChatMessage {
    return { id: newId(), kind: 'system', text, ts: Date.now() };
  }

  /* ---------------- hub: handle an incoming envelope ---------------- */
  function handleAtHub(env: Envelope, fromPeerId: string | null) {
    if (!env || !env.t) return;
    if (env.t === 'hello') {
      const m = (env.d || {}) as Partial<PartyMember>;
      upsert({ id: m.id!, name: m.name || 'Reader', color: m.color || '#888', peerId: fromPeerId || '' });
      const conn = fromPeerId ? clientConns.get(fromPeerId) : null;
      if (conn) {
        try { conn.send({ t: 'welcome', d: { roster: members.slice(), chat: chatLog.slice(-CHAT_HISTORY), reading: readingState } }); } catch { /* dropped */ }
      }
      const sm = systemMessage(`${m.name || 'Someone'} joined the party`);
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
        emitRoster(); broadcast({ t: 'roster', d: members.slice() });
      }
    }
  }

  /* ---------------- client: handle a message from the hub ---------------- */
  function handleFromHub(raw: unknown) {
    const env = raw as Envelope;
    if (!env || !env.t) return;
    if (env.t === 'welcome') {
      const d = (env.d || {}) as { roster?: PartyMember[]; chat?: PartyChatMessage[]; reading?: ReadingState | null };
      members = (d.roster || []).slice();
      readingState = d.reading || null;
      (d.chat || []).forEach((m) => h.onChat?.(m));
      if (readingState) h.onReading?.(readingState);
      emitRoster();
    } else if (env.t === 'roster') {
      members = ((env.d || []) as PartyMember[]).slice();
      emitRoster();
    } else if (env.t === 'chat') {
      h.onChat?.(env.d as PartyChatMessage);
    } else if (env.t === 'reading') {
      readingState = (env.d || null) as ReadingState | null;
      h.onReading?.(readingState);
    }
  }

  /* ---------------- connection lifecycle ---------------- */
  function wireClientConn(c: DataConnection) {
    hubConn = c;
    c.on('open', () => {
      status('Connected');
      try { c.send({ t: 'hello', d: { id: me.id, name: me.name, color: me.color } }); } catch { /* dropped */ }
    });
    c.on('data', handleFromHub);
    c.on('close', () => { if (!leaving) reelect(); });
    c.on('error', () => { if (!leaving) reelect(); });
  }

  function startAsHub() {
    isHub = true;
    members = [selfMember()];
    status('Hosting party');
    h.onSelf?.({ host: true });
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
        if (m) { const sm = systemMessage(`${m.name} left the party`); recordChat(sm); broadcast({ t: 'chat', d: sm }); }
        emitRoster(); broadcast({ t: 'roster', d: members.slice() });
      });
      c.on('error', () => { /* ignore */ });
    });
  }

  function startAsClient() {
    isHub = false;
    status('Joining…');
    h.onSelf?.({ host: false });
    wireClientConn(peer!.connect(HUB_ID, { reliable: true }));
  }

  function reelect() {
    if (leaving) return;
    if (reelectTimer) clearTimeout(reelectTimer);
    try { peer?.destroy(); } catch { /* ignore */ }
    peer = null; hubConn = null;
    status('Reconnecting…');
    // Jitter so clients don't stampede the hub id at once.
    reelectTimer = setTimeout(connect, 300 + Math.random() * 900);
  }

  function connect() {
    if (leaving) return;
    status('Connecting…');
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
    get isHost() { return isHub; },
    get size() { return members.length; },
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
      if (!isHub) return; // host-authoritative: only the host publishes
      readingState = state;
      broadcast({ t: 'reading', d: state });
    },
    updateIdentity(next: Partial<PartyIdentity>) {
      me = { ...me, ...next };
      const i = members.findIndex((x) => x.id === me.id);
      if (i >= 0) { members[i].name = me.name; members[i].color = me.color; }
      if (isHub) { emitRoster(); broadcast({ t: 'roster', d: members.slice() }); }
      else toHub({ t: 'meta', d: { name: me.name, color: me.color } });
    },
    leave() {
      leaving = true;
      if (reelectTimer) clearTimeout(reelectTimer);
      try { for (const c of clientConns.values()) c.close(); } catch { /* ignore */ }
      clientConns.clear();
      try { hubConn?.close(); } catch { /* ignore */ }
      try { peer?.destroy(); } catch { /* ignore */ }
      peer = null;
    },
  };
}
