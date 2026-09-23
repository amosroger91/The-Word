import { verseImageFontFace } from './verseImageFonts';

export const verseImageSize = { width: 1080, height: 1350 };
export const verseImageFormats = [
  { id: 'share', width: 1080, height: 1350 },
  { id: 'phone', width: 2160, height: 3840 },
  { id: 'desktop', width: 3840, height: 2160 },
] as const;
export type VerseImageFormat = (typeof verseImageFormats)[number]['id'];
export function verseImageFormat(id?: string) {
  return verseImageFormats.find((item) => item.id === id) ?? verseImageFormats[0];
}
export const verseImageFontStack = 'Literata, Georgia, serif';
export type VerseImageStyle = 'paper' | 'photograph';

export interface VerseImageInput {
  reference: string;
  text: string;
  translation: string;
  background: string;
  textColor: string;
  accent: string;
  fontStack: string;
  fontSize?: number;
  overlayOpacity?: number;
  imageDataUrl?: string;
  style?: VerseImageStyle;
  brand?: string;
  edition?: string;
  tooLong?: string;
  width?: number;
  height?: number;
}

export function verseImageFilename(bookName: string, chapter: number) {
  return `the-word-${bookName.replace(/\s+/g, '-').toLowerCase() || 'verse'}-${chapter}.png`;
}

export function verseImageDownloadName(filename: string, format: VerseImageFormat = 'share') {
  if (format === 'share') return filename;
  return `${filename.replace(/\.png$/i, '')}-${format}-4k.png`;
}

// Keep accessibility font choices; use the bundled book face for the default.
export function verseImageFont(readerFont: string) {
  return /lexend|atkinson|opendyslexic/i.test(readerFont) ? readerFont : verseImageFontStack;
}

// Self-contained: this same painter is serialized into the native WebView, so
// preview and export cannot drift into separate designs. No module references.
export function paintVerseImage(ctx: CanvasRenderingContext2D, input: VerseImageInput, image?: CanvasImageSource | null) {
  const surface = ctx.canvas as { width?: number; height?: number } | undefined;
  const width = (surface && surface.width) || input.width || 1080;
  const height = (surface && surface.height) || input.height || 1350;
  // The share card is the 1080×1350 design. Taller and wider formats scale that
  // design; a landscape wallpaper uses its own full-bleed composition.
  const landscape = width > height;
  const scale = landscape ? height / 1350 : width / 1080;
  const offsetY = landscape ? 0 : (height - 1350 * scale) / 2;
  const px = (value: number) => value * scale;
  const py = (value: number) => value * scale + offsetY;
  const photo = input.style === 'photograph';
  const color = input.textColor || (photo ? '#fff9ed' : '#26332d');
  const hex = color.replace('#', '');
  const rgb = hex.length === 3 ? hex.split('').map(c => parseInt(c + c, 16)) : [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16));
  const lightInk = rgb.every(Number.isFinite) && (rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722) > 155;
  const paper = lightInk ? '#1c2926' : '#f6f2e9';
  const accent = lightInk ? '#d8bc87' : '#856b40';
  const font = input.fontStack || 'Georgia, serif';
  const sans = 'Lexend, Arial, sans-serif';
  const inset = landscape ? Math.round(height * 0.08) : px(108);
  const textWidth = landscape ? Math.round(width * (photo ? 0.5 : 0.4)) : width - inset * 2;
  const textX = landscape && photo ? (width - textWidth) / 2 : inset;

  function tracked(text: string, x: number, y: number, size: number, spacing: number) {
    ctx.font = `400 ${size}px ${sans}`;
    let at = x;
    for (const letter of Array.from(text)) { ctx.fillText(letter, at, y); at += ctx.measureText(letter).width + spacing; }
  }

  function rounded(x: number, y: number, w: number, h: number, r: number) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawPhoto(x: number, y: number, w: number, h: number, radius = 0) {
    ctx.save();
    if (radius) rounded(x, y, w, h, radius), ctx.clip();
    if (image) {
      const source = image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number };
      const iw = source.naturalWidth || source.width || w, ih = source.naturalHeight || source.height || h;
      const scale = Math.max(w / iw, h / ih);
      ctx.drawImage(image, x + (w - iw * scale) / 2, y + (h - ih * scale) / 2, iw * scale, ih * scale);
    } else {
      const wash = ctx.createLinearGradient(x, y, x + w, y + h);
      wash.addColorStop(0, '#253f3b'); wash.addColorStop(0.6, '#728578'); wash.addColorStop(1, '#c5b28c');
      ctx.fillStyle = wash; ctx.fillRect(x, y, w, h);
    }
    ctx.restore();
  }

  // Preserve every character, including CJK and long words. No quote marks,
  // rewritten Scripture, or ellipses are added by the layout.
  function wrap(text: string, maxWidth: number) {
    const tokens = text.trim().match(/[\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]|[^\s\u2e80-\u9fff\uac00-\ud7af\uf900-\ufaff]+|\s+/gu) || [];
    const lines: string[] = [];
    let line = '', space = '';
    for (const token of tokens) {
      if (/^\s+$/.test(token)) { space = line ? ' ' : ''; continue; }
      // Keep commas and full stops on the line they belong to. CJK punctuation
      // is its own token, and a break before it leaves the mark stranded.
      if (line && /^[,.;:!?，。、；：！？…」』】》）)\]\}]+$/.test(token)) { line += token; space = ''; continue; }
      const proposed = line + space + token;
      if (ctx.measureText(proposed).width <= maxWidth) line = proposed;
      else if (ctx.measureText(token).width <= maxWidth) {
        if (line) lines.push(line); line = token;
      } else {
        if (line) lines.push(line); line = '';
        const Segmenter = (Intl as unknown as { Segmenter?: new (...args: unknown[]) => { segment: (s: string) => Iterable<{ segment: string }> } }).Segmenter;
        const parts = Segmenter ? Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(token), part => part.segment) : Array.from(token);
        for (const part of parts) {
          if (line && ctx.measureText(line + part).width > maxWidth) { lines.push(line); line = ''; }
          line += part;
        }
      }
      space = '';
    }
    if (line) lines.push(line);
    return lines;
  }

  const top = landscape ? Math.round(height * 0.22) : py(photo ? 282 : 228);
  const bottom = landscape ? Math.round(height * 0.78) : py(photo ? 1050 : 850);
  const referenceSpace = px(100);
  const minBody = Math.max(32, Math.round(32 * scale));
  let bodySize = Math.min(Math.round(88 * scale), Math.max(minBody, Math.round((Number(input.fontSize) || 64) * scale)));
  let lines: string[] = [];
  let lineHeight = 0;
  for (; bodySize >= minBody; bodySize--) {
    ctx.font = `400 ${bodySize}px ${font}`;
    lines = wrap(input.text, textWidth);
    lineHeight = Math.round(bodySize * 1.42);
    if (lines.length * lineHeight + referenceSpace <= bottom - top) break;
  }
  if (bodySize < minBody) throw new Error(input.tooLong || 'This passage is too long for one image. Select fewer verses so the text stays readable.');
  // Balance ragged lines without adding another line or stranding a tiny tail.
  const lineCount = lines.length;
  const step = Math.max(4, px(12));
  for (let candidate = textWidth - step; candidate >= textWidth * 0.74; candidate -= step) {
    const balanced = wrap(input.text, candidate);
    if (balanced.length !== lineCount) break;
    lines = balanced;
  }
  const blockHeight = lines.length * lineHeight;
  const bodyTop = top + (bottom - top - blockHeight - referenceSpace) / 2;

  ctx.save();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = paper; ctx.fillRect(0, 0, width, height);
  const frame = px(52.5);
  if (photo) {
    drawPhoto(0, 0, width, height);
    const opacity = Math.min(0.72, Math.max(0, input.overlayOpacity ?? 0.34));
    const tone = lightInk ? '9,20,18' : '250,247,239';
    const veil = ctx.createLinearGradient(0, 0, 0, height);
    veil.addColorStop(0, `rgba(${tone},${Math.min(0.5, opacity * 0.42)})`);
    veil.addColorStop(0.34, `rgba(${tone},${Math.min(0.62, opacity * 0.5 + 0.1)})`);
    veil.addColorStop(0.7, `rgba(${tone},${Math.min(0.74, opacity * 0.62 + 0.16)})`);
    veil.addColorStop(1, `rgba(${tone},${Math.min(0.66, opacity * 0.48 + 0.08)})`);
    ctx.fillStyle = veil; ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = lightInk ? '#ffffff35' : '#26332d35'; ctx.lineWidth = Math.max(1, px(1));
    ctx.strokeRect(frame, frame, width - frame * 2, height - frame * 2);
  } else if (landscape) {
    const panelX = Math.round(width * 0.56);
    const panelY = inset;
    const panelW = width - panelX - inset;
    const panelH = height - inset * 2;
    const radius = px(16);
    drawPhoto(panelX, panelY, panelW, panelH, radius);
    ctx.save();
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.45; ctx.lineWidth = Math.max(1, px(1.5));
    rounded(panelX, panelY, panelW, panelH, radius); ctx.stroke();
    ctx.restore();
    const wash = Math.min(0.55, Math.max(0, input.overlayOpacity ?? 0.08));
    if (wash > 0) {
      ctx.save(); rounded(panelX, panelY, panelW, panelH, radius); ctx.clip();
      ctx.fillStyle = `rgba(17,32,26,${wash})`; ctx.fillRect(panelX, panelY, panelW, panelH);
      ctx.restore();
    }
  } else {
    const stripX = px(72), stripY = py(948), stripW = px(936), stripH = px(288), radius = px(16);
    drawPhoto(stripX, stripY, stripW, stripH, radius);
    ctx.save();
    ctx.strokeStyle = accent; ctx.globalAlpha = 0.45; ctx.lineWidth = Math.max(1, px(1.5));
    rounded(stripX, stripY, stripW, stripH, radius); ctx.stroke();
    ctx.restore();
    const wash = Math.min(0.55, Math.max(0, input.overlayOpacity ?? 0.08));
    if (wash > 0) {
      ctx.save(); rounded(stripX, stripY, stripW, stripH, radius); ctx.clip();
      ctx.fillStyle = `rgba(17,32,26,${wash})`; ctx.fillRect(stripX, stripY, stripW, stripH);
      ctx.restore();
    }
  }

  const brandY = landscape ? Math.round(height * 0.1) : py(120);
  const footY = landscape ? Math.round(height * 0.9) : py(photo ? 1220 : 1301);
  const markX = landscape ? width - inset - px(66) : px(935);
  const markY = landscape ? brandY + px(14) : py(134);
  ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = color;
  tracked(input.brand || 'THE WORD', textX, brandY, px(22), px(4.8));
  // Small vector book mark stays crisp at the full export resolution.
  ctx.strokeStyle = accent; ctx.lineWidth = Math.max(1, px(1.8)); ctx.beginPath();
  ctx.moveTo(markX, markY); ctx.lineTo(markX, markY - px(27)); ctx.quadraticCurveTo(markX - px(16), markY - px(34), markX - px(33), markY - px(30));
  ctx.lineTo(markX - px(33), markY - px(4)); ctx.quadraticCurveTo(markX - px(16), markY - px(7), markX, markY);
  ctx.quadraticCurveTo(markX + px(16), markY - px(7), markX + px(33), markY - px(4)); ctx.lineTo(markX + px(33), markY - px(30)); ctx.quadraticCurveTo(markX + px(16), markY - px(34), markX, markY - px(27)); ctx.stroke();
  ctx.font = `400 ${bodySize}px ${font}`; ctx.fillStyle = color;
  if (photo) {
    ctx.shadowColor = lightInk ? 'rgba(8,14,12,0.55)' : 'rgba(255,250,240,0.4)';
    ctx.shadowBlur = px(16); ctx.shadowOffsetY = px(2);
  }
  lines.forEach((line, index) => ctx.fillText(line, textX, bodyTop + lineHeight * (index + 0.5)));
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
  const referenceY = bodyTop + blockHeight + px(58);
  ctx.fillStyle = accent; ctx.fillRect(textX, referenceY - px(1), px(44), Math.max(1, px(2)));
  let referenceSize = px(27);
  const referenceMax = textWidth - px(72);
  do { ctx.font = `400 ${referenceSize}px ${sans}`; referenceSize--; }
  while (referenceSize > px(18) && ctx.measureText(input.reference).width > referenceMax);
  ctx.fillStyle = color; ctx.fillText(input.reference, textX + px(72), referenceY, referenceMax);
  ctx.globalAlpha = photo ? 0.82 : 0.7;
  tracked(input.edition || 'HOLY BIBLE', textX, footY, px(17), px(2.8));
  ctx.font = `400 ${px(18)}px ${sans}`; ctx.textAlign = 'right';
  ctx.fillText(input.translation, landscape && !photo ? Math.round(width * 0.52) : width - inset, footY, px(520));
  ctx.restore();
  return { fontSize: bodySize, lines, bodyTop, bodyBottom: bodyTop + blockHeight, referenceY };
}

export function loadVerseImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image(); image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the background image.'));
    image.src = src;
  });
}

export async function loadVerseImageFonts(fontStack: string) {
  if (typeof document !== 'undefined' && document.fonts) {
    await Promise.all([document.fonts.load(`400 64px ${fontStack}`), document.fonts.load('400 22px Lexend')]);
  }
}

export function verseImageHtml(input: VerseImageInput, preview = false) {
  const payload = JSON.stringify(input).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${verseImageFontFace}html,body{margin:0;background:transparent;overflow:hidden}canvas{display:block;width:100%;height:100vh}</style></head>
<body><canvas id="c" width="${input.width || 1080}" height="${input.height || 1350}"></canvas>
<script>
(async function () {
  var input = ${payload}; var canvas = document.getElementById('c');
  canvas.width = input.width || 1080; canvas.height = input.height || 1350;
  var paint = ${paintVerseImage.toString()};
  try {
    if (document.fonts) {
      await Promise.all([document.fonts.load('400 64px Literata'), document.fonts.load('400 22px Lexend'), document.fonts.ready]);
    }
    var image = null;
    if (input.imageDataUrl) image = await new Promise(function(resolve, reject) {
      var img = new Image(); img.onload = function(){resolve(img)}; img.onerror = reject; img.src = input.imageDataUrl;
    });
    paint(canvas.getContext('2d'), input, image);
    if (!${preview} && window.ReactNativeWebView) window.ReactNativeWebView.postMessage(canvas.toDataURL('image/png'));
  } catch(error) {
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('error:' + (error.message || 'Could not render the image.'));
  }
})();
</script></body></html>`;
}
