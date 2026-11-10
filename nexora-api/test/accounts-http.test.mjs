import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.mjs";
import { hashToken } from "../src/store.mjs";
test("avatar images use authenticated company-scoped URLs, private responses and current membership; profile writes reject passwords", async () => {
  const binary = Buffer.from("mock-webp"),
    self = {
      id: "actor",
      name: "Admin",
      email: "admin@example.test",
      companies: [{ id: "company", name: "Company", role: "admin" }],
    },
    store = {
      db: {
        prepare: (sql) => ({
          get: async (key) =>
            sql.includes('FROM bo."sessions"') || sql.includes("FROM sessions")
              ? key === hashToken("test")
                ? { user_id: "actor" }
                : null
              : null,
        }),
      },
      user: async () => self,
      query: async (sql, args = []) => {
        if (sql.startsWith("SELECT 1 FROM bo.memberships"))
          return {
            rowCount: args[0] === "company" && args[1] === "actor" ? 1 : 0,
            rows: [],
          };
        if (sql.startsWith("SELECT u.*,m.role"))
          return {
            rows: args[1] === "target" ? [{ id: "target" }] : [],
            rowCount: args[1] === "target" ? 1 : 0,
          };
        if (sql.startsWith("SELECT avatar FROM"))
          return {
            rows: [{ avatar: { storageKey: "private-reference" } }],
            rowCount: 1,
          };
        throw Error("Unexpected query");
      },
      files: {
        read: async (id, namespace) => {
          assert.equal(id, "target");
          assert.equal(namespace, "userAvatars");
          return binary;
        },
      },
    };
  const server = createServer(store, {
    allowedOrigins: ["http://localhost:5180"],
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const headers = {
    Cookie: "nexora_session=test",
    Origin: "http://localhost:5180",
    "Content-Type": "application/json",
  };
  try {
    const avatar = await fetch(
      base + "/api/users/target/avatar?company=company",
      { headers },
    );
    assert.equal(avatar.status, 200);
    assert.equal(avatar.headers.get("content-type"), "image/webp");
    assert.equal(avatar.headers.get("cache-control"), "no-store");
    assert.deepEqual(Buffer.from(await avatar.arrayBuffer()), binary);
    assert.equal(
      (
        await fetch(base + "/api/users/target/avatar?company=other", {
          headers,
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/users/absent/avatar?company=company", {
          headers,
        })
      ).status,
      404,
    );
    assert.equal(
      (await fetch(base + "/api/users/target/avatar?company=company")).status,
      401,
    );
    assert.equal((await fetch(base + "/api/profile")).status, 401);
    const forbidden = await fetch(base + "/api/users/target", {
      method: "PUT",
      headers: { ...headers, "X-Company-Id": "company" },
      body: JSON.stringify({
        role: "quality",
        accessVersion: 1,
        password: "forbidden",
      }),
    });
    assert.equal(forbidden.status, 400);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("login commits before responding and rejects pending or membership-less accounts without issuing sessions", async () => {
  const { passwordHash } = await import("../src/store.mjs");
  const account = {
    id: "login-fixture",
    email: "login@example.test",
    name: "Fixture",
    password_hash: passwordHash("Existing test password"),
    password_ready: true,
    mfa_secret: null,
  };
  const sessions = new Map();
  let memberships = [{ id: "company", name: "Company", role: "admin" }],
    committed = false;
  const store = {
    transaction: async (fn) => {
      committed = false;
      const result = await fn();
      await new Promise((r) => setTimeout(r, 20));
      committed = true;
      return result;
    },
    lock: async (key) => assert.equal(key, "user-administration"),
    log: async () => {},
    user: async () => ({
      id: account.id,
      name: account.name,
      email: account.email,
      companies: memberships,
    }),
    db: {
      prepare: (sql) => ({
        get: async (key) =>
          sql.startsWith("SELECT * FROM users")
            ? key === account.email
              ? account
              : null
            : sessions.get(key),
        run: async (...args) => {
          if (sql.startsWith("INSERT INTO sessions"))
            sessions.set(args[0], { user_id: args[1], expires: args[2] });
          return { rowCount: 1 };
        },
      }),
    },
  };
  const server = createServer(store, {
    allowedOrigins: ["http://localhost:5180"],
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  const login = (password) =>
    fetch(base + "/api/login", {
      method: "POST",
      headers: {
        Origin: "http://localhost:5180",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email: account.email, password }),
    });
  try {
    let response = await login("Existing test password");
    assert.equal(response.status, 200);
    assert.equal(committed, true);
    assert(response.headers.get("set-cookie").includes("HttpOnly"));
    assert.equal(sessions.size, 1);
    assert(!(await response.text()).includes("password_hash"));
    response = await login("wrong");
    assert.equal(response.status, 401);
    assert.equal(response.headers.get("set-cookie"), null);
    account.password_ready = false;
    assert.equal((await login("Existing test password")).status, 401);
    account.password_ready = true;
    memberships = [];
    assert.equal((await login("Existing test password")).status, 401);
    assert.equal(sessions.size, 1);
  } finally {
    await new Promise((r) => server.close(r));
  }
});
