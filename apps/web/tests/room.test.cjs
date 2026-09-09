const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const ts = require('typescript');

function harness() {
  let sequence=0;
  class Connection extends EventEmitter {
    constructor(peer) { super(); this.peer=peer; this.open=false; }
    send(data) { if(this.open) queueMicrotask(()=>this.other.emit('data',structuredClone(data))); }
    close() { if(!this.open)return; this.open=false; this.other.open=false; this.emit('close');this.other.emit('close'); }
  }
  class Peer extends EventEmitter {
    static registry=new Map();
    constructor(id) { super(); this.id=id||`client-${++sequence}`; this.connections=[]; queueMicrotask(()=>{
      if(this.dead)return;
      if(Peer.registry.has(this.id))this.emit('error',{type:'unavailable-id'});
      else {Peer.registry.set(this.id,this);this.emit('open',this.id);}
    }); }
    connect(id) {
      const a=new Connection(id); this.connections.push(a);
      queueMicrotask(()=>{
        const remote=Peer.registry.get(id); if(!remote){a.emit('error',{type:'peer-unavailable'});return;}
        const b=new Connection(this.id); a.other=b;b.other=a;remote.connections.push(b);
        remote.emit('connection',b);a.open=true;b.open=true;b.emit('open');a.emit('open');
      }); return a;
    }
    destroy(){this.dead=true;if(Peer.registry.get(this.id)===this)Peer.registry.delete(this.id);this.connections.forEach(c=>c.close());}
  }
  const source=fs.readFileSync(require('node:path').join(__dirname,'../src/readParty.ts'),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};
  vm.runInNewContext(js,{exports,require:(id)=>id==='peerjs'?{Peer}:{getLocalStream:()=>null,hasMedia:()=>false,getState:()=>({audio:false,video:false})},setTimeout,clearTimeout,Date,Math,Map,Set});
  return {join:exports.joinParty,Peer};
}
const tick=()=>new Promise(resolve=>setTimeout(resolve,30));
function person(id,states,rosters){return {code:'test-private',identity:{id,name:id,color:'#947849'},handlers:{onReading:s=>states.push(s),onRoster:r=>rosters.push(r)}};}

test('room shares ranges, catches up late joiners, authorizes transfers, and rejects non-host reading',async()=>{
  const {join,Peer}=harness();const a=[],b=[],c=[],ar=[],br=[],cr=[];
  const host=join(person('Anna',a,ar));await tick();
  const guest=join(person('Ben',b,br));await tick();
  const observer=join(person('Cara',c,cr));await tick();
  try {
    assert.equal(host.isHost,true);assert.equal(guest.isHost,false);assert.equal(host.size,3);
    const state={bookId:43,chapter:3,verse:16,action:'playing',highlights:[16,17,18],translationId:'kjv',ts:1};
    host.setReadingState(state);await tick();
    assert.deepEqual(Array.from(b.at(-1).highlights),[16,17,18]);assert.equal(b.at(-1).verse,16);
    const revision=b.at(-1).revision;
    guest.setReadingState({...state,verse:99});await tick();assert.equal(b.at(-1).verse,16);
    // Bypass the public guard to prove hub-side sender authorization too.
    [...Peer.registry.values()].find(p=>p.id==='client-1').connections[0].send({t:'reading',d:{...state,verse:98}});
    await tick();assert.equal(b.at(-1).verse,16);
    host.transferHost('Ben');await tick();
    assert.equal(host.isHost,false);assert.equal(guest.isHost,true);assert.equal(observer.isHost,false);
    assert.equal(b.at(-1).action,'live');assert.ok(b.at(-1).revision>revision);
    assert.equal(br.at(-1).find(m=>m.host).id,'Ben');
    guest.setReadingState({...state,verse:18});await tick();assert.equal(c.at(-1).verse,18);
    host.setReadingState({...state,verse:22});await tick();assert.equal(c.at(-1).verse,18);
    const d=[],dr=[];const late=join(person('Dan',d,dr));await tick();
    assert.equal(d.at(-1).verse,18);assert.equal(dr.at(-1).find(m=>m.host).id,'Ben');late.leave();
    guest.leave();await tick();assert.equal(host.isHost,true);assert.equal(a.at(-1).action,'live');
  } finally {observer.leave();guest.leave();host.leave();}
});

test('hub loss elects a host without restarting narration',async()=>{
  const {join}=harness();const a=[],b=[],ar=[],br=[];
  const host=join(person('Anna',a,ar));await tick();const guest=join(person('Ben',b,br));await tick();
  try {
    host.setReadingState({bookId:43,chapter:3,verse:16,action:'playing',highlights:[16],ts:1});await tick();
    host.leave();await new Promise(r=>setTimeout(r,1350));
    assert.equal(guest.isHost,true);assert.equal(b.at(-1).action,'live');assert.equal(b.at(-1).verse,16);
  }finally{guest.leave();host.leave();}
});
