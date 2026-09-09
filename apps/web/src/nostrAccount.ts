// Nostr is who you are. Gun (later) is what the group is doing.
// Different curves, so the Gun pair is HKDF-derived from the Nostr secret —
// one backup restores both. See docs/study-plans-framework.md §3.
import { finalizeEvent, generateSecretKey, getPublicKey, verifyEvent, type Event } from 'nostr-tools/pure';
import { npubEncode } from 'nostr-tools/nip19';
import { decrypt as decryptNcryptsec, encrypt as encryptNcryptsec } from 'nostr-tools/nip49';
import { p256 } from '@noble/curves/nist.js';
import { hkdf } from '@noble/hashes/hkdf.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

export const ACCOUNT_KEY = 'word.account';
const IDENTITY_KEY = 'word.partyIdentity';
const NAME_KEY = 'word.partyName';

export const GUN_SALT = 'the-word/gun/v1';
export const GUN_SIGN_INFO = 'sea-p256';
// SEA also needs ECDH on P-256. Separate info so the signing scalar is never
// reused for key agreement. gunGraph.ts will consume this pair.
export const GUN_ECDH_INFO = 'sea-p256-ecdh';
export const BINDING_D = 'the-word/gun-binding';
export const MIN_BACKUP_PASSWORD = 8;

const ADJECTIVES = ['Gentle', 'Faithful', 'Bright', 'Humble', 'Steady', 'Kind', 'Quiet', 'Joyful', 'Patient', 'Bold'];
const NOUNS = ['Lamp', 'Cedar', 'River', 'Dove', 'Shepherd', 'Vine', 'Anchor', 'Harvest', 'Pilgrim', 'Beacon'];
const COLORS = ['#947849', '#5c7cfa', '#2f9e6f', '#c2571e', '#9b5cb4', '#3a86ca', '#c04b5a', '#6a8a2f'];

export interface GunKeypair {
  info: string;
  priv: string;
  pub: string;
  jwk: { kty: 'EC'; crv: 'P-256'; d: string; x: string; y: string };
}

export interface GunBinding {
  npub: string;
  gunPub: string;
  created_at: number;
  sig: string;
}

export interface WordAccount {
  version: 1;
  secretKey: string;
  pubkey: string;
  npub: string;
  gun: GunKeypair;
  gunEcdh: GunKeypair;
  name: string;
  color: string;
  avatar: string | null;
  nostrBinding: Event;
  gunBinding: GunBinding;
}

export interface AccountProfile {
  name: string;
  color: string;
  avatar: string | null;
}

let cached: WordAccount | null = null;

function randomFrom<T>(list: T[]): T { return list[Math.floor(Math.random() * list.length)]; }

function mintProfile(): AccountProfile {
  return {
    name: `${randomFrom(ADJECTIVES)} ${randomFrom(NOUNS)}`,
    color: randomFrom(COLORS),
    avatar: null,
  };
}

function toB64url(bytes: Uint8Array): string {
  let bin = '';
  for (const byte of bytes) bin += String.fromCharCode(byte);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function readStorage(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function writeStorage(key: string, value: string) {
  try { localStorage.setItem(key, value); } catch { /* storage blocked */ }
}

function legacyProfile(): AccountProfile | null {
  try {
    const raw = readStorage(IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AccountProfile & { id?: string }>;
      if (parsed?.name) {
        return {
          name: String(parsed.name).trim().slice(0, 40) || mintProfile().name,
          color: parsed.color || randomFrom(COLORS),
          avatar: parsed.avatar || null,
        };
      }
    }
    const name = readStorage(NAME_KEY)?.trim();
    if (name) return { ...mintProfile(), name: name.slice(0, 40) };
  } catch { /* ignore corrupt legacy */ }
  return null;
}

export function deriveP256(nostrSecret: Uint8Array, baseInfo: string): GunKeypair {
  const salt = utf8ToBytes(GUN_SALT);
  for (let i = 0; i < 256; i++) {
    const info = i === 0 ? baseInfo : `${baseInfo}:${i}`;
    const seed = hkdf(sha256, nostrSecret, salt, utf8ToBytes(info), 32);
    if (!p256.utils.isValidSecretKey(seed)) continue;
    const pub = p256.getPublicKey(seed, false);
    return {
      info,
      priv: bytesToHex(seed),
      pub: bytesToHex(pub),
      jwk: {
        kty: 'EC',
        crv: 'P-256',
        d: toB64url(seed),
        x: toB64url(pub.subarray(1, 33)),
        y: toB64url(pub.subarray(33, 65)),
      },
    };
  }
  throw new Error('Could not derive a P-256 key');
}

export function deriveGunPair(nostrSecret: Uint8Array): { gun: GunKeypair; gunEcdh: GunKeypair } {
  return {
    gun: deriveP256(nostrSecret, GUN_SIGN_INFO),
    gunEcdh: deriveP256(nostrSecret, GUN_ECDH_INFO),
  };
}

function bindingMessage(npub: string, gunPub: string): Uint8Array {
  return utf8ToBytes(`${BINDING_D}:${npub}:${gunPub}`);
}

export function attest(secret: Uint8Array, _pubkey: string, npub: string, gun: GunKeypair, gunEcdh: GunKeypair): {
  nostrBinding: Event;
  gunBinding: GunBinding;
} {
  const nostrBinding = finalizeEvent({
    kind: 30078,
    created_at: Math.floor(Date.now() / 1000),
    tags: [['d', BINDING_D]],
    content: JSON.stringify({ v: 1, gunPub: gun.pub, gunEcdhPub: gunEcdh.pub }),
  }, secret);
  const sig = p256.sign(bindingMessage(npub, gun.pub), hexToBytes(gun.priv), { lowS: true, prehash: true });
  return {
    nostrBinding,
    gunBinding: { npub, gunPub: gun.pub, created_at: nostrBinding.created_at, sig: bytesToHex(sig) },
  };
}

export function verifyAttestation(account: WordAccount): boolean {
  if (!verifyEvent(account.nostrBinding)) return false;
  if (account.nostrBinding.pubkey !== account.pubkey) return false;
  if (!account.nostrBinding.tags.some((tag) => tag[0] === 'd' && tag[1] === BINDING_D)) return false;
  let body: { gunPub?: string };
  try { body = JSON.parse(account.nostrBinding.content) as { gunPub?: string }; }
  catch { return false; }
  if (body.gunPub !== account.gun.pub) return false;
  if (account.gunBinding.npub !== account.npub || account.gunBinding.gunPub !== account.gun.pub) return false;
  return p256.verify(
    hexToBytes(account.gunBinding.sig),
    bindingMessage(account.npub, account.gun.pub),
    hexToBytes(account.gun.pub),
    { prehash: true, lowS: true },
  );
}

export function accountFromSecret(secret: Uint8Array, profile?: Partial<AccountProfile> | null): WordAccount {
  const pubkey = getPublicKey(secret);
  const npub = npubEncode(pubkey);
  const { gun, gunEcdh } = deriveGunPair(secret);
  const minted = mintProfile();
  const { nostrBinding, gunBinding } = attest(secret, pubkey, npub, gun, gunEcdh);
  return {
    version: 1,
    secretKey: bytesToHex(secret),
    pubkey,
    npub,
    gun,
    gunEcdh,
    name: (profile?.name || minted.name).trim().slice(0, 40) || minted.name,
    color: profile?.color || minted.color,
    avatar: profile?.avatar ?? null,
    nostrBinding,
    gunBinding,
  };
}

function persist(account: WordAccount): WordAccount {
  cached = account;
  writeStorage(ACCOUNT_KEY, JSON.stringify(account));
  writeStorage(IDENTITY_KEY, JSON.stringify({
    id: account.npub,
    name: account.name,
    color: account.color,
    avatar: account.avatar,
  }));
  writeStorage(NAME_KEY, account.name);
  return account;
}

function parseStored(raw: string): WordAccount | null {
  try {
    const parsed = JSON.parse(raw) as Partial<WordAccount>;
    if (parsed?.version !== 1 || !parsed.secretKey) return null;
    const secret = hexToBytes(parsed.secretKey);
    if (secret.length !== 32) return null;
    const fresh = accountFromSecret(secret, parsed);
    // Re-derive always wins: stored Gun keys are a cache, not a second source of truth.
    return fresh;
  } catch {
    return null;
  }
}

export function loadAccount(): WordAccount {
  if (cached) return cached;
  const stored = readStorage(ACCOUNT_KEY);
  if (stored) {
    const parsed = parseStored(stored);
    if (parsed) return persist(parsed);
  }
  return persist(accountFromSecret(generateSecretKey(), legacyProfile()));
}

export function updateProfile(next: Partial<AccountProfile>): WordAccount {
  const account = loadAccount();
  const name = next.name !== undefined ? next.name.trim().slice(0, 40) : account.name;
  persist({
    ...account,
    name: name || account.name,
    color: next.color || account.color,
    avatar: next.avatar !== undefined ? next.avatar : account.avatar,
  });
  return cached!;
}

export function exportBackup(password: string, logn = 16): string {
  if (password.length < MIN_BACKUP_PASSWORD) throw new Error('password');
  return encryptNcryptsec(hexToBytes(loadAccount().secretKey), password, logn);
}

export function restoreBackup(ncryptsec: string, password: string): WordAccount {
  if (password.length < MIN_BACKUP_PASSWORD) throw new Error('password');
  const secret = decryptNcryptsec(ncryptsec.trim(), password);
  const previous = cached || (() => {
    try {
      const raw = readStorage(ACCOUNT_KEY);
      return raw ? parseStored(raw) : null;
    } catch { return null; }
  })();
  return persist(accountFromSecret(secret, previous));
}

export function takeRestoreToken(): string | null {
  if (typeof window === 'undefined') return null;
  const { location, history } = window;
  const params = new URLSearchParams(location.search);
  let token = params.get('restore')?.trim() ?? '';
  const fromQuery = Boolean(token);
  if (!token && location.hash.toLowerCase().startsWith('#restore=')) {
    token = decodeURIComponent(location.hash.slice('#restore='.length)).trim();
  }
  if (!/^ncryptsec1[a-z0-9]+$/i.test(token)) return null;
  if (fromQuery) {
    params.delete('restore');
    const search = params.toString();
    history.replaceState(null, '', `${location.pathname}${search ? `?${search}` : ''}${location.hash}`);
  } else {
    history.replaceState(null, '', `${location.pathname}${location.search}`);
  }
  return token;
}

/** Test helper: drop the in-memory cache so the next load hits storage. */
export function resetAccountCache() {
  cached = null;
}
