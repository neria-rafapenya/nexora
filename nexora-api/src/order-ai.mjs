import {
  GeminiOrderAdapter,
  geminiConfigFromEnv,
  geminiPublicConfig,
  requireGeminiConfig,
  demoCatalog,
  validateGeminiOutput,
} from "./gemini.mjs";
import { businessDate } from "./document-rules.mjs";
import { snapshotHash } from "./workflow-rules.mjs";
import { lineState, money, lineAmount } from "./order-rules.mjs";
const fail = (code, status = 400) => {
  throw Object.assign(new Error(code), { code, status });
};
export function attachOrderAi(Type) {
  Object.assign(Type.prototype, {
    async aiStatus(t) {
      const c = this.options.gemini ?? geminiConfigFromEnv(),
        today = businessDate(),
        requests = await this.store.list(t, "aiOrderRequests");
      return {
        ...geminiPublicConfig(c),
        usedToday: requests.filter((r) => r.data.day === today).length,
      };
    },
    async processGemini(t, id, input, actor) {
      if (!actor) fail("Access denied", 403);
      if (
        Object.keys(input).some(
          (k) => !["version", "demoConfirmed"].includes(k),
        ) ||
        input.demoConfirmed !== true
      )
        fail("GEMINI_DEMO_CONFIRMATION_REQUIRED");
      const config = this.options.gemini ?? geminiConfigFromEnv();
      requireGeminiConfig(config);
      const claim = await this.store.transaction(async () => {
        await this.store.lock(t);
        const m = await this.required(t, "inboxMessages", id),
          existing = (await this.store.list(t, "orders")).find(
            (o) => o.data.messageId === id,
          );
        if (existing) return { existing };
        if (m.version !== input.version)
          fail("Record changed. Reload before saving.", 409);
        if (!["NEW", "ERROR"].includes(m.data.state) || !m.data.body?.trim())
          fail("GEMINI_MESSAGE_NOT_READY", 409);
        const requests = await this.store.list(t, "aiOrderRequests"),
          pending = requests.find(
            (r) => r.data.messageId === id && r.data.state === "PROCESSING",
          );
        if (pending) {
          if (Date.parse(pending.data.leaseUntil) > Date.now())
            fail("GEMINI_REQUEST_IN_PROGRESS", 409);
          await this.store.update(
            t,
            "aiOrderRequests",
            pending.id,
            {
              ...pending.data,
              state: "FAILED",
              finishedAt: new Date().toISOString(),
              errorCode: "GEMINI_OUTCOME_UNKNOWN",
            },
            pending.version,
            actor,
          );
        }
        const today = businessDate();
        if (
          requests.filter((r) => r.data.day === today).length >=
          config.maxDailyRequests
        )
          fail("GEMINI_DAILY_LIMIT", 429);
        const catalog = demoCatalog(await this.store.list(t, "products"));
        if (m.data.body.length > 12000) fail("GEMINI_INPUT_TOO_LARGE");
        const startedAt = new Date().toISOString(),
          inputHash = snapshotHash({ body: m.data.body, version: m.version }),
          catalogHash = snapshotHash(catalog);
        const request = await this.store.create(
          t,
          "aiOrderRequests",
          {
            messageId: id,
            messageVersion: m.version,
            provider: "GEMINI",
            model: config.model,
            state: "PROCESSING",
            day: today,
            inputHash,
            catalogHash,
            startedAt,
            leaseUntil: new Date(Date.now() + 90000).toISOString(),
            finishedAt: null,
            errorCode: null,
            orderId: null,
            usage: {},
          },
          actor,
        );
        return { request, message: m, catalog };
      });
      if (claim.existing) return claim.existing;
      try {
        const result = await (
          this.options.geminiAdapter ?? new GeminiOrderAdapter(config)
        ).extract({ text: claim.message.data.body, catalog: claim.catalog });
        validateGeminiOutput(result.output, claim.message.data.body);
        return await this.store.transaction(async () => {
          await this.store.lock(t);
          const request = await this.required(
              t,
              "aiOrderRequests",
              claim.request.id,
            ),
            m = await this.required(t, "inboxMessages", id);
          if (request.data.state !== "PROCESSING")
            fail("GEMINI_REQUEST_SUPERSEDED", 409);
          if (
            m.version !== claim.message.version ||
            snapshotHash({ body: m.data.body, version: m.version }) !==
              request.data.inputHash ||
            !["NEW", "ERROR"].includes(m.data.state)
          )
            fail("GEMINI_INPUT_CHANGED", 409);
          const products = await this.store.list(t, "products");
          if (snapshotHash(demoCatalog(products)) !== request.data.catalogHash)
            fail("GEMINI_CATALOG_CHANGED", 409);
          if (
            (await this.store.list(t, "orders")).some(
              (o) => o.data.messageId === id,
            )
          )
            fail("GEMINI_REQUEST_SUPERSEDED", 409);
          const clientId = m.data.clientId,
            centerId = m.data.centerId,
            order = await this.newOrder(
              t,
              {
                clientId,
                centerId,
                deliveryDate:
                  m.data.requestedDate || result.output.deliveryDate,
              },
              actor,
              id,
            );
          const lines = result.output.lines.map((l) => {
            const product = products.find(
                (p) =>
                  p.data.active &&
                  p.data.brand === "Nexora Sample" &&
                  p.data.sku === l.sku,
              ),
              quantity = l.quantity ?? 0,
              confidence = product ? Math.min(l.confidence, 0.8) : 0,
              unitPriceCents =
                product && typeof product.data.price === "number"
                  ? money(product.data.price)
                  : 0;
            return {
              orderId: order.id,
              productId: product?.id ?? null,
              originalText: l.originalText,
              quantity,
              unit: l.unit,
              unitPriceCents,
              amountCents: lineAmount(quantity, unitPriceCents),
              confidence,
              state: lineState(product, quantity, l.unit, false, confidence),
              reviewAccepted: false,
              substitutionForId: null,
            };
          });
          for (const l of lines)
            await this.store.create(t, "orderLines", l, actor);
          const totalCents = lines.reduce((n, l) => n + l.amountCents, 0);
          if (!Number.isSafeInteger(totalCents))
            fail("Order amount exceeds supported limits");
          const confidence =
              lines.reduce((n, l) => n + l.confidence, 0) / lines.length,
            updated = await this.store.update(
              t,
              "orders",
              order.id,
              await this.applyRevision(
                t,
                order,
                { ...order.data, origin: "AI_MESSAGE", totalCents, confidence },
                actor,
              ),
              order.version,
              actor,
            );
          await this.store.update(
            t,
            "inboxMessages",
            id,
            { ...m.data, state: "PROCESSED", error: null },
            m.version,
            actor,
          );
          const usage = result.usage ?? {};
          await this.store.create(
            t,
            "aiOrderRuns",
            {
              messageId: id,
              orderId: order.id,
              provider: "GEMINI",
              model: config.model,
              output: {
                lineCount: lines.length,
                confidence,
                simulated: false,
                promptVersion: "nexora-order-extract-v1",
                requestId: request.id,
                ...usage,
                costBasis: "NOT_REPORTED_BY_PROVIDER",
              },
              costCents: null,
              durationMs: Date.now() - Date.parse(request.data.startedAt),
              createdAt: new Date().toISOString(),
            },
            actor,
          );
          await this.store.update(
            t,
            "aiOrderRequests",
            request.id,
            {
              ...request.data,
              state: "SUCCEEDED",
              finishedAt: new Date().toISOString(),
              orderId: order.id,
              usage,
            },
            request.version,
            actor,
          );
          await this.refreshAlerts(t, updated, actor);
          return updated;
        });
      } catch (e) {
        const allowed = [
          "GEMINI_RATE_LIMITED",
          "GEMINI_TIMEOUT",
          "GEMINI_UNAVAILABLE",
          "GEMINI_AUTH_FAILED",
          "GEMINI_MODEL_UNAVAILABLE",
          "GEMINI_INVALID_OUTPUT",
          "GEMINI_INPUT_CHANGED",
          "GEMINI_CATALOG_CHANGED",
          "GEMINI_REQUEST_SUPERSEDED",
          "GEMINI_INPUT_TOO_LARGE",
        ];
        const code = allowed.includes(e.code)
          ? e.code
          : "GEMINI_PROCESSING_FAILED";
        await this.store.transaction(async () => {
          await this.store.lock(t);
          const request = await this.required(
            t,
            "aiOrderRequests",
            claim.request.id,
          );
          if (request.data.state === "PROCESSING")
            await this.store.update(
              t,
              "aiOrderRequests",
              request.id,
              {
                ...request.data,
                state: "FAILED",
                finishedAt: new Date().toISOString(),
                errorCode: code,
              },
              request.version,
              actor,
            );
        });
        fail(code, e.status ?? 502);
      }
    },
  });
}
