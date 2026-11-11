// Local-only bridge: never publish this server. Database credentials stay in this process.
import http from "node:http";
import { Store } from "../nexora-api/src/store.mjs";
const store = new Store(process.env.DATABASE_URL);
const origins = new Set(["http://localhost:5183", "http://127.0.0.1:5183"]);
http
  .createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    const origin = req.headers.origin;
    if (
      !origins.has(origin) ||
      !["localhost:5184", "127.0.0.1:5184"].includes(req.headers.host)
    ) {
      res.writeHead(403);
      res.end();
      return;
    }
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Vary", "Origin");
    if (req.method === "OPTIONS") {
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.writeHead(204);
      res.end();
      return;
    }
    try {
      const url = new URL(req.url, "http://localhost");
      if (
        /^\/api\/client\/(login|session|logout|catalog|assistant\/(status|interpret))$/.test(
          url.pathname,
        ) &&
        ["GET", "POST"].includes(req.method)
      ) {
        const chunks = [];
        let size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > (url.pathname.endsWith("/interpret") ? 64000 : 32000)) {
            res.writeHead(413);
            res.end();
            return;
          }
          chunks.push(chunk);
        }
        const cookie =
          (req.headers.cookie ?? "")
            .split(";")
            .map((x) => x.trim())
            .find((x) => x.startsWith("horekia_buyer_session=")) ?? "";
        const remote = await fetch(
          "https://backoffice.cuinora.com" + url.pathname + url.search,
          {
            method: req.method,
            redirect: "error",
            signal: AbortSignal.timeout(
              url.pathname.endsWith("/interpret") ? 60000 : 20000,
            ),
            headers: {
              Origin: "https://backoffice.cuinora.com",
              "Content-Type": "application/json",
              Cookie: cookie,
            },
            ...(req.method === "POST" ? { body: Buffer.concat(chunks) } : {}),
          },
        );
        const cookies = remote.headers.getSetCookie();
        if (cookies.length)
          res.setHeader(
            "Set-Cookie",
            cookies.map((c) => c.replace(/;\s*Secure/gi, "")),
          );
        res.writeHead(remote.status, { "Content-Type": "application/json" });
        res.end(Buffer.from(await remote.arrayBuffer()));
        return;
      }
      if (req.url !== "/centers" || req.method !== "GET") {
        res.writeHead(404);
        res.end();
        return;
      }
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
            companyId: "workspace",
          })),
        }),
      );
    } catch {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          error: "No se puede contactar con el servicio. Inténtalo de nuevo.",
        }),
      );
    }
  })
  .listen(5184, "127.0.0.1", () =>
    console.log("Local app bridge: http://127.0.0.1:5184"),
  );
