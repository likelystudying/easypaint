// Access to generated fixture videos and their ground-truth geometry (run `npm run fixtures` first).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { FAKE_CAMERA } from "../../playwright.config.mjs";

const out = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../fixtures/out");

export function scenes() {
  const f = path.join(out, "scenes.json");
  if (!fs.existsSync(f)) throw new Error("Fixtures missing: run `npm run fixtures` first.");
  return JSON.parse(fs.readFileSync(f, "utf8"));
}

// Playwright `test.use()` options that make the fake camera play a scene video.
export function cameraScene(name) {
  return { launchOptions: { args: [...FAKE_CAMERA, `--use-file-for-fake-video-capture=${scenes().scenes[name].file}`] } };
}
