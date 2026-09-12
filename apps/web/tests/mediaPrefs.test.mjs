import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import ts from 'typescript';

// media.ts reads its stored preferences at MODULE LOAD. Those readers swallow
// errors, so a const declared below them (temporal dead zone) fails silently and
// the saved setting is simply ignored. This test loads the module with values
// already in storage and checks they actually arrive.
const here = path.dirname(fileURLToPath(import.meta.url));
const compiledDir = path.join(here, '.compiled');
fs.mkdirSync(compiledDir, { recursive: true });

const store = new Map([
  ['word.voiceFilter', '0'],
  ['word.systemAudioVolume', '0.25'],
]);
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => { store.set(key, String(value)); },
  removeItem: (key) => { store.delete(key); },
  clear: () => store.clear(),
};

const src = fs.readFileSync(path.join(here, '../src/media.ts'), 'utf8');
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  fileName: 'media.ts',
});
const compiled = path.join(compiledDir, 'media.prefs.mjs');
fs.writeFileSync(compiled, outputText);
const media = await import(pathToFileURL(compiled).href);

test('a stored voice-filter preference survives a reload', () => {
  assert.equal(media.getVoiceFilter(), false, 'voiceFilter=0 in storage must load as off');
});

test('a stored system-audio volume survives a reload', () => {
  assert.equal(media.getSystemAudioVolume(), 0.25);
});

test('system audio volume is clamped and persisted', () => {
  assert.equal(media.setSystemAudioVolume(2), 1);
  assert.equal(media.setSystemAudioVolume(-3), 0);
  assert.equal(media.setSystemAudioVolume(0.5), 0.5);
  assert.equal(store.get('word.systemAudioVolume'), '0.5');
  assert.equal(media.getSystemAudioVolume(), 0.5);
});

test('nothing is capturing before anything starts', () => {
  assert.equal(media.isScreenSharing(), false);
  assert.equal(media.isSharingSystemAudio(), false);
  assert.equal(media.getLocalStream(), null);
});
