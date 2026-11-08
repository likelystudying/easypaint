// App core: camera, overlay rendering, gestures, panels, persistence.
// Features live in js/features/*.js and plug in through the `app` object.
import * as G from "./geometry.js";
import { gestureH } from "./gestures.js";
import { COLORS, inkFromLuminance, colorize, fitDims } from "./imaging.js";
import { loadState, saveState } from "./store.js";

const DEFAULT_SRC = "assets/bison.png";
const MAX_SIDE = 2048;
const $ = s => document.querySelector(s);
const stage = $("#stage"), cam = $("#cam"), ov = $("#ov");

export const app = {
  st: null,
  customImg: null,          // data URL of a user image, null = default drawing
  srcImg: null,             // decoded source image
  imgW: 0, imgH: 0,         // processed overlay size (what H maps from)
  ink: null,                // Uint8Array ink map of the current overlay (null in photo style)
  started: false,
  stream: null,
  track: G.identity(),      // extra transform applied on top of H (marker tracking sets it)
  gesturesBlocked: false,   // features can take over touches (e.g. corner handles)
  events: new EventTarget(),
  styles: {
    lines: { ink: async (img) => inkFromLuminance(img.data, img.width, img.height) },
    photo: { photo: true },
  },
  features: [],
  $, stage, cam, ov, G,
};
app.ready = new Promise(r => { app._resolveReady = r; });

/* ---------- placement ---------- */
app.displayH = () => G.mul(app.track, app.st.H || G.identity());
app.setDisplayH = (Hd) => { app.st.H = G.normalize(G.mul(G.inv(app.track), Hd)); };
app.screenCorners = () => G.corners(app.displayH(), app.imgW, app.imgH);
app.fitToScreen = () => app.setDisplayH(G.fitH(app.imgW, app.imgH, stage.clientWidth, stage.clientHeight));

app.render = () => {
  if (!app.st.H) return;
  ov.style.transform = G.cssMatrix3d(app.displayH());
  ov.style.opacity = app.st.op / 100;
  app.events.dispatchEvent(new Event("render"));
};

/* ---------- persistence ---------- */
let saveTimer;
app.save = () => {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(app.saveNow, 300);
};
app.saveNow = () => {
  clearTimeout(saveTimer);
  app.st.imgW = app.imgW; app.st.imgH = app.imgH;
  try { saveState(localStorage, app.st, app.customImg); } catch (e) { /* storage blocked */ }
};

/* ---------- toast ---------- */
let toastTimer;
app.toast = (msg, ms = 3200) => {
  const t = $("#toast");
  t.textContent = msg; t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), ms);
};

/* ---------- image pipeline ---------- */
function loadImg(url) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}

app.sourceImageData = () => {
  const [w, h] = fitDims(app.srcImg.naturalWidth, app.srcImg.naturalHeight, MAX_SIDE);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  const g = c.getContext("2d", { willReadFrequently: true });
  g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(app.srcImg, 0, 0, w, h);
  return g.getImageData(0, 0, w, h);
};

let processToken = 0;
app.processImage = async () => {
  if (!app.srcImg) return;
  const token = ++processToken;
  const src = app.sourceImageData();
  const style = app.styles[app.st.style] || app.styles.lines;
  let out, ink = null;
  if (style.photo) {
    out = src;
  } else {
    try { ink = await style.ink(src, app.st); }
    catch (e) {
      if (token !== processToken) return;
      app.toast(e.message || "That style could not be applied.", 5000);
      ink = inkFromLuminance(src.data, src.width, src.height);
    }
    if (token !== processToken) return;
    out = new ImageData(colorize(ink, COLORS[app.st.color] || COLORS.red), src.width, src.height);
  }
  const c = document.createElement("canvas"); c.width = src.width; c.height = src.height;
  c.getContext("2d").putImageData(out, 0, 0);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  if (token !== processToken || !blob) return;
  const url = URL.createObjectURL(blob);
  // Decode off-screen first so the visible overlay swaps without a blank frame.
  const pre = new Image(); pre.src = url;
  try { await pre.decode(); } catch (e) { /* fall through; the swap still works */ }
  if (token !== processToken) { URL.revokeObjectURL(url); return; }
  ov.src = url;
  try { await ov.decode(); } catch (e) { /* already decoded above */ }
  if (app._ovURL) URL.revokeObjectURL(app._ovURL);
  app._ovURL = url;
  const sizeChanged = src.width !== app.imgW || src.height !== app.imgH;
  app.imgW = src.width; app.imgH = src.height; app.ink = ink;
  ov.width = app.imgW; ov.height = app.imgH;
  ov.style.width = app.imgW + "px"; ov.style.height = app.imgH + "px";
  if (sizeChanged || !app.st.H) app.fitToScreen();
  app.render();
  app.events.dispatchEvent(new Event("image"));
};

app.setSource = async (url, { custom, reset }) => {
  app.srcImg = await loadImg(url);
  app.customImg = custom ? url : null;
  $("#thumb").src = url;
  if (reset) app.st.H = null;
  await app.processImage();
};

/* ---------- panels ---------- */
app.openPanel = (id) => {
  document.querySelectorAll(".panel").forEach(p => { p.hidden = p.id !== id || !p.hidden; });
  document.querySelectorAll("#tabs [data-panel]").forEach(b => {
    b.setAttribute("aria-expanded", String(!document.getElementById(b.dataset.panel).hidden));
  });
  app.events.dispatchEvent(new CustomEvent("panel", { detail: { id, open: !document.getElementById(id).hidden } }));
};
$("#tabs").addEventListener("click", e => {
  const b = e.target.closest("[data-panel]");
  if (b) app.openPanel(b.dataset.panel);
});

/* ---------- gestures ---------- */
const pts = new Map();
let gStart = null;
function rebase() {
  const ids = [...pts.keys()].slice(0, 2);
  gStart = ids.length ? { H: app.displayH(), ids, p0: ids.map(i => [pts.get(i).x, pts.get(i).y]), g: {} } : null;
}
stage.addEventListener("pointerdown", e => {
  if (!app.started || app.st.locked || app.gesturesBlocked || !app.st.H) return;
  try { stage.setPointerCapture(e.pointerId); } catch (_) { /* synthetic or already released pointer */ }
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  rebase();
});
stage.addEventListener("pointermove", e => {
  if (!pts.has(e.pointerId)) return;
  pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (!gStart) return;
  const cur = gStart.ids.map(i => pts.get(i));
  if (cur.some(p => !p)) { rebase(); return; }
  const H = gestureH(gStart.H, gStart.p0, cur.map(p => [p.x, p.y]), app.imgW, app.imgH, stage.clientWidth, gStart.g);
  if (H) { app.setDisplayH(H); app.render(); }
});
function endPointer(e) {
  if (!pts.delete(e.pointerId)) return;
  rebase();
  app.save();
}
stage.addEventListener("pointerup", endPointer);
stage.addEventListener("pointercancel", endPointer);
app.cancelGesture = () => { pts.clear(); gStart = null; };
["gesturestart", "gesturechange", "gestureend"].forEach(t => document.addEventListener(t, e => e.preventDefault()));

/* ---------- controls ---------- */
app.syncUI = () => {
  const st = app.st;
  $("#op").value = st.op; $("#opv").textContent = st.op + "%";
  document.querySelectorAll("#style-seg button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.s === st.style)));
  document.querySelectorAll("#color-seg button").forEach(b => {
    b.setAttribute("aria-pressed", String(b.dataset.c === st.color));
    b.disabled = st.style === "photo";
  });
  document.body.classList.toggle("locked", st.locked);
  app.events.dispatchEvent(new Event("sync"));
};
$("#op").addEventListener("input", e => { app.st.op = +e.target.value; $("#opv").textContent = app.st.op + "%"; app.render(); app.save(); });
$("#style-seg").addEventListener("click", e => {
  const b = e.target.closest("button[data-s]"); if (!b || b.disabled) return;
  app.st.style = b.dataset.s; app.syncUI(); app.processImage(); app.save();
});
$("#color-seg").addEventListener("click", e => {
  const b = e.target.closest("button[data-c]"); if (!b || b.disabled) return;
  app.st.color = b.dataset.c; app.syncUI(); app.processImage(); app.save();
});
$("#file").addEventListener("change", async e => {
  const f = e.target.files && e.target.files[0]; if (!f) return;
  try {
    const raw = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(f); });
    const img = await loadImg(raw);
    // Downscale so the image fits in browser storage and survives a reload.
    const [w, h] = fitDims(img.naturalWidth, img.naturalHeight, 1600);
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
    let url = c.toDataURL("image/png");
    if (url.length > 1500000) url = c.toDataURL("image/jpeg", 0.9);
    await app.setSource(url, { custom: true, reset: true });
    app.saveNow();
    app.toast("Image loaded. Drag and pinch to align.");
  } catch (err) { app.toast("That file could not be opened as an image. Try a PNG or JPEG."); }
  e.target.value = "";
});
$("#fit").addEventListener("click", () => { app.fitToScreen(); app.render(); app.save(); });
$("#rot").addEventListener("click", () => {
  const Hd = app.displayH();
  const t = G.angleOf(Hd, app.imgW, app.imgH);
  const target = Math.round(t / 90) * 90 + 90;
  app.setDisplayH(G.rotateAboutCentre(Hd, app.imgW, app.imgH, target - t));
  app.render(); app.save();
});
$("#t-lock").addEventListener("click", () => {
  app.st.locked = true; app.cancelGesture(); app.syncUI(); app.saveNow();
  app.toast("Locked. Touches no longer move the image.");
});
$("#unlock").addEventListener("click", () => { app.st.locked = false; app.syncUI(); app.saveNow(); });
function bindPeek(btn) {
  const on = e => { e.preventDefault(); document.body.classList.add("peeking"); document.querySelectorAll("#ov,#miss").forEach(x => x.classList.add("peek")); };
  const off = () => { document.body.classList.remove("peeking"); document.querySelectorAll("#ov,#miss").forEach(x => x.classList.remove("peek")); };
  btn.addEventListener("pointerdown", on);
  ["pointerup", "pointercancel", "pointerleave"].forEach(t => btn.addEventListener(t, off));
  btn.addEventListener("contextmenu", e => e.preventDefault());
}
bindPeek($("#t-peek")); bindPeek($("#peek2"));

/* ---------- camera ---------- */
app.startCam = async () => {
  if (!window.isSecureContext) throw { name: "Insecure" };
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw { name: "Unsupported" };
  if (app.stream) app.stream.getTracks().forEach(t => t.stop());
  app.stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
  });
  cam.srcObject = app.stream;
  cam.play().catch(() => {});
};
export function camError(e) {
  const m = {
    Insecure: "The camera only works when this page is opened from an https:// address.",
    Unsupported: "This browser cannot access the camera. Update iOS, or try Safari.",
    NotAllowedError: "Camera access was blocked. In iOS Settings, open Chrome (or Safari) and allow Camera, then reload this page and tap Start again.",
    NotFoundError: "No camera was found on this device.",
    NotReadableError: "The camera is busy in another app. Close it and try again.",
  };
  return m[e && e.name] || ("The camera could not start (" + ((e && e.name) || "unknown error") + "). Reload and try again.");
}
async function keepAwake() {
  try { if ("wakeLock" in navigator && document.visibilityState === "visible") await navigator.wakeLock.request("screen"); } catch (e) { /* not granted */ }
}
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState !== "visible" || !app.started) return;
  const t = app.stream && app.stream.getVideoTracks()[0];
  if (!t || t.readyState === "ended") { try { await app.startCam(); } catch (e) { app.toast(camError(e), 6000); } }
  else cam.play().catch(() => {});
  keepAwake();
});
let lastLandscape = null;
$("#go").addEventListener("click", async () => {
  const err = $("#err"); err.hidden = true;
  try {
    await app.startCam();
    app.started = true;
    $("#start").hidden = true;
    keepAwake();
    lastLandscape = stage.clientWidth > stage.clientHeight;
    app.render();
    app.events.dispatchEvent(new Event("started"));
    app.toast(app.st.locked ? "Restored your last alignment. Tap Unlock to adjust." : "Drag to move. Pinch to resize and rotate. Tap Lock when it lines up.", 4500);
  } catch (e) { err.textContent = camError(e); err.hidden = false; }
});
window.addEventListener("resize", () => {
  const land = stage.clientWidth > stage.clientHeight;
  if (app.started && lastLandscape !== null && land !== lastLandscape) app.toast("Screen rotated, so the alignment shifted. Turn on rotation lock and re-align.", 5000);
  lastLandscape = land;
});

/* ---------- boot ---------- */
async function boot() {
  let saved;
  try { saved = loadState(localStorage); } catch (e) { saved = loadState({ getItem: () => null }); }
  app.st = saved.st;
  const savedH = app.st.H, savedW = app.st.imgW, savedHt = app.st.imgH;
  for (const f of app.features) { try { f.init(app); } catch (e) { console.error("feature init failed", f.name, e); } }
  app.syncUI();
  try {
    await app.setSource(saved.img || DEFAULT_SRC, { custom: !!saved.img, reset: false });
  } catch (e) {
    await app.setSource(DEFAULT_SRC, { custom: false, reset: true });
  }
  // Keep the saved placement only if it was made for an image of the same size.
  if (savedH && savedW === app.imgW && savedHt === app.imgH) { app.st.H = savedH; app.render(); }
  app._resolveReady();
}

app.register = (feature) => { app.features.push(feature); };
window.__tracer = app;

// Features register themselves before boot runs.
const featureList = (document.documentElement.dataset.features || "").split(",").filter(Boolean);
Promise.all(featureList.map(n => import(`./features/${n}.js`).then(m => app.register(m.default))))
  .catch(e => console.error("feature load failed", e))
  .finally(boot);
