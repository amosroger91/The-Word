import { useCallback, useEffect, useState } from 'react';
import { loadAccount, type WordAccount } from './nostrAccount';
import {
  fetchIssuerPub,
  loadMembership,
  loadPublishedRelays,
  loadRelays,
  requestMembership,
  saveRelays,
  type Membership,
  type RelayConfig,
} from './membership';
import { loadEvents, mergeLedgers, saveEvents, appendEvent, eventsForActor, type DraftEvent, type LedgerEvent } from './ledger';
import { getNode, loadGraph, nodesWithPrefix, pullRelays, putNode, signNode, startGraphGossip, userSoul } from './gunGraph';
import { loadPlan, loadPlanIndex, type StudyPlan } from './plans';
import {
  admitMember,
  circleFromNode,
  createCircle,
  defaultsFor,
  listCircles,
  memberOf,
  requestJoin,
  resolveInvite,
  saveCircle,
  type Circle,
  type MemberSummary,
} from './circles';
import { loadFriends, loadMessages, saveFriends, sendDirectMessage, shareBadge, shareVerse, visibleFeed, type DirectMessage, type FeedItem, type Friend } from './social';
import type { AnswerValue } from './ledger';
import type { EarnedBadge } from './badges';

export function useStudy(earned: EarnedBadge[]) {
  const [account] = useState<WordAccount>(() => loadAccount());
  const [relays, setRelays] = useState<RelayConfig>(loadRelays);
  const [membership, setMembership] = useState<Membership | null>(loadMembership);
  const [relayState, setRelayState] = useState<'off' | 'down' | 'ok'>('off');
  const [plans, setPlans] = useState<StudyPlan[]>([]);
  const [circles, setCircles] = useState<Circle[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [events, setEvents] = useState<LedgerEvent[]>([]);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    const mine = eventsForActor(await loadEvents(), account.gun.pub);
    setEvents(mine);
    const graph = [...(await loadGraph()).values()];
    setCircles(await listCircles(account, graph));
    setFeed(await visibleFeed(account));
    setFriends(await loadFriends(account));
    setMessages(await loadMessages(account));
  }, [account]);

  useEffect(() => {
    startGraphGossip();
    let cancelled = false;
    void (async () => {
      const published = await loadPublishedRelays();
      if (cancelled) return;
      setRelays(published);
      if (!published.urls.length) { setRelayState('off'); await refresh(); return; }
      try {
        const issuer = published.issuerPub || await fetchIssuerPub(published.urls);
        if (issuer && issuer !== published.issuerPub) {
          const next = { ...published, issuerPub: issuer };
          saveRelays(next);
          setRelays(next);
        }
        await pullRelays(published);
        const remote = await nodesWithPrefix(userSoul(account.gun.pub, 'ledger/'));
        const incoming = remote.map((node) => node.body as LedgerEvent).filter((row) => row?.id);
        if (incoming.length) await saveEvents(mergeLedgers(await loadEvents(), incoming));
        setRelayState('ok');
        if (!loadMembership()) {
          try { setMembership(await requestMembership(account, loadRelays())); }
          catch { /* issuance needs the VPS; local features still work */ }
        }
      } catch {
        setRelayState('down');
      }
      if (!cancelled) await refresh();
    })();
    return () => { cancelled = true; };
  }, [account, refresh]);

  useEffect(() => {
    for (const badge of earned) {
      void shareBadge(account, badge.id, badge.earnedAt).then(() => refresh());
    }
  }, [account, earned, refresh]);

  const writeLedger = useCallback(async (draft: DraftEvent) => {
    const all = await loadEvents();
    const mine = eventsForActor(all, account.gun.pub);
    const { event } = appendEvent(mine, account.gun.pub, draft);
    await saveEvents(mergeLedgers(all, [event]));
    await putNode(signNode(account, userSoul(account.gun.pub, `ledger/${event.id}`), event));
    await refresh();
    return event;
  }, [account, refresh]);

  return {
    account,
    relays,
    membership,
    relayState,
    plans,
    circles,
    feed,
    friends,
    messages,
    events,
    error,
    setError,
    refresh,
    loadPlans: async () => {
      const ids = await loadPlanIndex();
      const loaded: StudyPlan[] = [];
      for (const id of ids) {
        try { loaded.push(await loadPlan(id)); } catch { /* skip bad */ }
      }
      setPlans(loaded);
      return loaded;
    },
    saveRelayConfig: (next: RelayConfig) => { saveRelays(next); setRelays(next); },
    askMembership: async () => {
      try {
        setMembership(await requestMembership(account, loadRelays()));
        setError('');
      } catch {
        setError('membership');
      }
    },
    answer: (planId: string, sessionId: string, questionId: string, value: AnswerValue, circleId?: string, share: 'private' | 'circle' = 'private') =>
      writeLedger({ kind: 'answer', at: new Date().toISOString(), planId, sessionId, questionId, value, circleId, share }),
    finishSession: (planId: string, sessionId: string, circleId?: string) =>
      writeLedger({ kind: 'session', at: new Date().toISOString(), planId, sessionId, circleId }),
    finishPlan: (planId: string, circleId?: string) =>
      writeLedger({ kind: 'plan', at: new Date().toISOString(), planId, circleId }),
    createCircle: async (name: string, kind: Circle['kind']) => {
      const defaults = defaultsFor(kind);
      const circle = await createCircle(account, { name, kind, ...defaults });
      await refresh();
      return circle;
    },
    joinCircle: async (code: string) => {
      await requestJoin(account, code);
      const pointer = await resolveInvite(code);
      if (pointer) {
        const node = await getNode(pointer.soul);
        const circle = circleFromNode(node);
        if (circle?.wrappedKey[account.gun.pub]) {
          await saveCircle(account, circle);
        }
      }
      await refresh();
    },
    admit: async (circle: Circle, member: MemberSummary) => {
      const next = admitMember(account, circle, member);
      await saveCircle(account, next);
      await refresh();
    },
    addFriend: async (npub: string) => {
      const next = [...friends.filter((row) => row.npub !== npub), { npub, addedAt: new Date().toISOString() }];
      await saveFriends(account, next);
      setFriends(next);
    },
    shareVerse: async (bookId: number, chapter: number, verse: number, note?: string) => {
      await shareVerse(account, { bookId, chapter, verse, note });
      await refresh();
    },
    sendMessage: async (to: string, text: string) => {
      await sendDirectMessage(account, to, text);
      await refresh();
    },
    memberOf: () => memberOf(account),
  };
}
