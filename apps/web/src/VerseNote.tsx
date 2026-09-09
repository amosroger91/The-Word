import { useEffect, useRef, useState } from 'react';
import type { WordApp } from '@the-word/core';
import type { NoteEvent } from './ledger';

// One note against one verse. Private by default: sharing is a deliberate tick,
// because a note on Scripture is often the most personal thing in the app.
export function VerseNote({
  reference, existing, label, onSave, onDelete, onClose,
}: {
  reference: string;
  existing: NoteEvent | null;
  label: WordApp['label'];
  onSave: (text: string, share: 'private' | 'friends') => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(existing?.text ?? '');
  const [share, setShare] = useState(existing?.share === 'friends');
  const areaRef = useRef<HTMLTextAreaElement>(null);

  // Focus once on open. Anything that re-ran this would steal the caret back
  // from the reader mid-sentence.
  useEffect(() => { areaRef.current?.focus(); }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const dirty = text.trim() !== (existing?.text ?? '') || share !== (existing?.share === 'friends');

  return (
    <div className="verse-note" role="dialog" aria-label={`${label.noteFor} ${reference}`}>
      <div className="verse-note-header">
        <strong>{reference}</strong>
        <button type="button" onClick={onClose} aria-label={label.closeNote}>×</button>
      </div>
      <textarea
        ref={areaRef}
        value={text}
        maxLength={2000}
        placeholder={label.notePlaceholder}
        aria-label={label.noteFor}
        onChange={(event) => setText(event.target.value)}
      />
      <label className="verse-note-share">
        <input type="checkbox" checked={share} onChange={(event) => setShare(event.target.checked)} />
        <span>{label.shareWithFriends}</span>
      </label>
      <p className="muted">{share ? label.noteSharedHint : label.notePrivateHint}</p>
      <div className="verse-note-actions">
        <button type="button" disabled={!text.trim() || !dirty} onClick={() => onSave(text, share ? 'friends' : 'private')}>
          {label.saveNote}
        </button>
        {existing ? <button type="button" onClick={onDelete}>{label.deleteNote}</button> : null}
      </div>
    </div>
  );
}
