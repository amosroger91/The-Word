// The deterministic claim layer.
//
// Every statement here is an observation about the text's *shape*, produced by
// rule and citing the exact words that triggered it. Nothing asserts what a
// passage means, who God is, or what a reader should do — those are the claims
// a source-grounded tool has no business inventing.

import type { Verse } from '@the-word/shared';
import type { BreakdownClaim, BreakdownTerm, ClaimSource } from './types';
import { contentWords, countOccurrences, excerpt, properNouns, sentences } from './text';

/** Verbs that, at the head of a sentence, mark an address to someone. */
const IMPERATIVE_HEADS = new Set([
  'go', 'come', 'take', 'behold', 'hear', 'hearken', 'look', 'let', 'give', 'keep', 'remember',
  'repent', 'believe', 'follow', 'arise', 'stand', 'watch', 'pray', 'ask', 'seek', 'knock',
  'fear', 'love', 'honour', 'honor', 'depart', 'rejoice', 'consider', 'bring', 'speak', 'do',
]);

const CAUSE_WORDS = ['because', 'therefore', 'wherefore', 'for this cause', 'so that', 'that ye', 'in order that'];
const CONDITION_WORDS = ['if ', 'except ', 'unless ', 'whosoever ', 'whoever ', 'when ye', 'lest '];
const SPEECH_MARKERS = /\b(said|saith|answered|spake|speaketh|cried|declared|replied)\b/i;

let counter = 0;
function claimId(): string {
  counter += 1;
  return `c${counter}`;
}

/** Reset between builds so ids are stable for a given call order. */
export function resetClaimIds() { counter = 0; }

function verseSource(reference: string, quote: string): ClaimSource {
  return { type: 'verse', reference, quote };
}

/**
 * Who is speaking, if the verse says so in as many words. This looks only for an
 * explicit speech marker and the nearest preceding capitalised name — and when
 * it does not find one it stays silent rather than guessing.
 */
export function speakerClaims(text: string, reference: string): BreakdownClaim[] {
  const match = SPEECH_MARKERS.exec(text);
  if (!match) return [];
  const before = text.slice(0, match.index);
  const names = properNouns(before);
  const speaker = names[names.length - 1];
  const quote = excerpt(text.slice(Math.max(0, match.index - 40), match.index + match[0].length + 30));
  if (!speaker) {
    return [{
      id: claimId(),
      text: `The verse reports speech — it uses the word “${match[0]}” — but does not name the speaker in this verse.`,
      sources: [verseSource(reference, match[0])],
      confidence: 'structured',
    }];
  }
  return [{
    id: claimId(),
    text: `The verse reports speech: “${match[0]}” follows the name ${speaker}.`,
    sources: [verseSource(reference, quote)],
    confidence: 'structured',
  }];
}

/** Questions, addresses, conditions, and stated reasons — each citing its trigger. */
export function shapeClaims(text: string, reference: string): BreakdownClaim[] {
  const claims: BreakdownClaim[] = [];
  const parts = sentences(text);

  for (const part of parts) {
    if (part.trim().endsWith('?')) {
      claims.push({
        id: claimId(),
        text: `This part is a question: “${excerpt(part)}”`,
        sources: [verseSource(reference, part)],
        confidence: 'structured',
      });
    }
    const head = (part.match(/[A-Za-z]+/) ?? [''])[0].toLowerCase();
    if (IMPERATIVE_HEADS.has(head)) {
      claims.push({
        id: claimId(),
        text: `This part addresses someone directly, opening with “${head}”.`,
        sources: [verseSource(reference, excerpt(part))],
        confidence: 'structured',
      });
    }
  }

  const lower = text.toLowerCase();
  for (const word of CAUSE_WORDS) {
    if (lower.includes(word)) {
      claims.push({
        id: claimId(),
        text: `The verse gives a reason or a result — it turns on “${word.trim()}”.`,
        sources: [verseSource(reference, word.trim())],
        confidence: 'structured',
      });
      break;
    }
  }
  for (const word of CONDITION_WORDS) {
    if (lower.includes(word)) {
      claims.push({
        id: claimId(),
        text: `The verse states a condition — it uses “${word.trim()}”.`,
        sources: [verseSource(reference, word.trim())],
        confidence: 'structured',
      });
      break;
    }
  }
  return claims;
}

/** Names and places worth looking up. Phrased as "appears", never as identity. */
export function entityClaims(text: string, reference: string): BreakdownClaim[] {
  const names = properNouns(text);
  if (!names.length) return [];
  return [{
    id: claimId(),
    text: `Named in this verse: ${names.join(', ')}.`,
    sources: names.map((name) => verseSource(reference, name)),
    confidence: 'direct',
  }];
}

/** Words the verse leans on, and whether the surrounding passage leans on them too. */
export function repeatedTerms(text: string, passage: Verse[], reference: string): BreakdownTerm[] {
  const passageText = passage.map((verse) => verse.text).join(' ');
  const counts = new Map<string, number>();
  for (const word of contentWords(text)) counts.set(word, (counts.get(word) ?? 0) + 1);

  const terms: BreakdownTerm[] = [];
  for (const [word, inVerse] of counts) {
    const inPassage = countOccurrences(passageText, word);
    // Worth mentioning only if the verse repeats it, or the passage returns to it.
    if (inVerse < 2 && inPassage < 3) continue;
    terms.push({
      word,
      inVerse,
      inPassage,
      sources: [verseSource(reference, word)],
    });
  }
  return terms.sort((a, b) => b.inVerse - a.inVerse || b.inPassage - a.inPassage).slice(0, 6);
}

export function termClaims(terms: BreakdownTerm[], reference: string): BreakdownClaim[] {
  return terms.map((term) => ({
    id: claimId(),
    text: term.inVerse > 1
      ? `“${term.word}” appears ${term.inVerse} times in this verse.`
      : `“${term.word}” appears ${term.inPassage} times in the surrounding passage.`,
    sources: [verseSource(reference, term.word)],
    confidence: 'direct' as const,
  }));
}

/** What the verse plainly says, as the first thing shown. */
export function textClaim(text: string, reference: string): BreakdownClaim {
  return {
    id: claimId(),
    text,
    sources: [verseSource(reference, text)],
    confidence: 'direct',
  };
}
