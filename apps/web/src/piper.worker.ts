import { PiperWebEngine, OnnxWebRuntime, PhonemizeWebRuntime, HuggingFaceVoiceProvider } from 'piper-tts-web';

// A dedicated worker can be terminated if Piper hangs. The library leaves its
// engine busy after a rejected generation; reusing that instance never recovers.
let engine: PiperWebEngine | null = null;
self.onmessage = async ({ data }: MessageEvent<{ text: string; voice: string; base: string }>) => {
  try {
    engine ??= new PiperWebEngine({
      onnxRuntime: new OnnxWebRuntime({ basePath: `${data.base}onnx/`, numThreads: 1 }),
      phonemizeRuntime: new PhonemizeWebRuntime({ basePath: `${data.base}piper/` }),
      voiceProvider: new HuggingFaceVoiceProvider(),
    });
    const { file } = await engine.generate(data.text, data.voice, 0);
    if (!file?.size) throw new Error('Piper returned an empty audio file.');
    self.postMessage({ file });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'Voice generation failed.' });
  }
};
