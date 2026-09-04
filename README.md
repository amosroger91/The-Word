# The Word

A quiet, ad-free Bible reader built around free local Scripture, privacy, and readability.

Web, Android, and iOS share one reader brain in `packages/core`. The web client is Vite + React. The phone clients are one Expo app.

## What works today

- Local KJV, ASV, WEB, Reina-Valera 1909, Valera 1602 Purificada, Louis Segond 1910, CUV, and Vietnamese 1934 (all 66 books)
- Translation data is lazy-loaded: a translation is fetched only when first chosen
- Book and chapter navigation, local search, topics, bookmarks
- Verse selection, copy, and shareable verse images
- Words of Jesus in red
- Light and dark themes, reading fonts including OpenDyslexic
- Read-aloud with speed and volume controls (five UI languages)
- Web read-aloud uses local Piper WASM. Android/iOS use the device speech engine
- Web Read Party: a P2P room so several devices follow one host's passage and read it aloud locally

KJV is sourced from the aruljohn/Bible-kjv repository. ASV is sourced from Scrollmapper’s public Bible database. WEB is sourced from eBible.org’s public-domain WEB Protestant USFM release. Copyrighted translations such as ESV are not bundled.

## Architecture

| Path | Role |
|---|---|
| `apps/web` | Vite + React web client |
| `apps/mobile` | Expo + React Native client (Android and iOS) |
| `packages/core` | Shared reader state, speech queue, i18n, theme, verse-image layout |
| `packages/bible` | Local Scripture assets and repository |
| `packages/shared` | Shared domain types |
| `packages/ui` | Placeholder |
| `services/backend` | Reserved for a future account/sync API |

SQLite lives only in import tooling. The apps do not use it at runtime.

## Requirements

- Node.js 20 or newer and npm
- First-time install from the repo root:

```bash
npm run install:all
```

## Start: web

From the repo root:

```bash
npm run dev:web
```

Open [http://localhost:5173](http://localhost:5173).

On first read-aloud, Piper downloads a local voice model (about 75 MB) and then runs entirely in the browser.

```bash
npm run build:web
npm run typecheck
```

## Start: Android

This repo is developed on Windows. The AVD in use is **`eleazarcam`**: Pixel 6 skin, Android 14 (API 34, x86_64). SDK: `C:\Android\Sdk`. Expo Go is already installed on that emulator.

1. Start the emulator if it is not running:

```bash
"%ANDROID_HOME%\emulator\emulator.exe" -avd eleazarcam
```

If `ANDROID_HOME` is unset, use `C:\Android\Sdk`.

2. From the repo root:

```bash
npm run dev:android
```

Or:

```bash
npm run dev:mobile
```

then press `a` in the Expo CLI.

3. If Expo Go cannot reach Metro, reverse the packager port:

```bash
adb reverse tcp:8081 tcp:8081
adb shell am start -a android.intent.action.VIEW -d "exp://127.0.0.1:8081" host.exp.exponent
```

A physical Android phone can scan the Expo QR code instead of using the emulator.

In-app read-aloud volume is stored and shown on Android. Expo Go’s speech engine does not expose TTS gain, so the device volume buttons still govern how loud Android TTS is until a development build wires `TextToSpeech` `KEY_PARAM_VOLUME`. Web volume is a real in-app gain.

## Start: iOS

There is no separate iOS app. iOS is the same Expo project as Android (`apps/mobile`). This Windows machine cannot run the iOS Simulator.

### Physical iPhone from this Windows repo (Expo Go)

1. Install Expo Go from the App Store.
2. Phone and PC on the same LAN.
3. From the repo root:

```bash
npm run dev:mobile
```

4. Scan the QR code with the iPhone Camera app (or Expo Go). Metro must be reachable at the printed `exp://` URL.

### Mac + Simulator (required for `expo start --ios`)

On a Mac with Xcode 15+, CocoaPods, and an Apple ID:

```bash
cd apps/mobile
npm install
npx expo start --ios
```

Or from the repo root on that Mac: `npm run dev:ios`.

First native compile:

```bash
cd apps/mobile
npx expo run:ios
```

That uses bundle id `com.theword.reader`.

### iOS port plan

The reader logic is already shared. What iOS still needs:

1. **A Mac (or EAS Build)** to compile or archive. Windows can only drive Expo Go on a device.
2. **Xcode signing** — Apple Developer team, bundle id `com.theword.reader`, devices / simulator.
3. **App icon and splash** — `app.json` has no icon or splash assets yet; App Store and TestFlight will reject a build without them.
4. **Safe area** — React Native `SafeAreaView` already applies on iOS. Confirm Dynamic Island / home indicator spacing on a real phone.
5. **Speech** — `expo-speech` pause/resume already works on iOS. Wire `AVSpeechUtterance.volume` in a development build so the in-app volume control actually changes TTS gain (Expo Go ignores it). Confirm enhanced voices for en/es/fr/zh/vi.
6. **Sharing verse images** — `expo-sharing` works on iOS; confirm the share sheet and Files/Photos. Saving directly to Camera Roll would need `expo-media-library` and a photo-library usage string; share-sheet save does not.
7. **Fonts** — Literata, Lexend, Atkinson Hyperlegible, and OpenDyslexic are already loaded through `expo-font`. Confirm they appear in the iOS font picker.
8. **Bundle size** — a release build currently inlines all eight translations (tens of MB). Before the store, download translations on demand into `expo-file-system`.
9. **Store extras** — privacy nutrition label (no ads, no tracking, local Scripture), screenshots, and a 1024×1024 icon.
10. **EAS** — from Windows, `eas build --platform ios` is the path to an IPA without a local Mac, still requiring an Apple team.

Check iOS on a device before calling the port done: open John 3, red letters, search, bookmarks, dark mode, read-aloud pause/resume, volume, verse image share, and a non-English translation.

## Data and licensing

Public-domain translation targets are bundled, but source files should be checked before redistribution. Assets are split so the app loads only the selected translation.

No advertising SDK or analytics SDK is used. Web read-aloud uses `piper-tts-web` and the local Piper WASM runtime.
