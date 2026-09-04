import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const out = fileURLToPath(new URL('../public/daily.json', import.meta.url));
const api = 'https://discoverybiblestudy.org/daily/api/';

function isVerse(value) {
  return value && typeof value === 'object' && typeof value.text === 'string' && typeof value.ref === 'string';
}

try {
  const response = await fetch(api, { headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  const data = await response.json();
  if (!isVerse(data)) throw new Error('Unexpected daily verse payload');
  writeFileSync(out, `${JSON.stringify(data)}\n`);
  console.log('Wrote daily verse', data.ref, 'to', out);
} catch (error) {
  if (existsSync(out) && isVerse(JSON.parse(readFileSync(out, 'utf8')))) {
    console.warn('Could not refresh daily verse; keeping existing snapshot.', error);
  } else {
    throw error;
  }
}
