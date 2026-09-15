const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const ts=require('typescript');
class Track {
  constructor(kind){this.kind=kind;this.readyState='live';this.enabled=true;}
  stop(){this.readyState='ended';}
  addEventListener(){}
}
class Stream {
  constructor(tracks=[]){this.tracks=tracks;}
  getTracks(){return this.tracks;}
  getAudioTracks(){return this.tracks.filter(t=>t.kind==='audio');}
  getVideoTracks(){return this.tracks.filter(t=>t.kind==='video');}
  removeTrack(track){this.tracks=this.tracks.filter(t=>t!==track);}
}
function setup(){
  const requests=[];
  const capture=()=>new Promise((resolve,reject)=>requests.push({resolve,reject}));
  const source=fs.readFileSync(require('node:path').join(__dirname,'../src/media.ts'),'utf8');
  const exports={};
  vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{
    exports,window:{},navigator:{mediaDevices:{getUserMedia:capture,getDisplayMedia:capture}},
    MediaStream:Stream,DOMException,localStorage:{getItem:()=>null,setItem(){}},clearInterval,
  });
  return {media:exports,requests};
}
test('a fresh profile shares system audio at 80%, not silent zero',()=>assert.equal(setup().media.getSystemAudioVolume(),0.8));
test('leaving while a permission dialog is open stops every late track',async()=>{
  for(const start of [m=>m.setMedia({audio:true,video:true}),m=>m.startScreenShare({withAudio:true}),m=>m.startSystemAudio({})]){
    const {media,requests}=setup();const pending=start(media);media.stopLocal();
    const stream=new Stream([new Track('audio'),new Track('video')]);requests[0].resolve(stream);
    await assert.rejects(pending,{name:'AbortError'});assert.equal(media.getLocalStream(),null);
    assert.ok(stream.getTracks().every(t=>t.readyState==='ended'));
  }
});
test('denying camera access leaves the active microphone intact',async()=>{
  const {media,requests}=setup();const first=media.setMedia({audio:true,video:false});
  const mic=new Stream([new Track('audio')]);requests[0].resolve(mic);await first;
  const second=media.setMedia({audio:true,video:true});requests[1].reject(new Error('denied'));
  await assert.rejects(second);assert.equal(media.getCameraStream(),mic);assert.equal(mic.getAudioTracks()[0].readyState,'live');media.stopLocal();
});
test('a slower old microphone request cannot replace a newer choice',async()=>{
  const {media,requests}=setup();const first=media.setMedia({audio:true,video:false});const second=media.setMedia({audio:true,video:false});
  const a=new Stream([new Track('audio')]),b=new Stream([new Track('audio')]);requests[1].resolve(b);await second;
  requests[0].resolve(a);await assert.rejects(first,{name:'AbortError'});
  assert.equal(media.getCameraStream(),b);assert.equal(a.getAudioTracks()[0].readyState,'ended');media.stopLocal();
});
