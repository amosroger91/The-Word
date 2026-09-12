// Local mic/camera capture for the Read Party WebRTC mesh.
// This module only owns the capture stream; readParty.ts dials peers
// and FaceRail.tsx renders remote streams.

// Two capture sources, one published stream. `camStream` is the mic/camera from
// getUserMedia; `screenStream` is getDisplayMedia. What peers actually receive is
// `localStream`, a composite: the screen's video when presenting (otherwise the
// camera's), and the mic mixed with desktop audio when both are live.
// Declared before the state below: the readers run at module load, and a const
// declared further down would sit in its temporal dead zone. The ReferenceError
// is swallowed by the try/catch in each reader, so the symptom is not a crash --
// it is a stored preference that silently never loads.
const VOICE_FILTER_KEY = 'word.voiceFilter';
const SYS_VOLUME_KEY = 'word.systemAudioVolume';

let camStream: MediaStream | null = null;
let screenStream: MediaStream | null = null;
// Desktop audio shared on its own, with no picture. getDisplayMedia always hands
// back a video track, so we keep the audio and stop the video immediately.
let sysAudioStream: MediaStream | null = null;
let sysGain: GainNode | null = null;
let sysVolume = readSystemAudioVolume();
let localStream: MediaStream | null = null;
let audioCtx: AudioContext | null = null;
let gateTimer = 0;
let voiceFilter = readVoiceFilterPref();
let devices = { microphone: '', camera: '' };
export function setDevices(next: typeof devices) { devices = next; }
export function getDevices() { return { ...devices }; }
let state = { audio: false, video: false, screen: false };
let remoteVolume = 1;
export function setRemoteVolume(volume: number) {
  remoteVolume = Math.max(0, Math.min(1, volume));
  remotePlayers.forEach((player) => { player.volume = remoteVolume; });
}
export function getRemoteVolume() { return remoteVolume; }

const remotePlayers = new Set<HTMLMediaElement>();

export function getState() { return { ...state }; }
export function getLocalStream() { return localStream; }
/** The camera only — the face rail shows this, so presenting does not replace your face. */
export function getCameraStream() { return camStream; }
export function getScreenStream() { return screenStream; }
export function isScreenSharing() { return Boolean(screenStream); }
export function hasMedia() { return Boolean(localStream) && (state.audio || state.video); }

function stopTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    try { track.stop(); } catch { /* already ended */ }
  }
}

function readSystemAudioVolume(): number {
  try {
    const raw = Number(localStorage.getItem(SYS_VOLUME_KEY));
    return Number.isFinite(raw) && raw >= 0 && raw <= 1 ? raw : 0.8;
  } catch { return 0.8; }
}

export function getSystemAudioVolume() { return sysVolume; }

/**
 * Desktop audio rides in at its own level, like a second voice in the room.
 * Applied straight to the live gain node so a drag of the slider is heard
 * immediately, with no stream rebuild and no reconnect.
 */
export function setSystemAudioVolume(next: number) {
  sysVolume = Math.max(0, Math.min(1, Number(next) || 0));
  try { localStorage.setItem(SYS_VOLUME_KEY, String(sysVolume)); } catch { /* private mode */ }
  if (sysGain) sysGain.gain.value = sysVolume;
  return sysVolume;
}

export function isSharingSystemAudio() { return Boolean(sysAudioStream); }

function readVoiceFilterPref(): boolean {
  try { return localStorage.getItem(VOICE_FILTER_KEY) !== '0'; } catch { return true; }
}

export function getVoiceFilter() { return voiceFilter; }

/** Toggle mic conditioning. Callers must follow with room.refreshMedia(). */
export function setVoiceFilter(on: boolean) {
  voiceFilter = Boolean(on);
  try { localStorage.setItem(VOICE_FILTER_KEY, voiceFilter ? '1' : '0'); } catch { /* private mode */ }
  rebuild();
  return localStream;
}

function disposeAudioGraph() {
  if (gateTimer) { clearInterval(gateTimer); gateTimer = 0; }
  sysGain = null;
  if (!audioCtx) return;
  void audioCtx.close().catch(() => {});
  audioCtx = null;
}

function newAudioContext(): AudioContext | null {
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    // Capture graphs often start suspended under the autoplay policy.
    void ctx.resume().catch(() => {});
    return ctx;
  } catch {
    return null;
  }
}

/**
 * Mic conditioning, layered on top of the browser's own echo cancellation and
 * noise suppression: a high-pass to drop room rumble and handling thumps, a
 * low-pass above the speech band to take the top off hiss, a gentle compressor
 * to even out how close someone sits to the mic, and a soft gate that DUCKS
 * rather than mutes between words.
 *
 * Deliberately mild. An aggressive gate clips the front of quiet words, which
 * sounds worse than the hum it removes - hence the hysteresis (open and close
 * thresholds differ so it cannot chatter), fast-open/slow-close ramps, and a
 * floor that never reaches silence.
 */
function buildVoiceChain(ctx: AudioContext, track: MediaStreamTrack): AudioNode {
  const source = ctx.createMediaStreamSource(new MediaStream([track]));

  const highpass = ctx.createBiquadFilter();
  highpass.type = 'highpass';
  highpass.frequency.value = 85;
  highpass.Q.value = 0.7;

  const lowpass = ctx.createBiquadFilter();
  lowpass.type = 'lowpass';
  lowpass.frequency.value = 8000;

  const gate = ctx.createGain();
  gate.gain.value = 1;

  const compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -28;
  compressor.knee.value = 24;
  compressor.ratio.value = 3;
  compressor.attack.value = 0.01;
  compressor.release.value = 0.25;

  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.5;

  source.connect(highpass);
  highpass.connect(lowpass);
  lowpass.connect(analyser);   // measurement tap
  lowpass.connect(gate);
  gate.connect(compressor);

  const OPEN_RMS = 0.012;   // above this, treat it as speech
  const CLOSE_RMS = 0.006;  // below this, treat it as room noise
  const FLOOR = 0.15;       // duck to 15%, never to silence
  const samples = new Float32Array(analyser.fftSize);
  let open = false;

  gateTimer = window.setInterval(() => {
    analyser.getFloatTimeDomainData(samples);
    let sum = 0;
    for (let i = 0; i < samples.length; i += 1) sum += samples[i] * samples[i];
    const rms = Math.sqrt(sum / samples.length);
    if (!open && rms > OPEN_RMS) open = true;
    else if (open && rms < CLOSE_RMS) open = false;
    const now = ctx.currentTime;
    gate.gain.cancelScheduledValues(now);
    // Open almost instantly so no syllable is lost; close slowly so tails breathe.
    gate.gain.setTargetAtTime(open ? 1 : FLOOR, now, open ? 0.01 : 0.2);
  }, 50);

  return compressor;
}

function rebuild() {
  disposeAudioGraph();
  const camAudio = camStream?.getAudioTracks() ?? [];
  const screenAudio = screenStream?.getAudioTracks() ?? [];
  const sysAudio = sysAudioStream?.getAudioTracks() ?? [];
  const desktopAudio = [...screenAudio, ...sysAudio];
  const screenVideo = screenStream?.getVideoTracks() ?? [];
  const camVideo = camStream?.getVideoTracks() ?? [];

  // A graph is worth building to condition the mic, to fold several sources
  // into the one track a peer connection carries, or to put desktop audio
  // behind a fader.
  const wantsGraph = (camAudio.length > 0 && (voiceFilter || desktopAudio.length > 0))
    || desktopAudio.length > 0;
  let audio: MediaStreamTrack[] = camAudio.length ? camAudio : desktopAudio.slice(0, 1);

  if (wantsGraph) {
    const ctx = newAudioContext();
    if (ctx) {
      audioCtx = ctx;
      try {
        const destination = ctx.createMediaStreamDestination();
        if (camAudio.length) {
          const mic = voiceFilter
            ? buildVoiceChain(ctx, camAudio[0])
            : ctx.createMediaStreamSource(new MediaStream([camAudio[0]]));
          mic.connect(destination);
        }
        if (desktopAudio.length) {
          // Desktop audio is music or a soundtrack: never gated or high-passed,
          // only levelled, so it sits under the voices instead of over them.
          sysGain = ctx.createGain();
          sysGain.gain.value = sysVolume;
          sysGain.connect(destination);
          for (const track of desktopAudio) {
            try { ctx.createMediaStreamSource(new MediaStream([track])).connect(sysGain); } catch { /* skip */ }
          }
        }
        const out = destination.stream.getAudioTracks()[0];
        if (out) audio = [out];
      } catch {
        disposeAudioGraph();
        audio = camAudio.length ? camAudio : desktopAudio.slice(0, 1);
      }
    }
  }

  // The screen takes the single video slot while presenting.
  const video = screenVideo.length ? screenVideo : camVideo;

  localStream = audio.length || video.length ? new MediaStream([...audio, ...video]) : null;
  state = { audio: audio.length > 0, video: video.length > 0, screen: screenVideo.length > 0 };
}

export async function setMedia({ audio, video }: { audio: boolean; video: boolean }) {
  const want = { audio: Boolean(audio), video: Boolean(video) };
  if (!want.audio && !want.video) {
    stopTracks(camStream);
    camStream = null;
    rebuild();
    return localStream;
  }
  const fresh = await navigator.mediaDevices.getUserMedia({
    audio: want.audio ? { echoCancellation: true, noiseSuppression: true, autoGainControl: true, ...(devices.microphone ? { deviceId: { exact: devices.microphone } } : {}) } : false,
    video: want.video ? { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user', ...(devices.camera ? { deviceId: { exact: devices.camera } } : {}) } : false,
  });
  stopTracks(camStream);
  camStream = fresh;
  rebuild();
  return localStream;
}

/**
 * Present a screen (and optionally its audio). Desktop audio is a Chromium
 * feature — Firefox and Safari hand back video only, which is why the caller is
 * told whether audio actually arrived rather than assuming it did.
 * `onEnded` fires when the viewer stops sharing from the browser's own bar.
 */
export async function startScreenShare({ withAudio, onEnded }: { withAudio: boolean; onEnded?: () => void }) {
  const display = await navigator.mediaDevices.getDisplayMedia({
    video: { frameRate: { ideal: 15, max: 30 } },
    audio: withAudio,
  });
  const video = display.getVideoTracks()[0];
  if (!video) {
    stopTracks(display);
    throw new Error('screen-no-video');
  }
  stopTracks(screenStream);
  screenStream = display;
  video.addEventListener('ended', () => { onEnded?.(); }, { once: true });
  rebuild();
  return { stream: localStream, gotAudio: display.getAudioTracks().length > 0 };
}

/**
 * Share desktop audio with no picture — music, a video's soundtrack, anything
 * playing on this machine — mixed in as another voice at its own level.
 *
 * getDisplayMedia has no audio-only mode: a picture source must be picked, and
 * a video track always comes back. We stop that track immediately and keep only
 * the audio, so nothing is transmitted and the capture indicator reflects audio
 * alone. Chromium only offers the audio checkbox for a tab or the whole screen,
 * never a single window, so a missing audio track usually means the box was
 * left unticked rather than a browser that cannot do it.
 */
export async function startSystemAudio({ onEnded }: { onEnded?: () => void }) {
  const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
  const audio = display.getAudioTracks();
  // Drop the picture the moment we have it; only the sound is wanted.
  for (const track of display.getVideoTracks()) {
    try { track.stop(); display.removeTrack(track); } catch { /* already gone */ }
  }
  if (!audio.length) {
    stopTracks(display);
    throw new Error('system-audio-none');
  }
  stopTracks(sysAudioStream);
  sysAudioStream = display;
  audio[0].addEventListener('ended', () => { onEnded?.(); }, { once: true });
  rebuild();
  return localStream;
}

export function stopSystemAudio() {
  stopTracks(sysAudioStream);
  sysAudioStream = null;
  rebuild();
  return localStream;
}

export function stopScreenShare() {
  stopTracks(screenStream);
  screenStream = null;
  rebuild();
  return localStream;
}

export function stopLocal() {
  stopTracks(camStream);
  stopTracks(screenStream);
  stopTracks(sysAudioStream);
  disposeAudioGraph();
  camStream = null;
  screenStream = null;
  sysAudioStream = null;
  localStream = null;
  state = { audio: false, video: false, screen: false };
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
