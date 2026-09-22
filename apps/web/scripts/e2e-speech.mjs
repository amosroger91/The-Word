// Real Piper/WASM + real media playback against the static Pages build.
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const url = process.env.APP_URL || 'http://localhost:5187/The-Word/';
const browser = await chromium.launch({ headless: true, args: ['--autoplay-policy=user-gesture-required'] });
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', error => { errors.push(error.message); console.error('PAGE ERROR', error.message); });
page.on('console', message => { if(message.type()==='error') console.error('CONSOLE',message.text().slice(0,400)); });
await page.addInitScript(() => {
  localStorage.setItem('word.profilePrompt', 'done');
  localStorage.setItem('word.backedUpAt', '2026-09-22T00:00:00.000Z');
  localStorage.setItem('word.breakdownModel', JSON.stringify({version:1,enabled:false}));
  localStorage.setItem('word.speechRate', '2');
  window.__voiceState = 'preparing';
  window.__clips = [];
  window.addEventListener('word-voice-state', e => { window.__voiceState=e.detail.state; });
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function(...args) {
    if(this.src.startsWith('blob:')) {
      window.__narration = this;
      window.__clips.push({verse:document.querySelector('.verse.speaking sup')?.textContent,chapter:document.querySelector('.reader-heading h1')?.textContent});
    }
    return play.apply(this,args);
  };
});
try {
  await page.goto(`${url}#John.3.16`, {waitUntil:'domcontentloaded'});
  await page.waitForSelector('.verse');
  console.log('Reader loaded; waiting for real voice warmup.');
  await page.waitForFunction(() => window.__voiceState !== 'preparing', { }, { timeout: 240000 });
  assert.equal(await page.evaluate(()=>window.__voiceState),'ready');
  await page.getByRole('button',{name:'Select John 3:16',exact:true}).click();
  await page.getByRole('button',{name:'Read from here',exact:true}).click();
  await page.waitForFunction(()=>window.__clips.length>=2, {}, {timeout:60000});
  assert.deepEqual((await page.evaluate(()=>window.__clips.slice(0,2))).map(c=>c.verse),['16','17']);
  // Interrupt at verse 17 and deliberately start elsewhere mid-chapter.
  await page.getByRole('button',{name:'Select John 3:20',exact:true}).click();
  await page.getByRole('button',{name:'Read from here',exact:true}).click();
  await page.waitForFunction(()=>window.__clips.at(-1)?.verse==='20', {}, {timeout:60000});
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  assert.equal(await page.locator('.verse.speaking').count(),0);
  await page.evaluate(()=>{window.__clips=[];location.hash='#Ps.117.2';});
  await page.getByRole('button',{name:'Select Psalms 117:2',exact:true}).click();
  await page.getByRole('button',{name:'Read from here',exact:true}).click();
  await page.waitForFunction(()=>window.__clips.some(c=>c.chapter==='Psalms 118'&&c.verse==='1'), {}, {timeout:60000});
  console.log('Read-from-here, mid-reading restart and chapter rollover passed:',await page.evaluate(()=>window.__clips));
  // Keep real audio going long enough to exercise repeated synthesis/playback.
  await page.waitForFunction(()=>window.__clips.length>=12, {}, {timeout:180000});
  // Finishing a chapter can earn a badge; dismiss that informational notice so
  // it cannot mask a narration error underneath it.
  const dismiss = page.getByRole('button',{name:'Dismiss message',exact:true});
  if(await dismiss.count()) await dismiss.click();
  assert.deepEqual(await page.locator('.workspace-notice').allTextContents(),[]);
  console.log('12 consecutive real voice clips completed/started without timeout.');
  await page.waitForFunction(()=>window.__narration.currentTime>0&&!window.__narration.paused);
  await page.evaluate(()=>window.__narration.pause());
  await page.waitForFunction(()=>!window.__narration.paused, {}, {timeout:22000});
  console.log('Unexpected browser pause recovered automatically.');
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'Select Psalms 118:16',exact:true}).click();
  await page.getByRole('button',{name:'Read from here',exact:true}).click();
  await page.waitForFunction(()=>window.__clips.at(-1)?.verse==='16', {}, {timeout:60000});
  await page.waitForFunction(()=>window.__narration.currentTime>0&&!window.__narration.paused);
  await page.getByRole('button',{name:'Stop',exact:true}).click();
  assert.deepEqual(errors,[]);
  console.log('Mobile verse action passed; no uncaught page errors.');
} finally {
  await browser.close();
}
