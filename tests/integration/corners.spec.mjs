// Feature 1 with the core: warp onto real board points of a tilted whiteboard video,
// then check gestures, Turn 90° and persistence keep working on a warped overlay.
import { test, expect } from "@playwright/test";
import * as G from "../../js/geometry.js";
import { openApp, startCamera, corners, drag, dragHandle, near, nearPts } from "../helpers/browser.mjs";
import { cameraScene, scenes } from "../helpers/scenes.mjs";

test.use(cameraScene("plain")); // viewport 640x480 = video size, so screen px = video px
const meta = scenes();
const centre = id => [meta.markers[id][0] + meta.markerSide / 2, meta.markers[id][1] + meta.markerSide / 2];

test("overlay corners can be pinned to the four marker centres with correct perspective", async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.click("#t-align");
  await page.click("#corners");
  const boardPts = [0, 1, 2, 3].map(centre);
  const targets = boardPts.map(p => G.apply(meta.poses.A, p));
  for (let i = 0; i < 4; i++) await dragHandle(page, i, targets[i]);
  await page.click("#corners-done");
  nearPts(await corners(page), targets, 1);

  // Perspective check: the image centre must land on the board centre's true camera position,
  // which differs from the plain average of the corners on a tilted board.
  const boardMid = [(boardPts[0][0] + boardPts[2][0]) / 2, (boardPts[0][1] + boardPts[2][1]) / 2];
  const expected = G.apply(meta.poses.A, boardMid);
  const got = await page.evaluate(() => { const a = window.__tracer; return a.G.apply(a.displayH(), [a.imgW / 2, a.imgH / 2]); });
  near(got[0], expected[0], 1.5); near(got[1], expected[1], 1.5);

  // A pinch after warping scales the warped shape about the fingers' midpoint.
  const before = await corners(page);
  await drag(page, [[280, 240], [360, 240]], [[260, 240], [380, 240]]);
  const S = G.similarityFromPairs([280, 240], [360, 240], [260, 240], [380, 240]);
  nearPts(await corners(page), before.map(p => G.apply(S, p)), 1);

  // Turn 90° keeps the warped shape (same side lengths, rotated).
  const pre = await corners(page);
  await page.click("#rot");
  const post = await corners(page);
  const side = q => Math.hypot(q[1][0] - q[0][0], q[1][1] - q[0][1]);
  near(side(post), side(pre), 1);

  // Lock, reload: everything comes back.
  await page.click("#t-lock");
  await page.evaluate(() => window.__tracer.saveNow());
  await openApp(page, { keepStorage: true });
  await startCamera(page);
  nearPts(await corners(page), post, 1e-6);
  await expect(page.locator("#mini")).toBeVisible();
});
