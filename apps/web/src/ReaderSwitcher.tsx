import { useState } from 'react';
import type { WordApp } from '@the-word/core';
import { addReader, checkPin, removeReader, renameReader, setPin, type Reader, type ReaderState } from './readers';

// Several people on one device. Badges and progress follow whoever is reading,
// and a PIN keeps a sibling out of somebody's notes — weak against a determined
// person holding the tablet, which the hint says out loud, but correctly sized
// for the actual threat. See docs/study-plans-framework.md §14b.
export function ReaderSwitcher({
  state, active, label, onChange,
}: {
  state: ReaderState;
  active: Reader;
  label: WordApp['label'];
  onChange: (next: ReaderState) => void;
}) {
  const [name, setName] = useState('');
  const [pin, setPinValue] = useState('');
  const [challenge, setChallenge] = useState<Reader | null>(null);
  const [attempt, setAttempt] = useState('');
  const [error, setError] = useState('');

  function choose(reader: Reader) {
    if (reader.id === active.id) return;
    if (reader.pinHash) { setChallenge(reader); setAttempt(''); setError(''); return; }
    onChange({ ...state, activeId: reader.id });
  }

  function unlock() {
    if (!challenge) return;
    if (!checkPin(challenge, attempt)) { setError(label.readerPinWrong); return; }
    onChange({ ...state, activeId: challenge.id });
    setChallenge(null);
    setAttempt('');
  }

  return (
    <div className="prefs-field">
      <span className="section-label">{label.readers}</span>
      <div className="reader-chips">
        {state.readers.map((reader) => (
          <button
            key={reader.id}
            type="button"
            className={reader.id === active.id ? 'reader-chip active' : 'reader-chip'}
            aria-pressed={reader.id === active.id}
            onClick={() => choose(reader)}
          >
            <span className="reader-dot" style={{ background: reader.color }} aria-hidden="true">{reader.name.slice(0, 1)}</span>
            <span>{reader.name}</span>
            {reader.pinHash ? <span aria-label={label.readerPin}>🔒</span> : null}
          </button>
        ))}
      </div>

      {challenge ? (
        <div className="reader-unlock">
          <label>{label.readerPinFor.replace('{name}', challenge.name)}
            <input type="password" inputMode="numeric" value={attempt} onChange={(event) => { setAttempt(event.target.value); setError(''); }} />
          </label>
          <div className="verse-note-actions">
            <button type="button" onClick={unlock}>{label.readerUnlock}</button>
            <button type="button" onClick={() => { setChallenge(null); setError(''); }}>{label.closeNote}</button>
          </div>
          {error ? <p className="muted" role="alert">{error}</p> : null}
        </div>
      ) : null}

      <div className="reader-add">
        <input value={name} placeholder={label.readerName} maxLength={40} onChange={(event) => setName(event.target.value)} />
        <button type="button" disabled={!name.trim()} onClick={() => { onChange(addReader(state, name)); setName(''); }}>
          {label.addReader}
        </button>
      </div>

      <div className="reader-add">
        <input
          type="password"
          inputMode="numeric"
          value={pin}
          placeholder={label.readerSetPin.replace('{name}', active.name)}
          onChange={(event) => setPinValue(event.target.value)}
        />
        <button type="button" onClick={() => { onChange(setPin(state, active.id, pin)); setPinValue(''); }}>
          {pin ? label.readerPinSet : label.readerPinClear}
        </button>
      </div>
      <p className="muted">{label.readerPinHint}</p>

      {state.readers.length > 1 ? (
        <div className="verse-note-actions">
          <button type="button" onClick={() => onChange(renameReader(state, active.id, active.name))} hidden>rename</button>
          <button type="button" onClick={() => onChange(removeReader(state, active.id))}>
            {label.removeReader.replace('{name}', active.name)}
          </button>
        </div>
      ) : null}
      <p className="muted">{label.readersHint}</p>
    </div>
  );
}
