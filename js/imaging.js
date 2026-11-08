// Pure pixel operations on plain arrays (no DOM, no OpenCV).
// "Ink" maps are Uint8Array, one byte per pixel: 255 = line, 0 = background.

export const COLORS = { red: [255, 59, 48], blue: [30, 107, 255], green: [22, 198, 12] };

export function luminance(r, g, b) {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}

// Dark pixels become ink. Light grey paper (>= 235) becomes fully transparent.
export function inkFromLuminance(rgba, w, h) {
  const ink = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < ink.length; i += 4, j++) {
    const L = luminance(rgba[i], rgba[i + 1], rgba[i + 2]);
    ink[j] = Math.round(Math.max(0, Math.min(1, (235 - L) / 175)) * 255);
  }
  return ink;
}

// Ink map -> RGBA where colour is fixed and alpha carries the ink strength.
export function colorize(ink, rgb) {
  const out = new Uint8ClampedArray(ink.length * 4);
  for (let j = 0, i = 0; j < ink.length; j++, i += 4) {
    out[i] = rgb[0]; out[i + 1] = rgb[1]; out[i + 2] = rgb[2]; out[i + 3] = ink[j];
  }
  return out;
}

// Size that fits within maxSide while keeping aspect ratio (never upscales).
export function fitDims(w, h, maxSide) {
  const k = Math.min(1, maxSide / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}

export function inkFraction(ink, threshold = 128) {
  let n = 0;
  for (let i = 0; i < ink.length; i++) if (ink[i] >= threshold) n++;
  return n / ink.length;
}
