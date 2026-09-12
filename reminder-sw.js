// The daily reading reminder, handed to the browser so it can arrive when the
// page (or the whole browser) is closed.
//
// This worker is deliberately registered under a narrow scope — "<base>reminder/"
// — so it never replaces the coi-serviceworker registration at "/", which the
// page needs for cross-origin isolation (Piper read-aloud). It therefore controls
// no pages: it exists so its registration can show notifications, and so the
// browser has something to wake for a periodicsync.
//
// Settings live in IndexedDB because a worker woken hours later has no memory and
// cannot read localStorage. The page owns the reader-facing copy and pushes it
// here with a 'settings' message; this worker owns lastShown, the once-a-day guard.

const DB_NAME = 'word-reminder';
const STORE = 'config';
const KEY = 'settings';
const SYNC_TAG = 'daily-verse-reminder';
// How late a missed reminder may still arrive. A browser grants background
// wake-ups when it feels like it, so a 7:00 reminder landing at 11:00 is still a
// useful nudge — one landing at midnight is just noise.
const CATCH_UP_MS = 6 * 60 * 60 * 1000;

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readConfig() {
  try {
    const db = await openDb();
    return await new Promise((resolve, reject) => {
      const request = db.transaction(STORE, 'readonly').objectStore(STORE).get(KEY);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return null;
  }
}

async function writeConfig(config) {
  try {
    const db = await openDb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(config, KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Private-mode browsers reject writes; the reminder simply will not fire
    // in the background, and the open page still nudges at the chosen time.
  }
}

// Local calendar day. Must match dayKey() in packages/core/src/day.ts.
function dayKey(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function targetOn(date, time) {
  const [hours, minutes] = String(time || '07:00').split(':').map(Number);
  const at = new Date(date);
  at.setHours(Number.isFinite(hours) ? hours : 7, Number.isFinite(minutes) ? minutes : 0, 0, 0);
  return at;
}

async function showReminder(config, today) {
  // showNotification is what enforces the notification permission here:
  // Notification.permission is a window-only static and reads as undefined in a
  // worker, so checking it would silently swallow every reminder.
  await self.registration.showNotification(config.title, {
    body: config.body,
    tag: `word-reminder-${today}`,
    data: { url: config.url },
    requireInteraction: false,
  });
  await writeConfig({ ...config, lastShown: today });
}

// Fired on a background wake-up, and whenever an open page reaches the chosen
// time or reopens after missing it.
async function maybeNotify() {
  const config = await readConfig();
  if (!config || !config.enabled) return;

  const now = new Date();
  const today = dayKey(now);
  if (config.lastShown === today) return;

  const due = targetOn(now, config.time).getTime();
  const elapsed = now.getTime() - due;
  if (elapsed < 0 || elapsed > CATCH_UP_MS) return;

  await showReminder(config, today);
}

// Work runs one item at a time: the page sends its settings and then asks for a
// check, and a check that overtook the write it depends on would read yesterday's
// time — or nothing at all on the first visit.
let queue = Promise.resolve();
function serial(task) {
  queue = queue.then(task).catch(() => {});
  return queue;
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('periodicsync', (event) => {
  if (event.tag === SYNC_TAG) event.waitUntil(serial(maybeNotify));
});

self.addEventListener('message', (event) => {
  const message = event.data || {};
  if (message.type === 'settings') {
    // Keep lastShown: the page does not track it, and dropping it here would let
    // the same day's reminder fire twice.
    event.waitUntil(serial(async () => {
      const current = await readConfig();
      await writeConfig({ ...message.config, lastShown: current ? current.lastShown : null });
    }));
  } else if (message.type === 'check') {
    event.waitUntil(serial(maybeNotify));
  }
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';
  event.waitUntil((async () => {
    const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = clients.find((client) => client.url.startsWith(url));
    if (open) {
      await open.focus();
      return;
    }
    await self.clients.openWindow(url);
  })());
});
