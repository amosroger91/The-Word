// Local mic/camera capture for the Read Party WebRTC mesh.
// This module only owns the capture stream; readParty.ts dials peers
// and FaceRail.tsx renders remote streams.

let localStream: MediaStream | null = null;
let devices = { microphone: '', camera: '' };
export function setDevices(next: typeof devices) { devices = next; }
export function getDevices() { return { ...devices }; }
let state = { audio: false, video: false };
let remoteVolume = 1;
export function setRemoteVolume(volume: number) {
  remoteVolume = Math.max(0, Math.min(1, volume));
  remotePlayers.forEach((player) => { player.volume = remoteVolume; });
}
export function getRemoteVolume() { return remoteVolume; }

const remotePlayers = new Set<HTMLMediaElement>();

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
    audio: want.audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(devices.microphone ? { deviceId: { exact: devices.microphone } } : {}) } : false,
    video: want.video ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', ...(devices.camera ? { deviceId: { exact: devices.camera } } : {}) } : false,
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

// Remote playback is a dedicated <audio> (not the hidden avatar <video>).
// Register each player so a later mic/join click can retry play() after
// the autoplay gate, which is why the green ring can show with no sound.
export function registerRemotePlayer(el: HTMLMediaElement) {
  remotePlayers.add(el);
  el.volume = remoteVolume;
  return () => {
    remotePlayers.delete(el);
    el.srcObject = null;
  };
}

export function unlockRemoteAudio() {
  for (const el of remotePlayers) {
    el.muted = false;
    el.volume = remoteVolume;
    void el.play().catch(() => {});
  }
}
