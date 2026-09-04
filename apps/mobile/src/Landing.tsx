import { useMemo, useState } from 'react';
import { Image, Pressable, SafeAreaView, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, View, Platform } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { localBible } from '@the-word/bible';
import {
  DAILY_VERSE_API,
  backgroundForSeed,
  overlayFor,
  paletteFor,
  useDailyVerse,
  useLocalVerse,
  verseImageFilename,
  type Language,
  type Palette,
  type WordApp,
} from '@the-word/core';
import { verseBackgroundModules } from './backgrounds';
import { PickerSheet } from './PickerSheet';
import { VerseImageEditor, type VerseImageJob } from './VerseImageEditor';
import { VerseImageShare, type VerseImageRequest } from './VerseImageShare';

export function Landing({
  app,
  onEnterReader,
  onGroupStudy,
}: {
  app: WordApp;
  onEnterReader: () => void;
  onGroupStudy?: () => void;
}) {
  const palette = paletteFor(app.theme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [imageJob, setImageJob] = useState<VerseImageJob | null>(null);
  const [imageRequest, setImageRequest] = useState<VerseImageRequest | null>(null);
  const daily = useDailyVerse([DAILY_VERSE_API]);
  const parsed = daily.verse?.parsed ?? null;
  const local = useLocalVerse(app.translationId, parsed);
  const { label } = app;

  const bookName = parsed ? (localBible.getBook(parsed.bookId, app.translationId)?.name ?? daily.verse?.ref ?? '') : '';
  const translationName = app.translations.find((item) => item.id === app.translationId)?.shortName ?? '';
  const displayText = local.text ?? daily.verse?.text ?? '';
  const displayReference = parsed
    ? `${bookName} ${parsed.chapter}:${parsed.verse}`
    : daily.verse?.ref ?? '';
  const spokenReference = parsed ? label.verseReference(bookName, parsed.chapter, [parsed.verse]) : displayReference;
  const canRead = Boolean(parsed && local.ready && local.text);
  const bookmarked = parsed ? app.isBookmarked(parsed.bookId, parsed.chapter, parsed.verse) : false;
  const art = backgroundForSeed(daily.verse?.date || daily.verse?.ref || 'verse');
  const artOverlay = overlayFor(art.kind);

  function enter(speak: 'from' | 'chapter' | 'none') {
    if (!parsed) return;
    if (speak !== 'none') app.unlockSpeech();
    if (speak === 'from') app.speakFromVerse(parsed.bookId, parsed.chapter, parsed.verse);
    else if (speak === 'chapter') app.speakChapterAt(parsed.bookId, parsed.chapter, parsed.verse);
    else app.goToVerse(parsed.bookId, parsed.chapter, parsed.verse);
    onEnterReader();
  }

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={app.theme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.bar}>
        <Pressable style={styles.lang} onPress={() => setLanguageOpen(true)} accessibilityLabel={label.interfaceLanguage}>
          <Text style={styles.langText}>{app.languageOptions.find((item) => item.value === app.language)?.label}</Text>
        </Pressable>
        <Pressable style={styles.icon} onPress={app.toggleTheme} accessibilityLabel={label.toggleTheme}>
          <Text style={styles.iconText}>◐</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={styles.main}>
        <View style={styles.brand}>
          <Text style={styles.mark}>✦</Text>
          <Text style={styles.title}>The Word</Text>
          <Text style={styles.tagline}>{label.footerFree}</Text>
        </View>
        <TextInput
          style={styles.search}
          value={app.query}
          onChangeText={(value) => { app.setQuery(value); if (value.trim()) app.setSelectedTopic(''); }}
          placeholder={label.searchPlaceholder}
          placeholderTextColor={palette.muted}
          accessibilityLabel={label.search}
        />
        {(app.query.trim() || app.selectedTopic) ? (
          <View style={styles.results}>
            <Text style={styles.muted}>{app.searchLoading ? label.searching : label.results(app.searchResults.length)}</Text>
            {app.searchResults.slice(0, 12).map((result) => (
              <Pressable
                key={`${result.translationId}:${result.verse.ref.bookId}:${result.verse.ref.chapter}:${result.verse.ref.verse}`}
                style={styles.result}
                onPress={() => {
                  app.goToVerse(result.verse.ref.bookId, result.verse.ref.chapter, result.verse.ref.verse);
                  app.setQuery('');
                  onEnterReader();
                }}
              >
                <Text style={styles.resultRef}>{localBible.getBook(result.verse.ref.bookId, app.translationId)?.name} {result.verse.ref.chapter}:{result.verse.ref.verse}</Text>
                <Text style={styles.resultText} numberOfLines={3}>{result.verse.text}</Text>
              </Pressable>
            ))}
            {!app.searchResults.length && !app.searchLoading ? <Text style={styles.muted}>{label.noMatches}</Text> : null}
          </View>
        ) : null}
        <Pressable style={styles.read} onPress={onEnterReader} accessibilityRole="button">
          <Text style={styles.readText}>{app.hasProgress ? label.continueReading : label.readTheBible}</Text>
        </Pressable>
        {app.hasProgress ? <Text style={styles.resume}>{app.bookName} {app.chapterNumber}</Text> : null}
        {onGroupStudy ? (
          <Pressable style={styles.group} onPress={onGroupStudy} accessibilityRole="button">
            <Text style={styles.groupText}>{label.readParty}</Text>
          </Pressable>
        ) : null}
        <View style={styles.verseCard}>
          {daily.status === 'loading' ? <Text style={styles.muted}>{label.loadingVerse}</Text> : null}
          {daily.status === 'error' ? (
            <>
              <Text style={styles.muted}>{label.dailyVerseUnavailable}</Text>
              <Pressable style={styles.secondary} onPress={daily.reload}>
                <Text style={styles.secondaryText}>{label.tryAgain}</Text>
              </Pressable>
            </>
          ) : null}
          {daily.status === 'ready' && daily.verse ? (
            <>
              <View style={styles.verseArt}>
                <Image source={verseBackgroundModules[art.file]} style={StyleSheet.absoluteFillObject} resizeMode="cover" />
                {artOverlay > 0 ? <View style={[StyleSheet.absoluteFillObject, { backgroundColor: `rgba(0,0,0,${artOverlay})` }]} /> : null}
                <Text style={styles.artKicker}>{label.verseOfTheDayFor(daily.verse.date)}</Text>
                <Text style={styles.artVerse}>{displayText}</Text>
                <Text style={styles.artRef}>{displayReference}{translationName ? ` · ${translationName}` : ''}</Text>
              </View>
              {parsed ? (
                <View style={styles.actions}>
                  {app.speechState === 'idle' ? (
                    <>
                      <Action styles={styles} text={label.readFromHere} primary disabled={!canRead} onPress={() => enter('from')} />
                      <Action styles={styles} text={label.readTheChapter} primary disabled={!canRead} onPress={() => enter('chapter')} />
                    </>
                  ) : (
                    <>
                      {app.speechState === 'speaking' ? <Action styles={styles} text={label.pause} primary onPress={app.pauseSpeech} /> : null}
                      {app.speechState === 'paused' ? <Action styles={styles} text={label.resume} primary onPress={app.resumeSpeech} /> : null}
                      <Action styles={styles} text={label.stop} onPress={app.stopSpeech} />
                    </>
                  )}
                  <Action styles={styles} text={label.openThisVerse} onPress={() => enter('none')} />
                  <Action styles={styles} text={label.copy} disabled={!displayText} onPress={() => { void app.copyPassage(spokenReference, displayText); }} />
                  <Action
                    styles={styles}
                    text={label.image}
                    disabled={!displayText}
                    onPress={() => setImageJob({
                      reference: displayReference,
                      text: displayText,
                      translation: translationName || 'KJV',
                      filename: verseImageFilename(bookName || 'verse', parsed.chapter),
                      seed: daily.verse?.date || displayReference,
                    })}
                  />
                  <Action
                    styles={styles}
                    text={label.bookmark}
                    active={bookmarked}
                    onPress={() => app.toggleBookmarkAt(parsed.bookId, parsed.chapter, parsed.verse)}
                  />
                </View>
              ) : null}
              <Text style={styles.credit}>{label.dailyVerseCredit}</Text>
            </>
          ) : null}
        </View>
      </ScrollView>
      {imageJob ? (
        <VerseImageEditor
          job={imageJob}
          fontStack={app.font.stack}
          label={label}
          theme={app.theme}
          onClose={() => setImageJob(null)}
          onSave={(request) => { setImageJob(null); setImageRequest(request); }}
        />
      ) : null}
      <VerseImageShare request={imageRequest} onDone={() => setImageRequest(null)} onError={() => setImageRequest(null)} />
      <PickerSheet
        visible={languageOpen}
        title={label.interfaceLanguage}
        filterPlaceholder={label.filterPlaceholder}
        options={app.languageOptions}
        value={app.language}
        palette={palette}
        onSelect={(value) => { app.changeLanguage(value as Language); setLanguageOpen(false); }}
        onClose={() => setLanguageOpen(false)}
      />
    </SafeAreaView>
  );
}

function Action({
  styles,
  text,
  onPress,
  primary,
  active,
  disabled,
}: {
  styles: ReturnType<typeof createStyles>;
  text: string;
  onPress: () => void;
  primary?: boolean;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      style={[styles.action, primary && styles.actionPrimary, active && styles.actionActive, disabled && styles.disabled]}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
    >
      <Text style={[styles.actionText, primary && styles.actionPrimaryText]}>{text}</Text>
    </Pressable>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0 },
    bar: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
    lang: { borderColor: palette.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    langText: { color: palette.text, fontSize: 14 },
    icon: { borderColor: palette.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 40, alignItems: 'center' },
    iconText: { color: palette.text, fontSize: 15 },
    main: { paddingHorizontal: 24, paddingBottom: 48, alignItems: 'stretch', gap: 24 },
    brand: { alignItems: 'center', paddingTop: 28, gap: 8 },
    mark: { color: palette.accent, fontSize: 48 },
    title: { color: palette.text, fontSize: 44, fontWeight: '400' },
    tagline: { color: palette.muted, fontSize: 15 },
    search: { borderColor: palette.border, borderWidth: 1, borderRadius: 10, color: palette.text, paddingHorizontal: 14, paddingVertical: 12 },
    results: { gap: 8 },
    result: { borderColor: palette.rule, borderWidth: 1, borderRadius: 8, padding: 12, gap: 4 },
    resultRef: { color: palette.accent, fontWeight: '700' },
    resultText: { color: palette.text, fontSize: 14 },
    read: { backgroundColor: palette.accent, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
    readText: { color: '#fff7f2', fontSize: 18, fontWeight: '600' },
    resume: { color: palette.muted, fontSize: 14, textAlign: 'center', marginTop: -12 },
    group: { borderColor: palette.border, borderWidth: 1, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
    groupText: { color: palette.text, fontSize: 16 },
    verseCard: { gap: 12 },
    verseArt: { minHeight: 380, borderRadius: 16, overflow: 'hidden', padding: 28, justifyContent: 'center', gap: 14 },
    artKicker: { color: 'rgba(255,255,255,0.78)', fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', textAlign: 'center' },
    artVerse: { color: '#ffffff', fontSize: 20, lineHeight: 32, fontStyle: 'italic', textAlign: 'center' },
    artRef: { color: '#ffffff', fontSize: 16, fontWeight: '700', textAlign: 'center' },
    credit: { color: palette.muted, fontSize: 12 },
    muted: { color: palette.muted, fontSize: 15 },
    secondary: { borderColor: palette.border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    secondaryText: { color: palette.text, fontSize: 15 },
    actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    action: { flexGrow: 1, flexBasis: '46%', borderColor: palette.border, borderWidth: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    actionPrimary: { backgroundColor: palette.accent, borderColor: palette.accent },
    actionPrimaryText: { color: '#fff7f2' },
    actionActive: { backgroundColor: palette.highlight },
    actionText: { color: palette.text, fontSize: 15 },
    disabled: { opacity: 0.4 },
  });
}
