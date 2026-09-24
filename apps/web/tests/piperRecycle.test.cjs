const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(require('node:path').join(__dirname, '../src/piperSpeech.ts'), 'utf8').replaceAll('import.meta', 'globalThis.__meta');
const exported = {};
vm.runInNewContext(
  ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
  { exports: exported },
);
const { shouldRecycleWorker, PIPER_RECYCLE_EVERY } = exported;

test('the voice engine is recycled on a fixed verse interval', () => {
  assert.equal(PIPER_RECYCLE_EVERY, 24);
  assert.equal(shouldRecycleWorker(0), false);
  assert.equal(shouldRecycleWorker(23), false);
  assert.equal(shouldRecycleWorker(24), true);
  assert.equal(shouldRecycleWorker(48), true);
});
