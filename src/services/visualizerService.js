/**
 * services/visualizerService.js
 * ---------------------------------------------------------------
 * A small, smooth, mirrored frequency visualizer with exponential
 * easing between frames (no jitter) and a soft glow, drawn on a
 * single lightweight canvas. Built directly on the Web Audio API —
 * no charting library needed.
 * ---------------------------------------------------------------
 */

export function createVisualizer({ canvas, audioElement }) {
  const ctx = canvas.getContext("2d");
  let audioCtx = null;
  let analyser = null;
  let sourceNode = null;
  let freqData = null;
  let smoothed = null;
  const BAR_COUNT = 28;
  let rafId = null;
  let intensityCallback = null;

  function ensureGraph() {
    if (audioCtx) return;
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 128;
    analyser.smoothingTimeConstant = 0.75;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    smoothed = new Array(BAR_COUNT).fill(0);
    sourceNode = audioCtx.createMediaElementSource(audioElement);
    sourceNode.connect(analyser);
    analyser.connect(audioCtx.destination);
  }

  function resume() {
    ensureGraph();
    if (audioCtx.state === "suspended") audioCtx.resume();
  }

  function sampleBars() {
    analyser.getByteFrequencyData(freqData);
    const binsPerBar = Math.floor(freqData.length / BAR_COUNT) || 1;
    const bars = new Array(BAR_COUNT);
    for (let i = 0; i < BAR_COUNT; i++) {
      let sum = 0;
      for (let j = 0; j < binsPerBar; j++) sum += freqData[i * binsPerBar + j] || 0;
      bars[i] = sum / binsPerBar / 255;
    }
    return bars;
  }

  function draw() {
    rafId = requestAnimationFrame(draw);
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (!analyser || audioElement.paused) {
      drawIdleLine(ctx, w, h);
      if (intensityCallback) intensityCallback(0);
      return;
    }

    const bars = sampleBars();
    let peak = 0;
    const barW = w / BAR_COUNT;

    for (let i = 0; i < BAR_COUNT; i++) {
      // exponential smoothing avoids jittery frame-to-frame jumps
      smoothed[i] += (bars[i] - smoothed[i]) * 0.35;
      const v = smoothed[i];
      peak = Math.max(peak, v);

      const barH = Math.max(2, v * h * 0.9);
      const x = i * barW + barW * 0.15;
      const bw = barW * 0.7;
      const yMid = h / 2;

      const gradient = ctx.createLinearGradient(0, yMid - barH / 2, 0, yMid + barH / 2);
      gradient.addColorStop(0, "rgba(255,224,138,0.95)");
      gradient.addColorStop(1, "rgba(201,143,31,0.85)");
      ctx.fillStyle = gradient;
      ctx.shadowColor = "rgba(255,209,70,0.55)";
      ctx.shadowBlur = 6;
      roundedBar(ctx, x, yMid - barH / 2, bw, barH, Math.min(bw / 2, 4));
      ctx.fill();
    }
    ctx.shadowBlur = 0;

    if (intensityCallback) intensityCallback(peak);
  }

  function roundedBar(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawIdleLine(ctx, w, h) {
    ctx.strokeStyle = "rgba(255,209,70,0.30)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();
  }

  function start() {
    if (rafId) return;
    draw();
  }

  function stop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }

  function onIntensity(cb) {
    intensityCallback = cb;
  }

  return { resume, start, stop, onIntensity };
}
