// Survivor relay: Gun-shaped graph store + membership notary.
// The issuer private key never leaves this process.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
// Overridable so tests get a scratch directory instead of the live graph.
const DATA = process.env.RELAY_DATA || path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8787);
const MAX_NODE_BYTES = 64 * 1024;
const MAX_BYTES_PER_DAY = 8 * 1024 * 1024;
const MAX_NODES_PER_DAY = 5000;
const QUOTA_WINDOW_MS = 24 * 60 * 60 * 1000;
fs.mkdirSync(DATA, { recursive: true });

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return fallback; }
}
function writeJson(file, value) {
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

function loadIssuer() {
  const file = path.join(DATA, 'issuer.json');
  let issuer = readJson(file, null);
  if (!issuer?.priv) {
    const pair = p256.keygen();
    issuer = { priv: bytesToHex(pair.secretKey), pub: bytesToHex(pair.publicKey) };
    writeJson(file, issuer);
    console.log('Issuer public key:', issuer.pub);
  }
  return issuer;
}

const issuer = loadIssuer();
const SNAPSHOT = path.join(DATA, 'graph.json');
const LOG = path.join(DATA, 'graph.log');

// Snapshot plus an append-only log. Rewriting the whole graph on every put was
// O(n) work per write and would collapse long before the disk filled.
const nodes = new Map(Object.entries(readJson(SNAPSHOT, {})));
for (const line of (fs.existsSync(LOG) ? fs.readFileSync(LOG, 'utf8') : '').split(/\r?\n/)) {
  if (!line.trim()) continue;
  try {
    const node = JSON.parse(line);
    const prev = nodes.get(node.soul);
    if (!prev || prev.at <= node.at) nodes.set(node.soul, node);
  } catch { /* torn final line after a hard stop */ }
}

let sinceSnapshot = 0;
function persistNode(node) {
  fs.appendFileSync(LOG, JSON.stringify(node) + String.fromCharCode(10));
  // Fold the log back in periodically so restarts stay quick and the log does
  // not grow without bound.
  if (++sinceSnapshot >= 200) {
    writeJson(SNAPSHOT, Object.fromEntries(nodes));
    fs.writeFileSync(LOG, '');
    sinceSnapshot = 0;
  }
}

function membershipMessage(npub, gunPub, issuedAt) {
  return `the-word/membership/v1:${npub}:${gunPub}:${issuedAt}`;
}

function sign(privHex, message) {
  return bytesToHex(p256.sign(utf8ToBytes(message), hexToBytes(privHex), { lowS: true, prehash: true }));
}

function verify(pubHex, message, sigHex) {
  try {
    return p256.verify(hexToBytes(sigHex), utf8ToBytes(message), hexToBytes(pubHex), { prehash: true, lowS: true });
  } catch { return false; }
}

// Byte-for-byte the string gunGraph.ts signs. If these ever drift every write is
// rejected — the safe direction, but keep them in step.
function nodePayload(node) {
  return `the-word/graph/v1:${node.soul}:${node.at}:${node.gunPub}:${node.npub}:${JSON.stringify(node.body)}`;
}

function membershipHolds(node) {
  const m = node.membership;
  if (!m || !m.sig || !m.npub || !m.gunPub) return false;
  if (m.npub !== node.npub || m.gunPub !== node.gunPub) return false;
  return verify(issuer.pub, membershipMessage(m.npub, m.gunPub, m.issuedAt), m.sig);
}

// A node is stored only if the author really signed it and the issuer really
// vouched for the author. Without this the endpoint is an open write and
// whoever pays for the disk pays for everyone's.
function acceptable(node) {
  if (!node || typeof node.soul !== 'string' || !node.sig || !node.gunPub || !node.at) return 'shape';
  if (typeof node.soul.length !== 'number' || node.soul.length > 512) return 'soul';
  if (byteLength(node) > MAX_NODE_BYTES) return 'too-big';
  if (!verify(node.gunPub, nodePayload(node), node.sig)) return 'signature';
  if (!membershipHolds(node)) return 'membership';
  // A user-space soul belongs to exactly one key; nobody writes into another's.
  if (node.soul.startsWith('~') && !node.soul.startsWith(`~${node.gunPub}`)) return 'scope';
  return null;
}

function byteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf8');
}

// Per-account ceiling so a buggy or hostile client cannot run away with the
// disk. Counted over a rolling day, held in memory: a restart forgives, which
// is the right trade for a single small relay.
const quota = new Map();
function withinQuota(gunPub, bytes) {
  const now = Date.now();
  const seen = quota.get(gunPub);
  if (!seen || now - seen.since > QUOTA_WINDOW_MS) {
    quota.set(gunPub, { since: now, bytes, nodes: 1 });
    return true;
  }
  if (seen.bytes + bytes > MAX_BYTES_PER_DAY || seen.nodes + 1 > MAX_NODES_PER_DAY) return false;
  seen.bytes += bytes;
  seen.nodes += 1;
  return true;
}

function json(res, status, body) {
  res.writeHead(status, {
    'content-type': 'application/json',
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'content-type',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
  });
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (error) { reject(error); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {});
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
  try {
    if (req.method === 'GET' && url.pathname === '/v1/issuer') return json(res, 200, { pub: issuer.pub });
    if (req.method === 'POST' && url.pathname === '/v1/membership') {
      const body = await readBody(req);
      if (!body.npub || !body.gunPub || !body.gunBinding) return json(res, 400, { error: 'missing' });
      const message = `the-word/gun-binding:${body.npub}:${body.gunPub}`;
      if (!verify(body.gunPub, message, body.gunBinding.sig)) return json(res, 400, { error: 'binding' });
      const issuedAt = new Date().toISOString();
      const membership = { npub: body.npub, gunPub: body.gunPub, issuedAt, sig: sign(issuer.priv, membershipMessage(body.npub, body.gunPub, issuedAt)) };
      return json(res, 200, membership);
    }
    if (req.method === 'POST' && url.pathname === '/v1/put') {
      const node = await readBody(req);
      const rejected = acceptable(node);
      if (rejected) return json(res, 400, { error: rejected });
      if (!withinQuota(node.gunPub, byteLength(node))) return json(res, 429, { error: 'quota' });
      const prev = nodes.get(node.soul);
      if (!prev || prev.at <= node.at) {
        nodes.set(node.soul, node);
        persistNode(node);
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/v1/get') {
      const soul = url.searchParams.get('soul');
      return json(res, 200, nodes.get(soul) || null);
    }
    if (req.method === 'GET' && url.pathname === '/v1/since') {
      // `t` is an ISO timestamp from the client's last sync. Returning the whole
      // graph to everyone on every sync made bandwidth grow with history times
      // syncs; a cursor makes it grow with what actually changed.
      const t = url.searchParams.get('t') || '';
      const limit = Math.min(Number(url.searchParams.get('limit')) || 500, 2000);
      const fresh = [...nodes.values()]
        .filter((node) => !t || node.at > t)
        .sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
        .slice(0, limit);
      const next = fresh.length ? fresh[fresh.length - 1].at : t;
      return json(res, 200, { nodes: fresh, next, more: fresh.length === limit });
    }
    json(res, 404, { error: 'not-found' });
  } catch {
    json(res, 500, { error: 'server' });
  }
});

server.listen(PORT, () => {
  console.log(`The Word survivor relay on http://127.0.0.1:${PORT}`);
  console.log('Issuer public key:', issuer.pub);
});
