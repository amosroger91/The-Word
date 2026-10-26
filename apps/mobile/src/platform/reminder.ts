// The web reminder uses a service worker. Android uses a local notification
// at the same time of day, and the same storage record, so a backup of the
// key still describes the choice.
import { normalizeClockTime } from '@the-word/core';

const KEY = 'word.dailyReminder';
const CHANNEL = 'word-daily';
const NOTIFICATION_ID = 'word-daily-reminder';

export interface ReminderSettings {
  enabled: boolean;
  time: string;
}

export function readReminder(): ReminderSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { enabled: false, time: '07:00' };
    const parsed = JSON.parse(raw) as Partial<ReminderSettings>;
    const time = typeof parsed.time === 'string' ? (normalizeClockTime(parsed.time) ?? '07:00') : '07:00';
    return { enabled: Boolean(parsed.enabled), time };
  } catch {
    return { enabled: false, time: '07:00' };
  }
}

export function writeReminder(settings: ReminderSettings) {
  localStorage.setItem(KEY, JSON.stringify(settings));
}

type NotificationsModule = typeof import('expo-notifications');

async function notifications(): Promise<NotificationsModule | null> {
  try {
    return await import('expo-notifications');
  } catch {
    return null;
  }
}

let handlerReady = false;

async function prepare(Notifications: NotificationsModule) {
  if (!handlerReady) {
    handlerReady = true;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
  }
  if (Notifications.AndroidImportance) {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Daily reminder',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function applyReminder(settings: ReminderSettings, title: string, body: string): Promise<'ok' | 'blocked' | 'unsupported'> {
  const time = normalizeClockTime(settings.time);
  if (!time) return 'unsupported';
  const next = { ...settings, time };
  const Notifications = await notifications();
  // Do not store enabled:true until a notification is actually scheduled.
  // The F-Droid build omits expo-notifications; leaving the flag set kept the
  // switch on for an alarm that can never fire.
  if (!Notifications) {
    writeReminder({ ...next, enabled: false });
    return next.enabled ? 'unsupported' : 'ok';
  }
  try {
    await prepare(Notifications);
    await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => undefined);
    if (!next.enabled) {
      writeReminder(next);
      return 'ok';
    }
    const current = await Notifications.getPermissionsAsync();
    let granted = current.granted;
    if (!granted) {
      const asked = await Notifications.requestPermissionsAsync();
      granted = asked.granted;
    }
    if (!granted) {
      writeReminder({ ...next, enabled: false });
      return 'blocked';
    }
    const [hour, minute] = time.split(':').map((part) => Number(part));
    await Notifications.scheduleNotificationAsync({
      identifier: NOTIFICATION_ID,
      content: { title, body },
      trigger: { hour, minute, repeats: true, channelId: CHANNEL },
    });
    writeReminder(next);
    return 'ok';
  } catch {
    writeReminder({ ...next, enabled: false });
    return 'unsupported';
  }
}

export async function sendTestReminder(title: string, body: string): Promise<'ok' | 'blocked' | 'unsupported'> {
  const Notifications = await notifications();
  if (!Notifications) return 'unsupported';
  try {
    await prepare(Notifications);
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted) return 'blocked';
    await Notifications.scheduleNotificationAsync({
      content: { title, body },
      trigger: null,
    });
    return 'ok';
  } catch {
    return 'unsupported';
  }
}

export async function ensureReminderScheduled(title: string, body: string) {
  const settings = readReminder();
  if (!settings.enabled) return;
  await applyReminder(settings, title, body);
}
