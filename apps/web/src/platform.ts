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

  function ensureEngine() {
    engine ??= new PiperWebEngine({
      onnxRuntime: new OnnxWebRuntime({ basePath: '/onnx/', numThreads: 1 }),
      phonemizeRuntime: new PhonemizeWebRuntime({ basePath: '/piper/' }),
      voiceProvider: new HuggingFaceVoiceProvider({ baseUrl: '/models/' }),
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
