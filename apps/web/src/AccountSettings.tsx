import { useState } from 'react';
import { renderSVG } from 'uqr';
import type { WordApp } from '@the-word/core';
import { exportBackup, loadAccount, MIN_BACKUP_PASSWORD, restoreBackup } from './nostrAccount';

export function AccountSettings({
  label,
  restorePrefill = '',
}: {
  label: WordApp['label'];
  restorePrefill?: string;
}) {
  const account = loadAccount();
  const [backupPassword, setBackupPassword] = useState('');
  const [backup, setBackup] = useState('');
  const [backupQr, setBackupQr] = useState('');
  const [backupStatus, setBackupStatus] = useState('');
  const [restoreSecret, setRestoreSecret] = useState(restorePrefill);
  const [restorePassword, setRestorePassword] = useState('');
  const [restoreStatus, setRestoreStatus] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const [busy, setBusy] = useState(false);

  async function copy(text: string, ok: string) {
    try {
      await navigator.clipboard.writeText(text);
      setBackupStatus(ok);
    } catch {
      setBackupStatus(text);
    }
  }

  function createBackup() {
    setBackupStatus('');
    if (backupPassword.length < MIN_BACKUP_PASSWORD) {
      setBackupStatus(label.passwordTooShort);
      return;
    }
    try {
      const secret = exportBackup(backupPassword);
      setBackup(secret);
      setBackupQr(renderSVG(secret, { ecc: 'M', border: 2, pixelSize: 4, whiteColor: '#fff', blackColor: '#191816' }));
      setBackupStatus('');
    } catch {
      setBackupStatus(label.restoreFail);
    }
  }

  function downloadBackup() {
    if (!backup) return;
    const blob = new Blob([backup + '\n'], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'the-word-backup.txt';
    link.click();
    URL.revokeObjectURL(url);
  }

  function restore() {
    setRestoreError('');
    setRestoreStatus('');
    if (restorePassword.length < MIN_BACKUP_PASSWORD) {
      setRestoreError(label.passwordTooShort);
      return;
    }
    setBusy(true);
    try {
      restoreBackup(restoreSecret, restorePassword);
      setRestoreStatus(label.restoreOk);
      window.setTimeout(() => window.location.reload(), 400);
    } catch {
      setRestoreError(label.restoreFail);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="prefs-field">
        <span className="section-label">{label.account}</span>
        <p className="muted">{label.accountHint}</p>
        <p className="muted">{label.accountLoss}</p>
      </div>

      <div className="prefs-field">
        <span className="section-label">{label.yourPublicKey}</span>
        <p className="prefs-npub" title={account.npub}>{account.npub}</p>
        <div className="prefs-account-actions">
          <button type="button" onClick={() => { void copy(account.npub, label.keyCopied); }}>{label.copyPublicKey}</button>
        </div>
      </div>

      <div className="prefs-field">
        <span className="section-label">{label.backupAccount}</span>
        <label>
          <span className="section-label">{label.backupPassword}</span>
          <input
            type="password"
            autoComplete="new-password"
            value={backupPassword}
            onChange={(event) => setBackupPassword(event.target.value)}
            aria-label={label.backupPassword}
          />
        </label>
        <p className="muted">{label.backupPasswordHint}</p>
        <div className="prefs-account-actions">
          <button type="button" onClick={createBackup}>{label.createBackup}</button>
        </div>
        {backupQr ? (
          <>
            <div className="prefs-qr" aria-hidden="true" dangerouslySetInnerHTML={{ __html: backupQr }} />
            <p className="muted">{label.backupQrHint}</p>
            <textarea className="prefs-secret" readOnly value={backup} aria-label={label.backupSecret} />
            <div className="prefs-account-actions">
              <button type="button" onClick={() => { void copy(backup, label.backupCopied); }}>{label.copyBackup}</button>
              <button type="button" onClick={downloadBackup}>{label.downloadBackup}</button>
            </div>
          </>
        ) : null}
        {backupStatus ? <p className="muted" role="status">{backupStatus}</p> : null}
      </div>

      <div className="prefs-field">
        <span className="section-label">{label.restoreAccount}</span>
        <p className="muted">{label.restoreWarn}</p>
        <textarea
          className="prefs-secret"
          value={restoreSecret}
          onChange={(event) => setRestoreSecret(event.target.value)}
          aria-label={label.restoreSecret}
          placeholder="ncryptsec1…"
        />
        <label>
          <span className="section-label">{label.restorePassword}</span>
          <input
            type="password"
            autoComplete="off"
            value={restorePassword}
            onChange={(event) => setRestorePassword(event.target.value)}
            aria-label={label.restorePassword}
          />
        </label>
        <div className="prefs-account-actions">
          <button type="button" disabled={busy || !restoreSecret.trim()} onClick={restore}>{label.restoreAction}</button>
        </div>
        {restoreStatus ? <p className="muted" role="status">{restoreStatus}</p> : null}
        {restoreError ? <p className="muted" role="alert">{restoreError}</p> : null}
      </div>
    </>
  );
}
