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
export function createNativeSpeech(): SpeechAdapter {
  let rate = 1;
  let volume = 1;
  let settle: ((outcome: 'ended' | 'stopped') => void) | null = null;

  function finish(outcome: 'ended' | 'stopped') {
    const resolve = settle;
    settle = null;
    resolve?.(outcome);
  }

  return {
    speak(text: string, options: SpeakOptions) {
      return new Promise<'ended' | 'stopped'>((resolve, reject) => {
        settle = resolve;
        Speech.speak(text, {
          voice: options.voice || undefined,
          rate,
          volume,
          onDone: () => finish('ended'),
          onStopped: () => finish('stopped'),
          onError: (error) => {
            settle = null;
            reject(error instanceof Error ? error : new Error('The device could not read this verse.'));
          },
        });
      });
    },
    pause() {
      // expo-speech can only truly pause on iOS; Android restarts the verse on resume.
      if (RNPlatform.OS !== 'ios') return false;
      void Speech.pause();
      return true;
    },
    resume() {
      if (RNPlatform.OS !== 'ios') return false;
      void Speech.resume();
      return true;
    },
    stop() {
      void Speech.stop();
      finish('stopped');
    },
    setRate(next: number) {
      rate = next;
    },
    setVolume(next: number) {
      volume = next;
    },
    dispose() {
      void Speech.stop();
    },
  };
}
