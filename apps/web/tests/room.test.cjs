const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {EventEmitter} = require('node:events');
const ts = require('typescript');

function harness({media = false} = {}) {
  let sequence=0;
  class Connection extends EventEmitter {
    constructor(peer) { super(); this.peer=peer; this.open=false; this.peerConnection={connectionState:'connected'}; }
    send(data) { if(this.open) queueMicrotask(()=>this.other.emit('data',structuredClone(data))); }
    close() { if(!this.open)return; this.open=false; this.other.open=false; this.emit('close');this.other.emit('close'); }
  }
  class Call extends EventEmitter {
    constructor(peer) { super(); this.peer=peer; this.open=true; }
    answer(stream) {
      queueMicrotask(()=>{if(this.open){this.emit('stream',this.other.stream);this.other.emit('stream',stream);}});
    }
    close() {
      if(!this.open)return;
      this.open=false;this.other.open=false;this.emit('close');this.other.emit('close');
    }
  }
  class Peer extends EventEmitter {
    static registry=new Map();
    constructor(id) { super(); this.id=id||`client-${++sequence}`; this.connections=[];this.calls=[]; queueMicrotask(()=>{
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
    call(id,stream) {
      const remote=Peer.registry.get(id);if(!remote)throw new Error('unavailable');
      const a=new Call(id),b=new Call(this.id);a.other=b;b.other=a;a.stream=stream;
      this.calls.push(a);remote.calls.push(b);queueMicrotask(()=>remote.emit('call',b));return a;
    }
    destroy(){this.dead=true;if(Peer.registry.get(this.id)===this)Peer.registry.delete(this.id);this.connections.forEach(c=>c.close());}
  }
  let clock = 1_000_000;
  const source=fs.readFileSync(require('node:path').join(__dirname,'../src/readParty.ts'),'utf8');
  const js=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  const exports={};
  vm.runInNewContext(js,{exports,require:(id)=>id==='peerjs'?{Peer}:{getLocalStream:()=>media?{id:'test-stream'}:null,hasMedia:()=>media,getState:()=>({audio:media,video:false})},setTimeout,clearTimeout,setInterval,clearInterval,Date:{now:()=>clock},Math,Map,Set});
  return {join:exports.joinParty,Peer,Call,advance(ms){clock+=ms;}};
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

test('a refreshed member replaces their old connection instead of taking a second seat', async () => {
  const {join} = harness();
  const hostStates = [], hostRoster = [], firstRoster = [], secondRoster = [];
  const host = join(person('Anna', hostStates, hostRoster)); await tick();
  const first = join(person('Ben', [], firstRoster)); await tick();
  const refreshed = join(person('Ben', [], secondRoster)); await tick();
  try {
    assert.equal(host.size, 2);
    assert.equal(hostRoster.at(-1).filter((member) => member.id === 'Ben').length, 1);
    first.leave(); await tick();
    assert.equal(host.size, 2, 'closing the replaced connection must not remove the person');
    assert.equal(hostRoster.at(-1).some((member) => member.id === 'Ben' && member.peerId), true);
    refreshed.leave(); await tick();
    assert.equal(host.size, 1);
  } finally { refreshed.leave(); first.leave(); host.leave(); }
});

test('a broker id collision does not destroy a live host or kick the room', async () => {
  const {join, Peer} = harness();
  const host = join(person('Anna', [], [])); await tick();
  const guest = join(person('Ben', [], [])); await tick();
  try {
    const hub = [...Peer.registry.values()].find((peer) => String(peer.id).startsWith('tw-party'));
    hub.reconnect = () => {};
    hub.emit('error', {type: 'unavailable-id'});
    hub.emit('error', {type: 'network'});
    await tick();
    assert.equal(host.isHost, true);
    assert.equal(host.size, 2);
    assert.equal(Peer.registry.get(hub.id), hub);
    assert.equal(guest.isHost, false);
  } finally { guest.leave(); host.leave(); }
});

test('a transient channel error does not reelect or drop the guest', async () => {
  const {join, Peer} = harness();
  const host = join(person('Anna', [], [])); await tick();
  const guest = join(person('Ben', [], [])); await tick();
  try {
    const client = [...Peer.registry.values()].find((peer) => String(peer.id).startsWith('client'));
    const link = client.connections[0];
    assert.equal(link.open, true);
    link.emit('error', {type: 'negotiation-failed'});
    await tick();
    assert.equal(host.size, 2);
    assert.equal(guest.isHost, false);
    assert.equal(Peer.registry.get(client.id), client);
  } finally { guest.leave(); host.leave(); }
});

test('a guest cannot take the host seat by reusing the host id', async () => {
  const {join, Peer} = harness();
  const rosters = [];
  const host = join(person('Anna', [], rosters)); await tick();
  const guest = join(person('Ben', [], [])); await tick();
  try {
    const hub = [...Peer.registry.values()].find((peer) => String(peer.id).startsWith('tw-party'));
    hub.connections.find((connection) => connection.open).emit('data', {t: 'hello', d: {id: 'Anna', name: 'Impostor', color: '#000'}});
    await tick();
    const roster = rosters.at(-1);
    assert.equal(host.size, 2);
    assert.equal(roster.find((member) => member.id === 'Anna').name, 'Anna');
    assert.equal(roster.filter((member) => member.id === 'Ben').length, 1);
  } finally { guest.leave(); host.leave(); }
});

test('a failed guest channel is removed so the host stops broadcasting to it', async () => {
  const {join, Peer} = harness();
  const host = join(person('Anna', [], [])); await tick();
  const guest = join(person('Ben', [], [])); await tick();
  try {
    const hub = [...Peer.registry.values()].find((peer) => String(peer.id).startsWith('tw-party'));
    const ghost = hub.connections.find((connection) => connection.peerConnection);
    ghost.peerConnection.connectionState = 'failed';
    host.setReadingState({bookId: 43, chapter: 3, verse: 16, action: 'playing', ts: 1});
    await tick();
    assert.equal(host.size, 1);
  } finally { guest.leave(); host.leave(); }
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

test('five people stay connected through simultaneous media refresh and host handoff', async () => {
  const {join,Peer}=harness({media:true});
  const rooms=[],seen=[];
  try {
    for(let i=0;i<5;i++) {
      const state={streams:new Set(),questions:[],answers:[]};seen.push(state);
      rooms.push(join({code:'five-readers',identity:{id:`reader-${i}`,name:`Reader ${i}`,color:'#888'},handlers:{
        onRemoteStream:id=>state.streams.add(id),onRemoteEnd:id=>state.streams.delete(id),
        onQuestion:q=>state.questions.push(q),onAnswerList:a=>state.answers.push(a),
      }}));await tick();
    }
    await new Promise(r=>setTimeout(r,500));
    seen.forEach(s=>assert.equal(s.streams.size,4));
    const oldCalls=[...Peer.registry.values()].flatMap(p=>p.calls);
    rooms.forEach(room=>room.refreshMedia());
    await new Promise(r=>setTimeout(r,800));
    // A delayed close event from a replaced call cannot remove the new stream.
    oldCalls.forEach(call=>call.emit('close'));
    seen.forEach(s=>assert.equal(s.streams.size,4));
    assert.equal([...Peer.registry.values()].flatMap(p=>p.calls).filter(c=>c.open).length,20);
    rooms[0].transferHost('reader-1');await tick();
    rooms[1].askQuestion('What stands out?');await tick();
    const q=seen[1].questions.at(-1);
    rooms[4].sendAnswer(q.id,'The promise.');await tick();
    assert.equal(seen[1].answers.at(-1)[0].text,'The promise.');
    assert.equal(seen[0].answers.at(-1).length,0,'former host must not receive private answers');
    rooms[1].transferHost('reader-2');await tick();
    assert.equal(seen[2].answers.at(-1)[0].text,'The promise.');
    assert.equal(seen[1].answers.at(-1).length,0);
  } finally {rooms.forEach(room=>room.leave());}
});

test('an invite to a missing room never claims its host ID',async()=>{
  const {join,Peer}=harness();const errors=[];
  const room=join({code:'missing',create:false,identity:{id:'guest',name:'Guest',color:'#888'},handlers:{onError:e=>errors.push(e)}});
  try {await tick();assert.equal(room.isHost,false);assert.equal(Peer.registry.has('tw-party-missing'),false);assert.ok(errors.includes('room-unavailable'));}
  finally{room.leave();}
});

function seat(id, name, rosters = []) {
  return {code:'test-private', identity:{id, name, color:'#947849'}, handlers:{onRoster:r=>rosters.push(r)}};
}

test('two tabs stay two seats, and a refresh replaces only that tab', async () => {
  const {join} = harness();
  const rosters = [];
  const host = join(seat('host', 'Host', rosters)); await tick();
  const tab1 = join(seat('acct-tab1', 'Sam')); await tick();
  const tab2 = join(seat('acct-tab2', 'Sam')); await tick();
  try {
    assert.equal(host.size, 3);
    assert.equal(rosters.at(-1).filter((member) => member.name === 'Sam').length, 2);
    const refreshed = join(seat('acct-tab1', 'Sam')); await tick();
    try {
      assert.equal(host.size, 3, 'refreshing one tab must not add a third Sam');
      assert.equal(rosters.at(-1).filter((member) => member.id === 'acct-tab1').length, 1);
      tab1.leave(); await tick();
      assert.equal(host.size, 3, 'the replaced tab must not take the refreshed one with it');
      assert.equal(rosters.at(-1).some((member) => member.id === 'acct-tab2'), true);
    } finally { refreshed.leave(); }
  } finally { tab2.leave(); tab1.leave(); host.leave(); }
});

test('a killed tab lingers while its channel still looks connected, then a rejoin replaces it', async () => {
  const {join, Peer, advance} = harness();
  const host = join(person('Anna', [], [])); await tick();
  const guest = join(person('Ben', [], [])); await tick();
  try {
    const hub = [...Peer.registry.values()].find((peer) => String(peer.id).startsWith('tw-party'));
    const link = hub.connections.find((connection) => connection.open);
    advance(60_000);
    host.setReadingState({bookId:43, chapter:3, verse:1, action:'playing', ts:1});
    await tick();
    assert.equal(host.size, 2, 'a channel that still says connected is kept');
    link.emit('data', {t:'ping'});
    link.peerConnection.connectionState = 'disconnected';
    host.setReadingState({bookId:43, chapter:3, verse:2, action:'playing', ts:2});
    await tick();
    assert.equal(host.size, 2, 'a disconnect that just started is not dropped');
    advance(21_000);
    host.setReadingState({bookId:43, chapter:3, verse:3, action:'playing', ts:3});
    await tick();
    assert.equal(host.size, 1, 'a disconnect that never recovers is removed');
  } finally { guest.leave(); host.leave(); }
});

test('rejoining the same seat replaces a channel that has not reported dead yet', async () => {
  const {join} = harness();
  const rosters = [];
  const host = join(person('Anna', [], rosters)); await tick();
  const original = join(person('Ben', [], [])); await tick();
  const returned = join(person('Ben', [], [])); await tick();
  try {
    assert.equal(host.size, 2);
    assert.equal(rosters.at(-1).filter((member) => member.id === 'Ben').length, 1);
    original.leave(); await tick();
    assert.equal(host.size, 2);
  } finally { returned.leave(); original.leave(); host.leave(); }
});

test('a stolen host id keeps the current calls and does not step down', async () => {
  const {join, Peer} = harness();
  const statuses = [];
  const host = join({code:'test-private', identity:{id:'Anna', name:'Anna', color:'#947849'}, handlers:{onStatus:s=>statuses.push(s)}});
  await tick();
  const guest = join(person('Ben', [], [])); await tick();
  try {
    const hub = [...Peer.registry.values()].find((peer) => String(peer.id).startsWith('tw-party'));
    const guestLink = hub.connections.find((connection) => connection.open);
    let reconnects = 0;
    hub.reconnect = () => { reconnects += 1; hub.emit('error', {type:'unavailable-id'}); };
    const usurper = {id:hub.id, connections:[]};
    Peer.registry.set(hub.id, usurper);
    hub.emit('error', {type:'unavailable-id'});
    await tick();
    assert.equal(guestLink.open, true);
    assert.equal(host.isHost, true);
    assert.equal(host.size, 2);
    assert.equal(hub.dead, undefined);
    await new Promise((resolve) => setTimeout(resolve, 500));
    assert.equal(reconnects, 1);
    assert.equal(guestLink.open, true);
    assert.equal(host.size, 2);
    assert.equal(Peer.registry.get(hub.id), usurper);
    await new Promise((resolve) => setTimeout(resolve, 900));
    assert.equal(reconnects, 2);
    assert.ok(statuses.includes('reconnecting'));
    assert.equal(host.isHost, true);
    assert.equal(guestLink.open, true, 'retrying the broker must not kick the guest');
  } finally { guest.leave(); host.leave(); }
});


test('a replaced live tab does not reconnect and evict its replacement', async () => {
  const {join, Peer} = harness();
  const host = join(person('Anna', [], [])); await tick();
  const old = join(person('Ben', [], [])); await tick();
  const replacement = join(person('Ben', [], [])); await tick();
  const selected = [...Peer.registry.values()].find(p => p.id.startsWith('client') && !p.dead && p.connections.some(c=>c.open));
  try {
    await new Promise(r => setTimeout(r, 1500));
    assert.equal(host.size, 2);
    assert.equal(selected.dead, undefined, 'replacement must keep its connection');
    assert.equal([...Peer.registry.values()].filter(p=>p.id.startsWith('client')).length, 1);
  } finally { old.leave(); replacement.leave(); host.leave(); }
});

test('late packets from a retired channel cannot reclaim a seat', async () => {
  const {join, Peer} = harness();
  const rosters=[];
  const host=join(person('Anna',[],rosters)); await tick();
  const old=join(person('Ben',[],[])); await tick();
  const hub=[...Peer.registry.values()].find(p=>p.id.startsWith('tw-party'));
  const stale=hub.connections.find(c=>c.open);
  const replacement=join(person('Ben',[],[])); await tick();
  try {
    const seat=rosters.at(-1).find(m=>m.id==='Ben').peerId;
    stale.emit('data',{t:'hello',d:{id:'Ben',name:'stale'}}); await tick();
    assert.equal(rosters.at(-1).find(m=>m.id==='Ben').peerId,seat);
  } finally {old.leave();replacement.leave();host.leave();}
});

test('an unavailable media peer cannot tear down a healthy hub connection', async () => {
  const {join,Peer}=harness();
  const host=join(person('Anna',[],[]));await tick();
  const guest=join(person('Ben',[],[]));await tick();
  const client=[...Peer.registry.values()].find(p=>p.id.startsWith('client'));
  try {
    client.emit('error',{type:'peer-unavailable'});await tick();
    assert.equal(client.dead,undefined);
    assert.equal(client.connections[0].open,true);
    assert.equal(host.size,2);
  } finally {guest.leave();host.leave();}
});


test('repeated failed media dials back off instead of spinning every 350ms', async () => {
  const {join,Peer,Call,advance}=harness({media:true});
  Call.prototype.answer=function(){}; // negotiated call never produces a stream
  const host=join(person('Anna',[],[]));await tick();
  const guest=join(person('Ben',[],[]));await tick();
  try {
    await new Promise(r=>setTimeout(r,400));
    const calls=()=>[...Peer.registry.values()].flatMap(p=>p.calls);
    const first=calls();assert.ok(first.length);
    first.find(c=>c.open).close();
    await new Promise(r=>setTimeout(r,450));
    assert.equal(calls().length,first.length,'no immediate redial');
    advance(1100);
    guest.updateIdentity({name:'Ben online'});await new Promise(r=>setTimeout(r,400));
    assert.ok(calls().length>first.length,'retry resumes after cooldown');
  } finally {guest.leave();host.leave();}
});


test('removing a roster entry releases its stream using the original member id',async()=>{
  const {join,Peer}=harness({media:true});
  const ended=[],streams=[];
  const host=join({...person('Anna',[],[]),handlers:{onRemoteStream:id=>streams.push(id),onRemoteEnd:id=>ended.push(id)}});await tick();
  const guest=join(person('Ben',[],[]));await tick();
  try {
    await new Promise(r=>setTimeout(r,400));
    assert.ok(streams.includes('Ben'));
    const hub=[...Peer.registry.values()].find(p=>p.id.startsWith('tw-party'));
    // Data closes before the media close event: roster no longer resolves the id.
    hub.connections.find(c=>c.open).close();await tick();
    assert.ok(ended.includes('Ben'),'React stream state must release the member key, not a transport id');
  } finally {guest.leave();host.leave();}
});
