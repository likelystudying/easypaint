// Feature: turn any photo into traceable line art.
//   Edges  - Canny edge detection: clean outlines of shapes.
//   Sketch - adaptive threshold: dark strokes and shading, robust to uneven lighting.
// A Detail slider (1-10) trades fewer, stronger lines against more, finer ones.
import { loadCV } from "../cvloader.js";

/* ---------- pure parameter maps (unit-tested) ---------- */
export function clampDetail(d) {
  const n = Math.round(Number(d));
  return Number.isFinite(n) ? Math.min(10, Math.max(1, n)) : 5;
}

export function edgeParams(detail) {
  const d = clampDetail(detail);
  const hi = Math.round(220 - d * 16);          // 204 (detail 1) .. 60 (detail 10)
  return { blur: d >= 7 ? 3 : d >= 4 ? 5 : 7, hi, lo: Math.round(hi * 0.4), thicken: 1 };
}

export function sketchParams(detail, imgW, imgH) {
  const d = clampDetail(detail);
  const side = Math.max(imgW, imgH);
  let block = Math.round(side * (0.05 - d * 0.0035)); // smaller blocks = finer detail
  block = Math.max(7, block | 1);                     // odd, at least 7
  return { block, C: 4 + (10 - d) * 1.5, minArea: Math.round(side * side * 0.00002 * (11 - d)) };
}

/* ---------- OpenCV algorithms (unit-tested in Node with the same opencv.js) ---------- */
function toGray(cv, img) {
  const rgba = cv.matFromImageData(img);
  const gray = new cv.Mat();
  cv.cvtColor(rgba, gray, cv.COLOR_RGBA2GRAY);
  rgba.delete();
  return gray;
}

// Remove connected blobs smaller than minArea pixels from a 0/255 mask (in place).
export function removeSpecks(cv, bin, minArea) {
  if (minArea <= 1) return;
  const labels = new cv.Mat(), stats = new cv.Mat(), cents = new cv.Mat();
  try {
    const n = cv.connectedComponentsWithStats(bin, labels, stats, cents, 8, cv.CV_32S);
    const small = new Uint8Array(n);
    for (let i = 1; i < n; i++) small[i] = stats.intAt(i, cv.CC_STAT_AREA) < minArea ? 1 : 0;
    const L = labels.data32S, B = bin.data;
    for (let i = 0; i < B.length; i++) if (B[i] && small[L[i]]) B[i] = 0;
  } finally { labels.delete(); stats.delete(); cents.delete(); }
}

export function edgesInk(cv, img, detail) {
  const p = edgeParams(detail);
  const gray = toGray(cv, img), edges = new cv.Mat();
  try {
    cv.GaussianBlur(gray, gray, new cv.Size(p.blur, p.blur), 0);
    cv.Canny(gray, edges, p.lo, p.hi, 3, true);
    if (p.thicken) {
      const k = cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(3, 3));
      cv.dilate(edges, edges, k);
      k.delete();
    }
    return new Uint8Array(edges.data);
  } finally { gray.delete(); edges.delete(); }
}

export function sketchInk(cv, img, detail) {
  const p = sketchParams(detail, img.width, img.height);
  const gray = toGray(cv, img), bin = new cv.Mat();
  try {
    cv.medianBlur(gray, gray, 3);
    cv.adaptiveThreshold(gray, bin, 255, cv.ADAPTIVE_THRESH_MEAN_C, cv.THRESH_BINARY_INV, p.block, p.C);
    removeSpecks(cv, bin, p.minArea);
    return new Uint8Array(bin.data);
  } finally { gray.delete(); bin.delete(); }
}

/* ---------- UI ---------- */
function init(app) {
  const { $ } = app;
  const seg = $("#style-seg");
  const photoBtn = seg.querySelector('[data-s="photo"]');
  for (const [s, label] of [["edges", "Edges"], ["sketch", "Sketch"]]) {
    const b = document.createElement("button");
    b.dataset.s = s; b.textContent = label; b.setAttribute("aria-pressed", "false");
    seg.insertBefore(b, photoBtn);
  }
  const row = document.createElement("div");
  row.className = "row"; row.id = "detail-row"; row.hidden = true;
  row.innerHTML = `<span class="lbl">Detail</span><input id="detail" type="range" min="1" max="10" step="1" value="5" aria-label="Line detail"><span id="detailv" class="val">5</span>`;
  $("#color-row").after(row);

  async function vision() {
    if (!globalThis.cv || !globalThis.cv.Mat) app.toast("Loading the vision engine (about 11 MB, first time only)…", 6000);
    return loadCV();
  }
  app.styles.edges = { ink: async (img, st) => edgesInk(await vision(), img, st.detail) };
  app.styles.sketch = { ink: async (img, st) => sketchInk(await vision(), img, st.detail) };

  const detail = $("#detail");
  detail.addEventListener("input", () => { $("#detailv").textContent = detail.value; });
  detail.addEventListener("change", () => {
    app.st.detail = clampDetail(detail.value);
    app.processImage(); app.save();
  });
  app.events.addEventListener("sync", () => {
    row.hidden = !(app.st.style === "edges" || app.st.style === "sketch");
    detail.value = clampDetail(app.st.detail);
    $("#detailv").textContent = detail.value;
  });
}

export default { name: "lineart", init };
