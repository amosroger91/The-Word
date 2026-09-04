import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeakOptions, SpeechAdapter } from './platform';

export interface SpeechChunk {
  verse: number;
  text: string;
}

export type SpeechState = 'idle' | 'speaking' | 'paused';

// Owns the verse queue and the play/pause state machine; the adapter only has to speak one chunk.
// onComplete fires when the queue drains on its own (not on stop, pause, or error), which is how
// continuous read-aloud knows a chapter finished and it may advance to the next one.
export function useSpeech(adapter: SpeechAdapter, options: SpeakOptions, onComplete?: () => void) {
  const [state, setState] = useState<SpeechState>('idle');
  const [speakingVerse, setSpeakingVerse] = useState<number | null>(null);
  const [error, setError] = useState('');
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
        if (outcome === 'stopped') return;
        indexRef.current += 1;
      }
      setSpeakingVerse(null);
      setState('idle');
      onCompleteRef.current?.();
    } catch (e) {
      if (requestId !== requestRef.current) return;
      setError(e instanceof Error ? e.message : 'Speech failed.');
      setSpeakingVerse(null);
      setState('idle');
    }
  }, [adapter]);

  const speak = useCallback((chunks: SpeechChunk[]) => {
    if (!chunks.length) return;
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    adapter.stop();
    queueRef.current = chunks;
    indexRef.current = 0;
    setError('');
    setState('speaking');
    void run(requestId);
  }, [adapter, run]);

  const pause = useCallback(() => {
    if (!adapter.pause()) adapter.stop();
    setState('paused');
  }, [adapter]);

  const resume = useCallback(() => {
    setState('speaking');
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
    setSpeakingVerse(null);
    setState('idle');
  }, [adapter]);

  return { state, speakingVerse, error, setError, speak, pause, resume, stop };
}
