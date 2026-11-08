// Pure 2D projective geometry. No DOM, no OpenCV.
// Matrices are row-major arrays of 9 numbers mapping [x, y, 1].
// The overlay's placement is one homography H: image pixel -> screen pixel.

export const identity = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const translate = (tx, ty) => [1, 0, tx, 0, 1, ty, 0, 0, 1];
export const scale = (sx, sy = sx) => [sx, 0, 0, 0, sy, 0, 0, 0, 1];
export function rotate(rad) {
  const c = Math.cos(rad), s = Math.sin(rad);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

export function mul(a, b) {
  const r = new Array(9);
  for (let i = 0; i < 3; i++) {
    for (let j = 0; j < 3; j++) {
      r[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
    }
  }
  return r;
}

export function inv(m) {
  const [a, b, c, d, e, f, g, h, i] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error("singular matrix");
  const D = -(b * i - c * h), E = a * i - c * g, F = -(a * h - b * g);
  const G = b * f - c * e, H = -(a * f - c * d), K = a * e - b * d;
  return [A / det, D / det, G / det, B / det, E / det, H / det, C / det, F / det, K / det];
}

export function normalize(m) {
  const s = m[8];
  return Math.abs(s) > 1e-12 ? m.map(v => v / s) : m.slice();
}

export function apply(m, p) {
  const x = p[0], y = p[1];
  const w = m[6] * x + m[7] * y + m[8];
  return [(m[0] * x + m[1] * y + m[2]) / w, (m[3] * x + m[4] * y + m[5]) / w];
}

export const rectCorners = (w, h) => [[0, 0], [w, 0], [w, h], [0, h]];
export const corners = (H, w, h) => rectCorners(w, h).map(p => apply(H, p));

function normTransform(pts) {
  let mx = 0, my = 0;
  for (const [x, y] of pts) { mx += x; my += y; }
  mx /= pts.length; my /= pts.length;
  let d = 0;
  for (const [x, y] of pts) d += Math.hypot(x - mx, y - my);
  d /= pts.length;
  const s = d > 1e-12 ? Math.SQRT2 / d : 1;
  return [s, 0, -s * mx, 0, s, -s * my, 0, 0, 1];
}

function solve(A, b) {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[piv][col])) piv = r;
    if (Math.abs(M[piv][col]) < 1e-10) throw new Error("degenerate points");
    [M[col], M[piv]] = [M[piv], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f !== 0) for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}

// Homography mapping src[i] -> dst[i]. Exact for 4 pairs, least squares for more.
// Uses Hartley normalisation for numerical stability. Throws on degenerate input.
export function homography(src, dst) {
  if (!src || !dst || src.length !== dst.length || src.length < 4) throw new Error("need at least 4 point pairs");
  const Ts = normTransform(src), Td = normTransform(dst);
  const s = src.map(p => apply(Ts, p)), d = dst.map(p => apply(Td, p));
  const AtA = Array.from({ length: 8 }, () => new Array(8).fill(0));
  const Atb = new Array(8).fill(0);
  const add = (row, rhs) => {
    for (let i = 0; i < 8; i++) {
      Atb[i] += row[i] * rhs;
      for (let j = 0; j < 8; j++) AtA[i][j] += row[i] * row[j];
    }
  };
  for (let k = 0; k < s.length; k++) {
    const [x, y] = s[k], [u, v] = d[k];
    add([x, y, 1, 0, 0, 0, -u * x, -u * y], u);
    add([0, 0, 0, x, y, 1, -v * x, -v * y], v);
  }
  const h = solve(AtA, Atb);
  const H = normalize(mul(inv(Td), mul([...h, 1], Ts)));
  if (H.some(v => !Number.isFinite(v))) throw new Error("degenerate points");
  return H;
}

// Rotation (degrees, -180..180) from segment a0-b0 to segment a1-b1.
export function pairRotationDeg(a0, b0, a1, b1) {
  let d = (Math.atan2(b1[1] - a1[1], b1[0] - a1[0]) - Math.atan2(b0[1] - a0[1], b0[0] - a0[0])) * 180 / Math.PI;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return d;
}

// Similarity (move + uniform scale + rotation) that carries pair (a0, b0) onto (a1, b1).
// With withRotation=false the rotation is left out (scale and move about the midpoint only).
export function similarityFromPairs(a0, b0, a1, b1, withRotation = true) {
  const d0 = Math.hypot(b0[0] - a0[0], b0[1] - a0[1]);
  const d1 = Math.hypot(b1[0] - a1[0], b1[1] - a1[1]);
  if (d0 < 1e-6) return translate((a1[0] + b1[0]) / 2 - (a0[0] + b0[0]) / 2, (a1[1] + b1[1]) / 2 - (a0[1] + b0[1]) / 2);
  const k = d1 / d0;
  const da = withRotation ? pairRotationDeg(a0, b0, a1, b1) * Math.PI / 180 : 0;
  const m0 = [(a0[0] + b0[0]) / 2, (a0[1] + b0[1]) / 2];
  const m1 = [(a1[0] + b1[0]) / 2, (a1[1] + b1[1]) / 2];
  return mul(translate(m1[0], m1[1]), mul(rotate(da), mul(scale(k), translate(-m0[0], -m0[1]))));
}

// Angle (degrees) of the image's horizontal axis on screen, measured at the image centre.
export function angleOf(H, w, h) {
  const c = apply(H, [w / 2, h / 2]), r = apply(H, [w / 2 + 1, h / 2]);
  return Math.atan2(r[1] - c[1], r[0] - c[0]) * 180 / Math.PI;
}

// Width of the image's horizontal centre line on screen, divided by image width.
export function approxScale(H, w, h) {
  const l = apply(H, [0, h / 2]), r = apply(H, [w, h / 2]);
  return Math.hypot(r[0] - l[0], r[1] - l[1]) / w;
}

// Rotate about the image centre so it lands exactly on a multiple of 90° when within tolDeg.
export function snapRotation(H, w, h, tolDeg = 3) {
  const t = angleOf(H, w, h);
  const n = Math.round(t / 90) * 90;
  const diff = n - t;
  if (Math.abs(diff) >= tolDeg || Math.abs(diff) < 1e-9) return H;
  const c = apply(H, [w / 2, h / 2]);
  return mul(translate(c[0], c[1]), mul(rotate(diff * Math.PI / 180), mul(translate(-c[0], -c[1]), H)));
}

export function rotateAboutCentre(H, w, h, deg) {
  const c = apply(H, [w / 2, h / 2]);
  return mul(translate(c[0], c[1]), mul(rotate(deg * Math.PI / 180), mul(translate(-c[0], -c[1]), H)));
}

// Fit the image inside the screen (fracW of width, fracH of height), centred.
export function fitH(imgW, imgH, W, H, fracW = 0.9, fracH = 0.75) {
  const k = Math.min((W * fracW) / imgW, (H * fracH) / imgH);
  return mul(translate(W / 2 - (imgW * k) / 2, H / 2 - (imgH * k) / 2), scale(k));
}

// CSS matrix3d() is column-major 4x4; a 2D homography sits in the x, y and w rows/columns.
export function cssMatrix3d(m) {
  const [a, b, c, d, e, f, g, h, i] = normalize(m);
  const v = [a, d, 0, g, b, e, 0, h, 0, 0, 1, 0, c, f, 0, i].map(x => +x.toFixed(10));
  return `matrix3d(${v.join(",")})`;
}

// True for a convex, non-degenerate quad given in order (clockwise or counter-clockwise).
export function isConvexQuad(q, minArea = 25) {
  if (!q || q.length !== 4) return false;
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i], b = q[(i + 1) % 4], c = q[(i + 2) % 4];
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
    if (Math.abs(cross) < 1e-9) return false;
    const s = Math.sign(cross);
    if (sign === 0) sign = s; else if (s !== sign) return false;
  }
  return Math.abs(quadArea(q)) >= minArea;
}

export function quadArea(q) {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], n = q[(i + 1) % q.length];
    a += p[0] * n[1] - n[0] * p[1];
  }
  return a / 2;
}

// object-fit: cover mapping from video pixels to screen pixels.
export function coverMap(vw, vh, W, H) {
  const s = Math.max(W / vw, H / vh);
  return [s, 0, (W - vw * s) / 2, 0, s, (H - vh * s) / 2, 0, 0, 1];
}

export function maxCornerDistance(qa, qb) {
  let m = 0;
  for (let i = 0; i < qa.length; i++) m = Math.max(m, Math.hypot(qa[i][0] - qb[i][0], qa[i][1] - qb[i][1]));
  return m;
}
