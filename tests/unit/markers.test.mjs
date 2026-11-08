import { test, before } from "node:test";
import assert from "node:assert/strict";
import { loadCVNode } from "../helpers/cv-node.mjs";
import * as G from "../../js/geometry.js";
import { MARKER_BITS } from "../../js/marker-bits.js";
import {
  createDetector, detectMarkers, framesToScreen, smoothMarkers, trackingTransform, saneTransform, SNAP_PX,
} from "../../js/features/markers.js";

let cv, det;
before(async () => { cv = await loadCVNode(); det = createDetector(cv); });

const near = (a, b, tol, msg = "") => assert.ok(Math.abs(a - b) <= tol, `${msg} expected ${b} ± ${tol}, got ${a}`);

// Grey board with markers whose black squares start at `pos[id]` and are `side` px wide.
function board(w, h, pos, side) {
  const m = new cv.Mat(h, w, cv.CV_8UC1, new cv.Scalar(236));
  const cell = side / 6;
  for (const [id, [x0, y0]] of Object.entries(pos)) {
    cv.rectangle(m, new cv.Point(x0 - cell, y0 - cell), new cv.Point(x0 + side + cell - 1, y0 + side + cell - 1), new cv.Scalar(255), -1);
    MARKER_BITS[id].forEach((row, y) => [...row].forEach((b, x) => {
      if (b === "0") cv.rectangle(m, new cv.Point(x0 + x * cell, y0 + y * cell), new cv.Point(x0 + (x + 1) * cell - 1, y0 + (y + 1) * cell - 1), new cv.Scalar(20), -1);
    }));
  }
  return m;
}
function toImageData(gray) {
  const rgba = new cv.Mat(); cv.cvtColor(gray, rgba, cv.COLOR_GRAY2RGBA);
  const out = { width: rgba.cols, height: rgba.rows, data: new Uint8ClampedArray(rgba.data) };
  rgba.delete(); return out;
}

test("the printed marker patterns decode as ids 0-3 with exact corners", () => {
  const pos = { 0: [20, 20], 1: [140, 20], 2: [140, 140], 3: [20, 140] };
  const b = board(260, 260, pos, 72);
  const found = detectMarkers(cv, det, toImageData(b));
  b.delete();
  assert.deepEqual(found.map(m => m.id).sort(), [0, 1, 2, 3]);
  for (const m of found) {
    const [x0, y0] = pos[m.id];
    const truth = [[x0, y0], [x0 + 72, y0], [x0 + 72, y0 + 72], [x0, y0 + 72]];
    m.corners.forEach((c, i) => { near(c[0], truth[i][0], 1.0, `id ${m.id} corner ${i} x`); near(c[1], truth[i][1], 1.0, "y"); });
  }
});

test("markers are found with sub-pixel-ish accuracy on a tilted, scaled board", () => {
  const pos = { 0: [40, 40], 1: [900, 40], 2: [900, 600], 3: [40, 600] };
  const b = board(1000, 700, pos, 60);
  const P = G.homography([[0, 0], [1000, 0], [1000, 700], [0, 700]], [[48, 52], [598, 40], [612, 440], [36, 452]]);
  const frame = new cv.Mat();
  const M = cv.matFromArray(3, 3, cv.CV_64F, P);
  cv.warpPerspective(b, frame, M, new cv.Size(640, 480), cv.INTER_AREA, cv.BORDER_CONSTANT, new cv.Scalar(90));
  const found = detectMarkers(cv, det, toImageData(frame));
  b.delete(); frame.delete(); M.delete();
  assert.equal(found.length, 4);
  let worst = 0;
  for (const m of found) {
    const [x0, y0] = pos[m.id];
    [[x0, y0], [x0 + 60, y0], [x0 + 60, y0 + 60], [x0, y0 + 60]].forEach((p, i) => {
      const t = G.apply(P, p);
      worst = Math.max(worst, Math.hypot(m.corners[i][0] - t[0], m.corners[i][1] - t[1]));
    });
  }
  assert.ok(worst < 1.0, `worst corner error ${worst.toFixed(2)} px`);
});

test("framesToScreen undoes frame downscaling and applies the cover fit", () => {
  const out = framesToScreen([{ id: 1, corners: [[10, 20], [30, 20], [30, 40], [10, 40]] }], 0.5, 640, 480, 390, 844);
  const M = G.coverMap(640, 480, 390, 844);
  const e = G.apply(M, [20, 40]);
  near(out[1][0][0], e[0], 1e-9); near(out[1][0][1], e[1], 1e-9);
});

test("smoothMarkers: ignores wobble, eases medium moves, snaps big jumps", () => {
  const sq = (x, y) => [[x, y], [x + 10, y], [x + 10, y + 10], [x, y + 10]];
  const prev = { 0: sq(100, 100) };
  assert.deepEqual(smoothMarkers(prev, { 0: sq(100.3, 100) })[0], sq(100, 100));
  near(smoothMarkers(prev, { 0: sq(110, 100) })[0][0][0], 105, 1e-9);
  assert.deepEqual(smoothMarkers(prev, { 0: sq(100 + SNAP_PX + 5, 100) })[0], sq(100 + SNAP_PX + 5, 100));
  assert.deepEqual(smoothMarkers(prev, { 1: sq(5, 5) })[1], sq(5, 5), "new marker taken as-is");
});

test("trackingTransform recovers a known move from two shared markers", () => {
  const T = G.normalize(G.mul(G.translate(22, -14), G.rotateAboutCentre(G.identity(), 640, 480, 3)));
  const ref = { 0: [[50, 50], [80, 50], [80, 80], [50, 80]], 2: [[500, 380], [530, 380], [530, 410], [500, 410]], 3: [[50, 380], [80, 380], [80, 410], [50, 410]] };
  const cur = {};
  for (const id of [0, 2]) cur[id] = ref[id].map(p => G.apply(T, p)); // marker 3 not visible now
  cur[1] = [[1, 1], [2, 1], [2, 2], [1, 2]];                         // not in ref: ignored
  const R = trackingTransform(ref, cur);
  for (const p of [[0, 0], [640, 0], [320, 240], [640, 480]]) {
    const a = G.apply(R, p), b = G.apply(T, p);
    near(a[0], b[0], 1e-6); near(a[1], b[1], 1e-6);
  }
});

test("trackingTransform needs two shared markers", () => {
  const ref = { 0: [[50, 50], [80, 50], [80, 80], [50, 80]], 1: [[500, 50], [530, 50], [530, 80], [500, 80]] };
  assert.equal(trackingTransform(ref, { 0: ref[0] }), null);
});

test("saneTransform rejects mirrors, extreme scale and points behind the camera", () => {
  assert.equal(saneTransform(G.identity(), [[0, 0]]), true);
  assert.equal(saneTransform(G.scale(-1, 1)), false);
  assert.equal(saneTransform(G.scale(3)), false);
  assert.equal(saneTransform([1, 0, 0, 0, 1, 0, 0.01, 0, 1], [[-200, 0]]), false);
});
