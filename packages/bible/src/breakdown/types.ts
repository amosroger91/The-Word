import type { Verse } from '@the-word/shared';

export interface VerseReference {
  bookId: number;
  chapter: number;
  verse: number;
}

/** Where a statement came from. Nothing is shown without one. */
export type SourceType = 'verse' | 'context' | 'cross-reference' | 'lexicon' | 'translation';

export interface ClaimSource {
  type: SourceType;
  /** Human reference, e.g. "John 3:16 (KJV)". */
  reference: string;
  /** The exact words this leans on. Verified to appear in the source text. */
  quote?: string;
}

/**
 * How far a statement is from the text.
 *  - `direct`      quotes or restates the verse itself
 *  - `structured`  an observation about the text's shape (a question, a repeat,
 *                  a "because"), derived by rule and citing the words it saw
 *  - `interpretive` anything further. Nothing in the deterministic engine emits
 *                  this; it exists so a model's output can be labelled and, if
 *                  it lacks support, dropped.
 */
export type Confidence = 'direct' | 'structured' | 'interpretive';

export interface BreakdownClaim {
  id: string;
  text: string;
  sources: ClaimSource[];
  confidence: Confidence;
}

export interface BreakdownTerm {
  word: string;
  /** Times in the verse itself. */
  inVerse: number;
  /** Times across the surrounding passage window, verse included. */
  inPassage: number;
  sources: ClaimSource[];
}

export interface TranslationComparison {
  translationId: string;
  name: string;
  text: string;
  /** False when the wording matches the chosen translation once normalised. */
  differs: boolean;
}

export interface BreakdownCrossReference {
  reference: string;
  bookId: number;
  chapter: number;
  verse: number;
  text?: string;
  /** Cross references can point at a run of verses, not just one. */
  endVerse?: number;
}

export interface VerseBreakdown {
  reference: VerseReference;
  referenceLabel: string;
  translationId: string;
  translationName: string;
  exactText: string;
  context: {
    previous: Verse[];
    current: Verse;
    next: Verse[];
    chapterVerseCount: number;
  };
  translations: TranslationComparison[];
  crossReferences: BreakdownCrossReference[];
  terms: BreakdownTerm[];
  claims: BreakdownClaim[];
  /** Things the engine could not establish, said out loud rather than guessed. */
  sourceWarnings: string[];
}

export const NOT_ESTABLISHED = 'Not established by the supplied sources.';
