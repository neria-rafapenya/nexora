// Runs inside the startup migration transaction. Existing product IDs are untouched.
export const categoryNames = {
  AMBIENT: "Ambient Food",
  CHILLED: "Chilled Food",
  FROZEN: "Frozen Food",
};
export async function migrateMainCategories(store) {
  if (
    (await store.query("SELECT 1 FROM bo.migrations WHERE version=3")).rowCount
  )
    return;
  const tenants = (await store.query("SELECT id FROM bo.tenants")).rows;
  for (const tenant of tenants) {
    await store.lock(tenant.id);
    for (const family of await store.list(tenant.id, "families")) {
      const name = categoryNames[family.data.temperature] ?? "General Food";
      let category = (await store.list(tenant.id, "mainCategories")).find(
        (c) => c.data.name === name,
      );
      if (!category)
        category = await store.create(
          tenant.id,
          "mainCategories",
          { name, description: null, active: true },
          null,
        );
      const { parentId: legacyParent, ...data } = family.data;
      data.mainCategoryId = category.id;
      await store.update(
        tenant.id,
        "families",
        family.id,
        data,
        family.version,
        null,
      );
    }
  }
  await store.query(`CREATE UNIQUE INDEX IF NOT EXISTS "mainCategories_tenant_id_id" ON bo."mainCategories"(tenant_id,id);
 ALTER TABLE bo.families ADD COLUMN IF NOT EXISTS main_category_id TEXT GENERATED ALWAYS AS (data->>'mainCategoryId') STORED;
 ALTER TABLE bo.families ALTER COLUMN main_category_id SET NOT NULL;
 ALTER TABLE bo.families ADD CONSTRAINT families_main_category_fk FOREIGN KEY(tenant_id,main_category_id) REFERENCES bo."mainCategories"(tenant_id,id) ON DELETE RESTRICT;
 ALTER TABLE bo.families ADD CONSTRAINT families_no_parent CHECK(NOT (data ? 'parentId'));
 ALTER TABLE bo."mainCategories" ADD CONSTRAINT main_categories_root_only CHECK(NOT (data ? 'parentId') AND NOT (data ? 'mainCategoryId'));
 INSERT INTO bo.migrations(version) VALUES(3);`);
}
