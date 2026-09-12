import { useEffect, useRef } from 'react';

/**
 * The presented screen, shown large above the face rail.
 *
 * The video element is ALWAYS muted: a viewer already hears the presenter
 * through FaceRail's dedicated <audio>, and the presenter must not hear their
 * own desktop audio played back. Unmuting here would double every sound.
 */
export function ScreenStage({
  stream,
  presenterName,
  isSelf,
  hasAudio,
  onStop,
}: {
  stream: MediaStream | null;
  presenterName: string;
  isSelf: boolean;
  hasAudio: boolean;
  onStop?: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) void video.play().catch(() => { /* autoplay gate; the poster frame still shows */ });
    return () => { video.srcObject = null; };
  }, [stream]);

  if (!stream) return null;

  return (
    <div className="screen-stage">
      <video ref={videoRef} autoPlay playsInline muted />
      <div className="screen-stage-bar">
        <span>
          {isSelf ? 'You are presenting' : `${presenterName || 'Someone'} is presenting`}
          {isSelf && hasAudio ? ' · sound included' : ''}
        </span>
        {isSelf && onStop ? <button type="button" onClick={onStop}>Stop sharing</button> : null}
      </div>
    </div>
  );
}
