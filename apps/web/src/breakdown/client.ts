// Main-thread client for the breakdown formatter.
//
// Two rules the UI depends on:
//   1. Nothing here ever blocks reading. The worker is created at idle, and the
//      deterministic breakdown renders whether or not the model ever arrives.
//   2. Nothing the model says reaches a reader unchecked — see prompt.ts.

import type { VerseBreakdown } from '@the-word/bible';
import { IDLE_STATUS, isCached, loadModelState, metered, saveModelState, type ModelStatus } from './model';
import { buildPacket, checkGenerated, questionPrompts } from './prompt';

export interface GeneratedSummary {
  /** Questions only — see prompt.ts for why nothing declarative is generated. */
  questions: string[];
  /** Why a generated line was withheld, shown in source notes rather than hidden. */
  rejected: string[];
}

type Listener = (status: ModelStatus) => void;

let worker: Worker | null = null;
let status: ModelStatus = IDLE_STATUS;
const listeners = new Set<Listener>();
let nextId = 1;
const pending = new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>();

function emit(next: Partial<ModelStatus>) {
  status = { ...status, ...next };
  for (const listener of listeners) listener(status);
}

export function onModelStatus(listener: Listener): () => void {
  listeners.add(listener);
  listener(status);
  return () => { listeners.delete(listener); };
}

export function modelStatus(): ModelStatus { return status; }

function ensureWorker(): Worker {
  if (worker) return worker;
  worker = new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
  worker.addEventListener('message', (event: MessageEvent) => {
    const message = event.data;
    if (message.type === 'progress') {
      emit({
        phase: 'downloading',
        progress: message.progress || (message.total ? message.loaded / message.total : 0),
        loaded: message.loaded,
        total: message.total,
      });
    } else if (message.type === 'ready') {
      saveModelState({ cachedAt: new Date().toISOString() });
      emit({ phase: 'ready', progress: 1 });
    } else if (message.type === 'failed') {
      emit({ phase: 'unavailable', error: message.error });
    } else if (message.type === 'result') {
      pending.get(message.id)?.resolve(message.text);
      pending.delete(message.id);
    } else if (message.type === 'error') {
      pending.get(message.id)?.reject(new Error(message.error));
      pending.delete(message.id);
    }
  });
  return worker;
}

/**
 * Start fetching the model once the page is quiet. Called after first paint; it
 * returns immediately and the reader never waits on it.
 */
export function prepareModel(options: { force?: boolean } = {}) {
  const state = loadModelState();
  if (state.enabled === false && !options.force) { emit({ phase: 'off' }); return; }
  if (status.phase === 'downloading' || status.phase === 'ready') return;

  emit({ phase: 'checking' });
  void isCached().then((cached) => {
    // Only skip a metered connection when nothing is cached; a cached model
    // costs nothing to load and should still work on a train.
    if (!cached && metered() && !options.force) {
      emit({ phase: 'off', error: 'metered' });
      return;
    }
    const start = () => ensureWorker().postMessage({ type: 'load', base: import.meta.env.BASE_URL });
    if (cached || options.force) { emit({ phase: 'downloading' }); start(); return; }
    const idle = (window as unknown as { requestIdleCallback?: (fn: () => void, o?: { timeout: number }) => void }).requestIdleCallback;
    emit({ phase: 'downloading' });
    if (idle) idle(start, { timeout: 8000 });
    else window.setTimeout(start, 2500);
  });
}

export function enableModel(enabled: boolean) {
  saveModelState({ enabled });
  if (!enabled) { emit({ phase: 'off' }); return; }
  prepareModel({ force: true });
}

function ask(prompt: string, maxTokens: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ensureWorker().postMessage({ type: 'generate', id, prompt, maxTokens });
    // A stuck worker must not leave the panel spinning forever.
    window.setTimeout(() => {
      if (!pending.has(id)) return;
      pending.delete(id);
      reject(new Error('timeout'));
    }, 30000);
  });
}

/**
 * Ask the model for study questions about the supplied verse. Every returned
 * line has passed the gate; one that failed is reported in `rejected` rather
 * than quietly dropped, because "the model tried to invent something" is worth
 * a reader knowing.
 */
export async function generateSummary(breakdown: VerseBreakdown): Promise<GeneratedSummary> {
  if (status.phase !== 'ready') return { questions: [], rejected: [] };
  const packet = buildPacket(breakdown);
  const result: GeneratedSummary = { questions: [], rejected: [] };

  for (const prompt of questionPrompts(packet)) {
    try {
      const raw = await ask(prompt, 48);
      const checked = checkGenerated(raw, packet);
      if (!checked.ok) {
        result.rejected.push(`A generated question was withheld: ${checked.reason}.`);
        continue;
      }
      // Two prompts can converge on the same question; show it once.
      if (!result.questions.includes(checked.text)) result.questions.push(checked.text);
    } catch (error) {
      result.rejected.push(`A question could not be produced (${(error as Error).message}).`);
    }
  }

  return result;
}
