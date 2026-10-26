import { Platform as RNPlatform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Speech from 'expo-speech';
import { createMemoryStore, storageKeys, type ClipboardAdapter, type KeyValueStore, type Language, type SpeakOptions, type SpeechAdapter, type VoiceOption } from '@the-word/core';

// AsyncStorage is async, so preferences are read once at boot into a memory store the hook can read synchronously.
export async function loadStorage(): Promise<KeyValueStore> {
  const keys = Object.values(storageKeys);
  const initial: Record<string, string> = {};
  try {
    for (const [key, value] of await AsyncStorage.multiGet(keys)) {
      if (value !== null) initial[key] = value;
    }
  } catch {
    // A failed read just means defaults; writes are still attempted.
  }
  return createMemoryStore(initial, (key, value) => { void AsyncStorage.setItem(key, value); });
}

export const nativeClipboard: ClipboardAdapter = {
  write: async (text) => { await Clipboard.setStringAsync(text); },
};

const localePrefix: Record<Language, string> = { en: 'en', es: 'es', fr: 'fr', zh: 'zh', vi: 'vi' };

export async function loadVoices(): Promise<VoiceOption[]> {
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    return voices.map((voice) => ({ id: voice.identifier, name: voice.name || voice.language, locale: voice.language }));
  } catch {
    return [];
  }
}

export function voicesForLanguage(all: VoiceOption[]) {
  return (language: Language) => {
    const prefix = localePrefix[language];
    const matching = all.filter((voice) => voice.locale.toLowerCase().startsWith(prefix));
    // Falling back to the whole list keeps the picker usable on devices with sparse voice data.
    return matching.length ? matching : all;
  };
}

// The system speech engine reads one verse per utterance; the shared queue drives the rest.
// One generation owns the settle slot. stop() resolves that verse immediately, and a
// late onDone from the engine must not resolve the verse that started afterwards.
const NATIVE_SPEECH_TIMEOUT_MS = 90000;

export function createNativeSpeech(): SpeechAdapter {
  let rate = 1;
  let volume = 1;
  let generation = 0;
  let settle: ((outcome: 'ended' | 'stopped') => void) | null = null;
  let fail: ((error: Error) => void) | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function clearTimer() {
    if (timer) { clearTimeout(timer); timer = null; }
  }

  function finish(gen: number, outcome: 'ended' | 'stopped') {
    if (gen !== generation) return;
    clearTimer();
    const resolve = settle;
    settle = null;
    fail = null;
    resolve?.(outcome);
  }

  function armTimer(gen: number) {
    clearTimer();
    timer = setTimeout(() => {
      if (gen !== generation) return;
      clearTimer();
      const reject = fail;
      settle = null;
      fail = null;
      generation += 1;
      void Speech.stop();
      reject?.(Object.assign(new Error('The device took too long to read this verse.'), { code: 'speechVoiceTimeout' }));
    }, NATIVE_SPEECH_TIMEOUT_MS);
  }

  return {
    speak(text: string, options: SpeakOptions) {
      const gen = ++generation;
      clearTimer();
      const previous = settle;
      settle = null;
      fail = null;
      previous?.('stopped');
      return new Promise<'ended' | 'stopped'>((resolve, reject) => {
        settle = resolve;
        fail = reject;
        armTimer(gen);
        Speech.speak(text, {
          voice: options.voice || undefined,
          rate,
          volume,
          onDone: () => finish(gen, 'ended'),
          onStopped: () => finish(gen, 'stopped'),
          onError: (error) => {
            if (gen !== generation) return;
            clearTimer();
            settle = null;
            fail = null;
            reject(error instanceof Error ? error : Object.assign(new Error('The device could not read this verse.'), { code: 'speechDeviceFailed' }));
          },
        });
      });
    },
    pause() {
      // expo-speech can only truly pause on iOS; Android restarts the verse on resume.
      if (!settle || RNPlatform.OS !== 'ios') return false;
      clearTimer();
      void Speech.pause();
      return true;
    },
    resume() {
      if (!settle || RNPlatform.OS !== 'ios') return false;
      armTimer(generation);
      void Speech.resume();
      return true;
    },
    stop() {
      generation += 1;
      clearTimer();
      void Speech.stop();
      const resolve = settle;
      settle = null;
      fail = null;
      resolve?.('stopped');
    },
    setRate(next: number) {
      rate = next;
    },
    setVolume(next: number) {
      volume = next;
    },
    dispose() {
      generation += 1;
      clearTimer();
      settle = null;
      fail = null;
      void Speech.stop();
    },
  };
}
