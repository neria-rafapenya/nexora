import { Store } from "./store.mjs";
import { resources } from "./schema.mjs";
const store = new Store(process.env.DATABASE_URL);
try {
  await store.query("SELECT 1");
  const counts = {};
  for (const r of Object.keys(resources))
    counts[r] = (await store.list("workspace", r)).length;
  console.log(JSON.stringify({ connected: true, counts }, null, 2));
} catch (e) {
  console.error("Database verification failed:", e.code ?? e.message);
  process.exitCode = 1;
} finally {
  await store.close();
}
