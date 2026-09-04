import { loadVerseImage, paintVerseImage, verseImageSize, type VerseImageInput } from '@the-word/core';

function saveCanvas(canvas: HTMLCanvasElement, filename: string) {
  return new Promise<void>((resolve) => {
    const download = (href: string, revoke?: () => void) => {
      const link = document.createElement('a');
      link.download = filename;
      link.href = href;
      link.rel = 'noopener';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Safari needs the object URL to outlive the click.
      if (revoke) window.setTimeout(revoke, 60_000);
      resolve();
    };
    if (typeof canvas.toBlob !== 'function') return download(canvas.toDataURL('image/png'));
    canvas.toBlob((blob) => {
      if (!blob) return download(canvas.toDataURL('image/png'));
      const url = URL.createObjectURL(blob);
      download(url, () => URL.revokeObjectURL(url));
    }, 'image/png');
  });
}

// One-tap export used by the verse of the day: paints exactly the artwork that
// is on screen (same background file and overlay) and downloads it — no editor.
export async function downloadVerseImage(input: VerseImageInput, backgroundSrc: string, filename: string) {
  const canvas = document.createElement('canvas');
  canvas.width = verseImageSize.width;
  canvas.height = verseImageSize.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  let image: HTMLImageElement | null = null;
  try {
    image = await loadVerseImage(backgroundSrc);
  } catch {
    image = null;
  }
  paintVerseImage(ctx, input, image);
  await saveCanvas(canvas, filename);
}
