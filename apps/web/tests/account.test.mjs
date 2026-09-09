import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { generateSecretKey } from 'nostr-tools/pure';

const here = path.dirname(fileURLToPath(import.meta.url));
const compiledDir = path.join(here, '.compiled');
fs.mkdirSync(compiledDir, { recursive: true });
const src = fs.readFileSync(path.join(here, '../src/nostrAccount.ts'), 'utf8');
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: 'nostrAccount.ts',
});
const compiled = path.join(compiledDir, 'nostrAccount.mjs');
fs.writeFileSync(compiled, outputText);

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
  clear: () => store.clear(),
};

const account = await import(pathToFileURL(compiled).href);

function fresh() {
  store.clear();
  account.resetAccountCache();
}

test('Gun pair is derived, never the raw Nostr scalar, and is deterministic', () => {
  const secret = generateSecretKey();
  const first = account.deriveGunPair(secret);
  const second = account.deriveGunPair(secret);
  assert.equal(first.gun.priv, second.gun.priv);
  assert.equal(first.gun.pub, second.gun.pub);
  assert.equal(first.gunEcdh.priv, second.gunEcdh.priv);
  assert.notEqual(first.gun.priv, Buffer.from(secret).toString('hex'));
  assert.notEqual(first.gun.priv, first.gunEcdh.priv);
  assert.match(first.gun.pub, /^04[0-9a-f]{128}$/);
  assert.equal(first.gun.jwk.crv, 'P-256');
  const other = account.deriveGunPair(generateSecretKey());
  assert.notEqual(first.gun.priv, other.gun.priv);
});

test('first load mints a key, migrates the old display profile, and attests both ways', () => {
  fresh();
  store.set('word.partyIdentity', JSON.stringify({
    id: 'me-old',
    name: 'Steady Cedar',
    color: '#2f9e6f',
    avatar: null,
  }));
  const minted = account.loadAccount();
  assert.equal(minted.name, 'Steady Cedar');
  assert.equal(minted.color, '#2f9e6f');
  assert.match(minted.npub, /^npub1/);
  assert.equal(minted.pubkey.length, 64);
  assert.ok(account.verifyAttestation(minted));
  const again = JSON.parse(store.get('word.account'));
  assert.equal(again.npub, minted.npub);
  const identity = JSON.parse(store.get('word.partyIdentity'));
  assert.equal(identity.id, minted.npub);
  assert.equal(identity.name, 'Steady Cedar');
});

test('NIP-49 backup restores the same npub and Gun pair', () => {
  fresh();
  const original = account.loadAccount();
  const backup = account.exportBackup('correct horse', 10);
  assert.match(backup, /^ncryptsec1/);
  store.clear();
  account.resetAccountCache();
  const replaced = account.loadAccount();
  assert.notEqual(replaced.npub, original.npub);
  account.restoreBackup(backup, 'correct horse');
  account.resetAccountCache();
  const restored = account.loadAccount();
  assert.equal(restored.npub, original.npub);
  assert.equal(restored.gun.pub, original.gun.pub);
  assert.equal(restored.gunEcdh.pub, original.gunEcdh.pub);
  assert.ok(account.verifyAttestation(restored));
});

test('wrong backup password fails and leaves the current account', () => {
  fresh();
  const original = account.loadAccount();
  const backup = account.exportBackup('right-password', 10);
  assert.throws(() => account.restoreBackup(backup, 'wrong-password'));
  account.resetAccountCache();
  assert.equal(account.loadAccount().npub, original.npub);
});

test('restore token is taken from ?restore= and stripped from the URL', () => {
  const token = 'ncryptsec1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq';
  const location = { pathname: '/The-Word/', search: `?restore=${token}`, hash: '#read' };
  const replaced = [];
  globalThis.window = {
    location,
    history: {
      replaceState(_state, _title, url) {
        replaced.push(url);
        const [path, hash] = String(url).split('#');
        const q = path.indexOf('?');
        location.pathname = q >= 0 ? path.slice(0, q) : path;
        location.search = q >= 0 ? path.slice(q) : '';
        location.hash = hash !== undefined ? `#${hash}` : '';
      },
    },
  };
  assert.equal(account.takeRestoreToken(), token);
  assert.equal(replaced.at(-1), '/The-Word/#read');
  assert.equal(account.takeRestoreToken(), null);
});
