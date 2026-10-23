import { Text, View } from 'react-native';
import { paletteFor, type WordApp } from '@the-word/core';
import { BADGES, localized, progressToward } from '../../../web/src/badges';
import { useFeatures } from './context';
import { Button, FullSheet, useSheetStyles } from './ui';

export function ProgressSheet({ app, onClose }: { app: WordApp; onClose: () => void }) {
  const { ledger } = useFeatures();
  const { label } = app;
  const palette = paletteFor(app.theme);
  const styles = useSheetStyles(palette);
  const earnedIds = new Set(ledger.earned.map((badge) => badge.id));
  return (
    <FullSheet title={label.progress} onClose={onClose} palette={palette}>
      <Text style={styles.muted}>{label.progressHint}</Text>
      <Text style={styles.strong}>{label.streakCount(ledger.streak)}</Text>
      <Text style={styles.text}>{label.longestStreak(ledger.longestStreak)}</Text>
      <Text style={styles.text}>{label.daysReadCount(ledger.daysRead)}</Text>
      <Text style={styles.text}>{label.chaptersReadCount(ledger.chapters)}</Text>
      <Text style={styles.text}>{label.versesReadCount(ledger.verses.have)}</Text>
      <Text style={styles.text}>{label.versesFraction(ledger.verses.have, ledger.verses.need)}</Text>
      <Text style={styles.text}>{label.wholeBible} · {label.biblePercent(ledger.canon.all.percent)}</Text>
      <Text style={styles.muted}>{label.chaptersFraction(ledger.canon.all.have, ledger.canon.all.need)}</Text>
      <View style={styles.row}>
        {ledger.recentDays.map((on, index) => (
          <View key={index} style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: on ? palette.accent : palette.border }} />
        ))}
      </View>
      <Text style={styles.kicker}>{label.earnedBadges}</Text>
      {ledger.earned.length ? ledger.earned.map((badge) => (
        <View key={badge.id} style={styles.card}>
          <Text style={styles.strong}>{localized(badge.definition.title, app.language)}</Text>
          <Text style={styles.muted}>{localized(badge.definition.description, app.language)}</Text>
        </View>
      )) : <Text style={styles.muted}>{label.noBadgesYet}</Text>}
      <Text style={styles.kicker}>{label.lockedBadges}</Text>
      {BADGES.filter((badge) => !earnedIds.has(badge.id)).slice(0, 12).map((badge) => {
        const progress = progressToward(badge, ledger.events);
        return (
          <View key={badge.id} style={styles.card}>
            <Text style={styles.strong}>{localized(badge.title, app.language)}</Text>
            <Text style={styles.muted}>{label.badgeProgress(progress.have, progress.need)}</Text>
          </View>
        );
      })}
      {!ledger.chapterDone(app.bookId, app.chapterNumber) && app.speechState === 'idle' ? (
        <Button styles={styles} primary text={label.markChapterRead} onPress={() => { void ledger.recordChapterRead(app.bookId, app.chapterNumber); }} />
      ) : null}
    </FullSheet>
  );
}
