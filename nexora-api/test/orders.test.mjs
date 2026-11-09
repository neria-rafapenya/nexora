import { test } from "node:test";
import assert from "node:assert/strict";
import { OrdersService } from "../src/orders.mjs";
import { resources, validate } from "../src/schema.mjs";
import { orderResources, canOrders } from "../src/order-schema.mjs";
import {
  parseMockOrder,
  deliveryProblems,
  csvCell,
  messageHash,
} from "../src/order-rules.mjs";
const defs = { ...resources, ...orderResources };
class MemoryStore {
  constructor() {
    this.rows = Object.fromEntries(Object.keys(defs).map((r) => [r, []]));
    this.counter = 0;
    this.depth = 0;
    this.events = [];
  }
  async lock() {}
  async log(...args) {
    this.events.push(args);
  }
  async transaction(fn) {
    if (this.depth) return fn();
    const snapshot = structuredClone(this.rows),
      events = structuredClone(this.events);
    this.depth++;
    try {
      return await fn();
    } catch (e) {
      this.rows = snapshot;
      this.events = events;
      throw e;
    } finally {
      this.depth--;
    }
  }
  async list(t, r) {
    return this.rows[r]
      .filter((x) => x.tenant === t)
      .map((x) => structuredClone(x));
  }
  async get(t, r, id) {
    return (await this.list(t, r)).find((x) => x.id === id) ?? null;
  }
  async create(t, r, input, actor) {
    const data = validate(r, input, defs);
    for (const [k, f] of Object.entries(defs[r].fields))
      if (f.resource) {
        const ids = Array.isArray(data[k]) ? data[k] : data[k] ? [data[k]] : [];
        for (const id of ids)
          assert(
            await this.get(t, f.resource, id),
            "Invalid reference " + f.resource,
          );
      }
    const row = {
      id: r + "-" + ++this.counter,
      tenant: t,
      data,
      version: 1,
      createdAt: new Date().toISOString(),
    };
    this.rows[r].push(row);
    await this.log(t, actor, "CREATE", r, row.id);
    return structuredClone(row);
  }
  async update(t, r, id, input, version, actor) {
    const row = this.rows[r].find((x) => x.tenant === t && x.id === id);
    if (!row) throw new Error("Record not found");
    if (row.version !== version)
      throw Object.assign(new Error("Record changed. Reload before saving."), {
        status: 409,
      });
    row.data = validate(r, input, defs);
    row.version++;
    await this.log(t, actor, "UPDATE", r, id);
    return structuredClone(row);
  }
  async remove(t, r, id, version, actor) {
    const row = await this.get(t, r, id);
    assert.equal(row.version, version);
    this.rows[r] = this.rows[r].filter((x) => x.id !== id);
    await this.log(t, actor, "DELETE", r, id);
  }
}
async function fixture() {
  const s = new MemoryStore(),
    tenant = "t";
  const cat = await s.create(
    tenant,
    "mainCategories",
    { name: "Test Category", active: true },
    null,
  );
  const family = await s.create(
    tenant,
    "families",
    { name: "Test Family", temperature: "AMBIENT", mainCategoryId: cat.id },
    null,
  );
  const product = await s.create(
    tenant,
    "products",
    {
      sku: "SKU-A",
      name: "Test Rice",
      familyId: family.id,
      temperature: "AMBIENT",
      unit: "KG",
      stock: 10,
      price: 2.5,
      active: true,
      allergenStatus: "UNVERIFIED",
    },
    null,
  );
  const client = await s.create(
    tenant,
    "clients",
    {
      name: "Test Client",
      segment: "SCHOOL",
      orderEmail: "orders@example.test",
      active: true,
    },
    null,
  );
  const center = await s.create(
    tenant,
    "centers",
    {
      name: "Test Center",
      clientId: client.id,
      deliveryDays: [],
      closedDates: [],
    },
    null,
  );
  return {
    s,
    service: new OrdersService(s, {
      allowMockClient: true,
      erpProvider: "mock",
    }),
    tenant,
    product,
    client,
    center,
  };
}
async function proposal(f, body = "SKU-A | 2 | KG") {
  const m = await f.service.createMessage("t", {
    channel: "EMAIL",
    sender: "orders@example.test",
    subject: "Test message",
    body,
    clientId: f.client.id,
    centerId: f.center.id,
    requestedDate: "2030-01-07",
  });
  const o = await f.service.processMessage("t", m.id, m.version);
  return { message: m, ...(await f.service.view("t", o.id)) };
}
function review(view, f) {
  return {
    version: view.order.version,
    clientId: f.client.id,
    centerId: f.center.id,
    deliveryDate: "2030-01-07",
    lines: view.lines.map((l) => ({
      id: l.id,
      version: l.version,
      productId: l.data.productId,
      quantity: l.data.quantity,
      unit: l.data.unit,
      reviewAccepted: true,
    })),
  };
}
test("mock parsing flags unknown products, units, stock and never auto-approves", async () => {
  const f = await fixture(),
    products = await f.s.list("t", "products");
  const lines = parseMockOrder(
    "SKU-A | 2 | KG\n2 kg Test Rice\nUnknown item",
    products,
  );
  assert.equal(lines[0].confidence, 1);
  assert.equal(lines[1].confidence, 0.97);
  assert.equal(lines[2].state, "NO_MATCH");
  assert(lines.every((l) => !l.reviewAccepted));
  assert.equal(
    parseMockOrder("SKU-A | 2 | BOX", products)[0].state,
    "UNIT_MISMATCH",
  );
  assert.equal(
    parseMockOrder("SKU-A | 11 | KG", products)[0].state,
    "OUT_OF_STOCK",
  );
});
test("messages deduplicate and processing is idempotent", async () => {
  const f = await fixture(),
    v = await proposal(f);
  await assert.rejects(
    () =>
      f.service.createMessage("t", {
        channel: "EMAIL",
        sender: "orders@example.test",
        subject: "Test message",
        body: "SKU-A | 2 | KG",
        clientId: f.client.id,
        centerId: f.center.id,
        requestedDate: "2030-01-07",
      }),
    (e) => e.status === 409,
  );
  assert.equal(
    (await f.service.processMessage("t", v.message.id, 1)).id,
    v.order.id,
  );
  assert.equal((await f.s.list("t", "orders")).length, 1);
  assert.equal((await f.s.list("t", "aiOrderRuns")).length, 1);
});
async function ready(f, body) {
  const v = await proposal(f, body);
  await f.service.submitOriginal(
    "t",
    v.order.id,
    v.order.version,
    "operator",
    "Original email reference",
  );
  const fresh = await f.service.view("t", v.order.id);
  return f.service.saveReview("t", v.order.id, review(fresh, f), "operator");
}
test("approval requires client acceptance, freezes revision and never reserves ERP stock", async () => {
  const f = await fixture(),
    v = await proposal(f);
  await assert.rejects(
    () => f.service.approve("t", v.order.id, v.order.version, null),
    /Human review/,
  );
  await assert.rejects(
    () => f.service.approve("t", v.order.id, v.order.version, "operator"),
    /Customer acceptance/,
  );
  const submitted = await f.service.submitOriginal(
    "t",
    v.order.id,
    v.order.version,
    "operator",
    "Original email",
  );
  await assert.rejects(
    () => f.service.approve("t", v.order.id, submitted.version, "operator"),
    /Review every line/,
  );
  const fresh = await f.service.view("t", v.order.id),
    saved = await f.service.saveReview(
      "t",
      v.order.id,
      review(fresh, f),
      "operator",
    );
  const approved = await f.service.approve(
    "t",
    v.order.id,
    saved.order.version,
    "operator",
  );
  assert.equal(approved.data.state, "APPROVED");
  assert.equal(approved.data.totalCents, 500);
  assert.equal((await f.s.get("t", "products", f.product.id)).data.stock, 10);
  assert.equal((await f.s.list("t", "usualBaskets")).length, 0);
  const result = await f.service.export(
    "t",
    approved.id,
    approved.version,
    "operator",
  );
  assert(result.content.includes("SKU-A"));
  assert(result.content.includes("5.00"));
  const latest = await f.s.get("t", "orders", approved.id);
  assert.equal(latest.data.state, "APPROVED");
  assert.equal(latest.data.erpState, "NOT_SENT");
  assert(latest.data.exportedAt);
  await assert.rejects(
    () =>
      f.service.saveReview(
        "t",
        latest.id,
        { ...review(saved, f), version: latest.version },
        "operator",
      ),
    /Only draft/,
  );
});
test("duplicate product quantities are accumulated and stock rolls back on failure", async () => {
  const f = await fixture(),
    v = await proposal(f, "SKU-A | 6 | KG\nSKU-A | 6 | KG");

  const saved = await f.service.saveReview(
    "t",
    v.order.id,
    review(v, f),
    "operator",
  );
  await assert.rejects(
    () => f.service.prepareTerms("t", saved.order, true),
    /duplicate product lines/,
  );
  assert.equal((await f.s.get("t", "products", f.product.id)).data.stock, 10);
  assert.equal(
    (await f.s.get("t", "orders", v.order.id)).data.state,
    "IN_REVIEW",
  );
});
test("cancellation before ERP leaves inventory unchanged", async () => {
  const f = await fixture(),
    v = await ready(f);
  const approved = await f.service.approve(
    "t",
    v.order.id,
    v.order.version,
    "operator",
  );
  const cancelled = await f.service.cancel(
    "t",
    approved.id,
    approved.version,
    "operator",
  );
  assert.equal(cancelled.data.state, "CANCELLED");
  assert.equal((await f.s.get("t", "products", f.product.id)).data.stock, 10);
  await assert.rejects(
    () => f.service.cancel("t", cancelled.id, cancelled.version, "operator"),
    /current state/,
  );
});
test("stale versions, tenant mismatch, wrong client and price changes are rejected", async () => {
  const f = await fixture(),
    v = await proposal(f);
  await assert.rejects(
    () => f.service.view("other", v.order.id),
    /Record not found/,
  );
  await assert.rejects(
    () =>
      f.service.saveReview(
        "t",
        v.order.id,
        { ...review(v, f), version: 0 },
        "operator",
      ),
    /Record changed/,
  );
  const other = await f.s.create(
    "t",
    "clients",
    { name: "Other", segment: "HOTEL", active: true },
    null,
  );
  await assert.rejects(
    () =>
      f.service.saveReview(
        "t",
        v.order.id,
        { ...review(v, f), clientId: other.id },
        "operator",
      ),
    /does not belong/,
  );
  const saved = await f.service.saveReview(
    "t",
    v.order.id,
    review(v, f),
    "operator",
  );
  await f.s.update(
    "t",
    "products",
    f.product.id,
    { ...f.product.data, price: 3 },
    f.product.version,
    "operator",
  );
  await assert.rejects(
    () => f.service.prepareTerms("t", saved.order, true),
    /prices changed/,
  );
  assert.equal((await f.s.get("t", "products", f.product.id)).data.stock, 10);
});
test("CSV formulas are escaped, delivery closures checked and writes permissioned", () => {
  assert.equal(csvCell("=2+2"), '"\'=2+2"');
  assert.deepEqual(
    deliveryProblems(
      { data: { deliveryDays: ["MON"], closedDates: ["2030-01-08"] } },
      "2030-01-08",
    ),
    ["DELIVERY_DAY", "CLOSED_CENTER"],
  );
  assert(canOrders("operations_orders", true));
  assert(canOrders("commercial"));
  assert(!canOrders("commercial", true));
  assert(!canOrders("quality"));
});
test("deduplication distinguishes delivery dates and centers", () => {
  const d = {
    channel: "EMAIL",
    sender: "x@test.test",
    subject: "Order",
    body: "SKU-A | 1 | KG",
    requestedDate: "2030-01-07",
    centerId: "a",
  };
  assert.notEqual(
    messageHash(d),
    messageHash({ ...d, requestedDate: "2030-01-08" }),
  );
  assert.notEqual(messageHash(d), messageHash({ ...d, centerId: "b" }));
});

test("HTTP scopes companies, enforces roles and prevents generic CRUD from bypassing order states", async () => {
  const { createServer } = await import("../src/server.mjs");
  const { hashToken } = await import("../src/store.mjs");
  const f = await fixture();
  let role = "operations_orders";
  const token = "local-test-token";
  f.s.db = {
    prepare: () => ({
      get: async (hash) =>
        hash === hashToken(token) ? { user_id: "operator" } : null,
    }),
  };
  f.s.user = async () => ({
    id: "operator",
    name: "Test operator",
    companies: [{ id: "t", name: "Test", role }],
  });
  f.s.ready = async () => true;
  const server = createServer(f.s, {
    allowedOrigins: ["http://localhost:5180"],
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = "http://127.0.0.1:" + server.address().port;
  const api = async (
    path,
    method = "GET",
    body,
    company = "t",
    authenticated = true,
  ) => {
    const response = await fetch(base + "/api" + path, {
      method,
      headers: {
        Origin: "http://localhost:5180",
        "Content-Type": "application/json",
        "X-Company-Id": company,
        ...(authenticated ? { Cookie: "nexora_session=" + token } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    return { status: response.status, data: await response.json() };
  };
  try {
    assert.equal((await api("/orders", "GET", null, "t", false)).status, 401);
    assert.equal((await api("/orders", "GET", null, "other")).status, 403);
    assert.equal((await api("/masters/orders")).status, 404);
    assert.equal((await api("/orders/catalog")).status, 200);
    const message = await api("/order-inbox", "POST", {
      channel: "EMAIL",
      sender: "orders@example.test",
      body: "SKU-A | 2 | KG",
      clientId: f.client.id,
      centerId: f.center.id,
      requestedDate: "2030-01-07",
    });
    assert.equal(message.status, 201, JSON.stringify(message));
    const proposal = await api(
      "/order-inbox/" + message.data.record.id + "/process",
      "POST",
      { version: 1 },
    );
    assert.equal(proposal.status, 200, JSON.stringify(proposal));
    const view = await api("/orders/" + proposal.data.record.id);
    assert.equal(view.data.lines[0].data.reviewAccepted, false);
    assert.equal(
      (
        await api(
          "/orders/" + proposal.data.record.id + "/mock-client-decision",
          "POST",
          {
            version: view.data.order.version,
            revision: 1,
            decision: "ACCEPTED",
            evidence: "forged",
          },
        )
      ).status,
      403,
    );
    role = "commercial";
    assert.equal((await api("/orders")).status, 200);
    assert.equal((await api("/orders/catalog")).status, 200);
    assert.equal((await api("/orders", "POST", {})).status, 403);
    role = "quality";
    assert.equal((await api("/orders")).status, 403);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

const identity = (f) => ({
  kind: "MOCK",
  tenantId: "t",
  clientId: f.client.id,
  subject: "mock-client",
  actorId: "operator",
});
async function decision(f, o, choice = "ACCEPTED", id = identity(f)) {
  return f.service.customerDecision(
    "t",
    o.id,
    {
      version: o.version,
      revision: o.data.commercialRevision,
      decision: choice,
      evidence: "Demonstration response",
    },
    id,
  );
}
test("changed terms invalidate client consent and rejected revisions cannot bypass acceptance", async () => {
  const f = await fixture();
  let v = await ready(f);
  const input = review(v, f);
  input.lines[0].quantity = 3;
  v = await f.service.saveReview("t", v.order.id, input, "operator");
  assert.equal(v.order.data.commercialRevision, 2);
  await assert.rejects(
    () => f.service.approve("t", v.order.id, v.order.version, "operator"),
    /Customer acceptance/,
  );
  await assert.rejects(
    () =>
      f.service.submitOriginal(
        "t",
        v.order.id,
        v.order.version,
        "operator",
        "Another email",
      ),
    /already been recorded/,
  );
  let pending = await f.service.requestAcceptance(
    "t",
    v.order.id,
    v.order.version,
    "operator",
  );
  await assert.rejects(
    () =>
      decision(f, pending, "ACCEPTED", { ...identity(f), clientId: "other" }),
    /cannot decide/,
  );
  await assert.rejects(
    () =>
      decision(f, pending, "ACCEPTED", { ...identity(f), tenantId: "other" }),
    /identity/,
  );
  await assert.rejects(
    () =>
      decision(f, pending, "ACCEPTED", {
        ...identity(f),
        kind: "CUSTOMER",
        centerIds: [],
      }),
    /cannot decide/,
  );
  const rejected = await decision(f, pending, "REJECTED");
  await assert.rejects(
    () => f.service.approve("t", rejected.id, rejected.version, "operator"),
    /Customer acceptance/,
  );
  pending = await f.service.requestAcceptance(
    "t",
    rejected.id,
    rejected.version,
    "operator",
  );
  f.service.options.allowMockClient = false;
  await assert.rejects(() => decision(f, pending), /disabled/);
  f.service.options.allowMockClient = true;
  await assert.rejects(
    () =>
      f.service.customerDecision(
        "t",
        pending.id,
        {
          version: pending.version,
          revision: 1,
          decision: "ACCEPTED",
          evidence: "old",
        },
        identity(f),
      ),
    /obsolete/,
  );
  const accepted = await decision(f, pending);
  const approved = await f.service.approve(
    "t",
    accepted.id,
    accepted.version,
    "operator",
  );
  assert.equal(approved.data.approvedRevision, 2);
  const reopened = await f.service.reopen(
    "t",
    approved.id,
    approved.version,
    "operator",
  );
  v = await f.service.view("t", reopened.id);
  const changed = review(v, f);
  changed.lines[0].quantity = 4;
  v = await f.service.saveReview("t", v.order.id, changed, "operator");
  assert.equal(v.order.data.customerAcceptedRevision, null);
});
test("rejection of the original revision overrides its inbound acceptance", async () => {
  const f = await fixture(),
    v = await ready(f);
  const pending = await f.service.requestAcceptance(
    "t",
    v.order.id,
    v.order.version,
    "operator",
  );
  const rejected = await decision(f, pending, "REJECTED");
  await assert.rejects(
    () => f.service.approve("t", rejected.id, rejected.version, "operator"),
    /Customer acceptance/,
  );
});
test("ERP lost acknowledgement retries use the same durable idempotency key", async () => {
  const f = await fixture(),
    v = await ready(f);
  let o = await f.service.approve("t", v.order.id, v.order.version, "operator");
  const d = await f.service.queueErp("t", o.id, o.version, "operator");
  o = await f.s.get("t", "orders", o.id);
  assert.equal(o.data.erpState, "PENDING");
  assert.equal(
    (await f.service.queueErp("t", o.id, o.version, "operator")).id,
    d.id,
  );
  await assert.rejects(
    () => f.service.cancel("t", o.id, o.version, "operator"),
    /ERP delivery/,
  );
  await assert.rejects(
    () => f.service.reopen("t", o.id, o.version, "operator"),
    /ERP delivery/,
  );
  o = await f.service.dispatchErp(
    "t",
    o.id,
    o.version,
    "operator",
    "TIMEOUT_AFTER_ACCEPT",
  );
  assert.equal(o.data.erpState, "ERROR");
  assert.equal((await f.s.list("t", "mockErpReceipts")).length, 1);
  assert.equal((await f.s.list("t", "usualBaskets")).length, 0);
  const receipt = (await f.s.list("t", "mockErpReceipts"))[0];
  o = await f.service.dispatchErp("t", o.id, o.version, "operator");
  assert.equal(o.data.erpState, "ACCEPTED");
  assert.equal(o.data.externalOrderId, receipt.data.externalId);
  assert.equal((await f.s.list("t", "erpAttempts")).length, 2);
  assert.equal((await f.s.list("t", "mockErpReceipts")).length, 1);
  assert.equal(
    (await f.s.list("t", "usualBaskets"))[0].data.averageQuantity,
    2,
  );
  assert.equal((await f.s.get("t", "products", f.product.id)).data.stock, 10);
  await f.service.dispatchErp("t", o.id, o.version, "operator");
  assert.equal((await f.s.list("t", "erpAttempts")).length, 2);
  const change = await f.service.requestErpCancellation(
    "t",
    o.id,
    o.version,
    "operator",
    "Customer request",
  );
  assert.equal(change.data.state, "PENDING");
  assert.equal(
    (
      await f.service.requestErpCancellation(
        "t",
        o.id,
        o.version,
        "operator",
        "Retry",
      )
    ).id,
    change.id,
  );
  assert.equal((await f.s.get("t", "orders", o.id)).data.erpState, "ACCEPTED");
});
test("ERP rejection and timeout do not count as purchases; unconfigured connector cannot send", async () => {
  const f = await fixture(),
    v = await ready(f);
  let o = await f.service.approve("t", v.order.id, v.order.version, "operator");
  await f.service.queueErp("t", o.id, o.version, "operator");
  o = await f.s.get("t", "orders", o.id);
  f.service.options.erpProvider = "unconfigured";
  await assert.rejects(
    () => f.service.dispatchErp("t", o.id, o.version, "operator"),
    /not configured/,
  );
  f.service.options.erpProvider = "mock";
  for (const scenario of ["REJECT", "TIMEOUT"]) {
    o = await f.service.dispatchErp("t", o.id, o.version, "operator", scenario);
    assert.equal(o.data.erpState, "ERROR");
    assert.equal((await f.s.list("t", "mockErpReceipts")).length, 0);
  }
  assert.equal((await f.s.list("t", "usualBaskets")).length, 0);
});

test("commercial hashes survive PostgreSQL JSON object key ordering", async () => {
  const { snapshotHash } = await import("../src/workflow-rules.mjs");
  assert.equal(
    snapshotHash({ z: [{ b: 2, a: 1 }], a: 3 }),
    snapshotHash({ a: 3, z: [{ a: 1, b: 2 }] }),
  );
});

test("in-flight ERP sends cannot overlap and retain one durable delivery", async () => {
  const f = await fixture(),
    v = await ready(f);
  let o = await f.service.approve("t", v.order.id, v.order.version, "operator");
  await f.service.queueErp("t", o.id, o.version, "operator");
  o = await f.s.get("t", "orders", o.id);
  let release, entered;
  const started = new Promise((r) => (entered = r));
  f.service.options.erpAdapter = {
    send: async () => {
      entered();
      await new Promise((r) => (release = r));
      return { accepted: true, externalId: "MOCK-CONCURRENT" };
    },
  };
  const first = f.service.dispatchErp("t", o.id, o.version, "operator");
  await started;
  const sending = await f.s.get("t", "orders", o.id);
  await assert.rejects(
    () => f.service.dispatchErp("t", o.id, sending.version, "operator"),
    /already in progress/,
  );
  release();
  const result = await first;
  assert.equal(result.data.erpState, "ACCEPTED");
  assert.equal((await f.s.list("t", "erpAttempts")).length, 1);
});
