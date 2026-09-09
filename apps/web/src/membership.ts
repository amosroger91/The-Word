// Membership is a notary signature the client cannot mint. Issuance needs the
// survivor relay; verification does not. See docs/study-plans-framework.md §4.
import { verifyEvent } from 'nostr-tools/pure';
import { loadAccount, type WordAccount } from './nostrAccount';
import { signP256, verifyP256 } from './sea';

export const MEMBERSHIP_KEY = 'word.membership';
export const RELAYS_KEY = 'word.relays';

export interface Membership {
  npub: string;
  gunPub: string;
  issuedAt: string;
  sig: string;
}

export interface RelayConfig {
  urls: string[];
  issuerPub: string;
}

export const DEFAULT_RELAYS: RelayConfig = { urls: [], issuerPub: '' };

export function membershipMessage(npub: string, gunPub: string, issuedAt: string): string {
  return `the-word/membership/v1:${npub}:${gunPub}:${issuedAt}`;
}

export function issueMembership(issuerPrivHex: string, npub: string, gunPub: string, issuedAt = new Date().toISOString()): Membership {
  return { npub, gunPub, issuedAt, sig: signP256(issuerPrivHex, membershipMessage(npub, gunPub, issuedAt)) };
}

export function verifyMembership(membership: Membership, issuerPub: string): boolean {
  if (!issuerPub || !membership?.npub || !membership.gunPub || !membership.sig) return false;
  return verifyP256(issuerPub, membershipMessage(membership.npub, membership.gunPub, membership.issuedAt), membership.sig);
}

export function loadRelays(): RelayConfig {
  try {
    const raw = localStorage.getItem(RELAYS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<RelayConfig>;
      return { urls: Array.isArray(parsed.urls) ? parsed.urls.map(String).filter(Boolean) : [], issuerPub: String(parsed.issuerPub || '') };
    }
  } catch { /* ignore */ }
  return { ...DEFAULT_RELAYS };
}

export function saveRelays(config: RelayConfig) {
  try { localStorage.setItem(RELAYS_KEY, JSON.stringify(config)); } catch { /* blocked */ }
}

export function loadMembership(): Membership | null {
  try {
    const raw = localStorage.getItem(MEMBERSHIP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Membership;
    return parsed?.sig ? parsed : null;
  } catch { return null; }
}

export function saveMembership(membership: Membership) {
  try { localStorage.setItem(MEMBERSHIP_KEY, JSON.stringify(membership)); } catch { /* blocked */ }
}

export function bindingHolds(account: WordAccount): boolean {
  if (!verifyEvent(account.nostrBinding)) return false;
  if (account.nostrBinding.pubkey !== account.pubkey) return false;
  try {
    const body = JSON.parse(account.nostrBinding.content) as { gunPub?: string };
    if (body.gunPub !== account.gun.pub) return false;
  } catch { return false; }
  return account.gunBinding.npub === account.npub && account.gunBinding.gunPub === account.gun.pub;
}

export async function fetchIssuerPub(urls: string[]): Promise<string> {
  for (const url of urls) {
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/v1/issuer`);
      if (!res.ok) continue;
      const body = await res.json() as { pub?: string };
      if (body.pub) return body.pub;
    } catch { /* try next */ }
  }
  return '';
}

export async function requestMembership(account = loadAccount(), relays = loadRelays()): Promise<Membership> {
  if (!bindingHolds(account)) throw new Error('binding');
  const urls = relays.urls;
  if (!urls.length) throw new Error('relay');
  let last = 'relay';
  for (const url of urls) {
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/v1/membership`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          npub: account.npub,
          gunPub: account.gun.pub,
          nostrBinding: account.nostrBinding,
          gunBinding: account.gunBinding,
        }),
      });
      if (!res.ok) { last = 'rejected'; continue; }
      const membership = await res.json() as Membership;
      const issuer = relays.issuerPub || await fetchIssuerPub(urls);
      if (!verifyMembership(membership, issuer)) { last = 'issuer'; continue; }
      if (membership.npub !== account.npub || membership.gunPub !== account.gun.pub) { last = 'mismatch'; continue; }
      saveMembership(membership);
      if (!relays.issuerPub && issuer) saveRelays({ ...relays, issuerPub: issuer });
      return membership;
    } catch { last = 'relay'; }
  }
  throw new Error(last);
}

export async function loadPublishedRelays(): Promise<RelayConfig> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}relay.json`);
    if (!res.ok) return loadRelays();
    const published = await res.json() as Partial<RelayConfig>;
    const local = loadRelays();
    if (local.urls.length || local.issuerPub) return local;
    const next = { urls: Array.isArray(published.urls) ? published.urls.map(String).filter(Boolean) : [], issuerPub: String(published.issuerPub || '') };
    saveRelays(next);
    return next;
  } catch {
    return loadRelays();
  }
}
