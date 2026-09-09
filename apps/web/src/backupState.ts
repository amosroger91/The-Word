// A Nostr key cannot be rotated: no reset, no revocation, no recovery. We mint
// one for people who do not know they have it, so the app has to work at
// getting it backed up — and has to be honest when it is genuinely gone.
// See docs/study-plans-framework.md §14a.
import { nsecEncode } from 'nostr-tools/nip19';
import { hexToBytes } from '@noble/hashes/utils.js';
import { loadAccount } from './nostrAccount';

export const BACKUP_KEY = 'word.backedUpAt';

/** Nagging at first launch is dismissed by someone with nothing invested yet.
 *  These are the first moments the account is worth keeping. */
export type BackupTrigger = 'badge' | 'circle' | 'none';

export function backedUpAt(): string | null {
  try { return localStorage.getItem(BACKUP_KEY); } catch { return null; }
}

export function markBackedUp() {
  try { localStorage.setItem(BACKUP_KEY, new Date().toISOString()); } catch { /* storage blocked */ }
}

export function needsBackup(): boolean {
  return !backedUpAt();
}

/** A second device holding the same key is the layer that saves the most
 *  people, because it asks no foresight of them — so "you have only one copy"
 *  is worth saying even after a backup file exists. */
export function copies(): number {
  return backedUpAt() ? 2 : 1;
}

// The raw key, for someone who would rather keep a file in a password manager
// than remember a passphrase. Forgetting the passphrase destroys an ncryptsec
// backup exactly as thoroughly as losing the key, so this is a real option and
// not a footgun — as long as the label is blunt about what the file is.
export function plainBackup(): { nsec: string; filename: string } {
  const account = loadAccount();
  return {
    nsec: nsecEncode(hexToBytes(account.secretKey)),
    filename: `the-word-key-${account.npub.slice(0, 12)}.txt`,
  };
}

export function downloadText(filename: string, body: string) {
  const blob = new Blob([body + '\n'], { type: 'text/plain' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
