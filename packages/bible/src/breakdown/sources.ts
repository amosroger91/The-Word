// Provenance checking. Every claim must name a source, and every quote must
// actually occur in the text it cites — otherwise the claim is dropped, not
// softened. This runs over the deterministic output today; the same gate is
// what a model's output would have to pass before any of it reached a reader.

import type { BreakdownClaim, VerseBreakdown } from './types';
import { normalise } from './text';

export interface SourceIndex {
  /** reference label → the exact text it refers to */
  texts: Map<string, string>;
}

export function buildSourceIndex(breakdown: {
  referenceLabel: string;
  exactText: string;
  context: { previous: { text: string }[]; next: { text: string }[] };
  translations: { name: string; text: string }[];
  crossReferences: { reference: string; text?: string }[];
}): SourceIndex {
  const texts = new Map<string, string>();
  texts.set(breakdown.referenceLabel, breakdown.exactText);
  const around = [...breakdown.context.previous, ...breakdown.context.next].map((v) => v.text).join(' ');
  texts.set('context', around);
  for (const translation of breakdown.translations) texts.set(translation.name, translation.text);
  for (const reference of breakdown.crossReferences) {
    if (reference.text) texts.set(reference.reference, reference.text);
  }
  return { texts };
}

/**
 * A claim survives when it names at least one source, every source is known,
 * and every quote appears in the text it points at. Anything else is dropped —
 * "not established by the supplied sources" is the honest answer, and it is
 * better than an unsupported sentence that reads plausibly.
 */
export function verifyClaims(claims: BreakdownClaim[], index: SourceIndex): {
  kept: BreakdownClaim[];
  dropped: { claim: BreakdownClaim; why: string }[];
} {
  const kept: BreakdownClaim[] = [];
  const dropped: { claim: BreakdownClaim; why: string }[] = [];

  for (const claim of claims) {
    if (!claim.sources.length) {
      dropped.push({ claim, why: 'no source' });
      continue;
    }
    let problem = '';
    for (const source of claim.sources) {
      const known = index.texts.has(source.reference) || source.type === 'context';
      if (!known) { problem = `unknown reference ${source.reference}`; break; }
      if (!source.quote) continue;
      const haystack = normalise(index.texts.get(source.reference) ?? index.texts.get('context') ?? '');
      if (!haystack.includes(normalise(source.quote))) {
        problem = `quote not found in ${source.reference}`;
        break;
      }
    }
    if (problem) dropped.push({ claim, why: problem });
    else kept.push(claim);
  }
  return { kept, dropped };
}

/** Run the gate over a finished breakdown, returning it with unsupported
 *  claims removed and a warning for each drop. */
export function enforceProvenance(breakdown: VerseBreakdown): VerseBreakdown {
  const index = buildSourceIndex(breakdown);
  const { kept, dropped } = verifyClaims(breakdown.claims, index);
  return {
    ...breakdown,
    claims: kept,
    sourceWarnings: [
      ...breakdown.sourceWarnings,
      ...dropped.map(({ claim, why }) => `Dropped an unsupported statement (${why}): ${claim.text}`),
    ],
  };
}
