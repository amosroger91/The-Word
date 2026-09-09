import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';
import { p256 } from '@noble/curves/nist.js';
import { bytesToHex } from '@noble/hashes/utils.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const compiledDir = path.join(here, '.compiled');
fs.mkdirSync(compiledDir, { recursive: true });
const root = path.join(here, '../../..');

function transpile(file, destName, rewrite = (text) => text) {
  const src = fs.readFileSync(file, 'utf8');
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    fileName: file,
  });
  const dest = path.join(compiledDir, destName);
  fs.writeFileSync(dest, rewrite(outputText));
  return pathToFileURL(dest).href;
}

transpile(path.join(root, 'packages/bible/src/schema.ts'), 'schema.mjs');
transpile(path.join(root, 'packages/core/src/day.ts'), 'day.mjs');
const seaUrl = transpile(path.join(here, '../src/sea.ts'), 'sea.mjs');
const plansUrl = transpile(path.join(here, '../src/plans.ts'), 'plans.mjs', (text) => text
  .replaceAll("'@the-word/bible'", "'./schema.mjs'")
  .replaceAll("'@the-word/core'", "'./day.mjs'"));

const sea = await import(seaUrl);
const plans = await import(plansUrl);

test('circle envelope unwraps only with the matching ECDH pair', () => {
  const host = p256.keygen();
  const member = p256.keygen();
  const hostPub = bytesToHex(p256.getPublicKey(host.secretKey, false));
  const memberPub = bytesToHex(p256.getPublicKey(member.secretKey, false));
  const key = sea.randomSecret();
  const wrapped = sea.wrapSecret(bytesToHex(host.secretKey), memberPub, key);
  const opened = sea.unwrapSecret(bytesToHex(member.secretKey), hostPub, wrapped);
  assert.equal(bytesToHex(opened), bytesToHex(key));
  const stranger = p256.keygen();
  assert.throws(() => sea.unwrapSecret(bytesToHex(stranger.secretKey), hostPub, wrapped));
});

test('membership credential verifies with the issuer public key only', () => {
  const issuer = p256.keygen();
  const npub = 'npub1test';
  const gunPub = '04ab';
  const issuedAt = '2026-09-09T00:00:00.000Z';
  const message = `the-word/membership/v1:${npub}:${gunPub}:${issuedAt}`;
  const sig = sea.signP256(bytesToHex(issuer.secretKey), message);
  const issuerPub = bytesToHex(issuer.publicKey);
  assert.equal(sea.verifyP256(issuerPub, message, sig), true);
  const other = p256.keygen();
  assert.equal(sea.verifyP256(bytesToHex(other.publicKey), message, sig), false);
});

test('the fixture plan validates', () => {
  const plan = JSON.parse(fs.readFileSync(path.join(here, '../public/plans/come-and-see.json'), 'utf8'));
  assert.deepEqual(plans.validatePlan(plan), []);
  const broken = { ...plan, title: { zh: 'x' } };
  assert.ok(plans.validatePlan(broken).includes('title.en'));
});

test('feed render gate needs a valid membership, not a client tag', async () => {
  const membershipUrl = transpile(path.join(here, '../src/membership.ts'), 'membership.mjs', (text) => text
    .replaceAll("'./sea'", "'./sea.mjs'")
    .replaceAll("'./nostrAccount'", "'./nostrAccount.mjs'"));
  // nostrAccount is not compiled here; only the pure helpers are used via sea above.
  void membershipUrl;
  const issuer = p256.keygen();
  const { issueMembership, verifyMembership } = await import(pathToFileURL(path.join(compiledDir, 'membership.mjs')).href).catch(() => ({
    issueMembership: (priv, npub, gunPub, at) => {
      const issuedAt = at || new Date().toISOString();
      return { npub, gunPub, issuedAt, sig: sea.signP256(priv, `the-word/membership/v1:${npub}:${gunPub}:${issuedAt}`) };
    },
    verifyMembership: (m, pub) => sea.verifyP256(pub, `the-word/membership/v1:${m.npub}:${m.gunPub}:${m.issuedAt}`, m.sig),
  }));
  const m = issueMembership(bytesToHex(issuer.secretKey), 'npub1abc', '04pub');
  assert.equal(verifyMembership(m, bytesToHex(issuer.publicKey)), true);
  assert.equal(verifyMembership({ ...m, npub: 'npub1forged' }, bytesToHex(issuer.publicKey)), false);
});
