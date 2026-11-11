import { test } from "node:test";
import assert from "node:assert/strict";
import {
  Contacts,
  contactData,
  contactClientKey,
  handleContacts,
} from "../src/contacts.mjs";
const input = () => ({
  name: "Test person",
  email: "test@example.invalid",
  company: "Test company",
  phone: "",
  sector: "CATERING",
  message: "I would like a demonstration.",
  website: "",
  privacyAcknowledged: true,
  token: "x",
});
function fixture() {
  const rows = [],
    logs = [];
  const s = {
    transaction: async (fn) => fn(),
    lock: async () => {},
    log: async (...args) => logs.push(args),
    query: async (sql, args = []) => {
      if (sql.startsWith("SELECT id,payload_hash"))
        return { rows: rows.filter((r) => r.submission_hash === args[0]) };
      if (sql.startsWith("INSERT INTO bo.contact_leads")) {
        rows.push({
          id: args[0],
          tenant_id: args[1],
          data: args[2],
          submission_hash: args[3],
          payload_hash: args[4],
          state: "NEW",
          version: 1,
          created_at: new Date(),
          updated_at: new Date(),
        });
        return { rowCount: 1 };
      }
      if (sql.startsWith("SELECT 1 FROM bo.memberships"))
        return { rows: [], rowCount: args[1] === "admin" ? 1 : 0 };
      if (sql.startsWith("SELECT * FROM bo.contact_leads"))
        return {
          rows: rows.filter(
            (r) => r.tenant_id === args[0] && (!args[1] || r.id === args[1]),
          ),
        };
      throw Error("Unexpected SQL");
    },
  };
  let now = Date.now();
  const service = new Contacts(
    s,
    { enabled: true, tenant: "company", origin: "https://www.cuinora.com" },
    () => now,
  );
  return { service, rows, logs, advance: (n) => (now += n) };
}
test("public contact validates privacy, lengths, sector and honeypot; preserves text without executing it", () => {
  assert.equal(
    contactData({ ...input(), email: "UPPER@example.invalid" }).email,
    "upper@example.invalid",
  );
  assert.equal(
    contactData({ ...input(), message: "<script>alert(1)</script>" }).message,
    "<script>alert(1)</script>",
  );
  for (const patch of [
    { privacyAcknowledged: false },
    { website: "spam" },
    { name: "" },
    { email: "bad" },
    { message: "short" },
    { message: "x".repeat(3001) },
    { company: "x".repeat(161) },
    { sector: "ADMIN" },
    { role: "admin" },
  ])
    assert.throws(
      () => contactData({ ...input(), ...patch }),
      (e) => e.status === 400,
    );
});
test("contact is disabled by default; requires canonical origin, bound unexpired nonce, and limits abuse", async () => {
  assert.throws(
    () => new Contacts({}, { enabled: false }).issue("ip"),
    (e) => e.status === 503,
  );
  const { service, advance } = fixture();
  assert.throws(
    () => service.issue("ip", "https://evil.test"),
    (e) => e.status === 403,
  );
  const token = service.issue("ip").token;
  await assert.rejects(
    () =>
      service.submit({ ...input(), token }, "other", "https://www.cuinora.com"),
    (e) => e.status === 400,
  );
  await assert.rejects(
    () => service.submit({ ...input(), token }, "ip", "https://evil.test"),
    (e) => e.status === 403,
  );
  advance(600001);
  await assert.rejects(
    () =>
      service.submit({ ...input(), token }, "ip", "https://www.cuinora.com"),
    (e) => e.status === 400,
  );
  for (let i = 0; i < 19; i++) service.issue("ip");
  assert.throws(
    () => service.issue("ip"),
    (e) => e.status === 429,
  );
});
test("submission retries are idempotent, data is private and audit contains no message or email", async () => {
  const { service, rows, logs } = fixture();
  const token = service.issue("ip").token;
  const result = await service.submit(
    { ...input(), token },
    "ip",
    "https://www.cuinora.com",
  );
  assert.deepEqual(
    await service.submit(
      { ...input(), token },
      "ip",
      "https://www.cuinora.com",
    ),
    result,
  );
  assert.equal(rows.length, 1);
  assert.equal(rows[0].tenant_id, "company");
  assert(!JSON.stringify(rows).includes(token));
  assert(!JSON.stringify(logs).includes("test@example.invalid"));
  assert(!JSON.stringify(logs).includes("demonstration"));
  assert(!JSON.stringify(result).includes("Test person"));
  await assert.rejects(
    () =>
      service.submit(
        { ...input(), message: "Different content", token },
        "ip",
        "https://www.cuinora.com",
      ),
    (e) => e.status === 409,
  );
  for (let i = 0; i < 2; i++) {
    const token = service.issue("ip").token;
    await service.submit(
      { ...input(), token },
      "ip",
      "https://www.cuinora.com",
    );
  }
  await assert.rejects(
    () =>
      service.submit(
        { ...input(), token: service.issue("ip").token },
        "ip",
        "https://www.cuinora.com",
      ),
    (e) => e.status === 429,
  );
});
test("only current administrators of the receiving company can read leads; proxy IP is trusted only from loopback", async () => {
  const { service } = fixture();
  for (const role of [
    "quality",
    "commercial",
    "read_only",
    "operations_orders",
    "nutrition_menus",
  ])
    await assert.rejects(
      () => service.list("company", role, "admin"),
      (e) => e.status === 403,
    );
  await assert.rejects(
    () => service.list("other", "admin", "admin"),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => service.list("company", "admin", "demoted"),
    (e) => e.status === 403,
  );
  await assert.rejects(
    () => handleContacts({ service, path: "/api/contacts", method: "GET" }),
    (e) => e.status === 401,
  );
  assert.equal(
    contactClientKey({
      headers: { "x-forwarded-for": "8.8.8.8" },
      socket: { remoteAddress: "203.0.113.1" },
    }),
    "203.0.113.1",
  );
  assert.equal(
    contactClientKey({
      headers: { "x-forwarded-for": "203.0.113.1" },
      socket: { remoteAddress: "127.0.0.1" },
    }),
    "203.0.113.1",
  );
  assert.deepEqual(await service.list("company", "admin", "admin"), {
    records: [],
  });
});

test("center count is stored and rejects malformed or out-of-range input", () => {
  assert.equal(contactData({ ...input(), centerCount: 4 }).centerCount, 4);
  for (const centerCount of [0, -1, 1.5, 10001, "4", null]) {
    assert.throws(() => contactData({ ...input(), centerCount }));
  }
});
