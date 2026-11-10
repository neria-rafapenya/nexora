export async function migrateWaste(s) {
  if ((await s.query("SELECT 1 FROM bo.migrations WHERE version=9")).rowCount)
    return;
  const refs = {
    wasteEvents: {
      centerId: "centers",
      menuPlanId: "menuPlans",
      dietId: "diets",
      productId: "products",
      recipeVersionId: "recipeVersions",
    },
    serviceActuals: {
      centerId: "centers",
      menuPlanId: "menuPlans",
      dietId: "diets",
    },
    wasteActions: { centerId: "centers" },
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
  for (const table of Object.keys(refs))
    await s.query(
      `CREATE UNIQUE INDEX "${table}_create_key" ON bo."${table}"(tenant_id,(data->>'createKey'))`,
    );
  await s.query(
    `CREATE UNIQUE INDEX actual_service_confirmed_unique ON bo."serviceActuals"(tenant_id,(data->>'centerId'),(data->>'date'),(data->>'service'),(data->>'dietId')) WHERE data->>'state'='RECORDED'; INSERT INTO bo.migrations(version) VALUES(9)`,
  );
}
