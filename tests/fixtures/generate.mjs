// Generates synthetic whiteboard camera videos (.y4m, which Chrome's fake camera can play)
// plus scenes.json with the exact geometry used, so integration tests have ground truth.
//
// Board coordinates: 10 board px = 1 cm. Board is 100 x 70 cm.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadCVNode } from "../helpers/cv-node.mjs";
import { MARKER_BITS } from "../../js/marker-bits.js";
import * as G from "../../js/geometry.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, "out");
const FW = 640, FH = 480, FPS = 10;
const PX_PER_CM = 10, BW = 1000, BH = 700;
const MARKER_CM = 6, MSIDE = MARKER_CM * PX_PER_CM;            // black square side in board px
const MARKERS = { 0: [40, 40], 1: [900, 40], 2: [900, 600], 3: [40, 600] }; // top-left of black square
const BISON = { x: 200, y: 140, w: 600, h: 600 * 801 / 1142 };  // where the guide sits on the board

const boardQuad = [[0, 0], [BW, 0], [BW, BH], [0, BH]];
const quadA = [[48, 52], [598, 40], [612, 440], [36, 452]];
const POSE_A = G.homography(boardQuad, quadA);
const c = [FW / 2, FH / 2];
const nudge = G.mul(G.translate(22, -14), G.mul(G.translate(c[0], c[1]), G.mul(G.rotate(3 * Math.PI / 180), G.translate(-c[0], -c[1]))));
const POSE_B = G.normalize(G.mul(nudge, POSE_A));
const POSES = { A: POSE_A, B: POSE_B };

const SCENES = {
  plain: { frames: 10, pose: () => "A" },
  moving: { frames: 40, pose: f => (f < 20 ? "A" : "B") },
  "drawn-half": { frames: 10, pose: () => "A", drawn: 0.5 },
  glare: { frames: 10, pose: () => "A", glare: { cx: 420, cy: 210, rx: 110, ry: 70 } },
  dim: { frames: 10, pose: () => "A", dim: true },
};

function readPGM(file) {
  const buf = fs.readFileSync(file);
  const header = buf.toString("latin1", 0, 64).match(/^P5\s+(\d+)\s+(\d+)\s+(\d+)\s/);
  const [, w, h] = header.map(Number);
  return { w, h, data: buf.subarray(header[0].length) };
}

let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

function renderBoard(cv, scene, bison) {
  const board = new cv.Mat(BH, BW, cv.CV_8UC1, new cv.Scalar(236));
  const d = board.data;
  for (let i = 0; i < d.length; i++) d[i] = Math.max(0, Math.min(255, 236 + Math.round((rnd() - 0.5) * 8)));
  // ArUco markers with a one-cell white quiet zone
  const cell = MSIDE / 6;
  for (const [id, [mx, my]] of Object.entries(MARKERS)) {
    cv.rectangle(board, new cv.Point(mx - cell, my - cell), new cv.Point(mx + MSIDE + cell - 1, my + MSIDE + cell - 1), new cv.Scalar(255), -1);
    MARKER_BITS[id].forEach((row, y) => [...row].forEach((b, x) => {
      if (b === "0") cv.rectangle(board, new cv.Point(mx + x * cell, my + y * cell), new cv.Point(mx + (x + 1) * cell - 1, my + (y + 1) * cell - 1), new cv.Scalar(20), -1);
    }));
  }
  // Strokes the user has already drawn: the guide's ink, dark marker colour, left part only
  let drawnPx = 0, guidePx = 0;
  for (let y = 0; y < bison.h; y++) {
    for (let x = 0; x < bison.w; x++) {
      const v = bison.data[y * bison.w + x];
      const ink = Math.max(0, Math.min(1, (235 - v) / 175)) >= 0.5;
      if (!ink) continue;
      guidePx++;
      if (scene.drawn && x < bison.w * scene.drawn) {
        drawnPx++;
        const by = Math.round(BISON.y) + y, bx = BISON.x + x;
        for (let dy = 0; dy <= 1; dy++) for (let dx = 0; dx <= 1; dx++) d[(by + dy) * BW + bx + dx] = 35; // marker is a bit wider than the guide
      }
    }
  }
  return { board, drawnFraction: scene.drawn ? drawnPx / guidePx : 0 };
}

function renderFrame(cv, board, pose, scene) {
  const frame = new cv.Mat();
  const M = cv.matFromArray(3, 3, cv.CV_64F, pose);
  cv.warpPerspective(board, frame, M, new cv.Size(FW, FH), cv.INTER_AREA, cv.BORDER_CONSTANT, new cv.Scalar(90));
  M.delete();
  const f = frame.data;
  if (scene.dim) for (let i = 0; i < f.length; i++) f[i] = 105 + Math.round((f[i] - 90) * 0.22);
  if (scene.glare) {
    const { cx, cy, rx, ry } = scene.glare;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) {
      const r = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (r < 1.6) f[y * FW + x] = r < 1 ? 255 : Math.max(f[y * FW + x], Math.round(255 - (r - 1) * 200));
    }
  }
  const rgb = new cv.Mat(); cv.cvtColor(frame, rgb, cv.COLOR_GRAY2RGB);
  const yuv = new cv.Mat(); cv.cvtColor(rgb, yuv, cv.COLOR_RGB2YUV_I420);
  const out = Buffer.from(yuv.data);
  frame.delete(); rgb.delete(); yuv.delete();
  return out;
}

async function main() {
  const cv = await loadCVNode();
  fs.mkdirSync(OUT, { recursive: true });
  const bison = readPGM(path.join(here, "static/bison-600.pgm"));
  const meta = {
    frame: [FW, FH], fps: FPS, pxPerCm: PX_PER_CM, board: [BW, BH], markerCm: MARKER_CM,
    markers: MARKERS, markerSide: MSIDE, bison: BISON, poses: POSES, scenes: {},
  };
  for (const [name, scene] of Object.entries(SCENES)) {
    const file = path.join(OUT, `${name}.y4m`);
    const { board, drawnFraction } = renderBoard(cv, scene, bison);
    const cache = {};
    const parts = [Buffer.from(`YUV4MPEG2 W${FW} H${FH} F${FPS}:1 Ip A1:1 C420jpeg\n`)];
    const schedule = [];
    for (let i = 0; i < scene.frames; i++) {
      const p = scene.pose(i);
      schedule.push(p);
      cache[p] = cache[p] || renderFrame(cv, board, POSES[p], scene);
      parts.push(Buffer.from("FRAME\n"), cache[p]);
    }
    board.delete();
    fs.writeFileSync(file, Buffer.concat(parts));
    meta.scenes[name] = { file, schedule, drawnFraction, glare: scene.glare || null, dim: !!scene.dim };
  }
  fs.writeFileSync(path.join(OUT, "scenes.json"), JSON.stringify(meta, null, 1));
  console.log(`fixtures: ${Object.keys(SCENES).length} scenes written to ${path.relative(process.cwd(), OUT)}`);
}

main().catch(e => { console.error(e); process.exit(1); });
