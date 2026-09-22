// Two real WebRTC peers, Piper synthesis and HTML audio. Slow the participant
// deliberately so a host update arrives before their current audio has ended.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = (process.env.APP_URL || 'http://localhost:5187/The-Word/').split('#')[0];
const browser = await chromium.launch({headless:true,args:['--autoplay-policy=user-gesture-required']});
const errors = [];
async function reader(slow) {
  const context = await browser.newContext({viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  page.on('pageerror', e=>errors.push(e.message));
  await page.addInitScript(({slow})=>{
    localStorage.setItem('word.profilePrompt','done');
    localStorage.setItem('word.backedUpAt','2026-09-22T00:00:00.000Z');
    localStorage.setItem('word.breakdownModel',JSON.stringify({version:1,enabled:false}));
    localStorage.setItem('word.speechRate',slow?'0.8':'2');
    window.__voiceState='preparing';window.__clips=[];window.__cutoffs=[];
    window.addEventListener('word-voice-state',e=>{window.__voiceState=e.detail.state;});
    const play=HTMLMediaElement.prototype.play, pause=HTMLMediaElement.prototype.pause;
    HTMLMediaElement.prototype.play=function(...args){
      if(slow&&this.src.startsWith('blob:')) this.playbackRate=0.5;
      if(this.src.startsWith('blob:')&&this.__tracked!==this.src){
        this.__tracked=this.src;
        const clip={verse:document.querySelector('.verse.speaking sup')?.textContent,ended:false};
        window.__clips.push(clip);
        this.addEventListener('ended',()=>{clip.ended=true;},{once:true});
      }
      return play.apply(this,args);
    };
    HTMLMediaElement.prototype.pause=function(...args){
      if(this.src.startsWith('blob:')&&!this.ended&&this.currentTime>0&&this.currentTime<this.duration-0.05)
        window.__cutoffs.push({time:this.currentTime,duration:this.duration});
      return pause.apply(this,args);
    };
  },{slow});
  await page.goto(`${url}#Ps.117.1`,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Select Psalms 117:1',exact:true}).waitFor();
  return page;
}
try {
  const host=await reader(false), guest=await reader(true);
  console.log('Warming both real voices before joining.');
  await Promise.all([host,guest].map(page=>page.waitForFunction(()=>window.__voiceState==='ready',null,{timeout:240000})));
  await host.getByRole('button',{name:'Group Study',exact:true}).click();
  await host.getByRole('button',{name:'Start a group',exact:true}).click();
  await host.locator('.group-summary').filter({hasText:'You are hosting'}).waitFor({timeout:30000});
  const code=await host.locator('.group-summary p strong').textContent();
  await guest.getByRole('button',{name:'Group Study',exact:true}).click();
  await guest.getByRole('textbox',{name:'Room code',exact:true}).fill(code.trim());
  await guest.getByRole('button',{name:'Join group',exact:true}).click();
  await guest.locator('.group-summary').filter({hasText:'2 people'}).waitFor({timeout:30000});
  console.log('Two peers connected.');
  await host.getByRole('button',{name:'Close Group Study',exact:true}).click();
  await host.getByRole('button',{name:'Select Psalms 117:1',exact:true}).click();
  await host.getByRole('button',{name:'Select Psalms 117:2',exact:true}).click();
  await host.locator('.workspace-selection').getByRole('button',{name:'Read to group',exact:true}).click();
  await guest.waitForFunction(()=>window.__clips.length>0,null,{timeout:60000}).catch(async error=>{
    console.log('Guest diagnostics:',await guest.evaluate(()=>({clips:window.__clips,body:document.body.innerText.slice(-4500)})));
    throw error;
  });
  await host.waitForFunction(()=>window.__clips.length===2&&window.__clips.every(c=>c.ended),null,{timeout:120000});
  console.log('Clips after host completion:',await host.evaluate(()=>window.__clips),await guest.evaluate(()=>window.__clips));
  assert.equal(await guest.evaluate(()=>window.__clips.every(c=>c.ended)),false,'guest must still be behind after host completion');
  console.log('Host finished while slower guest still had words to read.');
  await guest.waitForFunction(()=>window.__clips.length===2&&window.__clips.every(c=>c.ended),null,{timeout:120000});
  assert.deepEqual(await guest.evaluate(()=>window.__clips.map(c=>c.verse)),['1','2']);
  assert.deepEqual(await guest.evaluate(()=>window.__cutoffs),[]);
  assert.deepEqual(errors,[]);
  console.log('PASS: both participant verses played to their actual ended event, with no premature pause.');
} finally { await browser.close(); }
