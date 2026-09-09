// Survivor relay: Gun-shaped graph store + membership notary.
// The issuer private key never leaves this process.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = path.join(ROOT, 'data');
const PORT = Number(process.env.PORT || 8787);
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
const nodes = new Map(Object.entries(readJson(path.join(DATA, 'graph.json'), {})));

function persistGraph() {
  writeJson(path.join(DATA, 'graph.json'), Object.fromEntries(nodes));
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
      if (!node?.soul || !node.sig || !node.gunPub) return json(res, 400, { error: 'node' });
      const prev = nodes.get(node.soul);
      if (!prev || prev.at <= node.at) {
        nodes.set(node.soul, node);
        persistGraph();
      }
      return json(res, 200, { ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/v1/get') {
      const soul = url.searchParams.get('soul');
      return json(res, 200, nodes.get(soul) || null);
    }
    if (req.method === 'GET' && url.pathname === '/v1/since') {
      return json(res, 200, [...nodes.values()]);
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
