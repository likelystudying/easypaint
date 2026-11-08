// Feature: marker-anchored overlay.
// Tape printed ArUco markers (DICT_4X4_50, ids 0-3) near the drawing area. After "Anchor",
// the app tracks the markers every frame and moves the overlay with them, so a bumped
// tripod or a handheld phone keeps the drawing in place on the board.
import { loadCV } from "../cvloader.js";
import { homography, apply, coverMap } from "../geometry.js";

/* ---------- pure logic (unit-tested) ---------- */
export const MIN_MARKERS = 2;     // markers needed to (re)compute the tracking transform
export const SNAP_PX = 25;        // a jump this large is a real move: follow it at once
export const DEADBAND_PX = 0.6;   // smaller wobble is ignored
export const SMOOTH = 0.5;        // share of the new position taken each frame otherwise

// Detected markers -> { id: [[x,y] x4] } in screen px. Frame px / k = video px, then cover-fit.
export function framesToScreen(markers, k, vw, vh, W, H) {
  const M = coverMap(vw, vh, W, H);
  const out = {};
  for (const m of markers) out[m.id] = m.corners.map(p => apply(M, [p[0] / k, p[1] / k]));
  return out;
}

// Per-corner smoothing with a dead band and an immediate snap for big moves.
export function smoothMarkers(prev, cur) {
  const out = {};
  for (const id of Object.keys(cur)) {
    const p = prev && prev[id];
    if (!p) { out[id] = cur[id].map(c => c.slice()); continue; }
    const far = cur[id].some((c, i) => Math.hypot(c[0] - p[i][0], c[1] - p[i][1]) > SNAP_PX);
    out[id] = cur[id].map((c, i) => {
      if (far) return c.slice();
      const d = Math.hypot(c[0] - p[i][0], c[1] - p[i][1]);
      if (d < DEADBAND_PX) return p[i].slice();
      return [p[i][0] + (c[0] - p[i][0]) * SMOOTH, p[i][1] + (c[1] - p[i][1]) * SMOOTH];
    });
  }
  return out;
}

// Transform taking anchored screen positions to current ones, from markers seen in both.
// Returns null when fewer than MIN_MARKERS are shared or the result is implausible.
export function trackingTransform(ref, cur) {
  const ids = Object.keys(cur).filter(id => ref[id]);
  if (ids.length < MIN_MARKERS) return null;
  const src = [], dst = [];
  for (const id of ids) for (let i = 0; i < 4; i++) { src.push(ref[id][i]); dst.push(cur[id][i]); }
  let T;
  try { T = homography(src, dst); } catch (e) { return null; }
  return saneTransform(T, src) ? T : null;
}

// Reject mirror images, collapses and wild scale changes (a misdetection, not a phone move).
export function saneTransform(T, pts) {
  if (!T || T.some(v => !Number.isFinite(v))) return false;
  const det = T[0] * T[4] - T[1] * T[3];
  if (det <= 0) return false;
  const s = Math.sqrt(det);
  if (s < 0.4 || s > 2.5) return false;
  for (const p of pts || []) { const w = T[6] * p[0] + T[7] * p[1] + T[8]; if (w <= 0) return false; }
  return true;
}

/* ---------- OpenCV detection (unit-tested in Node) ---------- */
export function createDetector(cv) {
  const dict = cv.getPredefinedDictionary(cv.DICT_4X4_50);
  const params = new cv.aruco_DetectorParameters();
  params.cornerRefinementMethod = cv.CORNER_REFINE_SUBPIX;
  const refine = new cv.aruco_RefineParameters(10, 3, true);
  return new cv.aruco_ArucoDetector(dict, params, refine);
}

// imageData -> [{ id, corners: [[x,y] TL, TR, BR, BL] }] in image px. Only ids 0-3 are kept.
export function detectMarkers(cv, detector, imageData) {
  const src = cv.matFromImageData(imageData), gray = new cv.Mat();
  const corners = new cv.MatVector(), ids = new cv.Mat(), rejected = new cv.MatVector();
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    detector.detectMarkers(gray, corners, ids, rejected);
    const out = [];
    for (let i = 0; i < corners.size(); i++) {
      const id = ids.data32S[i];
      if (id < 0 || id > 3 || out.some(m => m.id === id)) continue;
      const c = corners.get(i), d = c.data32F;
      out.push({ id, corners: [[d[0], d[1]], [d[2], d[3]], [d[4], d[5]], [d[6], d[7]]] });
      c.delete();
    }
    return out;
  } finally { src.delete(); gray.delete(); corners.delete(); ids.delete(); rejected.delete(); }
}

/* ---------- UI ---------- */
function init(app) {
  const { $ } = app;

  const tab = document.createElement("button");
  tab.id = "t-track"; tab.dataset.panel = "p-track"; tab.textContent = "Track"; tab.setAttribute("aria-expanded", "false");
  $("#t-peek").before(tab);

  const panel = document.createElement("section");
  panel.className = "panel"; panel.id = "p-track"; panel.hidden = true; panel.setAttribute("aria-label", "Track");
  panel.innerHTML =
    `<div class="row"><span class="pill" id="mk-status">Markers: looking…</span><span class="note" id="mk-note">Tape 2–4 printed markers near the drawing so they stay in view.</span></div>` +
    `<div class="btns"><button id="anchor" disabled>Anchor to markers</button><a class="btn" id="mk-print" href="markers.html" target="_blank" rel="noopener">Print markers</a></div>`;
  $("#tabs").before(panel);

  const st = app.markers = { seen: 0, ids: [], screen: {}, ref: null, anchored: false, lost: false, frames: 0, lastT: null };
  let cv = null, detector = null, stop = null, smoothed = {};
  const wants = new Set(); // other features that need detection running (e.g. real-size readout)
  st.want = (reason, on) => { if (on) wants.add(reason); else wants.delete(reason); ensureRunning(); };
  const needed = () => app.started && (st.anchored || !panel.hidden || wants.size > 0);

  function anchorFromState() {
    const a = app.st.anchor;
    st.anchored = !!(a && a.ref);
    st.ref = st.anchored ? a.ref : null;
  }

  function updateUI() {
    const pill = $("#mk-status"), btn = $("#anchor");
    pill.classList.remove("ok", "warn");
    if (st.anchored) {
      pill.textContent = st.lost ? "Markers lost: holding position" : `Anchored · tracking ${st.seen}`;
      pill.classList.add(st.lost ? "warn" : "ok");
      btn.textContent = "Release"; btn.disabled = false;
    } else {
      pill.textContent = `Markers: ${st.seen} of 4 seen`;
      if (st.seen >= MIN_MARKERS) pill.classList.add("ok"); else if (st.seen) pill.classList.add("warn");
      btn.textContent = "Anchor to markers"; btn.disabled = st.seen < MIN_MARKERS;
    }
  }

  function onFrame(f) {
    const found = detectMarkers(cv, detector, f.imageData);
    const cur = framesToScreen(found, f.k, f.vw, f.vh, app.stage.clientWidth, app.stage.clientHeight);
    // keep smoothing only for markers still visible
    const prev = {}; for (const id of Object.keys(cur)) if (smoothed[id]) prev[id] = smoothed[id];
    smoothed = smoothMarkers(prev, cur);
    st.screen = smoothed; st.ids = Object.keys(smoothed).map(Number); st.seen = st.ids.length; st.frames++;
    if (st.anchored) {
      const T = trackingTransform(st.ref, smoothed);
      st.lost = !T;
      if (T) { app.track = T; st.lastT = T; app.render(); }
    }
    updateUI();
    app.events.dispatchEvent(new Event("markers"));
  }

  async function ensureRunning() {
    if (!needed()) { if (stop) { stop(); stop = null; } return; }
    if (stop) return;
    try {
      if (!globalThis.cv || !globalThis.cv.Mat) app.toast("Loading the vision engine (about 11 MB, first time only)…", 6000);
      cv = await loadCV();
      detector = detector || createDetector(cv);
    } catch (e) { app.toast(e.message, 6000); return; }
    if (stop || !needed()) return;
    stop = app.addFrameTask({ maxSide: 960, interval: 0, run: onFrame });
  }

  function anchor() {
    if (st.seen < MIN_MARKERS) return;
    const ref = {};
    for (const id of Object.keys(smoothed)) ref[id] = smoothed[id].map(p => p.slice());
    app.st.H = app.displayH();     // bake any current tracking into H, then start fresh
    app.track = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    app.st.anchor = { ref };
    anchorFromState(); st.lost = false;
    app.saveNow(); updateUI(); ensureRunning();
    app.toast(`Anchored to ${Object.keys(ref).length} markers. The drawing now follows them.`);
  }
  function release() {
    app.st.H = app.displayH();
    app.track = [1, 0, 0, 0, 1, 0, 0, 0, 1];
    app.st.anchor = null;
    anchorFromState(); st.lost = false;
    app.render(); app.saveNow(); updateUI(); ensureRunning();
  }
  app.markers.anchor = anchor; app.markers.release = release;

  $("#anchor").addEventListener("click", () => (st.anchored ? release() : anchor()));
  app.events.addEventListener("panel", ensureRunning);
  app.events.addEventListener("started", () => { anchorFromState(); updateUI(); ensureRunning(); });
  app.events.addEventListener("image", () => {
    // A new image resets placement; an old anchor no longer applies.
    if (st.anchored && (app.st.imgW !== app.imgW || app.st.imgH !== app.imgH)) release();
  });
  anchorFromState(); updateUI();
}

export default { name: "markers", init };
