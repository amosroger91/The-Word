import type { Language } from './i18n';

// A synchronous key/value view of persisted preferences. React Native hydrates an in-memory
// cache from AsyncStorage before mount (see createMemoryStore) so both platforms can read
// preferences during the first render.
export interface KeyValueStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface SpeakOptions {
  voice: string;
  rate: number;
  volume: number;
  language: Language;
}

export interface SpeechAdapter {
  // Resolves when the chunk finished playing, or 'stopped' when it was interrupted.
  speak(text: string, options: SpeakOptions): Promise<'ended' | 'stopped'>;
  // Returns false when the platform cannot truly pause; the queue then restarts the current verse on resume.
  pause(): boolean;
  resume(): boolean;
  stop(): void;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  // Optional: warm the engine and fetch the given voice ahead of time so the
  // first speak() has no download/init delay. No audio is played.
  prewarm?(voice: string): void;
  // Optional: call from a user-gesture handler (e.g. Join) so later playback
  // is allowed without a second tap. No-op on platforms with no autoplay gate.
  unlock?(): void;
  dispose(): void;
}

export interface ClipboardAdapter {
  write(text: string): void | Promise<void>;
}

export interface VoiceOption {
  id: string;
  name: string;
  locale: string;
  // The stock voice, shown under a translated name rather than its model id.
  isDefault?: boolean;
}

export interface Platform {
  storage: KeyValueStore;
  speech: SpeechAdapter;
  clipboard: ClipboardAdapter;
  // Native lists the system voices; the web falls back to the bundled Piper catalogue.
  voices?: (language: Language) => VoiceOption[];
}

export function createMemoryStore(initial: Record<string, string> = {}, onWrite?: (key: string, value: string) => void): KeyValueStore {
  const values = new Map(Object.entries(initial));
  return {
    get: (key) => values.get(key) ?? null,
    set: (key, value) => {
      values.set(key, value);
      onWrite?.(key, value);
    },
  };
}
