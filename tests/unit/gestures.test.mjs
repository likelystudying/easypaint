import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../../js/geometry.js";
import { gestureH } from "../../js/gestures.js";

const W = 400, IW = 200, IH = 100;
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
const start = G.mul(G.translate(100, 200), G.scale(1));

test("one finger moves the overlay by the finger delta", () => {
  const H = gestureH(start, [[10, 10]], [[40, -5]], IW, IH, W);
  const c = G.apply(H, [0, 0]);
  near(c[0], 130); near(c[1], 185);
});

test("two-finger pinch keeps the point under the fingers' midpoint fixed", () => {
  const p0 = [[150, 240], [250, 260]], p1 = [[100, 230], [300, 270]];
  const H = gestureH(start, p0, p1, IW, IH, W);
  const mid0 = [200, 250], mid1 = [200, 250];
  const imgPt = G.apply(G.inv(start), mid0);
  const out = G.apply(H, imgPt);
  near(out[0], mid1[0]); near(out[1], mid1[1]);
  near(G.approxScale(H, IW, IH), 2, 1e-9);
});

test("two-finger rotation snaps to 0 when within 3 degrees", () => {
  const a = 2 * Math.PI / 180;
  const p0 = [[100, 100], [200, 100]];
  const p1 = [[150 - 50 * Math.cos(a), 100 - 50 * Math.sin(a)], [150 + 50 * Math.cos(a), 100 + 50 * Math.sin(a)]];
  const H = gestureH(start, p0, p1, IW, IH, W);
  near(G.angleOf(H, IW, IH), 0, 1e-6);
});

test("two-finger rotation beyond the snap zone is kept", () => {
  const a = 20 * Math.PI / 180;
  const p0 = [[100, 100], [200, 100]];
  const p1 = [[150 - 50 * Math.cos(a), 100 - 50 * Math.sin(a)], [150 + 50 * Math.cos(a), 100 + 50 * Math.sin(a)]];
  const H = gestureH(start, p0, p1, IW, IH, W);
  near(G.angleOf(H, IW, IH), 20, 1e-6);
});

test("pinching smaller than the minimum width is rejected", () => {
  const H = gestureH(start, [[0, 0], [100, 0]], [[0, 0], [10, 0]], IW, IH, W);
  assert.equal(H, null);
});
