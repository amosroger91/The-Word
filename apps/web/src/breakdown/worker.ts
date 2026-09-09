/// <reference lib="webworker" />
// Inference runs here so a slow first token never touches the reader's scroll.
// Nothing on the main thread ever waits for this worker.

import { env, pipeline, type Text2TextGenerationPipeline } from '@huggingface/transformers';
import { MODEL_ID } from './model';

// Models come from the Hugging Face CDN, the same way Piper fetches its voices;
// the coi-serviceworker stamps CORP onto those responses so they satisfy the
// page's cross-origin isolation. Local model files are not bundled.
env.allowLocalModels = false;
env.useBrowserCache = true;
// The ONNX runtime's wasm is served from our own origin — it is already in
// public/onnx for Piper, so this avoids a second CDN in the critical path. The
// exact base path arrives with the load message, since GitHub Pages serves the
// app under a subdirectory.
if (env.backends?.onnx?.wasm) env.backends.onnx.wasm.numThreads = 1;

type Incoming =
  | { type: 'load'; base: string }
  | { type: 'generate'; id: number; prompt: string; maxTokens: number };

type Outgoing =
  | { type: 'progress'; status: string; loaded: number; total: number; progress: number }
  | { type: 'ready' }
  | { type: 'failed'; error: string }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id: number; error: string };

const post = (message: Outgoing) => (self as unknown as DedicatedWorkerGlobalScope).postMessage(message);

let generator: Text2TextGenerationPipeline | null = null;
let loading: Promise<void> | null = null;

async function load(base: string) {
  if (generator) { post({ type: 'ready' }); return; }
  if (loading) return loading;
  loading = (async () => {
    try {
      if (env.backends?.onnx?.wasm) {
        // public/ort, not public/onnx: that one is Piper's and has no .mjs
        // loaders, which leaves session creation hanging with no error.
        env.backends.onnx.wasm.wasmPaths = new URL(`${base}ort/`, self.location.origin).href;
      }
      generator = await pipeline('text2text-generation', MODEL_ID, {
        dtype: 'q8',
        progress_callback: (item: { status?: string; loaded?: number; total?: number; progress?: number }) => {
          post({
            type: 'progress',
            status: item.status ?? 'downloading',
            loaded: item.loaded ?? 0,
            total: item.total ?? 0,
            progress: typeof item.progress === 'number' ? item.progress / 100 : 0,
          });
        },
      }) as Text2TextGenerationPipeline;
      post({ type: 'ready' });
    } catch (error) {
      generator = null;
      post({ type: 'failed', error: (error as Error).message });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

async function generate(id: number, prompt: string, maxTokens: number) {
  if (!generator) { post({ type: 'error', id, error: 'not-loaded' }); return; }
  try {
    // Deterministic decoding: greedy, no sampling, fixed length. The same
    // evidence must always produce the same sentence.
    const output = await generator(prompt, {
      max_new_tokens: maxTokens,
      do_sample: false,
      num_beams: 1,
      repetition_penalty: 1.2,
    } as Record<string, unknown>);
    const first = Array.isArray(output) ? output[0] : output;
    post({ type: 'result', id, text: String((first as { generated_text?: string }).generated_text ?? '') });
  } catch (error) {
    post({ type: 'error', id, error: (error as Error).message });
  }
}

(self as unknown as DedicatedWorkerGlobalScope).addEventListener('message', (event: MessageEvent<Incoming>) => {
  const message = event.data;
  if (message.type === 'load') void load(message.base);
  else if (message.type === 'generate') void generate(message.id, message.prompt, message.maxTokens);
});
