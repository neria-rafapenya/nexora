import { test } from "node:test";
import assert from "node:assert/strict";
import { MenuStore } from "./helpers/menu-store.mjs";
import { MenusService, planDates } from "../src/menus.mjs";
import { menuPermissions } from "../src/menu-schema.mjs";
async function fixture() {
  const s = new MenuStore(),
    svc = new MenusService(s),
    t = "t";
  const add = (r, d) => s.create(t, r, d, null);
  const cat = await add("mainCategories", { name: "Ambient", active: true }),
    family = await add("families", {
      name: "Rice",
      temperature: "AMBIENT",
      mainCategoryId: cat.id,
    }),
    product = await add("products", {
      sku: "RICE-5",
      name: "Rice 5 kg pack",
      familyId: family.id,
      unit: "BOX",
      price: 10,
      stock: 100,
      temperature: "AMBIENT",
      ingredients: "Rice",
      allergenStatus: "UNVERIFIED",
      active: true,
    }),
    client = await add("clients", {
      name: "Test School",
      segment: "SCHOOL",
      active: true,
    }),
    center = await add("centers", { name: "Center A", clientId: client.id }),
    center2 = await add("centers", { name: "Center B", clientId: client.id }),
    diet = await add("diets", { code: "STANDARD", name: "Standard" });
  for (const c of [center, center2])
    await add("centerDiners", {
      centerId: c.id,
      dietId: diet.id,
      service: "LUNCH",
      count: 100,
    });
  const ingredient = await svc.saveIngredient(
    t,
    null,
    { name: "Rice", unit: "KG", active: true },
    "actor",
  );
  await svc.saveMapping(
    t,
    {
      ingredientId: ingredient.id,
      productId: product.id,
      quantityPerSalesUnit: 5,
      source: "TEST FORMAT",
    },
    "actor",
  );
  const recipeInput = {
    name: "Rice dish",
    clientId: client.id,
    yieldServings: 100,
    method: "Test only",
    items: { lines: [{ ingredientId: ingredient.id, quantity: 8 }] },
    active: true,
  };
  const recipe = await svc.saveRecipe(t, null, recipeInput, "actor"),
    rv = (await s.list(t, "recipeVersions"))[0];
  const input = {
    name: "Test week",
    clientId: client.id,
    centerIds: [center.id],
    startDate: "2030-01-07",
    endDate: "2030-01-07",
    service: "LUNCH",
    origin: "CLIENT_REFERENCE",
    sourceReference: "Customer menu reference",
    marginPercent: 0,
    schedule: {
      entries: [
        {
          date: "2030-01-07",
          dietId: diet.id,
          course: "MAIN",
          recipeVersionId: rv.id,
          centerId: null,
        },
      ],
    },
    counts: { overrides: [] },
  };
  const plan = await svc.savePlan(t, null, input, "actor");
  return {
    s,
    svc,
    t,
    product,
    client,
    center,
    center2,
    diet,
    ingredient,
    recipe,
    recipeInput,
    rv,
    input,
    plan,
  };
}
async function review(f) {
  return f.svc.transition(
    "t",
    f.plan.id,
    { version: f.plan.version },
    "admin",
    "actor",
    "review",
  );
}
async function approve(f, o, kind) {
  return f.svc.transition(
    "t",
    o.id,
    { version: o.version, evidence: "Specialist review reference" },
    kind === "nutrition" ? "nutrition_menus" : "quality",
    "actor",
    kind,
  );
}
test("100 servings turn 8 kg into two 5 kg packs; margin, costs and zero stock mutation", async () => {
  const f = await fixture(),
    v = await f.svc.forecast("t", f.plan.id);
  assert.equal(v.needs[0].baseQuantity, 8);
  assert.equal(v.procurement[0].salesQuantity, 2);
  assert.equal(v.procurement[0].surplus, 2);
  assert.equal(v.estimatedCostCents, 2000);
  assert.equal((await f.s.get("t", "products", f.product.id)).data.stock, 100);
  assert.deepEqual(v.issues, []);
  assert(v.warnings.includes("NO_DECLARED_ALLERGEN_LINKS"));
});
test("center/date/diet overrides replace base counts and center-specific recipes replace the common slot", async () => {
  const f = await fixture();
  const input = structuredClone(f.input);
  input.centerIds.push(f.center2.id);
  input.marginPercent = 10;
  input.counts.overrides = [
    {
      centerId: f.center2.id,
      date: input.startDate,
      dietId: f.diet.id,
      count: 50,
    },
  ];
  input.schedule.entries.push({
    ...input.schedule.entries[0],
    centerId: f.center2.id,
  });
  const o = await f.svc.savePlan(
    "t",
    f.plan.id,
    { ...input, version: f.plan.version },
    "actor",
  );
  const v = await f.svc.forecast("t", o.id);
  assert.equal(v.servings.length, 2);
  assert.deepEqual(
    v.needs.map((n) => n.baseQuantity),
    [8, 4],
  );
  assert.deepEqual(
    v.needs.map((n) => n.withMargin),
    [8.8, 4.4],
  );
  assert.deepEqual(
    v.procurement.map((n) => n.salesQuantity),
    [2, 1],
  );
});
test("recipe versions remain pinned and referenced ingredient units cannot be changed", async () => {
  const f = await fixture(),
    before = await f.svc.forecast("t", f.plan.id);
  await f.svc.saveRecipe(
    "t",
    f.recipe.id,
    {
      ...f.recipeInput,
      version: f.recipe.version,
      items: { lines: [{ ingredientId: f.ingredient.id, quantity: 20 }] },
    },
    "actor",
  );
  const after = await f.svc.forecast("t", f.plan.id);
  assert.equal(before.hash, after.hash);
  assert.equal(after.needs[0].baseQuantity, 8);
  await assert.rejects(
    () =>
      f.svc.saveIngredient(
        "t",
        f.ingredient.id,
        {
          name: "Rice",
          unit: "L",
          active: true,
          version: f.ingredient.version,
        },
        "actor",
      ),
    /units cannot/,
  );
});
test("nutrition and quality are separate, current approvals; published data is immutable and frozen", async () => {
  const f = await fixture();
  let o = await review(f);
  await assert.rejects(
    () =>
      f.svc.transition(
        "t",
        o.id,
        { version: o.version, evidence: "Admin" },
        "admin",
        "actor",
        "quality",
      ),
    (e) => e.status === 403,
  );
  o = await approve(f, o, "nutrition");
  await assert.rejects(
    () =>
      f.svc.transition(
        "t",
        o.id,
        { version: o.version },
        "admin",
        "actor",
        "publish",
      ),
    /approvals/,
  );
  o = await approve(f, o, "quality");
  assert.equal(o.data.state, "APPROVED");
  await f.s.update(
    "t",
    "products",
    f.product.id,
    { ...f.product.data, price: 11 },
    f.product.version,
    "actor",
  );
  await assert.rejects(
    () =>
      f.svc.transition(
        "t",
        o.id,
        { version: o.version },
        "admin",
        "actor",
        "publish",
      ),
    /approvals/,
  );
  o = await approve(f, o, "nutrition");
  o = await approve(f, o, "quality");
  o = await f.svc.transition(
    "t",
    o.id,
    { version: o.version },
    "admin",
    "actor",
    "publish",
  );
  const frozen = await f.svc.forecast("t", o.id);
  assert(frozen.frozen);
  const p = await f.s.get("t", "products", f.product.id);
  await f.s.update(
    "t",
    "products",
    p.id,
    { ...p.data, price: 99 },
    p.version,
    "actor",
  );
  assert.equal((await f.svc.forecast("t", o.id)).estimatedCostCents, 2200);
  await assert.rejects(
    () =>
      f.svc.savePlan("t", o.id, { ...f.input, version: o.version }, "actor"),
    /immutable/,
  );
  const copy = await f.svc.copyPlan("t", o.id, o.version, "actor");
  assert.equal(copy.data.state, "DRAFT");
  assert.equal(copy.data.parentId, o.id);
  assert.deepEqual(copy.data.qualityApproval, {});
});
test("unvalidated allergens and excluded traces block quality publication", async () => {
  const f = await fixture(),
    allergen = await f.s.create(
      "t",
      "allergens",
      { code: "TEST", name: "Test allergen" },
      null,
    );
  await f.s.create(
    "t",
    "productAllergens",
    {
      productId: f.product.id,
      allergenId: allergen.id,
      kind: "TRACES",
      source: "Test document",
      validated: false,
    },
    null,
  );
  await f.s.update(
    "t",
    "diets",
    f.diet.id,
    { ...f.diet.data, excludedAllergens: [allergen.id] },
    f.diet.version,
    null,
  );
  const v = await f.svc.forecast("t", f.plan.id);
  assert(v.issues.includes("UNVALIDATED_ALLERGENS"));
  assert(v.issues.includes("DIET_ALLERGEN_CONFLICT"));
  const o = await review(f);
  await assert.rejects(() => approve(f, o, "quality"), /technical issues/);
});
test("missing menu for a populated diet, missing pack mappings and technical composition stay explicit", async () => {
  const f = await fixture(),
    d = await f.s.create("t", "diets", { code: "OTHER", name: "Other" }, null);
  await f.s.create(
    "t",
    "centerDiners",
    { centerId: f.center.id, dietId: d.id, service: "LUNCH", count: 5 },
    null,
  );
  await f.s.update(
    "t",
    "products",
    f.product.id,
    { ...f.product.data, ingredients: null },
    f.product.version,
    null,
  );
  let v = await f.svc.forecast("t", f.plan.id);
  assert(v.issues.includes("MISSING_DIET_MENU"));
  assert(v.issues.includes("MISSING_TECHNICAL_INFORMATION"));
  f.s.rows.ingredientProducts = [];
  v = await f.svc.forecast("t", f.plan.id);
  assert(v.issues.includes("MISSING_PRODUCT_MAPPING"));
});
test("invalid dates, recipe quantities, duplicate slots, tenant and client references are rejected", async () => {
  const f = await fixture();
  assert.throws(() => planDates("2030-02-30", "2030-03-01"));
  assert.throws(() => planDates("2030-01-01", "2030-03-01"));
  await assert.rejects(
    () =>
      f.svc.saveRecipe(
        "t",
        null,
        { ...f.recipeInput, yieldServings: 0 },
        "actor",
      ),
    /positive integer/,
  );
  await assert.rejects(
    () =>
      f.svc.savePlan(
        "t",
        null,
        {
          ...f.input,
          schedule: {
            entries: [...f.input.schedule.entries, ...f.input.schedule.entries],
          },
        },
        "actor",
      ),
    /Duplicate menu/,
  );
  await assert.rejects(
    () => f.svc.required("other", "menuPlans", f.plan.id),
    /not found/,
  );
  await assert.rejects(
    () => f.svc.savePlan("t", f.plan.id, { ...f.input, version: 0 }, "actor"),
    /Record changed/,
  );
  const client = await f.s.create(
    "t",
    "clients",
    { name: "Other", segment: "OTHER", active: true },
    null,
  );
  await assert.rejects(
    () =>
      f.svc.savePlan("t", null, { ...f.input, clientId: client.id }, "actor"),
    /does not belong/,
  );
  assert(!menuPermissions("admin").quality);
  assert(!menuPermissions("operations_orders").write);
  assert(menuPermissions("quality").quality);
});
test("mock proposals never approve and require an empty menu", async () => {
  const f = await fixture();
  await assert.rejects(
    () =>
      f.svc.mockProposal("t", f.plan.id, f.plan.version, f.diet.id, "actor"),
    /empty menu/,
  );
  const o = await f.svc.savePlan(
    "t",
    null,
    { ...f.input, schedule: { entries: [] } },
    "actor",
  );
  const mock = await f.svc.mockProposal(
    "t",
    o.id,
    o.version,
    f.diet.id,
    "actor",
  );
  assert.equal(mock.data.state, "DRAFT");
  assert.equal(mock.data.origin, "MOCK");
  assert.deepEqual(mock.data.qualityApproval, {});
});

test("F3 HTTP endpoints enforce company scope, specialist roles and prohibit generic workflow CRUD", async () => {
  const { createServer } = await import("../src/server.mjs"),
    { hashToken } = await import("../src/store.mjs");
  const f = await fixture();
  let role = "admin";
  const token = "local-menu-test";
  f.s.db = {
    prepare: () => ({
      get: async (hash) =>
        hash === hashToken(token) ? { user_id: "actor" } : null,
    }),
  };
  f.s.user = async () => ({
    id: "actor",
    name: "Test",
    companies: [{ id: "t", name: "Test", role }],
  });
  f.s.ready = async () => true;
  const server = createServer(f.s);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const api = async (path, method = "GET", body, tenant = "t") => {
    const r = await fetch(
      "http://127.0.0.1:" + server.address().port + "/api" + path,
      {
        method,
        headers: {
          Cookie: "nexora_session=" + token,
          Origin: "http://127.0.0.1:5180",
          "Content-Type": "application/json",
          "X-Company-Id": tenant,
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
      },
    );
    return { status: r.status, body: await r.json() };
  };
  try {
    assert.equal((await api("/menus")).status, 200);
    assert.equal((await api("/menus", "GET", null, "other")).status, 403);
    assert.equal((await api("/masters/menuPlans")).status, 404);
    assert.equal(
      (
        await api("/menus/" + f.plan.id + "/quality", "POST", {
          version: f.plan.version,
          evidence: "forged",
        })
      ).status,
      403,
    );
    role = "operations_orders";
    assert.equal((await api("/menus/catalog")).status, 200);
    assert.equal((await api("/menus", "POST", f.input)).status, 403);
    role = "quality";
    assert.equal(
      (
        await api("/menus/" + f.plan.id + "/nutrition", "POST", {
          version: f.plan.version,
          evidence: "wrong role",
        })
      ).status,
      403,
    );
    role = "nutrition_menus";
    const schema = await api("/schema");
    assert.equal(schema.body.menuPermissions.nutrition, true);
    assert.equal(schema.body.menuPermissions.quality, false);
  } finally {
    await new Promise((r) => server.close(r));
  }
});

test("zero diners do not generate purchases or dietary conflicts for an unused variant", async () => {
  const f = await fixture(),
    allergen = await f.s.create(
      "t",
      "allergens",
      { code: "ZERO", name: "Test allergen" },
      null,
    ),
    diet = await f.s.create(
      "t",
      "diets",
      {
        code: "ZERO_DIET",
        name: "Unused diet",
        excludedAllergens: [allergen.id],
      },
      null,
    );
  await f.s.create(
    "t",
    "productAllergens",
    {
      productId: f.product.id,
      allergenId: allergen.id,
      kind: "CONTAINS",
      source: "Test document",
      validated: true,
    },
    null,
  );
  const input = structuredClone(f.input);
  input.schedule.entries.push({
    ...input.schedule.entries[0],
    dietId: diet.id,
  });
  input.counts.overrides.push({
    centerId: f.center.id,
    date: input.startDate,
    dietId: diet.id,
    count: 0,
  });
  const o = await f.svc.savePlan("t", null, input, "actor");
  const v = await f.svc.forecast("t", o.id);
  assert(!v.issues.includes("DIET_ALLERGEN_CONFLICT"));
  assert.equal(v.needs[0].baseQuantity, 8);
});
test("F3 demo seed is idempotent, never approves and preserves product technical data", async () => {
  const { seedMenus } = await import("../src/seed-menus.mjs");
  const f = await fixture();
  await f.s.update(
    "t",
    "clients",
    f.client.id,
    { ...f.client.data, erpCode: "DEMO-TEST" },
    f.client.version,
    null,
  );
  for (const name of [
    "Basmati Rice",
    "Chopped Tomatoes",
    "Chickpeas",
    "Brown Lentils",
  ])
    await f.s.create(
      "t",
      "products",
      {
        ...f.product.data,
        sku: "DEMO-" + name,
        name,
        brand: "Nexora Sample",
        unit: "KG",
        ingredients: null,
      },
      null,
    );
  const before = await f.s.list("t", "products");
  assert.deepEqual(await seedMenus(f.s, "t"), {
    ingredients: 4,
    recipes: 3,
    plans: 1,
    published: 0,
    approved: 0,
  });
  assert.deepEqual(await seedMenus(f.s, "t"), {
    ingredients: 0,
    recipes: 0,
    plans: 0,
    published: 0,
    approved: 0,
  });
  assert.deepEqual(await f.s.list("t", "products"), before);
  const demo = (await f.s.list("t", "menuPlans")).find(
    (p) => p.data.name === "Demo Client Weekly Menu",
  );
  assert.equal(demo.data.state, "DRAFT");
  assert.deepEqual(demo.data.qualityApproval, {});
});
