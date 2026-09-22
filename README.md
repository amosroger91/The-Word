# The Word

Live demo: https://amosroger91.github.io/The-Word/#

The Word is a cross-platform, privacy-focused Scripture reader that combines fast local access to translations, high-quality text-to-speech, collaborative "Read Party" sessions, and expressive verse-sharing tools. The repository uses a monorepo layout so the reader logic lives once in `packages/core` and is reused by the web and mobile clients.

Why this project is different

- One reader brain: shared app logic in `packages/core` drives both `apps/web` and `apps/mobile`, reducing duplication and ensuring consistent behavior.
- Read Party: lightweight P2P group reading with follow/host controls, chat, and optional microphone/camera for small groups.
- Local/fast TTS: the web uses an in-browser Piper WASM runtime while mobile uses the device speech engine, with prewarm and per-device voice handling for low latency.
- Verse images: `VerseImageEditor` + seeded backgrounds for on-brand, shareable images.
- Accessibility & readability: dyslexia-friendly fonts, readable defaults, ARIA and accessibility labels throughout.

Features (at a glance)

- Offline-capable local Scripture (multiple public-domain translations)
- Fast local search, topics, bookmarks, and cross-references
- Read-aloud with speed and volume controls, per-device voice selection, and continuous reading from any verse
- Shared group reading with optional live audio/video (peer-to-peer mesh)
- Create and share verse images (custom background, font, translation)
- Local-first preferences and progress tracking (no account required)

To start mid-chapter, select a verse and choose **Read from here** in the selected-verse toolbar. It reads from that verse onward and continues through subsequent chapters. With multiple verses selected, it starts at the first selected verse. **Read selection** remains available for reading only the selected verses. In Group Study, the host's start point is shared; participants can use their own controls after choosing **Browse independently**.

Narration runs in a dedicated local worker. Voice generation is serialized with warmup and retries the same verse once with a fresh worker on failure. Interrupted playback keeps its verse and offers **Resume**; group listeners can use **Enable narration** to retry. The app does not silently skip an unread verse. Initial voice downloads still need a network connection.

Group narration synchronizes at verse boundaries: participants finish every queued verse before advancing, including across chapters and after the host finishes a selection. A slower device may trail the host; updates never seek past words or cut off a verse to catch up. Host Pause/Stop, muting, and leaving follow mode remain immediate. Everyone should reload after an update so the host and participants share the latest playback protocol.

Repository layout

- `apps/web` — Vite + React web client (demo hosted at the link above)
- `apps/mobile` — Expo + React Native client for Android/iOS
- `packages/core` — shared reader logic, `useWordApp`, speech queue, i18n
- `packages/bible` — local Scripture sources, parsing, and search
- `packages/shared` — shared TypeScript types
- `services/relay` — optional relay service used in some P2P flows

Prerequisites

- Node.js 20+ and npm

Quick start

Install dependencies for each workspace package (convenience script):

```bash
npm run install:all
```

Run the web app locally:

```bash
npm run dev:web
# then open http://localhost:5173
```

Run the mobile app (Expo):

```bash
npm run dev:mobile
# or for Android emulator
npm run dev:android
```

Build and typecheck:

```bash
npm run build:web
npm run typecheck
```

Run web tests (from the repo root):

```bash
npm --prefix apps/web run test
```

The narration regression suite covers engine hangs, interrupted playback, pause/stop races, chapter following, and timer/blob cleanup over 200 simulated verses. To check real Piper audio against a running web build, set `APP_URL` to its address and run `node apps/web/scripts/e2e-speech.mjs`. It exercises desktop/mobile verse actions, mid-reading jumps, chapter rollover, consecutive narration, and recovery from an unexpected browser pause.

`node apps/web/scripts/e2e-party-boundaries.mjs` connects two real WebRTC peers and deliberately slows the participant's Piper narration. It checks that each participant clip reaches its actual audio end even after the host has finished the selection. Set `APP_URL` when the static build is served somewhere other than `http://localhost:5187/The-Word/`.

Developer notes

- Shared app logic lives in `packages/core`. When changing behavior, prefer updating hooks there so both clients benefit.
- `useWordApp` exposes delta-style speech controls (`changeSpeechRate(delta)` and `changeSpeechVolume(delta)`) — UI code computes deltas relative to current values.
- Mobile styles must avoid unsupported RN `gap` usage; prefer margin-based spacing for cross-device consistency.
- `apps/mobile/src/platform.ts` contains device-specific adapters (speech, storage, clipboard). `createNativeSpeech()` should be resilient to concurrent calls; the speech queue lives in `packages/core`.

Contributing

- Create an issue for large changes or discuss on a PR.
- Keep changes small and focused; update types in `packages/shared` when public shapes change.
- Run `npm run typecheck` and `npm --prefix apps/web run test` before opening a PR.

Security & privacy

This app is intentionally local-first: no analytics SDKs or advertising SDKs are bundled. Group features use P2P/WebRTC; consider the privacy implications of demoing group audio/video publicly.

Credits & data sources

- Piper TTS: `piper-tts-web` (local WASM) for browser narration
- Public-domain translations are included; each translation's source is cited in `packages/bible`.

License

See `LICENSE` in the repository root if present. If no license file is included this repo should be considered unlicensed until one is added.

Questions or want help running the project locally? Tell me whether you'd like CI added for `typecheck` and web tests and I can scaffold a GitHub Actions workflow.
