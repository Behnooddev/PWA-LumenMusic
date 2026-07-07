/**
 * services/coverService.js
 * ---------------------------------------------------------------
 * When an imported song has no embedded artwork, this draws a
 * deterministic placeholder cover on a canvas: a soft radial glow
 * plus the song's initial letter, in the app's dark/yellow palette.
 * Deterministic = same title always renders the same placeholder,
 * so a library doesn't feel random between reloads.
 * ---------------------------------------------------------------
 */

function hashString(str) {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

const PALETTE = [
  ["#3a2f0d", "#0a0a0c"],
  ["#402a06", "#0a0a0c"],
  ["#332800", "#0a0a0c"],
  ["#3d3312", "#0d0b06"],
  ["#453305", "#0b0a08"],
];

export function generatePlaceholderCover(seedText, size = 300) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");

  const hash = hashString(seedText || "lumen");
  const [inner, outer] = PALETTE[hash % PALETTE.length];
  const cx = size * (0.3 + (hash % 40) / 100);
  const cy = size * (0.3 + ((hash >> 3) % 40) / 100);

  const gradient = ctx.createRadialGradient(cx, cy, 0, cx, cy, size * 0.9);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, size, size);

  // soft equalizer-bar motif, echoing the app's signature visual
  const bars = 5;
  const bw = size * 0.06;
  const gap = size * 0.045;
  const total = bars * bw + (bars - 1) * gap;
  const startX = (size - total) / 2;
  const baseY = size * 0.76;
  ctx.globalAlpha = 0.85;
  for (let i = 0; i < bars; i++) {
    const seedH = ((hash >> (i * 3)) % 100) / 100;
    const barH = size * (0.10 + seedH * 0.30);
    const x = startX + i * (bw + gap);
    ctx.fillStyle = i % 2 === 0 ? "#ffd146" : "#ffe08a";
    roundRect(ctx, x, baseY - barH, bw, barH, bw / 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  // initial letter, low-opacity, large, behind the bars for texture
  const letter = (seedText || "?").trim().charAt(0).toUpperCase() || "?";
  ctx.font = `700 ${size * 0.42}px -apple-system, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = "rgba(255,209,70,0.10)";
  ctx.fillText(letter, size / 2, size * 0.42);

  return canvas.toDataURL("image/png");
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
