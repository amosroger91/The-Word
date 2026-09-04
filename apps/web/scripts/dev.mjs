import { createServer } from 'vite';
import config from './config.mjs';

const server = await createServer({
  ...config,
  configFile: false,
  server: {
    ...config.server,
    port: Number(process.env.PORT) || 5173,
    strictPort: !!process.env.PORT,
  },
});

await server.listen();
server.printUrls();