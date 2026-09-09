import { useEffect, useState } from 'react';
import { buildBreakdown, localBible, type VerseBreakdown, type VerseReference } from '@the-word/bible';
import type { WordApp } from '@the-word/core';
import { enableModel, generateSummary, modelStatus, onModelStatus, type GeneratedSummary } from './breakdown/client';
import { formatBytes, type ModelStatus } from './breakdown/model';

// The breakdown drawer. Every line on screen traces to bundled Scripture, and
// each one says which kind of statement it is — the verse itself, an
// observation about its shape, or a related passage. Nothing here interprets.

const CONFIDENCE_ORDER = { direct: 0, structured: 1, interpretive: 2 } as const;

export function Breakdown({
  app, target, onNavigate,
}: {
  app: WordApp;
  target: VerseReference | null;
  onNavigate: (bookId: number, chapter: number, verse: number) => void;
}) {
  const { label } = app;
  const [data, setData] = useState<VerseBreakdown | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState(false);
  const [model, setModel] = useState<ModelStatus>(modelStatus);
  const [phrased, setPhrased] = useState<GeneratedSummary | null>(null);

  useEffect(() => onModelStatus(setModel), []);

  // Phrasing runs only once the deterministic breakdown exists, and only when
  // the model is already loaded. The panel is complete without it.
  useEffect(() => {
    setPhrased(null);
    if (!data || model.phase !== 'ready') return;
    let cancelled = false;
    void generateSummary(data).then((result) => { if (!cancelled) setPhrased(result); });
    return () => { cancelled = true; };
  }, [data?.referenceLabel, model.phase]);

  useEffect(() => {
    if (!target) { setData(null); return; }
    let cancelled = false;
    setBusy(true);
    setError('');
    // Only translations already in memory unless the reader asks: pulling one
    // in is megabytes, and the panel should open instantly.
    const others = compare
      ? app.translations.map((item) => item.id).filter((id) => id !== app.translationId).slice(0, 3)
      : app.translations.map((item) => item.id).filter((id) => id !== app.translationId && localBible.isLoaded(id));
    void buildBreakdown({ translationId: app.translationId, reference: target, compareTranslations: others })
      .then((result) => { if (!cancelled) setData(result); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; };
  }, [target?.bookId, target?.chapter, target?.verse, app.translationId, compare]);

  if (!target) return <p className="muted">{label.breakdownPickVerse}</p>;
  if (error) return <div className="breakdown"><p className="breakdown-warning" role="alert">{error}</p></div>;
  if (!data) return <p className="muted" role="status">{busy ? label.breakdownWorking : label.breakdownWorking}</p>;

  const sorted = [...data.claims].sort((a, b) => CONFIDENCE_ORDER[a.confidence] - CONFIDENCE_ORDER[b.confidence]);

  return (
    <div className="breakdown">
      <section className="breakdown-section">
        <h3>{label.breakdownVerse}</h3>
        <p className="breakdown-ref">{data.referenceLabel}</p>
        <blockquote>{data.exactText}</blockquote>
        <p className="breakdown-source">{label.breakdownSourceLocal.replace('{translation}', data.translationName)}</p>
      </section>

      <section className="breakdown-section">
        <h3>{label.breakdownContext}</h3>
        <ol className="breakdown-window">
          {data.context.previous.map((verse) => (
            <li key={verse.ref.verse}><sup>{verse.ref.verse}</sup> {verse.text}</li>
          ))}
          <li className="current"><sup>{data.context.current.ref.verse}</sup> {data.context.current.text}</li>
          {data.context.next.map((verse) => (
            <li key={verse.ref.verse}><sup>{verse.ref.verse}</sup> {verse.text}</li>
          ))}
        </ol>
        <p className="breakdown-source">{label.breakdownChapterOf.replace('{count}', String(data.context.chapterVerseCount))}</p>
      </section>

      <section className="breakdown-section">
        <h3>{label.breakdownObservations}</h3>
        <ul className="breakdown-claims">
          {sorted.map((claim) => (
            <li key={claim.id} className={`claim-${claim.confidence}`}>
              <span className="claim-kind">{claim.confidence === 'direct' ? label.breakdownSays : label.breakdownShape}</span>
              <span>{claim.text}</span>
              <span className="breakdown-source">{claim.sources.map((source) => source.reference).join(' · ')}</span>
            </li>
          ))}
        </ul>
      </section>

      {data.crossReferences.length ? (
        <section className="breakdown-section">
          <h3>{label.breakdownRelated}</h3>
          <ul className="breakdown-refs">
            {data.crossReferences.map((row) => (
              <li key={row.reference}>
                <button type="button" onClick={() => onNavigate(row.bookId, row.chapter, row.verse)}>{row.reference}</button>
              </li>
            ))}
          </ul>
          <p className="breakdown-source">{label.crossReferenceCredit}</p>
        </section>
      ) : null}

      <section className="breakdown-section">
        <h3>{label.breakdownTranslations}</h3>
        {data.translations.length ? (
          <ul className="breakdown-translations">
            {data.translations.map((row) => (
              <li key={row.translationId}>
                <strong>{row.name}</strong>
                <span>{row.text}</span>
                {row.differs ? <em>{label.breakdownDiffers}</em> : <em>{label.breakdownSame}</em>}
              </li>
            ))}
          </ul>
        ) : <p className="muted">{label.breakdownNoComparison}</p>}
        {!compare ? (
          <button type="button" onClick={() => setCompare(true)}>{label.breakdownCompareMore}</button>
        ) : null}
      </section>

      <section className="breakdown-section">
        <h3>{label.breakdownQuestions}</h3>
        {model.phase === 'ready' && phrased?.questions.length ? (
          <>
            <ul className="breakdown-questions">
              {phrased.questions.map((question) => <li key={question}>{question}</li>)}
            </ul>
            <p className="breakdown-source">{label.breakdownGeneratedNote}</p>
          </>
        ) : (
          <p className="muted" role="status">{modelLine(model, label)}</p>
        )}
        {model.phase === 'off' ? (
          <button type="button" onClick={() => enableModel(true)}>{label.breakdownEnableModel}</button>
        ) : null}
      </section>

      <section className="breakdown-section">
        <h3>{label.breakdownSourceNotes}</h3>
        <p className="breakdown-source">{label.breakdownOnlySources}</p>
        {data.sourceWarnings.length || phrased?.rejected.length ? (
          <ul className="breakdown-warnings">
            {data.sourceWarnings.map((warning) => <li key={warning}>{warning}</li>)}
            {phrased?.rejected.map((warning) => <li key={warning}>{warning}</li>)}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

// One line describing where the optional formatter has got to. It is a status,
// never a blocker: everything above it renders regardless.
function modelLine(model: ModelStatus, label: WordApp['label']): string {
  switch (model.phase) {
    case 'ready': return label.breakdownModelReady;
    case 'checking': return label.breakdownModelPreparing;
    case 'downloading': return model.total
      ? label.breakdownModelDownloading.replace('{percent}', String(Math.round(model.progress * 100))).replace('{size}', formatBytes(model.total))
      : label.breakdownModelPreparing;
    case 'off': return label.breakdownModelOff;
    case 'unavailable': return label.breakdownModelUnavailable;
    default: return label.breakdownModelOff;
  }
}
