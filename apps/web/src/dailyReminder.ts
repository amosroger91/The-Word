import { useCallback, useEffect, useRef, useState } from 'react';
import { dayKey } from '@the-word/core';

// A daily nudge to open Scripture, delivered as a browser notification even when
// the page is closed. There is no server and no account, so the reminder is
// scheduled by the browser itself. Three delivery paths, best first:
//
//   1. Scheduled notifications (TimestampTrigger) — the browser fires the alarm
//      at the exact minute with nothing running. Chromium only.
//   2. Periodic background sync — the browser wakes reminder-sw.js every few
//      hours and it shows the reminder if today's time has passed. Granted to
//      installed apps, and fired at the browser's discretion, so it can be late.
//   3. The open page — an in-tab timer at the chosen minute, plus a catch-up when
//      the app is reopened later the same morning.
//
// Path 1 supersedes the others; 2 and 3 work together and share the once-a-day
// guard held by the worker.

const KEY = 'word.dailyReminder';
const SYNC_TAG = 'daily-verse-reminder';
// Days of exact alarms queued ahead. Re-armed on every visit, so this only has to
// cover a reader who does not open the app for a while.
const AHEAD_DAYS = 14;
const PREFIX = 'word-reminder';

export interface ReminderSettings {
  enabled: boolean;
  /** 24-hour "HH:MM" in the reader's own timezone. */
  time: string;
}

export interface ReminderText {
  title: string;
  body: string;
}

export type ReminderPermission = NotificationPermission | 'unsupported';

export const defaultReminderTime = '07:00';

function isSupported() {
  return typeof window !== 'undefined'
    && 'Notification' in window
    && 'serviceWorker' in navigator
    && window.isSecureContext;
}

// Present only where the browser can fire a notification at a set time with no
// page and no wake-up heuristics in the way.
type TriggerCtor = new (timestamp: number) => unknown;
function timestampTrigger(): TriggerCtor | null {
  const ctor = (window as unknown as { TimestampTrigger?: TriggerCtor }).TimestampTrigger;
  if (typeof ctor !== 'function') return null;
  return 'showTrigger' in Notification.prototype ? ctor : null;
}

function readSettings(): ReminderSettings {
  const fallback: ReminderSettings = { enabled: false, time: defaultReminderTime };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const data = JSON.parse(raw) as Partial<ReminderSettings>;
    return {
      enabled: data.enabled === true,
      time: typeof data.time === 'string' && /^\d{1,2}:\d{2}$/.test(data.time) ? data.time : defaultReminderTime,
    };
  } catch {
    return fallback;
  }
}

function writeSettings(settings: ReminderSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(settings));
  } catch {
    // Private-mode browsers reject writes; the choice lasts for this visit only.
  }
}

/** The next moment the given "HH:MM" comes around, today or tomorrow. */
export function nextReminderAt(time: string, from = new Date()): Date {
  const [hours, minutes] = time.split(':').map(Number);
  const at = new Date(from);
  at.setHours(hours, minutes, 0, 0);
  if (at.getTime() <= from.getTime()) at.setDate(at.getDate() + 1);
  return at;
}

// The page the notification opens: this app, at the landing view where the verse
// of the day is waiting.
function appUrl() {
  return new URL(import.meta.env.BASE_URL, window.location.origin).href;
}

let pending: Promise<ServiceWorkerRegistration> | null = null;

// coi-serviceworker owns the "/" scope and the page's cross-origin isolation
// depends on keeping it, so the reminder worker takes a scope of its own. It
// controls no pages — showNotification and periodicsync do not need it to.
function reminderWorker() {
  const base = import.meta.env.BASE_URL;
  pending ??= navigator.serviceWorker
    .register(`${base}reminder-sw.js`, { scope: `${base}reminder/` })
    .then(waitForActive)
    .catch((error) => { pending = null; throw error; });
  return pending;
}

function waitForActive(registration: ServiceWorkerRegistration) {
  if (registration.active) return registration;
  const worker = registration.waiting ?? registration.installing;
  if (!worker) return registration;
  return new Promise<ServiceWorkerRegistration>((resolve) => {
    const onState = () => {
      if (worker.state !== 'activated') return;
      worker.removeEventListener('statechange', onState);
      resolve(registration);
    };
    worker.addEventListener('statechange', onState);
  });
}

// Both the queued alarms and any reminder still on screen, so re-arming after a
// time change never leaves yesterday's schedule behind.
async function clearScheduled(registration: ServiceWorkerRegistration) {
  try {
    const options = { includeTriggered: true } as GetNotificationOptions;
    const shown = await registration.getNotifications(options);
    shown.forEach((notification) => { if (notification.tag?.startsWith(PREFIX)) notification.close(); });
  } catch {
    // Nothing to clear.
  }
}

async function schedule(registration: ServiceWorkerRegistration, Trigger: TriggerCtor, settings: ReminderSettings, text: ReminderText) {
  const first = nextReminderAt(settings.time);
  for (let day = 0; day < AHEAD_DAYS; day += 1) {
    const at = new Date(first);
    at.setDate(first.getDate() + day);
    await registration.showNotification(text.title, {
      body: text.body,
      tag: `${PREFIX}-${dayKey(at)}`,
      data: { url: appUrl() },
      showTrigger: new Trigger(at.getTime()),
    } as NotificationOptions);
  }
}

interface PeriodicSyncManager {
  register(tag: string, options?: { minInterval?: number }): Promise<void>;
  unregister(tag: string): Promise<void>;
}

function periodicSync(registration: ServiceWorkerRegistration) {
  return (registration as unknown as { periodicSync?: PeriodicSyncManager }).periodicSync ?? null;
}

async function startPeriodicSync(registration: ServiceWorkerRegistration) {
  const sync = periodicSync(registration);
  if (!sync) return;
  try {
    // Granted to installed apps the browser considers well used; asking anyway is
    // harmless, and the in-page paths still cover a reader who never installs.
    const status = await navigator.permissions.query({ name: 'periodic-background-sync' as PermissionName });
    if (status.state !== 'granted') return;
    await sync.register(SYNC_TAG, { minInterval: 6 * 60 * 60 * 1000 });
  } catch {
    // Unsupported or declined — path 3 remains.
  }
}

async function stopPeriodicSync(registration: ServiceWorkerRegistration) {
  try {
    await periodicSync(registration)?.unregister(SYNC_TAG);
  } catch {
    // Never registered.
  }
}

// Push the reader's choice into the worker and rebuild whatever schedule this
// browser supports. Safe to call repeatedly; every call starts from a clean slate.
async function arm(settings: ReminderSettings, text: ReminderText) {
  const registration = await reminderWorker();
  const active = registration.active;
  const on = settings.enabled && Notification.permission === 'granted';

  active?.postMessage({
    type: 'settings',
    config: { enabled: on, time: settings.time, title: text.title, body: text.body, url: appUrl() },
  });

  await clearScheduled(registration);
  if (!on) {
    await stopPeriodicSync(registration);
    return;
  }

  const Trigger = timestampTrigger();
  if (Trigger) {
    await stopPeriodicSync(registration);
    await schedule(registration, Trigger, settings, text);
    return;
  }

  await startPeriodicSync(registration);
  // A reminder whose time passed while the app was closed still lands, as long as
  // the reader opens the app the same morning.
  active?.postMessage({ type: 'check' });
}

export type ReminderTestState = 'idle' | 'sending' | 'sent' | 'blocked' | 'failed';

// A notification the browser accepted but the system then swallowed never turns
// up in the registration's own list. That is the signature of notifications being
// switched off for the browser at the OS level (Windows Settings › System ›
// Notifications, or a do-not-disturb mode): showNotification resolves, and
// nothing reaches the desktop. Poll briefly, because appearing is not instant.
async function reachedTheDesktop(registration: ServiceWorkerRegistration, tag: string) {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 300));
    const shown = await registration.getNotifications({ tag });
    if (shown.length) return true;
  }
  return false;
}

export interface DailyReminder {
  settings: ReminderSettings;
  permission: ReminderPermission;
  supported: boolean;
  /** What became of the last test notification the reader asked for. */
  testState: ReminderTestState;
  /** True when this browser fires the reminder with nothing of ours running. */
  exact: boolean;
  nextAt: Date | null;
  setEnabled: (enabled: boolean) => void;
  setTime: (time: string) => void;
  sendTest: () => void;
}

export function useDailyReminder(text: ReminderText): DailyReminder {
  const supported = isSupported();
  const [settings, setSettings] = useState(readSettings);
  const [permission, setPermission] = useState<ReminderPermission>(() => (supported ? Notification.permission : 'unsupported'));
  const [testState, setTestState] = useState<ReminderTestState>('idle');
  // The reminder is armed from an effect, but the notification wording follows the
  // interface language; a ref keeps the latest text without re-arming on identity.
  const textRef = useRef(text);
  textRef.current = text;

  const { enabled, time } = settings;
  const { title, body } = text;
  const on = supported && enabled && permission === 'granted';

  useEffect(() => { writeSettings(settings); }, [settings]);

  useEffect(() => {
    if (!supported) return;
    void arm({ enabled, time }, { title, body }).catch(() => {
      // A blocked worker registration only costs the background paths.
    });
  }, [supported, enabled, time, title, body, permission]);

  // Path 3: while a tab is open, fire at the minute itself. Browsers that support
  // scheduled notifications have already queued this one — asking the worker to
  // check anyway is free, because it shows a reminder at most once a day.
  useEffect(() => {
    if (!on) return;
    let timer = 0;
    const ping = () => {
      void reminderWorker().then((registration) => registration.active?.postMessage({ type: 'check' }));
    };
    const queue = () => {
      window.clearTimeout(timer);
      // Always under a day away, so this stays well inside the timeout ceiling.
      timer = window.setTimeout(() => { ping(); queue(); }, Math.max(1000, nextReminderAt(time).getTime() - Date.now()));
    };
    // A sleeping device stalls the timer, and a phone waking at 7:05 should still
    // get the nudge, so re-check (and re-queue) whenever the tab comes back.
    const onVisible = () => { if (document.visibilityState === 'visible') { ping(); queue(); } };
    queue();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [on, time]);

  const setEnabled = useCallback((next: boolean) => {
    if (!next) {
      setSettings((current) => ({ ...current, enabled: false }));
      return;
    }
    if (!supported) return;
    // Turning the reminder on is the gesture browsers require before asking.
    const decide = Notification.permission === 'default'
      ? Notification.requestPermission()
      : Promise.resolve(Notification.permission);
    void decide.then((state) => {
      setPermission(state);
      setSettings((current) => ({ ...current, enabled: state === 'granted' }));
    });
  }, [supported]);

  const setTime = useCallback((next: string) => {
    if (!/^\d{1,2}:\d{2}$/.test(next)) return;
    setSettings((current) => ({ ...current, time: next }));
  }, []);

  const sendTest = useCallback(() => {
    if (!supported || Notification.permission !== 'granted') return;
    setTestState('sending');
    // A fresh tag every time. Reusing one replaces the existing notification
    // instead of posting a new one, and a replacement does not raise a second
    // toast — so pressing twice looked like nothing happened at all.
    const tag = `${PREFIX}-test-${Date.now()}`;
    void (async () => {
      try {
        const registration = await reminderWorker();
        await registration.showNotification(textRef.current.title, {
          body: textRef.current.body,
          tag,
          data: { url: appUrl() },
          // Keep it on screen rather than letting it slide straight into the
          // notification centre, which is the whole point of a test.
          requireInteraction: true,
        });
        setTestState(await reachedTheDesktop(registration, tag) ? 'sent' : 'blocked');
      } catch {
        setTestState('failed');
      }
    })();
  }, [supported]);

  return {
    settings,
    permission,
    supported,
    testState,
    exact: supported && timestampTrigger() !== null,
    nextAt: on ? nextReminderAt(time) : null,
    setEnabled,
    setTime,
    sendTest,
  };
}
