import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = dirname(fileURLToPath(import.meta.url));

function run(file) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(dir, file)], { stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${file} exited ${code}`))));
  });
}

await run('copy-piper-assets.mjs');
await run('fetch-daily.mjs');
