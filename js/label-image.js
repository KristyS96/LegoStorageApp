// A picture of app-made labels (part number over name, several side by side with
// dashed cut lines), to preview the .lbx files the app makes (js/lbx.js).
import { appLabelLines } from './labels.js';

const HEIGHT = 160; // the Brother app scales the picture to the tape
const PAD = 16;
const GAP = 48; // between labels, with the cut line in the middle
const MIN_WIDTH = HEIGHT * 2.5;
const MAX_TEXT = HEIGHT * 6 - PAD * 2;
const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, Arial, sans-serif';

// Largest size (down to `min`) at which the text fits; shortened with "…" if it never does.
function fit(ctx, text, weight, size, min) {
  for (let s = size; s >= min; s -= 2) {
    ctx.font = `${weight} ${s}px ${FONT}`;
    if (ctx.measureText(text).width <= MAX_TEXT) return { text, font: ctx.font, width: ctx.measureText(text).width };
  }
  let t = text;
  while (t.length > 1 && ctx.measureText(`${t}…`).width > MAX_TEXT) t = t.slice(0, -1);
  t = `${t.trimEnd()}…`;
  return { text: t, font: ctx.font, width: ctx.measureText(t).width };
}

function layout(ctx, part) {
  const [num, name] = appLabelLines(part);
  const lines = [
    { ...fit(ctx, num, 800, 70, 44), y: HEIGHT * 0.33 },
    { ...fit(ctx, name, 600, 50, 30), y: HEIGHT * 0.75 },
  ];
  return { lines, width: Math.max(MIN_WIDTH, ...lines.map((l) => Math.ceil(l.width) + PAD * 2)) };
}

/** One strip of labels as a canvas. */
export function drawStrip(parts, doc = document) {
  const canvas = doc.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const labels = parts.map((p) => layout(ctx, p));
  return paint(canvas, ctx, labels);
}

function paint(canvas, ctx, labels) {
  canvas.width = labels.reduce((w, l) => w + l.width, 0) + GAP * (labels.length - 1);
  canvas.height = HEIGHT;
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let x = 0;
  labels.forEach((label, i) => {
    if (i) {
      const cut = x - GAP / 2;
      ctx.strokeStyle = '#000';
      ctx.lineWidth = 2;
      ctx.setLineDash([10, 10]);
      ctx.beginPath();
      ctx.moveTo(cut, 0);
      ctx.lineTo(cut, HEIGHT);
      ctx.stroke();
    }
    ctx.fillStyle = '#000';
    ctx.textBaseline = 'middle';
    for (const line of label.lines) {
      ctx.font = line.font;
      ctx.fillText(line.text, x + PAD, line.y);
    }
    x += label.width + GAP;
  });
  return canvas;
}
