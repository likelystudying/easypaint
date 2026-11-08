// Loads vendor/opencv.js (about 11 MB) only when a feature needs it.
// Note: never `await` the cv object itself; some builds expose a `then` that never settles.
let pending = null;

// The Emscripten module object is "thenable"; resolving a promise with it loops forever.
function unthen(cv) {
  if (cv && typeof cv.then === "function") cv.then = undefined;
  return cv;
}

function whenReady(cv) {
  return new Promise((resolve, reject) => {
    if (!cv) return reject(new Error("OpenCV did not load"));
    if (cv.Mat) return resolve(unthen(cv));
    const prev = cv.onRuntimeInitialized;
    cv.onRuntimeInitialized = () => { if (typeof prev === "function") prev(); resolve(unthen(cv)); };
  });
}

export function loadCV(src = "vendor/opencv.js") {
  if (pending) return pending;
  pending = new Promise((resolve, reject) => {
    const g = globalThis;
    if (g.cv && g.cv.Mat) return resolve(unthen(g.cv));
    const s = document.createElement("script");
    s.src = src;
    s.async = true;
    s.onload = () => {
      const c = g.cv;
      const p = (c instanceof Promise) ? c.then(whenReady) : whenReady(c);
      p.then(resolve, reject);
    };
    s.onerror = () => reject(new Error("Could not download the vision engine. Check your connection and try again."));
    document.head.appendChild(s);
  }).catch(err => { pending = null; throw err; });
  return pending;
}

export function isCVLoaded() {
  return !!(globalThis.cv && globalThis.cv.Mat);
}
