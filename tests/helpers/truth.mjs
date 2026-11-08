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

// True real-world size (cm) of the drawing given its 4 screen corners, for a pose.
export function boardSizeCm(q, pose, W, H) {
  const [vw, vh] = meta.frame;
  const toBoard = G.inv(G.mul(G.coverMap(vw, vh, W, H), meta.poses[pose]));
  const b = q.map(p => G.apply(toBoard, p));
  const mid = (a, c) => [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  const d = (a, c) => Math.hypot(c[0] - a[0], c[1] - a[1]) / meta.pxPerCm;
  return { width: d(mid(b[0], b[3]), mid(b[1], b[2])), height: d(mid(b[0], b[1]), mid(b[3], b[2])) };
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
