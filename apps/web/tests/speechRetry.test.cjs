const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const exported = {};
vm.runInNewContext(
  ts.transpileModule(fs.readFileSync(path.join(__dirname, '../../../packages/core/src/speechRetry.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText,
  { exports: exported },
);
const { shouldRetryVerse } = exported;

function coded(code) {
  const error = new Error(code);
  error.code = code;
  return error;
}

test('a stuck verse is retried once, then left for Resume', () => {
  assert.equal(shouldRetryVerse(coded('speechStalled'), 0), true);
  assert.equal(shouldRetryVerse(coded('speechVoiceTimeout'), 0), true);
  assert.equal(shouldRetryVerse(coded('speechStalled'), 1), false);
});

test('a missing tap is not retried', () => {
  const blocked = new Error('not allowed');
  blocked.name = 'NotAllowedError';
  assert.equal(shouldRetryVerse(blocked, 0), false);
  assert.equal(shouldRetryVerse(new Error('plain'), 0), false);
});
