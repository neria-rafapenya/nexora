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
            const service = new OrdersService(store),
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
            throw rollback;
          }),
        (e) => e === rollback,
      );
    } finally {
      await store.close();
    }
  },
);
