// A stuck clip or a slow voice should be tried once more before the chapter
// waits on Resume. Autoplay blocks need a tap, so they are not retried.
const RETRYABLE = new Set([
  'speechStalled',
  'speechCouldNotPlay',
  'speechPlaybackInterrupted',
  'speechVoiceTimeout',
  'speechVoiceStopped',
  'speechVoiceEmpty',
  'speechVoiceUnreadable',
]);

export function speechErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object' || !('code' in error)) return undefined;
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : undefined;
}

export function shouldRetryVerse(error: unknown, attempts: number): boolean {
  return attempts < 1 && RETRYABLE.has(speechErrorCode(error) ?? '');
}
