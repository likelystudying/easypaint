import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../../js/geometry.js";

const near = (a, b, tol = 1e-6, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg || ""} expected ${b}, got ${a}`);
const nearPt = (p, q, tol = 1e-6) => { near(p[0], q[0], tol, "x"); near(p[1], q[1], tol, "y"); };

test("mul with identity and inv round-trip", () => {
  const M = [2, 0.3, 5, -0.1, 1.5, 7, 0.001, 0.002, 1];
  assert.deepEqual(G.mul(G.identity(), M), M);
  const P = G.mul(M, G.inv(M));
  G.identity().forEach((v, i) => near(P[i], v, 1e-9));
});

test("inv throws on a singular matrix", () => {
  assert.throws(() => G.inv([1, 2, 3, 2, 4, 6, 0, 0, 0]), /singular/);
});

test("apply handles translate, scale, rotate", () => {
  nearPt(G.apply(G.translate(3, -4), [1, 1]), [4, -3]);
  nearPt(G.apply(G.scale(2, 3), [1, 1]), [2, 3]);
  nearPt(G.apply(G.rotate(Math.PI / 2), [1, 0]), [0, 1]);
});

test("homography is exact for 4 pairs including perspective", () => {
  const src = [[0, 0], [100, 0], [100, 50], [0, 50]];
  const dst = [[10, 20], [210, 35], [190, 160], [25, 140]];
  const H = G.homography(src, dst);
  src.forEach((p, i) => nearPt(G.apply(H, p), dst[i], 1e-6));
});

test("homography least squares recovers a known transform from many noisy points", () => {
  const T = [1.2, 0.1, 30, -0.05, 0.9, 12, 0.0004, -0.0002, 1];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
  const src = [], dst = [];
  for (let i = 0; i < 40; i++) {
    const p = [Math.abs(rnd()) * 600, Math.abs(rnd()) * 400];
    const q = G.apply(T, p);
    src.push(p); dst.push([q[0] + rnd() * 0.5, q[1] + rnd() * 0.5]);
  }
  const H = G.homography(src, dst);
  for (const p of [[0, 0], [600, 0], [600, 400], [0, 400], [300, 200]]) nearPt(G.apply(H, p), G.apply(T, p), 1.0);
});

test("homography rejects collinear or too few points", () => {
  assert.throws(() => G.homography([[0, 0], [1, 1], [2, 2], [3, 3]], [[0, 0], [1, 0], [1, 1], [0, 1]]));
  assert.throws(() => G.homography([[0, 0], [1, 0], [1, 1]], [[0, 0], [1, 0], [1, 1]]), /at least 4/);
});

test("similarityFromPairs carries both points exactly", () => {
  const a0 = [10, 10], b0 = [50, 10], a1 = [100, 100], b1 = [100, 180];
  const S = G.similarityFromPairs(a0, b0, a1, b1);
  nearPt(G.apply(S, a0), a1); nearPt(G.apply(S, b0), b1);
});

test("snapRotation snaps within tolerance and leaves larger angles alone", () => {
  const w = 200, h = 100;
  const near2 = G.rotateAboutCentre(G.translate(50, 50), w, h, 2);
  near(G.angleOf(G.snapRotation(near2, w, h, 3), w, h), 0, 1e-6);
  const far = G.rotateAboutCentre(G.translate(50, 50), w, h, 10);
  near(G.angleOf(G.snapRotation(far, w, h, 3), w, h), 10, 1e-6);
  const near88 = G.rotateAboutCentre(G.translate(0, 0), w, h, 88);
  near(G.angleOf(G.snapRotation(near88, w, h, 3), w, h), 90, 1e-6);
});

test("rotateAboutCentre keeps the image centre in place", () => {
  const H = G.mul(G.translate(40, 60), G.scale(0.5));
  const R = G.rotateAboutCentre(H, 300, 200, 37);
  nearPt(G.apply(R, [150, 100]), G.apply(H, [150, 100]));
  near(G.angleOf(R, 300, 200), 37, 1e-9);
});

test("fitH centres the image and fits inside the limits", () => {
  const H = G.fitH(1000, 500, 400, 800, 0.9, 0.75);
  const c = G.corners(H, 1000, 500);
  near(c[1][0] - c[0][0], 360, 1e-9, "width is 90% of screen");
  nearPt(G.apply(H, [500, 250]), [200, 400]);
});

test("cssMatrix3d encodes the same mapping in column-major order", () => {
  const H = G.homography([[0, 0], [100, 0], [100, 50], [0, 50]], [[10, 20], [210, 35], [190, 160], [25, 140]]);
  const m = G.cssMatrix3d(H).match(/matrix3d\((.*)\)/)[1].split(",").map(Number);
  assert.equal(m.length, 16);
  const p = [100, 50];
  const X = m[0] * p[0] + m[4] * p[1] + m[12], Y = m[1] * p[0] + m[5] * p[1] + m[13], W = m[3] * p[0] + m[7] * p[1] + m[15];
  nearPt([X / W, Y / W], [190, 160], 1e-4);
});

test("isConvexQuad accepts convex quads in either winding and rejects bad ones", () => {
  assert.equal(G.isConvexQuad([[0, 0], [100, 0], [100, 100], [0, 100]]), true);
  assert.equal(G.isConvexQuad([[0, 0], [0, 100], [100, 100], [100, 0]]), true);
  assert.equal(G.isConvexQuad([[0, 0], [100, 0], [30, 30], [0, 100]]), false, "concave");
  assert.equal(G.isConvexQuad([[0, 0], [100, 100], [100, 0], [0, 100]]), false, "self-intersecting");
  assert.equal(G.isConvexQuad([[0, 0], [2, 0], [2, 2], [0, 2]]), false, "too small");
});

test("coverMap matches object-fit: cover", () => {
  const M = G.coverMap(640, 480, 390, 844);
  const s = 844 / 480;
  nearPt(G.apply(M, [320, 240]), [195, 422]);
  near(M[0], s);
  nearPt(G.apply(G.coverMap(640, 480, 640, 480), [10, 20]), [10, 20]);
});
