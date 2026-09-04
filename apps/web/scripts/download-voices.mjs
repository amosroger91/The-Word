import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const base = 'https://huggingface.co/rhasspy/piper-voices/resolve/main/';
const models = join(fileURLToPath(new URL('..', import.meta.url)), 'public', 'models');

const voices = [
  'en_US-libritts_r-medium',
  'en_US-amy-medium',
  'en_US-ryan-medium',
  'en_GB-alan-medium',
  'es_ES-davefx-medium',
  'es_MX-claude-high',
  'fr_FR-siwis-medium',
  'zh_CN-huayan-medium',
  'vi_VN-vais1000-medium',
];

function voicePath(voice) {
  const parts = voice.split('-');
  return `${parts[0].split('_')[0]}/${parts.join('/')}/${voice}`;
}

async function download(url, target) {
  if (existsSync(target) && statSync(target).size > 0) return false;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  mkdirSync(dirname(target), { recursive: true });
  await pipeline(Readable.fromWeb(response.body), createWriteStream(target));
  return true;
}

for (const voice of voices) {
  const path = voicePath(voice);
  for (const extension of ['.onnx.json', '.onnx']) {
    const target = join(models, ...(path + extension).split('/'));
    const fetched = await download(base + path + extension, target);
    console.log(`${fetched ? 'downloaded' : 'present  '} ${path}${extension}`);
  }
}
