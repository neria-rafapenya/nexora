export async function migrateDocuments(s) {
  if ((await s.query("SELECT 1 FROM bo.migrations WHERE version=8")).rowCount)
    return;
  const refs = {
    supplierDocuments: { supplierId: "suppliers" },
    documentFiles: { documentId: "supplierDocuments" },
    documentVersions: {
      documentId: "supplierDocuments",
      fileId: "documentFiles",
    },
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
    `CREATE UNIQUE INDEX document_revision_unique ON bo."documentVersions"(tenant_id,(data->>'documentId'),(data->>'number')); INSERT INTO bo.migrations(version) VALUES(8)`,
  );
}
