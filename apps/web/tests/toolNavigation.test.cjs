const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { hooks } = require('./helpers/hooks.cjs');

function setup() {
  let module;
  const runner = hooks(() => module.useTools());
  const exports = {};
  const source = fs.readFileSync(path.join(__dirname, '../src/ToolDock.tsx'), 'utf8');
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: {
    module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX,
  } }).outputText, { exports, require: id => id === 'react' ? runner.react : require(id) });
  module = exports;
  return { runner, get: () => runner.flush() };
}

test('switching tools preserves visited views for drafts but shows only the latest task', () => {
  const { get } = setup();
  get().open('group');
  get().open('settings');
  assert.equal(get().focused, 'settings');
  assert.deepEqual(Array.from(get().visited), ['group', 'settings']);
  get().open('group');
  assert.equal(get().focused, 'group');
  assert.equal(get().visited.length, 2);
});

test('closing an old hidden view cannot close the current task or reopen a previous one', () => {
  const { get } = setup();
  get().open('share');
  get().open('image');
  get().close('share');
  assert.equal(get().focused, 'image');
  get().close('image');
  assert.equal(get().focused, null);
  assert.deepEqual(Array.from(get().visited), ['share', 'image']);
});

test('returning to reading preserves cached views without leaving an active panel', () => {
  const { get } = setup();
  get().open('study');
  get().dismiss();
  assert.equal(get().focused, null);
  assert.deepEqual(Array.from(get().visited), ['study']);
  get().open('study');
  assert.equal(get().visited.length, 1);
});
