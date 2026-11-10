export async function migrateAi(s) {
  if ((await s.query("SELECT 1 FROM bo.migrations WHERE version=10")).rowCount)
    return;
  for (const target of ["inboxMessages", "orders"])
    await s.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${target}_tenant_id_id" ON bo."${target}"(tenant_id,id)`,
    );
  for (const [field, target] of Object.entries({
    messageId: "inboxMessages",
    orderId: "orders",
  })) {
    const col = field.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
    await s.query(
      `ALTER TABLE bo."aiOrderRequests" ADD COLUMN "${col}" TEXT GENERATED ALWAYS AS(data->>'${field}') STORED; ALTER TABLE bo."aiOrderRequests" ADD CONSTRAINT "aiOrderRequests_${field}_fk" FOREIGN KEY(tenant_id,"${col}") REFERENCES bo."${target}"(tenant_id,id) ON DELETE RESTRICT`,
    );
  }
  await s.query(
    `CREATE UNIQUE INDEX ai_order_inflight_unique ON bo."aiOrderRequests"(tenant_id,(data->>'messageId')) WHERE data->>'state'='PROCESSING'; CREATE INDEX ai_order_daily_usage ON bo."aiOrderRequests"(tenant_id,(data->>'day')); INSERT INTO bo.migrations(version) VALUES(10)`,
  );
}
