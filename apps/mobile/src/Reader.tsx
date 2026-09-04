import { useMemo, useRef, useState } from 'react';
import { Modal, Platform, Pressable, SafeAreaView, ScrollView, StatusBar as RNStatusBar, StyleSheet, Text, TextInput, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { fontFor, paletteFor, readingFonts, speechRateRange, speechVolumeRange, verseImageFilename, verseRuns, type Language, type Palette, type WordApp } from '@the-word/core';
import { PickerSheet, type PickerOption } from './PickerSheet';
import { VerseImageShare, type VerseImageRequest } from './VerseImageShare';

type Sheet = 'translation' | 'book' | 'chapter' | 'font' | 'language' | 'voice' | 'searchBook' | null;

export function Reader({ app }: { app: WordApp }) {
  const palette = paletteFor(app.theme);
  const styles = useMemo(() => createStyles(palette), [palette]);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const [headerVisible, setHeaderVisible] = useState(true);
  const [imageRequest, setImageRequest] = useState<VerseImageRequest | null>(null);
  const [exportError, setExportError] = useState('');
  const scrollRef = useRef<ScrollView>(null);
  const versePositions = useRef<Record<number, number>>({});
  const lastSpokenVerse = useRef<number | null>(null);

  const { label, chapter, chapterLoading, book, bookName, chapterNumber, speechState, speakingVerse } = app;
  const nativeFont = fontFor(app.fontId).native;
  const readerFont = nativeFont === 'serif' ? undefined : nativeFont;

  // The floating bar appears once the header controls have scrolled away, and never on top of a selection.
  const readingBarOpen = speechState !== 'idle' && !headerVisible && app.selectedVerses.size === 0;

  function onScroll(event: NativeSyntheticEvent<NativeScrollEvent>) {
    setHeaderVisible(event.nativeEvent.contentOffset.y < 90);
  }

  if (speakingVerse !== null && speakingVerse !== lastSpokenVerse.current) {
    lastSpokenVerse.current = speakingVerse;
    const offset = versePositions.current[speakingVerse];
    if (offset !== undefined) scrollRef.current?.scrollTo({ y: Math.max(0, offset - 120), animated: true });
  }

  const sheets: Record<Exclude<Sheet, null>, { title: string; options: PickerOption[]; value: string; onSelect: (value: string) => void }> = {
    translation: { title: label.translation, options: app.translationOptions, value: app.translationId, onSelect: app.changeTranslation },
    book: { title: label.book, options: app.bookOptions, value: String(app.bookId), onSelect: (value) => app.changeBook(Number(value)) },
    chapter: { title: label.chapter, options: app.chapterOptions, value: String(chapterNumber), onSelect: (value) => app.changeChapter(Number(value)) },
    font: { title: label.font, options: readingFonts.map((item) => ({ value: item.id, label: item.name })), value: app.fontId, onSelect: app.setFontId },
    language: { title: label.interfaceLanguage, options: app.languageOptions, value: app.language, onSelect: (value) => app.changeLanguage(value as Language) },
    voice: { title: label.voice, options: app.voiceOptions.map((voice) => ({ value: voice.id, label: voice.name, hint: voice.locale })), value: app.speechVoice, onSelect: app.setSpeechVoice },
    searchBook: { title: label.allBooks, options: [{ value: 'all', label: label.allBooks }, ...app.bookOptions], value: app.searchBookId, onSelect: app.setSearchBookId },
  };
  const activeSheet = sheet ? sheets[sheet] : null;

  const speechButtons = (
    <>
      {speechState === 'idle' && <Chip styles={styles} disabled={!chapter} onPress={app.speakChapter} text={label.readAloud} />}
      {speechState === 'speaking' && <Chip styles={styles} onPress={app.pauseSpeech} text={label.pause} />}
      {speechState === 'paused' && <Chip styles={styles} onPress={app.resumeSpeech} text={label.resume} />}
      {speechState !== 'idle' && <Chip styles={styles} onPress={app.stopSpeech} text={label.stop} />}
    </>
  );

  const speedControl = (
    <View style={styles.speed}>
      <Pressable onPress={() => app.changeSpeechRate(-speechRateRange.step)} disabled={app.speechRate <= speechRateRange.min} accessibilityLabel={label.decreaseSpeed} hitSlop={8}>
        <Text style={[styles.speedButton, app.speechRate <= speechRateRange.min && styles.disabled]}>−</Text>
      </Pressable>
      <Text style={styles.speedValue}>{app.speechRate.toFixed(1)}×</Text>
      <Pressable onPress={() => app.changeSpeechRate(speechRateRange.step)} disabled={app.speechRate >= speechRateRange.max} accessibilityLabel={label.increaseSpeed} hitSlop={8}>
        <Text style={[styles.speedButton, app.speechRate >= speechRateRange.max && styles.disabled]}>+</Text>
      </Pressable>
    </View>
  );

  const volumeControl = (
    <View style={styles.speed}>
      <Pressable onPress={() => app.changeSpeechVolume(-speechVolumeRange.step)} disabled={app.speechVolume <= speechVolumeRange.min} accessibilityLabel={label.decreaseVolume} hitSlop={8}>
        <Text style={[styles.speedButton, app.speechVolume <= speechVolumeRange.min && styles.disabled]}>−</Text>
      </Pressable>
      <Text style={styles.speedValue}>{Math.round(app.speechVolume * 100)}%</Text>
      <Pressable onPress={() => app.changeSpeechVolume(speechVolumeRange.step)} disabled={app.speechVolume >= speechVolumeRange.max} accessibilityLabel={label.increaseVolume} hitSlop={8}>
        <Text style={[styles.speedButton, app.speechVolume >= speechVolumeRange.max && styles.disabled]}>+</Text>
      </Pressable>
    </View>
  );

  return (
    <SafeAreaView style={styles.screen}>
      <StatusBar style={app.theme === 'dark' ? 'light' : 'dark'} />
      <View style={styles.header}>
        <View style={styles.identity}>
          <Text style={styles.brand}>✦</Text>
          <Text style={styles.reference} numberOfLines={1}>{bookName} <Text style={styles.referenceNumber}>{chapterNumber}</Text></Text>
        </View>
        <View style={styles.controlRow}>
          {speechButtons}
          <IconButton styles={styles} label={label.settings} glyph="⚙" onPress={() => setSettingsOpen(true)} />
          <IconButton styles={styles} label={label.search} glyph="⌕" onPress={() => setSearchOpen(true)} />
          <IconButton styles={styles} label={label.bookmarks} glyph="◈" onPress={() => setBookmarksOpen(true)} />
          <IconButton styles={styles} label={label.toggleTheme} glyph="◐" onPress={app.toggleTheme} />
        </View>
        <View style={styles.pickerRow}>
          <Selector styles={styles} flex={1.4} label={label.translation} value={app.translations.find((item) => item.id === app.translationId)?.shortName ?? ''} onPress={() => setSheet('translation')} />
          <Selector styles={styles} flex={2} label={label.book} value={bookName} onPress={() => setSheet('book')} />
          <Selector styles={styles} flex={1} label={label.chapter} value={String(chapterNumber)} onPress={() => setSheet('chapter')} />
        </View>
      </View>

      <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={64} contentContainerStyle={styles.readerContent}>
        <View style={styles.chapterNav}>
          <Pressable disabled={chapterNumber === 1} onPress={() => app.moveChapter(-1)}>
            <Text style={[styles.navText, chapterNumber === 1 && styles.disabled]}>← {label.previous}</Text>
          </Pressable>
          <Text style={styles.navReference}>{bookName} {chapterNumber}</Text>
          <Pressable disabled={!book || chapterNumber === book.chapters} onPress={() => app.moveChapter(1)}>
            <Text style={[styles.navText, (!book || chapterNumber === book.chapters) && styles.disabled]}>{label.next} →</Text>
          </Pressable>
        </View>
        {chapterLoading ? <Text style={styles.empty}>{label.loading}</Text> : chapter ? chapter.verses.map((verse) => {
          const selected = app.selectedVerses.has(verse.ref.verse);
          const speaking = speakingVerse === verse.ref.verse;
          return (
            <Pressable
              key={verse.ref.verse}
              onPress={() => app.toggleVerse(verse.ref.verse)}
              onLayout={(event) => { versePositions.current[verse.ref.verse] = event.nativeEvent.layout.y; }}
              style={[styles.verseRow, selected && styles.verseSelected, speaking && styles.verseSpeaking]}
            >
              <Text style={[styles.verse, { fontSize: app.fontSize, lineHeight: app.fontSize * 1.7, fontFamily: readerFont }]}>
                <Text style={styles.verseNumber}>{verse.ref.verse} </Text>
                {verseRuns(verse.text, verse.redLetters).map((run, index) => (
                  <Text key={index} style={run.red ? styles.redLetter : undefined}>{run.text}</Text>
                ))}
                {app.bookmarks.has(app.bookmarkKey(verse.ref.verse)) ? <Text style={styles.bookmarkMark}> ◆</Text> : null}
              </Text>
            </Pressable>
          );
        }) : (
          <View>
            <Text style={styles.emptyTitle}>{label.chapterMissingTitle}</Text>
            <Text style={styles.empty}>{label.chapterMissingBody}</Text>
          </View>
        )}
      </ScrollView>

      {app.selectedVerses.size > 0 && (
        <View style={styles.bar}>
          <Text style={styles.barTitle} numberOfLines={1}>{app.selectedReference}</Text>
          <View style={styles.barButtons}>
            <BarButton styles={styles} text={label.bookmark} onPress={() => app.selectedVerseNumbers.forEach(app.toggleBookmark)} />
            <BarButton styles={styles} text={label.copy} onPress={() => { void app.copySelection(); }} />
            <BarButton styles={styles} text={label.readSelection} onPress={app.speakSelection} />
            <BarButton
              styles={styles}
              text={imageRequest ? label.exporting : label.image}
              disabled={Boolean(imageRequest)}
              onPress={() => {
                if (!app.selectedText) return;
                setExportError('');
                setImageRequest({
                  reference: app.selectedReference,
                  text: app.selectedText,
                  translation: app.translations.find((item) => item.id === app.translationId)?.shortName ?? 'KJV',
                  background: palette.background,
                  textColor: palette.text,
                  accent: palette.accent,
                  fontStack: fontFor(app.fontId).stack,
                  filename: verseImageFilename(bookName, chapterNumber),
                });
              }}
            />
            <BarButton styles={styles} text={label.clearSelection} onPress={app.clearSelection} />
          </View>
        </View>
      )}

      {readingBarOpen && (
        <View style={styles.bar}>
          <View style={styles.barStatus}>
            <Text style={styles.barTitle} numberOfLines={1}>{bookName} {chapterNumber}{speakingVerse === null ? '' : `:${speakingVerse}`}</Text>
            <Text style={styles.barSubtitle}>{speechState === 'paused' ? label.paused : label.readingAloud}</Text>
          </View>
          <View style={styles.barButtons}>
            {speedControl}
            {volumeControl}
            {speechButtons}
          </View>
        </View>
      )}

      {app.speechError ? <View style={styles.error}><Text style={styles.errorText}>{app.speechError}</Text></View> : null}
      {exportError ? <View style={styles.error}><Text style={styles.errorText}>{exportError}</Text></View> : null}
      <VerseImageShare
        request={imageRequest}
        onDone={() => { setImageRequest(null); app.clearSelection(); }}
        onError={(message) => { setImageRequest(null); setExportError(message); }}
      />

      {activeSheet && (
        <PickerSheet
          visible
          title={activeSheet.title}
          filterPlaceholder={label.filterPlaceholder}
          options={activeSheet.options}
          value={activeSheet.value}
          palette={palette}
          onSelect={activeSheet.onSelect}
          onClose={() => setSheet(null)}
        />
      )}

      <Modal visible={settingsOpen} animationType="slide" transparent onRequestClose={() => setSettingsOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setSettingsOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{label.settings}</Text>
            <Pressable onPress={() => setSettingsOpen(false)} hitSlop={12}><Text style={styles.close}>×</Text></Pressable>
          </View>
          <Selector styles={styles} label={label.font} value={fontFor(app.fontId).name} onPress={() => setSheet('font')} />
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{label.increaseText}</Text>
            <View style={styles.inlineButtons}>
              <Chip styles={styles} text="A−" onPress={() => app.setFontSize(app.fontSize - 1)} />
              <Chip styles={styles} text="A+" onPress={() => app.setFontSize(app.fontSize + 1)} />
            </View>
          </View>
          <Selector styles={styles} label={label.interfaceLanguage} value={app.languageOptions.find((item) => item.value === app.language)?.label ?? ''} onPress={() => setSheet('language')} />
          <Selector styles={styles} label={label.voice} value={app.voiceOptions.find((voice) => voice.id === app.speechVoice)?.name ?? '—'} onPress={() => setSheet('voice')} />
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{label.increaseSpeed}</Text>
            {speedControl}
          </View>
          <View style={styles.settingRow}>
            <Text style={styles.settingLabel}>{label.volume}</Text>
            {volumeControl}
          </View>
        </View>
      </Modal>

      <Modal visible={searchOpen} animationType="slide" onRequestClose={() => setSearchOpen(false)}>
        <SafeAreaView style={styles.screen}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>{label.searchTitle}</Text>
            <Pressable onPress={() => setSearchOpen(false)} hitSlop={12}><Text style={styles.close}>×</Text></Pressable>
          </View>
          <View style={styles.panelBody}>
            <TextInput
              style={styles.input}
              value={app.query}
              onChangeText={(value) => { app.setQuery(value); app.setSelectedTopic(''); }}
              placeholder={label.searchPlaceholder}
              placeholderTextColor={palette.muted}
              autoFocus
            />
            <View style={styles.modeRow}>
              <Chip styles={styles} text={label.allWords} active={app.searchMode === 'all'} onPress={() => app.setSearchMode('all')} />
              <Chip styles={styles} text={label.exactPhrase} active={app.searchMode === 'exact'} onPress={() => app.setSearchMode('exact')} />
            </View>
            <View style={styles.modeRow}>
              <Chip styles={styles} text={label.allTestaments} active={app.searchTestament === 'all'} onPress={() => app.setSearchTestament('all')} />
              <Chip styles={styles} text={label.oldTestament} active={app.searchTestament === 'old'} onPress={() => app.setSearchTestament('old')} />
              <Chip styles={styles} text={label.newTestament} active={app.searchTestament === 'new'} onPress={() => app.setSearchTestament('new')} />
            </View>
            <Selector styles={styles} label={label.book} value={app.searchBookId === 'all' ? label.allBooks : app.books.find((item) => String(item.id) === app.searchBookId)?.name ?? ''} onPress={() => setSheet('searchBook')} />
            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.sectionLabel}>{label.browseByTopic}</Text>
              <View style={styles.topicWrap}>
                {app.topics.map((topic) => (
                  <Chip key={topic.id} styles={styles} text={topic.name} active={app.selectedTopic === topic.id} onPress={() => { app.setSelectedTopic(topic.id); app.setQuery(''); }} />
                ))}
              </View>
              {(app.query || app.selectedTopic) ? (
                <View>
                  <Text style={styles.sectionLabel}>{app.searchLoading ? label.searching : label.results(app.searchResults.length)}</Text>
                  {app.searchResults.slice(0, 100).map((result) => (
                    <Pressable
                      key={`${result.translationId}:${result.verse.ref.bookId}:${result.verse.ref.chapter}:${result.verse.ref.verse}`}
                      style={styles.result}
                      onPress={() => { app.goTo(result.verse.ref.bookId, result.verse.ref.chapter); setSearchOpen(false); app.setQuery(''); }}
                    >
                      <Text style={styles.resultReference}>{app.books.find((item) => item.id === result.verse.ref.bookId)?.name} {result.verse.ref.chapter}:{result.verse.ref.verse}</Text>
                      <Text style={styles.resultText} numberOfLines={3}>{result.verse.text}</Text>
                    </Pressable>
                  ))}
                  {!app.searchResults.length && !app.searchLoading ? <Text style={styles.empty}>{label.noMatches}</Text> : null}
                </View>
              ) : null}
            </ScrollView>
          </View>
        </SafeAreaView>
      </Modal>

      <Modal visible={bookmarksOpen} animationType="slide" onRequestClose={() => setBookmarksOpen(false)}>
        <SafeAreaView style={styles.screen}>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>{label.bookmarks}</Text>
            <Pressable onPress={() => setBookmarksOpen(false)} hitSlop={12} accessibilityLabel={label.closeBookmarks}><Text style={styles.close}>×</Text></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.panelBody}>
            {app.bookmarkList.length ? app.bookmarkList.map((entry) => (
              <Pressable
                key={`${entry.bookId}:${entry.chapter}:${entry.verse}`}
                style={styles.result}
                onPress={() => { app.goTo(entry.bookId, entry.chapter); setBookmarksOpen(false); }}
              >
                <Text style={styles.resultReference}>{app.books.find((item) => item.id === entry.bookId)?.name} {entry.chapter}:{entry.verse}</Text>
              </Pressable>
            )) : <Text style={styles.empty}>{label.noBookmarks}</Text>}
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

type Styles = ReturnType<typeof createStyles>;

function IconButton({ styles, glyph, label, onPress }: { styles: Styles; glyph: string; label: string; onPress: () => void }) {
  return (
    <Pressable style={styles.iconButton} onPress={onPress} accessibilityLabel={label} accessibilityRole="button">
      <Text style={styles.iconGlyph}>{glyph}</Text>
    </Pressable>
  );
}

function Chip({ styles, text, onPress, active, disabled }: { styles: Styles; text: string; onPress: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <Pressable style={[styles.chip, active && styles.chipActive, disabled && styles.chipDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{text}</Text>
    </Pressable>
  );
}

function BarButton({ styles, text, onPress, disabled }: { styles: Styles; text: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable style={[styles.barButton, disabled && styles.chipDisabled]} onPress={onPress} disabled={disabled} accessibilityRole="button">
      <Text style={styles.barButtonText}>{text}</Text>
    </Pressable>
  );
}

function Selector({ styles, label, value, onPress, flex }: { styles: Styles; label: string; value: string; onPress: () => void; flex?: number }) {
  return (
    <Pressable style={[styles.selector, flex ? { flex } : null]} onPress={onPress} accessibilityRole="button" accessibilityLabel={label}>
      <Text style={styles.selectorLabel}>{label}</Text>
      <Text style={styles.selectorValue} numberOfLines={1}>{value} ▾</Text>
    </Pressable>
  );
}

function createStyles(palette: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: palette.background, paddingTop: Platform.OS === 'android' ? RNStatusBar.currentHeight ?? 0 : 0 },
    header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 12, borderBottomColor: palette.rule, borderBottomWidth: 1, gap: 10 },
    identity: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    brand: { color: palette.accent, fontSize: 20 },
    reference: { color: palette.text, fontSize: 26, flexShrink: 1 },
    referenceNumber: { color: palette.accentSoft },
    controlRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
    pickerRow: { flexDirection: 'row', gap: 8 },
    iconButton: { borderColor: palette.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, minWidth: 40, alignItems: 'center' },
    iconGlyph: { color: palette.text, fontSize: 15 },
    chip: { borderColor: palette.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    chipActive: { backgroundColor: palette.highlight },
    chipDisabled: { opacity: 0.4 },
    chipText: { color: palette.text, fontSize: 14 },
    chipTextActive: { fontWeight: '700' },
    selector: { borderColor: palette.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, gap: 2 },
    selectorLabel: { color: palette.muted, fontSize: 9, fontWeight: '700', letterSpacing: 1.1, textTransform: 'uppercase' },
    selectorValue: { color: palette.text, fontSize: 14 },
    readerContent: { paddingHorizontal: 18, paddingBottom: 160 },
    chapterNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, marginBottom: 6, borderBottomColor: palette.rule, borderBottomWidth: 1 },
    navText: { color: palette.accent, fontSize: 14 },
    navReference: { color: palette.muted, fontSize: 13 },
    disabled: { opacity: 0.35 },
    verseRow: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 6, marginTop: 8 },
    verseSelected: { backgroundColor: palette.highlight },
    verseSpeaking: { backgroundColor: palette.speaking },
    verse: { color: palette.text },
    verseNumber: { color: palette.accentSoft, fontSize: 12, fontWeight: '700' },
    redLetter: { color: palette.redLetter },
    bookmarkMark: { color: palette.accent, fontSize: 12 },
    empty: { color: palette.muted, fontSize: 15, marginTop: 20 },
    emptyTitle: { color: palette.text, fontSize: 20, marginTop: 28 },
    bar: { position: 'absolute', left: 12, right: 12, bottom: 16, backgroundColor: palette.barBackground, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
    barStatus: { gap: 2 },
    barTitle: { color: palette.barText, fontSize: 15, fontWeight: '700' },
    barSubtitle: { color: palette.barMuted, fontSize: 12 },
    barButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
    barButton: { borderColor: palette.barBorder, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, flexGrow: 1, alignItems: 'center' },
    barButtonText: { color: palette.barText, fontSize: 14 },
    speed: { flexDirection: 'row', alignItems: 'center', gap: 10, borderColor: palette.barBorder, borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6 },
    speedButton: { color: palette.barText, fontSize: 17 },
    speedValue: { color: palette.barText, fontSize: 13, minWidth: 40, textAlign: 'center' },
    error: { position: 'absolute', left: 12, right: 12, bottom: 16, backgroundColor: palette.error, borderRadius: 8, padding: 12 },
    errorText: { color: '#fff7f2', fontSize: 13 },
    backdrop: { flex: 1, backgroundColor: '#0006' },
    sheet: { backgroundColor: palette.background, borderTopLeftRadius: 18, borderTopRightRadius: 18, padding: 16, paddingBottom: 32, gap: 12 },
    sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sheetTitle: { color: palette.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.4, textTransform: 'uppercase' },
    close: { color: palette.text, fontSize: 26, lineHeight: 28 },
    settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
    settingLabel: { color: palette.text, fontSize: 14, flexShrink: 1 },
    inlineButtons: { flexDirection: 'row', gap: 8 },
    panelHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomColor: palette.rule, borderBottomWidth: 1 },
    panelTitle: { color: palette.text, fontSize: 20 },
    panelBody: { flex: 1, paddingHorizontal: 18, paddingTop: 14, gap: 10 },
    input: { borderColor: palette.border, borderWidth: 1, borderRadius: 8, color: palette.text, paddingHorizontal: 12, paddingVertical: 10 },
    modeRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    sectionLabel: { color: palette.muted, fontSize: 11, fontWeight: '700', letterSpacing: 1.3, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 },
    topicWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    result: { borderColor: palette.rule, borderWidth: 1, borderRadius: 8, padding: 12, marginBottom: 8, gap: 4 },
    resultReference: { color: palette.accent, fontWeight: '700' },
    resultText: { color: palette.text, fontSize: 14 },
  });
}
