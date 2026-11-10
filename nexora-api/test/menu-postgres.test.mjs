import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.mjs";
import { MenusService } from "../src/menus.mjs";
import { importMenu } from "../src/menu-import.mjs";
test(
  "PostgreSQL F3: recipe snapshots, pack mappings, scoped FKs and approvals persist correctly; all fixtures roll back",
  { skip: !process.env.NEXORA_MENU_DB_TEST },
  async () => {
    const store = new Store(process.env.DATABASE_URL),
      rollback = new Error("Rollback F3 fixtures");
    try {
      await assert.rejects(
        () =>
          store.transaction(async () => {
            await store.lock("workspace");
            const t = "workspace",
              svc = new MenusService(store),
              suffix = randomUUID(),
              actor = (
                await store.query(
                  "SELECT user_id FROM bo.memberships WHERE tenant_id=$1 AND role='admin' LIMIT 1",
                  [t],
                )
              ).rows[0]?.user_id;
            assert(
              actor,
              "Existing operator reference required; no accounts are created",
            );
            const nutritionProfiles = await store.list(t, "nutritionProfiles");
            const links = await store.list(t, "productAllergens"),
              product = (await store.list(t, "products")).find(
                (p) =>
                  p.data.active &&
                  typeof p.data.price === "number" &&
                  !links.some((l) => l.data.productId === p.id) &&
                  !nutritionProfiles.some((n) => n.data.productId === p.id),
              );
            assert(product);
            await store.update(
              t,
              "products",
              product.id,
              {
                ...product.data,
                ingredients: "ROLLBACK TEST technical composition",
              },
              product.version,
              null,
            );
            const client = await store.create(
                t,
                "clients",
                {
                  name: "F3 rollback client " + suffix,
                  segment: "OTHER",
                  active: true,
                },
                null,
              ),
              center = await store.create(
                t,
                "centers",
                { name: "F3 rollback center " + suffix, clientId: client.id },
                null,
              ),
              diet = await store.create(
                t,
                "diets",
                { name: "F3 rollback diet", code: "ROLLBACK-" + suffix },
                null,
              );
            const secondCenter = await store.create(
              t,
              "centers",
              {
                name: "F3 rollback second center " + suffix,
                clientId: client.id,
              },
              null,
            );
            await store.create(
              t,
              "centerDiners",
              {
                centerId: secondCenter.id,
                dietId: diet.id,
                service: "LUNCH",
                count: 50,
              },
              null,
            );
            await store.create(
              t,
              "centerDiners",
              {
                centerId: center.id,
                dietId: diet.id,
                service: "LUNCH",
                count: 100,
              },
              null,
            );
            const ingredient = await svc.saveIngredient(
              t,
              null,
              { name: "F3 rollback ingredient", unit: "KG", active: true },
              null,
            );
            const mapping = await svc.saveMapping(
              t,
              {
                ingredientId: ingredient.id,
                productId: product.id,
                quantityPerSalesUnit: 1,
                source: "Rollback test only",
              },
              null,
            );
            const recipe = await svc.saveRecipe(
                t,
                null,
                {
                  name: "F3 rollback recipe",
                  clientId: client.id,
                  yieldServings: 100,
                  method: "Rollback only",
                  active: true,
                  items: {
                    lines: [{ ingredientId: ingredient.id, quantity: 8 }],
                  },
                },
                null,
              ),
              rv = (await store.list(t, "recipeVersions")).find(
                (r) => r.data.recipeId === recipe.id,
              );
            let plan = await svc.savePlan(
              t,
              null,
              {
                name: "F3 rollback plan",
                clientId: client.id,
                centerIds: [center.id, secondCenter.id],
                startDate: "2030-01-07",
                endDate: "2030-01-11",
                service: "LUNCH",
                origin: "CLIENT_REFERENCE",
                sourceReference: "Rollback fixture",
                marginPercent: 0,
                schedule: { entries: [] },
                supply: {
                  overrides: [],
                  inventory: [],
                  deliveries: [center.id, secondCenter.id].flatMap((centerId) =>
                    [8, 9, 10, 11].map((day) => ({
                      centerId,
                      consumptionDate:
                        "2030-01-" + day.toString().padStart(2, "0"),
                      deliveryDate: "2030-01-07",
                    })),
                  ),
                },
                counts: { overrides: [] },
              },
              null,
            );
            const imported = {
              format: "csv",
              content:
                "date,diet,course,recipe_version,recipe\n" +
                [7, 8, 9, 10, 11]
                  .map(
                    (day) =>
                      `2030-01-${day.toString().padStart(2, "0")},${diet.id},MAIN,1,${recipe.id}`,
                  )
                  .join("\n"),
              mode: "REPLACE",
              sourceReference: "ROLLBACK WEEKLY CLIENT FILE",
              version: plan.version,
              commit: false,
            };
            const preview = await importMenu(svc, t, plan.id, imported, actor);
            assert(preview.canCommit);
            const committed = await importMenu(
              svc,
              t,
              plan.id,
              { ...imported, commit: true, previewHash: preview.previewHash },
              actor,
            );
            plan = committed.record;
            await svc.saveNutrition(
              t,
              "profile",
              {
                productId: product.id,
                basis: "PER_100_G",
                values: {
                  energyKcal: 100,
                  proteinG: 5,
                  carbohydrateG: 20,
                  sugarsG: 2,
                  fatG: 1,
                  saturatedFatG: 0.2,
                  fiberG: 1,
                  saltG: 0.1,
                },
                source: "ROLLBACK TEST",
                isMock: true,
                approve: true,
              },
              "nutrition_menus",
              actor,
            );
            await svc.saveNutrition(
              t,
              "rule",
              {
                dietId: diet.id,
                service: "LUNCH",
                limits: {},
                excludedIngredientIds: [],
                requiredClaims: [],
                source: "ROLLBACK TEST",
                isMock: true,
                approve: true,
              },
              "nutrition_menus",
              actor,
            );
            const currentProduct = await store.get(t, "products", product.id);
            await svc.reviewTechnical(
              t,
              {
                productId: product.id,
                productVersion: currentProduct.version,
                ingredients: "ROLLBACK TEST composition",
                source: "ROLLBACK TEST",
                isMock: true,
              },
              "quality",
              actor,
            );
            const f = await svc.forecast(t, plan.id);
            assert.equal(f.needs[0].baseQuantity, 8);
            assert.equal(f.servings.length, 10);
            assert.equal(
              f.needs
                .filter((n) => n.centerId === center.id)
                .reduce((n, r) => n + r.baseQuantity, 0),
              40,
            );
            assert.equal(
              f.needs
                .filter((n) => n.centerId === secondCenter.id)
                .reduce((n, r) => n + r.baseQuantity, 0),
              20,
            );
            assert.equal(f.purchases.length, 2);
            assert.equal(f.nutrition[0].perServing.energyKcal, 80);
            assert.deepEqual(f.issues, []);
            assert.equal((await svc.forecast(t, plan.id)).hash, f.hash);
            plan = await svc.transition(
              t,
              plan.id,
              { version: plan.version },
              "admin",
              actor,
              "review",
            );
            plan = await svc.transition(
              t,
              plan.id,
              { version: plan.version, evidence: "Rollback nutrition review" },
              "nutrition_menus",
              actor,
              "nutrition",
            );
            plan = await svc.transition(
              t,
              plan.id,
              { version: plan.version, evidence: "Rollback quality review" },
              "quality",
              actor,
              "quality",
            );
            assert.equal(plan.data.state, "APPROVED");
            plan = await svc.transition(
              t,
              plan.id,
              { version: plan.version },
              "admin",
              actor,
              "publish",
            );
            assert.equal((await svc.forecast(t, plan.id)).frozen, true);
            const proposed = await svc.createPurchaseDrafts(
              t,
              plan.id,
              { version: plan.version },
              actor,
            );
            assert.equal(proposed.length, 2);
            assert(
              proposed.every(
                (o) =>
                  o.data.state === "IN_REVIEW" &&
                  o.data.submittedRevision === null,
              ),
            );
            assert.equal(proposed[0].data.erpState, "NOT_SENT");
            const repeated = await svc.createPurchaseDrafts(
              t,
              plan.id,
              { version: plan.version },
              actor,
            );
            assert.equal(repeated[0].id, proposed[0].id);
            assert.equal(await store.get("other", "menuPlans", plan.id), null);
            await store.query("SAVEPOINT f3_fk");
            await assert.rejects(
              () =>
                store.query(
                  `UPDATE bo."ingredientProducts" SET data=jsonb_set(data,'{ingredientId}',to_jsonb($1::text)) WHERE id=$2`,
                  [randomUUID(), mapping.id],
                ),
              (e) => e.code === "23503",
            );
            await store.query("ROLLBACK TO SAVEPOINT f3_fk");
            await store.query("SAVEPOINT f3_unique");
            await assert.rejects(
              () => store.create(t, "ingredientProducts", mapping.data, null),
              (e) => e.code === "23505",
            );
            await store.query("ROLLBACK TO SAVEPOINT f3_unique");
            throw rollback;
          }),
        (e) => e === rollback,
      );
    } finally {
      await store.close();
    }
  },
);
