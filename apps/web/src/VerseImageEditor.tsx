import { useEffect, useMemo, useRef, useState } from 'react';
import {
  backgroundById,
  backgroundForSeed,
  draftForBackground,
  overlayFor,
  loadVerseImage,
  paintVerseImage,
  verseBackgrounds,
  verseImageFontRange,
  verseImageSize,
  verseTextColors,
  type Strings,
  type VerseImageDraft,
} from '@the-word/core';

export interface VerseImageJob {
  reference: string;
  text: string;
  translation: string;
  filename: string;
  seed?: string;
}

export function VerseImageEditor({
  job,
  fontStack,
  label,
  onClose,
  onSaved,
}: {
  job: VerseImageJob;
  fontStack: string;
  label: Strings;
  onClose: () => void;
  onSaved?: () => void;
}) {
  const base = import.meta.env.BASE_URL;
  const [draft, setDraft] = useState<VerseImageDraft>(() => draftForBackground(backgroundForSeed(job.seed || job.reference)));
  const [saving, setSaving] = useState(false);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const background = backgroundById(draft.backgroundId);
  const src = `${base}backgrounds/${background.file}`;

  const input = useMemo(() => ({
    reference: job.reference,
    text: job.text,
    translation: job.translation,
    background: '#111111',
    textColor: draft.textColor,
    accent: '#947849',
    fontStack,
    fontSize: draft.fontSize,
    overlayOpacity: draft.overlayOpacity,
  }), [draft.fontSize, draft.overlayOpacity, draft.textColor, fontStack, job]);
  const inputRef = useRef(input);
  inputRef.current = input;

  function paint() {
    const canvas = previewRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    canvas.width = verseImageSize.width;
    canvas.height = verseImageSize.height;
    paintVerseImage(ctx, inputRef.current, imageRef.current);
  }

  useEffect(() => {
    let active = true;
    imageRef.current = null;
    void loadVerseImage(src).then((image) => {
      if (!active) return;
      imageRef.current = image;
      paint();
    }).catch(() => {
      if (active) paint();
    });
    return () => { active = false; };
  }, [src]);

  useEffect(() => { paint(); }, [input]);

  function pickBackground(id: string) {
    const next = backgroundById(id);
    setDraft((current) => ({
      ...current,
      backgroundId: next.id,
      overlayOpacity: overlayFor(next.kind),
    }));
  }

  async function save() {
    const canvas = previewRef.current;
    if (!canvas) return;
    setSaving(true);
    if (!imageRef.current) {
      try { imageRef.current = await loadVerseImage(src); paint(); } catch { /* keep fallback fill */ }
    } else paint();
    const link = document.createElement('a');
    link.download = job.filename;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setSaving(false);
    onSaved?.();
    onClose();
  }

  return (
    <div className="image-editor-backdrop" role="dialog" aria-label={label.createImage}>
      <div className="image-editor">
        <div className="image-editor-header">
          <h2>{label.createImage}</h2>
          <button type="button" onClick={onClose} aria-label={label.closeEditor}>×</button>
        </div>
        <canvas ref={previewRef} className="image-editor-preview" width={verseImageSize.width} height={verseImageSize.height} />
        <div className="image-editor-controls">
          <span className="section-label">{label.background}</span>
          <div className="image-editor-thumbs">
            {verseBackgrounds.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === draft.backgroundId ? 'thumb active' : 'thumb'}
                onClick={() => pickBackground(item.id)}
                title={item.name}
                style={{ backgroundImage: `url(${base}backgrounds/${item.file})` }}
              >
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <label className="image-editor-field">
            <span className="section-label">{label.textSize} · {draft.fontSize}px</span>
            <input type="range" min={verseImageFontRange.min} max={verseImageFontRange.max} value={draft.fontSize} onChange={(event) => setDraft((current) => ({ ...current, fontSize: Number(event.target.value) }))} />
          </label>
          <div className="image-editor-field">
            <span className="section-label">{label.textColor}</span>
            <div className="image-editor-colors">
              {verseTextColors.map((color) => (
                <button key={color} type="button" className={draft.textColor === color ? 'swatch active' : 'swatch'} style={{ background: color }} onClick={() => setDraft((current) => ({ ...current, textColor: color }))} aria-label={color} />
              ))}
              <input type="color" value={draft.textColor} onChange={(event) => setDraft((current) => ({ ...current, textColor: event.target.value }))} aria-label={label.textColor} />
            </div>
          </div>
          <label className="image-editor-field">
            <span className="section-label">{label.overlay} · {Math.round(draft.overlayOpacity * 100)}%</span>
            <input type="range" min={0} max={80} value={Math.round(draft.overlayOpacity * 100)} onChange={(event) => setDraft((current) => ({ ...current, overlayOpacity: Number(event.target.value) / 100 }))} />
          </label>
          <button type="button" className="image-editor-save" onClick={() => { void save(); }} disabled={saving}>{saving ? label.exporting : label.saveImage}</button>
        </div>
      </div>
    </div>
  );
}
