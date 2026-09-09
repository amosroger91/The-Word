// The breakdown formatter runs on @huggingface/transformers, which brings its
// own onnxruntime-web. That runtime needs its .mjs loaders sitting beside the
// .wasm binaries — public/onnx holds Piper's copy, which is .wasm only, so
// pointing transformers there leaves session creation hanging forever with no
// error. Give it its own directory instead of merging the two.
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const webRoot = fileURLToPath(new URL('..', import.meta.url));

// transformers blocks ./package.json in its exports map, so walk to it rather
// than resolving through the package entry point.
const transformers = join(webRoot, 'node_modules', '@huggingface', 'transformers');
// Prefer the runtime nested under transformers — that is the one it loads —
// and fall back to the hoisted copy if npm flattened it.
const nested = join(transformers, 'node_modules', 'onnxruntime-web');
const ort = existsSync(join(nested, 'dist')) ? nested : dirname(require.resolve('onnxruntime-web/package.json'));
const dist = join(ort, 'dist');

const FILES = [
  'ort-wasm-simd-threaded.mjs',
  'ort-wasm-simd-threaded.wasm',
  'ort-wasm-simd-threaded.jsep.mjs',
  'ort-wasm-simd-threaded.jsep.wasm',
];

const out = join(webRoot, 'public', 'ort');
mkdirSync(out, { recursive: true });
for (const file of FILES) copyFileSync(join(dist, file), join(out, file));
console.log(`Copied ${FILES.length} onnxruntime-web files to public/ort from`, ort);
