// P-256 helpers for membership, graph signatures, and circle envelopes.
// Matches Gun SEA's curve without taking on Gun's HAM merge.
import { p256 } from '@noble/curves/nist.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes, hexToBytes, randomBytes, utf8ToBytes } from '@noble/hashes/utils.js';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

export function signP256(privHex: string, message: string): string {
  const sig = p256.sign(utf8ToBytes(message), hexToBytes(privHex), { lowS: true, prehash: true });
  return bytesToHex(sig);
}

export function verifyP256(pubHex: string, message: string, sigHex: string): boolean {
  try {
    return p256.verify(hexToBytes(sigHex), utf8ToBytes(message), hexToBytes(pubHex), { prehash: true, lowS: true });
  } catch {
    return false;
  }
}

function sharedKey(privHex: string, peerPubHex: string): Uint8Array {
  const shared = p256.getSharedSecret(hexToBytes(privHex), hexToBytes(peerPubHex));
  return sha256(shared.length > 32 && shared[0] === 4 ? shared.subarray(1, 33) : shared.subarray(shared.length === 33 ? 1 : 0, shared.length === 33 ? 33 : 32));
}

export function wrapSecret(privHex: string, peerPubHex: string, secret: Uint8Array): string {
  const nonce = randomBytes(24);
  const box = xchacha20poly1305(sharedKey(privHex, peerPubHex), nonce).encrypt(secret);
  return bytesToHex(concatBytes(nonce, box));
}

export function unwrapSecret(privHex: string, peerPubHex: string, wrappedHex: string): Uint8Array {
  const packed = hexToBytes(wrappedHex);
  const nonce = packed.subarray(0, 24);
  const box = packed.subarray(24);
  return xchacha20poly1305(sharedKey(privHex, peerPubHex), nonce).decrypt(box);
}

export function randomSecret(length = 32): Uint8Array {
  return randomBytes(length);
}

export function sealBytes(key: Uint8Array, data: Uint8Array): string {
  const nonce = randomBytes(24);
  return bytesToHex(concatBytes(nonce, xchacha20poly1305(key, nonce).encrypt(data)));
}

export function openBytes(key: Uint8Array, wrappedHex: string): Uint8Array {
  const packed = hexToBytes(wrappedHex);
  return xchacha20poly1305(key, packed.subarray(0, 24)).decrypt(packed.subarray(24));
}

export function seaPub(uncompressedHex: string): string {
  const bytes = hexToBytes(uncompressedHex);
  const x = bytes.subarray(1, 33);
  const y = bytes.subarray(33, 65);
  return `${btoa(String.fromCharCode(...x))}.${btoa(String.fromCharCode(...y))}`;
}
