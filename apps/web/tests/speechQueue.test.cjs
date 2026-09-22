const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
const {hooks}=require('./helpers/hooks.cjs');
const tick=()=>new Promise(resolve=>setImmediate(resolve));
const chunks=[{verse:16,text:'First verse'},{verse:17,text:'Second verse'}];
function setup(){
  const pending=[],exports={};let completions=0;
  const adapter={speak(text){return new Promise((resolve,reject)=>pending.push({text,resolve,reject}));},stop(){},dispose(){},pause(){return false;},resume(){return false;},setRate(){},setVolume(){}};
  const runner=hooks(()=>exports.useSpeech(adapter,{voice:'test',rate:1,volume:1,language:'en'},()=>completions++));
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../../../packages/core/src/useSpeech.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:()=>runner.react,Error});
  return {runner,adapter,pending,get current(){return runner.flush();},get completions(){return completions;}};
}
test('an unexpected stopped result becomes resumable and never skips the verse',async()=>{
  const h=setup();try{
    h.current.speak(chunks);h.pending[0].resolve('stopped');await tick();
    assert.equal(h.current.state,'paused');assert.equal(h.current.speakingVerse,16);
    h.current.resume();assert.equal(h.pending[1].text,'First verse');
    h.pending[1].resolve('ended');await tick();assert.equal(h.pending[2].text,'Second verse');
    h.pending[2].resolve('ended');await tick();assert.equal(h.current.state,'idle');assert.equal(h.completions,1);
  }finally{h.runner.dispose();}
});
test('generation errors and browser interruptions preserve the verse and offer Resume',async()=>{
  for(const name of ['Error','AbortError','NotAllowedError']){
    const h=setup();try{
      h.current.speak(chunks);const error=new Error('interrupted');error.name=name;h.pending[0].reject(error);await tick();
      assert.equal(h.current.state,'paused');assert.equal(h.current.speakingVerse,16);
      assert.equal(h.current.autoplayBlocked,name==='NotAllowedError');assert.equal(h.completions,0);
      h.current.resume();assert.equal(h.pending[1].text,'First verse');assert.equal(h.current.error,'');
    }finally{h.runner.dispose();}
  }
});
test('pausing during synthesis invalidates the old request, including a late successful result',async()=>{
  const h=setup();try{
    h.current.speak(chunks);h.current.pause();h.pending[0].resolve('ended');await tick();
    assert.equal(h.current.state,'paused');assert.equal(h.pending.length,1);assert.equal(h.completions,0);
    h.current.resume();assert.equal(h.pending[1].text,'First verse');
  }finally{h.runner.dispose();}
});
test('stop during synthesis does not resurrect playback or advance the chapter',async()=>{
  const h=setup();try{
    h.current.speak(chunks);h.current.stop();h.pending[0].resolve('ended');await tick();
    assert.equal(h.current.state,'idle');assert.equal(h.current.speakingVerse,null);assert.equal(h.pending.length,1);assert.equal(h.completions,0);
  }finally{h.runner.dispose();}
});
test('iOS restarts the retained verse after a speech failure instead of resuming a missing utterance',async()=>{
  let callbacks;const exports={};
  const speech={speak(text,options){callbacks=options;},pause(){},resume(){},stop(){}};
  const modules={'react-native':{Platform:{OS:'ios'}},'expo-speech':speech,'expo-clipboard':{},'@react-native-async-storage/async-storage':{},'@the-word/core':{}};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../../mobile/src/platform.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,require:id=>modules[id],Error});
  const adapter=exports.createNativeSpeech();
  const failed=adapter.speak('Verse',{voice:'voice',rate:1,volume:1});const rejection=assert.rejects(failed,/failed/);
  callbacks.onError(new Error('failed'));await rejection;assert.equal(adapter.resume(),false);
  const next=adapter.speak('Verse',{voice:'voice',rate:1,volume:1});assert.equal(adapter.pause(),true);assert.equal(adapter.resume(),true);
  callbacks.onDone();assert.equal(await next,'ended');
});
