// Feature: camera view helpers.
//   Glare warning - checks the camera image about once a second for blown-out white patches
//                   (reflections on the board) and shows a badge while they persist.
//   Boost         - contrast-boosted camera view (CLAHE) so faint marker strokes stand out.
import { loadCV } from "../cvloader.js";

/* ---------- pure logic (unit-tested) ---------- */
export const GLARE_ON = 0.02;   // warn when this fraction of the frame is blown out...
export const GLARE_OFF = 0.01;  // ...and clear once it drops below this
export const GLARE_CONFIRM = 2; // consecutive checks needed before warning

// Mask of near-white, unsaturated (blown-out) pixels.
export function glareMask(rgba, w, h, lumMin = 250, satMax = 0.12) {
  const m = new Uint8Array(w * h);
  for (let i = 0, j = 0; j < m.length; i += 4, j++) {
    const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    if (0.299 * r + 0.587 * g + 0.114 * b >= lumMin && (mx === 0 ? 0 : (mx - mn) / mx) <= satMax) m[j] = 1;
  }
  return m;
}

// Size of the largest 4-connected patch in a 0/1 mask.
export function largestBlob(mask, w, h) {
  const seen = new Uint8Array(mask.length), stack = new Int32Array(mask.length);
  let best = 0;
  for (let s = 0; s < mask.length; s++) {
    if (!mask[s] || seen[s]) continue;
    let top = 0, n = 0;
    stack[top++] = s; seen[s] = 1;
    while (top) {
      const p = stack[--top]; n++;
      const x = p % w, y = (p - x) / w;
      if (x > 0 && mask[p - 1] && !seen[p - 1]) { seen[p - 1] = 1; stack[top++] = p - 1; }
      if (x < w - 1 && mask[p + 1] && !seen[p + 1]) { seen[p + 1] = 1; stack[top++] = p + 1; }
      if (y > 0 && mask[p - w] && !seen[p - w]) { seen[p - w] = 1; stack[top++] = p - w; }
      if (y < h - 1 && mask[p + w] && !seen[p + w]) { seen[p + w] = 1; stack[top++] = p + w; }
    }
    if (n > best) best = n;
  }
  return best;
}

// Glare = the largest blown-out patch as a fraction of the frame. Scattered bright bits
// (white paper around markers, specular dots) do not add up to a warning.
export function glareFraction(rgba, w, h, lumMin = 250, satMax = 0.12) {
  return largestBlob(glareMask(rgba, w, h, lumMin, satMax), w, h) / (w * h);
}

// Hysteresis so the badge does not flicker: { warn, streak } -> next state.
export function nextGlareState(prev, fraction) {
  const streak = fraction >= GLARE_ON ? prev.streak + 1 : 0;
  if (prev.warn) return { warn: fraction >= GLARE_OFF, streak };
  return { warn: streak >= GLARE_CONFIRM, streak };
}

// Where to draw a frame so it matches object-fit: cover on a W x H screen.
export function coverRect(vw, vh, W, H) {
  const s = Math.max(W / vw, H / vh);
  return { left: (W - vw * s) / 2, top: (H - vh * s) / 2, width: vw * s, height: vh * s };
}

// Stretch grey levels so the 1st..99th percentile spans 0..255 (in place).
// Percentiles, not min/max, so a few glare or shadow pixels don't cancel the stretch.
export function percentileStretch(gray, lowPct = 0.01, highPct = 0.99, minSpan = 24) {
  const hist = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
  const lowN = gray.length * lowPct, highN = gray.length * highPct;
  let lo = 0, hi = 255, acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc > lowN) { lo = v; break; } }
  acc = 0;
  for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= highN) { hi = v; break; } }
  if (hi - lo < minSpan) { const mid = (hi + lo) / 2; lo = Math.max(0, mid - minSpan / 2); hi = Math.min(255, mid + minSpan / 2); }
  const lut = new Uint8Array(256);
  for (let v = 0; v < 256; v++) lut[v] = Math.max(0, Math.min(255, Math.round((v - lo) * 255 / (hi - lo))));
  for (let i = 0; i < gray.length; i++) gray[i] = lut[gray[i]];
  return { lo, hi };
}

// Contrast boost: percentile stretch, then CLAHE for local detail. Returns new RGBA pixels (grey).
export function enhanceContrast(cv, img, clipLimit = 2.5) {
  const src = cv.matFromImageData(img);
  const gray = new cv.Mat(), out = new cv.Mat();
  const clahe = new cv.CLAHE(clipLimit, new cv.Size(8, 8));
  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);
    percentileStretch(gray.data);
    clahe.apply(gray, gray);
    cv.cvtColor(gray, out, cv.COLOR_GRAY2RGBA);
    return new Uint8ClampedArray(out.data);
  } finally { src.delete(); gray.delete(); out.delete(); clahe.delete(); }
}

/* ---------- UI ---------- */
function init(app) {
  const { $ } = app;
  if (!("view" in app.st)) app.st.view = "normal";

  // Camera row in the Style panel
  const row = document.createElement("div");
  row.className = "row"; row.id = "view-row";
  row.innerHTML = `<span class="lbl">Camera</span><div class="seg" id="view-seg">` +
    `<button data-v="normal" aria-pressed="true">Normal</button><button data-v="boost" aria-pressed="false">Boost contrast</button></div>`;
  $("#p-style").appendChild(row);

  // Boosted view canvas sits between the video and the overlay
  const view = document.createElement("canvas");
  view.id = "view"; view.hidden = true;
  app.cam.after(view);
  const vctx = view.getContext("2d");

  // Glare badge, visible even while locked
  const badge = document.createElement("div");
  badge.id = "glare-badge"; badge.hidden = true; badge.setAttribute("role", "status");
  badge.textContent = "Glare on the board";
  document.body.appendChild(badge);

  const status = { glare: 0, warn: false, checks: 0, boostFrames: 0 };
  app.view = status;

  /* glare check */
  let gs = { warn: false, streak: 0 }, warnedOnce = false;
  app.addFrameTask({
    maxSide: 160, interval: 900,
    run(f) {
      status.glare = glareFraction(f.imageData.data, f.imageData.width, f.imageData.height);
      status.checks++;
      gs = nextGlareState(gs, status.glare);
      status.warn = gs.warn;
      badge.hidden = !gs.warn;
      if (gs.warn && !warnedOnce) {
        warnedOnce = true;
        app.toast("Glare detected. Tilt the phone a little or move the light so the shine leaves the board.", 5000);
      }
    },
  });

  /* contrast boost */
  let stopBoost = null;
  function placeView(vw, vh) {
    const r = coverRect(vw, vh, app.stage.clientWidth, app.stage.clientHeight);
    Object.assign(view.style, { left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px" });
  }
  async function setBoost(on) {
    if (stopBoost) { stopBoost(); stopBoost = null; }
    view.hidden = true;
    if (!on) return;
    let cv;
    try {
      if (!globalThis.cv || !globalThis.cv.Mat) app.toast("Loading the vision engine (about 11 MB, first time only)…", 6000);
      cv = await loadCV();
    } catch (e) {
      app.toast(e.message, 6000);
      app.st.view = "normal"; app.syncUI(); app.save();
      return;
    }
    if (app.st.view !== "boost") return; // switched back while loading
    stopBoost = app.addFrameTask({
      maxSide: 720, interval: 0,
      run(f) {
        const { width: w, height: h } = f.imageData;
        if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
        vctx.putImageData(new ImageData(enhanceContrast(cv, f.imageData), w, h), 0, 0);
        placeView(f.vw, f.vh);
        view.hidden = false;
        status.boostFrames++;
      },
    });
  }

  $("#view-seg").addEventListener("click", e => {
    const b = e.target.closest("button[data-v]"); if (!b) return;
    app.st.view = b.dataset.v; app.syncUI(); app.save();
    setBoost(app.st.view === "boost");
  });
  app.events.addEventListener("sync", () => {
    document.querySelectorAll("#view-seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.v === app.st.view)));
  });
  app.events.addEventListener("started", () => { if (app.st.view === "boost") setBoost(true); });
  window.addEventListener("resize", () => { if (!view.hidden) placeView(app.cam.videoWidth, app.cam.videoHeight); });
}

export default { name: "view", init };
