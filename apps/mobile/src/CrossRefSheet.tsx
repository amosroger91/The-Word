import { useEffect, useState } from 'react';
import { Modal, Pressable, SafeAreaView, ScrollView, Text, View } from 'react-native';
import { bookNameFor, formatCrossRef, localBible, type CrossReference } from '@the-word/bible';
import type { WordApp } from '@the-word/core';

export function CrossRefSheet({
  app,
  verse,
  refs,
  styles,
  onClose,
}: {
  app: WordApp;
  verse: number;
  refs: CrossReference[];
  styles: {
    screen: object;
    panelHeader: object;
    panelTitle: object;
    close: object;
    panelBody: object;
    result: object;
    resultReference: object;
    resultText: object;
    empty: object;
    sectionLabel: object;
  };
  onClose: () => void;
}) {
  const [texts, setTexts] = useState<Record<string, string>>({});
  const { label, books, translationId, bookName, chapterNumber } = app;

  useEffect(() => {
    let active = true;
    void Promise.all(refs.map(async (ref) => {
      const chapter = await localBible.getChapter(translationId, ref.bookId, ref.chapter);
      const text = chapter?.verses.find((item) => item.ref.verse === ref.verse)?.text ?? '';
      return [`${ref.bookId}:${ref.chapter}:${ref.verse}`, text] as const;
    })).then((entries) => {
      if (active) setTexts(Object.fromEntries(entries));
    });
    return () => { active = false; };
  }, [refs, translationId]);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.screen}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>{label.crossReferences}</Text>
          <Pressable onPress={onClose} hitSlop={12} accessibilityLabel={label.closeCrossReferences}><Text style={styles.close}>×</Text></Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.panelBody}>
          <Text style={styles.sectionLabel}>{bookName} {chapterNumber}:{verse}</Text>
          {refs.length ? refs.map((ref) => {
            const key = `${ref.bookId}:${ref.chapter}:${ref.verse}`;
            return (
              <Pressable
                key={key}
                style={styles.result}
                onPress={() => {
                  app.goToVerse(ref.bookId, ref.chapter, ref.verse);
                  onClose();
                }}
              >
                <Text style={styles.resultReference}>{formatCrossRef(ref, bookNameFor(ref.bookId, books))}</Text>
                {texts[key] ? <Text style={styles.resultText} numberOfLines={3}>{texts[key]}</Text> : null}
              </Pressable>
            );
          }) : <Text style={styles.empty}>{label.noCrossReferences}</Text>}
          <Text style={styles.empty}>{label.crossReferenceCredit}</Text>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
