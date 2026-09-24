// Serialize warmup and narration, skipping superseded verses before they reach
// Piper. Its own busy queue cannot reject safely, and has no cancellation API.
// The ONNX heap is not returned after a verse. Reusing one worker for a long
// chapter is what freezes the tab, in a group or reading alone.
export const PIPER_RECYCLE_EVERY = 24;

export function shouldRecycleWorker(successfulGenerations: number) {
  return successfulGenerations > 0 && successfulGenerations % PIPER_RECYCLE_EVERY === 0;
}

export function createPiperSynthesizer() {
  let worker: Worker | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  let abortGenerate: (() => void) | null = null;
  let epoch = 0;
  let generations = 0;
  const readyVoices = new Set<string>();

  function reset() {
    worker?.terminate();
    worker = null;
    readyVoices.clear();
  }

  function speechFailure(code: string, message: string) {
    const error = new Error(message);
    (error as Error & { code: string }).code = code;
    return error;
  }

  function cancelled() {
    const error = new Error('Narration cancelled.');
    error.name = 'NarrationCancelled';
    return error;
  }

  function generate(text: string, voice: string): Promise<Blob> {
    worker ??= new Worker(new URL('./piper.worker.ts', import.meta.url), { type: 'module' });
    const active = worker;
    return new Promise((resolve, reject) => {
      let settled = false;
      // Initial model download has its own allowance. Queueing behind warmup
      // does not consume the verse's deadline.
      const timer = window.setTimeout(() => finish(speechFailure('speechVoiceTimeout', 'The narration voice took too long to respond. Press Resume to retry this verse.')),
        readyVoices.has(voice) ? 60_000 : 180_000);
      const finish = (error?: Error, file?: Blob) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        active.onmessage = null;
        active.onerror = null;
        active.onmessageerror = null;
        abortGenerate = null;
        if (error) reject(error);
        else { readyVoices.add(voice); resolve(file!); }
      };
      abortGenerate = () => finish(cancelled());
      active.onmessage = ({ data }) => {
        if (data.file?.size) finish(undefined, data.file);
        else if (data.error) finish(new Error(data.error));
        else finish(speechFailure('speechVoiceEmpty', 'The narration voice returned no audio.'));
      };
      active.onerror = (event) => { event.preventDefault(); finish(speechFailure('speechVoiceStopped', event.message || 'The narration voice stopped responding.')); };
      active.onmessageerror = () => finish(speechFailure('speechVoiceUnreadable', 'The narration voice returned unreadable audio.'));
      try {
        active.postMessage({ text, voice, base: new URL(import.meta.env.BASE_URL, window.location.href).href });
      } catch (error) {
        finish(speechFailure('speechVoiceStart', error instanceof Error && error.message ? error.message : 'Could not start narration.'));
      }
    });
  }

  // Drop the warm worker only when a generation is in flight (or on dispose).
  // An idle stop must not throw away a voice that is already loaded.
  function abandon(forceReset: boolean) {
    epoch += 1;
    const abort = abortGenerate;
    abort?.();
    if (abort || forceReset) reset();
  }

  return {
    synthesize(text: string, voice: string, isCurrent: () => boolean = () => true): Promise<Blob | null> {
      const started = epoch;
      const current = () => started === epoch && isCurrent();
      const job = tail.then(async () => {
        for (let attempt = 0; attempt < 2 && current(); attempt++) {
          try {
            const file = await generate(text, voice);
            if (!current()) return null;
            generations += 1;
            if (shouldRecycleWorker(generations)) reset();
            return file;
          } catch (error) {
            reset();
            if (!current() || (error instanceof Error && error.name === 'NarrationCancelled')) return null;
            if (attempt === 1) throw error;
            // One fresh engine retry of the SAME verse; never silently skip text.
          }
        }
        return null;
      });
      tail = job.catch(() => {});
      return job;
    },
    // Reject the active verse and kill its worker so the next speak is not
    // stuck behind it until the 60s (or cold-voice 180s) deadline.
    cancel() { abandon(false); },
    dispose() { abandon(true); },
  };
}
