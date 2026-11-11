import { Store } from "../nexora-api/src/store.mjs";
import { writeFile } from "node:fs/promises";
const s = new Store(process.env.DATABASE_URL);
try {
  await s.transaction(async () => {
    await s.lock("cuinora-brand-migration");
    const configs = (
      await s.query(
        "SELECT * FROM bo.assistant_config WHERE data->>'name' ILIKE '%horekia%' FOR UPDATE",
      )
    ).rows;
    const tenants = (
      await s.query(
        "SELECT * FROM bo.tenants WHERE name='Horekia Workspace' FOR UPDATE",
      )
    ).rows;
    const path = process.argv.find((x) => x.startsWith("--backup="))?.slice(9);
    if (!path) throw Error("Private backup required");
    await writeFile(path, JSON.stringify({ configs, tenants }), {
      mode: 0o600,
      flag: "wx",
    });
    for (const r of configs) {
      const name = r.data.name.replace(/horekia/gi, "Cuinora");
      await s.query(
        "UPDATE bo.assistant_config SET data=jsonb_set(data,'{name}',to_jsonb($1::text)),version=version+1,updated_at=now() WHERE tenant_id=$2",
        [name, r.tenant_id],
      );
      await s.log(
        r.tenant_id,
        null,
        "REBRAND_CUINORA",
        "assistantConfig",
        r.tenant_id,
        { name: r.data.name },
        { name },
      );
    }
    for (const r of tenants) {
      await s.query(
        "UPDATE bo.tenants SET name='Cuinora Workspace' WHERE id=$1",
        [r.id],
      );
      await s.log(
        r.id,
        null,
        "REBRAND_CUINORA",
        "company",
        r.id,
        { name: r.name },
        { name: "Cuinora Workspace" },
      );
    }
    console.log(
      JSON.stringify({
        assistantNamesUpdated: configs.length,
        defaultCompanyNamesUpdated: tenants.length,
      }),
    );
  });
} finally {
  await s.close();
}
