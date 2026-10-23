import './src/platform/installShims';
import { useEffect, useMemo, useState, type ComponentType } from 'react';
import { ActivityIndicator, Appearance, View } from 'react-native';
import { useFonts } from 'expo-font';
import { useWordApp, type KeyValueStore, type Platform, type VoiceOption } from '@the-word/core';
import { createNativeSpeech, loadStorage, loadVoices, nativeClipboard, voicesForLanguage } from './src/platform';
import { Landing } from './src/Landing';
import { Reader } from './src/Reader';

type SessionProps = {
  storage: KeyValueStore;
  voices: VoiceOption[];
  sessionKey: number;
  onReload: () => void;
};

export default function App() {
  const [storage, setStorage] = useState<KeyValueStore | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voicesReady, setVoicesReady] = useState(false);
  const [session, setSession] = useState<ComponentType<SessionProps> | null>(null);
  const [sessionReady, setSessionReady] = useState(false);
  const [sessionKey, setSessionKey] = useState(0);
  const [fontsLoaded] = useFonts({
    Literata: require('./assets/fonts/Literata.ttf'),
    Lexend: require('./assets/fonts/Lexend.ttf'),
    AtkinsonHyperlegible: require('./assets/fonts/AtkinsonHyperlegible.ttf'),
    OpenDyslexic: require('./assets/fonts/OpenDyslexic.otf'),
  });

  useEffect(() => {
    void loadStorage().then(setStorage);
    void loadVoices().then((list) => {
      setVoices(list);
      setVoicesReady(true);
    }).catch(() => setVoicesReady(true));
    let cancelled = false;
    void (async () => {
      try {
        const { hydrateStorage } = await import('./src/platform/hydrateStorage');
        await hydrateStorage();
        const { installPlanBundle } = await import('./src/platform/planBundle');
        installPlanBundle();
        const { installWebRTC } = await import('./src/platform/webrtc');
        installWebRTC();
        const loaded = await import('./src/features/WordSession');
        if (!cancelled) setSession(() => loaded.WordSession);
      } catch {
        // The reader still opens when a study module cannot load.
      } finally {
        if (!cancelled) setSessionReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (!storage || !fontsLoaded || !voicesReady || !sessionReady) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f4ee' }}><ActivityIndicator color="#947849" /></View>;
  }

  if (session) {
    const Session = session;
    return <Session storage={storage} voices={voices} sessionKey={sessionKey} onReload={() => setSessionKey((value) => value + 1)} />;
  }

  return <OfflineWord storage={storage} voices={voices} />;
}

function OfflineWord({ storage, voices }: { storage: KeyValueStore; voices: VoiceOption[] }) {
  const speech = useMemo(() => createNativeSpeech(), []);
  const platform = useMemo<Platform>(() => ({
    storage,
    speech,
    clipboard: nativeClipboard,
    voices: voices.length ? voicesForLanguage(voices) : undefined,
  }), [storage, speech, voices]);
  const app = useWordApp(platform, Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
  const [view, setView] = useState<'home' | 'reader'>('home');
  if (view === 'home') {
    return <Landing app={app} onEnterReader={() => { app.markProgress(); setView('reader'); }} />;
  }
  return <Reader app={app} onHome={() => setView('home')} />;
}
