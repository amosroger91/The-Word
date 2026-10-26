import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Linking from 'expo-linking';
import { paletteFor, useWordApp, type KeyValueStore, type Platform, type VoiceOption, type WordApp } from '@the-word/core';
import { needsBackup } from '../../../web/src/backupState';
import { useLedger } from '../../../web/src/useLedger';
import { useReadParty } from '../../../web/src/useReadParty';
import { useStudy } from '../../../web/src/useStudy';
import { useStudyBoard } from '../../../web/src/useStudyBoard';
import { createNativeSpeech, nativeClipboard, voicesForLanguage } from '../platform';
import { deviceColorScheme, deviceLocales, watchDeviceColorScheme } from '../platform/system';
import { linkTarget } from '../platform/links';
import { ensureReminderScheduled } from '../platform/reminder';
import { webrtcReady } from '../platform/webrtc';
import { Landing } from '../Landing';
import { Reader } from '../Reader';
import { AccountSheet } from './AccountSheet';
import { BreakdownSheet } from './BreakdownSheet';
import { FeatureProvider, useFeatures, type Tool } from './context';
import { GroupSheet } from './GroupSheet';
import { NoteSheet } from './NoteSheet';
import { ProgressSheet } from './ProgressSheet';
import { StudySheet } from './StudySheet';

export function WordSession({
  storage,
  voices,
  sessionKey,
  onReload,
}: {
  storage: KeyValueStore;
  voices: VoiceOption[];
  sessionKey: number;
  onReload: () => void;
}) {
  return (
    <FeatureBoundary key={sessionKey}>
      <SessionBody storage={storage} voices={voices} onReload={onReload} />
    </FeatureBoundary>
  );
}

function SessionBody({
  storage,
  voices,
  onReload,
}: {
  storage: KeyValueStore;
  voices: VoiceOption[];
  onReload: () => void;
}) {
  const speech = useMemo(() => createNativeSpeech(), []);
  const platform = useMemo<Platform>(() => ({
    storage,
    speech,
    clipboard: nativeClipboard,
    voices: voices.length ? voicesForLanguage(voices) : undefined,
    locales: deviceLocales(),
    colorScheme: deviceColorScheme,
    watchColorScheme: watchDeviceColorScheme,
  }), [storage, speech, voices]);
  const app = useWordApp(platform, deviceColorScheme());
  const appRef = useRef(app);
  appRef.current = app;
  const ledger = useLedger();
  const study = useStudy(ledger.earned);
  const party = useReadParty(app);
  const [view, setView] = useState<'home' | 'reader'>('home');
  const [tool, setTool] = useState<Tool | null>(null);
  const [noteVerse, setNoteVerse] = useState<number | null>(null);
  const [pendingGroup, setPendingGroup] = useState('');
  const webrtc = webrtcReady();
  const boardOn = webrtc && (tool === 'group' || (party.active && party.isHost && party.findable));
  const board = useStudyBoard(boardOn);

  useEffect(() => {
    void ensureReminderScheduled(app.label.reminderTitle, app.label.reminderBody);
  }, [app.label.reminderTitle, app.label.reminderBody]);

  useEffect(() => {
    if (!boardOn || !party.active || !party.isHost || !party.findable) return;
    const publish = () => board.advertise({
      code: party.code,
      hostName: party.name,
      members: Math.max(party.members.length, 1),
      bookId: app.bookId,
      chapter: app.chapterNumber,
      verse: app.focusedVerse,
      ts: Date.now(),
    });
    publish();
    const timer = setInterval(publish, 4000);
    return () => {
      clearInterval(timer);
      board.retract(party.code);
    };
  }, [boardOn, board.advertise, board.retract, party.active, party.isHost, party.findable, party.code, party.name, party.members.length, app.bookId, app.chapterNumber, app.focusedVerse]);

  useEffect(() => {
    let live = true;
    const apply = (url: string | null) => {
      if (!live || !url) return;
      const target = linkTarget(url);
      if (!target) return;
      if (target.verse) {
        appRef.current.goToVerse(target.verse.bookId, target.verse.chapter, target.verse.verse);
        setView('reader');
      }
      if (target.group) {
        setPendingGroup(target.group);
        setTool('group');
        setView('reader');
      }
    };
    void Linking.getInitialURL().then(apply);
    const subscription = Linking.addEventListener('url', (event) => apply(event.url));
    return () => {
      live = false;
      subscription.remove();
    };
  }, [appRef]);

  function openTool(next: Tool | null) {
    setTool(next);
    if (next) setView('reader');
  }

  const features = {
    ledger,
    study,
    party,
    tool,
    openTool,
    noteVerse,
    openNote: (verse: number) => { setNoteVerse(verse); setTool('note'); },
    reloadSession: onReload,
    webrtc,
    board: board.list,
    pendingGroup,
    setPendingGroup,
  };

  return (
    <FeatureProvider value={features}>
      {view === 'home' ? (
        <Landing
          app={app}
          onEnterReader={() => { app.markProgress(); setView('reader'); }}
          onGroupStudy={() => openTool('group')}
          tools={[
            { label: app.label.progress, onPress: () => openTool('progress') },
            { label: app.label.study, onPress: () => openTool('study') },
            { label: app.label.backupAccount, onPress: () => openTool('account') },
          ]}
        />
      ) : (
        <Reader app={app} onHome={() => setView('home')} />
      )}
      <EarnedBanner app={app} onBackup={() => openTool('account')} />
      {tool === 'progress' ? <ProgressSheet app={app} onClose={() => setTool(null)} /> : null}
      {tool === 'study' ? (
        <StudySheet
          app={app}
          onClose={() => setTool(null)}
          onOpenPassage={(bookId, chapter, verse) => { app.goToVerse(bookId, chapter, verse); setTool(null); setView('reader'); }}
        />
      ) : null}
      {tool === 'group' ? <GroupSheet app={app} onClose={() => setTool(null)} /> : null}
      {tool === 'account' ? <AccountSheet app={app} onClose={() => setTool(null)} /> : null}
      {tool === 'note' && noteVerse != null ? <NoteSheet app={app} verse={noteVerse} onClose={() => setTool(null)} /> : null}
      {tool === 'breakdown' ? (
        <BreakdownSheet
          app={app}
          onClose={() => setTool(null)}
          onOpenVerse={(bookId, chapter, verse) => { app.goToVerse(bookId, chapter, verse); setView('reader'); }}
        />
      ) : null}
    </FeatureProvider>
  );
}

function EarnedBanner({ app, onBackup }: { app: WordApp; onBackup: () => void }) {
  const { ledger, study } = useFeatures();
  const [hidden, setHidden] = useState(false);
  const palette = paletteFor(app.theme);
  const fresh = ledger.justEarned[0];
  const showBackup = !hidden && needsBackup() && (Boolean(fresh) || study.circles.length > 0);
  if (!fresh && !showBackup) return null;
  return (
    <View style={{ position: 'absolute', left: 12, right: 12, bottom: 24, backgroundColor: palette.barBackground, borderRadius: 12, padding: 14, gap: 8 }}>
      {fresh ? <Text style={{ color: palette.barText, fontWeight: '700' }}>{app.label.badgeEarned(fresh.definition.title[app.language] || fresh.definition.title.en)}</Text> : null}
      {showBackup ? <Text style={{ color: palette.barText }}>{fresh ? app.label.backupWhyBadge : app.label.backupWhyCircle}</Text> : null}
      {showBackup ? (
        <Pressable onPress={onBackup}><Text style={{ color: palette.accent }}>{app.label.backupAccount}</Text></Pressable>
      ) : null}
      <Pressable onPress={() => { ledger.clearJustEarned(); setHidden(true); }}><Text style={{ color: palette.barMuted }}>{app.label.backupLater}</Text></Pressable>
    </View>
  );
}

class FeatureBoundary extends Component<{ children: ReactNode }, { message: string }> {
  state = { message: '' };

  static getDerivedStateFromError(error: Error) {
    return { message: error.message || 'The study tools could not start.' };
  }

  render() {
    if (!this.state.message) return this.props.children;
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, backgroundColor: '#f7f4ee' }}>
        <Text style={{ color: '#2a241c', fontSize: 18, textAlign: 'center' }}>{this.state.message}</Text>
      </View>
    );
  }
}
