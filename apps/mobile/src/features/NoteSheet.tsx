import { useState } from 'react';
import { Text, TextInput } from 'react-native';
import { localBible } from '@the-word/bible';
import { paletteFor, type WordApp } from '@the-word/core';
import { useFeatures } from './context';
import { Button, FullSheet, useSheetStyles } from './ui';

export function NoteSheet({ app, verse, onClose }: { app: WordApp; verse: number; onClose: () => void }) {
  const { ledger, study } = useFeatures();
  const existing = ledger.noteAt(app.bookId, app.chapterNumber, verse);
  const [text, setText] = useState(existing?.text ?? '');
  const [share, setShare] = useState(existing?.share === 'friends');
  const palette = paletteFor(app.theme);
  const styles = useSheetStyles(palette);
  const { label } = app;
  const bookName = localBible.getBook(app.bookId, app.translationId)?.name ?? app.bookName;
  const reference = label.verseReference(bookName, app.chapterNumber, [verse]);

  async function save() {
    const event = await ledger.saveNote(app.bookId, app.chapterNumber, verse, text, share ? 'friends' : 'private');
    if (share && event.text) {
      await study.shareVerse(app.bookId, app.chapterNumber, verse, event.text);
      await ledger.recordShare('feed', app.bookId, app.chapterNumber, verse, 'shared');
    }
    onClose();
  }

  return (
    <FullSheet title={`${label.noteFor} ${reference}`} onClose={onClose} palette={palette}>
      <TextInput
        style={styles.area}
        value={text}
        onChangeText={setText}
        placeholder={label.notePlaceholder}
        placeholderTextColor={palette.muted}
        multiline
        accessibilityLabel={label.noteFor}
      />
      <Button styles={styles} text={label.shareWithFriends} on={share} onPress={() => setShare((value) => !value)} />
      <Text style={styles.muted}>{share ? label.noteSharedHint : label.notePrivateHint}</Text>
      <Button styles={styles} primary text={label.saveNote} onPress={() => { void save(); }} />
      {existing?.text ? (
        <Button styles={styles} text={label.deleteNote} onPress={() => { void ledger.removeNote(app.bookId, app.chapterNumber, verse); onClose(); }} />
      ) : null}
    </FullSheet>
  );
}
