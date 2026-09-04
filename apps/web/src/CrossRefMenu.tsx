import { useEffect, useState } from 'react';
import { bookNameFor, formatCrossRef, localBible, type CrossReference } from '@the-word/bible';
import type { WordApp } from '@the-word/core';

export function CrossRefMenu({
  app,
  verse,
  refs,
  x,
  y,
  onClose,
  onSelect,
}: {
  app: WordApp;
  verse: number;
  refs: CrossReference[];
  x: number;
  y: number;
  onClose: () => void;
  onSelect: (ref: CrossReference) => void;
}) {
  const { label, books, translationId, bookName, chapterNumber } = app;
  const [texts, setTexts] = useState<Record<string, string>>({});

  useEffect(() => {
    function onPointer(event: MouseEvent) {
      const target = event.target as HTMLElement;
      if (!target.closest?.('.xref-menu') && !target.closest?.('.xref-mark')) onClose();
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

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

  const left = Math.max(12, Math.min(x, window.innerWidth - 352));
  const top = y + 8 > window.innerHeight - 280 ? Math.max(12, y - 288) : y + 8;

  return (
    <div className="xref-menu" role="dialog" aria-label={label.crossReferences} style={{ top, left }}>
      <div className="xref-menu-header">
        <strong>{label.crossReferences}</strong>
        <span>{bookName} {chapterNumber}:{verse}</span>
        <button type="button" onClick={onClose} aria-label={label.closeCrossReferences}>×</button>
      </div>
      {refs.length ? refs.map((ref) => {
        const key = `${ref.bookId}:${ref.chapter}:${ref.verse}`;
        return (
          <button type="button" className="xref-item" key={key} onClick={() => onSelect(ref)}>
            <strong>{formatCrossRef(ref, bookNameFor(ref.bookId, books))}</strong>
            {texts[key] ? <span>{texts[key]}</span> : null}
          </button>
        );
      }) : <p className="muted">{label.noCrossReferences}</p>}
      <p className="xref-credit">{label.crossReferenceCredit}</p>
    </div>
  );
}
