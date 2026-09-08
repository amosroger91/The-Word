import { useEffect, useRef } from 'react';
import type { PartyMember } from './readParty';

function Tile({
  name, color, stream, self, youSuffix,
}: {
  name: string;
  color: string;
  stream: MediaStream | null;
  self?: boolean;
  youSuffix: string;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hasVideo = Boolean(stream?.getVideoTracks().some((track) => track.readyState === 'live' && track.enabled));
  const hasAudio = Boolean(stream?.getAudioTracks().some((track) => track.readyState === 'live' && track.enabled));

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    el.srcObject = stream;
    return () => { el.srcObject = null; };
  }, [stream]);

  return (
    <div className={`meeting-tile${self ? ' self' : ''}${hasVideo ? '' : ' avatar'}${hasAudio ? ' live' : ''}`}>
      {stream ? <video ref={videoRef} autoPlay playsInline muted={self} /> : null}
      {!hasVideo && <div className="meeting-avatar" style={{ background: color }} aria-hidden="true">{name.slice(0, 1)}</div>}
      <span className="meeting-tile-name">{name}{self ? youSuffix : ''}</span>
    </div>
  );
}

export function FaceRail({
  members, selfId, localStream, remoteStreams, youSuffix,
}: {
  members: PartyMember[];
  selfId: string;
  localStream: MediaStream | null;
  remoteStreams: Record<string, MediaStream>;
  youSuffix: string;
}) {
  if (!members.length) return null;
  return (
    <div className="meeting-rail" role="list" aria-label="Group">
      {members.map((member) => {
        const self = member.id === selfId;
        const stream = self ? localStream : (remoteStreams[member.id] ?? null);
        return (
          <Tile
            key={member.id}
            name={member.name}
            color={member.color}
            stream={stream}
            self={self}
            youSuffix={youSuffix}
          />
        );
      })}
    </div>
  );
}
