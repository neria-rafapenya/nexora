import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.mjs";
import { WasteService } from "../src/waste.mjs";
test(
  "PostgreSQL F5: measurements, confirmed service uniqueness, destination trace and zero stock/ERP effects; fixtures roll back",
  { skip: !process.env.NEXORA_WASTE_DB_TEST },
  async () => {
    const s = new Store(process.env.DATABASE_URL),
      rollback = new Error("Rollback F5 fixture");
    try {
      await assert.rejects(
        () =>
          s.transaction(async () => {
            const t = "workspace";
            await s.lock(t);
            const actor = (
              await s.query(
                "SELECT user_id FROM bo.memberships WHERE tenant_id=$1 AND role='admin' LIMIT 1",
                [t],
              )
            ).rows[0]?.user_id;
            assert(
              actor,
              "Existing actor reference required; no accounts created",
            );
            const svc = new WasteService(s),
              suffix = randomUUID(),
              product = (await s.list(t, "products")).find(
                (p) => typeof p.data.price === "number",
              ),
              before = product.data.stock,
              orderCount = (await s.list(t, "orders")).length,
              client = await s.create(
                t,
                "clients",
                {
                  name: "F5 rollback client " + suffix,
                  segment: "OTHER",
                  active: true,
                },
                null,
              ),
              center = await s.create(
                t,
                "centers",
                { name: "F5 rollback center", clientId: client.id },
                null,
              ),
              diet = await s.create(
                t,
                "diets",
                { code: "F5-" + suffix, name: "F5 test diet" },
                null,
              );
            await s.create(
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
            const input = {
              centerId: center.id,
              date: "2020-01-01",
              service: "LUNCH",
              menuPlanId: null,
              dietId: diet.id,
              sourceReference: "ROLLBACK TEST",
              notes: "Not an actual kitchen event",
              isMock: true,
              sourceKind: "PRODUCT",
              productId: product.id,
              recipeVersionId: null,
              reason: "OVERPRODUCTION",
              quantity: 2,
              unit: product.data.unit,
              lot: "ROLLBACK-BATCH",
              useBy: "2099-01-01",
              traceabilityReference: "ROLLBACK TRACE",
              destinationKind: "DONATION_CANDIDATE",
              destinationTarget: "Fictional test recipient",
              createKey: "F5_EVENT_" + suffix,
            };
            let e = await svc.saveMeasurement(t, "events", null, input, actor);
            assert.equal(
              (await svc.saveMeasurement(t, "events", null, input, actor)).id,
              e.id,
            );
            e = await svc.measurementAction(
              t,
              "events",
              e.id,
              { version: e.version, confirmed: true },
              "record",
              "admin",
              actor,
            );
            await assert.rejects(
              () =>
                svc.measurementAction(
                  t,
                  "events",
                  e.id,
                  { version: e.version, confirmed: true, evidence: "TEST" },
                  "approve",
                  "admin",
                  actor,
                ),
              (err) => err.status === 403,
            );
            e = await svc.measurementAction(
              t,
              "events",
              e.id,
              {
                version: e.version,
                confirmed: true,
                evidence: "ROLLBACK simulated Quality decision",
              },
              "approve",
              "quality",
              actor,
            );
            assert.equal(
              (await svc.report(t, { centerId: center.id })).quantities[0]
                .donated,
              0,
            );
            e = await svc.measurementAction(
              t,
              "events",
              e.id,
              {
                version: e.version,
                confirmed: true,
                evidence: "ROLLBACK simulated destination execution",
              },
              "complete",
              "admin",
              actor,
            );
            assert.equal(
              (await svc.report(t, { centerId: center.id })).quantities[0]
                .donated,
              2,
            );
            const actual = {
              centerId: center.id,
              date: "2020-01-01",
              service: "LUNCH",
              menuPlanId: null,
              dietId: diet.id,
              sourceReference: "ROLLBACK count",
              notes: "Test only",
              isMock: true,
              produced: 110,
              served: 90,
            };
            let a = await svc.saveMeasurement(
              t,
              "actuals",
              null,
              { ...actual, createKey: "F5_ACTUAL_" + suffix },
              actor,
            );
            a = await svc.measurementAction(
              t,
              "actuals",
              a.id,
              { version: a.version, confirmed: true },
              "record",
              "admin",
              actor,
            );
            assert.equal(a.data.planned, 100);
            const duplicate = await svc.saveMeasurement(
              t,
              "actuals",
              null,
              { ...actual, createKey: "F5_DUP_" + suffix },
              actor,
            );
            await assert.rejects(
              () =>
                svc.measurementAction(
                  t,
                  "actuals",
                  duplicate.id,
                  { version: duplicate.version, confirmed: true },
                  "record",
                  "admin",
                  actor,
                ),
              (err) => err.status === 409,
            );
            await s.query("SAVEPOINT f5_actual_unique");
            await assert.rejects(
              () =>
                s.query(
                  `UPDATE bo."serviceActuals" SET data=jsonb_set(data,'{state}','"RECORDED"') WHERE id=$1`,
                  [duplicate.id],
                ),
              (err) => err.code === "23505",
            );
            await s.query("ROLLBACK TO SAVEPOINT f5_actual_unique");
            await s.query("SAVEPOINT f5_fk");
            await assert.rejects(
              () =>
                s.query(
                  `UPDATE bo."wasteEvents" SET data=jsonb_set(data,'{productId}',to_jsonb($1::text)) WHERE id=$2`,
                  [randomUUID(), e.id],
                ),
              (err) => err.code === "23503",
            );
            await s.query("ROLLBACK TO SAVEPOINT f5_fk");
            assert.equal(await s.get("other", "wasteEvents", e.id), null);
            assert.equal(
              (await s.get(t, "products", product.id)).data.stock,
              before,
            );
            assert.equal((await s.list(t, "orders")).length, orderCount);
            await svc.measurementAction(
              t,
              "events",
              e.id,
              {
                version: e.version,
                confirmed: true,
                reason: "ROLLBACK correction",
              },
              "void",
              "admin",
              actor,
            );
            const report = await svc.report(t, { centerId: center.id });
            assert.equal(report.totals.records, 0);
            assert.equal(report.totals.unserved, 20);
            throw rollback;
          }),
        (err) => err === rollback,
      );
    } finally {
      await s.close();
    }
  },
);
