// Model manifest and readiness state for the breakdown formatter.
//
// The model is a *formatter*. It receives only evidence the deterministic
// engine already retrieved from bundled Scripture, and everything it returns is
// validated against that evidence before a reader sees it. It is never the
// authority behind an explanation, and the app is fully usable without it.

export const MODEL_ID = 'Xenova/LaMini-Flan-T5-77M';
/** Bump to invalidate a cached download after changing model or prompt shape. */
export const MODEL_VERSION = 1;
export const MODEL_STATE_KEY = 'word.breakdownModel';

export type ModelPhase =
  | 'idle'          // not asked for yet
  | 'checking'      // looking for a cached copy
  | 'downloading'
  | 'ready'
  | 'unavailable'   // no network, blocked, or the browser cannot run it
  | 'off';          // the reader turned it off

export interface ModelStatus {
  phase: ModelPhase;
  /** 0..1 while downloading. */
  progress: number;
  /** Bytes seen so far, for a human-readable line. */
  loaded: number;
  total: number;
  error?: string;
}

export const IDLE_STATUS: ModelStatus = { phase: 'idle', progress: 0, loaded: 0, total: 0 };

export interface StoredModelState {
  version: number;
  /** Set once a full load has succeeded, so later visits skip straight to ready. */
  cachedAt?: string;
  /** The reader's choice. Absent means "not asked yet". */
  enabled?: boolean;
}

export function loadModelState(): StoredModelState {
  try {
    const raw = localStorage.getItem(MODEL_STATE_KEY);
    if (!raw) return { version: MODEL_VERSION };
    const parsed = JSON.parse(raw) as StoredModelState;
    // A version bump invalidates the record; the browser cache is re-validated
    // by the runtime itself on the next load.
    if (parsed.version !== MODEL_VERSION) return { version: MODEL_VERSION, enabled: parsed.enabled };
    return parsed;
  } catch {
    return { version: MODEL_VERSION };
  }
}

export function saveModelState(next: Partial<StoredModelState>) {
  try {
    localStorage.setItem(MODEL_STATE_KEY, JSON.stringify({ ...loadModelState(), ...next, version: MODEL_VERSION }));
  } catch { /* storage blocked: the model just re-checks the cache next time */ }
}

/**
 * Whether this browser is on a connection where a large download would be rude.
 * Honoured rather than assumed: `saveData` is the reader telling us not to.
 */
export function metered(): boolean {
  const connection = (navigator as unknown as {
    connection?: { saveData?: boolean; effectiveType?: string };
  }).connection;
  if (!connection) return false;
  if (connection.saveData) return true;
  return connection.effectiveType === 'slow-2g' || connection.effectiveType === '2g';
}

/** Has the runtime already stored this model? Cheap enough to run at startup. */
export async function isCached(): Promise<boolean> {
  if (typeof caches === 'undefined') return false;
  try {
    for (const name of await caches.keys()) {
      const cache = await caches.open(name);
      const keys = await cache.keys();
      if (keys.some((request) => request.url.includes(MODEL_ID))) return true;
    }
  } catch { /* cache API unavailable */ }
  return false;
}

export function formatBytes(bytes: number): string {
  if (!bytes) return '';
  const mb = bytes / (1024 * 1024);
  return mb >= 1 ? `${mb.toFixed(0)} MB` : `${(bytes / 1024).toFixed(0)} KB`;
}
