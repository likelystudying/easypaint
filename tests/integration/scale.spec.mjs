// Feature 5 with features 1, 2, 4 and core, on the moving board, phone-sized screen:
// warp, line art, set a real size, anchor, lock; the drawing must keep its real size on the
// board through camera moves and a reload.
import { test, expect } from "@playwright/test";
import { openApp, startCamera, corners, dragHandle } from "../helpers/browser.mjs";
import { cameraScene } from "../helpers/scenes.mjs";
import { whichPose, boardSizeCm } from "../helpers/truth.mjs";

test.use({ ...cameraScene("moving"), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const W = 390, H = 844;
const pose = (page) => page.evaluate(() => window.__tracer.markers.screen).then(s => whichPose(s, W, H));
const within = (a, b, pct) => expect(Math.abs(a - b) / b, `${a.toFixed(2)} vs ${b}`).toBeLessThanOrEqual(pct);

async function settledPose(page, notThis) {
  await expect.poll(async () => { const p = await pose(page); return !!p && p !== notThis; }, { timeout: 15_000, intervals: [50] }).toBe(true);
  await page.waitForTimeout(700);
  return pose(page);
}

test("a real-size drawing keeps its size on the board through moves and a reload", async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.click("#t-style");
  const src = await page.evaluate(() => document.querySelector("#ov").src);
  await page.click('#style-seg [data-s="sketch"]');
  await page.waitForFunction(b => document.querySelector("#ov").src !== b, src, { timeout: 30_000 });

  await page.click("#t-align");
  await page.click("#corners");
  const q = await corners(page);
  await dragHandle(page, 2, [q[2][0] - 30, q[2][1] - 10]); // a warp that Set size should replace
  await page.click("#corners-done");

  await expect(page.locator("#size-set")).toBeEnabled({ timeout: 30_000 });
  // Set size anchors to the markers in the same step, so the size sticks to the board.
  await settledPose(page, "none");
  await page.locator("#size-cm").fill("50");
  await page.click("#size-set");
  expect(await page.evaluate(() => window.__tracer.markers.anchored)).toBe(true);
  const p0 = whichPose(await page.evaluate(() => window.__tracer.markers.ref), W, H);
  expect(p0, "anchored on a known pose").not.toBeNull();
  const atAnchor = await page.evaluate(() => { const a = window.__tracer; return a.G.corners(a.st.H, a.imgW, a.imgH); });
  within(boardSizeCm(atAnchor, p0, W, H).width, 50, 0.03);

  await page.click("#t-lock");
  const p1 = await settledPose(page, p0);
  within(boardSizeCm(await corners(page), p1, W, H).width, 50, 0.03);

  await page.evaluate(() => window.__tracer.saveNow());
  await openApp(page, { keepStorage: true });
  await startCamera(page);
  const p2 = await settledPose(page, "none");
  within(boardSizeCm(await corners(page), p2, W, H).width, 50, 0.03);
  expect(await page.evaluate(() => window.__tracer.st.style)).toBe("sketch");
});
