// When camera permission is refused, the start screen stays and explains how to fix it.
import { test, expect } from "@playwright/test";
import { openApp } from "../helpers/browser.mjs";

test.use({
  permissions: [],
  launchOptions: { args: ["--use-fake-device-for-media-stream", "--deny-permission-prompts"] },
});

test("refused camera permission shows a fix-it message", async ({ page }) => {
  await openApp(page);
  await page.click("#go");
  await expect(page.locator("#err")).toBeVisible();
  await expect(page.locator("#err")).toContainText("Camera access was blocked");
  await expect(page.locator("#start")).toBeVisible();
});
