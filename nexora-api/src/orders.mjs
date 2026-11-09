import { randomUUID } from "node:crypto";
import {
  messageHash,
  parseMockOrder,
  money,
  lineState,
  validDate,
  deliveryProblems,
  exportRows,
  lineAmount,
} from "./order-rules.mjs";
const error = (message, status = 400) => {
  throw Object.assign(new Error(message), { status });
};
const now = () => new Date().toISOString();
export class OrdersService {
  constructor(store) {
    this.store = store;
  }
  async required(t, r, id) {
    const row = await this.store.get(t, r, id);
    if (!row) error("Record not found", 404);
    return row;
  }
  async customer(t, clientId, centerId) {
    const center = centerId
      ? await this.required(t, "centers", centerId)
      : null;
    const id = clientId || center?.data.clientId || null;
    const client = id ? await this.required(t, "clients", id) : null;
    if (center && center.data.clientId !== id)
      error("Center does not belong to the selected client");
    return { client, center };
  }
  async message(t, id) {
    const message = await this.required(t, "inboxMessages", id);
    const attachments = (await this.store.list(t, "orderAttachments")).filter(
      (a) => a.data.messageId === id,
    );
    const order = (await this.store.list(t, "orders")).find(
      (o) => o.data.messageId === id,
    );
    return { message, attachments, order: order ?? null };
  }
  async createMessage(t, input, actor = null) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      if (!input || typeof input !== "object") error("Invalid message");
      const allowed = [
        "channel",
        "sender",
        "subject",
        "body",
        "clientId",
        "centerId",
        "requestedDate",
        "attachment",
      ];
      if (Object.keys(input).some((k) => !allowed.includes(k)))
        error("Unknown message field");
      if (
        input.attachment &&
        (typeof input.attachment !== "object" ||
          Object.keys(input.attachment).some(
            (k) => !["filename", "mime", "base64"].includes(k),
          ))
      )
        error("Invalid attachment");
      const { client, center } = await this.customer(
        t,
        input.clientId,
        input.centerId,
      );
      if (!String(input.body ?? "").trim() && !input.attachment)
        error("Message text or an attachment is required");
      const data = {
        channel: input.channel,
        sender: input.sender,
        subject: input.subject ?? "",
        body: input.body ?? "",
        originalBody: input.body ?? "",
        clientId: client?.id ?? null,
        centerId: center?.id ?? null,
        requestedDate: input.requestedDate || null,
        state: "NEW",
        dedupe: messageHash(input, input.attachment),
        error: null,
        receivedAt: now(),
      };
      const existing = (await this.store.list(t, "inboxMessages")).find(
        (m) => m.data.dedupe === data.dedupe,
      );
      if (existing)
        throw Object.assign(
          new Error("This message has already been received"),
          { status: 409, existingId: existing.id },
        );
      const message = await this.store.create(t, "inboxMessages", data, actor);
      if (input.attachment)
        await this.store.create(
          t,
          "orderAttachments",
          { messageId: message.id, ...input.attachment },
          actor,
        );
      return message;
    });
  }
  async discardMessage(t, id, version, actor) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      const m = await this.required(t, "inboxMessages", id);
      if (m.data.state === "PROCESSED")
        error("Processed messages cannot be discarded", 409);
      return this.store.update(
        t,
        "inboxMessages",
        id,
        { ...m.data, state: "DISCARDED" },
        version,
        actor,
      );
    });
  }
  async newOrder(t, input, actor = null, messageId = null) {
    const { client, center } = await this.customer(
      t,
      input.clientId,
      input.centerId,
    );
    const id = randomUUID().split("-")[0].toUpperCase();
    return this.store.create(
      t,
      "orders",
      {
        number: `NX-${now().slice(0, 10).replaceAll("-", "")}-${id}`,
        clientId: client?.id ?? null,
        centerId: center?.id ?? null,
        messageId,
        deliveryDate: input.deliveryDate || null,
        origin: messageId ? "MOCK_MESSAGE" : "MANUAL",
        state: messageId ? "IN_REVIEW" : "DRAFT",
        totalCents: 0,
        confidence: messageId ? 0 : null,
        reviewedBy: null,
        confirmedAt: null,
        exportedAt: null,
        createdAt: now(),
      },
      actor,
    );
  }
  async createOrder(t, input, actor) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      if (
        Object.keys(input).some(
          (k) => !["clientId", "centerId", "deliveryDate"].includes(k),
        )
      )
        error("Unknown order field");
      return this.newOrder(t, input, actor);
    });
  }
  async processMessage(t, id, version, actor = null) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      const started = Date.now(),
        message = await this.required(t, "inboxMessages", id);
      const existing = (await this.store.list(t, "orders")).find(
        (o) => o.data.messageId === id,
      );
      if (existing) return existing;
      if (message.version !== version)
        error("Record changed. Reload before saving.", 409);
      if (!["NEW", "ERROR"].includes(message.data.state))
        error("This message cannot be processed", 409);
      if (!message.data.body?.trim())
        error("Provide a text transcription before mock processing");
      const products = await this.store.list(t, "products"),
        extracted = parseMockOrder(message.data.body, products);
      if (!extracted.length) error("Provide between 1 and 200 order lines");
      const clients = await this.store.list(t, "clients");
      const detected = clients.filter(
        (c) =>
          c.data.orderEmail?.toLowerCase() ===
          message.data.sender.toLowerCase(),
      );
      const clientId =
        message.data.clientId ??
        (detected.length === 1 ? detected[0].id : null);
      const centers = (await this.store.list(t, "centers")).filter(
        (c) => c.data.clientId === clientId,
      );
      const centerId =
        message.data.centerId ?? (centers.length === 1 ? centers[0].id : null);
      const order = await this.newOrder(
        t,
        {
          clientId,
          centerId,
          deliveryDate:
            message.data.requestedDate ||
            (message.data.body.match(
              /^(?:delivery|entrega|date|fecha)\s*:\s*(\d{4}-\d{2}-\d{2})\s*$/im,
            )?.[1] ??
              null),
        },
        actor,
        id,
      );
      for (const line of extracted)
        await this.store.create(
          t,
          "orderLines",
          { ...line, orderId: order.id },
          actor,
        );
      const totalCents = extracted.reduce((s, l) => s + l.amountCents, 0),
        confidence =
          extracted.reduce((s, l) => s + l.confidence, 0) / extracted.length;
      const updated = await this.store.update(
        t,
        "orders",
        order.id,
        { ...order.data, totalCents, confidence },
        order.version,
        actor,
      );
      await this.store.update(
        t,
        "inboxMessages",
        id,
        {
          ...message.data,
          state: "PROCESSED",
          error: null,
          clientId,
          centerId,
        },
        message.version,
        actor,
      );
      await this.store.create(
        t,
        "aiOrderRuns",
        {
          messageId: id,
          orderId: order.id,
          provider: "MOCK",
          model: "lexical-order-fixture-v1",
          output: { lineCount: extracted.length, confidence, simulated: true },
          costCents: 0,
          durationMs: Date.now() - started,
          createdAt: now(),
        },
        actor,
      );
      await this.refreshAlerts(t, updated, actor);
      return updated;
    });
  }
  async view(t, id) {
    const order = await this.required(t, "orders", id);
    const lines = (await this.store.list(t, "orderLines")).filter(
        (l) => l.data.orderId === id,
      ),
      alerts = (await this.store.list(t, "orderAlerts")).filter(
        (a) => a.data.orderId === id,
      );
    const message = order.data.messageId
      ? await this.message(t, order.data.messageId)
      : null;
    const run = (await this.store.list(t, "aiOrderRuns")).find(
      (r) => r.data.orderId === id,
    );
    return {
      order,
      lines,
      alerts,
      message: message?.message ?? null,
      attachments: message?.attachments ?? [],
      run: run ?? null,
    };
  }
  async saveReview(t, id, input, actor) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      const order = await this.required(t, "orders", id);
      if (!["DRAFT", "IN_REVIEW"].includes(order.data.state))
        error("Only draft or review orders can be edited", 409);
      if (order.version !== input.version)
        error("Record changed. Reload before saving.", 409);
      if (
        Object.keys(input).some(
          (k) =>
            ![
              "version",
              "clientId",
              "centerId",
              "deliveryDate",
              "lines",
            ].includes(k),
        )
      )
        error("Unknown order field");
      const { client, center } = await this.customer(
        t,
        input.clientId,
        input.centerId,
      );
      if (!Array.isArray(input.lines) || input.lines.length > 200)
        error("Maximum 200 order lines");
      const old = (await this.store.list(t, "orderLines")).filter(
          (l) => l.data.orderId === id,
        ),
        products = await this.store.list(t, "products"),
        seen = new Set();
      let totalCents = 0;
      for (const item of input.lines) {
        if (
          !item ||
          typeof item !== "object" ||
          Object.keys(item).some(
            (k) =>
              ![
                "id",
                "version",
                "productId",
                "quantity",
                "unit",
                "reviewAccepted",
                "originalText",
              ].includes(k),
          )
        )
          error("Invalid order line");
        if (
          typeof item.reviewAccepted !== "boolean" ||
          typeof item.quantity !== "number" ||
          !Number.isFinite(item.quantity) ||
          item.quantity < 0 ||
          item.quantity > 1_000_000 ||
          Math.abs(Math.round(item.quantity * 1000) - item.quantity * 1000) >
            0.000001
        )
          error(
            "Quantity must be a non-negative number with at most three decimals",
          );
        if (!["UNIT", "KG", "BOX", "L", "UNKNOWN"].includes(item.unit))
          error("Invalid sales unit");
        const previous = item.id ? old.find((l) => l.id === item.id) : null;
        if (item.id && !previous) error("Line does not belong to this order");
        if (item.id && seen.has(item.id)) error("Duplicate order line");
        if (item.id) seen.add(item.id);
        const product = item.productId
          ? products.find((p) => p.id === item.productId)
          : null;
        if (item.productId && !product)
          error("Product does not belong to this company");
        const unitPriceCents =
          product && typeof product.data.price === "number"
            ? money(product.data.price)
            : 0;
        const data = {
          orderId: id,
          productId: product?.id ?? null,
          originalText:
            previous?.data.originalText ??
            String(item.originalText || product?.data.name || "Manual line"),
          quantity: item.quantity,
          unit: item.unit,
          unitPriceCents,
          amountCents: lineAmount(item.quantity, unitPriceCents),
          confidence: previous?.data.confidence ?? 1,
          state: lineState(
            product,
            item.quantity,
            item.unit,
            item.reviewAccepted,
            previous?.data.confidence ?? 1,
          ),
          reviewAccepted: item.reviewAccepted,
          substitutionForId:
            previous?.data.productId && previous.data.productId !== product?.id
              ? previous.data.productId
              : (previous?.data.substitutionForId ?? null),
        };
        if (previous)
          await this.store.update(
            t,
            "orderLines",
            previous.id,
            data,
            item.version,
            actor,
          );
        else await this.store.create(t, "orderLines", data, actor);
        totalCents += data.amountCents;
        if (!Number.isSafeInteger(totalCents))
          error("Order amount exceeds supported limits");
      }
      for (const line of old)
        if (!seen.has(line.id))
          await this.store.remove(
            t,
            "orderLines",
            line.id,
            line.version,
            actor,
          );
      const updated = await this.store.update(
        t,
        "orders",
        id,
        {
          ...order.data,
          clientId: client?.id ?? null,
          centerId: center?.id ?? null,
          deliveryDate: input.deliveryDate || null,
          totalCents,
          state: "IN_REVIEW",
        },
        order.version,
        actor,
      );
      await this.refreshAlerts(t, updated, actor);
      return this.view(t, id);
    });
  }
  async refreshAlerts(t, order, actor) {
    const existing = (await this.store.list(t, "orderAlerts")).filter(
        (a) => a.data.orderId === order.id,
      ),
      lines = (await this.store.list(t, "orderLines")).filter(
        (l) => l.data.orderId === order.id,
      ),
      products = await this.store.list(t, "products"),
      { client, center } = await this.customer(
        t,
        order.data.clientId,
        order.data.centerId,
      );
    const desired = [];
    const add = (type, detail, productId = null) => {
      if (!desired.some((a) => a.type === type && a.productId === productId))
        desired.push({
          orderId: order.id,
          clientId: client?.id ?? null,
          productId,
          type,
          detail,
          state: "OPEN",
        });
    };
    const quantities = new Map();
    for (const line of lines) {
      const p = products.find((p) => p.id === line.data.productId);
      if (line.data.state === "NO_MATCH")
        add("NO_MATCH", line.data.originalText);
      if (!line.data.reviewAccepted && line.data.confidence < 0.85)
        add("LOW_CONFIDENCE", line.data.originalText, p?.id ?? null);
      if (line.data.state === "UNIT_MISMATCH")
        add("UNIT_MISMATCH", line.data.originalText, p?.id ?? null);
      if (p) {
        quantities.set(p.id, (quantities.get(p.id) ?? 0) + line.data.quantity);
        if (typeof p.data.price !== "number")
          add("UNKNOWN_PRICE", p.data.name, p.id);
      }
    }
    for (const [id, qty] of quantities) {
      const p = products.find((p) => p.id === id);
      if (typeof p.data.stock !== "number" || qty > p.data.stock)
        add(
          "OUT_OF_STOCK",
          `Requested ${qty}; available ${p.data.stock ?? "unknown"}`,
          id,
        );
    }
    if (client && !client.data.active) add("CLIENT_INACTIVE", client.data.name);
    for (const problem of deliveryProblems(
      center,
      order.data.deliveryDate,
    ).filter((x) => x !== "DELIVERY_DATE_REQUIRED"))
      add(problem, order.data.deliveryDate);
    const baskets = (await this.store.list(t, "usualBaskets")).filter(
      (b) => b.data.clientId === client?.id && b.data.centerId === center?.id,
    );
    for (const b of baskets) {
      const qty = quantities.get(b.data.productId);
      if (qty === undefined && b.data.orderCount >= 3)
        add("MISSING_USUAL", "Product usually ordered", b.data.productId);
      else if (
        b.data.orderCount >= 3 &&
        qty > b.data.averageQuantity + 3 * b.data.stddevQuantity
      )
        add(
          "UNUSUAL_QUANTITY",
          `Average ${b.data.averageQuantity}; requested ${qty}`,
          b.data.productId,
        );
    }
    for (const old of existing)
      if (
        !desired.some(
          (a) => a.type === old.data.type && a.productId === old.data.productId,
        )
      )
        await this.store.remove(t, "orderAlerts", old.id, old.version, actor);
    for (const data of desired) {
      const old = existing.find(
        (a) => a.data.type === data.type && a.data.productId === data.productId,
      );
      if (!old) await this.store.create(t, "orderAlerts", data, actor);
      else if (old.data.detail !== data.detail)
        await this.store.update(
          t,
          "orderAlerts",
          old.id,
          { ...data, state: old.data.state },
          old.version,
          actor,
        );
    }
  }
  async confirm(t, id, version, actor) {
    if (!actor) error("Human review is required", 403);
    return this.store.transaction(async () => {
      await this.store.lock(t);
      const order = await this.required(t, "orders", id);
      if (order.version !== version)
        error("Record changed. Reload before saving.", 409);
      if (!["DRAFT", "IN_REVIEW"].includes(order.data.state))
        error("Order cannot be confirmed in its current state", 409);
      const { client, center } = await this.customer(
        t,
        order.data.clientId,
        order.data.centerId,
      );
      if (!client || !center)
        error("Select a client and center before confirming");
      if (!client.data.active)
        error("Inactive clients cannot place confirmed orders");
      if (
        order.data.deliveryDate &&
        order.data.deliveryDate <
          new Intl.DateTimeFormat("en-CA", {
            timeZone: "Europe/Madrid",
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          }).format(new Date())
      )
        error("Delivery date cannot be in the past");
      if (!validDate(order.data.deliveryDate))
        error("A valid delivery date is required");
      if (deliveryProblems(center, order.data.deliveryDate).length)
        error("Delivery date does not match the center schedule");
      const lines = (await this.store.list(t, "orderLines")).filter(
        (l) => l.data.orderId === id,
      );
      if (!lines.length) error("At least one order line is required");
      const quantities = new Map(),
        products = await this.store.list(t, "products");
      let totalCents = 0;
      for (const l of lines) {
        const p = products.find((p) => p.id === l.data.productId);
        if (
          !l.data.reviewAccepted ||
          lineState(p, l.data.quantity, l.data.unit, true) !== "MATCHED"
        )
          error(
            "Review every line and resolve product, quantity, unit and stock issues",
          );
        if (typeof p.data.price !== "number")
          error("A product price is missing");
        if (money(p.data.price) !== l.data.unitPriceCents)
          error("Catalog prices changed. Save the review again");
        quantities.set(p.id, (quantities.get(p.id) ?? 0) + l.data.quantity);
        totalCents += lineAmount(l.data.quantity, l.data.unitPriceCents);
        if (!Number.isSafeInteger(totalCents))
          error("Order amount exceeds supported limits");
      }
      for (const [id, qty] of quantities) {
        const p = products.find((p) => p.id === id);
        if (qty > p.data.stock)
          error("Insufficient stock across duplicate product lines");
        await this.store.update(
          t,
          "products",
          id,
          { ...p.data, stock: Number((p.data.stock - qty).toFixed(3)) },
          p.version,
          actor,
        );
      }
      const updated = await this.store.update(
        t,
        "orders",
        id,
        {
          ...order.data,
          state: "CONFIRMED",
          totalCents,
          reviewedBy: actor,
          confirmedAt: now(),
        },
        order.version,
        actor,
      );
      for (const a of (await this.store.list(t, "orderAlerts")).filter(
        (a) => a.data.orderId === id && a.data.state === "OPEN",
      ))
        await this.store.update(
          t,
          "orderAlerts",
          a.id,
          { ...a.data, state: "ATTENDED" },
          a.version,
          actor,
        );
      await this.recomputeBaskets(t, actor);
      return updated;
    });
  }
  async cancel(t, id, version, actor) {
    if (!actor) error("Human review is required", 403);
    return this.store.transaction(async () => {
      await this.store.lock(t);
      const order = await this.required(t, "orders", id);
      if (!["DRAFT", "IN_REVIEW", "CONFIRMED"].includes(order.data.state))
        error("Order cannot be cancelled in its current state", 409);
      if (order.version !== version)
        error("Record changed. Reload before saving.", 409);
      if (order.data.state === "CONFIRMED") {
        const quantities = new Map();
        for (const l of (await this.store.list(t, "orderLines")).filter(
          (l) => l.data.orderId === id,
        ))
          quantities.set(
            l.data.productId,
            (quantities.get(l.data.productId) ?? 0) + l.data.quantity,
          );
        for (const [productId, qty] of quantities) {
          const p = await this.required(t, "products", productId);
          await this.store.update(
            t,
            "products",
            productId,
            { ...p.data, stock: Number((p.data.stock + qty).toFixed(3)) },
            p.version,
            actor,
          );
        }
      }
      const result = await this.store.update(
        t,
        "orders",
        id,
        { ...order.data, state: "CANCELLED" },
        order.version,
        actor,
      );
      for (const a of (await this.store.list(t, "orderAlerts")).filter(
        (a) => a.data.orderId === id && a.data.state === "OPEN",
      ))
        await this.store.update(
          t,
          "orderAlerts",
          a.id,
          { ...a.data, state: "ATTENDED" },
          a.version,
          actor,
        );
      await this.recomputeBaskets(t, actor);
      return result;
    });
  }
  async export(t, id, version, actor, format = "csv") {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      const view = await this.view(t, id);
      if (view.order.version !== version)
        error("Record changed. Reload before saving.", 409);
      if (!["CONFIRMED", "EXPORTED"].includes(view.order.data.state))
        error("Only confirmed orders can be exported", 409);
      if (!["csv", "json"].includes(format)) error("Invalid export format");
      const content =
        format === "csv"
          ? exportRows(
              view.order,
              view.lines,
              await this.store.list(t, "products"),
            )
          : JSON.stringify({ order: view.order, lines: view.lines }, null, 2);
      if (view.order.data.state === "CONFIRMED")
        await this.store.update(
          t,
          "orders",
          id,
          { ...view.order.data, state: "EXPORTED", exportedAt: now() },
          view.order.version,
          actor,
        );
      await this.store.log(t, actor, "EXPORT", "orders", id, null, { format });
      return {
        filename: view.order.data.number + "." + format,
        mime: format === "csv" ? "text/csv;charset=utf-8" : "application/json",
        content,
      };
    });
  }
  async recomputeBaskets(t, actor = null) {
    return this.store.transaction(async () => {
      await this.store.lock(t);
      const orders = (await this.store.list(t, "orders")).filter((o) =>
        ["CONFIRMED", "EXPORTED"].includes(o.data.state),
      );
      const lines = await this.store.list(t, "orderLines"),
        groups = new Map();
      for (const order of orders) {
        const perOrder = new Map();
        for (const line of lines.filter((l) => l.data.orderId === order.id))
          perOrder.set(
            line.data.productId,
            (perOrder.get(line.data.productId) ?? 0) + line.data.quantity,
          );
        for (const [productId, quantity] of perOrder) {
          const key = [
            order.data.clientId,
            order.data.centerId,
            productId,
          ].join("|");
          if (!groups.has(key))
            groups.set(key, {
              clientId: order.data.clientId,
              centerId: order.data.centerId,
              productId,
              orders: [],
            });
          groups
            .get(key)
            .orders.push({ quantity, date: order.data.confirmedAt });
        }
      }
      const existing = await this.store.list(t, "usualBaskets");
      const kept = new Set();
      for (const g of groups.values()) {
        g.orders.sort((a, b) => a.date.localeCompare(b.date));
        const average =
          g.orders.reduce((s, o) => s + o.quantity, 0) / g.orders.length;
        const variance =
          g.orders.reduce((s, o) => s + (o.quantity - average) ** 2, 0) /
          g.orders.length;
        const first = Date.parse(g.orders[0].date),
          last = Date.parse(g.orders.at(-1).date);
        const data = {
          clientId: g.clientId,
          centerId: g.centerId,
          productId: g.productId,
          averageQuantity: Number(average.toFixed(3)),
          stddevQuantity: Number(Math.sqrt(variance).toFixed(3)),
          frequencyDays:
            g.orders.length > 1
              ? Number(
                  ((last - first) / 86400000 / (g.orders.length - 1)).toFixed(
                    2,
                  ),
                )
              : 0,
          orderCount: g.orders.length,
          lastOrderedAt: g.orders.at(-1).date,
          computedAt: now(),
        };
        const old = existing.find(
          (x) =>
            x.data.clientId === g.clientId &&
            x.data.centerId === g.centerId &&
            x.data.productId === g.productId,
        );
        if (old) {
          await this.store.update(
            t,
            "usualBaskets",
            old.id,
            data,
            old.version,
            actor,
          );
          kept.add(old.id);
        } else {
          const row = await this.store.create(t, "usualBaskets", data, actor);
          kept.add(row.id);
        }
      }
      for (const old of existing)
        if (!kept.has(old.id))
          await this.store.remove(
            t,
            "usualBaskets",
            old.id,
            old.version,
            actor,
          );
      return { count: groups.size };
    });
  }
  async updateAlert(t, id, state, version, actor) {
    if (!["ATTENDED", "DISMISSED"].includes(state))
      error("Invalid alert state");
    const alert = await this.required(t, "orderAlerts", id);
    return this.store.update(
      t,
      "orderAlerts",
      id,
      { ...alert.data, state },
      version,
      actor,
    );
  }
}
