import { Store } from "./store.mjs";
import { fileResources } from "./file-storage.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
export async function migrateFiles(
  s,
  {
    tenantId = null,
    backupDir = process.env.FILE_MIGRATION_BACKUP_DIR ??
      resolve(s.files.root, "..", "backups"),
  } = {},
) {
  const snapshot = { at: new Date().toISOString(), files: {}, audit: [] };
  for (const r of fileResources)
    snapshot.files[r] = (
      await s.query(
        `SELECT * FROM bo."${r}" WHERE ($1::text IS NULL OR tenant_id=$1) ORDER BY tenant_id,id`,
        [tenantId],
      )
    ).rows;
  snapshot.audit = (
    await s.query(
      "SELECT * FROM bo.audit WHERE resource=ANY($1::text[]) AND ($2::text IS NULL OR tenant_id=$2) AND (before_data ? 'base64' OR after_data ? 'base64')",
      [fileResources, tenantId],
    )
  ).rows;
  await mkdir(backupDir, { recursive: true, mode: 0o700 });
  const backup = resolve(backupDir, "file-migration-" + Date.now() + ".json");
  await writeFile(backup, JSON.stringify(snapshot), {
    flag: "wx",
    mode: 0o600,
  });
  let migrated = 0,
    verified = 0;
  for (const r of fileResources)
    for (const row of snapshot.files[r])
      await s.transaction(async () => {
        await s.lock(row.tenant_id);
        const current = await s.get(row.tenant_id, r, row.id);
        if (!current) return;
        if (current.data.base64) {
          const metadata = await s.files.put(row.tenant_id, r, current.data);
          await s.query(
            `UPDATE bo."${r}" SET data=$3,version=version+1,updated_at=now() WHERE tenant_id=$1 AND id=$2`,
            [row.tenant_id, row.id, JSON.stringify(metadata)],
          );
          await s.log(
            row.tenant_id,
            null,
            "MIGRATE_PRIVATE_FILE",
            r,
            row.id,
            null,
            metadata,
          );
          migrated++;
        } else await s.files.read(row.tenant_id, r, current.data);
        verified++;
      });
  await s.query(
    "UPDATE bo.audit SET before_data=before_data-'base64',after_data=after_data-'base64' WHERE resource=ANY($1::text[]) AND ($2::text IS NULL OR tenant_id=$2) AND (before_data ? 'base64' OR after_data ? 'base64')",
    [fileResources, tenantId],
  );
  for (const r of fileResources)
    if (
      (
        await s.query(
          `SELECT 1 FROM bo."${r}" WHERE ($1::text IS NULL OR tenant_id=$1) AND (data->>'base64' IS NOT NULL OR data->>'storageKey' IS NULL) LIMIT 1`,
          [tenantId],
        )
      ).rowCount
    )
      throw Error("FILE_MIGRATION_INCOMPLETE");
  return { migrated, verified, backup };
}
if (process.argv[1]?.endsWith("/migrate-files.mjs")) {
  const s = new Store(process.env.DATABASE_URL);
  try {
    console.log(JSON.stringify(await migrateFiles(s)));
  } catch (e) {
    console.error(e.code ?? "FILE_MIGRATION_FAILED");
    process.exitCode = 1;
  } finally {
    await s.close();
  }
}
