import { test } from "node:test";
import assert from "node:assert/strict";
import { loadState, saveState, DEFAULTS, KEY } from "../../js/store.js";

function fakeStorage(init = {}, quota = Infinity) {
  const m = new Map(Object.entries(init));
  return {
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { if (v.length > quota) throw new Error("QuotaExceededError"); m.set(k, v); },
    map: m,
  };
}

test("empty storage gives defaults and no image", () => {
  const { st, img } = loadState(fakeStorage());
  assert.deepEqual(st, { ...DEFAULTS });
  assert.equal(img, null);
});

test("save then load round-trips settings and image", () => {
  const s = fakeStorage();
  const st = { ...DEFAULTS, H: [1, 0, 5, 0, 1, 6, 0, 0, 1], imgW: 10, imgH: 20, op: 40, color: "green", locked: true };
  assert.equal(saveState(s, st, "data:image/png;base64,AAA"), true);
  const back = loadState(s);
  assert.deepEqual(back.st, st);
  assert.equal(back.img, "data:image/png;base64,AAA");
});

test("corrupt JSON and invalid H fall back safely", () => {
  assert.deepEqual(loadState(fakeStorage({ [KEY]: "{not json" })).st, { ...DEFAULTS });
  const bad = JSON.stringify({ st: { H: [1, 2, "x"], op: 55 } });
  const { st } = loadState(fakeStorage({ [KEY]: bad }));
  assert.equal(st.H, null);
  assert.equal(st.op, 55);
});

test("unknown keys are dropped", () => {
  const { st } = loadState(fakeStorage({ [KEY]: JSON.stringify({ st: { evil: 1, op: 33 } }) }));
  assert.equal("evil" in st, false);
  assert.equal(st.op, 33);
});

test("v1 data migrates image, opacity and photo mode", () => {
  const old = JSON.stringify({ st: { tx: 5, ty: 6, s: 2, r: 0, op: 80, color: "photo" }, img: "data:x" });
  const { st, img } = loadState(fakeStorage({ "wbtracer.v1": old }));
  assert.equal(st.style, "photo");
  assert.equal(st.op, 80);
  assert.equal(st.H, null);
  assert.equal(img, "data:x");
});

test("a marker anchor round-trips, and a malformed one is dropped", () => {
  const anchor = { ref: { 0: [[1, 2], [3, 4], [5, 6], [7, 8]], 2: [[9, 9], [10, 9], [10, 10], [9, 10]] } };
  const s = fakeStorage();
  saveState(s, { ...DEFAULTS, anchor }, null);
  assert.deepEqual(loadState(s).st.anchor, anchor);
  for (const bad of [{ ref: { 0: [[1, 2]] } }, { ref: {} }, "x", { ref: { 0: [[1, 2], [3, 4], [5, 6], [7, "a"]] } }]) {
    const t = fakeStorage({ [KEY]: JSON.stringify({ st: { anchor: bad } }) });
    assert.equal(loadState(t).st.anchor, null, JSON.stringify(bad));
  }
});

test("when the image is too big for storage, settings are still saved", () => {
  const s = fakeStorage({}, 500);
  assert.equal(saveState(s, { ...DEFAULTS, op: 22 }, "x".repeat(1000)), false);
  const back = loadState(s);
  assert.equal(back.st.op, 22);
  assert.equal(back.img, null);
});

test("settings with the wrong type or an impossible value fall back to defaults", () => {
  const bad = { st: { op: "70", markerCm: -3, locked: "yes", color: 5, widthCm: 50 } };
  const { st } = loadState(fakeStorage({ [KEY]: JSON.stringify(bad) }));
  assert.equal(st.op, DEFAULTS.op);
  assert.equal(st.markerCm, DEFAULTS.markerCm);
  assert.equal(st.locked, false);
  assert.equal(st.color, DEFAULTS.color);
  assert.equal(st.widthCm, 50);
});
