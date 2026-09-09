import { useEffect, useState } from 'react';
import { localBible } from '@the-word/bible';
import type { Language, WordApp } from '@the-word/core';
import { latestAnswers, type AnswerValue } from './ledger';
import { localized, type PlanBlock, type StudyPlan } from './plans';
import type { useStudy } from './useStudy';

type Tab = 'plans' | 'circles' | 'feed' | 'friends';

export function StudyHub({
  app,
  study,
  onOpenPassage,
  onReadTogether,
  onSharedVerse,
}: {
  app: WordApp;
  study: ReturnType<typeof useStudy>;
  onOpenPassage: (bookId: number, chapter: number, verse?: number) => void;
  onReadTogether: () => void;
  onSharedVerse?: (bookId: number, chapter: number, verse: number) => void;
}) {
  const { label, language } = app;
  const [tab, setTab] = useState<Tab>('plans');
  const [plan, setPlan] = useState<StudyPlan | null>(null);
  const [sessionId, setSessionId] = useState('');
  const [circleName, setCircleName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [friendKey, setFriendKey] = useState('');
  const [dmTo, setDmTo] = useState('');
  const [dmText, setDmText] = useState('');
  const [shareNote, setShareNote] = useState('');

  useEffect(() => { void study.loadPlans(); }, []);

  const session = plan?.sessions.find((row) => row.id === sessionId) ?? plan?.sessions[0];

  return (
    <div className="study-hub">
      <span className="workspace-eyebrow">{label.study}</span>
      <h2>{label.study}</h2>
      <p className="muted">{relayCopy(study.relayState, Boolean(study.membership), label)}</p>
      <div className="study-tabs">
        {(['plans', 'circles', 'feed', 'friends'] as Tab[]).map((id) => (
          <button key={id} type="button" aria-pressed={tab === id} onClick={() => setTab(id)}>
            {id === 'plans' ? label.plans : id === 'circles' ? label.circles : id === 'feed' ? label.feed : label.friends}
          </button>
        ))}
      </div>

      {tab === 'plans' && (
        plan && session ? (
          <PlanSessionView
            app={app}
            plan={plan}
            sessionId={session.id}
            language={language}
            study={study}
            onOpenPassage={onOpenPassage}
            onBack={() => { setPlan(null); setSessionId(''); }}
          />
        ) : (
          <div className="plan-list">
            <p>{label.planHint}</p>
            {study.plans.map((item) => (
              <button type="button" className="plan-card" key={item.id} onClick={() => { setPlan(item); setSessionId(item.sessions[0]?.id || ''); }}>
                <strong>{localized(item.title, language)}</strong>
                <small>{localized(item.summary, language)}</small>
              </button>
            ))}
            {!study.plans.length ? <p className="muted">{label.noPlans}</p> : null}
          </div>
        )
      )}

      {tab === 'circles' && (
        <div className="circle-list">
          <label>{label.circleName}<input value={circleName} onChange={(event) => setCircleName(event.target.value)} /></label>
          <div className="prefs-account-actions">
            <button type="button" onClick={() => { void study.createCircle(circleName || label.circleSolo, 'solo'); setCircleName(''); }}>{label.createCircle}</button>
          </div>
          <label>{label.joinCircle}<input value={joinCode} onChange={(event) => setJoinCode(event.target.value)} /></label>
          <button type="button" onClick={() => { void study.joinCircle(joinCode); setJoinCode(''); }}>{label.joinCircle}</button>
          {study.circles.map((circle) => (
            <article key={circle.id} className="circle-card">
              <strong>{circle.name}</strong>
              <small>{circle.kind} · {circle.pace} · {label.inviteCode} {circle.code}</small>
              <p>{circle.members.map((member) => member.name).join(', ')}</p>
              {circle.pace === 'together' ? <button type="button" onClick={onReadTogether}>{label.readTogether}</button> : null}
            </article>
          ))}
        </div>
      )}

      {tab === 'feed' && (
        <div className="feed-list">
          <label>{label.shareVerse}
            <input value={shareNote} onChange={(event) => setShareNote(event.target.value)} placeholder={label.messagePlaceholder} />
          </label>
          <button type="button" onClick={() => { const verse = app.focusedVerse ?? 1; void study.shareVerse(app.bookId, app.chapterNumber, verse, shareNote); onSharedVerse?.(app.bookId, app.chapterNumber, verse); setShareNote(''); }}>{label.shareVerse}</button>
          {study.feed.length ? study.feed.map((item) => (
            <article key={item.id} className="feed-card">
              <strong>{item.name}</strong>
              <small>{item.kind === 'verse' && item.bookId ? `${localBible.getBook(item.bookId, app.translationId)?.name ?? ''} ${item.chapter}:${item.verse}` : item.badgeId || item.kind}</small>
              {item.note ? <p>{item.note}</p> : null}
            </article>
          )) : <p className="muted">{label.feedEmpty}</p>}
        </div>
      )}

      {tab === 'friends' && (
        <div className="friend-list">
          <label>{label.friendNpub}<input value={friendKey} onChange={(event) => setFriendKey(event.target.value)} /></label>
          <button type="button" onClick={() => { if (friendKey.trim()) void study.addFriend(friendKey.trim()); setFriendKey(''); }}>{label.addFriend}</button>
          <ul>{study.friends.map((friend) => <li key={friend.npub}>{friend.npub}</li>)}</ul>
          <h3>{label.directMessages}</h3>
          <label>{label.friendNpub}<input value={dmTo} onChange={(event) => setDmTo(event.target.value)} /></label>
          <textarea value={dmText} onChange={(event) => setDmText(event.target.value)} placeholder={label.messagePlaceholder} />
          <button type="button" onClick={() => { if (dmTo && dmText.trim()) void study.sendMessage(dmTo, dmText.trim()); setDmText(''); }}>{label.send}</button>
          {study.messages.map((message) => (
            <article key={message.id} className="feed-card">
              <strong>{message.from === study.account.npub ? label.youSuffix : message.from}</strong>
              <p>{message.text}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

function relayCopy(state: 'off' | 'down' | 'ok', member: boolean, label: WordApp['label']) {
  if (state === 'off') return label.relayNone;
  if (state === 'down') return label.relayDown;
  return member ? label.membershipOk : label.membershipPending;
}

function PlanSessionView({
  app,
  plan,
  sessionId,
  language,
  study,
  onOpenPassage,
  onBack,
}: {
  app: WordApp;
  plan: StudyPlan;
  sessionId: string;
  language: Language;
  study: ReturnType<typeof useStudy>;
  onOpenPassage: (bookId: number, chapter: number, verse?: number) => void;
  onBack: () => void;
}) {
  const session = plan.sessions.find((row) => row.id === sessionId);
  const answers = latestAnswers(study.events);
  if (!session) return null;
  return (
    <div className="plan-session">
      <button type="button" onClick={onBack}>{app.label.previous}</button>
      <h3>{localized(plan.title, language)}</h3>
      <p>{localized(session.title, language)}</p>
      {session.blocks.map((block) => (
        <BlockView
          key={block.id}
          block={block}
          language={language}
          label={app.label}
          saved={answers.get(`${plan.id}:${session.id}:${block.id}`)?.value ?? undefined}
          onPassage={onOpenPassage}
          onAnswer={(value) => { void study.answer(plan.id, session.id, block.id, value, study.circles[0]?.id, study.circles[0] ? 'circle' : 'private'); }}
        />
      ))}
      <button type="button" className="primary" onClick={() => { void study.finishSession(plan.id, session.id, study.circles[0]?.id); if (sessionId === plan.sessions[plan.sessions.length - 1]?.id) void study.finishPlan(plan.id, study.circles[0]?.id); }}>{app.label.completeSession}</button>
    </div>
  );
}

function BlockView({
  block,
  language,
  label,
  saved,
  onPassage,
  onAnswer,
}: {
  block: PlanBlock;
  language: Language;
  label: WordApp['label'];
  saved?: AnswerValue;
  onPassage: (bookId: number, chapter: number, verse?: number) => void;
  onAnswer: (value: AnswerValue) => void;
}) {
  const [text, setText] = useState(saved && saved.type === 'free' ? saved.text : '');
  const [verse, setVerse] = useState(saved && saved.type === 'versePick' ? String(saved.verse) : '');
  if (block.kind === 'prose') return <p>{localized(block.text, language)}</p>;
  if (block.kind === 'passage') {
    return (
      <p>
        <button type="button" onClick={() => onPassage(block.ref.bookId, block.ref.chapter, block.ref.verses?.[0] ?? 1)}>{label.openThisVerse}</button>
      </p>
    );
  }
  const prompt = localized(block.question.prompt, language);
  if (block.question.type === 'versePick') {
    return (
      <label>{prompt}
        <input value={verse} onChange={(event) => setVerse(event.target.value)} inputMode="numeric" />
        <button type="button" onClick={() => {
          const n = Number(verse);
          if (!n) return;
          onAnswer({ type: 'versePick', bookId: block.question.type === 'versePick' ? block.question.within?.bookId ?? 43 : 43, chapter: block.question.type === 'versePick' ? block.question.within?.chapter ?? 1 : 1, verse: n });
        }}>{label.send}</button>
      </label>
    );
  }
  return (
    <label>{prompt}
      <textarea value={text} onChange={(event) => setText(event.target.value)} />
      <button type="button" onClick={() => onAnswer({ type: 'free', text: text.trim() })}>{label.send}</button>
      {saved && saved.type === 'free' ? <small>{saved.text}</small> : null}
    </label>
  );
}
