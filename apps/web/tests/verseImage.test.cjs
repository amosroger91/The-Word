const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const core = path.join(__dirname, '../../../packages/core/src');
const compile = { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } };
function load(file) {
  const exported = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(core, file), 'utf8'), compile).outputText;
  vm.runInNewContext(code, {
    exports: exported,
    require: (id) => id === './verseImageFonts' ? load('verseImageFonts.ts') : {},
  });
  return exported;
}
const { paintVerseImage, verseImageFormats } = load('verseImage.ts');

function context(size) {
  const texts = [];
  const target = {
    canvas: size,
    font: '16px serif',
    measureText(text) {
      const size = Number(/(\d+(?:\.\d+)?)px/.exec(String(this.font))?.[1] || 16);
      return { width: Array.from(String(text)).length * size * 0.55 };
    },
    fillText(text) { texts.push(String(text)); },
  };
  const ctx = new Proxy(target, {
    get(current, prop) {
      if (prop in current) return current[prop];
      if (prop === 'createLinearGradient') return () => ({ addColorStop() {} });
      return () => {};
    },
    set(current, prop, value) { current[prop] = value; return true; },
  });
  return { ctx, texts };
}

const base = { background: '#111', accent: '#856b40', fontStack: 'Literata, Georgia, serif', fontSize: 64 };

test('punctuation stays with the characters it follows', () => {
  const { ctx, texts } = context();
  paintVerseImage(ctx, {
    ...base,
    reference: '约翰福音 3:16',
    text: '神爱世人，甚至将他的独生子赐给他们，叫一切信他的，不至灭亡，反得永生。',
    translation: '和合本',
    textColor: '#26332d',
    style: 'paper',
    brand: '圣言',
    edition: '圣经',
  }, null);
  const lines = texts.filter((line) => line.length > 1);
  assert.equal(lines.some((line) => /^[，。、；：！？]/.test(line)), false);
  assert.ok(lines.join('').includes('不至灭亡'));
});

test('a passage that cannot stay readable is refused with the caller’s message', () => {
  const { ctx } = context();
  assert.throws(
    () => paintVerseImage(ctx, { ...base, reference: 'Psalm 119', text: 'Blessed '.repeat(800), translation: 'KJV', textColor: '#26332d', style: 'paper', tooLong: 'too long' }, null),
    /too long/,
  );
});

test('4K phone and desktop wallpapers paint the verse at those sizes', () => {
  const phone = verseImageFormats.find((item) => item.id === 'phone');
  const desktop = verseImageFormats.find((item) => item.id === 'desktop');
  assert.deepEqual([phone.width, phone.height], [2160, 3840]);
  assert.deepEqual([desktop.width, desktop.height], [3840, 2160]);
  for (const size of [phone, desktop]) {
    const { ctx, texts } = context(size);
    const layout = paintVerseImage(ctx, { ...base, reference: 'John 3:16', text: 'For God so loved the world.', translation: 'KJV', textColor: '#fff9ed', style: 'photograph', width: size.width, height: size.height }, null);
    assert.ok(layout.fontSize > 64);
    assert.ok(texts.some((line) => line.includes('loved')));
  }
});

test('photograph and paper both paint a short verse', () => {
  for (const style of ['paper', 'photograph']) {
    const { ctx, texts } = context();
    const layout = paintVerseImage(ctx, { ...base, reference: 'John 3:16', text: 'For God so loved the world.', translation: 'KJV', textColor: style === 'paper' ? '#26332d' : '#fff9ed', style }, null);
    assert.ok(layout.fontSize >= 32);
    assert.ok(texts.some((line) => line.includes('loved')));
  }
});
