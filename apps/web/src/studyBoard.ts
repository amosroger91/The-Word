// A serverless bulletin of *public* Group Study rooms.
// Same star-topology trick as OpenWhisper's presence counter: the first
// tab to claim a well-known peer-id becomes the hub, everyone else
// connects to it, and public hosts heartbeat their listing. Private
// groups never appear here. If the hub leaves, clients re-elect.
import { Peer, type DataConnection } from 'peerjs';

export interface PublicStudy {
  code: string;
  hostName: string;
  members: number;
  bookId: number;
  chapter: number;
  verse: number | null;
  ts: number;
}

const BOARD_ID = 'tw-board-v1';
const STALE_MS = 20000;

interface Envelope { t: string; d?: unknown }

export function connectStudyBoard(onList: (list: PublicStudy[]) => void) {
  let peer: Peer | null = null;
  let isHub = false;
  let hubConn: DataConnection | null = null;
  const clientConns = new Map<string, DataConnection>();
  const board = new Map<string, PublicStudy>();
  let lastAd: PublicStudy | null = null;
  let leaving = false;
  let reelectTimer: ReturnType<typeof setTimeout> | null = null;
  let sweepTimer: ReturnType<typeof setInterval> | null = null;

  function sorted(): PublicStudy[] {
    const now = Date.now();
    for (const [code, item] of board) {
      if (now - item.ts > STALE_MS) board.delete(code);
    }
    return [...board.values()].sort((a, b) => b.members - a.members || a.code.localeCompare(b.code));
  }

  function emit() {
    const list = sorted();
    onList(list);
    if (!isHub) return;
    const env: Envelope = { t: 'list', d: list };
    for (const c of clientConns.values()) {
      try { if (c.open) c.send(env); } catch { /* dropped */ }
    }
  }

  function apply(env: Envelope) {
    if (!env || !env.t) return;
    if (env.t === 'up') {
      const item = env.d as PublicStudy;
      if (!item?.code) return;
      board.set(item.code, { ...item, ts: Date.now() });
      emit();
    } else if (env.t === 'down') {
      const code = String((env.d as { code?: string })?.code || '');
      if (!code) return;
      board.delete(code);
      emit();
    } else if (env.t === 'list' && Array.isArray(env.d)) {
      onList(env.d as PublicStudy[]);
    }
  }

  function toHub(env: Envelope) {
    if (isHub) apply(env);
    else {
      try { if (hubConn && hubConn.open) hubConn.send(env); } catch { /* dropped */ }
    }
  }

  function startAsHub() {
    isHub = true;
    if (lastAd) board.set(lastAd.code, { ...lastAd, ts: Date.now() });
    emit();
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = setInterval(emit, 4000);
    peer!.on('connection', (c) => {
      c.on('open', () => {
        clientConns.set(c.peer, c);
        try { c.send({ t: 'list', d: sorted() }); } catch { /* dropped */ }
      });
      c.on('data', (raw) => apply(raw as Envelope));
      c.on('close', () => { clientConns.delete(c.peer); });
      c.on('error', () => { /* ignore */ });
    });
  }

  function startAsClient() {
    isHub = false;
    hubConn = peer!.connect(BOARD_ID, { reliable: true });
    hubConn.on('open', () => {
      if (lastAd) {
        try { hubConn?.send({ t: 'up', d: lastAd }); } catch { /* dropped */ }
      }
    });
    hubConn.on('data', (raw) => apply(raw as Envelope));
    hubConn.on('close', () => { if (!leaving) reelect(); });
    hubConn.on('error', () => { if (!leaving) reelect(); });
  }

  function reelect() {
    if (leaving) return;
    if (reelectTimer) clearTimeout(reelectTimer);
    if (sweepTimer) clearInterval(sweepTimer);
    try { peer?.destroy(); } catch { /* ignore */ }
    peer = null;
    hubConn = null;
    clientConns.clear();
    reelectTimer = setTimeout(connect, 300 + Math.random() * 900);
  }

  function connect() {
    if (leaving) return;
    peer = new Peer(BOARD_ID);
    peer.on('open', () => startAsHub());
    peer.on('error', (e: { type?: string }) => {
      const type = e?.type || String(e);
      if (type === 'unavailable-id') {
        try { peer?.destroy(); } catch { /* ignore */ }
        peer = new Peer();
        peer.on('open', () => startAsClient());
        peer.on('error', () => { if (!leaving) reelect(); });
      } else if (!leaving) {
        reelect();
      }
    });
  }

  connect();

  return {
    advertise(listing: PublicStudy) {
      lastAd = listing;
      toHub({ t: 'up', d: listing });
    },
    retract(code: string) {
      lastAd = null;
      toHub({ t: 'down', d: { code } });
    },
    stop() {
      leaving = true;
      lastAd = null;
      if (reelectTimer) clearTimeout(reelectTimer);
      if (sweepTimer) clearInterval(sweepTimer);
      try { for (const c of clientConns.values()) c.close(); } catch { /* ignore */ }
      try { hubConn?.close(); } catch { /* ignore */ }
      try { peer?.destroy(); } catch { /* ignore */ }
      peer = null;
      onList([]);
    },
  };
}
