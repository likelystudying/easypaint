// Shared helpers for Playwright functional and integration tests.
import { expect } from "@playwright/test";

// Load the app with clean storage (unless keepStorage) and wait for the first overlay render.
export async function openApp(page, { keepStorage = false, query = "" } = {}) {
  await page.goto("/index.html" + query);
  if (!keepStorage) {
    await page.evaluate(() => localStorage.clear());
    await page.reload();
  }
  await page.waitForFunction(() => window.__tracer && window.__tracer.st && window.__tracer.imgW > 0);
  await page.evaluate(() => window.__tracer.ready);
}

export async function startCamera(page) {
  await page.click("#go");
  await expect(page.locator("#start")).toBeHidden();
  await page.waitForFunction(() => {
    const v = document.querySelector("#cam");
    return v.readyState >= 2 && v.videoWidth > 0;
  });
}

export const corners = (page) => page.evaluate(() => window.__tracer.screenCorners());
export const displayH = (page) => page.evaluate(() => window.__tracer.displayH());

// Synthetic pointer events on the camera stage, e.g. touches(page, [[100,100],[200,100]]) then move.
export async function pointer(page, type, points, ids) {
  await page.evaluate(({ type, points, ids }) => {
    const stage = document.querySelector("#stage");
    points.forEach((p, i) => {
      stage.dispatchEvent(new PointerEvent(type, {
        pointerId: ids ? ids[i] : 100 + i, clientX: p[0], clientY: p[1],
        bubbles: true, cancelable: true, pointerType: "touch", isPrimary: i === 0,
      }));
    });
  }, { type, points, ids });
}

export async function drag(page, from, to, steps = 5) {
  await pointer(page, "pointerdown", from);
  for (let s = 1; s <= steps; s++) {
    const t = s / steps;
    await pointer(page, "pointermove", from.map((p, i) => [p[0] + (to[i][0] - p[0]) * t, p[1] + (to[i][1] - p[1]) * t]));
  }
  await pointer(page, "pointerup", to);
}

// Colour of the first clearly visible pixel of the overlay image (in image space).
export async function overlaySample(page) {
  return page.evaluate(async () => {
    const ov = document.querySelector("#ov");
    for (let i = 0; i < 100 && !(ov.complete && ov.naturalWidth > 0); i++) await new Promise(r => setTimeout(r, 20));
    await ov.decode().catch(() => {});
    const c = document.createElement("canvas"); c.width = ov.naturalWidth; c.height = ov.naturalHeight;
    const g = c.getContext("2d"); g.drawImage(ov, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data;
    let opaque = 0, first = null, firstTransparent = null;
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] > 200) { opaque++; if (!first) first = [d[i], d[i + 1], d[i + 2], d[i + 3]]; }
      else if (d[i + 3] === 0 && !firstTransparent) firstTransparent = true;
    }
    return { first, opaqueFraction: opaque / (d.length / 4), hasTransparent: !!firstTransparent, w: c.width, h: c.height };
  });
}

// Drag corner handle i (feature: corners) so that image corner i lands on `to` (screen px).
export async function dragHandle(page, i, to, steps = 6) {
  const q = await corners(page);
  const box = await page.locator(`#h${i}`).boundingBox();
  const start = [box.x + box.width / 2, box.y + box.height / 2];
  const end = [start[0] + to[0] - q[i][0], start[1] + to[1] - q[i][1]];
  await page.mouse.move(start[0], start[1]);
  await page.mouse.down();
  await page.mouse.move(end[0], end[1], { steps });
  await page.mouse.up();
}

export const near = (a, b, tol) => expect(Math.abs(a - b), `expected ${b} ± ${tol}, got ${a}`).toBeLessThanOrEqual(tol);
export function nearPts(a, b, tol) {
  a.forEach((p, i) => { near(p[0], b[i][0], tol); near(p[1], b[i][1], tol); });
}
