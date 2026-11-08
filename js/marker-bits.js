// ArUco DICT_4X4_50 markers 0-3 as 6x6 cells; the outer ring is the black border. "1" = white cell.
// Verified against OpenCV's dictionary by tests/unit/markers.test.mjs.
export const MARKER_BITS = {
  0: ["000000", "010110", "001010", "000110", "000100", "000000"],
  1: ["000000", "000000", "011110", "010010", "010100", "000000"],
  2: ["000000", "000110", "000110", "000100", "011010", "000000"],
  3: ["000000", "010010", "010010", "001000", "001100", "000000"],
};
export const MARKER_IDS = [0, 1, 2, 3];

// Marker as an SVG string, `size` in any CSS unit (e.g. "5cm"), with a white quiet zone of one cell.
export function markerSVG(id, size) {
  const rows = MARKER_BITS[id];
  let rects = "";
  rows.forEach((row, y) => [...row].forEach((b, x) => {
    if (b === "0") rects += `<rect x="${x + 1}" y="${y + 1}" width="1" height="1"/>`;
  }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8" width="${size}" height="${size}" shape-rendering="crispEdges">` +
    `<rect width="8" height="8" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
}
