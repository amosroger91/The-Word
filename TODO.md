# The Word — working notes / TODO

Status as of 2026-09-15. Live site: https://amosroger91.github.io/The-Word/
Deploy: `bash scripts/deploy-pages.sh` (builds `apps/web`, force-pushes `dist/` to `gh-pages`). No CI — see "Why no CI" below.
Working branch is `codex/landing-redesign`, tracking `origin/main` — pushing it pushes straight to `main` on GitHub, this is not a stray branch.

## Recently shipped (this session, committed locally, not yet pushed)

Reliability sweep (commit `2b1f27b`), fixing five ways the app or relay could get stuck or silently lose data rather than degrade:
- Added `apps/web/src/ErrorBoundary.tsx`, wired into `main.tsx`. There was no error boundary at all before this — any render-time throw in any feature (Group Study mesh, breakdown panel, a bad bookmark entry) white-screened the whole reader. Fallback: Reload, plus a confirmed "clear word.* local data" escape hatch for a corrupted-state crash loop.
- `packages/core/src/useWordApp.ts`: chapter/search-loading effects had no `.catch`. A rejected dynamic import (flaky network, or a stale tab after a redeploy changes chunk hashes) left `chapterLoading`/`searchLoading` stuck `true` forever — a permanent spinner on the core reading feature. Chapter load now retries once, then falls back to the existing "chapter not available" state; search clears to no-results; cross-ref loading no longer leaves an unhandled rejection either.
- `apps/web/src/nostrAccount.ts` `loadAccount()`: a present-but-unparseable `word.account` record (torn write, bad version, corrupt key bytes) silently minted and persisted a brand-new random identity over it — irreversible by this app's own no-recovery design, with zero warning shown anywhere. Now logs loudly and preserves the unreadable bytes under a `word.account.corrupted.*` key before minting a replacement.
- `apps/web/src/gunGraph.ts`: `pushRelays`/`pullRelays` had no fetch timeout. A relay that accepts the TCP connection but never answers hung sync indefinitely, and `pullRelays` loops relays sequentially, so one stuck relay blocked every relay listed after it. Added a 10s `AbortController` timeout (`fetchWithTimeout`), falls into the existing try/catch as "relay down."
- `services/relay/server.mjs` `readBody()` buffered an unbounded request body before any size check ran — a large POST could exhaust the process's memory before `acceptable()`'s per-node size check ever got a chance to reject it. Capped at 256KB, connection dropped over that. Hardened `json()` to no-op instead of throwing when writing to an already-destroyed socket (the exact path the new cap exercises via `req.destroy()`). Added process-level `uncaughtException`/`unhandledRejection` logging as a backstop. Added a relay test proving the server survives and keeps serving after an oversized raw upload (`services/relay/test.mjs`, now 12/12 passing).

Verified: `npm --prefix packages/core run typecheck` and `npm --prefix apps/web run typecheck` both clean, `node services/relay/test.mjs` 12/12, production `build:web` succeeds, and a live dev-server smoke test (landing → onboarding skip → reader → chapter nav) showed zero console errors. **Not pushed or deployed yet** — was asked for a stability sweep, not a ship; push + `deploy-pages.sh` still need running.

Added a `.claude/launch.json` entry named `the-word` in the Wellspring-website session's config (this repo has no `.claude/` of its own) so the dev server can be driven via `preview_start` in future sessions from there.

### Deliberately left alone (found, not fixed — lower priority / different shape of fix needed)
From the same sweep, reported by an Explore-agent pass over WebRTC/media/timers/localStorage:
- Relay `nodes` Map (in-memory) and the per-account `quota` Map both grow unbounded with no eviction — fine at "single small relay" scale per its own design comment, would need real accounting if usage grows a lot.
- Relay's `persistNode`/`writeJson` use synchronous `fs` calls that block the event loop under write bursts (soft latency, not a crash) — again a scale question, not an active bug today.
- `useReadParty.ts` calls `room?.leave()` twice on a manual party exit (once explicitly, once from the unmount-cleanup effect closing over the old room). `PartyRoom.leave()` is idempotent, so this is cosmetic only.
- `media.ts`, `readParty.ts`, `studyBoard.ts`, `FaceRail.tsx`/`ScreenStage.tsx`, `breakdown/client.ts`, `ledger.ts` were all checked and found already solid: every `getUserMedia`/`getDisplayMedia` track stopped on every teardown path, every timer/interval tracked and cleared, all storage reads wrapped in try/catch with sane fallbacks, the breakdown pipeline already has a 30s per-request timeout and full `.then/.catch/.finally`.

## Requested, not yet started

- **Study breakdown, phases 2–3: the WASM model.** Phase 1 shipped and is
  deliberately generation-free — see `packages/bible/src/breakdown/`. The model
  work is not started: manifest and versioning, a background shard download with
  resume and checksums into Cache Storage, an ONNX runtime in a worker, readiness
  and progress UI, then constrained JSON formatting of the evidence packet. The
  gate it must pass already exists (`breakdown/sources.ts`): a claim survives only
  if it names a known source and every quote occurs in the cited text, so the
  model can be wired in as a formatter without loosening anything. Phase 5's test
  list (offline before download, interrupted download, invalid model output,
  no network during inference) still stands.
- Lexicon, morphology, and entity dictionaries for the breakdown's original-language
  section. Needs a public-domain or clearly licensed source chosen first; the
  section is absent rather than empty until then.

- Run the survivor relay on a real VPS (`services/relay`) and pin its URL plus
  issuer public key in Settings. Until then, plans, badges, and circles work
  on-device; shared feed and apart-sync wait on that server. The four open
  decisions at the end of [`docs/study-plans-framework.md`](docs/study-plans-framework.md)
  are now resolved in §14 (key loss, readers on a shared tablet, relay cost, plan
  import).
- **Harden `services/relay` before it is deployed.** `/v1/put` checks that `sig`
  and `gunPub` are *present* but never verifies either, so the endpoint is an open
  write to anyone who finds the URL. Clients are unaffected — `gunGraph.ts`
  verifies signature and membership on read — but the relay would be storing
  anyone's bytes. Also: `persistGraph()` rewrites the whole graph per put, and
  `/v1/since` ignores `t` and dumps everything. Fix order and reasoning in §14c.

## Recently shipped (this session, pending deploy)

- Group Study meeting: live mic/camera WebRTC mesh (OpenWhisper pattern, cap 8) + full-screen layout. Face rail around the verse, dock with code/mic/cam/chat/leave. Host tap-verse places the group (`action: 'live'`). Piper ducks while anyone is on a live mic.

## Recently shipped (committed + deployed)

- Read Party i18n (en/es/fr/zh/vi): party chrome uses `packages/core` strings; connection status is a code (`hosting` / `joining` / …) mapped in the UI; join/leave chat lines carry an `event` so each client translates them. English `text` stays on the wire as a fallback.
- Persistent `<audio>` stop/src race: switching verses no longer surfaces "no supported source" when the previous blob URL is cleared.
- Voice preload + Read Party verse-by-verse sync + auto-arm on join:
  - `SpeechAdapter.prewarm?(voice)` / web `prewarm()` fetches the Piper voice and inits WASM on page load (and on voice change) so the first Play isn't a download stall.
  - Host broadcasts `speakingVerse` plus a 3s heartbeat while reading; participants call `speakVerse()` so they track the host verse-by-verse, not just chapter-by-chapter. Mid-verse joiners resync. `.verse.following` (green ring) highlights the host's verse when local audio hasn't started yet.
  - Join click arms audio and `unlock()`s a persistent `<audio>` element, so participants do **not** need a separate "🔊 Tap to read along". Fallback button remains only if the browser still blocks autoplay (`NotAllowedError`).
  - Verified locally with two Chrome tabs (Playwright, `--autoplay-policy=user-gesture-required`): join shows no arm button; participant auto-plays v1 then follows the host to v2. Smoke test: `node apps/web/scripts/e2e-party.mjs` (dev server on :5173).
- `db29c4a` — read-aloud auto-advances chapter→chapter (verified Psalm 117→118 roll-over); logo replaced with Font Awesome book-bible (inline SVG, offline-safe) used as topbar mark + new SVG favicon; volume control uses speaker-down/speaker-up icons with hover tooltips; tooltips added across topbar/speed controls.
- `1e0c234` — Read Party v1: PeerJS star-topology room (`apps/web/src/readParty.ts`, modeled on OpenWhisper's `js/room.js`) + `useReadParty.ts` bridge + panel UI in `App.tsx`. Create/join by code, roster with host tag, party chat, host-authoritative passage + play/pause/stop sync, participants read with their own local Scripture + Piper TTS (no audio streamed), new joiners catch up via hello/welcome. Verified with two real browser tabs end-to-end.
- `c90f7c8` — `scripts/deploy-pages.sh`: one-command build + force-push to `gh-pages`.
- `1b52238` — removed the GitHub Actions CI workflow entirely; deploy is local-build → `gh-pages` branch instead.
- `615d114` — fixed Piper voice fetch: was pointed at an empty local `/models/` dir (never populated in the actual deploy), now uses the default Hugging Face voices repo so read-aloud actually works on the live site.
- `2b0235f` (superseded by the CI removal, kept for history) — CI script-shell / Playwright-download fix, before CI was dropped altogether.
- Base build fixes for GitHub Pages: `BASE_PATH` env → Vite `base`, `import.meta.env.BASE_URL` used for Piper's onnx/piper asset paths, `resolve.dedupe: ['react','react-dom']` (prod build was broken pre-existing, unrelated to Pages), `coi-serviceworker.js` to restore cross-origin isolation (COOP/COEP) that Pages can't send natively (needed for Piper's threaded WASM).

## Why no CI

Tried a GitHub Actions workflow first; it kept hanging on `npm install` because `onnxruntime-node` (181MB of native binaries, pulled in transitively via Piper's `@huggingface/transformers`, unused by the actual web build) re-downloaded every run with no caching, and separately `apps/web/.npmrc` hardcodes `script-shell` to an absolute Windows `powershell.exe` path that doesn't exist on the Linux runner (breaks `sharp`'s native install script). Ripped out CI, replaced with the local `deploy-pages.sh` script. If CI is revisited: cache `node_modules`, install with `--ignore-scripts`, override `npm_config_script_shell=/bin/bash`.

## Known caveats / things to keep in mind

- PeerJS uses its free public broker for the initial WebRTC handshake (same tradeoff OpenWhisper makes) — data flows P2P after that, but the broker is a third-party dependency. Fine for now; self-hosting a PeerServer is a future option if it matters.
- First read-aloud per voice previously had a real download delay (~75MB voice model from Hugging Face, cached after). Prewarm hides this behind page-load instead of the Play click; the model is still a first-visit download.
- Read Party UI chrome is wired into i18n; generated display names (Gentle Lamp, etc.) stay English.
- `apps/mobile/package-lock.json` and `packages/core/package-lock.json` have incidental diffs from local `npm install` runs during this work — intentionally left out of commits so far to keep commits focused; harmless, just noise in `git status`.
