import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".mjs": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function contentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

export async function startStaticServer({ host = "127.0.0.1", port = 8080, rootDir = "web" } = {}) {
  const root = path.resolve(process.cwd(), rootDir);
  const server = createServer(async (req, res) => {
    try {
      const rawPath = (req.url || "/").split("?")[0];
      const normalized = decodeURIComponent(rawPath === "/" ? "/index.html" : rawPath);
      const filePath = path.resolve(root, `.${normalized}`);
      if (!filePath.startsWith(root)) {
        res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Forbidden");
        return;
      }
      const data = await readFile(filePath);
      res.writeHead(200, { "Content-Type": contentType(filePath) });
      res.end(data);
    } catch {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not Found");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, () => resolve());
  });

  return {
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}
