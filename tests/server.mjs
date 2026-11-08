// Minimal static file server for tests. localhost counts as a secure context, so the camera API works.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT || 4173);
const types = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css", ".png": "image/png", ".jpg": "image/jpeg", ".json": "application/json", ".svg": "image/svg+xml",
};

http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  let p = path.normalize(path.join(root, decodeURIComponent(url.pathname)));
  if (!p.startsWith(root)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, "index.html");
  fs.readFile(p, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("not found"); }
    res.writeHead(200, { "content-type": types[path.extname(p)] || "application/octet-stream", "cache-control": "no-store" });
    res.end(buf);
  });
}).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://localhost:${port}`));
