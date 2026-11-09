export async function migrateOrders(store) {
  if (
    (await store.query("SELECT 1 FROM bo.migrations WHERE version=4")).rowCount
  )
    return;
  const links = {
    inboxMessages: { clientId: "clients", centerId: "centers" },
    orderAttachments: { messageId: "inboxMessages" },
    orders: {
      clientId: "clients",
      centerId: "centers",
      messageId: "inboxMessages",
    },
    orderLines: {
      orderId: "orders",
      productId: "products",
      substitutionForId: "products",
    },
    orderAlerts: {
      orderId: "orders",
      clientId: "clients",
      productId: "products",
    },
    usualBaskets: {
      clientId: "clients",
      centerId: "centers",
      productId: "products",
    },
    aiOrderRuns: { messageId: "inboxMessages", orderId: "orders" },
  };
  for (const table of new Set(
    Object.values(links).flatMap((x) => Object.values(x)),
  ))
    await store.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${table}_tenant_id_id" ON bo."${table}"(tenant_id,id)`,
    );
  for (const [table, fields] of Object.entries(links))
    for (const [field, target] of Object.entries(fields)) {
      const column = field.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
      await store.query(
        `ALTER TABLE bo."${table}" ADD COLUMN IF NOT EXISTS "${column}" TEXT GENERATED ALWAYS AS (data->>'${field}') STORED; ALTER TABLE bo."${table}" ADD CONSTRAINT "${table}_${field}_fk" FOREIGN KEY(tenant_id,"${column}") REFERENCES bo."${target}"(tenant_id,id) ON DELETE RESTRICT; CREATE INDEX IF NOT EXISTS "${table}_${field}_index" ON bo."${table}"(tenant_id,"${column}");`,
      );
    }
  await store.query(`CREATE UNIQUE INDEX IF NOT EXISTS message_dedupe ON bo."inboxMessages"(tenant_id,(data->>'dedupe'));
 CREATE UNIQUE INDEX IF NOT EXISTS order_number_unique ON bo.orders(tenant_id,(data->>'number'));
 CREATE UNIQUE INDEX IF NOT EXISTS order_message_unique ON bo.orders(tenant_id,(data->>'messageId')) WHERE data->>'messageId' IS NOT NULL;
 CREATE UNIQUE INDEX IF NOT EXISTS basket_product_unique ON bo."usualBaskets"(tenant_id,(data->>'clientId'),(data->>'centerId'),(data->>'productId'));
 CREATE TABLE IF NOT EXISTS bo.order_jobs(tenant_id TEXT REFERENCES bo.tenants(id),job TEXT NOT NULL,day TEXT NOT NULL,PRIMARY KEY(tenant_id,job)); ALTER TABLE bo.order_jobs ENABLE ROW LEVEL SECURITY;
 INSERT INTO bo.migrations(version) VALUES(4);`);
}
