const test=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(){
  let cursor=0,slots=[],effects=[],dirty=true,result,handlers,host=false;const sent=[],spoken=[],controls=[];
  const changed=(a,b)=>!a||!b||a.length!==b.length||a.some((v,i)=>!Object.is(v,b[i]));
  const React={
    useState(initial){const index=cursor++;slots[index]??={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{const next=typeof value==='function'?value(slots[index].value):value;if(!Object.is(next,slots[index].value)){slots[index].value=next;dirty=true;}}];},
    useRef(initial){const index=cursor++;slots[index]??={value:{current:initial}};return slots[index].value;},
    useCallback(fn,deps){const index=cursor++;if(!slots[index]||changed(slots[index].deps,deps))slots[index]={value:fn,deps};return slots[index].value;},
    useEffect(fn,deps){const index=cursor++;if(!slots[index]||changed(slots[index].deps,deps)){effects.push(()=>{slots[index]?.cleanup?.();slots[index]={deps,cleanup:fn()};});}}
  };
  const app={bookId:43,chapterNumber:3,translationId:'kjv',chapter:{verses:[{ref:{bookId:43,chapter:3,verse:1}}]},chapterLoading:false,speechState:'idle',speakingVerse:null,speechFinished:false,speechSession:0,autoplayBlocked:false,speechError:'',
    goTo(b,c){app.bookId=b;app.chapterNumber=c;dirty=true;},goToVerse(b,c,v){app.goTo(b,c);app.focusedVerse=v;},
    stopSpeech(){controls.push('stop');app.speechState='idle';app.speakingVerse=null;app.speechFinished=false;dirty=true;},pauseSpeech(){controls.push('pause');app.speechState='paused';dirty=true;},resumeSpeech(){controls.push('resume');app.speechState='speaking';app.speechError='';app.autoplayBlocked=false;dirty=true;},speakVerse(v){spoken.push(v);app.speechState='speaking';app.speakingVerse=v;app.speechFinished=false;app.speechSession++;dirty=true;}};
  const room={leave(){},refreshMedia(){},updateIdentity(){},sendChat(){},transferHost(){},setReadingState(s){sent.push(s);handlers.onReading(s);}};
  const identity={id:'tester',name:'Tester',color:'#888',avatar:null};
  const modules={react:React,'./readParty':{joinParty(options){handlers=options.handlers;return room;}},'./identity':{loadIdentity:()=>identity,saveIdentity(){},compressAvatar(){}},'./media':{getLocalStream:()=>null,setMedia:async()=>{},stopLocal(){},unlockRemoteAudio(){},setDevices(){}}};
  const queueExports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/followReadingQueue.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports:queueExports});
  modules['./followReadingQueue']=queueExports;
  const exports={};const code=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/useReadParty.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(code,{exports,require:id=>modules[id],setInterval,clearInterval,Date,Math});
  function flush(){dirty=true;let n=0;while(dirty){if(++n>40)throw Error('Hook render loop');dirty=false;cursor=0;effects=[];result=exports.useReadParty({...app});effects.forEach(f=>f());}return result;}
  flush();
  return {app,sent,spoken,controls,flush,get current(){return result;},join(isHost){result.joinParty('test');flush();host=isHost;handlers.onStatus(isHost?'hosting':'connected');handlers.onRoster([],{host:isHost,capped:false});flush();},role(isHost){handlers.onRoster([],{host:isHost,capped:false});flush();},receive(state){handlers.onReading(state);return flush();},receiveBatch(states){states.forEach(s=>handlers.onReading(s));return flush();},finish(){app.speechState='idle';app.speakingVerse=null;app.speechFinished=true;return flush();},status(s){handlers.onStatus(s);return flush();},dispose(){slots.forEach(s=>s?.cleanup?.());}};
}
const reading={bookId:43,chapter:3,verse:16,highlights:[16,17],action:'playing',ts:1};
test('host private navigation and selections do not change shared passage',()=>{
 const h=harness();try{
  h.join(true);h.current.showGroup([16,17]);h.flush();assert.deepEqual(Array.from(h.sent.at(-1).highlights),[16,17]);
  h.current.browseIndependently();h.app.goTo(1,2);h.flush();assert.equal(h.sent.at(-1).bookId,43);assert.equal(h.sent.at(-1).chapter,3);
  h.current.showGroup([4]);h.flush();assert.equal(h.sent.at(-1).bookId,1);assert.equal(h.sent.at(-1).chapter,2);
 }finally{h.dispose();}
});
test('the original connection host follows after handing presentation to someone else',()=>{
  const h=harness();try{
    h.join(true);h.role(false);h.receive(reading);
    assert.deepEqual(h.spoken,[16]);
    assert.equal(h.current.stageVerse,16);
  }finally{h.dispose();}
});
test('joining auto-follows; heartbeat does not restart audio; mute keeps highlights; private browse stays private',()=>{
 const h=harness();try{
  h.join(false);h.receive(reading);assert.deepEqual(h.spoken,[16]);assert.equal(h.current.needsArm,false);
  h.receive({...reading,ts:2});assert.deepEqual(h.spoken,[16]);
  h.current.toggleNarration();h.flush();assert.equal(h.app.speechState,'idle');assert.deepEqual(Array.from(h.current.highlights),[16,17]);
  h.receive({...reading,verse:17,ts:3});assert.deepEqual(h.spoken,[16]);
  h.current.toggleNarration();h.flush();assert.deepEqual(h.spoken,[16,17]);
  h.current.browseIndependently();h.app.goTo(1,1);h.flush();h.receive({...reading,verse:18,ts:4});assert.equal(h.app.bookId,1);assert.equal(h.current.following,false);
  h.current.returnToHost();h.flush();assert.equal(h.app.bookId,43);assert.equal(h.app.chapterNumber,3);assert.equal(h.spoken.at(-1),18);
  h.receive({...reading,action:'live',ts:5});assert.equal(h.app.speechState,'idle');
 }finally{h.dispose();}
});
test('following waits for the new chapter instead of reading the previous chapter at rollover',()=>{
 const h=harness();try{
  h.join(false);h.receive(reading);
  h.receive({...reading,chapter:4,verse:1});
  assert.deepEqual(h.spoken,[16]);
  assert.equal(h.app.chapterNumber,3,'stay on the verse still being read');
  h.finish();assert.equal(h.app.chapterNumber,4);
  assert.deepEqual(h.spoken,[16],'wait for actual chapter data');
  h.app.chapter={verses:[{ref:{bookId:43,chapter:4,verse:1}}]};h.flush();
  assert.deepEqual(h.spoken,[16,1]);
 }finally{h.dispose();}
});
test('a participant playback failure offers re-arming instead of an endless resume loop',()=>{
 const h=harness();try{
  h.join(false);h.receive(reading);
  h.app.speechState='paused';h.app.speechError='Playback interrupted';h.flush();
  assert.equal(h.current.needsArm,true);assert.equal(h.app.speechState,'paused');
  h.receive({...reading,ts:2});assert.deepEqual(h.spoken,[16]);
  h.current.arm();h.flush();assert.equal(h.controls.at(-1),'resume');assert.deepEqual(h.spoken,[16]);assert.equal(h.current.needsArm,false);
 }finally{h.dispose();}
});

test('a host update a few milliseconds early never cancels the current verse',()=>{
 const h=harness();try{
  h.join(false);h.receive(reading);const controls=h.controls.length;
  h.receive({...reading,verse:17});
  assert.deepEqual(h.spoken,[16]);assert.equal(h.app.speakingVerse,16);
  assert.equal(h.controls.length,controls,'no stop/pause/seek to catch up');
  h.finish();assert.deepEqual(h.spoken,[16,17]);
  h.finish();h.receive({...reading,verse:17,ts:100});
  assert.deepEqual(h.spoken,[16,17],'heartbeats do not replay completed verses');
 }finally{h.dispose();}
});

test('batched verses and natural completion drain in order without losing the final words',()=>{
 const h=harness();try{
  h.join(false);h.receive(reading);
  h.receiveBatch([17,18,19].map(verse=>({...reading,verse})));
  h.receive({...reading,verse:19,action:'live',finished:true});
  assert.deepEqual(h.spoken,[16]);assert.equal(h.app.speechState,'speaking');
  for(const verse of [17,18,19]){h.finish();assert.equal(h.spoken.at(-1),verse);assert.equal(h.app.speechState,'speaking');}
  h.finish();assert.deepEqual(h.spoken,[16,17,18,19]);assert.equal(h.app.speechState,'idle');
  h.receive({...reading,verse:19,action:'live',finished:true,ts:500});
  assert.deepEqual(h.spoken,[16,17,18,19]);
 }finally{h.dispose();}
});

test('pause retains the current verse and backlog; explicit Stop discards it',()=>{
 const h=harness();try{
  h.join(false);h.receive(reading);h.receive({...reading,verse:17});
  h.receive({...reading,verse:17,action:'paused'});assert.equal(h.app.speechState,'paused');
  h.receive({...reading,verse:17,action:'playing'});assert.equal(h.controls.at(-1),'resume');assert.deepEqual(h.spoken,[16]);
  h.finish();assert.deepEqual(h.spoken,[16,17]);
  h.receive({...reading,verse:18});
  h.receive({...reading,verse:18,action:'live',finished:false});
  assert.equal(h.app.speechState,'idle');h.finish();assert.deepEqual(h.spoken,[16,17]);
 }finally{h.dispose();}
});

test('Stop and new Play batched together still stop old audio and clear old pending verses',()=>{
 const h=harness();try{
  h.join(false);h.receive(reading);h.receive({...reading,verse:17});
  const stops=h.controls.filter(c=>c==='stop').length;
  h.receiveBatch([{...reading,action:'live'},{...reading,verse:25}]);
  assert.equal(h.controls.filter(c=>c==='stop').length,stops+1);
  assert.deepEqual(h.spoken,[16,25]);h.finish();assert.deepEqual(h.spoken,[16,25]);
 }finally{h.dispose();}
});

test('retry after an audio failure retains queued verses even after the host finishes',()=>{
 const h=harness();try{
  h.join(false);h.receive(reading);h.receive({...reading,verse:17});
  h.app.speechState='paused';h.app.speechError='Playback interrupted';h.flush();
  h.receive({...reading,verse:17,action:'live',finished:true});
  assert.equal(h.current.needsArm,true);h.current.arm();h.flush();
  assert.equal(h.app.speakingVerse,16);assert.equal(h.controls.at(-1),'resume');
  h.finish();assert.deepEqual(h.spoken,[16,17]);
 }finally{h.dispose();}
});

test('a deliberate replay of the same verse is distinct from its heartbeats',()=>{
 const h=harness();try{
  h.join(false);h.receive({...reading,playbackId:1});
  h.receive({...reading,playbackId:2});assert.deepEqual(h.spoken,[16]);
  h.finish();assert.deepEqual(h.spoken,[16,16]);
  h.receive({...reading,playbackId:2,ts:100});h.finish();assert.deepEqual(h.spoken,[16,16]);
 }finally{h.dispose();}
});

test('joining an already completed reading does not replay it; disconnect clears pending audio',()=>{
 const h=harness();try{
  h.join(false);h.receive({...reading,action:'live',finished:true});assert.deepEqual(h.spoken,[]);
  h.receive(reading);h.receive({...reading,verse:17});h.status('disconnected');
  assert.equal(h.app.speechState,'idle');h.finish();assert.deepEqual(h.spoken,[16]);
 }finally{h.dispose();}
});

test('clearing the shared reading clears pending audio too',()=>{
 const h=harness();try{
  h.join(false);h.receive(reading);h.receive({...reading,verse:17});h.receive(null);
  assert.equal(h.app.speechState,'idle');h.finish();assert.deepEqual(h.spoken,[16]);
 }finally{h.dispose();}
});

test('host broadcasts natural completion separately from Stop and identifies same-verse replays',()=>{
 const h=harness();try{
  h.join(true);h.app.speakVerse(16);h.flush();const first=h.sent.at(-1).playbackId;
  h.finish();assert.equal(h.sent.at(-1).finished,true);
  h.app.stopSpeech();h.flush();assert.equal(h.sent.at(-1).finished,false);
  h.app.speakVerse(16);h.flush();assert.notEqual(h.sent.at(-1).playbackId,first);
 }finally{h.dispose();}
});
