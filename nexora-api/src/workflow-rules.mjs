import { createHash } from "node:crypto";
export function commercialSnapshot(order, lines, products, client, center) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const items = lines
    .map((l) => {
      const p = byId.get(l.data.productId);
      return {
        productId: l.data.productId,
        sku: p?.data.sku ?? null,
        name: p?.data.name ?? null,
        quantity: l.data.quantity,
        unit: l.data.unit,
        unitPriceCents: l.data.unitPriceCents,
        amountCents: l.data.amountCents,
      };
    })
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  return {
    orderId: order.id,
    number: order.data.number,
    client: {
      id: order.data.clientId,
      erpCode: client?.data.erpCode ?? null,
      name: client?.data.name ?? null,
    },
    center: {
      id: order.data.centerId,
      name: center?.data.name ?? null,
      address: center?.data.address ?? null,
    },
    deliveryDate: order.data.deliveryDate,
    currency: "EUR",
    totalCents: items.reduce((n, l) => n + l.amountCents, 0),
    lines: items,
  };
}
function canonical(value) {
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((k) => [k, canonical(value[k])]),
    );
  return value;
}
export function snapshotHash(snapshot) {
  return createHash("sha256")
    .update(JSON.stringify(canonical(snapshot)))
    .digest("hex");
}
export function deliveryKey(tenantId, order) {
  return (
    "nexora-" +
    snapshotHash({
      tenantId,
      orderId: order.id,
      revision: order.data.commercialRevision,
      hash: order.data.commercialHash,
    })
  );
}
export function hasCustomerAcceptance(order) {
  if (order.data.customerDeclinedRevision === order.data.commercialRevision)
    return false;
  return (
    Number(order.data.customerAcceptedRevision) ===
      order.data.commercialRevision ||
    Number(order.data.submittedRevision) === order.data.commercialRevision
  );
}
export function optionsFromEnv() {
  return {
    allowMockClient: process.env.ENABLE_MOCK_CLIENT === "true",
    erpProvider: process.env.ERP_PROVIDER === "mock" ? "mock" : "unconfigured",
  };
}
