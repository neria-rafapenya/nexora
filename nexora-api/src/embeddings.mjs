import { snapshotHash } from "./workflow-rules.mjs";
export const embeddingModel = "gemini-embedding-001";
export const dimensions = 768;
export const failSearch = (code, status = 400) => {
  throw Object.assign(new Error(code), { code, status });
};
export function embeddingConfigFromEnv() {
  const daily = Number(process.env.GEMINI_EMBEDDING_MAX_DAILY_REQUESTS ?? 50);
  return {
    enabled: process.env.GEMINI_EMBEDDINGS_ENABLED === "true",
    apiKey: process.env.GEMINI_API_KEY ?? "",
    freeTierConfirmed: process.env.GEMINI_FREE_TIER_CONFIRMED === "true",
    model: embeddingModel,
    maxDailyRequests:
      Number.isInteger(daily) && daily >= 1 && daily <= 200 ? daily : 50,
  };
}
export function requireEmbeddings(c) {
  if (
    !c.enabled ||
    !c.apiKey ||
    !c.freeTierConfirmed ||
    c.model !== embeddingModel
  )
    failSearch("EMBEDDINGS_NOT_CONFIGURED", 409);
}
export function normalizeVector(values) {
  if (
    !Array.isArray(values) ||
    values.length !== dimensions ||
    !values.every((n) => typeof n === "number" && Number.isFinite(n))
  )
    failSearch("EMBEDDINGS_INVALID_OUTPUT", 502);
  const norm = Math.hypot(...values);
  if (!Number.isFinite(norm) || norm < 1e-10)
    failSearch("EMBEDDINGS_INVALID_OUTPUT", 502);
  return values.map((n) => n / norm);
}
export function normalizeQuery(q) {
  if (typeof q !== "string" || q.trim().length < 2 || q.length > 300)
    failSearch("EMBEDDINGS_QUERY_REQUIRED");
  return q.normalize("NFKC").replace(/\s+/g, " ").trim().toLowerCase();
}
export function productDocuments(products, families, categories) {
  return products
    .filter((p) => p.data.active && p.data.brand === "Nexora Sample")
    .map((p) => {
      const f = families.find((f) => f.id === p.data.familyId),
        c = categories.find((c) => c.id === f?.data.mainCategoryId);
      const data = {
        sku: p.data.sku,
        name: p.data.name,
        family: f?.data.name ?? "",
        category: c?.data.name ?? "",
        format: p.data.format ?? "",
        unit: p.data.unit,
        temperature: p.data.temperature,
        ingredients: p.data.ingredients ?? "",
      };
      const text = JSON.stringify(data);
      if (text.length > 4000) failSearch("EMBEDDINGS_DOCUMENT_TOO_LARGE");
      return {
        id: p.id,
        text,
        hash: snapshotHash({ version: 1, data }),
        record: p,
      };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
}
export class GeminiEmbeddingAdapter {
  constructor(config, { fetchImpl = fetch } = {}) {
    this.config = config;
    this.fetch = fetchImpl;
  }
  async embed(texts, taskType) {
    requireEmbeddings(this.config);
    if (
      !Array.isArray(texts) ||
      !texts.length ||
      texts.length > 20 ||
      texts.some(
        (t) => typeof t !== "string" || !t.trim() || t.length > 4000,
      ) ||
      !["RETRIEVAL_DOCUMENT", "RETRIEVAL_QUERY"].includes(taskType)
    )
      failSearch("EMBEDDINGS_INVALID_INPUT");
    let response;
    try {
      response = await this.fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${embeddingModel}:batchEmbedContents`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": this.config.apiKey,
          },
          signal: AbortSignal.timeout(30000),
          body: JSON.stringify({
            requests: texts.map((text) => ({
              model: "models/" + embeddingModel,
              content: { parts: [{ text }] },
              taskType,
              outputDimensionality: dimensions,
            })),
          }),
        },
      );
    } catch (e) {
      failSearch(
        ["AbortError", "TimeoutError"].includes(e.name)
          ? "EMBEDDINGS_TIMEOUT"
          : "EMBEDDINGS_UNAVAILABLE",
        502,
      );
    }
    if (!response.ok)
      failSearch(
        response.status === 429
          ? "EMBEDDINGS_RATE_LIMITED"
          : [401, 403].includes(response.status)
            ? "EMBEDDINGS_AUTH_FAILED"
            : response.status === 404
              ? "EMBEDDINGS_MODEL_UNAVAILABLE"
              : "EMBEDDINGS_UNAVAILABLE",
        response.status === 429 ? 429 : 502,
      );
    let payload;
    try {
      const raw = await response.text();
      if (raw.length > 1000000) throw Error();
      payload = JSON.parse(raw);
    } catch {
      failSearch("EMBEDDINGS_INVALID_OUTPUT", 502);
    }
    if (
      !Array.isArray(payload.embeddings) ||
      payload.embeddings.length !== texts.length
    )
      failSearch("EMBEDDINGS_INVALID_OUTPUT", 502);
    return payload.embeddings.map((e) => normalizeVector(e.values));
  }
}
