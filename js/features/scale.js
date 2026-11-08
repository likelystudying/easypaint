// Feature: real-size scaling.
// A printed marker has a known side length (6 cm by default), so it works as a ruler on the
// board plane. The app shows the drawing's current real width and can set it exactly.
import { homography, apply, inv, mul, translate, rotate, scale, quadArea, solveLinear, normalize as normalizeH } from "../geometry.js";

/* ---------- pure logic (unit-tested) ---------- */

// Board-plane mapping for one marker: board cm (marker's own frame) -> screen px.
export function markerPlane(corners, sideCm) {
  return homography([[0, 0], [sideCm, 0], [sideCm, sideCm], [0, sideCm]], corners);
}

// Best-fit square of side s (rotation + position only, size fixed) to 4 points, same corner order.
export function fitSquare(pts, s) {
  const T = [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]];
  const c = [0, 1].map(k => pts.reduce((a, p) => a + p[k], 0) / 4);
  let num = 0, den = 0;
  pts.forEach((p, i) => {
    const x = p[0] - c[0], y = p[1] - c[1];
    num += T[i][0] * y - T[i][1] * x; den += T[i][0] * x + T[i][1] * y;
  });
  const a = Math.atan2(num, den), co = Math.cos(a), si = Math.sin(a);
  return T.map(([x, y]) => [c[0] + co * x - si * y, c[1] + si * x + co * y]);
}

// One board-plane mapping (cm -> screen) estimated from ALL visible markers together.
// A single small marker's perspective is swamped by corner noise (a 0.3 px error can skew a
// reading 500 px away by 20%). So we solve one least-squares problem (Levenberg-Marquardt):
// unknowns are the plane homography plus each marker's position and angle on the board,
// with every marker constrained to be an exact square of the known size.
const UNIT = [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]; // TL, TR, BR, BL, in marker sides

export function jointPlane(screen, sideCm, iters = 40) {
  const ids = Object.keys(screen || {});
  if (!ids.length) return null;
  const ref = bestMarker(screen);
  let P0;
  try { P0 = markerPlane(screen[ref], sideCm); } catch (e) { return null; }
  if (ids.length === 1) return P0;
  // Start from a perspective-free fit of the reference marker: a small marker's own
  // perspective is mostly noise and can send the solver to a wrong minimum.
  P0 = affineFit([[0, 0], [sideCm, 0], [sideCm, sideCm], [0, sideCm]], screen[ref]);

  // Normalise: board in marker-side units, screen centred and scaled to ~1.
  const all = ids.flatMap(id => screen[id]);
  const cx = all.reduce((a, p) => a + p[0], 0) / all.length, cy = all.reduce((a, p) => a + p[1], 0) / all.length;
  const sc = all.length / all.reduce((a, p) => a + Math.hypot(p[0] - cx, p[1] - cy), 0);
  const N = [sc, 0, -sc * cx, 0, sc, -sc * cy, 0, 0, 1];
  const B = scale(1 / sideCm);
  const obs = ids.map(id => screen[id].map(p => apply(N, p)));
  const others = ids.filter(id => id !== ref);

  // Initial guess: plane from the largest marker; other markers placed through it.
  const Pn0 = normalizeH(mul(N, mul(P0, inv(B))));
  const params = Pn0.slice(0, 8);
  let P0inv; try { P0inv = inv(P0); } catch (e) { return null; }
  for (const id of others) {
    const sq = fitSquare(screen[id].map(p => apply(P0inv, p)).map(p => [p[0] / sideCm, p[1] / sideCm]), 1);
    const c = [(sq[0][0] + sq[2][0]) / 2, (sq[0][1] + sq[2][1]) / 2];
    params.push(Math.atan2(sq[1][1] - sq[0][1], sq[1][0] - sq[0][0]), c[0], c[1]);
  }

  const residuals = (p) => {
    const H = [...p.slice(0, 8), 1], r = [];
    ids.forEach((id, i) => {
      let th = 0, ox = 0.5, oy = 0.5; // reference marker: its own square [0,1]^2
      if (id !== ref) { const j = 8 + 3 * others.indexOf(id); th = p[j]; ox = p[j + 1]; oy = p[j + 2]; }
      const co = Math.cos(th), si = Math.sin(th);
      UNIT.forEach(([u, v], k) => {
        const q = apply(H, [ox + co * u - si * v, oy + si * u + co * v]);
        r.push(q[0] - obs[i][k][0], q[1] - obs[i][k][1]);
      });
    });
    return r;
  };
  const cost = r => r.reduce((a, v) => a + v * v, 0);

  let p = params, r = residuals(p), c = cost(r), lambda = 1e-3;
  for (let it = 0; it < iters; it++) {
    const m = p.length, n = r.length;
    const J = Array.from({ length: n }, () => new Array(m));
    for (let j = 0; j < m; j++) {
      const h = 1e-7 * Math.max(1, Math.abs(p[j]));
      const q = p.slice(); q[j] += h;
      const rq = residuals(q);
      for (let i = 0; i < n; i++) J[i][j] = (rq[i] - r[i]) / h;
    }
    const JtJ = Array.from({ length: m }, () => new Array(m).fill(0)), Jtr = new Array(m).fill(0);
    for (let i = 0; i < n; i++) for (let a = 0; a < m; a++) {
      Jtr[a] += J[i][a] * r[i];
      for (let b = a; b < m; b++) JtJ[a][b] += J[i][a] * J[i][b];
    }
    for (let a = 0; a < m; a++) for (let b = 0; b < a; b++) JtJ[a][b] = JtJ[b][a];
    let improved = false;
    for (let tries = 0; tries < 8 && !improved; tries++) {
      const A = JtJ.map((row, a) => row.map((v, b) => (a === b ? v * (1 + lambda) + 1e-12 : v)));
      let d; try { d = solveLinear(A, Jtr.map(v => -v)); } catch (e) { lambda *= 10; continue; }
      const q = p.map((v, j) => v + d[j]);
      const rq = residuals(q), cq = cost(rq);
      if (cq < c) { p = q; r = rq; improved = (c - cq) > 1e-15 * (1 + c); c = cq; lambda = Math.max(1e-9, lambda / 3); if (!improved) it = iters; }
      else lambda *= 10;
    }
    if (!improved) break;
  }
  const Pn = [...p.slice(0, 8), 1];
  try { return normalizeH(mul(inv(N), mul(Pn, B))); } catch (e) { return null; }
}

// Least-squares affine map src -> dst (as a 3x3 with no perspective terms).
export function affineFit(src, dst) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], bx = [0, 0, 0], by = [0, 0, 0];
  src.forEach(([x, y], i) => {
    const row = [x, y, 1];
    for (let a = 0; a < 3; a++) {
      bx[a] += row[a] * dst[i][0]; by[a] += row[a] * dst[i][1];
      for (let b = 0; b < 3; b++) A[a][b] += row[a] * row[b];
    }
  });
  const ux = solveLinear(A.map(r => r.slice()), bx), uy = solveLinear(A.map(r => r.slice()), by);
  return [ux[0], ux[1], ux[2], uy[0], uy[1], uy[2], 0, 0, 1];
}

// Id of the marker that looks largest on screen (most accurate ruler), or null.
export function bestMarker(screen) {
  let best = null, area = 0;
  for (const id of Object.keys(screen || {})) {
    const a = Math.abs(quadArea(screen[id]));
    if (a > area) { area = a; best = id; }
  }
  return best;
}

// Real size (cm) of the drawing placed by H, measured in the plane P (cm -> screen).
export function measureCm(H, imgW, imgH, P) {
  const toBoard = mul(inv(P), H);
  const d = (a, b) => { const p = apply(toBoard, a), q = apply(toBoard, b); return Math.hypot(q[0] - p[0], q[1] - p[1]); };
  return { width: d([0, imgH / 2], [imgW, imgH / 2]), height: d([imgW / 2, 0], [imgW / 2, imgH]) };
}

// Real size using the joint board plane from all visible markers.
export function measureWithMarkers(H, imgW, imgH, screen, sideCm) {
  const P = jointPlane(screen, sideCm);
  if (!P) return null;
  try { return { ...measureCm(H, imgW, imgH, P), markers: Object.keys(screen).length }; }
  catch (e) { return null; }
}

// New H that makes the drawing exactly widthCm wide on the board plane P, keeping its centre,
// its in-plane rotation and its aspect ratio. Perspective comes out right because it is built in P.
export function sizeTo(H, imgW, imgH, P, widthCm) {
  const toBoard = mul(inv(P), H);
  const c = apply(toBoard, [imgW / 2, imgH / 2]);
  const l = apply(toBoard, [0, imgH / 2]), r = apply(toBoard, [imgW, imgH / 2]);
  const theta = Math.atan2(r[1] - l[1], r[0] - l[0]);
  const B = mul(translate(c[0], c[1]), mul(rotate(theta), mul(scale(widthCm / imgW), translate(-imgW / 2, -imgH / 2))));
  return mul(P, B);
}

export const fmtCm = v => (v >= 100 ? v.toFixed(0) : v.toFixed(1));

/* ---------- UI ---------- */
function init(app) {
  const { $ } = app;
  if (!app.markers) { console.warn("scale feature needs the markers feature"); return; }
  if (!(app.st.markerCm > 0)) app.st.markerCm = 6;

  // Marker size, in the Track panel
  const mrow = document.createElement("div");
  mrow.className = "row";
  mrow.innerHTML = `<span class="lbl">Marker</span><input id="marker-cm" type="number" min="1" max="100" step="0.1" inputmode="decimal" aria-label="Marker size in cm"><span class="note">cm, black square side</span>`;
  $("#p-track .btns").before(mrow);

  // Real size, in the Align panel
  const srow = document.createElement("div");
  srow.className = "row"; srow.id = "size-row";
  srow.innerHTML = `<span class="lbl">Width</span><input id="size-cm" type="number" min="1" max="2000" step="0.5" inputmode="decimal" aria-label="Drawing width in cm"><span class="unit">cm</span><button id="size-set" disabled>Set size</button>`;
  const nrow = document.createElement("div");
  nrow.className = "row";
  nrow.innerHTML = `<span class="note" id="size-now">Show at least one marker to measure.</span>`;
  $("#align-btns").after(srow, nrow);

  const S = app.scale = { measured: null };
  const panel = $("#p-align");

  function refresh() {
    if (panel.hidden) return;
    const screen = app.markers.screen;
    const m = app.markers.seen ? measureWithMarkers(app.displayH(), app.imgW, app.imgH, screen, app.st.markerCm) : null;
    S.measured = m;
    $("#size-set").disabled = !m;
    $("#size-now").textContent = m
      ? `Now ${fmtCm(m.width)} × ${fmtCm(m.height)} cm (from ${m.markers} marker${m.markers > 1 ? "s" : ""})`
      : "Show at least one marker to measure.";
    if (m && !$("#size-cm").value) $("#size-cm").value = fmtCm(m.width);
  }

  function setSize() {
    const w = parseFloat($("#size-cm").value);
    if (!(w > 0)) { app.toast("Enter the width you want in centimetres."); return; }
    const P = jointPlane(app.markers.screen, app.st.markerCm);
    if (!P) { app.toast("Show at least one marker so the app can measure."); return; }
    app.setDisplayH(sizeTo(app.displayH(), app.imgW, app.imgH, P, w));
    app.st.widthCm = w;
    app.render();
    // A real size only means something relative to the board, so keep it there.
    const anchored = app.markers.anchored || (app.markers.seen >= 2 && (app.markers.anchor(), true));
    app.save(); refresh();
    app.toast(anchored ? `Set to ${fmtCm(w)} cm wide and anchored to the markers.` : `Set to ${fmtCm(w)} cm wide. Show two markers to anchor it.`);
  }

  $("#size-set").addEventListener("click", setSize);
  $("#marker-cm").addEventListener("change", e => {
    const v = parseFloat(e.target.value);
    if (v > 0) { app.st.markerCm = v; app.save(); refresh(); } else e.target.value = app.st.markerCm;
  });
  app.events.addEventListener("panel", () => { app.markers.want("scale", !panel.hidden); refresh(); });
  app.events.addEventListener("markers", refresh);
  app.events.addEventListener("sync", () => {
    $("#marker-cm").value = app.st.markerCm;
    if (app.st.widthCm > 0) $("#size-cm").value = app.st.widthCm;
  });
}

export default { name: "scale", init };
