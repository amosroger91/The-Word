const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const options={voice:'voice',rate:1,volume:1,language:'en'};
function setup(){
  const timers=new Map(),intervals=new Map(),urls=new Set();let id=0,now=0,audio;
  class Audio {
    constructor(){audio=this;this.readyState=3;this.paused=true;this.currentTime=0;this.ended=false;this.failures=[];this.plays=0;}
    setAttribute(){} removeAttribute(){} load(){}
    play(){this.plays++;const err=this.failures.shift();if(err)return Promise.reject(err);this.paused=false;return Promise.resolve();}
    pause(){if(!this.paused){this.paused=true;this.onpause?.();}}
    end(){this.ended=true;this.paused=true;this.onended?.();}
    set src(value){this.url=value;this.currentTime=0;this.ended=false;}
  }
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/platform.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports,require:()=>({createPiperSynthesizer:()=>({synthesize:async()=>({size:32}),cancel(){},dispose(){}})}),
    Audio,HTMLMediaElement:{HAVE_FUTURE_DATA:3},Error,Date:{now:()=>now},
    URL:{createObjectURL(){const u=`blob:${++id}`;urls.add(u);return u;},revokeObjectURL(u){urls.delete(u);}},
    window:{setTimeout(fn){timers.set(++id,fn);return id;},clearTimeout(id){timers.delete(id);},setInterval(fn){intervals.set(++id,fn);return id;},clearInterval(id){intervals.delete(id);}},
  });
  return {adapter:exports.createWebSpeech(),get audio(){return audio;},timers,intervals,urls,
    advance(ms){now+=ms;[...intervals.values()].forEach(fn=>fn());},retry(){const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());}};
}
test('a long reading releases every playback timer and blob after each verse',async()=>{
  const h=setup();
  for(let i=0;i<200;i++){
    const done=h.adapter.speak(`Verse ${i}`,options);await tick();
    h.audio.currentTime=15;h.advance(20000); // a long verse making progress is healthy
    h.audio.end();assert.equal(await done,'ended');
    assert.equal(h.timers.size,0);assert.equal(h.intervals.size,0);assert.equal(h.urls.size,0);
  }
  h.adapter.dispose();
});
test('stop while already paused settles the verse without waiting for another pause event',async()=>{
  const h=setup();const done=h.adapter.speak('Verse',options);await tick();
  assert.equal(h.adapter.pause(),true);h.advance(600000);assert.equal(h.audio.plays,1);
  h.adapter.stop();assert.equal(await done,'stopped');assert.equal(h.intervals.size,0);assert.equal(h.urls.size,0);
});
test('a missing end event is recovered by checking the media element',async()=>{
  const h=setup();const done=h.adapter.speak('Verse',options);await tick();
  h.audio.ended=true;h.advance(1000);assert.equal(await done,'ended');h.adapter.dispose();
});
test('a stalled audio element retries twice then surfaces a resumable error',async()=>{
  const h=setup();const done=h.adapter.speak('Verse',options);const rejected=assert.rejects(done,/Resume/);await tick();
  h.advance(15000);h.advance(15000);h.advance(15000);await rejected;
  assert.equal(h.audio.plays,3);assert.equal(h.adapter.resume(),false);assert.equal(h.intervals.size,0);
});
test('a rejected resume is reported instead of only logging to the console',async()=>{
  const h=setup();const done=h.adapter.speak('Verse',options);const rejected=assert.rejects(done,/blocked/);await tick();
  h.adapter.pause();const error=new Error('blocked');error.name='NotAllowedError';h.audio.failures.push(error);
  assert.equal(h.adapter.resume(),true);await rejected;assert.equal(h.intervals.size,0);
});
test('a silent unlock survives the handoff stop and a real stop pauses it',async()=>{
  const h=setup();
  h.adapter.unlock();
  assert.equal(h.audio.plays,1);
  assert.equal(h.audio.paused,false);
  h.adapter.stop({preserveUnlock:true});
  assert.equal(h.audio.paused,false);
  assert.equal(h.audio.plays,1);
  h.adapter.stop();
  assert.equal(h.audio.paused,true);
});
test('exhausted interrupted-play retries reject and clean up rather than silently stopping',async()=>{
  const h=setup();const error=new Error('interrupted');error.name='AbortError';h.audio.failures.push(error,error,error);
  const done=h.adapter.speak('Verse',options);const rejected=assert.rejects(done,/Resume/);await tick();
  h.retry();await tick();h.retry();await rejected;assert.equal(h.intervals.size,0);assert.equal(h.urls.size,0);
});
