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

// --- host question board -----------------------------------------------------

function asker(id) {
  const seen = {questions: [], answers: [], shared: []};
  return {
    seen,
    spec: {
      code: 'test-private',
      identity: {id, name: id, color: '#947849'},
      handlers: {
        onQuestion: (q) => seen.questions.push(q),
        // Array.from re-creates the list in THIS realm; arrays built inside the vm
        // context have a different Array.prototype and fail deepStrictEqual.
        onAnswerList: (list) => seen.answers.push(Array.from(list, (a) => `${a.name}:${a.text}`)),
        onSharedAnswers: (shared) => seen.shared.push(shared),
      },
    },
  };
}

test('the host asks, answers come back, and only the host can put them on screen', async () => {
  const {join} = harness();
  const anna = asker('Anna'), ben = asker('Ben'), cara = asker('Cara');
  const host = join(anna.spec); await tick();
  const guest = join(ben.spec); await tick();
  const other = join(cara.spec); await tick();
  try {
    host.askQuestion('What stood out to you?'); await tick();

    // Everyone sees the question, with the same id.
    const asked = anna.seen.questions.at(-1);
    assert.equal(asked.text, 'What stood out to you?');
    assert.equal(ben.seen.questions.at(-1).id, asked.id);
    assert.equal(cara.seen.questions.at(-1).id, asked.id);

    // A guest answering reaches the host only — it is not broadcast.
    guest.sendAnswer(asked.id, 'The bit about bread.'); await tick();
    assert.deepEqual(anna.seen.answers.at(-1), ['Ben:The bit about bread.']);
    // Asking retires any previous board, so a null does arrive; what must not
    // arrive is an actual set of answers.
    assert.equal(ben.seen.shared.at(-1) ?? null, null, 'answers must not be visible before the host shares them');

    // Answering again replaces rather than appends.
    guest.sendAnswer(asked.id, 'Actually, the bread AND the fish.'); await tick();
    assert.deepEqual(anna.seen.answers.at(-1), ['Ben:Actually, the bread AND the fish.']);

    // A reply to a question that has been replaced is dropped.
    other.sendAnswer('some-stale-id', 'late to the party'); await tick();
    assert.deepEqual(anna.seen.answers.at(-1), ['Ben:Actually, the bread AND the fish.']);

    // A guest cannot drive the board.
    guest.askQuestion('my own question'); await tick();
    assert.equal(anna.seen.questions.at(-1).id, asked.id, 'a guest must not be able to ask');
    guest.shareAnswers(true); await tick();
    assert.equal(ben.seen.shared.at(-1) ?? null, null, 'a guest must not be able to share');

    // The host shares: it lands on everyone.
    host.shareAnswers(true); await tick();
    assert.equal(ben.seen.shared.at(-1).items.length, 1);
    assert.equal(cara.seen.shared.at(-1).question, 'What stood out to you?');

    // An answer arriving while the board is up appears on it immediately.
    other.sendAnswer(asked.id, 'the walking on water'); await tick();
    assert.equal(ben.seen.shared.at(-1).items.length, 2);

    // And the host can take it back down.
    host.shareAnswers(false); await tick();
    assert.equal(ben.seen.shared.at(-1), null);
  } finally {
    host.leave(); guest.leave(); other.leave();
  }
});

test('a late joiner receives the open question and the shared board', async () => {
  const {join} = harness();
  const anna = asker('Anna'), ben = asker('Ben'), dave = asker('Dave');
  const host = join(anna.spec); await tick();
  const guest = join(ben.spec); await tick();
  try {
    host.askQuestion('Where did you see grace?'); await tick();
    const asked = anna.seen.questions.at(-1);
    guest.sendAnswer(asked.id, 'In verse two.'); await tick();
    host.shareAnswers(true); await tick();

    const latecomer = join(dave.spec); await tick();
    try {
      assert.equal(dave.seen.questions.at(-1).text, 'Where did you see grace?');
      assert.equal(dave.seen.shared.at(-1).items.length, 1);
    } finally { latecomer.leave(); }
  } finally {
    host.leave(); guest.leave();
  }
});

test('closing the question clears it everywhere', async () => {
  const {join} = harness();
  const anna = asker('Anna'), ben = asker('Ben');
  const host = join(anna.spec); await tick();
  const guest = join(ben.spec); await tick();
  try {
    host.askQuestion('One word for this chapter?'); await tick();
    assert.ok(ben.seen.questions.at(-1));
    host.closeQuestion(); await tick();
    assert.equal(ben.seen.questions.at(-1), null);
  } finally {
    host.leave(); guest.leave();
  }
});
