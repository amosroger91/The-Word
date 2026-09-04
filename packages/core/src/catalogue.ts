import type { Language } from './i18n';

export const storageKeys = {
  translation: 'word.translation',
  language: 'word.language',
  theme: 'word.theme',
  fontSize: 'word.fontSize',
  font: 'word.font',
  bookmarks: 'word.bookmarks',
  voice: 'word.piperVoice',
  rate: 'word.speechRate',
  volume: 'word.speechVolume',
  book: 'word.book',
  chapter: 'word.chapter',
  progress: 'word.progress',
};

export const defaults = { translationId: 'kjv', bookId: 43, chapter: 3, fontSize: 20, fontId: 'system', rate: 1, volume: 1 };

export const fontSizeRange = { min: 16, max: 30 };
export const speechRateRange = { min: 0.5, max: 2, step: 0.1 };
export const speechVolumeRange = { min: 0, max: 1, step: 0.1 };

export interface ReadingFont {
  id: string;
  name: string;
  // Web font stack; on native the id maps to a font family loaded through expo-font.
  stack: string;
  native?: string;
}

export const readingFonts: ReadingFont[] = [
  { id: 'system', name: 'Georgia', stack: "Georgia, 'Times New Roman', serif", native: 'serif' },
  { id: 'literata', name: 'Literata', stack: "'Literata', Georgia, serif", native: 'Literata' },
  { id: 'lexend', name: 'Lexend', stack: "'Lexend', 'Segoe UI', system-ui, sans-serif", native: 'Lexend' },
  { id: 'atkinson', name: 'Atkinson Hyperlegible', stack: "'Atkinson Hyperlegible', 'Segoe UI', system-ui, sans-serif", native: 'AtkinsonHyperlegible' },
  { id: 'opendyslexic', name: 'OpenDyslexic', stack: "'OpenDyslexic', 'Comic Sans MS', sans-serif", native: 'OpenDyslexic' },
];

export interface SpeechVoice {
  id: string;
  name: string;
  // The stock voice, shown under a translated name rather than its model id.
  isDefault?: boolean;
  language: Language;
  // BCP-47 tag handed to the platform speech engine.
  locale: string;
}

export const speechVoices: SpeechVoice[] = [
  { id: 'en_US-libritts_r-medium', name: 'Default Voice', isDefault: true, language: 'en', locale: 'en-US' },
  { id: 'en_US-amy-medium', name: 'Amy', language: 'en', locale: 'en-US' },
  { id: 'en_US-ryan-medium', name: 'Ryan', language: 'en', locale: 'en-US' },
  { id: 'en_GB-alan-medium', name: 'Alan', language: 'en', locale: 'en-GB' },
  { id: 'es_ES-davefx-medium', name: 'Dave', language: 'es', locale: 'es-ES' },
  { id: 'es_MX-claude-high', name: 'Claudia', language: 'es', locale: 'es-MX' },
  { id: 'fr_FR-siwis-medium', name: 'Siwis', language: 'fr', locale: 'fr-FR' },
  { id: 'zh_CN-huayan-medium', name: '华言', language: 'zh', locale: 'zh-CN' },
  { id: 'vi_VN-vais1000-medium', name: 'Vais', language: 'vi', locale: 'vi-VN' },
];

export function voicesFor(language: Language) {
  const available = speechVoices.filter((voice) => voice.language === language);
  return available.length ? available : speechVoices.filter((voice) => voice.language === 'en');
}

export function localeFor(voiceId: string) {
  return speechVoices.find((voice) => voice.id === voiceId)?.locale ?? 'en-US';
}

export function fontFor(id: string) {
  return readingFonts.find((font) => font.id === id) ?? readingFonts[0];
}

export interface TextRun {
  text: string;
  red: boolean;
}

// Splits a verse into plain and red-letter runs so each platform only has to style them.
export function verseRuns(text: string, spans?: Array<[number, number]>): TextRun[] {
  if (!spans?.length) return [{ text, red: false }];
  const runs: TextRun[] = [];
  let cursor = 0;
  for (const [start, end] of spans) {
    if (start > cursor) runs.push({ text: text.slice(cursor, start), red: false });
    runs.push({ text: text.slice(start, end), red: true });
    cursor = end;
  }
  if (cursor < text.length) runs.push({ text: text.slice(cursor), red: false });
  return runs;
}

export function clampFontSize(size: number) {
  return Math.min(fontSizeRange.max, Math.max(fontSizeRange.min, size));
}

export function clampRate(rate: number) {
  return Math.min(speechRateRange.max, Math.max(speechRateRange.min, Math.round(rate * 10) / 10));
}

export function clampVolume(volume: number) {
  return Math.min(speechVolumeRange.max, Math.max(speechVolumeRange.min, Math.round(volume * 10) / 10));
}
