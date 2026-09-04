import { copyFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const webRoot = fileURLToPath(new URL('..', import.meta.url));
const dist = dirname(require.resolve('piper-tts-web/package.json'));

function copyDir(src, out) {
  mkdirSync(out, { recursive: true });
  copyFileSync(join(src, 'ort-wasm-simd-threaded.jsep.wasm'), join(out, 'ort-wasm-simd-threaded.jsep.wasm'));
  copyFileSync(join(src, 'ort-wasm-simd-threaded.wasm'), join(out, 'ort-wasm-simd-threaded.wasm'));
}
function copyPiper(src, out) {
  mkdirSync(out, { recursive: true });
  copyFileSync(join(src, 'piper_phonemize.data'), join(out, 'piper_phonemize.data'));
  copyFileSync(join(src, 'piper_phonemize.wasm'), join(out, 'piper_phonemize.wasm'));
}

const pub = join(webRoot, 'public');
copyDir(join(dist, 'dist', 'onnx'), join(pub, 'onnx'));
copyPiper(join(dist, 'dist', 'piper'), join(pub, 'piper'));
console.log('Copied Piper WASM assets to', pub);

// The correct Piper ONNX wrapper worker is committed at public/worker/OnnxWebWorker.js;
// rebuild it from package source if the package version changed.
// See scripts/build-onnx-worker.mjs.