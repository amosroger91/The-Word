import { PiperWebEngine, OnnxWebRuntime, PhonemizeWebRuntime, HuggingFaceVoiceProvider } from 'piper-tts-web';
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
  let engine: InstanceType<typeof PiperWebEngine> | null = null;
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

  // import.meta.env.BASE_URL always ends in '/'. It is '/' for local/root deploys
  // and the repository subpath (e.g. '/The-Word/') on GitHub Pages, so the
  // self-hosted Piper WASM runtime resolves correctly under either.
  const base = import.meta.env.BASE_URL;

  function ensureEngine() {
    engine ??= new PiperWebEngine({
      onnxRuntime: new OnnxWebRuntime({ basePath: `${base}onnx/`, numThreads: 1 }),
      phonemizeRuntime: new PhonemizeWebRuntime({ basePath: `${base}piper/` }),
      // Voice models are NOT bundled (they are tens of MB each); fetch the chosen
      // one on demand from the Piper voices repo on Hugging Face. The default
      // baseUrl is that repo, so leave it unset. The coi-serviceworker stamps
      // Cross-Origin-Resource-Policy onto the response, which (with Hugging Face's
      // CORS) satisfies the page's cross-origin isolation.
      voiceProvider: new HuggingFaceVoiceProvider(),
    });
    return engine;
  }

  function revokeUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  function clearMedia() {
    audio.pause();
    audio.removeAttribute('src');
    revokeUrl();
    hasVerse = false;
  }

  return {
    async speak(text: string, options: SpeakOptions) {
      const started = generation;
      const response = await Promise.race([
        ensureEngine().generate(text, options.voice, 0),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout: generate() did not resolve within 60s.')), 60000)),
      ]);
      if (started !== generation) return 'stopped';
      if (!response?.file?.size) throw new Error('Piper returned an empty audio file.');
      revokeUrl();
      objectUrl = URL.createObjectURL(response.file);
      audio.src = objectUrl;
      audio.playbackRate = rate;
      audio.volume = volume;
      hasVerse = true;
      try {
        return await new Promise<'ended' | 'stopped'>((resolve, reject) => {
          audio.onended = () => resolve('ended');
          audio.onerror = () => reject(new Error('Piper could not play this verse.'));
          // stop() bumps generation then pauses; pause() does not, so the verse stays pending.
          audio.onpause = () => { if (started !== generation) resolve('stopped'); };
          void audio.play().catch(reject);
        });
      } finally {
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;
        revokeUrl();
        if (started === generation) hasVerse = false;
      }
    },
    pause() {
      if (!hasVerse) return false;
      audio.pause();
      return true;
    },
    resume() {
      if (!hasVerse) return false;
      void audio.play();
      return true;
    },
    stop() {
      generation += 1;
      clearMedia();
    },
    // Fetch the voice model + initialise the WASM engine ahead of the first play,
    // so pressing Read aloud is instant. Synthesises one short utterance and
    // throws the audio away — no playback, so it needs no user gesture.
    prewarm(voice: string) {
      if (!voice || warmedVoice === voice) return;
      warmedVoice = voice;
      void ensureEngine().generate('Amen.', voice, 0).catch(() => { warmedVoice = null; });
    },
    // Play silence on the persistent element during a user gesture so later
    // verse playback (after TTS generation) is allowed without another tap.
    unlock() {
      const started = generation;
      const prev = audio.volume;
      audio.volume = 0;
      audio.src = SILENT_WAV;
      void audio.play().then(() => {
        if (started !== generation || hasVerse) return;
        audio.pause();
        audio.currentTime = 0;
        audio.volume = prev;
      }).catch(() => {
        if (started === generation && !hasVerse) audio.volume = prev;
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
      clearMedia();
      engine?.destroy();
      engine = null;
    },
  };
}
