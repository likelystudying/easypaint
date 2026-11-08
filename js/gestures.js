// Pure gesture maths: one finger moves, two fingers move + scale + rotate.
// Each move is computed from the gesture's start positions, so there is no drift.
import { mul, translate, similarityFromPairs, snapRotation, approxScale } from "./geometry.js";

export const MIN_WIDTH_PX = 40;       // overlay can't shrink below this width on screen
export const MAX_SCALE_FACTOR = 40;   // nor grow beyond this many screen widths

// startH: overlay H when the current set of fingers went down.
// p0: finger positions at that moment, p1: current positions (same order, 1 or 2 points).
export function gestureH(startH, p0, p1, imgW, imgH, screenW) {
  let H;
  if (p0.length === 1) {
    H = mul(translate(p1[0][0] - p0[0][0], p1[0][1] - p0[0][1]), startH);
  } else {
    H = mul(similarityFromPairs(p0[0], p0[1], p1[0], p1[1]), startH);
    H = snapRotation(H, imgW, imgH, 3);
  }
  const widthPx = approxScale(H, imgW, imgH) * imgW;
  if (widthPx < MIN_WIDTH_PX || widthPx > screenW * MAX_SCALE_FACTOR) return null; // reject, keep previous
  return H;
}
