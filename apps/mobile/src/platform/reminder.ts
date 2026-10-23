// The web reminder uses a service worker. Android uses a local notification
// at the same time of day, and the same storage record, so a backup of the
// key still describes the choice.

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
    const time = typeof parsed.time === 'string' && /^\d{2}:\d{2}$/.test(parsed.time) ? parsed.time : '07:00';
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
  writeReminder(settings);
  const Notifications = await notifications();
  if (!Notifications) return settings.enabled ? 'unsupported' : 'ok';
  await prepare(Notifications);
  await Notifications.cancelScheduledNotificationAsync(NOTIFICATION_ID).catch(() => undefined);
  if (!settings.enabled) return 'ok';
  const current = await Notifications.getPermissionsAsync();
  let granted = current.granted;
  if (!granted) {
    const asked = await Notifications.requestPermissionsAsync();
    granted = asked.granted;
  }
  if (!granted) {
    writeReminder({ ...settings, enabled: false });
    return 'blocked';
  }
  const [hour, minute] = settings.time.split(':').map((part) => Number(part));
  await Notifications.scheduleNotificationAsync({
    identifier: NOTIFICATION_ID,
    content: { title, body },
    trigger: { hour, minute, repeats: true, channelId: CHANNEL },
  });
  return 'ok';
}

export async function sendTestReminder(title: string, body: string): Promise<'ok' | 'blocked' | 'unsupported'> {
  const Notifications = await notifications();
  if (!Notifications) return 'unsupported';
  await prepare(Notifications);
  const current = await Notifications.getPermissionsAsync();
  if (!current.granted) return 'blocked';
  await Notifications.scheduleNotificationAsync({
    content: { title, body },
    trigger: null,
  });
  return 'ok';
}

export async function ensureReminderScheduled(title: string, body: string) {
  const settings = readReminder();
  if (!settings.enabled) return;
  await applyReminder(settings, title, body);
}
