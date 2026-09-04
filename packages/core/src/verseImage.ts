export const verseImageSize = { width: 1080, height: 1350 };

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
}

export function verseImageFilename(bookName: string, chapter: number) {
  return `the-word-${bookName.replace(/\s+/g, '-').toLowerCase() || 'verse'}-${chapter}.png`;
}

function coverDraw(
  ctx: CanvasRenderingContext2D,
  image: CanvasImageSource,
  width: number,
  height: number,
) {
  const source = image as { width: number; height: number };
  const sourceWidth = Number(source.width) || width;
  const sourceHeight = Number(source.height) || height;
  const scale = Math.max(width / sourceWidth, height / sourceHeight);
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;
  ctx.drawImage(image, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export function paintVerseImage(ctx: CanvasRenderingContext2D, input: VerseImageInput, image?: CanvasImageSource | null) {
  const { width, height } = verseImageSize;
  ctx.fillStyle = input.background || '#111111';
  ctx.fillRect(0, 0, width, height);
  if (image) coverDraw(ctx, image, width, height);
  const overlay = input.overlayOpacity ?? 0;
  if (overlay > 0) {
    ctx.fillStyle = `rgba(0,0,0,${overlay})`;
    ctx.fillRect(0, 0, width, height);
  }

  const bodySize = input.fontSize ?? 46;
  const refSize = Math.round(bodySize * 0.72);
  const footSize = Math.max(22, Math.round(bodySize * 0.52));
  const lineHeight = Math.round(bodySize * 1.32);
  const color = input.textColor || '#ffffff';

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = color;
  ctx.font = `600 ${refSize}px ${input.fontStack}`;
  ctx.fillText(input.reference, width / 2, height * 0.16);

  ctx.font = `400 ${bodySize}px ${input.fontStack}`;
  const lines = wrapLines(ctx, input.text, width * 0.78);
  const block = lines.length * lineHeight;
  let y = (height - block) / 2 + lineHeight / 2;
  const minY = height * 0.26;
  const maxBottom = height * 0.8;
  if (y < minY) y = minY;
  if (y + block - lineHeight / 2 > maxBottom) y = Math.max(minY, maxBottom - block + lineHeight / 2);
  for (const entry of lines) {
    ctx.fillText(entry, width / 2, y);
    y += lineHeight;
  }

  ctx.font = `400 ${footSize}px ${input.fontStack}`;
  ctx.globalAlpha = 0.85;
  ctx.fillText(`The Word · ${input.translation}`, width / 2, height * 0.9);
  ctx.globalAlpha = 1;
}

export function loadVerseImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Could not load the background image.'));
    image.src = src;
  });
}

export function verseImageHtml(input: VerseImageInput) {
  const payload = JSON.stringify(input).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:${input.background}">
<canvas id="c" width="${verseImageSize.width}" height="${verseImageSize.height}"></canvas>
<script>
(function () {
  var i = ${payload};
  var canvas = document.getElementById('c');
  var ctx = canvas.getContext('2d');
  var width = ${verseImageSize.width};
  var height = ${verseImageSize.height};
  function wrap(text, maxWidth) {
    var lines = [];
    var line = '';
    var words = text.split(/\\s+/);
    for (var n = 0; n < words.length; n++) {
      var test = line ? line + ' ' + words[n] : words[n];
      if (ctx.measureText(test).width <= maxWidth) line = test;
      else { if (line) lines.push(line); line = words[n]; }
    }
    if (line) lines.push(line);
    return lines;
  }
  function paint(image) {
    ctx.fillStyle = i.background || '#111111';
    ctx.fillRect(0, 0, width, height);
    if (image) {
      var scale = Math.max(width / image.width, height / image.height);
      var dw = image.width * scale;
      var dh = image.height * scale;
      ctx.drawImage(image, (width - dw) / 2, (height - dh) / 2, dw, dh);
    }
    var overlay = i.overlayOpacity || 0;
    if (overlay > 0) {
      ctx.fillStyle = 'rgba(0,0,0,' + overlay + ')';
      ctx.fillRect(0, 0, width, height);
    }
    var bodySize = i.fontSize || 46;
    var refSize = Math.round(bodySize * 0.72);
    var footSize = Math.max(22, Math.round(bodySize * 0.52));
    var lineHeight = Math.round(bodySize * 1.32);
    var color = i.textColor || '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.font = '600 ' + refSize + 'px ' + i.fontStack;
    ctx.fillText(i.reference, width / 2, height * 0.16);
    ctx.font = '400 ' + bodySize + 'px ' + i.fontStack;
    var lines = wrap(i.text, width * 0.78);
    var block = lines.length * lineHeight;
    var y = (height - block) / 2 + lineHeight / 2;
    var minY = height * 0.26;
    var maxBottom = height * 0.8;
    if (y < minY) y = minY;
    if (y + block - lineHeight / 2 > maxBottom) y = Math.max(minY, maxBottom - block + lineHeight / 2);
    for (var li = 0; li < lines.length; li++) {
      ctx.fillText(lines[li], width / 2, y);
      y += lineHeight;
    }
    ctx.font = '400 ' + footSize + 'px ' + i.fontStack;
    ctx.globalAlpha = 0.85;
    ctx.fillText('The Word \\u00b7 ' + i.translation, width / 2, height * 0.9);
    ctx.globalAlpha = 1;
    var url = canvas.toDataURL('image/png');
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(url);
  }
  if (i.imageDataUrl) {
    var image = new Image();
    image.onload = function () { paint(image); };
    image.onerror = function () {
      if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage('error:Could not load the background image.');
    };
    image.src = i.imageDataUrl;
  } else {
    paint(null);
  }
})();
</script>
</body></html>`;
}
