// Same model the web worker runs (Xenova/LaMini-Flan-T5-77M, q8). Android has
// no module worker, so the page below runs inside a hidden WebView. Questions
// still pass through checkGenerated before a reader sees them.

export const MODEL_HTML = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body>
<script type="module">
const post = (message) => {
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(JSON.stringify(message));
};
let generator = null;
let loading = null;

async function load() {
  if (generator) { post({ type: 'ready' }); return; }
  if (loading) return loading;
  loading = (async () => {
    try {
      const { pipeline, env } = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.3.3');
      env.allowLocalModels = false;
      env.useBrowserCache = true;
      if (env.backends && env.backends.onnx && env.backends.onnx.wasm) {
        env.backends.onnx.wasm.numThreads = 1;
      }
      generator = await pipeline('text2text-generation', 'Xenova/LaMini-Flan-T5-77M', {
        dtype: 'q8',
        progress_callback: (item) => {
          const raw = typeof item.progress === 'number' ? item.progress : 0;
          post({
            type: 'progress',
            progress: raw > 1 ? raw / 100 : raw,
            loaded: item.loaded || 0,
            total: item.total || 0,
          });
        },
      });
      post({ type: 'ready' });
    } catch (error) {
      generator = null;
      post({ type: 'failed', error: String(error && error.message || error) });
    } finally {
      loading = null;
    }
  })();
  return loading;
}

async function generate(id, prompt, maxTokens) {
  if (!generator) { post({ type: 'error', id, error: 'not-loaded' }); return; }
  try {
    const output = await generator(prompt, {
      max_new_tokens: maxTokens,
      do_sample: false,
      num_beams: 1,
      repetition_penalty: 1.2,
    });
    const first = Array.isArray(output) ? output[0] : output;
    post({ type: 'result', id, text: String(first && first.generated_text || '') });
  } catch (error) {
    post({ type: 'error', id, error: String(error && error.message || error) });
  }
}

window.__wordModel = (raw) => {
  const message = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (message.type === 'load') void load();
  else if (message.type === 'generate') void generate(message.id, message.prompt, message.maxTokens);
};
post({ type: 'boot' });
</script>
</body>
</html>`;
