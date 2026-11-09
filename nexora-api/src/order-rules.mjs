import { createHash } from "node:crypto";
const clean = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
const units = {
  kg: "KG",
  kilo: "KG",
  kilos: "KG",
  l: "L",
  litre: "L",
  litres: "L",
  litro: "L",
  litros: "L",
  unit: "UNIT",
  units: "UNIT",
  ud: "UNIT",
  uds: "UNIT",
  unidad: "UNIT",
  unidades: "UNIT",
  box: "BOX",
  boxes: "BOX",
  caja: "BOX",
  cajas: "BOX",
};
export function messageHash(data, attachment) {
  return createHash("sha256")
    .update(
      JSON.stringify([
        data.channel,
        clean(data.sender),
        String(data.subject ?? "").trim(),
        String(data.body ?? "").trim(),
        data.clientId ?? null,
        data.centerId ?? null,
        data.requestedDate ?? null,
        attachment
          ? createHash("sha256")
              .update(attachment.base64 ?? "")
              .digest("hex")
          : null,
      ]),
    )
    .digest("hex");
}
export function money(value) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0)
    throw new Error("Invalid price");
  const cents = Math.round(value * 100);
  if (!Number.isSafeInteger(cents))
    throw new Error("Order amount exceeds supported limits");
  return cents;
}
export function validDate(value) {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    Number.isFinite(Date.parse(value)) &&
    new Date(value).toISOString().slice(0, 10) === value
  );
}
export function parseMockOrder(text, products) {
  const rows = String(text ?? "")
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!rows.length || rows.length > 200)
    throw new Error("Provide between 1 and 200 order lines");
  return rows
    .filter((s) => !/^(delivery|entrega|date|fecha)\s*:/i.test(s))
    .map((originalText) => {
      let quantity = 0,
        unit = "UNKNOWN",
        query = originalText;
      const canonical = originalText.match(
        /^([^|;]+)[|;]\s*(\d+(?:[.,]\d+)?)\s*[|;]\s*([\w]+)\s*$/,
      );
      const free = originalText.match(
        /^(\d+(?:[.,]\d+)?)\s*(kg|kilos?|litres?|litros?|l|units?|uds?|unidades|boxes|box|cajas?)\s+(.+)$/i,
      );
      if (canonical) {
        query = canonical[1].trim();
        quantity = Number(canonical[2].replace(",", "."));
        unit = units[clean(canonical[3])] ?? canonical[3].toUpperCase();
      } else if (free) {
        quantity = Number(free[1].replace(",", "."));
        unit = units[clean(free[2])] ?? "UNKNOWN";
        query = free[3];
      }
      if (!["UNIT", "KG", "BOX", "L"].includes(unit)) unit = "UNKNOWN";
      const eligible = products.filter((p) => p.data.active);
      let product = eligible.find(
        (p) =>
          clean(p.data.sku) === clean(query) ||
          (p.data.ean && clean(p.data.ean) === clean(query)),
      );
      let confidence = product ? 1 : 0;
      if (!product) {
        product = eligible.find((p) => clean(p.data.name) === clean(query));
        if (product) confidence = 0.97;
      }
      if (!product) {
        const terms = clean(query)
          .split(/\W+/)
          .filter((w) => w.length > 2);
        const ranked = eligible
          .map((p) => ({
            p,
            score:
              terms.filter((t) => clean(p.data.name).split(/\W+/).includes(t))
                .length / Math.max(terms.length, 1),
          }))
          .sort((a, b) => b.score - a.score);
        if (ranked[0]?.score >= 0.5) {
          product = ranked[0].p;
          confidence = 0.6;
        }
      }
      const checked = lineState(product, quantity, unit, false, confidence);
      return {
        originalText,
        productId: product?.id ?? null,
        quantity,
        unit,
        unitPriceCents:
          product && typeof product.data.price === "number"
            ? money(product.data.price)
            : 0,
        amountCents:
          product && quantity > 0 && typeof product.data.price === "number"
            ? lineAmount(quantity, money(product.data.price))
            : 0,
        confidence,
        state: checked,
        reviewAccepted: false,
        substitutionForId: null,
      };
    });
}
export function lineState(product, quantity, unit, accepted, confidence = 1) {
  if (!product || !product.data.active) return "NO_MATCH";
  if (!Number.isFinite(quantity) || quantity <= 0) return "DOUBTFUL";
  if (product.data.unit !== unit) return "UNIT_MISMATCH";
  if (typeof product.data.stock !== "number" || quantity > product.data.stock)
    return "OUT_OF_STOCK";
  if (!accepted && confidence < 0.85) return "DOUBTFUL";
  return "MATCHED";
}
export function deliveryProblems(center, date) {
  const problems = [];
  if (!validDate(date)) return ["DELIVERY_DATE_REQUIRED"];
  const day = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"][
    new Date(date + "T12:00:00Z").getUTCDay()
  ];
  if (
    center?.data.deliveryDays?.length &&
    !center.data.deliveryDays.includes(day)
  )
    problems.push("DELIVERY_DAY");
  if (center?.data.closedDates?.includes(date)) problems.push("CLOSED_CENTER");
  return problems;
}
export function csvCell(value) {
  let text = String(value ?? "");
  if (/^[\s]*[=+\-@\t\r]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
export function exportRows(order, lines, products) {
  const byId = new Map(products.map((p) => [p.id, p]));
  const rows = [
    [
      "order_number",
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
    ...lines.map((l) => [
      order.data.number,
      order.data.clientId,
      order.data.centerId,
      order.data.deliveryDate,
      byId.get(l.data.productId)?.data.sku ?? "",
      byId.get(l.data.productId)?.data.name ?? "",
      l.data.quantity,
      l.data.unit,
      (l.data.unitPriceCents / 100).toFixed(2),
      (l.data.amountCents / 100).toFixed(2),
    ]),
  ];
  return "\uFEFF" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
}

export function lineAmount(quantity, price) {
  const cents = Math.round(quantity * price);
  if (!Number.isSafeInteger(cents) || cents < 0)
    throw new Error("Order amount exceeds supported limits");
  return cents;
}
