// Shared text utilities. Everything here is pure and deterministic: the same
// verse always yields the same tokens, sentences, and entities.

/** Words too common to be worth reporting as a repeat or an entity. */
const STOPWORDS = new Set([
  'the', 'and', 'of', 'to', 'that', 'in', 'he', 'shall', 'unto', 'for', 'i', 'his', 'a', 'they',
  'be', 'is', 'him', 'not', 'them', 'it', 'with', 'all', 'thou', 'thy', 'was', 'god', 'which',
  'my', 'me', 'said', 'but', 'ye', 'their', 'have', 'will', 'thee', 'from', 'as', 'are', 'when',
  'this', 'out', 'were', 'upon', 'man', 'you', 'we', 'her', 'she', 'there', 'been', 'no', 'than',
  'on', 'into', 'by', 'at', 'up', 'if', 'then', 'so', 'what', 'went', 'came', 'came', 'had', 'hath',
  'because', 'therefore', 'wherefore', 'also', 'now', 'one', 'came', 'may', 'do', 'did', 'am', 'or',
]);

/** Capitalised words that begin sentences or are titles rather than names. */
const NOT_NAMES = new Set([
  'The', 'And', 'For', 'But', 'That', 'This', 'These', 'Those', 'There', 'Then', 'When', 'Where',
  'Who', 'What', 'Why', 'How', 'If', 'As', 'So', 'Now', 'Behold', 'Verily', 'Amen', 'O', 'Yea',
  'He', 'She', 'They', 'We', 'You', 'Ye', 'I', 'It', 'My', 'His', 'Her', 'Their', 'Our', 'Your',
  'A', 'An', 'In', 'Of', 'To', 'Not', 'No', 'All', 'Every', 'Let', 'Come', 'Go', 'Take', 'Fear',
]);

export function words(text: string): string[] {
  return text.toLowerCase().match(/[a-z']+/g) ?? [];
}

export function contentWords(text: string): string[] {
  return words(text).filter((word) => word.length > 2 && !STOPWORDS.has(word));
}

/** Sentence-ish units. KJV leans on colons and semicolons as hard as full
 *  stops, so those split too — but the terminator is kept, because the claim
 *  layer reads it to tell a question from a statement. */
export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;:])\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Capitalised words that are probably names or places. Deliberately cautious:
 * a word is only a candidate when it is capitalised *and* not at the start of a
 * sentence, since a sentence-initial capital says nothing. Callers should treat
 * the result as "worth looking up", never as an assertion about who someone is.
 */
export function properNouns(text: string): string[] {
  const found: string[] = [];
  for (const sentence of sentences(text)) {
    const tokens = sentence.match(/[A-Za-z][A-Za-z'-]*/g) ?? [];
    tokens.forEach((token, index) => {
      if (index === 0) return;                        // sentence-initial proves nothing
      if (!/^[A-Z]/.test(token)) return;
      if (NOT_NAMES.has(token)) return;
      if (token.length < 3) return;
      if (!found.includes(token)) found.push(token);
    });
  }
  return found;
}

/** Normalised for comparing two translations of the same verse. */
export function normalise(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function countOccurrences(text: string, word: string): number {
  return words(text).filter((token) => token === word).length;
}

/** A short excerpt for a citation, cut on a word boundary. */
export function excerpt(text: string, limit = 90): string {
  const clean = text.trim();
  if (clean.length <= limit) return clean;
  const cut = clean.slice(0, limit);
  const space = cut.lastIndexOf(' ');
  return `${cut.slice(0, space > 40 ? space : limit).trim()}…`;
}
