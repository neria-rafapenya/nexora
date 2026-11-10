import { test } from "node:test";
import assert from "node:assert/strict";
import { MenuStore } from "./helpers/menu-store.mjs";
import { WasteService } from "../src/waste.mjs";
import { businessDate } from "../src/document-rules.mjs";
async function fixture() {
  const s = new MenuStore(),
    svc = new WasteService(s),
    t = "t",
    add = (r, d) => s.create(t, r, d, null),
    category = await add("mainCategories", { name: "Food", active: true }),
    family = await add("families", {
      name: "Food",
      temperature: "AMBIENT",
      mainCategoryId: category.id,
    }),
    product = await add("products", {
      sku: "TEST",
      name: "Rice",
      familyId: family.id,
      unit: "KG",
      temperature: "AMBIENT",
      price: 2.5,
      stock: 100,
      active: true,
      allergenStatus: "UNVERIFIED",
    }),
    client = await add("clients", {
      name: "Test School",
      segment: "SCHOOL",
      active: true,
    }),
    center = await add("centers", { name: "Test Center", clientId: client.id }),
    diet = await add("diets", { code: "STANDARD", name: "Standard" });
  await add("centerDiners", {
    centerId: center.id,
    dietId: diet.id,
    service: "LUNCH",
    count: 100,
  });
  const input = {
    centerId: center.id,
    date: "2020-01-01",
    service: "LUNCH",
    menuPlanId: null,
    dietId: diet.id,
    sourceReference: "TEST observation",
    notes: "Test only",
    isMock: false,
    sourceKind: "PRODUCT",
    productId: product.id,
    recipeVersionId: null,
    reason: "OVERPRODUCTION",
    quantity: 2,
    unit: "KG",
    lot: "TEST-LOT",
    useBy: "2099-01-01",
    traceabilityReference: "TEST batch trace",
    destinationKind: "DISPOSAL",
    destinationTarget: "Test disposal point",
  };
  return { s, svc, t, product, client, center, diet, input };
}
async function save(f, extra = {}, key = "test_request_001") {
  return f.svc.saveMeasurement(
    "t",
    "events",
    null,
    { ...f.input, ...extra, createKey: key },
    "operator",
  );
}
async function record(f, row, type = "events") {
  return f.svc.measurementAction(
    "t",
    type,
    row.id,
    { version: row.version, confirmed: true },
    "record",
    "operations_orders",
    "operator",
  );
}
async function action(f, row, action, role = "operations_orders", extra = {}) {
  return f.svc.measurementAction(
    "t",
    "events",
    row.id,
    {
      version: row.version,
      confirmed: true,
      evidence: "TEST evidence",
      reason: "TEST reason",
      ...extra,
    },
    action,
    role,
    "operator",
  );
}
test("measurement snapshots preserve costs, never reserve stock and idempotent retries do not double count", async () => {
  const f = await fixture(),
    draft = await save(f);
  assert.equal(draft.data.estimatedCostCents, 500);
  assert.equal((await save(f)).id, draft.id);
  await assert.rejects(
    () => save(f, { quantity: 3 }),
    (e) => e.status === 409,
  );
  assert.equal((await f.svc.report("t")).totals.records, 0);
  const confirmed = await record(f, draft);
  assert.equal(confirmed.data.destinationState, "READY");
  await f.s.update(
    "t",
    "products",
    f.product.id,
    { ...f.product.data, price: 9 },
    f.product.version,
    null,
  );
  assert.equal(
    (await f.s.get("t", "wasteEvents", draft.id)).data.estimatedCostCents,
    500,
  );
  assert.equal((await f.s.get("t", "products", f.product.id)).data.stock, 100);
  assert.equal((await f.s.list("t", "orders")).length, 0);
  await assert.rejects(
    () =>
      f.svc.saveMeasurement(
        "t",
        "events",
        confirmed.id,
        { ...f.input, quantity: 3, version: confirmed.version },
        "operator",
      ),
    /immutable/,
  );
});
test("destinations are not reported as executed until evidence is recorded; voiding preserves history and excludes totals", async () => {
  const f = await fixture();
  let event = await record(f, await save(f));
  let report = await f.svc.report("t");
  assert.equal(report.quantities[0].discarded, 0);
  assert.equal(report.quantities[0].pending, 2);
  event = await action(f, event, "complete");
  report = await f.svc.report("t");
  assert.equal(report.quantities[0].discarded, 2);
  await assert.rejects(() => action(f, event, "complete"), /authorized/);
  event = await action(f, event, "void");
  assert.equal(event.data.state, "VOID");
  assert.equal(event.data.completion.evidence, "TEST evidence");
  assert.equal((await f.svc.report("t")).totals.records, 0);
});
test("donations and returns require Quality, valid traceability and execution evidence; rejection can route to disposal", async () => {
  const f = await fixture();
  let event = await record(
    f,
    await save(f, {
      destinationKind: "DONATION_CANDIDATE",
      destinationTarget: "Test recipient",
    }),
  );
  assert.equal(event.data.destinationState, "PENDING_QUALITY");
  await assert.rejects(
    () => action(f, event, "approve", "admin"),
    (e) => e.status === 403,
  );
  await assert.rejects(() => action(f, event, "complete"), /authorized/);
  event = await action(f, event, "approve", "quality");
  assert.equal((await f.svc.report("t")).quantities[0].donated, 0);
  event = await action(f, event, "complete");
  assert.equal((await f.svc.report("t")).quantities[0].donated, 2);
  let returned = await record(
    f,
    await save(
      f,
      { destinationKind: "RETURN", destinationTarget: "Supplier desk" },
      "return_request_001",
    ),
  );
  returned = await action(f, returned, "reject", "quality");
  returned = await action(f, returned, "discard");
  assert.equal(returned.data.destinationKind, "DISPOSAL");
  assert(returned.data.qualityDecision.reject);
  returned = await action(f, returned, "complete");
  assert.equal((await f.svc.report("t")).quantities[0].discarded, 2);
});
test("unsafe causes, expired donation review, future observations, precision and unit mismatches are rejected", async () => {
  const f = await fixture();
  await assert.rejects(
    () => save(f, { destinationKind: "DONATION_CANDIDATE", reason: "EXPIRY" }),
    /cannot be proposed/,
  );
  await assert.rejects(
    () => save(f, { destinationKind: "RETURN", lot: "" }),
    /traceability/,
  );
  await assert.rejects(() => save(f, { date: "2099-01-01" }), /non-future/);
  await assert.rejects(() => save(f, { unit: "BOX" }), /sales unit/);
  await assert.rejects(
    () => save(f, { quantity: 0.0001 }),
    /positive measured/,
  );
  const expired = await record(
    f,
    await save(f, {
      destinationKind: "DONATION_CANDIDATE",
      useBy: "2020-01-02",
    }),
  );
  await assert.rejects(
    () => action(f, expired, "approve", "quality"),
    /no longer eligible/,
  );
});
test("production counts preserve planned baseline, avoid duplicates and never assume unserved servings are waste", async () => {
  const f = await fixture(),
    input = {
      centerId: f.center.id,
      date: "2020-01-01",
      service: "LUNCH",
      menuPlanId: null,
      dietId: f.diet.id,
      sourceReference: "TEST kitchen count",
      notes: "",
      isMock: false,
      produced: 110,
      served: 90,
    };
  let row = await f.svc.saveMeasurement(
    "t",
    "actuals",
    null,
    { ...input, createKey: "actual_request_001" },
    "operator",
  );
  assert.equal(row.data.planned, 100);
  row = await record(f, row, "actuals");
  const duplicate = await f.svc.saveMeasurement(
    "t",
    "actuals",
    null,
    { ...input, createKey: "actual_request_002" },
    "operator",
  );
  await assert.rejects(
    () => record(f, duplicate, "actuals"),
    (e) => e.status === 409,
  );
  await assert.rejects(
    () =>
      f.svc.saveMeasurement(
        "t",
        "actuals",
        null,
        { ...input, served: 111, createKey: "actual_request_003" },
        "operator",
      ),
    /cannot exceed/,
  );
  let r = await f.svc.report("t");
  assert.equal(r.totals.unserved, 20);
  assert.equal(r.totals.records, 0);
  assert.equal(r.planningReferences[0].meanServed, null);
  for (let i = 2; i <= 3; i++) {
    const d = await f.svc.saveMeasurement(
      "t",
      "actuals",
      null,
      {
        ...input,
        date: "2020-01-0" + i,
        served: 90 + i,
        createKey: "actual_request_00" + (i + 2),
      },
      "operator",
    );
    await record(f, d, "actuals");
  }
  r = await f.svc.report("t");
  assert.equal(r.planningReferences[0].observations, 3);
  assert.equal(r.planningReferences[0].meanServed, 92);
});
test("recipe cost uses ingredient conversions and batch yield; missing prices remain unvalued and units stay separate", async () => {
  const f = await fixture(),
    ingredient = await f.s.create(
      "t",
      "menuIngredients",
      { name: "Rice", unit: "KG", active: true },
      null,
    );
  await f.s.create(
    "t",
    "ingredientProducts",
    {
      ingredientId: ingredient.id,
      productId: f.product.id,
      quantityPerSalesUnit: 1,
      source: "TEST",
    },
    null,
  );
  const recipe = await f.s.create(
      "t",
      "recipes",
      {
        name: "Rice dish",
        clientId: f.client.id,
        yieldServings: 10,
        method: "",
        items: { lines: [{ ingredientId: ingredient.id, quantity: 2 }] },
        revision: 1,
        active: true,
      },
      null,
    ),
    rv = await f.s.create(
      "t",
      "recipeVersions",
      {
        recipeId: recipe.id,
        revision: 1,
        snapshot: recipe.data,
        createdAt: new Date().toISOString(),
      },
      null,
    );
  const event = await record(
    f,
    await save(f, {
      sourceKind: "RECIPE",
      productId: null,
      recipeVersionId: rv.id,
      unit: "PORTION",
      quantity: 3,
    }),
  );
  assert.equal(event.data.estimatedCostCents, 150);
  await record(f, await save(f, {}, "product_event_002"));
  assert.equal((await f.svc.report("t")).quantities.length, 2);
  const p = await f.s.get("t", "products", f.product.id);
  await f.s.update(
    "t",
    "products",
    p.id,
    { ...p.data, price: null },
    p.version,
    null,
  );
  const unknown = await record(f, await save(f, {}, "unvalued_event_003"));
  assert.equal(unknown.data.estimatedCostCents, null);
  assert.equal((await f.svc.report("t")).totals.unvalued, 1);
});
test("improvement actions link the same center, retain evidence and do not claim target reduction automatically", async () => {
  const f = await fixture(),
    event = await record(f, await save(f));
  const input = {
    centerId: f.center.id,
    title: "Review portions",
    reason: "OVERPRODUCTION",
    ownerName: "Test team",
    dueDate: "2020-01-01",
    targetReductionPercent: 10,
    linkedEventIds: [event.id],
    notes: "Review batch sizes.",
    isMock: false,
    createKey: "action_request_001",
  };
  let a = await f.svc.saveAction("t", null, input, "operator");
  assert.equal((await f.svc.saveAction("t", null, input, "operator")).id, a.id);
  assert((await f.svc.report("t")).actions[0].overdue);
  a = await f.svc.actionProgress(
    "t",
    a.id,
    { version: a.version, state: "IN_PROGRESS", evidence: "Started test" },
    "operator",
  );
  a = await f.svc.actionProgress(
    "t",
    a.id,
    {
      version: a.version,
      state: "COMPLETED",
      evidence: "Measured test outcome, not a computed reduction",
    },
    "operator",
  );
  assert(a.data.outcome.COMPLETED.evidence);
  await assert.rejects(
    () =>
      f.svc.saveAction("t", a.id, { ...input, version: a.version }, "operator"),
    /Closed/,
  );
  assert(!(await f.svc.report("t")).actions[0].overdue);
});
test("tenant isolation, stale versions and state spoofing are enforced for waste resources", async () => {
  const f = await fixture(),
    d = await save(f);
  await assert.rejects(
    () => f.svc.required("other", "wasteEvents", d.id),
    (e) => e.status === 404,
  );
  await assert.rejects(
    () =>
      f.svc.saveMeasurement(
        "t",
        "events",
        d.id,
        { ...f.input, version: 0 },
        "operator",
      ),
    (e) => e.status === 409,
  );
  await assert.rejects(() => save(f, { state: "RECORDED" }), /Unknown waste/);
  await assert.rejects(
    () => f.svc.report("t", { service: "INVALID" }),
    /filters/,
  );
});
test("HTTP roles protect Quality destinations and generic master CRUD cannot write waste state", async () => {
  const { createServer } = await import("../src/server.mjs"),
    { hashToken } = await import("../src/store.mjs"),
    f = await fixture();
  let role = "read_only";
  const token = "waste-test";
  f.s.db = {
    prepare: () => ({
      get: async (h) =>
        h === hashToken(token) ? { user_id: "operator" } : null,
    }),
  };
  f.s.user = async () => ({
    id: "operator",
    name: "Test",
    companies: [{ id: "t", name: "Test", role }],
  });
  f.s.ready = async () => true;
  const server = createServer(f.s);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const api = async (
    path,
    method = "GET",
    body,
    tenant = "t",
    authenticated = true,
  ) => {
    const r = await fetch(
      "http://127.0.0.1:" + server.address().port + "/api" + path,
      {
        method,
        headers: {
          Origin: "http://127.0.0.1:5180",
          "Content-Type": "application/json",
          "X-Company-Id": tenant,
          ...(authenticated ? { Cookie: "nexora_session=" + token } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: r.status, data: await r.json() };
  };
  try {
    assert.equal(
      (await api("/food-waste/report", "GET", null, "t", false)).status,
      401,
    );
    assert.equal(
      (await api("/food-waste/catalog", "GET", null, "other")).status,
      403,
    );
    assert.equal((await api("/food-waste/report")).status, 200);
    assert.equal((await api("/food-waste/events", "POST", {})).status, 403);
    assert.equal((await api("/masters/wasteEvents")).status, 404);
    role = "admin";
    const event = await record(f, await save(f, { destinationKind: "RETURN" }));
    assert.equal(
      (
        await api("/food-waste/events/" + event.id + "/approve", "POST", {
          version: event.version,
          confirmed: true,
          evidence: "spoof",
        })
      ).status,
      403,
    );
    role = "quality";
    assert.equal((await api("/schema")).data.wastePermissions.quality, true);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("demo seed creates only mock observations, stays idempotent and never approves or completes destinations", async () => {
  const { seedWaste } = await import("../src/seed-waste.mjs"),
    f = await fixture();
  await f.s.update(
    "t",
    "clients",
    f.client.id,
    { ...f.client.data, erpCode: "DEMO-TEST" },
    f.client.version,
    null,
  );
  await f.s.update(
    "t",
    "diets",
    f.diet.id,
    { ...f.diet.data, code: "DEMO_STANDARD", rules: { demo: true } },
    f.diet.version,
    null,
  );
  await f.s.update(
    "t",
    "products",
    f.product.id,
    { ...f.product.data, brand: "Nexora Sample" },
    f.product.version,
    null,
  );
  for (let i = 0; i < 3; i++)
    await f.s.create(
      "t",
      "products",
      {
        ...f.product.data,
        sku: "DEMO-" + i,
        name: "Demo product " + i,
        brand: "Nexora Sample",
      },
      null,
    );
  await f.s.create(
    "t",
    "centers",
    { name: "Demo second center", clientId: f.client.id },
    null,
  );
  const ingredient = await f.s.create(
    "t",
    "menuIngredients",
    { name: "Demo Rice", unit: "KG", active: true },
    null,
  );
  await f.s.create(
    "t",
    "ingredientProducts",
    {
      ingredientId: ingredient.id,
      productId: f.product.id,
      quantityPerSalesUnit: 1,
      source: "MOCK",
    },
    null,
  );
  const recipe = await f.s.create(
    "t",
    "recipes",
    {
      name: "Demo recipe",
      clientId: f.client.id,
      yieldServings: 10,
      items: { lines: [{ ingredientId: ingredient.id, quantity: 1 }] },
      revision: 1,
      active: true,
    },
    null,
  );
  await f.s.create(
    "t",
    "recipeVersions",
    {
      recipeId: recipe.id,
      revision: 1,
      snapshot: recipe.data,
      createdAt: new Date().toISOString(),
    },
    null,
  );
  const before = await f.s.list("t", "products");
  assert.deepEqual(await seedWaste(f.s, "t"), {
    events: 6,
    actuals: 6,
    actions: 1,
    qualityApprovals: 0,
    completedDestinations: 0,
  });
  assert.deepEqual(await seedWaste(f.s, "t"), {
    events: 0,
    actuals: 0,
    actions: 0,
    qualityApprovals: 0,
    completedDestinations: 0,
  });
  assert.deepEqual(await f.s.list("t", "products"), before);
  assert(
    (await f.s.list("t", "wasteEvents")).every(
      (e) =>
        e.data.isMock &&
        e.data.destinationState !== "APPROVED" &&
        e.data.destinationState !== "COMPLETED",
    ),
  );
  assert.equal((await f.s.list("t", "orders")).length, 0);
});
