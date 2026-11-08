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
    const tabs = await page.$$eval("#tabs [data-panel]", els => els.map(e => "#" + e.id));
    for (const tab of tabs) {
      await page.click(tab);
      const r = await page.evaluate(() => {
        const bar = document.querySelector("#bar");
        const name = el => el.id || el.textContent.trim().slice(0, 20);
        const items = [...bar.querySelectorAll("button,label,input,a,.lbl,.note,.unit,.val,.pill")].filter(el => el.offsetParent && el.getClientRects().length);
        const over = items.filter(el => { const r = el.getBoundingClientRect(); return r.left < -0.5 || r.right > innerWidth + 0.5; }).map(name);
        // Text that does not fit its box (clipped or spilling onto neighbours)
        const clipped = items.filter(el => !["INPUT"].includes(el.tagName) && el.scrollWidth > el.clientWidth + 1).map(name);
        // Sibling controls that overlap each other
        const overlaps = [];
        for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
          const a = items[i], b = items[j];
          if (a.contains(b) || b.contains(a)) continue;
          const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
          const w = Math.min(p.right, q.right) - Math.max(p.left, q.left), h = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
          if (w > 1 && h > 1) overlaps.push(name(a) + " / " + name(b));
        }
        return { over, clipped, overlaps, scrollX: document.documentElement.scrollWidth - innerWidth };
      });
      expect(r.over, `controls outside the screen with ${tab} open`).toEqual([]);
      expect(r.clipped, `text that does not fit with ${tab} open`).toEqual([]);
      expect(r.overlaps, `overlapping controls with ${tab} open`).toEqual([]);
      expect(r.scrollX).toBeLessThanOrEqual(0);
    }
    for (const t of await page.locator("#tabs > *").all()) await expect(t).toBeInViewport();
  });
}
