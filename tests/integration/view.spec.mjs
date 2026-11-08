// Feature 3 with features 1, 2 and core on a phone screen with glare:
// boosted view + line-art style + corner warp + lock. The badge must stay visible while locked,
// the boosted view must line up with the camera, and the overlay must stay on top.
import { test, expect } from "@playwright/test";
import * as G from "../../js/geometry.js";
import { openApp, startCamera, corners, dragHandle } from "../helpers/browser.mjs";
import { cameraScene } from "../helpers/scenes.mjs";

test.use({ ...cameraScene("glare"), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("boost, glare badge, line art, warp and lock work together", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  page.on("console", m => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
  page.on("response", r => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

  await openApp(page);
  await startCamera(page);
  await page.click("#t-style");
  await page.click('#view-seg [data-v="boost"]');
  await page.waitForFunction(() => window.__tracer.view.boostFrames > 3, null, { timeout: 30_000 });
  const before = await page.evaluate(() => document.querySelector("#ov").src);
  await page.click('#style-seg [data-s="edges"]');
  await page.waitForFunction(b => document.querySelector("#ov").src !== b, before, { timeout: 30_000 });

  // Boosted view is placed exactly like the cover-fitted video.
  const box = await page.locator("#view").boundingBox();
  const M = G.coverMap(640, 480, 390, 844);
  const tl = G.apply(M, [0, 0]), br = G.apply(M, [640, 480]);
  expect(Math.abs(box.x - tl[0])).toBeLessThan(1);
  expect(Math.abs(box.width - (br[0] - tl[0]))).toBeLessThan(1);
  expect(Math.abs(box.height - (br[1] - tl[1]))).toBeLessThan(1);

  // Overlay is above the boosted view.
  expect(await page.evaluate(() => !!(document.querySelector("#view").compareDocumentPosition(document.querySelector("#ov")) & Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);

  await page.click("#t-align");
  await page.click("#corners");
  const q = await corners(page);
  await dragHandle(page, 0, [q[0][0] + 15, q[0][1] + 20]);
  await page.click("#corners-done");
  await page.click("#t-lock");

  await expect(page.locator("#glare-badge")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#bar")).toBeHidden();

  // Peek hides the overlay but keeps the boosted camera view.
  const peek = await page.locator("#peek2").boundingBox();
  await page.mouse.move(peek.x + 10, peek.y + 10);
  await page.mouse.down();
  await expect(page.locator("#ov")).toHaveCSS("visibility", "hidden");
  await expect(page.locator("#view")).toBeVisible();
  await page.mouse.up();

  expect(errors).toEqual([]);
});
