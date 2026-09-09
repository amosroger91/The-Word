import { useEffect, useRef, useState } from 'react';
import { readingFonts, type Language, type WordApp } from '@the-word/core';
import { SearchableSelect } from './SearchableSelect';
import type { DailyReminder } from './dailyReminder';

// Everything a reader sets once and forgets: how Scripture looks, how it sounds,
// and who they are to the rest of a Group Study.
export function Preferences({
  app,
  name,
  color,
  avatar,
  reminder,
  onNameChange,
  onAvatarChange,
  onClose,
}: {
  app: WordApp;
  name: string;
  color: string;
  avatar: string | null;
  reminder: DailyReminder;
  onNameChange: (name: string) => void;
  onAvatarChange: (file: File | null) => void;
  onClose: () => void;
}) {
  const { label } = app;
  const panelRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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

  // "Tuesday 7:00 AM" — the day makes it plain when the chosen time has already
  // passed today, and the clock format follows the reader's own language.
  const nextReminder = reminder.nextAt
    ? new Intl.DateTimeFormat(app.language, { weekday: 'long', hour: 'numeric', minute: '2-digit' }).format(reminder.nextAt)
    : null;
  const reminderHint = !reminder.supported ? label.reminderUnsupported
    : reminder.permission === 'denied' ? label.reminderBlocked
    : nextReminder ? label.reminderNext(nextReminder)
    : label.dailyReminderHint;

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

          <div className="prefs-field">
            <span className="section-label">{label.dailyReminder}</span>
            <label className="prefs-toggle">
              <input
                type="checkbox"
                checked={reminder.settings.enabled}
                disabled={!reminder.supported || reminder.permission === 'denied'}
                onChange={(event) => reminder.setEnabled(event.target.checked)}
              />
              <span>{label.reminderEnable}</span>
            </label>
            {reminder.settings.enabled && (
              <div className="prefs-reminder">
                <input
                  type="time"
                  value={reminder.settings.time}
                  aria-label={label.reminderTime}
                  onChange={(event) => reminder.setTime(event.target.value)}
                />
                <button type="button" onClick={reminder.sendTest}>{label.reminderTest}</button>
              </div>
            )}
            <p className="muted">{reminderHint}</p>
            {reminder.settings.enabled && !reminder.exact && <p className="muted">{label.reminderApprox}</p>}
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

          <div className="prefs-field">
            <span className="section-label">{label.profilePhoto}</span>
            <div className="prefs-photo">
              <button
                type="button"
                className={avatar ? 'prefs-avatar has-photo' : 'prefs-avatar'}
                style={avatar ? { backgroundImage: `url("${avatar}")` } : { background: color }}
                onClick={() => fileRef.current?.click()}
                aria-label={label.changePhoto}
              >
                {!avatar ? (name.trim().slice(0, 1) || '?') : null}
              </button>
              <div className="prefs-photo-actions">
                <button type="button" onClick={() => fileRef.current?.click()}>{label.changePhoto}</button>
                {avatar ? <button type="button" onClick={() => onAvatarChange(null)}>{label.removePhoto}</button> : null}
                <p className="muted">{label.photoHint}</p>
              </div>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                hidden
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  event.target.value = '';
                  if (file) onAvatarChange(file);
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
