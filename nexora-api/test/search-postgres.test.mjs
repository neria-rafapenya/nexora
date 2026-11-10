import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.mjs";
import { ProductSearch } from "../src/product-search.mjs";
const vector = (n) => Array.from({ length: 768 }, (_, i) => (i === n ? 1 : 0));
test(
  "PostgreSQL semantic search: vectors, filters, stale exclusion, cached queries, quotas, isolation and concurrent claims; fixtures roll back",
  { skip: !process.env.NEXORA_SEARCH_DB_TEST },
  async () => {
    const s = new Store(process.env.DATABASE_URL),
      rollback = new Error("Rollback vector fixtures");
    try {
      await assert.rejects(
        () =>
          s.transaction(async () => {
            const actor = (
              await s.query(
                "SELECT user_id FROM bo.memberships WHERE tenant_id='workspace' AND role='admin' LIMIT 1",
              )
            ).rows[0]?.user_id;
            assert(actor);
            const t = "semantic-" + randomUUID(),
              other = "semantic-" + randomUUID();
            await s.query(
              "INSERT INTO bo.tenants(id,name) VALUES($1,$1),($2,$2)",
              [t, other],
            );
            const c = await s.create(
                t,
                "mainCategories",
                { name: "Pantry", active: true },
                actor,
              ),
              f = await s.create(
                t,
                "families",
                { name: "Food", temperature: "AMBIENT", mainCategoryId: c.id },
                actor,
              );
            const make = (sku, name, temperature) =>
              s.create(
                t,
                "products",
                {
                  sku,
                  name,
                  brand: "Nexora Sample",
                  familyId: f.id,
                  unit: "KG",
                  temperature,
                  active: true,
                  allergenStatus: "UNVERIFIED",
                  price: 2,
                  stock: 10,
                },
                actor,
              );
            let rice = await make("RICE", "Rice", "AMBIENT");
            const milk = await make("MILK", "Milk", "CHILLED");
            const calls = [];
            const config = {
              enabled: true,
              apiKey: "test-only",
              freeTierConfirmed: true,
              model: "gemini-embedding-001",
              maxDailyRequests: 50,
            };
            const adapter = {
              embed: async (texts, task) => {
                calls.push({ texts, task });
                return texts.map((text) =>
                  task === "RETRIEVAL_QUERY"
                    ? vector(0)
                    : vector(JSON.parse(text).sku === "RICE" ? 0 : 1),
                );
              },
            };
            const svc = new ProductSearch(s, { config, adapter });
            assert.equal((await svc.status(t)).pending, 2);
            await svc.index(t, actor, true);
            assert.equal((await svc.status(t)).indexed, 2);
            assert.equal(calls.length, 1);
            await svc.index(t, actor, true);
            assert.equal(calls.length, 1);
            const input = { q: "cereal para paella", demoConfirmed: true };
            let result = await svc.search(t, input, actor);
            assert.equal(result.records[0].id, rice.id);
            assert(Math.abs(result.records[0].score - 1) < 1e-6);
            assert.equal(result.cached, false);
            assert.equal(calls.length, 2);
            result = await svc.search(
              t,
              { ...input, q: " CEREAL  PARA PAELLA " },
              actor,
            );
            assert.equal(result.cached, true);
            assert.equal(calls.length, 2);
            result = await svc.search(
              t,
              { ...input, temperature: "CHILLED" },
              actor,
            );
            assert.deepEqual(
              result.records.map((r) => r.id),
              [milk.id],
            );
            result = await svc.search(
              t,
              { ...input, familyId: "missing" },
              actor,
            );
            assert.equal(result.records.length, 0);
            assert.equal(calls.length, 2);
            assert.equal(
              (await svc.search(other, input, actor)).records.length,
              0,
            );
            assert.equal((await svc.status(other)).indexed, 0);
            rice = await s.update(
              t,
              "products",
              rice.id,
              { ...rice.data, name: "Updated Rice" },
              rice.version,
              actor,
            );
            assert.equal((await svc.status(t)).pending, 1);
            assert(
              !(await svc.search(t, input, actor)).records.some(
                (r) => r.id === rice.id,
              ),
            );
            await svc.index(t, actor, true);
            assert.equal((await svc.status(t)).pending, 0);
            rice = await s.update(
              t,
              "products",
              rice.id,
              { ...rice.data, active: false },
              rice.version,
              actor,
            );
            assert(
              !(await svc.search(t, input, actor)).records.some(
                (r) => r.id === rice.id,
              ),
            );
            const cap = new ProductSearch(s, {
              config: { ...config, maxDailyRequests: 1 },
              adapter,
            });
            await assert.rejects(
              () => cap.search(t, { ...input, q: "new query" }, actor),
              /DAILY_LIMIT/,
            );
            const count = calls.length;
            await cap.search(t, input, actor);
            assert.equal(calls.length, count);
            const claim = await svc.claim(t, "INDEX", "hash", 1, actor);
            await assert.rejects(
              () => svc.claim(t, "INDEX", "other", 1, actor),
              /IN_PROGRESS/,
            );
            await svc.finish(t, claim, "EMBEDDINGS_TEST");
            const failure = new ProductSearch(s, {
              config,
              adapter: {
                embed: async () => {
                  throw Error("secret-test-only provider detail");
                },
              },
            });
            await assert.rejects(
              () => failure.search(t, { ...input, q: "failing query" }, actor),
              /EMBEDDINGS_PROCESSING_FAILED/,
            );
            assert.equal(
              (
                await s.query(
                  "SELECT count(*)::int AS n FROM bo.embedding_requests WHERE tenant_id=$1 AND state='FAILED'",
                  [t],
                )
              ).rows[0].n,
              2,
            );
            assert(
              !JSON.stringify(
                (
                  await s.query(
                    "SELECT * FROM bo.embedding_requests WHERE tenant_id=$1",
                    [t],
                  )
                ).rows,
              ).includes("secret-test-only"),
            );
            const changing = new ProductSearch(s, {
              config,
              adapter: {
                embed: async () => {
                  const freshMilk = await s.get(t, "products", milk.id);
                  await s.update(
                    t,
                    "products",
                    milk.id,
                    { ...freshMilk.data, name: "Changed during query" },
                    freshMilk.version,
                    actor,
                  );
                  return [vector(1)];
                },
              },
            });
            assert.equal(
              (
                await changing.search(
                  t,
                  { ...input, q: "network race query" },
                  actor,
                )
              ).records.length,
              0,
            );
            assert.equal((await changing.status(t)).pending, 1);
            // The database rejects linking a vector to a product belonging to another tenant.
            await s.query("SAVEPOINT vector_fk");
            await assert.rejects(
              () =>
                s.query(
                  "UPDATE bo.product_embeddings SET tenant_id=$1 WHERE tenant_id=$2 AND product_id=$3",
                  [other, t, milk.id],
                ),
              (e) => e.code === "23503",
            );
            await s.query("ROLLBACK TO SAVEPOINT vector_fk");
            throw rollback;
          }),
        (e) => e === rollback,
      );
    } finally {
      await s.close();
    }
  },
);
