// Local calendar day. Streaks, reminders, and "already read today" all use this
// same key so midnight in the reader's timezone is the only boundary.
export function dayKey(date: Date = new Date()): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function shiftDay(key: string, delta: number): string {
  const [year, month, day] = key.split('-').map(Number);
  return dayKey(new Date(year, month - 1, day + delta));
}

// Counts back from today if today is in the set, otherwise from yesterday —
// a streak should not break at 00:01 before the day's reading.
export function currentStreak(days: Iterable<string>, today: string): number {
  const set = new Set(days);
  let cursor = set.has(today) ? today : shiftDay(today, -1);
  if (!set.has(cursor)) return 0;
  let count = 0;
  while (set.has(cursor)) {
    count += 1;
    cursor = shiftDay(cursor, -1);
  }
  return count;
}
