// Relay door tests. The point of /v1/put is that it refuses everything it
// cannot verify, so most of this file is things that must be rejected.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { p256 } from '@noble/curves/nist.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-relay-'));
const PORT = 8799;
const BASE = `http://127.0.0.1:${PORT}`;

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${ok || !detail ? '' : ' — ' + detail}`);
  if (!ok) failures += 1;
}

function sign(privBytes, message) {
  return bytesToHex(p256.sign(utf8ToBytes(message), privBytes, { lowS: true, prehash: true }));
}

function nodePayload(node) {
  return `the-word/graph/v1:${node.soul}:${node.at}:${node.gunPub}:${node.npub}:${JSON.stringify(node.body)}`;
}

function newAccount(npub) {
  const pair = p256.keygen();
  return { npub, priv: pair.secretKey, pub: bytesToHex(pair.publicKey) };
}

function signNode(account, membership, soul, body, at = new Date().toISOString()) {
  const unsigned = { soul, at, gunPub: account.pub, npub: account.npub, body, membership };
  return { ...unsigned, sig: sign(account.priv, nodePayload(unsigned)) };
}

async function post(pathname, body) {
  const res = await fetch(BASE + pathname, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
  env: { ...process.env, PORT: String(PORT), RELAY_DATA: DATA },
  cwd: ROOT,
  stdio: ['ignore', 'pipe', 'pipe'],
});
child.stdout.on('data', () => {});
child.stderr.on('data', (d) => process.stderr.write(d));

// Wait for it to answer rather than sleeping a guessed amount.
for (let i = 0; i < 50; i += 1) {
  try { await fetch(`${BASE}/v1/issuer`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
}

try {
  const alice = newAccount('npub-alice');
  const mallory = newAccount('npub-mallory');

  const issued = await post('/v1/membership', {
    npub: alice.npub,
    gunPub: alice.pub,
    gunBinding: { sig: sign(alice.priv, `the-word/gun-binding:${alice.npub}:${alice.pub}`) },
  });
  check('membership is issued for a valid binding', issued.status === 200 && Boolean(issued.body.sig));
  const membership = issued.body;

  const badBinding = await post('/v1/membership', {
    npub: mallory.npub,
    gunPub: mallory.pub,
    gunBinding: { sig: sign(alice.priv, `the-word/gun-binding:${mallory.npub}:${mallory.pub}`) },
  });
  check('membership refused when the binding is signed by another key', badBinding.status === 400);

  const good = signNode(alice, membership, `~${alice.pub}/feed/one`, { hello: 'world' });
  check('a properly signed member node is stored', (await post('/v1/put', good)).status === 200);

  const tampered = { ...good, body: { hello: 'tampered' } };
  const t = await post('/v1/put', tampered);
  check('a tampered body is rejected', t.status === 400 && t.body.error === 'signature', JSON.stringify(t.body));

  const unvouched = signNode(mallory, undefined, `~${mallory.pub}/feed/x`, { hi: 1 });
  const u = await post('/v1/put', unvouched);
  check('a node with no membership is rejected', u.status === 400 && u.body.error === 'membership', JSON.stringify(u.body));

  const stolen = signNode(mallory, membership, `~${mallory.pub}/feed/y`, { hi: 2 });
  const st = await post('/v1/put', stolen);
  check('another key cannot reuse a membership', st.status === 400 && st.body.error === 'membership', JSON.stringify(st.body));

  const trespass = signNode(alice, membership, `~${mallory.pub}/feed/z`, { hi: 3 });
  const tr = await post('/v1/put', trespass);
  check('nobody writes into another key user space', tr.status === 400 && tr.body.error === 'scope', JSON.stringify(tr.body));

  const huge = signNode(alice, membership, `~${alice.pub}/feed/big`, { blob: 'x'.repeat(70 * 1024) });
  const h = await post('/v1/put', huge);
  check('an oversized node is rejected', h.status === 400 && h.body.error === 'too-big', JSON.stringify(h.body));

  // Cursor: a node written after the first sync point comes back, earlier ones do not.
  const mark = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 5));
  const later = signNode(alice, membership, `~${alice.pub}/feed/two`, { hello: 'later' });
  await post('/v1/put', later);
  const sinceAll = await (await fetch(`${BASE}/v1/since?t=`)).json();
  const sinceMark = await (await fetch(`${BASE}/v1/since?t=${encodeURIComponent(mark)}`)).json();
  check('since with no cursor returns the graph', Array.isArray(sinceAll.nodes) && sinceAll.nodes.length >= 2);
  check('since with a cursor returns only what is newer',
    sinceMark.nodes.length === 1 && sinceMark.nodes[0].soul.endsWith('/feed/two'),
    JSON.stringify(sinceMark.nodes.map((n) => n.soul)));

  // The append-only log has to survive a restart.
  child.kill();
  await new Promise((r) => setTimeout(r, 300));
  const again = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], {
    env: { ...process.env, PORT: String(PORT + 1), RELAY_DATA: DATA }, cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'],
  });
  again.stdout.on('data', () => {});
  for (let i = 0; i < 50; i += 1) {
    try { await fetch(`http://127.0.0.1:${PORT + 1}/v1/issuer`); break; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  const revived = await (await fetch(`http://127.0.0.1:${PORT + 1}/v1/since?t=`)).json();
  check('nodes survive a restart through the log', revived.nodes.length >= 2, `${revived.nodes.length}`);
  again.kill();
} finally {
  child.kill();
  fs.rmSync(DATA, { recursive: true, force: true });
}

console.log(failures ? `\n${failures} FAILED` : '\nall relay door tests passed');
process.exit(failures ? 1 : 0);
