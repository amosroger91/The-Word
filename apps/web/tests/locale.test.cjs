const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function load(relativePath) {
  const source = fs.readFileSync(path.join(__dirname, relativePath), 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const sandbox = { exports: {} };
  vm.runInNewContext(compiled, sandbox);
  return sandbox.exports;
}

const i18n = load('../../../packages/core/src/i18n.ts');
const theme = load('../../../packages/core/src/theme.ts');

test('system language uses the first supported tag', () => {
  assert.equal(i18n.languageFromLocales(['de-DE', 'fr-CA']), 'fr');
  assert.equal(i18n.languageFromLocales(['zh_CN']), 'zh');
  assert.equal(i18n.languageFromLocales(['es-MX', 'en-US']), 'es');
  assert.equal(i18n.languageFromLocales(['vi']), 'vi');
  assert.equal(i18n.languageFromLocales(['de', 'pt']), 'en');
  assert.equal(i18n.languageFromLocales([]), 'en');
});

test('a saved language wins only after the reader chooses one', () => {
  assert.equal(i18n.preferredLanguage('en', false, ['fr-FR']), 'fr');
  assert.equal(i18n.preferredLanguage('en', true, ['fr-FR']), 'en');
  assert.equal(i18n.preferredLanguage('nope', true, ['vi-VN']), 'vi');
});

test('a saved theme wins only after the reader chooses one', () => {
  assert.equal(theme.explicitTheme('dark', false), null);
  assert.equal(theme.explicitTheme('light', true), 'light');
  assert.equal(theme.explicitTheme('sepia', true), null);
});
