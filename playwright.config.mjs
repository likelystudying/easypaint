import { defineConfig } from "@playwright/test";

// Functional tests: one feature at a time in a real browser with a fake camera.
// Integration tests: features working together on synthetic whiteboard videos.
// Chrome's fake camera is a moving test pattern unless a test file sets --use-file-for-fake-video-capture.
export const FAKE_CAMERA = [
  "--use-fake-ui-for-media-stream",
  "--use-fake-device-for-media-stream",
];

export default defineConfig({
  timeout: 60_000,
  expect: { timeout: 15_000 },
  workers: 2,
  reporter: [["list"]],
  retries: 0,
  use: {
    baseURL: "http://localhost:4173",
    channel: "chrome",
    viewport: { width: 640, height: 480 },
    launchOptions: { args: FAKE_CAMERA },
    permissions: ["camera"],
  },
  webServer: {
    command: "node tests/server.mjs",
    url: "http://localhost:4173/index.html",
    reuseExistingServer: true,
    timeout: 20_000,
  },
  projects: [
    { name: "functional", testDir: "tests/functional" },
    { name: "integration", testDir: "tests/integration" },
  ],
});
