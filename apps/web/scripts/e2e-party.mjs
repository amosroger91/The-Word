// Two-tab Read Party smoke test: auto-arm on join + verse-by-verse follow.
import { chromium } from 'playwright';

function readerUrl() {
  const raw = process.env.APP_URL || 'http://localhost:5173/';
  const base = raw.split('#')[0].replace(/\/?$/, '/');
  return `${base}#read`;
}
const URL = readerUrl();
const errors = [];

function log(pageName, msg) {
  console.log(`[${pageName}] ${msg}`);
}

async function waitReady(page, name) {
  await page.goto(URL, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.verse', { timeout: 30000 });
  log(name, `loaded ${await page.locator('.verse').count()} verses`);
}

async function openParty(page) {
  await page.locator('.party-toggle').click();
  await page.waitForSelector('.party-panel');
}

async function dump(page, name) {
  const info = await page.evaluate(() => ({
    title: document.querySelector('.topbar-reference')?.textContent?.trim(),
    role: document.querySelector('.meeting-dock .party-role, .party-role')?.textContent?.trim() || null,
    status: document.querySelector('.party-conn')?.textContent?.trim() || null,
    arm: Boolean(document.querySelector('.party-arm')),
    speaking: document.querySelector('.verse.speaking')?.querySelector('sup')?.textContent || null,
    following: document.querySelector('.verse.following')?.querySelector('sup')?.textContent || null,
    members: [...document.querySelectorAll('.party-member')].map((el) => el.textContent.trim()),
    speechError: document.querySelector('.speech-error')?.textContent || null,
    meeting: Boolean(document.querySelector('.app-shell.meeting')),
    tiles: document.querySelectorAll('.meeting-tile').length,
    dock: Boolean(document.querySelector('.meeting-dock')),
  }));
  log(name, JSON.stringify(info));
  return info;
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: [
    '--autoplay-policy=user-gesture-required',
    '--use-fake-ui-for-media-stream',
    '--use-fake-device-for-media-stream',
  ],
});
const hostCtx = await browser.newContext();
const partCtx = await browser.newContext();
const host = await hostCtx.newPage();
const part = await partCtx.newPage();

host.on('pageerror', (e) => errors.push(`host pageerror: ${e.message}`));
part.on('pageerror', (e) => errors.push(`part pageerror: ${e.message}`));

try {
  await waitReady(host, 'host');
  await waitReady(part, 'part');

  await openParty(host);
  await host.locator('.party-primary').click();
  await host.waitForSelector('.meeting-dock .party-code', { timeout: 20000 });
  await host.waitForFunction(() => document.querySelector('.meeting-dock .party-role')?.textContent === 'You are the host', null, { timeout: 20000 });
  const code = (await host.locator('.meeting-dock .party-code').textContent()).trim();
  log('host', `party code ${code}`);
  await dump(host, 'host');

  await openParty(part);
  await part.locator('.party-join input').fill(code);
  await part.locator('.party-join button[type="submit"]').click();
  await part.waitForSelector('.party-live', { timeout: 20000 });
  await part.waitForFunction(() => (document.querySelectorAll('.party-member').length >= 2), null, { timeout: 20000 });
  log('part', 'joined');

  // Auto-arm: the tap-to-read-along button must not appear after a successful join.
  await part.waitForTimeout(1500);
  const armedAtJoin = await dump(part, 'part');
  if (armedAtJoin.arm) {
    throw new Error('FAIL: arm button shown after join — auto-arm did not take');
  }
  log('part', 'no arm button after join (auto-arm ok)');
  if (!armedAtJoin.meeting || !armedAtJoin.dock || armedAtJoin.tiles < 2) {
    throw new Error(`FAIL: meeting layout missing after join (meeting=${armedAtJoin.meeting} dock=${armedAtJoin.dock} tiles=${armedAtJoin.tiles})`);
  }
  log('part', `meeting layout up (${armedAtJoin.tiles} tiles)`);

  // Close the overlay so the host can press Read aloud.
  await host.locator('.party-panel .panel-header button').click();
  await host.waitForSelector('.party-panel', { state: 'hidden' });

  // Host starts reading. Participant should follow the verse without another tap.
  await host.locator('.control-row button[aria-label="Listen"]').click({ force: true });
  log('host', 'clicked Listen');

  await host.waitForSelector('.verse.speaking', { timeout: 90000 });
  const hostVerse = await host.locator('.verse.speaking sup').first().textContent();
  log('host', `speaking verse ${hostVerse}`);

  // Participant tracks the host verse either by speaking it or by the following highlight.
  await part.waitForFunction(() => {
    const speaking = document.querySelector('.verse.speaking sup')?.textContent;
    const following = document.querySelector('.verse.following sup')?.textContent;
    return Boolean(speaking || following);
  }, null, { timeout: 90000 });

  const after = await dump(part, 'part');
  const tracked = after.speaking || after.following;
  if (!tracked) throw new Error('FAIL: participant did not track host verse');
  if (after.arm) throw new Error('FAIL: arm button appeared after host started reading');
  log('part', `tracking verse ${tracked} (speaking=${after.speaking} following=${after.following})`);

  // If local audio started, speaking class is set; that's the full auto-arm success.
  if (after.speaking) {
    log('part', 'PASS: participant auto-played the host verse (no extra tap)');
  } else {
    log('part', 'WARN: visual follow worked but local audio did not start (speaking class missing)');
    throw new Error('FAIL: participant highlighted the verse but did not start speaking — autoplay still gated');
  }

  // Verse-by-verse: wait until the host has moved past v1, then the participant
  // must be on that same verse (not still reading the chapter from the start).
  await host.waitForFunction(() => {
    const n = Number(document.querySelector('.verse.speaking sup')?.textContent);
    return Number.isFinite(n) && n >= 2;
  }, null, { timeout: 120000 });
  const hostV2 = await host.locator('.verse.speaking sup').first().textContent();
  log('host', `advanced to verse ${hostV2}`);
  await part.waitForFunction((expected) => {
    const speaking = document.querySelector('.verse.speaking sup')?.textContent;
    const following = document.querySelector('.verse.following sup')?.textContent;
    return speaking === expected || following === expected;
  }, hostV2, { timeout: 30000 });
  const after2 = await dump(part, 'part');
  log('part', `synced to host verse ${hostV2} (speaking=${after2.speaking} following=${after2.following})`);
  if (after2.arm) throw new Error('FAIL: arm button appeared mid-reading');
  if (after2.speechError) throw new Error(`FAIL: participant speech error on verse ${hostV2}: ${after2.speechError}`);
  if (after2.speaking !== hostV2) throw new Error(`FAIL: participant did not speak host verse ${hostV2} (speaking=${after2.speaking})`);

  await host.locator('.meeting-dock button[aria-label="Microphone"]').click();
  await part.locator('.meeting-dock button[aria-label="Microphone"]').click();
  await host.waitForSelector('.meeting-dock .meeting-av.on', { timeout: 10000 });
  await part.waitForSelector('.meeting-dock .meeting-av.on', { timeout: 10000 });
  log('host', 'mic on');
  log('part', 'mic on');

  // Live mics must not silence read-aloud. Read-aloud is never streamed, so the
  // guest has to speak the verse with its own Piper — a highlight alone means
  // the room is watching in silence.
  await host.waitForTimeout(2500);
  const hostLive = await dump(host, 'host-live');
  if (!hostLive.speaking) throw new Error('FAIL: host read-aloud stopped when the mics went live');
  const partLive = await dump(part, 'part-live');
  if (!partLive.speaking) throw new Error(`FAIL: guest stopped reading aloud on a live floor (following=${partLive.following})`);
  log('both', `both read aloud on a live floor (host=${hostLive.speaking} part=${partLive.speaking})`);

  // Remote voice must play through exactly one element. An unmuted <video>
  // alongside the <audio> plays every remote peer twice, slightly out of step.
  const doubled = await part.evaluate(() => [...document.querySelectorAll('.meeting-tile')]
    .filter((tile) => !tile.classList.contains('self'))
    .map((tile) => ({
      video: tile.querySelector('video') ? !tile.querySelector('video').muted : false,
      audio: Boolean(tile.querySelector('audio')?.srcObject),
    }))
    .filter((t) => t.video && t.audio).length);
  if (doubled) throw new Error(`FAIL: ${doubled} remote tile(s) play the same stream through both <video> and <audio>`);
  log('part', 'remote voice plays through one element only');

  // And Listen must still start from scratch while the floor is already live —
  // the case that used to stop itself the instant it began.
  await host.locator('.control-row button[aria-label="Stop"]').click({ force: true });
  await host.waitForFunction(() => !document.querySelector('.verse.speaking'), null, { timeout: 20000 });
  await host.locator('.control-row button[aria-label="Listen"]').click({ force: true });
  await host.waitForSelector('.verse.speaking', { timeout: 90000 });
  const restarted = await host.locator('.verse.speaking sup').first().textContent();
  await part.waitForFunction((expected) => document.querySelector('.verse.speaking sup')?.textContent === expected,
    restarted, { timeout: 60000 });
  log('both', `Listen started on a live floor and the guest read verse ${restarted} aloud`);

  if (errors.length) {
    console.log('page errors:', errors);
  }
  console.log('PASS');
  await browser.close();
  process.exit(0);
} catch (e) {
  console.error(e);
  try { await dump(host, 'host-final'); } catch { /* ignore */ }
  try { await dump(part, 'part-final'); } catch { /* ignore */ }
  if (errors.length) console.log('page errors:', errors);
  await host.screenshot({ path: 'e2e-host.png', fullPage: true }).catch(() => {});
  await part.screenshot({ path: 'e2e-part.png', fullPage: true }).catch(() => {});
  await browser.close();
  process.exit(1);
}
