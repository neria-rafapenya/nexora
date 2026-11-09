import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allergenReference,
  mockContains,
  mockTraces,
  mockSource,
  seedAllergens,
} from "../src/seed-allergens.mjs";
import { validate } from "../src/schema.mjs";
import { demoFamilies } from "../src/seed.mjs";
test("all 14 distinct EU allergen categories have explicit codes", () => {
  assert.equal(allergenReference.length, 14);
  assert.equal(new Set(allergenReference.map((x) => x[0])).size, 14);
  assert.equal(new Set(allergenReference.map((x) => x[1])).size, 14);
});
test("all synthetic links target existing fictional products, without conflicting contains/traces", () => {
  const names = new Set(demoFamilies.flatMap((x) => x[2]));
  for (const [code, products] of [
    ...Object.entries(mockContains),
    ...Object.entries(mockTraces),
  ]) {
    assert(allergenReference.some((x) => x[0] === code));
    for (const name of products) assert(names.has(name), name);
  }
  for (const [code, products] of Object.entries(mockTraces))
    for (const name of products) assert(!mockContains[code]?.includes(name));
});
test("seed is idempotent, pending-review, unvalidated and never touches real products", async () => {
  const rows = {
    allergens: [],
    productAllergens: [],
    products: [
      {
        id: "sample",
        version: 1,
        data: {
          name: "Whole Milk",
          sku: "NX-05-001",
          brand: "Nexora Sample",
          allergenStatus: "UNVERIFIED",
        },
      },
      {
        id: "real",
        version: 1,
        data: {
          name: "Whole Milk",
          sku: "REAL-001",
          brand: "Real Supplier",
          allergenStatus: "UNVERIFIED",
        },
      },
    ],
  };
  const store = {
    transaction: async (fn) => fn(),
    lock: async () => {},
    list: async (t, r) => rows[r],
    create: async (t, r, data) => {
      const record = {
        id: r + "-" + rows[r].length,
        version: 1,
        data: validate(r, data),
      };
      rows[r].push(record);
      return record;
    },
    update: async (t, r, id, data) => {
      Object.assign(rows[r].find((x) => x.id === id).data, data);
    },
  };
  const first = await seedAllergens(store);
  assert.equal(first.createdAllergens, 14);
  assert.equal(first.createdLinks, 1);
  assert.equal(rows.productAllergens[0].data.validated, false);
  assert.equal(rows.productAllergens[0].data.source, mockSource);
  assert.equal(rows.products[0].data.allergenStatus, "PENDING_REVIEW");
  assert.equal(rows.products[1].data.allergenStatus, "UNVERIFIED");
  assert.equal(rows.productAllergens[0].data.productId, "sample");
  assert.deepEqual(await seedAllergens(store), {
    createdAllergens: 0,
    createdLinks: 0,
    updatedProducts: 0,
  });
});
