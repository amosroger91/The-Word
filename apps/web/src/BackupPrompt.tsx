import { useState } from 'react';
import type { WordApp } from '@the-word/core';
import { exportBackup, MIN_BACKUP_PASSWORD } from './nostrAccount';
import { downloadText, markBackedUp, plainBackup, type BackupTrigger } from './backupState';

// Shown the first time the account is worth keeping — a badge earned, a circle
// joined — not at first launch, when there is nothing invested and the card gets
// dismissed. See docs/study-plans-framework.md §14a.
export function BackupPrompt({
  trigger, label, onDone, onLater,
}: {
  trigger: BackupTrigger;
  label: WordApp['label'];
  onDone: () => void;
  onLater: () => void;
}) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  function withPassphrase() {
    if (password.length < MIN_BACKUP_PASSWORD) { setError(label.passwordTooShort); return; }
    void (async () => {
      try {
        const saved = await downloadText('the-word-backup.txt', exportBackup(password));
        if (!saved) { setError(label.backupUnconfirmed); return; }
        markBackedUp();
        onDone();
      } catch {
        setError(label.restoreFail);
      }
    })();
  }

  function withoutPassphrase() {
    const { nsec, filename } = plainBackup();
    void (async () => {
      try {
        const saved = await downloadText(filename, nsec);
        if (!saved) { setError(label.backupUnconfirmed); return; }
        markBackedUp();
        onDone();
      } catch {
        setError(label.restoreFail);
      }
    })();
  }

  return (
    <div className="welcome-backdrop">
      <div className="welcome-card" role="dialog" aria-modal="true" aria-label={label.backUpNow}>
        <h2>{label.backUpNow}</h2>
        <p>{trigger === 'badge' ? label.backupWhyBadge : label.backupWhyCircle}</p>
        <p className="muted">{label.backupNoReset}</p>

        <label>{label.backupPassword}
          <input
            type="password"
            value={password}
            onChange={(event) => { setPassword(event.target.value); setError(''); }}
          />
        </label>
        {error ? <p className="muted" role="alert">{error}</p> : null}

        <div className="welcome-actions">
          <button type="button" onClick={onLater}>{label.backupLater}</button>
          <button type="button" onClick={withoutPassphrase}>{label.backupPlain}</button>
          <button type="button" className="primary" onClick={withPassphrase}>{label.backupDownload}</button>
        </div>
        <p className="muted">{label.backupPlainHint}</p>
      </div>
    </div>
  );
}
