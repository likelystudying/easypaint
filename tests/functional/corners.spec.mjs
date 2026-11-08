// Feature 1: 4-corner perspective warp, tested on its own.
import { test, expect } from "@playwright/test";
import { openApp, startCamera, corners, drag, dragHandle, near, nearPts } from "../helpers/browser.mjs";

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.click("#t-align");
});

async function enter(page) {
  await page.click("#corners");
  await expect(page.locator("#handles")).toBeVisible();
}

test("Corners shows a handle on each overlay corner and Done hides them", async ({ page }) => {
  await enter(page);
  await expect(page.locator("#bar")).toBeHidden();
  const q = await corners(page);
  for (let i = 0; i < 4; i++) {
    const b = await page.locator(`#h${i}`).boundingBox();
    near(b.x + b.width / 2, Math.min(640 - 22, Math.max(22, q[i][0])), 0.5);
    near(b.y + b.height / 2, Math.min(480 - 22, Math.max(22, q[i][1])), 0.5);
  }
  await page.click("#corners-done");
  await expect(page.locator("#handles")).toBeHidden();
  await expect(page.locator("#bar")).toBeVisible();
});

test("dragging a handle moves only that corner and adds perspective", async ({ page }) => {
  await enter(page);
  const before = await corners(page);
  const target = [before[2][0] + 40, before[2][1] - 30];
  await dragHandle(page, 2, target);
  const after = await corners(page);
  near(after[2][0], target[0], 0.5); near(after[2][1], target[1], 0.5);
  [0, 1, 3].forEach(i => { near(after[i][0], before[i][0], 0.5); near(after[i][1], before[i][1], 0.5); });
  const m = (await page.locator("#ov").evaluate(e => e.style.transform)).match(/matrix3d\((.*)\)/)[1].split(",").map(Number);
  expect(Math.abs(m[3]) + Math.abs(m[7])).toBeGreaterThan(1e-7);
});

test("a drag that would fold the shape is refused", async ({ page }) => {
  await enter(page);
  const before = await corners(page);
  await dragHandle(page, 2, [before[0][0] - 20, before[0][1] - 20]);
  const after = await corners(page);
  // The corner never crossed the opposite corner; the shape stays convex.
  expect(await page.evaluate(q => window.__tracer.G.isConvexQuad(q), after)).toBe(true);
  expect(after[2][0]).toBeGreaterThan(before[0][0]);
});

test("touches on the camera do not move the overlay while in corner mode", async ({ page }) => {
  await enter(page);
  const before = await corners(page);
  await drag(page, [[320, 240]], [[380, 300]]);
  nearPts(await corners(page), before, 1e-9);
});

test("the warp survives a reload and Reset removes it", async ({ page }) => {
  await enter(page);
  const before = await corners(page);
  await dragHandle(page, 1, [before[1][0] + 25, before[1][1] + 30]);
  await page.click("#corners-done");
  const warped = await corners(page);
  await page.evaluate(() => window.__tracer.saveNow());
  await openApp(page, { keepStorage: true });
  nearPts(await corners(page), warped, 1e-6);
  await startCamera(page);
  await page.click("#t-align");
  await page.click("#fit");
  nearPts(await corners(page), before, 1e-6);
});

test("Lock leaves corner mode", async ({ page }) => {
  await enter(page);
  await page.evaluate(() => document.querySelector("#t-lock").click());
  await expect(page.locator("#handles")).toBeHidden();
  await expect(page.locator("#mini")).toBeVisible();
  expect(await page.evaluate(() => window.__tracer.gesturesBlocked)).toBe(false);
});
