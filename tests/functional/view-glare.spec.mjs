// Feature 3a: glare warning, on a board with a reflection.
import { test, expect } from "@playwright/test";
import { openApp, startCamera } from "../helpers/browser.mjs";
import { cameraScene } from "../helpers/scenes.mjs";

test.use(cameraScene("glare"));

test("shows the glare badge and a one-time tip", async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await expect(page.locator("#glare-badge")).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#toast")).toContainText("Glare detected");
  expect(await page.evaluate(() => window.__tracer.view.glare)).toBeGreaterThan(0.02);
});
