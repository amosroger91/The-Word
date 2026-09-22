import { useCallback, useEffect, useRef, useState } from 'react';
import { strings } from './i18n';
import type { SpeakOptions, SpeechAdapter } from './platform';

export interface SpeechChunk {
  verse: number;
  text: string;
}

export type SpeechState = 'idle' | 'speaking' | 'paused';

// Owns the verse queue and the play/pause state machine; the adapter only has to speak one chunk.
// onComplete fires when the queue drains on its own (not on stop, pause, or error), which is how
// continuous read-aloud knows a chapter finished and it may advance to the next one.
function isAutoplayBlocked(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; message?: string };
  return err.name === 'NotAllowedError' || /user gesture|didn't interact|notallowed/i.test(err.message ?? '');
}

function isPlayInterrupted(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { name?: string; message?: string };
  return err.name === 'AbortError' || /interrupted by a call to pause/i.test(err.message ?? '');
}

function spokenError(error: unknown, language: SpeakOptions['language']): string {
  const copy = strings[language];
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code?: unknown }).code : undefined;
  switch (code) {
    case 'speechInterrupted': return copy.speechInterrupted;
    case 'speechCouldNotPlay': return copy.speechCouldNotPlay;
    case 'speechPlaybackInterrupted': return copy.speechPlaybackInterrupted;
    case 'speechStalled': return copy.speechStalled;
    case 'speechVoiceTimeout': return copy.speechVoiceTimeout;
    case 'speechVoiceEmpty': return copy.speechVoiceEmpty;
    case 'speechVoiceStopped': return copy.speechVoiceStopped;
    case 'speechVoiceUnreadable': return copy.speechVoiceUnreadable;
    case 'speechVoiceStart': return copy.speechVoiceStart;
    case 'speechFailed': return copy.speechFailed;
    case 'speechDeviceFailed': return copy.speechDeviceFailed;
    default:
      if (isPlayInterrupted(error)) return copy.speechInterrupted;
      if (error instanceof Error && error.message) return error.message;
      return copy.speechFailed;
  }
}

export function useSpeech(adapter: SpeechAdapter, options: SpeakOptions, onComplete?: () => void) {
  const [state, setState] = useState<SpeechState>('idle');
  const [speakingVerse, setSpeakingVerse] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  // Natural completion must not be confused with an explicit group Stop.
  const [finished, setFinished] = useState(false);
  const [session, setSession] = useState(0);
  const stateRef = useRef<SpeechState>('idle');
  const requestRef = useRef(0);
  const queueRef = useRef<SpeechChunk[]>([]);
  const indexRef = useRef(0);
  const optionsRef = useRef(options);
  // Held in a ref so run() always calls the latest callback without being re-created.
  const onCompleteRef = useRef(onComplete);
  useEffect(() => { onCompleteRef.current = onComplete; });

  useEffect(() => {
    optionsRef.current = options;
    adapter.setRate(options.rate);
    adapter.setVolume(options.volume);
  }, [adapter, options.voice, options.rate, options.volume, options.language]);

  useEffect(() => () => {
    requestRef.current += 1;
    adapter.stop();
    adapter.dispose();
  }, [adapter]);

  const run = useCallback(async (requestId: number) => {
    try {
      while (indexRef.current < queueRef.current.length) {
        if (requestId !== requestRef.current) return;
        const chunk = queueRef.current[indexRef.current];
        setSpeakingVerse(chunk.verse);
        const outcome = await adapter.speak(chunk.text, optionsRef.current);
        if (requestId !== requestRef.current) return;
        // A stopped chunk means pause-by-restart or stop; the queue position is left untouched.
        if (outcome === 'stopped') {
          if (stateRef.current === 'speaking') {
            stateRef.current = 'paused';
            setState('paused');
            setError(strings[optionsRef.current.language].speechInterrupted);
          }
          return;
        }
        indexRef.current += 1;
        if (stateRef.current === 'paused') return;
      }
      setSpeakingVerse(null);
      setFinished(true);
      stateRef.current = 'idle';
      setState('idle');
      onCompleteRef.current?.();
    } catch (e) {
      if (requestId !== requestRef.current) return;
      // Autoplay blocks are a UX gate, not a speech failure — the party UI
      // re-shows "tap to read along" instead of an error banner.
      if (isAutoplayBlocked(e)) {
        setAutoplayBlocked(true);
        setError('');
        stateRef.current = 'paused';
        setState('paused');
        return;
      }
      // pause() raced the gesture play() and the adapter's retries were used up.
      // Leave this verse paused so Resume retries it, instead of advancing the chapter.
      if (isPlayInterrupted(e)) {
        setError(strings[optionsRef.current.language].speechInterrupted);
        stateRef.current = 'paused';
        setState('paused');
        return;
      }
      setError(spokenError(e, optionsRef.current.language));
      stateRef.current = 'paused';
      setState('paused');
    }
  }, [adapter]);

  const speak = useCallback((chunks: SpeechChunk[]) => {
    if (!chunks.length) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    // Keep a silent unlock that already started in this click. Pausing it here
    // is what makes Chrome Android reject the gesture play().
    adapter.stop({ preserveUnlock: true });
    adapter.unlock?.();
    queueRef.current = chunks;
    indexRef.current = 0;
    setFinished(false);
    setSession(requestId);
    setError('');
    setAutoplayBlocked(false);
    stateRef.current = 'speaking';
    setState('speaking');
    void run(requestId);
  }, [adapter, run]);

  const pause = useCallback(() => {
    stateRef.current = 'paused';
    if (!adapter.pause()) { requestRef.current += 1; adapter.stop(); }
    setState('paused');
  }, [adapter]);

  const resume = useCallback(() => {
    if (stateRef.current !== 'paused') return;
    stateRef.current = 'speaking';
    setError('');
    setAutoplayBlocked(false);
    setState('speaking');
    adapter.unlock?.();
    if (adapter.resume()) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    void run(requestId);
  }, [adapter, run]);

  const stop = useCallback(() => {
    requestRef.current += 1;
    adapter.stop();
    queueRef.current = [];
    indexRef.current = 0;
    setFinished(false);
    setSpeakingVerse(null);
    setError('');
    setAutoplayBlocked(false);
    stateRef.current = 'idle';
    setState('idle');
  }, [adapter]);

  return { state, speakingVerse, finished, session, error, setError, autoplayBlocked, speak, pause, resume, stop };
}
