/**
 * SQLite database schema for Bible data
 */

export const SCHEMA_SQL = `
-- Translations table
CREATE TABLE IF NOT EXISTS translations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  description TEXT,
  copyright TEXT,
  language TEXT NOT NULL DEFAULT 'en',
  is_public_domain INTEGER NOT NULL DEFAULT 1,
  api_endpoint TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Books table
CREATE TABLE IF NOT EXISTS books (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT NOT NULL,
  testament TEXT NOT NULL CHECK (testament IN ('old', 'new')),
  chapters INTEGER NOT NULL,
  translation_id TEXT NOT NULL,
  book_order INTEGER NOT NULL,
  FOREIGN KEY (translation_id) REFERENCES translations(id)
);

-- Verses table (using virtual table for full-text search)
CREATE VIRTUAL TABLE IF NOT EXISTS verses_fts USING fts5(
  translation_id,
  book_id,
  chapter,
  verse,
  text,
  content='verses',
  content_rowid='rowid'
);

-- Actual verses table
CREATE TABLE IF NOT EXISTS verses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  translation_id TEXT NOT NULL,
  book_id INTEGER NOT NULL,
  chapter INTEGER NOT NULL,
  verse INTEGER NOT NULL,
  text TEXT NOT NULL,
  FOREIGN KEY (translation_id) REFERENCES translations(id),
  FOREIGN KEY (book_id) REFERENCES books(id),
  UNIQUE(translation_id, book_id, chapter, verse)
);

-- Trigger to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS verses_ai AFTER INSERT ON verses BEGIN
  INSERT INTO verses_fts(rowid, translation_id, book_id, chapter, verse, text)
  VALUES (new.id, new.translation_id, new.book_id, new.chapter, new.verse, new.text);
END;

CREATE TRIGGER IF NOT EXISTS verses_ad AFTER DELETE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, translation_id, book_id, chapter, verse, text)
  VALUES ('delete', old.id, old.translation_id, old.book_id, old.chapter, old.verse, old.text);
END;

CREATE TRIGGER IF NOT EXISTS verses_au AFTER UPDATE ON verses BEGIN
  INSERT INTO verses_fts(verses_fts, rowid, translation_id, book_id, chapter, verse, text)
  VALUES ('delete', old.id, old.translation_id, old.book_id, old.chapter, old.verse, old.text);
  INSERT INTO verses_fts(rowid, translation_id, book_id, chapter, verse, text)
  VALUES (new.id, new.translation_id, new.book_id, new.chapter, new.verse, new.text);
END;

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_verses_lookup ON verses(translation_id, book_id, chapter);
CREATE INDEX IF NOT EXISTS idx_books_translation ON books(translation_id, book_order);
`;

export const BOOKS_DATA = [
  { id: 1, name: 'Genesis', shortName: 'Gen', testament: 'old' as const, chapters: 50, order: 1 },
  { id: 2, name: 'Exodus', shortName: 'Exod', testament: 'old' as const, chapters: 40, order: 2 },
  { id: 3, name: 'Leviticus', shortName: 'Lev', testament: 'old' as const, chapters: 27, order: 3 },
  { id: 4, name: 'Numbers', shortName: 'Num', testament: 'old' as const, chapters: 36, order: 4 },
  { id: 5, name: 'Deuteronomy', shortName: 'Deut', testament: 'old' as const, chapters: 34, order: 5 },
  { id: 6, name: 'Joshua', shortName: 'Josh', testament: 'old' as const, chapters: 24, order: 6 },
  { id: 7, name: 'Judges', shortName: 'Judg', testament: 'old' as const, chapters: 21, order: 7 },
  { id: 8, name: 'Ruth', shortName: 'Ruth', testament: 'old' as const, chapters: 4, order: 8 },
  { id: 9, name: '1 Samuel', shortName: '1 Sam', testament: 'old' as const, chapters: 31, order: 9 },
  { id: 10, name: '2 Samuel', shortName: '2 Sam', testament: 'old' as const, chapters: 24, order: 10 },
  { id: 11, name: '1 Kings', shortName: '1 Kgs', testament: 'old' as const, chapters: 22, order: 11 },
  { id: 12, name: '2 Kings', shortName: '2 Kgs', testament: 'old' as const, chapters: 25, order: 12 },
  { id: 13, name: '1 Chronicles', shortName: '1 Chr', testament: 'old' as const, chapters: 29, order: 13 },
  { id: 14, name: '2 Chronicles', shortName: '2 Chr', testament: 'old' as const, chapters: 36, order: 14 },
  { id: 15, name: 'Ezra', shortName: 'Ezra', testament: 'old' as const, chapters: 10, order: 15 },
  { id: 16, name: 'Nehemiah', shortName: 'Neh', testament: 'old' as const, chapters: 13, order: 16 },
  { id: 17, name: 'Esther', shortName: 'Esth', testament: 'old' as const, chapters: 10, order: 17 },
  { id: 18, name: 'Job', shortName: 'Job', testament: 'old' as const, chapters: 42, order: 18 },
  { id: 19, name: 'Psalms', shortName: 'Ps', testament: 'old' as const, chapters: 150, order: 19 },
  { id: 20, name: 'Proverbs', shortName: 'Prov', testament: 'old' as const, chapters: 31, order: 20 },
  { id: 21, name: 'Ecclesiastes', shortName: 'Eccl', testament: 'old' as const, chapters: 12, order: 21 },
  { id: 22, name: 'Song of Solomon', shortName: 'Song', testament: 'old' as const, chapters: 8, order: 22 },
  { id: 23, name: 'Isaiah', shortName: 'Isa', testament: 'old' as const, chapters: 66, order: 23 },
  { id: 24, name: 'Jeremiah', shortName: 'Jer', testament: 'old' as const, chapters: 52, order: 24 },
  { id: 25, name: 'Lamentations', shortName: 'Lam', testament: 'old' as const, chapters: 5, order: 25 },
  { id: 26, name: 'Ezekiel', shortName: 'Ezek', testament: 'old' as const, chapters: 48, order: 26 },
  { id: 27, name: 'Daniel', shortName: 'Dan', testament: 'old' as const, chapters: 12, order: 27 },
  { id: 28, name: 'Hosea', shortName: 'Hos', testament: 'old' as const, chapters: 14, order: 28 },
  { id: 29, name: 'Joel', shortName: 'Joel', testament: 'old' as const, chapters: 3, order: 29 },
  { id: 30, name: 'Amos', shortName: 'Amos', testament: 'old' as const, chapters: 9, order: 30 },
  { id: 31, name: 'Obadiah', shortName: 'Obad', testament: 'old' as const, chapters: 1, order: 31 },
  { id: 32, name: 'Jonah', shortName: 'Jonah', testament: 'old' as const, chapters: 4, order: 32 },
  { id: 33, name: 'Micah', shortName: 'Mic', testament: 'old' as const, chapters: 7, order: 33 },
  { id: 34, name: 'Nahum', shortName: 'Nah', testament: 'old' as const, chapters: 3, order: 34 },
  { id: 35, name: 'Habakkuk', shortName: 'Hab', testament: 'old' as const, chapters: 3, order: 35 },
  { id: 36, name: 'Zephaniah', shortName: 'Zeph', testament: 'old' as const, chapters: 3, order: 36 },
  { id: 37, name: 'Haggai', shortName: 'Hag', testament: 'old' as const, chapters: 2, order: 37 },
  { id: 38, name: 'Zechariah', shortName: 'Zech', testament: 'old' as const, chapters: 14, order: 38 },
  { id: 39, name: 'Malachi', shortName: 'Mal', testament: 'old' as const, chapters: 4, order: 39 },
  { id: 40, name: 'Matthew', shortName: 'Matt', testament: 'new' as const, chapters: 28, order: 40 },
  { id: 41, name: 'Mark', shortName: 'Mark', testament: 'new' as const, chapters: 16, order: 41 },
  { id: 42, name: 'Luke', shortName: 'Luke', testament: 'new' as const, chapters: 24, order: 42 },
  { id: 43, name: 'John', shortName: 'John', testament: 'new' as const, chapters: 21, order: 43 },
  { id: 44, name: 'Acts', shortName: 'Acts', testament: 'new' as const, chapters: 28, order: 44 },
  { id: 45, name: 'Romans', shortName: 'Rom', testament: 'new' as const, chapters: 16, order: 45 },
  { id: 46, name: '1 Corinthians', shortName: '1 Cor', testament: 'new' as const, chapters: 16, order: 46 },
  { id: 47, name: '2 Corinthians', shortName: '2 Cor', testament: 'new' as const, chapters: 13, order: 47 },
  { id: 48, name: 'Galatians', shortName: 'Gal', testament: 'new' as const, chapters: 6, order: 48 },
  { id: 49, name: 'Ephesians', shortName: 'Eph', testament: 'new' as const, chapters: 6, order: 49 },
  { id: 50, name: 'Philippians', shortName: 'Phil', testament: 'new' as const, chapters: 4, order: 50 },
  { id: 51, name: 'Colossians', shortName: 'Col', testament: 'new' as const, chapters: 4, order: 51 },
  { id: 52, name: '1 Thessalonians', shortName: '1 Thess', testament: 'new' as const, chapters: 5, order: 52 },
  { id: 53, name: '2 Thessalonians', shortName: '2 Thess', testament: 'new' as const, chapters: 3, order: 53 },
  { id: 54, name: '1 Timothy', shortName: '1 Tim', testament: 'new' as const, chapters: 6, order: 54 },
  { id: 55, name: '2 Timothy', shortName: '2 Tim', testament: 'new' as const, chapters: 4, order: 55 },
  { id: 56, name: 'Titus', shortName: 'Titus', testament: 'new' as const, chapters: 3, order: 56 },
  { id: 57, name: 'Philemon', shortName: 'Phlm', testament: 'new' as const, chapters: 1, order: 57 },
  { id: 58, name: 'Hebrews', shortName: 'Heb', testament: 'new' as const, chapters: 13, order: 58 },
  { id: 59, name: 'James', shortName: 'Jas', testament: 'new' as const, chapters: 5, order: 59 },
  { id: 60, name: '1 Peter', shortName: '1 Pet', testament: 'new' as const, chapters: 5, order: 60 },
  { id: 61, name: '2 Peter', shortName: '2 Pet', testament: 'new' as const, chapters: 3, order: 61 },
  { id: 62, name: '1 John', shortName: '1 John', testament: 'new' as const, chapters: 5, order: 62 },
  { id: 63, name: '2 John', shortName: '2 John', testament: 'new' as const, chapters: 1, order: 63 },
  { id: 64, name: '3 John', shortName: '3 John', testament: 'new' as const, chapters: 1, order: 64 },
  { id: 65, name: 'Jude', shortName: 'Jude', testament: 'new' as const, chapters: 1, order: 65 },
  { id: 66, name: 'Revelation', shortName: 'Rev', testament: 'new' as const, chapters: 22, order: 66 },
];

export const TRANSLATIONS_DATA = [
  {
    id: 'kjv',
    name: 'King James Version',
    shortName: 'KJV',
    description: 'The Authorized Version, published in 1611. A classic English translation known for its literary beauty.',
    copyright: 'Public Domain',
    language: 'en',
    isPublicDomain: 1,
    apiEndpoint: null,
  },
  {
    id: 'asv',
    name: 'American Standard Version',
    shortName: 'ASV',
    description: 'Published in 1901, a revision of the KJV using older manuscripts.',
    copyright: 'Public Domain',
    language: 'en',
    isPublicDomain: 1,
    apiEndpoint: null,
  },
  {
    id: 'web',
    name: 'World English Bible',
    shortName: 'WEB',
    description: 'A modern English translation based on the ASV, updated for contemporary readers.',
    copyright: 'Public Domain',
    language: 'en',
    isPublicDomain: 1,
    apiEndpoint: null,
  },
  {
    id: 'rv1909',
    name: 'Reina-Valera 1909',
    shortName: 'RV1909',
    description: 'La revisión de 1909 de la Biblia Reina-Valera, traducida por Casiodoro de Reina y revisada por Cipriano de Valera.',
    copyright: 'Dominio público',
    language: 'es',
    isPublicDomain: 1,
    apiEndpoint: null,
  },
  {
    id: 'rv1602p',
    name: 'Valera 1602 Purificada',
    shortName: 'RV1602P',
    description: 'Revisión de la Biblia de Cipriano de Valera de 1602, basada en el Texto Recibido.',
    copyright: 'Dominio público',
    language: 'es',
    isPublicDomain: 1,
    apiEndpoint: null,
  },
  {
    id: 'lsg',
    name: 'Louis Segond 1910',
    shortName: 'LSG',
    description: 'La traduction française de Louis Segond, publiée en 1910.',
    copyright: 'Domaine public',
    language: 'fr',
    isPublicDomain: 1,
    apiEndpoint: null,
  },
  {
    id: 'cuv',
    name: '新标点和合本',
    shortName: 'CUV',
    description: '1919年出版的中文和合本圣经，新标点简体版。',
    copyright: '公有领域',
    language: 'zh',
    isPublicDomain: 1,
    apiEndpoint: null,
  },
  {
    id: 'vie1934',
    name: 'Kinh Thánh 1934',
    shortName: 'VIE1934',
    description: 'Bản dịch Kinh Thánh tiếng Việt của William Cadman, 1923/1934.',
    copyright: 'Phạm vi công cộng',
    language: 'vi',
    isPublicDomain: 1,
    apiEndpoint: null,
  },
];