import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store, hashToken, passwordHash } from "../src/store.mjs";
import { createServer } from "../src/server.mjs";
import { totp } from "../src/totp.mjs";
import { resources } from "../src/schema.mjs";
test(
  "PostgreSQL/API: isolation, roles, CRUD, conflicts, audit and atomic imports",
  { skip: !process.env.NEXORA_INTEGRATION },
  async () => {
    const store = new Store(process.env.DATABASE_URL),
      a = "test-" + randomUUID(),
      b = "test-" + randomUUID(),
      u = randomUUID(),
      token = randomUUID();
    let server;
    try {
      await store.transaction(async () => {
        await store.db
          .prepare("INSERT INTO tenants VALUES(?,?)")
          .run(a, "Temporary integration workspace");
        await store.db
          .prepare("INSERT INTO tenants VALUES(?,?)")
          .run(b, "Temporary isolated workspace");
        await store.db
          .prepare(
            "INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)",
          )
          .run(
            u,
            u + "@example.test",
            "Integration test",
            passwordHash("Test password long enough"),
          );
        await store.db
          .prepare("INSERT INTO memberships VALUES(?,?,?)")
          .run(u, a, "admin");
        await store.db
          .prepare("INSERT INTO sessions VALUES(?,?,?)")
          .run(hashToken(token), u, Date.now() + 600000);
      });
      server = createServer(store, {
        allowedOrigins: ["http://localhost:5180"],
      });
      await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
      const base = "http://127.0.0.1:" + server.address().port;
      const api = async (
        path,
        method = "GET",
        body,
        tenant = a,
        authenticated = true,
      ) => {
        const r = await fetch(base + "/api" + path, {
          method,
          headers: {
            "Content-Type": "application/json",
            Origin: "http://localhost:5180",
            "X-Company-Id": tenant,
            ...(authenticated ? { Cookie: "nexora_session=" + token } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
        });
        return { status: r.status, data: await r.json() };
      };
      assert.equal(
        (await api("/masters/products", "GET", null, a, false)).status,
        401,
      );
      assert.equal(
        (await api("/masters/products", "GET", null, b)).status,
        403,
      );
      let res = await api("/masters/families", "POST", {
        data: { name: "Test grains", temperature: "AMBIENT" },
      });
      assert.equal(res.status, 201, JSON.stringify(res));
      const family = res.data.record;
      const foreign = await store.create(
        b,
        "families",
        { name: "Other family", temperature: "AMBIENT" },
        null,
      );
      assert.equal((await api("/masters/families/" + foreign.id)).status, 404);
      const product = {
        sku: "TEST-001",
        name: "Test rice",
        familyId: family.id,
        unit: "KG",
        temperature: "AMBIENT",
        stock: 10,
        price: 2,
        active: true,
        allergenStatus: "UNVERIFIED",
      };
      assert.equal(
        (
          await api("/masters/products", "POST", {
            data: { ...product, familyId: foreign.id },
          })
        ).status,
        400,
      );
      res = await api("/masters/products", "POST", { data: product });
      assert.equal(res.status, 201, JSON.stringify(res));
      const record = res.data.record;
      assert.equal(
        (await api("/masters/families/" + family.id, "DELETE", { version: 1 }))
          .status,
        409,
      );
      assert.equal(
        (await api("/masters/products", "POST", { data: product })).status,
        400,
      );
      res = await api("/masters/products/" + record.id, "PUT", {
        data: { ...product, stock: 5 },
        version: 1,
      });
      assert.equal(res.status, 200, JSON.stringify(res));
      assert.equal(res.data.record.data.stock, 5);
      assert.equal(res.data.record.version, 2);
      assert.equal(
        (
          await api("/masters/products/" + record.id, "PUT", {
            data: product,
            version: 1,
          })
        ).status,
        409,
      );
      res = await api("/imports/families", "POST", {
        format: "csv",
        content: "name,temperature\nNew family,AMBIENT\nNew family,AMBIENT",
        commit: true,
      });
      assert.equal(res.status, 422, JSON.stringify(res));
      assert.equal((await store.list(a, "families")).length, 1);
      res = await api("/imports/families", "POST", {
        format: "csv",
        content: "name,temperature\nImport family,AMBIENT",
        commit: false,
      });
      assert.equal(res.status, 200, JSON.stringify(res));
      assert.equal((await store.list(a, "families")).length, 1);
      res = await api("/imports/families", "POST", {
        format: "csv",
        content: "name,temperature\nImport family,AMBIENT",
        commit: true,
      });
      assert.equal(res.status, 200, JSON.stringify(res));
      assert.equal((await store.list(a, "families")).length, 2);
      const events = (await api("/audit")).data.events;
      assert(
        events.some((e) => e.action === "UPDATE" && e.record_id === record.id),
      );
      assert(!events.some((e) => e.tenant_id === b));
      const enroll = await api("/mfa/enroll", "POST", {});
      assert.equal(enroll.status, 200);
      const secret = enroll.data.secret;
      assert.equal(
        (await api("/mfa/enable", "POST", { code: totp(secret) })).status,
        200,
      );
      assert.equal(
        (
          await store.db
            .prepare("SELECT mfa_secret FROM users WHERE id=?")
            .get(u)
        ).mfa_secret.includes(secret),
        false,
      );
      const login = await api("/login", "POST", {
        email: u + "@example.test",
        password: "Test password long enough",
      });
      assert.equal(login.status, 401);
      await store.db
        .prepare("UPDATE users SET mfa_last_step=? WHERE id=?")
        .run(0, u);
      const verified = await api("/login", "POST", {
        email: u + "@example.test",
        password: "Test password long enough",
        code: totp(secret),
      });
      assert.equal(verified.status, 200);
      assert.equal(
        (
          await api("/login", "POST", {
            email: u + "@example.test",
            password: "Test password long enough",
            code: totp(secret),
          })
        ).status,
        401,
      );
      await store.db
        .prepare(
          "UPDATE memberships SET role=? WHERE user_id=? AND tenant_id=?",
        )
        .run("read_only", u, a);
      assert.equal(
        (await api("/masters/products", "POST", { data: product })).status,
        403,
      );
      assert.equal((await api("/audit")).status, 403);
      assert.equal((await api("/masters/products")).status, 200);
      const csrf = await fetch(base + "/api/logout", {
        method: "POST",
        headers: {
          Cookie: "nexora_session=" + token,
          "Content-Type": "application/json",
        },
        body: "{}",
      });
      assert.equal(csrf.status, 403);
      await store.db
        .prepare("UPDATE sessions SET expires=? WHERE user_id=?")
        .run(0, u);
      assert.equal((await api("/session")).status, 401);
    } finally {
      if (server) await new Promise((resolve) => server.close(resolve));
      await store.transaction(async () => {
        for (const r of Object.keys(resources))
          await store.query(
            `DELETE FROM bo."${r}" WHERE tenant_id = ANY($1::text[])`,
            [[a, b]],
          );
        for (const r of ["audit", "settings", "memberships"])
          await store.query(
            `DELETE FROM bo."${r}" WHERE tenant_id = ANY($1::text[])`,
            [[a, b]],
          );
        await store.query("DELETE FROM bo.sessions WHERE user_id=$1", [u]);
        await store.query("DELETE FROM bo.users WHERE id=$1", [u]);
        await store.query("DELETE FROM bo.tenants WHERE id = ANY($1::text[])", [
          [a, b],
        ]);
      });
      await store.close();
    }
  },
);
