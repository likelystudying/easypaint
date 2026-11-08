// Functional tests for the original features: camera start, opacity, style/colour,
// gestures, turn/reset, lock, peek, panels, custom image and persistence.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { openApp, startCamera, corners, drag, pointer, overlaySample, near, nearPts } from "../helpers/browser.mjs";

test.beforeEach(async ({ page }) => { await openApp(page); });

test("Start camera hides the start screen and plays the camera", async ({ page }) => {
  await expect(page.locator("#start")).toBeVisible();
  await startCamera(page);
  await expect(page.locator("#bar")).toBeVisible();
  const playing = await page.evaluate(() => !document.querySelector("#cam").paused);
  expect(playing).toBe(true);
});

test("opacity slider changes the overlay and survives a reload", async ({ page }) => {
  await startCamera(page);
  await page.locator("#op").fill("35");
  await expect(page.locator("#opv")).toHaveText("35%");
  expect(await page.locator("#ov").evaluate(e => e.style.opacity)).toBe("0.35");
  await page.evaluate(() => window.__tracer.saveNow());
  await openApp(page, { keepStorage: true });
  await expect(page.locator("#opv")).toHaveText("35%");
});

test("colour chips recolour the lines; Photo shows the original and disables colours", async ({ page }) => {
  await startCamera(page);
  await page.click("#t-style");
  await expect(page.locator("#p-style")).toBeVisible();
  let s = await overlaySample(page);
  expect(s.first.slice(0, 3)).toEqual([255, 59, 48]);
  expect(s.hasTransparent).toBe(true);

  await page.click('#color-seg button[data-c="blue"]');
  await expect.poll(async () => (await overlaySample(page)).first.slice(0, 3)).toEqual([30, 107, 255]);

  await page.click('#style-seg button[data-s="photo"]');
  await expect.poll(async () => (await overlaySample(page)).opaqueFraction).toBeGreaterThan(0.99);
  await expect(page.locator('#color-seg button[data-c="red"]')).toBeDisabled();
});

test("one-finger drag moves the overlay by the drag distance", async ({ page }) => {
  await startCamera(page);
  const before = await corners(page);
  await drag(page, [[300, 200]], [[360, 170]]);
  const after = await corners(page);
  nearPts(after, before.map(p => [p[0] + 60, p[1] - 30]), 0.5);
});

test("two-finger pinch doubles the size around the fingers' midpoint", async ({ page }) => {
  await startCamera(page);
  const before = await corners(page);
  await drag(page, [[270, 240], [370, 240]], [[220, 240], [420, 240]]);
  const after = await corners(page);
  near(after[1][0] - after[0][0], 2 * (before[1][0] - before[0][0]), 0.5);
  const midBefore = [(before[0][0] + before[2][0]) / 2, (before[0][1] + before[2][1]) / 2];
  const midAfter = [(after[0][0] + after[2][0]) / 2, (after[0][1] + after[2][1]) / 2];
  near(midAfter[0], 320 + 2 * (midBefore[0] - 320), 0.5);
});

test("Turn 90° rotates by a quarter turn and Reset restores the fitted placement", async ({ page }) => {
  await startCamera(page);
  const fitted = await corners(page);
  await page.click("#t-align");
  await page.click("#rot");
  const angle = await page.evaluate(() => { const a = window.__tracer; return a.G.angleOf(a.displayH(), a.imgW, a.imgH); });
  near(angle, 90, 1e-6);
  await page.click("#fit");
  nearPts(await corners(page), fitted, 1e-6);
});

test("Lock hides the controls and ignores touches until Unlock", async ({ page }) => {
  await startCamera(page);
  await page.click("#t-lock");
  await expect(page.locator("#bar")).toBeHidden();
  await expect(page.locator("#mini")).toBeVisible();
  const before = await corners(page);
  await drag(page, [[300, 200]], [[400, 300]]);
  nearPts(await corners(page), before, 1e-9);
  await page.click("#unlock");
  await expect(page.locator("#bar")).toBeVisible();
  await drag(page, [[300, 200]], [[310, 200]]);
  near((await corners(page))[0][0], before[0][0] + 10, 0.5);
});

test("Peek hides the overlay only while held", async ({ page }) => {
  await startCamera(page);
  const box = await page.locator("#t-peek").boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await expect(page.locator("#ov")).toHaveCSS("visibility", "hidden");
  await page.mouse.up();
  await expect(page.locator("#ov")).toHaveCSS("visibility", "visible");
});

test("tabs open one panel at a time and toggle closed", async ({ page }) => {
  await startCamera(page);
  await page.click("#t-style");
  await expect(page.locator("#p-style")).toBeVisible();
  await page.click("#t-align");
  await expect(page.locator("#p-align")).toBeVisible();
  await expect(page.locator("#p-style")).toBeHidden();
  await page.click("#t-align");
  await expect(page.locator("#p-align")).toBeHidden();
});

test("placement survives a reload", async ({ page }) => {
  await startCamera(page);
  await drag(page, [[300, 200]], [[350, 260]]);
  const placed = await corners(page);
  await page.evaluate(() => window.__tracer.saveNow());
  await openApp(page, { keepStorage: true });
  nearPts(await corners(page), placed, 1e-6);
});

test("a custom image replaces the drawing and survives a reload", async ({ page }) => {
  await startCamera(page);
  await page.setInputFiles("#file", path.resolve("tests/fixtures/static/square.png"));
  await expect.poll(() => page.evaluate(() => [window.__tracer.imgW, window.__tracer.imgH])).toEqual([120, 80]);
  await openApp(page, { keepStorage: true });
  expect(await page.evaluate(() => [window.__tracer.imgW, window.__tracer.imgH])).toEqual([120, 80]);
});
