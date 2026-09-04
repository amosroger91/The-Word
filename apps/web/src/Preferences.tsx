import { useEffect, useRef, useState } from 'react';
import { readingFonts, type Language, type WordApp } from '@the-word/core';
import { SearchableSelect } from './SearchableSelect';

// Everything a reader sets once and forgets: how Scripture looks, how it sounds,
// and who they are to the rest of a Group Study.
export function Preferences({
  app,
  name,
  onNameChange,
  onClose,
}: {
  app: WordApp;
  name: string;
  onNameChange: (name: string) => void;
  onClose: () => void;
}) {
  const { label } = app;
  const panelRef = useRef<HTMLDivElement>(null);
  // The field keeps its own text so a half-typed (or briefly empty) name still
  // shows; only non-empty values are committed to the party identity.
  const [draft, setDraft] = useState(name);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const voiceLabel = (voice: { id: string; name: string; isDefault?: boolean }) => (
    voice.isDefault ? label.defaultVoice : voice.name
  );

  return (
    <div
      className="prefs-backdrop"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      <div className="prefs" role="dialog" aria-modal="true" aria-label={label.preferences} ref={panelRef} tabIndex={-1}>
        <div className="prefs-header">
          <h2>{label.preferences}</h2>
          <button type="button" onClick={onClose} aria-label={label.closePreferences}>×</button>
        </div>

        <div className="prefs-body">
          <div className="prefs-field">
            <span className="section-label">{label.interfaceLanguage}</span>
            <SearchableSelect
              value={app.language}
              onChange={(value) => app.changeLanguage(value as Language)}
              label={label.interfaceLanguage}
              filterPlaceholder={label.filterPlaceholder}
              options={app.languageOptions}
            />
          </div>

          <div className="prefs-field">
            <span className="section-label">{label.translation}</span>
            <SearchableSelect
              value={app.translationId}
              onChange={app.changeTranslation}
              label={label.translation}
              filterPlaceholder={label.filterPlaceholder}
              options={app.translationOptions}
            />
          </div>

          <div className="prefs-field">
            <span className="section-label">{label.font}</span>
            <SearchableSelect
              value={app.fontId}
              onChange={app.setFontId}
              label={label.font}
              filterPlaceholder={label.filterPlaceholder}
              options={readingFonts.map((font) => ({ value: font.id, label: font.name }))}
            />
          </div>

          <div className="prefs-field">
            <span className="section-label">{label.textSize} · {app.fontSize}px</span>
            <div className="prefs-stepper">
              <button type="button" onClick={() => app.setFontSize(app.fontSize - 1)} aria-label={label.decreaseText}>A−</button>
              <p className="prefs-sample" style={{ fontFamily: app.font.stack, fontSize: `${app.fontSize}px` }}>{app.bookName} {app.chapterNumber}</p>
              <button type="button" onClick={() => app.setFontSize(app.fontSize + 1)} aria-label={label.increaseText}>A+</button>
            </div>
          </div>

          <div className="prefs-field">
            <span className="section-label">{label.voice}</span>
            <SearchableSelect
              value={app.speechVoice}
              onChange={app.setSpeechVoice}
              label={label.voice}
              filterPlaceholder={label.filterPlaceholder}
              options={app.voiceOptions.map((voice) => ({ value: voice.id, label: voiceLabel(voice) }))}
            />
          </div>

          <div className="prefs-field">
            <span className="section-label">{label.speed} · {app.speechRate.toFixed(1)}×</span>
            <input
              type="range"
              min={app.speechRateRange.min}
              max={app.speechRateRange.max}
              step={app.speechRateRange.step}
              value={app.speechRate}
              aria-label={label.speed}
              onChange={(event) => app.changeSpeechRate(Number(event.target.value) - app.speechRate)}
            />
          </div>

          <div className="prefs-field">
            <span className="section-label">{label.volume} · {Math.round(app.speechVolume * 100)}%</span>
            <input
              type="range"
              min={app.speechVolumeRange.min}
              max={app.speechVolumeRange.max}
              step={app.speechVolumeRange.step}
              value={app.speechVolume}
              aria-label={label.volume}
              onChange={(event) => app.changeSpeechVolume(Number(event.target.value) - app.speechVolume)}
            />
          </div>

          <label className="prefs-field">
            <span className="section-label">{label.displayName}</span>
            <input
              type="text"
              maxLength={40}
              value={draft}
              placeholder={label.displayName}
              onChange={(event) => { setDraft(event.target.value); onNameChange(event.target.value); }}
              onBlur={() => setDraft(name)}
            />
          </label>
        </div>
      </div>
    </div>
  );
}
