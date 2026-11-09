import { newWorkflowFields } from "./workflow-schema.mjs";
import { commercialSnapshot, snapshotHash } from "./workflow-rules.mjs";
export async function migrateWorkflow(store) {
  if (
    (await store.query("SELECT 1 FROM bo.migrations WHERE version=5")).rowCount
  )
    return;
  const refs = {
    orderApprovals: { orderId: "orders" },
    erpDeliveries: { orderId: "orders" },
    erpAttempts: { orderId: "orders", deliveryId: "erpDeliveries" },
    erpChangeRequests: { orderId: "orders", deliveryId: "erpDeliveries" },
  };
  for (const table of new Set(
    Object.values(refs).flatMap((v) => Object.values(v)),
  ))
    await store.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${table}_tenant_id_id" ON bo."${table}"(tenant_id,id)`,
    );
  for (const [table, fields] of Object.entries(refs))
    for (const [field, target] of Object.entries(fields)) {
      const col = field.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
      await store.query(
        `ALTER TABLE bo."${table}" ADD COLUMN IF NOT EXISTS "${col}" TEXT GENERATED ALWAYS AS(data->>'${field}') STORED; ALTER TABLE bo."${table}" ADD CONSTRAINT "${table}_${field}_fk" FOREIGN KEY(tenant_id,"${col}") REFERENCES bo."${target}"(tenant_id,id) ON DELETE RESTRICT; CREATE INDEX IF NOT EXISTS "${table}_${field}_index" ON bo."${table}"(tenant_id,"${col}");`,
      );
    }
  await store.query(
    `CREATE UNIQUE INDEX IF NOT EXISTS erp_outbox_key_unique ON bo."erpDeliveries"(tenant_id,(data->>'idempotencyKey')); CREATE UNIQUE INDEX IF NOT EXISTS erp_attempt_number_unique ON bo."erpAttempts"(tenant_id,(data->>'deliveryId'),(data->>'number')); CREATE UNIQUE INDEX IF NOT EXISTS mock_erp_key_unique ON bo."mockErpReceipts"(tenant_id,(data->>'idempotencyKey'));`,
  );
  for (const { id: t } of (await store.query("SELECT id FROM bo.tenants"))
    .rows) {
    await store.lock(t);
    const products = await store.list(t, "products"),
      clients = await store.list(t, "clients"),
      centers = await store.list(t, "centers"),
      lines = await store.list(t, "orderLines");
    for (const order of await store.list(t, "orders")) {
      const legacy = ["CONFIRMED", "EXPORTED"].includes(order.data.state);
      const snapshot = commercialSnapshot(
        order,
        lines.filter((l) => l.data.orderId === order.id),
        products,
        clients.find((c) => c.id === order.data.clientId),
        centers.find((c) => c.id === order.data.centerId),
      );
      await store.update(
        t,
        "orders",
        order.id,
        {
          ...order.data,
          ...newWorkflowFields(),
          state: legacy ? "APPROVED" : order.data.state,
          commercialHash: snapshotHash(snapshot),
          legacyStockReserved: legacy,
          approvedRevision: legacy ? 1 : null,
          approvedAt: legacy ? order.data.confirmedAt : null,
          approvedPayload: legacy ? snapshot : {},
          erpState: "NOT_SENT",
          externalOrderId: null,
        },
        order.version,
        null,
      );
    }
  }
  await store.query("INSERT INTO bo.migrations(version) VALUES(5)");
}
