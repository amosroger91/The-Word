// Serialize warmup and narration, skipping superseded verses before they reach
// Piper. Its own busy queue cannot reject safely, and has no cancellation API.
export function createPiperSynthesizer() {
  let worker: Worker | null = null;
  let tail: Promise<unknown> = Promise.resolve();
  let cancel: (() => void) | null = null;
  let epoch = 0;
  const readyVoices = new Set<string>();

  function reset() {
    worker?.terminate();
    worker = null;
    readyVoices.clear();
  }

  function generate(text: string, voice: string): Promise<Blob> {
    worker ??= new Worker(new URL('./piper.worker.ts', import.meta.url), { type: 'module' });
    const active = worker;
    return new Promise((resolve, reject) => {
      // Initial model download has its own allowance. Queueing behind warmup
      // does not consume the verse's deadline.
      const timer = window.setTimeout(() => finish(new Error('The narration voice took too long to respond. Press Resume to retry this verse.')),
        readyVoices.has(voice) ? 60_000 : 180_000);
      const finish = (error?: Error, file?: Blob) => {
        window.clearTimeout(timer);
        active.onmessage = null;
        active.onerror = null;
        active.onmessageerror = null;
        cancel = null;
        if (error) reject(error);
        else { readyVoices.add(voice); resolve(file!); }
      };
      cancel = () => finish(new Error('Narration disposed.'));
      active.onmessage = ({ data }) => data.file?.size ? finish(undefined, data.file) : finish(new Error(data.error || 'The narration voice returned no audio.'));
      active.onerror = (event) => { event.preventDefault(); finish(new Error(event.message || 'The narration voice stopped responding.')); };
      active.onmessageerror = () => finish(new Error('The narration voice returned unreadable audio.'));
      try {
        active.postMessage({ text, voice, base: new URL(import.meta.env.BASE_URL, window.location.href).href });
      } catch (error) { finish(error instanceof Error ? error : new Error('Could not start narration.')); }
    });
  }

  return {
    synthesize(text: string, voice: string, isCurrent: () => boolean = () => true): Promise<Blob | null> {
      const started = epoch;
      const current = () => started === epoch && isCurrent();
      const job = tail.then(async () => {
        for (let attempt = 0; attempt < 2 && current(); attempt++) {
          try {
            const file = await generate(text, voice);
            return current() ? file : null;
          } catch (error) {
            reset();
            if (!current()) return null;
            if (attempt === 1) throw error;
            // One fresh engine retry of the SAME verse; never silently skip text.
          }
        }
        return null;
      });
      tail = job.catch(() => {});
      return job;
    },
    dispose() { epoch++; cancel?.(); reset(); },
  };
}
