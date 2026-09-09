// Signed graph nodes. Local IndexedDB is source of truth; relays and the
// PeerJS gossip path are untrusted transports. Trust is decided at read time.
import { Peer, type DataConnection } from 'peerjs';
import type { WordAccount } from './nostrAccount';
import { loadMembership, loadRelays, verifyMembership, type Membership, type RelayConfig } from './membership';
import { signP256, verifyP256 } from './sea';

export interface GraphNode {
  soul: string;
  at: string;
  gunPub: string;
  npub: string;
  body: unknown;
  sig: string;
  membership?: Membership;
}

const DB = 'word-graph';
const STORE = 'nodes';
const MEMORY_KEY = 'word.graph';
const GOSSIP_ID = 'tw-graph-v1';

type Listener = (soul: string, node: GraphNode) => void;
const listeners = new Set<Listener>();
let cache: Map<string, GraphNode> | null = null;

function payload(node: Omit<GraphNode, 'sig'>): string {
  return `the-word/graph/v1:${node.soul}:${node.at}:${node.gunPub}:${node.npub}:${JSON.stringify(node.body)}`;
}

export function signNode(account: WordAccount, soul: string, body: unknown, membership = loadMembership()): GraphNode {
  const unsigned = { soul, at: new Date().toISOString(), gunPub: account.gun.pub, npub: account.npub, body, membership: membership ?? undefined };
  return { ...unsigned, sig: signP256(account.gun.priv, payload(unsigned)) };
}

export function verifyNodeSignature(node: GraphNode): boolean {
  const { sig, ...rest } = node;
  return verifyP256(node.gunPub, payload(rest), sig);
}

export function allowedInFeed(node: GraphNode, issuerPub: string): boolean {
  if (!verifyNodeSignature(node)) return false;
  if (!node.membership || !verifyMembership(node.membership, issuerPub)) return false;
  if (node.membership.npub !== node.npub || node.membership.gunPub !== node.gunPub) return false;
  return true;
}

function memoryLoad(): Map<string, GraphNode> {
  try {
    const raw = localStorage.getItem(MEMORY_KEY);
    const rows = raw ? JSON.parse(raw) as GraphNode[] : [];
    return new Map(rows.map((row) => [row.soul, row]));
  } catch { return new Map(); }
}

function memorySave(nodes: Map<string, GraphNode>) {
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify([...nodes.values()])); } catch { /* blocked */ }
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE, { keyPath: 'soul' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadGraph(): Promise<Map<string, GraphNode>> {
  if (cache) return cache;
  if (typeof indexedDB === 'undefined') {
    cache = memoryLoad();
    return cache;
  }
  try {
    const db = await openDb();
    const rows = await new Promise<GraphNode[]>((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
      request.onsuccess = () => resolve((request.result as GraphNode[]) || []);
      request.onerror = () => reject(request.error);
    });
    cache = new Map(rows.map((row) => [row.soul, row]));
  } catch {
    cache = memoryLoad();
  }
  return cache;
}

async function persist(nodes: Map<string, GraphNode>) {
  cache = nodes;
  memorySave(nodes);
  if (typeof indexedDB === 'undefined') return;
  try {
    const db = await openDb();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      const store = tx.objectStore(STORE);
      for (const node of nodes.values()) store.put(node);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch { /* memory already held it */ }
}

export function onGraph(listener: Listener) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

function emit(node: GraphNode) {
  for (const listener of listeners) listener(node.soul, node);
}

export async function putNode(node: GraphNode, relays = loadRelays()): Promise<GraphNode> {
  const nodes = await loadGraph();
  const prev = nodes.get(node.soul);
  if (prev && prev.at > node.at) return prev;
  nodes.set(node.soul, node);
  await persist(nodes);
  emit(node);
  void pushRelays(node, relays);
  gossipSend(node);
  return node;
}

export async function getNode(soul: string): Promise<GraphNode | null> {
  const nodes = await loadGraph();
  return nodes.get(soul) ?? null;
}

export async function nodesWithPrefix(prefix: string): Promise<GraphNode[]> {
  const nodes = await loadGraph();
  return [...nodes.values()].filter((node) => node.soul.startsWith(prefix));
}

async function pushRelays(node: GraphNode, relays: RelayConfig) {
  for (const url of relays.urls) {
    try {
      await fetch(`${url.replace(/\/$/, '')}/v1/put`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(node),
      });
    } catch { /* relay down */ }
  }
}

export async function pullRelays(relays = loadRelays()): Promise<number> {
  let added = 0;
  for (const url of relays.urls) {
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/v1/since?t=0`);
      if (!res.ok) continue;
      const rows = await res.json() as GraphNode[];
      const nodes = await loadGraph();
      for (const node of rows) {
        if (!verifyNodeSignature(node)) continue;
        const prev = nodes.get(node.soul);
        if (prev && prev.at >= node.at) continue;
        nodes.set(node.soul, node);
        added += 1;
        emit(node);
      }
      await persist(nodes);
    } catch { /* try next */ }
  }
  return added;
}

let gossip: { peer: Peer; conns: Set<DataConnection> } | null = null;

function gossipSend(node: GraphNode) {
  if (!gossip) return;
  const env = { t: 'put', d: node };
  for (const conn of gossip.conns) {
    try { if (conn.open) conn.send(env); } catch { /* dropped */ }
  }
}

export function startGraphGossip() {
  if (gossip || typeof window === 'undefined') return;
  const conns = new Set<DataConnection>();
  const peer = new Peer(GOSSIP_ID);
  gossip = { peer, conns };
  function hear(conn: DataConnection) {
    conns.add(conn);
    conn.on('data', (raw) => {
      const env = raw as { t?: string; d?: GraphNode };
      if (env?.t === 'put' && env.d?.soul) void putNode(env.d);
    });
    conn.on('close', () => conns.delete(conn));
  }
  peer.on('open', () => { /* we are the hub */ });
  peer.on('connection', hear);
  peer.on('error', (error) => {
    const message = String((error as { type?: string }).type || error);
    if (!message.includes('unavailable-id') && !message.includes('peer-unavailable')) return;
    peer.destroy();
    const client = new Peer();
    gossip = { peer: client, conns };
    client.on('open', () => {
      const conn = client.connect(GOSSIP_ID);
      hear(conn);
    });
  });
}

export function userSoul(gunPub: string, path: string): string {
  return `~${gunPub}/${path}`;
}
