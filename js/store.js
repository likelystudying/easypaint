// Saved settings, per device. Takes a Storage-like object so tests can pass a fake.
export const KEY = "wbtracer.v2";
const OLD_KEY = "wbtracer.v1";

export const DEFAULTS = Object.freeze({
  H: null,          // overlay homography (image px -> screen px), null = fit to screen
  imgW: 0, imgH: 0, // processed image size that H refers to
  op: 70,           // overlay opacity %
  color: "red",     // red | blue | green
  style: "lines",   // lines | edges | sketch | photo
  detail: 5,        // line-art detail 1-10 (edges and sketch styles)
  locked: false,
});

export function loadState(storage) {
  const st = { ...DEFAULTS };
  let img = null;
  try {
    const raw = storage.getItem(KEY);
    if (raw) {
      const j = JSON.parse(raw);
      if (j && typeof j === "object") {
        for (const k of Object.keys(DEFAULTS)) if (k in (j.st || {})) st[k] = j.st[k];
        if (typeof j.img === "string") img = j.img;
      }
    } else {
      // v1 stored a different transform format; keep only the image and simple settings.
      const old = JSON.parse(storage.getItem(OLD_KEY) || "null");
      if (old) {
        if (typeof old.img === "string") img = old.img;
        if (old.st) {
          if (typeof old.st.op === "number") st.op = old.st.op;
          if (old.st.color === "photo") st.style = "photo";
          else if (old.st.color in { red: 1, blue: 1, green: 1 }) st.color = old.st.color;
        }
      }
    }
  } catch (e) { /* storage unavailable or corrupt: use defaults */ }
  if (!Array.isArray(st.H) || st.H.length !== 9 || st.H.some(v => typeof v !== "number" || !Number.isFinite(v))) st.H = null;
  return { st, img };
}

// Returns true if the image was saved too, false if only settings fit.
export function saveState(storage, st, img) {
  const data = {};
  for (const k of Object.keys(DEFAULTS)) data[k] = st[k];
  try { storage.setItem(KEY, JSON.stringify({ st: data, img })); return true; }
  catch (e) {
    try { storage.setItem(KEY, JSON.stringify({ st: data, img: null })); } catch (_) { /* give up */ }
    return false;
  }
}
