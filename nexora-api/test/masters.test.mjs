import { test } from "node:test";
import assert from "node:assert/strict";
import {
  seedMasters,
  supplierNames,
  clientDefinitions,
  dietDefinitions,
} from "../src/seed-masters.mjs";
import { allergenReference } from "../src/seed-allergens.mjs";
import { validate } from "../src/schema.mjs";
test("business demo seed creates linked masters, preserves existing supplier links and is idempotent", async () => {
  const rows = Object.fromEntries(
    [
      "suppliers",
      "clients",
      "centers",
      "diets",
      "centerDiners",
      "allergens",
      "products",
      "productAllergens",
    ].map((r) => [r, []]),
  );
  rows.allergens = allergenReference.map(([code, name], i) => ({
    id: "allergen" + i,
    data: { code, name },
  }));
  rows.products = [
    {
      id: "p1",
      version: 1,
      data: {
        name: "Sample grain",
        sku: "NX-01-001",
        brand: "Nexora Sample",
        supplierId: null,
      },
    },
    {
      id: "p2",
      version: 1,
      data: {
        name: "Assigned",
        sku: "NX-02-001",
        brand: "Nexora Sample",
        supplierId: "existing-supplier",
      },
    },
    {
      id: "real",
      version: 1,
      data: {
        name: "Real record",
        sku: "REAL-001",
        brand: "Other",
        supplierId: null,
      },
    },
  ];
  const store = {
    transaction: async (fn) => fn(),
    lock: async () => {},
    list: async (t, r) => rows[r],
    create: async (t, r, data) => {
      const row = {
        id: r + rows[r].length,
        version: 1,
        data: validate(r, data),
      };
      rows[r].push(row);
      return row;
    },
    update: async (t, r, id, data) => {
      const row = rows[r].find((x) => x.id === id);
      row.data = data;
      row.version++;
      return row;
    },
  };
  const result = await seedMasters(store);
  assert.equal(result.suppliers, 10);
  assert.equal(result.clients, 8);
  assert.equal(result.centers, 16);
  assert.equal(result.diets, 6);
  assert.equal(result.centerDiners, 192);
  assert.equal(result.linkedProducts, 1);
  assert.equal(rows.products[0].data.supplierId, rows.suppliers[0].id);
  assert.equal(rows.products[1].data.supplierId, "existing-supplier");
  assert.equal(rows.products[2].data.supplierId, null);
  for (const center of rows.centers)
    assert(rows.clients.some((c) => c.id === center.data.clientId));
  for (const row of rows.centerDiners) {
    assert(rows.centers.some((c) => c.id === row.data.centerId));
    assert(rows.diets.some((d) => d.id === row.data.dietId));
    assert(Number.isInteger(row.data.count) && row.data.count >= 0);
  }
  const again = await seedMasters(store);
  for (const key of [
    "suppliers",
    "clients",
    "centers",
    "diets",
    "centerDiners",
    "linkedProducts",
  ])
    assert.equal(again[key], 0);
  assert.equal(supplierNames.length, 10);
  assert.equal(clientDefinitions.length, 8);
  assert.equal(dietDefinitions.length, 6);
  assert(
    rows.suppliers.every(
      (r) =>
        r.data.qualityEmail.endsWith(".test") && r.data.approvedUntil === null,
    ),
  );
});
