# Guided lessons, circles, badges, and accounts — framework plan

Design for the framework only. No plan *content* is specified here: this document
defines the shapes a plan must fit into, not the studies themselves.

Status: Phases 1–7 implemented in the web client. Membership issuance and
Gun-shaped sync still need a running survivor relay (`services/relay`).

## 1. What we are building

1. **Accounts** — a Nostr keypair, created automatically, that is the login and
   travels between devices.
2. **A ledger** — an append-only record of what a person read, answered, and
   finished. Everything else derives from it.
3. **Plans** — guided lessons: sessions mixing passages, prose, and questions.
   Content is JSON data, not code.
4. **Circles** — a small durable group working a plan together: family, couple,
   friends, or one person. Solo is a circle of one, not a special case.
5. **Badges** — earned from the ledger, published to an in-app feed.

## 2. The stack, and why it is split

Two networks, each doing the thing the other is bad at.

| | carries | why |
| --- | --- | --- |
| **Nostr** | account keys, profile, friends, DMs, badge awards | Immutable signed events. A mature identity and social layer that is portable off our platform. |
| **Gun** | internal feed, circle state, plan progress, answers | A mutable graph with automatic merge. This is the part Nostr is worst at — replaceable events are a poor substitute for shared state that several people edit. |

Plus a **survivor relay**: a Gun relay on a VPS that is always online, so a
circle syncs even when no two members are awake at the same time.

The split is principled, not arbitrary: **Nostr is who you are and who you
know; Gun is what the group is doing right now.**

Existing groundwork: `readParty.ts` (PeerJS rooms, hub election), `identity.ts`
(local identity, to be superseded), and the `word.*` localStorage convention in
`packages/core/src/catalogue.ts`.

## 3. Binding the two identities

**Gun's SEA uses P-256 (ECDSA for signing, ECDH for encryption). Nostr uses
secp256k1 with Schnorr signatures.** Different curves, different schemes — a
Nostr key cannot be used as a Gun identity, and no amount of encoding makes it
one. WebCrypto, which SEA is built on, does not implement secp256k1 at all.

So every account has two keypairs, and they must be bound unforgeably.

**Derivation.** The Gun pair is derived deterministically from the Nostr secret:

```
gunSeed = HKDF-SHA256(ikm = nostrSecret, salt = "the-word/gun/v1", info = "sea-p256")
```

The seed becomes the `d` parameter of a P-256 JWK, imported through WebCrypto to
recover the public key. Two rules, both load-bearing:

- **Never reuse the raw Nostr scalar as the P-256 scalar.** Domain-separated
  HKDF only. Using one secret directly on two curves is how key-reuse attacks
  start.
- **Validate the scalar is in range for P-256.** If `seed ≥ n`, re-derive with an
  incremented counter in `info`. Rare, but a silent failure if unhandled.

The payoff: one secret to back up. Restore the Nostr key and the Gun identity
comes back with it.

**Attestation.** Derivation is private, so the link must also be published, in
both directions, each half signed by the key that owns it:

- A Nostr app-data event ([NIP-78](https://nips.nostr.com/78), kind `30078`)
  signed by the Nostr key, declaring the Gun `pub`.
- A record in the Gun user space, signed by the Gun key, declaring the npub.

A client that has both can verify the pairing without trusting anyone. One half
alone proves nothing.

## 4. Membership — keeping outsiders out of the app

A client tag (`["client", "the-word"]`) is worthless: anyone can type any string
into their own event. **Unspoofable membership needs one secret that users do
not hold**, and a static client cannot keep a secret. The VPS can.

**The relay is a notary.** On first run the app asks it to attest the account,
and it returns a membership credential signed by an issuer key that never
leaves the server:

```ts
interface Membership {
  npub: string;        // Nostr identity
  gunPub: string;      // bound Gun identity (§3)
  issuedAt: string;
  sig: string;         // over the above, by the issuer key
}
```

The client ships the issuer **public** key. That asymmetry is the whole design:

> **Issuance needs the VPS. Verification does not.**

So when the VPS is down, everyone already carrying a credential keeps working
peer-to-peer; only *new* accounts cannot be minted. That degrades in the right
direction.

**Rendering rule for anything in the feed** — all three, or it does not appear:

1. the item lives in a Gun **user space**, so its author's signature is verified
   by every peer that touches it;
2. its owner presents a valid, unexpired membership credential;
3. its Gun pub is bound to the claimed npub per §3.

Outsiders may reply to us all day on public Nostr relays. The app never reads
those, which is exactly the arrangement we want.

Membership proves **origin, not good behaviour**. A real member can still post
something that does not belong in a Bible app, so reporting and moderation are
a separate need — out of scope here, but do not mistake this for having solved it.

## 5. Working with Gun, safely

Gun's defaults are wrong for anything that matters. Four rules:

- **Never rely on HAM for truth.** Gun resolves conflicts per-field, last-write-wins,
  on wall-clock timestamps — and client clocks lie. Model everything as
  **immutable nodes in sets**, keyed by content hash or `${gunPub}:${counter}`.
  An append-only ledger is exactly the shape Gun handles well; a mutable
  counter is exactly the shape it handles badly.
- **Public space has no access control.** Any peer can write anything to any
  non-user soul. Indexes are therefore *untrusted pointer lists*: the client
  resolves each pointer into user space and drops whatever fails §4. Trust is
  established at read time, never at write time.
- **There are no queries.** Gun traverses a graph, so every access path must be
  designed as one — `feed/by-day/2026-09-09/<itemId>`, not "select where".
- **Deletion is a tombstone** (`null`), and peers may keep the old value. Nothing
  written is ever truly gone. Say so before anyone types a confession into it.

Encryption uses SEA for Gun-held content, keyed off the derived pair, so one
system owns one store's crypto. Circle content uses the standard envelope: a
random circle key, wrapped to each member via ECDH, stored per-member.

## 6. The ledger

```ts
type LedgerEvent =
  | { id: EventId; kind: 'read';    at: string; bookId: number; chapter: number; verses?: number[] }
  | { id: EventId; kind: 'answer';  at: string; planId: string; sessionId: string; questionId: string;
      value: AnswerValue; circleId?: string; share: 'private' | 'circle' }
  | { id: EventId; kind: 'session'; at: string; planId: string; sessionId: string; circleId?: string }
  | { id: EventId; kind: 'plan';    at: string; planId: string; circleId?: string }

/** `${gunPub}:${counter}` — monotonic per actor, so merging is a set union. */
type EventId = string;
```

- **Only the actor writes their own events.** Cross-actor conflicts cannot arise.
- **Revision is append, not mutation.** A changed answer appends; the reader takes
  the newest `at` for a given `(actor, plan, session, question)`. That is an edit
  history within one stream, not a conflict between two.
- **Deletion is a tombstone** — `value: null` — so it survives the union.
- Timestamps order events *within* one actor only. Never compare two actors'
  clocks to decide truth; they never write the same key.

Reading events fire when a chapter is genuinely read, not merely opened — a
dwell threshold or reaching the last verse, settled in Phase 1 against real
usage. Over-counting devalues every reading badge, so start strict.

**Local storage is the source of truth.** Gun syncs it; the app must work fully
with every relay down and every peer asleep.

## 7. Plans — the questionnaire framework

Content is data: JSON validated against this shape, lazy-loaded like
translations from `apps/web/public/plans/`, and importable from a file so
authoring does not need a deploy.

```ts
interface StudyPlan {
  format: 'the-word.plan';
  id: string;                  // stable slug
  version: number;             // bump on any content edit
  title: Localized; summary: Localized;
  author?: string; license?: string;
  audience: ('solo' | 'couple' | 'family' | 'friends')[];
  tags: string[];
  sessions: PlanSession[];
}

interface PlanSession {
  id: string;                  // stable within the plan
  title: Localized;
  passages: PassageRef[];
  estimatedMinutes?: number;
  blocks: PlanBlock[];
}

type PlanBlock =
  | { kind: 'prose';    id: string; text: Localized }
  | { kind: 'passage';  id: string; ref: PassageRef; note?: Localized }
  | { kind: 'question'; id: string; question: Question; track?: Track };

type Track = 'child' | 'youth' | 'adult';   // family plans ask differently by age

type Question =
  | { type: 'free';      prompt: Localized; placeholder?: Localized; minWords?: number }
  | { type: 'choice';    prompt: Localized; options: { id: string; text: Localized }[]; multiple?: boolean }
  | { type: 'scale';     prompt: Localized; min: number; max: number; minLabel?: Localized; maxLabel?: Localized }
  | { type: 'versePick'; prompt: Localized; within?: PassageRef }
  | { type: 'checklist'; prompt: Localized; items: { id: string; text: Localized }[] };

/** Keyed by UI language; `en` required as the fallback. */
type Localized = { en: string } & Record<string, string>;

/** Mirrors what `parseReference()` in @the-word/bible returns, so a plan's
 *  passages feed straight into `goToVerse()` with no translation step. */
interface PassageRef { bookId: number; chapter: number; verses?: [number, number] }

type AnswerValue =
  | { type: 'free'; text: string }
  | { type: 'choice'; optionIds: string[] }
  | { type: 'scale'; value: number }
  | { type: 'versePick'; bookId: number; chapter: number; verse: number }
  | { type: 'checklist'; itemIds: string[] }
  | null;                                    // tombstone
```

Three rules that matter more than the schema:

- **Ids are author-assigned and permanent — never array indices.** Answers
  reference `questionId` forever; renumbering silently reattaches someone's
  words to a different question.
- **A materially reworded question gets a new id.** Typo fixes do not.
- **`version` is advisory, not a migration.** Stable ids mean answers survive
  plan edits, so a bumped version never invalidates a ledger.

`AnswerValue` is a tagged union so the renderer never guesses how to display an
answer it did not author — which matters in a circle, where you see other
people's.

A validator (`scripts/validate-plans.mjs`, run in the build) checks for
duplicate ids, missing `en`, unresolvable passage refs, and ids that changed
between revisions.

## 8. Circles

Durable, unlike today's throwaway party code — the same family opens the same
circle every evening.

```ts
interface Circle {
  id: string;
  kind: 'solo' | 'couple' | 'family' | 'friends';
  name: string;
  createdBy: string; createdAt: string;
  members: MemberSummary[];    // grow-only
  plan?: { planId: string; startedAt: string };
  pace: 'together' | 'apart';
  reveal: 'immediate' | 'after-you-answer';
}

interface MemberSummary { npub: string; gunPub: string; name: string; color: string; avatar: string | null }
```

`kind` sets defaults that make each mode feel right; all remain overridable.

| kind | size | default pace | default sharing |
| --- | --- | --- | --- |
| solo | 1 | — | private |
| couple | 2 | apart | immediate |
| family | 3–8 | together | immediate |
| friends | 3–8 | apart | after-you-answer |

- **Together (same room)** — a family at the table. One device leads; the others
  follow the session the way `ReadingState` already drives passage-following.
- **Apart (same plan, different times)** — a couple in two cities. Each works the
  session alone; answers surface through Gun when devices next sync. **This is
  what the survivor relay is for**: without it, two people who are never online
  together never converge.

`reveal: 'after-you-answer'` holds other members' answers back until you have
written your own. Enforce it when **rendering**, not only when syncing — the
data is already on the device.

Answers marked `share: 'private'` are encrypted to the author alone and never
wrapped to the circle key, so privacy does not depend on a peer behaving.

## 9. Badges

```ts
interface BadgeDefinition {
  id: string;
  title: Localized; description: Localized;
  icon: string;                        // inline SVG, offline-safe like ReaderIcon
  tier?: 'bronze' | 'silver' | 'gold';
  criteria:
    | { kind: 'chaptersRead'; count: number }
    | { kind: 'streakDays'; days: number }
    | { kind: 'bookComplete'; bookId: number | 'any' }
    | { kind: 'sessionsComplete'; count: number }
    | { kind: 'planComplete'; planId: string | 'any'; count?: number }
    | { kind: 'questionsAnswered'; count: number }
    | { kind: 'circleSessions'; count: number };
}
```

**Badges are derived, never stored as truth.** `evaluate(events, definitions)` is
a pure function; `earnedAt` is the timestamp of the event that crossed the
threshold. Cache in `word.badges`, keyed by a hash of the ledger.

This is about correctness, not cheating. If an imported account carried a badge
list, merging two devices would either invent badges whose evidence is absent or
drop badges whose evidence just arrived. Deriving makes the merge total.

Streak days use the **local calendar day**, matching `dayKey()` in
`reminder-sw.js`. One definition of "day" in the codebase, not two.

Earning a badge writes two things: a Gun feed item (the in-app global feed) and,
optionally, a [NIP-58](https://github.com/nostr-protocol/nips/blob/master/58.md)
award on public Nostr relays — kind `30009` defines the badge, kind `8` awards
it, kind `10008` is the profile's accepted list. The Nostr copy is a one-way
mirror outward: portable proof that lives beyond our platform.

Note honestly that NIP-58 awards are issuer-granted, and our issuer is the VPS.
That makes them as trustworthy as our own relay and no more — which is fine, as
long as nobody claims otherwise.

## 10. Friends and messages

Both are Nostr, so they work off-platform and outlive us.

- **Friends** — [NIP-02](https://nips.nostr.com/2) contact lists, filtered in-app
  to pubkeys carrying a membership credential.
- **Verse sharing** — a custom kind with `bookId`/`chapter`/`verse` tags, so it
  renders as a real passage card rather than a link.
- **DMs** — [NIP-17](https://nips.nostr.com/17): kind `14` messages, sealed in
  kind `13`, gift-wrapped per recipient in kind `1059` using NIP-44 encryption.
  It hides participant identities, timestamps, and event kinds, so not even our
  own relay learns who is talking to whom. Use this, not the deprecated NIP-04.

## 11. What survives what

The resilience story only works if it is designed, so state it as a matrix.

| failure | still works | lost |
| --- | --- | --- |
| offline device | everything local: reading, plans, answers, badges | sync |
| VPS down | existing members sync peer-to-peer; all local features | new account creation; **peer discovery** (see below) |
| all Gun relays down | local app fully; Nostr identity, friends, DMs | circle sync, feed |
| user clears storage | nothing locally | recovered from relays with the Nostr key |

**The honest caveat about "still P2P".** Browsers cannot accept inbound
WebSocket connections, so Gun's normal "peer" is a relay, not another browser.
True browser-to-browser needs WebRTC, and Gun's WebRTC support is
[thinly documented and historically unreliable](https://github.com/amark/gun/issues/766);
it also needs signalling and STUN. **Losing the VPS therefore loses discovery,
not merely storage** — peers cannot find each other.

Three mitigations, to be chosen deliberately rather than discovered in an outage:

1. Configure **several Gun relays**, including a second cheap VPS in another
   region. Simplest, and it makes the survivor relay non-singular.
2. Reuse the **PeerJS broker already in the app** as a backup signalling path for
   a WebRTC Gun transport. No new dependency; the code in `readParty.ts` and
   `studyBoard.ts` already does peer discovery this way.
3. Keep **local-first storage** unconditionally, so a lone device is never
   blocked — this one is not optional.

## 12. Where this touches existing code

New modules under `apps/web/src/`:

| file | holds |
| --- | --- |
| `nostrAccount.ts` | keygen, NIP-49 export, profile, the §3 derivation and attestation |
| `membership.ts` | credential request, offline verification, the §4 render gate |
| `gunGraph.ts` | Gun init, relay list, user space, SEA helpers |
| `ledger.ts` | event types, append, merge, query helpers |
| `plans.ts` | loading, validation, session/answer state |
| `circles.ts` | circle model, membership, sharing policy |
| `badges.ts` | definitions and the pure evaluator |
| `social.ts` | friends, verse shares, NIP-17 DMs |

Changed:

- `identity.ts` — superseded by `nostrAccount.ts`; migrate `word.partyIdentity`
  into the new profile and keep the old key one release for rollback.
- `Preferences.tsx` — an Account section: your key, export, restore, relays.
  It is already the one shared settings surface, so it belongs there.
- `packages/core/src/i18n.ts` — a label block for plans, circles, badges, and
  account handling, in all five languages.
- `catalogue.ts` — new `word.*` keys for account, relays, and badge cache.

Storage: ledger and circles go in **IndexedDB** (Gun's browser adapter uses it,
and the reminder worker already opens one). Preferences stay in localStorage,
which needs synchronous reads at first paint.

Infrastructure, new: a VPS running a Gun relay plus the tiny membership-issuing
endpoint. This is the first server the project has ever had — `TODO.md` records
the deliberate choice to have none — so it is a one-way door worth taking
knowingly.

## 13. Delivery order

1. **Nostr accounts.** Keygen, the §3 Gun derivation, attestation, NIP-49
   encrypted export, QR restore. Replaces `identity.ts`.
2. **Ledger + badges, solo, local only.** No network. Proves the derive-don't-store
   model against real data before sync complicates it.
3. **Survivor relay + membership.** VPS, Gun relay, issuing endpoint, the §4
   render gate. Nothing user-visible yet beyond an account that syncs.
4. **Plans, solo.** Schema, validator, loader, session runner, `free` and
   `versePick` questions. One fixture plan to exercise the framework.
5. **Circles.** `together` first (today's follow-the-host with answers attached),
   then `apart` over Gun, then reveal policies.
6. **Feed and social.** Global badge feed, friends, verse sharing, then DMs.
7. **Resilience.** Second relay, WebRTC transport over the PeerJS broker,
   deliberate testing of the §11 matrix.

## 14. The four decisions, resolved

Each was open when the framework was written. All four are settled below, with
the reasoning kept so a later reader can judge whether it still holds.

### 14a. Key loss

**Decision: make loss rare, make it recoverable while any device still works,
and be honest that a total loss is total.**

Nostr keys cannot be rotated — no reset, no revocation, no recovery — and we mint
them for people who do not know they have one. `exportBackup()` already produces
a NIP-49 `ncryptsec` with a passphrase, downloadable and shown as a QR. That is
the right primitive; what is missing is everything around it.

Three layers, ordered by how many people each one saves:

1. **Make the backup non-optional in practice.** A key never exported is a key
   that will be lost. Do not prompt at first launch, when the user has nothing
   invested and will dismiss it — block at the first moment the account is worth
   something: the first badge earned, or joining a first circle. Re-prompt until
   done, and record `backedUpAt` so the nag stops permanently once it is.
2. **Treat every signed-in device as a replica.** A family with a phone and a
   tablet already holds two copies of the secret, so losing one device is not
   losing the account. This layer saves the most people because it demands no
   foresight from them — which makes pairing worth more attention than backup UI.
3. **A passphrase is a second thing to lose.** Forgetting it destroys the backup
   exactly as thoroughly as losing the key. Also offer a passphrase-free export —
   the raw `nsec` in a file, labelled *anyone who opens this file is you*. For
   something dropped into a password manager, that beats a forgotten passphrase.

**When it is genuinely gone**, do not pretend otherwise. Mint a fresh account and
request a fresh membership — the relay issues one for any valid binding, and
nothing about issuance is tied to the old key — then say plainly what carried
over and what did not: preferences and anything still on this device survive; the
ledger, badges, and circle history under the old key do not. Offer to import a
stale backup later if one turns up, since the merge is a set union and a late
import is harmless.

**Not doing:** social recovery, or splitting the key across circle members. Both
are real designs and both are far too much machinery for this audience. Revisit
only if key loss proves common.

### 14b. A family sharing one tablet

**Decision: one key per device, several *readers* inside it. Separate accounts
are for separate people with separate devices — not for people sharing one.**

`nostrAccount.ts` keeps a single `word.account` behind a module-level cache, so a
shared tablet has one identity and attributes everything to it. The tempting fix,
several keypairs with a switcher, multiplies every hard thing by the number of
family members: N backups, N passphrases, N memberships, N chances to lose a key.
For a nine-year-old who will never own that key, it is all cost and no benefit.

So the device keeps one cryptographic identity and the ledger gains a reader:

```ts
interface Reader { id: string; name: string; color: string; avatar: string | null }
// every LedgerEvent gains:  readerId: string
```

- Badges evaluate per `readerId`, so each person earns their own.
- Circle membership stays per *account*: the tablet appears once in a circle with
  its readers shown inside it. Four families is four devices, not sixteen members.
- A reader who later gets their own device graduates cleanly — mint an account
  there and transplant their slice of the ledger by `readerId`. Events are
  immutable and union-merged, so the slice moves without conflict.

**The part needing care is privacy, not attribution.** A plan asking what you are
struggling with is answered honestly only if a teenager knows a sibling cannot
read it. Two defences, both required: a per-reader PIN gating the switch, and
private answers encrypted to a key derived from that PIN so they stay unreadable
to someone poking at storage. A PIN is weak against a determined attacker holding
the device — say so plainly — but it is correctly weighted for the actual threat,
which is a curious brother.

Default to household attribution, which is what ships today, and let families add
readers when they want them. Do not force a setup flow on people who share a
device and do not care.

### 14c. Who pays for relay disk

**Decision: disk is not the cost. The current write and read patterns are. Bound
those, and the bill is too small to need a policy.**

Reading `services/relay/server.mjs` against this question turns up three things
that matter more than storage pricing:

- **`/v1/put` verifies nothing.** It checks that `soul`, `sig`, and `gunPub` are
  *present* — never that the signature is valid or that the writer holds a
  membership. Clients are safe, since `gunGraph.ts` verifies both on read and
  forged nodes never render, but as a storage endpoint this is an open write to
  anyone who finds the URL. Whoever pays for the disk currently pays for the
  whole internet's.
- **`persistGraph()` rewrites all of `graph.json` on every put** — O(n) work per
  write. At ten thousand nodes every write rewrites megabytes. This collapses
  long before a disk fills.
- **`/v1/since` ignores its `t` parameter and returns every node**, so each client
  pulls the entire graph on every sync and bandwidth grows with history times
  syncs.

Fix in this order, which is also cheapest-first:

1. Verify signature *and* membership at `/v1/put` — the same check `gunGraph.ts`
   already performs, moved to the door.
2. A per-account quota, bytes and nodes per day, so a buggy or hostile client
   cannot run away with the disk.
3. Incremental persistence — an append-only log or per-soul files — instead of a
   whole-file rewrite.
4. A real `since` cursor so sync is incremental.

Only then is retention worth a policy, and the arithmetic is reassuring. Ledger
events are small text: a heavy reader writes a few kilobytes a day, so a thousand
active users is on the order of a couple of gigabytes a year — well inside the
25GB a $5/month VPS ships with. **The founder pays, and it stays under a tenner a
month for years.**

That makes funding premature. Build no billing, donations, or paid tier now;
build the quota and the cursor so cost stays bounded and predictable, and revisit
only if the graph outgrows the arithmetic above. Default retention is *keep
everything*, with a hard per-account ceiling — better than deleting history
nobody expected to lose.

### 14d. Curated in-repo plans, or user-imported

**Decision: both, with a trust boundary between them. Curated leads; imported
stays local until a human accepts it.**

`public/plans/index.json` lists the curated set, fetched at runtime and checked by
`validatePlan()` from `prepare.mjs` at prebuild. Keep that as the default
catalogue: in-repo plans are translated, validated in the build, and carry the
app's voice.

Add import, because authoring should not require a deploy and `validatePlan()`
already does the work. But hold two lines:

- **An imported plan is local to the device that imported it.** It never joins the
  curated list and is visibly marked unverified.
- **A circle cannot silently push a plan onto a member.** When a circle starts an
  imported plan, every other member sees what it is and accepts explicitly before
  a word of it renders. A plan is content that *teaches*; a host must not be able
  to put arbitrary text in front of someone's child because they share a study.

Treat plan text as untrusted input once import exists: render prose as plain
text, or through a strict allowlist if it ever becomes markdown.

**Not doing: a plan store.** Hosting other people's studies means moderating them,
and moderation is a far larger and more permanent commitment than the code that
would enable it. Import covers authors and small circles. Revisit only with a
real answer for who reviews what gets published.
