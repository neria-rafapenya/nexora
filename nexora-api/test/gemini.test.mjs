import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GeminiOrderAdapter,
  geminiPublicConfig,
  validateGeminiOutput,
} from "../src/gemini.mjs";
import { OrdersService } from "../src/orders.mjs";
import { MenuStore } from "./helpers/menu-store.mjs";
const config = {
  enabled: true,
  apiKey: "test-secret",
  freeTierConfirmed: true,
  model: "gemini-2.5-flash-lite",
  maxDailyRequests: 2,
};
const text = "2 KG Test Rice";
const output = {
  deliveryDate: null,
  lines: [
    {
      originalText: text,
      sku: "SKU-A",
      quantity: 2,
      unit: "KG",
      confidence: 1,
    },
  ],
};
test("Gemini adapter sends only extraction data, validates structured output and hides key", async () => {
  let calls = 0;
  const adapter = new GeminiOrderAdapter(config, {
    fetchImpl: async (url, options) => {
      calls++;
      assert(!url.includes(config.apiKey));
      assert.equal(options.headers["x-goog-api-key"], config.apiKey);
      const sent = JSON.parse(
        JSON.parse(options.body).contents[0].parts[0].text,
      );
      assert.deepEqual(sent, {
        message: text,
        catalog: [{ sku: "SKU-A", name: "Test Rice", unit: "KG" }],
      });
      return new Response(
        JSON.stringify({
          candidates: [
            {
              finishReason: "STOP",
              content: { parts: [{ text: JSON.stringify(output) }] },
            },
          ],
          usageMetadata: { promptTokenCount: 50, candidatesTokenCount: 20 },
        }),
      );
    },
  });
  const result = await adapter.extract({
    text,
    catalog: [
      { id: "private", sku: "SKU-A", name: "Test Rice", unit: "KG", price: 99 },
    ],
  });
  assert.deepEqual(result.output, output);
  assert.equal(result.usage.inputTokens, 50);
  assert.equal(calls, 1);
  assert(!JSON.stringify(geminiPublicConfig(config)).includes(config.apiKey));
  for (const change of [
    { enabled: false },
    { apiKey: "" },
    { freeTierConfirmed: false },
    { model: "not-allowed" },
  ]) {
    await assert.rejects(() =>
      new GeminiOrderAdapter(
        { ...config, ...change },
        {
          fetchImpl: () => {
            throw Error("must not call");
          },
        },
      ).extract({ text, catalog: [] }),
    );
  }
});
test("Gemini rejects fabricated, malformed and truncated responses; quota errors have no retry", async () => {
  for (const bad of [
    { ...output, price: 1 },
    { ...output, deliveryDate: "2030-02-30" },
    { ...output, lines: [{ ...output.lines[0], originalText: "invented" }] },
    { ...output, lines: [{ ...output.lines[0], quantity: -1 }] },
  ])
    assert.throws(
      () => validateGeminiOutput(bad, text),
      /GEMINI_INVALID_OUTPUT/,
    );
  let calls = 0;
  await assert.rejects(
    () =>
      new GeminiOrderAdapter(config, {
        fetchImpl: async () => {
          calls++;
          return new Response("secret provider error", { status: 429 });
        },
      }).extract({ text, catalog: [] }),
    /GEMINI_RATE_LIMITED/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      new GeminiOrderAdapter(config, {
        fetchImpl: async () =>
          new Response(
            JSON.stringify({ candidates: [{ finishReason: "MAX_TOKENS" }] }),
          ),
      }).extract({ text, catalog: [] }),
    /GEMINI_INVALID_OUTPUT/,
  );
});
async function fixture(adapter) {
  const s = new MenuStore();
  const cat = await s.create("t", "mainCategories", {
    name: "Test",
    active: true,
  });
  const family = await s.create("t", "families", {
    name: "Test",
    temperature: "AMBIENT",
    mainCategoryId: cat.id,
  });
  const product = await s.create("t", "products", {
    sku: "SKU-A",
    name: "Test Rice",
    familyId: family.id,
    temperature: "AMBIENT",
    unit: "KG",
    stock: 10,
    price: 2.5,
    brand: "Nexora Sample",
    active: true,
    allergenStatus: "UNVERIFIED",
  });
  const svc = new OrdersService(s, { gemini: config, geminiAdapter: adapter });
  const m = await svc.createMessage("t", {
    channel: "EMAIL",
    sender: "demo@example.test",
    subject: "Demo",
    body: text,
  });
  return { s, svc, m, product };
}
test("AI proposal requires review, uses server prices and is idempotent without stock or ERP effects", async () => {
  let calls = 0;
  const f = await fixture({
    extract: async () => {
      calls++;
      return { output, usage: { inputTokens: 50, outputTokens: 20 } };
    },
  });
  const input = { version: f.m.version, demoConfirmed: true };
  const o = await f.svc.processGemini("t", f.m.id, input, "actor");
  assert.equal(o.data.state, "IN_REVIEW");
  assert.equal(o.data.origin, "AI_MESSAGE");
  assert.equal(o.data.totalCents, 500);
  const lines = await f.s.list("t", "orderLines");
  assert.equal(lines[0].data.reviewAccepted, false);
  assert.equal(lines[0].data.confidence, 0.8);
  assert.equal((await f.s.get("t", "products", f.product.id)).data.stock, 10);
  assert.equal((await f.s.list("t", "aiOrderRuns"))[0].data.costCents, null);
  assert.equal(
    (await f.s.list("t", "aiOrderRequests"))[0].data.state,
    "SUCCEEDED",
  );
  assert.equal(
    (await f.svc.processGemini("t", f.m.id, input, "actor")).id,
    o.id,
  );
  assert.equal(calls, 1);
  assert.equal((await f.svc.aiStatus("other")).usedToday, 0);
});
test("failed calls count toward quota and never create partial orders or leak provider errors", async () => {
  let calls = 0;
  const f = await fixture({
    extract: async () => {
      calls++;
      throw new Error("test-secret raw provider failure");
    },
  });
  for (let n = 0; n < 2; n++)
    await assert.rejects(
      () =>
        f.svc.processGemini(
          "t",
          f.m.id,
          { version: 1, demoConfirmed: true },
          "actor",
        ),
      /GEMINI_PROCESSING_FAILED/,
    );
  await assert.rejects(
    () =>
      f.svc.processGemini(
        "t",
        f.m.id,
        { version: 1, demoConfirmed: true },
        "actor",
      ),
    /GEMINI_DAILY_LIMIT/,
  );
  assert.equal(calls, 2);
  assert.equal((await f.s.list("t", "orders")).length, 0);
  assert(!JSON.stringify(f.s.rows).includes("test-secret"));
});
test("source changes and competing processing cannot silently replace a proposal", async () => {
  let resolve;
  const f = await fixture({ extract: () => new Promise((r) => (resolve = r)) });
  const pending = f.svc.processGemini(
    "t",
    f.m.id,
    { version: 1, demoConfirmed: true },
    "actor",
  );
  while (!resolve) await new Promise((r) => setImmediate(r));
  await assert.rejects(
    () =>
      f.svc.processGemini(
        "t",
        f.m.id,
        { version: 1, demoConfirmed: true },
        "actor",
      ),
    /GEMINI_REQUEST_IN_PROGRESS/,
  );
  await assert.rejects(
    () => f.svc.processMessage("t", f.m.id, 1, "actor"),
    /GEMINI_REQUEST_IN_PROGRESS/,
  );
  await f.s.update(
    "t",
    "inboxMessages",
    f.m.id,
    { ...f.m.data, body: "changed" },
    1,
    "actor",
  );
  resolve({ output });
  await assert.rejects(() => pending, /GEMINI_INPUT_CHANGED/);
  assert.equal((await f.s.list("t", "orders")).length, 0);
});

test(
  "PostgreSQL Gemini proposal persists atomically with tenant references; test data rolls back",
  { skip: !process.env.NEXORA_AI_DB_TEST },
  async () => {
    const { Store } = await import("../src/store.mjs");
    const s = new Store(process.env.DATABASE_URL),
      rollback = new Error("AI fixture rollback");
    try {
      await assert.rejects(
        () =>
          s.transaction(async () => {
            const t = "workspace";
            await s.lock(t);
            const actor = (
              await s.query(
                "SELECT user_id FROM bo.memberships WHERE tenant_id=$1 AND role='admin' LIMIT 1",
                [t],
              )
            ).rows[0]?.user_id;
            assert(actor);
            const product = (await s.list(t, "products")).find(
              (p) => p.data.brand === "Nexora Sample" && p.data.active,
            );
            assert(product);
            const body = "2 " + product.data.unit + " " + product.data.name;
            const service = new OrdersService(s, {
              gemini: { ...config, maxDailyRequests: 100 },
              geminiAdapter: {
                extract: async () => ({
                  output: {
                    deliveryDate: null,
                    lines: [
                      {
                        originalText: body,
                        sku: product.data.sku,
                        quantity: 2,
                        unit: product.data.unit,
                        confidence: 1,
                      },
                    ],
                  },
                  usage: { inputTokens: 30, outputTokens: 20 },
                }),
              },
            });
            const message = await service.createMessage(
              t,
              {
                channel: "EMAIL",
                sender: "ai-rollback@example.test",
                subject: "AI rollback " + Date.now(),
                body,
              },
              actor,
            );
            const order = await service.processGemini(
              t,
              message.id,
              { version: message.version, demoConfirmed: true },
              actor,
            );
            assert.equal(order.data.state, "IN_REVIEW");
            assert.equal(order.data.origin, "AI_MESSAGE");
            assert.equal(
              (await s.list(t, "aiOrderRequests")).find(
                (r) => r.data.orderId === order.id,
              ).data.state,
              "SUCCEEDED",
            );
            assert.equal(
              (await s.get(t, "products", product.id)).data.stock,
              product.data.stock,
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
