const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(){
  const workers=[],timers=new Map();let id=0;
  class Worker {
    constructor(){workers.push(this);this.messages=[];this.terminated=false;}
    postMessage(message){this.messages.push(message);}
    terminate(){this.terminated=true;}
    reply(data={file:{size:32}}){this.onmessage?.({data});}
  }
  let source=fs.readFileSync(require('node:path').join(__dirname,'../src/piperSpeech.ts'),'utf8');
  source=source.replaceAll('import.meta.url',"'https://example.test/The-Word/assets/main.js'").replaceAll('import.meta.env.BASE_URL',"'/The-Word/'");
  const exports={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports,Worker,URL,Error,window:{location:{href:'https://example.test/The-Word/#read'},setTimeout(fn,ms){timers.set(++id,{fn,ms});return id;},clearTimeout(id){timers.delete(id);}},
  });
  return {synth:exports.createPiperSynthesizer(),workers,timers};
}
test('warmup and narration are serialized; superseded verses never enter Piper',async()=>{
  const h=setup();let current=1;
  const warm=h.synth.synthesize('Amen.','voice');await tick();
  const stale=h.synth.synthesize('old','voice',()=>current===1);current=2;
  const next=h.synth.synthesize('new','voice',()=>current===2);
  assert.equal(h.workers[0].messages.length,1);assert.equal([...h.timers.values()][0].ms,180000);
  h.workers[0].reply();await warm;await tick();
  assert.equal(await stale,null);assert.equal(h.workers[0].messages[1].text,'new');
  assert.equal(h.workers[0].messages[1].base,'https://example.test/The-Word/');
  assert.equal([...h.timers.values()][0].ms,60000);
  h.workers[0].reply();assert.ok(await next);assert.equal(h.timers.size,0);h.synth.dispose();
});
test('a stuck worker is terminated and the same verse retries once with a fresh engine',async()=>{
  const h=setup();const result=h.synth.synthesize('verse','voice');await tick();
  [...h.timers.values()][0].fn();await tick();
  assert.equal(h.workers[0].terminated,true);assert.equal(h.workers.length,2);
  assert.equal(h.workers[1].messages[0].text,'verse');h.workers[1].reply();assert.ok(await result);
  assert.equal(h.timers.size,0);h.synth.dispose();
});
test('repeated engine failures reject rather than leaving a permanently busy voice',async()=>{
  const h=setup();const result=h.synth.synthesize('verse','voice');const rejected=assert.rejects(result,/broken/);await tick();
  h.workers[0].reply({error:'broken'});await tick();h.workers[1].reply({error:'broken'});await rejected;
  assert.equal(h.timers.size,0);assert.ok(h.workers.every(w=>w.terminated));
  const next=h.synth.synthesize('retry later','voice');await tick();h.workers[2].reply();assert.ok(await next);h.synth.dispose();
});
test('cancel kills the in-flight worker so the next verse is not stuck behind it',async()=>{
  const h=setup();
  const stalled=h.synth.synthesize('old','voice');
  const queued=h.synth.synthesize('queued','voice');
  await tick();
  h.synth.cancel();
  assert.equal(h.workers[0].terminated,true);
  assert.equal(await stalled,null);
  assert.equal(await queued,null);
  assert.equal(h.workers.length,1);
  assert.equal(h.timers.size,0);
  const next=h.synth.synthesize('new','voice');
  await tick();
  assert.equal(h.workers.length,2);
  assert.equal(h.workers[1].messages[0].text,'new');
  assert.equal([...h.timers.values()][0].ms,180000);
  h.workers[1].reply();
  assert.ok(await next);
  h.synth.cancel();
  assert.equal(h.workers[1].terminated,false);
  h.synth.dispose();
});
test('dispose settles pending and queued work without starting another worker',async()=>{
  const h=setup();const first=h.synth.synthesize('a','voice'),next=h.synth.synthesize('b','voice');await tick();h.synth.dispose();
  assert.equal(await first,null);assert.equal(await next,null);assert.equal(h.workers.length,1);assert.equal(h.timers.size,0);
});
