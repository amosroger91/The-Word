import { createHash } from 'node:crypto';
import { createWriteStream, existsSync, mkdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// React Native needs ttf/otf, while @fontsource ships woff2 only, so the native app keeps its own copies.
// Sources are pinned to commits and checked by hash so F-Droid's build gets the same bytes every time.
const fonts = [
  { file: 'Literata.ttf', url: 'https://github.com/google/fonts/raw/bd8f81ddb5c74d5c8897b36ad88b440266245103/ofl/literata/Literata%5Bopsz,wght%5D.ttf', sha256: 'b41138c9373112f32abb589cc22e8674b06ed4048b0c513be922bdd26f274440' },
  { file: 'Lexend.ttf', url: 'https://github.com/google/fonts/raw/bd8f81ddb5c74d5c8897b36ad88b440266245103/ofl/lexend/Lexend%5Bwght%5D.ttf', sha256: '3add53e641fbc81da64da4bb254285e2831b52b029527bc0714e2b9610832ee6' },
  { file: 'AtkinsonHyperlegible.ttf', url: 'https://github.com/google/fonts/raw/bd8f81ddb5c74d5c8897b36ad88b440266245103/ofl/atkinsonhyperlegible/AtkinsonHyperlegible-Regular.ttf', sha256: '7fb917c89019896d0b52ee84b7cbb3304c18cb90b19a62f5e32712bd23e97669' },
  { file: 'OpenDyslexic.otf', url: 'https://raw.githubusercontent.com/antijingoist/opendyslexic/1824da5c0e41dc3e13ffc7f3a636dcaf695d61b7/compiled/OpenDyslexic-Regular.otf', sha256: '32f5840fb2bf844bdabafe372591ddfb9286e98117f5b21950aaf54ea856919a' },
];

const target = join(fileURLToPath(new URL('..', import.meta.url)), 'assets', 'fonts');
mkdirSync(target, { recursive: true });

const sha256 = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');

for (const font of fonts) {
  const path = join(target, font.file);
  if (existsSync(path) && statSync(path).size > 0) {
    if (sha256(path) === font.sha256) {
      console.log(`present   ${font.file}`);
      continue;
    }
    console.log(`replacing ${font.file} (hash changed)`);
  }
  const response = await fetch(font.url);
  if (!response.ok) throw new Error(`${response.status} for ${font.url}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
  const digest = sha256(path);
  if (digest !== font.sha256) {
    rmSync(path);
    throw new Error(`sha256 mismatch for ${font.file}: ${digest}`);
  }
  console.log(`downloaded ${font.file} (${(statSync(path).size / 1024).toFixed(0)} KB)`);
}
