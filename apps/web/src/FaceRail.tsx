import { useEffect, useRef, useState } from 'react';
import { MicOffIcon } from './icons';
import { registerRemotePlayer, getRemoteVolume } from './media';
import type { PartyMember } from './readParty';

// One AudioContext for the whole page. A browser caps how many a document may
// hold (Chrome around six) and each one costs an audio render thread, so a full
// room must not open one per tile — that is what made the voices stutter.
let shared: AudioContext | null = null;
function talkingContext() {
  const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) return null;
  shared ??= new AudioCtx();
  // Created before any gesture on some browsers; a mic/join click resumes it.
  if (shared.state === 'suspended') void shared.resume();
  return shared;
}

function useTalking(stream: MediaStream | null, liveMic: boolean) {
  const [talking, setTalking] = useState(false);

  useEffect(() => {
    if (!liveMic || !stream?.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled)) {
      setTalking(false);
      return;
    }
    const ctx = talkingContext();
    if (!ctx) return;
    const source = ctx.createMediaStreamSource(stream);
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.45;
    source.connect(analyser);
    const bins = new Uint8Array(analyser.frequencyBinCount);
    let raf = 0;
    let lastVoice = 0;
    let lastSample = 0;
    const tick = () => {
      raf = requestAnimationFrame(tick);
      const now = performance.now();
      // A talking ring does not need every frame, and one FFT per tile per frame
      // is real main-thread work once a few people are in the room.
      if (now - lastSample < 50) return;
      lastSample = now;
      analyser.getByteFrequencyData(bins);
      const end = Math.min(48, bins.length);
      let sum = 0;
      for (let i = 2; i < end; i += 1) sum += bins[i];
      const level = sum / Math.max(1, end - 2) / 255;
      if (level > 0.14) lastVoice = now;
      setTalking(now - lastVoice < 280);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      // Only this stream's node goes; the context is shared and stays open.
      source.disconnect();
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
  const audioRef = useRef<HTMLAudioElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled));
  const talking = useTalking(stream, !muted);

  useEffect(() => {
    if (self) return;
    const audio = audioRef.current;
    if (!audio) return;
    return registerRemotePlayer(audio);
  }, [self]);

  useEffect(() => {
    const video = videoRef.current;
    const audio = audioRef.current;
    if (video) {
      video.srcObject = stream;
      if (stream) void video.play().catch(() => {});
    }
    if (audio) {
      audio.srcObject = self ? null : stream;
      audio.muted = false;
      audio.volume = getRemoteVolume();
      if (!self && stream) void audio.play().catch(() => {});
    }
    return () => {
      if (video) video.srcObject = null;
      if (audio) audio.srcObject = null;
    };
  }, [stream, self]);

  const className = [
    'meeting-tile',
    self ? 'self' : '',
    hasVideo ? '' : 'avatar',
    muted ? 'muted' : '',
    talking ? 'talking' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className={className} role="listitem">
      {/* Picture only. Sound for a remote peer comes from the dedicated <audio>
          below; leaving this unmuted played every remote voice through two
          elements at once, which drift apart into a jumbled, echoing double. */}
      {stream ? <video ref={videoRef} autoPlay playsInline muted /> : null}
      {!self ? <audio ref={audioRef} autoPlay playsInline className="meeting-audio" /> : null}
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
          : Boolean(member.mic ?? stream?.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled));
        return (
          <Tile
            key={member.id}
            name={member.host ? `${member.name} · Host` : member.name}
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
