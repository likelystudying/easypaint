// Feature 4 with features 1-3 and core. The "moving" video alternates between two camera
// poses every 2 s (as if the tripod were bumped). Once anchored, the drawing must follow the
// board exactly: the expected position comes from the generator's known poses, not the app.
import { test, expect } from "@playwright/test";
import * as G from "../../js/geometry.js";
import { openApp, startCamera, corners, dragHandle, nearPts } from "../helpers/browser.mjs";
import { cameraScene } from "../helpers/scenes.mjs";
import { whichPose, poseChange } from "../helpers/truth.mjs";

test.use({ ...cameraScene("moving"), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
const W = 390, H = 844;

const pose = (page) => page.evaluate(() => window.__tracer.markers.screen).then(s => whichPose(s, W, H));

async function waitForPose(page, want, notThis) {
  await expect.poll(async () => {
    const p = await pose(page);
    return want ? p === want : (p && p !== notThis);
  }, { timeout: 15_000, intervals: [50] }).toBe(true);
  await page.waitForTimeout(700); // let smoothing settle
  return pose(page);
}

test("an anchored, warped drawing follows the board when the camera moves, also while locked with boost on", async ({ page }) => {
  await openApp(page);
  await startCamera(page);

  // Feature 1: give the overlay a perspective warp first.
  await page.click("#t-align");
  await page.click("#corners");
  const q = await corners(page);
  await dragHandle(page, 1, [q[1][0] - 20, q[1][1] + 25]);
  await page.click("#corners-done");

  // Feature 3: boost on.
  await page.click("#t-style");
  await page.click('#view-seg [data-v="boost"]');

  // Feature 4: anchor.
  await page.click("#t-track");
  await expect(page.locator("#anchor")).toBeEnabled({ timeout: 30_000 });
  await page.click("#anchor");
  const refPose = whichPose(await page.evaluate(() => window.__tracer.markers.ref), W, H);
  expect(refPose, "anchor taken on a known pose").not.toBeNull();
  const anchored = await page.evaluate(() => { const a = window.__tracer; return a.G.corners(a.st.H, a.imgW, a.imgH); });

  await page.click("#t-lock");
  const other = await waitForPose(page, null, refPose);
  const expected = anchored.map(p => G.apply(poseChange(refPose, other, W, H), p));
  nearPts(await corners(page), expected, 2.5);

  // And back again.
  await waitForPose(page, refPose);
  nearPts(await corners(page), anchored, 2.5);
  expect(await page.evaluate(() => window.__tracer.view.boostFrames)).toBeGreaterThan(5);
});

test("after a reload the saved anchor re-aligns the drawing to wherever the board is now", async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.click("#t-track");
  await expect(page.locator("#anchor")).toBeEnabled({ timeout: 30_000 });
  await page.click("#anchor");
  const refPose = whichPose(await page.evaluate(() => window.__tracer.markers.ref), W, H);
  const anchored = await page.evaluate(() => { const a = window.__tracer; return a.G.corners(a.st.H, a.imgW, a.imgH); });

  await openApp(page, { keepStorage: true });
  await startCamera(page);
  await page.waitForFunction(() => window.__tracer.markers.anchored && window.__tracer.markers.frames > 3, null, { timeout: 30_000 });
  // Check both camera poses: the one in view now, then the other one.
  const first = await waitForPose(page, null, "none");
  nearPts(await corners(page), anchored.map(p => G.apply(poseChange(refPose, first, W, H), p)), 2.5);
  const second = await waitForPose(page, null, first);
  expect(second).not.toBe(first);
  nearPts(await corners(page), anchored.map(p => G.apply(poseChange(refPose, second, W, H), p)), 2.5);
});
