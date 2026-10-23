import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { WebView, type WebViewMessageEvent } from 'react-native-webview';
import { localBible } from '@the-word/bible';
import { buildBreakdown, type VerseBreakdown } from '@the-word/bible';
import { paletteFor, type WordApp } from '@the-word/core';
import { buildPacket, checkGenerated, questionPrompts } from '../../../web/src/breakdown/prompt';
import { loadModelState, saveModelState, type ModelPhase } from '../../../web/src/breakdown/model';
import { useFeatures } from './context';
import { MODEL_HTML } from './modelHost';
import { Button, FullSheet, useSheetStyles } from './ui';

type ModelState = { phase: ModelPhase; progress: number; loaded: number; total: number; error?: string };

export function BreakdownSheet({ app, onClose, onOpenVerse }: { app: WordApp; onClose: () => void; onOpenVerse: (bookId: number, chapter: number, verse: number) => void }) {
  const palette = paletteFor(app.theme);
  const styles = useSheetStyles(palette);
  const { label } = app;
  const verse = app.focusedVerse ?? app.selectedVerseNumbers[0] ?? null;
  const [compare, setCompare] = useState(false);
  const [data, setData] = useState<VerseBreakdown | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [questions, setQuestions] = useState<string[]>([]);
  const [rejected, setRejected] = useState<string[]>([]);
  const stored = loadModelState();
  const [enabled, setEnabled] = useState(stored.enabled !== false);
  const [model, setModel] = useState<ModelState>({ phase: stored.enabled === false ? 'off' : 'idle', progress: 0, loaded: 0, total: 0 });
  const webRef = useRef<WebView>(null);
  const waiters = useRef(new Map<number, { resolve: (text: string) => void; reject: (error: Error) => void }>());
  const nextId = useRef(1);

  useEffect(() => {
    if (verse == null) { setData(null); return; }
    let cancelled = false;
    setBusy(true);
    setError('');
    const others = compare
      ? app.translations.map((item) => item.id).filter((id) => id !== app.translationId).slice(0, 3)
      : app.translations.map((item) => item.id).filter((id) => id !== app.translationId && localBible.isLoaded(id));
    void buildBreakdown({
      translationId: app.translationId,
      reference: { bookId: app.bookId, chapter: app.chapterNumber, verse },
      compareTranslations: others,
    }).then((result) => { if (!cancelled) setData(result); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [verse, app.bookId, app.chapterNumber, app.translationId, app.translations, compare]);

  useEffect(() => {
    setQuestions([]);
    setRejected([]);
    if (!data || model.phase !== 'ready') return;
    let cancelled = false;
    const packet = buildPacket(data);
    void (async () => {
      const kept: string[] = [];
      const dropped: string[] = [];
      for (const prompt of questionPrompts(packet)) {
        try {
          const raw = await ask(prompt);
          const checked = checkGenerated(raw, packet);
          if (!checked.ok) dropped.push(checked.reason || 'withheld');
          else if (!kept.includes(checked.text)) kept.push(checked.text);
        } catch (err) {
          dropped.push((err as Error).message);
        }
      }
      if (!cancelled) { setQuestions(kept); setRejected(dropped); }
    })();
    return () => { cancelled = true; };
  }, [data, model.phase]);

  function ask(prompt: string): Promise<string> {
    const id = nextId.current++;
    return new Promise((resolve, reject) => {
      waiters.current.set(id, { resolve, reject });
      webRef.current?.injectJavaScript(`window.__wordModel(${JSON.stringify(JSON.stringify({ type: 'generate', id, prompt, maxTokens: 48 }))}); true;`);
    });
  }

  function onModelMessage(event: WebViewMessageEvent) {
    const message = JSON.parse(event.nativeEvent.data) as { type: string; id?: number; text?: string; error?: string; progress?: number; loaded?: number; total?: number };
    if (message.type === 'boot') {
      webRef.current?.injectJavaScript(`window.__wordModel(${JSON.stringify(JSON.stringify({ type: 'load' }))}); true;`);
      setModel((current) => ({ ...current, phase: 'checking' }));
    } else if (message.type === 'progress') {
      setModel({ phase: 'downloading', progress: message.progress || 0, loaded: message.loaded || 0, total: message.total || 0 });
    } else if (message.type === 'ready') {
      saveModelState({ cachedAt: new Date().toISOString(), enabled: true });
      setModel({ phase: 'ready', progress: 1, loaded: 0, total: 0 });
    } else if (message.type === 'failed') {
      setModel({ phase: 'unavailable', progress: 0, loaded: 0, total: 0, error: message.error });
    } else if (message.type === 'result' && message.id) {
      waiters.current.get(message.id)?.resolve(message.text || '');
      waiters.current.delete(message.id);
    } else if (message.type === 'error' && message.id) {
      waiters.current.get(message.id)?.reject(new Error(message.error || 'model'));
      waiters.current.delete(message.id);
    }
  }

  const modelLine = model.phase === 'ready'
    ? label.breakdownModelReady
    : model.phase === 'off'
      ? label.breakdownModelOff
      : model.phase === 'unavailable'
        ? label.breakdownModelUnavailable
        : model.phase === 'downloading'
          ? label.breakdownModelDownloading.replace('{percent}', String(Math.round(model.progress * 100))).replace('{size}', model.total ? `${Math.round(model.total / 1000000)} MB` : '…')
          : label.breakdownModelPreparing;

  return (
    <FullSheet title={label.breakdownObservations} onClose={onClose} palette={palette}>
      {verse == null ? <Text style={styles.muted}>{label.breakdownPickVerse}</Text> : null}
      {busy ? <Text style={styles.muted}>{label.breakdownWorking}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {data ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.kicker}>{label.breakdownVerse}</Text>
          <Text style={styles.strong}>{data.referenceLabel}</Text>
          <Text style={styles.text}>{data.exactText}</Text>
          <Text style={styles.kicker}>{label.breakdownContext}</Text>
          {data.context.previous.map((item) => <Text key={`p${item.ref.verse}`} style={styles.muted}>{item.ref.verse}. {item.text}</Text>)}
          {data.context.next.map((item) => <Text key={`n${item.ref.verse}`} style={styles.muted}>{item.ref.verse}. {item.text}</Text>)}
          <Text style={styles.muted}>{label.breakdownChapterOf.replace('{count}', String(data.context.chapterVerseCount))}</Text>
          <Text style={styles.kicker}>{label.breakdownObservations}</Text>
          {data.claims.map((claim) => (
            <View key={claim.id} style={styles.card}>
              <Text style={styles.text}>{claim.text}</Text>
              <Text style={styles.muted}>{claim.confidence}</Text>
            </View>
          ))}
          <Text style={styles.kicker}>{label.breakdownRelated}</Text>
          {data.crossReferences.map((row) => (
            <Button key={`${row.bookId}:${row.chapter}:${row.verse}`} styles={styles} text={row.reference} onPress={() => { onOpenVerse(row.bookId, row.chapter, row.verse); onClose(); }} />
          ))}
          <Text style={styles.kicker}>{label.breakdownTranslations}</Text>
          {data.translations.length ? data.translations.map((row) => (
            <View key={row.translationId} style={styles.card}>
              <Text style={styles.strong}>{row.name}</Text>
              <Text style={styles.text}>{row.text}</Text>
              <Text style={styles.muted}>{row.differs ? label.breakdownDiffers : label.breakdownSame}</Text>
            </View>
          )) : <Text style={styles.muted}>{label.breakdownNoComparison}</Text>}
          <Button styles={styles} text={label.breakdownCompareMore} onPress={() => setCompare(true)} />
          <Text style={styles.kicker}>{label.breakdownQuestions}</Text>
          <Text style={styles.muted}>{modelLine}</Text>
          {questions.map((question) => <Text key={question} style={styles.text}>{question}</Text>)}
          {rejected.length ? <Text style={styles.muted}>{label.breakdownSourceNotes}: {rejected.join(' ')}</Text> : null}
          <Text style={styles.muted}>{label.breakdownGeneratedNote}</Text>
          <Text style={styles.muted}>{label.breakdownOnlySources}</Text>
          {data.sourceWarnings.map((warning) => <Text key={warning} style={styles.muted}>{warning}</Text>)}
          <Button
            styles={styles}
            text={enabled ? label.breakdownModelOff : label.breakdownEnableModel}
            onPress={() => {
              const next = !enabled;
              setEnabled(next);
              saveModelState({ enabled: next });
              setModel({ phase: next ? 'checking' : 'off', progress: 0, loaded: 0, total: 0 });
            }}
          />
        </View>
      ) : null}
      {enabled ? (
        <View style={{ height: 1, overflow: 'hidden' }}>
          <WebView
            ref={webRef}
            originWhitelist={['*']}
            source={{ html: MODEL_HTML, baseUrl: 'https://localhost' }}
            onMessage={onModelMessage}
            javaScriptEnabled
            domStorageEnabled
            mixedContentMode="always"
          />
        </View>
      ) : null}
    </FullSheet>
  );
}
