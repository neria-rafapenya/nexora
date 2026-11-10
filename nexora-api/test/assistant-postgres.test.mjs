import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Store } from "../src/store.mjs";
import { AssistantAdmin, defaultAssistantConfig } from "../src/assistant.mjs";
test(
  "PostgreSQL assistant: migration, tenant isolation, optimistic versions, lifecycle and audit; all fixtures roll back",
  { skip: !process.env.NEXORA_ASSISTANT_DB_TEST },
  async () => {
    const s = new Store(process.env.DATABASE_URL),
      rollback = new Error("Rollback assistant fixtures");
    try {
      await assert.rejects(
        () =>
          s.transaction(async () => {
            await s.migrate();
            const actor = (
              await s.query(
                "SELECT user_id FROM bo.memberships WHERE tenant_id='workspace' AND role='admin' LIMIT 1",
              )
            ).rows[0]?.user_id;
            assert(actor);
            const a = "assistant-a-" + randomUUID(),
              b = "assistant-b-" + randomUUID();
            for (const id of [a, b])
              await s.query("INSERT INTO bo.tenants(id,name) VALUES($1,$1)", [
                id,
              ]);
            const service = new AssistantAdmin(s);
            assert.equal((await service.overview(a)).runtime.available, false);
            let config = await service.saveConfig(
              a,
              {
                data: { ...defaultAssistantConfig(), state: "READY" },
                version: 0,
              },
              actor,
            );
            assert.equal(config.version, 1);
            assert(config.createdAt);
            assert(config.updatedAt);
            await assert.rejects(
              () =>
                service.saveConfig(
                  a,
                  { data: defaultAssistantConfig(), version: 0 },
                  actor,
                ),
              (e) => e.status === 409,
            );
            config = await service.saveConfig(
              a,
              { data: { ...config.data, name: "Updated" }, version: 1 },
              actor,
            );
            assert.equal(config.version, 2);
            assert.equal((await service.config(b)).version, 0);
            let article = await service.saveKnowledge(
              a,
              null,
              {
                data: {
                  title: "Guide",
                  content: "Fictitious guidance",
                  state: "DRAFT",
                },
                version: 0,
              },
              actor,
            );
            assert(article.createdAt);
            assert.equal(article.version, 1);
            await assert.rejects(
              () =>
                service.saveKnowledge(
                  b,
                  article.id,
                  { version: 1 },
                  actor,
                  true,
                ),
              (e) => e.status === 404,
            );
            await assert.rejects(
              () =>
                service.saveKnowledge(
                  a,
                  article.id,
                  { data: article.data, version: 0 },
                  actor,
                ),
              (e) => e.status === 409,
            );
            article = await service.saveKnowledge(
              a,
              article.id,
              { data: { ...article.data, state: "PUBLISHED" }, version: 1 },
              actor,
            );
            assert.equal(article.data.state, "PUBLISHED");
            assert.equal(article.version, 2);
            assert.equal((await service.overview(b)).knowledge.length, 0);
            assert.equal((await service.overview(b)).activity.length, 0);
            await assert.rejects(
              () =>
                service.saveKnowledge(
                  a,
                  article.id,
                  { version: 1 },
                  actor,
                  true,
                ),
              (e) => e.status === 409,
            );
            await service.saveKnowledge(
              a,
              article.id,
              { version: 2 },
              actor,
              true,
            );
            const view = await service.overview(a);
            assert.equal(view.knowledge.length, 0);
            assert.equal(view.activity.length, 5);
            assert.equal(
              (
                await s.query(
                  "SELECT 1 FROM pg_class WHERE relnamespace='bo'::regnamespace AND relname IN ('assistant_config','assistant_knowledge') AND relrowsecurity",
                )
              ).rowCount,
              2,
            );
            assert.equal(
              (
                await s.query(
                  "SELECT 1 FROM bo.audit WHERE tenant_id=$1 AND resource='assistantKnowledge' AND action='DELETE' AND before_data->>'state'='PUBLISHED'",
                  [a],
                )
              ).rowCount,
              1,
            );
            throw rollback;
          }),
        (e) => e === rollback,
      );
    } finally {
      await s.close();
    }
  },
);
