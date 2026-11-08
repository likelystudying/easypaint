// Feature 4: with no markers in view, anchoring is not offered.
import { test, expect } from "@playwright/test";
import { openApp, startCamera } from "../helpers/browser.mjs";

test("without markers the status says so and Anchor stays disabled", async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.click("#t-track");
  await page.waitForFunction(() => window.__tracer.markers.frames > 5, null, { timeout: 30_000 });
  await expect(page.locator("#mk-status")).toHaveText("Markers: 0 of 4 seen");
  await expect(page.locator("#anchor")).toBeDisabled();
});
