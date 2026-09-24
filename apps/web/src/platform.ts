import { createPiperSynthesizer } from './piperSpeech';
import type { ClipboardAdapter, KeyValueStore, SpeakOptions, SpeechAdapter } from '@the-word/core';

export const webStorage: KeyValueStore = {
  get: (key) => {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {
      // Private-mode browsers reject writes; preferences simply do not persist.
    }
  },
};

export const webClipboard: ClipboardAdapter = {
  write: (text) => navigator.clipboard?.writeText(text),
};

// Tiny silent WAV used to unlock playback during a user gesture (Join / arm).
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';

// Piper runs locally: each verse is synthesised to a wav blob and played through an Audio element.
export function createWebSpeech(): SpeechAdapter {
  const synthesizer = createPiperSynthesizer();
  // One persistent element so a Join-click unlock() covers later verse playback
  // (Safari in particular will not autoplay a brand-new Audio() after the gesture).
  const audio = new Audio();
  audio.setAttribute('playsinline', 'true');
  let rate = 1;
  let volume = 1;
  // Bumped by stop() so a verse interrupted while it was still synthesising never starts playing.
  let generation = 0;
  // Which voice has already been fetched + warmed, so prewarm() runs at most once per voice.
  let warmedVoice: string | null = null;
  let objectUrl: string | null = null;
  // True while a verse is loaded (playing or paused) — pause()/resume() need this
  // because the element itself always exists.
  let hasVerse = false;
  let pausedByUser = false;
  let cancelPlayback: (() => void) | null = null;
  let resumePlayback: (() => void) | null = null;
  // True while the silent gesture clip is looping. A later speak() must not pause it.
  let gestureUnlock = false;

  function speechFailure(code: string, message: string) {
    const error = new Error(message);
    (error as Error & { code: string }).code = code;
    return error;
  }

  function revokeUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function detachHandlers() {
    audio.onended = null;
    audio.onerror = null;
    audio.onpause = null;
    audio.oncanplay = null;
  }

  function isPlayInterrupted(err: unknown) {
    if (!err || typeof err !== 'object') return false;
    const e = err as { name?: string; message?: string };
    return e.name === 'AbortError' || /interrupted by a call to pause/i.test(e.message ?? '');
  }

  function releaseElement() {
    // Leaving src pointed at a revoked blob puts the element in an error state.
    // After enough verses Chrome then stops advancing currentTime, which is the
    // freeze in both solo reading and a group.
    detachHandlers();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    revokeUrl();
  }

  function clearMedia() {
    // pause() emits no event when already paused. Settle explicitly so stop and
    // verse changes also release a paused or still-loading playback promise.
    cancelPlayback?.();
    releaseElement();
    hasVerse = false;
    pausedByUser = false;
  }

  return {
    async speak(text: string, options: SpeakOptions) {
      const started = generation;
      let file: Blob | null;
      try {
        file = await synthesizer.synthesize(text, options.voice, () => started === generation);
      } catch (error) {
        if (started !== generation) return 'stopped';
        gestureUnlock = false;
        audio.loop = false;
        clearMedia();
        throw error;
      }
      if (!file || started !== generation) return 'stopped';
      // Stop cancels an in-flight warm-up. A finished verse means this voice is ready.
      if (warmedVoice === options.voice) {
        window.dispatchEvent(new CustomEvent('word-voice-state', { detail: { voice: options.voice, state: 'ready' } }));
      }
      revokeUrl();
      objectUrl = URL.createObjectURL(file);
      audio.loop = false;
      gestureUnlock = false;
      audio.src = objectUrl;
      audio.playbackRate = rate;
      audio.volume = volume;
      hasVerse = true;
      pausedByUser = false;
      try {
        return await new Promise<'ended' | 'stopped'>((resolve, reject) => {
          let settled = false;
          let readyTimer = 0;
          let retryTimer = 0;
          let watchdog = 0;
          let lastTime = audio.currentTime;
          let lastProgress = Date.now();
          let recoveries = 0;
          let playAttempt = 0;
          // A single sample sitting on a wrong duration must not skip the verse.
          // Real playback has to have moved before the end of the file counts.
          let heardProgress = audio.currentTime > 0.2;
          const stale = () => started !== generation;
          const finish = (result: 'ended' | 'stopped', error?: unknown) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(readyTimer);
            window.clearTimeout(retryTimer);
            window.clearInterval(watchdog);
            detachHandlers();
            cancelPlayback = null;
            resumePlayback = null;
            hasVerse = false;
            if (error) { audio.pause(); reject(error); }
            else resolve(result);
          };

          cancelPlayback = () => finish('stopped');
          audio.onended = () => finish(stale() ? 'stopped' : 'ended');
          audio.onerror = () => {
            if (stale()) finish('stopped');
            else finish('stopped', speechFailure('speechCouldNotPlay', 'This verse could not play. Press Resume to retry it.'));
          };
          // stop() bumps generation then pauses; a user pause does not, so the
          // verse stays pending for resume(). Android Chrome also pauses internally
          // while a blob is loading — that must not reject play().
          audio.onpause = () => { if (stale()) finish('stopped'); };

          const attemptPlay = (tries: number) => {
            if (settled) return;
            if (stale()) { finish('stopped'); return; }
            if (pausedByUser) return;
            const attempt = ++playAttempt;
            window.clearTimeout(retryTimer);
            const p = audio.play();
            if (!p) return;
            void p.catch((err) => {
              if (settled || attempt !== playAttempt) return;
              if (stale()) { finish('stopped'); return; }
              if (pausedByUser) return;
              // Chrome Android: "The play() request was interrupted by a call to pause()"
              // when src is still buffering, unlock() pauses silence, or the next verse
              // replaces src. Retry twice, then expose a resumable failure.
              if (isPlayInterrupted(err)) {
                if (tries > 0) retryTimer = window.setTimeout(() => attemptPlay(tries - 1), 60);
                else finish('stopped', speechFailure('speechPlaybackInterrupted', 'Playback was interrupted. Press Resume to retry this verse.'));
                return;
              }
              finish('stopped', err);
            });
          };

          resumePlayback = () => { lastProgress = Date.now(); attemptPlay(2); };
          // Recover a lost pause/end event without confusing a long verse or an
          // intentional pause with a stall. Only a lack of time progress counts.
          watchdog = window.setInterval(() => {
            if (stale()) { finish('stopped'); return; }
            if (pausedByUser) { lastProgress = Date.now(); return; }
            if (audio.ended) { finish('ended'); return; }
            if (audio.currentTime > lastTime + 0.01) heardProgress = true;
            // Chrome sometimes never fires `ended` after a long run of blob
            // playback. The verse did finish; advance instead of stalling the chapter.
            const duration = audio.duration;
            if (heardProgress && Number.isFinite(duration) && duration > 0.5 && audio.currentTime >= duration - 0.05) {
              finish(stale() ? 'stopped' : 'ended');
              return;
            }
            if (audio.currentTime !== lastTime) {
              lastTime = audio.currentTime; lastProgress = Date.now(); recoveries = 0;
            } else if (Date.now() - lastProgress >= 15_000) {
              lastProgress = Date.now();
              const recovery = recoveries++;
              if (recovery < 2) {
                // The second miss rebuilds the media pipeline. play() alone does
                // not recover an element stuck on a dead blob.
                if (recovery === 1 && objectUrl) {
                  const url = objectUrl;
                  audio.pause();
                  audio.removeAttribute('src');
                  audio.load();
                  audio.src = url;
                  audio.playbackRate = rate;
                  audio.volume = volume;
                  lastTime = 0;
                  heardProgress = false;
                }
                attemptPlay(2);
              } else finish('stopped', speechFailure('speechStalled', 'Playback stopped responding. Press Resume to continue from this verse.'));
            }
          }, 1000);

          if (audio.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA) {
            attemptPlay(2);
            return;
          }
          readyTimer = window.setTimeout(() => attemptPlay(2), 4000);
          audio.oncanplay = () => {
            window.clearTimeout(readyTimer);
            audio.oncanplay = null;
            attemptPlay(2);
          };
          audio.load();
        });
      } finally {
        if (started === generation) {
          releaseElement();
          hasVerse = false;
        }
      }
    },
    pause() {
      if (!hasVerse) return false;
      pausedByUser = true;
      audio.pause();
      return true;
    },
    resume() {
      if (!hasVerse || !resumePlayback) return false;
      pausedByUser = false;
      resumePlayback();
      return true;
    },
    stop(options?: { preserveUnlock?: boolean }) {
      generation += 1;
      synthesizer.cancel();
      // The chapter was not loaded in the click, so a silent play() is holding
      // the gesture open. Pausing it here drops Chrome Android autoplay.
      if (options?.preserveUnlock && gestureUnlock && !hasVerse) {
        cancelPlayback?.();
        detachHandlers();
        return;
      }
      gestureUnlock = false;
      audio.loop = false;
      clearMedia();
    },
    // Fetch the voice model + initialise the WASM engine ahead of the first play,
    // so pressing Read aloud is instant. Synthesises one short utterance and
    // throws the audio away — no playback, so it needs no user gesture.
    prewarm(voice: string) {
      if (!voice || warmedVoice === voice) return;
      warmedVoice = voice;
      window.dispatchEvent(new CustomEvent('word-voice-state', { detail: { voice, state: 'preparing' } }));
      void synthesizer.synthesize('Amen.', voice, () => warmedVoice === voice).then((file) => {
        if (file && warmedVoice === voice) window.dispatchEvent(new CustomEvent('word-voice-state', { detail: { voice, state: 'ready' } }));
      }).catch(() => {
        if (warmedVoice !== voice) return;
        warmedVoice = null;
        window.dispatchEvent(new CustomEvent('word-voice-state', { detail: { voice, state: 'unavailable' } }));
      });
    },
    // Play silence on the persistent element during a user gesture so later
    // verse playback (after TTS generation) is allowed without another tap.
    unlock() {
      if (hasVerse || gestureUnlock) return;
      const started = generation;
      const prev = audio.volume;
      gestureUnlock = true;
      audio.volume = 0;
      // Loop until the verse replaces src. The clip is tiny; if it ends first,
      // the element pauses and the later play() is outside the gesture.
      audio.loop = true;
      audio.src = SILENT_WAV;
      // Do not pause() after this play() — on Chrome Android that rejects an
      // overlapping verse play() with "interrupted by a call to pause()".
      // speak() replaces src when the verse is ready; volume is restored there.
      void audio.play().catch(() => {
        if (started === generation && !hasVerse) {
          gestureUnlock = false;
          audio.loop = false;
          audio.volume = prev;
        }
      });
    },
    setRate(next: number) {
      rate = next;
      audio.playbackRate = next;
    },
    setVolume(next: number) {
      volume = next;
      audio.volume = next;
    },
    dispose() {
      generation += 1;
      gestureUnlock = false;
      audio.loop = false;
      clearMedia();
      warmedVoice = null;
      synthesizer.dispose();
    },
  };
}
