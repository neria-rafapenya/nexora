import { handleOrders, startOrderJobs } from "./order-http.mjs";
import { canOrders } from "./order-schema.mjs";
import http from "node:http";
import { randomUUID, randomBytes } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Store, passwordHash, passwordMatches, hashToken } from "./store.mjs";
import { resources, roleLabels, can } from "./schema.mjs";
import { newSecret, verifyTotp, matchingStep } from "./totp.mjs";
import { seedCatalog } from "./seed.mjs";
import { convertRows, readImport } from "./imports.mjs";
const fail = (status, message) => {
  throw Object.assign(new Error(message), { status });
};
function credentials(b) {
  if (
    typeof b.email !== "string" ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)
  )
    fail(400, "A valid email is required");
  if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 120)
    fail(400, "Name is required");
  if (
    typeof b.password !== "string" ||
    b.password.length < 12 ||
    b.password.length > 128
  )
    fail(400, "Password must have 12–128 characters");
}
export async function initialize(store) {
  await store.migrate();
  await store.transaction(async () => {
    await store.lock("bootstrap");
    if (!(await store.db.prepare("SELECT 1 FROM tenants LIMIT 1").get())) {
      await store.db
        .prepare("INSERT INTO tenants VALUES(?,?)")
        .run("workspace", "Nexora Workspace");
      await seedCatalog(store, "workspace", null);
    }
  });
}
export function createServer(
  store,
  {
    allowedOrigins = [
      "http://127.0.0.1:5180",
      "http://localhost:5180",
      "http://127.0.0.1:5181",
    ],
    secure = false,
  } = {},
) {
  const attempts = new Map();
  const server = http.createServer(async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("Referrer-Policy", "no-referrer");
    function send(status, body) {
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(body));
    }
    try {
      const url = new URL(req.url, "http://localhost"),
        path = url.pathname,
        method = req.method;
      if (
        !["127.0.0.1", "localhost"].includes(
          (req.headers.host ?? "").split(":")[0],
        )
      )
        fail(403, "Invalid host");
      if (!path.startsWith("/api/")) fail(404, "Not found");
      if (
        ["POST", "PUT", "DELETE", "PATCH"].includes(method) &&
        !allowedOrigins.includes(req.headers.origin)
      )
        fail(403, "Invalid request origin");
      let body = {};
      if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
        let raw = "",
          size = 0;
        for await (const chunk of req) {
          size += chunk.length;
          if (size > 3_000_000) fail(413, "Request too large");
          raw += chunk.toString();
        }
        try {
          body = JSON.parse(raw || "{}");
        } catch {
          fail(400, "Invalid JSON");
        }
        if (!body || Array.isArray(body) || typeof body !== "object")
          fail(400, "Expected a JSON object");
      }
      if (path === "/api/health" && method === "GET")
        return send(200, { ok: true });
      if (path === "/api/setup" && method === "GET")
        return send(200, { required: !(await store.ready()) });
      const token = (req.headers.cookie ?? "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("nexora_session="))
        ?.slice(15);
      const session = token
        ? await store.db
            .prepare("SELECT * FROM sessions WHERE token_hash=? AND expires>?")
            .get(hashToken(token), Date.now())
        : null;
      const user = session ? await store.user(session.user_id) : null;
      const cookie = (value) =>
        res.setHeader(
          "Set-Cookie",
          `nexora_session=${value}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${value ? "28800" : "0"}${secure ? "; Secure" : ""}`,
        );
      async function startSession(id) {
        const value = randomBytes(32).toString("hex");
        await store.db
          .prepare("DELETE FROM sessions WHERE expires<=?")
          .run(Date.now());
        await store.db
          .prepare("INSERT INTO sessions VALUES(?,?,?)")
          .run(hashToken(value), id, Date.now() + 8 * 60 * 60 * 1000);
        cookie(value);
        return store.user(id);
      }
      if (path === "/api/setup" && method === "POST") {
        if (await store.ready()) fail(409, "Setup is already complete");
        credentials(body);
        const id = randomUUID();
        await store.transaction(async () => {
          await store.lock("setup");
          if (await store.ready()) fail(409, "Setup is already complete");
          await store.db
            .prepare(
              "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
            )
            .run(
              id,
              body.email.trim().toLowerCase(),
              body.name.trim(),
              passwordHash(body.password),
            );
          await store.db
            .prepare("INSERT INTO memberships VALUES(?,?,?)")
            .run(id, "workspace", "admin");
          if (body.companyName) {
            if (
              typeof body.companyName !== "string" ||
              body.companyName.length > 120
            )
              fail(400, "Invalid company name");
            await store.db
              .prepare("UPDATE tenants SET name=? WHERE id=?")
              .run(body.companyName.trim() || "Nexora Workspace", "workspace");
          }
          await store.log("workspace", id, "SETUP");
        });
        return send(201, { user: await startSession(id) });
      }
      if (path === "/api/login" && method === "POST") {
        const key = req.socket.remoteAddress;
        const recent = attempts.get(key) ?? { count: 0, until: 0 };
        if (recent.until > Date.now() && recent.count >= 5)
          fail(429, "Too many attempts. Try again in 15 minutes");
        if (recent.until <= Date.now()) {
          recent.count = 0;
          recent.until = Date.now() + 15 * 60 * 1000;
        }
        if (
          typeof body.password !== "string" ||
          body.password.length > 128 ||
          typeof body.email !== "string"
        )
          fail(400, "Invalid credentials");
        const u = await store.db
          .prepare("SELECT * FROM users WHERE email=?")
          .get(body.email.trim().toLowerCase());
        const matches = passwordMatches(
          body.password,
          u?.password_hash ??
            "00000000000000000000000000000000:" + "00".repeat(64),
        );
        if (!u || !matches) {
          recent.count++;
          attempts.set(key, recent);
          fail(401, "Invalid email or password");
        }
        if (u.mfa_secret) {
          const step = matchingStep(store.decrypt(u.mfa_secret), body.code);
          if (step === null || Number(u.mfa_last_step ?? 0) >= step) {
            recent.count++;
            attempts.set(key, recent);
            fail(401, "A valid authenticator code is required");
          }
          const updated = await store.query(
            "UPDATE bo.users SET mfa_last_step=$1 WHERE id=$2 AND (mfa_last_step IS NULL OR mfa_last_step<$1)",
            [step, u.id],
          );
          if (!updated.rowCount)
            fail(401, "Authenticator code was already used");
        }
        attempts.delete(key);
        for (const c of (await store.user(u.id)).companies)
          await store.log(c.id, u.id, "LOGIN");
        return send(200, { user: await startSession(u.id) });
      }
      if (!user) fail(401, "Sign in required");
      if (path === "/api/mfa" && method === "GET") {
        const u = await store.db
          .prepare("SELECT mfa_secret FROM users WHERE id=?")
          .get(user.id);
        return send(200, { enabled: !!u.mfa_secret });
      }
      if (path === "/api/mfa/enroll" && method === "POST") {
        const u = await store.db
          .prepare("SELECT mfa_secret FROM users WHERE id=?")
          .get(user.id);
        if (u.mfa_secret)
          fail(409, "Two-factor authentication is already enabled");
        const secret = newSecret();
        await store.db
          .prepare("UPDATE users SET mfa_pending=? WHERE id=?")
          .run(store.encrypt(secret), user.id);
        return send(200, { secret });
      }
      if (path === "/api/mfa/enable" && method === "POST") {
        const u = await store.db
          .prepare("SELECT mfa_pending,mfa_secret FROM users WHERE id=?")
          .get(user.id);
        if (
          u.mfa_secret ||
          !u.mfa_pending ||
          !verifyTotp(store.decrypt(u.mfa_pending), body.code)
        )
          fail(400, "Invalid authenticator code");
        await store.transaction(async () => {
          await store.db
            .prepare(
              "UPDATE users SET mfa_secret=mfa_pending,mfa_pending=NULL,mfa_last_step=? WHERE id=?",
            )
            .run(
              matchingStep(store.decrypt(u.mfa_pending), body.code),
              user.id,
            );
          await store.db
            .prepare("DELETE FROM sessions WHERE user_id=? AND token_hash<>?")
            .run(user.id, hashToken(token));
          for (const c of user.companies)
            await store.log(c.id, user.id, "ENABLE_MFA");
        });
        return send(200, { ok: true });
      }
      if (path === "/api/session" && method === "GET")
        return send(200, { user });
      if (path === "/api/logout" && method === "POST") {
        await store.db
          .prepare("DELETE FROM sessions WHERE token_hash=?")
          .run(hashToken(token));
        cookie("");
        return send(200, { ok: true });
      }
      if (path === "/api/companies" && method === "POST") {
        if (!user.companies.some((c) => c.role === "admin"))
          fail(403, "Administrator access required");
        if (
          typeof body.name !== "string" ||
          !body.name.trim() ||
          body.name.length > 120
        )
          fail(400, "Company name is required");
        const id = randomUUID();
        await store.transaction(async () => {
          await store.db
            .prepare("INSERT INTO tenants VALUES(?,?)")
            .run(id, body.name.trim());
          await store.db
            .prepare("INSERT INTO memberships VALUES(?,?,?)")
            .run(user.id, id, "admin");
          await store.log(id, user.id, "CREATE_COMPANY");
        });
        return send(201, { user: await store.user(user.id) });
      }
      const tenant = String(req.headers["x-company-id"] ?? "");
      const membership = user.companies.find((c) => c.id === tenant);
      if (!membership) fail(403, "Company access denied");
      const role = membership.role;
      if (
        await handleOrders({
          store,
          path,
          method,
          body,
          url,
          tenant,
          role,
          user,
          send,
        })
      )
        return;
      if (path === "/api/schema" && method === "GET")
        return send(200, {
          resources: Object.fromEntries(
            Object.entries(resources).filter(([r]) => can(role, r)),
          ),
          permissions: Object.fromEntries(
            Object.keys(resources).map((r) => [
              r,
              { read: can(role, r), write: can(role, r, true) },
            ]),
          ),
          roles: roleLabels,
          orderPermissions: {
            read: canOrders(role),
            write: canOrders(role, true),
          },
        });
      if (path === "/api/dashboard" && method === "GET")
        return send(200, {
          counts: Object.fromEntries(
            await Promise.all(
              Object.keys(resources)
                .filter((r) => can(role, r))
                .map(async (r) => [r, (await store.list(tenant, r)).length]),
            ),
          ),
        });
      if (path === "/api/audit" && method === "GET") {
        if (role !== "admin") fail(403, "Administrator access required");
        return send(200, {
          events: await store.db
            .prepare(
              "SELECT a.*,u.name AS actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.tenant_id=? ORDER BY a.at DESC,a.id DESC LIMIT 200",
            )
            .all(tenant),
        });
      }
      if (path === "/api/users") {
        if (role !== "admin") fail(403, "Administrator access required");
        if (method === "GET")
          return send(200, {
            users: await store.db
              .prepare(
                "SELECT u.id,u.name,u.email,m.role FROM users u JOIN memberships m ON m.user_id=u.id WHERE m.tenant_id=?",
              )
              .all(tenant),
          });
        if (method === "POST") {
          credentials(body);
          if (!roleLabels[body.role]) fail(400, "Invalid role");
          const id = randomUUID();
          await store.transaction(async () => {
            let existing = await store.db
              .prepare("SELECT id FROM users WHERE email=?")
              .get(body.email.trim().toLowerCase());
            if (existing)
              fail(409, "Email already exists; use a different account");
            await store.db
              .prepare(
                "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
              )
              .run(
                id,
                body.email.trim().toLowerCase(),
                body.name.trim(),
                passwordHash(body.password),
              );
            await store.db
              .prepare("INSERT INTO memberships VALUES(?,?,?)")
              .run(id, tenant, body.role);
            await store.log(tenant, user.id, "CREATE_USER", "users", id, null, {
              email: body.email,
              role: body.role,
            });
          });
          return send(201, { ok: true });
        }
      }
      const userMatch = path.match(/^\/api\/users\/([a-zA-Z0-9-]+)$/);
      if (userMatch && ["PUT", "DELETE"].includes(method)) {
        if (role !== "admin") fail(403, "Administrator access required");
        const target = userMatch[1];
        await store.transaction(async () => {
          await store.lock(tenant);
          const m = await store.db
            .prepare(
              "SELECT role FROM memberships WHERE user_id=? AND tenant_id=?",
            )
            .get(target, tenant);
          if (!m) fail(404, "User not found");
          if (target === user.id)
            fail(409, "You cannot change your own access");
          if (method === "DELETE") {
            await store.db
              .prepare(
                "DELETE FROM memberships WHERE user_id=? AND tenant_id=?",
              )
              .run(target, tenant);
            await store.log(
              tenant,
              user.id,
              "REMOVE_USER_ACCESS",
              "users",
              target,
              { role: m.role },
            );
          } else {
            if (!roleLabels[body.role]) fail(400, "Invalid role");
            await store.db
              .prepare(
                "UPDATE memberships SET role=? WHERE user_id=? AND tenant_id=?",
              )
              .run(body.role, target, tenant);
            await store.log(
              tenant,
              user.id,
              "CHANGE_ROLE",
              "users",
              target,
              { role: m.role },
              { role: body.role },
            );
          }
        });
        return send(200, { ok: true });
      }
      if (path === "/api/settings") {
        if (role !== "admin") fail(403, "Administrator access required");
        if (method === "GET")
          return send(200, {
            settings: (
              await store.db
                .prepare("SELECT data FROM settings WHERE tenant_id=?")
                .get(tenant)
            )?.data ?? { confidenceThreshold: 0.85, dailyAiBudget: 10 },
          });
        if (method === "PUT") {
          if (
            typeof body.confidenceThreshold !== "number" ||
            body.confidenceThreshold < 0 ||
            body.confidenceThreshold > 1 ||
            typeof body.dailyAiBudget !== "number" ||
            body.dailyAiBudget < 0
          )
            fail(400, "Invalid settings");
          await store.transaction(async () => {
            await store.db
              .prepare(
                "INSERT INTO settings VALUES(?,?) ON CONFLICT(tenant_id) DO UPDATE SET data=excluded.data",
              )
              .run(tenant, JSON.stringify(body));
            await store.log(
              tenant,
              user.id,
              "UPDATE_SETTINGS",
              null,
              null,
              null,
              body,
            );
          });
          return send(200, { ok: true });
        }
      }
      const importMatch = path.match(/^\/api\/imports\/([a-zA-Z]+)$/);
      if (importMatch && method === "POST") {
        const r = importMatch[1];
        if (!resources[r] || !can(role, r, true))
          fail(403, "Write access denied");
        const input = convertRows(r, await readImport(body));
        if (
          r === "productAllergens" &&
          role !== "quality" &&
          input.some((x) => x.validated)
        )
          fail(403, "Only the quality role can validate allergens");
        const rows = [],
          errors = [];
        // Validation and commit both run atomically. A preview always rolls back.
        try {
          await store.transaction(async () => {
            await store.lock(tenant);
            for (const [i, data] of input.entries()) {
              await store.query("SAVEPOINT import_row");
              try {
                rows.push(await store.create(tenant, r, data, user.id));
                await store.query("RELEASE SAVEPOINT import_row");
              } catch (e) {
                await store.query("ROLLBACK TO SAVEPOINT import_row");
                errors.push({
                  row: i + 2,
                  error:
                    e.code === "23505" ? "Duplicate unique value" : e.message,
                });
              }
            }
            if (errors.length || !body.commit)
              throw Object.assign(new Error("Preview"), { preview: true });
          });
        } catch (e) {
          if (!e.preview) throw e;
        }
        return send(errors.length ? 422 : 200, {
          valid: errors.length === 0,
          count: input.length,
          errors,
          committed: !errors.length && body.commit === true,
        });
      }
      const match = path.match(
        /^\/api\/masters\/([a-zA-Z]+)(?:\/([a-zA-Z0-9-]+))?$/,
      );
      if (match) {
        const [, r, id] = match;
        if (!resources[r]) fail(404, "Unknown resource");
        if (!can(role, r, method !== "GET")) fail(403, "Access denied");
        if (
          r === "productAllergens" &&
          body.data?.validated &&
          role !== "quality"
        )
          fail(403, "Only the quality role can validate allergens");
        if (method === "GET") {
          if (id) {
            const record = await store.get(tenant, r, id);
            if (!record) fail(404, "Record not found");
            return send(200, { record });
          }
          let rows = await store.list(tenant, r);
          const q = (url.searchParams.get("q") ?? "").toLowerCase().trim();
          if (q) {
            const words = q.split(/\s+/);
            rows = rows
              .map((row) => {
                const text = Object.values(row.data).join(" ").toLowerCase();
                const score = words.reduce(
                  (s, w) => s + (text.includes(w) ? 1 : similarity(w, text)),
                  0,
                );
                return { ...row, score };
              })
              .filter((row) => row.score >= Math.min(0.35, words.length))
              .sort((a, b) => b.score - a.score);
          }
          for (const key of [
            "familyId",
            "productId",
            "temperature",
            "supplierId",
            "active",
            "segment",
          ])
            if (url.searchParams.has(key))
              rows = rows.filter(
                (row) => String(row.data[key]) === url.searchParams.get(key),
              );
          return send(200, { records: rows });
        }
        if (method === "POST" && !id)
          return send(201, {
            record: await store.transaction(
              async () => await store.create(tenant, r, body.data, user.id),
            ),
          });
        if (method === "PUT" && id)
          return send(200, {
            record: await store.transaction(
              async () =>
                await store.update(
                  tenant,
                  r,
                  id,
                  body.data,
                  body.version,
                  user.id,
                ),
            ),
          });
        if (method === "DELETE" && id) {
          await store.transaction(
            async () =>
              await store.remove(tenant, r, id, body.version, user.id),
          );
          return send(200, { ok: true });
        }
      }
      fail(404, "Endpoint not found");
    } catch (e) {
      const status = e.status ?? 400;
      const msg =
        e.code === "23505"
          ? "A unique value already exists"
          : e.code
            ? "Database operation failed"
            : e.message;
      send(status, { error: msg });
    }
  });
  return server;
}
function similarity(query, text) {
  const tokens = text.split(/\W+/);
  const grams = (s) =>
    new Set(
      [...`  ${s} `].slice(0, -2).map((_, i) => `  ${s} `.slice(i, i + 3)),
    );
  const a = grams(query);
  return Math.max(
    0,
    ...tokens.map((t) => {
      const b = grams(t);
      return (2 * [...a].filter((x) => b.has(x)).length) / (a.size + b.size);
    }),
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const connection = process.env.DATABASE_URL;
  if (!connection)
    throw new Error("DATABASE_URL is required in nexora-api/.env");
  const store = new Store(connection);
  await initialize(store);
  const stopOrderJobs = startOrderJobs(store);
  const server = createServer(store, {
    secure: process.env.COOKIE_SECURE === "true",
  });
  server.listen(Number(process.env.PORT ?? 5181), "127.0.0.1", () =>
    console.log("Nexora API: http://127.0.0.1:" + (process.env.PORT ?? 5181)),
  );
  for (const signal of ["SIGINT", "SIGTERM"])
    process.on(signal, () =>
      server.close(async () => {
        stopOrderJobs();
        await store.close();
        process.exit(0);
      }),
    );
}
