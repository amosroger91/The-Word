// Deterministic, source-grounded verse breakdown.
//
// The rule the whole design turns on: this layer retrieves and organises what
// the bundled Scripture already says. It never invents a connection, a history,
// or a doctrine. A model may later rephrase what comes out of here, but it may
// only ever be a formatter of this evidence — never the authority behind it.

import { localBible } from '../local';
import { loadBookCrossRefs, chapterCrossRefs, type CrossReference } from '../crossRefs';
import type { Verse } from '@the-word/shared';
import {
  entityClaims, repeatedTerms, resetClaimIds, shapeClaims, speakerClaims, termClaims, textClaim,
} from './outline';
import { enforceProvenance } from './sources';
import { normalise } from './text';
import type {
  BreakdownClaim, BreakdownCrossReference, TranslationComparison, VerseBreakdown, VerseReference,
} from './types';

export * from './types';
export * as breakdownText from './text';
export { enforceProvenance, verifyClaims, buildSourceIndex } from './sources';

const WINDOW = 2;

export interface BreakdownOptions {
  translationId: string;
  reference: VerseReference;
  /** Other translations to compare. The caller decides, because loading one
   *  that is not already in memory pulls megabytes. */
  compareTranslations?: string[];
  /** How many verses either side to include as context. */
  window?: number;
}

function label(bookName: string, ref: VerseReference, translationShort?: string): string {
  const base = `${bookName} ${ref.chapter}:${ref.verse}`;
  return translationShort ? `${base} (${translationShort})` : base;
}

export async function buildBreakdown(options: BreakdownOptions): Promise<VerseBreakdown> {
  resetClaimIds();
  const { translationId, reference } = options;
  const window = options.window ?? WINDOW;
  const warnings: string[] = [];

  const translations = localBible.getTranslations();
  const translation = translations.find((item) => item.id === translationId);
  const books = localBible.getBooks(translationId);
  const book = books.find((item) => item.id === reference.bookId);
  const bookName = book?.name ?? `Book ${reference.bookId}`;

  const chapter = await localBible.getChapter(translationId, reference.bookId, reference.chapter);
  const current = chapter?.verses.find((verse) => verse.ref.verse === reference.verse);
  if (!chapter || !current) {
    throw new Error(`${bookName} ${reference.chapter}:${reference.verse} is not in this translation.`);
  }

  const referenceLabel = label(bookName, reference, translation?.shortName);
  const index = chapter.verses.findIndex((verse) => verse.ref.verse === reference.verse);
  const previous = chapter.verses.slice(Math.max(0, index - window), index);
  const next = chapter.verses.slice(index + 1, index + 1 + window);
  const passage: Verse[] = [...previous, current, ...next];

  // ---- translation comparison -------------------------------------------
  const comparisons: TranslationComparison[] = [];
  for (const id of options.compareTranslations ?? []) {
    if (id === translationId) continue;
    const other = translations.find((item) => item.id === id);
    if (!other) continue;
    try {
      const otherChapter = await localBible.getChapter(id, reference.bookId, reference.chapter);
      const otherVerse = otherChapter?.verses.find((verse) => verse.ref.verse === reference.verse);
      // Only shown when the verse is actually there: versification differs, and
      // an empty row would read as if the verse were missing from Scripture.
      if (!otherVerse) {
        warnings.push(`${other.name} does not carry ${bookName} ${reference.chapter}:${reference.verse}.`);
        continue;
      }
      comparisons.push({
        translationId: id,
        name: `${bookName} ${reference.chapter}:${reference.verse} (${other.shortName})`,
        text: otherVerse.text,
        differs: normalise(otherVerse.text) !== normalise(current.text),
      });
    } catch {
      warnings.push(`${other.name} could not be loaded for comparison.`);
    }
  }

  // ---- cross references --------------------------------------------------
  const crossReferences: BreakdownCrossReference[] = [];
  try {
    const file = await loadBookCrossRefs(reference.bookId);
    const forChapter = chapterCrossRefs(file, reference.chapter);
    const rows: CrossReference[] = forChapter[reference.verse] ?? [];
    for (const row of rows.slice(0, 12)) {
      const targetBook = books.find((item) => item.id === row.bookId);
      const span = row.endVerse && row.endVerse > row.verse ? `-${row.endVerse}` : '';
      crossReferences.push({
        reference: `${targetBook?.name ?? `Book ${row.bookId}`} ${row.chapter}:${row.verse}${span}`,
        bookId: row.bookId,
        chapter: row.chapter,
        verse: row.verse,
        endVerse: row.endVerse,
      });
    }
  } catch {
    warnings.push('Cross references are not available offline for this book.');
  }

  // ---- deterministic claims ---------------------------------------------
  const terms = repeatedTerms(current.text, passage, referenceLabel);
  const claims: BreakdownClaim[] = [
    textClaim(current.text, referenceLabel),
    ...entityClaims(current.text, referenceLabel),
    ...speakerClaims(current.text, referenceLabel),
    ...shapeClaims(current.text, referenceLabel),
    ...termClaims(terms, referenceLabel),
  ];

  if (comparisons.some((item) => item.differs)) {
    claims.push({
      id: 'translation-diff',
      text: `The wording differs across ${comparisons.filter((item) => item.differs).length} of the compared translations.`,
      sources: comparisons.filter((item) => item.differs).map((item) => ({
        type: 'translation' as const, reference: item.name,
      })),
      confidence: 'structured',
    });
  }

  if (!crossReferences.length) warnings.push('No cross references are listed for this verse.');

  const breakdown: VerseBreakdown = {
    reference,
    referenceLabel,
    translationId,
    translationName: translation?.name ?? translationId,
    exactText: current.text,
    context: { previous, current, next, chapterVerseCount: chapter.verses.length },
    translations: comparisons,
    crossReferences,
    terms,
    claims,
    sourceWarnings: warnings,
  };

  // Nothing leaves without provenance that checks out.
  return enforceProvenance(breakdown);
}
