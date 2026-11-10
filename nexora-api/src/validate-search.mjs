import assert from "node:assert/strict";
import { Store } from "./store.mjs";
import { ProductSearch } from "./product-search.mjs";
const s = new Store(process.env.DATABASE_URL);
try {
  const t = "workspace",
    actor = (
      await s.query(
        "SELECT user_id FROM bo.memberships WHERE tenant_id=$1 AND role='admin' LIMIT 1",
        [t],
      )
    ).rows[0]?.user_id;
  assert(actor, "Existing administrator reference required");
  const service = new ProductSearch(s),
    status = await service.index(t, actor, true);
  assert.equal(status.pending, 0);
  assert.equal(status.indexed, 200);
  console.log(JSON.stringify({ index: status }));
  const cases = [
    { q: "arroz basmati para cocinar", sku: "NX-01-001" },
    { q: "aceite de oliva virgen extra", sku: "NX-04-001" },
    {
      q: "filetes de merluza congelados",
      sku: "NX-08-001",
      temperature: "FROZEN",
    },
    { q: "leche entera", sku: "NX-05-001" },
  ];
  for (const c of cases) {
    const { sku, ...input } = c;
    const result = await service.search(
      t,
      { ...input, demoConfirmed: true, limit: 5 },
      actor,
    );
    assert(
      result.records.some((r) => r.data.sku === sku),
      `Expected ${sku} in top 5 for ${c.q}`,
    );
    console.log(
      JSON.stringify({
        query: c.q,
        passed: true,
        cached: result.cached,
        results: result.records.map((r) => ({
          sku: r.data.sku,
          name: r.data.name,
          score: r.score,
        })),
      }),
    );
  }
  const again = await service.search(
    t,
    { q: cases[0].q, demoConfirmed: true, limit: 5 },
    actor,
  );
  assert.equal(again.cached, true);
  console.log(JSON.stringify({ queryCacheReused: true }));
} catch (e) {
  console.error(
    JSON.stringify({
      ok: false,
      code: e.code ?? "SEARCH_ACCEPTANCE_FAILED",
      message: e.code ? undefined : e.message,
    }),
  );
  process.exitCode = 1;
} finally {
  await s.close();
}
