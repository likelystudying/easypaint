// Feature 5: without markers there is no ruler, so sizing is not offered.
import { test, expect } from "@playwright/test";
import { openApp, startCamera } from "../helpers/browser.mjs";

test("without markers Set size is disabled and says why", async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  await page.click("#t-align");
  await page.waitForFunction(() => window.__tracer.markers.frames > 5, null, { timeout: 30_000 });
  await expect(page.locator("#size-set")).toBeDisabled();
  await expect(page.locator("#size-now")).toHaveText("Show at least one marker to measure.");
});
