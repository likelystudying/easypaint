// Feature 3b: contrast boost, on a dim, low-contrast board.
import { test, expect } from "@playwright/test";
import { openApp, startCamera } from "../helpers/browser.mjs";
import { cameraScene } from "../helpers/scenes.mjs";

test.use(cameraScene("dim"));

// Standard deviation of grey levels: of the boosted canvas, or of the raw camera frame.
const contrast = (page, which) => page.evaluate((which) => {
  let d;
  if (which === "view") { const c = document.querySelector("#view"); d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data; }
  else d = window.__tracer.grabFrame(720).imageData.data;
  let s = 0, s2 = 0, n = 0;
  for (let i = 0; i < d.length; i += 4) { s += d[i]; s2 += d[i] * d[i]; n++; }
  const m = s / n; return Math.sqrt(s2 / n - m * m);
}, which);

const boostRunning = (page) => page.waitForFunction(() => window.__tracer.view.boostFrames > 3, null, { timeout: 30_000 });

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.click("#t-style");
});

test("Boost shows a higher-contrast camera view aligned with the video", async ({ page }) => {
  await page.click('#view-seg [data-v="boost"]');
  await boostRunning(page);
  await expect(page.locator("#view")).toBeVisible();
  const boosted = await contrast(page, "view"), raw = await contrast(page, "raw");
  expect(boosted, `raw ${raw.toFixed(1)} vs boosted ${boosted.toFixed(1)}`).toBeGreaterThan(raw * 2);
  const box = await page.locator("#view").boundingBox();
  expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, 640, 480]);
});

test("Normal hides the boosted view and stops processing", async ({ page }) => {
  await page.click('#view-seg [data-v="boost"]');
  await boostRunning(page);
  await page.click('#view-seg [data-v="normal"]');
  await expect(page.locator("#view")).toBeHidden();
  const n = await page.evaluate(() => window.__tracer.view.boostFrames);
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__tracer.view.boostFrames)).toBe(n);
});

test("Boost is remembered and turns back on after a reload", async ({ page }) => {
  await page.click('#view-seg [data-v="boost"]');
  await page.evaluate(() => window.__tracer.saveNow());
  await openApp(page, { keepStorage: true });
  await startCamera(page);
  await boostRunning(page);
  await expect(page.locator("#view")).toBeVisible();
});
