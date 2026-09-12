import { useEffect, useRef, useState } from 'react';
import type { PartyAnswer, PartyQuestion, SharedAnswers } from './readParty';

/**
 * The question the host has put to the room, as a modal over the reader.
 *
 * Deliberately dismissible: someone who does not want to answer should be able
 * to keep reading. "Not now" sends nothing and simply closes it for them.
 */
export function QuestionPrompt({
  question,
  onAnswer,
  onSkip,
}: {
  question: PartyQuestion;
  onAnswer: (text: string) => void;
  onSkip: () => void;
}) {
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // A new question gets a clean box and the caret, without stealing focus
  // again on every keystroke.
  useEffect(() => {
    setText('');
    inputRef.current?.focus();
  }, [question.id]);

  function submit() {
    const clean = text.trim();
    if (clean) onAnswer(clean);
  }

  return (
    <div className="question-backdrop" role="dialog" aria-modal="true" aria-label="A question for the group">
      <div className="question-card">
        <span className="workspace-eyebrow">The host asked</span>
        <h2>{question.text}</h2>
        <textarea
          ref={inputRef}
          value={text}
          maxLength={2000}
          rows={4}
          placeholder="Your answer…"
          aria-label="Your answer"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            // Enter sends; Shift+Enter makes a new line.
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); submit(); }
          }}
        />
        <div className="question-actions">
          <button type="button" onClick={onSkip}>Not now</button>
          <button type="button" className="primary" disabled={!text.trim()} onClick={submit}>Send answer</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Answers the host has chosen to put on everyone's screen. Stays up until the
 * host stops sharing, so it is a panel rather than a modal — people can still
 * read while it is showing.
 */
export function AnswerBoard({ shared, isHost, onStop }: { shared: SharedAnswers; isHost: boolean; onStop?: () => void }) {
  return (
    <section className="answer-board" aria-label="Shared answers">
      <div className="answer-board-head">
        <div>
          <span className="workspace-eyebrow">Answers</span>
          <strong>{shared.question}</strong>
        </div>
        {isHost && onStop ? <button type="button" onClick={onStop}>Stop sharing</button> : null}
      </div>
      {shared.items.length ? (
        <ul className="answer-list">
          {shared.items.map((answer) => (
            <li key={answer.memberId}>
              <span className="answer-who" style={{ color: answer.color }}>{answer.name}</span>
              <span className="answer-text">{answer.text}</span>
            </li>
          ))}
        </ul>
      ) : <p className="muted">No answers yet.</p>}
    </section>
  );
}

/** Host-side controls: ask, watch replies land, then put them on screen. */
export function HostQuestionPanel({
  question,
  answers,
  sharing,
  onAsk,
  onClose,
  onShare,
}: {
  question: PartyQuestion | null;
  answers: PartyAnswer[];
  sharing: boolean;
  onAsk: (text: string) => void;
  onClose: () => void;
  onShare: (on: boolean) => void;
}) {
  const [draft, setDraft] = useState('');

  return (
    <div className="host-question">
      <h3>Ask the group</h3>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const clean = draft.trim();
          if (!clean) return;
          onAsk(clean);
          setDraft('');
        }}
      >
        <input
          value={draft}
          maxLength={300}
          placeholder="What stood out to you in this passage?"
          aria-label="Question for the group"
          onChange={(event) => setDraft(event.target.value)}
        />
        <button type="submit" disabled={!draft.trim()}>{question ? 'Ask a new one' : 'Ask'}</button>
      </form>

      {question ? (
        <>
          <p className="muted">Asked: “{question.text}” · {answers.length} {answers.length === 1 ? 'answer' : 'answers'}</p>
          <ul className="answer-list">
            {answers.map((answer) => (
              <li key={answer.memberId}>
                <span className="answer-who" style={{ color: answer.color }}>{answer.name}</span>
                <span className="answer-text">{answer.text}</span>
              </li>
            ))}
          </ul>
          {!answers.length ? <p className="muted">Waiting for answers…</p> : null}
          <div className="question-actions">
            <button type="button" onClick={onClose}>Close question</button>
            <button type="button" className="primary" onClick={() => onShare(!sharing)}>
              {sharing ? 'Stop sharing answers' : 'Share answers with group'}
            </button>
          </div>
        </>
      ) : <p className="muted">Ask a question and it appears on everyone’s screen.</p>}
    </div>
  );
}
