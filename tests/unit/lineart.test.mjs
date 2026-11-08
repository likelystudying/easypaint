import { test, before } from "node:test";
import assert from "node:assert/strict";
import { loadCVNode, rgbaImage } from "../helpers/cv-node.mjs";
import { edgeParams, sketchParams, clampDetail, edgesInk, sketchInk, removeSpecks } from "../../js/features/lineart.js";
import { inkFraction } from "../../js/imaging.js";

let cv;
before(async () => { cv = await loadCVNode(); });

function fillRect(img, x0, y0, x1, y1, v) {
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
    const i = (y * img.width + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
}
const at = (ink, img, x, y) => ink[y * img.width + x];

test("clampDetail keeps detail in 1..10 and defaults bad input to 5", () => {
  assert.equal(clampDetail(0), 1); assert.equal(clampDetail(99), 10); assert.equal(clampDetail("x"), 5); assert.equal(clampDetail(6.4), 6);
});

test("edge thresholds fall and blur shrinks as detail rises", () => {
  const a = edgeParams(1), b = edgeParams(10);
  assert.ok(a.hi > b.hi && a.lo > b.lo);
  assert.ok(a.blur >= b.blur && a.blur % 2 === 1 && b.blur % 2 === 1);
  assert.ok(a.lo < a.hi);
});

test("sketch block size is odd, at least 7, and smaller at higher detail", () => {
  const lo = sketchParams(1, 1000, 800), hi = sketchParams(10, 1000, 800);
  assert.equal(lo.block % 2, 1); assert.equal(hi.block % 2, 1);
  assert.ok(hi.block >= 7 && lo.block > hi.block);
  assert.ok(lo.C > hi.C && lo.minArea > hi.minArea);
});

test("Edges outlines a solid shape: boundary inked, inside and outside clear", () => {
  const img = rgbaImage(200, 150, 235);
  fillRect(img, 50, 40, 150, 110, 60);
  const ink = edgesInk(cv, img, 5);
  assert.equal(ink.length, 200 * 150);
  assert.equal(at(ink, img, 100, 75), 0, "inside the shape");
  assert.equal(at(ink, img, 10, 10), 0, "background");
  const edgeHits = [[50, 75], [149, 75], [100, 40], [100, 109]].filter(([x, y]) =>
    [-2, -1, 0, 1, 2].some(d => at(ink, img, x + d, y) === 255 || at(ink, img, x, y + d) === 255));
  assert.equal(edgeHits.length, 4, "all four sides have an edge");
  const f = inkFraction(ink);
  assert.ok(f > 0.005 && f < 0.15, `ink fraction ${f}`);
});

test("Edges finds more lines at higher detail on a textured image", () => {
  const img = rgbaImage(200, 150, 200);
  let s = 3;
  for (let i = 0; i < img.data.length; i += 4) { s = (s * 16807) % 2147483647; const v = 150 + (s % 60); img.data[i] = img.data[i + 1] = img.data[i + 2] = v; }
  fillRect(img, 60, 40, 140, 110, 40);
  assert.ok(inkFraction(edgesInk(cv, img, 10)) >= inkFraction(edgesInk(cv, img, 1)));
});

test("Sketch keeps a dark stroke and ignores an uneven-lighting gradient", () => {
  const img = rgbaImage(300, 200, 255);
  for (let y = 0; y < 200; y++) for (let x = 0; x < 300; x++) {
    const v = Math.round(120 + (x / 299) * 130); // dim on the left, bright on the right
    const i = (y * 300 + x) * 4; img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
  }
  fillRect(img, 20, 98, 280, 102, 20); // a 4 px dark stroke across both light levels
  const ink = sketchInk(cv, img, 5);
  assert.equal(at(ink, img, 30, 100), 255, "stroke in the dim area");
  assert.equal(at(ink, img, 270, 100), 255, "stroke in the bright area");
  let stray = 0;
  for (let y = 0; y < 200; y++) for (let x = 0; x < 300; x++) if (Math.abs(y - 100) > 14 && ink[y * 300 + x]) stray++;
  assert.ok(stray / (300 * 200) < 0.005, `stray ink ${stray}`);
});

test("removeSpecks deletes small blobs and keeps large ones", () => {
  const m = new cv.Mat(60, 60, cv.CV_8UC1, new cv.Scalar(0));
  const d = m.data;
  for (const [x, y] of [[5, 5], [50, 10], [10, 50]]) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) d[(y + dy) * 60 + x + dx] = 255;
  for (let y = 20; y < 40; y++) for (let x = 20; x < 40; x++) d[y * 60 + x] = 255;
  removeSpecks(cv, m, 10);
  assert.equal(d[5 * 60 + 5], 0);
  assert.equal(d[30 * 60 + 30], 255);
  let n = 0; for (let i = 0; i < d.length; i++) if (d[i]) n++;
  assert.equal(n, 400);
  m.delete();
});
