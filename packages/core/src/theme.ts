import type { Theme } from './useWordApp';

// Shared palette: the web stylesheet and the native StyleSheets are both built from these values.
export const palettes = {
  light: {
    background: '#f7f4ee',
    text: '#292720',
    muted: '#8e806c',
    border: '#c9c1b3',
    rule: '#ded9cf',
    accent: '#947849',
    accentSoft: '#a3895e',
    highlight: '#e7ddc9',
    speaking: '#d4bd87',
    redLetter: '#a5342b',
    barBackground: '#292720',
    barText: '#f7f4ee',
    barMuted: '#d9d0c2',
    barBorder: '#746955',
    error: '#7d342e',
    crossRef: '#3d6f8c',
  },
  dark: {
    background: '#191816',
    text: '#eee9df',
    muted: '#8e806c',
    border: '#4a453b',
    rule: '#38352e',
    accent: '#947849',
    accentSoft: '#a3895e',
    highlight: '#3b3529',
    speaking: '#59492f',
    redLetter: '#e08a7e',
    barBackground: '#292720',
    barText: '#f7f4ee',
    barMuted: '#d9d0c2',
    barBorder: '#746955',
    error: '#7d342e',
    crossRef: '#7eabc4',
  },
};

export type Palette = typeof palettes.light;

export function paletteFor(theme: Theme): Palette {
  return palettes[theme];
}
