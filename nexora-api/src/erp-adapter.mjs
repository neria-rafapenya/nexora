import { snapshotHash } from "./workflow-rules.mjs";
export class UnconfiguredErpAdapter {
  async send() {
    throw Object.assign(new Error("ERP connector is not configured"), {
      code: "ERP_NOT_CONFIGURED",
    });
  }
}
export class MockErpAdapter {
  constructor(store) {
    this.store = store;
  }
  async send({ tenantId, idempotencyKey, payload, scenario = "SUCCESS" }) {
    if (
      !["SUCCESS", "REJECT", "TIMEOUT", "TIMEOUT_AFTER_ACCEPT"].includes(
        scenario,
      )
    )
      throw new Error("Invalid ERP mock scenario");
    const hash = snapshotHash(payload);
    const result = await this.store.transaction(async () => {
      await this.store.lock(tenantId);
      const existing = (
        await this.store.list(tenantId, "mockErpReceipts")
      ).find((r) => r.data.idempotencyKey === idempotencyKey);
      if (existing) {
        if (existing.data.payloadHash !== hash)
          throw new Error(
            "Idempotency key cannot be reused for different terms",
          );
        return {
          accepted: true,
          externalId: existing.data.externalId,
          reused: true,
          provider: "MOCK",
        };
      }
      if (scenario === "TIMEOUT") return { timeout: true };
      if (scenario === "REJECT")
        return { accepted: false, code: "MOCK_REJECTION", provider: "MOCK" };
      const externalId = "MOCK-ERP-" + idempotencyKey.slice(-20).toUpperCase();
      await this.store.create(
        tenantId,
        "mockErpReceipts",
        {
          idempotencyKey,
          payloadHash: hash,
          externalId,
          receivedAt: new Date().toISOString(),
        },
        null,
      );
      return { accepted: true, externalId, reused: false, provider: "MOCK" };
    });
    if (result.timeout)
      throw Object.assign(new Error("ERP connection timeout"), {
        code: "CONNECTION_TIMEOUT",
      });
    if (
      scenario === "TIMEOUT_AFTER_ACCEPT" &&
      !result.reused &&
      result.accepted
    )
      throw Object.assign(
        new Error("ERP acknowledgement timeout; outcome unknown"),
        { code: "ACKNOWLEDGEMENT_TIMEOUT" },
      );
    return result;
  }
}
