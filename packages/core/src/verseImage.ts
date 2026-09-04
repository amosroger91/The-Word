export const verseImageSize = { width: 1080, height: 1350 };

export interface VerseImageInput {
  reference: string;
  text: string;
  translation: string;
  background: string;
  textColor: string;
  accent: string;
  fontStack: string;
}

export function verseImageFilename(bookName: string, chapter: number) {
  return `the-word-${bookName.replace(/\s+/g, '-').toLowerCase() || 'verse'}-${chapter}.png`;
}

export function paintVerseImage(ctx: CanvasRenderingContext2D, input: VerseImageInput) {
  const { width, height } = verseImageSize;
  ctx.fillStyle = input.background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = input.accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(width * 0.06, height * 0.05, width * 0.88, height * 0.9);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = input.textColor;
  ctx.font = `600 44px ${input.fontStack}`;
  ctx.fillText(input.reference, width / 2, height * 0.18);

  const maxWidth = width * 0.72;
  const lineHeight = 68;
  ctx.font = `48px ${input.fontStack}`;
  const lines: string[] = [];
  let line = '';
  for (const word of input.text.split(/\s+/)) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  let y = height * 0.38;
  for (const entry of lines) {
    ctx.fillText(entry, width / 2, y);
    y += lineHeight;
  }

  ctx.font = `400 32px ${input.fontStack}`;
  ctx.fillStyle = input.accent;
  ctx.fillText(`The Word · ${input.translation}`, width / 2, height * 0.88);
}

export function verseImageHtml(input: VerseImageInput) {
  const payload = JSON.stringify(input).replace(/</g, '\\u003c');
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head>
<body style="margin:0;background:${input.background}">
<canvas id="c" width="${verseImageSize.width}" height="${verseImageSize.height}"></canvas>
<script>
(function () {
  var i = ${payload};
  var ctx = document.getElementById('c').getContext('2d');
  var width = ${verseImageSize.width};
  var height = ${verseImageSize.height};
  ctx.fillStyle = i.background;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = i.accent;
  ctx.lineWidth = 3;
  ctx.strokeRect(width * 0.06, height * 0.05, width * 0.88, height * 0.9);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = i.textColor;
  ctx.font = '600 44px ' + i.fontStack;
  ctx.fillText(i.reference, width / 2, height * 0.18);
  var maxWidth = width * 0.72;
  var lineHeight = 68;
  ctx.font = '48px ' + i.fontStack;
  var lines = [];
  var line = '';
  var words = i.text.split(/\\s+/);
  for (var n = 0; n < words.length; n++) {
    var test = line ? line + ' ' + words[n] : words[n];
    if (ctx.measureText(test).width <= maxWidth) line = test;
    else { if (line) lines.push(line); line = words[n]; }
  }
  if (line) lines.push(line);
  var y = height * 0.38;
  for (var li = 0; li < lines.length; li++) {
    ctx.fillText(lines[li], width / 2, y);
    y += lineHeight;
  }
  ctx.font = '400 32px ' + i.fontStack;
  ctx.fillStyle = i.accent;
  ctx.fillText('The Word \\u00b7 ' + i.translation, width / 2, height * 0.88);
  var url = document.getElementById('c').toDataURL('image/png');
  if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(url);
})();
</script>
</body></html>`;
}
