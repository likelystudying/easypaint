// Feature 5: real-size scaling, tested on its own on a still board (true size known).
import { test, expect } from "@playwright/test";
import { openApp, startCamera, corners } from "../helpers/browser.mjs";
import { cameraScene } from "../helpers/scenes.mjs";
import { boardSizeCm } from "../helpers/truth.mjs";

test.use(cameraScene("plain"));
const readout = async (page) => {
  const t = await page.locator("#size-now").textContent();
  const m = t.match(/Now ([\d.]+) × ([\d.]+) cm/);
  return m ? { width: +m[1], height: +m[2] } : null;
};
const within = (a, b, pct) => expect(Math.abs(a - b) / b, `${a} vs ${b}`).toBeLessThanOrEqual(pct);

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.click("#t-align");
  await expect(page.locator("#size-now")).toHaveText(/Now .* cm \(from 4 markers\)/, { timeout: 30_000 });
});

test("the readout matches the drawing's true size on the board", async ({ page }) => {
  const truth = boardSizeCm(await corners(page), "A", 640, 480);
  const r = await readout(page);
  within(r.width, truth.width, 0.03);
  within(r.height, truth.height, 0.03);
});

test("Set size makes the drawing that wide on the board", async ({ page }) => {
  await page.locator("#size-cm").fill("40");
  await page.click("#size-set");
  const truth = boardSizeCm(await corners(page), "A", 640, 480);
  within(truth.width, 40, 0.03);
  within(truth.height, 40 * 801 / 1142, 0.03);
  await expect.poll(async () => (await readout(page)).width).toBeGreaterThan(38.8);
  expect((await readout(page)).width).toBeLessThan(41.2);
  expect(await page.evaluate(() => window.__tracer.markers.anchored), "Set size anchors to the markers").toBe(true);
  await expect(page.locator("#toast")).toContainText("anchored to the markers");
});

test("a different marker size changes the ruler and is remembered", async ({ page }) => {
  const r6 = await readout(page);
  await page.click("#t-track");
  await page.locator("#marker-cm").fill("12");
  await page.locator("#marker-cm").dispatchEvent("change");
  await page.click("#t-align");
  await expect.poll(async () => (await readout(page)).width / r6.width).toBeGreaterThan(1.96);
  expect((await readout(page)).width / r6.width).toBeLessThan(2.04);
  await page.evaluate(() => window.__tracer.saveNow());
  await openApp(page, { keepStorage: true });
  await expect(page.locator("#marker-cm")).toHaveValue("12");
});
