// Display profile for Group Study. The login itself is the Nostr account in
// nostrAccount.ts; this stays as the thin name/photo wrapper existing rooms
// and tests already import.
import { loadAccount, updateProfile } from './nostrAccount';

export interface LocalIdentity {
  id: string;
  name: string;
  color: string;
  avatar: string | null;
}

export function loadIdentity(): LocalIdentity {
  const account = loadAccount();
  return {
    id: account.npub,
    name: account.name,
    color: account.color,
    avatar: account.avatar,
  };
}

export function saveIdentity(identity: LocalIdentity) {
  updateProfile({
    name: identity.name,
    color: identity.color,
    avatar: identity.avatar,
  });
}

// Square center-crop to a small JPEG so the photo can ride the roster channel.
export function compressAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const side = Math.min(img.width, img.height);
        const sx = (img.width - side) / 2;
        const sy = (img.height - side) / 2;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Could not draw that image.')); return; }
        ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => reject(new Error('Could not load that image.'));
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  });
}
