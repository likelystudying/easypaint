// Feature: 4-corner perspective warp.
// Drag a handle at each corner of the drawing to where it should sit on the board.
// This corrects keystone distortion when the phone is not square to the board.
import { homography, isConvexQuad, rectCorners } from "../geometry.js";

/* ---------- pure logic (unit-tested) ---------- */

// Homography that maps the image rectangle onto quad q, or null if q is not a valid convex quad.
export function quadToH(q, w, h) {
  if (!isConvexQuad(q)) return null;
  try { return homography(rectCorners(w, h), q); } catch (e) { return null; }
}

// Move corner i of the start quad by (dx, dy). Returns the new H or null if the result is invalid.
export function moveCorner(startQuad, i, dx, dy, w, h) {
  const q = startQuad.map(p => [p[0], p[1]]);
  q[i] = [q[i][0] + dx, q[i][1] + dy];
  return quadToH(q, w, h);
}

// Keep handles reachable even when a corner is off screen.
export function clampToScreen(p, W, H, m = 22) {
  return [Math.min(W - m, Math.max(m, p[0])), Math.min(H - m, Math.max(m, p[1]))];
}

/* ---------- UI ---------- */
const NAMES = ["Top-left", "Top-right", "Bottom-right", "Bottom-left"];

function init(app) {
  const { $ } = app;
  const btn = document.createElement("button");
  btn.id = "corners"; btn.textContent = "Corners"; btn.setAttribute("aria-pressed", "false");
  $("#align-btns").appendChild(btn);

  const layer = document.createElement("div");
  layer.id = "handles"; layer.hidden = true;
  // Handles come last so they sit above the instruction bar and stay grabbable under it.
  layer.innerHTML =
    `<svg id="quad" aria-hidden="true"><polygon points=""/></svg>` +
    `<div id="corner-bar"><span>Drag each circle to where that corner of the drawing should be.</span><button id="corners-done">Done</button></div>` +
    NAMES.map((n, i) => `<button class="hdl" id="h${i}" aria-label="${n} corner"></button>`).join("");
  document.body.appendChild(layer);
  const handles = [...layer.querySelectorAll(".hdl")];
  const poly = layer.querySelector("polygon");

  let active = false, drag = null;

  function place() {
    if (!active) return;
    const q = app.screenCorners();
    const W = innerWidth, H = innerHeight;
    q.forEach((p, i) => {
      const c = clampToScreen(p, W, H);
      handles[i].style.transform = `translate(${c[0] - 22}px,${c[1] - 22}px)`;
    });
    poly.setAttribute("points", q.map(p => p.join(",")).join(" "));
  }

  function setActive(on) {
    active = on;
    layer.hidden = !on;
    document.body.classList.toggle("cornering", on);
    btn.setAttribute("aria-pressed", String(on));
    app.gesturesBlocked = on;
    app.cancelGesture();
    if (on) { place(); app.toast("Drag the circles onto the board.", 2500); }
    else app.save();
  }
  app.corners = { setActive, isActive: () => active };

  btn.addEventListener("click", () => setActive(!active));
  $("#corners-done").addEventListener("click", () => setActive(false));

  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const H = moveCorner(drag.q0, drag.i, e.clientX - drag.x0, e.clientY - drag.y0, app.imgW, app.imgH);
    handles[drag.i].classList.toggle("bad", !H);
    if (H) { app.setDisplayH(H); app.render(); }
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    handles[drag.i].classList.remove("bad");
    drag = null;
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onUp);
    app.save();
  }
  handles.forEach((hd, i) => hd.addEventListener("pointerdown", e => {
    if (!active || drag) return;
    e.preventDefault();
    drag = { i, id: e.pointerId, x0: e.clientX, y0: e.clientY, q0: app.screenCorners() };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
  }));

  app.events.addEventListener("render", place);
  app.events.addEventListener("image", () => { if (active) place(); });
  app.events.addEventListener("sync", () => { if (active && app.st.locked) setActive(false); });
  window.addEventListener("resize", place);
}

export default { name: "corners", init };
