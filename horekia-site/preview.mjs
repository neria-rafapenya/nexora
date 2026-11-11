import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL("./dist/", import.meta.url));
const port = Number(process.env.SITE_PREVIEW_PORT ?? 5182);
const mime = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".ico": "image/x-icon",
  ".xml": "application/xml",
  ".txt": "text/plain",
};
http
  .createServer(async (req, res) => {
    try {
      if (req.url === "/_preview/mobile") {
        res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        res.end(
          '<!doctype html><html lang="es"><head><title>Cuinora · vista móvil local</title><meta name="robots" content="noindex"></head><body style="margin:0;background:#ddd"><iframe title="Vista móvil de Cuinora" src="/" width="390" height="844" style="border:0;background:white;display:block"></iframe></body></html>',
        );
        return;
      }
      const path = decodeURIComponent(
        new URL(req.url, "http://localhost").pathname,
      );
      let file = resolve(root, "." + path);
      if (file !== resolve(root) && !file.startsWith(root))
        throw Error("Invalid path");
      const st = await stat(file);
      if (st.isDirectory()) file = resolve(file, "index.html");
      const bytes = await readFile(file);
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] ?? "application/octet-stream",
      });
      res.end(bytes);
    } catch {
      res.writeHead(404, { "Content-Type": "text/html; charset=utf-8" });
      res.end(await readFile(resolve(root, "404.html")));
    }
  })
  .listen(port, "127.0.0.1", () =>
    console.log(`Local: http://127.0.0.1:${port}/`),
  );
