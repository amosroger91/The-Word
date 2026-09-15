const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const exportsForTest={};
const src=fs.readFileSync(require('node:path').join(__dirname,'../src/groupLink.ts'),'utf8');
vm.runInNewContext(ts.transpileModule(src,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:exportsForTest,URL});
const {parseGroupHash,groupInviteUrl}=exportsForTest;
test('group invites preserve the Pages subpath and discard private query parameters',()=>{
  const url=groupInviteUrl('AbC12','https://amosroger91.github.io/The-Word/?restore=secret#John.3.16');
  assert.equal(url,'https://amosroger91.github.io/The-Word/#group=abc12');
  assert.equal(parseGroupHash(new URL(url).hash),'abc12');
});
test('malformed links and verse links cannot become room invites',()=>{
  for(const hash of ['#group=', '#group=%ZZ','#group=abc&restore=secret','#John.3.16','#group='+ 'x'.repeat(41)]) assert.equal(parseGroupHash(hash),null);
  assert.throws(()=>groupInviteUrl('abc&secret','https://example.com'));
});
