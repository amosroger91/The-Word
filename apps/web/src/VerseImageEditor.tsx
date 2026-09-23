import { useEffect, useMemo, useRef, useState } from 'react';
import {
  backgroundById,
  backgroundForSeed,
  draftForBackground,
  loadVerseImage,
  loadVerseImageFonts,
  paintVerseImage,
  verseImageDownloadName,
  verseImageFont,
  verseBackgrounds,
  verseImageFontRange,
  verseImageFormat,
  verseImageFormats,
  verseTextColors,
  type Strings,
  type VerseImageDraft,
  type VerseImageStyle,
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
  onShared,
  embedded = false,
}: {
  embedded?: boolean;
  job: VerseImageJob;
  fontStack: string;
  label: Strings;
  onClose: () => void;
  onSaved?: () => void;
  onShared?: () => void;
}) {
  const base = import.meta.env.BASE_URL;
  const [draft, setDraft] = useState<VerseImageDraft>(() => draftForBackground(backgroundForSeed(job.seed || job.reference)));
  const [saving, setSaving] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');
  const [fittedSize, setFittedSize] = useState(draft.fontSize);
  const previewRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<{ src: string; image: HTMLImageElement | null } | null>(null);
  const background = backgroundById(draft.backgroundId);
  const format = verseImageFormat(draft.format);
  const src = `${base}backgrounds/${background.file}`;

  const input = useMemo(() => ({
    reference: job.reference,
    text: job.text,
    translation: job.translation,
    background: '#111111',
    textColor: draft.textColor,
    accent: '#947849',
    style: draft.style,
    fontStack: verseImageFont(fontStack),
    fontSize: draft.fontSize,
    overlayOpacity: draft.overlayOpacity,
    brand: label.imageBrand,
    edition: label.imageEdition,
    tooLong: label.imageTooLong,
  }), [draft.fontSize, draft.overlayOpacity, draft.textColor, draft.style, fontStack, job, label.imageBrand, label.imageEdition, label.imageTooLong]);

  useEffect(() => {
    let active = true;
    setReady(false); setError('');
    const backgroundImage = imageRef.current?.src === src ? Promise.resolve(imageRef.current.image) : loadVerseImage(src).catch(() => null);
    void Promise.all([backgroundImage, loadVerseImageFonts(input.fontStack)]).then(([image]) => {
      if (!active) return;
      imageRef.current = { src, image };
      const canvas = previewRef.current;
      const ctx = canvas?.getContext('2d');
      if (!canvas || !ctx) throw new Error('Image preview is unavailable.');
      canvas.width = format.width; canvas.height = format.height;
      const layout = paintVerseImage(ctx, input, image);
      setFittedSize(layout.fontSize); setReady(true);
    }).catch((cause) => {
      if (active) setError(cause instanceof Error ? cause.message : 'Could not prepare this image.');
    });
    return () => { active = false; };
  }, [src, input, format.width, format.height]);

  function pickStyle(style: VerseImageStyle) {
    setReady(false);
    setDraft(current => ({ ...current, style, textColor: style === 'paper' ? '#26332d' : '#fff9ed', overlayOpacity: style === 'paper' ? 0.08 : 0.34 }));
  }

  function pickBackground(id: string) {
    setReady(false);
    setDraft((current) => ({ ...current, backgroundId: id }));
  }

  // Web Share Level 2 (files) is not everywhere — probe once so the button only
  // appears where the share sheet can actually take an image.
  const [canShareFiles] = useState(() => {
    if (typeof navigator === 'undefined' || typeof navigator.canShare !== 'function') return false;
    try {
      return navigator.canShare({ files: [new File([new Blob([], { type: 'image/png' })], 'probe.png', { type: 'image/png' })] });
    } catch {
      return false;
    }
  });

  async function shareImage() {
    const canvas = previewRef.current;
    if (!canvas || !ready || saving) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>((resolve) => { canvas.toBlob(resolve, 'image/png'); });
      if (!blob) throw new Error('Could not prepare the PNG. Try Save image.');
      await navigator.share({
        files: [new File([blob], verseImageDownloadName(job.filename, format.id), { type: 'image/png' })],
        title: job.reference,
        text: `${job.reference} (${job.translation})`,
      });
    } catch (error) {
      // Backing out of the share sheet is not a failure, and records nothing.
      if ((error as { name?: string }).name === 'AbortError') return;
      setError('Sharing is unavailable. Use Save image to download your artwork.');
      return;
    } finally {
      setSaving(false);
    }
    onShared?.();
    onClose();
  }

  async function save() {
    const canvas = previewRef.current;
    if (!canvas || !ready || saving) return;
    setSaving(true);
    try {
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Could not prepare the PNG. Please try again.');
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.download = verseImageDownloadName(job.filename, format.id); link.href = href;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(href), 60_000);
      onSaved?.(); onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the image.');
    } finally { setSaving(false); }
  }

  return (
    <div className={embedded ? "image-editor-embedded" : "image-editor-backdrop"} role={embedded ? "region" : "dialog"} aria-label={label.createImage}>
      <div className="image-editor">
        <div className="image-editor-header">
          <h2>{label.createImage}</h2>
          <button type="button" onClick={onClose} aria-label={label.closeEditor}>×</button>
        </div>
        <div className="image-editor-artboard" aria-busy={!ready&&!error}>
          <canvas ref={previewRef} className="image-editor-preview" width={format.width} height={format.height} aria-label={`${job.reference} — ${job.text}`} role="img" />
          {!ready&&!error&&<span className="image-editor-loading" role="status">{label.loading}</span>}
        </div>
        <div className="image-editor-caption"><span>{job.reference}</span><span>{format.width} × {format.height} · PNG</span></div>
        {error&&<p className="image-editor-error" role="alert">{error}</p>}
        <div className="image-editor-controls">
          <div className="image-editor-formats" role="group" aria-label={label.imageFormat}>
            {verseImageFormats.map((item) => (
              <button key={item.id} type="button" className={format.id === item.id ? 'active' : ''} aria-pressed={format.id === item.id} onClick={() => setDraft((current) => ({ ...current, format: item.id }))} disabled={saving}>
                {item.id === 'share' ? label.imageShare : item.id === 'phone' ? label.imagePhone : label.imageDesktop}
                <small>{item.width} × {item.height}</small>
              </button>
            ))}
          </div>
          <div className="image-editor-styles" role="group" aria-label={label.imageStyle}>
            <button className={draft.style==='paper'?'active':''} aria-pressed={draft.style==='paper'} onClick={()=>pickStyle('paper')}><span className="image-style-sample paper"/>{label.imagePaper}</button>
            <button className={draft.style==='photograph'?'active':''} aria-pressed={draft.style==='photograph'} onClick={()=>pickStyle('photograph')}><span className="image-style-sample photograph"/>{label.imagePhotograph}</button>
          </div>
          <span className="section-label">{label.background}</span>
          <div className="image-editor-thumbs">
            {verseBackgrounds.map((item) => (
              <button
                key={item.id}
                type="button"
                className={item.id === draft.backgroundId ? 'thumb active' : 'thumb'}
                onClick={() => pickBackground(item.id)}
                aria-pressed={item.id === draft.backgroundId}
                disabled={saving}
                title={item.name}
                style={{ backgroundImage: `url(${base}backgrounds/${item.file})` }}
              >
                <span>{item.name}</span>
              </button>
            ))}
          </div>
          <label className="image-editor-field">
            <span className="section-label">{label.textSize} · {fittedSize}px</span>
            <input aria-label={label.textSize} type="range" min={verseImageFontRange.min} max={verseImageFontRange.max} value={draft.fontSize} onChange={(event) => setDraft((current) => ({ ...current, fontSize: Number(event.target.value) }))} />
            <small className="image-editor-hint">{label.imageAutoFit}</small>
          </label>
          <div className="image-editor-field">
            <span className="section-label">{label.textColor}</span>
            <div className="image-editor-colors">
              {verseTextColors.map((color) => (
                <button key={color} type="button" className={draft.textColor === color ? 'swatch active' : 'swatch'} style={{ background: color }} onClick={() => setDraft((current) => ({ ...current, textColor: color }))} aria-label={color} aria-pressed={draft.textColor === color} />
              ))}
              <input type="color" value={draft.textColor} onChange={(event) => setDraft((current) => ({ ...current, textColor: event.target.value }))} aria-label={label.textColor} />
            </div>
          </div>
          <label className="image-editor-field">
            <span className="section-label">{label.overlay} · {Math.round(draft.overlayOpacity * 100)}%</span>
            <input type="range" min={0} max={80} value={Math.round(draft.overlayOpacity * 100)} onChange={(event) => setDraft((current) => ({ ...current, overlayOpacity: Number(event.target.value) / 100 }))} />
          </label>
          <div className="image-editor-actions">
            {canShareFiles && <button type="button" className="image-editor-send" onClick={() => { void shareImage(); }} disabled={saving||!ready}>{label.sendImage}</button>}
            <button type="button" className="image-editor-save" onClick={() => { void save(); }} disabled={saving||!ready}>{saving ? label.exporting : label.saveImage}</button>
          </div>
        </div>
      </div>
    </div>
  );
}
