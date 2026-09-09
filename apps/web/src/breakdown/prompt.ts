// The evidence packet and the gate on what comes back.
//
// The model is asked one narrow question at a time and never asked to produce
// the *structure* of the answer — the app builds that. A 77M-parameter model
// asked for JSON mostly returns broken JSON, and a malformed response would
// mean falling back on every verse. Asking for one sentence and assembling the
// object ourselves means the shape is guaranteed and only the phrasing is the
// model's, which is exactly the division of labour we want anyway.

import type { VerseBreakdown } from '@the-word/bible';

export interface EvidencePacket {
  verse: string;
  translation: string;
  text: string;
  context: string[];
  observations: string[];
  crossReferences: string[];
  terms: string[];
}

export function buildPacket(breakdown: VerseBreakdown): EvidencePacket {
  return {
    verse: breakdown.referenceLabel,
    translation: breakdown.translationName,
    text: breakdown.exactText,
    context: [...breakdown.context.previous, ...breakdown.context.next].map((verse) => verse.text),
    observations: breakdown.claims.map((claim) => claim.text),
    crossReferences: breakdown.crossReferences.map((row) => row.reference),
    terms: breakdown.terms.map((term) => term.word),
  };
}

// The model is asked for QUESTIONS ONLY, and that narrowing was made after
// testing paraphrase on real verses. Asked to reword John 3:16, this model
// returned "…which is not inherently true…" and "…which is why he believed in
// him…" — invented theological claims, in fluent English, carrying no invented
// reference and no invented quotation. The provenance gate cannot catch that:
// it checks references and quotes, not meaning. The paraphrases that were safe
// turned out to be the verse repeated back, which adds nothing anyway.
//
// A question asserts nothing, and questions are what a study tool actually
// wants. So the model writes questions, each is checked to be interrogative,
// and nothing declarative from it ever reaches a reader.

/** Fixed templates. No conversation history, no reader-specific text, nothing
 *  random — the same verse yields the same prompts on every device. */
export function questionPrompts(packet: EvidencePacket): string[] {
  return [
    `Write one short question about what this sentence says.\n\n${packet.text}`,
    `Write a question a reader could answer from this sentence alone.\n\n${packet.text}`,
  ];
}

/** Everything the model is allowed to have seen. Used to catch invention. */
export function allowedText(packet: EvidencePacket): string {
  return [packet.text, ...packet.context, ...packet.observations].join(' ');
}

const REFERENCE = /\b(?:[1-3]\s*)?[A-Z][a-z]+\.?\s+\d{1,3}:\d{1,3}\b/g;

function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export interface ModelCheck {
  ok: boolean;
  reason?: string;
  text: string;
}

/**
 * The gate. A generated sentence is kept only if it invents no reference, quotes
 * nothing that was not supplied, and is not simply the prompt echoed back.
 * Anything else is dropped — the deterministic breakdown is already complete and
 * correct without it, so there is nothing to be gained by keeping a doubtful
 * sentence.
 */
export function checkGenerated(raw: string, packet: EvidencePacket): ModelCheck {
  const text = raw.replace(/\s+/g, ' ').trim().replace(/^["“]|["”]$/g, '');
  if (!text) return { ok: false, reason: 'empty', text };
  if (text.length > 300) return { ok: false, reason: 'too long', text };
  if (text.length < 12) return { ok: false, reason: 'too short', text };

  // Interrogative or nothing. This is what makes semantic invention structurally
  // hard rather than merely unlikely: a question makes no claim.
  if (!text.endsWith('?')) return { ok: false, reason: 'not a question', text };

  // Echoing the instructions back is the most common small-model failure.
  if (/^write (a|one) |answerable from|^question:/i.test(text)) {
    return { ok: false, reason: 'echoed the prompt', text };
  }

  // A question must be about this verse: its content words have to come from
  // the supplied text, or it has wandered somewhere we cannot vouch for.
  const supplied = new Set(normalise(allowedText(packet)).split(' ').filter((word) => word.length > 3));
  const asked = normalise(text).split(' ').filter((word) => word.length > 3);
  const shared = asked.filter((word) => supplied.has(word)).length;
  if (!asked.length || shared / asked.length < 0.5) {
    return { ok: false, reason: 'asks about something the verse does not mention', text };
  }

  // Any verse reference must be one we supplied.
  const allowedRefs = new Set([packet.verse.replace(/\s*\(.*\)$/, ''), ...packet.crossReferences].map(normalise));
  for (const found of text.match(REFERENCE) ?? []) {
    if (!allowedRefs.has(normalise(found))) return { ok: false, reason: `invented reference ${found}`, text };
  }

  // Any quoted span must actually occur in the supplied text.
  const haystack = normalise(allowedText(packet));
  for (const quote of text.match(/"([^"]{4,})"|“([^”]{4,})”/g) ?? []) {
    const inner = normalise(quote.replace(/^["“]|["”]$/g, ''));
    if (inner && !haystack.includes(inner)) return { ok: false, reason: 'quoted text that was not supplied', text };
  }

  // A degenerate repeat ("the the the") is a decoding failure, not a sentence.
  const words = normalise(text).split(' ');
  const unique = new Set(words);
  if (words.length > 8 && unique.size / words.length < 0.45) {
    return { ok: false, reason: 'degenerate repetition', text };
  }

  return { ok: true, text };
}
