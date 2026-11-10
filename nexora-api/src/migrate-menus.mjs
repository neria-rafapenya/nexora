export async function migrateMenus(store) {
  if (
    (await store.query("SELECT 1 FROM bo.migrations WHERE version=6")).rowCount
  )
    return;
  const refs = {
    ingredientProducts: {
      ingredientId: "menuIngredients",
      productId: "products",
    },
    recipes: { clientId: "clients" },
    recipeVersions: { recipeId: "recipes" },
    menuPlans: { clientId: "clients", parentId: "menuPlans" },
  };
  for (const target of new Set(Object.values(refs).flatMap(Object.values)))
    await store.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "${target}_tenant_id_id" ON bo."${target}"(tenant_id,id)`,
    );
  for (const [table, fields] of Object.entries(refs))
    for (const [field, target] of Object.entries(fields)) {
      const col = field.replace(/[A-Z]/g, (c) => "_" + c.toLowerCase());
      await store.query(
        `ALTER TABLE bo."${table}" ADD COLUMN "${col}" TEXT GENERATED ALWAYS AS(data->>'${field}') STORED; ALTER TABLE bo."${table}" ADD CONSTRAINT "${table}_${field}_fk" FOREIGN KEY(tenant_id,"${col}") REFERENCES bo."${target}"(tenant_id,id) ON DELETE RESTRICT`,
      );
    }
  await store.query(
    `CREATE UNIQUE INDEX ingredient_mapping_unique ON bo."ingredientProducts"(tenant_id,(data->>'ingredientId')); CREATE UNIQUE INDEX recipe_revision_unique ON bo."recipeVersions"(tenant_id,(data->>'recipeId'),(data->>'revision')); INSERT INTO bo.migrations(version) VALUES(6)`,
  );
}
