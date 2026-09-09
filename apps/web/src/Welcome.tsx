import { useEffect, useRef, useState } from 'react';
import type { ReadParty } from './useReadParty';
import type { DailyReminder } from './dailyReminder';

function readFlag(key: string) { try { return localStorage.getItem(key) === 'done'; } catch { return false; } }
function remember(key: string) { try { localStorage.setItem(key, 'done'); } catch { /* session still works */ } }
export function useWelcome() {
  const [open, setOpen] = useState(() => !readFlag('word.profilePrompt'));
  return { open, close: () => { remember('word.profilePrompt'); setOpen(false); } };
}
export function Welcome({ party, onClose }: { party: ReadParty; onClose: () => void }) {
  const [name, setName] = useState(party.name);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const before = useRef<HTMLElement | null>(null);
  useEffect(() => {
    before.current = document.activeElement as HTMLElement;
    ref.current?.querySelector<HTMLInputElement>('input')?.focus();
    return () => before.current?.focus();
  }, []);
  return <div className="welcome-backdrop"><div className="welcome-card" ref={ref} role="dialog" aria-modal="true" aria-labelledby="welcome-title" onKeyDown={(e) => {
    if (e.key === 'Escape' && !busy) onClose();
    if (e.key !== 'Tab') return;
    const all = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled)') ?? []);
    const first = all[0], last = all[all.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  }}>
    <span className="workspace-eyebrow">A place in the Word</span>
    <h1 id="welcome-title">Make yourself at home.</h1>
    <p>Choose the name people see when you study together. A photo is optional. No signup needed.</p>
    <form onSubmit={(e) => { e.preventDefault(); if (!busy && name.trim()) { party.setName(name); onClose(); } }}>
      <label>Your display name<input maxLength={40} value={name} onChange={(e) => setName(e.target.value)} autoComplete="nickname" /></label>
      <div className="welcome-photo">{party.avatar ? <img src={party.avatar} alt="Your profile" /> : <span style={{background:party.identity.color}}>{name.slice(0,1)}</span>}
      <label>Add a photo <small>Optional · stored on this device</small><input type="file" accept="image/*" disabled={busy} onChange={async (e) => { const file=e.target.files?.[0]; if (!file) return; setBusy(true); await party.setAvatar(file); setBusy(false); }} /></label></div>
      {party.mediaError === 'photo' && <p role="alert">That image could not be opened. Try another photo.</p>}
      <p className="privacy-note">Your profile is saved in this browser, not in a server account. Clearing this site’s cookies and site data deletes it; clearing browsing history alone may not. Your name and photo are shared with people in a study you join. Hosting a public group also lists your name.</p>
      <div className="welcome-actions"><button type="button" onClick={onClose} disabled={busy}>Skip for now</button><button className="primary" disabled={busy || !name.trim()}>{busy ? 'Preparing photo…' : 'Save and continue'}</button></div>
    </form>
  </div></div>;
}
export function ReminderBanner({ reminder }: { reminder: DailyReminder }) {
  const [dismissed, setDismissed] = useState(() => readFlag('word.reminderPrompt'));
  const [requested, setRequested] = useState(false);
  const dismiss = () => { remember('word.reminderPrompt'); setDismissed(true); };
  if (dismissed || reminder.settings.enabled) return null;
  return <aside className="reminder-banner" aria-label="Daily reading reminder">
    <div><span className="workspace-eyebrow">A little time, every day</span><strong>Make room for Scripture.</strong><p>Would you like a daily reading reminder? You can change this in Settings.</p>
      <small>{!reminder.supported ? 'Notifications are unavailable in this browser.' : reminder.permission === 'denied' ? 'Notifications are blocked. Enable them in your browser’s site settings.' : 'Delivery depends on your browser. Keep the app open for the most reliable reminders; closed-page delivery is not guaranteed.'}</small>
      {requested && reminder.permission === 'default' && <p role="status">Allow notifications in the browser prompt to enable reminders.</p>}
    </div><div className="reminder-actions"><label>Daily at<input aria-label="Daily reminder time" type="time" value={reminder.settings.time} onChange={e=>reminder.setTime(e.target.value)} /></label><button className="primary" disabled={!reminder.supported || reminder.permission === 'denied'} onClick={()=>{setRequested(true);reminder.setEnabled(true);}}>Enable reminders</button><button onClick={dismiss}>No thanks</button></div>
  </aside>;
}
