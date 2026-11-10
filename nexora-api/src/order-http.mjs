import { optionsFromEnv } from "./workflow-rules.mjs";
import { OrdersService } from "./orders.mjs";
import { canOrders } from "./order-schema.mjs";
import { prepareAttachment } from "./order-attachments.mjs";
const fail = (status, msg) => {
  throw Object.assign(new Error(msg), { status });
};
export async function handleOrders({
  store,
  path,
  method,
  body,
  url,
  tenant,
  role,
  user,
  send,
}) {
  if (
    !path.startsWith("/api/orders") &&
    !path.startsWith("/api/order-inbox") &&
    !path.startsWith("/api/order-alerts") &&
    !path.startsWith("/api/usual-baskets")
  )
    return false;
  if (!canOrders(role, method !== "GET")) fail(403, "Access denied");
  const service = new OrdersService(store, optionsFromEnv());
  if (path === "/api/orders/ai/status" && method === "GET") {
    send(200, await service.aiStatus(tenant));
    return true;
  }
  if (path === "/api/orders/catalog" && method === "GET") {
    const pick = (rows, keys) =>
      rows.map((r) => ({
        id: r.id,
        version: r.version,
        data: Object.fromEntries(keys.map((k) => [k, r.data[k]])),
      }));
    send(200, {
      products: pick(await store.list(tenant, "products"), [
        "name",
        "sku",
        "unit",
        "stock",
        "price",
        "active",
        "familyId",
      ]),
      clients: pick(await store.list(tenant, "clients"), [
        "name",
        "orderEmail",
        "active",
      ]),
      centers: pick(await store.list(tenant, "centers"), [
        "name",
        "clientId",
        "deliveryDays",
        "closedDates",
        "deliveryWindow",
      ]),
    });
    return true;
  }
  if (path === "/api/order-inbox") {
    if (method === "GET") {
      send(200, { records: await store.list(tenant, "inboxMessages") });
      return true;
    }
    if (method === "POST") {
      const parsed = await prepareAttachment(body.attachment);
      send(201, {
        record: await service.createMessage(
          tenant,
          {
            ...body,
            body: body.body?.trim() || parsed.text,
            attachment: parsed.attachment,
          },
          user.id,
        ),
      });
      return true;
    }
  }
  const message = path.match(
    /^\/api\/order-inbox\/([a-zA-Z0-9-]+)(?:\/(process|process-ai|discard))?$/,
  );
  if (message) {
    const [, id, action] = message;
    if (method === "GET" && !action) {
      send(200, await service.message(tenant, id));
      return true;
    }
    if (method === "PUT" && !action) {
      const m = await service.required(tenant, "inboxMessages", id);
      if (!["NEW", "ERROR"].includes(m.data.state))
        fail(409, "Only unprocessed messages can be edited");
      if (Object.keys(body).some((k) => !["body", "version"].includes(k)))
        fail(400, "Unknown message field");
      if (typeof body.body !== "string" || !body.body.trim())
        fail(400, "Message text is required");
      send(200, {
        record: await store.transaction(async () => {
          await store.lock(tenant);
          const fresh = await service.required(tenant, "inboxMessages", id);
          if (fresh.version !== body.version)
            fail(409, "Record changed. Reload before saving.");
          return store.update(
            tenant,
            "inboxMessages",
            id,
            {
              ...fresh.data,
              originalBody: fresh.data.originalBody ?? fresh.data.body,
              body: body.body,
              state: "NEW",
              error: null,
            },
            body.version,
            user.id,
          );
        }),
      });
      return true;
    }
    if (method === "POST" && action === "process-ai") {
      send(200, {
        record: await service.processGemini(tenant, id, body, user.id),
      });
      return true;
    }
    if (method === "POST" && action === "process") {
      try {
        send(200, {
          record: await service.processMessage(
            tenant,
            id,
            body.version,
            user.id,
          ),
        });
      } catch (e) {
        if ((e.status ?? 400) === 400)
          await store.transaction(async () => {
            await store.lock(tenant);
            const fresh = await service.required(tenant, "inboxMessages", id);
            if (
              fresh.version === body.version &&
              ["NEW", "ERROR"].includes(fresh.data.state)
            )
              await store.update(
                tenant,
                "inboxMessages",
                id,
                { ...fresh.data, state: "ERROR", error: e.message },
                fresh.version,
                user.id,
              );
          });
        throw e;
      }
      return true;
    }
    if (method === "POST" && action === "discard") {
      send(200, {
        record: await service.discardMessage(tenant, id, body.version, user.id),
      });
      return true;
    }
  }
  if (path === "/api/orders") {
    if (method === "GET") {
      let records = await store.list(tenant, "orders");
      const state = url.searchParams.get("state");
      if (state) records = records.filter((o) => o.data.state === state);
      send(200, { records });
      return true;
    }
    if (method === "POST") {
      send(201, { record: await service.createOrder(tenant, body, user.id) });
      return true;
    }
  }
  const order = path.match(
    /^\/api\/orders\/([a-zA-Z0-9-]+)(?:\/(confirm|approve|submit|start-review|request-acceptance|mock-client-decision|reopen|reject|cancel|export|erp-queue|erp-send|erp-cancel-request))?$/,
  );
  if (order) {
    const [, id, action] = order;
    if (method === "GET" && !action) {
      send(200, await service.view(tenant, id));
      return true;
    }
    if (method === "PUT" && !action) {
      send(200, await service.saveReview(tenant, id, body, user.id));
      return true;
    }
    if (
      method === "POST" &&
      [
        "confirm",
        "approve",
        "submit",
        "start-review",
        "request-acceptance",
        "mock-client-decision",
        "reopen",
        "reject",
        "erp-queue",
        "erp-send",
        "erp-cancel-request",
      ].includes(action)
    ) {
      let result;
      if (action === "confirm" || action === "approve")
        result = await service.approve(tenant, id, body.version, user.id);
      else if (action === "submit")
        result = await service.submitOriginal(
          tenant,
          id,
          body.version,
          user.id,
          body.evidence,
        );
      else if (action === "start-review")
        result = await service.beginReview(tenant, id, body.version, user.id);
      else if (action === "request-acceptance")
        result = await service.requestAcceptance(
          tenant,
          id,
          body.version,
          user.id,
        );
      else if (action === "reopen")
        result = await service.reopen(tenant, id, body.version, user.id);
      else if (action === "reject")
        result = await service.reject(
          tenant,
          id,
          body.version,
          user.id,
          body.reason,
        );
      else if (action === "erp-queue")
        result = await service.queueErp(tenant, id, body.version, user.id);
      else if (action === "erp-send")
        result = await service.dispatchErp(
          tenant,
          id,
          body.version,
          user.id,
          body.scenario ?? "SUCCESS",
        );
      else if (action === "erp-cancel-request")
        result = await service.requestErpCancellation(
          tenant,
          id,
          body.version,
          user.id,
          body.reason,
        );
      else {
        if (role !== "admin" || !service.options.allowMockClient)
          fail(403, "Mock client decisions are disabled");
        if (
          Object.keys(body).some(
            (k) => !["version", "revision", "decision", "evidence"].includes(k),
          )
        )
          fail(400, "Unknown order field");
        const order = await service.required(tenant, "orders", id);
        result = await service.customerDecision(tenant, id, body, {
          kind: "MOCK",
          tenantId: tenant,
          clientId: order.data.clientId,
          subject: "mock-client:" + order.data.clientId,
          actorId: user.id,
        });
      }
      send(200, { record: result });
      return true;
    }
    if (method === "POST" && action === "cancel") {
      send(200, {
        record: await service.cancel(tenant, id, body.version, user.id),
      });
      return true;
    }
    if (method === "POST" && action === "export") {
      send(
        200,
        await service.export(tenant, id, body.version, user.id, body.format),
      );
      return true;
    }
  }
  if (path === "/api/order-alerts" && method === "GET") {
    send(200, { records: await store.list(tenant, "orderAlerts") });
    return true;
  }
  const alert = path.match(/^\/api\/order-alerts\/([a-zA-Z0-9-]+)$/);
  if (alert && method === "PUT") {
    send(200, {
      record: await service.updateAlert(
        tenant,
        alert[1],
        body.state,
        body.version,
        user.id,
      ),
    });
    return true;
  }
  if (path === "/api/usual-baskets" && method === "GET") {
    send(200, { records: await store.list(tenant, "usualBaskets") });
    return true;
  }
  if (path === "/api/usual-baskets/recompute" && method === "POST") {
    send(200, await service.recomputeBaskets(tenant, user.id));
    return true;
  }
  fail(404, "Endpoint not found");
}
export function startOrderJobs(store) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Europe/Madrid",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      for (const { id } of (await store.query("SELECT id FROM bo.tenants"))
        .rows) {
        await store.transaction(async () => {
          await store.lock(id);
          const previous = (
            await store.query(
              "SELECT day FROM bo.order_jobs WHERE tenant_id=$1 AND job='baskets'",
              [id],
            )
          ).rows[0];
          if (previous?.day === day) return;
          await new OrdersService(store).recomputeBaskets(id);
          await store.query(
            "INSERT INTO bo.order_jobs VALUES($1,'baskets',$2) ON CONFLICT(tenant_id,job) DO UPDATE SET day=excluded.day",
            [id, day],
          );
        });
      }
    } catch (e) {
      console.error("Order basket job failed:", e.code ?? "JOB_ERROR");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(tick, 60000);
  timer.unref();
  return () => clearInterval(timer);
}
