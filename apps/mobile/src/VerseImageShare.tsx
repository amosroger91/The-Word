import { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { verseImageHtml, type VerseImageInput } from '@the-word/core';

export interface VerseImageRequest extends VerseImageInput {
  filename: string;
}

interface Props {
  request: VerseImageRequest | null;
  onDone: () => void;
  onError: (message: string) => void;
}

export function VerseImageShare({ request, onDone, onError }: Props) {
  const handled = useRef(false);
  const onDoneRef = useRef(onDone);
  const onErrorRef = useRef(onError);
  onDoneRef.current = onDone;
  onErrorRef.current = onError;

  useEffect(() => {
    handled.current = false;
    if (!request) return;
    const timer = setTimeout(() => {
      if (!handled.current) onErrorRef.current('Timed out while rendering the verse image.');
    }, 20000);
    return () => clearTimeout(timer);
  }, [request]);

  if (!request) return null;

  async function onMessage(event: WebViewMessageEvent) {
    if (handled.current || !request) return;
    handled.current = true;
    try {
      const dataUrl = event.nativeEvent.data;
      if (dataUrl.startsWith('error:')) throw new Error(dataUrl.slice(6) || 'The verse image could not be rendered.');
      const marker = 'base64,';
      const index = dataUrl.indexOf(marker);
      if (index < 0) throw new Error('The verse image could not be rendered.');
      const path = `${FileSystem.cacheDirectory ?? ''}${request.filename}`;
      await FileSystem.writeAsStringAsync(path, dataUrl.slice(index + marker.length), {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
      await Sharing.shareAsync(path, { mimeType: 'image/png', dialogTitle: request.reference });
      onDoneRef.current();
    } catch (error) {
      onErrorRef.current(error instanceof Error ? error.message : 'Could not export this verse.');
    }
  }

  return (
    <WebView
      source={{ html: verseImageHtml(request), baseUrl: 'https://localhost' }}
      onMessage={onMessage}
      onError={() => onError('Could not export this verse.')}
      originWhitelist={['*']}
      javaScriptEnabled
      style={styles.hidden}
    />
  );
}

const styles = StyleSheet.create({
  // Android will not paint a zero-size WebView, so keep a tiny on-screen surface.
  hidden: { position: 'absolute', width: 8, height: 8, opacity: 0.01, left: 0, top: 0 },
});
