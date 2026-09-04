import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// React Native needs ttf/otf, while @fontsource ships woff2 only, so the native app keeps its own copies.
const fonts = [
  { file: 'Literata.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/literata/Literata%5Bopsz,wght%5D.ttf' },
  { file: 'Lexend.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/lexend/Lexend%5Bwght%5D.ttf' },
  { file: 'AtkinsonHyperlegible.ttf', url: 'https://github.com/google/fonts/raw/main/ofl/atkinsonhyperlegible/AtkinsonHyperlegible-Regular.ttf' },
  { file: 'OpenDyslexic.otf', url: 'https://raw.githubusercontent.com/antijingoist/opendyslexic/master/compiled/OpenDyslexic-Regular.otf' },
];

const target = join(fileURLToPath(new URL('..', import.meta.url)), 'assets', 'fonts');
mkdirSync(target, { recursive: true });

for (const font of fonts) {
  const path = join(target, font.file);
  if (existsSync(path) && statSync(path).size > 0) {
    console.log(`present   ${font.file}`);
    continue;
  }
  const response = await fetch(font.url);
  if (!response.ok) throw new Error(`${response.status} for ${font.url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
  console.log(`downloaded ${font.file} (${(statSync(path).size / 1024).toFixed(0)} KB)`);
}
