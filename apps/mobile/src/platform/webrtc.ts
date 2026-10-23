// A static import of react-native-webrtc crashes Expo Go, where the native
// module is not linked. Group calls and graph gossip need RTCPeerConnection;
// everything else must still open when this returns false.
export function installWebRTC(): boolean {
  try {
    const webrtc = require('react-native-webrtc') as { registerGlobals?: () => void };
    webrtc.registerGlobals?.();
  } catch {
    // The JS package can load while the native binary is absent.
  }
  const ready = typeof RTCPeerConnection !== 'undefined';
  (globalThis as { __WORD_WEBRTC__?: boolean }).__WORD_WEBRTC__ = ready;
  return ready;
}

export function webrtcReady(): boolean {
  return (globalThis as { __WORD_WEBRTC__?: boolean }).__WORD_WEBRTC__ === true;
}
