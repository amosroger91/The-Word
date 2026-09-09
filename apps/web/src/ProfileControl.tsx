import { useRef, useState } from 'react';

// The compact form of "who you are in a Group Study", for the reader's settings
// pane. Preferences holds the roomier version; this one is a photo and a name
// sitting in the same pill as the other topbar controls.
export function ProfileControl({
  name, color, avatar, nameLabel, photoLabel, onNameChange, onAvatarChange,
}: {
  name: string;
  color: string;
  avatar: string | null;
  nameLabel: string;
  photoLabel: string;
  onNameChange: (name: string) => void;
  onAvatarChange: (file: File | null) => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  // The field keeps its own text so a half-typed (or briefly empty) name still
  // shows; only non-empty values are committed to the party identity.
  const [draft, setDraft] = useState(name);

  return (
    <div className="profile-control">
      <button
        type="button"
        className={avatar ? 'profile-avatar has-photo' : 'profile-avatar'}
        style={avatar ? { backgroundImage: `url("${avatar}")` } : { background: color }}
        onClick={() => fileRef.current?.click()}
        aria-label={photoLabel}
        title={photoLabel}
      >
        {avatar ? null : (name.trim().slice(0, 1) || '?')}
      </button>
      <input
        type="text"
        className="profile-name"
        maxLength={40}
        value={draft}
        aria-label={nameLabel}
        placeholder={nameLabel}
        title={nameLabel}
        onChange={(event) => { setDraft(event.target.value); onNameChange(event.target.value); }}
        onBlur={() => setDraft(name)}
      />
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
  );
}
