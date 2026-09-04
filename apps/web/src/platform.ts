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

// Piper runs locally: each verse is synthesised to a wav blob and played through an Audio element.
export function createWebSpeech(): SpeechAdapter {
  let engine: InstanceType<typeof PiperWebEngine> | null = null;
  let audio: HTMLAudioElement | null = null;
  let rate = 1;
  let volume = 1;
  // Bumped by stop() so a verse interrupted while it was still synthesising never starts playing.
  let generation = 0;

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

  return {
    async speak(text: string, options: SpeakOptions) {
      const started = generation;
      const response = await Promise.race([
        ensureEngine().generate(text, options.voice, 0),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Timeout: generate() did not resolve within 60s.')), 60000)),
      ]);
      if (started !== generation) return 'stopped';
      if (!response?.file?.size) throw new Error('Piper returned an empty audio file.');
      const element = new Audio(URL.createObjectURL(response.file));
      element.playbackRate = rate;
      element.volume = volume;
      audio = element;
      try {
        return await new Promise<'ended' | 'stopped'>((resolve, reject) => {
          element.onended = () => resolve('ended');
          element.onerror = () => reject(new Error('Piper could not play this verse.'));
          // stop() clears the reference, which is how an interrupted verse reports back.
          element.onpause = () => { if (audio !== element) resolve('stopped'); };
          void element.play().catch(reject);
        });
      } finally {
        URL.revokeObjectURL(element.src);
        if (audio === element) audio = null;
      }
    },
    pause() {
      audio?.pause();
      return Boolean(audio);
    },
    resume() {
      if (!audio) return false;
      void audio.play();
      return true;
    },
    stop() {
      generation += 1;
      const element = audio;
      audio = null;
      element?.pause();
    },
    setRate(next: number) {
      rate = next;
      if (audio) audio.playbackRate = next;
    },
    setVolume(next: number) {
      volume = next;
      if (audio) audio.volume = next;
    },
    dispose() {
      engine?.destroy();
      engine = null;
    },
  };
}
