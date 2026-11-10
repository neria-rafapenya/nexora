export async function migrateMenuDetails(s) {
  if ((await s.query("SELECT 1 FROM bo.migrations WHERE version=7")).rowCount)
    return;
  const refs = {
    nutritionProfiles: { productId: "products" },
    dietMenuRules: { dietId: "diets" },
    productTechnicalReviews: { productId: "products" },
    menuPurchaseLinks: { planId: "menuPlans", orderId: "orders" },
  };
  for (const target of new Set(Object.values(refs).flatMap(Object.values)))
    await s.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${target}_tenant_id_id" ON bo."${target}"(tenant_id,id)`,
    );
  for (const [table, fields] of Object.entries(refs))
    for (const [field, target] of Object.entries(fields)) {
      const col = field.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
      await s.query(
        `ALTER TABLE bo."${table}" ADD COLUMN "${col}" TEXT GENERATED ALWAYS AS(data->>'${field}') STORED; ALTER TABLE bo."${table}" ADD CONSTRAINT "${table}_${field}_fk" FOREIGN KEY(tenant_id,"${col}") REFERENCES bo."${target}"(tenant_id,id) ON DELETE RESTRICT`,
      );
    }
  await s.query(
    `CREATE UNIQUE INDEX nutrition_product_unique ON bo."nutritionProfiles"(tenant_id,(data->>'productId')); CREATE UNIQUE INDEX diet_service_rule_unique ON bo."dietMenuRules"(tenant_id,(data->>'dietId'),(data->>'service')); CREATE UNIQUE INDEX menu_purchase_group_unique ON bo."menuPurchaseLinks"(tenant_id,(data->>'planId'),(data->>'planHash'),(data->>'groupKey'));`,
  );
  for (const { id: t } of (await s.query("SELECT id FROM bo.tenants")).rows) {
    await s.lock(t);
    for (const p of await s.list(t, "menuPlans")) {
      const frozen = ["PUBLISHED", "ARCHIVED"].includes(p.data.state);
      await s.update(
        t,
        "menuPlans",
        p.id,
        {
          ...p.data,
          supply: { overrides: [], deliveries: [], inventory: [] },
          ...(!frozen
            ? { state: "DRAFT", nutritionApproval: {}, qualityApproval: {} }
            : {}),
        },
        p.version,
        null,
      );
    }
  }
  await s.query("INSERT INTO bo.migrations(version) VALUES(7)");
}
