declare module 'piper-tts-web' {
  export class PiperWebEngine {
    constructor(options?: unknown);
    generate(text: string, voice: string, speaker?: number): Promise<{ file: Blob }>;
    destroy(): void;
  }
  export class PiperWebWorkerEngine {
    constructor(options?: unknown);
    generate(text: string, voice: string, speaker?: number): Promise<{ file: Blob }>;
    destroy(): void;
  }
  export class OnnxWebRuntime {
    constructor(options?: { basePath?: string; numThreads?: number });
  }
  export class OnnxWebWorkerRuntime {
    constructor(options?: { basePath?: string });
  }
  export class PhonemizeWebRuntime {
    constructor(options?: { basePath?: string });
  }
  export class PhonemizeWebWorkerRuntime {
    constructor(options?: { basePath?: string });
  }
  export class HuggingFaceVoiceProvider {
    constructor(options?: { baseUrl?: string });
  }
}
