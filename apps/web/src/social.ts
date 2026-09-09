import { wrapEvent, unwrapEvent } from 'nostr-tools/nip17';
import { hexToBytes } from '@noble/hashes/utils.js';
import type { Event } from 'nostr-tools/pure';
import { decode as decodeNip19 } from 'nostr-tools/nip19';
import type { WordAccount } from './nostrAccount';
import { allowedInFeed, getNode, nodesWithPrefix, putNode, signNode, userSoul, type GraphNode } from './gunGraph';
import { loadRelays } from './membership';
import { dayKey } from '@the-word/core';

export type FeedKind = 'badge' | 'verse' | 'session';

export interface FeedItem {
  id: string;
  kind: FeedKind;
  at: string;
  npub: string;
  gunPub: string;
  name: string;
  badgeId?: string;
  bookId?: number;
  chapter?: number;
  verse?: number;
  note?: string;
  planId?: string;
  sessionId?: string;
}

export interface Friend {
  npub: string;
  addedAt: string;
}

export interface DirectMessage {
  id: string;
  from: string;
  to: string;
  text: string;
  at: string;
}

function asItem(node: GraphNode): FeedItem | null {
  const body = node.body as FeedItem;
  if (!body?.id || !body.kind) return null;
  return { ...body, npub: node.npub, gunPub: node.gunPub, at: body.at || node.at };
}

export async function publishFeed(account: WordAccount, item: Omit<FeedItem, 'npub' | 'gunPub' | 'name' | 'at'> & { at?: string }) {
  const full: FeedItem = {
    ...item,
    at: item.at || new Date().toISOString(),
    npub: account.npub,
    gunPub: account.gun.pub,
    name: account.name,
  };
  const node = signNode(account, userSoul(account.gun.pub, `feed/${full.id}`), full);
  await putNode(node);
  await putNode(signNode(account, `feed/by-day/${dayKey(new Date(full.at))}/${full.id}`, { soul: node.soul }));
  return full;
}

export async function loadFeed(): Promise<FeedItem[]> {
  const issuer = loadRelays().issuerPub;
  const pointers = await nodesWithPrefix('feed/by-day/');
  const items: FeedItem[] = [];
  for (const pointer of pointers) {
    const soul = (pointer.body as { soul?: string }).soul;
    if (!soul || !soul.startsWith('~')) continue;
    const node = await getNode(soul);
    if (!node) continue;
    if (issuer && !allowedInFeed(node, issuer)) continue;
    if (!issuer && node.npub) {
      // No issuer pinned yet: show only our own local items.
      continue;
    }
    const item = asItem(node);
    if (item) items.push(item);
  }
  // Always include our own user-space feed, issuer or not.
  const mine = await nodesWithPrefix(userSoul(loadRelays() && '', ''));
  void mine;
  return items.sort((a, b) => a.at < b.at ? 1 : -1);
}

export async function loadOwnFeed(account: WordAccount): Promise<FeedItem[]> {
  const rows = await nodesWithPrefix(userSoul(account.gun.pub, 'feed/'));
  return rows.map(asItem).filter((row): row is FeedItem => Boolean(row)).sort((a, b) => a.at < b.at ? 1 : -1);
}

export async function visibleFeed(account: WordAccount): Promise<FeedItem[]> {
  const issuer = loadRelays().issuerPub;
  const pointers = await nodesWithPrefix('feed/by-day/');
  const seen = new Set<string>();
  const items: FeedItem[] = [];
  async function take(node: GraphNode | null) {
    if (!node) return;
    const item = asItem(node);
    if (!item || seen.has(item.id)) return;
    const own = node.gunPub === account.gun.pub;
    if (!own && (!issuer || !allowedInFeed(node, issuer))) return;
    seen.add(item.id);
    items.push(item);
  }
  for (const pointer of pointers) {
    const soul = (pointer.body as { soul?: string }).soul;
    if (soul) await take(await getNode(soul));
  }
  for (const node of await nodesWithPrefix(userSoul(account.gun.pub, 'feed/'))) await take(node);
  return items.sort((a, b) => a.at < b.at ? 1 : -1);
}

export async function loadFriends(account: WordAccount): Promise<Friend[]> {
  const node = await getNode(userSoul(account.gun.pub, 'friends'));
  const body = node?.body as { friends?: Friend[] } | undefined;
  return body?.friends ?? [];
}

export async function saveFriends(account: WordAccount, friends: Friend[]) {
  await putNode(signNode(account, userSoul(account.gun.pub, 'friends'), { friends }));
}

export function parseNpub(value: string): string | null {
  const trimmed = value.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return trimmed.toLowerCase();
  try {
    const decoded = decodeNip19(trimmed);
    if (decoded.type === 'npub') return decoded.data;
  } catch { /* not an npub */ }
  return null;
}

export async function shareVerse(account: WordAccount, ref: { bookId: number; chapter: number; verse: number; note?: string }) {
  return publishFeed(account, {
    id: `${account.gun.pub.slice(0, 8)}-verse-${ref.bookId}-${ref.chapter}-${ref.verse}-${Date.now().toString(36)}`,
    kind: 'verse',
    bookId: ref.bookId,
    chapter: ref.chapter,
    verse: ref.verse,
    note: ref.note,
  });
}

export async function shareBadge(account: WordAccount, badgeId: string, at: string) {
  return publishFeed(account, { id: `${account.gun.pub.slice(0, 8)}-badge-${badgeId}`, kind: 'badge', badgeId, at });
}

export async function sendDirectMessage(account: WordAccount, to: string, text: string): Promise<DirectMessage> {
  const hex = parseNpub(to);
  if (!hex) throw new Error('npub');
  const wrapped = wrapEvent(hexToBytes(account.secretKey), { publicKey: hex }, text) as Event;
  const message: DirectMessage = {
    id: wrapped.id,
    from: account.npub,
    to: hex,
    text,
    at: new Date().toISOString(),
  };
  await putNode(signNode(account, userSoul(account.gun.pub, `dm/${message.id}`), { message, wrapped }));
  await putNode(signNode(account, `dm/for/${hex}/${message.id}`, { soul: userSoul(account.gun.pub, `dm/${message.id}`) }));
  return message;
}

export async function loadMessages(account: WordAccount): Promise<DirectMessage[]> {
  const own = await nodesWithPrefix(userSoul(account.gun.pub, 'dm/'));
  const inbox = await nodesWithPrefix('dm/for/');
  const out: DirectMessage[] = [];
  for (const node of own) {
    const body = node.body as { message?: DirectMessage };
    if (body.message) out.push(body.message);
  }
  for (const pointer of inbox) {
    if (!pointer.soul.includes(account.pubkey)) continue;
    const soul = (pointer.body as { soul?: string }).soul;
    if (!soul) continue;
    const node = await getNode(soul);
    const wrapped = (node?.body as { wrapped?: Event })?.wrapped;
    if (!wrapped) continue;
    try {
      const rumor = unwrapEvent(wrapped, hexToBytes(account.secretKey)) as { content?: string; pubkey?: string; created_at?: number };
      out.push({
        id: node!.soul,
        from: rumor.pubkey || node!.npub,
        to: account.npub,
        text: rumor.content || '',
        at: rumor.created_at ? new Date(rumor.created_at * 1000).toISOString() : node!.at,
      });
    } catch { /* not for us */ }
  }
  const seen = new Set<string>();
  return out.filter((row) => { if (seen.has(row.id)) return false; seen.add(row.id); return true; })
    .sort((a, b) => a.at < b.at ? 1 : -1);
}
