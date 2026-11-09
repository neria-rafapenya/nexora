import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { validate, can } from "../src/schema.mjs";
import { Store } from "../src/store.mjs";
test("main categories are root-only and every family references one", () => {
  assert.deepEqual(
    validate("mainCategories", { name: "Ambient Food", active: true }),
    { name: "Ambient Food", description: null, active: true },
  );
  assert.throws(
    () => validate("mainCategories", { name: "Root", parentId: "another" }),
    /Unknown field/,
  );
  assert.throws(
    () =>
      validate("mainCategories", { name: "Root", mainCategoryId: "another" }),
    /Unknown field/,
  );
  assert.throws(
    () => validate("families", { name: "Rice", temperature: "AMBIENT" }),
    /Main category is required/,
  );
  assert.throws(
    () =>
      validate("families", {
        name: "Rice",
        temperature: "AMBIENT",
        parentId: "another",
        mainCategoryId: "root",
      }),
    /Unknown field/,
  );
  assert.equal(
    validate("families", {
      name: "Rice",
      temperature: "AMBIENT",
      mainCategoryId: "root",
    }).mainCategoryId,
    "root",
  );
  for (const role of [
    "operations_orders",
    "nutrition_menus",
    "quality",
    "read_only",
  ]) {
    assert(can(role, "mainCategories"));
    assert(!can(role, "mainCategories", true));
  }
});
test(
  "PostgreSQL category links enforce root-only structure and restrict deletion; all fixtures roll back",
  { skip: !process.env.NEXORA_CATEGORY_DB_TEST },
  async () => {
    const store = new Store(process.env.DATABASE_URL),
      rollback = new Error("Rollback category fixtures");
    try {
      await assert.rejects(
        () =>
          store.transaction(async () => {
            const category = await store.create(
              "workspace",
              "mainCategories",
              { name: "Temporary category " + randomUUID(), active: true },
              null,
            );
            const family = await store.create(
              "workspace",
              "families",
              {
                name: "Temporary family " + randomUUID(),
                temperature: "AMBIENT",
                mainCategoryId: category.id,
              },
              null,
            );
            await assert.rejects(
              () =>
                store.remove(
                  "workspace",
                  "mainCategories",
                  category.id,
                  category.version,
                  null,
                ),
              /referenced by families/i,
            );
            await assert.rejects(
              () =>
                store.create(
                  "workspace",
                  "families",
                  {
                    name: "Invalid family",
                    temperature: "AMBIENT",
                    mainCategoryId: randomUUID(),
                  },
                  null,
                ),
              /does not exist in this company/,
            );
            await store.query("SAVEPOINT invalid_category");
            await assert.rejects(
              () =>
                store.query(
                  `UPDATE bo."mainCategories" SET data=data || '{"parentId":"other"}'::jsonb WHERE id=$1`,
                  [category.id],
                ),
              (e) => e.code === "23514",
            );
            await store.query("ROLLBACK TO SAVEPOINT invalid_category");
            await store.query("SAVEPOINT invalid_family");
            await assert.rejects(
              () =>
                store.query(
                  `UPDATE bo.families SET data=jsonb_set(data,'{mainCategoryId}',to_jsonb($1::text)) WHERE id=$2`,
                  [randomUUID(), family.id],
                ),
              (e) => e.code === "23503",
            );
            await store.query("ROLLBACK TO SAVEPOINT invalid_family");
            throw rollback;
          }),
        (e) => e === rollback,
      );
    } finally {
      await store.close();
    }
  },
);
