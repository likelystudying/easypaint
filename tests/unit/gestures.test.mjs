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

const twist = (deg, cx = 150, cy = 100, r = 50) => {
  const a = deg * Math.PI / 180;
  return [[cx - r * Math.cos(a), cy - r * Math.sin(a)], [cx + r * Math.cos(a), cy + r * Math.sin(a)]];
};

test("a pure pinch keeps an existing tilt (no snapping to level)", () => {
  const tilted = G.rotateAboutCentre(start, IW, IH, -1.2);
  const H = gestureH(tilted, [[100, 100], [200, 100]], [[80, 100], [220, 100]], IW, IH, W, {});
  near(G.angleOf(H, IW, IH), -1.2, 1e-6);
});

test("a small accidental twist during a pinch is ignored", () => {
  const H = gestureH(G.rotateAboutCentre(start, IW, IH, 10), twist(0), twist(1.5), IW, IH, W, {});
  near(G.angleOf(H, IW, IH), 10, 1e-6);
});

test("once unlocked, rotation follows the fingers and still snaps near level", () => {
  const g = {};
  let H = gestureH(start, twist(0), twist(10), IW, IH, W, g);
  assert.equal(g.rotUnlocked, true);
  near(G.angleOf(H, IW, IH), 10, 1e-6);
  H = gestureH(start, twist(0), twist(1), IW, IH, W, g);   // back towards level in the same gesture
  near(G.angleOf(H, IW, IH), 0, 1e-6);
});

test("pairRotationDeg wraps to the short way round", () => {
  near(G.pairRotationDeg([0, 0], [1, 0], [0, 0], [Math.cos(3.1), Math.sin(3.1)]), 3.1 * 180 / Math.PI, 1e-9);
  near(G.pairRotationDeg([0, 0], [-1, 0.01], [0, 0], [-1, -0.01]), 1.1459, 1e-3);
});

test("pinching smaller than the minimum width is rejected", () => {
  const H = gestureH(start, [[0, 0], [100, 0]], [[0, 0], [10, 0]], IW, IH, W);
  assert.equal(H, null);
});
