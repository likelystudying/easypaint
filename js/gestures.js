// Pure gesture maths: one finger moves, two fingers move + scale + rotate.
// Each move is computed from the gesture's start positions, so there is no drift.
import { mul, translate, similarityFromPairs, pairRotationDeg, snapRotation, approxScale } from "./geometry.js";

export const MIN_WIDTH_PX = 40;       // overlay can't shrink below this width on screen
export const MAX_SCALE_FACTOR = 40;   // nor grow beyond this many screen widths
export const ROT_DEADZONE_DEG = 2;    // twists smaller than this during a pinch are ignored
export const SNAP_DEG = 3;            // once rotating, snap to level within this many degrees

// startH: overlay H when the current set of fingers went down.
// p0: finger positions at that moment, p1: current positions (same order, 1 or 2 points).
// g: per-gesture state object (mutated). g.rotUnlocked becomes true once the user twists
// past the dead zone; until then rotation is ignored so a pinch never disturbs a careful
// alignment (for example a perspective warp onto a tilted board).
// Returns the new H, or null if the result would be too small or too large.
export function gestureH(startH, p0, p1, imgW, imgH, screenW, g = {}) {
  let H;
  if (p0.length === 1) {
    H = mul(translate(p1[0][0] - p0[0][0], p1[0][1] - p0[0][1]), startH);
  } else {
    const da = pairRotationDeg(p0[0], p0[1], p1[0], p1[1]);
    if (!g.rotUnlocked && Math.abs(da) >= ROT_DEADZONE_DEG) g.rotUnlocked = true;
    H = mul(similarityFromPairs(p0[0], p0[1], p1[0], p1[1], !!g.rotUnlocked), startH);
    if (g.rotUnlocked) H = snapRotation(H, imgW, imgH, SNAP_DEG);
  }
  const widthPx = approxScale(H, imgW, imgH) * imgW;
  if (widthPx < MIN_WIDTH_PX || widthPx > screenW * MAX_SCALE_FACTOR) return null;
  return H;
}
