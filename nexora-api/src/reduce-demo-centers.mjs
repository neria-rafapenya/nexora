import { Store } from "./store.mjs";
import { writeFile } from "node:fs/promises";
const s = new Store(process.env.DATABASE_URL);
const names = [
  "Demo Northfield School - Site 1",
  "Demo Silverwood Care - Site 1",
  "Demo Riverside Hospital - Site 1",
];
const contains = (v, ids) =>
  typeof v === "string"
    ? ids.has(v)
    : Array.isArray(v)
      ? v.some((x) => contains(x, ids))
      : v && typeof v === "object"
        ? Object.values(v).some((x) => contains(x, ids))
        : false;
try {
  await s.transaction(async () => {
    await s.lock("workspace");
    const tables = (
      await s.query(
        "SELECT table_name FROM information_schema.columns WHERE table_schema='bo' GROUP BY table_name HAVING count(*) FILTER(WHERE column_name IN ('id','tenant_id','data'))=3 ORDER BY table_name",
      )
    ).rows.map((r) => r.table_name);
    const all = [];
    for (const table of tables) {
      if (!/^[a-zA-Z][a-zA-Z0-9_]*$/.test(table))
        throw Error("Unexpected table");
      for (const row of (
        await s.query(
          `SELECT * FROM bo."${table}" WHERE tenant_id=$1 FOR UPDATE`,
          ["workspace"],
        )
      ).rows)
        all.push({ table, row });
    }
    const centers = all.filter((x) => x.table === "centers");
    if (centers.some((x) => !x.row.data.name.startsWith("Demo ")))
      throw Error("Non-demo center found; aborting");
    const keep = centers.filter((x) => names.includes(x.row.data.name));
    if (keep.length !== 3) throw Error("Expected demo centers missing");
    const removed = new Set(
      centers
        .filter((x) => !names.includes(x.row.data.name))
        .map((x) => x.row.id),
    );
    const updates = [];
    for (const x of all) {
      if (
        Array.isArray(x.row.data.centerIds) &&
        x.row.data.centerIds.some((id) => removed.has(id))
      ) {
        const centerIds = x.row.data.centerIds.filter((id) => !removed.has(id));
        if (centerIds.length)
          updates.push({ ...x, data: { ...x.row.data, centerIds } });
        else removed.add(x.row.id);
      }
    }
    let changed = true;
    while (changed) {
      changed = false;
      for (const x of all) {
        const data =
          updates.find((u) => u.row.id === x.row.id)?.data ?? x.row.data;
        if (!removed.has(x.row.id) && contains(data, removed)) {
          removed.add(x.row.id);
          changed = true;
        }
      }
    }
    const deletions = all.filter((x) => removed.has(x.row.id));
    const edits = updates.filter((x) => !removed.has(x.row.id));
    console.log(
      JSON.stringify({
        keep: keep.map((x) => ({ id: x.row.id, ...x.row.data })),
        deleted: Object.fromEntries(
          tables
            .map((t) => [t, deletions.filter((x) => x.table === t).length])
            .filter(([, n]) => n),
        ),
        updates: edits.map((x) => ({ table: x.table, id: x.row.id })),
      }),
    );
    if (!process.argv.includes("--apply")) return;
    const backup = process.argv
      .find((x) => x.startsWith("--backup="))
      ?.slice(9);
    if (!backup) throw Error("Private backup required");
    await writeFile(
      backup,
      JSON.stringify({
        tenant: "workspace",
        at: new Date().toISOString(),
        rows: [...deletions, ...edits].map((x) => ({
          table: x.table,
          row: x.row,
        })),
      }),
      { mode: 0o600, flag: "wx" },
    );
    for (const x of edits)
      await s.query(
        `UPDATE bo."${x.table}" SET data=$1,version=version+1,updated_at=now() WHERE tenant_id=$2 AND id=$3`,
        [x.data, "workspace", x.row.id],
      );
    const pending = [...deletions];
    while (pending.length) {
      const index = pending.findIndex(
        (x) =>
          !pending.some(
            (other) =>
              other.row.id !== x.row.id &&
              contains(other.row.data, new Set([x.row.id])),
          ),
      );
      if (index < 0) throw Error("Cyclic demo dependencies; aborting");
      const [x] = pending.splice(index, 1);
      await s.query(
        `DELETE FROM bo."${x.table}" WHERE tenant_id=$1 AND id=$2`,
        ["workspace", x.row.id],
      );
    }
    if ((await s.list("workspace", "centers")).length !== 3)
      throw Error("Unexpected center count");
    await s.log(
      "workspace",
      null,
      "REDUCE_DEMO_CENTERS",
      "centers",
      null,
      null,
      {
        retained: keep.map((x) => x.row.id),
        deletedCenters: centers.length - 3,
        deletedRelatedRecords: deletions.length - (centers.length - 3),
      },
    );
  });
} finally {
  await s.close();
}
