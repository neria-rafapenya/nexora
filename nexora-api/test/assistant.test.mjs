import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AssistantAdmin,
  assistantPolicy,
  assistantSources,
  defaultAssistantConfig,
  validateAssistantConfig,
  validateKnowledge,
  handleAssistant,
} from "../src/assistant.mjs";
test("assistant configuration is bounded, read-only and cannot override policy or select arbitrary database sources", () => {
  const v = defaultAssistantConfig();
  assert.deepEqual(validateAssistantConfig(v), v);
  for (const patch of [
    { apiKey: "secret" },
    { enabled: true },
    { readOnly: false },
    { sourceIds: ["users"] },
    { sourceIds: ["catalog", "catalog"] },
    { sourceIds: "catalog" },
    { maxDailyRequests: 0 },
    { maxContextRecords: 51 },
    { maxContextRecords: 1.5 },
    { state: "LIVE" },
    { name: " " },
    { instructions: "a".repeat(4001) },
    { state: "READY", sourceIds: [] },
  ])
    assert.throws(
      () => validateAssistantConfig({ ...v, ...patch }),
      (e) => e.status === 400,
    );
  assert.deepEqual(
    validateAssistantConfig({ ...v, sourceIds: [], state: "DRAFT" }).sourceIds,
    [],
  );
  assert(Object.values(assistantPolicy).every((v) => v === true));
  assert(
    !assistantSources
      .flatMap((s) => s.resources)
      .some((r) =>
        ["users", "sessions", "settings", "memberships"].includes(r),
      ),
  );
});
test("knowledge validates publishing states, plain text, length and unknown fields", () => {
  assert.equal(
    validateKnowledge({
      title: " Guide ",
      content: " Text ",
      state: "PUBLISHED",
    }).title,
    "Guide",
  );
  for (const patch of [
    { title: "" },
    { content: " " },
    { content: "x".repeat(8001) },
    { state: "APPROVED_BY_QUALITY" },
    { tenant_id: "other" },
    { content: { sql: "select *" } },
  ])
    assert.throws(
      () =>
        validateKnowledge({
          title: "Title",
          content: "Content",
          state: "DRAFT",
          ...patch,
        }),
      (e) => e.status === 400,
    );
});
test("all assistant management routes require admin, including reads and unsupported chat routes", async () => {
  for (const role of [
    "quality",
    "read_only",
    "commercial",
    "operations_orders",
    "nutrition_menus",
  ]) {
    for (const [path, method] of [
      ["/api/assistant", "GET"],
      ["/api/assistant/config", "PUT"],
      ["/api/assistant/knowledge", "POST"],
      ["/api/assistant/knowledge/a", "DELETE"],
    ])
      await assert.rejects(
        () => handleAssistant({ path, method, role }),
        (e) => e.status === 403,
      );
  }
  assert.equal(
    await handleAssistant({ path: "/api/products", role: "admin" }),
    false,
  );
  assert.equal(
    await handleAssistant({ path: "/api/assistants", role: "admin" }),
    false,
  );
  await assert.rejects(
    () =>
      handleAssistant({
        path: "/api/assistant/chat",
        method: "POST",
        role: "admin",
        store: {},
      }),
    (e) => e.status === 404,
  );
});
test("overview reports no chat runtime and exposes only public provider settings", async () => {
  const s = { query: async () => ({ rows: [] }) };
  const result = await new AssistantAdmin(s).overview("tenant");
  assert.equal(result.config.version, 0);
  assert.equal(result.config.createdAt, null);
  assert.equal(result.runtime.available, false);
  assert.equal(result.knowledge.length, 0);
  assert(!Object.hasOwn(result.provider, "apiKey"));
});
