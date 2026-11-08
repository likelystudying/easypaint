// Ground truth for marker scenes, in screen px, from scenes.json.
import * as G from "../../js/geometry.js";
import { scenes } from "./scenes.mjs";

export const meta = scenes();

// Screen position of marker `id` corner i (TL, TR, BR, BL) for a pose, on a W x H screen.
export function markerCorner(pose, id, i, W, H) {
  const [x0, y0] = meta.markers[id], s = meta.markerSide;
  const board = [[x0, y0], [x0 + s, y0], [x0 + s, y0 + s], [x0, y0 + s]][i];
  const [vw, vh] = meta.frame;
  return G.apply(G.mul(G.coverMap(vw, vh, W, H), meta.poses[pose]), board);
}

// Screen-space transform taking pose `from` to pose `to`.
export function poseChange(from, to, W, H) {
  const [vw, vh] = meta.frame;
  const C = G.coverMap(vw, vh, W, H);
  return G.mul(C, G.mul(meta.poses[to], G.mul(G.inv(meta.poses[from]), G.inv(C))));
}

// Which pose a set of detected screen corners ({ id: [[x,y] x4] }) matches, or null.
export function whichPose(screen, W, H, tol = 4) {
  for (const pose of Object.keys(meta.poses)) {
    const ids = Object.keys(screen || {});
    if (!ids.length) return null;
    const ok = ids.every(id => screen[id].every((p, i) => {
      const t = markerCorner(pose, id, i, W, H);
      return Math.hypot(p[0] - t[0], p[1] - t[1]) <= tol;
    }));
    if (ok) return pose;
  }
  return null;
}
