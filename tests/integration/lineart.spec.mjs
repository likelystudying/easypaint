// Feature 2 with features 1 and core: photo -> Sketch -> colour -> corner warp -> lock -> reload.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { openApp, startCamera, corners, dragHandle, nearPts, overlaySample, overlayAlpha } from "../helpers/browser.mjs";
import { cameraScene } from "../helpers/scenes.mjs";

test.use({ ...cameraScene("plain"), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("a line-art session with a warp is fully restored after reload", async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.setInputFiles("#file", path.resolve("tests/fixtures/static/shapes.png"));
  await expect.poll(() => page.evaluate(() => window.__tracer.imgW)).toBe(300);

  await page.click("#t-style");
  const fitted = await corners(page);
  const src0 = await page.evaluate(() => document.querySelector("#ov").src);
  await page.click('#style-seg [data-s="sketch"]');
  await page.waitForFunction(b => document.querySelector("#ov").src !== b && window.__tracer.st.style === "sketch", src0, { timeout: 30_000 });
  nearPts(await corners(page), fitted, 1e-9); // changing style never moves the drawing

  await page.click('#color-seg [data-c="blue"]');
  await expect.poll(async () => (await overlaySample(page)).first.slice(0, 3)).toEqual([30, 107, 255]);

  await page.click("#t-align");
  await page.click("#corners");
  await dragHandle(page, 3, [fitted[3][0] + 20, fitted[3][1] + 25]);
  await page.click("#corners-done");
  const warped = await corners(page);
  await page.click("#t-lock");
  await page.evaluate(() => window.__tracer.saveNow());

  await openApp(page, { keepStorage: true });
  await page.waitForFunction(() => document.querySelector("#ov").naturalWidth === 300, null, { timeout: 30_000 });
  await startCamera(page);
  expect(await page.evaluate(() => window.__tracer.st.style)).toBe("sketch");
  await expect.poll(async () => (await overlaySample(page)).first.slice(0, 3)).toEqual([30, 107, 255]);
  const a = await overlayAlpha(page, [[150, 180], [150, 20]]);
  expect(a.near[0]).toBeGreaterThan(200);
  expect(a.at[1]).toBe(0);
  nearPts(await corners(page), warped, 1e-6);
  await expect(page.locator("#mini")).toBeVisible();
});
