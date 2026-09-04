import { fileURLToPath } from 'node:url';

const modules = await Promise.all([
  import('vite'),
  import('@vitejs/plugin-react'),
  import('vite-plugin-commonjs'),
  import('vite-plugin-cross-origin-isolation'),
]);

const root = process.cwd();
const packages = fileURLToPath(new URL('../../../packages/', import.meta.url));

// GitHub Pages serves the site under a repository subpath (e.g. /The-Word/).
// Set BASE_PATH at build time to that subpath; it defaults to '/' for local dev
// and any root-hosted deploy. Vite exposes this to app code as import.meta.env.BASE_URL.
const base = process.env.BASE_PATH || '/';

export default {
  root,
  base,
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
    // packages/core is consumed as raw source via the aliases above, but React
    // is only installed under apps/web. Deduping forces every bare 'react' import
    // (including core's hooks) to resolve from the app, instead of the unresolved
    // optional peer-dep stub that breaks the production Rollup build.
    dedupe: ['react', 'react-dom'],
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