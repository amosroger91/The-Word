import { useState } from 'react';
import { Share, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { paletteFor, type WordApp } from '@the-word/core';
import { exportBackup, MIN_BACKUP_PASSWORD, restoreBackup } from '../../../web/src/nostrAccount';
import { markBackedUp, plainBackup } from '../../../web/src/backupState';
import { addReader, checkPin, removeReader, renameReader, setPin, type Reader } from '../../../web/src/readers';
import { useFeatures } from './context';
import { applyReminder, readReminder, sendTestReminder } from '../platform/reminder';
import { Button, FullSheet, useSheetStyles } from './ui';

export function AccountSheet({ app, onClose }: { app: WordApp; onClose: () => void }) {
  const { ledger, study, reloadSession } = useFeatures();
  const palette = paletteFor(app.theme);
  const styles = useSheetStyles(palette);
  const { label } = app;
  const saved = readReminder();
  const [name, setName] = useState('');
  const [rename, setRename] = useState('');
  const [pin, setPinValue] = useState('');
  const [challenge, setChallenge] = useState<Reader | null>(null);
  const [attempt, setAttempt] = useState('');
  const [pinError, setPinError] = useState('');
  const [password, setPassword] = useState('');
  const [secret, setSecret] = useState('');
  const [restorePassword, setRestorePassword] = useState('');
  const [notice, setNotice] = useState('');
  const [time, setTime] = useState(saved.time);
  const [relayUrls, setRelayUrls] = useState(study.relays.urls.join(', '));
  const state = { readers: ledger.readers, activeId: ledger.activeReader.id };

  function choose(reader: Reader) {
    if (reader.id === ledger.activeReader.id) return;
    if (reader.pinHash) { setChallenge(reader); setAttempt(''); setPinError(''); return; }
    ledger.updateReaders({ ...state, activeId: reader.id });
  }

  async function shareText(filename: string, body: string) {
    await Share.share({ title: filename, message: body });
    markBackedUp();
    setNotice(label.backupDone);
  }

  return (
    <FullSheet title={label.backupAccount} onClose={onClose} palette={palette}>
      <Text style={styles.muted}>{study.account.npub}</Text>
      <Text style={styles.muted}>{label.accountLoss}</Text>
      <Text style={styles.kicker}>{label.readers}</Text>
      <Text style={styles.muted}>{label.readersHint}</Text>
      <View style={styles.row}>
        {ledger.readers.map((reader) => (
          <Button key={reader.id} styles={styles} on={reader.id === ledger.activeReader.id} text={reader.name} onPress={() => choose(reader)} />
        ))}
      </View>
      {challenge ? (
        <View style={styles.card}>
          <Text style={styles.text}>{label.readerPinFor.replace('{name}', challenge.name)}</Text>
          <TextInput style={styles.input} value={attempt} onChangeText={setAttempt} secureTextEntry keyboardType="number-pad" />
          {pinError ? <Text style={styles.error}>{pinError}</Text> : null}
          <Button styles={styles} primary text={label.readerUnlock} onPress={() => {
            if (!checkPin(challenge, attempt)) { setPinError(label.readerPinWrong); return; }
            ledger.updateReaders({ ...state, activeId: challenge.id });
            setChallenge(null);
          }} />
        </View>
      ) : null}
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={label.readerName} placeholderTextColor={palette.muted} />
      <Button styles={styles} text={label.addReader} disabled={!name.trim()} onPress={() => { ledger.updateReaders(addReader(state, name)); setName(''); }} />
      <TextInput style={styles.input} value={rename} onChangeText={setRename} placeholder={ledger.activeReader.name} placeholderTextColor={palette.muted} />
      <Button styles={styles} text={label.readerName} disabled={!rename.trim()} onPress={() => { ledger.updateReaders(renameReader(state, ledger.activeReader.id, rename)); setRename(''); }} />
      <TextInput style={styles.input} value={pin} onChangeText={setPinValue} placeholder={label.readerPin} placeholderTextColor={palette.muted} secureTextEntry keyboardType="number-pad" />
      <Button styles={styles} text={label.readerPin} onPress={() => { ledger.updateReaders(setPin(state, ledger.activeReader.id, pin)); setPinValue(''); }} />
      {ledger.readers.length > 1 ? (
        <Button styles={styles} text={label.deleteNote} onPress={() => ledger.updateReaders(removeReader(state, ledger.activeReader.id))} />
      ) : null}

      <Text style={styles.kicker}>{label.backupAccount}</Text>
      <Text style={styles.muted}>{label.backupNoReset}</Text>
      <Text style={styles.muted}>{label.backupPasswordHint}</Text>
      <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder={label.backupPassword} placeholderTextColor={palette.muted} secureTextEntry />
      {notice ? <Text style={styles.muted}>{notice}</Text> : null}
      <Button
        styles={styles}
        primary
        text={label.createBackup}
        onPress={() => {
          if (password.length < MIN_BACKUP_PASSWORD) { setNotice(label.passwordTooShort); return; }
          try {
            const body = exportBackup(password);
            void shareText(`the-word-backup.txt`, body);
          } catch {
            setNotice(label.passwordTooShort);
          }
        }}
      />
      <Button styles={styles} text={label.copyBackup} onPress={() => {
        if (password.length < MIN_BACKUP_PASSWORD) { setNotice(label.passwordTooShort); return; }
        try {
          const body = exportBackup(password);
          void Clipboard.setStringAsync(body);
          markBackedUp();
          setNotice(label.backupCopied);
        } catch {
          setNotice(label.passwordTooShort);
        }
      }} />
      <Text style={styles.muted}>{label.backupPlainHint}</Text>
      <Button styles={styles} text={label.backupPlain} onPress={() => {
        const plain = plainBackup();
        void shareText(plain.filename, plain.nsec);
      }} />

      <Text style={styles.kicker}>{label.restoreAccount}</Text>
      <TextInput style={styles.area} value={secret} onChangeText={setSecret} placeholder={label.restoreSecret} placeholderTextColor={palette.muted} autoCapitalize="none" multiline />
      <TextInput style={styles.input} value={restorePassword} onChangeText={setRestorePassword} placeholder={label.restorePassword} placeholderTextColor={palette.muted} secureTextEntry />
      <Button styles={styles} text={label.restoreAction} onPress={() => {
        try {
          restoreBackup(secret.trim(), restorePassword);
          markBackedUp();
          setNotice(label.restoreOk);
          reloadSession();
        } catch {
          setNotice(label.restoreFail);
        }
      }} />

      <Text style={styles.kicker}>{label.dailyReminder}</Text>
      <Text style={styles.muted}>{label.dailyReminderHint}</Text>
      <Button
        styles={styles}
        on={saved.enabled}
        text={label.reminderEnable}
        onPress={() => {
          void applyReminder({ enabled: !saved.enabled, time }, label.reminderTitle, label.reminderBody).then((result) => {
            if (result === 'blocked') setNotice(label.reminderBlocked);
            else if (result === 'unsupported') setNotice(label.reminderUnsupported);
            else setNotice(label.reminderNext(time));
          });
        }}
      />
      <TextInput style={styles.input} value={time} onChangeText={setTime} placeholder={label.reminderTime} placeholderTextColor={palette.muted} />
      <Button styles={styles} text={label.reminderTime} onPress={() => {
        if (!/^\d{2}:\d{2}$/.test(time)) return;
        void applyReminder({ enabled: true, time }, label.reminderTitle, label.reminderBody);
      }} />
      <Button styles={styles} text={label.reminderTest} onPress={() => {
        void sendTestReminder(label.reminderTitle, label.reminderBody).then((result) => {
          if (result === 'ok') setNotice(label.reminderTestSent);
          else if (result === 'blocked') setNotice(label.reminderTestBlocked);
          else setNotice(label.reminderTestFailed);
        });
      }} />

      <Text style={styles.kicker}>{label.relays}</Text>
      <TextInput style={styles.input} value={relayUrls} onChangeText={setRelayUrls} placeholder={label.relays} placeholderTextColor={palette.muted} autoCapitalize="none" />
      <Button styles={styles} text={label.relays} onPress={() => study.saveRelayConfig({ urls: relayUrls.split(/[\s,]+/).filter(Boolean), issuerPub: study.relays.issuerPub })} />
      <Button styles={styles} text={label.requestMembership} onPress={() => { void study.askMembership(); }} />
    </FullSheet>
  );
}
