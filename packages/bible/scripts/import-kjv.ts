#!/usr/bin/env node
/**
 * Import KJV Bible text
 * Source: https://github.com/bible-api-com/bible-api-data
 */

import fs from 'fs';
import path from 'path';
import { importTranslation, downloadTranslation } from '../src/importer';
import { getBibleDatabase } from '../src/database';

const KJV_URL = 'https://raw.githubusercontent.com/bible-api-com/bible-api-data/main/kjv.txt';
const DATA_DIR = path.join(process.cwd(), 'data', 'translations');
const KJV_PATH = path.join(DATA_DIR, 'kjv.txt');

async function main() {
  console.log('Importing KJV...');

  // Ensure data directory exists
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }

  // Download if not present
  if (!fs.existsSync(KJV_PATH)) {
    console.log('Downloading KJV...');
    await downloadTranslation('kjv', KJV_URL, KJV_PATH);
    console.log('Downloaded KJV');
  } else {
    console.log('KJV file already exists');
  }

  // Import
  console.log('Importing into database...');
  const result = await importTranslation('kjv', KJV_PATH, 'simple');

  console.log(`Imported ${result.versesImported} verses`);
  if (result.errors.length > 0) {
    console.error('Errors:', result.errors);
  }

  // Verify
  const db = getBibleDatabase();
  const chapter = await db.getChapter('kjv', 43, 3); // John 3
  if (chapter) {
    console.log(`Sample: John 3:16 - ${chapter.verses.find(v => v.ref.verse === 16)?.text}`);
  }

  console.log('KJV import complete!');
}

main().catch(console.error);