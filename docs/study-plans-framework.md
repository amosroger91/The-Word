# Guided lessons, circles, badges, and portable accounts — framework plan

Design for the framework only. No plan *content* is specified here: this document
defines the shapes a plan must fit into, not the studies themselves.

Status: proposed, nothing implemented.

## 1. What we are building

Four things that lean on each other, in dependency order:

1. **A ledger.** An append-only record of what a person read, answered, and
   finished. Everything else is derived from it.
2. **Plans.** Guided lessons: a sequence of sessions, each mixing passages,
   prose, and questions. Content is data, authored as JSON, not code.
3. **Circles.** A small, durable group working a plan together — a family, a
   couple, friends, or one person alone. Solo is a circle of one, not a special
   case.
4. **Portable accounts.** The ledger and profile as a file you own: download it,
   carry it to another device by QR or by a link you send yourself.

Badges fall out of (1) once (2) exists.

## 2. The constraint everything bends around

The app is static files on GitHub Pages. There is no backend, no database, and
no place to put a row. PeerJS gives us WebRTC data channels through a free
public broker; that is the entire networking budget. This has three
consequences the design has to face rather than paper over:

- **There is no login, and there cannot be one.** Nothing can verify who you
  are, because there is nothing to verify against. What we are building is a
  *save file* and a way to carry it between devices. Possession is identity:
  whoever holds the file or the link is you. The UI must say so in those words.
  Below, "sign in on another device" is called **pairing** or **restoring**,
  never "logging in".
- **Two people can only exchange data while both are online.** A circle whose
  members never overlap cannot sync directly. §7 solves most of this with
  store-and-forward gossip; the residue is solved with an exported file.
- **If every member clears their browser storage, the circle's history is
  gone.** No server holds a copy. The design mitigates this (every member keeps
  a full replica, and the app nudges exports at milestones) but cannot remove
  it. Say it plainly in the UI once, at circle creation.

Existing groundwork this builds on: `readParty.ts` (star-topology rooms, the
`{t, d}` envelope protocol, hub re-election), `studyBoard.ts` (serverless
presence via a well-known peer id), `identity.ts` (accountless local identity),
and the `word.*` localStorage convention in `packages/core/src/catalogue.ts`.

## 3. The ledger

One append-only list of events. Progress, badges, plan state, and a circle's
shared view are all **derived** from it — never stored as independent truth.
This is what makes merging two devices safe: the merge is a set union, and
union of an append-only log cannot conflict.

```ts
type LedgerEvent =
  | { id: EventId; kind: 'read';     at: string; bookId: number; chapter: number; verses?: number[] }
  | { id: EventId; kind: 'answer';   at: string; planId: string; sessionId: string; questionId: string;
      value: AnswerValue; circleId?: string; share: 'private' | 'circle' }
  | { id: EventId; kind: 'session';  at: string; planId: string; sessionId: string; circleId?: string }
  | { id: EventId; kind: 'plan';     at: string; planId: string; circleId?: string }
  | { id: EventId; kind: 'joined';   at: string; circleId: string; member: MemberSummary };

/** `${actorId}:${counter}` — monotonic per actor, so union dedupes by id. */
type EventId = string;
```

Rules that keep the union clean:

- **Only the actor writes their own events.** No device ever authors an event
  on behalf of another member. Cross-actor conflicts therefore cannot arise.
- **Revision is append, not mutation.** Changing an answer appends a new
  `answer` event; the reader takes the newest `at` for a given
  `(actorId, planId, sessionId, questionId)`. Last-write-wins *within one
  actor's own stream* is not a conflict, it is an edit history.
- **Deletion is a tombstone**, so it survives the union. `{ kind: 'answer',
  value: null }` clears an answer without removing the record.
- **Timestamps are for ordering within an actor only.** Never compare two
  actors' clocks to decide truth; there is nothing to decide, since they never
  write the same key.

Reading events: emitted when a chapter is genuinely read, not merely opened —
suggest a dwell threshold or reaching the last verse, decided in Phase 1 with
real usage. Over-counting devalues every reading badge, so start strict.

## 4. The account file

```ts
interface AccountFile {
  format: 'the-word.account';
  version: 1;
  exportedAt: string;
  account: {
    id: string;             // minted once, stable forever
    createdAt: string;
    profile: { name: string; color: string; avatar: string | null };
    preferences: Record<string, string>;   // the word.* keys, verbatim
    bookmarks: string[];
    circles: CircleRef[];
    events: LedgerEvent[];
  };
}
```

- Downloads as `the-word-<name>-<date>.json`. Plain JSON, readable, no
  obfuscation — it is the user's data and they should be able to look at it.
- **Import merges, it does not replace.** Union the events, union the
  bookmarks, take the newer profile and preferences. Importing your own file
  onto a device you already use must never lose that device's newer reading.
- `version` gates a migration function. Write the migration switch in Phase 1
  even with one version in it, or v2 will be painful.
- Avatars are data-URL JPEGs (~4–8KB from `compressAvatar`). Fine in a file,
  decisive for links — see §5.

Existing `word.partyIdentity` is upgraded into `account.id`/`profile` on first
run and left in place for one release so a rollback does not orphan anyone.

## 5. Getting your account onto another device

Three mechanisms, because they fail in different situations.

### 5a. The file — the durable one

Download, then import on the other device. Works offline, works when the two
devices are never on at once, works as a backup. This is the mechanism the
other two fall back to, so it ships first.

### 5b. QR pairing — the convenient one

An account will not fit in a QR code. A scannable code (version ≤ 10, so a
phone camera gets it in one try across a room) holds a few hundred bytes; a
real account with an avatar and a few hundred bookmarks is tens of kilobytes.
So **the QR carries a ticket, not the account**, and the account travels over
the data channel we already have.

```
https://amosroger91.github.io/The-Word/#pair=<peerId>.<key>
```

- `peerId` — `tw-pair-<random>`, claimed by the *sending* device, same trick as
  `studyBoard.ts`.
- `key` — a fresh 256-bit AES-GCM key, base64url (43 chars).
- Total ≈ 110 characters. Comfortably a small, dense-enough-to-scan QR.

Flow: the device that has the account displays the QR → the new device scans,
connects to `peerId` → the sender shows *what is about to be sent and to whom*
and waits for a tap → the account is encrypted with `key` and sent → the sender
destroys the peer. One use, and a 2-minute TTL regardless.

Why encrypt on top of WebRTC's own DTLS: the broker brokers the handshake. The
key exists only in the QR, on the two screens, so a broker that misbehaves
learns nothing. This is cheap (`crypto.subtle`, no dependency) and worth doing.

Scanning: `BarcodeDetector` where present (Chrome, Android); everywhere else,
**type the ticket manually** — it is short on purpose — or fall back to 5a. Do
not ship a QR *decoder* library for the tail; do ship a small QR *encoder* to
render the code, bundled, since CSP and cross-origin isolation rule out a CDN.

### 5c. A link you send yourself — the lazy one

```
https://amosroger91.github.io/The-Word/#restore=<base64url(gzip(account))>
```

The account rides in the **fragment**, which browsers never send to the server
— so the account does not land in GitHub's access logs. That property is the
whole reason this is acceptable, and it is worth a comment in the code so
nobody "helpfully" moves it to a query string.

Constraints to enforce in the UI, not discover in the field:

- Compress with `CompressionStream('gzip')`; fall back to 5a where absent.
- **Refuse over ~8,000 characters.** Mail clients wrap and truncate long URLs,
  and a silently truncated account is worse than no link. Offer two outs when
  it is too big: "link without my photo" (usually enough) or the file.
- Warn once, unmissably: *anyone who has this link is you.* A link in an inbox
  is an account in an inbox.

## 6. Plans — the questionnaire framework

Content is data. A plan is a JSON document validated against this shape,
lazy-loaded like translations, served from `apps/web/public/plans/` with an
index. Users can also import a plan file, which makes authoring possible
without a deploy.

```ts
interface StudyPlan {
  format: 'the-word.plan';
  id: string;                  // stable slug, e.g. 'sermon-on-the-mount'
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
  passages: PassageRef[];      // what this session reads
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
  | { type: 'versePick'; prompt: Localized; within?: PassageRef }   // answer by tapping a verse
  | { type: 'checklist'; prompt: Localized; items: { id: string; text: Localized }[] };

/** Keyed by UI language; `en` required as the fallback. */
type Localized = { en: string } & Record<string, string>;
```

Supporting types, deliberately reusing what the reader already speaks rather
than inventing a parallel vocabulary:

```ts
/** Matches what `parseReference()` in @the-word/bible already returns, so a
 *  plan's passages feed straight into `goToVerse()` with no translation step. */
interface PassageRef { bookId: number; chapter: number; verses?: [number, number] }

type AnswerValue =
  | { type: 'free'; text: string }
  | { type: 'choice'; optionIds: string[] }
  | { type: 'scale'; value: number }
  | { type: 'versePick'; bookId: number; chapter: number; verse: number }
  | { type: 'checklist'; itemIds: string[] }
  | null;                                    // tombstone — a cleared answer

interface MemberSummary { accountId: string; name: string; color: string; avatar: string | null }
interface CircleRef { id: string; name: string; kind: Circle['kind'] }
```

`AnswerValue` is a tagged union rather than a bare string so the renderer never
has to guess how to display an answer it did not author — which matters in a
circle, where you see other people's.

Three rules that matter more than the schema:

- **Ids are author-assigned and permanent — never array indices.** Answers
  reference `questionId` forever. Renumbering silently reattaches someone's
  words to a different question.
- **A materially reworded question gets a new id.** Fixing a typo does not;
  changing what is being asked does. Old answers stay attached to the old id
  and render as history.
- **`version` is advisory, not a migration.** Answers survive plan edits
  because ids are stable, so a bumped version never invalidates a ledger.

`versePick` is the type worth building first after `free` — it is the one that
only this app can offer, since the reader is right there.

A validator script (`scripts/validate-plans.mjs`) checks every plan in the repo
for duplicate ids, missing `en`, unresolvable passage refs, and ids that
changed between git revisions. Run it in the build, matching how the other
scripts work.

## 7. Circles — doing a plan together

A circle is **durable**, unlike today's ephemeral party code: the same family
opens the same circle every evening. It is saved in every member's account and
re-openable by any member.

```ts
interface Circle {
  id: string;                  // stable, minted at creation, not the room code
  kind: 'solo' | 'couple' | 'family' | 'friends';
  name: string;
  createdBy: string; createdAt: string;
  members: MemberSummary[];    // grow-only
  plan?: { planId: string; startedAt: string };
  pace: 'together' | 'apart';
  reveal: 'immediate' | 'after-you-answer';
}
```

`kind` is not decoration — it sets the defaults that make the mode feel right:

| kind | typical size | default pace | default sharing |
| --- | --- | --- | --- |
| solo | 1 | — | private |
| couple | 2 | apart | immediate |
| family | 3–8 | together | immediate |
| friends | 3–8 | apart | after-you-answer |

All four remain user-overridable; the kind only picks the starting point.

### Two ways of being "together"

- **Together (same room).** A family at the table. One device leads, the others
  follow the session the way `ReadingState` already drives passage-following.
  Answers can be captured per person or, for young children, spoken aloud and
  recorded by whoever is leading.
- **Apart (same plan, different times).** A couple in two cities, friends across
  a week. Each person works the session alone; answers surface to the circle
  when devices next connect. This is the mode that needs §7a.

`reveal: 'after-you-answer'` holds other members' answers back until you have
written your own — the familiar study-group courtesy, and the reason sharing
policy has to be enforced when *rendering*, not only when syncing.

### 7a. Sync: gossip over the existing room

Members exchange **ledger slices scoped to the circle**, not whole accounts.
On connect, each side offers the event ids it holds for that circle and pulls
what it lacks. Because the ledger is append-only and ids are unique, this is a
set reconciliation with no merge logic and no conflicts.

The move that makes "apart" work without a server: **any member relays any
other member's events.** If A and B sync on Monday and B and C sync on Friday,
A's answers reach C on Friday without A being present. For circles of two to
eight who see each other online at all, this converges quickly. It is
store-and-forward gossip, and it is the reason a circle does not need a host to
be online.

Residue, stated honestly: two members who are never online at the same time and
share no third member who bridges them will not converge. The escape hatch is a
circle export file, same shape as §4, sent by any means they like.

Naive reconciliation ships first (offer the full id list; it is small). If a
circle's ledger ever grows enough for that to hurt, the fix is a per-actor
high-water mark — `{actorId: lastCounter}` — which the `${actorId}:${counter}`
id format was chosen to allow. Do not build it until the numbers ask for it.

### 7b. Wire protocol

New envelope types on the existing `{t, d}` connection in `readParty.ts` —
circles reuse rooms rather than opening a second transport:

| `t` | direction | payload |
| --- | --- | --- |
| `circle` | hub → member | circle definition + current plan/session |
| `have` | both | event ids held for this circle |
| `want` | both | ids being requested |
| `events` | both | the requested `LedgerEvent[]` |

Sharing is enforced at the sender: an `answer` with `share: 'private'` is never
put on the wire, so privacy does not depend on the receiver behaving.

## 8. Badges

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
    | { kind: 'circleSessions'; count: number };   // sessions done with others
}
```

**Badges are derived, never stored as truth.** `evaluate(events, definitions)`
is a pure function returning what is earned and when — `earnedAt` is the
timestamp of the event that crossed the threshold. A cache in `word.badges`
keyed by a hash of the ledger keeps rendering cheap.

This matters for correctness, not anti-cheat (there is no server to cheat).
If an imported file carried a badge list, merging two devices would produce
badges whose evidence is absent, or lose badges whose evidence just arrived.
Deriving makes the merge total.

Streak days use the **local calendar day**, matching `dayKey()` in
`reminder-sw.js`. One definition of "day" in the codebase, not two.

Circle badges (`circleSessions`) are earned personally for sessions done with
others present — a shared achievement that still lives in each person's own
ledger, so leaving a circle does not revoke it.

## 9. Where this touches existing code

New modules under `apps/web/src/`:

| file | holds |
| --- | --- |
| `ledger.ts` | event types, append, merge, query helpers |
| `account.ts` | export/import, migration, merge |
| `pairing.ts` | QR ticket, AES-GCM, the transfer peer |
| `plans.ts` | plan loading, validation, session/answer state |
| `circles.ts` | circle model, gossip reconciliation |
| `badges.ts` | definitions + the pure evaluator |
| `Plan*.tsx`, `Circle*.tsx`, `Badges.tsx` | UI |

Changed:

- `identity.ts` — becomes the account's profile; migrate `word.partyIdentity`.
- `readParty.ts` — four new envelope types (§7b); nothing removed.
- `Preferences.tsx` — an Account section: export, import, pair, self-link.
  Preferences is already the one shared settings surface, so this is where it
  goes rather than a new panel.
- `packages/core/src/i18n.ts` — a label block for plans, circles, badges, and
  account transfer, in all five languages, added the same way as every other
  string.
- `catalogue.ts` — new `word.*` keys: `word.account`, `word.ledger`,
  `word.circles`, `word.badges`.

Storage: the ledger will outgrow a single localStorage value. Put the ledger
and circles in **IndexedDB** (the reminder worker already opens one) and leave
preferences in localStorage, which needs synchronous reads at first paint.

## 10. Delivery order

Each phase is useful on its own and does not require the next.

1. **Ledger + account file.** Reading events, export, import-with-merge,
   migration switch. Nothing user-visible but the file — ship it anyway, since
   everything else depends on the shape being right.
2. **Badges, solo.** Reading badges only. Proves the derive-don't-store model
   against real data before plans complicate it.
3. **Plans, solo.** Schema, validator, loader, the session runner, `free` and
   `versePick` questions. Plan and session badges. One in-repo fixture plan to
   exercise the framework — a fixture, not a curated study.
4. **Device transfer.** File import UI, then QR pairing, then the self-link
   with its size guard.
5. **Circles.** Durable circles over the existing room; `together` mode first
   (it is the current follow-the-host behaviour with answers attached), then
   `apart` with gossip, then reveal policies.
6. **Authoring.** Plan import from file, validator in the build, and whatever
   the content work turns out to need.

## 11. Decisions still open

These change the design rather than the implementation, so they are worth
settling before Phase 3.

- **Do circles need to work for members who are never online together?** Gossip
  covers overlap and bridging; it cannot cover a couple who are never both on.
  If that case matters, the answer is an optional user-supplied sync target (a
  Gist, a shared folder) — a real feature, and the only one here that would add
  an external dependency.
- **Family plans and one device.** If a family shares a tablet, are answers
  attributed per person (profile switching) or to the household? Profile
  switching is a meaningful addition to the account model; household attribution
  is nearly free. This is the biggest fork in the family experience.
- **Should plan content live in the repo or be user-importable?** In-repo is
  curated and translated; importable makes the app a platform and gives up
  control of what a "plan" says. These are not exclusive, but which one leads
  shapes the authoring tooling.
- **Are badges shareable?** The verse-image export already exists and would
  make a badge card nearly free. Worth knowing before badge art is drawn.
