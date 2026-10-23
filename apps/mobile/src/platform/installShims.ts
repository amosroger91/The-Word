// Runs before any web module evaluates. Those modules read localStorage
// synchronously. React Native does not provide it, so this installs a memory
// stand-in on globalThis. hydrateStorage fills that same object from
// AsyncStorage before the web modules are imported.

type Memory = Record<string, string>;

const localMemory: Memory = {};
const sessionMemory: Memory = {};

let persistLocal: ((key: string, value: string | null) => void) | null = null;
let persistSession: ((key: string, value: string | null) => void) | null = null;

function storage(memory: Memory, persist: () => ((key: string, value: string | null) => void) | null): Storage {
  return {
    get length() { return Object.keys(memory).length; },
    clear() {
      const keys = Object.keys(memory);
      for (const key of keys) delete memory[key];
      const write = persist();
      if (write) for (const key of keys) write(key, null);
    },
    getItem(key: string) {
      return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    },
    key(index: number) {
      return Object.keys(memory)[index] ?? null;
    },
    removeItem(key: string) {
      delete memory[key];
      persist()?.(key, null);
    },
    setItem(key: string, value: string) {
      memory[key] = String(value);
      persist()?.(key, memory[key]);
    },
  };
}

export function localMemoryStore(): Memory { return localMemory; }
export function sessionMemoryStore(): Memory { return sessionMemory; }

export function enableStoragePersist(
  local: (key: string, value: string | null) => void,
  session: (key: string, value: string | null) => void,
) {
  persistLocal = local;
  persistSession = session;
}

type LooseGlobal = {
  window?: LooseGlobal;
  localStorage?: Storage;
  sessionStorage?: Storage;
  location?: {
    protocol: string;
    href: string;
    origin: string;
    hash: string;
    host: string;
    hostname: string;
    pathname: string;
    search: string;
  };
  history?: { replaceState: () => void; pushState: () => void; state: null };
  File?: typeof File;
};

const root = globalThis as unknown as LooseGlobal;

const local = storage(localMemory, () => persistLocal);
const session = storage(sessionMemory, () => persistSession);
root.localStorage = local;
root.sessionStorage = session;
if (!root.window) root.window = root;
root.window.localStorage = local;
root.window.sessionStorage = session;

// PeerJS treats a missing page URL as a broken browser. Group calls read it
// only when someone actually joins a room.
if (!root.location) {
  const href = 'https://amosroger91.github.io/The-Word/';
  root.location = {
    protocol: 'https:',
    href,
    origin: 'https://amosroger91.github.io',
    hash: '',
    host: 'amosroger91.github.io',
    hostname: 'amosroger91.github.io',
    pathname: '/The-Word/',
    search: '',
  };
}
if (!root.window.location) root.window.location = root.location;
if (!root.history) root.history = { replaceState() {}, pushState() {}, state: null };

// importPlanFile calls File.text(). Hermes has Blob and not File.
if (typeof root.File === 'undefined' && typeof Blob !== 'undefined') {
  class MobileFile extends Blob {
    name: string;
    lastModified: number;
    constructor(parts: BlobPart[], name: string, options?: BlobPropertyBag) {
      super(parts, options);
      this.name = name;
      this.lastModified = Date.now();
    }
  }
  root.File = MobileFile as unknown as typeof File;
}
