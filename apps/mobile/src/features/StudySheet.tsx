import { useEffect, useRef, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { paletteFor, type WordApp } from '@the-word/core';
import type { MemberSummary } from '../../../web/src/circles';
import { latestAnswers, type AnswerValue } from '../../../web/src/ledger';
import { nodesWithPrefix } from '../../../web/src/gunGraph';
import { localized, type PlanBlock, type StudyPlan } from '../../../web/src/plans';
import { useFeatures } from './context';
import { Button, FullSheet, useSheetStyles, type SheetStyles } from './ui';

type Tab = 'plans' | 'circles' | 'feed' | 'friends';

export function StudySheet({
  app,
  onClose,
  onOpenPassage,
}: {
  app: WordApp;
  onClose: () => void;
  onOpenPassage: (bookId: number, chapter: number, verse: number) => void;
}) {
  const { study, ledger } = useFeatures();
  const palette = paletteFor(app.theme);
  const styles = useSheetStyles(palette);
  const { label } = app;
  const [tab, setTab] = useState<Tab>('plans');
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [paste, setPaste] = useState('');
  const [circleName, setCircleName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [kind, setKind] = useState<'solo' | 'couple' | 'family' | 'friends'>('solo');
  const [shareNote, setShareNote] = useState('');
  const [friendKey, setFriendKey] = useState('');
  const [dmTo, setDmTo] = useState('');
  const [dmText, setDmText] = useState('');
  const [requests, setRequests] = useState<Record<string, MemberSummary[]>>({});

  const plansLoaded = useRef(false);
  useEffect(() => {
    if (plansLoaded.current) return;
    plansLoaded.current = true;
    void study.loadPlans();
  }, [study]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const next: Record<string, MemberSummary[]> = {};
      for (const circle of study.circles) {
        if (circle.createdBy !== study.account.npub) continue;
        const nodes = await nodesWithPrefix(`circles/join/${circle.code}/`);
        next[circle.id] = nodes
          .map((node) => node.body as MemberSummary)
          .filter((row) => Boolean(row?.npub && row.gunPub));
      }
      if (!cancelled) setRequests(next);
    })();
    return () => { cancelled = true; };
  }, [study.circles, study.account.npub]);

  const relayLine = study.relayState === 'off'
    ? label.relayNone
    : study.relayState === 'down'
      ? label.relayDown
      : study.membership ? label.membershipOk : label.membershipPending;

  return (
    <FullSheet title={label.study} onClose={onClose} palette={palette}>
      <View style={styles.row}>
        {(['plans', 'circles', 'feed', 'friends'] as Tab[]).map((id) => (
          <Button key={id} styles={styles} on={tab === id} text={label[id]} onPress={() => { setTab(id); setPlan(null); }} />
        ))}
      </View>
      <Text style={styles.muted}>{relayLine}</Text>
      {study.error ? <Text style={styles.error}>{study.error}</Text> : null}

      {plan ? (
        study.needsAcceptance(plan.id) ? (
          <View style={styles.card}>
            <Text style={styles.strong}>{localized(plan.title, app.language)}</Text>
            <Text style={styles.muted}>{label.planUnverified}</Text>
            <Text style={styles.muted}>{label.planAcceptHint}</Text>
            <Button styles={styles} primary text={label.planAccept} onPress={() => study.acceptPlan(plan.id)} />
            <Button styles={styles} text={label.planDecline} onPress={() => setPlan(null)} />
          </View>
        ) : (
          <SessionView
            app={app}
            styles={styles}
            plan={plan}
            sessionId={sessionId}
            onSession={setSessionId}
            onBack={() => setPlan(null)}
            onOpenPassage={(bookId, chapter, verse) => { onOpenPassage(bookId, chapter, verse); onClose(); }}
          />
        )
      ) : null}

      {!plan && tab === 'plans' ? (
        <View style={{ gap: 12 }}>
          <Text style={styles.muted}>{label.planHint}</Text>
          {study.plans.map((item) => (
            <Button key={item.id} styles={styles} text={localized(item.title, app.language)} onPress={() => { setPlan(item); setSessionId(item.sessions[0]?.id || ''); }} />
          ))}
          {!study.plans.length ? <Text style={styles.muted}>{label.noPlans}</Text> : null}
          {study.imported.map((row) => (
            <View key={row.plan.id} style={styles.card}>
              <Button styles={styles} text={localized(row.plan.title, app.language)} onPress={() => { setPlan(row.plan); setSessionId(row.plan.sessions[0]?.id || ''); }} />
              <Text style={styles.muted}>{label.planUnverified}</Text>
              <Button styles={styles} text={label.planDecline} onPress={() => study.forgetPlan(row.plan.id)} />
            </View>
          ))}
          <Text style={styles.kicker}>{label.importPlan}</Text>
          <Text style={styles.muted}>{label.importPlanHint}</Text>
          <TextInput style={styles.area} value={paste} onChangeText={setPaste} placeholder="{ }" placeholderTextColor={palette.muted} multiline autoCapitalize="none" />
          <Button
            styles={styles}
            text={label.importPlan}
            disabled={!paste.trim()}
            onPress={() => {
              void study.importPlanText(paste).then(() => setPaste('')).catch((error: Error) => study.setError(`${label.planImportFailed} ${error.message}`));
            }}
          />
        </View>
      ) : null}

      {!plan && tab === 'circles' ? (
        <View style={{ gap: 12 }}>
          <TextInput style={styles.input} value={circleName} onChangeText={setCircleName} placeholder={label.circleName} placeholderTextColor={palette.muted} />
          <View style={styles.row}>
            {(['solo', 'couple', 'family', 'friends'] as const).map((item) => (
              <Button key={item} styles={styles} on={kind === item} text={item === 'solo' ? label.circleSolo : item} onPress={() => setKind(item)} />
            ))}
          </View>
          <Button styles={styles} primary text={label.createCircle} onPress={() => { void study.createCircle(circleName || label.circleSolo, kind); setCircleName(''); }} />
          <TextInput style={styles.input} value={joinCode} onChangeText={setJoinCode} placeholder={label.inviteCode} placeholderTextColor={palette.muted} autoCapitalize="none" />
          <Button styles={styles} text={label.joinCircle} disabled={!joinCode.trim()} onPress={() => { void study.joinCircle(joinCode); setJoinCode(''); }} />
          {study.circles.map((circle) => (
            <View key={circle.id} style={styles.card}>
              <Text style={styles.strong}>{circle.name}</Text>
              <Text style={styles.muted}>{circle.kind} · {circle.pace} · {label.inviteCode} {circle.code}</Text>
              <Text style={styles.muted}>{circle.members.map((member) => member.name).join(', ')}</Text>
              {circle.pace === 'together' ? (
                <Button styles={styles} text={label.readTogether} onPress={onClose} />
              ) : null}
              {(requests[circle.id] ?? []).filter((member) => !circle.members.some((row) => row.npub === member.npub)).map((member) => (
                <Button key={member.npub} styles={styles} text={`${label.joinCircle}: ${member.name}`} onPress={() => { void study.admit(circle, member); }} />
              ))}
            </View>
          ))}
        </View>
      ) : null}

      {!plan && tab === 'feed' ? (
        <View style={{ gap: 12 }}>
          <TextInput style={styles.input} value={shareNote} onChangeText={setShareNote} placeholder={label.messagePlaceholder} placeholderTextColor={palette.muted} />
          <Button
            styles={styles}
            primary
            text={label.shareVerse}
            onPress={() => {
              const verse = app.focusedVerse ?? app.selectedVerseNumbers[0] ?? 1;
              void study.shareVerse(app.bookId, app.chapterNumber, verse, shareNote);
              void ledger.recordShare('feed', app.bookId, app.chapterNumber, verse, 'shared');
              setShareNote('');
            }}
          />
          {study.feed.length ? study.feed.map((item) => (
            <View key={item.id} style={styles.card}>
              <Text style={styles.strong}>{item.name || item.npub}</Text>
              <Text style={styles.text}>{item.kind}{item.note ? ` — ${item.note}` : ''}</Text>
            </View>
          )) : <Text style={styles.muted}>{label.feedEmpty}</Text>}
        </View>
      ) : null}

      {!plan && tab === 'friends' ? (
        <View style={{ gap: 12 }}>
          <TextInput style={styles.input} value={friendKey} onChangeText={setFriendKey} placeholder={label.friendNpub} placeholderTextColor={palette.muted} autoCapitalize="none" />
          <Button
            styles={styles}
            text={label.addFriend}
            disabled={!friendKey.trim()}
            onPress={() => {
              void study.addFriend(friendKey.trim());
              void ledger.recordGroup('friendRequest');
              setFriendKey('');
            }}
          />
          {study.friends.map((friend) => <Text key={friend.npub} style={styles.text}>{friend.npub}</Text>)}
          <Text style={styles.kicker}>{label.directMessages}</Text>
          <TextInput style={styles.input} value={dmTo} onChangeText={setDmTo} placeholder={label.friendNpub} placeholderTextColor={palette.muted} autoCapitalize="none" />
          <TextInput style={styles.area} value={dmText} onChangeText={setDmText} placeholder={label.messagePlaceholder} placeholderTextColor={palette.muted} multiline />
          <Button
            styles={styles}
            primary
            text={label.send}
            disabled={!dmTo.trim() || !dmText.trim()}
            onPress={() => { void study.sendMessage(dmTo.trim(), dmText.trim()); setDmText(''); }}
          />
          {study.messages.map((message) => (
            <View key={message.id} style={styles.card}>
              <Text style={styles.strong}>{message.from === study.account.npub ? label.youSuffix : message.from}</Text>
              <Text style={styles.text}>{message.text}</Text>
            </View>
          ))}
        </View>
      ) : null}
    </FullSheet>
  );
}

function SessionView({
  app,
  styles,
  plan,
  sessionId,
  onSession,
  onBack,
  onOpenPassage,
}: {
  app: WordApp;
  styles: SheetStyles;
  plan: StudyPlan;
  sessionId: string;
  onSession: (id: string) => void;
  onBack: () => void;
  onOpenPassage: (bookId: number, chapter: number, verse: number) => void;
}) {
  const { study } = useFeatures();
  const session = plan.sessions.find((row) => row.id === sessionId) ?? plan.sessions[0];
  if (!session) return null;
  const answers = latestAnswers(study.events);
  return (
    <View style={{ gap: 12 }}>
      <Button styles={styles} text={app.label.previous} onPress={onBack} />
      <Text style={styles.strong}>{localized(plan.title, app.language)}</Text>
      <Text style={styles.text}>{localized(session.title, app.language)}</Text>
      <View style={styles.row}>
        {plan.sessions.map((item, index) => (
          <Button key={item.id} styles={styles} on={item.id === session.id} text={String(index + 1)} onPress={() => onSession(item.id)} />
        ))}
      </View>
      {session.blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          styles={styles}
          language={app.language}
          label={app.label}
          saved={answers.get(`${plan.id}:${session.id}:${block.id}`)?.value}
          onPassage={onOpenPassage}
          onAnswer={(value) => { void study.answer(plan.id, session.id, block.id, value, study.circles[0]?.id, study.circles[0] ? 'circle' : 'private'); }}
        />
      ))}
      <Button
        styles={styles}
        primary
        text={app.label.completeSession}
        onPress={() => {
          void study.finishSession(plan.id, session.id, study.circles[0]?.id);
          if (session.id === plan.sessions[plan.sessions.length - 1]?.id) void study.finishPlan(plan.id, study.circles[0]?.id);
        }}
      />
    </View>
  );
}

function BlockView({
  block,
  styles,
  language,
  label,
  saved,
  onPassage,
  onAnswer,
}: {
  block: PlanBlock;
  styles: SheetStyles;
  language: WordApp['language'];
  label: WordApp['label'];
  saved?: AnswerValue;
  onPassage: (bookId: number, chapter: number, verse: number) => void;
  onAnswer: (value: AnswerValue) => void;
}) {
  const [text, setText] = useState(saved && saved.type === 'free' ? saved.text : '');
  const [picked, setPicked] = useState<string[]>(saved && saved.type === 'choice' ? saved.optionIds : saved && saved.type === 'checklist' ? saved.itemIds : []);
  const [scale, setScale] = useState(saved && saved.type === 'scale' ? String(saved.value) : '');
  const [verse, setVerse] = useState(saved && saved.type === 'versePick' ? String(saved.verse) : '');
  if (block.kind === 'prose') return <Text style={styles.text}>{localized(block.text, language)}</Text>;
  if (block.kind === 'passage') {
    return (
      <View style={styles.card}>
        {block.note ? <Text style={styles.muted}>{localized(block.note, language)}</Text> : null}
        <Button styles={styles} text={label.openThisVerse} onPress={() => onPassage(block.ref.bookId, block.ref.chapter, block.ref.verses?.[0] ?? 1)} />
      </View>
    );
  }
  const prompt = localized(block.question.prompt, language);
  if (block.question.type === 'choice') {
    return (
      <View style={styles.card}>
        <Text style={styles.text}>{prompt}</Text>
        {block.question.options.map((option) => {
          const on = picked.includes(option.id);
          return (
            <Button
              key={option.id}
              styles={styles}
              on={on}
              text={localized(option.text, language)}
              onPress={() => {
                const next = block.question.type === 'choice' && block.question.multiple
                  ? (on ? picked.filter((id) => id !== option.id) : [...picked, option.id])
                  : [option.id];
                setPicked(next);
                onAnswer({ type: 'choice', optionIds: next });
              }}
            />
          );
        })}
      </View>
    );
  }
  if (block.question.type === 'checklist') {
    return (
      <View style={styles.card}>
        <Text style={styles.text}>{prompt}</Text>
        {block.question.items.map((item) => {
          const on = picked.includes(item.id);
          return (
            <Button
              key={item.id}
              styles={styles}
              on={on}
              text={localized(item.text, language)}
              onPress={() => {
                const next = on ? picked.filter((id) => id !== item.id) : [...picked, item.id];
                setPicked(next);
                onAnswer({ type: 'checklist', itemIds: next });
              }}
            />
          );
        })}
      </View>
    );
  }
  if (block.question.type === 'scale') {
    const values: number[] = [];
    for (let n = block.question.min; n <= block.question.max; n += 1) values.push(n);
    return (
      <View style={styles.card}>
        <Text style={styles.text}>{prompt}</Text>
        <View style={styles.row}>
          {values.map((n) => (
            <Button key={n} styles={styles} on={scale === String(n)} text={String(n)} onPress={() => { setScale(String(n)); onAnswer({ type: 'scale', value: n }); }} />
          ))}
        </View>
      </View>
    );
  }
  if (block.question.type === 'versePick') {
    const within = block.question.within;
    return (
      <View style={styles.card}>
        <Text style={styles.text}>{prompt}</Text>
        <TextInput style={styles.input} value={verse} onChangeText={setVerse} keyboardType="number-pad" />
        <Button
          styles={styles}
          text={label.send}
          onPress={() => {
            const n = Number(verse);
            if (!n || !within) return;
            onAnswer({ type: 'versePick', bookId: within.bookId, chapter: within.chapter, verse: n });
          }}
        />
      </View>
    );
  }
  return (
    <View style={styles.card}>
      <Text style={styles.text}>{prompt}</Text>
      <TextInput style={styles.area} value={text} onChangeText={setText} placeholder={block.question.placeholder ? localized(block.question.placeholder, language) : ''} placeholderTextColor="#8a8175" multiline />
      <Button styles={styles} text={label.send} onPress={() => onAnswer({ type: 'free', text: text.trim() })} />
      {saved && saved.type === 'free' ? <Text style={styles.muted}>{saved.text}</Text> : null}
    </View>
  );
}
