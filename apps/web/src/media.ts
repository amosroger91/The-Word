// Local mic/camera capture for the Read Party WebRTC mesh.
// This module only owns the capture stream; readParty.ts dials peers
// and FaceRail.tsx renders remote streams.

let localStream: MediaStream | null = null;
let state = { audio: false, video: false };

export function getState() { return { ...state }; }
export function getLocalStream() { return localStream; }
export function hasMedia() { return Boolean(localStream) && (state.audio || state.video); }

export async function setMedia({ audio, video }: { audio: boolean; video: boolean }) {
  const want = { audio: Boolean(audio), video: Boolean(video) };
  if (!want.audio && !want.video) {
    stopLocal();
    state = want;
    return null;
  }
  const fresh = await navigator.mediaDevices.getUserMedia({
    audio: want.audio,
    video: want.video ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' } : false,
  });
  stopLocal();
  localStream = fresh;
  state = want;
  return localStream;
}

export function stopLocal() {
  if (localStream) {
    for (const track of localStream.getTracks()) {
      try { track.stop(); } catch { /* already ended */ }
    }
  }
  localStream = null;
  state = { audio: false, video: false };
}
