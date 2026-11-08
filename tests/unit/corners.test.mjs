import { test } from "node:test";
import assert from "node:assert/strict";
import * as G from "../../js/geometry.js";
import { quadToH, moveCorner, clampToScreen } from "../../js/features/corners.js";

const W = 300, H = 200;
const near = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `expected ${b}, got ${a}`);
const square = [[100, 100], [400, 100], [400, 300], [100, 300]];

test("quadToH maps the image corners exactly onto the quad", () => {
  const q = [[90, 80], [420, 110], [400, 330], [70, 300]];
  const M = quadToH(q, W, H);
  G.corners(M, W, H).forEach((p, i) => { near(p[0], q[i][0]); near(p[1], q[i][1]); });
});

test("moveCorner moves only the chosen corner", () => {
  const M = moveCorner(square, 2, 30, -20, W, H);
  const c = G.corners(M, W, H);
  near(c[2][0], 430); near(c[2][1], 280);
  [0, 1, 3].forEach(i => { near(c[i][0], square[i][0]); near(c[i][1], square[i][1]); });
});

test("moveCorner gives a true perspective (non-affine) mapping", () => {
  const M = moveCorner(square, 2, 60, 40, W, H);
  assert.ok(Math.abs(M[6]) > 1e-6 || Math.abs(M[7]) > 1e-6, "projective terms should be non-zero");
});

test("moveCorner rejects a drag that folds the quad", () => {
  assert.equal(moveCorner(square, 2, -350, -250, W, H), null, "corner dragged past the opposite corner");
  assert.equal(moveCorner(square, 1, -250, 150, W, H), null, "concave");
});

test("clampToScreen keeps handles inside the screen margin", () => {
  assert.deepEqual(clampToScreen([-50, 500], 390, 844), [22, 500]);
  assert.deepEqual(clampToScreen([1000, -10], 390, 844), [368, 22]);
  assert.deepEqual(clampToScreen([100, 100], 390, 844), [100, 100]);
});
