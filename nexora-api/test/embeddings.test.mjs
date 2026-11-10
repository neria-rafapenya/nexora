import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GeminiEmbeddingAdapter,
  normalizeVector,
  normalizeQuery,
  productDocuments,
  dimensions,
} from "../src/embeddings.mjs";
import { handleSearch } from "../src/search-http.mjs";
const config = {
  enabled: true,
  apiKey: "secret-test-only",
  freeTierConfirmed: true,
  model: "gemini-embedding-001",
  maxDailyRequests: 50,
};
const vector = (n = 1) =>
  Array.from({ length: dimensions }, (_, i) => (i === 0 ? n : 0));
test("embedding adapter uses bounded document/query batches, explicit task/dimension and never exposes key", async () => {
  let calls = 0;
  const a = new GeminiEmbeddingAdapter(config, {
    fetchImpl: async (url, options) => {
      calls++;
      assert(!url.includes(config.apiKey));
      assert.equal(options.headers["x-goog-api-key"], config.apiKey);
      const body = JSON.parse(options.body);
      assert.equal(body.requests[0].taskType, "RETRIEVAL_DOCUMENT");
      assert.equal(body.requests[0].outputDimensionality, 768);
      assert.deepEqual(body.requests[0].content, { parts: [{ text: "Rice" }] });
      return new Response(
        JSON.stringify({ embeddings: [{ values: vector(2) }] }),
      );
    },
  });
  const out = await a.embed(["Rice"], "RETRIEVAL_DOCUMENT");
  assert.equal(out[0][0], 1);
  assert.equal(calls, 1);
  for (const c of [
    { enabled: false },
    { apiKey: "" },
    { freeTierConfirmed: false },
  ])
    await assert.rejects(
      () =>
        new GeminiEmbeddingAdapter(
          { ...config, ...c },
          { fetchImpl: () => assert.fail() },
        ).embed(["Rice"], "RETRIEVAL_QUERY"),
      /NOT_CONFIGURED/,
    );
  await assert.rejects(
    () => a.embed(Array(21).fill("Rice"), "RETRIEVAL_DOCUMENT"),
    /INVALID_INPUT/,
  );
  assert.equal(calls, 1);
});
test("invalid vectors and failed provider responses fail closed without retries", async () => {
  for (const bad of [
    [],
    Array(768).fill(0),
    [NaN, ...vector().slice(1)],
    Array(768).fill(Infinity),
  ])
    assert.throws(() => normalizeVector(bad), /INVALID_OUTPUT/);
  let calls = 0;
  await assert.rejects(
    () =>
      new GeminiEmbeddingAdapter(config, {
        fetchImpl: async () => {
          calls++;
          return new Response("secret provider error", { status: 429 });
        },
      }).embed(["query"], "RETRIEVAL_QUERY"),
    /EMBEDDINGS_RATE_LIMITED/,
  );
  assert.equal(calls, 1);
  await assert.rejects(
    () =>
      new GeminiEmbeddingAdapter(config, {
        fetchImpl: async () => new Response(JSON.stringify({ embeddings: [] })),
      }).embed(["query"], "RETRIEVAL_QUERY"),
    /INVALID_OUTPUT/,
  );
  assert.equal(normalizeQuery("  PESCADO   congelado "), "pescado congelado");
  assert.throws(() => normalizeQuery("x"), /QUERY_REQUIRED/);
});
test("document hashes track description/family/category, exclude inactive/non-demo and ignore price/stock", () => {
  const p = {
    id: "p",
    data: {
      sku: "A",
      name: "Rice",
      familyId: "f",
      brand: "Nexora Sample",
      active: true,
      unit: "KG",
      temperature: "AMBIENT",
      price: 2,
      stock: 20,
    },
  };
  const f = [{ id: "f", data: { name: "Grains", mainCategoryId: "c" } }],
    c = [{ id: "c", data: { name: "Pantry" } }];
  const docs = productDocuments([p], f, c);
  assert.equal(docs.length, 1);
  assert(!docs[0].text.includes("price"));
  assert.equal(
    productDocuments(
      [{ ...p, data: { ...p.data, stock: 10, price: 99 } }],
      f,
      c,
    )[0].hash,
    docs[0].hash,
  );
  assert.notEqual(
    productDocuments(
      [p],
      [{ id: "f", data: { ...f[0].data, name: "Changed" } }],
      c,
    )[0].hash,
    docs[0].hash,
  );
  assert.deepEqual(
    productDocuments(
      [
        { ...p, data: { ...p.data, active: false } },
        { ...p, data: { ...p.data, brand: "Real" } },
      ],
      f,
      c,
    ),
    [],
  );
});
test("search routes enforce product read and administrator-only indexing before accessing storage", async () => {
  const base = {
    store: {},
    path: "/api/product-search/index",
    method: "POST",
    body: { demoConfirmed: true },
    tenant: "t",
    user: { id: "u" },
    send: () => assert.fail(),
  };
  for (const role of [
    "commercial",
    "read_only",
    "operations_orders",
    "quality",
    "nutrition_menus",
  ])
    await assert.rejects(
      () => handleSearch({ ...base, role }),
      (e) => e.status === 403,
    );
  assert.equal(
    await handleSearch({ ...base, path: "/api/other", role: "admin" }),
    false,
  );
});
