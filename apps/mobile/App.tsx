import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Appearance, View } from 'react-native';
import { useFonts } from 'expo-font';
import { useWordApp, type KeyValueStore, type Platform, type VoiceOption } from '@the-word/core';
import { createNativeSpeech, loadStorage, loadVoices, nativeClipboard, voicesForLanguage } from './src/platform';
import { Reader } from './src/Reader';

export default function App() {
  const [storage, setStorage] = useState<KeyValueStore | null>(null);
  const [voices, setVoices] = useState<VoiceOption[]>([]);
  const [voicesReady, setVoicesReady] = useState(false);
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
  }, []);

  if (!storage || !fontsLoaded || !voicesReady) {
    return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f7f4ee' }}><ActivityIndicator color="#947849" /></View>;
  }

  return <Word storage={storage} voices={voices} />;
}

function Word({ storage, voices }: { storage: KeyValueStore; voices: VoiceOption[] }) {
  const speech = useMemo(() => createNativeSpeech(), []);
  const platform = useMemo<Platform>(() => ({
    storage,
    speech,
    clipboard: nativeClipboard,
    voices: voices.length ? voicesForLanguage(voices) : undefined,
  }), [storage, speech, voices]);
  const app = useWordApp(platform, Appearance.getColorScheme() === 'dark' ? 'dark' : 'light');
  return <Reader app={app} />;
}
