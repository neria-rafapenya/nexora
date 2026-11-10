import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.mjs";
import { OrdersService } from "../src/orders.mjs";
import { geminiConfigFromEnv } from "../src/gemini.mjs";
test(
  "Gemini full order: correction, revision-specific mock acceptance, internal approval and idempotent ERP receipt; fixtures roll back",
  { skip: !process.env.NEXORA_AI_WORKFLOW_DB_TEST },
  async () => {
    const s = new Store(process.env.DATABASE_URL),
      rollback = new Error("Rollback Gemini acceptance fixtures");
    let evidence;
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
            assert(actor);
            const p = (await s.list(t, "products")).find(
              (p) =>
                p.data.active &&
                p.data.brand === "Nexora Sample" &&
                p.data.stock > 3 &&
                p.data.price > 0,
            );
            assert(p);
            const c = await s.create(
              t,
              "clients",
              {
                name: "Gemini acceptance fixture",
                segment: "OTHER",
                active: true,
              },
              actor,
            );
            const center = await s.create(
              t,
              "centers",
              {
                name: "Gemini acceptance fixture",
                clientId: c.id,
                deliveryDays: [],
                closedDates: [],
              },
              actor,
            );
            const body = `Please deliver 1 ${p.data.unit} of ${p.data.name} (SKU ${p.data.sku}).`;
            const live = process.env.NEXORA_GEMINI_LIVE === "1";
            const svc = new OrdersService(s, {
              gemini: live
                ? geminiConfigFromEnv()
                : {
                    enabled: true,
                    apiKey: "test-only",
                    freeTierConfirmed: true,
                    model: "gemini-3.5-flash-lite",
                    maxDailyRequests: 5,
                  },
              ...(!live
                ? {
                    geminiAdapter: {
                      extract: async () => ({
                        output: {
                          deliveryDate: null,
                          lines: [
                            {
                              originalText: body,
                              sku: p.data.sku,
                              quantity: 1,
                              unit: p.data.unit,
                              confidence: 1,
                            },
                          ],
                        },
                      }),
                    },
                  }
                : {}),
              allowMockClient: true,
              erpProvider: "mock",
            });
            const m = await svc.createMessage(
              t,
              {
                channel: "MANUAL",
                sender: `poc-${randomUUID()}@example.test`,
                subject: "Gemini functional acceptance",
                body,
                clientId: c.id,
                centerId: center.id,
                requestedDate: "2030-01-07",
              },
              actor,
            );
            let o = await svc.processGemini(
              t,
              m.id,
              { version: m.version, demoConfirmed: true },
              actor,
            );
            let v = await svc.view(t, o.id);
            assert.equal(v.lines.length, 1);
            assert.equal(v.lines[0].data.productId, p.id);
            assert.equal(v.lines[0].data.reviewAccepted, false);
            const save = async (quantity) => {
              v = await svc.view(t, o.id);
              return svc.saveReview(
                t,
                o.id,
                {
                  version: v.order.version,
                  clientId: c.id,
                  centerId: center.id,
                  deliveryDate: "2030-01-07",
                  lines: v.lines.map((l) => ({
                    id: l.id,
                    version: l.version,
                    productId: p.id,
                    quantity,
                    unit: p.data.unit,
                    reviewAccepted: true,
                  })),
                },
                actor,
              );
            };
            v = await save(1);
            o = await svc.submitOriginal(
              t,
              o.id,
              v.order.version,
              actor,
              "POC fictitious original message",
            );
            v = await save(2);
            o = v.order;
            assert(o.data.commercialRevision > o.data.submittedRevision);
            await assert.rejects(
              () => svc.approve(t, o.id, o.version, actor),
              /Customer acceptance/,
            );
            o = await svc.requestAcceptance(t, o.id, o.version, actor);
            const obsolete = o;
            o = await svc.reopen(t, o.id, o.version, actor);
            v = await save(3);
            o = v.order;
            await assert.rejects(
              () =>
                svc.customerDecision(
                  t,
                  o.id,
                  {
                    version: o.version,
                    revision: obsolete.data.commercialRevision,
                    decision: "ACCEPTED",
                    evidence: "Obsolete POC decision",
                  },
                  {
                    kind: "MOCK",
                    tenantId: t,
                    clientId: c.id,
                    actorId: actor,
                    subject: "POC simulated customer",
                  },
                ),
              /obsolete revision/,
            );
            o = await svc.requestAcceptance(t, o.id, o.version, actor);
            o = await svc.customerDecision(
              t,
              o.id,
              {
                version: o.version,
                revision: o.data.commercialRevision,
                decision: "ACCEPTED",
                evidence:
                  "POC simulated acceptance after correction to 3 units",
              },
              {
                kind: "MOCK",
                tenantId: t,
                clientId: c.id,
                actorId: actor,
                subject: "POC simulated customer",
              },
            );
            o = await svc.approve(t, o.id, o.version, actor);
            assert.equal(o.data.approvedRevision, o.data.commercialRevision);
            await svc.queueErp(t, o.id, o.version, actor);
            o = await s.get(t, "orders", o.id);
            o = await svc.dispatchErp(
              t,
              o.id,
              o.version,
              actor,
              "TIMEOUT_AFTER_ACCEPT",
            );
            assert.equal(o.data.erpState, "ERROR");
            o = await svc.dispatchErp(t, o.id, o.version, actor, "SUCCESS");
            assert.equal(o.data.erpState, "ACCEPTED");
            assert(o.data.externalOrderId.startsWith("MOCK-ERP-"));
            const final = await svc.view(t, o.id);
            assert.equal(final.erpAttempts.length, 2);
            assert.equal(final.erpDelivery.data.state, "ACCEPTED");
            assert.equal(
              (await svc.dispatchErp(t, o.id, o.version, actor, "SUCCESS")).id,
              o.id,
            );
            assert.equal(
              (await s.list(t, "mockErpReceipts")).filter(
                (r) => r.data.externalId === o.data.externalOrderId,
              ).length,
              1,
            );
            assert.equal(
              (await s.get(t, "products", p.id)).data.stock,
              p.data.stock,
            );
            assert.equal(await s.get("other-company", "orders", o.id), null);
            evidence = {
              provider: live ? "LIVE_GEMINI" : "SIMULATED_GEMINI",
              proposal: "IN_REVIEW",
              correctedQuantity: 3,
              acceptance: "MOCK_REVISION_SPECIFIC",
              approval: "APPROVED",
              erp: "MOCK_ACCEPTED",
              attempts: 2,
              receipts: 1,
              stockChanged: false,
              fixtures: "ROLLED_BACK",
            };
            throw rollback;
          }),
        (e) => e === rollback,
      );
      console.log(JSON.stringify(evidence));
    } finally {
      await s.close();
    }
  },
);
