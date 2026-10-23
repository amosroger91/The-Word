import AsyncStorage from '@react-native-async-storage/async-storage';
import { enableStoragePersist, localMemoryStore, sessionMemoryStore } from './installShims';

const SESSION_PREFIX = 'word.session.';

// Copies every saved key into the memory storage the web modules already
// hold, then mirrors later writes. Must finish before those modules load,
// because loadAccount and the ledger read synchronously on first render.
export async function hydrateStorage(): Promise<void> {
  const local = localMemoryStore();
  const session = sessionMemoryStore();
  try {
    const keys = await AsyncStorage.getAllKeys();
    const rows = keys.length ? await AsyncStorage.multiGet(keys) : [];
    for (const [key, value] of rows) {
      if (value == null) continue;
      if (key.startsWith(SESSION_PREFIX)) session[key.slice(SESSION_PREFIX.length)] = value;
      else local[key] = value;
    }
  } catch {
    // A failed read means defaults. Writes are still attempted.
  }
  enableStoragePersist(
    (key, value) => {
      if (value == null) void AsyncStorage.removeItem(key);
      else void AsyncStorage.setItem(key, value);
    },
    (key, value) => {
      const stored = SESSION_PREFIX + key;
      if (value == null) void AsyncStorage.removeItem(stored);
      else void AsyncStorage.setItem(stored, value);
    },
  );
}
