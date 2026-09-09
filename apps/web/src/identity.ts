// Accountless Group Study identity: a name, color, and optional photo that
// live only in this browser's localStorage. No signup, no server.
const IDENTITY_KEY = 'word.partyIdentity';
const NAME_KEY = 'word.partyName';

const ADJECTIVES = ['Gentle', 'Faithful', 'Bright', 'Humble', 'Steady', 'Kind', 'Quiet', 'Joyful', 'Patient', 'Bold'];
const NOUNS = ['Lamp', 'Cedar', 'River', 'Dove', 'Shepherd', 'Vine', 'Anchor', 'Harvest', 'Pilgrim', 'Beacon'];
const COLORS = ['#947849', '#5c7cfa', '#2f9e6f', '#c2571e', '#9b5cb4', '#3a86ca', '#c04b5a', '#6a8a2f'];

export interface LocalIdentity {
  id: string;
  name: string;
  color: string;
  avatar: string | null;
}

function randomFrom<T>(list: T[]): T { return list[Math.floor(Math.random() * list.length)]; }

function mint(): LocalIdentity {
  return {
    id: 'me-' + Math.random().toString(36).slice(2, 7),
    name: `${randomFrom(ADJECTIVES)} ${randomFrom(NOUNS)}`,
    color: randomFrom(COLORS),
    avatar: null,
  };
}

export function loadIdentity(): LocalIdentity {
  try {
    const raw = localStorage.getItem(IDENTITY_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalIdentity>;
      if (parsed?.id && parsed.name) {
        return {
          id: String(parsed.id),
          name: String(parsed.name).trim().slice(0, 40) || mint().name,
          color: parsed.color || randomFrom(COLORS),
          avatar: parsed.avatar || null,
        };
      }
    }
    const legacy = localStorage.getItem(NAME_KEY)?.trim();
    const fresh = mint();
    if (legacy) fresh.name = legacy.slice(0, 40);
    saveIdentity(fresh);
    return fresh;
  } catch {
    return mint();
  }
}

export function saveIdentity(identity: LocalIdentity) {
  try {
    localStorage.setItem(IDENTITY_KEY, JSON.stringify(identity));
    localStorage.setItem(NAME_KEY, identity.name);
  } catch { /* storage blocked */ }
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
