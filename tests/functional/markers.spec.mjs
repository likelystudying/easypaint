// Feature 4: marker anchoring, tested on its own with a still board showing all 4 markers.
import { test, expect } from "@playwright/test";
import { openApp, startCamera, corners, nearPts } from "../helpers/browser.mjs";
import { cameraScene } from "../helpers/scenes.mjs";
import { whichPose } from "../helpers/truth.mjs";

test.use(cameraScene("plain"));

async function openTrack(page) {
  await page.click("#t-track");
  await expect(page.locator("#mk-status")).toHaveText("Markers: 4 of 4 seen", { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => { await openApp(page); await startCamera(page); });

test("Track finds all four markers at their true positions", async ({ page }) => {
  await openTrack(page);
  await expect(page.locator("#anchor")).toBeEnabled();
  const screen = await page.evaluate(() => window.__tracer.markers.screen);
  expect(whichPose(screen, 640, 480, 1.5)).toBe("A");
});

test("Anchor and Release do not move the drawing", async ({ page }) => {
  await openTrack(page);
  const before = await corners(page);
  await page.click("#anchor");
  await expect(page.locator("#mk-status")).toHaveText(/Anchored · tracking 4/);
  await expect(page.locator("#anchor")).toHaveText("Release");
  await page.waitForFunction(n => window.__tracer.markers.frames > n + 5, await page.evaluate(() => window.__tracer.markers.frames));
  nearPts(await corners(page), before, 0.5);
  await page.click("#anchor");
  await expect(page.locator("#anchor")).toHaveText("Anchor to markers");
  expect(await page.evaluate(() => window.__tracer.st.anchor)).toBeNull();
  nearPts(await corners(page), before, 0.5);
});

test("an anchor is remembered and tracking resumes after a reload", async ({ page }) => {
  await openTrack(page);
  await page.click("#anchor");
  const before = await corners(page);
  await openApp(page, { keepStorage: true });
  await startCamera(page);
  await page.waitForFunction(() => window.__tracer.markers.anchored && window.__tracer.markers.frames > 5, null, { timeout: 30_000 });
  nearPts(await corners(page), before, 0.5);
  await page.click("#t-track");
  await expect(page.locator("#anchor")).toHaveText("Release");
});

test("detection stops when the Track panel closes and nothing is anchored", async ({ page }) => {
  await openTrack(page);
  await page.click("#t-track");
  const n = await page.evaluate(() => window.__tracer.markers.frames);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__tracer.markers.frames)).toBe(n);
});

test("the print sheet has four 6 cm markers that decode correctly", async ({ page }) => {
  await page.goto("/markers.html");
  await expect(page.locator("#grid svg")).toHaveCount(4);
  const w = await page.locator("#grid svg").first().evaluate(e => e.getBoundingClientRect().width);
  expect(Math.abs(w - 8 * 96 / 2.54)).toBeLessThan(0.5); // 8 cm tile = 6 cm black square + quiet zone
  // Rasterise each marker and run the app's detector on it.
  await page.addScriptTag({ url: "/vendor/opencv.js" });
  const ids = await page.evaluate(async () => {
    while (!(window.cv && window.cv.Mat)) await new Promise(r => setTimeout(r, 50));
    const { createDetector, detectMarkers } = await import("/js/features/markers.js");
    const det = createDetector(window.cv);
    const out = [];
    for (const svg of document.querySelectorAll("#grid svg")) {
      const img = new Image();
      img.src = "data:image/svg+xml;utf8," + encodeURIComponent(svg.outerHTML.replace(/width="8cm" height="8cm"/, 'width="240" height="240"'));
      await img.decode();
      const c = document.createElement("canvas"); c.width = 280; c.height = 280;
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, 280, 280); g.drawImage(img, 20, 20);
      out.push(detectMarkers(window.cv, det, g.getImageData(0, 0, 280, 280)).map(m => m.id));
    }
    return out;
  });
  expect(ids).toEqual([[0], [1], [2], [3]]);
});
