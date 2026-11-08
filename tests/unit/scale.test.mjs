import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../../js/geometry.js";
import { markerPlane, bestMarker, measureCm, measureWithMarkers, sizeTo, fmtCm, jointPlane, fitSquare, affineFit } from "../../js/features/scale.js";

const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b} ± ${tol}, got ${a}`);
const IW = 1142, IH = 801;
// A tilted board: cm -> screen px with real perspective.
const P = G.homography([[0, 0], [100, 0], [100, 70], [0, 70]], [[48, 52], [598, 40], [612, 440], [36, 452]]);
const markerAt = (x, y, s = 6) => [[x, y], [x + s, y], [x + s, y + s], [x, y + s]].map(p => G.apply(P, p));

test("markerPlane recovers the board-plane mapping from one marker", () => {
  // marker whose own frame is shifted by (10,20) cm on the board
  const Pm = markerPlane(markerAt(10, 20), 6);
  for (const p of [[0, 0], [30, 25], [-5, 40]]) {
    const a = G.apply(Pm, p), b = G.apply(P, [p[0] + 10, p[1] + 20]);
    near(a[0], b[0], 1e-6); near(a[1], b[1], 1e-6);
  }
});

test("measureCm reads the real width and height of a placed drawing", () => {
  const H = G.mul(P, G.mul(G.translate(20, 10), G.scale(0.05))); // 1142 px * 0.05 = 57.1 cm wide
  const m = measureCm(H, IW, IH, P);
  near(m.width, 57.1, 1e-6); near(m.height, 40.05, 1e-6);
});

test("sizeTo sets an exact width, keeping centre, rotation and aspect ratio", () => {
  const B0 = G.mul(G.translate(50, 35), G.mul(G.rotate(0.2), G.mul(G.scale(0.03), G.translate(-IW / 2, -IH / 2))));
  const H0 = G.mul(P, B0);
  const H1 = sizeTo(H0, IW, IH, P, 40);
  const m = measureCm(H1, IW, IH, P);
  near(m.width, 40, 1e-6); near(m.height, 40 * IH / IW, 1e-6);
  const c0 = G.apply(H0, [IW / 2, IH / 2]), c1 = G.apply(H1, [IW / 2, IH / 2]);
  near(c1[0], c0[0], 1e-6); near(c1[1], c0[1], 1e-6);
  const toB = H => G.mul(G.inv(P), H);
  near(G.angleOf(toB(H1), IW, IH), G.angleOf(toB(H0), IW, IH), 1e-6, "rotation on the board");
});

test("sizeTo removes a keystone warp: the result is a true rectangle on the board", () => {
  const warped = G.homography(G.rectCorners(IW, IH), [[100, 100], [400, 120], [380, 330], [90, 300]]);
  const H1 = sizeTo(warped, IW, IH, P, 30);
  const q = G.corners(G.mul(G.inv(P), H1), IW, IH);
  const d = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1]);
  near(d(q[0], q[1]), d(q[3], q[2]), 1e-6, "top = bottom");
  near(d(q[0], q[3]), d(q[1], q[2]), 1e-6, "left = right");
  near(d(q[0], q[2]), d(q[1], q[3]), 1e-6, "diagonals equal");
});

// Markers (6 cm) at board cm positions, seen through plane Q with seeded corner noise (px).
function seen(Q, pos, noise, seed = 11) {
  let sd = seed; const rnd = () => ((sd = (sd * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * noise;
  const out = {};
  for (const [id, [x, y, th = 0]] of Object.entries(pos)) {
    const c = [x + 3, y + 3], co = Math.cos(th), si = Math.sin(th);
    out[id] = [[-3, -3], [3, -3], [3, 3], [-3, 3]].map(([u, v]) => G.apply(Q, [c[0] + co * u - si * v, c[1] + si * u + co * v])).map(p => [p[0] + rnd(), p[1] + rnd()]);
  }
  return out;
}
const corners4 = { 0: [4, 4, 0.05], 1: [90, 4, -0.1], 2: [90, 60, 0.3], 3: [4, 60, 0] };

test("joint board plane: a single marker's noisy perspective no longer skews the size", () => {
  const H = G.mul(P, G.mul(G.translate(20, 14), G.scale(60 / IW))); // truly 60 cm wide
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const m = measureWithMarkers(H, IW, IH, seen(P, corners4, 0.5, seed), 6);
    near(m.width, 60, 60 * 0.015, `seed ${seed}`);
  }
});

test("joint board plane copes with a strongly tilted camera", () => {
  const tilted = G.homography([[0, 0], [100, 0], [100, 70], [0, 70]], [[120, 60], [520, 110], [600, 430], [20, 470]]);
  const H = G.mul(tilted, G.mul(G.translate(25, 15), G.scale(50 / IW)));
  const m = measureWithMarkers(H, IW, IH, seen(tilted, corners4, 0.4, 3), 6);
  near(m.width, 50, 50 * 0.02);
  near(m.height, 50 * IH / IW, 50 * IH / IW * 0.02);
});

test("joint board plane works with only two markers", () => {
  const H = G.mul(P, G.mul(G.translate(20, 14), G.scale(60 / IW)));
  const m = measureWithMarkers(H, IW, IH, seen(P, { 0: [4, 4], 2: [90, 60] }, 0.3, 5), 6);
  near(m.width, 60, 60 * 0.03);
  assert.equal(m.markers, 2);
  assert.equal(measureWithMarkers(H, IW, IH, {}, 6), null);
});

test("jointPlane with noise-free markers recovers the true plane", () => {
  const J = jointPlane(seen(P, corners4, 0), 6);
  const H = G.mul(P, G.scale(0.04));
  near(measureCm(H, IW, IH, J).width, measureCm(H, IW, IH, P).width, 1e-6);
});

test("fitSquare and affineFit are exact on exact data", () => {
  const sq = [[10, 10], [16, 10], [16, 16], [10, 16]].map(p => G.apply(G.rotateAboutCentre(G.identity(), 26, 26, 30), p));
  fitSquare(sq, 6).forEach((p, i) => { near(p[0], sq[i][0], 1e-9); near(p[1], sq[i][1], 1e-9); });
  const A = [2, 0.3, 5, -0.4, 1.5, 7, 0, 0, 1];
  const src = [[0, 0], [10, 0], [10, 10], [0, 10], [3, 7]];
  affineFit(src, src.map(p => G.apply(A, p))).forEach((v, i) => near(v, A[i], 1e-9));
});

test("bestMarker picks the largest-looking marker", () => {
  assert.equal(bestMarker({ 0: markerAt(5, 5), 3: markerAt(5, 60, 12) }), "3");
  assert.equal(bestMarker({}), null);
});

test("fmtCm shows one decimal below 100 cm", () => {
  assert.equal(fmtCm(45.678), "45.7"); assert.equal(fmtCm(123.4), "123");
});
