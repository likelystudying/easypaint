// Feature 3a: glare warning stays off on a normal board.
import { test, expect } from "@playwright/test";
import { openApp, startCamera } from "../helpers/browser.mjs";
import { cameraScene } from "../helpers/scenes.mjs";

test.use(cameraScene("plain"));

test("never shows the badge without glare", async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.waitForFunction(() => window.__tracer.view.checks >= 4, null, { timeout: 15_000 });
  await expect(page.locator("#glare-badge")).toBeHidden();
  expect(await page.evaluate(() => window.__tracer.view.glare)).toBeLessThan(0.005); // largest bright patch, not the white paper around markers
});
