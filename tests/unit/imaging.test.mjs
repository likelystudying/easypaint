import { test } from "node:test";
import assert from "node:assert/strict";
import { inkFromLuminance, colorize, fitDims, inkFraction, COLORS } from "../../js/imaging.js";

const px = (...rgb) => new Uint8ClampedArray(rgb.flatMap(c => [...c, 255]));

test("inkFromLuminance: black is full ink, white and light paper are none", () => {
  const ink = inkFromLuminance(px([0, 0, 0], [255, 255, 255], [240, 240, 240], [140, 140, 140]), 4, 1);
  assert.equal(ink[0], 255);
  assert.equal(ink[1], 0);
  assert.equal(ink[2], 0);
  assert.ok(ink[3] > 60 && ink[3] < 200, `mid grey gives partial ink, got ${ink[3]}`);
});

test("colorize puts the colour in RGB and ink in alpha", () => {
  const out = colorize(new Uint8Array([255, 0, 100]), COLORS.blue);
  assert.deepEqual([...out.slice(0, 4)], [...COLORS.blue, 255]);
  assert.equal(out[7], 0);
  assert.equal(out[11], 100);
});

test("fitDims keeps aspect ratio and never upscales", () => {
  assert.deepEqual(fitDims(4000, 2000, 2048), [2048, 1024]);
  assert.deepEqual(fitDims(300, 200, 2048), [300, 200]);
});

test("inkFraction counts pixels above the threshold", () => {
  assert.equal(inkFraction(new Uint8Array([0, 255, 200, 10])), 0.5);
});
