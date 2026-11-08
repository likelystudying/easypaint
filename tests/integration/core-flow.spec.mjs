// End-to-end: phone-sized screen, file-backed camera, every original control used together,
// then a reload must restore the whole session.
import { test, expect } from "@playwright/test";
import { openApp, startCamera, corners, drag, nearPts, overlaySample } from "../helpers/browser.mjs";
import { cameraScene } from "../helpers/scenes.mjs";

test.use({ ...cameraScene("plain"), viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

test("a full session is restored after reload", async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  expect(await page.evaluate(() => [cam.videoWidth, cam.videoHeight])).toEqual([640, 480]);

  await page.locator("#op").fill("55");
  await page.click("#t-style");
  await page.click('#color-seg button[data-c="green"]');
  await expect.poll(async () => (await overlaySample(page)).first.slice(0, 3)).toEqual([22, 198, 12]);
  await drag(page, [[150, 400], [250, 400]], [[130, 380], [290, 420]]);
  await page.click("#t-align");
  await page.click("#rot");
  await page.click("#t-lock");
  const placed = await corners(page);
  await page.evaluate(() => window.__tracer.saveNow());

  await openApp(page, { keepStorage: true });
  await startCamera(page);
  await expect(page.locator("#mini")).toBeVisible();
  await expect(page.locator("#bar")).toBeHidden();
  await expect(page.locator("#opv")).toHaveText("55%");
  expect((await overlaySample(page)).first.slice(0, 3)).toEqual([22, 198, 12]);
  nearPts(await corners(page), placed, 1e-6);
});

test("fixture calibration: the browser sees the board at the grey level the generator wrote", async ({ page }) => {
  await openApp(page);
  await startCamera(page);
  const v = await page.evaluate(() => {
    const d = window.__tracer.grabFrame(640).imageData.data;
    const i = (240 * 640 + 320) * 4; return [d[i], d[i + 1], d[i + 2]];
  });
  v.forEach(c => expect(Math.abs(c - 236), `channel ${c}`).toBeLessThanOrEqual(8));
});

for (const vp of [{ width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`controls fit without sideways scrolling at ${vp.width}x${vp.height}`, async ({ page }) => {
    await page.setViewportSize(vp);
    await openApp(page);
    await startCamera(page);
    for (const tab of ["#t-style", "#t-align"]) {
      await page.click(tab);
      const overflow = await page.evaluate(() => {
        const bar = document.querySelector("#bar");
        const over = [...bar.querySelectorAll("button,label,input")].filter(el => {
          if (!el.offsetParent) return false;
          const r = el.getBoundingClientRect();
          return r.left < -0.5 || r.right > innerWidth + 0.5;
        }).map(el => el.id || el.textContent.trim());
        return { over, scrollX: document.documentElement.scrollWidth - innerWidth };
      });
      expect(overflow.over, `controls outside the screen with ${tab} open`).toEqual([]);
      expect(overflow.scrollX).toBeLessThanOrEqual(0);
    }
    const tabs = await page.locator("#tabs > *").all();
    for (const t of tabs) await expect(t).toBeInViewport();
  });
}
