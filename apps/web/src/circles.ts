import type { WordAccount } from './nostrAccount';
import { getNode, putNode, signNode, userSoul, type GraphNode } from './gunGraph';
import { unwrapSecret, wrapSecret, randomSecret } from './sea';

export interface MemberSummary {
  npub: string;
  gunPub: string;
  ecdhPub: string;
  name: string;
  color: string;
  avatar: string | null;
}

export interface Circle {
  id: string;
  kind: 'solo' | 'couple' | 'family' | 'friends';
  name: string;
  createdBy: string;
  createdAt: string;
  members: MemberSummary[];
  plan?: { planId: string; startedAt: string };
  pace: 'together' | 'apart';
  reveal: 'immediate' | 'after-you-answer';
  code: string;
  hostEcdhPub: string;
  wrappedKey: Record<string, string>;
}

export function defaultsFor(kind: Circle['kind']): Pick<Circle, 'pace' | 'reveal'> {
  if (kind === 'couple') return { pace: 'apart', reveal: 'immediate' };
  if (kind === 'family') return { pace: 'together', reveal: 'immediate' };
  if (kind === 'friends') return { pace: 'apart', reveal: 'after-you-answer' };
  return { pace: 'apart', reveal: 'immediate' };
}

export function memberOf(account: WordAccount): MemberSummary {
  return {
    npub: account.npub,
    gunPub: account.gun.pub,
    ecdhPub: account.gunEcdh.pub,
    name: account.name,
    color: account.color,
    avatar: account.avatar,
  };
}

function code(): string {
  return Math.random().toString(36).slice(2, 8);
}

export async function createCircle(account: WordAccount, input: { name: string; kind: Circle['kind']; pace?: Circle['pace']; reveal?: Circle['reveal'] }): Promise<Circle> {
  const key = randomSecret();
  const defaults = defaultsFor(input.kind);
  const circle: Circle = {
    id: `${account.gun.pub.slice(0, 12)}-${Date.now().toString(36)}`,
    kind: input.kind,
    name: input.name.trim().slice(0, 40) || 'Circle',
    createdBy: account.npub,
    createdAt: new Date().toISOString(),
    members: [memberOf(account)],
    pace: input.pace || defaults.pace,
    reveal: input.reveal || defaults.reveal,
    code: code(),
    hostEcdhPub: account.gunEcdh.pub,
    wrappedKey: { [account.gun.pub]: wrapSecret(account.gunEcdh.priv, account.gunEcdh.pub, key) },
  };
  await saveCircle(account, circle);
  return circle;
}

export async function saveCircle(account: WordAccount, circle: Circle) {
  const node = signNode(account, userSoul(account.gun.pub, `circle/${circle.id}`), circle);
  await putNode(node);
  await putNode(signNode(account, `circles/by-code/${circle.code}`, { soul: node.soul, id: circle.id }));
}

export function circleFromNode(node: GraphNode | null): Circle | null {
  if (!node) return null;
  const body = node.body as Circle;
  if (!body?.id || !Array.isArray(body.members)) return null;
  return body;
}

export async function loadCircle(account: WordAccount, id: string): Promise<Circle | null> {
  return circleFromNode(await getNode(userSoul(account.gun.pub, `circle/${id}`)));
}

export async function requestJoin(account: WordAccount, invite: string) {
  const code = invite.trim().toLowerCase();
  await putNode(signNode(account, `circles/join/${code}/${account.gun.pub}`, memberOf(account)));
}

export function admitMember(host: WordAccount, circle: Circle, member: MemberSummary): Circle {
  const key = openCircleKey(host, circle);
  return {
    ...circle,
    members: [...circle.members.filter((row) => row.npub !== member.npub), member],
    wrappedKey: {
      ...circle.wrappedKey,
      [member.gunPub]: wrapSecret(host.gunEcdh.priv, member.ecdhPub, key),
    },
  };
}

export function openCircleKey(account: WordAccount, circle: Circle): Uint8Array {
  const wrapped = circle.wrappedKey[account.gun.pub];
  if (!wrapped) throw new Error('key');
  return unwrapSecret(account.gunEcdh.priv, circle.hostEcdhPub || account.gunEcdh.pub, wrapped);
}

export function canSeeAnswers(circle: Circle, viewerNpub: string, viewerHasAnswered: boolean): boolean {
  if (circle.reveal === 'immediate') return true;
  if (circle.members.length === 1) return true;
  return viewerHasAnswered || circle.members[0]?.npub === viewerNpub && circle.members.length === 1;
}

export async function listCircles(account: WordAccount, nodes: GraphNode[]): Promise<Circle[]> {
  const prefix = userSoul(account.gun.pub, 'circle/');
  return nodes.filter((node) => node.soul.startsWith(prefix)).map(circleFromNode).filter((row): row is Circle => Boolean(row));
}

export function pointerCode(node: GraphNode): string | null {
  const match = node.soul.match(/^circles\/by-code\/([a-z0-9]+)$/i);
  if (!match) return null;
  return match[1];
}

export async function resolveInvite(code: string): Promise<{ soul: string; id: string } | null> {
  const node = await getNode(`circles/by-code/${code.trim().toLowerCase()}`);
  if (!node) return null;
  const body = node.body as { soul?: string; id?: string };
  if (!body.soul || !body.id) return null;
  return { soul: body.soul, id: body.id };
}
