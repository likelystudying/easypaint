import { test, before } from "node:test";
import assert from "node:assert/strict";
import { loadCVNode, rgbaImage } from "../helpers/cv-node.mjs";
import * as G from "../../js/geometry.js";
import { glareFraction, largestBlob, nextGlareState, coverRect, enhanceContrast, percentileStretch, GLARE_ON, GLARE_OFF } from "../../js/features/view.js";

let cv;
before(async () => { cv = await loadCVNode(); });

function paint(img, x0, y0, x1, y1, rgb) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.width + x) * 4; img.data[i] = rgb[0]; img.data[i + 1] = rgb[1]; img.data[i + 2] = rgb[2];
  }
}
const std = (d) => { let s = 0, s2 = 0, n = 0; for (let i = 0; i < d.length; i += 4) { s += d[i]; s2 += d[i] * d[i]; n++; } const m = s / n; return Math.sqrt(s2 / n - m * m); };

test("glareFraction counts blown-out white only", () => {
  const img = rgbaImage(100, 100, 236);
  paint(img, 0, 0, 10, 100, [255, 255, 255]);   // 10% glare
  paint(img, 10, 0, 20, 100, [255, 255, 0]);    // bright yellow: saturated colour, not glare
  paint(img, 20, 0, 30, 100, [242, 242, 242]);  // light board, not glare
  assert.equal(glareFraction(img.data, 100, 100), 0.1);
});

test("scattered bright bits do not count as glare, one big patch does", () => {
  const img = rgbaImage(100, 100, 236);
  for (let k = 0; k < 25; k++) paint(img, (k % 5) * 20 + 2, Math.floor(k / 5) * 20 + 2, (k % 5) * 20 + 6, Math.floor(k / 5) * 20 + 6, [255, 255, 255]);
  assert.ok(glareFraction(img.data, 100, 100) <= 0.0016, "25 separate 4x4 dots = 4% total, each 0.16%");
  paint(img, 40, 40, 70, 70, [255, 255, 255]);
  assert.ok(glareFraction(img.data, 100, 100) >= 0.09, "a 30x30 patch is glare");
});

test("largestBlob uses 4-connectivity", () => {
  const m = new Uint8Array([1, 0, 0, 0, 1, 0, 0, 0, 1]); // diagonal only
  assert.equal(largestBlob(m, 3, 3), 1);
  assert.equal(largestBlob(new Uint8Array([1, 1, 0, 0, 1, 0, 0, 1, 1]), 3, 3), 5);
});

test("glare warning needs two high readings and clears below the lower threshold", () => {
  let s = { warn: false, streak: 0 };
  s = nextGlareState(s, GLARE_ON + 0.01); assert.equal(s.warn, false, "one reading is not enough");
  s = nextGlareState(s, GLARE_ON + 0.01); assert.equal(s.warn, true);
  s = nextGlareState(s, (GLARE_ON + GLARE_OFF) / 2); assert.equal(s.warn, true, "stays on between thresholds");
  s = nextGlareState(s, GLARE_OFF / 2); assert.equal(s.warn, false);
  s = nextGlareState(s, GLARE_ON + 0.01); assert.equal(s.warn, false, "needs to confirm again");
});

test("coverRect matches the cover mapping used for the overlay", () => {
  const r = coverRect(640, 480, 390, 844);
  const M = G.coverMap(640, 480, 390, 844);
  const tl = G.apply(M, [0, 0]), br = G.apply(M, [640, 480]);
  assert.ok(Math.abs(r.left - tl[0]) < 1e-9 && Math.abs(r.top - tl[1]) < 1e-9);
  assert.ok(Math.abs(r.width - (br[0] - tl[0])) < 1e-9 && Math.abs(r.height - (br[1] - tl[1])) < 1e-9);
});

test("percentileStretch maps a dim range to the full range", () => {
  const g = new Uint8Array(1000);
  for (let i = 0; i < g.length; i++) g[i] = 100 + (i % 41); // 100..140
  const r = percentileStretch(g);
  assert.ok(r.lo >= 100 && r.hi <= 140);
  assert.ok(Math.min(...g) <= 5 && Math.max(...g) >= 250);
});

test("percentileStretch ignores a few glare pixels", () => {
  const g = new Uint8Array(1000);
  for (let i = 0; i < g.length; i++) g[i] = i < 8 ? 255 : 100 + (i % 41);
  const r = percentileStretch(g);
  assert.ok(r.hi <= 141, `upper bound ${r.hi} should ignore 0.8% glare`);
});

test("percentileStretch does not blow up a nearly flat image", () => {
  const g = new Uint8Array(1000).map((_, i) => 200 + (i % 3));
  percentileStretch(g);
  assert.ok(Math.max(...g) - Math.min(...g) <= 255 * 2 / 24 + 1, "noise stays small");
});

test("enhanceContrast spreads a low-contrast image and keeps its size", () => {
  const img = rgbaImage(160, 120, 0);
  for (let y = 0; y < 120; y++) for (let x = 0; x < 160; x++) {
    const v = 115 + ((x >> 3) + (y >> 3)) % 2 * 12 + Math.round(8 * Math.sin(x / 9)); // faint pattern
    const i = (y * 160 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  const out = enhanceContrast(cv, img);
  assert.equal(out.length, img.data.length);
  assert.ok(std(out) > 2 * std(img.data), `contrast ${std(img.data).toFixed(1)} -> ${std(out).toFixed(1)}`);
  assert.equal(out[0], out[1]); assert.equal(out[1], out[2]); // grey
});
