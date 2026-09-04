#!/usr/bin/env node
/**
 * Import ASV Bible text
 * Source: Public domain
 */

import fs from 'fs';
import path from 'path';
import { importTranslation, downloadTranslation } from '../src/importer';
import { getBibleDatabase } from '../src/database';

const ASV_URL = 'https://raw.githubusercontent.com/bible-api-com/bible-api-data/main/asv.txt';
const DATA_DIR = path.join(process.cwd(), 'data', 'translations');
const ASV_PATH = path.join(DATA_DIR, 'asv.txt');

async function main() {
  console.log('Importing ASV...');

  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  if (!fs.existsSync(ASV_PATH)) {
    console.log('Downloading ASV...');
    await downloadTranslation('asv', ASV_URL, ASV_PATH);
    console.log('Downloaded ASV');
  } else {
    console.log('ASV file already exists');
  }

  console.log('Importing into database...');
  const result = await importTranslation('asv', ASV_PATH, 'simple');

  console.log(`Imported ${result.versesImported} verses`);
  if (result.errors.length > 0) {
    console.error('Errors:', result.errors);
  }

  const db = getBibleDatabase();
  const chapter = await db.getChapter('asv', 43, 3); // John 3
  if (chapter) {
    console.log(`Sample: John 3:16 - ${chapter.verses.find(v => v.ref.verse === 16)?.text}`);
  }

  console.log('ASV import complete!');
}

main().catch(console.error);