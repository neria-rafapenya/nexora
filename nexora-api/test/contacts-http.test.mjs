import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "../src/server.mjs";
test("public contact works without a session only at its configured origin; admin inbox remains private and oversized requests are rejected", async () => {
  const previous = {
    enabled: process.env.CONTACT_FORM_ENABLED,
    origin: process.env.CONTACT_SITE_ORIGIN,
  };
  process.env.CONTACT_FORM_ENABLED = "true";
  process.env.CONTACT_SITE_ORIGIN = "https://www.horekia.com";
  const rows = [];
  const store = {
    transaction: async (fn) => fn(),
    lock: async () => {},
    log: async () => {},
    query: async (sql, args = []) => {
      if (sql.startsWith("SELECT id,payload_hash"))
        return { rows: rows.filter((r) => r.submission_hash === args[0]) };
      if (sql.startsWith("INSERT INTO bo.contact_leads")) {
        rows.push({
          id: args[0],
          submission_hash: args[3],
          payload_hash: args[4],
        });
        return { rowCount: 1 };
      }
      throw Error("Unexpected query");
    },
  };
  const server = createServer(store, {
    allowedOrigins: ["https://www.horekia.com"],
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = "http://127.0.0.1:" + server.address().port;
  try {
    const tokenResponse = await fetch(base + "/api/public/contact-token");
    assert.equal(tokenResponse.status, 200);
    assert.equal(tokenResponse.headers.get("cache-control"), "no-store");
    assert.equal(tokenResponse.headers.get("set-cookie"), null);
    const { token } = await tokenResponse.json();
    const body = {
      name: "HTTP fixture",
      email: "test@example.invalid",
      company: "Example",
      phone: "",
      sector: "CATERING",
      message: "Please arrange a demo.",
      website: "",
      privacyAcknowledged: true,
      token,
    };
    const post = (origin, payload = body) =>
      fetch(base + "/api/public/contact", {
        method: "POST",
        headers: { Origin: origin, "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    const result = await post("https://www.horekia.com");
    assert.equal(result.status, 201);
    assert.equal((await result.json()).ok, true);
    assert.equal(rows.length, 1);
    assert.equal((await post("https://www.horekia.com")).status, 201);
    assert.equal(rows.length, 1);
    assert.equal((await post("https://evil.test")).status, 403);
    assert.equal(
      (
        await post("https://www.horekia.com", {
          ...body,
          message: "x".repeat(17000),
        })
      ).status,
      413,
    );
    assert.equal((await fetch(base + "/api/contacts")).status, 401);
  } finally {
    await new Promise((r) => server.close(r));
    for (const [key, value] of Object.entries({
      CONTACT_FORM_ENABLED: previous.enabled,
      CONTACT_SITE_ORIGIN: previous.origin,
    }))
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
  }
});
