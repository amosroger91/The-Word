const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function load(storage) {
  const code = ts.transpileModule(
    fs.readFileSync(require('node:path').join(__dirname, '../src/useReadParty.ts'), 'utf8'),
    {compilerOptions:{module:ts.ModuleKind.CommonJS, target:ts.ScriptTarget.ES2020}},
  ).outputText;
  const exports = {};
  const modules = {
    react: {useState:()=>[null,()=>{}], useRef:(value)=>({current:value}), useCallback:(fn)=>fn, useEffect:()=>{}},
    './readParty': {joinParty:()=>({})},
    './identity': {loadIdentity:()=>({id:'acct', name:'Sam', color:'#888', avatar:null}), saveIdentity(){}, compressAvatar(){}},
    './followReadingQueue': {FollowReadingQueue: class { reset(){} receive(){} }},
    './media': new Proxy({}, {get:()=>()=>{}}),
  };
  vm.runInNewContext(code, {exports, require:(id)=>modules[id], sessionStorage:storage, setTimeout, clearTimeout, setInterval, clearInterval, Date, Math});
  return exports.memberIdFor;
}

function storage() {
  const map = new Map();
  return {getItem:(key)=>map.has(key) ? map.get(key) : null, setItem:(key, value)=>map.set(key, value)};
}

test('one tab keeps its seat across a refresh, and a second tab gets another seat', () => {
  const tab = storage();
  const firstLoad = load(tab);
  const first = firstLoad('npub1');
  const refreshed = load(tab)('npub1');
  assert.equal(refreshed, first);
  const otherTab = load(storage())('npub1');
  assert.notEqual(otherTab, first);
  assert.ok(otherTab.startsWith('npub1-'));
});

test('a browser that blocks storage does not make two tabs share one seat', () => {
  const blocked = {getItem(){throw new Error('blocked');}, setItem(){throw new Error('blocked');}};
  const page = load(blocked);
  const first = page('npub1');
  assert.equal(page('npub1'), first);
  assert.notEqual(first, 'npub1');
  const otherPage = load(blocked)('npub1');
  assert.notEqual(otherPage, first);
});
