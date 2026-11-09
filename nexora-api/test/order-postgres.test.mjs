import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.mjs";
import { OrdersService } from "../src/orders.mjs";
test(
  "PostgreSQL F2: links, review versions and FK constraints work; fixtures always roll back",
  { skip: !process.env.NEXORA_ORDER_DB_TEST },
  async () => {
    const store = new Store(process.env.DATABASE_URL),
      rollback = new Error("Rollback F2 test fixtures");
    try {
      await assert.rejects(
        () =>
          store.transaction(async () => {
            const service = new OrdersService(store, { erpProvider: "mock" }),
              client = (await store.list("workspace", "clients")).find(
                (c) => c.data.active,
              ),
              center = (await store.list("workspace", "centers")).find(
                (c) => c.data.clientId === client.id,
              ),
              product = (await store.list("workspace", "products")).find(
                (p) => p.data.active && p.data.stock > 1,
              );
            const before = product.data.stock;
            const message = await service.createMessage(
              "workspace",
              {
                channel: "MANUAL",
                sender: randomUUID() + "@example.test",
                subject: "Temporary F2 rollback test",
                body: `${product.data.sku} | 1 | ${product.data.unit}`,
                clientId: client.id,
                centerId: center.id,
                requestedDate: "2030-01-07",
              },
              null,
            );
            const proposal = await service.processMessage(
              "workspace",
              message.id,
              message.version,
              null,
            );
            const view = await service.view("workspace", proposal.id);
            assert.equal(view.lines.length, 1);
            assert.equal(view.lines[0].data.productId, product.id);
            assert.equal(view.order.data.state, "IN_REVIEW");
            assert.equal(
              (await store.get("workspace", "products", product.id)).data.stock,
              before,
            );
            const saved = await service.saveReview(
              "workspace",
              proposal.id,
              {
                version: view.order.version,
                clientId: client.id,
                centerId: center.id,
                deliveryDate: "2030-01-07",
                lines: view.lines.map((l) => ({
                  id: l.id,
                  version: l.version,
                  productId: l.data.productId,
                  quantity: 1,
                  unit: product.data.unit,
                  reviewAccepted: true,
                })),
              },
              null,
            );
            assert.equal(saved.lines[0].data.reviewAccepted, true);
            await assert.rejects(
              () =>
                service.confirm(
                  "workspace",
                  proposal.id,
                  saved.order.version,
                  null,
                ),
              /Human review/,
            );
            assert.equal(
              await store.get("other-company", "orders", proposal.id),
              null,
            );
            await store.query("SAVEPOINT f2_invalid_fk");
            await assert.rejects(
              () =>
                store.query(
                  `UPDATE bo."orderLines" SET data=jsonb_set(data,'{productId}',to_jsonb($1::text)) WHERE id=$2`,
                  [randomUUID(), saved.lines[0].id],
                ),
              (e) => e.code === "23503",
            );
            await store.query("ROLLBACK TO SAVEPOINT f2_invalid_fk");
            // Use an existing operator only inside this rollback-only business test.
            // No accounts, sessions or memberships are created or changed.
            const actor = (
              await store.query(
                "SELECT user_id FROM bo.memberships WHERE tenant_id=$1 AND role='admin' LIMIT 1",
                ["workspace"],
              )
            ).rows[0]?.user_id;
            assert(
              actor,
              "Existing workspace administrator required for rollback workflow test",
            );
            const freshCenter = await store.get(
              "workspace",
              "centers",
              center.id,
            );
            await store.update(
              "workspace",
              "centers",
              center.id,
              { ...freshCenter.data, deliveryDays: [], closedDates: [] },
              freshCenter.version,
              null,
            );
            const terms = await service.saveReview(
              "workspace",
              proposal.id,
              {
                version: saved.order.version,
                clientId: client.id,
                centerId: center.id,
                deliveryDate: "2030-01-07",
                lines: saved.lines.map((l) => ({
                  id: l.id,
                  version: l.version,
                  productId: product.id,
                  quantity: 1,
                  unit: product.data.unit,
                  reviewAccepted: true,
                })),
              },
              actor,
            );
            let o = await service.submitOriginal(
              "workspace",
              proposal.id,
              terms.order.version,
              actor,
              "Rollback test original reference",
            );
            o = await service.approve("workspace", o.id, o.version, actor);
            const delivery = await service.queueErp(
              "workspace",
              o.id,
              o.version,
              actor,
            );
            o = await store.get("workspace", "orders", o.id);
            // A timeout before acceptance leaves the transaction usable for retry.
            o = await service.dispatchErp(
              "workspace",
              o.id,
              o.version,
              actor,
              "TIMEOUT",
            );
            assert.equal(o.data.erpState, "ERROR");
            o = await service.dispatchErp(
              "workspace",
              o.id,
              o.version,
              actor,
              "SUCCESS",
            );
            assert.equal(o.data.erpState, "ACCEPTED");
            assert(o.data.externalOrderId.startsWith("MOCK-ERP-"));
            assert.equal(
              (await store.get("workspace", "products", product.id)).data.stock,
              before,
            );
            assert.equal(
              (await service.view("workspace", o.id)).erpAttempts.length,
              2,
            );
            await store.query("SAVEPOINT workflow_unique");
            await assert.rejects(
              () =>
                store.create(
                  "workspace",
                  "erpDeliveries",
                  delivery.data,
                  actor,
                ),
              (e) => e.code === "23505",
            );
            await store.query("ROLLBACK TO SAVEPOINT workflow_unique");
            await store.query("SAVEPOINT workflow_fk");
            await assert.rejects(
              () =>
                store.query(
                  `UPDATE bo."erpDeliveries" SET data=jsonb_set(data,'{orderId}',to_jsonb($1::text)) WHERE id=$2`,
                  [randomUUID(), delivery.id],
                ),
              (e) => e.code === "23503",
            );
            await store.query("ROLLBACK TO SAVEPOINT workflow_fk");
            const change = await service.requestErpCancellation(
              "workspace",
              o.id,
              o.version,
              actor,
              "Rollback cancellation test",
            );
            assert.equal(change.data.state, "PENDING");
            throw rollback;
          }),
        (e) => e === rollback,
      );
    } finally {
      await store.close();
    }
  },
);
