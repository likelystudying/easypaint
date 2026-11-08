// Feature 2: photo to line art (Edges, Sketch, Detail), tested on its own.
import { test, expect } from "@playwright/test";
import path from "node:path";
import { openApp, startCamera, overlayAlpha } from "../helpers/browser.mjs";

const SHAPES = path.resolve("tests/fixtures/static/shapes.png"); // 300x200: dark disc, dark square, thin line on a light gradient

async function choose(page, style) {
  const before = await page.evaluate(() => document.querySelector("#ov").src);
  await page.click(`#style-seg [data-s="${style}"]`);
  await page.waitForFunction(({ s, before }) => window.__tracer.st.style === s && document.querySelector("#ov").src !== before, { s: style, before }, { timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.setInputFiles("#file", SHAPES);
  await expect.poll(() => page.evaluate(() => window.__tracer.imgW)).toBe(300);
  await page.click("#t-style");
});

test("Edges outlines shapes and leaves their insides and smooth background empty", async ({ page }) => {
  await choose(page, "edges");
  await expect(page.locator("#detail-row")).toBeVisible();
  expect(await page.evaluate(() => !!(window.cv && window.cv.Mat))).toBe(true);
  const r = await overlayAlpha(page, [[80, 90], [215, 105], [150, 20], [30, 90], [170, 105]]);
  expect(r.at[0], "inside the disc").toBe(0);
  expect(r.at[1], "inside the square").toBe(0);
  expect(r.at[2], "smooth background").toBe(0);
  expect(r.near[3], "left edge of the disc").toBeGreaterThan(200);
  expect(r.near[4], "left edge of the square").toBeGreaterThan(200);
});

test("Sketch keeps the thin dark line and leaves the background clean", async ({ page }) => {
  await choose(page, "sketch");
  const r = await overlayAlpha(page, [[150, 180], [150, 20], [280, 20]]);
  expect(r.near[0], "thin line").toBeGreaterThan(200);
  expect(r.at[1]).toBe(0);
  expect(r.at[2]).toBe(0);
  expect(r.fraction).toBeLessThan(0.25);
});

// Alpha channel of the overlay as a compact signature, to tell two renders apart.
const alphaSignature = (page) => page.evaluate(async () => {
  const ov = document.querySelector("#ov"); await ov.decode().catch(() => {});
  const c = document.createElement("canvas"); c.width = ov.naturalWidth; c.height = ov.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(ov, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height).data;
  const a = []; for (let i = 3; i < d.length; i += 4) a.push(d[i] > 128 ? 1 : 0);
  return a;
});

test("Detail re-renders the line art and is remembered", async ({ page }) => {
  await choose(page, "edges");
  const low = await page.evaluate(() => document.querySelector("#ov").src);
  await page.locator("#detail").fill("1");
  await page.waitForFunction(b => document.querySelector("#ov").src !== b, low);
  const a1 = await alphaSignature(page);
  const mid = await page.evaluate(() => document.querySelector("#ov").src);
  await page.locator("#detail").fill("10");
  await page.waitForFunction(b => document.querySelector("#ov").src !== b, mid);
  const a10 = await alphaSignature(page);
  const changed = a1.reduce((n, v, i) => n + (v !== a10[i] ? 1 : 0), 0);
  expect(changed, "pixels that differ between detail 1 and 10").toBeGreaterThan(0);
  await page.evaluate(() => window.__tracer.saveNow());
  await openApp(page, { keepStorage: true });
  await expect(page.locator("#detail")).toHaveValue("10");
  expect(await page.evaluate(() => window.__tracer.st.style)).toBe("edges");
});

test("Detail is only shown for Edges and Sketch", async ({ page }) => {
  await expect(page.locator("#detail-row")).toBeHidden();
  await choose(page, "sketch");
  await expect(page.locator("#detail-row")).toBeVisible();
  await choose(page, "photo");
  await expect(page.locator("#detail-row")).toBeHidden();
});

test("if the vision engine cannot load, it explains and falls back to Lines", async ({ page }) => {
  await page.route("**/vendor/opencv.js", r => r.abort());
  await page.click('#style-seg [data-s="edges"]');
  await expect(page.locator("#toast")).toContainText("Could not download the vision engine");
  await expect(page.locator('#style-seg [data-s="lines"]')).toHaveAttribute("aria-pressed", "true");
  expect(await page.evaluate(() => window.__tracer.st.style)).toBe("lines");
});
