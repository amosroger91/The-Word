# Narration reliability investigation — 2026-09-22

Report: long group readings stopped while the host's page remained visible. There is no captured error from that session, so these are reproducible failure paths found in code, not a claim that a particular one caused the reported incident.

## Findings

- `useSpeech` returned on an unexpected `stopped` result or `AbortError` without leaving `speaking`. Its queue had exited but the UI still showed playback in progress. The host then continued broadcasting a frozen verse.
- The installed `piper-tts-web` 1.1.2 engine sets itself busy before generation and only clears that flag on success. A rejection leaves it permanently busy. Its internal retry queue has no usable cancellation, while the app's 60-second `Promise.race` did not cancel the underlying generation. Background warmup and newer verses could also queue behind stale work.
- Every generation left its timeout alive until the full minute elapsed. Media errors and paused stops did not consistently settle promises or clean up playback timers. Resume failures were only logged.
- Listeners could observe the host's new chapter number before their new chapter data loaded, and speak the matching verse number from the previous chapter.

## Changes

- Isolate Piper in a terminable worker. Serialize warmup and synthesis outside Piper, skip superseded queued verses, and retry the same verse once using a fresh worker. Clear deadlines on every outcome. Allow up to 180 seconds for initial model loading and 60 seconds for an already prepared voice, starting at actual dispatch rather than queue entry.
- Keep the current verse and expose Resume after an unrecovered interruption. A generation error does not drain the queue or trigger chapter advancement. Stop/pause invalidate late synthesis results.
- Settle paused/stopped audio explicitly. Track media time rather than total verse duration; after 15 seconds without progress, attempt playback recovery twice before reporting failure. Intentional pauses are exempt. Release timers and audio URLs after each verse.
- Gate group narration on the loaded chapter's actual reference. Listener failures expose Enable narration instead of repeatedly auto-resuming.
- Add the existing continuous-from-verse operation to the selected-verse toolbar as Read from here.

## Verification and limits

The automated suite includes worker hangs/rejections, serialized warmup, stale work, resumable errors, playback stalls, missing end events, paused stops, chapter rollover in group following, and 200 simulated verses without leftover timers or blobs. `apps/web/scripts/e2e-speech.mjs` uses real Chromium playback and real Piper synthesis on a static build served at the GitHub Pages subpath.

These checks cannot reconstruct the original meeting or guarantee uninterrupted execution when a browser/OS suspends a page. Existing sessions should reload after deployment to pick up the changes.
