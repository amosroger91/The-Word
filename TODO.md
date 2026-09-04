# The Word — working notes / TODO

Status as of 2026-09-04. Live site: https://amosroger91.github.io/The-Word/
Deploy: `bash scripts/deploy-pages.sh` (builds `apps/web`, force-pushes `dist/` to `gh-pages`). No CI — see "Why no CI" below.

## Requested, not yet started

_(none)_

## Recently shipped (committed + deployed)

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
- Read Party is English-only UI strings right now (not wired into the app's i18n system) — fine for v1, worth revisiting if the feature sticks.
- `apps/mobile/package-lock.json` and `packages/core/package-lock.json` have incidental diffs from local `npm install` runs during this work — intentionally left out of commits so far to keep commits focused; harmless, just noise in `git status`.
