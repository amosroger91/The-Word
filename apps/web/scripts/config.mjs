import { fileURLToPath } from 'node:url';

const modules = await Promise.all([
  import('vite'),
  import('@vitejs/plugin-react'),
  import('vite-plugin-commonjs'),
  import('vite-plugin-cross-origin-isolation'),
]);

const root = process.cwd();
const packages = fileURLToPath(new URL('../../../packages/', import.meta.url));

export default {
  root,
  plugins: [
    modules[2].default(),
    modules[3].default(),
    modules[1].default(),
  ],
  worker: {
    format: 'es',
    plugins: () => [modules[2].default()],
    rollupOptions: {
      output: {
        entryFileNames: 'worker/[name].js',
      },
    },
  },
  resolve: {
    alias: {
      '@the-word/core': packages.replace(/[\\/]$/, '') + '/core/src/index.ts',
      '@the-word/bible': packages.replace(/[\\/]$/, '') + '/bible/src/index.ts',
      '@the-word/shared': packages.replace(/[\\/]$/, '') + '/shared/src/index.ts',
    },
  },
  optimizeDeps: {
    exclude: ['@the-word/core', '@the-word/bible', '@the-word/shared', 'piper-tts-web'],
  },
  build: {
    emptyOutDir: true,
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
  preview: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
};