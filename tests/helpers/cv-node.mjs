// Load the same vendor/opencv.js the app uses, inside Node.
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../vendor/opencv.js");
let pending = null;

export function loadCVNode() {
  if (pending) return pending;
  pending = (async () => {
    let cv = require(file);
    if (cv instanceof Promise) cv = await cv;
    if (!cv.Mat) await new Promise(r => { cv.onRuntimeInitialized = r; });
    // The module object is "thenable"; resolving a promise with it loops forever. Strip it.
    if (typeof cv.then === "function") cv.then = undefined;
    return cv;
  })();
  return pending;
}

// Plain {width, height, data} RGBA object (what the app gets from canvas getImageData).
export function rgbaImage(width, height, fill = 255) {
  const data = new Uint8ClampedArray(width * height * 4).fill(fill);
  for (let i = 3; i < data.length; i += 4) data[i] = 255;
  return { width, height, data };
}
