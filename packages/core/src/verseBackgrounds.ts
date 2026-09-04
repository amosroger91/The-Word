export type VerseBackgroundKind = 'black' | 'color';

export interface VerseBackground {
  id: string;
  name: string;
  file: string;
  kind: VerseBackgroundKind;
}

export const verseBackgrounds: VerseBackground[] = [
  { id: 'cross', name: 'Cross', file: 'cross-black.jpg', kind: 'black' },
  { id: 'reader', name: 'Reader', file: 'man-reading-bible-black.jpg', kind: 'black' },
  { id: 'church', name: 'Church', file: 'church-color.jpg', kind: 'color' },
  { id: 'flowers', name: 'Flowers', file: 'flowers-color.jpg', kind: 'color' },
  { id: 'flowers-1', name: 'Garden', file: 'flowers-1-color.jpg', kind: 'color' },
  { id: 'lamb', name: 'Lamb', file: 'lamb-color.jpg', kind: 'color' },
  { id: 'mountains', name: 'Mountains', file: 'mountains-color.jpg', kind: 'color' },
  { id: 'roman', name: 'Columns', file: 'roman-structure-color.jpg', kind: 'color' },
  { id: 'sunset', name: 'Sunset', file: 'sunset-color.jpg', kind: 'color' },
  { id: 'sunset-1', name: 'Dusk', file: 'sunset-1-color.jpg', kind: 'color' },
  { id: 'valley', name: 'Valley', file: 'valley-color.jpg', kind: 'color' },
];

export const verseTextColors = ['#ffffff', '#f7f4ee', '#e7ddc9', '#947849', '#292720', '#111111'];

export const verseImageFontRange = { min: 28, max: 72, defaultSize: 46 };
export const defaultColorOverlay = 0.48;

export function overlayFor(kind: VerseBackgroundKind) {
  return kind === 'color' ? defaultColorOverlay : 0;
}

export function backgroundById(id: string) {
  return verseBackgrounds.find((item) => item.id === id) ?? verseBackgrounds[0];
}

export function randomBackground() {
  return verseBackgrounds[Math.floor(Math.random() * verseBackgrounds.length)];
}

export function backgroundForSeed(seed: string) {
  let total = 0;
  for (let index = 0; index < seed.length; index += 1) total += seed.charCodeAt(index) * (index + 1);
  return verseBackgrounds[total % verseBackgrounds.length];
}

export interface VerseImageDraft {
  backgroundId: string;
  overlayOpacity: number;
  fontSize: number;
  textColor: string;
}

export function draftForBackground(background: VerseBackground): VerseImageDraft {
  return {
    backgroundId: background.id,
    overlayOpacity: overlayFor(background.kind),
    fontSize: verseImageFontRange.defaultSize,
    textColor: '#ffffff',
  };
}
