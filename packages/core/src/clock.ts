// A reader-typed time of day. One digit hours are accepted; storage uses HH:MM.
export function validClockTime(value: string): boolean {
  return normalizeClockTime(value) !== null;
}

export function normalizeClockTime(value: string): string | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${match[2]}`;
}
