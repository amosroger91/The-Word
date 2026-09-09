import { useEffect, useRef, useState } from 'react';
import { MicOffIcon } from './icons';
import type { PartyMember } from './readParty';

function useTalking(stream: MediaStream | null, liveMic: boolean) {
  const [talking, setTalking] = useState(false);

  useEffect(() => {
    if (!liveMic || !stream?.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled)) {
      setTalking(false);
      return;
    }
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.45;
    source.connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let lastVoice = 0;
    const tick = () => {
      analyser.getByteFrequencyData(bins);
      const end = Math.min(48, bins.length);
      let sum = 0;
      for (let i = 2; i < end; i += 1) sum += bins[i];
      const level = sum / Math.max(1, end - 2) / 255;
      const now = performance.now();
      if (level > 0.14) lastVoice = now;
      setTalking(now - lastVoice < 280);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      source.disconnect();
      void ctx.close();
    };
  }, [stream, liveMic]);

  return talking;
}

function Tile({
  name, color, avatar, stream, self, muted, youSuffix, mutedLabel, onPickPhoto,
}: {
  name: string;
  color: string;
  avatar: string | null;
  stream: MediaStream | null;
  self?: boolean;
  muted: boolean;
  youSuffix: string;
  mutedLabel: string;
  onPickPhoto?: (file: File) => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled));
  const talking = useTalking(stream, !muted);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    return () => { el.srcObject = null; };
  }, [stream]);

  const className = [
    'meeting-tile',
    self ? 'self' : '',
    hasVideo ? '' : 'avatar',
    muted ? 'muted' : '',
    talking ? 'talking' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} role="listitem">
      {stream ? <video ref={videoRef} autoPlay playsInline muted={self} /> : null}
      {!hasVideo && (
        avatar
          ? <div className="meeting-avatar photo" style={{ backgroundImage: `url("${avatar}")` }} aria-hidden="true" />
          : <div className="meeting-avatar" style={{ background: color }} aria-hidden="true">{name.slice(0, 1)}</div>
      )}
      {muted && (
        <span className="meeting-mute" title={mutedLabel} aria-label={mutedLabel}>
          <MicOffIcon />
        </span>
      )}
      <span className="meeting-tile-name">{name}{self ? youSuffix : ''}</span>
      {self && onPickPhoto && (
        <>
          <button
            type="button"
            className="meeting-tile-edit"
            aria-label={name}
            onClick={() => fileRef.current?.click()}
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onPickPhoto(file);
            }}
          />
        </>
      )}
    </div>
  );
}

export function FaceRail({
  members, selfId, selfAvatar, localStream, remoteStreams, micOn, youSuffix, mutedLabel, onPickPhoto,
}: {
  members: PartyMember[];
  selfId: string;
  selfAvatar: string | null;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  micOn: boolean;
  youSuffix: string;
  mutedLabel: string;
  onPickPhoto: (file: File) => void;
}) {
  if (!members.length) return null;
  return (
    <div className="meeting-rail" role="list" aria-label="Group">
      {members.map((member) => {
        const self = member.id === selfId;
        const stream = self ? localStream : (remoteStreams[member.id] ?? null);
        const liveMic = self
          ? micOn
          : Boolean(stream?.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled));
        return (
          <Tile
            key={member.id}
            name={member.name}
            color={member.color}
            avatar={(self ? selfAvatar : member.avatar) || null}
            stream={stream}
            self={self}
            muted={!liveMic}
            youSuffix={youSuffix}
            mutedLabel={mutedLabel}
            onPickPhoto={self ? onPickPhoto : undefined}
          />
        );
      })}
    </div>
  );
}
