import {
  commercialSnapshot,
  snapshotHash,
  deliveryKey,
  hasCustomerAcceptance,
} from "./workflow-rules.mjs";
import { MockErpAdapter } from "./erp-adapter.mjs";
import {
  lineState,
  money,
  validDate,
  deliveryProblems,
  csvCell,
} from "./order-rules.mjs";
const fail = (msg, status = 400) => {
  throw Object.assign(new Error(msg), { status });
};
const now = () => new Date().toISOString();
const mutable = ["DRAFT", "SUBMITTED", "IN_REVIEW"];
function version(order, v) {
  if (order.version !== v) fail("Record changed. Reload before saving.", 409);
}
function human(actor) {
  if (!actor) fail("Human review is required", 403);
}
function noDelivery(order) {
  if (order.data.erpDeliveryId)
    fail(
      "ERP delivery already exists. Commercial changes must be handled through the ERP.",
      409,
    );
}
export function attachOrderWorkflow(Type) {
  Object.assign(Type.prototype, {
    async snapshot(t, order) {
      const lines = (await this.store.list(t, "orderLines")).filter(
        (l) => l.data.orderId === order.id,
      );
      const products = await this.store.list(t, "products");
      const { client, center } = await this.customer(
        t,
        order.data.clientId,
        order.data.centerId,
      );
      return commercialSnapshot(order, lines, products, client, center);
    },
    async invalidateRequests(t, id, actor) {
      for (const a of (await this.store.list(t, "orderApprovals")).filter(
        (a) => a.data.orderId === id && a.data.state === "REQUESTED",
      ))
        await this.store.update(
          t,
          "orderApprovals",
          a.id,
          { ...a.data, state: "INVALIDATED" },
          a.version,
          actor,
        );
    },
    async applyRevision(t, order, data, actor) {
      const hash = snapshotHash(await this.snapshot(t, { ...order, data }));
      const changed =
        !!order.data.commercialHash && hash !== order.data.commercialHash;
      if (changed) await this.invalidateRequests(t, order.id, actor);
      return {
        ...data,
        commercialHash: hash,
        commercialRevision:
          (order.data.commercialRevision ?? 1) + (changed ? 1 : 0),
        ...(changed
          ? {
              customerAcceptedRevision: null,
              customerAcceptanceSource: null,
              approvedRevision: null,
              approvedAt: null,
              approvedPayload: {},
              reviewedBy: null,
            }
          : {}),
      };
    },
    async prepareTerms(t, order, requireReviewed = false) {
      const { client, center } = await this.customer(
        t,
        order.data.clientId,
        order.data.centerId,
      );
      if (!client || !center)
        fail("Select a client and center before confirming");
      if (!client.data.active)
        fail("Inactive clients cannot place confirmed orders");
      if (!validDate(order.data.deliveryDate))
        fail("A valid delivery date is required");
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Madrid",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      if (order.data.deliveryDate < today)
        fail("Delivery date cannot be in the past");
      if (deliveryProblems(center, order.data.deliveryDate).length)
        fail("Delivery date does not match the center schedule");
      const lines = (await this.store.list(t, "orderLines")).filter(
          (l) => l.data.orderId === order.id,
        ),
        products = await this.store.list(t, "products");
      if (!lines.length) fail("At least one order line is required");
      const quantities = new Map();
      for (const l of lines) {
        const p = products.find((p) => p.id === l.data.productId);
        if (
          (requireReviewed && !l.data.reviewAccepted) ||
          lineState(p, l.data.quantity, l.data.unit, true) !== "MATCHED"
        )
          fail(
            "Review every line and resolve product, quantity, unit and stock issues",
          );
        if (typeof p.data.price !== "number")
          fail("A product price is missing");
        if (money(p.data.price) !== l.data.unitPriceCents)
          fail("Catalog prices changed. Save the review again");
        quantities.set(p.id, (quantities.get(p.id) ?? 0) + l.data.quantity);
      }
      for (const [id, qty] of quantities)
        if (qty > products.find((p) => p.id === id).data.stock)
          fail("Insufficient stock across duplicate product lines");
      const payload = commercialSnapshot(
        order,
        lines,
        products,
        client,
        center,
      );
      if (!Number.isSafeInteger(payload.totalCents))
        fail("Order amount exceeds supported limits");
      if (snapshotHash(payload) !== order.data.commercialHash)
        fail("Commercial terms changed. Save the review again");
      return payload;
    },
    async submitOriginal(t, id, v, actor, evidence) {
      human(actor);
      if (
        typeof evidence !== "string" ||
        !evidence.trim() ||
        evidence.length > 4000
      )
        fail("A source reference is required to record the client submission");
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        version(o, v);
        noDelivery(o);
        if (!mutable.includes(o.data.state))
          fail("Order cannot be submitted in its current state", 409);
        if (
          o.data.submittedRevision !== null ||
          (await this.store.list(t, "orderApprovals")).some(
            (a) => a.data.orderId === id,
          )
        )
          fail(
            "Original submission has already been recorded; later changes require client acceptance",
            409,
          );
        await this.prepareTerms(t, o, false);
        return this.store.update(
          t,
          "orders",
          id,
          {
            ...o.data,
            state: "SUBMITTED",
            submittedRevision: o.data.commercialRevision,
            submissionSource: "INBOUND_REFERENCE",
            submissionEvidence: evidence.trim(),
            submittedAt: now(),
            submittedBy: actor,
          },
          o.version,
          actor,
        );
      });
    },
    async beginReview(t, id, v, actor) {
      human(actor);
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        version(o, v);
        if (o.data.state !== "SUBMITTED")
          fail("Only submitted orders can begin internal review", 409);
        return this.store.update(
          t,
          "orders",
          id,
          { ...o.data, state: "IN_REVIEW" },
          o.version,
          actor,
        );
      });
    },
    async requestAcceptance(t, id, v, actor) {
      human(actor);
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        version(o, v);
        noDelivery(o);
        if (![...mutable, "APPROVED"].includes(o.data.state))
          fail("Client acceptance cannot be requested in this state", 409);
        const payload = await this.prepareTerms(t, o, true);
        await this.invalidateRequests(t, id, actor);
        await this.store.create(
          t,
          "orderApprovals",
          {
            orderId: id,
            revision: o.data.commercialRevision,
            commercialHash: o.data.commercialHash,
            snapshot: payload,
            state: "REQUESTED",
            requestedBy: actor,
            requestedAt: now(),
            decidedAt: null,
            decidedBy: null,
            source: "PENDING",
            evidence: null,
          },
          actor,
        );
        return this.store.update(
          t,
          "orders",
          id,
          {
            ...o.data,
            state: "AWAITING_CLIENT",
            approvedRevision: null,
            approvedAt: null,
            approvedPayload: {},
            reviewedBy: null,
            customerAcceptedRevision: null,
            customerAcceptanceSource: null,
          },
          o.version,
          actor,
        );
      });
    },
    async customerDecision(t, id, input, identity) {
      if (
        !identity ||
        identity.tenantId !== t ||
        !["CUSTOMER", "MOCK"].includes(identity.kind)
      )
        fail("Customer identity is required", 403);
      if (identity.kind === "MOCK" && !this.options.allowMockClient)
        fail("Mock client decisions are disabled", 403);
      if (
        !["ACCEPTED", "REJECTED"].includes(input.decision) ||
        typeof input.evidence !== "string" ||
        !input.evidence.trim() ||
        input.evidence.length > 4000
      )
        fail("A decision and its reference are required");
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        if (
          o.data.clientId !== identity.clientId ||
          (identity.kind === "CUSTOMER" &&
            !identity.centerIds?.includes(o.data.centerId))
        )
          fail("Client cannot decide on this order", 403);
        version(o, input.version);
        noDelivery(o);
        if (
          o.data.state !== "AWAITING_CLIENT" ||
          input.revision !== o.data.commercialRevision
        )
          fail("The client decision belongs to an obsolete revision", 409);
        const request = (await this.store.list(t, "orderApprovals")).find(
          (a) =>
            a.data.orderId === id &&
            a.data.state === "REQUESTED" &&
            a.data.revision === input.revision &&
            a.data.commercialHash === o.data.commercialHash,
        );
        if (!request) fail("No active request exists for this revision", 409);
        const auditActor = identity.kind === "MOCK" ? identity.actorId : null;
        await this.store.update(
          t,
          "orderApprovals",
          request.id,
          {
            ...request.data,
            state: input.decision,
            source: identity.kind,
            decidedAt: now(),
            decidedBy: identity.subject,
            evidence: input.evidence.trim(),
          },
          request.version,
          auditActor,
        );
        return this.store.update(
          t,
          "orders",
          id,
          {
            ...o.data,
            state: "IN_REVIEW",
            customerDeclinedRevision:
              input.decision === "REJECTED" ? o.data.commercialRevision : null,
            customerAcceptedRevision:
              input.decision === "ACCEPTED" ? o.data.commercialRevision : null,
            customerAcceptanceSource:
              input.decision === "ACCEPTED" ? identity.kind : null,
          },
          o.version,
          auditActor,
        );
      });
    },
    async approve(t, id, v, actor) {
      human(actor);
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        version(o, v);
        noDelivery(o);
        if (!["SUBMITTED", "IN_REVIEW"].includes(o.data.state))
          fail("Order is not ready for internal approval", 409);
        if (!hasCustomerAcceptance(o))
          fail("Customer acceptance is required for the current revision");
        if (
          o.data.customerAcceptanceSource === "MOCK" &&
          !this.options.allowMockClient
        )
          fail("Mock client decisions are disabled", 403);
        const payload = await this.prepareTerms(t, o, true);
        const updated = await this.store.update(
          t,
          "orders",
          id,
          {
            ...o.data,
            state: "APPROVED",
            totalCents: payload.totalCents,
            approvedRevision: o.data.commercialRevision,
            approvedAt: now(),
            approvedPayload: payload,
            reviewedBy: actor,
          },
          o.version,
          actor,
        );
        await this.store.log(
          t,
          actor,
          "INTERNAL_APPROVAL",
          "orders",
          id,
          null,
          {
            revision: o.data.commercialRevision,
            stockPolicy: "ERP_MANAGED_NO_LOCAL_RESERVATION",
          },
        );
        return updated;
      });
    },
    async confirm(...args) {
      return this.approve(...args);
    },
    async reopen(t, id, v, actor) {
      human(actor);
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        version(o, v);
        noDelivery(o);
        if (!["AWAITING_CLIENT", "APPROVED", "REJECTED"].includes(o.data.state))
          fail("Order cannot be reopened in its current state", 409);
        await this.invalidateRequests(t, id, actor);
        return this.store.update(
          t,
          "orders",
          id,
          {
            ...o.data,
            state: "IN_REVIEW",
            rejectionReason: null,
            approvedRevision: null,
            approvedAt: null,
            approvedPayload: {},
            reviewedBy: null,
          },
          o.version,
          actor,
        );
      });
    },
    async reject(t, id, v, actor, reason) {
      human(actor);
      if (typeof reason !== "string" || !reason.trim() || reason.length > 4000)
        fail("A reason is required");
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        version(o, v);
        noDelivery(o);
        if (![...mutable, "AWAITING_CLIENT"].includes(o.data.state))
          fail("Order cannot be rejected in its current state", 409);
        await this.invalidateRequests(t, id, actor);
        await this.store.log(t, actor, "REJECT_ORDER", "orders", id, null, {
          reason: reason.trim(),
        });
        return this.store.update(
          t,
          "orders",
          id,
          { ...o.data, state: "REJECTED", rejectionReason: reason.trim() },
          o.version,
          actor,
        );
      });
    },
    async cancel(t, id, v, actor) {
      human(actor);
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        version(o, v);
        noDelivery(o);
        if (
          ![...mutable, "AWAITING_CLIENT", "APPROVED", "REJECTED"].includes(
            o.data.state,
          )
        )
          fail("Order cannot be cancelled in its current state", 409);
        if (o.data.legacyStockReserved) {
          const quantities = new Map();
          for (const l of (await this.store.list(t, "orderLines")).filter(
            (l) => l.data.orderId === id,
          ))
            quantities.set(
              l.data.productId,
              (quantities.get(l.data.productId) ?? 0) + l.data.quantity,
            );
          for (const [pid, qty] of quantities) {
            const p = await this.required(t, "products", pid);
            await this.store.update(
              t,
              "products",
              pid,
              { ...p.data, stock: Number((p.data.stock + qty).toFixed(3)) },
              p.version,
              actor,
            );
          }
        }
        await this.invalidateRequests(t, id, actor);
        const result = await this.store.update(
          t,
          "orders",
          id,
          { ...o.data, state: "CANCELLED", legacyStockReserved: false },
          o.version,
          actor,
        );
        await this.recomputeBaskets(t, actor);
        return result;
      });
    },
    async export(t, id, v, actor, format = "csv") {
      human(actor);
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        version(o, v);
        if (o.data.state !== "APPROVED" || !o.data.approvedPayload?.lines)
          fail("Only approved orders can be exported", 409);
        if (!["csv", "json"].includes(format)) fail("Invalid export format");
        const p = o.data.approvedPayload;
        const rows = [
          [
            "order_number",
            "revision",
            "client_id",
            "center_id",
            "delivery_date",
            "sku",
            "product_name",
            "quantity",
            "unit",
            "unit_price_eur",
            "line_total_eur",
          ],
          ...p.lines.map((l) => [
            p.number,
            o.data.commercialRevision,
            p.client.id,
            p.center.id,
            p.deliveryDate,
            l.sku,
            l.name,
            l.quantity,
            l.unit,
            (l.unitPriceCents / 100).toFixed(2),
            (l.amountCents / 100).toFixed(2),
          ]),
        ];
        const content =
          format === "csv"
            ? "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")
            : JSON.stringify(
                {
                  revision: o.data.commercialRevision,
                  erpState: o.data.erpState,
                  externalOrderId: o.data.externalOrderId,
                  payload: p,
                },
                null,
                2,
              );
        await this.store.update(
          t,
          "orders",
          id,
          { ...o.data, exportedAt: now() },
          o.version,
          actor,
        );
        await this.store.log(t, actor, "EXPORT_FILE_ONLY", "orders", id, null, {
          format,
          erpAccepted: false,
        });
        return {
          filename: o.data.number + "." + format,
          mime:
            format === "csv" ? "text/csv;charset=utf-8" : "application/json",
          content,
        };
      });
    },
    async queueErp(t, id, v, actor) {
      human(actor);
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        version(o, v);
        if (o.data.erpDeliveryId)
          return this.required(t, "erpDeliveries", o.data.erpDeliveryId);
        if (
          o.data.state !== "APPROVED" ||
          o.data.approvedRevision !== o.data.commercialRevision ||
          !hasCustomerAcceptance(o) ||
          snapshotHash(o.data.approvedPayload) !== o.data.commercialHash
        )
          fail("Only the approved and accepted revision can be queued for ERP");
        if (
          o.data.customerAcceptanceSource === "MOCK" &&
          !this.options.allowMockClient
        )
          fail("Mock client decisions are disabled", 403);
        const stamp = now(),
          delivery = await this.store.create(
            t,
            "erpDeliveries",
            {
              orderId: id,
              revision: o.data.commercialRevision,
              idempotencyKey: deliveryKey(t, o),
              snapshot: o.data.approvedPayload,
              state: "PENDING",
              provider:
                this.options.erpProvider === "mock" ? "MOCK" : "UNCONFIGURED",
              attemptCount: 0,
              lastAttemptId: null,
              leaseUntil: null,
              externalId: null,
              lastError: null,
              response: {},
              createdAt: stamp,
              updatedAt: stamp,
            },
            actor,
          );
        await this.store.update(
          t,
          "orders",
          id,
          { ...o.data, erpDeliveryId: delivery.id, erpState: "PENDING" },
          o.version,
          actor,
        );
        return delivery;
      });
    },
    async dispatchErp(t, id, v, actor, scenario = "SUCCESS") {
      human(actor);
      if (this.options.erpProvider !== "mock")
        fail("ERP connector is not configured");
      const claimed = await this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        if (
          o.data.customerAcceptanceSource === "MOCK" &&
          !this.options.allowMockClient
        )
          fail("Mock client decisions are disabled", 403);
        if (!o.data.erpDeliveryId)
          fail("Queue the approved order before sending to ERP");
        const d = await this.required(t, "erpDeliveries", o.data.erpDeliveryId);
        if (d.data.state === "ACCEPTED")
          return { alreadyAccepted: true, order: o };
        version(o, v);
        if (
          o.data.state !== "APPROVED" ||
          d.data.revision !== o.data.approvedRevision
        )
          fail("ERP payload no longer matches approval", 409);
        if (
          d.data.state === "SENDING" &&
          Date.parse(d.data.leaseUntil) > Date.now()
        )
          fail("An ERP attempt is already in progress", 409);
        if (d.data.state === "SENDING" && d.data.lastAttemptId) {
          const old = await this.required(
            t,
            "erpAttempts",
            d.data.lastAttemptId,
          );
          if (old.data.state === "STARTED")
            await this.store.update(
              t,
              "erpAttempts",
              old.id,
              {
                ...old.data,
                state: "ERROR",
                finishedAt: now(),
                errorCode: "OUTCOME_UNKNOWN",
              },
              old.version,
              actor,
            );
        }
        const attempt = await this.store.create(
          t,
          "erpAttempts",
          {
            orderId: id,
            deliveryId: d.id,
            number: d.data.attemptCount + 1,
            state: "STARTED",
            startedAt: now(),
            finishedAt: null,
            errorCode: null,
            response: {},
            actorId: actor,
          },
          actor,
        );
        const delivery = await this.store.update(
          t,
          "erpDeliveries",
          d.id,
          {
            ...d.data,
            state: "SENDING",
            provider: "MOCK",
            attemptCount: d.data.attemptCount + 1,
            lastAttemptId: attempt.id,
            leaseUntil: new Date(Date.now() + 120000).toISOString(),
            lastError: null,
            updatedAt: now(),
          },
          d.version,
          actor,
        );
        await this.store.update(
          t,
          "orders",
          id,
          { ...o.data, erpState: "SENDING" },
          o.version,
          actor,
        );
        return { delivery, attempt };
      });
      if (claimed.alreadyAccepted) return claimed.order;
      let response, errorCode;
      try {
        response = await (
          this.options.erpAdapter ?? new MockErpAdapter(this.store)
        ).send({
          tenantId: t,
          idempotencyKey: claimed.delivery.data.idempotencyKey,
          payload: claimed.delivery.data.snapshot,
          scenario,
        });
        if (!response.accepted) errorCode = response.code ?? "ERP_REJECTED";
      } catch (e) {
        errorCode = e.code ?? "ERP_SEND_FAILED";
        response = { errorCode, provider: "MOCK" };
      }
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const d = await this.required(t, "erpDeliveries", claimed.delivery.id),
          a = await this.required(t, "erpAttempts", claimed.attempt.id),
          o = await this.required(t, "orders", id);
        if (d.data.lastAttemptId !== a.id || d.data.state !== "SENDING")
          fail("A newer ERP attempt superseded this result", 409);
        const accepted =
          !errorCode &&
          response.accepted &&
          typeof response.externalId === "string" &&
          response.externalId.length > 0;
        await this.store.update(
          t,
          "erpAttempts",
          a.id,
          {
            ...a.data,
            state: accepted ? "ACCEPTED" : "ERROR",
            finishedAt: now(),
            errorCode:
              errorCode ?? (accepted ? null : "INVALID_ACKNOWLEDGEMENT"),
            response,
          },
          a.version,
          actor,
        );
        await this.store.update(
          t,
          "erpDeliveries",
          d.id,
          {
            ...d.data,
            state: accepted ? "ACCEPTED" : "ERROR",
            externalId: accepted ? response.externalId : null,
            lastError:
              errorCode ?? (accepted ? null : "INVALID_ACKNOWLEDGEMENT"),
            response,
            leaseUntil: null,
            updatedAt: now(),
          },
          d.version,
          actor,
        );
        const result = await this.store.update(
          t,
          "orders",
          id,
          {
            ...o.data,
            erpState: accepted ? "ACCEPTED" : "ERROR",
            externalOrderId: accepted ? response.externalId : null,
            erpAcceptedAt: accepted ? now() : null,
          },
          o.version,
          actor,
        );
        if (accepted) await this.recomputeBaskets(t, actor);
        return result;
      });
    },
    async requestErpCancellation(t, id, v, actor, reason) {
      human(actor);
      if (typeof reason !== "string" || !reason.trim() || reason.length > 4000)
        fail("A reason is required");
      return this.store.transaction(async () => {
        await this.store.lock(t);
        const o = await this.required(t, "orders", id);
        version(o, v);
        if (!o.data.erpDeliveryId) fail("No ERP delivery exists");
        const existing = (await this.store.list(t, "erpChangeRequests")).find(
          (r) => r.data.orderId === id && r.data.state === "PENDING",
        );
        if (existing) return existing;
        return this.store.create(
          t,
          "erpChangeRequests",
          {
            orderId: id,
            deliveryId: o.data.erpDeliveryId,
            kind: "CANCEL",
            state: "PENDING",
            reason: reason.trim(),
            requestedBy: actor,
            createdAt: now(),
          },
          actor,
        );
      });
    },
  });
}
