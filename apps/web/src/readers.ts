// Several people, one device, one key.
//
// A family sharing a tablet should each earn their own badges without each
// needing a keypair: N keys means N backups, N passphrases, and N chances to
// lose one for a child who will never own theirs. So the device keeps its single
// cryptographic identity and the ledger carries a readerId instead.
// See docs/study-plans-framework.md §14b.
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';

export const READERS_KEY = 'word.readers';
export const HOUSEHOLD = 'household';

export interface Reader {
  id: string;
  name: string;
  color: string;
  avatar: string | null;
  /** sha256 of `${id}:${pin}`. Absent means this reader is not gated. */
  pinHash?: string;
}

export interface ReaderState {
  readers: Reader[];
  activeId: string;
}

const COLORS = ['#947849', '#5c7cfa', '#2f9e6f', '#c2571e', '#9b5cb4', '#3a86ca', '#c04b5a', '#6a8a2f'];

export function pinHash(id: string, pin: string): string {
  return bytesToHex(sha256(utf8ToBytes(`the-word/reader/v1:${id}:${pin}`)));
}

export function checkPin(reader: Reader, pin: string): boolean {
  if (!reader.pinHash) return true;
  return reader.pinHash === pinHash(reader.id, pin);
}

/** The implicit reader every device starts with, so nobody is forced to set up
 *  profiles before they can read. */
export function household(name = 'This device'): Reader {
  return { id: HOUSEHOLD, name, color: COLORS[0], avatar: null };
}

export function loadReaders(): ReaderState {
  try {
    const raw = localStorage.getItem(READERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ReaderState>;
      const readers = Array.isArray(parsed.readers) ? parsed.readers.filter((r) => r?.id && r.name) : [];
      if (readers.length) {
        const activeId = readers.some((r) => r.id === parsed.activeId) ? parsed.activeId! : readers[0].id;
        return { readers, activeId };
      }
    }
  } catch { /* fall through to the default */ }
  const only = household();
  return { readers: [only], activeId: only.id };
}

export function saveReaders(state: ReaderState) {
  try { localStorage.setItem(READERS_KEY, JSON.stringify(state)); } catch { /* storage blocked */ }
}

export function addReader(state: ReaderState, name: string): ReaderState {
  const clean = name.trim().slice(0, 40);
  if (!clean) return state;
  const reader: Reader = {
    id: 'r-' + Math.random().toString(36).slice(2, 9),
    name: clean,
    color: COLORS[state.readers.length % COLORS.length],
    avatar: null,
  };
  return { readers: [...state.readers, reader], activeId: reader.id };
}

export function removeReader(state: ReaderState, id: string): ReaderState {
  // The last reader never goes: a device always has someone reading.
  if (state.readers.length <= 1) return state;
  const readers = state.readers.filter((reader) => reader.id !== id);
  return { readers, activeId: state.activeId === id ? readers[0].id : state.activeId };
}

export function renameReader(state: ReaderState, id: string, name: string): ReaderState {
  const clean = name.trim().slice(0, 40);
  if (!clean) return state;
  return { ...state, readers: state.readers.map((r) => (r.id === id ? { ...r, name: clean } : r)) };
}

export function setPin(state: ReaderState, id: string, pin: string): ReaderState {
  return {
    ...state,
    readers: state.readers.map((r) => (
      r.id === id ? { ...r, pinHash: pin ? pinHash(id, pin) : undefined } : r
    )),
  };
}

export function activeReader(state: ReaderState): Reader {
  return state.readers.find((reader) => reader.id === state.activeId) ?? state.readers[0] ?? household();
}
