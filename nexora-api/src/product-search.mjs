import { randomUUID } from "node:crypto";
import {
  GeminiEmbeddingAdapter,
  embeddingConfigFromEnv,
  requireEmbeddings,
  productDocuments,
  normalizeQuery,
  normalizeVector,
  dimensions,
  failSearch,
} from "./embeddings.mjs";
import { vectorNamespace } from "./migrate-search.mjs";
import { businessDate } from "./document-rules.mjs";
import { snapshotHash } from "./workflow-rules.mjs";
export class ProductSearch {
  constructor(
    store,
    {
      config = embeddingConfigFromEnv(),
      adapter,
      batchIntervalMs = 15000,
    } = {},
  ) {
    this.store = store;
    this.batchIntervalMs = batchIntervalMs;
    this.config = config;
    this.adapter = adapter ?? new GeminiEmbeddingAdapter(config);
  }
  async documents(t) {
    const rows = [];
    for (const resource of ["products", "families", "mainCategories"])
      rows.push(await this.store.list(t, resource));
    return productDocuments(...rows);
  }

  async entries(t) {
    return (
      await this.store.query(
        "SELECT product_id,source_hash,model,updated_at FROM bo.product_embeddings WHERE tenant_id=$1",
        [t],
      )
    ).rows;
  }
  async status(t) {
    const docs = await this.documents(t),
      entries = await this.entries(t),
      usage = await this.store.query(
        "SELECT COALESCE(sum(units),0)::int AS used FROM bo.embedding_requests WHERE tenant_id=$1 AND day=$2",
        [t, businessDate()],
      );
    const current = docs.filter((d) =>
      entries.some(
        (e) =>
          e.product_id === d.id &&
          e.source_hash === d.hash &&
          e.model === this.config.model,
      ),
    ).length;
    return {
      enabled: this.config.enabled,
      available: !!(
        this.config.enabled &&
        this.config.apiKey &&
        this.config.freeTierConfirmed
      ),
      model: this.config.model,
      dimensions,
      total: docs.length,
      indexed: current,
      pending: docs.length - current,
      usedToday: usage.rows[0].used,
      maxDailyRequests: this.config.maxDailyRequests,
    };
  }
  async claim(t, kind, hash, units, actor) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      await this.store.query(
        "UPDATE bo.embedding_requests SET state='FAILED',error_code='EMBEDDINGS_OUTCOME_UNKNOWN',finished_at=now() WHERE tenant_id=$1 AND state='PROCESSING' AND lease_until<=now()",
        [t],
      );
      const active = await this.store.query(
        "SELECT 1 FROM bo.embedding_requests WHERE tenant_id=$1 AND kind=$2 AND state='PROCESSING' AND ($2='INDEX' OR (input_hash=$3 AND model=$4))",
        [t, kind, hash, this.config.model],
      );
      if (active.rowCount) failSearch("EMBEDDINGS_IN_PROGRESS", 409);
      const used = (
        await this.store.query(
          "SELECT COALESCE(sum(units),0)::int AS used FROM bo.embedding_requests WHERE tenant_id=$1 AND day=$2",
          [t, businessDate()],
        )
      ).rows[0].used;
      if (used + units > this.config.maxDailyRequests)
        failSearch("EMBEDDINGS_DAILY_LIMIT", 429);
      const id = randomUUID();
      await this.store.query(
        "INSERT INTO bo.embedding_requests(id,tenant_id,kind,input_hash,model,units,day,state,lease_until,actor_id) VALUES($1,$2,$3,$4,$5,$6,$7,'PROCESSING',now()+interval '10 minutes',$8)",
        [id, t, kind, hash, this.config.model, units, businessDate(), actor],
      );
      return id;
    });
  }
  async finish(t, id, error = null) {
    await this.store.query(
      "UPDATE bo.embedding_requests SET state=$3,error_code=$4,finished_at=now() WHERE tenant_id=$1 AND id=$2 AND state='PROCESSING'",
      [t, id, error ? "FAILED" : "SUCCEEDED", error],
    );
  }
  async assertClaim(t, id) {
    if (
      !(
        await this.store.query(
          "SELECT 1 FROM bo.embedding_requests WHERE tenant_id=$1 AND id=$2 AND state='PROCESSING' AND lease_until>now()",
          [t, id],
        )
      ).rowCount
    )
      failSearch("EMBEDDINGS_REQUEST_SUPERSEDED", 409);
  }
  async index(t, actor, confirmed) {
    if (!actor || confirmed !== true)
      failSearch("EMBEDDINGS_DEMO_CONFIRMATION_REQUIRED");
    requireEmbeddings(this.config);
    const docs = await this.documents(t);
    if (docs.length > 250) failSearch("EMBEDDINGS_CATALOG_LIMIT");
    const entries = await this.entries(t),
      pending = docs.filter(
        (d) =>
          !entries.some(
            (e) =>
              e.product_id === d.id &&
              e.source_hash === d.hash &&
              e.model === this.config.model,
          ),
      );
    if (!pending.length) return this.status(t);
    const id = await this.claim(
        t,
        "INDEX",
        snapshotHash(pending.map((d) => d.hash)),
        Math.ceil(pending.length / 20),
        actor,
      ),
      ns = await vectorNamespace(this.store);
    try {
      for (let i = 0; i < pending.length; i += 20) {
        if (i > 0 && this.batchIntervalMs)
          await new Promise((resolve) =>
            setTimeout(resolve, this.batchIntervalMs),
          );
        const batch = pending.slice(i, i + 20),
          vectors = await this.adapter.embed(
            batch.map((d) => d.text),
            "RETRIEVAL_DOCUMENT",
          );
        if (vectors.length !== batch.length)
          failSearch("EMBEDDINGS_INVALID_OUTPUT", 502);
        await this.store.transaction(async () => {
          await this.store.lock(t);
          await this.assertClaim(t, id);
          const current = await this.documents(t);
          for (const [n, d] of batch.entries()) {
            if (!current.some((c) => c.id === d.id && c.hash === d.hash))
              continue;
            const vector = JSON.stringify(normalizeVector(vectors[n]));
            await this.store.query(
              `INSERT INTO bo.product_embeddings(tenant_id,product_id,source_hash,model,embedding) VALUES($1,$2,$3,$4,$5::${ns}.vector) ON CONFLICT(tenant_id,product_id) DO UPDATE SET source_hash=excluded.source_hash,model=excluded.model,embedding=excluded.embedding,updated_at=now()`,
              [t, d.id, d.hash, this.config.model, vector],
            );
          }
        });
      }
      await this.finish(t, id);
      await this.store.log(
        t,
        actor,
        "SEMANTIC_INDEX_UPDATED",
        "products",
        null,
        null,
        { model: this.config.model, requested: pending.length },
      );
      return this.status(t);
    } catch (e) {
      const code = safeCode(e);
      await this.finish(t, id, code);
      failSearch(code, e.status ?? 502);
    }
  }
  async queryVector(t, q, actor) {
    const hash = snapshotHash({ q, dimensions }),
      ns = await vectorNamespace(this.store);
    const cached = (
      await this.store.query(
        `SELECT embedding::text AS embedding FROM bo.embedding_queries WHERE tenant_id=$1 AND query_hash=$2 AND model=$3 AND created_at>now()-interval '24 hours'`,
        [t, hash, this.config.model],
      )
    ).rows[0];
    if (cached) return { vector: cached.embedding, cached: true };
    const id = await this.claim(t, "QUERY", hash, 1, actor);
    try {
      const vectors = await this.adapter.embed([q], "RETRIEVAL_QUERY");
      if (vectors.length !== 1) failSearch("EMBEDDINGS_INVALID_OUTPUT", 502);
      const vector = JSON.stringify(normalizeVector(vectors[0]));
      await this.store.transaction(async () => {
        await this.store.lock(t);
        await this.assertClaim(t, id);
        await this.store.query(
          `INSERT INTO bo.embedding_queries(tenant_id,query_hash,model,embedding) VALUES($1,$2,$3,$4::${ns}.vector) ON CONFLICT(tenant_id,query_hash,model) DO UPDATE SET embedding=excluded.embedding,created_at=now()`,
          [t, hash, this.config.model, vector],
        );
        await this.finish(t, id);
      });
      return { vector, cached: false };
    } catch (e) {
      const code = safeCode(e);
      await this.finish(t, id, code);
      failSearch(code, e.status ?? 502);
    }
  }
  async search(t, input, actor) {
    requireEmbeddings(this.config);
    if (input.demoConfirmed !== true)
      failSearch("EMBEDDINGS_DEMO_CONFIRMATION_REQUIRED");
    if (
      Object.keys(input).some(
        (k) =>
          !["q", "familyId", "temperature", "limit", "demoConfirmed"].includes(
            k,
          ),
      )
    )
      failSearch("EMBEDDINGS_INVALID_INPUT");
    const q = normalizeQuery(input.q),
      limit = input.limit ?? 20;
    if (!Number.isInteger(limit) || limit < 1 || limit > 50)
      failSearch("EMBEDDINGS_INVALID_INPUT");
    if (
      input.temperature &&
      !["AMBIENT", "CHILLED", "FROZEN"].includes(input.temperature)
    )
      failSearch("EMBEDDINGS_INVALID_INPUT");
    if (input.familyId && typeof input.familyId !== "string")
      failSearch("EMBEDDINGS_INVALID_INPUT");
    const docs = await this.documents(t),
      entries = await this.entries(t);
    const current = docs.filter((d) =>
      entries.some(
        (e) =>
          e.product_id === d.id &&
          e.source_hash === d.hash &&
          e.model === this.config.model,
      ),
    );
    const eligible = current.filter(
      (d) =>
        (!input.familyId || d.record.data.familyId === input.familyId) &&
        (!input.temperature || d.record.data.temperature === input.temperature),
    );
    const pending = docs.length - current.length;
    if (!eligible.length)
      return { records: [], pending, cached: false, model: this.config.model };
    const { vector, cached } = await this.queryVector(t, q, actor),
      ns = await vectorNamespace(this.store);
    // Exact cosine scan is sufficient for the 200-product POC, with tenant/filter constraints before ranking.
    const result = await this.store.query(
      `SELECT product_id,1-(embedding OPERATOR(${ns}.<=>) $4::${ns}.vector) AS score,source_hash FROM bo.product_embeddings WHERE tenant_id=$1 AND model=$2 AND product_id=ANY($3::text[]) ORDER BY embedding OPERATOR(${ns}.<=>) $4::${ns}.vector,product_id LIMIT $5`,
      [t, this.config.model, eligible.map((d) => d.id), vector, limit],
    );
    // Re-read sources after the network call so edits/deactivations cannot return stale matches.
    const fresh = await this.documents(t);
    return {
      records: result.rows.flatMap((r) => {
        const d = fresh.find(
          (d) =>
            d.id === r.product_id &&
            d.hash === r.source_hash &&
            (!input.familyId || d.record.data.familyId === input.familyId) &&
            (!input.temperature ||
              d.record.data.temperature === input.temperature),
        );
        return d
          ? [{ ...d.record, score: Math.max(-1, Math.min(1, Number(r.score))) }]
          : [];
      }),
      pending,
      cached,
      model: this.config.model,
    };
  }
}
function safeCode(e) {
  return typeof e.code === "string" && /^EMBEDDINGS_[A-Z_]+$/.test(e.code)
    ? e.code
    : "EMBEDDINGS_PROCESSING_FAILED";
}
