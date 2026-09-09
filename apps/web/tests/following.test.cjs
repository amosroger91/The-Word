const test=require('node:test');
const assert=require('node:assert/strict');
const ts=require('typescript');
const fs=require('node:fs');
const vm=require('node:vm');
function harness(){
  let cursor=0,slots=[],effects=[],dirty=true,result,handlers,host=false;const sent=[],spoken=[];
  const changed=(a,b)=>!a||!b||a.length!==b.length||a.some((v,i)=>!Object.is(v,b[i]));
  const React={
    useState(initial){const index=cursor++;slots[index]??={value:typeof initial==='function'?initial():initial};return [slots[index].value,value=>{const next=typeof value==='function'?value(slots[index].value):value;if(!Object.is(next,slots[index].value)){slots[index].value=next;dirty=true;}}];},
    useRef(initial){const index=cursor++;slots[index]??={value:{current:initial}};return slots[index].value;},
    useCallback(fn,deps){const index=cursor++;if(!slots[index]||changed(slots[index].deps,deps))slots[index]={value:fn,deps};return slots[index].value;},
    useEffect(fn,deps){const index=cursor++;if(!slots[index]||changed(slots[index].deps,deps)){effects.push(()=>{slots[index]?.cleanup?.();slots[index]={deps,cleanup:fn()};});}}
  };
  const app={bookId:43,chapterNumber:3,translationId:'kjv',chapter:{verses:[]},chapterLoading:false,speechState:'idle',speakingVerse:null,autoplayBlocked:false,
    goTo(b,c){app.bookId=b;app.chapterNumber=c;dirty=true;},goToVerse(b,c,v){app.goTo(b,c);app.focusedVerse=v;},
    stopSpeech(){app.speechState='idle';app.speakingVerse=null;dirty=true;},pauseSpeech(){app.speechState='paused';dirty=true;},resumeSpeech(){app.speechState='speaking';dirty=true;},speakVerse(v){spoken.push(v);app.speechState='speaking';app.speakingVerse=v;dirty=true;}};
  const room={leave(){},refreshMedia(){},updateIdentity(){},sendChat(){},transferHost(){},setReadingState(s){sent.push(s);handlers.onReading(s);}};
  const identity={id:'tester',name:'Tester',color:'#888',avatar:null};
  const modules={react:React,'./readParty':{joinParty(options){handlers=options.handlers;return room;}},'./identity':{loadIdentity:()=>identity,saveIdentity(){},compressAvatar(){}},'./media':{getLocalStream:()=>null,setMedia:async()=>{},stopLocal(){},unlockRemoteAudio(){},setDevices(){}}};
  const exports={};const code=ts.transpileModule(fs.readFileSync(require('node:path').join(__dirname,'../src/useReadParty.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(code,{exports,require:id=>modules[id],setInterval,clearInterval,Date,Math});
  function flush(){dirty=true;let n=0;while(dirty){if(++n>40)throw Error('Hook render loop');dirty=false;cursor=0;effects=[];result=exports.useReadParty(app);effects.forEach(f=>f());}return result;}
  flush();
  return {app,sent,spoken,flush,get current(){return result;},join(isHost){result.joinParty('test');flush();host=isHost;handlers.onStatus(isHost?'hosting':'connected');handlers.onRoster([],{host:isHost,capped:false});flush();},receive(state){handlers.onReading(state);return flush();},dispose(){slots.forEach(s=>s?.cleanup?.());}};
}
const reading={bookId:43,chapter:3,verse:16,highlights:[16,17],action:'playing',ts:1};
test('host private navigation and selections do not change shared passage',()=>{
 const h=harness();try{
  h.join(true);h.current.showGroup([16,17]);h.flush();assert.deepEqual(Array.from(h.sent.at(-1).highlights),[16,17]);
  h.current.browseIndependently();h.app.goTo(1,2);h.flush();assert.equal(h.sent.at(-1).bookId,43);assert.equal(h.sent.at(-1).chapter,3);
  h.current.showGroup([4]);h.flush();assert.equal(h.sent.at(-1).bookId,1);assert.equal(h.sent.at(-1).chapter,2);
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
