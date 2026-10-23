import { useEffect, useRef, useState, type ComponentType } from 'react';
import { Share, Text, TextInput, View } from 'react-native';
import { paletteFor, type WordApp } from '@the-word/core';
import { groupPageUrl } from '../platform/links';
import { useFeatures } from './context';
import { Button, FullSheet, useSheetStyles } from './ui';

function statusLine(label: WordApp['label'], status: string): string {
  if (status === 'hosting') return label.partyHosting;
  if (status === 'joining') return label.partyJoining;
  if (status === 'connected') return label.partyConnected;
  if (status === 'reconnecting') return label.partyReconnecting;
  return status ? label.partyConnecting : '';
}

export function GroupSheet({ app, onClose }: { app: WordApp; onClose: () => void }) {
  const { party, ledger, board, pendingGroup, setPendingGroup, webrtc } = useFeatures();
  const palette = paletteFor(app.theme);
  const styles = useSheetStyles(palette);
  const { label } = app;
  const [code, setCode] = useState(pendingGroup);
  const [chat, setChat] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [findable, setFindable] = useState(false);
  const [name, setName] = useState(party.name);
  const recorded = useRef('');

  useEffect(() => { if (pendingGroup) setCode(pendingGroup); }, [pendingGroup]);

  useEffect(() => {
    if (!party.active) { recorded.current = ''; return; }
    const key = `${party.code}:${party.status}:${party.isHost}`;
    if (recorded.current === key) return;
    if (party.isHost && party.status === 'hosting') {
      recorded.current = key;
      void ledger.recordGroup(party.findable ? 'public' : 'private', { bookId: app.bookId, chapter: app.chapterNumber });
    } else if (!party.isHost && party.status === 'connected') {
      recorded.current = key;
      void ledger.recordGroup('join', { bookId: app.bookId, chapter: app.chapterNumber });
    }
  }, [party.active, party.code, party.status, party.isHost, party.findable, ledger, app.bookId, app.chapterNumber]);

  const media = party.mediaError === 'denied' || party.mediaError === 'photo'
    ? label.mediaDenied
    : party.capped
      ? label.meshCapped
      : party.mediaError;

  return (
    <FullSheet title={label.readParty} onClose={onClose} palette={palette}>
      {!webrtc ? <Text style={styles.muted}>{label.mediaDenied}</Text> : null}
      {!party.active ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.muted}>{label.partyIntro}</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder={party.name} placeholderTextColor={palette.muted} />
          <Button styles={styles} text={label.readerName} onPress={() => party.setName(name)} />
          <Button styles={styles} on={findable} text={label.findableGroup} onPress={() => setFindable((value) => !value)} />
          <Text style={styles.muted}>{label.findableHint}</Text>
          <Button styles={styles} primary text={label.startParty} disabled={!webrtc} onPress={() => { party.setName(name); party.createParty({ findable }); }} />
          <Text style={styles.muted}>{label.orJoinParty}</Text>
          <TextInput style={styles.input} value={code} onChangeText={setCode} placeholder={label.partyCodePlaceholder} placeholderTextColor={palette.muted} autoCapitalize="none" />
          <Button styles={styles} text={label.joinParty} disabled={!webrtc || !code.trim()} onPress={() => { setPendingGroup(''); party.joinParty(code.trim()); }} />
          <Text style={styles.kicker}>{label.liveGroups}</Text>
          {board.length ? board.map((item) => (
            <View key={item.code} style={styles.card}>
              <Text style={styles.strong}>{item.hostName}</Text>
              <Text style={styles.muted}>{label.peopleHere(item.members)} · {item.code}</Text>
              <Button styles={styles} text={label.joinThisGroup} onPress={() => party.joinParty(item.code)} />
            </View>
          )) : <Text style={styles.muted}>{label.noLiveGroups}</Text>}
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <Text style={styles.strong}>{label.partyCode} {party.code}</Text>
          <Text style={styles.muted}>{statusLine(label, party.status)}{party.isHost ? ` · ${label.youAreHost}` : party.following ? ` · ${label.followingHost}` : ''}</Text>
          {party.error ? <Text style={styles.error}>{label.partyConnectFailed(party.error)}</Text> : null}
          {media ? <Text style={styles.error}>{media}</Text> : null}
          <Text style={styles.muted}>{party.isHost ? label.hostHint : label.followHost}</Text>
          <View style={styles.row}>
            <Button styles={styles} text={label.leaveParty} onPress={party.leaveParty} />
            <Button styles={styles} text={label.copy} onPress={() => { void Share.share({ message: groupPageUrl(party.code) }); }} />
            {party.isHost ? (
              <Button styles={styles} on={party.presenting} text={label.tapVerseToPlace} onPress={() => party.setPresenting(!party.presenting)} />
            ) : (
              <Button styles={styles} text={party.following ? 'Browse independently' : 'Return to host'} onPress={() => { party.following ? party.browseIndependently() : party.returnToHost(); }} />
            )}
            {!party.isHost && party.needsArm ? <Button styles={styles} primary text={label.tapToReadAlong} onPress={() => { app.unlockSpeech(); party.arm(); }} /> : null}
            {!party.isHost ? <Button styles={styles} on={party.narrationMuted} text={label.readAloud} onPress={party.toggleNarration} /> : null}
          </View>
          <View style={styles.row}>
            <Button styles={styles} on={party.micOn} text={label.meetingMic} disabled={!webrtc || (party.capped && !party.micOn)} onPress={() => { party.toggleMic(); void ledger.recordGroup('mic'); }} />
            <Button styles={styles} on={party.camOn} text={label.meetingCam} disabled={!webrtc || (party.capped && !party.camOn)} onPress={() => { party.toggleCam(); void ledger.recordGroup('cam'); }} />
            {party.isHost ? <Button styles={styles} on={party.screenOn} text={party.screenOn ? 'Sharing screen' : 'Share screen'} onPress={() => party.toggleScreen(false)} /> : null}
          </View>
          <Text style={styles.kicker}>{label.inTheRoom(party.members.length)}</Text>
          {party.members.map((member) => (
            <View key={member.id} style={styles.row}>
              <Text style={styles.text}>{member.name}{member.host ? ` · ${label.hostTag}` : ''}</Text>
              {party.isHost && !member.host ? <Button styles={styles} text={label.hostTag} onPress={() => party.transferHost(member.id)} /> : null}
              <VideoTile stream={member.id === party.identity.id ? party.localStream : party.remoteStreams[member.id]} />
            </View>
          ))}
          {party.screenMemberId ? <Text style={styles.muted}>{label.groupFindable}</Text> : null}
          <Text style={styles.kicker}>{label.partyChat}</Text>
          {party.messages.map((message) => (
            <Text key={message.id} style={styles.text}>{message.name ? `${message.name}: ` : ''}{message.text}</Text>
          ))}
          <TextInput style={styles.input} value={chat} onChangeText={setChat} placeholder={label.partyChatPlaceholder} placeholderTextColor={palette.muted} />
          <Button styles={styles} text={label.send} disabled={!chat.trim()} onPress={() => { party.sendChat(chat.trim()); setChat(''); }} />
          <Text style={styles.kicker}>{label.study}</Text>
          {party.isHost ? (
            <View style={{ gap: 8 }}>
              <TextInput style={styles.input} value={question} onChangeText={setQuestion} placeholder={label.messagePlaceholder} placeholderTextColor={palette.muted} />
              <Button styles={styles} text={label.send} disabled={!question.trim()} onPress={() => { party.askQuestion(question.trim()); setQuestion(''); }} />
              {party.question ? <Button styles={styles} text={label.closeNote} onPress={party.closeQuestion} /> : null}
              {party.answerList.length ? <Button styles={styles} on={party.sharingAnswers} text={label.shareWithFriends} onPress={() => party.shareAnswers(!party.sharingAnswers)} /> : null}
            </View>
          ) : null}
          {party.questionOpen && party.question ? (
            <View style={styles.card}>
              <Text style={styles.strong}>{party.question.text}</Text>
              <TextInput style={styles.area} value={answer} onChangeText={setAnswer} placeholder={label.messagePlaceholder} placeholderTextColor={palette.muted} multiline />
              <Button styles={styles} primary text={label.send} onPress={() => { party.sendAnswer(answer); setAnswer(''); }} />
              <Button styles={styles} text={label.closeNote} onPress={party.skipQuestion} />
            </View>
          ) : null}
          {party.sharedAnswers ? (
            <View style={styles.card}>
              <Text style={styles.strong}>{party.sharedAnswers.question}</Text>
              {party.sharedAnswers.items.map((item) => <Text key={item.memberId} style={styles.text}>{item.name}: {item.text}</Text>)}
            </View>
          ) : null}
        </View>
      )}
    </FullSheet>
  );
}

function VideoTile({ stream }: { stream: object | null }) {
  if (!stream) return null;
  const url = (stream as { toURL?: () => string }).toURL?.();
  if (!url) return null;
  try {
    const { RTCView } = require('react-native-webrtc') as { RTCView?: ComponentType<{ streamURL: string; style: object; objectFit: string }> };
    if (!RTCView) return null;
    return <RTCView streamURL={url} style={{ width: 96, height: 128, backgroundColor: '#111' }} objectFit="cover" />;
  } catch {
    return null;
  }
}
