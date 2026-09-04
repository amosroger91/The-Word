// Build the correct Piper ONNX wrapper worker at /worker/OnnxWebWorker.js.
// dist/worker/OnnxWebWorker.js is mispackaged (it's the ONNX internal proxy),
// so we compile the package's real wrapper (src/Worker/OnnxWebWorker.js) instead.
import { build } from 'vite';
import commonjs from 'vite-plugin-commonjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs';

const webRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = webRoot + '/node_modules/piper-tts-web/src/Worker/OnnxWebWorker.js';
const outDir = webRoot + '/public/worker';

fs.mkdirSync(outDir, { recursive: true });

if (!fs.existsSync(entry)) {
  console.error('Missing source worker:', entry);
  process.exit(1);
}

await build({
  configFile: false,
  root: webRoot,
  plugins: [commonjs()],
  build: {
    outDir,
    emptyOutDir: false,
    lib: {
      entry,
      formats: ['es'],
      name: 'OnnxWebWorker',
    },
    rollupOptions: {
      output: { entryFileNames: 'OnnxWebWorker.js' },
    },
    target: 'esnext',
    minify: false,
  },
});

const out = join(outDir, 'OnnxWebWorker.js');
const size = fs.statSync(out).size;
console.log('Built ONNX worker ->', out, size, 'bytes');
if (size < 100000) console.warn('WARNING: worker looks small; may be missing onnxruntime');