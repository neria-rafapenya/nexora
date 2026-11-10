// Local-only development bridge. Never mount this server on a public interface.
import http from "node:http";
import { Store } from "../nexora-api/src/store.mjs";
const store = new Store(process.env.DATABASE_URL);
const origins = new Set(["http://localhost:5183", "http://127.0.0.1:5183"]);
http
  .createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.headers.origin;
    if (!origins.has(origin)) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    if (req.url !== "/centers" || req.method !== "GET") {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const rows = await store.list("workspace", "centers");
      if (rows.some((r) => !r.data.name.startsWith("Demo ")))
        throw Error("Demo data only");
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          centers: rows.map((r) => ({
            id: r.id,
            name: r.data.name,
            clientId: r.data.clientId,
          })),
        }),
      );
    } catch {
      res.writeHead(503);
      res.end(
        JSON.stringify({
          error: "No se pueden cargar los centros de demostración.",
        }),
      );
    }
  })
  .listen(5184, "127.0.0.1", () =>
    console.log("Local demo center bridge: http://127.0.0.1:5184"),
  );
